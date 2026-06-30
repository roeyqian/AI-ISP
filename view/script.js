import { I18N } from "./translation.js";

const THEME_STORAGE_KEY = "ai_isp_theme";
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const state = {
  mode: "login",
  token: localStorage.getItem("ai_isp_token") || "",
  user: null,
  language: localStorage.getItem("ai_isp_language") || "en",
  theme: resolveTheme(),
  attachedFile: null,
  lastInsights: null,
  aiConfigured: false,
  adminUsers: [],
  adminQuery: "",
  adminFilter: "all",
  adminSort: "recent_login",
  adminSelected: new Set(),
};

const elements = {
  languageSelect: document.querySelector("#languageSelect"),
  themeSelect: document.querySelector("#themeSelect"),
  authPanel: document.querySelector("#authPanel"),
  workspace: document.querySelector("#workspace"),
  adminPanel: document.querySelector("#adminPanel"),
  studyProtocolId: document.querySelector("#studyProtocolId"),
  protocolSteps: document.querySelector("#protocolSteps"),
  participantSummary: document.querySelector("#participantSummary"),
  participantStageValue: document.querySelector("#participantStageValue"),
  participantEvidenceValue: document.querySelector("#participantEvidenceValue"),
  participantCompletionValue: document.querySelector("#participantCompletionValue"),
  participantTurnsValue: document.querySelector("#participantTurnsValue"),
  participantScenarioValue: document.querySelector("#participantScenarioValue"),
  participantUpdatedValue: document.querySelector("#participantUpdatedValue"),
  studyExportStatus: document.querySelector("#studyExportStatus"),
  studyLastUpdated: document.querySelector("#studyLastUpdated"),
  exportStudyButton: document.querySelector("#exportStudyButton"),
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
  sessionStagePill: document.querySelector("#sessionStagePill"),
  sessionEvidencePill: document.querySelector("#sessionEvidencePill"),
  protocolCueText: document.querySelector("#protocolCueText"),
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
  methodologyList: document.querySelector("#methodologyList"),
  evidenceLevelPill: document.querySelector("#evidenceLevelPill"),
  evidenceSummary: document.querySelector("#evidenceSummary"),
  evidenceSignals: document.querySelector("#evidenceSignals"),
  evidenceNotes: document.querySelector("#evidenceNotes"),
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
  adminTotalUsers: document.querySelector("#adminTotalUsers"),
  adminProfiledUsers: document.querySelector("#adminProfiledUsers"),
  adminAiConfiguredCount: document.querySelector("#adminAiConfiguredCount"),
  adminAttentionCount: document.querySelector("#adminAttentionCount"),
  adminSearchInput: document.querySelector("#adminSearchInput"),
  adminFilterPills: document.querySelector("#adminFilterPills"),
  adminSortSelect: document.querySelector("#adminSortSelect"),
  exportFilteredButton: document.querySelector("#exportFilteredButton"),
  adminSelectionBar: document.querySelector("#adminSelectionBar"),
  adminSelectionText: document.querySelector("#adminSelectionText"),
  selectVisibleButton: document.querySelector("#selectVisibleButton"),
  clearSelectedProfilesButton: document.querySelector("#clearSelectedProfilesButton"),
  exportSelectedButton: document.querySelector("#exportSelectedButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  adminResultsText: document.querySelector("#adminResultsText"),
  adminUserList: document.querySelector("#adminUserList"),
  fileInput: document.querySelector("#fileInput"),
  attachButton: document.querySelector("#attachButton"),
  attachmentPreview: document.querySelector("#attachmentPreview"),
  attachmentName: document.querySelector("#attachmentName"),
  attachmentRemove: document.querySelector("#attachmentRemove"),
};

elements.languageSelect.value = state.language;
elements.themeSelect.value = state.theme;
applyTheme();
applyLanguage();

elements.languageSelect.addEventListener("change", () => {
  state.language = elements.languageSelect.value;
  localStorage.setItem("ai_isp_language", state.language);
  applyLanguage();
});

elements.themeSelect.addEventListener("change", () => {
  state.theme = elements.themeSelect.value;
  localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  applyTheme();
});

const handleSystemThemeChange = (event) => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") return;
  state.theme = event.matches ? "dark" : "light";
  elements.themeSelect.value = state.theme;
  applyTheme();
};

if (typeof prefersDarkQuery.addEventListener === "function") {
  prefersDarkQuery.addEventListener("change", handleSystemThemeChange);
} else if (typeof prefersDarkQuery.addListener === "function") {
  prefersDarkQuery.addListener(handleSystemThemeChange);
}

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
elements.adminSearchInput.addEventListener("input", () => {
  state.adminQuery = elements.adminSearchInput.value.trim();
  renderAdminConsole();
});
elements.adminSortSelect.addEventListener("change", () => {
  state.adminSort = elements.adminSortSelect.value;
  renderAdminConsole();
});
elements.adminFilterPills.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.adminFilter = button.dataset.filter;
  renderAdminConsole();
});
elements.exportFilteredButton.addEventListener("click", () => exportAdminUsers(getVisibleAdminUsers()));
elements.selectVisibleButton.addEventListener("click", () => {
  const users = getVisibleAdminUsers();
  const allVisibleSelected = users.length > 0 && users.every((user) => state.adminSelected.has(user.id));
  users.forEach((user) => {
    if (allVisibleSelected) state.adminSelected.delete(user.id);
    else state.adminSelected.add(user.id);
  });
  renderAdminConsole();
});
elements.clearSelectionButton.addEventListener("click", () => {
  state.adminSelected.clear();
  renderAdminConsole();
});
elements.exportSelectedButton.addEventListener("click", () => {
  const selected = state.adminUsers.filter((user) => state.adminSelected.has(user.id));
  exportAdminUsers(selected);
});
elements.clearSelectedProfilesButton.addEventListener("click", clearSelectedProfiles);
elements.exportStudyButton.addEventListener("click", exportResearchPackage);

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
  state.adminUsers = [];
  state.adminQuery = "";
  state.adminFilter = "all";
  state.adminSort = "recent_login";
  state.adminSelected.clear();
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
  renderStudyMeta(result.studyMeta || {});
  renderParticipant(result.participant || {});
  renderMethodology(result.methodology || {});
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
  state.adminUsers = result.users || [];
  state.adminSelected = new Set([...state.adminSelected].filter((userId) => state.adminUsers.some((user) => user.id === userId)));
  renderAdminConsole();
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

function renderStudyMeta(studyMeta = {}) {
  elements.studyProtocolId.textContent = studyMeta.protocolId || "AI-ISP-SJT-2026.06";
  elements.studyExportStatus.textContent = studyMeta.exportReady ? t("exportReady") : t("exportNotReady");
  elements.studyLastUpdated.textContent = template("studyLastUpdatedChip", {
    time: formatMaybeDate(studyMeta.lastUpdatedAt),
  });
}

function renderParticipant(participant = {}) {
  const stage = participant.stage || "screening";
  const evidenceLevel = participant.evidenceLevel || "low";
  const completion = normalizePercent(participant.completion);
  const updatedAt = participant.profileUpdatedAt || participant.lastActivityAt || null;

  elements.participantSummary.textContent = participantSummaryText(stage, evidenceLevel, completion);
  elements.participantStageValue.textContent = participantStageText(stage);
  elements.participantEvidenceValue.textContent = evidenceLevelText(evidenceLevel);
  elements.participantCompletionValue.textContent = `${completion}%`;
  elements.participantTurnsValue.textContent = participant.userTurns || 0;
  elements.participantScenarioValue.textContent = participant.scenarioAnswerCount || 0;
  elements.participantUpdatedValue.textContent = formatMaybeDate(updatedAt);
  elements.studyExportStatus.textContent = participant.exportReady ? t("exportReady") : t("exportNotReady");
  elements.studyLastUpdated.textContent = template("studyLastUpdatedChip", { time: formatMaybeDate(updatedAt) });
  elements.protocolCueText.textContent = template("protocolCueTemplate", {
    action: actionText(participant.nextAction || "scenario_probe"),
  });

  elements.sessionStagePill.className = `status-pill ${participantStageTone(stage)}`;
  elements.sessionStagePill.textContent = participantStageText(stage);
  elements.sessionEvidencePill.className = `status-pill ${evidenceLevelTone(evidenceLevel)}`;
  elements.sessionEvidencePill.textContent = evidenceLevelText(evidenceLevel);
  elements.evidenceLevelPill.className = `status-pill ${evidenceLevelTone(evidenceLevel)}`;
  elements.evidenceLevelPill.textContent = evidenceLevelText(evidenceLevel);
  elements.evidenceSummary.textContent = participantSummaryText(stage, evidenceLevel, completion);
  renderMicroTags(elements.evidenceSignals, (participant.activeSignals || []).map((signal) => signalText(signal)));

  elements.evidenceNotes.innerHTML = "";
  (participant.notes || []).forEach((note) => {
    const item = document.createElement("li");
    item.textContent = participantNoteText(note);
    elements.evidenceNotes.append(item);
  });

  if (!elements.evidenceNotes.children.length) {
    const item = document.createElement("li");
    item.textContent = t("evidenceNoteFallback");
    elements.evidenceNotes.append(item);
  }
}

function renderMethodology(methodology = {}) {
  const groups = [
    { title: t("methodologyProtocolTitle"), items: methodology.protocol || [] },
    { title: t("methodologyMeasuresTitle"), items: methodology.measures || [] },
    { title: t("methodologyOutputsTitle"), items: methodology.outputs || [] },
    { title: t("methodologySafeguardsTitle"), items: methodology.safeguards || [] },
  ];

  elements.methodologyList.innerHTML = "";
  groups.forEach((group) => {
    const block = document.createElement("article");
    block.className = "methodology-block";

    const title = document.createElement("h3");
    title.textContent = group.title;

    const body = document.createElement("p");
    body.className = "methodology-copy";
    body.textContent = group.items.map((item) => methodologyItemText(item)).join(" · ") || t("unknown");

    block.append(title, body);
    elements.methodologyList.append(block);
  });
}

function renderProtocolSteps() {
  const steps = [
    t("protocolStepScenario"),
    t("protocolStepCoding"),
    t("protocolStepLoop"),
    t("protocolStepExport"),
  ];

  elements.protocolSteps.innerHTML = "";
  steps.forEach((step) => {
    const tag = document.createElement("span");
    tag.className = "micro-tag";
    tag.textContent = step;
    elements.protocolSteps.append(tag);
  });
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

function participantStageText(stage) {
  return {
    screening: t("participantStageScreening"),
    elicitation: t("participantStageElicitation"),
    profiling: t("participantStageProfiling"),
    stabilized: t("participantStageStabilized"),
  }[stage] || t("participantStageScreening");
}

function participantStageTone(stage) {
  return {
    screening: "neutral",
    elicitation: "warning",
    profiling: "neutral",
    stabilized: "ready",
  }[stage] || "neutral";
}

function evidenceLevelText(level) {
  return {
    low: t("evidenceLevelLow"),
    medium: t("evidenceLevelMedium"),
    high: t("evidenceLevelHigh"),
  }[level] || t("evidenceLevelLow");
}

function evidenceLevelTone(level) {
  return {
    low: "warning",
    medium: "neutral",
    high: "ready",
  }[level] || "neutral";
}

function participantSummaryText(stage, evidenceLevel, completion) {
  const stageCopy = {
    screening: t("participantSummaryScreening"),
    elicitation: t("participantSummaryElicitation"),
    profiling: t("participantSummaryProfiling"),
    stabilized: t("participantSummaryStabilized"),
  }[stage] || t("participantSummaryScreening");

  return `${stageCopy} ${template("participantSummaryEvidence", {
    level: evidenceLevelText(evidenceLevel),
    completion: `${completion}%`,
  })}`;
}

function participantNoteText(code) {
  return {
    insufficient_evidence: t("noteInsufficientEvidence"),
    needs_scenario_answers: t("noteNeedsScenarioAnswers"),
    promotion_trigger_present: t("notePromotionTrigger"),
    emotion_trigger_present: t("noteEmotionTrigger"),
    social_trigger_present: t("noteSocialTrigger"),
    profile_consistent: t("noteProfileConsistent"),
    longitudinal_ready: t("noteLongitudinalReady"),
  }[code] || code;
}

function methodologyItemText(code) {
  return {
    scenario_judgment_items: t("methodItemScenario"),
    compact_response_coding: t("methodItemCoding"),
    stateful_agent_loop: t("methodItemLoop"),
    longitudinal_profile_refresh: t("methodItemRefresh"),
    promotion_pressure: t("measurePromotion"),
    emotion_pull: t("measureEmotion"),
    social_influence: t("measureSocial"),
    reflective_control: t("measureControl"),
    participant_profile: t("outputProfile"),
    theory_trace: t("outputTheory"),
    risk_trajectory: t("outputTrajectory"),
    group_pattern_aggregation: t("outputAggregation"),
    non_diagnostic_use: t("safeguardNonDiagnostic"),
    profile_persistence_after_reset: t("safeguardPersistence"),
    distinct_user_normalization: t("safeguardNormalization"),
  }[code] || code;
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

function renderAdminConsole() {
  const visibleUsers = getVisibleAdminUsers();
  renderAdminSummary(state.adminUsers);
  renderAdminFilterPills();
  renderAdminSelectionBar(visibleUsers);
  renderAdminUsers(visibleUsers);
  elements.adminResultsText.textContent = template("adminResultsSummary", {
    shown: visibleUsers.length,
    total: state.adminUsers.length,
  });
}

function renderAdminSummary(users) {
  const profiled = users.filter((user) => Boolean(user.profile)).length;
  const exportReady = users.filter(adminExportReady).length;
  const attention = users.filter(needsAttention).length;

  elements.adminTotalUsers.textContent = users.length;
  elements.adminProfiledUsers.textContent = profiled;
  elements.adminAiConfiguredCount.textContent = exportReady;
  elements.adminAttentionCount.textContent = attention;
}

function renderAdminFilterPills() {
  elements.adminSearchInput.value = state.adminQuery;
  elements.adminSortSelect.value = state.adminSort;
  elements.adminFilterPills.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === state.adminFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderAdminSelectionBar(visibleUsers) {
  const selectedCount = state.adminSelected.size;
  const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every((user) => state.adminSelected.has(user.id));

  elements.adminSelectionBar.classList.toggle("hidden", selectedCount === 0);
  elements.adminSelectionText.textContent = template("adminSelectionSummary", { count: selectedCount });
  elements.selectVisibleButton.textContent = allVisibleSelected ? t("adminDeselectVisible") : t("adminSelectVisible");
}

function renderAdminUsers(users) {
  elements.adminUserList.innerHTML = "";

  if (!users.length) {
    const empty = document.createElement("article");
    empty.className = "admin-empty-card";
    empty.innerHTML = `
      <h2>${escapeHtml(t("adminEmptyTitle"))}</h2>
      <p>${escapeHtml(t("adminEmptyBody"))}</p>
    `;
    elements.adminUserList.append(empty);
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = `admin-card admin-user-card${needsAttention(user) ? " attention" : ""}`;

    const header = document.createElement("div");
    header.className = "admin-card-header";

    const identity = document.createElement("div");
    identity.className = "admin-card-identity";

    const topRow = document.createElement("div");
    topRow.className = "admin-card-topline";

    const selector = document.createElement("label");
    selector.className = "admin-select-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.adminSelected.has(user.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.adminSelected.add(user.id);
      else state.adminSelected.delete(user.id);
      renderAdminConsole();
    });
    const name = document.createElement("h2");
    name.textContent = user.id;
    selector.append(checkbox, name);
    topRow.append(selector);

    const badges = document.createElement("div");
    badges.className = "admin-badge-row";
    buildAdminBadges(user).forEach(({ text, tone }) => badges.append(createBadge(text, tone)));

    const meta = document.createElement("p");
    meta.className = "admin-card-meta";
    meta.textContent = template("adminUserMeta", {
      messages: user.messageCount || 0,
      lastLogin: formatAdminDate(user.lastLoginAt),
      created: formatAdminDate(user.createdAt),
    });

    const summary = document.createElement("p");
    summary.className = "admin-card-summary";
    summary.textContent = user.profileSummary || t("adminNoSummary");

    identity.append(topRow, badges, meta, summary);

    const actions = document.createElement("div");
    actions.className = "admin-card-actions";
    const clearButton = document.createElement("button");
    clearButton.className = "ghost-button";
    clearButton.type = "button";
    clearButton.textContent = t("clearProfile");
    clearButton.addEventListener("click", () => clearUserProfile(user.id));
    actions.append(clearButton);

    const exportButton = document.createElement("button");
    exportButton.className = "ghost-button";
    exportButton.type = "button";
    exportButton.textContent = t("adminExportUser");
    exportButton.addEventListener("click", () => exportAdminUsers([user]));
    actions.append(exportButton);

    if (!user.isAdmin) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "danger-button";
      deleteButton.type = "button";
      deleteButton.textContent = t("deleteUser");
      deleteButton.addEventListener("click", () => deleteUser(user.id));
      actions.append(deleteButton);
    }

    header.append(identity, actions);

    const metrics = document.createElement("div");
    metrics.className = "admin-metric-strip";
    [
      [t("riskScore"), formatRiskScore(user.riskScore)],
      [t("messageCount"), user.messageCount || 0],
      [t("participantStageLabel"), participantStageText(adminStudyStage(user))],
      [t("completionLabel"), `${adminCompletionScore(user)}%`],
    ].forEach(([labelText, valueText]) => {
      const item = document.createElement("div");
      item.className = "admin-metric-pill";
      item.innerHTML = `<span>${escapeHtml(String(labelText))}</span><strong>${escapeHtml(String(valueText))}</strong>`;
      metrics.append(item);
    });

    const details = document.createElement("details");
    details.className = "admin-expand";

    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = t("adminExpandDetails");

    const detailsGrid = document.createElement("div");
    detailsGrid.className = "admin-details";

    const overviewSection = document.createElement("section");
    overviewSection.innerHTML = `
      <h3>${escapeHtml(t("adminQuickView"))}</h3>
      <p>${escapeHtml(template("adminQuickViewBody", {
        model: user.aiSettings.model || "-",
        updated: formatAdminDate(user.profileUpdatedAt),
      }))}</p>
    `;
    const tagRow = document.createElement("div");
    tagRow.className = "tag-group";
    extractProfileTags(user).forEach((tag) => {
      const node = document.createElement("span");
      node.className = "tag";
      node.textContent = tag;
      tagRow.append(node);
    });
    overviewSection.append(tagRow);

    const configSection = document.createElement("section");
    configSection.innerHTML = `
      <h3>${escapeHtml(t("aiConfig"))}</h3>
      <p>${escapeHtml(user.aiSettings.requestUrl || "-")}</p>
      <p>${escapeHtml(user.aiSettings.model || "-")}</p>
      <p>${escapeHtml(user.aiSettings.hasApiKey ? t("apiKeyStored") : t("apiKeyMissing"))}</p>
    `;

    const profileSection = document.createElement("section");
    profileSection.innerHTML = `
      <h3>${escapeHtml(t("profileDetails"))}</h3>
      <pre>${escapeHtml(user.profile ? JSON.stringify(user.profile, null, 2) : t("noProfile"))}</pre>
    `;

    detailsGrid.append(overviewSection, configSection, profileSection);
    details.append(detailsSummary, detailsGrid);

    card.append(header, metrics, details);
    elements.adminUserList.append(card);
  });
}

function getVisibleAdminUsers() {
  return [...state.adminUsers]
    .filter((user) => matchesAdminSearch(user, state.adminQuery))
    .filter((user) => matchesAdminFilter(user, state.adminFilter))
    .sort((left, right) => compareAdminUsers(left, right, state.adminSort));
}

function matchesAdminSearch(user, query) {
  if (!query) return true;
  return buildAdminSearchHaystack(user).includes(query.toLowerCase());
}

function matchesAdminFilter(user, filter) {
  if (filter === "attention") return needsAttention(user);
  if (filter === "high_risk") return isHighRisk(user);
  if (filter === "ai_missing") return !adminAiReady(user);
  if (filter === "profiled") return Boolean(user.profile);
  return true;
}

function compareAdminUsers(left, right, sort) {
  if (sort === "risk_desc") return compareNumbers(right.riskScore, left.riskScore) || compareNumbers(right.messageCount, left.messageCount);
  if (sort === "messages_desc") return compareNumbers(right.messageCount, left.messageCount) || compareNumbers(right.riskScore, left.riskScore);
  if (sort === "created_desc") return compareDates(right.createdAt, left.createdAt) || left.id.localeCompare(right.id);
  return compareDates(right.lastLoginAt, left.lastLoginAt) || compareDates(right.createdAt, left.createdAt) || left.id.localeCompare(right.id);
}

function buildAdminSearchHaystack(user) {
  return [
    user.id,
    user.profileSummary,
    user.aiSettings?.requestUrl,
    user.aiSettings?.model,
    user.profile?.summary,
    ...(user.profile?.traits || []),
    ...(user.profile?.triggers || []),
    ...(user.profile?.purchase_categories || []),
    ...(user.profile?.emotional_states || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildAdminBadges(user) {
  return [
    user.isAdmin ? { text: t("adminBadgeAdmin"), tone: "neutral" } : null,
    adminAiReady(user) ? { text: t("adminBadgeAiReady"), tone: "success" } : { text: t("adminBadgeAiMissing"), tone: "warning" },
    user.profile ? { text: t("adminBadgeProfiled"), tone: "success" } : { text: t("adminBadgeNoProfile"), tone: "neutral" },
    { text: participantStageText(adminStudyStage(user)), tone: participantStageTone(adminStudyStage(user)) },
    { text: evidenceLevelText(adminEvidenceLevel(user)), tone: evidenceLevelTone(adminEvidenceLevel(user)) },
    { text: riskBandText(user.riskScore), tone: riskBandTone(user.riskScore) },
  ].filter(Boolean);
}

function createBadge(text, tone = "neutral") {
  const node = document.createElement("span");
  node.className = `admin-badge ${tone}`;
  node.textContent = text;
  return node;
}

function extractProfileTags(user) {
  if (!user.profile) return [];
  return [
    ...(user.profile.traits || []),
    ...(user.profile.triggers || []),
    ...(user.profile.purchase_categories || []),
    ...(user.profile.emotional_states || []),
  ].filter(Boolean).slice(0, 8);
}

function isHighRisk(user) {
  return Number(user.riskScore) >= 70;
}

function needsAttention(user) {
  return isHighRisk(user) || !adminAiReady(user) || !user.profile || adminEvidenceLevel(user) === "low";
}

function adminAiReady(user) {
  return Boolean(user.aiSettings?.hasApiKey && user.aiSettings?.requestUrl && user.aiSettings?.model);
}

function adminStudyStage(user) {
  if (!user.messageCount) return "screening";
  if (!user.profile) return user.messageCount >= 3 ? "elicitation" : "screening";
  if (adminCompletionScore(user) >= 75) return "stabilized";
  return "profiling";
}

function adminEvidenceLevel(user) {
  const completion = adminCompletionScore(user);
  if (completion >= 70) return "high";
  if (completion >= 40) return "medium";
  return "low";
}

function adminCompletionScore(user) {
  const score = clampValue(
    (user.messageCount || 0) * 8
      + (user.profile ? 28 : 0)
      + (user.profileSummary ? 12 : 0)
      + ((user.profile?.evidence || []).length || 0) * 6
      + ((user.profile?.triggers || []).length || 0) * 5,
    0,
    100,
  );
  return score;
}

function adminExportReady(user) {
  return Boolean(user.profile && adminCompletionScore(user) >= 55);
}

function compareNumbers(left, right) {
  return Number(left || 0) - Number(right || 0);
}

function compareDates(left, right) {
  return new Date(left || 0).getTime() - new Date(right || 0).getTime();
}

function riskBandText(value) {
  if (value === null || value === undefined || value === -1) return t("adminRiskUnknown");
  if (Number(value) >= 70) return t("adminRiskHigh");
  if (Number(value) >= 40) return t("adminRiskMedium");
  return t("adminRiskLow");
}

function riskBandTone(value) {
  if (value === null || value === undefined || value === -1) return "neutral";
  if (Number(value) >= 70) return "danger";
  if (Number(value) >= 40) return "warning";
  return "success";
}

async function clearSelectedProfiles() {
  const selected = state.adminUsers.filter((user) => state.adminSelected.has(user.id));
  if (!selected.length) return;
  if (!confirm(template("confirmClearSelected", { count: selected.length }))) return;

  setBusy(elements.clearSelectedProfilesButton, true);
  try {
    await Promise.all(selected.map((user) => api(`/admin/users/${encodeURIComponent(user.id)}/profile`, { method: "POST" })));
    state.adminSelected.clear();
    await loadAdminUsers();
    alert(template("adminBulkClearDone", { count: selected.length }));
  } finally {
    setBusy(elements.clearSelectedProfilesButton, false);
  }
}

function exportAdminUsers(users) {
  if (!users.length) return;

  const rows = [
    [
      "user_id",
      "is_admin",
      "risk_score",
      "message_count",
      "profiled",
      "ai_configured",
      "model",
      "request_url",
      "last_login_at",
      "created_at",
      "profile_summary",
      "study_stage",
      "evidence_level",
      "completion_score",
    ],
    ...users.map((user) => [
      user.id,
      user.isAdmin ? "yes" : "no",
      user.riskScore === null || user.riskScore === undefined ? "" : user.riskScore,
      user.messageCount || 0,
      user.profile ? "yes" : "no",
      user.aiSettings?.hasApiKey ? "yes" : "no",
      user.aiSettings?.model || "",
      user.aiSettings?.requestUrl || "",
      user.lastLoginAt || "",
      user.createdAt || "",
      user.profileSummary || "",
      adminStudyStage(user),
      adminEvidenceLevel(user),
      adminCompletionScore(user),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  downloadText(`ai-isp-admin-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
}

async function exportResearchPackage() {
  setBusy(elements.exportStudyButton, true);
  try {
    const result = await api("/research-export");
    downloadText(result.filename || `ai-isp-study-${Date.now()}.json`, JSON.stringify(result, null, 2), "application/json");
  } catch (error) {
    alert(`${t("requestFailed")}: ${error.message}`);
  } finally {
    setBusy(elements.exportStudyButton, false);
  }
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
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });

  elements.messageInput.placeholder = t("chatPlaceholder");
  elements.authSubmit.textContent = t(state.mode);
  renderAiStatus(state.aiConfigured);
  renderProtocolSteps();
  elements.adminSortSelect.value = state.adminSort;

  if (state.lastInsights) {
    renderStudyMeta(state.lastInsights.studyMeta || {});
    renderParticipant(state.lastInsights.participant || {});
    renderMethodology(state.lastInsights.methodology || {});
    renderProfile(state.lastInsights.currentUserProfile, state.lastInsights.summary);
    renderAgentic(state.lastInsights.agentic);
    renderTheory(state.lastInsights.theory);
    renderVisualization(state.lastInsights.visualization);
    renderFeatures(state.lastInsights.commonFeatures || []);
  }

  if (state.user?.isAdmin) {
    renderAdminConsole();
  }
}

function resolveTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  return prefersDarkQuery.matches ? "dark" : "light";
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
}

function t(key) {
  return I18N[state.language]?.[key] || I18N.en[key] || key;
}

function template(key, values = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
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

function formatMaybeDate(value) {
  if (!value) return t("unknown");
  return formatAdminDate(value);
}

function formatAdminDate(value) {
  if (!value) return t("unknown");
  return new Intl.DateTimeFormat(document.documentElement.lang, {
    year: "numeric",
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

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function clampValue(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
