const PROMPT_VERSION = "cricket_coach_v2";

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function envNum(name, defaultValue) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : defaultValue;
}

function pickAnalysis(results) {
  if (!results || typeof results !== "object") return {};
  return results.analysis && typeof results.analysis === "object" ? results.analysis : results;
}

function pickReplayShots(results) {
  if (!results || typeof results !== "object") return [];
  const replay = results.replay;
  return replay && Array.isArray(replay.shots) ? replay.shots : [];
}

function cleanString(x, maxLen = 260) {
  if (x == null) return "";
  const s = String(x).replace(/\s+/g, " ").trim();
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function toStringArray(v, maxItems = 6) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => cleanString(x)).filter(Boolean).slice(0, maxItems);
}

function summarizeForPrompt(results) {
  const analysis = pickAnalysis(results);
  const ss = analysis.session_summary || {};
  const av = analysis.session_averages || {};
  const tr = ss.trend || analysis.trend || {};
  const alerts = Array.isArray(analysis.coaching_alerts) ? analysis.coaching_alerts : [];
  const byShotType = ss.by_shot_type || analysis.by_shot_type || {};
  const shots = pickReplayShots(results);
  const confirmed = shots.filter((s) => Number(s.conf ?? s.confidence) >= 0.3);
  return {
    dominant_hand: analysis.session_handedness || "RHB",
    shots_confirmed: ss.shots_confirmed ?? analysis.shots_confirmed ?? confirmed.length,
    shots_total_detected: ss.shots_total_detected ?? analysis.shots_total ?? shots.length,
    avg_head: ss.avg_head_quality_score ?? av.head_quality_score ?? null,
    avg_stance: ss.avg_symmetry_score ?? av.symmetry_score ?? null,
    avg_footwork: ss.avg_footwork_score ?? av.footwork_score ?? null,
    avg_swing_intensity: ss.avg_swing_intensity ?? av.swing_intensity ?? null,
    avg_bat_speed_kmh: ss.avg_bat_speed_kmh ?? av.peak_swing_speed ?? null,
    avg_swing_path: ss.avg_swing_path_score ?? av.swing_path_score ?? null,
    avg_shot_vs_length: ss.avg_execution_score ?? av.execution_score ?? null,
    avg_shot_score: ss.avg_shot_score ?? null,
    trend: tr,
    by_shot_type: byShotType,
    coaching_alerts: alerts.slice(0, 8).map((a) => ({
      severity: a.severity,
      metric: a.metric,
      message: a.message,
      player_cue: a.player_cue || null,
      drill: a.drill || a.action || null,
    })),
  };
}

function buildPrompt(summary) {
  return `You are a cricket batting coach. Use only INPUT data.

Return STRICT JSON only with keys:
summary, strengths, improvements, shot_type_notes, metric_notes, recommended_drills.

Keep language simple and actionable. No markdown. No extra text.
Each bullet must be short. Avoid technical jargon.

INPUT:
${JSON.stringify(summary)}`;
}

function extractJsonObject(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch (_) {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(t.slice(s, e + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function normalizeInsightPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rawShotTypeNotes =
    raw.shot_type_notes && typeof raw.shot_type_notes === "object" && !Array.isArray(raw.shot_type_notes)
      ? raw.shot_type_notes
      : {};
  const metricNotesSrc =
    raw.metric_notes && typeof raw.metric_notes === "object" && !Array.isArray(raw.metric_notes)
      ? raw.metric_notes
      : {};
  const metricNotes = {};
  for (const key of ["head", "stance", "footwork", "swing_path", "shot_vs_length", "execution"]) {
    const v = cleanString(metricNotesSrc[key], 180);
    if (v) metricNotes[key] = v;
  }
  return {
    summary: cleanString(raw.summary, 420),
    strengths: toStringArray(raw.strengths, 6),
    improvements: toStringArray(raw.improvements, 6),
    shot_type_notes: rawShotTypeNotes,
    metric_notes: metricNotes,
    recommended_drills: toStringArray(raw.recommended_drills, 6),
  };
}

function normalizeShotTypeKey(k) {
  const s = String(k || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "cover") return "cover_drive";
  if (s === "straight") return "straight_drive";
  return s;
}

function shotPrettyLabel(shotKey) {
  const k = normalizeShotTypeKey(shotKey);
  const map = {
    cover_drive: "cover drive",
    straight_drive: "straight drive",
    pull: "pull shot",
    flick: "flick",
    sweep: "sweep",
  };
  return map[k] || String(k || "").replace(/_/g, " ").trim();
}

function shotAliases(shotKey) {
  const k = normalizeShotTypeKey(shotKey);
  const map = {
    cover_drive: ["cover", "cover drive"],
    straight_drive: ["straight", "straight drive"],
    pull: ["pull", "pull shot"],
    flick: ["flick"],
    sweep: ["sweep"],
  };
  return map[k] || [shotPrettyLabel(k)];
}

function textMentionsDifferentShot(text, targetShot) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  const shots = ["cover_drive", "straight_drive", "pull", "flick", "sweep"];
  const target = normalizeShotTypeKey(targetShot);
  for (const s of shots) {
    if (s === target) continue;
    const aliases = shotAliases(s);
    if (aliases.some((a) => t.includes(a))) return true;
  }
  return false;
}

function buildShotSpecificFallbackNote(shot, shotStats, out) {
  const label = shotPrettyLabel(shot);
  const avg = Number(shotStats?.avg_score);
  const count = Number(shotStats?.count);
  const avgText = Number.isFinite(avg) ? `${avg.toFixed(1)}/10` : "session trend";
  const countText = Number.isFinite(count) && count > 0 ? ` over ${count} ball${count === 1 ? "" : "s"}` : "";
  const sharedFocus = cleanString(
    out?.metric_notes?.shot_vs_length ||
      out?.metric_notes?.execution ||
      out?.metric_notes?.head ||
      "Keep head still, front foot down early, and bat through the line.",
    140
  );
  return {
    strength: cleanString(`${label} intent is repeatable (${avgText}${countText}).`, 120),
    focus: cleanString(`For ${label}, ${sharedFocus.charAt(0).toLowerCase()}${sharedFocus.slice(1)}`, 140),
  };
}

function ensureShotTypeCoverage(payload, summary) {
  const out = payload && typeof payload === "object" ? { ...payload } : {};
  const src = out.shot_type_notes && typeof out.shot_type_notes === "object" ? out.shot_type_notes : {};
  const shotStats = summary?.by_shot_type && typeof summary.by_shot_type === "object" ? summary.by_shot_type : {};
  const normalizedNotes = {};
  for (const [k, v] of Object.entries(src)) {
    const nk = normalizeShotTypeKey(k);
    if (!nk) continue;
    const rawStrength = cleanString(v?.strength, 120);
    const rawFocus = cleanString(v?.focus, 140);
    const fallback = buildShotSpecificFallbackNote(nk, shotStats[nk], out);
    const strength = !rawStrength || textMentionsDifferentShot(rawStrength, nk) ? fallback.strength : rawStrength;
    const focus = !rawFocus || textMentionsDifferentShot(rawFocus, nk) ? fallback.focus : rawFocus;
    normalizedNotes[nk] = { strength, focus };
  }
  const played = summary?.by_shot_type && typeof summary.by_shot_type === "object"
    ? Object.keys(summary.by_shot_type).map(normalizeShotTypeKey).filter(Boolean)
    : [];
  for (const shot of played) {
    const fallback = buildShotSpecificFallbackNote(shot, shotStats[shot], out);
    if (!normalizedNotes[shot]) {
      normalizedNotes[shot] = fallback;
    } else {
      if (!normalizedNotes[shot].strength || textMentionsDifferentShot(normalizedNotes[shot].strength, shot)) {
        normalizedNotes[shot].strength = fallback.strength;
      }
      if (!normalizedNotes[shot].focus || textMentionsDifferentShot(normalizedNotes[shot].focus, shot)) {
        normalizedNotes[shot].focus = fallback.focus;
      }
    }
  }
  out.shot_type_notes = normalizedNotes;
  return out;
}

function metricNoteFallback(metricKey, summary, alerts) {
  const key = String(metricKey || "").toLowerCase();
  const avgMap = {
    head: Number(summary?.avg_head),
    stance: Number(summary?.avg_stance),
    footwork: Number(summary?.avg_footwork),
    swing_path: Number(summary?.avg_swing_path),
    shot_vs_length: Number(summary?.avg_shot_vs_length),
  };
  const avg = avgMap[key];
  const alertCue = (alerts || [])
    .map((a) => ({ metric: String(a?.metric || "").toLowerCase(), cue: cleanString(a?.player_cue || a?.message, 140) }))
    .find((a) => a.metric.includes(key) || (key === "shot_vs_length" && a.metric.includes("execution")));
  if (alertCue?.cue) return alertCue.cue;
  if (key === "head") return Number.isFinite(avg) && avg >= 70 ? "Head stays mostly stable at contact." : "Keep head still and eyes level through contact.";
  if (key === "stance") return Number.isFinite(avg) && avg >= 65 ? "Stance shape is mostly balanced." : "Level shoulders and keep weight even at setup.";
  if (key === "footwork") return Number.isFinite(avg) && avg >= 70 ? "Front-foot movement supports timing." : "Get front foot down early and to the line of the ball.";
  if (key === "swing_path") return Number.isFinite(avg) && avg >= 70 ? "Swing arc is mostly clean through impact." : "Keep a smoother swing arc and complete the follow-through.";
  if (key === "shot_vs_length") return Number.isFinite(avg) && avg >= 70 ? "Shot choices mostly match ball length." : "Match your shot earlier to the ball length.";
  return "Keep setup stable and play through the line.";
}

function ensureCoreCoverage(payload, summary) {
  const out = payload && typeof payload === "object" ? { ...payload } : {};
  const alerts = Array.isArray(summary?.coaching_alerts) ? summary.coaching_alerts : [];

  const strengths = Array.isArray(out.strengths) ? out.strengths.filter(Boolean) : [];
  if (!strengths.length) {
    if (Number.isFinite(Number(summary?.avg_footwork)) && Number(summary.avg_footwork) >= 70) strengths.push("Footwork supports timing and balance.");
    if (Number.isFinite(Number(summary?.avg_head)) && Number(summary.avg_head) >= 70) strengths.push("Head stays stable through most deliveries.");
    if (Number.isFinite(Number(summary?.avg_stance)) && Number(summary.avg_stance) >= 65) strengths.push("Stance setup is mostly balanced.");
  }
  if (!strengths.length) strengths.push("You have a usable base; keep building repeatable movement.");
  out.strengths = strengths.slice(0, 4);

  const improvements = Array.isArray(out.improvements) ? out.improvements.filter(Boolean) : [];
  if (!improvements.length) {
    improvements.push(
      ...(alerts
        .map((a) => cleanString(a?.player_cue || a?.message, 140))
        .filter(Boolean)
        .slice(0, 3))
    );
  }
  if (!improvements.length) improvements.push("Focus on head stillness and early front-foot plant.");
  out.improvements = improvements.slice(0, 4);

  const metricNotes = out.metric_notes && typeof out.metric_notes === "object" ? { ...out.metric_notes } : {};
  for (const key of ["head", "stance", "footwork", "swing_path", "shot_vs_length"]) {
    const v = cleanString(metricNotes[key], 180);
    metricNotes[key] = v || metricNoteFallback(key, summary, alerts);
  }
  out.metric_notes = metricNotes;

  const drills = Array.isArray(out.recommended_drills) ? out.recommended_drills.filter(Boolean) : [];
  if (!drills.length) {
    drills.push(
      ...(alerts
        .map((a) => cleanString(a?.drill, 120))
        .filter(Boolean)
        .slice(0, 4))
    );
  }
  if (!drills.length) drills.push("20 balls: keep head still and play straight through the line.");
  out.recommended_drills = drills.slice(0, 5);

  if (!cleanString(out.summary, 420)) {
    out.summary = "Session shows useful intent; focus on head stability, stance balance, and shot selection by length.";
  }
  return out;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const timeoutMs = Math.max(envNum("LLM_TIMEOUT_MS", 12000), 30000);
  const maxOutputTokens = envNum("LLM_MAX_OUTPUT_TOKENS", 600);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    return { text, model };
  } finally {
    clearTimeout(to);
  }
}

async function callDgx(prompt) {
  const apiKey = process.env.DGX_API_KEY || "";
  const endpoint =
    process.env.DGX_LLM_URL || "https://ai-services.mietjmu.in/gateway/llm/chat";
  const model = process.env.DGX_LLM_MODEL || process.env.GEMINI_MODEL || "qwen3:latest";
  if (!apiKey) throw new Error("DGX_API_KEY missing");
  const timeoutMs = Math.max(envNum("LLM_TIMEOUT_MS", 60000), 60000);
  const maxOutputTokens = envNum("LLM_MAX_OUTPUT_TOKENS", 420);
  async function requestOnce(reqTimeoutMs, includeJsonResponseFormat) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), reqTimeoutMs);
    try {
      const body = {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        max_tokens: maxOutputTokens,
      };
      if (includeJsonResponseFormat) {
        body.response_format = { type: "json_object" };
      }
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`DGX HTTP ${resp.status}: ${cleanString(detail, 140)}`);
      }
      const json = await resp.json();
      const text =
        json?.choices?.[0]?.message?.content ||
        json?.message?.content ||
        json?.response ||
        json?.data?.response ||
        json?.data?.text ||
        "";
      return { text, model };
    } finally {
      clearTimeout(to);
    }
  }
  try {
    return await requestOnce(timeoutMs, true);
  } catch (err) {
    const isAbort =
      err?.name === "AbortError" ||
      String(err?.message || "").toLowerCase().includes("aborted");
    if (!isAbort) throw err;
    // Retry once with a wider timeout and relaxed response format.
    const retryTimeoutMs = Math.max(timeoutMs + 30000, Math.round(timeoutMs * 1.5));
    return requestOnce(retryTimeoutMs, false);
  }
}

function buildFallbackInsights(results, reason = "llm_unavailable") {
  const analysis = pickAnalysis(results);
  const summary = summarizeForPrompt(results);
  const alerts = Array.isArray(analysis.coaching_alerts) ? analysis.coaching_alerts : [];
  const strengths = [];
  if (summary.avg_head != null && Number(summary.avg_head) >= 70) strengths.push("Head stays stable through most deliveries.");
  if (summary.avg_footwork != null && Number(summary.avg_footwork) >= 70) strengths.push("Footwork supports timing and balance at contact.");
  if (summary.avg_stance != null && Number(summary.avg_stance) >= 65) strengths.push("Stance setup is generally balanced.");
  if (!strengths.length) strengths.push("No standout strength yet — keep building repeatable setup and contact.");
  const improvements = alerts
    .slice(0, 3)
    .map((a) => cleanString(a.player_cue || a.message))
    .filter(Boolean);
  if (!improvements.length) improvements.push("Keep recording more sessions to surface clearer coaching priorities.");
  return {
    provider: "fallback_rules",
    model: "rule_based",
    generated_at: new Date().toISOString(),
    version: PROMPT_VERSION,
    fallback_used: true,
    error: reason,
    summary: "LLM insight unavailable right now; showing cues from rule-based coaching alerts.",
    strengths,
    improvements,
    shot_type_notes: {},
    metric_notes: {},
  };
}

async function generateLlmInsights(results) {
  if (!envBool("LLM_INSIGHTS_ENABLED", false)) return buildFallbackInsights(results, "llm_disabled");
  const provider = String(process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();
  const summary = summarizeForPrompt(results);
  const prompt = buildPrompt(summary);
  let out;
  let usedProvider = provider;
  if (provider === "gemini") {
    out = await callGemini(prompt);
  } else if (provider === "dgx") {
    out = await callDgx(prompt);
  } else if (provider === "auto") {
    if (process.env.DGX_API_KEY) {
      out = await callDgx(prompt);
      usedProvider = "dgx";
    } else {
      out = await callGemini(prompt);
      usedProvider = "gemini";
    }
  } else {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }
  const parsed = extractJsonObject(out.text);
  const norm = normalizeInsightPayload(parsed);
  if (!norm) throw new Error("Invalid JSON from LLM");
  const withCoreCoverage = ensureCoreCoverage(norm, summary);
  const withShotCoverage = ensureShotTypeCoverage(withCoreCoverage, summary);
  return {
    provider: usedProvider,
    model: out.model,
    generated_at: new Date().toISOString(),
    version: PROMPT_VERSION,
    fallback_used: false,
    error: null,
    ...withShotCoverage,
  };
}

module.exports = {
  generateLlmInsights,
  buildFallbackInsights,
};

