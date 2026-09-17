"""Build Cython / C extension modules for the obfuscated pathfinder.

Compiles pre-generated .c from the company tree. Falls back to minified
.py / .pyx only when a C source is missing.
"""
from pathlib import Path

from setuptools import Extension, setup

COMPILER_DIRECTIVES = {
    "language_level": 3,
    "annotation_typing": False,
    "emit_code_comments": False,
    "binding": True,
    "always_allow_keywords": True,
}

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


def _extensions():
    here = Path(__file__).resolve().parent
    c_exts = []
    py_files = []
    for name in MODULE_NAMES:
        c_file = here / f"{name}.c"
        py_file = here / f"{name}.py"
        pyx_file = here / f"{name}.pyx"
        # Company tree: compile committed C. Only fall back to .py/.pyx if
        # Cython generation failed and a minified source was left behind.
        if c_file.exists():
            print(f"setup.py: compiling {c_file.name}")
            c_exts.append(Extension(name, sources=[str(c_file)]))
        elif py_file.exists():
            print(f"setup.py: cythonizing {py_file.name}")
            py_files.append(str(py_file))
        elif pyx_file.exists():
            print(f"setup.py: cythonizing {pyx_file.name}")
            py_files.append(str(pyx_file))
        else:
            raise FileNotFoundError(
                f"No source for extension {name} ({name}.c / .pyx / .py)"
            )
    if py_files:
        from Cython.Build import cythonize

        c_exts.extend(
            cythonize(
                py_files,
                compiler_directives=COMPILER_DIRECTIVES,
                language_level=3,
                quiet=False,
            )
        )
    return c_exts


setup(
    name="gtsp_ext",
    ext_modules=_extensions(),
)
