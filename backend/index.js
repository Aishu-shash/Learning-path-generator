const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(projectRoot, "frontend");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) continue;
    const separator = entry.indexOf("=");
    if (separator < 1) continue;
    const key = entry.slice(0, separator).trim();
    let value = entry.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, ".env"));
loadEnv(path.join(projectRoot, ".env"));

const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const maxBodyBytes = 64 * 1024;
const staticFiles = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/new.html": { file: "new.html", type: "text/html; charset=utf-8" },
  "/script.js": { file: "script.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
};

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function getWorkspaceId(request, response) {
  const cookie = request.headers.cookie || "";
  const match = /(?:^|;\s*)learnpath_session=([0-9a-f-]{36})(?:;|$)/i.exec(cookie);
  if (match) return match[1];
  const id = crypto.randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `learnpath_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`);
  return id;
}

function requireSupabase() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const error = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
    error.status = 503;
    throw error;
  }
  return { url, key };
}

async function supabaseRequest(pathname, options = {}) {
  const { url, key } = requireSupabase();
  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`Supabase request failed (${response.status}).`, detail);
    throw new Error(`Supabase request failed (${response.status}). Check backend logs and Supabase configuration.`);
  }
  return response;
}

function validateWorkspace(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !value.learner ||
    typeof value.learner !== "object" ||
    !value.roadmap ||
    typeof value.roadmap !== "object" ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.completedIds)
  ) {
    throw new Error("Workspace data has an unexpected format.");
  }
  return value;
}

async function routeWorkspace(request, response) {
  const id = getWorkspaceId(request, response);
  const query = `learnpath_workspaces?id=eq.${encodeURIComponent(id)}&select=data`;
  try {
    if (request.method === "GET") {
      const result = await supabaseRequest(query);
      const rows = await result.json();
      return sendJson(response, 200, { workspace: rows.length ? rows[0].data : null });
    }
    if (request.method === "POST") {
      const workspace = validateWorkspace(await readBody(request));
      await supabaseRequest(`learnpath_workspaces?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id, data: workspace, updated_at: new Date().toISOString() }),
      });
      return sendJson(response, 200, { saved: true });
    }
    if (request.method === "DELETE") {
      await supabaseRequest(query, { method: "DELETE" });
      return sendJson(response, 200, { deleted: true });
    }
    response.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const status = error.status || (error.message.includes("unexpected format") ? 400 : 502);
    if (status >= 500) console.error("Learnpath workspace request failed.", error);
    return sendJson(response, status, { error: error.message || "Could not access the saved workspace." });
  }
}

function text(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  if (value.trim().length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return value.trim();
}

function validateLearner(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Learner details are required.");
  const targetDate = text(value.target_date, "Target date", 10);
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  const target = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(Number.NaN);
  const normalizedTargetDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!dateParts || Number.isNaN(target.getTime()) || normalizedTargetDate !== targetDate || target <= today) {
    throw new Error("Choose a valid target date in the future.");
  }
  if (typeof value.hours_per_day !== "number" || !Number.isFinite(value.hours_per_day) || value.hours_per_day < 0.5 || value.hours_per_day > 12) {
    throw new Error("Daily study time must be between 0.5 and 12 hours.");
  }
  const knowledge = value.knowledge === undefined ? "" : value.knowledge;
  if (typeof knowledge !== "string" || knowledge.length > 1200) throw new Error("Existing knowledge must be 1,200 characters or fewer.");
  return {
    name: text(value.name, "Name", 80),
    goal: text(value.goal, "Learning goal", 200),
    level: text(value.level, "Current level", 40),
    target_date: targetDate,
    hours_per_day: value.hours_per_day,
    learning_style: text(value.learning_style, "Learning style", 100),
    knowledge,
  };
}

function isRoadmap(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.estimated_duration === "string" &&
    Array.isArray(value.phases) &&
    value.phases.length > 0 &&
    value.phases.every((phase) => phase && typeof phase === "object" && Array.isArray(phase.topics) && Array.isArray(phase.tasks) && Array.isArray(phase.resources)) &&
    Array.isArray(value.weekly_schedule) &&
    Array.isArray(value.daily_schedule) &&
    Array.isArray(value.resources)
  );
}

function roadmapPrompt(learner) {
  return `Create a practical, personalized learning roadmap for this goal. It may be any subject: exam preparation, school or college subjects, languages, business, arts, science, or technical skills. Do not assume it is technology-related or use a canned curriculum.

LEARNER
Name: ${learner.name}
Goal: ${learner.goal}
Current level: ${learner.level}
Existing knowledge and gaps: ${learner.knowledge || "Not specified; include a short diagnostic and reasonable assumptions."}
Target date: ${learner.target_date}
Available study time: ${learner.hours_per_day} hours per day
Preferred style: ${learner.learning_style}

Return one JSON object with exactly this format:
{
  "title": "short roadmap title",
  "summary": "encouraging, tailored overview",
  "estimated_duration": "human-readable duration",
  "target_date": "${learner.target_date}",
  "phases": [
    {
      "title": "phase name",
      "duration": "duration or date range",
      "objective": "measurable outcome",
      "topics": [{"title": "topic", "description": "what to understand"}],
      "tasks": [{"title": "actionable task", "description": "completion criteria", "duration_minutes": 45}],
      "resources": [{"title": "resource name", "type": "article|video|course|book|practice|official", "url": "https://...", "why": "why it fits"}]
    }
  ],
  "weekly_schedule": [{"week": "Week 1", "focus": "focus", "study_hours": 8, "activities": ["specific activity"]}],
  "daily_schedule": [{"activity": "activity", "duration_minutes": 40, "description": "what to do"}],
  "resources": [{"title": "resource name", "type": "article|video|course|book|practice|official", "url": "https://...", "why": "why it fits"}]
}

Order phases by prerequisites and fit them between today and the target date. Keep weekly study realistic, include a lighter/rest day if feasible, and make daily blocks fit the learner's time with short breaks, recall/revision and practice. Add mock tests only where appropriate. Recommend credible resources, preferring official sources. Include URLs only when confident they are valid; otherwise use an empty URL. Include specific tasks in each phase. Return JSON only.`;
}

async function callGemini(contents, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Gemini is not configured. Add GEMINI_API_KEY to backend/.env, then restart with `npm run dev`.");
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.65,
            maxOutputTokens: 16384,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(90000),
      },
    );
  } catch (error) {
    console.error("Gemini network request failed.", error);
    const failure = new Error("Could not connect to Gemini. Check the server's internet connection and try again.");
    failure.status = 502;
    throw failure;
  }
  if (!response.ok) {
    const messages = {
      400: "Gemini rejected this request. Check the configured model and try again.",
      401: "Gemini rejected the API key. Check GEMINI_API_KEY in backend/.env, then restart the API server.",
      403: "Gemini denied this API key. Check its permissions and API access in Google AI Studio.",
      429: "Gemini quota or rate limit reached. Check your Google AI quota and retry later.",
    };
    console.error(`Gemini returned HTTP ${response.status}.`);
    const failure = new Error(messages[response.status] || "Gemini could not complete the request. Check the API status and retry.");
    failure.status = [400, 401, 403, 429].includes(response.status) ? response.status : 502;
    throw failure;
  }
  const payload = await response.json();
  const candidate = payload?.candidates?.[0];
  const result = candidate?.content?.parts?.map((part) => part.text || "").join("");
  if (typeof result !== "string" || !result.trim()) {
    console.error("Gemini returned no text.", { finishReason: candidate?.finishReason || "unknown", usage: payload?.usageMetadata || null });
    const error = new Error("Gemini returned an empty response. Please retry.");
    error.status = 502;
    throw error;
  }
  try {
    const parsed = JSON.parse(result);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Unexpected JSON response.");
    return parsed;
  } catch (error) {
    console.error("Could not parse Gemini JSON response.", {
      finishReason: candidate?.finishReason || "unknown",
      responseLength: result.length,
      usage: payload?.usageMetadata || null,
    });
    const failure = new Error(candidate?.finishReason === "MAX_TOKENS"
      ? "Gemini stopped before finishing the response. Try a shorter goal or try again."
      : "Gemini returned an unreadable response. Please retry.");
    failure.status = 502;
    throw failure;
  }
}

async function generatePath(body) {
  const learner = validateLearner(body.learner);
  const roadmap = await callGemini(
    [{ role: "user", parts: [{ text: roadmapPrompt(learner) }] }],
    "You are an expert learning designer. Create accurate, inclusive, actionable study plans in the requested JSON format.",
  );
  if (!isRoadmap(roadmap)) {
    const error = new Error("Gemini returned an incomplete roadmap. Please retry.");
    error.status = 502;
    throw error;
  }
  roadmap.target_date = learner.target_date;
  return { roadmap };
}

async function answerChat(body) {
  const message = text(body.message, "Question", 2000);
  const history = body.history === undefined ? [] : body.history;
  if (!Array.isArray(history) || history.length > 12) throw new Error("Chat history must contain no more than 12 messages.");
  const contents = history.map((item) => {
    if (!item || typeof item !== "object" || !["user", "assistant"].includes(item.role)) throw new Error("Chat history contains an invalid message.");
    return { role: item.role === "assistant" ? "model" : "user", parts: [{ text: text(item.content, "Chat message", 2000) }] };
  });
  contents.push({ role: "user", parts: [{ text: message }] });
  const learner = body.learner && typeof body.learner === "object" ? body.learner : {};
  const roadmap = body.roadmap && typeof body.roadmap === "object" ? body.roadmap : null;
  const result = await callGemini(
    contents,
    `You are a warm, precise personal learning assistant. Explain ideas at the learner's level and use examples.
Learner details: ${JSON.stringify(learner).slice(0, 3000)}
Current roadmap: ${JSON.stringify(roadmap).slice(0, 10000)}
Return JSON with exactly "answer" (helpful plain-text response) and "roadmap_updated" (null or a complete updated roadmap object in the same schema). Only update the roadmap if explicitly requested. If there is no active roadmap, always return null. Never claim a change unless returning the full updated roadmap.`,
  );
  if (typeof result.answer !== "string" || !result.answer.trim()) {
    const error = new Error("Gemini returned an incomplete answer. Please retry.");
    error.status = 502;
    throw error;
  }
  if (result.roadmap_updated != null && !isRoadmap(result.roadmap_updated)) {
    const error = new Error("Gemini returned an incomplete roadmap change. Please retry.");
    error.status = 502;
    throw error;
  }
  return { answer: result.answer.trim(), roadmap_updated: result.roadmap_updated || null };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request is too large. Shorten your input and try again.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object.");
    return parsed;
  } catch (error) {
    const failure = new Error("Request must contain a valid JSON object.");
    failure.status = 400;
    throw failure;
  }
}

async function routeApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/health") {
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
    const supabaseConfigured = Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    return sendJson(response, 200, { status: "ok", configured: geminiConfigured, geminiConfigured, supabaseConfigured });
  }
  if (pathname === "/api/workspace") return routeWorkspace(request, response);
  if (request.method !== "POST" || !["/api/generate", "/api/chat"].includes(pathname)) {
    return sendJson(response, 404, { error: "API route not found." });
  }
  try {
    const body = await readBody(request);
    const result = pathname === "/api/generate" ? await generatePath(body) : await answerChat(body);
    return sendJson(response, 200, result);
  } catch (error) {
    const status = error.status || (
      error.message.includes("required") ||
      error.message.includes("must be") ||
      error.message.includes("valid target date") ||
      error.message.includes("invalid message") ||
      error.message.includes("invalid role")
        ? 400
        : 502
    );
    if (status >= 500) console.error("Learnpath API request failed.", error);
    return sendJson(response, status, { error: error.message || "The AI request failed. Please retry." });
  }
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
  if (pathname.startsWith("/api/")) return routeApi(request, response, pathname);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (pathname === "/runtime-config.js") {
    const apiBaseUrl = (process.env.VITE_API_BASE_URL || "").replace(/\\/g, "").replace(/'/g, "");
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    return response.end(`window.LEARNPATH_CONFIG = { apiBaseUrl: '${apiBaseUrl}' };`);
  }
  const asset = staticFiles[pathname];
  if (!asset) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found.");
  }
  try {
    const contents = await fs.promises.readFile(path.join(frontendRoot, asset.file));
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    return response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    console.error(`Could not serve ${asset.file}.`, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Could not load the app file.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Learnpath is ready at http://127.0.0.1:${port}`);
  if (!process.env.GEMINI_API_KEY?.trim()) console.warn("GEMINI_API_KEY is missing. Add it to backend/.env to enable AI generation.");
});
