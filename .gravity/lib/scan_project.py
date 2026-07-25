#!/usr/bin/env python3
"""Scan one .gravity/ project and emit facts — the project-level mirror of
scan_workspace.py ("one scanner, many callers").

Why this exists: every per-project instrument (cosmos, boundary, the
observatory) used to carry its own private scanner, so the same doc got parsed
three ways and could drift three ways. This module owns ALL reading of a
project's gravity docs; renderers only draw.

Callers:
    scan_domains(path)      — cosmos facts: domains + spine + MISSION rows
    scan_integration(path)  — boundary facts from integration/SPEC.md (None if absent)
    scan_spec_census(path)  — per-domain SPEC health: rule tags, gate, contract lines
    scan_scenarios(path)    — graduation facts: PLAN Scenario intent vs SPEC BC lines
    scan_plans(path)        — slice-queue facts: every PLAN.*.md (status/goal/next/age)
    scan_tracks(path)       — direction-axis facts: the IMPLEMENTATION_PLAN.md Tracks table
    scan_walkthroughs(path) — the dated docs/walkthroughs/ log (date/title/domains)
    scan_context(path)      — CONTEXT.md now-facts
    scan(path)              — everything above in one dict (the observatory's input)

Stdlib only. Boundary: facts, never findings — judging them is the caller's job
(check.py owns findings).

Usage (debug):
    python gravity/lib/scan_project.py <project-or-alias> [--pretty]
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import date
from pathlib import Path

ARROW = re.compile(r"\s*(?:→|->|⇒)\s*")
SEP_CELL = re.compile(r":?-{3,}:?")
RULE = re.compile(r"^-\s+`\[([^\]]*)\]`\s*(.*)$")
PAREN = re.compile(r"\s*\(([^()]*)\)\s*$")
STOPWORDS = {"the", "a", "an", "and", "or", "via", "dev", "prod", "local", "part"}
LAST_TOUCHED_RE = re.compile(r"^Last touched:\s*(\d{4}-\d{2}-\d{2})", re.M)


# ---------------------------------------------------------------------------
# Markdown / text helpers (shared by the scanners and the renderers)
# ---------------------------------------------------------------------------
def strip_tags(s: str) -> str:
    import html
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip())


def strip_md(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = s.replace("`", "")
    return re.sub(r"\s+", " ", s).strip()


def section(text: str, name: str) -> str:
    m = re.search(rf"^##\s+{re.escape(name)}\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return m.group(1) if m else ""


def tables_in(md: str) -> list[list[list[str]]]:
    """All pipe tables in a block, each as rows of raw cells (header row included)."""
    tables: list[list[list[str]]] = []
    cur: list[list[str]] = []
    for line in md.splitlines():
        s = line.strip()
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if all(SEP_CELL.fullmatch(c) for c in cells):
                continue
            cur.append(cells)
        elif cur:
            tables.append(cur)
            cur = []
    if cur:
        tables.append(cur)
    return tables


def tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", s.lower())
            if len(w) > 2 and w not in STOPWORDS}


def trunc(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def rule_kind(tag: str) -> str:
    return ("wall" if tag.split(":")[0] in ("lint", "type", "test")
            else "judgment" if tag == "review" else "guidance")


# Top-level .gravity/ dirs that are never subject domains; check_project.py
# holds the same set for its index checks. Two kinds:
#   evidence doors  (workspace CLAUDE.md §6) — the drop zone and the given layer
#   machinery       — the installed protocol lib and its generated output, which
#                     are tooling living in .gravity/, not subjects to document
NON_DOMAIN_DIRS = {"inbox", "given", "lib", "observatory"}


def domain_dirs(g: Path) -> list[Path]:
    if not g.is_dir():
        return []
    return sorted(p for p in g.iterdir()
                  if p.is_dir() and p.name not in NON_DOMAIN_DIRS
                  and not p.name.startswith("."))


# ---------------------------------------------------------------------------
# Domains + spine + MISSION rows (cosmos facts)
# ---------------------------------------------------------------------------
def scan_domains(project: Path) -> dict:
    g = project / ".gravity"
    if not g.is_dir():
        sys.exit(f"no .gravity/ in {project} — this view needs a faceted project "
                 "(see workspace CLAUDE.md §6 / adopt with /adopt-gravity)")

    # 1) domains = the directory (the registry IS the folder list)
    domains: dict[str, dict] = {}
    now = time.time()
    for d in domain_dirs(g):
        entries = [p for p in d.iterdir() if p.is_file()]
        files = sorted(p.name for p in entries)
        newest = max((p.stat().st_mtime for p in entries), default=0)
        age_days = (now - newest) / 86400 if newest else 999
        domains[d.name] = {
            "name": d.name,
            "spec": "SPEC.md" in files,
            "arch": "ARCHITECTURE.html" in files,
            "plans": [f for f in files if f.startswith("PLAN")],
            "files": files,
            "age_days": age_days,
            "status": "○", "spine": "", "why": "", "nongoal": "",
        }

    # 2) status spine from IMPLEMENTATION_PLAN.md
    plan = g / "IMPLEMENTATION_PLAN.md"
    goal = ""
    if plan.exists():
        text = plan.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"^\|\s*`([\w-]+)`\s*\|\s*([✓◑○])\s*\|\s*(.+?)\s*\|\s*$",
                             text, re.M):
            name, status, spine = m.group(1), m.group(2), m.group(3)
            if name in domains:
                domains[name]["status"] = status
                domains[name]["spine"] = re.sub(r"\*\*(.+?)\*\*", r"\1", spine)
        gm = re.search(r"^goal:\s*(.+?)(?=^\S|\Z)", text, re.M | re.S)
        if gm:
            goal = re.sub(r"\s+", " ", gm.group(1)).strip()

    # 3) per-domain why from MISSION.html rows.
    #    td captures must not cross a </tr>: a two-column table earlier in the
    #    file would otherwise backtrack across rows and swallow domain rows.
    mission = g / "MISSION.html"
    title = project.name
    if mission.exists():
        mtext = mission.read_text(encoding="utf-8", errors="replace")
        tm = re.search(r"<title>(.*?)</title>", mtext, re.S)
        if tm:
            title = strip_tags(tm.group(1))
        row_td = r"((?:(?!</tr>).)*?)"
        for m in re.finditer(
                r"<tr><td><code>([\w-]+)</code></td><td>" + row_td
                + r"</td><td>" + row_td + r"</td></tr>", mtext, re.S):
            name = m.group(1)
            if name in domains:
                domains[name]["why"] = strip_tags(m.group(2))
                domains[name]["nongoal"] = strip_tags(m.group(3))

    return {"project": project.name, "title": title, "goal": goal,
            "domains": list(domains.values()),
            "has_mission": mission.exists(),
            "has_arch": (g / "ARCHITECTURE.html").exists()}


# ---------------------------------------------------------------------------
# Integration seams (boundary facts) — None when the SPEC doesn't exist.
# ---------------------------------------------------------------------------
def scan_integration(project: Path) -> dict | None:
    spec = project / ".gravity" / "integration" / "SPEC.md"
    if not spec.exists():
        return None
    text = spec.read_text(encoding="utf-8", errors="replace")

    # lede: first real paragraph after the H1 (prefer a substantial one)
    paras, cur = [], []
    for line in text.splitlines():
        if line.startswith("#") or line.startswith("<!--"):
            continue
        if line.strip():
            cur.append(line.strip())
        elif cur:
            paras.append(" ".join(cur))
            cur = []
    if cur:
        paras.append(" ".join(cur))
    paras = [p for p in paras if not p.startswith("|")]
    lede = next((p for p in paras[:3] if len(p) >= 120), paras[0] if paras else "")

    gm = re.search(r"^\*\*Gate:\*\*\s*(.+)$", text, re.M)
    gate = strip_md(gm.group(1)) if gm else ""

    # Boundary Map: table 1 = seams, table 2 (if any) = ports
    bm = section(text, "Boundary Map")
    tables = tables_in(bm)
    nodes: dict[str, dict] = {}
    seams: list[dict] = []
    unparsed: list[str] = []

    def node_id(raw: str) -> int | None:
        name = strip_md(PAREN.sub("", raw))
        if not name:
            return None
        if name not in nodes:
            nodes[name] = {"name": name, "i": len(nodes), "port": None,
                           "ins": 0, "outs": 0}
        return nodes[name]["i"]

    if tables:
        for row_n, cells in enumerate(tables[0][1:], start=1):
            if len(cells) < 2:
                unparsed.append(" | ".join(cells))
                continue
            endpoints = ARROW.split(cells[0])
            if len(endpoints) < 2:
                unparsed.append(" | ".join(cells))
                continue
            crosses = strip_md(cells[1])
            transport = strip_md(cells[2]) if len(cells) > 2 else ""
            is_open = any("OPEN:" in c for c in cells)
            qual = ""
            qm = PAREN.search(endpoints[-1].strip())
            if qm:
                qual = strip_md(qm.group(1))
            evidence, seen = [], set()
            for tok in re.findall(r"`([^`]+)`", " ".join(cells)):
                if tok not in seen and ("/" in tok or "." in tok or tok.isupper()):
                    seen.add(tok)
                    evidence.append(tok)
            card = {"row": row_n, "crosses": crosses, "transport": transport,
                    "qual": qual, "open": is_open, "evidence": evidence[:8],
                    "label": ""}
            for a, b in zip(endpoints, endpoints[1:]):
                s, t = node_id(a), node_id(b)
                if s is None or t is None or s == t:
                    unparsed.append(" | ".join(cells))
                    continue
                seams.append(dict(card, s=s, t=t))
    node_list = list(nodes.values())
    for e in seams:
        node_list[e["s"]]["outs"] += 1
        node_list[e["t"]]["ins"] += 1
        e["label"] = (f'{node_list[e["s"]]["name"]} → {node_list[e["t"]]["name"]}'
                      + (f' ({e["qual"]})' if e["qual"] else ""))

    ports_ctx: list[dict] = []
    if len(tables) > 1:
        for cells in tables[1][1:]:
            if len(cells) < 2:
                continue
            row = {"service": strip_md(cells[0]), "url": strip_md(cells[1]),
                   "notes": strip_md(cells[2]) if len(cells) > 2 else ""}
            svc_tok = tokens(row["service"])
            best, overlap = None, 0
            for n in node_list:
                k = len(svc_tok & tokens(n["name"]))
                if k > overlap:
                    best, overlap = n, k
            if best is not None and best["port"] is None:
                best["port"] = row
            else:
                ports_ctx.append(row)

    order = [strip_md(m.group(1)) for m in
             re.finditer(r"^\d+\.\s+(.*)$", section(text, "Change Order"), re.M)]

    rules = []
    for line in section(text, "Rules").splitlines():
        m = RULE.match(line.strip())
        if m:
            rules.append({"tag": m.group(1), "kind": rule_kind(m.group(1)),
                          "text": strip_md(m.group(2))})

    gotchas = []
    for line in section(text, "Gotchas").splitlines():
        s = line.strip()
        if s.startswith("- "):
            bm2 = re.match(r"-\s+\*\*(.+?)\*\*", s)
            gotchas.append(strip_md(bm2.group(1)) if bm2 else trunc(strip_md(s[2:]), 70))

    return {"project": project.name, "lede": lede, "gate": gate,
            "nodes": node_list, "seams": seams, "ports_ctx": ports_ctx,
            "order": order, "rules": rules, "gotchas": gotchas,
            "unparsed": unparsed,
            "spec_rel": str(spec.relative_to(project)).replace("\\", "/")}


# ---------------------------------------------------------------------------
# SPEC census — the health facts of every domain's agent contract.
#
# Two SPEC generations exist in the wild: the v2 template (a `## Rules` section
# of `[tag]`-prefixed bullets) and freeform sheets (tags on headings and prose).
# The census parses the structured form when present; otherwise it falls back
# to counting enforcement tags across the body and says so (`form: freeform`)
# — a census must not invent discrete rules that aren't written as rules.
# ---------------------------------------------------------------------------
TAG = re.compile(r"`\[((?:test|type|lint|review)[^\]`]*|—)\]`")


def scan_spec_census(project: Path) -> list[dict]:
    g = project / ".gravity"
    out = []
    for d in domain_dirs(g):
        spec = d / "SPEC.md"
        entry = {"domain": d.name, "has_spec": spec.exists(), "gate": "",
                 "gate_cmd": "", "form": "structured",
                 "rules": {"wall": 0, "judgment": 0, "guidance": 0, "total": 0},
                 "rule_list": [], "bc_bound": 0, "bc_unbound": 0, "fills": 0}
        if spec.exists():
            text = spec.read_text(encoding="utf-8", errors="replace")
            body = re.sub(r"<!--.*?-->", "", text, flags=re.S)   # comments aren't contract
            gm = re.search(r"^\*\*Gate:\*\*\s*(.+)$", body, re.M)
            if gm:
                entry["gate"] = strip_md(gm.group(1))
                # the RUNNABLE part is the first backtick token — the raw line
                # usually carries prose after it that would break a shell
                cm = re.search(r"`([^`]+)`", gm.group(1))
                entry["gate_cmd"] = cm.group(1) if cm else ""
            entry["fills"] = len(re.findall(r"<?FILL[:\]]", body))

            chunks = re.split(r"^##\s+", body, flags=re.M)[1:]

            def chunk_text(prefix: str) -> str:
                return "\n".join(
                    c for c in chunks
                    if c.split("\n", 1)[0].strip().lower().startswith(prefix))

            bc = chunk_text("behavioral contract")
            entry["bc_bound"] = len(re.findall(r"`\[test", bc))
            bullets = len(re.findall(r"^-\s+", bc, re.M))
            entry["bc_unbound"] = max(0, bullets - entry["bc_bound"])

            for line in chunk_text("rules").splitlines():
                m = RULE.match(line.strip())
                if m:
                    kind = rule_kind(m.group(1))
                    entry["rules"][kind] += 1
                    entry["rules"]["total"] += 1
                    entry["rule_list"].append({"tag": m.group(1), "kind": kind,
                                               "text": strip_md(m.group(2))})
            if entry["rules"]["total"] == 0:
                # freeform sheet: census the tags themselves, outside the BC
                entry["form"] = "freeform"
                preamble = re.split(r"^##\s+", body, flags=re.M)[0]
                non_bc = preamble + "\n".join(
                    c for c in chunks
                    if not c.split("\n", 1)[0].strip().lower()
                    .startswith("behavioral contract"))
                for m in TAG.finditer(non_bc):
                    if m.group(1).startswith("test"):
                        continue                       # test tags belong to the BC
                    kind = rule_kind(m.group(1))
                    entry["rules"][kind] += 1
                    entry["rules"]["total"] += 1
        out.append(entry)
    return out


# ---------------------------------------------------------------------------
# Couplings — doc cross-references between domains (path-shaped mentions only,
# e.g. "security/SPEC.md" or ".gravity/doc/ARCHITECTURE.html"; bare domain
# words would false-positive on prose). Undirected, with per-direction counts.
# ---------------------------------------------------------------------------
def scan_couplings(project: Path) -> list[dict]:
    g = project / ".gravity"
    if not g.is_dir():
        return []
    domains = [p.name for p in domain_dirs(g)]
    texts: dict[str, str] = {}
    for d in domains:
        buf = []
        for f in (g / d).iterdir():
            if f.is_file() and f.suffix in (".md", ".html"):
                try:
                    buf.append(f.read_text(encoding="utf-8", errors="replace"))
                except OSError:
                    pass
        texts[d] = "\n".join(buf)
    links: dict[tuple[str, str], dict] = {}
    for d in domains:
        for other in domains:
            if other == d:
                continue
            ref = re.compile(rf"(?:\.gravity/)?{re.escape(other)}"
                             r"/(?:SPEC|PLAN|ARCHITECTURE|given)")
            n = len(ref.findall(texts[d]))
            if n:
                key = tuple(sorted((d, other)))
                entry = links.setdefault(key, {"refs": 0, "dirs": {}})
                entry["refs"] += n
                entry["dirs"][d] = n
    return [{"a": a, "b": b, "refs": v["refs"], "dirs": v["dirs"]}
            for (a, b), v in sorted(links.items())]


# ---------------------------------------------------------------------------
# Slice queue — every PLAN.*.md across the domains, as work-table facts:
# status glyph (+ its trailing note), a Goal snippet, the Next line, age.
# The queue view answers "what is in flight project-wide" without opening
# ten files; the PLANs themselves stay the one home of the intent.
# ---------------------------------------------------------------------------
STATUS_FULL = re.compile(r"^Status:\s*([✓◑○])\s*([^<\n]*)", re.M)


def _snippet(block: str, n: int) -> str:
    lines = [ln.strip().lstrip("- ").strip() for ln in block.splitlines()
             if ln.strip() and not ln.strip().startswith(("<!--", "|"))]
    return trunc(strip_md(" ".join(lines)), n) if lines else ""


def scan_plans(project: Path) -> list[dict]:
    g = project / ".gravity"
    now = time.time()
    out = []
    for d in domain_dirs(g):
        for f in sorted(d.glob("PLAN*.md")):
            body = re.sub(r"<!--.*?-->", "",
                          f.read_text(encoding="utf-8", errors="replace"), flags=re.S)
            sm = STATUS_FULL.search(body)
            out.append({
                "domain": d.name, "file": f.name,
                "rel": f".gravity/{d.name}/{f.name}",
                "status": sm.group(1) if sm else "",
                "note": strip_md(sm.group(2)).strip() if sm else "",
                "goal": _snippet(section(body, "Goal"), 160),
                "next": _snippet(section(body, "Next"), 120),
                "age_days": (now - f.stat().st_mtime) / 86400,
            })
    return out


# ---------------------------------------------------------------------------
# Tracks — the direction axis (workspace CLAUDE.md §6): the optional
# `## Tracks` table in IMPLEMENTATION_PLAN.md. A track is a named cross-domain
# intent — it holds no slices itself; it points up to a MISSION principle and
# down to the domain PLAN slices carrying it. Facts per row: name, direction,
# the MISSION § anchor, the carrying PLANs (with their domains + existence),
# status glyph. Facts only — judging a dangling pointer is the caller's job.
# ---------------------------------------------------------------------------
TRACK_HEAD = re.compile(r"^##\s+Tracks\b.*?$(.*?)(?=^##\s|\Z)", re.M | re.S)
TRACK_PLAN = re.compile(r"(?:\.gravity/)?([\w-]+)/(PLAN[\w.-]*\.md)")
MISSION_REF = re.compile(r"§\s*\d+")


def scan_tracks(project: Path) -> list[dict]:
    plan = project / ".gravity" / "IMPLEMENTATION_PLAN.md"
    if not plan.exists():
        return []
    text = re.sub(r"<!--.*?-->", "",
                  plan.read_text(encoding="utf-8", errors="replace"), flags=re.S)
    m = TRACK_HEAD.search(text)
    if not m:
        return []
    tabs = tables_in(m.group(1))
    if not tabs:
        return []
    known = {p.name for p in domain_dirs(project / ".gravity")}
    out = []
    for cells in tabs[0][1:]:
        if len(cells) < 4:
            continue
        name = strip_md(cells[0])
        if not name or name.startswith("<"):        # template placeholder row
            continue
        plans, domains = [], []
        for dom, fname in TRACK_PLAN.findall(cells[2]):
            rel = f".gravity/{dom}/{fname}"
            if any(p["rel"] == rel for p in plans):
                continue
            plans.append({"domain": dom, "file": fname, "rel": rel,
                          "exists": (project / rel).exists()})
            if dom not in domains:
                domains.append(dom)
        mref = MISSION_REF.search(cells[1])
        sm = re.search(r"[✓◑○]", cells[3])
        out.append({
            "name": name,
            "direction": strip_md(cells[1]),
            "mission": mref.group(0).replace(" ", "") if mref else "",
            "plans": plans,
            "domains": domains,
            "unknown_domains": [d for d in domains if d not in known],
            "status": sm.group(0) if sm else "",
        })
    return out


# ---------------------------------------------------------------------------
# Walkthroughs — the frozen per-slice trust artifacts under docs/walkthroughs/
# (dated, append-only; workspace CLAUDE.md §6). Facts per file: date (from the
# filename — the one mandatory part), title, and Domain(s) from the header
# line in either wild style (plain `Domain(s): dram` or blockquote
# `> Domain(s): \`agent-console\`.`), slug-fallback when absent.
# ---------------------------------------------------------------------------
WT_NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.md$")
WT_DOMS = re.compile(r"Domain\(s\):\s*(.+)$", re.M)


def scan_walkthroughs(project: Path) -> list[dict]:
    wdir = project / "docs" / "walkthroughs"
    if not wdir.is_dir():
        return []
    known = {p.name for p in domain_dirs(project / ".gravity")}
    out = []
    for f in sorted(wdir.glob("*.md")):
        m = WT_NAME.match(f.name)
        if not m:
            continue
        head = "\n".join(f.read_text(encoding="utf-8",
                                     errors="replace").splitlines()[:20])
        tm = re.search(r"^#\s+(.+)$", head, re.M)
        title = strip_md(re.sub(r"^Walkthrough\s*[—-]\s*", "",
                                tm.group(1))) if tm else m.group(2)
        dm = WT_DOMS.search(head)
        doms = (re.findall(r"[a-z0-9][\w-]*", dm.group(1).lower())
                if dm else [])
        if not doms:
            doms = [t for t in m.group(2).split("-") if t in known]
        out.append({"file": f.name, "date": m.group(1), "slug": m.group(2),
                    "title": trunc(title, 120), "domains": doms})
    return sorted(out, key=lambda w: w["date"], reverse=True)


# ---------------------------------------------------------------------------
# Scenario graduation — intent vs contract, per domain.
#
# A behavior enters gravity as a given/when/then bullet in a PLAN's Scenario
# block (intent) and graduates into the SPEC's Behavioral Contract only once a
# named test asserts it. This scanner reads both sides and pairs them by token
# overlap so a renderer can show the pipeline: which scenarios earned a wall,
# which are still intent, and which BC lines are dressed as contract with no
# test. The pairing is a text heuristic — it is reported as `match` facts
# (score included), never as a verdict; a scenario may earn its wall elsewhere
# (a gate line), and only reading the docs settles that.
# ---------------------------------------------------------------------------
STATUS_RE = re.compile(r"^Status:\s*([✓◑○])", re.M)
TEST_TAG = re.compile(r"`?\[test:([^\]`]+)\]`?")
GWT_WORDS = {"given", "when", "then"}


def _match_tokens(s: str) -> set[str]:
    # camelCase split before tokenizing, so `executionPath` and
    # `execution_path` (the same fact on two sides of a seam) can meet
    return tokens(re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)) - GWT_WORDS


def _chunks_starting(body: str, prefix: str) -> list[str]:
    """Contents of every ## section whose heading starts with prefix
    (case-insensitive; headings may carry suffixes like '(bug intake)')."""
    out = []
    for c in re.split(r"^##\s+", body, flags=re.M)[1:]:
        head, _, rest = c.partition("\n")
        if head.strip().lower().startswith(prefix):
            out.append(rest)
    return out


def _bullets(block: str) -> list[str]:
    """Top-level `- ` bullets, continuation lines joined; FILL stubs dropped."""
    items: list[str] = []
    cur: list[str] = []
    for line in block.splitlines():
        s = line.strip()
        if s.startswith("- "):
            if cur:
                items.append(" ".join(cur))
            cur = [s[2:].strip()]
        elif cur and s:
            cur.append(s)
        elif cur:
            items.append(" ".join(cur))
            cur = []
    if cur:
        items.append(" ".join(cur))
    return [b for b in items if "<FILL" not in b]


def scan_scenarios(project: Path) -> list[dict]:
    g = project / ".gravity"
    out = []
    for d in domain_dirs(g):
        plans = []
        for f in sorted(d.glob("PLAN*.md")):
            body = re.sub(r"<!--.*?-->", "",
                          f.read_text(encoding="utf-8", errors="replace"), flags=re.S)
            sm = STATUS_RE.search(body)
            scens = [{"text": strip_md(b), "test": "", "match": None}
                     for blk in _chunks_starting(body, "scenario")
                     for b in _bullets(blk)]
            if scens:
                plans.append({"file": f.name,
                              "status": sm.group(1) if sm else "",
                              "scenarios": scens})
        bc_lines = []
        spec = d / "SPEC.md"
        if spec.exists():
            body = re.sub(r"<!--.*?-->", "",
                          spec.read_text(encoding="utf-8", errors="replace"), flags=re.S)
            for blk in _chunks_starting(body, "behavioral contract"):
                for b in _bullets(blk):
                    tm = TEST_TAG.search(b)
                    bc_lines.append({"text": strip_md(TEST_TAG.sub(" ", b)),
                                     "test": tm.group(1).strip() if tm else "",
                                     "matched": False})

        # pair scenarios ↔ BC lines: greedy best-first on token overlap
        all_scens = [s for p in plans for s in p["scenarios"]]
        pairs = []
        for si, s in enumerate(all_scens):
            st = _match_tokens(s["text"])
            for bi, b in enumerate(bc_lines):
                bt = _match_tokens(b["text"])
                if not st or not bt:
                    continue
                inter = len(st & bt)
                score = inter / min(len(st), len(bt))
                if inter >= 4 and score >= 0.45:
                    pairs.append((score, si, bi))
        used_s: set[int] = set()
        used_b: set[int] = set()
        for score, si, bi in sorted(pairs, reverse=True):
            if si in used_s or bi in used_b:
                continue
            used_s.add(si)
            used_b.add(bi)
            all_scens[si]["match"] = round(score, 2)
            all_scens[si]["test"] = bc_lines[bi]["test"]
            bc_lines[bi]["matched"] = True

        if plans or bc_lines:
            out.append({"domain": d.name, "plans": plans, "bc": bc_lines})
    return out


# ---------------------------------------------------------------------------
# CONTEXT.md — the now-facts.
# ---------------------------------------------------------------------------
def scan_context(project: Path, today: date | None = None) -> dict:
    ctx = project / "CONTEXT.md"
    if not ctx.exists():
        return {"exists": False}
    text = ctx.read_text(encoding="utf-8", errors="replace")
    today = today or date.today()
    m = LAST_TOUCHED_RE.search(text)
    last, days = m.group(1) if m else "", None
    if last:
        try:
            days = (today - date.fromisoformat(last)).days
        except ValueError:
            pass
    nm = re.search(r"^##\s+Next Step\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    next_step = ""
    if nm:
        lines = [ln.strip().lstrip("- ").strip() for ln in nm.group(1).splitlines()
                 if ln.strip() and not ln.strip().startswith("<!--")]
        next_step = strip_md(lines[0]) if lines else ""
    return {"exists": True, "last_touched": last, "days_ago": days,
            "next_step": trunc(next_step, 240), "lines": len(text.splitlines())}


# ---------------------------------------------------------------------------
# Everything — the observatory's input.
# ---------------------------------------------------------------------------
def scan(project: Path) -> dict:
    facts = scan_domains(project)                       # exits if no .gravity
    facts["integration"] = scan_integration(project)
    facts["specs"] = scan_spec_census(project)
    facts["links"] = scan_couplings(project)
    facts["scenarios"] = scan_scenarios(project)
    facts["queue"] = scan_plans(project)
    facts["tracks"] = scan_tracks(project)
    facts["walkthroughs"] = scan_walkthroughs(project)
    facts["context"] = scan_context(project)
    facts["generated"] = date.today().isoformat()
    return facts


# ---------------------------------------------------------------------------
# Preflight — the agent's pre-change packet for one domain, assembled
# mechanically from the same facts the observatory renders. Pointer-first:
# it hands paths + census + warnings, never restates rule prose (the SPEC
# stays the one home; the agent must still read it).
# ---------------------------------------------------------------------------
def preflight(project: Path, domain: str) -> str:
    facts = scan(project)
    doms = {d["name"]: d for d in facts["domains"]}
    if domain not in doms:
        sys.exit(f"no domain '{domain}' in {facts['project']}/.gravity/ — "
                 f"known: {' '.join(sorted(doms))}")
    d = doms[domain]
    census = {c["domain"]: c for c in facts["specs"]}
    c = census[domain]
    ctx = facts["context"]
    integ = facts["integration"]

    out: list[str] = []
    A = out.append
    A(f"# preflight — {facts['project']} / {domain}")
    A(f"status {d['status']} · why: {d['why'] or '(no MISSION row — /triage would flag)'}")
    if ctx.get("exists"):
        stale = (f" ⚠ STALE ({ctx['days_ago']}d)"
                 if ctx.get("days_ago") is not None and ctx["days_ago"] >= 14 else "")
        A(f"context: last touched {ctx['last_touched']}{stale} · "
          f"next step: {ctx['next_step'] or '(none recorded)'}")
    else:
        A("context: ⚠ no CONTEXT.md — the session ritual is broken here")
    A("")

    A("## Read in this order (paths from the project root)")
    n = 1
    if domain != "integration" and integ is not None:
        A(f"{n}. `.gravity/integration/SPEC.md` — FIRST, but ONLY if the change "
          "crosses a boundary (API/event shape, shared types, ports, auth, queues)")
        n += 1
    if c["has_spec"]:
        r = c["rules"]
        form = " · **freeform sheet** (tag census only)" if c["form"] == "freeform" else ""
        A(f"{n}. `.gravity/{domain}/SPEC.md` — the contract: {r['total']} rules "
          f"({r['wall']} walls · {r['judgment']} judgment · {r['guidance']} guidance){form}")
    else:
        A(f"{n}. ⚠ **UNFENCED** — no SPEC.md here. You'd be changing this domain "
          f"without walls: propose `/new-spec {facts['project']} {domain}`, "
          "or proceed and say so honestly in CONTEXT.md.")
    n += 1
    mine = sorted(((l["b"] if l["a"] == domain else l["a"], l["refs"])
                   for l in facts["links"] if domain in (l["a"], l["b"])),
                  key=lambda x: -x[1])
    if mine:
        A(f"{n}. coupled domains (doc cross-references — load before any "
          "cross-domain edit):")
        for other, refs in mine[:5]:
            oc = census.get(other, {})
            sp = (f"`.gravity/{other}/SPEC.md`" if oc.get("has_spec")
                  else f"`.gravity/{other}/` (no SPEC)")
            A(f"   - {sp}  (↔ ×{refs})")
        n += 1
    if d["plans"]:
        A(f"{n}. open intent in this domain: "
          + " · ".join(f"`.gravity/{domain}/{p}`" for p in d["plans"]))
    A("")

    A("## Walls")
    if not c["has_spec"]:
        A("none — unfenced domain (see above)")
    if c["gate_cmd"]:
        A(f"gate: `{c['gate_cmd']}`")
        A(f"prove the change: `python .claude/scripts/run_gate.py "
          f"{facts['project']} {domain}`")
    elif c["has_spec"]:
        A("gate: ⚠ none — nothing mechanical proves a change here")
    if c["bc_bound"] or c["bc_unbound"]:
        A(f"behavioral contract: {c['bc_bound']} test-bound"
          + (f" · ⚠ {c['bc_unbound']} unbound (intent, not contract)"
             if c["bc_unbound"] else ""))
    if c["fills"]:
        A(f"⚠ {c['fills']} template FILL leftover(s) in the SPEC")
    A("")

    # [review] rules are walls only if the review actually happens — give the
    # judgment rules their execution moment: itemized here, attested at finish.
    reviews = [r for r in c["rule_list"] if r["kind"] == "judgment"]
    if reviews:
        A("## Review attestation — the walls only YOU enforce")
        A("No tooling checks these; they are walls only if this review happens.")
        for i, r in enumerate(reviews, 1):
            A(f"R{i}. {trunc(r['text'], 220)}")
        A("")
    elif c["has_spec"] and c["form"] == "freeform" and c["rules"]["judgment"]:
        A("## Review attestation — the walls only YOU enforce")
        A(f"⚠ freeform sheet: {c['rules']['judgment']} [review] tag(s) ride "
          "headings/prose and can't be itemized — read the whole SPEC and "
          "attest to it as one.")
        A("")

    A("## Before you finish")
    A("- run the gate green (above)" if c["gate_cmd"]
      else "- no gate exists: state your verification honestly")
    if reviews:
        A("- attest the [review] rules: name the R-numbers you checked "
          "(e.g. \"reviewed against R1, R3\") in the slice PLAN / WALKTHROUGH / "
          "CONTEXT note — an unnamed review didn't happen")
    elif c["has_spec"] and c["rules"]["judgment"]:
        A("- attest the [review] rules: state that you read the SPEC's "
          "review-tagged sections in your finish note")
    A("- touched a boundary? follow `.gravity/integration/SPEC.md` **Change Order**"
      if integ is not None
      else "- touched a boundary? record it per workspace CLAUDE.md §5 "
           "(CONTRACT.md / root CLAUDE.md)")
    A("- update CONTEXT.md (Completed · Current State · Next Step) — "
      "a session that skips this is incomplete")
    return "\n".join(out)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    import argparse
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from project_arg import resolve_target
    ap = argparse.ArgumentParser(description="Scan one .gravity/ project → facts JSON, "
                                             "or a per-domain preflight packet.")
    ap.add_argument("project", nargs="?", help="project path, or a name/alias when run from the workspace (default: the project this lib belongs to)")
    ap.add_argument("--pretty", action="store_true", help="indent the JSON")
    ap.add_argument("--preflight", metavar="DOMAIN",
                    help="print the pre-change packet for one domain instead of JSON")
    args = ap.parse_args()
    _, path = resolve_target(args.project)
    if args.preflight:
        print(preflight(path, args.preflight))
    else:
        print(json.dumps(scan(path), indent=2 if args.pretty else None,
                         ensure_ascii=False))


if __name__ == "__main__":
    main()
