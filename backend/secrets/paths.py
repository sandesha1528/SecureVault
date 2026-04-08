from __future__ import annotations

from typing import List, Tuple


def split_path(path: str) -> List[str]:
    """Split a secret path into its components."""
    return [p for p in path.strip("/").split("/") if p]


def join_path(*parts: str) -> str:
    """Join path components into a canonical secret path."""
    return "/".join(p.strip("/") for p in parts if p.strip("/"))


def path_parent(path: str) -> str:
    """Return the parent namespace of a path, or '' for top-level paths."""
    parts = split_path(path)
    return join_path(*parts[:-1]) if len(parts) > 1 else ""


def path_matches_glob(path: str, pattern: str) -> bool:
    """Check if a path matches a glob pattern (e.g. 'prod/*')."""
    import fnmatch
    return fnmatch.fnmatch(path, pattern)


def validate_path(path: str) -> None:
    """
    Validate that a secret path is well-formed.
    - Must not be empty
    - Components may contain alphanumeric, dash, underscore, dot
    - No double slashes, no leading/trailing slash required but normalized
    """
    if not path or not path.strip():
        raise ValueError("Secret path must not be empty")
    parts = split_path(path)
    if not parts:
        raise ValueError("Secret path must not be empty after normalization")
    import re
    pattern = re.compile(r'^[a-zA-Z0-9._\-]+$')
    for part in parts:
        if not pattern.match(part):
            raise ValueError(
                f"Invalid path component '{part}'. "
                "Only alphanumeric, dash, underscore, and dot are allowed."
            )


def build_tree(paths: List[str]) -> dict:
    """
    Build a nested dict tree from a flat list of paths.
    Used by the frontend secret browser component.
    """
    tree: dict = {}
    for path in sorted(paths):
        parts = split_path(path)
        node = tree
        for part in parts:
            node = node.setdefault(part, {})
    return tree
