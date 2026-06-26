import { I18N } from "./translation.js";

const state = {
  mode: "login",
  token: localStorage.getItem("ai_isp_token") || "",
  user: null,
  language: localStorage.getItem("ai_isp_language") || "en",
  attachedFile: null,
};

const elements = {
  languageSelect: document.querySelector("#languageSelect"),
  authPanel: document.querySelector("#authPanel"),
  workspace: document.querySelector("#workspace"),
  adminPanel: document.querySelector("#adminPanel"),
  authForm: document.querySelector("#authForm"),
  authSubmit: document.querySelector("#authSubmit"),
  authMessage: document.querySelector("#authMessage"),
  userIdInput: document.querySelector("#userIdInput"),
  passwordInput: document.querySelector("#passwordInput"),
  currentUser: document.querySelector("#currentUser"),
  logoutButton: document.querySelector("#logoutButton"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  clearContextButton: document.querySelector("#clearContextButton"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  aiStatus: document.querySelector("#aiStatus"),
  riskScore: document.querySelector("#riskScore"),
  totalUsers: document.querySelector("#totalUsers"),
  profiledUsers: document.querySelector("#profiledUsers"),
  totalMessages: document.querySelector("#totalMessages"),
  profileSummary: document.querySelector("#profileSummary"),
  profileTags: document.querySelector("#profileTags"),
  featureList: document.querySelector("#featureList"),
  aiSettingsForm: document.querySelector("#aiSettingsForm"),
  requestUrlInput: document.querySelector("#requestUrlInput"),
  modelInput: document.querySelector("#modelInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  saveAiSettingsButton: document.querySelector("#saveAiSettingsButton"),
  aiSettingsMessage: document.querySelector("#aiSettingsMessage"),
  adminLogoutButton: document.querySelector("#adminLogoutButton"),
  refreshAdminButton: document.querySelector("#refreshAdminButton"),
  adminUserList: document.querySelector("#adminUserList"),
  fileInput: document.querySelector("#fileInput"),
  attachButton: document.querySelector("#attachButton"),
  attachmentPreview: document.querySelector("#attachmentPreview"),
  attachmentName: document.querySelector("#attachmentName"),
  attachmentRemove: document.querySelector("#attachmentRemove"),
};

elements.languageSelect.value = state.language;
applyLanguage();

elements.languageSelect.addEventListener("change", () => {
  state.language = elements.languageSelect.value;
  localStorage.setItem("ai_isp_language", state.language);
  applyLanguage();
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === button));
    elements.authSubmit.textContent = t(state.mode);
    elements.authMessage.textContent = "";
  });
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(elements.authSubmit, true);
  elements.authMessage.textContent = "";

  try {
    const result = await api(`/${state.mode}`, {
      method: "POST",
      body: {
        userId: elements.userIdInput.value,
        password: elements.passwordInput.value,
      },
      auth: false,
    });

    state.token = result.token;
    state.user = result.user;
    localStorage.setItem("ai_isp_token", state.token);
    await enterApp();
  } catch (error) {
    elements.authMessage.textContent = error.message;
  } finally {
    setBusy(elements.authSubmit, false);
  }
});

elements.logoutButton.addEventListener("click", logout);
elements.adminLogoutButton.addEventListener("click", logout);
elements.refreshAdminButton.addEventListener("click", loadAdminUsers);
elements.clearContextButton.addEventListener("click", clearMyContext);

elements.aiSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(elements.saveAiSettingsButton, true);
  elements.aiSettingsMessage.textContent = "";

  try {
    const result = await api("/ai-settings", {
      method: "PUT",
      body: {
        requestUrl: elements.requestUrlInput.value,
        model: elements.modelInput.value,
        apiKey: elements.apiKeyInput.value,
      },
    });
    renderAiSettings(result.settings);
    elements.aiSettingsMessage.textContent = t("settingsSaved");
  } catch (error) {
    elements.aiSettingsMessage.textContent = error.message;
  } finally {
    setBusy(elements.saveAiSettingsButton, false);
  }
});

elements.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.messageInput.value.trim();
  const file = state.attachedFile;
  if (!message && !file) return;

  elements.messageInput.value = "";
  const userDisplay = buildUserDisplay(message, file);
  renderMessage({ role: "user", content: userDisplay });
  clearAttachment();
  setBusy(elements.sendButton, true);

  try {
    const body = { message, language: state.language };
    if (file) body.file = { name: file.name, content: file.content, type: file.type };
    const result = await api("/chat", { method: "POST", body });
    renderMessage({ role: "assistant", content: result.reply });
    renderProfile(result.profile);
    renderAiStatus(result.aiConfigured);
    await loadInsights();
  } catch (error) {
    renderMessage({ role: "assistant", content: `${t("requestFailed")}：${error.message}` });
  } finally {
    setBusy(elements.sendButton, false);
    elements.messageInput.focus();
  }
});

elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    elements.chatForm.requestSubmit();
  }
});

// File attachment handlers
elements.attachButton.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];
  if (!file) return;

  if (file.size > 500_000) {
    alert(t("fileTooLarge"));
    elements.fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.attachedFile = {
      name: file.name,
      content: reader.result,
      type: file.type || "text/plain",
    };
    elements.attachmentName.textContent = `${file.name} (${formatFileSize(file.size)})`;
    elements.attachmentPreview.classList.remove("hidden");
    elements.attachButton.classList.add("hidden");
  };
  reader.onerror = () => {
    alert(t("requestFailed"));
    elements.fileInput.value = "";
  };
  reader.readAsText(file);
});

elements.attachmentRemove.addEventListener("click", () => {
  clearAttachment();
});

async function enterApp() {
  elements.authPanel.classList.add("hidden");

  if (state.user?.isAdmin) {
    elements.workspace.classList.add("hidden");
    elements.adminPanel.classList.remove("hidden");
    await loadAdminUsers();
    return;
  }

  elements.adminPanel.classList.add("hidden");
  elements.workspace.classList.remove("hidden");
  elements.currentUser.textContent = state.user?.id || "-";
  elements.messages.innerHTML = "";
  renderMessage({ role: "assistant", content: t("intro") });

  await Promise.all([loadHistory(), loadInsights(), loadAiSettings()]);
  elements.messageInput.focus();
}

async function logout() {
  try {
    await api("/logout", { method: "POST" });
  } catch {
    // Local logout is enough when the server session expired.
  }

  state.token = "";
  state.user = null;
  localStorage.removeItem("ai_isp_token");
  elements.workspace.classList.add("hidden");
  elements.adminPanel.classList.add("hidden");
  elements.authPanel.classList.remove("hidden");
  elements.passwordInput.value = "";
}

async function loadHistory() {
  const result = await api("/history");
  elements.messages.innerHTML = "";

  if (!result.messages.length) {
    renderMessage({ role: "assistant", content: t("intro") });
    return;
  }

  result.messages.forEach(renderMessage);
}

async function clearMyContext() {
  if (!confirm(t("confirmClearContext"))) return;

  setBusy(elements.clearContextButton, true);
  try {
    const result = await api("/history", { method: "DELETE" });
    elements.messages.innerHTML = "";
    renderMessage({ role: "assistant", content: t("contextCleared") });
    renderProfile(result.profile);
    await loadInsights();
  } catch (error) {
    renderMessage({ role: "assistant", content: `${t("requestFailed")}：${error.message}` });
  } finally {
    setBusy(elements.clearContextButton, false);
    elements.messageInput.focus();
  }
}

async function loadInsights() {
  const result = await api("/insights");
  const totals = result.totals || {};

  elements.totalUsers.textContent = totals.total_users || 0;
  elements.profiledUsers.textContent = totals.profiled_users || 0;
  elements.totalMessages.textContent = totals.total_messages || 0;
  elements.riskScore.textContent = formatRiskScore(result.riskScore);
  renderProfile(result.currentUserProfile, result.summary);
  renderFeatures(result.commonFeatures || []);
}

async function loadAiSettings() {
  const result = await api("/ai-settings");
  renderAiSettings(result.settings);
}

async function loadAdminUsers() {
  const result = await api("/admin/users");
  renderAdminUsers(result.users || []);
}

function renderAiSettings(settings) {
  elements.requestUrlInput.value = settings.requestUrl || "";
  elements.modelInput.value = settings.model || "";
  elements.apiKeyInput.value = settings.apiKey || "";
  elements.aiSettingsMessage.textContent = settings.hasApiKey ? t("apiKeyStored") : t("apiKeyMissing");
  renderAiStatus(Boolean(settings.requestUrl && settings.model && settings.hasApiKey));
}

function renderMessage(message) {
  const item = document.createElement("article");
  item.className = `message ${message.role}`;

  const role = document.createElement("span");
  role.className = "message-role";
  role.textContent = message.role === "user" ? t("userId").replace(" ID", "") : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.content;

  item.append(role, bubble);
  elements.messages.append(item);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderProfile(profile, fallbackSummary = "") {
  if (!profile) {
    elements.profileSummary.textContent = fallbackSummary || t("profilePending");
    elements.profileTags.innerHTML = "";
    return;
  }

  elements.riskScore.textContent = formatRiskScore(profile.risk_score);
  elements.profileSummary.textContent = profile.summary || fallbackSummary || t("profilePending");

  const tags = [
    profile.impulse_level ? `${t("riskScore")}：${levelText(profile.impulse_level)}` : "",
    ...(profile.traits || []),
    ...(profile.triggers || []),
    ...(profile.purchase_categories || []),
    ...(profile.emotional_states || []),
  ].filter(Boolean);

  elements.profileTags.innerHTML = "";
  tags.slice(0, 18).forEach((tag) => {
    const node = document.createElement("span");
    node.className = "tag";
    node.textContent = tag;
    elements.profileTags.append(node);
  });
}

function renderFeatures(features) {
  elements.featureList.innerHTML = "";

  if (!features.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = t("emptyFeatures");
    elements.featureList.append(empty);
    return;
  }

  features.forEach((feature) => {
    const item = document.createElement("div");
    item.className = "feature-item";

    const main = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = categoryText(feature.category);
    const title = document.createElement("strong");
    title.textContent = feature.feature;
    const time = document.createElement("small");
    time.textContent = feature.last_seen_at ? formatTime(feature.last_seen_at) : "";
    main.append(label, title, time);

    const count = document.createElement("div");
    count.className = "feature-count";
    count.textContent = feature.count;

    item.append(main, count);
    elements.featureList.append(item);
  });
}

function renderAdminUsers(users) {
  elements.adminUserList.innerHTML = "";

  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = "admin-card";

    const header = document.createElement("div");
    header.className = "admin-card-header";
    header.innerHTML = `
      <div>
        <h2>${escapeHtml(user.id)}${user.isAdmin ? " · admin" : ""}</h2>
        <p>${t("messageCount")}: ${user.messageCount} · ${t("riskScore")}: ${formatRiskScore(user.riskScore)}</p>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "admin-card-actions";
    const clearButton = document.createElement("button");
    clearButton.className = "ghost-button";
    clearButton.type = "button";
    clearButton.textContent = t("clearProfile");
    clearButton.addEventListener("click", () => clearUserProfile(user.id));
    actions.append(clearButton);

    if (!user.isAdmin) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "danger-button";
      deleteButton.type = "button";
      deleteButton.textContent = t("deleteUser");
      deleteButton.addEventListener("click", () => deleteUser(user.id));
      actions.append(deleteButton);
    }

    header.append(actions);

    const details = document.createElement("div");
    details.className = "admin-details";
    const profile = user.profile ? JSON.stringify(user.profile, null, 2) : t("noProfile");
    details.innerHTML = `
      <section>
        <h3>${t("profileDetails")}</h3>
        <pre>${escapeHtml(profile)}</pre>
      </section>
      <section>
        <h3>${t("aiConfig")}</h3>
        <p>${escapeHtml(user.aiSettings.requestUrl || "-")}</p>
        <p>${escapeHtml(user.aiSettings.model || "-")}</p>
        <p>${user.aiSettings.hasApiKey ? t("apiKeyStored") : t("apiKeyMissing")}</p>
      </section>
    `;

    card.append(header, details);
    elements.adminUserList.append(card);
  });
}

async function deleteUser(userId) {
  if (!confirm(t("confirmDelete"))) return;
  await api(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  await loadAdminUsers();
  alert(t("actionDone"));
}

async function clearUserProfile(userId) {
  if (!confirm(t("confirmClear"))) return;
  await api(`/admin/users/${encodeURIComponent(userId)}/profile`, { method: "POST" });
  await loadAdminUsers();
  alert(t("actionDone"));
}

function renderAiStatus(configured) {
  elements.aiStatus.textContent = configured ? t("configured") : t("notConfigured");
  elements.aiStatus.classList.toggle("ready", configured);
}

async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { "content-type": "application/json" },
  };

  if (options.body) init.body = JSON.stringify(options.body);
  if (options.auth !== false && state.token) {
    init.headers.authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`/api${path}`, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || t("requestFailed"));
  }

  return data;
}

function applyLanguage() {
  document.documentElement.lang = {
    zh: "zh-CN",
    en: "en",
    ja: "ja",
    es: "es",
  }[state.language];

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });

  elements.messageInput.placeholder = t("chatPlaceholder");
  elements.authSubmit.textContent = t(state.mode);
}

function t(key) {
  return I18N[state.language]?.[key] || I18N.en[key] || key;
}

function setBusy(button, busy) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = "...";
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    delete button.dataset.originalText;
  }
}

function levelText(level) {
  return { unknown: t("unknown"), low: t("low"), medium: t("medium"), high: t("high") }[level] || level;
}

function formatRiskScore(value) {
  return value === null || value === undefined || value === -1 ? t("unknown") : value;
}

function categoryText(category) {
  return {
    trait: t("userProfile"),
    trigger: "Trigger",
    category: "Category",
    emotion: "Emotion",
    intervention: "Intervention",
  }[category] || category;
}

function clearAttachment() {
  state.attachedFile = null;
  elements.fileInput.value = "";
  elements.attachmentPreview.classList.add("hidden");
  elements.attachButton.classList.remove("hidden");
}

function buildUserDisplay(message, file) {
  if (!file) return message;
  let display = `📎 ${file.name}\n\n${file.content.slice(0, 2000)}`;
  if (file.content.length > 2000) display += "\n…[content truncated]";
  if (message) display += `\n\n---\n${message}`;
  return display;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(document.documentElement.lang, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
