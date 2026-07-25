#!/usr/bin/env python3
"""
generate_boundary.py — render a project's integration Boundary Map as a seam graph.

The visual half of the `integration` domain (and of /excavate's output): every
seam in .gravity/integration/SPEC.md drawn as a flowing edge between the parts
it connects.

    Node    = a runnable part / service named in the Boundary Map
    Edge    = one seam (one Boundary Map row); packets travel in flow direction
    OPEN    = a row carrying `OPEN:` — dashed guard-red, no packets (unknown flow)
    Readout = click a seam or part: what crosses, transport, evidence citations,
              matched port row; the overview card holds Gate, Change Order,
              Rules (walls vs judgment), and Gotchas

Everything is scanned live from the SPEC — no hand-kept data. If the graph
looks wrong, the Boundary Map is wrong: fix the SPEC and rerun. Rows the parser
can't read are listed loud in the overview, never guessed into the picture.

INTERNAL: the user-facing door is /observatory (generate_observatory.py embeds
this renderer as the Seams tab). This CLI remains for debugging the one view.

Usage:
    python gravity/lib/generate_boundary.py [<project-path-or-alias>]
        [--theme aurora|daylight|sandstone|forest|slate] [--open]

Output: <project>/.gravity/observatory/<project>.seams.html (self-ignoring — regenerate).
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
from scan_project import scan_integration, trunc  # noqa: E402  (one scanner, many instruments)
from generate_cosmos import THEMES, panel_css  # noqa: E402  (one palette, many instruments)


# ---------------------------------------------------------------------------
# Scanner — lives in scripts/scan_project.py (scan_integration), shared with
# the observatory so the SPEC is parsed exactly one way. This wrapper only
# keeps the CLI's honest exit messages.
# ---------------------------------------------------------------------------
def scan(project: Path) -> dict:
    if not (project / ".gravity").is_dir():
        sys.exit(f"no .gravity/ in {project} — the boundary view needs a faceted "
                 "project (adopt with /adopt-gravity)")
    data = scan_integration(project)
    if data is None:
        sys.exit(f"no .gravity/integration/SPEC.md — author the integration domain "
                 f"first (/new-spec {project.name} integration, or /excavate for "
                 "a brownfield survey)")
    return data


# ---------------------------------------------------------------------------
# Layout — longest-path layering (cycle-tolerant), columns left → right.
# ---------------------------------------------------------------------------
def layout(data: dict) -> dict:
    nodes, seams = data["nodes"], data["seams"]
    preds: dict[int, set[int]] = {n["i"]: set() for n in nodes}
    indeg = {n["i"]: 0 for n in nodes}
    for e in seams:
        if e["s"] not in preds[e["t"]]:
            preds[e["t"]].add(e["s"])
            indeg[e["t"]] += 1
    order, queue = [], [n["i"] for n in nodes if indeg[n["i"]] == 0]
    remaining = dict(indeg)
    while queue:
        i = queue.pop(0)
        order.append(i)
        for e in seams:
            if e["s"] == i and e["t"] not in order:
                remaining[e["t"]] -= 1
                if remaining[e["t"]] == 0 and e["t"] not in queue:
                    queue.append(e["t"])
    order += [n["i"] for n in nodes if n["i"] not in order]   # cycle leftovers

    layer: dict[int, int] = {}
    for i in order:
        layer[i] = max([layer[p] + 1 for p in preds[i] if p in layer] + [0])
    n_layers = max(layer.values()) + 1 if layer else 1

    cols: list[list[int]] = [[] for _ in range(n_layers)]
    for i in order:
        cols[layer[i]].append(i)
    maxrows = max((len(c) for c in cols), default=1)

    for n in nodes:
        n["w"] = min(270, max(130, 9 * len(n["name"]) + 34))
        n["h"] = 56 if n["port"] else 44
    colw = [max((nodes[i]["w"] for i in c), default=130) for c in cols]

    margin, gap, slot = 70, 170, 116
    H = max(480, slot * maxrows + 150)
    x = margin
    for li, c in enumerate(cols):
        y0 = (H - slot * len(c)) / 2
        for k, i in enumerate(c):
            nodes[i]["x"] = x + (colw[li] - nodes[i]["w"]) / 2
            nodes[i]["y"] = y0 + k * slot + (slot - nodes[i]["h"]) / 2
            nodes[i]["layer"] = li
        x += colw[li] + gap
    W = x - gap + margin + 30
    return {"W": max(W, 760), "H": H}


# ---------------------------------------------------------------------------
# Renderer — one self-contained HTML instrument.
# ---------------------------------------------------------------------------
def render(data: dict, t: dict) -> str:
    esc = html_mod.escape
    dims = layout(data)
    nodes, seams = data["nodes"], data["seams"]
    W, H = dims["W"], dims["H"]
    accent, guard, ok = t["status"]["◑"], t["guard"], t["status"]["✓"]

    # --- seams (edges) ---
    edge_svg, pair_count = [], {}
    for ei, e in enumerate(seams):
        a, b = nodes[e["s"]], nodes[e["t"]]
        k = pair_count[(e["s"], e["t"])] = pair_count.get((e["s"], e["t"]), -1) + 1
        off = (k - 0.5 * (k > 0)) * 22 * (1 if k % 2 else -1) if k else 0
        forward = a["x"] <= b["x"]
        sx = a["x"] + (a["w"] if forward else 0)
        tx = b["x"] + (0 if forward else b["w"]) - (7 if forward else -7)
        sy, ty = a["y"] + a["h"] / 2 + off, b["y"] + b["h"] / 2 + off
        dx = max(60.0, abs(tx - sx) * 0.45)
        c1x, c2x = sx + (dx if forward else -dx), tx - (dx if forward else -dx)
        bow = off * 1.6 - (54 if not forward else 0)
        c1y, c2y = sy + bow, ty + bow
        path = f"M{sx:.0f},{sy:.0f} C{c1x:.0f},{c1y:.0f} {c2x:.0f},{c2y:.0f} {tx:.0f},{ty:.0f}"
        mx = (sx + 3 * c1x + 3 * c2x + tx) / 8
        my = (sy + 3 * c1y + 3 * c2y + ty) / 8

        cls = "seam open" if e["open"] else "seam"
        marker = "url(#arrOpen)" if e["open"] else "url(#arr)"
        pkts = ""
        if not e["open"]:
            dur = 4.5 + (ei % 3) * 1.3
            pkts = "".join(
                f'<circle r="2.5" class="pkt"><animateMotion dur="{dur}s" '
                f'begin="{-(j * dur / 2):.1f}s" repeatCount="indefinite">'
                f'<mpath href="#p{ei}"/></animateMotion></circle>' for j in range(2))
        badge = (f'<text x="{mx:.0f}" y="{my - 20:.0f}" class="openlbl">OPEN</text>'
                 if e["open"] else "")
        lbl = trunc(e["crosses"], 30)
        edge_svg.append(
            f'<g class="{cls}" data-i="{ei}" data-s="{e["s"]}" data-t="{e["t"]}">'
            f'<path id="p{ei}" class="wire" d="{path}" marker-end="{marker}"/>'
            f'<path class="hit" d="{path}"/>{pkts}'
            f'<text x="{mx:.0f}" y="{my - 7:.0f}" class="elbl">{esc(lbl)}</text>{badge}</g>')

    # --- nodes ---
    node_svg = []
    for n in nodes:
        sub = (f'<text x="{n["w"] / 2:.0f}" y="{n["h"] - 12:.0f}" class="sub">'
               f'{esc(trunc(n["port"]["url"], 34))}</text>') if n["port"] else ""
        name_y = 24 if n["port"] else n["h"] / 2 + 4.5
        node_svg.append(
            f'<g class="node" data-n="{n["i"]}" transform="translate({n["x"]:.0f},{n["y"]:.0f})">'
            f'<rect width="{n["w"]}" height="{n["h"]}" rx="10"/>'
            f'<text x="{n["w"] / 2:.0f}" y="{name_y:.0f}" class="name">{esc(n["name"])}</text>'
            f'{sub}</g>')

    stars = "".join(
        f'<circle cx="{(i * 263) % W}" cy="{(i * 389) % H}" r="{0.6 + (i % 3) * 0.5}" '
        f'class="bgstar" style="animation-delay:{(i % 7) * 0.9}s"/>' for i in range(70))

    # --- panel cards ---
    n_open = sum(1 for e in seams if e["open"])
    n_walls = sum(1 for r in data["rules"] if r["kind"] == "wall")
    tagc = {"wall": ok, "judgment": t["sat"], "guidance": t["dim"]}
    rules_html = "".join(
        f'<div class="rule"><span class="tag" style="color:{tagc[r["kind"]]}">'
        f'[{esc(r["tag"])}]</span> {esc(trunc(r["text"], 120))}</div>'
        for r in data["rules"])
    order_html = ("<ol class='co'>" + "".join(
        f"<li>{esc(trunc(s, 100))}</li>" for s in data["order"]) + "</ol>"
        if data["order"] else "")
    gotchas_html = "".join(f'<div class="got">⚠ {esc(g)}</div>' for g in data["gotchas"])
    ports_ctx_html = "".join(
        f'<div class="got" style="color:var(--dim)">◌ {esc(p["service"])} — '
        f'{esc(trunc(p["url"] + (" · " + p["notes"] if p["notes"] else ""), 90))}</div>'
        for p in data["ports_ctx"])
    unparsed_html = "".join(
        f'<div class="ng">unparsed row (fix the SPEC): {esc(trunc(u, 90))}</div>'
        for u in data["unparsed"])
    gate_html = (f'<div class="spine">gate — <span style="font-family:monospace">'
                 f'{esc(trunc(data["gate"], 160))}</span></div>' if data["gate"] else
                 '<div class="ng">no Gate line found in the SPEC</div>')

    cards = [
        f'<div class="card on" id="card-ov">'
        f'<div class="card-h"><span class="dot" style="background:{accent}"></span>'
        f'<code>integration</code><span class="st">the boundary contract</span></div>'
        f'<div class="why">{esc(trunc(data["lede"], 300))}</div>'
        f'{gate_html}{unparsed_html}'
        + (f'<div class="sect">Change Order</div>{order_html}' if order_html else "")
        + (f'<div class="sect">Rules — {n_walls} wall{"s" if n_walls != 1 else ""} of '
           f'{len(data["rules"])}</div>{rules_html}' if data["rules"] else "")
        + (f'<div class="sect">Gotchas</div>{gotchas_html}' if gotchas_html else "")
        + (f'<div class="sect">Context services</div>{ports_ctx_html}' if ports_ctx_html else "")
        + f'<div class="path">{esc(data["spec_rel"])}</div></div>']

    for ei, e in enumerate(seams):
        color = guard if e["open"] else accent
        openline = ('<div class="ng">OPEN — unknown seam: resolve it in the SPEC, '
                    'never guess it</div>' if e["open"] else "")
        chips = "".join(f'<span class="chip" style="font-family:monospace">'
                        f'{esc(trunc(c, 34))}</span>' for c in e["evidence"])
        cards.append(
            f'<div class="card" id="card-e{ei}">'
            f'<div class="card-h"><span class="dot" style="background:{color}"></span>'
            f'<code>{esc(trunc(e["label"], 44))}</code><span class="st">seam · row {e["row"]}</span></div>'
            f'{openline}<div class="why">{esc(e["crosses"])}</div>'
            f'<div class="spine">{esc(e["transport"])}</div>'
            + (f'<div class="chips">{chips}</div>' if chips else "")
            + f'<div class="path">{esc(data["spec_rel"])} · Boundary Map row {e["row"]}</div></div>')

    for n in nodes:
        port = ""
        if n["port"]:
            p = n["port"]
            port = (f'<div class="spine" style="font-family:monospace">{esc(p["url"])}</div>'
                    + (f'<div class="spine">{esc(trunc(p["notes"], 140))}</div>' if p["notes"] else ""))
        cards.append(
            f'<div class="card" id="card-n{n["i"]}">'
            f'<div class="card-h"><span class="dot" style="background:{t["ring"]}"></span>'
            f'<code>{esc(n["name"])}</code><span class="st">part</span></div>'
            f'{port}<div class="orb">{n["ins"]} seam{"s" if n["ins"] != 1 else ""} in · '
            f'{n["outs"]} out</div></div>')

    panel = f"""<aside id="panel">
  <h1>{esc(data["project"])} — boundaries</h1>
  <div class="goal">{esc(trunc(data["lede"], 200))}</div>
  <div class="census"><b>{len(nodes)}</b> parts · <b>{len(seams)}</b> seams
    {f'(<b style="color:{guard}">{n_open} OPEN</b>)' if n_open else ""} ·
    <b>{n_walls}</b>/<b>{len(data["rules"])}</b> rules are walls</div>
  <div id="hint">Packets flow in the seam's direction; a dashed red seam is an
    <b>OPEN</b> unknown. Click a seam or a part for its readout.</div>
  {"".join(cards)}
</aside>"""

    legend = (f'<span>▭ part</span><span>— seam (packets = direction)</span>'
              f'<span style="color:{guard}">┄ OPEN unknown</span>'
              f'<span style="color:{ok}">walls = enforced rules</span>'
              f'<span>hover holds · click reads</span>')

    payload = json.dumps([{"s": e["s"], "t": e["t"]} for e in seams])
    return f"""<!doctype html><html lang="en"><meta charset="utf-8">
<title>{esc(data["project"])} — gravity boundaries</title>
<style>{panel_css(t)}
  body {{ margin:0; display:flex; height:100vh; overflow:hidden; color:var(--ink);
    background:radial-gradient(1100px 700px at 40% 40%, {t["bg2"]} 0%, var(--bg) 62%);
    font:14px/1.5 "Segoe UI",system-ui,sans-serif }}
  #view {{ flex:1; position:relative }}
  #map {{ width:100%; height:100% }}
  .bgstar {{ fill:{t["bgstar"]}; opacity:.3; animation:twinkle 5s ease-in-out infinite }}
  @keyframes twinkle {{ 50% {{ opacity:.06 }} }}
  .node rect {{ fill:{t["card"]}; stroke:{t["line"]}; stroke-width:1.2;
    transition:filter .2s, stroke .2s; cursor:pointer }}
  .node:hover rect, .node.hl rect {{ stroke:{accent};
    filter:drop-shadow(0 0 10px {accent}66) }}
  .node .name {{ fill:var(--ink); font-size:13px; font-weight:600; text-anchor:middle;
    pointer-events:none }}
  .node .sub {{ fill:var(--dim); font-size:10px; font-family:monospace;
    text-anchor:middle; pointer-events:none }}
  .seam .wire {{ fill:none; stroke:{t["status"]["○"]}; stroke-width:1.6;
    transition:stroke .2s }}
  .seam .hit {{ fill:none; stroke:transparent; stroke-width:16; cursor:pointer }}
  .seam:hover .wire, .seam.hl .wire {{ stroke:{accent};
    filter:drop-shadow(0 0 6px {accent}) }}
  .seam .elbl {{ fill:var(--dim); font-size:10.5px; text-anchor:middle;
    pointer-events:none }}
  .seam:hover .elbl {{ fill:var(--ink) }}
  .seam.open .wire {{ stroke:{guard}; stroke-dasharray:7 6;
    animation:openpulse 2.1s ease-in-out infinite }}
  @keyframes openpulse {{ 50% {{ opacity:.35 }} }}
  .openlbl {{ fill:{guard}; font-size:10px; font-weight:700; letter-spacing:1.5px;
    text-anchor:middle }}
  .pkt {{ fill:{t["sat"]}; opacity:.9; pointer-events:none }}
  .sect {{ font-size:11px; letter-spacing:1px; text-transform:uppercase;
    color:var(--dim); margin:12px 0 5px; border-bottom:1px solid var(--line);
    padding-bottom:3px }}
  .rule {{ font-size:12px; margin-bottom:5px }}
  .rule .tag {{ font-family:monospace; font-size:11px }}
  .co {{ font-size:12px; color:var(--ink); margin:4px 0 4px 18px; padding:0 }}
  .co li {{ margin-bottom:4px }}
  .got {{ font-size:12px; color:{t["sat"]}; margin-bottom:4px }}
  #card-ov.on ~ #hint {{ display:block }}
</style>
<div id="view">
<svg id="map" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <marker id="arr" viewBox="0 0 10 8" refX="8" refY="4" markerWidth="9"
      markerHeight="7" orient="auto"><path d="M0,0 L10,4 L0,8 z"
      fill="{t["status"]["○"]}"/></marker>
    <marker id="arrOpen" viewBox="0 0 10 8" refX="8" refY="4" markerWidth="9"
      markerHeight="7" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="{guard}"/></marker>
  </defs>
  {stars}{"".join(edge_svg)}{"".join(node_svg)}
</svg>
<div id="legend">{legend}</div>
</div>
{panel}
<script>
  const SEAMS = {payload};
  const show = id => {{
    document.querySelectorAll('.card').forEach(c => c.classList.remove('on'));
    document.getElementById('hint').style.display = 'none';
    document.getElementById(id).classList.add('on');
  }};
  const nodeEl = i => document.querySelector('.node[data-n="' + i + '"]');
  document.querySelectorAll('.seam').forEach(g => {{
    const s = +g.dataset.s, t = +g.dataset.t;
    g.addEventListener('click', () => show('card-e' + g.dataset.i));
    g.addEventListener('mouseenter', () => {{ nodeEl(s).classList.add('hl');
      nodeEl(t).classList.add('hl'); }});
    g.addEventListener('mouseleave', () => {{ nodeEl(s).classList.remove('hl');
      nodeEl(t).classList.remove('hl'); }});
  }});
  document.querySelectorAll('.node').forEach(g => {{
    const n = +g.dataset.n;
    g.addEventListener('click', () => show('card-n' + n));
    g.addEventListener('mouseenter', () => SEAMS.forEach((e, i) => {{
      if (e.s === n || e.t === n)
        document.querySelector('.seam[data-i="' + i + '"]').classList.add('hl');
    }}));
    g.addEventListener('mouseleave', () => document.querySelectorAll('.seam.hl')
      .forEach(el => el.classList.remove('hl')));
  }});
</script>
</html>"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    for stream in (sys.stdout, sys.stderr):                 # Windows consoles choke on · / →
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(
        description="Render a project's integration Boundary Map as a seam graph.")
    ap.add_argument("project", nargs="?", help="project path, or a name/alias when run from the workspace (default: the project this lib belongs to)")
    ap.add_argument("--theme", choices=sorted(THEMES), default="aurora")
    ap.add_argument("--open", action="store_true", help="open the result in the browser")
    args = ap.parse_args()

    name, path = resolve_target(args.project)
    data = scan(path)
    out = observatory_dir(path) / f"{name}.seams.html"
    out.write_text(render(data, THEMES[args.theme]), encoding="utf-8")

    n_open = sum(1 for e in data["seams"] if e["open"])
    note = f" · {n_open} OPEN" if n_open else ""
    warn = f" · {len(data['unparsed'])} UNPARSED row(s) — fix the SPEC" if data["unparsed"] else ""
    print(f"boundary[{args.theme}]: {len(data['nodes'])} parts, "
          f"{len(data['seams'])} seams{note}{warn} -> {out}")
    if args.open:
        webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
