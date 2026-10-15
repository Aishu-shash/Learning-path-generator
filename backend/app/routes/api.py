from flask import Blueprint, jsonify, make_response, request
from ..services.workspace import delete_workspace, get_workspace, save_workspace
from ..ai.gemini import generate_roadmap, answer_question, GeminiError

api = Blueprint("api", __name__)


@api.get("/health")
def health():
    import os
    return jsonify(status="ok", configured=bool(os.getenv("GEMINI_API_KEY", "").strip()), geminiConfigured=bool(os.getenv("GEMINI_API_KEY", "").strip()), workspaceSyncReady=True)


@api.route("/workspace", methods=["GET", "POST", "DELETE"])
def workspace():
    session_id = request.cookies.get("learnpath_session")
    response = None
    if not session_id:
        import uuid
        session_id = str(uuid.uuid4())
        response = make_response()
        response.set_cookie("learnpath_session", session_id, httponly=True, samesite="Strict", max_age=31536000)
    if request.method == "GET":
        result = jsonify(workspace=get_workspace(session_id))
    elif request.method == "POST":
        save_workspace(session_id, request.get_json(silent=True))
        result = jsonify(saved=True)
    else:
        delete_workspace(session_id)
        result = jsonify(deleted=True)
    if response:
        response.response = result.response
        response.status_code = result.status_code
        response.headers.extend(result.headers)
        return response
    return result


@api.post("/generate")
def generate():
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(roadmap=generate_roadmap(body.get("learner")))
    except (ValueError, GeminiError) as error:
        return jsonify(error=str(error)), getattr(error, "status", 400 if isinstance(error, ValueError) else 502)


@api.post("/chat")
def chat():
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(answer=answer_question(body.get("message"), body.get("history", [])), roadmap_updated=None)
    except (ValueError, GeminiError) as error:
        return jsonify(error=str(error)), getattr(error, "status", 400 if isinstance(error, ValueError) else 502)
