from __future__ import annotations

from wallbreaker.tools import eni


def test_archive_discovery_is_recursive_and_excludes_readmes():
    files = eni.seed_files()
    assert len(files) >= 100
    assert all(path.suffix.lower() in {".md", ".txt"} for path in files)
    assert all(path.stem.lower() not in {"readme", "license", "contributing"} for path in files)
    assert any(path.suffix.lower() == ".txt" for path in files)
    assert any(len(path.relative_to(eni.library_dir()).parts) > 2 for path in files)


def test_aliases_resolve_to_real_nested_sources():
    for alias, metadata in eni.SEED_CATALOG.items():
        path = eni.resolve_seed_path(alias)
        assert path is not None and path.is_file(), alias
        assert eni.relative_name(path) == metadata["source"][:-3]


def test_duplicate_archive_stems_remain_addressable_by_relative_name():
    matches = [path for path in eni.seed_files() if path.stem.lower() == "eni lime"]
    assert len(matches) >= 2
    for path in matches[:3]:
        assert eni.resolve_seed_path(eni.relative_name(path)) == path

