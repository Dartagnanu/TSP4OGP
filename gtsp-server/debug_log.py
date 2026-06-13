"""NDJSON debug logging for agent sessions (session 5bfbd6)."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

SESSION_ID = os.environ.get("DEBUG_SESSION_ID", "5bfbd6")
_DEFAULT = Path(__file__).resolve().parent.parent / f"debug-{SESSION_ID}.log"
_LOG_PATH = Path(os.environ.get("DEBUG_LOG_PATH", str(_DEFAULT)))


def agent_log(location: str, message: str, data: dict | None = None, hypothesis_id: str = "", run_id: str = "pre-fix") -> None:
    # #region agent log
    try:
        entry = {
            "sessionId": SESSION_ID,
            "location": location,
            "message": message,
            "data": data or {},
            "hypothesisId": hypothesis_id,
            "runId": run_id,
            "timestamp": int(time.time() * 1000),
        }
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")
    except Exception:
        pass
    # #endregion
