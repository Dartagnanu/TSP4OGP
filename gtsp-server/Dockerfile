# GPU pathfinding: RAPIDS base includes cuGraph, cuDF, and CuPy.
# Tag format: https://hub.docker.com/r/rapidsai/base/tags
FROM rapidsai/base:25.10-cuda12-py3.11
WORKDIR /app

RUN /opt/conda/envs/rapids/bin/python -m pip install --no-cache-dir \
    flask==2.2.5 itsdangerous==2.1.2 flask-cors pymongo networkx numpy

COPY . .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

ENTRYPOINT []
CMD ["/opt/conda/envs/rapids/bin/python", "-u", "app.py"]
