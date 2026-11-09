FROM python:3.11-slim

# Real Stockfish binary (not the JS port) via apt — much faster at depth.
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
