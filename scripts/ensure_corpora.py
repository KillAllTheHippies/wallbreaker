#!/usr/bin/env python3
"""Ensure Wallbreaker's external corpus repositories exist under library/."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Repository:
    name: str
    directory: str
    url: str
    source_subdir: str = ""
    populate_to: str | None = None


REPOSITORIES = (
    Repository("L1B3RT4S", "L1B3RT4S", "https://github.com/elder-plinius/L1B3RT4S"),
    Repository("ZetaLib", "ZetaLib", "https://github.com/Exocija/ZetaLib"),
    Repository("UltraBr3aks", "UltraBr3aks", "https://github.com/SlowLow999/UltraBr3aks"),
    Repository("system_prompts_leaks", "system_prompts", "https://github.com/asgeirtj/system_prompts_leaks"),
    Repository(
        "Spiritual-Spell-Red-Teaming",
        ".sources/Spiritual-Spell-Red-Teaming",
        "https://github.com/Goochbeater/Spiritual-Spell-Red-Teaming",
        source_subdir="Jailbreak-Guide",
        populate_to="ENI",
    ),
)

PARSEL_REPOSITORY = Repository(
    "P4RS3LT0NGV3",
    "P4RS3LT0NGV3",
    "https://github.com/elder-plinius/P4RS3LT0NGV3",
)


def repository_state(library_root: Path, repo: Repository) -> str:
    """Return present, missing, or conflict for a repository target."""
    target = library_root / repo.directory
    if (target / ".git").is_dir():
        return "present"
    if target.exists():
        return "conflict"
    return "missing"


def ensure_repository(
    library_root: Path,
    repo: Repository,
    *,
    dry_run: bool = False,
) -> tuple[bool, str]:
    """Clone one missing repository. Never overwrites an existing directory."""
    state = repository_state(library_root, repo)
    target = library_root / repo.directory
    if state == "present":
        if repo.populate_to:
            return _populate_repository(library_root, repo)
        return True, f"OK       {repo.name}: {target}"
    if state == "conflict":
        return False, f"CONFLICT {repo.name}: {target} exists but is not a Git checkout"
    if dry_run:
        return True, f"WOULD CLONE {repo.name}: {repo.url} -> {target}"

    if shutil.which("git") is None:
        return False, "ERROR    git executable not found on PATH"
    library_root.mkdir(parents=True, exist_ok=True)
    print(f"CLONING  {repo.name}: {repo.url}", flush=True)
    completed = subprocess.run(
        ["git", "clone", "--depth", "1", repo.url, str(target)],
        check=False,
    )
    if completed.returncode != 0:
        return False, f"FAILED   {repo.name}: git clone exited with {completed.returncode}"
    if repository_state(library_root, repo) != "present":
        return False, f"FAILED   {repo.name}: clone completed but {target / '.git'} is missing"
    if repo.populate_to:
        return _populate_repository(library_root, repo)
    return True, f"READY    {repo.name}: {target}"


def _populate_repository(library_root: Path, repo: Repository) -> tuple[bool, str]:
    target = library_root / repo.directory
    source = target / repo.source_subdir
    destination = library_root / repo.populate_to if repo.populate_to else None
    if destination is None:
        return True, f"OK       {repo.name}: {target}"
    if not source.is_dir():
        return False, f"FAILED   {repo.name}: source folder missing: {source}"
    added = 0
    destination.mkdir(parents=True, exist_ok=True)
    for source_file in source.rglob("*"):
        if not source_file.is_file():
            continue
        relative = source_file.relative_to(source)
        destination_file = destination / relative
        if destination_file.exists():
            continue
        destination_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, destination_file)
        added += 1
    return True, f"OK       {repo.name}: staged at {target}; added {added} file(s) to {destination}"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clone missing Wallbreaker corpus repositories into library/."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Wallbreaker checkout (default: project containing this script)",
    )
    parser.add_argument(
        "--include-parsel",
        action="store_true",
        help="Also ensure the optional P4RS3LT0NGV3 transform repository.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report missing/conflicting repositories without cloning.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    project_root = args.root.resolve()
    library_root = project_root / "library"
    repositories = REPOSITORIES + ((PARSEL_REPOSITORY,) if args.include_parsel else ())

    results = [
        ensure_repository(library_root, repo, dry_run=args.dry_run)
        for repo in repositories
    ]
    for _ok, message in results:
        print(message)
    return 0 if all(ok for ok, _message in results) else 1


if __name__ == "__main__":
    sys.exit(main())
