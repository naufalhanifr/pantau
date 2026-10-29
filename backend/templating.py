"""Penyusun HTML sederhana: `<!-- @include path/file.html -->` diganti isi file tersebut.

Browser tetap menerima satu dokumen HTML utuh, sehingga urutan parsing, CSS, dan script
sama persis seperti file tunggal, tetapi sumbernya bisa dipecah per menu/komponen.
"""
import re
from pathlib import Path

INCLUDE_RE = re.compile(r"^([ \t]*)<!--\s*@include\s+(\S+)\s*-->[ \t]*$", re.MULTILINE)

_cache: dict[Path, tuple[tuple, str]] = {}


def _render(path: Path, seen: tuple[Path, ...], files: list[Path]) -> str:
    if path in seen:
        raise RuntimeError(f"Include melingkar: {path}")
    files.append(path)
    text = path.read_text(encoding="utf-8")

    def replace(match: re.Match) -> str:
        child = (path.parent / match.group(2)).resolve()
        return _render(child, seen + (path,), files).rstrip("\n")

    return INCLUDE_RE.sub(replace, text)


def render_page(path: Path) -> str:
    """Render dengan cache; cache dibuang otomatis jika salah satu file sumber berubah."""
    path = path.resolve()
    cached = _cache.get(path)
    if cached:
        signature, html = cached
        if all(f.exists() and f.stat().st_mtime_ns == m for f, m in signature):
            return html
    files: list[Path] = []
    html = _render(path, (), files)
    _cache[path] = (tuple((f, f.stat().st_mtime_ns) for f in files), html)
    return html
