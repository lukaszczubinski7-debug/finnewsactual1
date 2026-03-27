FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system --no-cache .

COPY src/ src/
COPY alembic/ alembic/
COPY alembic.ini .

CMD ["sh", "-c", "alembic upgrade head && uvicorn finnews.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
