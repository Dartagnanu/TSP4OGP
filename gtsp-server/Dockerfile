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

RUN /opt/conda/bin/python setup.py build_ext --inplace \
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
    && find /app -name '*.html' -delete \
    && echo "Compiled extension modules:" \
    && ls -1 /app/*.so 2>/dev/null || ls -1 /app/*.cpython* 2>/dev/null || true

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

ENTRYPOINT []
CMD ["/opt/conda/bin/python", "-u", "app.py"]
