#!/usr/bin/env python3
"""
project_arg.py — turn a CLI token into (display-name, project-path).

The one place the portable renderers decide "which project?", written so the
same script works from both homes gravity's lib can live in:

  workspace distribution   gravity/lib/…            `<name>` aliases resolve
                                                    via the tier folders
  installed in a project   <project>/.gravity/lib/… no argument needed — the
                                                    lib's own location names
                                                    the project it belongs to

Portable-first: a token that is a real directory is used as-is, so a bare
clone that has never seen the workspace still renders. Only a token that
*isn't* a path reaches for the workspace's alias resolver — an optional,
one-way convenience (protocol never requires the manager), and its absence
is an honest error, never a guess.
"""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def installed_root() -> Path | None:
    """The project this lib is installed into, or None when it isn't installed.

    `<project>/.gravity/lib/project_arg.py` -> `<project>`; the workspace
    distribution (`gravity/lib/`) has no owning project and returns None.
    """
    parents = _HERE.parents
    if _HERE.name == "lib" and len(parents) >= 2 and parents[0].name == ".gravity":
        return parents[1]
    return None


def _walk_up_for_gravity(start: Path) -> Path | None:
    """The nearest ancestor of `start` (inclusive) holding a `.gravity/` dir."""
    for candidate in [start, *start.parents]:
        if (candidate / ".gravity").is_dir():
            return candidate
    return None


def _workspace_resolve(token: str):
    """The manager-side alias resolver, when this lib sits in the workspace.
    Returns None when unreachable — the caller then reports an honest error."""
    scripts = _HERE.parents[1] / ".claude" / "scripts"
    if not (scripts / "resolve_project.py").exists():
        return None
    sys.path.insert(0, str(scripts))
    try:
        import resolve_project  # type: ignore
    except Exception:                                   # pragma: no cover
        return None
    return resolve_project.resolve(token)               # exits if ambiguous


def observatory_dir(project: Path) -> Path:
    """`<project>/.gravity/observatory/`, created and self-ignoring.

    The rendered page lives *inside* the project so anyone who opens the repo
    can see it — but it is generated, so it must never become a tracked
    artifact that can go stale in git (the page's own footer says a wrong page
    means doc drift). The folder therefore carries a `.gitignore` of `*`,
    ignoring itself and its contents: no project ever needs a .gitignore edit
    to adopt this, now or at adoption time.
    """
    out = Path(project) / ".gravity" / "observatory"
    out.mkdir(parents=True, exist_ok=True)
    (out / ".gitignore").write_text("*\n", encoding="utf-8")
    return out


def resolve_target(token: str | None) -> tuple[str, Path]:
    """(display-name, project-path) for a CLI token. Exits with a clear message
    rather than guessing when the token names nothing we can find."""
    if token:
        as_path = Path(token).expanduser()
        if as_path.is_dir():
            root = as_path.resolve()
            return root.name, root
        resolved = _workspace_resolve(token)
        if resolved is None:
            raise SystemExit(
                f"no project directory at '{token}', and no workspace alias "
                f"resolver is reachable from {_HERE} — pass a path to the "
                f"project root instead")
        return resolved

    root = installed_root() or _walk_up_for_gravity(Path.cwd().resolve())
    if root is None:
        raise SystemExit(
            "no project given and no .gravity/ found here — run this from a "
            "gravity project, or pass the project path as the first argument")
    return root.name, root
