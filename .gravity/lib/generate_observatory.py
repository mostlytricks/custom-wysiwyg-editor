#!/usr/bin/env python3
"""
generate_observatory.py — one project, one page: the unified per-project view.

The answer to instrument sprawl: cosmos (domains), boundary (seams), and the
Spec Health instrument used to be separate HTMLs; the observatory composes
them as tabs over ONE scan (scripts/scan_project.py — one scanner, many
callers). This is the ONE user-facing door (/observatory); the cosmos and
boundary generators are its renderer modules (their CLIs remain for debugging)
and render the same facts, so the views can't disagree.

Tabs:
    Overview    — goal, the now (CONTEXT), the drift card (check.py findings,
                  imported never reimplemented; "unavailable" is not "clean"),
                  the spine table, the tracks card (direction axis, when the
                  IMPLEMENTATION_PLAN has a Tracks table), authored-doc links
    Queue       — every PLAN.*.md as one work table (status/goal/next/age),
                  building first; a PLAN without a Status: line is flagged;
                  slices carried by a track wear its ⟡ chip
    Seams       — the boundary seam graph (embedded; empty-state if no
                  integration SPEC — with the pointer, never a guess)
    Spec Health — per-domain contract honesty: walls vs [review] judgment,
                  gates, Behavioral Contract lines bound to tests, template
                  FILL leftovers. Freeform SPECs get a tag census, labeled so.
    Graduation  — intent → contract: PLAN Scenario bullets paired (token
                  heuristic, said so on the page) with SPEC Behavioral
                  Contract lines; graduated / still-intent / reworded-without-
                  a-test / unbound BC lines, per domain.
    Timeline    — docs/walkthroughs/ as a reverse-chron proof strip (date ·
                  domain chips · title), each entry linking to its file.

Theming is live: the chrome runs on CSS variables and the embedded instruments
are pre-rendered in every palette, so the header's theme buttons switch the
whole page in place (persisted in localStorage under `dash-theme` — the same
key the workspace dashboard and the project MISSION/ARCHITECTURE docs use, so
one choice follows you across every surface; --theme only
sets the first-load default).

Everything is scanned live from the docs. A wrong page means wrong docs.

Usage:
    python gravity/lib/generate_observatory.py [<project-path-or-alias>]

From inside a project that carries .gravity/lib/ (installed by
.claude/scripts/install_lib.py), no argument is needed — the lib's own
location names the project it belongs to, so a clone that has never seen
the workspace renders itself:

    python .gravity/lib/generate_observatory.py
        [--theme aurora|daylight|sandstone|forest|slate] [--open]

Output: <project>/.gravity/observatory/index.html — inside the project, so
anyone who opens the repo can see it. The folder carries a .gitignore of `*`
(it ignores itself): the page is generated, and a committed page is one that
can go stale in git. Doc links are relative for the same reason — an absolute
file:// URI would pin the page to the machine that rendered it.
"""
from __future__ import annotations

import argparse
import html as html_mod
import json
import sys
import webbrowser
from pathlib import Path

# Siblings in this same lib/ — whether it sits in the gravity distribution or
# installed at <project>/.gravity/lib/. No workspace path is ever assumed.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_arg import observatory_dir, resolve_target  # noqa: E402
from scan_project import scan, trunc  # noqa: E402
from generate_cosmos import THEMES, STATUS_LABEL, render_3d  # noqa: E402
from generate_boundary import render as render_boundary  # noqa: E402
try:  # findings stay the checker's concern — imported, never reimplemented here
    from check_project import check_gravity_consistency, check_spec_honesty  # noqa: E402
except Exception:  # pragma: no cover — checker unavailable ≠ checker clean
    check_gravity_consistency = check_spec_honesty = None

esc = html_mod.escape

# The page is written to <project>/.gravity/observatory/index.html, so a link to
# an authored doc climbs two levels back to the project root. Relative, never
# file:// — an absolute URI pins the page to the machine that rendered it, and
# this page now ships inside the project.
DOC_PREFIX = "../../"


def doc_href(rel) -> str:
    """A project-root-relative path as an href from the rendered page."""
    return DOC_PREFIX + str(rel).replace("\\", "/")

STATUS_CLASS = {"◑": "st-a", "✓": "st-s", "○": "st-p"}


def present(exists: bool, rel: str, label: str = "") -> str:
    """A presence cell under an already-labelled column (SPEC / ARCH).

    The column header states WHICH doc, so the cell only has to answer whether
    it exists — and then be useful about it. Earlier this rendered the Orbit 3D
    metaphor glyphs (ring = SPEC, moon = ARCHITECTURE), which earn their keep on
    the star map but in a table were two symbols to memorise that both just meant
    "yes". Now: a present doc is a check that OPENS it; an absent one is a dash."""
    if not exists:
        return '<span class="absent" title="not present">&mdash;</span>'
    tip = f"open {label}" if label else "open"
    return (f'<a class="has" href="{doc_href(rel)}" target="_blank" '
            f'title="{esc(tip)}">&#10003;</a>')


def drift_card(findings) -> str:
    """The /triage view of this one project, inline where you look first.
    findings=None means the checkers couldn't run — said so, never shown green."""
    if findings is None:
        return ('<div class="ocard warn"><div class="ohead">drift — checkers unavailable</div>'
                '<div class="okv">check.py could not be imported; run '
                '<span class="mono">python .gravity/lib/check_project.py</span> yourself — unavailable is not clean.</div></div>')
    if not findings:
        return ('<div class="ocard"><div class="ohead">drift — consistency + spec honesty</div>'
                '<div class="okv okc">0 findings — indexes wired, protocol card current, '
                'SPEC walls verified against repo reality</div></div>')
    rows = []
    for f in findings:
        cls = "wt" if f.severity == "FAIL" else "satc"
        dom = f' <code>{esc(f.domain)}</code>' if f.domain else ""
        rows.append(f'<div class="okv"><b class="{cls}">[{f.severity}]</b> '
                    f'<span class="mono">{esc(f.code)}</span>{dom} — '
                    f'{esc(trunc(f.message, 220))}</div>')
    n_fail = sum(1 for f in findings if f.severity == "FAIL")
    return (f'<div class="ocard warn"><div class="ohead">drift — {len(findings)} finding'
            f'{"s" if len(findings) != 1 else ""}'
            f'{f" · {n_fail} FAIL" if n_fail else ""} (fix the docs, rerun)</div>'
            + "".join(rows) + "</div>")


def overview_html(facts: dict, project_path: Path, findings) -> str:
    ctx = facts["context"]
    if ctx.get("exists"):
        days = ctx["days_ago"]
        touched = (f'{ctx["last_touched"]} · '
                   + ("today" if days == 0 else f"{days}d ago" if days is not None else "?"))
        now = (f'<div class="ocard"><div class="ohead">now — CONTEXT.md</div>'
               f'<div class="okv">last touched <b>{esc(touched)}</b> · {ctx["lines"]} lines</div>'
               f'<div class="onext"><span class="olbl">next step</span> '
               f'{esc(ctx["next_step"]) or "<em>none recorded</em>"}</div></div>')
    else:
        now = ('<div class="ocard warn"><div class="ohead">now</div>'
               '<div class="okv">no CONTEXT.md — the session ritual is broken here</div></div>')

    rows = []
    for d in sorted(facts["domains"], key=lambda x: ({"◑": 0, "✓": 1, "○": 2}[x["status"]], x["name"])):
        touched = ("today" if d["age_days"] < 1 else
                   f'{d["age_days"]:.0f}d' if d["age_days"] < 900 else "—")
        spec_cell = present(d["spec"], f'.gravity/{d["name"]}/SPEC.md', "SPEC.md")
        arch_cell = present(d["arch"], f'.gravity/{d["name"]}/ARCHITECTURE.html',
                            "ARCHITECTURE.html")
        rows.append(
            f'<tr><td><code>{esc(d["name"])}</code></td>'
            f'<td><span class="sg {STATUS_CLASS[d["status"]]}">{d["status"]}</span>'
            f'{STATUS_LABEL[d["status"]]}</td>'
            f'<td>{spec_cell}</td><td>{arch_cell}</td>'
            f'<td>{len(d["plans"]) or "—"}</td><td>{touched}</td>'
            f'<td class="why">{esc(trunc(d["why"], 90)) or "<em>no MISSION row</em>"}</td></tr>')

    tracks_card = ""
    if facts.get("tracks"):
        trows = []
        for tr in facts["tracks"]:
            st = tr["status"] or "◑"
            chips = "".join(f'<span class="tchip">{esc(d)}</span>' for d in tr["domains"]) \
                    or '<span class="tchip none">no carrying slices</span>'
            dangling = [p["rel"] for p in tr["plans"] if not p["exists"]]
            warn = (f' <span class="wt">⚠ {len(dangling)} carrying PLAN'
                    f'{"s" if len(dangling) != 1 else ""} missing on disk</span>'
                    if dangling else "")
            mref = (f' <span class="dimc">(→ MISSION {esc(tr["mission"])})</span>'
                    if tr["mission"] else ' <span class="wt">(no MISSION § pointer)</span>')
            trows.append(f'<div class="okv"><b>⟡ {esc(tr["name"])}</b> '
                         f'<span class="sg {STATUS_CLASS.get(st, "st-a")}">{st}</span>— '
                         f'{esc(trunc(tr["direction"], 140))}{mref} · {chips}{warn}</div>')
        tracks_card = (f'<div class="ocard"><div class="ohead">tracks — the direction axis '
                       f'({len(facts["tracks"])} of ≤3)</div>' + "".join(trows) + '</div>')

    links = []
    for label, rel in (("MISSION.html", ".gravity/MISSION.html"),
                       ("ARCHITECTURE.html", ".gravity/ARCHITECTURE.html"),
                       ("IMPLEMENTATION_PLAN.md", ".gravity/IMPLEMENTATION_PLAN.md"),
                       ("CLAUDE.md", "CLAUDE.md"), ("CONTEXT.md", "CONTEXT.md")):
        if (project_path / rel).exists():
            links.append(f'<a href="{doc_href(rel)}" target="_blank">{label}</a>')

    return f"""<div class="pad">
  <div class="goal">{esc(facts["goal"]) or "<em>no goal: line in IMPLEMENTATION_PLAN.md</em>"}</div>
  {now}
  {drift_card(findings)}
  <div class="ocard"><div class="ohead">spine — {len(facts["domains"])} domains</div>
  <table class="spine"><tr><th>domain</th><th>status</th><th>SPEC</th><th>ARCH</th>
  <th>PLANs</th><th>touched</th><th>why</th></tr>{"".join(rows)}</table></div>
  {tracks_card}
  <div class="ocard"><div class="ohead">authored docs</div>
  <div class="links">{" · ".join(links) or "—"}</div></div>
</div>"""


def verdict(c: dict, run: dict | None) -> str:
    """One plain-English sentence per domain: what actually protects it.

    The cards state the metrics honestly but leave the reader to assemble the
    meaning; this says it outright, so a human engineer gets the takeaway
    without learning the tag vocabulary first. Deliberately literal — it only
    restates the scanned facts in a sentence, never grades or advises."""
    d = f'<code>{esc(c["domain"])}</code>'
    if not c["has_spec"]:
        return (f'<div class="vd vneutral">Nothing fences {d}: an agent changing it has no '
                'written contract to break. Fine for a read-only domain &mdash; a risk for one '
                'agents actually change.</div>')
    r = c["rules"]
    if not r["total"]:
        return (f'<div class="vd vwarn">{d} has a SPEC but no parsed rules, so there is nothing '
                'to enforce or review &mdash; the sheet exists but says nothing checkable.</div>')
    w = r["wall"]
    teeth = (f'<b>{w}</b> machine-checked rule{"s" if w != 1 else ""}' if w
             else "<b>no</b> machine-checked rules")
    human = r["judgment"] + r["guidance"]
    rest = (f' and {human} that rely on a human reading the SPEC' if human else "")
    if not c["gate"]:
        return (f'<div class="vd vwarn">An agent changing {d} meets {teeth}{rest} &mdash; but '
                '<b>no gate</b>, so nothing can prove the change was safe.</div>')
    if run is None:
        return (f'<div class="vd vneutral">An agent changing {d} meets {teeth}{rest}, behind a '
                'gate that has <b>never been run</b> here &mdash; so its walls are named, not '
                'demonstrated.</div>')
    state = run.get("state")
    age = (f'{run["age_days"]:.0f}d ago' if run.get("age_days") and run["age_days"] >= 1
           else "just now")
    if state == "green":
        stale = (" &mdash; though that run <b>predates the current code</b>"
                 if run.get("stale") else "")
        return (f'<div class="vd vok">An agent changing {d} meets {teeth}{rest}, and its gate '
                f'<b>passed {age}</b>{stale}.</div>')
    if state == "red":
        return (f'<div class="vd vbad">{d} has {teeth}{rest}, but its gate was <b>RED</b> as of '
                f'{age} &mdash; the walls are declared and currently failing.</div>')
    return (f'<div class="vd vneutral">{d} has {teeth}{rest}; its gate <b>could not run</b> '
            f'({esc(str(state))}, {age}), so it proved nothing either way &mdash; not a '
            'failure, an unknown.</div>')


def spec_health_html(facts: dict) -> str:
    status_of = {d["name"]: d["status"] for d in facts["domains"]}
    census = facts["specs"]
    fenced = [c for c in census if c["has_spec"]]
    total = sum(c["rules"]["total"] for c in fenced)
    walls = sum(c["rules"]["wall"] for c in fenced)
    bc_bound = sum(c["bc_bound"] for c in fenced)
    bc_unbound = sum(c["bc_unbound"] for c in fenced)
    pct = f"{100 * walls / total:.0f}%" if total else "—"

    gated = [c for c in fenced if c["gate"]]
    runs = facts.get("gates", {})
    tally = {s: sum(1 for c in gated if runs.get(c["domain"], {}).get("state") == s)
             for s in ("green", "red", "blocked", "timeout")}
    never = sum(1 for c in gated if c["domain"] not in runs)
    proof_bits = [f'<b class="okc">{tally["green"]} green</b>' if tally["green"] else "",
                  f'<b class="wt">{tally["red"]} RED</b>' if tally["red"] else "",
                  f'<span class="satc">{tally["blocked"] + tally["timeout"]} blocked</span>'
                  if tally["blocked"] + tally["timeout"] else "",
                  f'<span class="dimc">{never} never run</span>' if never else ""]
    proof_sum = (" · proof: " + " / ".join(b for b in proof_bits if b)) if gated else ""

    # The four rungs, as a chain. Each is a fraction of the PREVIOUS rung's
    # population, because that is what makes them a chain rather than four
    # unrelated percentages: rules only matter in a fenced domain, a gate only
    # matters where rules have teeth, and passing only matters where a gate
    # exists. The weakest rung is where an agent's mistake actually gets through.
    n_dom, n_fenced, n_gated = len(census), len(fenced), len(gated)
    n_green = tally["green"]
    RUNGS = [
        ("fenced", n_fenced, n_dom, "domains carry a SPEC",
         "an unfenced domain has no written contract to break"),
        ("rules have teeth", walls, total, "rules are machine-checkable",
         "the rest rely on a human reading the SPEC"),
        ("gate exists", n_gated, n_fenced, "fenced domains name a proving command",
         "without one, nothing can prove a change"),
        ("gate passes", n_green, n_gated, "gates are green right now",
         "a named test that fails proves nothing"),
    ]
    # A rung with no denominator is VACUOUS, not failing: "gates are green" says
    # nothing when no gate exists. Those are excluded from the weakest-link search
    # and drawn neutral — the empty-bar-in-alarm-colour it used to render read as
    # a failure the project had not actually earned.
    scored = [(v / d, i) for i, (_, v, d, _, _) in enumerate(RUNGS) if d]
    # Ties go to the LOWER rung on purpose: the rungs are a chain, so the earliest
    # break is the one worth fixing first (a gate over toothless rules proves less).
    weakest = min(scored)[1] if scored else -1
    rungs = []
    for i, (name, val, den, what, why) in enumerate(RUNGS):
        if not den:
            cls, ratio, pctxt, mark = "rvac", 0.0, "—", ""
            why = "nothing to measure yet — no gate exists to pass"
        else:
            ratio = val / den
            cls = ("rgood" if ratio >= 0.999 else "rmid" if ratio >= 0.5 else "rweak")
            pctxt = f"{val}/{den}"
            mark = (' <span class="rflag">weakest link</span>'
                    if i == weakest and ratio < 0.999 else "")
        rungs.append(
            f'<div class="rung {cls}"><span class="rn">{i + 1}</span>'
            f'<span class="rname">{name}</span>'
            f'<span class="rbar"><span class="rfill" style="width:{ratio * 100:.0f}%"></span></span>'
            f'<span class="rval">{pctxt}</span>'
            f'<span class="rwhat">{what}{mark}<span class="rwhy">{why}</span></span></div>')

    cards = []
    for c in sorted(census, key=lambda x: (not x["has_spec"], x["domain"])):
        st = status_of.get(c["domain"], "○")
        head = (f'<div class="ohead"><span class="sg {STATUS_CLASS[st]}" '
                f'title="{esc(STATUS_LABEL[st])}">{st}</span>'
                f'<code>{esc(c["domain"])}</code>'
                + ('<span class="formtag">freeform</span>' if c["has_spec"] and c["form"] == "freeform" else "")
                + '</div>')
        if not c["has_spec"]:
            cards.append(f'<div class="hcard nospec">{head}'
                         '<div class="okv">no SPEC — unfenced (fine for read-only '
                         'domains; a domain agents change wants walls)</div></div>')
            continue
        r = c["rules"]
        if r["total"]:
            seg = "".join(
                f'<span class="seg {cls}" style="flex:{n}"></span>'
                for n, cls in ((r["wall"], "seg-w"), (r["judgment"], "seg-j"),
                               (r["guidance"], "seg-g")) if n)
            bar = (f'<div class="bar">{seg}</div>'
                   f'<div class="okv"><b class="okc">{r["wall"]} wall'
                   f'{"s" if r["wall"] != 1 else ""}</b> · '
                   f'<span class="satc">{r["judgment"]} judgment</span> · '
                   f'<span class="dimc">{r["guidance"]} guidance</span>'
                   + (" <i>(tag census — freeform sheet)</i>" if c["form"] == "freeform" else "")
                   + '</div>')
        else:
            bar = '<div class="okv wt">SPEC exists but zero rules found</div>'
        # Proof freshness — the one thing the tags/contract can't say. Every
        # other signal here proves a test is NAMED; this is whether it PASSES.
        # "blocked" is kept distinct from "red" on purpose: a gate that could
        # not reach its server proved nothing, and calling that a failure would
        # be worse than saying nothing.
        run = facts.get("gates", {}).get(c["domain"])
        proof = ""
        if c["gate"]:
            if not run:
                proof = ('<span class="pchip pnone" title="run_gate.py --all">'
                         'never run</span>')
            else:
                cls, label = {
                    "green": ("pok", "green"), "red": ("pbad", "RED"),
                    "blocked": ("pwarn", "blocked"),
                    "timeout": ("pwarn", "timed out"),
                }.get(run["state"], ("pnone", run["state"]))
                age = (f'{run["age_days"]:.0f}d ago' if run["age_days"] and run["age_days"] >= 1
                       else "just now")
                stale = (' <b>· predates HEAD</b>' if run["stale"] else "")
                tip = esc(trunc(run["tail"].replace("\n", " ⏎ "), 300)) if run["tail"] else ""
                proof = (f'<span class="pchip {cls}" title="{tip}">{label}'
                         f' · {age}{stale}</span>')
        gate = (f'<div class="okv gate">gate — <span class="mono">{esc(trunc(c["gate"], 90))}</span>'
                f'{proof}</div>'
                if c["gate"] else
                '<div class="okv wt">no Gate line — nothing proves a change here</div>')
        bc = ""
        if c["bc_bound"] or c["bc_unbound"]:
            unb = (f' · <span class="wt">{c["bc_unbound"]} unbound</span>'
                   if c["bc_unbound"] else "")
            bc = (f'<div class="okv">behavioral contract: <b class="okc">'
                  f'{c["bc_bound"]} test-bound</b>{unb}</div>')
        fills = (f'<div class="okv wt">⚠ {c["fills"]} template '
                 f'FILL leftover{"s" if c["fills"] != 1 else ""}</div>' if c["fills"] else "")
        cards.append(f'<div class="hcard">{head}{bar}{gate}{bc}{fills}'
                     f'{verdict(c, facts.get("gates", {}).get(c["domain"]))}</div>')

    return f"""<div class="pad">
  <div class="hq">If an agent changes a domain tomorrow, <b>what catches a mistake</b> —
    and is that catcher <b>passing today</b>?</div>
  <div class="ladder">{"".join(rungs)}</div>
  <div class="hint">The four rungs are a <b>chain</b>: a gate proves nothing if the rules have
    no teeth, and a wall proves nothing if its gate is red. Your weakest rung is where an
    agent's mistake would actually get through — that is the number to move, not the
    percentage.<br>
    A <b>wall</b> is a rule tooling enforces (<span class="mono">[lint]</span>/<span
    class="mono">[type]</span>/<span class="mono">[test:…]</span>); <b>judgment</b> (<span
    class="mono">[review]</span>) and <b>guidance</b> (<span class="mono">[—]</span>) rely on a
    human reading the SPEC. A low wall share <i>isn't shame</i> — it is the honest map of where
    the contract can lie, and some domains (read-only ones) deserve no walls at all.<br>
    Rungs 1–3 only prove a test is <i>named</i>. Rung 4 is whether it <i>passes</i>, recorded by
    <span class="mono">run_gate.py --all</span> — hover a proof chip for the captured output.
    <b>blocked</b> is deliberately not <b>RED</b>: a gate that couldn't reach its server or
    fixture proved nothing either way, and calling that a failure would be worse than saying
    nothing.</div>
  <div class="hgrid">{"".join(cards)}</div>
</div>"""


QUEUE_ORDER = {"◑": 0, "○": 1, "": 2, "✓": 3}


def queue_html(facts: dict, project_path: Path) -> str:
    """Every PLAN.*.md as one work table: what's building, what's queued,
    what shipped — without opening ten files. The PLANs stay the one home
    of the intent; this only surfaces their own status/goal/next lines."""
    q = facts["queue"]
    if not q:
        return ('<div class="pad"><div class="ocard"><div class="ohead">no slice queue</div>'
                '<div class="okv">No <span class="mono">PLAN.*.md</span> under any '
                '<span class="mono">.gravity/&lt;domain&gt;/</span>. Intent enters as a slice '
                'PLAN (<span class="mono">/interview</span> / <span class="mono">/new-domain</span> '
                'seed one); the roadmap spine lives in IMPLEMENTATION_PLAN.md.</div></div></div>')

    track_of: dict[str, list[str]] = {}
    for tr in facts.get("tracks", []):
        for pl in tr["plans"]:
            track_of.setdefault(pl["rel"], []).append(tr["name"])

    n_b = sum(1 for p in q if p["status"] == "◑")
    n_p = sum(1 for p in q if p["status"] == "○")
    n_s = sum(1 for p in q if p["status"] == "✓")
    n_none = sum(1 for p in q if not p["status"])
    rows = []
    for p in sorted(q, key=lambda x: (QUEUE_ORDER[x["status"]], x["age_days"])):
        href = doc_href(p["rel"])
        if p["status"]:
            st = (f'<span class="sg {STATUS_CLASS[p["status"]]}">{p["status"]}</span>'
                  f'{STATUS_LABEL[p["status"]]}')
        else:
            st = '<span class="wt">no Status: line</span>'
        nxt = p["next"] or p["note"]
        shipped = ' class="qdone"' if p["status"] == "✓" else ""
        touched = "today" if p["age_days"] < 1 else f'{p["age_days"]:.0f}d'
        tchips = "".join(f'<span class="tchip">⟡ {esc(n)}</span>'
                         for n in track_of.get(p["rel"], []))
        rows.append(
            f'<tr{shipped}><td><a class="qlink" href="{href}" target="_blank">'
            f'<code>{esc(p["domain"])}/</code>{esc(p["file"])}</a> {tchips}</td>'
            f'<td class="qst">{st}</td>'
            f'<td class="qgoal">{esc(p["goal"]) or "<em>no Goal section</em>"}</td>'
            f'<td class="qnext">{esc(nxt) or "—"}</td>'
            f'<td>{touched}</td></tr>')

    warn = f' · <b class="wt">{n_none} without a Status line</b>' if n_none else ""
    return f"""<div class="pad wide">
  <div class="hsum"><b>{len(q)}</b> slices ·
    <b class="satc">{n_b} building</b> · {n_p} planned · <b class="okc">{n_s} shipped</b>{warn}</div>
  <div class="hint">One row per <span class="mono">PLAN.*.md</span>, straight from each PLAN's
    own Status/Goal/Next lines — building first, shipped last. A PLAN without a
    <span class="mono">Status:</span> line can't be mirrored into the
    IMPLEMENTATION_PLAN.md spine; give it one.</div>
  <table class="spine queue"><tr><th>plan</th><th>status</th><th>goal</th>
  <th>next / note</th><th>touched</th></tr>{"".join(rows)}</table>
</div>"""


def timeline_html(facts: dict, project_path: Path) -> str:
    """The frozen history: docs/walkthroughs/ as a reverse-chron strip —
    what shipped, when, in which domain(s), each linking to its proof."""
    wts = facts["walkthroughs"]
    if not wts:
        return ('<div class="pad"><div class="ocard"><div class="ohead">no walkthroughs</div>'
                '<div class="okv">Nothing under <span class="mono">docs/walkthroughs/</span>. '
                'A walkthrough is the per-slice trust artifact (what changed + the proof it '
                'works) — copy <span class="mono">WALKTHROUGH.template.md</span> when a '
                'reviewable slice ships; skip it for trivial fixes.</div></div></div>')

    rows, last_month = [], ""
    for w in wts:
        month = w["date"][:7]
        if month != last_month:
            rows.append(f'<div class="tmonth">{month}</div>')
            last_month = month
        href = doc_href(f'docs/walkthroughs/{w["file"]}')
        chips = "".join(f'<span class="tchip">{esc(d)}</span>' for d in w["domains"]) \
                or '<span class="tchip none">no domain header</span>'
        rows.append(f'<div class="trow"><span class="tdate mono">{w["date"]}</span>'
                    f'{chips}<a class="qlink" href="{href}" target="_blank">'
                    f'{esc(w["title"])}</a></div>')
    return f"""<div class="pad">
  <div class="hsum"><b>{len(wts)}</b> walkthroughs · {wts[-1]["date"]} → {wts[0]["date"]}</div>
  <div class="hint">The append-only proof log — newest first, tagged by domain, never
    foldered by it. Each entry closes a slice PLAN; CONTEXT.md links here instead of
    restating what shipped.</div>
  {"".join(rows)}
</div>"""


def graduation_html(facts: dict) -> str:
    """Intent → contract, per domain: which PLAN scenarios earned a test wall
    in the SPEC's Behavioral Contract, which are still intent, and which BC
    lines are dressed as contract with no test. Pairing is a token heuristic
    (scanner fact) — the tab says so instead of pretending certainty."""
    status_of = {d["name"]: d["status"] for d in facts["domains"]}
    doms = facts["scenarios"]
    if not doms:
        return ('<div class="pad"><div class="ocard"><div class="ohead">no scenarios yet</div>'
                '<div class="okv">No PLAN <b>Scenario</b> blocks and no SPEC <b>Behavioral '
                'Contract</b> lines in this project. Intent enters as given/when/then in a '
                'slice PLAN (<span class="mono">/interview</span> seeds it) and graduates to '
                'the SPEC once a named test asserts it.</div></div></div>')

    n_scen = n_grad = n_reword = n_shipped_intent = 0
    n_bound = n_unbound = 0
    cards = []
    for d in doms:
        st = status_of.get(d["domain"], "○")
        rows = []
        for pl in d["plans"]:
            pst = f' · {pl["status"]}' if pl["status"] else ""
            rows.append(f'<div class="gsrc"><span class="mono">{esc(pl["file"])}</span>{pst}</div>')
            for s in pl["scenarios"]:
                n_scen += 1
                txt = esc(trunc(s["text"], 150))
                if s["match"] is not None and s["test"]:
                    n_grad += 1
                    rows.append(f'<div class="gline"><b class="okc">✓</b> {txt} '
                                f'<span class="gtest okc mono">[test:{esc(trunc(s["test"], 60))}]</span></div>')
                elif s["match"] is not None:
                    n_reword += 1
                    rows.append(f'<div class="gline"><b class="wt">⚠</b> {txt} '
                                '<span class="gtest wt">reworded into the BC without a test '
                                '— not a graduation</span></div>')
                else:
                    note = ""
                    if pl["status"] == "✓":
                        n_shipped_intent += 1
                        note = ('<span class="gtest wt">PLAN shipped, scenario never '
                                'graduated — its wall may live in a gate; check</span>')
                    rows.append(f'<div class="gline"><span class="dimc">○</span> '
                                f'<span class="dimc">{txt}</span> {note}</div>')
        orphans = [b for b in d["bc"] if not b["matched"]]
        if orphans:
            rows.append('<div class="gsrc"><span class="mono">SPEC.md</span> · '
                        'Behavioral Contract lines with no PLAN intent above</div>')
            for b in orphans:
                txt = esc(trunc(b["text"], 150))
                if b["test"]:
                    n_bound += 1
                    rows.append(f'<div class="gline"><b class="okc">✓</b> <span class="dimc">{txt}</span> '
                                f'<span class="gtest dimc mono">[test:{esc(trunc(b["test"], 60))}]</span></div>')
                else:
                    n_unbound += 1
                    rows.append(f'<div class="gline"><b class="wt">⚠</b> {txt} '
                                '<span class="gtest wt">unbound — contract line with no test</span></div>')
        n_bound += sum(1 for b in d["bc"] if b["matched"] and b["test"])
        cards.append(f'<div class="ocard"><div class="ohead">'
                     f'<span class="sg {STATUS_CLASS[st]}" title="{esc(STATUS_LABEL[st])}">'
                     f'{st}</span><code>{esc(d["domain"])}</code></div>{"".join(rows)}</div>')

    warn = ""
    if n_reword or n_shipped_intent or n_unbound:
        bits = ([f'<b class="wt">{n_reword} reworded without a test</b>'] * bool(n_reword)
                + [f'<b class="wt">{n_shipped_intent} shipped-but-never-graduated</b>'] * bool(n_shipped_intent)
                + [f'<b class="wt">{n_unbound} unbound BC line{"s" if n_unbound != 1 else ""}</b>'] * bool(n_unbound))
        warn = " · " + " · ".join(bits)
    return f"""<div class="pad">
  <div class="hsum"><b>{n_scen}</b> scenarios in PLANs ·
    <b class="okc">{n_grad} graduated</b> to test-bound contract ·
    <span class="dimc">{n_scen - n_grad - n_reword} still intent</span> ·
    <b>{n_bound}</b> BC lines test-bound{warn}</div>
  <div class="hint">Behavior <b>graduates</b> when a named test asserts it: given/when/then
    enters a slice PLAN as intent and is promoted to the SPEC's Behavioral Contract only
    with a <span class="mono">[test:name]</span> binding — never by rewording. Pairing here
    is a token-overlap heuristic over the docs: a ○ scenario may still hold a wall
    elsewhere (a gate line) — read the SPEC before judging.</div>
  {"".join(cards)}
</div>"""


def theme_vars(name: str, t: dict) -> str:
    return (f'[data-theme="{name}"] {{ --bg:{t["bg"]}; --bg2:{t["bg2"]}; '
            f'--panel:{t["panel"]}; --card:{t["card"]}; --line:{t["line"]}; '
            f'--ink:{t["ink"]}; --dim:{t["dim"]}; --accent:{t["status"]["◑"]}; '
            f'--ok:{t["status"]["✓"]}; --plan:{t["status"]["○"]}; '
            f'--guard:{t["guard"]}; --sat:{t["sat"]} }}')


def render_page(facts: dict, theme: str, project_path: Path, findings) -> str:
    integ = facts["integration"]

    # every theme's instruments, pre-rendered — the buttons swap them in place
    inst: dict[str, dict] = {}
    for tn, tt in THEMES.items():
        entry = {"orbit": render_3d(facts, tt)}
        if integ is not None:
            entry["seams"] = render_boundary(integ, tt)
        inst[tn] = entry
    payload = json.dumps(inst, ensure_ascii=False).replace("</", "<\\/")

    if integ is not None:
        seams_tab = '<iframe class="inst" id="if-seams"></iframe>'
        n_seams = f'{len(integ["seams"])} seams'
        n_open = sum(1 for e in integ["seams"] if e["open"])
        if n_open:
            n_seams += f' · {n_open} OPEN'
    else:
        seams_tab = (f'<div class="pad"><div class="ocard warn"><div class="ohead">no seam graph</div>'
                     f'<div class="okv">this project has no <span class="mono">.gravity/integration/SPEC.md</span> — '
                     f'author it with <span class="mono">/new-spec {esc(facts["project"])} integration</span>'
                     f' (or <span class="mono">/excavate</span> for a brownfield survey). '
                     f'The observatory never draws seams it can\'t cite.</div></div></div>')
        n_seams = "no integration SPEC"
    fenced = sum(1 for c in facts["specs"] if c["has_spec"])

    theme_css = "\n  ".join(theme_vars(n, t) for n, t in THEMES.items())
    swatches = "".join(
        f'<button data-th="{n}" title="{n}" style="background:{t["star"][1]}"></button>'
        for n, t in THEMES.items())

    # attention badges — a count chip only where something wants a look:
    # Overview: checker findings (guard-red if any FAIL) · Queue: ◑ building ·
    # Seams: OPEN rows · Spec Health: unfenced ◑ domains · Graduation: the two
    # dishonesty smells (reworded-without-a-test + unbound BC lines)
    def badge(n: int, guard: bool = False) -> str:
        if not n:
            return ""
        return f'<span class="nbdg{" guard" if guard else ""}">{n}</span>'

    n_fail = sum(1 for f in findings if f.severity == "FAIL") if findings else 0
    b_overview = badge(len(findings), bool(n_fail)) if findings else ""
    b_queue = badge(sum(1 for p in facts["queue"] if p["status"] == "◑"))
    b_seams = badge(n_open if integ is not None else 0, guard=True)
    census = {c["domain"]: c for c in facts["specs"]}
    b_health = badge(sum(1 for d in facts["domains"]
                         if d["status"] == "◑"
                         and not census.get(d["name"], {}).get("has_spec")),
                     guard=True)
    n_smell = sum(1 for d in facts["scenarios"] for b in d["bc"]
                  if not b["test"] and not b["matched"]) \
        + sum(1 for d in facts["scenarios"] for p in d["plans"]
              for s in p["scenarios"] if s["match"] is not None and not s["test"])
    b_grad = badge(n_smell, guard=True)

    return f"""<!doctype html><html lang="en" data-theme="{theme}"><meta charset="utf-8">
<title>{esc(facts["project"])} — gravity observatory</title>
<style>
  {theme_css}
  * {{ box-sizing:border-box }}
  body {{ margin:0; height:100vh; display:flex; flex-direction:column; color:var(--ink);
    background:radial-gradient(1100px 700px at 40% 0%, var(--bg2) 0%, var(--bg) 62%);
    font:14px/1.5 "Segoe UI",system-ui,sans-serif; transition:background .3s }}
  header {{ display:flex; align-items:baseline; gap:14px; padding:12px 20px 0 }}
  header h1 {{ font-size:16px; margin:0 }}
  header .census {{ color:var(--dim); font-size:12px; flex:1 }}
  #themebar {{ display:flex; gap:6px; align-self:center }}
  #themebar button {{ width:22px; height:22px; border-radius:50%; cursor:pointer;
    border:2px solid transparent; padding:0 }}
  #themebar button.on {{ border-color:var(--ink) }}
  #themebar button:hover {{ transform:scale(1.15) }}
  nav {{ display:flex; gap:4px; padding:8px 20px 0; border-bottom:1px solid var(--line) }}
  nav button {{ background:none; border:1px solid transparent; border-bottom:none;
    color:var(--dim); font:600 13px "Segoe UI",system-ui,sans-serif; padding:7px 16px;
    cursor:pointer; border-radius:9px 9px 0 0 }}
  nav button:hover {{ color:var(--ink) }}
  nav button.on {{ color:var(--ink); background:var(--panel); border-color:var(--line) }}
  main {{ flex:1; min-height:0 }}
  .tab {{ display:none; height:100% }}
  .tab.on {{ display:block }}
  .tab.scroll {{ overflow-y:auto }}
  .inst {{ width:100%; height:100%; border:none; display:block }}
  .pad {{ padding:18px 26px; max-width:1460px }}
  .goal {{ font-size:14.5px; margin-bottom:14px }}
  .ocard {{ border:1px solid var(--line); border-radius:12px; background:var(--card);
    padding:13px 16px; margin-bottom:14px }}
  .ocard.warn {{ border-color:var(--guard) }}
  .ohead {{ font-size:11px; letter-spacing:1.2px; text-transform:uppercase;
    color:var(--dim); margin-bottom:8px; display:flex; align-items:center; gap:8px }}
  .ohead code {{ font-size:13px; color:var(--ink); text-transform:none; letter-spacing:0 }}
  .okv {{ font-size:12.5px; color:var(--ink); margin-bottom:4px }}
  .onext {{ font-size:13px; margin-top:6px }}
  .olbl {{ font-size:10.5px; letter-spacing:1px; text-transform:uppercase;
    color:var(--accent); margin-right:8px }}
  /* One status mark, not three. The glyph carries BOTH shape and colour, so the
     separate colour dot it replaced is redundant where a glyph follows — and is an
     upgrade where the dot stood alone (a bare colour is the one encoding a
     colour-blind reader cannot resolve). Glyphs match the PLAN files verbatim. */
  /* Spec Health: the question, then the four rungs as a chain. The rungs are
     nested fractions (rules only count inside fenced domains, passing only
     inside gated ones), which is what makes them a ladder and not four
     unrelated percentages. */
  .hq {{ font-size:14px; color:var(--ink); margin:2px 0 12px; line-height:1.5 }}
  .ladder {{ display:flex; flex-direction:column; gap:4px; margin-bottom:14px }}
  .rung {{ display:grid; grid-template-columns:20px 130px 1fr 54px 2.1fr; gap:10px;
    align-items:center; padding:6px 10px; border:1px solid var(--line);
    border-radius:7px; background:var(--card); font-size:11.5px }}
  .rung .rn {{ font-family:var(--mono,monospace); color:var(--dim); text-align:center }}
  .rung .rname {{ color:var(--ink); font-weight:600 }}
  .rbar {{ height:6px; border-radius:3px; background:var(--line); overflow:hidden }}
  .rfill {{ display:block; height:100%; background:var(--dim) }}
  .rgood .rfill {{ background:var(--ok) }}
  .rmid .rfill {{ background:var(--accent) }}
  .rweak .rfill {{ background:var(--guard) }}
  .rweak {{ border-color:var(--guard) }}
  .rvac {{ opacity:.55 }} .rvac .rbar {{ background:transparent; border:1px dashed var(--line) }}
  .rung .rval {{ font-family:var(--mono,monospace); color:var(--ink); text-align:right }}
  .rung .rwhat {{ color:var(--dim) }}
  .rung .rwhy {{ display:block; opacity:.72; font-size:10.5px }}
  .rflag {{ color:var(--guard); font-weight:700; margin-left:6px }}
  /* the per-domain takeaway — the sentence a human reads instead of assembling
     the metrics above it themselves */
  .vd {{ margin-top:7px; padding:7px 10px; border-radius:7px; font-size:11.5px;
    line-height:1.5; border-left:3px solid var(--line); background:var(--bg2) }}
  .vok {{ border-left-color:var(--ok) }}
  .vbad {{ border-left-color:var(--guard) }}
  .vwarn {{ border-left-color:var(--accent) }}
  .vneutral {{ border-left-color:var(--dim) }}
  .sg {{ font-weight:700; margin-right:6px; font-style:normal }}
  .st-a {{ color:var(--accent) }} .st-s {{ color:var(--ok) }}
  .st-p {{ color:var(--plan) }}
  /* The mark legend. The page carries a small symbol vocabulary across four
     tabs and used to explain none of it; one strip beats memorising glyphs. */
  .legend {{ display:flex; flex-wrap:wrap; gap:13px; align-items:center;
    padding:7px 20px; border-bottom:1px solid var(--line); background:var(--panel);
    font-size:11px; color:var(--dim) }}
  .legend b {{ color:var(--ink); font-weight:600 }}
  .legend .sep {{ width:1px; height:11px; background:var(--line); display:inline-block }}
  .has {{ color:var(--ok); font-weight:700; text-decoration:none }}
  .has:hover {{ text-decoration:underline }}
  .absent {{ color:var(--dim); opacity:.5 }}
  table.spine {{ border-collapse:collapse; width:100%; font-size:12.5px }}
  table.spine th {{ text-align:left; color:var(--dim); font-weight:600; font-size:11px;
    letter-spacing:.6px; text-transform:uppercase; padding:4px 10px 6px 0 }}
  table.spine td {{ padding:5px 10px 5px 0; border-top:1px solid var(--line) }}
  table.spine td.why {{ color:var(--dim) }}
  .links a {{ color:var(--sat); text-decoration:none; font-family:monospace; font-size:12.5px }}
  .links a:hover {{ text-decoration:underline }}
  .mono {{ font-family:monospace; font-size:12px }}
  .wt {{ color:var(--guard) }} .okc {{ color:var(--ok) }}
  .satc {{ color:var(--sat) }} .dimc {{ color:var(--dim) }}
  .hsum {{ font-size:13.5px; margin-bottom:8px }}
  .hint {{ color:var(--dim); font-size:12px; margin-bottom:16px; max-width:760px }}
  .hgrid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(310px,1fr)); gap:12px }}
  .hcard {{ border:1px solid var(--line); border-radius:12px; background:var(--card);
    padding:12px 14px }}
  .hcard.nospec {{ border-style:dashed; opacity:.75 }}
  /* proof-freshness chip — the recorded outcome of the gate, not its name.
     Hover shows the captured output tail, so a misread is always auditable. */
  .pchip {{ margin-left:8px; font-size:10.5px; padding:2px 7px; border-radius:20px;
    border:1px solid currentColor; white-space:nowrap; cursor:help }}
  .pchip.pok   {{ color:var(--ok) }}
  .pchip.pbad  {{ color:var(--guard); font-weight:700 }}
  .pchip.pwarn {{ color:var(--sat) }}
  .pchip.pnone {{ color:var(--dim); border-style:dashed }}
  .formtag {{ font-size:10px; letter-spacing:1px; color:var(--sat);
    border:1px solid var(--line); border-radius:8px; padding:1px 7px }}
  .bar {{ display:flex; height:8px; border-radius:4px; overflow:hidden; margin:4px 0 6px }}
  .seg {{ min-width:3px }}
  .seg-w {{ background:var(--ok) }} .seg-j {{ background:var(--sat) }}
  .seg-g {{ background:var(--dim) }}
  .gate {{ color:var(--dim) }}
  .gsrc {{ font-size:11px; letter-spacing:.6px; text-transform:none; color:var(--dim);
    margin:9px 0 4px }}
  .gsrc:first-child {{ margin-top:0 }}
  .gline {{ font-size:12.5px; margin:3px 0 3px 6px; padding-left:16px; text-indent:-16px }}
  .gtest {{ font-size:11px; margin-left:6px }}
  .pad.wide {{ max-width:1760px }}
  table.queue td {{ vertical-align:top }}
  table.queue td.qgoal, table.queue td.qnext {{ color:var(--dim); max-width:360px }}
  table.queue td.qst {{ white-space:nowrap }}
  tr.qdone {{ opacity:.6 }}
  .qlink {{ color:var(--ink); text-decoration:none }}
  .qlink:hover {{ color:var(--sat); text-decoration:underline }}
  .tmonth {{ font-size:11px; letter-spacing:1.2px; text-transform:uppercase;
    color:var(--accent); margin:16px 0 6px }}
  .trow {{ display:flex; align-items:baseline; gap:10px; padding:5px 0;
    border-top:1px solid var(--line); font-size:13px }}
  .tdate {{ color:var(--dim); font-size:11.5px; flex-shrink:0 }}
  .tchip {{ font-size:10.5px; color:var(--sat); border:1px solid var(--line);
    border-radius:8px; padding:0 7px; flex-shrink:0 }}
  .tchip.none {{ color:var(--guard) }}
  .nbdg {{ display:inline-block; margin-left:7px; font-size:10px; line-height:15px;
    min-width:15px; text-align:center; border-radius:8px; padding:0 4px;
    background:var(--sat); color:var(--bg); vertical-align:1px }}
  .nbdg.guard {{ background:var(--guard) }}
  footer {{ padding:6px 20px; color:var(--dim); font-size:11px; font-family:monospace;
    border-top:1px solid var(--line) }}
</style>
<header><h1>☉ {esc(facts["title"])}</h1>
  <span class="census">{len(facts["domains"])} domains · {n_seams} ·
    {fenced}/{len(facts["specs"])} fenced · generated {facts["generated"]}</span>
  <div id="themebar">{swatches}</div></header>
<nav>
  <button class="on" data-tab="overview">Overview{b_overview}</button>
  <button data-tab="queue">Queue{b_queue}</button>
  <button data-tab="seams">Seams{b_seams}</button>
  <button data-tab="health">Spec Health{b_health}</button>
  <button data-tab="grad">Graduation{b_grad}</button>
  <button data-tab="timeline">Timeline</button>
  <button data-tab="orbit">Orbit 3D</button>
</nav>
<div class="legend" aria-label="what the marks mean">
  <span><span class="sg st-a">◑</span>active</span>
  <span><span class="sg st-s">✓</span>stable</span>
  <span><span class="sg st-p">○</span>planned</span>
  <span class="sep"></span>
  <span><span class="has">✓</span> present &mdash; click to open</span>
  <span><span class="absent">&mdash;</span> absent</span>
  <span class="sep"></span>
  <span><b class="satc">⟡</b> carried by a track</span>
  <span><b class="wt">⚠</b> needs attention</span>
</div>
<main>
  <div class="tab scroll on" id="tab-overview">{overview_html(facts, project_path, findings)}</div>
  <div class="tab scroll" id="tab-queue">{queue_html(facts, project_path)}</div>
  <div class="tab{"" if integ is not None else " scroll"}" id="tab-seams">{seams_tab}</div>
  <div class="tab scroll" id="tab-health">{spec_health_html(facts)}</div>
  <div class="tab scroll" id="tab-grad">{graduation_html(facts)}</div>
  <div class="tab scroll" id="tab-timeline">{timeline_html(facts, project_path)}</div>
  <div class="tab" id="tab-orbit"><iframe class="inst" id="if-orbit"></iframe></div>
</main>
<footer>gravity observatory · scanned live from the project docs — a wrong page means
 wrong docs (fix them, rerun)</footer>
<script>
  const INST = {payload};
  const seamIF = document.getElementById('if-seams');
  const orbIF = document.getElementById('if-orbit');
  function setTheme(n) {{
    document.documentElement.dataset.theme = n;
    orbIF.srcdoc = INST[n].orbit;
    if (seamIF && INST[n].seams) seamIF.srcdoc = INST[n].seams;
    try {{ localStorage.setItem('dash-theme', n); }} catch (e) {{}}
    document.querySelectorAll('#themebar button').forEach(b =>
      b.classList.toggle('on', b.dataset.th === n));
  }}
  document.querySelectorAll('#themebar button').forEach(b =>
    b.addEventListener('click', () => setTheme(b.dataset.th)));
  let saved = null;
  try {{ saved = localStorage.getItem('dash-theme'); }} catch (e) {{}}
  setTheme(INST[saved] ? saved : "{theme}");

  function setTab(name) {{
    if (!document.getElementById('tab-' + name)) return;
    document.querySelectorAll('nav button').forEach(x =>
      x.classList.toggle('on', x.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(x =>
      x.classList.toggle('on', x.id === 'tab-' + name));
    history.replaceState(null, '', '#' + name);   // deep-linkable, no history spam
  }}
  document.querySelectorAll('nav button').forEach(b =>
    b.addEventListener('click', () => setTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
  if (location.hash.length > 1) setTab(location.hash.slice(1));
</script>
</html>"""


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="One project, one page — the unified gravity view.")
    ap.add_argument("project", nargs="?", help="project path, or a name/alias when run from the workspace (default: the project this lib belongs to)")
    ap.add_argument("--theme", choices=sorted(THEMES), default="aurora",
                    help="first-load default; the page has live theme buttons")
    ap.add_argument("--open", action="store_true", help="open the result in the browser")
    args = ap.parse_args()

    name, path = resolve_target(args.project)
    facts = scan(path)
    findings = None
    if check_gravity_consistency is not None:
        try:
            findings = (check_gravity_consistency(path)
                        + check_spec_honesty(path))
        except SystemExit:
            findings = None
    outdir = observatory_dir(path)
    out = outdir / "index.html"
    out.write_text(render_page(facts, args.theme, path, findings), encoding="utf-8")

    integ = facts["integration"]
    seams = f"{len(integ['seams'])} seams" if integ else "no integration SPEC"
    fenced = sum(1 for c in facts["specs"] if c["has_spec"])
    scens = [s for d in facts["scenarios"] for p in d["plans"] for s in p["scenarios"]]
    grads = sum(1 for s in scens if s["match"] is not None and s["test"])
    building = sum(1 for p in facts["queue"] if p["status"] == "◑")
    drift = ("checkers unavailable" if findings is None
             else f"{len(findings)} finding{'s' if len(findings) != 1 else ''}")
    print(f"observatory[{args.theme}]: {len(facts['domains'])} domains · {seams} · "
          f"{fenced}/{len(facts['specs'])} fenced · {grads}/{len(scens)} scenarios "
          f"graduated · {building}/{len(facts['queue'])} slices building · "
          f"{len(facts['tracks'])} tracks · "
          f"{len(facts['walkthroughs'])} walkthroughs · {drift} · "
          f"{len(THEMES)} live themes -> {out}")
    if args.open:
        webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
