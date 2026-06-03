# GPU pathfinding: RAPIDS base includes cuGraph, cuDF, and CuPy.
FROM rapidsai/rapidsai-core:24.10-cuda12.0-py3.11
WORKDIR /app

RUN /opt/conda/envs/rapids/bin/python -m pip install --no-cache-dir \
    flask==2.2.5 itsdangerous==2.1.2 flask-cors pymongo networkx numpy

COPY . .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

ENTRYPOINT []
CMD ["/opt/conda/envs/rapids/bin/python", "-u", "app.py"]
