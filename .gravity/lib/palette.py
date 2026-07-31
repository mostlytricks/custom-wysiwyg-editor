#!/usr/bin/env python3
"""
palette.py — THE OWNER of the five-theme palette family.

Gravity renders three themed surfaces, and until now no file owned the palette
they share:

    gravity/lib/generate_cosmos.py        Orbit 3D / observatory drawing tokens
                                          (canvas + SVG colours, not CSS vars)
    .claude/dashboard/generate_dashboard.py   the fleet dashboard's CSS block
    .claude/scripts/add_theme_switch.py       browser-read doc CSS (MISSION /
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
by whichever file draws it (star gradients, ring colours, chart axes, per-status
glyph colours). Claiming those would be a fake wall — nothing cross-checks them.
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

# Which token name each surface uses for a given anchor — the mapping the
# checker needs in order to compare vocabularies that were never meant to match.
VOCABULARY: dict[str, dict[str, str]] = {
    "cosmos":    {"bg": "bg", "ink": "ink", "dim": "dim"},
    "dashboard": {"bg": "bg", "ink": "ink", "dim": "muted"},
    "docs":      {"bg": "bg", "ink": "text-hi", "dim": "text-mid"},
}

UNIVERSAL_KEYS: tuple[str, ...] = ("bg", "ink", "dim")


def anchors(theme: str) -> dict[str, str]:
    """The anchor hues for one theme. Raises on an unknown name rather than
    inventing a palette — an unknown theme is a bug, not a default."""
    try:
        return dict(ANCHORS[theme])
    except KeyError:
        raise KeyError(
            f"unknown theme {theme!r}; the family is {', '.join(THEME_NAMES)}"
        ) from None


def is_light(theme: str) -> bool:
    return theme in LIGHT_THEMES


if __name__ == "__main__":
    print(f"gravity palette — {len(THEME_NAMES)} themes, "
          f"{len(UNIVERSAL_KEYS) + 1} anchors each")
    for name in THEME_NAMES:
        a = ANCHORS[name]
        kind = "light" if is_light(name) else "dark "
        print(f"  {name:10} {kind}  bg {a['bg']}  ink {a['ink']}  dim {a['dim']}")
    print("\nverify with: python .claude/scenarios/check.py theme")
