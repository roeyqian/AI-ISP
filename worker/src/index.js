const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_FILE_SIZE = 500_000;
const TEXT_FILE_TYPES = new Set([
  "text/", "application/json", "application/xml", "application/javascript",
  "application/typescript", "text/x-", "application/x-",
]);
const ADMIN_ID = "admin";
const ADMIN_PASSWORD = "123456";
const ADMIN_SALT = "ai_isp_admin_static_salt_v1";

const LANGUAGES = {
  zh: "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  es: "Spanish",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      const status =
        typeof error === "object" && error && "status" in error ? Number(error.status) || 500 : 500;
      const message = error instanceof Error ? error.message : String(error);
      return json(
        { error: status === 500 ? "服务器处理失败" : message, detail: status === 500 ? message : undefined },
        status,
      );
    }
  },
};

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  await ensureAdminUser(env);

  const route = `${request.method} ${url.pathname}`;
  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  const adminProfileMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/profile$/);

  if (route === "POST /api/register") return register(request, env);
  if (route === "POST /api/login") return login(request, env);
  if (route === "POST /api/logout") return logout(request, env);
  if (route === "GET /api/me") return me(request, env);
  if (route === "GET /api/history") return history(request, env);
  if (route === "DELETE /api/history") return clearHistory(request, env);
  if (route === "POST /api/chat") return chat(request, env);
  if (route === "GET /api/insights") return insights(request, env);
  if (route === "GET /api/ai-settings") return getAiSettings(request, env);
  if (route === "PUT /api/ai-settings") return saveAiSettings(request, env);
  if (route === "GET /api/admin/users") return adminUsers(request, env);
  if (request.method === "DELETE" && adminUserMatch) {
    return adminDeleteUser(request, env, decodeURIComponent(adminUserMatch[1]));
  }
  if (request.method === "POST" && adminProfileMatch) {
    return adminClearProfile(request, env, decodeURIComponent(adminProfileMatch[1]));
  }

  return json({ error: "API 不存在" }, 404);
}

async function register(request, env) {
  const body = await readJson(request);
  const userId = normalizeUserId(body.userId);
  const password = String(body.password || "");

  if (!userId || password.length < 4) {
    return json({ error: "请输入用户 ID 和至少 4 位密码" }, 400);
  }

  if (userId === ADMIN_ID) {
    return json({ error: "该用户 ID 不允许注册" }, 400);
  }

  const existing = await env.db.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (existing) return json({ error: "用户 ID 已存在" }, 409);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  await env.db.prepare(
    "INSERT INTO users (id, password_hash, salt, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(userId, passwordHash, salt, now, now)
    .run();

  const session = await createSession(env, userId);
  return json({ user: publicUser({ id: userId }), token: session.token, expiresAt: session.expiresAt }, 201);
}

async function login(request, env) {
  const body = await readJson(request);
  const userId = normalizeUserId(body.userId);
  const password = String(body.password || "");

  if (!userId || !password) return json({ error: "请输入用户 ID 和密码" }, 400);

  const user = await env.db.prepare("SELECT id, password_hash, salt FROM users WHERE id = ?")
    .bind(userId)
    .first();
  if (!user) return json({ error: "用户不存在或密码错误" }, 401);

  const passwordHash = await hashPassword(password, user.salt);
  if (!timingSafeEqual(passwordHash, user.password_hash)) {
    return json({ error: "用户不存在或密码错误" }, 401);
  }

  await env.db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), userId)
    .run();

  const session = await createSession(env, userId);
  return json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
}

async function logout(request, env) {
  const token = readBearerToken(request);
  if (token) await env.kv.delete(sessionKey(token));
  return json({ ok: true });
}

async function me(request, env) {
  const user = await requireUser(request, env);
  return json({ user: publicUser(user) });
}

async function history(request, env) {
  const user = await requireUser(request, env);
  const messages = await env.db.prepare(
    "SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 80",
  )
    .bind(user.id)
    .all();

  return json({ messages: messages.results || [] });
}

async function clearHistory(request, env) {
  const user = await requireUser(request, env);
  const deletedMessages = await env.db.prepare("DELETE FROM messages WHERE user_id = ?")
    .bind(user.id)
    .run();
  const profile = await getStoredProfile(env, user.id);

  return json({
    ok: true,
    deleted: {
      messages: deletedMessages.meta?.changes || 0,
    },
    profile,
  });
}

async function chat(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const message = String(body.message || "").trim();
  const language = normalizeLanguage(body.language);
  const file = validateFileAttachment(body.file);

  if (!message && !file) return json({ error: "消息不能为空" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符` }, 400);
  }

  const displayMessage = buildDisplayMessage(message, file);
  const aiSettings = await getUserAiSettings(env, user.id, true);
  const existingProfile = await getStoredProfile(env, user.id);
  const now = new Date().toISOString();
  await insertMessage(env, user.id, "user", displayMessage, now);

  const recentMessages = await getRecentMessages(env, user.id, 16);
  const relevance = assessConsumptionRelevance(recentMessages);
  const assistantText = await generateAssistantReply(aiSettings, recentMessages, language, relevance, existingProfile);
  await insertMessage(env, user.id, "assistant", assistantText, new Date().toISOString());

  const profile = await refreshProfile(env, user.id, aiSettings, language, relevance);
  await updateCommonFeatures(env, profile);

  return json({
    reply: assistantText,
    profile,
    aiConfigured: Boolean(aiSettings.apiKey && aiSettings.requestUrl && aiSettings.model),
  });
}

async function insights(request, env) {
  const user = await requireUser(request, env);

  const profile = await env.db.prepare(
    "SELECT profile_json, summary, risk_score, updated_at FROM user_profiles WHERE user_id = ?",
  )
    .bind(user.id)
    .first();

  const totals = await env.db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM user_profiles) AS profiled_users,
      (SELECT COUNT(*) FROM messages) AS total_messages`,
  ).first();

  const features = await env.db.prepare(
    "SELECT category, feature, count, last_seen_at FROM common_features ORDER BY count DESC, last_seen_at DESC LIMIT 30",
  ).all();

  const recentMessagesResult = await env.db.prepare(
    "SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 18",
  )
    .bind(user.id)
    .all();
  const recentMessages = [...(recentMessagesResult.results || [])].reverse();
  const currentUserProfile = profile ? parseJson(profile.profile_json, null) : null;
  const agentic = buildAgenticInsights(currentUserProfile, recentMessages);
  const theory = buildTheoryInsights(currentUserProfile, recentMessages);
  const visualization = buildVisualizationInsights(currentUserProfile, recentMessages);

  return json({
    currentUserProfile,
    summary: profile?.summary || "",
    riskScore: profile?.risk_score === -1 ? null : profile?.risk_score || 0,
    updatedAt: profile?.updated_at || null,
    totals,
    commonFeatures: features.results || [],
    agentic,
    theory,
    visualization,
  });
}

async function getAiSettings(request, env) {
  const user = await requireUser(request, env);
  const settings = await getUserAiSettings(env, user.id, true);
  return json({ settings });
}

async function saveAiSettings(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const existing = await getUserAiSettings(env, user.id, true);

  const requestUrl = normalizeRequestUrl(body.requestUrl ?? existing.requestUrl);
  const model = String(body.model ?? existing.model ?? "").trim();
  const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = body.clearApiKey ? "" : rawApiKey || existing.apiKey || "";

  if (!requestUrl) return json({ error: "请输入有效的 AI 请求 URL" }, 400);
  if (!model || model.length > 120) return json({ error: "请输入有效的模型名称" }, 400);
  if (!apiKey) return json({ error: "请输入 AI API Key" }, 400);

  const now = new Date().toISOString();
  await env.db.prepare(
    `INSERT INTO user_ai_settings (user_id, request_url, model, api_key, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       request_url = excluded.request_url,
       model = excluded.model,
       api_key = excluded.api_key,
       updated_at = excluded.updated_at`,
  )
    .bind(user.id, requestUrl, model, apiKey, now)
    .run();

  return json({ settings: sanitizeAiSettings({ requestUrl, model, apiKey, updatedAt: now }, true) });
}

async function adminUsers(request, env) {
  await requireAdmin(request, env);

  const rows = await env.db.prepare(
    `SELECT
       u.id,
       u.created_at,
       u.last_login_at,
       p.profile_json,
       p.summary,
       p.risk_score,
       p.updated_at AS profile_updated_at,
       s.request_url,
       s.model,
       CASE WHEN s.api_key IS NOT NULL AND s.api_key != '' THEN 1 ELSE 0 END AS has_api_key,
       (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS message_count
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     LEFT JOIN user_ai_settings s ON s.user_id = u.id
     ORDER BY u.created_at DESC`,
  ).all();

  return json({
    users: (rows.results || []).map((row) => ({
      id: row.id,
      isAdmin: row.id === ADMIN_ID,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      messageCount: row.message_count || 0,
      profile: row.profile_json ? parseJson(row.profile_json, null) : null,
      profileSummary: row.summary || "",
      riskScore: row.risk_score === -1 ? null : row.risk_score || 0,
      profileUpdatedAt: row.profile_updated_at || null,
      aiSettings: {
        requestUrl: row.request_url || "",
        model: row.model || "",
        hasApiKey: Boolean(row.has_api_key),
      },
    })),
  });
}

async function adminDeleteUser(request, env, userId) {
  await requireAdmin(request, env);
  const normalized = normalizeUserId(userId);

  if (!normalized) return json({ error: "用户 ID 无效" }, 400);
  if (normalized === ADMIN_ID) return json({ error: "不能删除管理员账户" }, 400);

  await env.db.prepare("DELETE FROM messages WHERE user_id = ?").bind(normalized).run();
  await env.db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(normalized).run();
  await env.db.prepare("DELETE FROM user_features WHERE user_id = ?").bind(normalized).run();
  await env.db.prepare("DELETE FROM user_ai_settings WHERE user_id = ?").bind(normalized).run();
  await env.db.prepare("DELETE FROM users WHERE id = ?").bind(normalized).run();
  await recomputeCommonFeatures(env);

  return json({ ok: true });
}

async function adminClearProfile(request, env, userId) {
  await requireAdmin(request, env);
  const normalized = normalizeUserId(userId);

  if (!normalized) return json({ error: "用户 ID 无效" }, 400);

  const deletedMessages = await env.db.prepare("DELETE FROM messages WHERE user_id = ?").bind(normalized).run();
  const deletedProfiles = await env.db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(normalized).run();
  const deletedFeatures = await env.db.prepare("DELETE FROM user_features WHERE user_id = ?").bind(normalized).run();
  await recomputeCommonFeatures(env);

  return json({
    ok: true,
    deleted: {
      messages: deletedMessages.meta?.changes || 0,
      profiles: deletedProfiles.meta?.changes || 0,
      features: deletedFeatures.meta?.changes || 0,
    },
  });
}

async function generateAssistantReply(aiSettings, recentMessages, language, relevance, profile) {
  const languageName = LANGUAGES[language] || LANGUAGES.en;
  const assessmentBrief = situationAssessmentBrief(language);
  const messages = [
    {
      role: "system",
      content:
        `You are a professional behavioral-assessment interviewer for a research app about impulsive buying. ` +
        `Assess the user's impulsive consumption pattern through realistic situational judgment questions, like a polished psychological questionnaire, instead of bluntly asking whether the user is impulsive or asking them to self-label. ` +
        `Make the visible questions feel like ordinary daily-life moments, not a transparent self-control test. Avoid telegraphing trait labels in the question text or options, and keep every option socially plausible without an obviously correct answer. ` +
        `When the user starts, asks for a test, gives little context, or has not answered enough assessment items, present 3 everyday scenarios with one focused question per scenario and 4 answer options. ` +
        `Cover: limited-time promotions, emotion/reward buying, social recommendation influence, budget trade-offs, and post-purchase reflection. ` +
        `Ask the user to answer in a compact format such as "1A 2C 3B". ` +
        `When the user answers, interpret cautiously using behavioral indicators only, then ask 1-2 targeted follow-up situational questions if more evidence is needed. ` +
        `Do not diagnose mental health conditions. Do not shame the user. Do not provide financial advice beyond general self-control strategies. ` +
        `If the message is meaningless or clearly off-topic, invite the user to start the situational assessment rather than forcing an inference. ` +
        `Reply in ${languageName}. Keep the response concise but professional.`,
    },
    {
      role: "system",
      content: `Current relevance estimate: ${relevance.status}. Reason: ${relevance.reason}.`,
    },
    {
      role: "system",
      content: `Use this assessment format when a new scenario set is needed:\n${assessmentBrief}`,
    },
    ...(profile
      ? [
          {
            role: "system",
            content:
              `Preserved user profile after any context reset: ${JSON.stringify(profile)}. ` +
              `Use it as background knowledge about the current user, but prioritize the latest user message if it changes or corrects the profile.`,
          },
        ]
      : []),
    ...recentMessages.map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content,
    })),
  ];

  return callChatCompletion(aiSettings, messages, fallbackReply(language, relevance), 0.4);
}

async function refreshProfile(env, userId, aiSettings, language, relevance) {
  const rows = await env.db.prepare(
    "SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 40",
  )
    .bind(userId)
    .all();
  const chronological = [...(rows.results || [])].reverse();

  const existing = await env.db.prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first();

  const profile = await extractProfile(aiSettings, chronological, existing?.profile_json || "{}", language, relevance);
  profile.user_id = userId;
  const now = new Date().toISOString();
  const storedRiskScore = profile.risk_score === null ? -1 : Number(profile.risk_score || 0);

  await env.db.prepare(
    `INSERT INTO user_profiles (user_id, profile_json, summary, risk_score, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       profile_json = excluded.profile_json,
       summary = excluded.summary,
       risk_score = excluded.risk_score,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(profile), profile.summary || "", storedRiskScore, now)
    .run();

  return profile;
}

async function extractProfile(aiSettings, messages, existingProfileJson, language, relevance) {
  const languageName = LANGUAGES[language] || LANGUAGES.en;
  const transcript = messages
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
    .join("\n");

  if (relevance.status === "insufficient") {
    return makeUnknownProfile(messages, language, relevance.reason);
  }

  const prompt = `Update a structured profile for a user with impulsive buying behavior.
Output valid JSON only. Do not use Markdown.
Write all JSON string values in ${languageName}.
The conversation may contain situational judgment items and compact answers such as "1A 2C 3B"; treat those answers as valid evidence only when the assistant previously asked shopping-related scenarios.
Infer from observable behavioral indicators: urgency, discount scarcity sensitivity, emotional repair/reward buying, social recommendation influence, budget checking, delay tolerance, and post-purchase regret.
Do not infer impulsive buying traits from ambiguous, meaningless, numeric-only, off-topic input, or option-only answers without a preceding scenario question.
If there is not enough consumption-related evidence, return:
{
  "summary": "insufficient information",
  "impulse_level": "unknown",
  "risk_score": null,
  "traits": [],
  "triggers": [],
  "purchase_categories": [],
  "emotional_states": [],
  "intervention_preferences": [],
  "evidence": []
}

Existing profile:
${existingProfileJson}

Latest conversation:
${transcript}

JSON schema:
{
  "summary": "one sentence",
  "impulse_level": "unknown|low|medium|high",
  "risk_score": null or 0-100,
  "traits": ["common or individual traits"],
  "triggers": ["purchase triggers"],
  "purchase_categories": ["frequent purchase categories"],
  "emotional_states": ["related emotional states"],
  "intervention_preferences": ["useful intervention styles"],
  "evidence": ["brief evidence from the conversation"]
}`;

  const text = await callChatCompletion(
    aiSettings,
    [
      {
        role: "system",
        content:
          "You are a user research analyst extracting structured profiles from impulsive buying conversations. Output parseable JSON only.",
      },
      { role: "user", content: prompt },
    ],
    JSON.stringify(makeHeuristicProfile(messages, language, relevance)),
    0.2,
  );

  const profile = normalizeProfile(parseModelJson(text) || makeHeuristicProfile(messages, language, relevance));
  profile.user_id = "";
  return profile;
}

async function updateCommonFeatures(env, profile) {
  const entries = [
    ...toFeatureEntries("trait", profile.traits),
    ...toFeatureEntries("trigger", profile.triggers),
    ...toFeatureEntries("category", profile.purchase_categories),
    ...toFeatureEntries("emotion", profile.emotional_states),
    ...toFeatureEntries("intervention", profile.intervention_preferences),
  ];

  const now = new Date().toISOString();
  const userId = profile.user_id;

  if (!userId) return;

  await env.db.prepare("DELETE FROM user_features WHERE user_id = ?").bind(userId).run();

  for (const item of entries) {
    await env.db.prepare(
      "INSERT OR IGNORE INTO user_features (user_id, category, feature, last_seen_at) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, item.category, item.feature, now)
      .run();
  }

  await recomputeCommonFeatures(env);
}

async function recomputeCommonFeatures(env) {
  const counts = await env.db.prepare(
    `SELECT category, feature, COUNT(DISTINCT user_id) AS count, MAX(last_seen_at) AS last_seen_at
     FROM user_features
     GROUP BY category, feature`,
  ).all();

  await env.db.prepare("DELETE FROM common_features").run();

  for (const item of counts.results || []) {
    await env.db.prepare(
      "INSERT INTO common_features (category, feature, count, last_seen_at) VALUES (?, ?, ?, ?)",
    )
      .bind(item.category, item.feature, item.count, item.last_seen_at)
      .run();
  }
}

async function callChatCompletion(aiSettings, messages, fallback, temperature) {
  if (!aiSettings.apiKey || !aiSettings.requestUrl || !aiSettings.model) return fallback;

  const response = await fetch(toCompletionUrl(aiSettings.requestUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${aiSettings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: aiSettings.model,
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const detail = await readResponsePreview(response, 2048);
    console.error("AI request failed", response.status, detail.slice(0, 500));
    return fallback;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || fallback;
}

async function getUserAiSettings(env, userId, includeSecret) {
  const row = await env.db.prepare(
    "SELECT request_url, model, api_key, updated_at FROM user_ai_settings WHERE user_id = ?",
  )
    .bind(userId)
    .first();

  if (!row) {
    return sanitizeAiSettings({
      requestUrl: "",
      model: "",
      apiKey: "",
      updatedAt: null,
    }, includeSecret);
  }

  return sanitizeAiSettings({
    requestUrl: row.request_url || "",
    model: row.model || "",
    apiKey: row.api_key || "",
    updatedAt: row.updated_at || null,
  }, includeSecret);
}

async function getStoredProfile(env, userId) {
  const row = await env.db.prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  return row?.profile_json ? parseJson(row.profile_json, null) : null;
}

function sanitizeAiSettings(settings, includeSecret = false) {
  return {
    requestUrl: settings.requestUrl || "",
    model: settings.model || "",
    apiKey: includeSecret ? settings.apiKey || "" : undefined,
    hasApiKey: Boolean(settings.apiKey),
    updatedAt: settings.updatedAt || null,
  };
}

function assessConsumptionRelevance(messages) {
  const userMessages = messages.filter((item) => item.role === "user").map((item) => item.content.trim());
  const assistantMessages = messages.filter((item) => item.role === "assistant").map((item) => item.content.trim());
  const latest = userMessages[userMessages.length - 1] || "";
  const joined = userMessages.slice(-4).join(" ");
  const recentAssistant = assistantMessages.slice(-2).join(" ");
  const consumptionPattern =
    /(买|购买|下单|消费|花钱|付款|预算|折扣|优惠|满减|限时|秒杀|购物|商品|价格|贵|便宜|退款|直播间|种草|冲动|想要|耳机|手机|衣服|鞋|包|化妆|护肤|buy|bought|purchase|spend|shopping|order|cart|discount|sale|budget|price|product|impulse|want to buy|comprar|compra|gastar|descuento|precio|presupuesto|producto|compré|買う|購入|注文|消費|予算|割引|価格|商品|衝動買い)/i;
  const emotionPattern = /(焦虑|压力|难过|开心|奖励|犒劳|后悔|内疚|stress|anxious|reward|regret|guilt|estrés|ansiedad|recompensa|後悔|不安|ストレス)/i;
  const assessmentIntentPattern =
    /(测评|测试|问卷|心理|评估|开始|题目|情境|场景|做题|判断|test|assessment|quiz|questionnaire|start|scenario|situation|diagnóstico|evaluación|cuestionario|テスト|診断|質問|シナリオ)/i;
  const scenarioPromptPattern =
    /(情境|场景|选项|请选择|回答|限时|预算|折扣|推荐|1A|2B|scenario|situation|option|choose|answer|discount|budget|recommendation|escenario|opción|responde|シナリオ|選択肢|回答)/i;
  const compactAnswerPattern =
    /^\s*(?:(?:[1-9一二三四五六七八九]\s*)?[A-Da-d][\s,，;；、]*){1,8}\s*$/;
  const signalCount = [consumptionPattern.test(joined), emotionPattern.test(joined) && consumptionPattern.test(joined)].filter(Boolean).length;
  const meaningfulChars = latest.replace(/\s|[0-9.,，。!?！？;；:：'"“”‘’()[\]{}-]/g, "").length;

  if (consumptionPattern.test(joined)) {
    return { status: "relevant", reason: "The conversation contains consumption-related language." };
  }

  if (assessmentIntentPattern.test(latest)) {
    return { status: "relevant", reason: "The user is asking to start or continue a situational assessment." };
  }

  if (compactAnswerPattern.test(latest) && scenarioPromptPattern.test(recentAssistant)) {
    return { status: "relevant", reason: "The user answered prior consumption-related situational judgment items." };
  }

  if (latest.length < 8 || meaningfulChars < 3 || signalCount === 0) {
    return { status: "insufficient", reason: "The latest message is too short, ambiguous, or not consumption-related." };
  }

  return { status: "insufficient", reason: "There is not enough evidence to infer impulsive buying tendency." };
}

function buildAgenticInsights(profile, messages) {
  const relevance = assessConsumptionRelevance(messages);
  const state = deriveBehaviorState(profile, messages, relevance);
  const stage = selectAgenticStage(state, relevance);

  return {
    stage,
    relevance: relevance.status,
    nextAction: selectNextAction(state, relevance),
    drivers: state.drivers,
    features: relevance.status === "insufficient"
      ? ["adaptive_probe", "stateful_memory", "next_best_action"]
      : ["adaptive_looping", "stateful_memory", "next_best_action"],
    scores: {
      promotion: state.promotion,
      emotion: state.emotion,
      social: state.social,
      control: state.control,
    },
  };
}

function buildTheoryInsights(profile, messages) {
  const relevance = assessConsumptionRelevance(messages);
  const state = deriveBehaviorState(profile, messages, relevance);
  const nextAction = selectNextAction(state, relevance);
  const cards = [
    {
      theory: "dual_process",
      strength: Math.round((state.promotion + state.emotion + (100 - state.control)) / 3),
      signals: uniqueCodes([
        state.promotion >= 45 ? "discount" : "",
        state.emotion >= 45 ? "emotion" : "",
        state.control < 45 ? "low_control" : "",
      ]),
      interventions: uniqueCodes([nextAction, "cooldown_compare", "substitute_reward"]).slice(0, 2),
    },
    {
      theory: "temporal_discounting",
      strength: Math.round((state.promotion + state.risk + (100 - state.control)) / 3),
      signals: uniqueCodes([
        state.promotion >= 45 ? "discount" : "",
        state.risk >= 55 ? "urgency" : "",
        state.control < 50 ? "delay" : "",
      ]),
      interventions: uniqueCodes([nextAction, "waitlist_commit", "budget_anchor"]).slice(0, 2),
    },
    {
      theory: "implementation_intentions",
      strength: Math.round((state.control + Math.max(state.risk, 40)) / 2),
      signals: uniqueCodes([
        state.control >= 45 ? "budget" : "",
        state.control >= 45 ? "delay" : "",
        state.social >= 45 ? "social" : "",
      ]),
      interventions: uniqueCodes([nextAction, "if_then_plan", "budget_anchor"]).slice(0, 2),
    },
    {
      theory: "social_influence",
      strength: Math.round((state.social + Math.max(state.risk - 10, 20)) / 2),
      signals: uniqueCodes([
        state.social >= 45 ? "social" : "",
        state.promotion >= 45 ? "discount" : "",
        state.control < 45 ? "compare" : "",
      ]),
      interventions: uniqueCodes([nextAction, "social_second_opinion", "waitlist_commit"]).slice(0, 2),
    },
  ]
    .map((item) => ({ ...item, strength: clampNumber(item.strength, 12, 96) }))
    .filter((item, index) => item.strength >= 35 || index < 3);

  return { cards };
}

function buildVisualizationInsights(profile, messages) {
  const relevance = assessConsumptionRelevance(messages);
  const state = deriveBehaviorState(profile, messages, relevance);
  const nextAction = selectNextAction(state, relevance);

  return {
    contributions: [
      "trajectory_not_single_score",
      "stateful_loop_map",
      "distinct_user_normalization",
    ],
    timeline: buildRiskTimeline(messages, profile?.risk_score ?? state.risk),
    loop: buildLoopSnapshot(state, nextAction),
  };
}

function deriveBehaviorState(profile, messages, relevance = assessConsumptionRelevance(messages)) {
  const text = messages.map((item) => item.content).join(" ");
  const assessment = assessmentAnswerSignals(messages);
  const storedRisk = profile?.risk_score;
  const baseRisk = storedRisk === null || storedRisk === undefined ? (relevance.status === "relevant" ? 44 : 24) : Number(storedRisk || 0);
  const promotion = clampNumber(
    12
      + (hasPromotionSignal(text) ? 28 : 0)
      + (hasUrgencySignal(text) ? 16 : 0)
      + (assessment.triggers.includes("discount") ? 18 : 0)
      + assessment.riskBumps * 3,
    0,
    100,
  );
  const emotion = clampNumber(
    10
      + (hasEmotionSignal(text) ? 30 : 0)
      + (assessment.emotions.includes("emotion") ? 18 : 0)
      + (/(奖励|犒劳|治愈|feel better|reward|treat|me lo merezco|ご褒美)/i.test(text) ? 14 : 0),
    0,
    100,
  );
  const social = clampNumber(
    8
      + (hasSocialSignal(text) ? 28 : 0)
      + (assessment.triggers.includes("social") ? 20 : 0),
    0,
    100,
  );
  const control = clampNumber(
    22
      + (hasBudgetSignal(text) ? 22 : 0)
      + (hasComparisonSignal(text) ? 22 : 0)
      + (hasDelaySignal(text) ? 14 : 0)
      + (assessment.interventions.includes("delay") ? 18 : 0)
      + (assessment.interventions.includes("budget") ? 18 : 0)
      - Math.max(0, baseRisk - 55) * 0.35,
    0,
    100,
  );
  const risk = clampNumber(
    Math.round(baseRisk * 0.45 + (promotion + emotion + social) * 0.24 - control * 0.12),
    0,
    100,
  );
  const drivers = uniqueCodes([
    relevance.status === "insufficient" ? "scenario" : "",
    promotion >= 45 ? "discount" : "",
    emotion >= 45 ? "emotion" : "",
    social >= 45 ? "social" : "",
    control < 45 ? "low_control" : "",
  ]);

  if (!drivers.length) drivers.push("baseline");

  return { baseRisk, promotion, emotion, social, control, risk, drivers, assessment };
}

function selectAgenticStage(state, relevance) {
  if (relevance.status === "insufficient") return "sense";
  if (state.risk >= 72 && state.control < 55) return "interrupt";
  if (state.risk >= 52) return "reframe";
  return "plan";
}

function selectNextAction(state, relevance) {
  if (relevance.status === "insufficient") return "scenario_probe";
  if (state.promotion >= 60 && state.control < 55) return "cooldown_compare";
  if (state.emotion >= 60) return "substitute_reward";
  if (state.social >= 55) return "social_second_opinion";
  if (state.control < 50) return "budget_anchor";
  if (state.risk >= 48) return "if_then_plan";
  return "waitlist_commit";
}

function buildRiskTimeline(messages, fallbackRisk) {
  const userMessages = messages.filter((item) => item.role === "user").slice(-6);

  if (!userMessages.length) {
    const base = clampNumber(fallbackRisk === null || fallbackRisk === undefined ? 26 : Number(fallbackRisk), 12, 90);
    return [
      { label: "baseline-1", value: Math.max(12, base - 6), signals: ["baseline"] },
      { label: "baseline-2", value: base, signals: ["baseline"] },
      { label: "baseline-3", value: Math.min(95, base + 4), signals: ["baseline"] },
    ];
  }

  let rolling = clampNumber(fallbackRisk === null || fallbackRisk === undefined ? 38 : Number(fallbackRisk), 12, 90);
  return userMessages.map((item, index) => {
    const measured = scoreMessageRisk(item.content, rolling);
    rolling = clampNumber(Math.round(rolling * 0.4 + measured * 0.6), 8, 96);
    return {
      label: item.created_at || `step-${index + 1}`,
      value: rolling,
      signals: detectSignalCodes(item.content),
    };
  });
}

function buildLoopSnapshot(state, nextAction) {
  const frictionSignals = mapActionToSupportSignals(nextAction);
  return [
    {
      step: "cue",
      value: clampNumber(Math.round((state.promotion + state.social) / 2), 0, 100),
      signals: uniqueCodes([
        state.promotion >= 45 ? "discount" : "",
        state.social >= 45 ? "social" : "",
        state.risk >= 55 ? "urgency" : "",
      ]),
    },
    {
      step: "urge",
      value: clampNumber(Math.round((state.promotion + state.emotion) / 2), 0, 100),
      signals: uniqueCodes([
        state.emotion >= 45 ? "emotion" : "",
        state.promotion >= 45 ? "discount" : "",
      ]),
    },
    {
      step: "friction",
      value: state.control,
      signals: uniqueCodes(frictionSignals),
    },
    {
      step: "reflection",
      value: clampNumber(Math.round((state.control + (100 - state.risk)) / 2), 0, 100),
      signals: uniqueCodes([
        ...frictionSignals,
        state.control >= 45 ? "budget" : "",
      ]),
    },
  ];
}

function mapActionToSupportSignals(action) {
  const map = {
    scenario_probe: ["scenario"],
    cooldown_compare: ["delay", "compare"],
    substitute_reward: ["emotion", "routine"],
    social_second_opinion: ["social", "compare"],
    budget_anchor: ["budget", "delay"],
    waitlist_commit: ["delay", "budget"],
    if_then_plan: ["budget", "routine"],
  };
  return map[action] || ["baseline"];
}

function scoreMessageRisk(content, baseline) {
  const text = String(content || "");
  const assessment = assessmentAnswerSignals([{ role: "user", content: text }]);
  let score = clampNumber(baseline === null || baseline === undefined ? 38 : Number(baseline), 8, 95);

  if (hasPromotionSignal(text)) score += 18;
  if (hasUrgencySignal(text)) score += 12;
  if (hasEmotionSignal(text)) score += 16;
  if (hasSocialSignal(text)) score += 12;
  if (hasBudgetSignal(text)) score -= 10;
  if (hasComparisonSignal(text)) score -= 12;
  if (hasDelaySignal(text)) score -= 8;

  score += assessment.riskBumps * 6;
  if (assessment.interventions.includes("delay")) score -= 10;
  if (assessment.interventions.includes("budget")) score -= 12;

  return clampNumber(Math.round(score), 8, 95);
}

function detectSignalCodes(text) {
  const value = String(text || "");
  const signals = uniqueCodes([
    hasPromotionSignal(value) ? "discount" : "",
    hasEmotionSignal(value) ? "emotion" : "",
    hasSocialSignal(value) ? "social" : "",
    hasBudgetSignal(value) ? "budget" : "",
    hasComparisonSignal(value) ? "compare" : "",
    hasDelaySignal(value) ? "delay" : "",
    hasUrgencySignal(value) ? "urgency" : "",
  ]);
  return signals.length ? signals : ["baseline"];
}

function hasPromotionSignal(text) {
  return /(打折|折扣|优惠|满减|限时|秒杀|活动|降价|discount|sale|flash sale|limited|price drop|oferta|descuento|rebaja|割引|セール|値下がり)/i.test(text);
}

function hasUrgencySignal(text) {
  return /(马上|立刻|只剩|恢复原价|今天截止|现在买|now|right now|last chance|expiring|running out|hoy|ahora|queda poco|今すぐ|本日中|残りわずか)/i.test(text);
}

function hasEmotionSignal(text) {
  return /(焦虑|压力|难过|烦|开心|奖励|犒劳|治愈|stress|anxious|reward|regret|guilt|feel better|treat myself|estrés|ansiedad|recompensa|culpa|後悔|不安|ストレス|ご褒美)/i.test(text);
}

function hasSocialSignal(text) {
  return /(直播|种草|博主|推荐|社交|朋友|同事|群聊|influencer|recommend|social|friend|group chat|creator|amigo|chat|recomendó|友達|同僚|おすすめ|チャット)/i.test(text);
}

function hasBudgetSignal(text) {
  return /(预算|账单|支出|固定开销|清单|比月末|budget|bill|expense|limit|planned purchase|presupuesto|factura|gasto|límite|予算|支払い|出費|固定費)/i.test(text);
}

function hasComparisonSignal(text) {
  return /(比较|对比|比价|评价|评论|记录|同类|替代|compare|review|price record|alternative|comparar|reseña|alternativa|比較|レビュー|代替)/i.test(text);
}

function hasDelaySignal(text) {
  return /(明天|先放着|晚点|等一等|冷静|回头再看|tomorrow|later|wait|hold|pause|save for later|mañana|después|esperar|guardarlo|明日|あとで|待つ|いったん)/i.test(text);
}

function uniqueCodes(items) {
  return [...new Set(items.filter(Boolean))];
}

function makeHeuristicProfile(messages, language, relevance = assessConsumptionRelevance(messages)) {
  if (relevance.status === "insufficient") {
    return makeUnknownProfile(messages, language, relevance.reason);
  }

  const text = messages.map((item) => item.content).join(" ");
  const userText = messages
    .filter((item) => item.role === "user")
    .map((item) => item.content)
    .join(" ");
  const labels = heuristicLabels(language);
  const assessment = assessmentAnswerSignals(messages);
  const hasAssessmentAnswer = assessment.riskBumps > 0 || assessment.interventions.length > 0;
  const assessmentOnlyPattern =
    /^(?:\s|开始|开始测评|测评|测试|问卷|心理测试|start|start assessment|assessment|quiz|test|テスト開始|診断|iniciar evaluación|evaluación)+$/i;
  const triggers = [];
  const categories = [];
  const emotions = [];
  const traits = [labels.instant, labels.reminder];
  const interventions = [labels.delay, labels.budget];

  if (!hasAssessmentAnswer && assessmentOnlyPattern.test(userText.trim())) {
    return makeUnknownProfile(messages, language, "The user started the assessment but has not answered scenario items yet.");
  }

  if (/(打折|折扣|优惠|满减|限时|秒杀|活动|discount|sale|limited|oferta|descuento|割引|セール)/i.test(text)) {
    triggers.push(labels.discount);
  }
  if (/(直播|种草|博主|推荐|社交|朋友|同事|stream|influencer|recommend|social|amigo|友達)/i.test(text)) {
    triggers.push(labels.social);
  }
  if (/(难过|焦虑|压力|烦|开心|奖励|犒劳|stress|anxious|reward|happy|estrés|ansiedad|不安|ストレス)/i.test(text)) {
    emotions.push(labels.emotion);
  }
  if (/(衣服|鞋|包|化妆|护肤|clothes|shoes|bag|makeup|ropa|zapatos|服|靴)/i.test(text)) {
    categories.push(labels.lifestyle);
  }
  if (/(数码|手机|电脑|耳机|游戏|phone|computer|headphone|game|teléfono|auriculares|スマホ|イヤホン)/i.test(text)) {
    categories.push(labels.digital);
  }

  triggers.push(...assessment.triggers.map((key) => labels[key]).filter(Boolean));
  emotions.push(...assessment.emotions.map((key) => labels[key]).filter(Boolean));
  traits.push(...assessment.traits.map((key) => labels[key]).filter(Boolean));
  interventions.push(...assessment.interventions.map((key) => labels[key]).filter(Boolean));

  return normalizeProfile({
    summary: labels.summary,
    impulse_level: assessment.riskBumps >= 3 || triggers.length + emotions.length > 2 ? "high" : triggers.length + emotions.length > 1 ? "medium" : "low",
    risk_score: Math.min(85, 30 + (triggers.length + emotions.length) * 12 + assessment.riskBumps * 10),
    traits,
    triggers,
    purchase_categories: categories,
    emotional_states: emotions,
    intervention_preferences: interventions,
    evidence: messages.slice(-3).map((item) => item.content.slice(0, 80)),
  });
}

function assessmentAnswerSignals(messages) {
  const text = messages
    .filter((item) => item.role === "user")
    .map((item) => item.content)
    .join(" ");
  const compact = text.toUpperCase().replace(/\s+/g, "");
  const has = (pattern) => pattern.test(compact);
  const signals = {
    riskBumps: 0,
    traits: [],
    triggers: [],
    emotions: [],
    interventions: [],
  };

  if (has(/1A/)) {
    signals.riskBumps += 2;
    signals.triggers.push("discount");
    signals.traits.push("instant");
  }
  if (has(/1B|1C/)) signals.interventions.push("delay", "budget");
  if (has(/2A|2D/)) {
    signals.riskBumps += 2;
    signals.emotions.push("emotion");
    signals.traits.push("instant");
  }
  if (has(/2B|2C/)) signals.interventions.push("delay", "budget");
  if (has(/3A/)) {
    signals.riskBumps += 2;
    signals.triggers.push("social");
  }
  if (has(/3B|3C/)) {
    signals.riskBumps += 1;
    signals.triggers.push("social");
  }
  if (has(/3D/)) signals.interventions.push("budget");

  signals.traits = [...new Set(signals.traits)];
  signals.triggers = [...new Set(signals.triggers)];
  signals.emotions = [...new Set(signals.emotions)];
  signals.interventions = [...new Set(signals.interventions)];
  return signals;
}

function makeUnknownProfile(messages, language, reason) {
  const labels = heuristicLabels(language);
  return normalizeProfile({
    summary: labels.unknownSummary,
    impulse_level: "unknown",
    risk_score: null,
    traits: [],
    triggers: [],
    purchase_categories: [],
    emotional_states: [],
    intervention_preferences: [],
    evidence: reason ? [reason, ...messages.slice(-1).map((item) => item.content.slice(0, 80))] : [],
  });
}

function heuristicLabels(language) {
  return {
    zh: {
      summary: "用户存在即时满足倾向，需要进一步通过对话确认触发因素与预算边界。",
      instant: "即时满足倾向",
      reminder: "购买前需要外部提醒",
      discount: "价格促销敏感",
      social: "社交与内容推荐影响",
      emotion: "情绪驱动购买",
      lifestyle: "外观与生活方式商品",
      digital: "数码娱乐商品",
      delay: "延迟 24 小时再决策",
      budget: "购买前核对预算与真实需求",
      unknownSummary: "信息不足，无法判断用户的冲动消费倾向。",
    },
    en: {
      summary: "The user shows a tendency toward immediate gratification and needs clearer budget boundaries.",
      instant: "Immediate gratification tendency",
      reminder: "Needs external reminders before buying",
      discount: "Sensitive to promotions",
      social: "Influenced by social and content recommendations",
      emotion: "Emotion-driven purchasing",
      lifestyle: "Appearance and lifestyle goods",
      digital: "Digital and entertainment goods",
      delay: "Delay the decision for 24 hours",
      budget: "Check budget and real need before buying",
      unknownSummary: "There is not enough information to determine the user's impulsive buying tendency.",
    },
    ja: {
      summary: "ユーザーには即時満足の傾向があり、購入前に予算の境界を明確にする必要があります。",
      instant: "即時満足の傾向",
      reminder: "購入前に外部からのリマインドが必要",
      discount: "割引やキャンペーンに敏感",
      social: "SNSや推薦コンテンツの影響",
      emotion: "感情主導の購買",
      lifestyle: "外見・ライフスタイル商品",
      digital: "デジタル・娯楽商品",
      delay: "24時間待ってから判断する",
      budget: "購入前に予算と本当の必要性を確認する",
      unknownSummary: "情報が不足しているため、衝動買い傾向は判断できません。",
    },
    es: {
      summary: "El usuario muestra una tendencia a la gratificación inmediata y necesita límites de presupuesto más claros.",
      instant: "Tendencia a la gratificación inmediata",
      reminder: "Necesita recordatorios externos antes de comprar",
      discount: "Sensibilidad a promociones",
      social: "Influencia social y de recomendaciones",
      emotion: "Compra impulsada por emociones",
      lifestyle: "Productos de imagen y estilo de vida",
      digital: "Productos digitales y de entretenimiento",
      delay: "Esperar 24 horas antes de decidir",
      budget: "Revisar presupuesto y necesidad real antes de comprar",
      unknownSummary: "No hay información suficiente para determinar la tendencia de compra impulsiva del usuario.",
    },
  }[language] || heuristicLabels("en");
}

function situationAssessmentBrief(language) {
  return {
    zh:
      `请用以下结构出题：\n` +
      `1. 日常价格变化场景：用户在通勤或睡前看到关注过的商品降价，页面还提示库存/时间变化，同时本月还有其他支出。问题要问“接下来怎么处理这页”。选项覆盖顺手下单、先放一放、查订单/价格记录、发给别人听意见。不要直接写“冲动”“自控”“理性”。\n` +
      `2. 一天结束后的浏览场景：用户刚经历忙乱、被否定或很累的晚上，刷到一件让人心情变好的东西。问题要问“此刻更像会做什么”。选项覆盖买下让今晚轻松一点、先离开页面做别的缓一下、只处理原计划的小物件、继续逛看看还有没有更合适的。避免把选项写成明显好坏。\n` +
      `3. 群聊/内容推荐场景：朋友、同事或博主在一个具体场景里推荐某件非急需物品，评论或群聊很热。问题要问“你会怎样把这件事放进自己的生活里判断”。选项覆盖点进去购买、收藏后比较、想象真实使用频率/替代品、先退出去看近期安排或账单。\n` +
      `请让用户按“1A 2C 3B”作答。题目要有具体生活细节，选项要自然、隐晦、都像真实的人会选。`,
    en:
      `Use this structure:\n` +
      `1. Everyday price-change scene: the user sees a saved item drop in price during a commute or before bed, with stock/time cues on the page and other expenses this month. Ask what they do with the page next. Options should cover casually buying, setting it aside, checking orders/price records, and sending it to someone for a second opinion. Do not use visible labels like "impulsive", "self-control", or "rational".\n` +
      `2. End-of-day browsing scene: after a messy, tiring, or discouraging day, the user sees something that would make the evening feel better. Ask what feels most like them in that moment. Options should cover buying to make tonight easier, leaving the page and doing something else first, only handling a small planned purchase, and browsing more to see what fits better. Avoid making any option look obviously good or bad.\n` +
      `3. Group chat/content recommendation scene: a friend, colleague, or creator recommends a non-urgent item in a concrete situation, and the chat/comments are lively. Ask how the user would fit it into their own life. Options should cover opening the link and buying, saving and comparing, imagining actual use frequency/substitutes, and stepping away to check near-term plans or bills.\n` +
      `Ask the user to answer like "1A 2C 3B". Add concrete daily-life details, keep options subtle, and make all options socially plausible.`,
    ja:
      `この構成で質問してください：\n` +
      `1. 日常の価格変化：通勤中や寝る前に、保存していた商品が値下がりし、在庫や時間の表示も出ている。一方で今月は他の支出もある。「このページを次にどう扱うか」を聞く。選択肢はそのまま買う、いったん置く、注文履歴/価格記録を見る、誰かに送って意見を聞く。表に出る文面では「衝動」「自制」「合理的」などのラベルを避ける。\n` +
      `2. 一日の終わりの閲覧：忙しい、疲れた、少し落ち込んだ夜に、気分が上がりそうなものを見つける。「その瞬間の自分に近い行動」を聞く。選択肢は今夜を少し楽にするため買う、先にページを離れて別のことをする、予定していた小さな買い物だけ済ませる、もう少し見て合うものを探す。明らかな正解/不正解に見せない。\n` +
      `3. グループチャット/投稿の推薦：友人、同僚、発信者が具体的な場面で急ぎではない商品をすすめ、コメントやチャットが盛り上がっている。「自分の生活にどう入るか」を聞く。選択肢はリンクを開いて買う、保存して比較する、実際の使用頻度や代替品を想像する、いったん離れて近い予定や支払いを見る。\n` +
      `「1A 2C 3B」の形式で回答してもらってください。生活感のある具体性を入れ、選択肢は控えめで自然にしてください。`,
    es:
      `Usa esta estructura:\n` +
      `1. Cambio de precio cotidiano: durante un trayecto o antes de dormir, el usuario ve que un producto guardado bajó de precio, con señales de stock/tiempo en la página y otros gastos este mes. Pregunta qué haría con esa página. Las opciones cubren comprar sin darle muchas vueltas, dejarlo para después, revisar pedidos/historial de precio, y enviarlo a alguien para escuchar otra opinión. Evita etiquetas visibles como "impulsivo", "autocontrol" o "racional".\n` +
      `2. Navegación al final del día: tras un día cansado, caótico o desalentador, ve algo que podría mejorarle la noche. Pregunta qué se parece más a lo que haría en ese momento. Las opciones cubren comprar para que la noche se sienta mejor, salir de la página y hacer otra cosa primero, comprar solo algo pequeño ya previsto, y seguir mirando si hay algo que encaje mejor. No hagas que una opción parezca claramente correcta.\n` +
      `3. Recomendación en chat/contenido: una amistad, colega o creador recomienda un artículo no urgente en una situación concreta y el chat/comentarios se animan. Pregunta cómo lo encajaría en su propia vida. Las opciones cubren abrir el enlace y comprar, guardar y comparar, imaginar frecuencia real de uso/sustitutos, y apartarse para mirar planes o pagos próximos.\n` +
      `Pide responder como "1A 2C 3B". Añade detalles cotidianos, mantén las opciones sutiles y plausibles.`,
  }[language] || situationAssessmentBrief("en");
}

function fallbackReply(language, relevance = { status: "relevant" }) {
  if (relevance.status === "insufficient") {
    return {
      zh:
        "下面是几个日常小场景，请凭第一反应选择更像你的做法，按 1A 2C 3B 这样的格式作答。\n\n" +
        "1. 晚上准备睡觉前，你看到之前收藏的一件东西降价了，页面还提示明早恢复原价。这个月后面还有几笔固定支出。你更可能怎么处理这页？\nA. 顺手买下，省得明天又涨回去\nB. 先放着，明天早上如果还惦记再看\nC. 翻一下最近订单和价格记录再说\nD. 发给熟人看看，让对方帮你拿个主意\n\n" +
        "2. 今天事情很多，回家路上又有点烦。你刷到一件会让今晚心情好一点的小东西。此刻哪种做法更像你？\nA. 买下它，让今晚轻松一点\nB. 先退出页面，洗澡或做点别的缓一缓\nC. 只把原本就打算买的小东西结掉\nD. 继续逛一会儿，看看有没有更合适的\n\n" +
        "3. 群聊里有人晒了一个新买的东西，几个人都说好用，链接也发出来了。它不算急需，但看起来确实能改善一点生活。你会怎么处理？\nA. 点进去看规格，合适就直接买\nB. 先收藏，再找几个评价和同类款比较\nC. 想一下自己一周里大概会用几次\nD. 先关掉，等看完近期安排和账单再说",
      en:
        "Here are a few everyday moments. Pick the option closest to your first reaction, and answer like 1A 2C 3B.\n\n" +
        "1. Before bed, you notice something you saved has dropped in price, and the page says it returns to normal tomorrow morning. You also have a few fixed expenses later this month. What do you do with the page?\nA. Buy it now so the price does not bounce back\nB. Leave it and check tomorrow if you still care\nC. Look at recent orders and price records first\nD. Send it to someone familiar for a second opinion\n\n" +
        "2. It has been a long, irritating day. On the way home, you see a small thing that would make tonight feel better. Which sounds most like you?\nA. Buy it to make the evening easier\nB. Close the page and do something else first\nC. Only check out a small item you had already planned\nD. Browse a little longer to see what fits better\n\n" +
        "3. Someone in a group chat shares a new purchase, a few people say it is useful, and the link is right there. You do not urgently need it, but it could improve daily life a bit. What do you do?\nA. Open the link and buy if the specs look right\nB. Save it and compare reviews/similar items\nC. Picture how often you would actually use it in a week\nD. Step away and check upcoming plans or bills first",
      ja:
        "日常の小さな場面をいくつか出します。最初の反応に近いものを選び、「1A 2C 3B」のように回答してください。\n\n" +
        "1. 寝る前、保存していた商品が値下がりし、明朝には元の価格に戻ると表示されています。今月はまだ固定の支払いもあります。このページをどうしますか？\nA. 価格が戻る前にそのまま買う\nB. いったん置き、明日の朝も気になれば見る\nC. 最近の注文や価格記録を先に見る\nD. 身近な人に送って意見を聞く\n\n" +
        "2. 慌ただしく少し疲れた一日の帰り道、今夜の気分が少し良くなりそうな小物を見つけました。どれが近いですか？\nA. 今夜を少し楽にするため買う\nB. 先にページを閉じて別のことをする\nC. 予定していた小さな買い物だけ済ませる\nD. もう少し見て、より合うものを探す\n\n" +
        "3. グループチャットで誰かが新しく買ったものを見せ、数人が便利だと言い、リンクも送られています。急ぎではありませんが生活は少し良くなりそうです。どうしますか？\nA. リンクを開き、仕様が合えば買う\nB. 保存してレビューや似た商品を比べる\nC. 一週間で実際に何回使うか想像する\nD. いったん離れ、近い予定や支払いを確認する",
      es:
        "Aquí van unos momentos cotidianos. Elige lo que más se parezca a tu primera reacción y responde como 1A 2C 3B.\n\n" +
        "1. Antes de dormir ves que algo guardado bajó de precio, y la página dice que mañana vuelve al precio normal. También tienes algunos gastos fijos este mes. ¿Qué haces con esa página?\nA. Comprarlo ahora antes de que suba otra vez\nB. Dejarlo y revisarlo mañana si aún lo recuerdas\nC. Mirar pedidos recientes e historial de precio primero\nD. Enviarlo a alguien cercano para escuchar otra opinión\n\n" +
        "2. Fue un día largo e irritante. De camino a casa ves algo pequeño que haría la noche más agradable. ¿Qué se parece más a ti?\nA. Comprarlo para que la noche se sienta mejor\nB. Cerrar la página y hacer otra cosa primero\nC. Comprar solo algo pequeño que ya estaba previsto\nD. Seguir mirando un poco para ver qué encaja mejor\n\n" +
        "3. En un chat alguien muestra una compra nueva, varias personas dicen que sirve, y el enlace está ahí. No lo necesitas con urgencia, pero podría mejorar algo tu día a día. ¿Qué haces?\nA. Abrir el enlace y comprar si las especificaciones encajan\nB. Guardarlo y comparar reseñas o artículos parecidos\nC. Imaginar cuántas veces lo usarías realmente en una semana\nD. Apartarte y revisar primero planes o pagos próximos",
    }[language] || fallbackReply("en", relevance);
  }

  return {
    zh: "我们继续用日常小场景。请按“1A 2C 3B”回答：\n\n1. 睡前看到收藏商品降价、明早恢复原价，但本月还有固定支出：A 顺手买 / B 明天还惦记再看 / C 翻订单和价格记录 / D 发给熟人听意见。\n2. 忙乱一天后刷到能让今晚开心一点的小东西：A 买下让今晚轻松 / B 先退出页面缓一缓 / C 只结原计划小物 / D 继续逛看更合适的。\n3. 群聊都说某件东西好用且链接已发出：A 点进去合适就买 / B 收藏后比较 / C 想一周会用几次 / D 先看近期安排和账单。",
    en: "We will continue with everyday mini-scenes. Please answer like “1A 2C 3B”:\n\n1. Before bed, a saved item drops in price and returns tomorrow, with fixed expenses still coming: A buy now / B check tomorrow if it still sticks / C review orders and prices / D ask someone familiar.\n2. After a messy day, a small item could make tonight feel better: A buy it / B close the page first / C only buy a planned small item / D browse for a better fit.\n3. A group chat says something is useful and shares the link: A open and buy if it fits / B save and compare / C picture weekly use / D check upcoming plans and bills.",
    ja: "日常の小さな場面で続けます。「1A 2C 3B」のように回答してください：\n\n1. 寝る前に保存商品が値下がりし明日戻る、支払いも残っている：A 買う / B 明日も気になれば見る / C 注文と価格記録を見る / D 身近な人に聞く。\n2. 疲れた日に気分が上がりそうな小物を見つける：A 買う / B 先にページを閉じる / C 予定内の小物だけ買う / D もう少し探す。\n3. グループチャットで便利だと言われリンクがある：A 合えば買う / B 保存して比較 / C 週に何回使うか考える / D 予定や支払いを見る。",
    es: "Seguimos con mini escenas cotidianas. Responde como “1A 2C 3B”:\n\n1. Antes de dormir, algo guardado baja de precio y mañana vuelve, con gastos fijos pendientes: A comprar ahora / B revisar mañana si aún importa / C mirar pedidos y precios / D preguntar a alguien cercano.\n2. Tras un día caótico, algo pequeño podría mejorar la noche: A comprarlo / B cerrar la página primero / C comprar solo algo pequeño previsto / D seguir mirando otra opción.\n3. Un chat dice que algo sirve y comparte el enlace: A abrir y comprar si encaja / B guardar y comparar / C imaginar uso semanal / D mirar planes y pagos próximos.",
  }[language] || fallbackReply("en");
}

function normalizeProfile(raw) {
  const hasUnknownRisk = raw.risk_score === null || raw.risk_score === undefined || raw.risk_score === "unknown";
  const risk = Number(raw.risk_score || 0);
  return {
    user_id: raw.user_id ? String(raw.user_id) : "",
    summary: String(raw.summary || "画像仍在形成中").slice(0, 240),
    impulse_level: ["unknown", "low", "medium", "high"].includes(raw.impulse_level) ? raw.impulse_level : "unknown",
    risk_score: hasUnknownRisk || !Number.isFinite(risk) ? null : Math.max(0, Math.min(100, Math.round(risk))),
    traits: cleanList(raw.traits),
    triggers: cleanList(raw.triggers),
    purchase_categories: cleanList(raw.purchase_categories),
    emotional_states: cleanList(raw.emotional_states),
    intervention_preferences: cleanList(raw.intervention_preferences),
    evidence: cleanList(raw.evidence).slice(0, 6),
  };
}

function toFeatureEntries(category, items) {
  return cleanList(items).map((feature) => ({ category, feature }));
}

function cleanList(items) {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12);
}

function parseModelJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function insertMessage(env, userId, role, content, createdAt) {
  await env.db.prepare(
    "INSERT INTO messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), userId, role, content, createdAt)
    .run();
}

async function getRecentMessages(env, userId, limit) {
  const rows = await env.db.prepare(
    "SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(userId, limit)
    .all();
  return [...(rows.results || [])].reverse();
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.id !== ADMIN_ID) throw httpError("需要管理员权限", 403);
  return user;
}

async function requireUser(request, env) {
  const token = readBearerToken(request);
  if (!token) throw httpError("未登录", 401);

  const session = await env.kv.get(sessionKey(token), "json");
  if (!session?.userId) throw httpError("登录已过期", 401);

  const user = await env.db.prepare("SELECT id, created_at, last_login_at FROM users WHERE id = ?")
    .bind(session.userId)
    .first();
  if (!user) throw httpError("用户不存在", 401);

  return user;
}

async function ensureAdminUser(env) {
  const passwordHash = await hashPassword(ADMIN_PASSWORD, ADMIN_SALT);
  const now = new Date().toISOString();
  await env.db.prepare(
    `INSERT INTO users (id, password_hash, salt, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       password_hash = excluded.password_hash,
       salt = excluded.salt`,
  )
    .bind(ADMIN_ID, passwordHash, ADMIN_SALT, now, now)
    .run();
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const ttl = Number(env.SESSION_TTL_SECONDS || SESSION_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await env.kv.put(
    sessionKey(token),
    JSON.stringify({ userId, expiresAt }),
    { expirationTtl: ttl },
  );

  return { token, expiresAt };
}

function sessionKey(token) {
  return `session:${token}`;
}

function readBearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError("请求体必须是 JSON", 400);
  }
}

function publicUser(user) {
  return {
    id: user.id,
    created_at: user.created_at || null,
    last_login_at: user.last_login_at || null,
    isAdmin: user.id === ADMIN_ID,
  };
}

function validateFileAttachment(file) {
  if (!file || typeof file !== "object") return null;

  const name = String(file.name || "").trim();
  const content = String(file.content || "");
  const type = String(file.type || "text/plain");

  if (!name) return null;
  if (!content) return null;
  if (content.length > MAX_FILE_SIZE) return null;

  const looksBinary = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content.slice(0, 1024));
  if (looksBinary) return null;

  return { name: name.slice(0, 255), content, type: type.slice(0, 128) };
}

function buildDisplayMessage(message, file) {
  if (!file) return message;

  const extension = (file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "");
  const fence = extension === "md" || extension === "" ? "" : extension;

  let display = `[Attached file: ${file.name}]\n\n`;
  if (fence) {
    display += `\`\`\`${fence}\n${file.content}\n\`\`\``;
  } else {
    display += file.content;
  }

  if (message) {
    display += `\n\n---\nUser message: ${message}`;
  } else {
    display += `\n\n---\n[File attached without additional message]`;
  }

  return display;
}

function normalizeUserId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_\-.@]{2,64}$/.test(id) ? id : "";
}

function normalizeLanguage(value) {
  const language = String(value || "en").trim();
  return Object.hasOwn(LANGUAGES, language) ? language : "zh";
}

function normalizeRequestUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.length > 300) return "";
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function toCompletionUrl(requestUrl) {
  const base = requestUrl.replace(/\/$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return arrayBufferToHex(digest);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readResponsePreview(response, maxChars) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let preview = "";

  try {
    while (preview.length < maxChars) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      preview += decoder.decode(value, { stream: true });
      if (preview.length >= maxChars) {
        preview = preview.slice(0, maxChars);
        break;
      }
    }

    preview += decoder.decode();
    return preview.slice(0, maxChars);
  } catch {
    return preview.slice(0, maxChars);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}
