#!/usr/bin/env python3
"""
doc_theme.py — THE OWNER of the browser-read doc theme (MISSION.html,
ARCHITECTURE.html, and any hand-rolled gravity doc page).

Why this is code and not prose
------------------------------
It used to be prose: `docs/DESIGN.docs.md` carried a "full stylesheet" you were
meant to paste. Two things went wrong, both structural rather than careless.

1. The prose lived on the MANAGER side (`docs/`), but the templates it themed
   live on the PROTOCOL side (`gravity/templates/`) and travel into independent
   repos. Every generated doc carried the line "see docs/DESIGN.docs.md in the
   workspace" — a pointer that dangles in every clone, i.e. in exactly the place
   the doc is read. A theme nobody can reach is a theme nobody follows.
2. A pasted stylesheet cannot be re-themed. When the five-theme switcher landed,
   the tooling APPENDED an override block rather than replacing the original,
   so every doc grew two `:root` blocks — ~90 lines of dead tokens shadowed by
   the ones below them — and the prose still documented the dead half.

So the stylesheet became a function. This module lives in `gravity/lib/`, which
`install_lib.py` copies into `<project>/.gravity/_lib/`, so a clone that has
never seen this workspace can regenerate its own doc CSS. `DESIGN.docs.md` is
now the human explanation of what this file emits — it points here and holds no
stylesheet of its own.

Where the colours come from
---------------------------
Chrome hues (bg / ink / dim / h1 gradient) and status hues (live / ok / plan /
guard / sat) are read from `palette.py`, the declared anchor owner, so the docs
cannot drift from the observatory or the dashboard without `check.py theme`
failing. Everything else here — panel translucency, hairlines, blur radius,
ambient glow geometry — is docs-local by design: it is how a *reading* surface
differs from a *scanning* one, and nothing cross-checks it because nothing else
draws it.

The status tokens are emitted as `--st-live` / `--st-ok` / `--st-plan` /
`--st-guard` / `--st-sat`. The prefix is not decoration: the docs already had an
`--accent` meaning "link", and in forest/slate/sandstone that hue collides with
a different status hue. See STATUS_VOCABULARY in palette.py.

Usage
-----
    python doc_theme.py                 # emit the full <style> block
    python doc_theme.py --css           # emit just the CSS
    python doc_theme.py --parts         # emit head script / themebar / script
    python doc_theme.py --self-test     # verify the emitted CSS vs palette.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import palette  # noqa: E402

# ---------------------------------------------------------------------------
# Docs-local chrome. NOT anchors: these describe how a reading surface is built
# (translucent glass over an ambient wash), which the dashboard and the
# observatory deliberately do differently. Anchor hues are pulled from
# palette.py below and are never repeated here.
# ---------------------------------------------------------------------------
CHROME: dict[str, dict[str, str]] = {
    "aurora": {
        "panel": "rgba(17,24,43,0.70)", "panel-2": "rgba(26,36,64,0.80)",
        "bg2": "#141d36", "card": "#111a2e",
        "line": "rgba(255,255,255,0.08)",
        "text": "#CBD5E1", "faint": "#717a8c",
        "accent": "#00E5E8", "accent-d": "#4FACFE",
        "blue": "#4FACFE", "amber": "#FBBF24", "red": "#FF4D6D",
        "glow": "rgba(0,229,232,.85)", "hover-glow": "rgba(0,242,254,.15)",
        "shadow": "0 8px 32px rgba(0,0,0,.22)",
        "wash": ("rgba(0,242,254,.10)", "rgba(240,147,251,.08)",
                 "rgba(0,229,232,.06)"),
    },
    "daylight": {
        "panel": "rgba(255,255,255,0.85)", "panel-2": "#eef2f8",
        "bg2": "#e9effc", "card": "#ffffff",
        "line": "rgba(15,23,42,0.10)",
        "text": "#334155", "faint": "#94A3B8",
        "accent": "#2563EB", "accent-d": "#7C3AED",
        "blue": "#2563EB", "amber": "#B45309", "red": "#DC2626",
        "glow": "rgba(37,99,235,.35)", "hover-glow": "rgba(37,99,235,.16)",
        "shadow": "0 8px 24px rgba(15,23,42,.08)",
        "wash": ("rgba(37,99,235,.07)", "rgba(124,58,237,.06)",
                 "rgba(37,99,235,.05)"),
    },
    "sandstone": {
        "panel": "rgba(255,252,247,0.88)", "panel-2": "#f3ebdf",
        "bg2": "#f6ead6", "card": "#fffcf7",
        "line": "rgba(120,80,40,0.14)",
        "text": "#5C4A38", "faint": "#a8957f",
        "accent": "#C2410C", "accent-d": "#D97706",
        "blue": "#D97706", "amber": "#B45309", "red": "#DC2626",
        "glow": "rgba(217,119,6,.40)", "hover-glow": "rgba(194,65,12,.16)",
        "shadow": "0 8px 24px rgba(90,60,30,.10)",
        "wash": ("rgba(217,119,6,.10)", "rgba(194,65,12,.07)",
                 "rgba(180,83,9,.06)"),
    },
    "forest": {
        "panel": "rgba(18,38,30,0.70)", "panel-2": "rgba(26,52,42,0.82)",
        "bg2": "#163024", "card": "#122921",
        "line": "rgba(255,255,255,0.07)",
        "text": "#C5D8CE", "faint": "#6f897c",
        "accent": "#34D399", "accent-d": "#A3E635",
        "blue": "#10B981", "amber": "#FBBF24", "red": "#FB7185",
        "glow": "rgba(52,211,153,.70)", "hover-glow": "rgba(52,211,153,.16)",
        "shadow": "0 8px 32px rgba(0,0,0,.25)",
        "wash": ("rgba(52,211,153,.09)", "rgba(163,230,53,.06)",
                 "rgba(16,185,129,.06)"),
    },
    "slate": {
        "panel": "rgba(30,33,40,0.72)", "panel-2": "rgba(42,46,55,0.85)",
        "bg2": "#23262e", "card": "#20242b",
        "line": "rgba(255,255,255,0.08)",
        "text": "#C4C9D2", "faint": "#6e727b",
        "accent": "#94A3B8", "accent-d": "#CBD5E1",
        "blue": "#CBD5E1", "amber": "#FBBF24", "red": "#FB7185",
        "glow": "rgba(148,163,184,.60)", "hover-glow": "rgba(148,163,184,.16)",
        "shadow": "0 8px 32px rgba(0,0,0,.30)",
        "wash": ("rgba(148,163,184,.06)", "rgba(203,213,225,.05)",
                 "rgba(148,163,184,.04)"),
    },
}

# The swatch shown on each theme pill in the switcher.
SWATCH: dict[str, str] = {
    "aurora": "linear-gradient(135deg,#00F2FE,#F093FB)",
    "daylight": "linear-gradient(135deg,#60A5FA,#A78BFA)",
    "sandstone": "linear-gradient(135deg,#F59E0B,#C2410C)",
    "forest": "linear-gradient(135deg,#34D399,#A3E635)",
    "slate": "linear-gradient(135deg,#CBD5E1,#64748B)",
}

# Shared with the dashboard and the observatory, so a theme picked anywhere
# applies everywhere. Changing this key orphans every reader's saved choice.
STORAGE_KEY = "dash-theme"

MARKER = "gravity:doc-theme"


def _token_block(theme: str) -> str:
    """Every CSS custom property for one theme, as one declaration block.

    Anchors come from palette.py; chrome from CHROME. Emitted in a fixed shape
    (`html[data-theme="x"] { ... \\n  }`) because `check.py theme` parses it.
    """
    a = palette.anchors(theme)
    s = palette.status(theme)
    c = CHROME[theme]
    vocab = palette.STATUS_VOCABULARY["docs"]
    w1, w2, w3 = c["wash"]

    status_line = " ".join(f"--{vocab[k]}:{s[k]};" for k in palette.STATUS_KEYS)

    sel = ':root, html[data-theme="aurora"]' if theme == "aurora" \
        else f'html[data-theme="{theme}"]'
    return f"""  {sel} {{
    --bg:{a['bg']}; --bg2:{c['bg2']}; --panel:{c['panel']}; --panel-2:{c['panel-2']}; --card:{c['card']}; --line:{c['line']};
    --text-hi:{a['ink']}; --text:{c['text']}; --text-mid:{a['dim']}; --faint:{c['faint']};
    --accent:{c['accent']}; --accent-d:{c['accent-d']}; --blue:{c['blue']}; --amber:{c['amber']}; --red:{c['red']};
    {status_line}
    --h1-grad:{a['h1_grad']};
    --glow:{c['glow']}; --hover-glow:{c['hover-glow']}; --shadow:{c['shadow']};
    --body-bg:
      radial-gradient(900px 520px at 10% -8%, {w1}, transparent 60%),
      radial-gradient(820px 480px at 96% -2%, {w2}, transparent 55%),
      radial-gradient(700px 600px at 50% 120%, {w3}, transparent 60%), {a['bg']};
  }}"""


# The structural sheet — layout, type, and the reading-surface treatment. One
# copy, token-driven, so a theme switch re-points it rather than overriding it.
_STRUCTURE = """
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body {
    margin:0; color:var(--text); font-family:var(--sans); font-size:15px; line-height:1.7;
    -webkit-font-smoothing:antialiased;
    background:var(--body-bg); background-attachment:fixed;
    transition:background .4s ease, color .3s ease;
  }
  .wrap { max-width:920px; margin:0 auto; padding:56px 28px 120px; }

  header.top { margin-bottom:14px; }
  .logo { display:inline-flex; align-items:center; gap:10px; margin-bottom:10px; }
  .logo .sq { width:13px; height:13px; border-radius:4px;
    background:var(--h1-grad); box-shadow:0 0 14px -1px var(--glow); }
  .logo .k { font-family:var(--mono); font-size:12px; color:var(--faint); letter-spacing:.04em; }
  h1 { font-family:'Outfit',var(--sans); font-size:32px; line-height:1.18; margin:4px 0 6px;
    font-weight:700; letter-spacing:-.02em;
    background:var(--h1-grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .lede { color:var(--text-mid); font-size:16px; margin:0 0 8px; }

  h2 { font-size:20px; color:var(--text-hi); margin:52px 0 14px; font-weight:620;
    padding-bottom:8px; border-bottom:1px solid var(--line); }
  h2 .n { color:var(--accent-d); font-family:var(--mono); font-size:14px; margin-right:10px; }
  h3 { font-size:15px; color:var(--text-hi); margin:26px 0 8px; font-weight:620; }
  p { margin:10px 0; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { color:var(--accent-d); text-decoration:underline; }
  strong { color:var(--text-hi); font-weight:620; }
  code { font-family:var(--mono); font-size:.86em; color:var(--accent);
    background:var(--panel-2); border:1px solid var(--line); padding:1px 6px; border-radius:5px; }

  pre { background:var(--panel); border:1px solid var(--line); border-radius:12px;
    padding:18px 20px; overflow-x:auto; margin:16px 0;
    font-family:var(--mono); font-size:12.5px; line-height:1.55; color:var(--text-mid);
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:var(--shadow); }
  pre b { color:var(--accent); font-weight:600; }
  pre .c { color:var(--faint); } pre .a { color:var(--accent); } pre .b { color:var(--blue); }

  table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13.5px; }
  th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--faint); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:.06em; }
  td code { font-size:.9em; }
  tbody tr:hover { background:rgba(128,128,128,.055); }

  ul, ol { margin:10px 0; padding-left:22px; }
  li { margin:5px 0; }

  .toc { background:var(--panel); border:1px solid var(--line); border-radius:12px;
    padding:14px 20px; margin:22px 0 0;
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:var(--shadow); }
  .toc ol { margin:0; columns:2; column-gap:32px; font-size:13.5px; }
  .toc a { color:var(--text-mid); }
  .toc a:hover { color:var(--accent-d); }

  .cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:18px 0; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:16px 18px;
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:var(--shadow);
    transition:transform .25s cubic-bezier(.4,0,.2,1), border-color .25s, box-shadow .25s; }
  .card:hover { transform:translateY(-4px); border-color:var(--accent); box-shadow:0 12px 40px var(--hover-glow); }
  .card h4 { margin:0 0 6px; font-size:13.5px; color:var(--text-hi); display:flex; align-items:center; gap:8px; }
  .card p { margin:4px 0 0; font-size:13px; color:var(--text-mid); }
  .pill { font-family:var(--mono); font-size:10.5px; padding:1px 7px; border-radius:20px; border:1px solid var(--line); }
  .pill.live { color:var(--st-live); border-color:var(--st-live); }
  .pill.mock { color:var(--amber); border-color:var(--amber); }

  .phase { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 18px; margin:12px 0;
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:var(--shadow); }
  .phase h3 { margin:0 0 4px; display:flex; align-items:center; gap:10px; }
  .phase p { margin:4px 0 0; font-size:13.5px; color:var(--text-mid); }
  .tag { font-family:var(--mono); font-size:10.5px; padding:2px 9px; border-radius:20px;
    border:1px solid var(--line); white-space:nowrap; }
  .tag.done { color:var(--st-ok); border-color:var(--st-ok); }
  .tag.next { color:var(--st-live); border-color:var(--st-live); }
  .tag.todo { color:var(--st-plan); }
  .pnum { font-family:var(--mono); color:var(--accent); font-size:13px; }

  .note { border-left:3px solid var(--accent); background:var(--panel);
    border-radius:0 12px 12px 0; padding:12px 16px; margin:18px 0; font-size:14px;
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); box-shadow:var(--shadow); }
  .note.warn { border-left-color:var(--amber); }
  .note.red { border-left-color:var(--red); }
  .note .lbl { font-weight:620; color:var(--text-hi); }

  footer { margin-top:70px; padding-top:18px; border-top:1px solid var(--line);
    color:var(--faint); font-size:12.5px; }
"""

# ---------------------------------------------------------------------------
# The status vocabulary, shared with the observatory.
#
# An authored doc and the generated observatory describe the same project, so
# when one says "this is proven" and the other says "this is a wall" they should
# not have to invent separate looks for it. These classes are the observatory's
# marks, restyled for a reading column rather than a dense grid.
#
# The honesty rule these encode: a mark is a CLAIM. `.pchip.pok` says a human
# checked this on a date; `.pchip.pnone` says nobody has. The dashed border on
# `pnone` is deliberate — absence of proof must not look like proof.
# ---------------------------------------------------------------------------
_STATUS = """
  /* status marks — the observatory's vocabulary, in a reading column.
     Each carries BOTH a glyph and a colour, never colour alone: a bare hue is
     the one encoding a colour-blind reader cannot resolve. */
  .mark { font-style:normal; font-weight:700; margin-right:6px; }
  .m-live { color:var(--st-live); } .m-ok { color:var(--st-ok); }
  .m-plan { color:var(--st-plan); } .m-guard { color:var(--st-guard); }
  .m-sat  { color:var(--st-sat); }

  /* proof chip — the recorded outcome of a check, not its name. `pnone` is
     dashed on purpose: "unverified" must never read as "verified". */
  .pchip { font-family:var(--mono); font-size:10.5px; padding:2px 8px; border-radius:20px;
    border:1px solid currentColor; white-space:nowrap; margin-left:8px; cursor:help;
    vertical-align:middle; }
  .pchip.pok   { color:var(--st-ok); }
  .pchip.pbad  { color:var(--st-guard); font-weight:700; }
  .pchip.pwarn { color:var(--st-sat); }
  .pchip.pnone { color:var(--text-mid); border-style:dashed; }

  /* observatory-style card — for a claim that needs a heading + body, where a
     .note (an aside) would understate it. `.warn` borders in guard. */
  .ocard { border:1px solid var(--line); border-radius:12px; background:var(--card);
    padding:13px 16px; margin:14px 0; box-shadow:var(--shadow); }
  .ocard.warn { border-color:var(--st-guard); }
  .ocard.ok { border-color:var(--st-ok); }
  .ohead { font-size:11px; letter-spacing:1.2px; text-transform:uppercase;
    color:var(--text-mid); margin-bottom:8px; display:flex; align-items:center; gap:8px; }
  .ohead code { font-size:13px; color:var(--text-hi); text-transform:none; letter-spacing:0;
    background:none; border:none; padding:0; }
  .okv { font-size:12.5px; color:var(--text); margin-bottom:4px; }
  .olbl { font-size:10.5px; letter-spacing:1px; text-transform:uppercase;
    color:var(--accent); margin-right:8px; }

  /* verdict strip — the one sentence a reader gets instead of assembling the
     marks above it themselves. Same four tones as the observatory. */
  .vd { margin-top:8px; padding:7px 11px; border-radius:7px; font-size:12px; line-height:1.5;
    border-left:3px solid var(--line); background:var(--bg2); color:var(--text); }
  .vok { border-left-color:var(--st-ok); }
  .vbad { border-left-color:var(--st-guard); }
  .vwarn { border-left-color:var(--st-live); }
  .vneutral { border-left-color:var(--text-mid); }

  /* mark legend — a page that uses marks must explain them once, in place.
     NOT `.legend`: the ARCHITECTURE grid pages already own that name for their
     cell-state key, and silently restyling it would be the exact drift this
     generator exists to stop. Deliberately a different word. */
  .marklegend { display:flex; flex-wrap:wrap; gap:13px; align-items:center;
    padding:8px 14px; margin:16px 0 0; border:1px solid var(--line); border-radius:10px;
    background:var(--panel); font-size:11px; color:var(--text-mid);
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); }
  .marklegend b { color:var(--text-hi); font-weight:600; }
  .marklegend .sep { width:1px; height:11px; background:var(--line); display:inline-block; }
"""

# ---------------------------------------------------------------------------
# The flow-diagram vocabulary — inline SVG (DESIGN.docs.md owns the doctrine).
#
# Flows that outgrow the `.flow` ordered list are drawn as hand-authored inline
# SVG: no external JS, by the same rule as fonts (a doc opened on a plane still
# renders); themable, because every stroke and fill reads a token from the
# blocks above, so the switcher restyles diagrams with the page; checkable,
# because nodes carry data-path exactly like the grid's <code> cells —
# check.py arch's extraction is a raw-text regex and element-agnostic.
#
# `fd-` is a fresh prefix ON PURPOSE (the .marklegend precedent): .flow, .node,
# .trace, .grid and .legend are per-doc template classes, and apply_doc_theme
# deletes any per-doc rule whose selectors this generator claims as its own.
# ---------------------------------------------------------------------------
_SVG = """
  /* flow diagram — hand-authored inline SVG. One flow per figure, ~12 nodes
     max; anything tabular stays an HTML grid (tables wrap, SVG text doesn't).
     Author with a viewBox; .fd scales it to the reading column. Arrowheads
     come from a per-figure <defs> marker whose path carries .fd-arrow —
     markers don't inherit the edge's stroke cross-browser, so the head keeps
     one neutral hue on every edge kind. */
  .fd { display:block; width:100%; height:auto; margin:14px 0; }
  .fd-node  { fill:var(--card); stroke:var(--line); stroke-width:1.2; }
  .fd-edge  { fill:none; stroke:var(--text-mid); stroke-width:1.2; }
  .fd-label { fill:var(--text-hi); font:600 12px var(--sans); }
  .fd-file  { fill:var(--text-mid); font:10.5px var(--mono); }
  .fd-arrow { fill:var(--text-mid); stroke:none; }

  /* the .flow list's claims, in vector form — a seam crosses a runtime
     boundary, a gap is an arrow that does NOT exist yet. Hue plus dash,
     never hue alone (the colour-blind rule the status marks follow). */
  .fd-seam { stroke:var(--blue); }
  .fd-gap  { stroke:var(--red); stroke-dasharray:5 4; }
"""

_SWITCHER = """
  /* theme switcher — fixed top-right pills, one swatch each (matches the dashboard) */
  .themebar { position:fixed; top:14px; right:14px; z-index:60; display:flex; flex-wrap:wrap; gap:6px; }
  .themebar button {
    font:600 11px/1 var(--sans); letter-spacing:.3px; cursor:pointer; color:var(--text-mid);
    background:var(--panel); border:1px solid var(--line); border-radius:999px;
    padding:6px 11px 6px 8px; display:inline-flex; align-items:center; gap:6px;
    backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
    transition:color .2s, border-color .2s, transform .2s, box-shadow .2s;
  }
  .themebar button:hover { color:var(--text-hi); transform:translateY(-1px); }
  .themebar button.active { color:var(--text-hi); border-color:var(--accent); box-shadow:0 6px 20px var(--hover-glow); }
  .themebar .sw { width:11px; height:11px; border-radius:50%; box-shadow:0 0 0 1px rgba(0,0,0,.18) inset; }

  @media (max-width:760px){ .themebar { position:static; margin:0 0 18px; } }
  @media (max-width:680px){ .cards { grid-template-columns:1fr; } .toc ol { columns:1; } }
  @media (prefers-reduced-motion:reduce){ * { transition:none!important; } }
"""

_FONTS = """  :root {
    --mono:'Fira Code',ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --sans:'Inter',ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  }"""


def css() -> str:
    """The complete doc stylesheet: fonts, five token blocks, structure,
    status vocabulary, flow-diagram vocabulary, switcher. No `@font-face`,
    no CDN — a doc opened from `file://` on a plane still renders."""
    blocks = "\n".join(_token_block(t) for t in palette.THEME_NAMES)
    return (f"  /* ===== {MARKER} BEGIN — GENERATED by gravity/lib/doc_theme.py. "
            f"Do not hand-edit; re-run the generator. =====\n"
            f"     Five palettes selected via <html data-theme>; anchors owned by "
            f"gravity/lib/palette.py.\n"
            f"     Custom per-doc CSS belongs BELOW this block, where it wins. */\n"
            f"{_FONTS}\n{blocks}\n{_STRUCTURE}{_STATUS}{_SVG}{_SWITCHER}"
            # An explicit END sentinel, so the block can be removed EXACTLY on
            # the next run. The previous scheme deleted "from the marker to just
            # before </style>", which silently no-ops in a doc with more than one
            # <style> element — and then the regenerated banner accumulated two
            # lines per run, forever.
            f"  /* ===== {MARKER} END ===== */\n")


def head_script() -> str:
    """No-FOUC init — sets data-theme before first paint."""
    names = ",".join(f"'{t}'" for t in palette.THEME_NAMES)
    return (f"<script>/* {MARKER}: no-FOUC init — shares the dashboard's "
            f"'{STORAGE_KEY}' key */(function(){{var ok=[{names}];"
            f"try{{var t=localStorage.getItem('{STORAGE_KEY}');"
            f"document.documentElement.setAttribute('data-theme',"
            f"ok.indexOf(t)>=0?t:'aurora');}}"
            f"catch(e){{document.documentElement.setAttribute("
            f"'data-theme','aurora');}}}})();</script>")


def themebar_html() -> str:
    pills = "".join(
        f'<button data-theme="{t}"><span class="sw" style="background:{SWATCH[t]}">'
        f'</span>{t.capitalize()}</button>'
        for t in palette.THEME_NAMES
    )
    return (f'<div class="themebar" id="themebar" role="group" '
            f'aria-label="Theme">{pills}</div>')


def themebar_script() -> str:
    names = ",".join(f"'{t}'" for t in palette.THEME_NAMES)
    return (
        f"<script>/* {MARKER}: switcher */(function(){{"
        f"var bar=document.getElementById('themebar');if(!bar)return;"
        f"var ok=[{names}];"
        f"function set(t){{document.documentElement.setAttribute('data-theme',t);"
        f"try{{localStorage.setItem('{STORAGE_KEY}',t);}}catch(e){{}}"
        f"bar.querySelectorAll('button').forEach(function(b){{"
        f"b.classList.toggle('active',b.getAttribute('data-theme')===t);}});}}"
        f"bar.querySelectorAll('button').forEach(function(b){{"
        f"b.addEventListener('click',function(){{set(b.getAttribute('data-theme'));}});}});"
        f"var saved='aurora';try{{saved=localStorage.getItem('{STORAGE_KEY}')||'aurora';}}"
        f"catch(e){{}}if(ok.indexOf(saved)<0)saved='aurora';set(saved);}})();</script>"
    )


def legend_html(*marks: str) -> str:
    """The legend strip for whichever marks a page actually uses.

    Named marks only — a legend that explains symbols the page doesn't use is
    noise, and one that omits symbols it does use is the bug this replaces.
    """
    known = {
        "live":  ('<b class="m-live">◑</b> live / in flight'),
        "ok":    ('<b class="m-ok">✓</b> proven'),
        "plan":  ('<b class="m-plan">○</b> planned'),
        "guard": ('<b class="m-guard">▲</b> wall / drift'),
        "chip":  ('<span class="pchip pnone">unverified</span> '
                  'dashed = nobody checked'),
    }
    parts = [known[m] for m in marks if m in known]
    sep = '<span class="sep"></span>'
    return f'<div class="marklegend">{sep.join(parts)}</div>' if parts else ""


def style_block() -> str:
    """The full `<style>…</style>` element, ready to drop into a template."""
    return f"<style>\n{css()}</style>"


def _self_test() -> int:
    """Verify the emitted CSS actually carries every anchor, in the shape
    `check.py theme` parses. A generator that silently stops emitting a token
    would otherwise pass every other check."""
    import re
    out = css()
    bad = 0
    vocab = palette.VOCABULARY["docs"]
    svocab = palette.STATUS_VOCABULARY["docs"]
    for theme in palette.THEME_NAMES:
        m = re.search(rf'\[data-theme="{theme}"\]\s*\{{(.*?)\n  \}}', out, re.S)
        if not m:
            print(f"  FAIL {theme}: no parsable token block")
            bad += 1
            continue
        block = m.group(1)
        for key, tok in vocab.items():
            want = palette.ANCHORS[theme][key]
            got = re.search(rf"--{tok}:\s*([^;]+);", block)
            if not got or got.group(1).strip().lower() != want.lower():
                print(f"  FAIL {theme}: --{tok} is "
                      f"{got.group(1).strip() if got else 'absent'}, want {want}")
                bad += 1
        for key, tok in svocab.items():
            want = palette.STATUS_ANCHORS[theme][key]
            got = re.search(rf"--{tok}:\s*([^;]+);", block)
            if not got or got.group(1).strip().lower() != want.lower():
                print(f"  FAIL {theme}: --{tok} is "
                      f"{got.group(1).strip() if got else 'absent'}, want {want}")
                bad += 1
        if palette.ANCHORS[theme]["h1_grad"] not in block:
            print(f"  FAIL {theme}: --h1-grad does not match the anchor")
            bad += 1
    # Exactly one `:root` — the whole point of replacing the append.
    n_root = len(re.findall(r"^\s*:root", out, re.M))
    if n_root != 2:  # the fonts block + the aurora token block
        print(f"  FAIL: expected 2 :root declarations (fonts + aurora), got {n_root}")
        bad += 1
    print(f"doc_theme self-test: {'OK' if not bad else str(bad) + ' failure(s)'} "
          f"— {len(palette.THEME_NAMES)} themes x "
          f"{len(vocab) + len(svocab) + 1} checked tokens")
    return 1 if bad else 0


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in argv:
        return _self_test()
    if "--css" in argv:
        print(css())
    elif "--parts" in argv:
        print(head_script())
        print(themebar_html())
        print(themebar_script())
    else:
        print(style_block())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
