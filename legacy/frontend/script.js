const STORAGE_KEY = "learnpath.workspace.v1";
const $ = (selector) => document.querySelector(selector);
const form = $("#generator-form");
const modal = $("#generator-modal");
const loadingOverlay = $("#loading-overlay");
const API_BASE_URL = (window.LEARNPATH_CONFIG && window.LEARNPATH_CONFIG.apiBaseUrl) || "";
let workspace = null;
let chatHistory = [];
let chatBusy = false;
let backendReady = false;
let workspaceSyncReady = false;
let backendError = "Start the Node.js API server with `npm run dev`.";
let workspaceSaveQueue = Promise.resolve();

function makeId() {
  return window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function safeText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, options).format(parsed);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : ""}`;
  toast.textContent = message;
  $("#toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3800);
}

async function persistWorkspace(notify = false) {
  if (!workspace) return false;
  const snapshot = JSON.stringify(workspace);
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch (error) {
    console.error("Could not save Learnpath workspace.", error);
    showToast("Could not cache your workspace in this browser. Check available storage and try again.", "error");
    return false;
  }
  if (!workspaceSyncReady) {
    if (notify) showToast("Saved in this browser only. The local sync server is unavailable.");
    return true;
  }
  const saveRequest = workspaceSaveQueue.catch(() => {}).then(async () => {
    const response = await fetch(`${API_BASE_URL}/api/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: snapshot,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Workspace save failed (${response.status}).`);
  });
  workspaceSaveQueue = saveRequest;
  try {
    await saveRequest;
    if (notify) showToast("Your roadmap and progress are saved on this server.");
    return true;
  } catch (error) {
    console.error("Could not save Learnpath workspace to the local server.", error);
    workspaceSyncReady = false;
    showServiceNotice("Server sync is unavailable. Your learning path and progress are saved in this browser.", "info");
    showToast(`Server sync failed; saved in this browser instead. ${error.message || "Check that the server is running."}`, "error");
    return true;
  }
}

function showServiceNotice(message, type = "info") {
  const notice = $("#service-notice");
  notice.textContent = message;
  notice.className = `service-notice service-${type}`;
  notice.hidden = false;
}

async function invokeAI(body) {
  if (!backendReady) throw new Error(backendError);
  const response = await fetch(`${API_BASE_URL}/api/${body.action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`The AI server returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(result.error || `AI request failed (${response.status}).`);
  if (!result || typeof result !== "object") throw new Error("The AI server returned an empty response.");
  return result;
}

async function checkApiServer() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Health check failed (${response.status}).`);
    backendReady = Boolean(result.geminiConfigured);
    workspaceSyncReady = Boolean(result.workspaceSyncReady);
    backendError = backendReady ? "" : "Set GEMINI_API_KEY in backend/.env and restart the server.";
    if (!backendReady) {
      showServiceNotice(`Gemini setup needed: ${backendError} Your workspace still saves on this server.`, "error");
    } else if (!workspaceSyncReady) {
      showServiceNotice("Gemini AI is ready. Server sync is unavailable; workspace data is saved in this browser.", "info");
    } else showServiceNotice("Gemini AI and local workspace sync are ready. Your data is saved on this server.", "success");
    return result;
  } catch (error) {
    backendReady = false;
    workspaceSyncReady = false;
    backendError = error instanceof TypeError
      ? "Could not reach the Node.js API. In the project folder, run `npm run dev` and open http://127.0.0.1:3000."
      : error.message || "The AI server is not ready.";
    showServiceNotice(`AI server setup needs attention: ${backendError}`, "error");
    return null;
  }
}

async function loadServerWorkspace() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/workspace`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Workspace load failed (${response.status}).`);
    if (result.workspace) {
      workspace = result.workspace;
      render();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch (error) {
        console.error("Could not cache the server workspace in this browser.", error);
        showToast("Your server workspace loaded, but could not be cached in this browser.", "error");
      }
      return;
    }
    if (workspace) {
      if (await persistWorkspace()) showToast("Your existing browser workspace was copied to this server.");
      return;
    }
    workspace = null;
    render();
  } catch (error) {
    console.error("Could not load Learnpath workspace from the local server.", error);
    workspaceSyncReady = false;
    showServiceNotice("Server sync is unavailable. Your learning path and progress are saved in this browser.", "info");
    showToast(`Could not load from the server; using this browser's saved workspace. ${error.message || "Check that the server is running."}`, "error");
  }
}

function loadWorkspace() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || !parsed.roadmap || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.completedIds)) {
      throw new Error("Saved data has an unexpected format.");
    }
    return parsed;
  } catch (error) {
    console.error("Could not read Learnpath workspace.", error);
    showToast("Saved learning data could not be read. Create a new path to continue.", "error");
    return null;
  }
}

function setLoading(isLoading) {
  loadingOverlay.hidden = !isLoading;
  $("#generate-button").disabled = isLoading;
}

function displayFormError(message, retry = false) {
  const errorBox = $("#form-error");
  errorBox.replaceChildren();
  addNode(errorBox, "span", "", message);
  if (retry) {
    const button = addNode(errorBox, "button", "inline-retry", "Try again");
    button.type = "button";
    button.addEventListener("click", () => form.requestSubmit());
  }
  errorBox.hidden = false;
}

function openModal(target = modal) {
  target.hidden = false;
  document.body.classList.add("modal-open");
  const focusable = target.querySelector("input, textarea, select, button");
  if (focusable) window.setTimeout(() => focusable.focus(), 30);
}

function closeModal(target) {
  target.hidden = true;
  document.body.classList.remove("modal-open");
}

function addNode(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  parent.append(node);
  return node;
}

function normaliseRoadmap(roadmap) {
  const pathId = makeId();
  const phases = Array.isArray(roadmap.phases) ? roadmap.phases : [];
  const dateValue = roadmap.target_date || (workspace && workspace.learner.target_date) || new Date().toISOString().slice(0, 10);
  const endDate = new Date(`${dateValue}T12:00:00`);
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const span = Math.max(1, endDate.getTime() - startDate.getTime());
  const generatedTasks = [];
  phases.forEach((phase, phaseIndex) => {
    (Array.isArray(phase.tasks) ? phase.tasks : []).forEach((task, taskIndex) => {
      const proportion = phases.length <= 1 ? 0 : phaseIndex / (phases.length - 1);
      const dueDate = new Date(startDate.getTime() + span * proportion);
      generatedTasks.push({
        id: `${pathId}-${phaseIndex}-${taskIndex}`,
        title: safeText(task.title, `Study ${safeText(phase.title, "learning topic")}`),
        description: safeText(task.description),
        date: localDateString(dueDate),
        phase: safeText(phase.title),
        duration_minutes: Number.isFinite(task.duration_minutes) ? task.duration_minutes : null,
        custom: false,
      });
    });
  });
  return {
    ...roadmap,
    phases,
    weekly_schedule: Array.isArray(roadmap.weekly_schedule) ? roadmap.weekly_schedule : [],
    daily_schedule: Array.isArray(roadmap.daily_schedule) ? roadmap.daily_schedule : [],
    resources: Array.isArray(roadmap.resources) ? roadmap.resources : [],
    tasks: generatedTasks,
  };
}

function allTasks() {
  if (!workspace) return [];
  return [...(workspace.roadmap.tasks || []), ...(workspace.tasks || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

function render() {
  const hasWorkspace = Boolean(workspace && workspace.roadmap);
  $("#empty-state").hidden = hasWorkspace;
  $("#dashboard").hidden = !hasWorkspace;
  if (!hasWorkspace) return;

  const learner = workspace.learner || {};
  const roadmap = workspace.roadmap;
  const tasks = allTasks();
  const completedIds = new Set(workspace.completedIds);
  const completed = tasks.filter((task) => completedIds.has(task.id)).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  $("#profile-name").textContent = safeText(learner.name, "Your learning space");
  $("#profile-avatar").textContent = safeText(learner.name, "Y").trim().charAt(0).toUpperCase() || "Y";
  $("#welcome-title").textContent = `Welcome back, ${safeText(learner.name, "learner")}.`;
  $("#roadmap-title").textContent = safeText(roadmap.title, safeText(learner.goal, "Your learning path"));
  $("#roadmap-summary").textContent = safeText(roadmap.summary);
  $("#duration-chip").textContent = `◷ ${safeText(roadmap.estimated_duration, "Personalized timeline")}`;
  $("#level-chip").textContent = `✳ ${safeText(learner.level, "Your level")}`;
  $("#daily-target").textContent = Number(learner.hours_per_day || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
  $("#target-date-label").textContent = learner.target_date ? `Target ${formatDate(learner.target_date, { month: "short", day: "numeric", year: "numeric" })}` : "Set your intention";
  $("#progress-value").textContent = `${percent}%`;
  $("#overall-progress-bar").style.width = `${percent}%`;
  $("#progress-caption").textContent = percent === 100 ? "A goal worth celebrating!" : `${tasks.length - completed} steps to keep moving`;
  $("#completed-count").textContent = completed;
  $("#task-total").textContent = ` / ${tasks.length}`;
  $("#nav-task-count").textContent = String(tasks.filter((task) => !completedIds.has(task.id)).length);
  renderPhases(roadmap.phases);
  renderTasks(tasks, completedIds);
  renderSchedule(roadmap);
  renderUpcoming(tasks, completedIds);
  renderResources(roadmap.resources);
}

function renderPhases(phases) {
  const list = $("#phase-list");
  list.replaceChildren();
  phases.forEach((phase, index) => {
    const card = addNode(list, "article", "phase-card");
    addNode(card, "div", "phase-number", String(index + 1).padStart(2, "0")).setAttribute("aria-hidden", "true");
    const content = addNode(card, "div", "phase-content");
    const head = addNode(content, "div", "phase-title-row");
    addNode(head, "h3", "", safeText(phase.title, `Phase ${index + 1}`));
    addNode(head, "span", "phase-duration", safeText(phase.duration));
    addNode(content, "p", "phase-objective", safeText(phase.objective));
    if (Array.isArray(phase.topics) && phase.topics.length) {
      const topics = addNode(content, "div", "topic-chips");
      phase.topics.forEach((topic) => addNode(topics, "span", "topic-chip", safeText(topic.title, topic)));
    }
    const taskCount = Array.isArray(phase.tasks) ? phase.tasks.length : 0;
    addNode(content, "div", "phase-foot", `${taskCount} ${taskCount === 1 ? "guided task" : "guided tasks"}`);
  });
}

function renderTasks(tasks, completedIds) {
  const list = $("#task-list");
  list.replaceChildren();
  if (!tasks.length) {
    addNode(list, "p", "empty-tasks", "No tasks yet. Add a small step to get started.");
    return;
  }
  tasks.forEach((task) => {
    const done = completedIds.has(task.id);
    const row = addNode(list, "article", `task-row${done ? " task-done" : ""}`);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = done;
    checkbox.setAttribute("aria-label", `${done ? "Mark incomplete" : "Mark complete"}: ${task.title}`);
    checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));
    row.append(checkbox);
    const detail = addNode(row, "div", "task-detail");
    addNode(detail, "strong", "task-title", task.title);
    if (task.description) addNode(detail, "span", "task-description", task.description);
    const labels = [];
    if (task.phase) labels.push(task.phase);
    if (task.duration_minutes) labels.push(`${task.duration_minutes} min`);
    addNode(detail, "small", "task-meta", labels.join(" · ") || "Personal task");
    addNode(row, "time", "task-due", task.date === localDateString() ? "Today" : formatDate(task.date));
    if (task.custom) {
      const remove = addNode(row, "button", "task-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete task: ${task.title}`);
      remove.addEventListener("click", () => removeTask(task.id));
    }
  });
}

function renderUpcoming(tasks, completedIds) {
  const container = $("#upcoming-task");
  container.replaceChildren();
  const task = tasks.find((item) => !completedIds.has(item.id));
  if (!task) {
    addNode(container, "div", "upcoming-empty", tasks.length ? "Everything is complete. Take a moment to celebrate." : "Your next task will appear here.");
    return;
  }
  addNode(container, "span", "upcoming-date", task.date === localDateString() ? "TODAY'S NEXT STEP" : `NEXT · ${formatDate(task.date).toUpperCase()}`);
  addNode(container, "h3", "", task.title);
  if (task.description) addNode(container, "p", "", task.description);
  const start = addNode(container, "button", "start-task-button", "Mark complete");
  start.type = "button";
  start.addEventListener("click", () => toggleTask(task.id, true));
}

function renderSchedule(roadmap) {
  const list = $("#schedule-list");
  list.replaceChildren();
  addNode(list, "div", "schedule-subhead", "DAILY RHYTHM");
  if (roadmap.daily_schedule.length) {
    roadmap.daily_schedule.forEach((item) => {
      const row = addNode(list, "div", "schedule-item");
      const duration = Number(item.duration_minutes);
      addNode(row, "span", "schedule-time", Number.isFinite(duration) ? `${duration}m` : "•");
      const text = addNode(row, "div", "schedule-detail");
      addNode(text, "strong", "", safeText(item.activity, "Study session"));
      addNode(text, "span", "", safeText(item.description));
    });
  } else {
    addNode(list, "p", "schedule-empty", "Your daily study rhythm will appear here.");
  }
  if (roadmap.weekly_schedule.length) {
    addNode(list, "div", "schedule-subhead weekly-subhead", "WEEK BY WEEK");
    roadmap.weekly_schedule.slice(0, 8).forEach((week) => {
      const row = addNode(list, "div", "week-item");
      const detail = addNode(row, "div", "");
      addNode(detail, "strong", "", safeText(week.week, "This week"));
      addNode(detail, "span", "", safeText(week.focus));
      if (Number.isFinite(Number(week.study_hours))) addNode(row, "span", "week-hours", `${week.study_hours}h`);
    });
  }
}

function renderResources(resources) {
  const list = $("#resources-list");
  list.replaceChildren();
  if (!resources.length) {
    addNode(list, "p", "resource-empty", "Your recommended resources will appear here.");
    return;
  }
  resources.slice(0, 5).forEach((resource) => {
    const card = addNode(list, "article", "resource-card");
    addNode(card, "span", "resource-type", safeText(resource.type, "RESOURCE"));
    addNode(card, "strong", "", safeText(resource.title, "Recommended resource"));
    addNode(card, "p", "", safeText(resource.why));
    if (typeof resource.url === "string" && /^https?:\/\//i.test(resource.url)) {
      const link = addNode(card, "a", "resource-link", "Explore resource ↗");
      link.href = resource.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

function toggleTask(id, isComplete) {
  const ids = new Set(workspace.completedIds);
  if (isComplete) ids.add(id);
  else ids.delete(id);
  workspace.completedIds = [...ids];
  persistWorkspace();
  render();
}

async function removeTask(id) {
  workspace.tasks = workspace.tasks.filter((task) => task.id !== id);
  workspace.completedIds = workspace.completedIds.filter((completedId) => completedId !== id);
  render();
  if (await persistWorkspace()) showToast("Task removed.");
}

async function generatePath(event) {
  if (event) event.preventDefault();
  if (!form.reportValidity()) return;
  $("#form-error").hidden = true;
  if (!backendReady) {
    displayFormError(backendError);
    return;
  }
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.hours_per_day = Number(payload.hours_per_day);
  payload.knowledge = payload.knowledge.trim();
  setLoading(true);
  try {
    const result = await invokeAI({ action: "generate", learner: payload });
    workspace = {
      learner: payload,
      roadmap: normaliseRoadmap(result.roadmap),
      tasks: [],
      completedIds: [],
    };
    chatHistory = [];
    $("#chat-messages").replaceChildren();
    addChatMessage("assistant", "Your new learning path is ready. Ask me to explain a topic or make a change whenever you need.");
    if (!await persistWorkspace()) throw new Error("The path was generated but could not be saved.");
    render();
    closeModal(modal);
    showToast(workspaceSyncReady
      ? "Your personalized learning path is ready and saved on this server."
      : "Your personalized learning path is ready and saved in this browser.");
    $("#roadmap").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const message = error.message || "Gemini could not generate your learning path. Check the Edge Function and try again.";
    displayFormError(message, true);
  } finally {
    setLoading(false);
  }
}

function addChatMessage(role, content, retryAction = null) {
  const messages = $("#chat-messages");
  const bubble = addNode(messages, "div", `chat-bubble ${role === "user" ? "user-bubble" : "assistant-bubble"}`, content);
  if (retryAction) {
    const retry = addNode(bubble, "button", "chat-retry", "Retry");
    retry.type = "button";
    retry.addEventListener("click", retryAction, { once: true });
  }
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendChatMessage(event) {
  if (event) event.preventDefault();
  if (chatBusy) return;
  const input = $("#chat-input");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  addChatMessage("user", message);
  await requestChat(message);
}

async function requestChat(message) {
  chatBusy = true;
  $("#chat-send").disabled = true;
  const typing = addChatMessage("assistant", "Thinking…");
  try {
    const result = await invokeAI({
      action: "chat",
      message,
      history: chatHistory.slice(-12),
      learner: workspace ? workspace.learner : {},
      roadmap: workspace ? workspace.roadmap : null,
    });
    typing.remove();
    if (typeof result.answer !== "string" || !result.answer.trim()) {
      throw new Error("Gemini returned an empty answer. Please retry.");
    }
    chatHistory.push({ role: "user", content: message }, { role: "assistant", content: result.answer });
    addChatMessage("assistant", result.answer);
    if (result.roadmap_updated && workspace) {
      const priorTasks = new Map((workspace.roadmap.tasks || []).map((task) => [task.title, task]));
      const updatedRoadmap = normaliseRoadmap(result.roadmap_updated);
      updatedRoadmap.tasks = updatedRoadmap.tasks.map((task) => {
        const previous = priorTasks.get(task.title);
        return previous ? { ...task, id: previous.id } : task;
      });
      const validIds = new Set(updatedRoadmap.tasks.map((task) => task.id));
      workspace.roadmap = updatedRoadmap;
      workspace.completedIds = workspace.completedIds.filter((id) => validIds.has(id) || workspace.tasks.some((task) => task.id === id));
      if (!await persistWorkspace()) throw new Error("I updated the roadmap, but could not save it.");
      render();
      addChatMessage("assistant", "I've updated the roadmap to match your request, and saved the changes.");
    }
  } catch (error) {
    typing.remove();
    addChatMessage("assistant", `I couldn't reach the AI assistant: ${error.message || "please check the Node API and Gemini setup, then try again."}`, () => requestChat(message));
  } finally {
    chatBusy = false;
    $("#chat-send").disabled = false;
    $("#chat-input").focus();
  }
}

async function addCustomTask(event) {
  event.preventDefault();
  const title = $("#task-title-input").value.trim();
  const taskDate = $("#task-date-input").value;
  if (!title || !taskDate) return;
  workspace.tasks.push({ id: makeId(), title, date: taskDate, phase: "Personal task", custom: true });
  render();
  closeModal($("#task-modal"));
  $("#task-form").reset();
  $("#task-date-input").value = localDateString();
  if (await persistWorkspace()) showToast("Your task has been added.");
}

async function resetProgress() {
  if (!workspace || !window.confirm("Reset all completed tasks for this learning path? Your roadmap and tasks will stay saved.")) return;
  workspace.completedIds = [];
  render();
  $("#roadmap-menu").hidden = true;
  if (await persistWorkspace()) showToast("Progress reset. Your roadmap is ready for a fresh start.");
}

function setInitialDates() {
  const today = new Date();
  const todayString = localDateString(today);
  $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(today);
  $("#focus-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(today);
  $("#target-date").min = todayString;
  const suggested = new Date(today);
  suggested.setDate(suggested.getDate() + 60);
  $("#target-date").value = localDateString(suggested);
  $("#task-date-input").min = todayString;
  $("#task-date-input").value = todayString;
}

$("#generator-modal .close-modal").addEventListener("click", () => closeModal(modal));
$("#task-modal .close-modal").addEventListener("click", () => closeModal($("#task-modal")));
[modal, $("#task-modal")].forEach((backdrop) => backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) closeModal(backdrop);
}));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") [modal, $("#task-modal")].forEach((backdrop) => {
    if (!backdrop.hidden) closeModal(backdrop);
  });
});
form.addEventListener("submit", generatePath);
$("#task-form").addEventListener("submit", addCustomTask);
$("#add-task-button").addEventListener("click", () => openModal($("#task-modal")));
$("#view-tasks-button").addEventListener("click", () => $("#tasks").scrollIntoView({ behavior: "smooth" }));
$("#save-button").addEventListener("click", () => {
  persistWorkspace(true);
  $("#roadmap-menu").hidden = true;
});
$("#reset-button").addEventListener("click", resetProgress);
$("#roadmap-menu-button").addEventListener("click", () => {
  $("#roadmap-menu").hidden = !$("#roadmap-menu").hidden;
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".heading-actions")) $("#roadmap-menu").hidden = true;
});
$("#download-button").addEventListener("click", () => window.print());
$("#clear-saved-button").addEventListener("click", async () => {
  if (!window.confirm("Clear the saved roadmap, tasks, and progress from this browser?")) return;
  try {
    if (workspaceSyncReady) {
      const response = await fetch(`${API_BASE_URL}/api/workspace`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Workspace delete failed (${response.status}).`);
    }
    localStorage.removeItem(STORAGE_KEY);
    workspace = null;
    chatHistory = [];
    render();
    $("#chat-messages").replaceChildren();
    addChatMessage("assistant", "Hi there! I'm here to explain concepts, help you practice, or adjust your learning path. What are you curious about?");
    showToast("Saved learning data cleared.");
  } catch (error) {
    console.error("Could not clear Learnpath workspace.", error);
    showToast(`Could not clear saved data: ${error.message || "check your browser settings."}`, "error");
  }
});
$("#chat-launcher").addEventListener("click", () => {
  $("#chat-panel").hidden = false;
  $("#chat-launcher").hidden = true;
  $("#chat-context").textContent = workspace ? `Learning about ${workspace.learner.goal}` : "Ask anything about your learning goal.";
  $("#chat-input").focus();
  if (!backendReady) addChatMessage("assistant", backendError);
});
$("#chat-close").addEventListener("click", () => {
  $("#chat-panel").hidden = true;
  $("#chat-launcher").hidden = false;
  $("#chat-launcher").focus();
});
$("#chat-form").addEventListener("submit", sendChatMessage);
$("#menu-toggle").addEventListener("click", () => {
  const isOpen = $("#sidebar").classList.toggle("sidebar-open");
  $("#menu-toggle").setAttribute("aria-expanded", String(isOpen));
});
document.querySelectorAll(".side-nav a").forEach((link) => link.addEventListener("click", () => {
  $("#sidebar").classList.remove("sidebar-open");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  document.querySelectorAll(".side-nav a").forEach((item) => item.classList.toggle("active", item === link));
}));

async function initializeApp() {
  setInitialDates();
  workspace = loadWorkspace();
  render();
  const pageTargets = {
    "/": "overview",
    "/roadmap": "roadmap",
    "/tasks": "tasks",
    "/study-plan": "study-plan",
    "/resources": "resources-section",
  };
  const activeTarget = pageTargets[window.location.pathname];
  document.querySelectorAll(".side-nav a").forEach((link) => {
    link.classList.toggle("active", new URL(link.href).pathname === (window.location.pathname === "/index.html" ? "/" : window.location.pathname));
  });
  if (activeTarget && activeTarget !== "overview") {
    window.requestAnimationFrame(() => $(`#${activeTarget}`).scrollIntoView({ block: "start" }));
  }
  if (window.location.pathname === "/new") openModal();
  const health = await checkApiServer();
  if (health && health.workspaceSyncReady) await loadServerWorkspace();
}

initializeApp();
