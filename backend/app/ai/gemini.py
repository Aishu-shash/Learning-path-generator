import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

logger = logging.getLogger(__name__)


class GeminiError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _text(value, label, limit):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} is required.")
    if len(value.strip()) > limit:
        raise ValueError(f"{label} must be {limit} characters or fewer.")
    return value.strip()


def _call(contents, system):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise GeminiError("Gemini is not configured. Set GEMINI_API_KEY in the project .env file.", 503)
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model, safe='')}:generateContent?key={urllib.parse.quote(key)}"
    payload = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
               "generationConfig": {"responseMimeType": "application/json", "temperature": 0.65, "maxOutputTokens": 16384}}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        logger.error("Gemini returned HTTP %s during an API request.", error.code)
        messages = {400: "Gemini rejected this request. Check the configured model.", 401: "Gemini rejected the API key. Check GEMINI_API_KEY.", 403: "Gemini denied this API key. Check its permissions.", 429: "Gemini quota or rate limit reached."}
        raise GeminiError(messages.get(error.code, f"Gemini request failed (HTTP {error.code})."), error.code if error.code in (400, 401, 403, 429) else 502) from error
    except (urllib.error.URLError, TimeoutError) as error:
        logger.error("Could not connect to Gemini: %s", getattr(error, "reason", "request timed out"))
        raise GeminiError("Could not connect to Gemini. Check the server's internet connection and try again.") from error
    try:
        text = "".join(part.get("text", "") for part in result["candidates"][0]["content"]["parts"])
        return json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise GeminiError("Gemini returned an empty or unreadable response. Please retry.") from error


def generate_roadmap(learner):
    if not isinstance(learner, dict):
        raise ValueError("Learner details are required.")
    goal = _text(learner.get("goal"), "Learning goal", 200)
    name = _text(learner.get("name"), "Name", 80)
    level = _text(learner.get("level"), "Level", 30)
    target = _text(learner.get("target_date"), "Target date", 10)
    try:
        if date.fromisoformat(target) < date.today():
            raise ValueError()
    except ValueError as error:
        raise ValueError("Please choose a valid target date in the future.") from error
    hours = float(learner.get("hours_per_day", 2))
    if not 0.5 <= hours <= 12:
        raise ValueError("Study time must be between 0.5 and 12 hours per day.")
    safe_learner = {"name": name, "goal": goal, "level": level, "target_date": target, "hours_per_day": hours,
                    "knowledge": str(learner.get("knowledge", ""))[:1200], "learning_style": str(learner.get("learning_style", "Mixed learning styles"))[:80]}
    prompt = f'''Create a realistic, personalized study roadmap for this learner: {json.dumps(safe_learner)}.
Return one JSON object with keys title, summary, phases, weekly_schedule, daily_schedule, resources, target_date.
Each phase must have title, duration, objective, topics (array of {{title, description}}), tasks (array of {{title, description, duration_minutes}}), and resources (array of {{title,type,url,why}}).
weekly_schedule items: week, focus, study_hours, activities. daily_schedule items: activity, duration_minutes, description.
resources items: title,type,url,why. Provide 4-6 credible, directly relevant resources across the overall roadmap, and include resources in individual phases where useful. Include YouTube when it is a good fit, but do not make it the only source: include at least two non-YouTube options such as official documentation, reputable courses, books, or hands-on practice platforms. Choose resources appropriate to the learner's goal and level. Never invent URLs: use a known canonical URL or leave url empty if unsure. Keep tasks actionable, time realistic, and include rest and review time where useful. JSON only.'''
    roadmap = _call([{"role": "user", "parts": [{"text": prompt}]}], "You are an expert learning designer. Return accurate, inclusive, actionable study plans in the requested JSON format.")
    if not isinstance(roadmap, dict) or not isinstance(roadmap.get("phases"), list):
        raise GeminiError("Gemini returned an incomplete roadmap. Please retry.")
    roadmap["target_date"] = target
    roadmap.setdefault("title", goal)
    roadmap.setdefault("summary", f"A personalized path for {name} to learn {goal}.")
    roadmap.setdefault("weekly_schedule", [])
    roadmap.setdefault("daily_schedule", [])
    roadmap.setdefault("resources", [])
    return roadmap


def answer_question(message, history=None):
    message = _text(message, "Question", 2000)
    history = history or []
    if not isinstance(history, list) or len(history) > 12:
        raise ValueError("Chat history must contain no more than 12 messages.")
    contents = []
    for item in history:
        if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
            raise ValueError("Chat history contains an invalid message.")
        role = "model" if item["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": _text(item.get("content"), "Chat message", 2000)}]})
    contents.append({"role": "user", "parts": [{"text": message}]})
    result = _call(contents, "You are a helpful learning coach. Give clear, concise answers. Return JSON with a single string key named answer.")
    if not isinstance(result, dict) or not isinstance(result.get("answer"), str):
        raise GeminiError("Gemini returned an invalid answer. Please retry.")
    return result["answer"]
