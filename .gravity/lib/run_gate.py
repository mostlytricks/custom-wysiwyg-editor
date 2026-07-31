#!/usr/bin/env python3
"""Run one domain's SPEC Gate — the command that proves a change.

The Gate lives as prose in `.gravity/<domain>/SPEC.md` (`**Gate:** \\`cmd\\` — …`);
agents shouldn't shell out to a hand-parsed line. This helper extracts the
runnable command via scan_spec_census (the first backtick token of the Gate
line) and executes it inside the project, propagating the exit code — so
"prove it" is one call for /preflight, /patch-slice, or a bare agent.

`--all` sweeps every fenced domain and records the outcome to
`.gravity/observatory/gates.json` — the *freshness of proof*, which nothing
else in gravity holds. SPEC tags say which rules have walls, the Behavioral
Contract says which behaviours have a named test, and `GATE_DEAD` proves the
named script exists — but all of that proves a test is *named*, never that it
*passes*. A walkthrough captures green output at ship time and then freezes.
So a domain can look fully proven while its gate has been red for a month.

The recorded state is deliberately four-valued, never two: a gate that could
not start (missing tool, absent fixture) is **blocked**, not **red**. Reporting
a missing dependency as a failure would be worse than reporting nothing —
the same under-claiming rule as LIB_STALE, where unknown is not stale.

Usage:
    python .claude/scripts/run_gate.py <project-or-alias> <domain>
    python .claude/scripts/run_gate.py [<project-or-alias>] --all

Exit codes: the gate's own code; 2 = no gate to run (missing SPEC/Gate line —
an honest refusal, not a pass). `--all` exits 1 if any gate came back red.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_arg import observatory_dir, resolve_target  # noqa: E402
from scan_project import scan_spec_census  # noqa: E402

# A gate that never started looks like a failure by exit code alone. These are
# the launcher's own complaints — the tool/module/file is absent, so nothing
# was actually proven or disproven.
BLOCKED_SIGNS = (
    # the tool itself is absent
    "command not found", "is not recognized", "no such file or directory",
    "cannot find module", "enoent", "no module named",
    "executable file not found", "cannot find the path",
    # a precondition is absent — a gate that needs a running server or a
    # fixture proves nothing when it can't reach one. Found on the very first
    # sweep: knowledge-viewer's `search:eval` exits 1 with ECONNREFUSED when
    # the dev server is down, which is emphatically not "search regressed".
    "econnrefused", "econnreset", "connection refused", "etimedout",
    "ehostunreach", "enotfound", "socket hang up", "fetch failed",
)
BLOCKED_CODES = (127, 9009)     # POSIX "not found" · cmd.exe "not recognized"
SWEEP_TIMEOUT = 300             # one hung gate must not hang the sweep


def classify(code: int, output: str) -> str:
    """green | red | blocked — red ONLY when the gate really ran and failed."""
    if code == 0:
        return "green"
    low = output.lower()
    if code in BLOCKED_CODES or any(s in low for s in BLOCKED_SIGNS):
        return "blocked"
    return "red"


def _head(path: Path) -> tuple[str | None, int | None]:
    """HEAD sha + commit time, for judging whether proof predates the code.

    Unavailable git (no repo, no binary) yields (None, None) and staleness is
    then simply not claimed — unknown is not stale.
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(path), "log", "-1", "--format=%H %ct"],
            capture_output=True, text=True, timeout=10)
        if out.returncode == 0 and out.stdout.strip():
            sha, ct = out.stdout.split()
            return sha, int(ct)
    except Exception:
        pass
    return None, None


def sweep(name: str, path: Path) -> int:
    """Run every fenced domain's gate; record results. Returns an exit code."""
    census = [c for c in scan_spec_census(path) if c["has_spec"] and c["gate_cmd"]]
    runs, worst = {}, 0
    for c in sorted(census, key=lambda x: x["domain"]):
        started = time.time()
        try:
            # shell=True as in the single-domain path below: the command is the
            # project's OWN committed SPEC Gate line — the same trust boundary
            # as running its package.json scripts — and gates legitimately
            # chain (`tsc && build`). Never feed this anything but that line.
            proc = subprocess.run(c["gate_cmd"], shell=True, cwd=path,
                                  capture_output=True, text=True,
                                  errors="replace", timeout=SWEEP_TIMEOUT)
            out = (proc.stdout or "") + (proc.stderr or "")
            state, code = classify(proc.returncode, out), proc.returncode
        except subprocess.TimeoutExpired:
            out, state, code = f"timed out after {SWEEP_TIMEOUT}s", "timeout", -1
        except OSError as exc:                       # the shell itself failed
            out, state, code = str(exc), "blocked", -1
        secs = round(time.time() - started, 1)
        runs[c["domain"]] = {
            "state": state, "exit": code, "secs": secs, "at": int(started),
            "cmd": c["gate_cmd"], "tail": out.strip()[-600:],
        }
        if state == "red":
            worst = 1
        print(f"  {c['domain']:<18} {state:<8} {secs:>6.1f}s  {c['gate_cmd']}")

    sha, head_at = _head(path)
    payload = {"generated": int(time.time()), "head": sha, "head_at": head_at,
               "runs": runs}
    out_file = observatory_dir(path) / "gates.json"
    out_file.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    tally = {s: sum(1 for r in runs.values() if r["state"] == s)
             for s in ("green", "red", "blocked", "timeout")}
    print(f"sweep[{name}]: " + " · ".join(f"{k} {v}" for k, v in tally.items()
                                          if v) or f"sweep[{name}]: no gates")
    print(f"recorded -> {out_file}")
    return worst


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(
        description="Run a domain's SPEC Gate, or sweep them all.")
    ap.add_argument("args", nargs="*", metavar="[<project>] <domain>")
    ap.add_argument("--all", action="store_true",
                    help="sweep every fenced domain and record the outcome to "
                         ".gravity/observatory/gates.json")
    opts = ap.parse_args()

    if opts.all:
        if len(opts.args) > 1:
            sys.exit("usage: run_gate.py [<project-path-or-alias>] --all")
        name, path = resolve_target(opts.args[0] if opts.args else None)
        print(f"sweeping gates in {name} …")
        sys.exit(sweep(name, path))

    if len(opts.args) == 1:                 # installed in a project: domain only
        token, domain = None, opts.args[0]
    elif len(opts.args) == 2:
        token, domain = opts.args
    else:
        sys.exit("usage: run_gate.py [<project-path-or-alias>] <domain>|--all")
    name, path = resolve_target(token)

    census = {c["domain"]: c for c in scan_spec_census(path)}
    c = census.get(domain)
    if c is None:
        known = " ".join(sorted(census)) or "(no domains)"
        print(f"no domain '{domain}' in {name}/.gravity/ — known: {known}")
        sys.exit(2)
    if not c["has_spec"]:
        print(f"{name}/{domain} has no SPEC.md — no gate to run "
              f"(/new-spec {name} {domain} to fence it)")
        sys.exit(2)
    if not c["gate_cmd"]:
        print(f"{name}/{domain} SPEC has no runnable Gate line — "
              "nothing proves a change here; add one to the SPEC")
        sys.exit(2)

    print(f"gate[{name}/{domain}]: {c['gate_cmd']}")
    # shell=True is deliberate: the gate is the project's OWN committed SPEC
    # line (the same trust as running its package.json scripts), and gates
    # legitimately chain (`tsc && build`). Never feed this anything else.
    proc = subprocess.run(c["gate_cmd"], shell=True, cwd=path)
    print(f"gate[{name}/{domain}]: {'GREEN' if proc.returncode == 0 else f'RED (exit {proc.returncode})'}")
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
