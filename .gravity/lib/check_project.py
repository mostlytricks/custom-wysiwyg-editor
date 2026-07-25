#!/usr/bin/env python3
"""
check_project.py — the project-scoped structural checks for a `.gravity/` doc system.

The portable half of gravity's checker: everything here judges ONE project from
its own docs, so it runs identically from the workspace (`/triage`, the
observatory drift card) and from a bare clone that carries `.gravity/lib/` and
has never seen the workspace. The workspace-scoped half (tier/index drift over
`PROJECTS.md`, the golden-scenario fixtures, the CLI) stays manager-side in
`.claude/scenarios/check.py`, which imports this module.

That boundary is the workspace's own rule applied to its checker: **workspace
rules (tiers, junctions, PROJECTS.md) are never embedded in a project.**

The four registry owners (workspace CLAUDE.md §6):
  1. existence  -> the `.gravity/<domain>/` folder itself
  2. routing    -> .gravity/ROUTER.md (Doc Map + router table; pre-v3: root CLAUDE.md)
  3. why        -> .gravity/MISSION.html  ("the system in N domains" row)
  4. status     -> .gravity/IMPLEMENTATION_PLAN.md  (the per-domain status spine)

Parsing is **heuristic slug-match** (by design — see scenarios/README.md): a
domain is "wired" into an index region if its kebab-case slug appears in that
region. Fixtures are author-controlled, so this is robust enough; harden with
machine-readable anchors only if real projects start tripping it.

Checks exported here:
  check_gravity_consistency(project) — domain <-> four-index wiring, protocol
                                       card freshness, couplings, the comet rule
  check_spec_honesty(project)        — SPEC Gate/enforcement tags vs repo reality
  check_intake(project)              — intake-sheet honesty (docs/intake/*.md)
  check_given(project)               — given-layer honesty (inbox routed, manifested)

Under-claiming is the shared philosophy: FAIL only on what is provably
contradicted, WARN on weak signals, stay silent where we can't verify.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# One scanner, many callers: coupling facts come from scan_project.py — a
# sibling in this same lib/, whether that lib sits in the gravity distribution
# or installed at <project>/.gravity/lib/. If the scanner is missing/broken the
# coupling check stays silent — under-claiming, never noise.
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from scan_project import scan_couplings, scan_plans
except Exception:                                   # pragma: no cover
    scan_couplings = None
    scan_plans = None


def protocol_version() -> str:
    """The gravity version this lib belongs to, read from the VERSION file that
    travels with it. Two layouts, one rule — look beside the lib, then above it:

      workspace distribution   gravity/lib/check_project.py -> gravity/VERSION
      installed in a project   .gravity/lib/check_project.py -> .gravity/lib/VERSION

    Returns "" when neither exists (then version drift simply isn't judged —
    unknown is not stale).
    """
    here = Path(__file__).resolve().parent
    for candidate in (here / "VERSION", here.parent / "VERSION"):
        try:
            text = candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if text:
            return text
    return ""


# Doc cross-references between two domains at/above this count are "strong"
# coupling — enough that a shared contract should at least name the pair.
COUPLING_THRESHOLD = 5

# The comet clock (workspace CLAUDE.md §6): deferred work must resurface by
# age, never by memory. A `○ planned` slice PLAN, or a dated one-line deferral
# row (`… (deferred YYYY-MM-DD)`) in IMPLEMENTATION_PLAN.md, older than this
# draws SLICE_STALE — the fix is pick it up, re-date it, or drop it.
STALE_SLICE_DAYS = 30

# Top-level .gravity/ entries that are cross-cutting docs, NOT subject domains.
CROSS_CUTTING = {
    "MISSION.html",
    "ARCHITECTURE.html",
    "IMPLEMENTATION_PLAN.md",
    "DESIGN.md",
    "README.md",
}

# Top-level .gravity/ DIRECTORIES that are never subject domains — they must not
# be index-wired or they FAIL as UNDERWIRED. Two kinds:
#   evidence doors  (workspace CLAUDE.md §6: the git-ignored intake drop zone and
#                    the cross-cutting given layer) — check_given owns their health
#   machinery       — the installed protocol lib (.gravity/lib/) and its generated
#                     output (.gravity/observatory/): tooling, not documented subjects
# scan_project.py holds the same set for the instruments.
NON_DOMAIN_DIRS = {"inbox", "given", "lib", "observatory"}

# The four index regions a domain must appear in, by id -> human label.
REGIONS = {
    "doc_map": "Doc Map (.gravity/ROUTER.md, or root CLAUDE.md pre-v3)",
    "router": "router table (it has a SPEC.md, so it needs a read-first row — "
              ".gravity/ROUTER.md, or root CLAUDE.md pre-v3)",
    "mission": "MISSION.html domain row",
    "plan": "IMPLEMENTATION_PLAN.md status spine",
}

FAIL = "FAIL"
WARN = "WARN"


@dataclass
class Finding:
    severity: str   # FAIL | WARN
    code: str       # UNDERWIRED | ORPHAN_ROUTE | MISSING_FILE | INDEX_ABSENT | STRUCTURE
                    # | PROTOCOL_MISSING | PROTOCOL_STALE | COUPLING_UNCONTRACTED
                    # | SLICE_STALE | LIB_MISSING | LIB_STALE
    domain: str     # the slug it concerns ("" if structural)
    region: str     # which index/region ("" if n/a)
    message: str

    def __str__(self) -> str:
        tag = f"[{self.severity}] {self.code}"
        where = f" {self.domain}" if self.domain else ""
        return f"{tag}{where}: {self.message}"


# --------------------------------------------------------------------------- #
# parsing helpers
# --------------------------------------------------------------------------- #

def _read(path: Path) -> str:
    # Tolerant by design: a checker must never crash on a stray non-UTF8 or
    # unreadable file (e.g. a binary under a test dir) — skip/replace and move on.
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _section(text: str, header_prefix: str) -> str:
    """Return the markdown section whose `## ` heading starts with header_prefix,
    up to (but excluding) the next `## ` heading. Empty string if not found."""
    return _section_by(text, lambda h: h.startswith(header_prefix.lower()))


def _section_by(text: str, predicate) -> str:
    """Return the markdown section whose `## ` heading text (lowercased) satisfies
    `predicate`, up to the next `## `. Empty string if none matches."""
    lines = text.splitlines()
    out: list[str] = []
    capturing = False
    for line in lines:
        if line.startswith("## "):
            if capturing:
                break
            if predicate(line[3:].strip().lower()):
                capturing = True
                continue
        if capturing:
            out.append(line)
    return "\n".join(out)


def _slug_in(text: str, slug: str) -> bool:
    """True if the kebab-case slug appears as a token in text."""
    return re.search(rf"(?<![\w-]){re.escape(slug)}(?![\w-])", text) is not None


def discover_domains(gravity_dir: Path) -> set[str]:
    """The subject-domain folders under .gravity/ (directories only, minus
    cross-cutting docs which are files anyway)."""
    if not gravity_dir.is_dir():
        return set()
    return {
        p.name
        for p in gravity_dir.iterdir()
        if p.is_dir() and p.name not in CROSS_CUTTING
        and p.name not in NON_DOMAIN_DIRS and not p.name.startswith(".")
    }
# --------------------------------------------------------------------------- #
# the core check
# --------------------------------------------------------------------------- #

def check_gravity_consistency(project_dir: str | Path) -> list[Finding]:
    """Return every structural inconsistency between the .gravity/ domain folders
    and the four registry indexes. Empty list == clean."""
    project = Path(project_dir)
    gravity = project / ".gravity"
    findings: list[Finding] = []

    if not gravity.is_dir():
        return [Finding(FAIL, "STRUCTURE", "", "",
                        f"no .gravity/ directory at {project}")]

    claude = _read(project / "CLAUDE.md")
    mission_path = gravity / "MISSION.html"
    plan_path = gravity / "IMPLEMENTATION_PLAN.md"
    mission = _read(mission_path)
    plan = _read(plan_path)

    # v3 thin router: Doc Map + read-first table live in .gravity/ROUTER.md and the
    # root harness files carry only the fenced pointer; pre-v3 projects still carry
    # both sections in root CLAUDE.md — read whichever exists (never both-required).
    router_doc = _read(gravity / "ROUTER.md")
    route_src = router_doc or claude
    doc_map = _section(route_src, "Doc Map") or route_src   # tolerate an unsplit file
    router = _section(route_src, "What to read before a change") or route_src
    # Status spine = the heading mentioning BOTH "status" and "domain"
    # (e.g. "Domain status spine" / "Per-domain status"); never "Status right now".
    spine = _section_by(plan, lambda h: "status" in h and "domain" in h) or plan

    domains = discover_domains(gravity)

    # A domain can only be unwired from an index that EXISTS. A two-doc brownfield
    # project (CLAUDE.md §5 brownfield inversion: .gravity/integration/ with no
    # MISSION/PLAN yet) is a sanctioned state — skip those regions, WARN once.
    if domains and not mission_path.exists():
        findings.append(Finding(
            WARN, "INDEX_ABSENT", "", "mission",
            "no .gravity/MISSION.html — domain why-rows unchecked (two-doc/brownfield project?)"))
    if domains and not plan_path.exists():
        findings.append(Finding(
            WARN, "INDEX_ABSENT", "", "plan",
            "no .gravity/IMPLEMENTATION_PLAN.md — status spine unchecked (two-doc/brownfield project?)"))

    # PROTOCOL — the embedded protocol card (.gravity/GRAVITY.md, copied from
    # gravity/GRAVITY-PROTOCOL.md) makes the repo self-describing
    # when opened without the workspace. Absent, unstamped, or older than the
    # protocol VERSION (gravity/VERSION) is drift, not breakage -> WARN, and
    # the fix is always a re-copy (the card is never hand-edited).
    card = _read(gravity / "GRAVITY.md")
    if not card:
        findings.append(Finding(
            WARN, "PROTOCOL_MISSING", "", "",
            "no .gravity/GRAVITY.md protocol card — the repo isn't self-describing "
            "off-workspace; copy gravity/GRAVITY-PROTOCOL.md and stamp it"))
    else:
        stamp = re.search(r"gravity protocol[^\n]*?v(\d+)\.(\d+)", card, re.IGNORECASE)
        ws_ver = re.match(r"(\d+)\.(\d+)", protocol_version())
        if not stamp:
            findings.append(Finding(
                WARN, "PROTOCOL_STALE", "", "",
                ".gravity/GRAVITY.md has no 'gravity protocol · vX.Y' stamp "
                "(unfilled copy?) — re-copy the template and stamp from VERSION"))
        elif ws_ver and (int(stamp[1]), int(stamp[2])) < (int(ws_ver[1]), int(ws_ver[2])):
            findings.append(Finding(
                WARN, "PROTOCOL_STALE", "", "",
                f".gravity/GRAVITY.md is stamped v{stamp[1]}.{stamp[2]} but the "
                f"gravity distribution is v{ws_ver[1]}.{ws_ver[2]} — re-copy the template"))

    # LIB — the installed instruments (.gravity/lib/, copied by install_lib.py).
    # The card makes the repo self-describing; the lib makes it self-rendering,
    # so a clone with no workspace can still scan, check and render itself.
    # Same severity logic as the card: drift, not breakage -> WARN.
    lib_ver = _read(gravity / "lib" / "VERSION").strip()
    running = protocol_version()
    if not (gravity / "lib").is_dir():
        findings.append(Finding(
            WARN, "LIB_MISSING", "", "",
            "no .gravity/lib/ — the repo can't render or check itself off-workspace; "
            "run python .claude/scripts/install_lib.py <project>"))
    elif not lib_ver:
        findings.append(Finding(
            WARN, "LIB_STALE", "", "",
            ".gravity/lib/ has no VERSION stamp (hand-copied?) — reinstall with "
            "python .claude/scripts/install_lib.py <project>"))
    else:
        # Only judged when a NEWER distribution is doing the judging. Run from
        # the installed lib itself the two are equal and this never fires — a
        # bare clone cannot know a newer version exists, and under-claiming
        # beats inventing staleness.
        m_lib = re.match(r"(\d+)\.(\d+)\.?(\d*)", lib_ver)
        m_run = re.match(r"(\d+)\.(\d+)\.?(\d*)", running)
        if m_lib and m_run:
            def _t(m):
                return (int(m[1]), int(m[2]), int(m[3] or 0))
            if _t(m_lib) < _t(m_run):
                findings.append(Finding(
                    WARN, "LIB_STALE", "", "",
                    f".gravity/lib/ is v{lib_ver} but the gravity distribution is "
                    f"v{running} — reinstall with "
                    f"python .claude/scripts/install_lib.py <project>"))

    # UNDERWIRED — a folder missing from an index it's *required* to be in.
    # Required everywhere: Doc Map (navigation), MISSION row (why), PLAN spine (status).
    # Router-table row is gravity-gated: required ONLY once the domain has a SPEC.md
    # (CLAUDE.md §6 / GRAVITY.template — the router row is added when a SPEC exists).
    for slug in sorted(domains):
        folder = gravity / slug
        checks = [("doc_map", _slug_in(doc_map, slug))]
        if mission_path.exists():
            checks.append(("mission", _slug_in(mission, slug)))
        if plan_path.exists():
            checks.append(("plan", _slug_in(spine, slug)))
        if (folder / "SPEC.md").exists():
            checks.append(("router", _slug_in(router, slug)))
        for region_id, present in checks:
            if not present:
                findings.append(Finding(
                    FAIL, "UNDERWIRED", slug, region_id,
                    f"folder .gravity/{slug}/ is not wired into the {REGIONS[region_id]}",
                ))
        # A domain folder with NO recognized doc at all is an empty husk.
        recognized = (list(folder.glob("PLAN*.md"))
                      + list(folder.glob("SPEC.md"))
                      + list(folder.glob("ARCHITECTURE.html")))
        if not recognized:
            findings.append(Finding(
                WARN, "MISSING_FILE", slug, "",
                f".gravity/{slug}/ has no PLAN/SPEC/ARCHITECTURE doc (empty domain folder)",
            ))

    # 2. ORPHAN_ROUTE — a `.gravity/<slug>/` reference with no such folder.
    #    WARN, not FAIL: templates legitimately ship example rows (e.g. integration).
    for slug in sorted(set(re.findall(r"\.gravity/([a-z0-9][a-z0-9-]*)/",
                                      claude + "\n" + router_doc))):
        if slug not in domains and slug not in CROSS_CUTTING:
            findings.append(Finding(
                WARN, "ORPHAN_ROUTE", slug, "router",
                f"the router references .gravity/{slug}/ but no such folder exists",
            ))

    # 3. COUPLING_UNCONTRACTED — two domains lean on each other's docs heavily
    #    (path-shaped cross-references, scan_couplings) but no shared contract
    #    names the pair. Weak signal -> WARN: the coupling may be doc-only; the
    #    fix is a mention in integration/SPEC.md or CONTRACT.md — or an honest
    #    "no seam here" judgment. Pairs involving `integration` itself are the
    #    contract, not a missing one.
    if scan_couplings is not None:
        contract_text = " ".join([
            _read(gravity / "integration" / "SPEC.md"),
            _read(project / "CONTRACT.md"),
            _read(project / "GLOBAL_RULES.md"),
        ])
        for link in scan_couplings(project):
            a, b, refs = link["a"], link["b"], link["refs"]
            if refs < COUPLING_THRESHOLD or "integration" in (a, b):
                continue
            if _slug_in(contract_text, a) and _slug_in(contract_text, b):
                continue
            findings.append(Finding(
                WARN, "COUPLING_UNCONTRACTED", f"{a}+{b}", "",
                f"domains '{a}' and '{b}' cross-reference each other's docs x{refs} "
                "but neither integration/SPEC.md nor CONTRACT.md names the pair — "
                "check whether a real seam is undocumented",
            ))

    # 4. SLICE_STALE — the comet rule (workspace CLAUDE.md §6): deferred work
    #    is noticed by age, never by memory. Two age sources, and an EXPLICIT
    #    `deferred YYYY-MM-DD` always wins over file mtime — that written date
    #    is the whole reason to record a deferral: it is edit-immune, so
    #    re-labelling a parked slice (or a fresh clone resetting mtimes) can't
    #    silently restart the clock. Doors: a `○ planned` slice PLAN (its own
    #    status-note date if it carries one, else mtime), and a dated deferral
    #    row in IMPLEMENTATION_PLAN.md never picked up (chores with no PLAN yet).
    #    WARN: the fix is pick it up, re-date it, or drop it — never silence.
    def _deferred_age(text: str) -> int | None:
        m = re.search(r"deferred (\d{4}-\d{2}-\d{2})", text)
        if not m:
            return None
        try:
            born = time.mktime(time.strptime(m.group(1), "%Y-%m-%d"))
        except ValueError:
            return None
        return int((time.time() - born) / 86400)

    if scan_plans is not None:
        for p in scan_plans(project):
            if p["status"] != "○":
                continue
            dated = _deferred_age(p["note"])           # edit-immune, authoritative
            if dated is not None:
                if dated > STALE_SLICE_DAYS:
                    findings.append(Finding(
                        WARN, "SLICE_STALE", p["domain"], "plan",
                        f"{p['rel']} is ○ planned, deferred {dated}d ago "
                        f"(comet threshold {STALE_SLICE_DAYS}d) "
                        "— pick it up, re-date it, or drop it"))
            elif p["age_days"] > STALE_SLICE_DAYS:      # fallback: file untouched
                findings.append(Finding(
                    WARN, "SLICE_STALE", p["domain"], "plan",
                    f"{p['rel']} is ○ planned and untouched for "
                    f"{int(p['age_days'])}d (comet threshold {STALE_SLICE_DAYS}d) "
                    "— pick it up, re-date it, or drop it"))
    # chore rows that never became a PLAN — dated deferrals in the plan spine.
    for m in re.finditer(r"deferred (\d{4}-\d{2}-\d{2})", plan):
        try:
            born = time.mktime(time.strptime(m.group(1), "%Y-%m-%d"))
        except ValueError:
            continue
        age = int((time.time() - born) / 86400)
        if age > STALE_SLICE_DAYS:
            findings.append(Finding(
                WARN, "SLICE_STALE", "", "plan",
                f"IMPLEMENTATION_PLAN.md carries a deferral row dated "
                f"{m.group(1)} ({age}d ago; comet threshold {STALE_SLICE_DAYS}d) "
                "— pick it up, re-date it, or drop it"))

    return findings


# --------------------------------------------------------------------------- #
# the spec-honesty check
# --------------------------------------------------------------------------- #

# Template leftovers that mean a SPEC.md was never fully filled in.
UNFILLED_PATTERNS = ("<FILL", "[FILL", "[test:name]", "\\<domain\\>", "<domain>")

# The recognized enforcement-tag grammar (SPEC.template.md legend). Order
# matters: "lint warn" before "lint". `[-]` is tolerated as ASCII for `[—]`.
TAG_RE = re.compile(r"\[(lint warn|lint|type|test:[^\]]+|review|—|-)\]")

_GATE_RE = re.compile(r"\*{0,2}gate:", re.IGNORECASE)

# Never descend into these when hunting for test files.
_SKIP_DIRS = {"node_modules", "dist", "build", "out", "coverage",
              ".venv", "venv", "__pycache__", ".next"}


def _strip_html_comments(text: str) -> str:
    """Drop <!-- … --> blocks: the enforcement legend legitimately spells out
    the tag grammar (`[test:name]` etc.) inside a comment, and commented-out
    template blocks are not active contract. Only what renders counts."""
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def _gate_line(spec_text: str) -> str:
    """The SPEC's `**Gate:** …` line (whole line, prose included). '' if none."""
    for line in spec_text.splitlines():
        if _GATE_RE.match(line.strip()):
            return line
    return ""


def spec_tag_census(spec_text: str) -> dict[str, int]:
    """Occurrence count per tag family — the 'walls vs judgment' snapshot.
    HTML comments (the legend) don't count as claims."""
    census: dict[str, int] = {}
    for tag in TAG_RE.findall(_strip_html_comments(spec_text)):
        key = "test" if tag.startswith("test:") else ("—" if tag == "-" else tag)
        census[key] = census.get(key, 0) + 1
    return census


def _npm_reality(project: Path) -> tuple[dict[str, str] | None, list[Path]]:
    """(merged npm scripts, workspace dirs) from the root package.json plus one
    level of workspaces. Scripts are None when there is no root package.json —
    not an npm project, so every npm-based check must stay silent."""
    root_pkg = project / "package.json"
    if not root_pkg.exists():
        return None, []

    def _load(p: Path) -> dict:
        try:
            return json.loads(_read(p) or "{}")
        except json.JSONDecodeError:
            return {}

    data = _load(root_pkg)
    scripts: dict[str, str] = dict(data.get("scripts") or {})
    patterns = data.get("workspaces") or []
    if isinstance(patterns, dict):
        patterns = patterns.get("packages") or []
    ws_dirs: list[Path] = []
    for pattern in patterns:
        for pkg in sorted(project.glob(f"{pattern}/package.json")):
            ws_dirs.append(pkg.parent)
            scripts.update(_load(pkg).get("scripts") or {})
    return scripts, ws_dirs


def _path_exists_anywhere(project: Path, ws_dirs: list[Path], token: str) -> bool:
    """A Gate-referenced path counts as alive if it exists relative to the
    project root, any workspace dir, or .gravity/ (Gate lines legitimately
    reference sibling domain docs like `doc/SPEC.md`)."""
    return any((base / token).exists()
               for base in [project, project / ".gravity", *ws_dirs])


def _test_files(project: Path) -> list[Path]:
    """Test-ish files a `[test:<name>]` may live in: *.test.* / *.spec.* files
    anywhere, plus everything under tests/ test/ __tests__/ references/."""
    hits: list[Path] = []
    test_dir_names = {"tests", "test", "__tests__", "references"}
    for root, dirs, files in os.walk(project):
        dirs[:] = [d for d in dirs
                   if d not in _SKIP_DIRS and not d.startswith(".")]
        in_test_dir = bool(test_dir_names & set(Path(root).parts))
        for fn in files:
            if in_test_dir or re.search(r"\.(test|spec)\.", fn):
                p = Path(root) / fn
                try:
                    if p.stat().st_size <= 2_000_000:
                        hits.append(p)
                except OSError:
                    pass
    return hits


def check_spec_honesty(project_dir: str | Path) -> list[Finding]:
    """Verify every .gravity/<domain>/SPEC.md against the repo's reality:
    the Gate's npm scripts + paths must exist, every [test:<name>] must point
    at a real script or test file, lint/type claims need something to back
    them, and no template leftovers survive. Empty list == honest."""
    project = Path(project_dir)
    gravity = project / ".gravity"
    if not gravity.is_dir():
        return [Finding(FAIL, "STRUCTURE", "", "",
                        f"no .gravity/ directory at {project}")]

    findings: list[Finding] = []
    seen: set[tuple[str, str, str]] = set()

    def add(severity: str, code: str, slug: str, message: str) -> None:
        key = (code, slug, message)
        if key not in seen:
            seen.add(key)
            findings.append(Finding(severity, code, slug, "", message))

    scripts, ws_dirs = _npm_reality(project)
    test_files: list[Path] | None = None  # scanned lazily, once

    for slug in sorted(discover_domains(gravity)):
        spec_path = gravity / slug / "SPEC.md"
        if not spec_path.exists():
            continue
        text = _strip_html_comments(_read(spec_path))

        # SPEC_UNFILLED — a template leftover is a lie by definition.
        for pat in UNFILLED_PATTERNS:
            if pat in text:
                add(FAIL, "SPEC_UNFILLED", slug,
                    f"SPEC.md still contains template leftover '{pat}'")

        gate = _gate_line(text)
        if not gate:
            add(WARN, "GATE_MISSING", slug,
                "SPEC.md has no 'Gate:' line — an agent has no command to prove a change")

        census = spec_tag_census(text)

        if scripts is not None:
            # GATE_DEAD — every npm script / path named on the Gate line must exist.
            for span in re.findall(r"`([^`]+)`", gate):
                for script in re.findall(r"npm(?:\s+-w\s+\S+)?\s+run\s+([\w:.-]+)", span):
                    if script not in scripts:
                        add(FAIL, "GATE_DEAD", slug,
                            f"Gate names `npm run {script}` but no such script exists in package.json")
                for token in span.split():
                    token = token.strip("(),;`—→")
                    if ("/" in token and "." in Path(token).name
                            and "://" not in token and "<" not in token
                            and "*" not in token):
                        if not _path_exists_anywhere(project, ws_dirs, token):
                            add(FAIL, "GATE_DEAD", slug,
                                f"Gate references path `{token}` which does not exist")

            # TAG_DEAD — a [test:<name>] must resolve to a script or a test file.
            for tag in TAG_RE.findall(text):
                if not tag.startswith("test:"):
                    continue
                name = tag[5:].strip()
                if name == "name" or name in scripts:
                    continue  # 'name' is the template leftover, already FAILed above
                if test_files is None:
                    test_files = _test_files(project)
                if "::" in name:
                    # pytest node id (<file>::<test_fn>) — alive when the named
                    # file exists and mentions the function; the full id string
                    # never appears verbatim in any file.
                    fpart, _, func = name.partition("::")
                    alive = any(p.name == Path(fpart).name and func in _read(p)
                                for p in test_files)
                else:
                    alive = any(name in _read(p) for p in test_files)
                if not alive:
                    add(FAIL, "TAG_DEAD", slug,
                        f"[test:{name}] — no npm script and no test-ish file mentions '{name}'")

            # TAG_UNBACKED — lint/type claims need SOME lint/type reality.
            hay = " ".join([gate, *scripts.keys(),
                            *map(str, scripts.values())]).lower()
            if (census.get("lint") or census.get("lint warn")) and "lint" not in hay:
                add(WARN, "TAG_UNBACKED", slug,
                    "[lint] tags present but no lint command in the Gate or package.json scripts")
            if census.get("type") and not any(k in hay for k in ("tsc", "typecheck", "noemit")):
                add(WARN, "TAG_UNBACKED", slug,
                    "[type] tags present but no tsc/typecheck in the Gate or package.json scripts")

        # RULES_UNTAGGED — a Rules section in the legacy fully-untagged form.
        bullets = [ln for ln in _section(text, "Rules").splitlines()
                   if ln.startswith("- ")]
        if bullets and not any(re.match(r"-\s+`?\[", b) for b in bullets):
            add(WARN, "RULES_UNTAGGED", slug,
                f"## Rules has {len(bullets)} bullet(s), none carrying an enforcement tag")

        # SPEC_FREEFORM — no `## Rules` checklist at all: a pre-v2 sheet whose
        # tags (if any) ride headings/prose. The census is tags-only on such a
        # sheet, and no line-item rule can be checked off; retrofit with
        # /new-spec to get a checkable rule list.
        if not bullets:
            if census:
                add(WARN, "SPEC_FREEFORM", slug,
                    f"SPEC.md has no '## Rules' checklist — {sum(census.values())} "
                    "enforcement tag(s) ride headings/prose (pre-v2 freeform sheet); "
                    "retrofit with /new-spec")
            else:
                add(WARN, "SPEC_FREEFORM", slug,
                    "SPEC.md has no '## Rules' checklist and no enforcement tags — "
                    "the contract has no walls at all; retrofit with /new-spec")

    return findings
# ---------------------------------------------------------------------------
# intake sheets — docs/intake/*.md (the /intake command's output)

INTAKE_FIELDS = ("Reporter", "Observed", "Expected", "Repro", "Env", "Evidence")
_INTAKE_ITEM_RE = re.compile(r"^### +(I\d+)[^\n]*", re.MULTILINE)


def _intake_value(block: str, label: str) -> str | None:
    """The text after a '- **<label> …:**' field line; None if the line is absent."""
    m = re.search(rf"^\s*-\s+\*\*{label}[^\n]*?\*\*:?\s*(.*)$", block, re.MULTILINE)
    return m.group(1).strip() if m else None


def _intake_unfilled(value: str) -> bool:
    """Template stubs start with '<'; honest unknowns start with 'OPEN:'."""
    v = value.strip().strip("`").strip()
    return (not v) or v.startswith("<")


def check_intake(project_dir: str | Path) -> list[Finding]:
    """Intake-sheet honesty (docs/intake/*.md, from INTAKE.template.md): every
    item carries the six required facts (filled, or an honest 'OPEN: awaiting
    …'), every row on a ✓-closed sheet routes somewhere, a route naming a PLAN
    file points at one that exists, and bugs never become a domain. Severity
    bar: FAIL = the sheet contradicts reality or itself; WARN = a required
    fact is absent or still a template stub."""
    project = Path(project_dir)
    findings: list[Finding] = []

    if (project / ".gravity" / "bugs").is_dir():
        findings.append(Finding(
            FAIL, "BUGS_FOLDER", "bugs", "",
            ".gravity/bugs/ exists — bugs are never a domain; intake rows "
            "route to owning-domain slice PLANs"))

    for sheet in sorted((project / "docs" / "intake").glob("*.md")):
        text = sheet.read_text(encoding="utf-8")
        rel = f"docs/intake/{sheet.name}"
        closed = bool(re.search(r"^Status:\s*✓", text, re.MULTILINE))
        parts = _INTAKE_ITEM_RE.split(text)
        for item_id, block in zip(parts[1::2], parts[2::2]):
            where = f"{rel} {item_id}"
            for label in INTAKE_FIELDS:
                value = _intake_value(block, label)
                if value is None:
                    findings.append(Finding(
                        WARN, "INTAKE_FIELD_MISSING", item_id, "",
                        f"{where}: required field '{label}' absent — elicit "
                        f"it or write 'OPEN: awaiting …', never leave a blank"))
                elif _intake_unfilled(value):
                    findings.append(Finding(
                        WARN, "INTAKE_FIELD_UNFILLED", item_id, "",
                        f"{where}: '{label}' still carries the template stub"))
            route = _intake_value(block, "→")
            if route is None or _intake_unfilled(route):
                findings.append(Finding(
                    FAIL if closed else WARN, "INTAKE_UNROUTED", item_id, "",
                    f"{where}: no routed '→' line" + (
                        " on a ✓-closed sheet — the Status is lying"
                        if closed else " yet (sheet still ○ triaging)")))
            else:
                for path in re.findall(r"[\w./\\-]*PLAN[\w.\\-]*\.md", route):
                    if not (project / path.replace("\\", "/")).exists():
                        findings.append(Finding(
                            FAIL, "INTAKE_DEAD_ROUTE", item_id, "",
                            f"{where}: routed to '{path}' which does not exist"))
    return findings
# ---------------------------------------------------------------------------
# the given layer — .gravity/inbox/ + given/ + MANIFEST.md (the /given command)


def _given_dirs(project: Path):
    gravity = project / ".gravity"
    dirs = [gravity / "given"] + sorted(gravity.glob("*/given"))
    return [d for d in dirs if d.is_dir()]


def check_given(project_dir: str | Path) -> list[Finding]:
    """Given-layer honesty: nothing rots in the drop zone, every file in a
    given/ folder has a manifest row, and no non-private row points at a ghost
    file. Severity bar: FAIL = manifest contradicts disk; WARN = unrouted or
    unregistered material (knowledge sitting outside the system)."""
    project = Path(project_dir)
    findings: list[Finding] = []

    inbox = project / ".gravity" / "inbox"
    if inbox.is_dir():
        for f in sorted(inbox.rglob("*")):
            if f.is_file() and f.name != ".gitkeep":
                findings.append(Finding(
                    WARN, "INBOX_UNROUTED", "", "",
                    f".gravity/inbox/{f.relative_to(inbox).as_posix()} is "
                    f"sitting unrouted in the drop zone — run /given"))

    for gdir in _given_dirs(project):
        rel = gdir.relative_to(project).as_posix()
        manifest = gdir / "MANIFEST.md"
        text = manifest.read_text(encoding="utf-8") if manifest.exists() else ""
        for f in sorted(gdir.rglob("*")):
            if not f.is_file() or f.name == "MANIFEST.md":
                continue
            frel = f.relative_to(gdir).as_posix()
            if frel not in text and f.name not in text:
                findings.append(Finding(
                    WARN, "GIVEN_UNMANIFESTED", "", "",
                    f"{rel}/{frel} has no manifest row — provenance unknown"))
        # ghost rows: a manifested File-column path that doesn't exist on disk.
        # Rows marked 'private' are committed POINTERS to local-only files —
        # skipped; only the first cell is the file claim (later cells may cite
        # raw/ freely). Template stubs (<...>) are the stencil, not a claim.
        for line in text.splitlines():
            cells = [c.strip() for c in line.split("|")]
            if len(cells) < 3 or "private" in line.lower() or "<" in cells[1]:
                continue
            m = re.fullmatch(r"`([^`]+\.[A-Za-z0-9]{1,5})`", cells[1])
            if m and not (gdir / m.group(1)).exists():
                findings.append(Finding(
                    FAIL, "GIVEN_GHOST_ROW", "", "",
                    f"{rel}/MANIFEST.md names '{m.group(1)}' which does not exist"))
    return findings


# --------------------------------------------------------------------------- #
# CLI — so a project carrying .gravity/lib/ can check itself off-workspace.
# The workspace door (.claude/scenarios/check.py) adds the workspace checks,
# the golden-scenario fixtures, and the selftest; this one is project-only.
# --------------------------------------------------------------------------- #

CHECKS = {
    "consistency": check_gravity_consistency,
    "spec": check_spec_honesty,
    "intake": check_intake,
    "given": check_given,
}


def main(argv=None) -> int:
    import argparse

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from project_arg import resolve_target

    ap = argparse.ArgumentParser(
        description="Check one .gravity/ project against its own docs.")
    ap.add_argument("project", nargs="?",
                    help="project path, or a name/alias when run from the "
                         "workspace (default: the project this lib belongs to)")
    ap.add_argument("--only", choices=sorted(CHECKS), action="append",
                    help="run just this check (repeatable; default: all four)")
    args = ap.parse_args(argv)

    name, path = resolve_target(args.project)
    findings: list[Finding] = []
    for key in (args.only or sorted(CHECKS)):
        findings += CHECKS[key](path)

    print(f"project: {path}")
    for f in findings:
        print(f"  {f}")
    fails = sum(1 for f in findings if f.severity == FAIL)
    warns = len(findings) - fails
    print(f"{fails} fail(s), {warns} warning(s).")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
