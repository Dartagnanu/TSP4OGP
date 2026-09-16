"""Generate Cython C sources (or minified Python fallback) for obfuscated/gtsp-server.

Run from the private monorepo. Output has no readable algorithm .py when Cython succeeds.
"""
from __future__ import annotations

import ast
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

MODULE_NAMES = [
    "gtsp_solver",
    "corridor_blocks",
    "heuristics",
    "distance_cache",
    "shelf_access",
    "polygon_grid",
    "graphBuilder",
    "store_cache",
    "pathFinder",
]

CYTHON_DIRECTIVE = (
    "# cython: language_level=3, annotation_typing=False, "
    "emit_code_comments=False, binding=True, always_allow_keywords=True\n"
)

COMPILER_DIRECTIVES = [
    "language_level=3",
    "annotation_typing=False",
    "emit_code_comments=False",
    "binding=True",
    "always_allow_keywords=True",
]


def repo_paths() -> tuple[Path, Path, Path]:
    here = Path(__file__).resolve().parent
    orig = here.parent / "gtsp-server"
    out = here / "gtsp-server"
    work = here / ".tmp" / "cython_src"
    return orig, out, work


def strip_module(src: str) -> str:
    tree = ast.parse(src)
    _strip_docstrings(tree)
    text = ast.unparse(tree)
    lines = []
    skipped_future = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("from __future__ import"):
            skipped_future = True
            continue
        lines.append(line)
    body = "\n".join(lines).strip() + "\n"
    if skipped_future:
        # Cython handles PEP 563 poorly; drop future annotations.
        pass
    return body


def _strip_docstrings(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if isinstance(
            node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            body = list(node.body)
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                body = body[1:]
            if not body:
                body = [ast.Pass()]
            node.body = body


def ensure_cython() -> None:
    if importlib.util.find_spec("Cython") is None:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--quiet", "Cython>=3.0"]
        )


def cythonize_file(py_path: Path, c_path: Path) -> None:
    cmd = [
        sys.executable,
        "-m",
        "cython",
        "-3",
        "-o",
        str(c_path),
    ]
    for directive in COMPILER_DIRECTIVES:
        cmd.extend(["-X", directive])
    cmd.append(str(py_path))
    subprocess.check_call(cmd)


def main() -> int:
    orig, out, work = repo_paths()
    if not orig.is_dir():
        print(f"Original gtsp-server not found at {orig}", file=sys.stderr)
        return 1

    out.mkdir(parents=True, exist_ok=True)
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    status_lines = []
    failures: list[str] = []

    for name in MODULE_NAMES:
        src_path = orig / f"{name}.py"
        if not src_path.exists():
            failures.append(f"{name}: missing {src_path}")
            continue
        raw = src_path.read_text(encoding="utf-8")
        prepared = CYTHON_DIRECTIVE + strip_module(raw)
        py_work = work / f"{name}.py"
        py_work.write_text(prepared, encoding="utf-8")
        c_out = out / f"{name}.c"
        py_fallback = out / f"{name}.py"
        if c_out.exists():
            c_out.unlink()
        if py_fallback.exists():
            py_fallback.unlink()
        try:
            ensure_cython()
            cythonize_file(py_work, c_out)
            if not c_out.exists() or c_out.stat().st_size < 64:
                raise RuntimeError("Cython produced an empty C file")
            status_lines.append(f"{name}: cython_c")
            print(f"OK  {name}.c ({c_out.stat().st_size} bytes)")
        except Exception as exc:
            py_fallback.write_text(prepared, encoding="utf-8")
            status_lines.append(f"{name}: minified_py_fallback ({exc})")
            failures.append(f"{name}: Cython failed ({exc}); wrote minified .py")
            print(f"FALLBACK  {name}.py ({exc})")

    status_path = out / "COMPILE_STATUS.txt"
    status_path.write_text("\n".join(status_lines) + "\n", encoding="utf-8")
    if failures:
        print("Some modules used minified Python fallback:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
