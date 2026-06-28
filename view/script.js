import { I18N } from "./translation.js";

const state = {
  mode: "login",
  token: localStorage.getItem("ai_isp_token") || "",
  user: null,
  language: localStorage.getItem("ai_isp_language") || "en",
  attachedFile: null,
  lastInsights: null,
  aiConfigured: false,
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
  agenticStagePill: document.querySelector("#agenticStagePill"),
  agenticSummary: document.querySelector("#agenticSummary"),
  agenticNextAction: document.querySelector("#agenticNextAction"),
  agenticSignals: document.querySelector("#agenticSignals"),
  agenticDrivers: document.querySelector("#agenticDrivers"),
  agenticFeatures: document.querySelector("#agenticFeatures"),
  theoryCards: document.querySelector("#theoryCards"),
  riskTimeline: document.querySelector("#riskTimeline"),
  loopBoard: document.querySelector("#loopBoard"),
  visualizationContributions: document.querySelector("#visualizationContributions"),
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
  state.lastInsights = null;
  state.aiConfigured = false;
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
  const result = await api(`/insights?language=${encodeURIComponent(state.language)}`);
  const totals = result.totals || {};
  state.lastInsights = result;

  elements.totalUsers.textContent = totals.total_users || 0;
  elements.profiledUsers.textContent = totals.profiled_users || 0;
  elements.totalMessages.textContent = totals.total_messages || 0;
  elements.riskScore.textContent = formatRiskScore(result.riskScore);
  renderProfile(result.currentUserProfile, result.summary);
  renderAgentic(result.agentic);
  renderTheory(result.theory);
  renderVisualization(result.visualization);
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

function renderAgentic(agentic = {}) {
  const stage = agentic.stage || "sense";
  const drivers = Array.isArray(agentic.drivers) && agentic.drivers.length ? agentic.drivers : ["baseline"];
  const features = Array.isArray(agentic.features) && agentic.features.length
    ? agentic.features
    : ["adaptive_probe", "stateful_memory", "next_best_action"];

  elements.agenticStagePill.className = "status-pill neutral";
  if (stage === "interrupt") elements.agenticStagePill.classList.add("warning");
  if (stage === "plan") elements.agenticStagePill.classList.add("ready");
  elements.agenticStagePill.textContent = stageText(stage);
  elements.agenticSummary.textContent = buildAgenticSummary(stage, drivers, agentic.relevance);
  elements.agenticNextAction.textContent = actionText(agentic.nextAction || "scenario_probe");

  renderSignalBars(agentic.scores || {});
  renderMicroTags(elements.agenticDrivers, drivers.map((driver) => signalText(driver)));

  elements.agenticFeatures.innerHTML = "";
  features.forEach((feature) => {
    const item = document.createElement("li");
    item.textContent = agenticFeatureText(feature);
    elements.agenticFeatures.append(item);
  });
}

function renderTheory(theory = {}) {
  const cards = Array.isArray(theory.cards) ? theory.cards : [];
  elements.theoryCards.innerHTML = "";

  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = t("noResearchData");
    elements.theoryCards.append(empty);
    return;
  }

  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "theory-card";

    const header = document.createElement("div");
    header.className = "theory-card-head";

    const title = document.createElement("h3");
    title.textContent = theoryName(card.theory);

    const score = document.createElement("span");
    score.className = "theory-score";
    score.textContent = `${normalizePercent(card.strength)}%`;

    header.append(title, score);

    const body = document.createElement("p");
    body.className = "theory-copy";
    body.textContent = theoryDescription(card.theory);

    const bar = document.createElement("div");
    bar.className = "strength-bar";
    const fill = document.createElement("span");
    fill.style.width = `${normalizePercent(card.strength)}%`;
    bar.append(fill);

    const signals = document.createElement("p");
    signals.className = "theory-meta";
    signals.innerHTML = `<strong>${t("matchedSignalsLabel")}</strong> ${renderInlineList(card.signals, signalText)}`;

    const interventions = document.createElement("p");
    interventions.className = "theory-meta";
    interventions.innerHTML = `<strong>${t("recommendedInterventionLabel")}</strong> ${renderInlineList(card.interventions, actionText)}`;

    item.append(header, body, bar, signals, interventions);
    elements.theoryCards.append(item);
  });
}

function renderVisualization(visualization = {}) {
  renderRiskTimeline(Array.isArray(visualization.timeline) ? visualization.timeline : []);
  renderLoopBoard(Array.isArray(visualization.loop) ? visualization.loop : []);

  const contributions = Array.isArray(visualization.contributions) ? visualization.contributions : [];
  elements.visualizationContributions.innerHTML = "";
  contributions.forEach((item) => {
    const node = document.createElement("li");
    node.textContent = visualizationContributionText(item);
    elements.visualizationContributions.append(node);
  });
}

function renderSignalBars(scores) {
  const items = [
    { key: "promotion", label: t("signalPromotion") },
    { key: "emotion", label: t("signalEmotion") },
    { key: "social", label: t("signalSocial") },
    { key: "control", label: t("signalControl") },
  ];

  elements.agenticSignals.innerHTML = "";
  items.forEach((item) => {
    const value = normalizePercent(scores[item.key]);
    const row = document.createElement("div");
    row.className = "signal-row";

    const label = document.createElement("span");
    label.className = "signal-label";
    label.textContent = item.label;

    const track = document.createElement("div");
    track.className = "signal-track";
    const fill = document.createElement("span");
    fill.style.width = `${value}%`;
    track.append(fill);

    const metric = document.createElement("strong");
    metric.className = "signal-metric";
    metric.textContent = value;

    row.append(label, track, metric);
    elements.agenticSignals.append(row);
  });
}

function renderMicroTags(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "micro-tag";
    tag.textContent = item;
    container.append(tag);
  });
}

function renderRiskTimeline(points) {
  if (!points.length) {
    elements.riskTimeline.innerHTML = `<p class="empty-state">${escapeHtml(t("noResearchData"))}</p>`;
    return;
  }

  const width = 320;
  const height = 136;
  const paddingX = 18;
  const paddingY = 18;
  const usableWidth = Math.max(1, width - paddingX * 2);
  const usableHeight = Math.max(1, height - paddingY * 2);
  const steps = Math.max(points.length - 1, 1);
  const coords = points.map((point, index) => {
    const value = normalizePercent(point.value);
    const x = paddingX + (usableWidth * index) / steps;
    const y = height - paddingY - (usableHeight * value) / 100;
    return { x, y, value, point };
  });
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = [
    `${coords[0].x},${height - paddingY}`,
    ...coords.map((point) => `${point.x},${point.y}`),
    `${coords[coords.length - 1].x},${height - paddingY}`,
  ].join(" ");
  const circles = coords
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="4.5"></circle>`,
    )
    .join("");
  const labels = points
    .map((point, index) => {
      const signal = Array.isArray(point.signals) && point.signals.length ? signalText(point.signals[0]) : signalText("baseline");
      return `
        <div class="timeline-label">
          <strong>${escapeHtml(formatTimelineLabel(point.label, index))}</strong>
          <small>${escapeHtml(signal)}</small>
        </div>
      `;
    })
    .join("");

  elements.riskTimeline.innerHTML = `
    <svg class="timeline-svg" viewBox="0 0 ${width} ${height}" aria-label="${escapeHtml(t("visualizationPanelTitle"))}">
      <defs>
        <linearGradient id="timelineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(11, 111, 107, 0.34)"></stop>
          <stop offset="100%" stop-color="rgba(11, 111, 107, 0.02)"></stop>
        </linearGradient>
      </defs>
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" class="timeline-axis"></line>
      <polygon points="${area}" fill="url(#timelineFill)"></polygon>
      <polyline points="${polyline}" class="timeline-line"></polyline>
      ${circles}
    </svg>
    <div class="timeline-labels">${labels}</div>
  `;
}

function renderLoopBoard(items) {
  elements.loopBoard.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = t("noResearchData");
    elements.loopBoard.append(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "loop-card";

    const head = document.createElement("div");
    head.className = "loop-card-head";

    const title = document.createElement("h3");
    title.textContent = loopStepText(item.step);

    const value = document.createElement("strong");
    value.textContent = normalizePercent(item.value);

    head.append(title, value);

    const body = document.createElement("p");
    body.className = "loop-copy";
    body.textContent = loopStepDescription(item.step);

    const tags = document.createElement("div");
    tags.className = "micro-tag-row";
    (Array.isArray(item.signals) ? item.signals : []).forEach((signal) => {
      const tag = document.createElement("span");
      tag.className = "micro-tag";
      tag.textContent = signalText(signal);
      tags.append(tag);
    });

    card.append(head, body, tags);
    elements.loopBoard.append(card);
  });
}

function buildAgenticSummary(stage, drivers, relevance) {
  const summaries = {
    sense: t("agenticSummarySense"),
    interrupt: t("agenticSummaryInterrupt"),
    reframe: t("agenticSummaryReframe"),
    plan: t("agenticSummaryPlan"),
  };
  const base = relevance === "insufficient" ? t("agenticSummaryInsufficient") : summaries[stage] || summaries.sense;
  const signalLine = drivers
    .filter((item) => item !== "baseline")
    .slice(0, 2)
    .map((item) => signalText(item))
    .join(" / ");

  return signalLine ? `${base} ${t("detectedSignalsLabel")}: ${signalLine}.` : base;
}

function stageText(stage) {
  return {
    sense: t("stageSense"),
    interrupt: t("stageInterrupt"),
    reframe: t("stageReframe"),
    plan: t("stagePlan"),
  }[stage] || t("stageSense");
}

function actionText(action) {
  return {
    scenario_probe: t("actionScenarioProbe"),
    cooldown_compare: t("actionCooldownCompare"),
    substitute_reward: t("actionSubstituteReward"),
    social_second_opinion: t("actionSocialSecondOpinion"),
    budget_anchor: t("actionBudgetAnchor"),
    waitlist_commit: t("actionWaitlistCommit"),
    if_then_plan: t("actionIfThenPlan"),
  }[action] || t("actionScenarioProbe");
}

function signalText(signal) {
  return {
    discount: t("signalDiscount"),
    emotion: t("signalEmotionTag"),
    social: t("signalSocialTag"),
    budget: t("signalBudget"),
    compare: t("signalCompare"),
    delay: t("signalDelay"),
    routine: t("signalRoutine"),
    urgency: t("signalUrgency"),
    low_control: t("signalLowControl"),
    baseline: t("signalBaseline"),
    scenario: t("signalScenario"),
  }[signal] || signal;
}

function theoryName(theory) {
  return {
    dual_process: t("theoryDualProcess"),
    temporal_discounting: t("theoryTemporalDiscounting"),
    implementation_intentions: t("theoryImplementationIntentions"),
    social_influence: t("theorySocialInfluence"),
  }[theory] || theory;
}

function theoryDescription(theory) {
  return {
    dual_process: t("theoryBodyDualProcess"),
    temporal_discounting: t("theoryBodyTemporalDiscounting"),
    implementation_intentions: t("theoryBodyImplementationIntentions"),
    social_influence: t("theoryBodySocialInfluence"),
  }[theory] || "";
}

function loopStepText(step) {
  return {
    cue: t("loopCue"),
    urge: t("loopUrge"),
    friction: t("loopFriction"),
    reflection: t("loopReflection"),
  }[step] || step;
}

function loopStepDescription(step) {
  return {
    cue: t("loopCueBody"),
    urge: t("loopUrgeBody"),
    friction: t("loopFrictionBody"),
    reflection: t("loopReflectionBody"),
  }[step] || "";
}

function agenticFeatureText(feature) {
  return {
    adaptive_probe: t("featureAdaptiveProbe"),
    adaptive_looping: t("featureAdaptiveLooping"),
    stateful_memory: t("featureStatefulMemory"),
    next_best_action: t("featureNextBestAction"),
  }[feature] || feature;
}

function visualizationContributionText(code) {
  return {
    trajectory_not_single_score: t("vizTrajectory"),
    stateful_loop_map: t("vizLoopMap"),
    distinct_user_normalization: t("vizDistinctUser"),
  }[code] || code;
}

function renderInlineList(items, formatter) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return escapeHtml(t("unknown"));
  return list.slice(0, 3).map((item) => escapeHtml(formatter(item))).join(" · ");
}

function formatTimelineLabel(label, index) {
  if (typeof label === "string" && /^\d{4}-\d{2}-\d{2}T/.test(label)) {
    return formatTime(label);
  }
  return `T${index + 1}`;
}

function normalizePercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
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
  state.aiConfigured = configured;
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
  renderAiStatus(state.aiConfigured);

  if (state.lastInsights) {
    renderProfile(state.lastInsights.currentUserProfile, state.lastInsights.summary);
    renderAgentic(state.lastInsights.agentic);
    renderTheory(state.lastInsights.theory);
    renderVisualization(state.lastInsights.visualization);
    renderFeatures(state.lastInsights.commonFeatures || []);
  }
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
    trigger: t("categoryTrigger"),
    category: t("categoryCategory"),
    emotion: t("categoryEmotion"),
    intervention: t("categoryIntervention"),
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
