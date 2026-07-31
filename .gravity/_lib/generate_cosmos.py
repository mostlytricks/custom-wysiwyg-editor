#!/usr/bin/env python3
"""
generate_cosmos.py — render a project's .gravity/ as a star system (the cosmos view).

The conceptual map of one project, complementing the tabular dashboard:

    Star   = MISSION (the why — everything orbits it)
    Planet = domain (.gravity/<domain>/), size = doc mass
    Ring   = SPEC.md (the walls)         Moon = ARCHITECTURE.html (human how)
    Satellites = PLAN.*.md (intent in transit)
    Orbit distance = status (◑ active inner · ✓ stable mid · ○ planned outer)
    Orbit period = distance, by Kepler's third law (the inner band runs fastest)

Everything is scanned live from the same four registry owners /triage checks:
the .gravity/ folder list, the IMPLEMENTATION_PLAN.md status spine, and
MISSION.html's per-domain rows. No hand-kept data; if the cosmos looks wrong,
the indexes are wrong (run /triage).

One renderer, one scanner: the 3D canvas system (hand-rolled perspective —
coupling arcs, track arcs, health rings, unfenced-domain pulses, comet
trails), embedded by the observatory as the Orbit 3D tab. Single
self-contained local HTML — no libraries, no CDN, no build step. (The 2D
SVG renderer was removed 2026-07-25 with the Domains tab; git history keeps it.)

INTERNAL: the user-facing door is /observatory (generate_observatory.py embeds
render_3d as the Orbit 3D tab). This CLI remains for debugging the view alone.

Usage:
    python gravity/lib/generate_cosmos.py [<project-path-or-alias>]
        [--theme aurora|daylight|sandstone|forest|slate] [--open]
    python gravity/lib/generate_cosmos.py --list-themes

Output: <project>/.gravity/_observatory/<project>.3d.html (self-ignoring — regenerate).
"""
from __future__ import annotations

import argparse
import html as html_mod
import json
import math
import sys
import webbrowser
from pathlib import Path

# Siblings in this same lib/ — whether it sits in the gravity distribution or
# installed at <project>/.gravity/_lib/. No workspace path is ever assumed.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_arg import observatory_dir, resolve_target  # noqa: E402
from scan_project import (  # noqa: E402  (one scanner, many instruments)
    scan_couplings, scan_domains as scan, scan_spec_census, scan_tracks,
)

STATUS_ORDER = {"◑": 0, "✓": 1, "○": 2}
STATUS_LABEL = {"◑": "active", "✓": "stable", "○": "planned"}

# ---------------------------------------------------------------------------
# Themes — every color either renderer uses. The five palettes ARE the
# dashboard's theme family (generate_dashboard.py / DESIGN.dashboard.md):
# aurora (default, navy+cyan) · daylight (light, blue) · sandstone (warm
# light, amber) · forest (dark green) · slate (mono gray). One family, one
# localStorage key (`dash-theme`) across dashboard, docs, and observatory.
# The two light themes render instruments as a "paper chart": dark ink and
# star cores on a pale canvas instead of glows on black.
THEMES: dict[str, dict] = {
    "aurora": {  # deep navy · cyan star · the dashboard default
        "bg": "#0A0E1A", "bg2": "#141d36", "panel": "#0e1526", "card": "#111a2e",
        "line": "#223050", "ink": "#F3F4F6", "dim": "#9CA3AF",
        "star": ["#eafeff", "#00F2FE", "#0e4a66"],
        "star_glow": "#00F2FE", "star_label": "#063a4a",
        "status": {"◑": "#00E5E8", "✓": "#34D399", "○": "#566175"},
        "grad": {"◑": ["#d8fbff", "#0891b2"], "✓": ["#d1fae5", "#059669"],
                 "○": ["#94a3b8", "#334155"]},
        "sat": "#67e8f9", "ring": "#c9d6f2", "moon": "#b8c6e6",
        "bgstar": "#cbd5e1", "guard": "#e17a95",
    },
    "daylight": {  # light · blue-violet ink · paper-chart instruments
        "bg": "#F7F9FC", "bg2": "#e9effc", "panel": "#ffffff", "card": "#ffffff",
        "line": "#d8deea", "ink": "#1E293B", "dim": "#64748B",
        "star": ["#1e3a8a", "#2563EB", "#c7d7fb"],
        "star_glow": "#2563EB", "star_label": "#eef2ff",
        "status": {"◑": "#2563EB", "✓": "#059669", "○": "#94a3b8"},
        "grad": {"◑": ["#1d4ed8", "#93c5fd"], "✓": ["#047857", "#86efac"],
                 "○": ["#64748b", "#cbd5e1"]},
        "sat": "#4F46E5", "ring": "#64748B", "moon": "#7C3AED",
        "bgstar": "#94a3b8", "guard": "#DC2626",
    },
    "sandstone": {  # warm light · amber ink · paper-chart instruments
        "bg": "#FBF6EF", "bg2": "#f6ead6", "panel": "#FFFDFA", "card": "#fffcf7",
        "line": "#e2d3bd", "ink": "#3D2E22", "dim": "#8C7A66",
        "star": ["#7c2d12", "#D97706", "#f6dcb2"],
        "star_glow": "#D97706", "star_label": "#fff7ed",
        "status": {"◑": "#D97706", "✓": "#15803d", "○": "#a8988a"},
        "grad": {"◑": ["#b45309", "#fcd34d"], "✓": ["#3f6212", "#bef264"],
                 "○": ["#78716c", "#e7e5e4"]},
        "sat": "#C2410C", "ring": "#8C7A66", "moon": "#B45309",
        "bgstar": "#c9b8a2", "guard": "#BE123C",
    },
    "forest": {  # deep green · emerald star · lime activity
        "bg": "#0C1A14", "bg2": "#163024", "panel": "#0f231b", "card": "#122921",
        "line": "#24443a", "ink": "#E8F2EC", "dim": "#8BA89A",
        "star": ["#f0fdf4", "#34D399", "#065f46"],
        "star_glow": "#34D399", "star_label": "#022c22",
        "status": {"◑": "#A3E635", "✓": "#34D399", "○": "#52705f"},
        "grad": {"◑": ["#f7fee7", "#65a30d"], "✓": ["#d1fae5", "#059669"],
                 "○": ["#8fb8a8", "#2e4a3f"]},
        "sat": "#a3e635", "ring": "#c6ead9", "moon": "#a8cfc0",
        "bgstar": "#cdeadd", "guard": "#e08a8a",
    },
    "slate": {  # mono gray — screenshots and quiet moods (was "void")
        "bg": "#16181D", "bg2": "#23262e", "panel": "#1b1e24", "card": "#20242b",
        "line": "#34383f", "ink": "#E5E7EB", "dim": "#9499A3",
        "star": ["#ffffff", "#CBD5E1", "#475569"],
        "star_glow": "#CBD5E1", "star_label": "#1e293b",
        "status": {"◑": "#CBD5E1", "✓": "#94A3B8", "○": "#4b5563"},
        "grad": {"◑": ["#ffffff", "#8b93a3"], "✓": ["#d8dde5", "#5b6472"],
                 "○": ["#9499A3", "#33363e"]},
        "sat": "#d5d9e0", "ring": "#b5bcc7", "moon": "#9aa2ad",
        "bgstar": "#d5d9e0", "guard": "#c98b8b",
    },
}


# ---------------------------------------------------------------------------
# Scanner — lives in gravity/lib/scan_project.py (scan_domains), shared with
# the boundary and observatory instruments so the docs are parsed one way.
# ---------------------------------------------------------------------------
def _luminance(token: str) -> float:
    """Perceived luminance 0..1 of a `#rrggbb` theme token."""
    h = token.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _mix(a: str, b: str, w: float) -> str:
    """Blend two `#rrggbb` tokens — w=0 yields a, w=1 yields b."""
    ah, bh = a.lstrip("#"), b.lstrip("#")
    ch = [round(int(ah[i:i + 2], 16)
                + (int(bh[i:i + 2], 16) - int(ah[i:i + 2], 16)) * w)
          for i in (0, 2, 4)]
    return "#{:02x}{:02x}{:02x}".format(*ch)


def sky(t: dict) -> dict:
    """The cosmic layer's colours, DERIVED from the theme's own tokens.

    Nothing new enters THEMES on purpose: the five palettes are one family
    shared with the dashboard and the browser-read HTML docs under a single
    `dash-theme` key (DESIGN.dashboard.md — never a second family or key), so
    retuning a palette to suit the sky would silently restyle those surfaces
    too. The sky instead tints itself from what each theme already declares.

    Light themes stay the documented "paper chart": no glow, ink-dark stars, a
    faint wash instead of nebulae — an engraved celestial atlas rather than a
    washed-out attempt at deep space, which a pale canvas can never be.

    They also get a **muted ground**: paper white is right for a document you
    read and glaring for a star chart, so the canvas (and only the canvas —
    never the panel, the dashboard or the HTML docs) sits on the theme's `bg`
    pulled most of the way toward its own `line` token. Derived, not hardcoded,
    so a retuned palette carries its sky with it.
    """
    def distinct(*tokens: str) -> list[str]:
        """First-wins dedupe — several themes alias one colour to two roles
        (slate's `sat` is its `bgstar`), and a repeated tint just flattens the
        variety this layer exists to create."""
        out: list[str] = []
        for tok in tokens:
            if tok and tok.lower() not in {o.lower() for o in out}:
                out.append(tok)
        return out

    light = _luminance(t["bg"]) > 0.5
    return {
        "light": light,
        # the canvas ground — muted for light themes, untouched for dark ones
        "ground": _mix(t["bg"], t["line"], GROUND_MUTE) if light else t["bg"],
        "ground2": (_mix(t["bg2"], t["line"], GROUND_MUTE * 0.69) if light
                    else t["bg2"]),
        # what the vignette deepens toward (a light theme's own bg is too pale
        # to read as an edge at all)
        "vig": _mix(t["line"], t["dim"], 0.5) if light else t["bg"],
        # a magnitude-varied field instead of one flat colour
        "tints": distinct(t["bgstar"], t["star"][0], t["star_glow"],
                          t["sat"], t["moon"], t["ring"]),
        # nebula blobs — the theme's own accents at very low alpha. Reaching
        # past ◑ to ✓ buys a second hue, so a cloud bank reads as depth
        # rather than one flat accent smeared across the sky.
        "neb": distinct(t["star_glow"], t["status"]["✓"], t["moon"],
                        t["sat"], t["status"]["◑"])[:3],
    }


# How far a LIGHT theme's canvas is pulled off paper-white, toward its own
# `line` token. 0.0 = untouched paper (glaring under a star field), 1.0 = the
# rule colour itself. The one number to turn if the pale themes still read too
# bright — nothing else in the sky depends on it.
GROUND_MUTE = 0.8

R0, P0 = 150, 22        # the innermost orbit — radius in px, period in seconds


def prepare(data: dict) -> list[dict]:
    """Sort by status (active in, planned out) and compute the orbit physics."""
    doms = sorted(data["domains"],
                  key=lambda d: (STATUS_ORDER[d["status"]], d["name"]))
    for i, d in enumerate(doms):
        mass = len(d["files"])
        # `work` is the composite heat index. It is PRINTED as a number in the
        # card, never rendered as speed: each of its inputs already owns a
        # visual channel (mass -> size, PLANs -> satellites, status -> radius
        # + color, recency -> comet trail), so encoding it again in motion said
        # nothing new and actively misled — the eye reads *tangential* speed
        # (r/period), which made a far-out ○ domain look hotter than the
        # innermost ◑ one.
        work = 3 * len(d["plans"]) + mass
        if d["status"] == "◑":
            work *= 1.6                      # actively-worked domains run hot
        work *= 1 + max(0.0, (21 - d["age_days"]) / 21)  # touched lately = hotter
        r = R0 + i * 42
        d.update(
            r=r, ang0=(i * 137.508 + 210) % 360,
            size=9 + min(mass, 8) * 1.6, mass=mass, work=round(work, 1),
            # Kepler's third law, P² ∝ a³ — so orbits never cross and the inner
            # (active) band genuinely runs fastest. Status sets the distance;
            # the distance alone sets the speed.
            period=round(P0 * (r / R0) ** 1.5),
        )
    return doms


# ---------------------------------------------------------------------------
# Shared HTML pieces (panel + cards, used by the 3D renderer)
# ---------------------------------------------------------------------------
def panel_css(t: dict) -> str:
    return f"""
  :root {{ --bg:{t["bg"]}; --ink:{t["ink"]}; --dim:{t["dim"]}; --line:{t["line"]}; }}
  * {{ box-sizing:border-box }}
  #panel {{ width:340px; border-left:1px solid var(--line); padding:18px 20px;
    overflow-y:auto; background:{t["panel"]} }}
  #panel h1 {{ font-size:15px; margin:0 0 2px }}
  .goal {{ color:var(--dim); font-size:12.5px; margin-bottom:14px }}
  .census {{ font-size:12px; color:var(--dim); margin-bottom:14px }}
  .census b {{ color:var(--ink) }}
  .card {{ display:none; border:1px solid var(--line); border-radius:10px;
    padding:12px 14px; margin-bottom:12px; background:{t["card"]} }}
  .card.on {{ display:block; animation:fadein .25s }}
  @keyframes fadein {{ from {{ opacity:0; transform:translateY(4px) }} }}
  .card-h {{ display:flex; align-items:center; gap:8px; margin-bottom:8px }}
  .card-h code {{ font-size:14px; font-weight:700 }}
  .dot {{ width:10px; height:10px; border-radius:50% }}
  .st {{ margin-left:auto; font-size:11.5px; color:var(--dim) }}
  .why {{ font-size:13px; margin-bottom:6px }}
  .ng {{ font-size:12px; color:{t["guard"]}; margin-bottom:6px }}
  .spine {{ font-size:12px; color:var(--dim); margin-bottom:8px }}
  .chips {{ display:flex; flex-wrap:wrap; gap:5px }}
  .chip {{ font-size:11px; padding:2px 8px; border-radius:20px; border:1px solid var(--line) }}
  .chip-spec {{ color:{t["ring"]} }} .chip-arch {{ color:{t["moon"]} }}
  .chip-plan {{ color:{t["sat"]} }} .chip-none {{ color:#666 }}
  .orb {{ font-size:11.5px; color:var(--dim); margin-top:8px }}
  .path {{ font-family:monospace; font-size:11px; color:#556; margin-top:8px }}
  #hint {{ color:var(--dim); font-size:12.5px }}
  #legend {{ position:absolute; left:16px; bottom:12px; font-size:11.5px;
    color:var(--dim); background:{t["panel"]}cc; border:1px solid var(--line);
    border-radius:8px; padding:8px 12px }}
  #legend span {{ margin-right:14px }}"""


def cards_html(doms: list[dict], data: dict, t: dict) -> tuple[str, str]:
    esc = html_mod.escape
    census = {c["domain"]: c for c in data.get("specs", [])}
    links = data.get("links", [])
    cards = []
    for i, d in enumerate(doms):
        docs = []
        if d["spec"]:
            docs.append('<span class="chip chip-spec">⊚ SPEC — the walls</span>')
        if d["arch"]:
            docs.append('<span class="chip chip-arch">☾ ARCHITECTURE — the how</span>')
        for p in d["plans"]:
            docs.append(f'<span class="chip chip-plan">· {esc(p)}</span>')
        if not docs:
            docs.append('<span class="chip chip-none">docs pending</span>')
        why = esc(d["why"]) or "<em>no MISSION row — unwired? (/triage would flag)</em>"
        ng = f'<div class="ng">guard — {esc(d["nongoal"])}</div>' if d["nongoal"] else ""
        spine = f'<div class="spine">{esc(d["spine"][:400])}</div>' if d["spine"] else ""
        touched = ("today" if d["age_days"] < 1 else
                   f'{d["age_days"]:.0f}d ago' if d["age_days"] < 900 else "long ago")
        c = census.get(d["name"])
        if c and c["has_spec"] and c["rules"]["total"]:
            r = c["rules"]
            health = (f'<div class="orb">⊚ contract: <b>{r["wall"]}</b> wall'
                      f'{"s" if r["wall"] != 1 else ""} · {r["judgment"]} judgment · '
                      f'{r["guidance"]} guidance · gate {"✓" if c["gate"] else "—"}</div>')
        elif c and c["has_spec"]:
            health = '<div class="orb">⊚ SPEC present · no parsed rules</div>'
        elif d["status"] == "◑":
            health = '<div class="ng">unfenced — active domain with no SPEC</div>'
        else:
            health = ""
        mine = sorted(((l["b"] if l["a"] == d["name"] else l["a"], l["refs"])
                       for l in links if d["name"] in (l["a"], l["b"])),
                      key=lambda x: -x[1])
        coupled = ('<div class="orb">↔ coupled: '
                   + " · ".join(f"{esc(n)} ×{k}" for n, k in mine[:4])
                   + "</div>") if mine else ""
        carrying = [tr["name"] for tr in data.get("tracks", [])
                    if d["name"] in tr["domains"]]
        on_track = ('<div class="orb">⟡ carrying: '
                    + " · ".join(esc(n) for n in carrying)
                    + "</div>") if carrying else ""
        cards.append(
            f'<div class="card" id="card-{i}">'
            f'<div class="card-h"><span class="dot" style="background:{t["status"][d["status"]]}"></span>'
            f'<code>{esc(d["name"])}</code><span class="st">{d["status"]} {STATUS_LABEL[d["status"]]}</span></div>'
            f'<div class="why">{why}</div>{ng}{spine}'
            f'<div class="chips">{"".join(docs)}</div>{health}{coupled}{on_track}'
            f'<div class="orb">orbital period {d["period"]}s · activity {d["work"]} · touched {touched}</div>'
            f'<div class="path">.gravity/{esc(d["name"])}/</div></div>')

    panel = f"""<aside id="panel">
  <h1>{esc(data["title"])}</h1>
  <div class="goal">{esc(data["goal"][:220])}</div>
  <div class="census"><b>{len(doms)}</b> domains ·
    <b>{sum(1 for d in doms if d["spec"])}</b> ringed (SPEC) ·
    <b>{sum(len(d["plans"]) for d in doms)}</b> PLAN satellites in transit</div>
  <div id="hint">HINT_TEXT</div>
  <div class="card" id="card-sun">
    <div class="card-h"><span class="dot" style="background:{t["star"][1]}"></span>
    <code>MISSION</code><span class="st">☀ the center of gravity</span></div>
    <div class="why">{esc(data["goal"][:300])}</div>
    <div class="path">.gravity/MISSION.html</div></div>
  {"".join(cards)}
</aside>"""

    counts = {s: sum(1 for d in doms if d["status"] == s) for s in "◑✓○"}
    legend = (f'<span>☀ mission</span><span>● domain (size = doc mass)</span>'
              f'<span>⊚ ring = SPEC</span><span>☾ moon = ARCHITECTURE</span>'
              f'<span>· sats = PLANs</span><span>inner orbits faster (Kepler)</span>'
              f'<span style="color:{t["status"]["◑"]}">◑ active {counts["◑"]}</span>'
              f'<span style="color:{t["status"]["✓"]}">✓ stable {counts["✓"]}</span>'
              f'<span style="color:{t["status"]["○"]}">○ planned {counts["○"]}</span>')
    return panel, legend


# ---------------------------------------------------------------------------
# 3D renderer — canvas + hand-rolled perspective (the orbitable observatory)
# ---------------------------------------------------------------------------
def render_3d(data: dict, t: dict) -> str:
    doms = prepare(data)
    census = {c["domain"]: c for c in data.get("specs", [])}

    def wall_frac(d: dict) -> float:
        c = census.get(d["name"])
        if not (d["spec"] and c and c["rules"]["total"]):
            return 0.0
        return c["rules"]["wall"] / c["rules"]["total"]

    payload = json.dumps([{
        "name": d["name"], "status": d["status"], "spec": d["spec"],
        "plans": len(d["plans"]), "arch": d["arch"],
        "r": d["r"], "ang0": d["ang0"], "size": d["size"], "period": d["period"],
        "wf": round(wall_frac(d), 3),
        "unfenced": d["status"] == "◑" and not d["spec"],
        "tail": d["age_days"] < 7,
    } for d in doms], ensure_ascii=False)
    idx = {d["name"]: i for i, d in enumerate(doms)}
    links_payload = json.dumps([
        {"a": idx[l["a"]], "b": idx[l["b"]], "w": l["refs"]}
        for l in data.get("links", []) if l["a"] in idx and l["b"] in idx],
        ensure_ascii=False)
    tracks = data.get("tracks", [])
    tracks_payload = json.dumps([
        {"name": tr["name"], "status": tr["status"] or "◑",
         "doms": [idx[x] for x in tr["domains"] if x in idx]}
        for tr in tracks], ensure_ascii=False)
    theme_js = json.dumps({
        "line": t["line"], "ink": t["ink"], "dim": t["dim"], "bg": t["bg"],
        "bg2": t["bg2"], "bgstar": t["bgstar"], "ring": t["ring"],
        "moon": t["moon"], "sat": t["sat"], "star": t["star"],
        "starGlow": t["star_glow"], "starLabel": t["star_label"],
        "status": t["status"], "grad": t["grad"], "guard": t["guard"],
        **sky(t),
    }, ensure_ascii=False)

    panel, legend = cards_html(doms, data, t)
    panel = panel.replace("HINT_TEXT", "Drag the sky to orbit, wheel to zoom. Hover "
                          "holds a planet — click it (or the star) for its readout.")
    legend += (f'<span>ring solid = walls share</span>'
               f'<span>⌒ arc = doc coupling</span>'
               + (f'<span style="color:{t["sat"]}">⟡ dashed arc = track (direction)</span>'
                  if tracks else '')
               + f'<span>trail = touched &lt;7d</span>'
               f'<span style="color:{t["guard"]}">pulse = unfenced ◑</span>'
               f'<span>drag = orbit camera · wheel = zoom</span>')
    esc = html_mod.escape
    return f"""<!doctype html><html lang="en"><meta charset="utf-8">
<title>{esc(data["project"])} — gravity cosmos 3D</title>
<style>{panel_css(t)}
  body {{ margin:0; display:flex; height:100vh; overflow:hidden; color:var(--ink);
    background:var(--bg); font:14px/1.5 "Segoe UI",system-ui,sans-serif }}
  #view {{ flex:1; position:relative; cursor:grab }}
  #view.dragging {{ cursor:grabbing }}
  canvas {{ display:block; width:100%; height:100% }}
  #legend {{ pointer-events:none }}
  #hud {{ position:absolute; left:16px; top:12px; font-size:11.5px; color:{t["dim"]};
    background:{t["panel"]}cc; border:1px solid {t["line"]}; border-radius:8px;
    padding:7px 12px; display:flex; gap:14px }}
  #hud label {{ cursor:pointer; user-select:none }}
  #hud input {{ vertical-align:-2px; margin-right:4px }}
</style>
<div id="view"><canvas id="c"></canvas>
<div id="hud"><label><input type="checkbox" id="cbArcs" checked>couplings</label>
{'<label><input type="checkbox" id="cbTracks" checked>tracks</label>' if tracks else ''}
<label><input type="checkbox" id="cbTails" checked>trails</label></div>
<div id="legend">{legend}</div></div>
{panel}
<script>
const DOMS = {payload};
const LINKS = {links_payload};
const TRACKS = {tracks_payload};
const T = {theme_js};
const cbArcs = document.getElementById('cbArcs');
const cbTracks = document.getElementById('cbTracks');
const cbTails = document.getElementById('cbTails');
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const view = document.getElementById('view');
let W, H, DPR = Math.min(devicePixelRatio || 1, 2);
function resize() {{
  W = view.clientWidth; H = view.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}}
resize(); addEventListener('resize', resize);

let yaw = 0.6, pitch = 0.42, dist = 980;
const F = 640;
let hover = -1, dragging = false, lastX = 0, lastY = 0, moved = 0;
let sunHit = {{ x: -999, y: -999, r: 0 }};

// The star field: a Fibonacci sphere, but magnitude- and tint-varied, with a
// third of it crowded into a Milky-Way band so the sky has structure instead
// of even speckle. Deterministic by index — the same project renders the same
// sky every time, which matters because the page is regenerated, not stored.
const N_STARS = 420;
const STARS = Array.from({{length: N_STARS}}, (_, i) => {{
  const a = i * 2.399963;
  let z = 1 - 2 * ((i + .5) / N_STARS);
  if (i % 3 === 0) z *= .22;                       // the band
  const r = Math.sqrt(Math.max(0, 1 - z * z)), R = 2600;
  const mag = ((i * 2654435761) % 1000) / 1000;    // stable pseudo-magnitude
  return {{ x: R*r*Math.cos(a), y: R*z*.6, z: R*r*Math.sin(a),
           s: .4 + mag * mag * 1.9, tw: i % 7,
           c: T.tints[i % T.tints.length], sp: mag > .93 }};
}});
// Nebulae — three distant clouds, parallaxing with the camera like the stars.
const NEB = [
  {{ x: -1700, y: -420, z:   900, r: 1500, c: T.neb[0] }},
  {{ x:  1500, y:  520, z: -1100, r: 1750, c: T.neb[1] }},
  {{ x:   200, y: -900, z: -1900, r: 1300, c: T.neb[2] }},
];
DOMS.forEach(d => d.ang = d.ang0 * Math.PI / 180);

function project(x, y, z) {{
  let cx =  x * Math.cos(yaw) + z * Math.sin(yaw);
  let cz = -x * Math.sin(yaw) + z * Math.cos(yaw);
  let cy =  y * Math.cos(pitch) - cz * Math.sin(pitch);
  cz     =  y * Math.sin(pitch) + cz * Math.cos(pitch) + dist;
  if (cz < 40) cz = 40;
  const s = F / cz;
  return {{ sx: W/2 + cx*s, sy: H/2 + cy*s, s, z: cz }};
}}

function planetGlyph(d, p, tms) {{
  const R = Math.max(2.5, d.size * p.s * 1.35);
  const depth = Math.max(.25, Math.min(1, 1.65 - p.z / 1100));
  if (d.tail && cbTails.checked) {{
    for (let k = 1; k <= 7; k++) {{
      const ta = d.ang - k * 0.055;
      const tp = project(d.r * Math.cos(ta), 0, d.r * Math.sin(ta));
      ctx.globalAlpha = depth * .32 * (1 - k / 8);
      ctx.fillStyle = T.status[d.status];
      ctx.beginPath();
      ctx.arc(tp.sx, tp.sy, Math.max(1, 2.4 * tp.s), 0, Math.PI * 2); ctx.fill();
    }}
  }}
  ctx.globalAlpha = depth;
  if (d.spec) {{
    // the ring is the contract: solid arc = walls share, dashed = judgment/guidance
    const rx = R * 1.95, ry = R * 1.95 * Math.abs(Math.sin(pitch)) * .62 + R * .14;
    const split = Math.PI * 2 * d.wf;
    ctx.strokeStyle = T.ring; ctx.lineWidth = 1.2; ctx.globalAlpha = depth * .75;
    if (split > 0.02) {{
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, -0.42, 0, split); ctx.stroke();
    }}
    if (split < Math.PI * 2 - 0.02) {{
      ctx.setLineDash([3, 4]); ctx.globalAlpha = depth * .45;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, -0.42, split, Math.PI * 2);
      ctx.stroke(); ctx.setLineDash([]);
    }}
    ctx.globalAlpha = depth;
  }}
  const g = ctx.createRadialGradient(p.sx - R*.35, p.sy - R*.35, R*.1, p.sx, p.sy, R);
  const cols = T.grad[d.status];
  g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  if (d.unfenced) {{
    const pulse = 8 + 5 * Math.sin(tms / 300 + d.r);   // faster, redder: risk
    ctx.shadowColor = T.guard; ctx.shadowBlur = pulse * p.s * 2;
  }} else if (d.status === '◑') {{
    const pulse = 6 + 4 * Math.sin(tms / 520 + d.r);
    ctx.shadowColor = T.status['◑']; ctx.shadowBlur = pulse * p.s * 2;
  }}
  if (hover === d.i) {{ ctx.shadowColor = T.status[d.status]; ctx.shadowBlur = 22; }}
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, R, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = T.status[d.status]; ctx.lineWidth = 1.2; ctx.stroke();
  if (d.arch) {{
    ctx.fillStyle = T.moon; ctx.beginPath();
    ctx.arc(p.sx + R + 8*p.s, p.sy - R - 3*p.s, Math.max(1.4, 3.2*p.s), 0, Math.PI*2); ctx.fill();
  }}
  for (let k = 0; k < d.plans; k++) {{
    const sa = tms/1400 + k * 2*Math.PI/Math.max(3, d.plans);
    ctx.fillStyle = T.sat; ctx.beginPath();
    ctx.arc(p.sx + (R+7)*Math.cos(sa), p.sy + (R+7)*Math.sin(sa)*.5, 1.8, 0, Math.PI*2); ctx.fill();
  }}
  ctx.fillStyle = hover === d.i ? T.ink : T.dim;
  ctx.font = '12px "Segoe UI",sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(d.name, p.sx, p.sy + R + 15);
  ctx.globalAlpha = 1;
  d.hx = p.sx; d.hy = p.sy; d.hr = Math.max(R + 6, 14);
}}

let last = performance.now();
function frame(tms) {{
  const dt = Math.min(50, tms - last); last = tms;
  if (!dragging) yaw += dt * 0.000045;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W*.4, H*.45, 60, W*.4, H*.45, Math.max(W,H)*.8);
  bg.addColorStop(0, T.ground2); bg.addColorStop(1, T.ground);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (const n of NEB) {{
    const p = project(n.x, n.y, n.z);
    if (p.z < 120) continue;
    const R = n.r * p.s;
    if (R < 3) continue;
    const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, R);
    g.addColorStop(0,   n.c + (T.light ? '10' : '2b'));
    g.addColorStop(.55, n.c + (T.light ? '07' : '12'));
    g.addColorStop(1,   n.c + '00');
    ctx.fillStyle = g; ctx.fillRect(p.sx - R, p.sy - R, R * 2, R * 2);
  }}
  for (const s of STARS) {{
    const p = project(s.x, s.y, s.z);
    if (p.z < 120) continue;                       // behind the camera
    const tw = .55 + .45 * Math.sin(tms / (1500 + s.tw * 240) + s.tw);
    ctx.globalAlpha = (T.light ? .42 : .62) * tw * (.3 + .7 * s.s / 2.3);
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, s.s * (T.light ? .8 : 1), 0, Math.PI*2); ctx.fill();
    if (s.sp) {{                                   // the brightest few flare
      ctx.globalAlpha *= T.light ? .3 : .45;
      ctx.strokeStyle = s.c; ctx.lineWidth = .7;
      const L = s.s * 3.6;
      ctx.beginPath();
      ctx.moveTo(p.sx - L, p.sy); ctx.lineTo(p.sx + L, p.sy);
      ctx.moveTo(p.sx, p.sy - L); ctx.lineTo(p.sx, p.sy + L); ctx.stroke();
    }}
  }}
  ctx.globalAlpha = 1;
  // Vignette BEFORE the system is drawn: it deepens the sky without dimming
  // the domains, which are the content.
  const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*.22,
                                      W/2, H/2, Math.max(W,H)*.78);
  vg.addColorStop(0, T.vig + '00');
  vg.addColorStop(1, T.vig + (T.light ? '66' : 'bb'));
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  for (const d of DOMS) {{
    ctx.strokeStyle = T.line; ctx.lineWidth = 1;
    if (d.status === '○') ctx.setLineDash([4, 7]);
    ctx.beginPath();
    for (let k = 0; k <= 90; k++) {{
      const a = k / 90 * 2 * Math.PI;
      const p = project(d.r * Math.cos(a), 0, d.r * Math.sin(a));
      k ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
    }}
    ctx.stroke(); ctx.setLineDash([]);
  }}

  const drawn = [];
  DOMS.forEach((d, i) => {{
    d.i = i;
    if (hover !== i) d.ang += dt/1000 * 2*Math.PI / d.period;
    drawn.push({{ d, p: project(d.r * Math.cos(d.ang), 0, d.r * Math.sin(d.ang)) }});
  }});
  drawn.push({{ sun: true, p: project(0, 0, 0) }});
  drawn.sort((a, b) => b.p.z - a.p.z);

  if (cbArcs.checked) for (const L of LINKS) {{
    const a = DOMS[L.a], b = DOMS[L.b];
    const A = project(a.r * Math.cos(a.ang), 0, a.r * Math.sin(a.ang));
    const B = project(b.r * Math.cos(b.ang), 0, b.r * Math.sin(b.ang));
    const M = project((a.r * Math.cos(a.ang) + b.r * Math.cos(b.ang)) / 2,
                      -70 - Math.min(90, L.w * 6),
                      (a.r * Math.sin(a.ang) + b.r * Math.sin(b.ang)) / 2);
    const hot = hover === L.a || hover === L.b;
    ctx.strokeStyle = hot ? T.status['◑'] : T.dim;
    ctx.globalAlpha = hot ? .85 : .18 + Math.min(.3, L.w * .03);
    ctx.lineWidth = 1 + Math.min(2.5, L.w * .18);
    ctx.beginPath(); ctx.moveTo(A.sx, A.sy);
    ctx.quadraticCurveTo(M.sx, M.sy, B.sx, B.sy); ctx.stroke();
    ctx.globalAlpha = 1;
  }}

  // track arcs — the direction axis: a dashed chain over the domains carrying
  // one cross-domain intent, higher than coupling arcs, labeled at the apex
  if (cbTracks && cbTracks.checked) for (const TR of TRACKS) {{
    if (TR.doms.length < 2) continue;
    const hot = TR.doms.includes(hover);
    const col = TR.status === '✓' ? T.status['✓'] : T.sat;
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = hot ? T.ink : col;
    ctx.lineWidth = hot ? 2 : 1.5;
    let apex = null;
    for (let k = 0; k + 1 < TR.doms.length; k++) {{
      const a = DOMS[TR.doms[k]], b = DOMS[TR.doms[k + 1]];
      const A = project(a.r * Math.cos(a.ang), 0, a.r * Math.sin(a.ang));
      const B = project(b.r * Math.cos(b.ang), 0, b.r * Math.sin(b.ang));
      const M = project((a.r * Math.cos(a.ang) + b.r * Math.cos(b.ang)) / 2,
                        -170,
                        (a.r * Math.sin(a.ang) + b.r * Math.sin(b.ang)) / 2);
      ctx.globalAlpha = hot ? .9 : .45;
      ctx.beginPath(); ctx.moveTo(A.sx, A.sy);
      ctx.quadraticCurveTo(M.sx, M.sy, B.sx, B.sy); ctx.stroke();
      if (k === (TR.doms.length - 2) >> 1) apex = M;
    }}
    ctx.setLineDash([]);
    if (apex) {{
      ctx.fillStyle = hot ? T.ink : col; ctx.globalAlpha = hot ? 1 : .7;
      ctx.font = '11px "Segoe UI",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⟡ ' + TR.name, apex.sx, apex.sy - 4);
    }}
    ctx.globalAlpha = 1;
  }}

  for (const it of drawn) {{
    if (it.sun) {{
      const R = 52 * it.p.s * 1.35, p = it.p;
      const corona = 1 + .09 * Math.sin(tms/900);
      ctx.shadowColor = T.starGlow; ctx.shadowBlur = 60 * it.p.s;
      const g = ctx.createRadialGradient(p.sx, p.sy, R*.1, p.sx, p.sy, R*corona);
      g.addColorStop(0, T.star[0]); g.addColorStop(.45, T.star[1]); g.addColorStop(1, T.star[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, R*corona, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = T.starLabel; ctx.font = 'bold 11px "Segoe UI",sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('MISSION', p.sx, p.sy + 4);
      sunHit = {{ x: p.sx, y: p.sy, r: R + 8 }};
    }} else planetGlyph(it.d, it.p, tms);
  }}
  requestAnimationFrame(frame);
}}
requestAnimationFrame(frame);

view.addEventListener('pointerdown', e => {{
  // The HUD sits INSIDE #view. Capturing the pointer here retargets the
  // following pointerup to #view, so the click resolves on #view and the
  // checkbox never toggles — which is why only the keyboard used to work.
  // Let the controls own their own clicks.
  if (e.target.closest('#hud')) return;
  dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  view.classList.add('dragging'); view.setPointerCapture(e.pointerId);
}});
view.addEventListener('pointermove', e => {{
  if (dragging) {{
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.005;
    pitch = Math.max(0.05, Math.min(1.35, pitch + dy * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  }} else {{
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    hover = -1;
    for (const d of DOMS)
      if (d.hx !== undefined && (mx-d.hx)**2 + (my-d.hy)**2 < d.hr**2) hover = d.i;
    view.style.cursor = (hover >= 0 || (mx-sunHit.x)**2 + (my-sunHit.y)**2 < sunHit.r**2)
      ? 'pointer' : 'grab';
  }}
}});
view.addEventListener('pointerup', e => {{
  view.classList.remove('dragging');
  if (dragging && moved < 6) {{
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if ((mx-sunHit.x)**2 + (my-sunHit.y)**2 < sunHit.r**2) show('card-sun');
    else if (hover >= 0) show('card-' + hover);
  }}
  dragging = false;
}});
view.addEventListener('wheel', e => {{
  e.preventDefault();
  dist = Math.max(380, Math.min(2200, dist * (1 + e.deltaY * 0.0012)));
}}, {{ passive: false }});

function show(id) {{
  document.querySelectorAll('.card').forEach(c => c.classList.remove('on'));
  document.getElementById('hint').style.display = 'none';
  document.getElementById(id).classList.add('on');
}}
</script>
</html>"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="Render a project's .gravity/ as a star system.")
    ap.add_argument("project", nargs="?", help="project path, or a name/alias when run from the workspace (default: the project this lib belongs to)")
    ap.add_argument("--theme", choices=sorted(THEMES), default="aurora")
    ap.add_argument("--open", action="store_true", help="open the result in the browser")
    ap.add_argument("--list-themes", action="store_true")
    args = ap.parse_args()

    if args.list_themes:
        for name, t in THEMES.items():
            print(f"{name:8} star {t['star'][1]} · active {t['status']['◑']} · bg {t['bg']}")
        return
    name, path = resolve_target(args.project)
    data = scan(path)
    data["specs"] = scan_spec_census(path)      # spec-health rings + card readouts
    data["links"] = scan_couplings(path)        # coupling arcs (3d) + card readouts
    data["tracks"] = scan_tracks(path)          # track arcs (3d) + card readouts
    theme = THEMES[args.theme]
    out = observatory_dir(path) / f"{name}.3d.html"
    out.write_text(render_3d(data, theme), encoding="utf-8")
    print(f"cosmos[{args.theme}]: {len(data['domains'])} domains -> {out}")
    if args.open:
        webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
