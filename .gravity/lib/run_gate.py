#!/usr/bin/env python3
"""Run one domain's SPEC Gate — the command that proves a change.

The Gate lives as prose in `.gravity/<domain>/SPEC.md` (`**Gate:** \\`cmd\\` — …`);
agents shouldn't shell out to a hand-parsed line. This helper extracts the
runnable command via scan_spec_census (the first backtick token of the Gate
line) and executes it inside the project, propagating the exit code — so
"prove it" is one call for /preflight, /patch-slice, or a bare agent.

Usage:
    python .claude/scripts/run_gate.py <project-or-alias> <domain>

Exit codes: the gate's own code; 2 = no gate to run (missing SPEC/Gate line —
an honest refusal, not a pass).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_arg import resolve_target  # noqa: E402
from scan_project import scan_spec_census  # noqa: E402


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if len(sys.argv) == 2:                  # installed in a project: domain only
        token, domain = None, sys.argv[1]
    elif len(sys.argv) == 3:
        token, domain = sys.argv[1], sys.argv[2]
    else:
        sys.exit("usage: run_gate.py [<project-path-or-alias>] <domain>")
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
