import json
import os
import re
from pathlib import Path

DATA_DIR = Path(os.getenv("LEARNPATH_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
ID_RE = re.compile(r"^[0-9a-f-]{36}$", re.I)


def _path(session_id):
    if not session_id or not ID_RE.fullmatch(session_id):
        raise ValueError("Invalid workspace session.")
    return DATA_DIR / f"{session_id}.json"


def get_workspace(session_id):
    path = _path(session_id)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def save_workspace(session_id, value):
    if not isinstance(value, dict) or not isinstance(value.get("learner"), dict) or not isinstance(value.get("roadmap"), dict) or not isinstance(value.get("tasks"), list) or not isinstance(value.get("completedIds"), list):
        raise ValueError("Workspace data has an unexpected format.")
    path = _path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def delete_workspace(session_id):
    _path(session_id).unlink(missing_ok=True)
