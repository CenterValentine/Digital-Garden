# docx-renderer — Cloud Run image. Build context is THIS directory
# (cloudbuild.docx-renderer.yaml sets `dir:`), not the repo root, so the
# image never sees node_modules or application secrets.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app.py contract.py render.py ./
COPY scripts ./scripts
COPY fixtures/*.docx ./fixtures/

# Non-root; temp files from a request land in /tmp, which Cloud Run backs
# with memory — python-docx/docxtpl work in BytesIO so nothing is written.
RUN useradd --create-home --uid 10001 renderer
USER renderer

EXPOSE 8080
# One worker: Cloud Run sets concurrency=1 for this service (CPU-bound
# render, no shared state); horizontal scale is Cloud Run's job.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
