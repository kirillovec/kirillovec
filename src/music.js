/**
 * Suno music generation via sunoapi.org proxy
 * Docs: https://docs.sunoapi.org
 */

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "https://kirillovec.ru").split(",").map((s) => s.trim());
  const ok = allowed.includes(origin) || allowed.includes("*");
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin"
  };
}

function respond(request, env, body, status = 200) {
  return json(body, status, cors(request, env));
}

function now() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

function sunoKey(env) {
  const k = typeof env?.SUNO_API_KEY === "string" ? env.SUNO_API_KEY.trim() : "";
  return k;
}

function sunoBase(env) {
  return String(env.SUNO_API_BASE || "https://api.sunoapi.org").replace(/\/$/, "");
}

async function sunoFetch(env, path, init = {}) {
  const key = sunoKey(env);
  if (!key) {
    const e = new Error("SUNO_API_KEY_NOT_SET");
    e.status = 503;
    throw e;
  }
  const url = sunoBase(env) + path;
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || (body.code && body.code !== 200)) {
    const e = new Error(body.msg || body.message || body.error || "SUNO_PROVIDER_ERROR");
    e.status = r.status >= 400 && r.status < 600 ? r.status : 502;
    e.detail = body;
    throw e;
  }
  return body;
}

/**
 * POST /api/v1/music/generate
 * body: { style, title?, prompt?, lyrics?, instrumental? }
 */
export async function musicGenerate(request, env, identity) {
  const body = await request.json().catch(() => ({}));
  const style = String(body.style || body.prompt || "").trim().slice(0, 1000);
  const title = String(body.title || "kirillovec track").trim().slice(0, 80);
  const lyrics = String(body.lyrics || "").trim().slice(0, 5000);
  const prompt = String(body.prompt || style).trim().slice(0, 3000);
  const instrumental = Boolean(body.instrumental);

  if (!style && !prompt && !lyrics) {
    return respond(request, env, { error: "INVALID_INPUT", message: "Нужен style или prompt." }, 400);
  }

  const customMode = true;
  const payload = {
    customMode,
    instrumental,
    model: body.model || "V6",
    style: style || "southern hip hop, dark, atmospheric",
    title,
    callBackUrl: "https://api.kirillovec.ru/api/v1/music/callback"
  };
  if (!instrumental) {
    if (lyrics) payload.lyrics = lyrics;
    else if (prompt) payload.prompt = prompt;
    else payload.prompt = style;
  } else {
    payload.prompt = prompt || style;
  }

  let suno;
  try {
    suno = await sunoFetch(env, "/api/v1/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (e) {
    if (e.message === "SUNO_API_KEY_NOT_SET") {
      return respond(
        request,
        env,
        { error: "SUNO_API_KEY_NOT_SET", message: "Добавь секрет: wrangler secret put SUNO_API_KEY" },
        503
      );
    }
    return respond(request, env, { error: "SUNO_ERROR", message: e.message }, e.status || 502);
  }

  const taskId = suno?.data?.taskId || suno?.data?.task_id || suno?.taskId;
  if (!taskId) {
    return respond(request, env, { error: "SUNO_NO_TASK", message: "Провайдер не вернул taskId", detail: suno }, 502);
  }

  const jobId = uuid();
  try {
    await env.DB.prepare(
      `INSERT INTO music_jobs (id, task_id, user_id, status, style, title, prompt, lyrics, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
    )
      .bind(jobId, taskId, identity?.id || null, style, title, prompt, lyrics || null, now(), now())
      .run();
  } catch (e) {
    // table may not exist yet — still return task
    console.error("music_jobs insert", e.message);
  }

  return respond(
    request,
    env,
    {
      id: jobId,
      taskId,
      status: "pending",
      message: "Генерация запущена. Опрашивай /api/v1/music/status/:taskId"
    },
    201
  );
}

/**
 * GET /api/v1/music/status/:taskId
 */
export async function musicStatus(request, env, taskId) {
  if (!taskId) {
    return respond(request, env, { error: "INVALID_INPUT", message: "taskId обязателен" }, 400);
  }

  let suno;
  try {
    suno = await sunoFetch(env, "/api/v1/generate/record-info?taskId=" + encodeURIComponent(taskId), {
      method: "GET"
    });
  } catch (e) {
    if (e.message === "SUNO_API_KEY_NOT_SET") {
      return respond(request, env, { error: "SUNO_API_KEY_NOT_SET", message: "Секрет SUNO_API_KEY не задан" }, 503);
    }
    return respond(request, env, { error: "SUNO_ERROR", message: e.message }, e.status || 502);
  }

  const data = suno.data || {};
  const status = String(data.status || "PENDING").toUpperCase();
  const tracks = data.response?.sunoData || data.response?.data || [];
  const mapped = (Array.isArray(tracks) ? tracks : []).map((t) => ({
    id: t.id,
    title: t.title,
    audioUrl: t.audio_url || t.audioUrl || null,
    streamUrl: t.stream_audio_url || t.streamAudioUrl || null,
    imageUrl: t.image_url || t.imageUrl || null,
    duration: t.duration || null,
    tags: t.tags || null,
    prompt: t.prompt || null
  }));

  const done = status === "SUCCESS" || status === "FIRST_SUCCESS";
  const failed = ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"].includes(
    status
  );

  if (done && mapped[0]?.audioUrl) {
    try {
      await env.DB.prepare(
        `UPDATE music_jobs SET status = ?, audio_url = ?, stream_url = ?, image_url = ?, duration = ?, updated_at = ? WHERE task_id = ?`
      )
        .bind(
          "succeeded",
          mapped[0].audioUrl,
          mapped[0].streamUrl,
          mapped[0].imageUrl,
          mapped[0].duration,
          now(),
          taskId
        )
        .run();
    } catch (_) {}
  } else if (failed) {
    try {
      await env.DB.prepare(`UPDATE music_jobs SET status = ?, updated_at = ? WHERE task_id = ?`)
        .bind("failed", now(), taskId)
        .run();
    } catch (_) {}
  }

  return respond(request, env, {
    taskId,
    status: failed ? "failed" : done ? "succeeded" : "pending",
    providerStatus: status,
    tracks: mapped,
    errorMessage: data.errorMessage || null
  });
}

/**
 * GET /api/v1/music/file/:taskId — redirect to first audio URL
 */
export async function musicFile(request, env, taskId) {
  const statusRes = await musicStatus(request, env, taskId);
  const body = await statusRes.json();
  const url = body.tracks?.[0]?.audioUrl || body.tracks?.[0]?.streamUrl;
  if (!url) {
    return respond(request, env, { error: "NOT_READY", message: "Аудио ещё не готово", status: body.status }, 404);
  }
  return Response.redirect(url, 302);
}
