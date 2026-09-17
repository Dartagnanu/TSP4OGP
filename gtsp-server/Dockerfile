# GPU pathfinding: RAPIDS base includes cuGraph, cuDF, and CuPy.
# First build compiles Cython C sources to Linux .so (slow). The image
# does not keep readable algorithm .py files.
FROM rapidsai/base:25.10-cuda12-py3.11
WORKDIR /app

USER root

RUN /opt/conda/bin/python -m pip install --no-cache-dir \
    flask==2.2.5 itsdangerous==2.1.2 flask-cors pymongo networkx numpy numba \
    Cython setuptools wheel

# Compiler + Python headers for building extension modules against conda Python.
RUN (command -v gcc >/dev/null 2>&1 || (apt-get update \
        && apt-get install -y --no-install-recommends build-essential \
        && rm -rf /var/lib/apt/lists/*)) \
    && /opt/conda/bin/conda install -y -n base -c conda-forge cxx-compiler \
    && /opt/conda/bin/conda clean -afy

COPY . /app/

# Compile Cython C sources in place, then copy .so files into site-packages
# so `from pathFinder import Pathfinder` works even if /app is not on sys.path.
# Fail the build if the import does not work (do not delete sources first).
RUN /opt/conda/bin/python setup.py build_ext --inplace \
    && /opt/conda/bin/python -c "\
import pathlib, shutil, sysconfig; \
plat = pathlib.Path(sysconfig.get_path('platlib')); \
mods = sorted(pathlib.Path('/app').glob('*.so')); \
assert mods, 'no compiled .so modules in /app'; \
[shutil.copy2(p, plat / p.name) for p in mods]; \
print('compiled:', ', '.join(p.name for p in mods))" \
    && /opt/conda/bin/python -c "from pathFinder import Pathfinder; from graphBuilder import GraphBuilder; print('pathFinder import ok')" \
    && rm -rf build /app/*.egg-info \
    && rm -f \
        gtsp_solver.py gtsp_solver.c \
        corridor_blocks.py corridor_blocks.c \
        heuristics.py heuristics.c \
        distance_cache.py distance_cache.c \
        shelf_access.py shelf_access.c \
        polygon_grid.py polygon_grid.c \
        graphBuilder.py graphBuilder.c \
        store_cache.py store_cache.c \
        pathFinder.py pathFinder.c \
        setup.py setup.cfg \
    && find /app -name '*.html' -delete

EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

ENTRYPOINT []
CMD ["/opt/conda/bin/python", "-u", "app.py"]
