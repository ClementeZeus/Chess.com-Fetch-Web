"""
Chess Stats analysis API.

Runs the REAL Stockfish binary through python-chess at a fixed search
depth per position (not a time limit), so every position gets the exact
same analytical rigor regardless of how busy the host is. Exposes a small
job-based API so a browser can poll progress instead of holding one long
request open (which free-tier hosts tend to kill).

POST /analyze   {"fens": [...], "depth": 18}  -> {"job_id": "..."}
GET  /analyze/{job_id}                        -> progress or final result
DELETE /analyze/{job_id}                      -> cancel a running job
"""

import math
import threading
import time
import uuid
from queue import Empty, Queue
from typing import Dict, List, Optional

import chess
import chess.engine
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

STOCKFISH_PATH = "stockfish"  # must be on PATH — installed via the Dockerfile
MAX_DEPTH = 24
MAX_POSITIONS = 400
ENGINE_THREADS = 1  # bump this if you're on a bigger Render instance
JOB_MAX_AGE_SECONDS = 3600

app = FastAPI(title="Chess Stats Analysis API")

# Tighten allow_origins to your deployed frontend's origin before going live —
# "*" is fine for getting this working first.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    fens: List[str] = Field(..., min_length=1, max_length=MAX_POSITIONS)
    depth: int = Field(18, ge=1, le=MAX_DEPTH)


jobs: Dict[str, dict] = {}
job_lock = threading.Lock()
work_queue: "Queue[str]" = Queue()


# ---- scoring math, mirrors script.js's formulas so both sides agree ----

def win_percent(cp: float) -> float:
    """Centipawns (white's perspective) -> white's win probability, 0-100."""
    return 100 / (1 + math.exp(-0.00368208 * cp))


def accuracy_from_loss(loss: float) -> float:
    """Win% a player gave up on one move -> 0-100 accuracy (exponential decay)."""
    acc = 103.1668 * math.exp(-0.04354 * loss) - 3.1669
    return max(0.0, min(100.0, acc))


def compute_accuracy(evals: List[float]) -> dict:
    series = [win_percent(cp) for cp in evals]
    white_sum = white_n = black_sum = black_n = 0.0
    for i in range(1, len(series)):
        before, after = series[i - 1], series[i]
        white_moved = i % 2 == 1
        loss = max(0.0, before - after) if white_moved else max(0.0, after - before)
        acc = accuracy_from_loss(loss)
        if white_moved:
            white_sum += acc
            white_n += 1
        else:
            black_sum += acc
            black_n += 1
    return {
        "white": round(white_sum / white_n) if white_n else 85,
        "black": round(black_sum / black_n) if black_n else 85,
    }


def score_to_cp(score: "chess.engine.PovScore") -> float:
    white_score = score.white()
    mate = white_score.mate()
    if mate is not None:
        # Same encoding script.js uses for a mate score, so the frontend's
        # formatEval() doesn't need to know which engine produced the number.
        return (10000 - mate * 100) if mate > 0 else (-10000 - mate * 100)
    return float(white_score.score())


# ---- single background worker, one job's positions at a time ----
# Keeps CPU/RAM predictable on a small instance instead of spawning a
# Stockfish process per concurrent request.

def analyze_job(job_id: str) -> None:
    job = jobs[job_id]
    fens = job["fens"]
    depth = job["depth"]

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            engine.configure({"Threads": ENGINE_THREADS})
            for i, fen in enumerate(fens):
                if job["cancelled"]:
                    return
                board = chess.Board(fen)
                info = engine.analyse(board, chess.engine.Limit(depth=depth))
                cp = score_to_cp(info["score"])
                with job_lock:
                    job["evals"].append(cp)
                    job["done"] = i + 1
        with job_lock:
            job["status"] = "complete"
            job["accuracy"] = compute_accuracy(job["evals"])
    except Exception as exc:  # engine missing/crashed, bad fen, etc.
        with job_lock:
            job["status"] = "error"
            job["error"] = str(exc)


def worker_loop() -> None:
    while True:
        try:
            job_id = work_queue.get(timeout=1)
        except Empty:
            continue
        job = jobs.get(job_id)
        if job and not job["cancelled"]:
            analyze_job(job_id)


threading.Thread(target=worker_loop, daemon=True).start()


def _cleanup_old_jobs() -> None:
    cutoff = time.time() - JOB_MAX_AGE_SECONDS
    stale = [jid for jid, j in jobs.items() if j.get("created", 0) < cutoff]
    for jid in stale:
        jobs.pop(jid, None)


@app.post("/analyze")
def start_analysis(req: AnalyzeRequest):
    for fen in req.fens:
        try:
            chess.Board(fen)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"invalid fen: {fen}")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "fens": req.fens,
        "depth": req.depth,
        "evals": [],
        "done": 0,
        "total": len(req.fens),
        "cancelled": False,
        "created": time.time(),
    }
    work_queue.put(job_id)
    _cleanup_old_jobs()
    return {"job_id": job_id}


@app.get("/analyze/{job_id}")
def get_analysis(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="unknown job id")

    with job_lock:
        payload = {
            "status": job["status"],
            "done": job["done"],
            "total": job["total"],
            "evals": list(job["evals"]),
        }
        if job["status"] == "complete":
            payload["accuracy"] = job["accuracy"]
        if job["status"] == "error":
            payload["message"] = job.get("error", "analysis failed")
    return payload


@app.delete("/analyze/{job_id}")
def cancel_analysis(job_id: str):
    job = jobs.get(job_id)
    if job:
        job["cancelled"] = True
    return {"ok": True}


@app.get("/health")
def health():
    return {"ok": True}
              
