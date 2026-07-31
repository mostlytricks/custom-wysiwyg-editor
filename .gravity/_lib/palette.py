#!/usr/bin/env python3
"""
palette.py — THE OWNER of the five-theme palette family.

Gravity renders three themed surfaces, and until now no file owned the palette
they share:

    gravity/lib/generate_cosmos.py        Orbit 3D / observatory drawing tokens
                                          (canvas + SVG colours, not CSS vars)
    .claude/dashboard/generate_dashboard.py   the fleet dashboard's CSS block
    gravity/lib/doc_theme.py              browser-read doc CSS (MISSION /
                                          ARCHITECTURE pages)

They are NOT copy-paste duplicates: each speaks a different token vocabulary
for the same five palettes (`--surface`/`--ink` on the dashboard, `--panel`/
`--text-hi` in docs, plain dict keys in the renderer). Those vocabularies
legitimately differ — the surfaces do — so this file deliberately does NOT try
to merge them. What it owns is the small set of **anchor hues** that all three
must agree on for the five themes to read as one family.

The rule: change an anchor HERE first, then propagate to the three files.
`check.py theme` fails on any disagreement (`THEME_DRIFT`), so a partial edit
can no longer pass silently — the wall, not the merge (workspace CLAUDE.md §7).

Scope note, deliberately narrow: a hue absent from this table is owned locally
by whichever file draws it (star gradients, ring colours, chart axes). Claiming
those would be a fake wall — nothing cross-checks them.

Status hues were once in that locally-owned set, because only the observatory
drew them. That stopped being true when the browser-read docs adopted the
observatory's status vocabulary (gravity 3.7.0): a MISSION principle marked
drifting and an observatory rung marked weak are now the same claim in the same
colour, so the two surfaces must agree or the shared meaning is a lie. They are
therefore promoted to STATUS_ANCHORS below — a second, narrower wall over the
surfaces that actually draw them. The dashboard does not, and is exempt by the
vocabulary map rather than by omission.
"""
from __future__ import annotations

# Order is the display order in every theme switcher.
THEME_NAMES: tuple[str, ...] = ("aurora", "daylight", "sandstone", "forest", "slate")

# The dark/light split matters to renderers: light themes get the documented
# paper-chart treatment (ink-dark stars, no glow, no diffraction spikes).
LIGHT_THEMES: frozenset[str] = frozenset({"daylight", "sandstone"})

# The anchors. Three are universal (all three surfaces declare them); `h1_grad`
# is CSS-only, since the canvas renderer has no headline to paint.
#
#   bg   page/canvas background
#   ink  primary text  (--ink · --text-hi · "ink")
#   dim  muted text    (--muted · --text-mid · "dim")
ANCHORS: dict[str, dict[str, str]] = {
    "aurora": {
        "bg": "#0A0E1A", "ink": "#F3F4F6", "dim": "#9CA3AF",
        "h1_grad": "linear-gradient(135deg,#00F2FE 0%,#4FACFE 60%,#F093FB 130%)",
    },
    "daylight": {
        "bg": "#F7F9FC", "ink": "#1E293B", "dim": "#64748B",
        "h1_grad": "linear-gradient(135deg,#2563EB 0%,#4F46E5 60%,#7C3AED 130%)",
    },
    "sandstone": {
        "bg": "#FBF6EF", "ink": "#3D2E22", "dim": "#8C7A66",
        "h1_grad": "linear-gradient(135deg,#C2410C 0%,#D97706 60%,#B45309 130%)",
    },
    "forest": {
        "bg": "#0C1A14", "ink": "#E8F2EC", "dim": "#8BA89A",
        "h1_grad": "linear-gradient(135deg,#34D399 0%,#10B981 60%,#A3E635 130%)",
    },
    "slate": {
        "bg": "#16181D", "ink": "#E5E7EB", "dim": "#9499A3",
        "h1_grad": "linear-gradient(135deg,#CBD5E1 0%,#94A3B8 60%,#64748B 130%)",
    },
}

# The STATUS anchors — the meaning-bearing hues, as opposed to the chrome above.
# These carry a claim ("this is proven" / "this is a wall" / "this is planned"),
# which is exactly why they must not drift: the same colour has to mean the same
# thing on the observatory and in an authored MISSION/ARCHITECTURE page.
#
#   accent  the live/active mark          (cosmos status["◑"])
#   ok      proven, passing, present      (cosmos status["✓"])
#   plan    planned, not yet real         (cosmos status["○"])
#   guard   a wall, a warning, a failure  (cosmos "guard")
#   sat     a secondary/satellite mark    (cosmos "sat")
#
# Values are the cosmos THEMES entries verbatim — cosmos remains the *drawer*,
# this table is the *declaration* the checker compares every drawer against.
STATUS_ANCHORS: dict[str, dict[str, str]] = {
    "aurora": {
        "accent": "#00E5E8", "ok": "#34D399", "plan": "#566175",
        "guard": "#e17a95", "sat": "#67e8f9",
    },
    "daylight": {
        "accent": "#2563EB", "ok": "#059669", "plan": "#94a3b8",
        "guard": "#DC2626", "sat": "#4F46E5",
    },
    "sandstone": {
        "accent": "#D97706", "ok": "#15803d", "plan": "#a8988a",
        "guard": "#BE123C", "sat": "#C2410C",
    },
    "forest": {
        "accent": "#A3E635", "ok": "#34D399", "plan": "#52705f",
        "guard": "#e08a8a", "sat": "#a3e635",
    },
    "slate": {
        "accent": "#CBD5E1", "ok": "#94A3B8", "plan": "#4b5563",
        "guard": "#c98b8b", "sat": "#d5d9e0",
    },
}

# Which token name each surface uses for a given anchor — the mapping the
# checker needs in order to compare vocabularies that were never meant to match.
VOCABULARY: dict[str, dict[str, str]] = {
    "cosmos":    {"bg": "bg", "ink": "ink", "dim": "dim"},
    "dashboard": {"bg": "bg", "ink": "ink", "dim": "muted"},
    "docs":      {"bg": "bg", "ink": "text-hi", "dim": "text-mid"},
}

# Status vocabulary, per surface. A surface absent here simply doesn't draw the
# status hues and is not checked for them — the dashboard encodes status with
# its own chart legend, not this palette, so claiming it would be a fake wall.
#
# The docs deliberately prefix theirs `--st-*`. They already had an `--accent`
# meaning "link / code / section number", and in three of the five themes that
# chrome hue collides with a DIFFERENT status hue (forest and slate docs-accent
# is the `ok` green/grey; sandstone docs-accent is `sat`). Reusing the bare
# names would have silently given every hyperlink a status meaning, so the two
# vocabularies stay separate — which is the same reason cosmos and the dashboard
# keep theirs.
STATUS_VOCABULARY: dict[str, dict[str, str]] = {
    "observatory": {"accent": "accent", "ok": "ok", "plan": "plan",
                    "guard": "guard", "sat": "sat"},
    "docs":        {"accent": "st-live", "ok": "st-ok", "plan": "st-plan",
                    "guard": "st-guard", "sat": "st-sat"},
}

UNIVERSAL_KEYS: tuple[str, ...] = ("bg", "ink", "dim")
STATUS_KEYS: tuple[str, ...] = ("accent", "ok", "plan", "guard", "sat")


def anchors(theme: str) -> dict[str, str]:
    """The anchor hues for one theme. Raises on an unknown name rather than
    inventing a palette — an unknown theme is a bug, not a default."""
    try:
        return dict(ANCHORS[theme])
    except KeyError:
        raise KeyError(
            f"unknown theme {theme!r}; the family is {', '.join(THEME_NAMES)}"
        ) from None


def status(theme: str) -> dict[str, str]:
    """The status hues for one theme. Raises on an unknown name for the same
    reason `anchors` does — an invented palette is worse than a crash."""
    try:
        return dict(STATUS_ANCHORS[theme])
    except KeyError:
        raise KeyError(
            f"unknown theme {theme!r}; the family is {', '.join(THEME_NAMES)}"
        ) from None


def is_light(theme: str) -> bool:
    return theme in LIGHT_THEMES


if __name__ == "__main__":
    # Windows consoles still default to cp949/cp1252 here; the em dashes below
    # are not worth a crash (matches install_lib.py / check.py).
    import sys
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print(f"gravity palette — {len(THEME_NAMES)} themes, "
          f"{len(UNIVERSAL_KEYS) + 1} chrome anchors + "
          f"{len(STATUS_KEYS)} status anchors each")
    for name in THEME_NAMES:
        a, s = ANCHORS[name], STATUS_ANCHORS[name]
        kind = "light" if is_light(name) else "dark "
        print(f"  {name:10} {kind}  bg {a['bg']}  ink {a['ink']}  dim {a['dim']}"
              f"   ok {s['ok']}  guard {s['guard']}  plan {s['plan']}")
    print("\nverify with: python .claude/scenarios/check.py theme")
