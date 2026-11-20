/**
 * kirillovec AI Studio API — Cloudflare Workers
 * Image: FLUX.1 Schnell · Music: Suno · Auth module
 */
import { musicGenerate, musicStatus, musicFile } from "./music.js";
import { handleAuth, getIdentity, jobLimits, musicLimits, rateLimit } from "./auth.js";

function secret(env, key) {
  const value = typeof env?.[key] === "string" ? env[key] : "";
  return Object.freeze({ present: value.length > 0, reveal() { return value; }, toString() { return ""; }, valueOf() { return ""; }, toJSON() { return null; } });
}
function redactSecrets(env, text) {
  let out = String(text);
  for (const key of ["REPLICATE_API_TOKEN", "RESEND_API_KEY", "SUNO_API_KEY", "GOOGLE_CLIENT_SECRET", "YANDEX_CLIENT_SECRET", "VK_CLIENT_SECRET"]) {
    const value = secret(env, key).reveal();
    if (value) out = out.split(value).join(`[${key}]`);
  }
  return out;
}
function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
function corsHeaders(request, env) {
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
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
function response(request, env, body, status = 200, extra = {}) {
  return json(body, status, { ...corsHeaders(request, env), ...extra });
}
function resultToDataUrl(result) {
  if (!result) throw new Error("EMPTY_RESULT");
  if (typeof result.image === "string" && result.image.length > 100) return "data:image/jpeg;base64," + result.image;
  if (typeof result === "string" && result.startsWith("data:")) return result;
  if (typeof result === "string" && result.length > 100) return "data:image/jpeg;base64," + result;
  throw new Error("UNSUPPORTED_RESULT");
}
async function generateTextToImage(env, prompt) {
  if (!env.AI) throw new Error("WORKERS_AI_NOT_CONFIGURED");
  const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: String(prompt).slice(0, 2048), steps: 4 });
  return resultToDataUrl(result);
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/health" || path === "/api/v1/health") {
        return response(request, env, { ok: true, service: "kirillovec-ai-studio", time: now() });
      }
      if (path.startsWith("/api/v1/auth/")) return handleAuth(request, env, path);

      if (path === "/api/v1/music/generate" && request.method === "POST") {
        const identity = await getIdentity(request, env);
        const lim = musicLimits(env, identity);
        if (!(await rateLimit(env, identity, "music", lim.max, lim.window))) {
          return response(request, env, { error: "RATE_LIMIT", message: lim.label }, 429);
        }
        return musicGenerate(request, env, identity);
      }
      if (path.startsWith("/api/v1/music/status/") && request.method === "GET") {
        return musicStatus(request, env, path.slice("/api/v1/music/status/".length));
      }
      if (path.startsWith("/api/v1/music/file/") && request.method === "GET") {
        return musicFile(request, env, path.slice("/api/v1/music/file/".length));
      }
      if (path === "/api/v1/music/callback" && request.method === "POST") {
        return response(request, env, { ok: true });
      }

      if (path === "/api/v1/capabilities" && request.method === "GET") {
        const workersAI = Boolean(env.AI);
        const suno = Boolean(secret(env, "SUNO_API_KEY").present);
        const identity = await getIdentity(request, env);
        const jLim = jobLimits(env, identity);
        const mLim = musicLimits(env, identity);
        return response(request, env, {
          image: { enabled: workersAI, model: workersAI ? "@cf/black-forest-labs/flux-1-schnell" : null, provider: workersAI ? "workers-ai" : null, imageToImage: false },
          music: { enabled: suno, provider: suno ? "sunoapi.org" : null, model: "V6" },
          video: { enabled: false },
          upload: { enabled: true, maxBytes: 4 * 1024 * 1024 },
          limits: { guest: identity.guest, image: { max: jLim.max, windowSeconds: jLim.window }, music: { max: mLim.max, windowSeconds: mLim.window } }
        });
      }

      if (path === "/api/v1/jobs" && request.method === "GET") {
        const identity = await getIdentity(request, env);
        if (identity.guest) return response(request, env, { jobs: [], music: [], message: "Войди для серверной истории." });
        let jobs = [];
        try {
          const r = await env.DB.prepare("SELECT id, mode, status, prompt, result_url, created_at FROM jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 50").bind(identity.subject).all();
          jobs = r.results || [];
        } catch {
          try {
            const r = await env.DB.prepare("SELECT id, mode, status, prompt, result_url, created_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(identity.id).all();
            jobs = r.results || [];
          } catch {}
        }
        let music = [];
        try {
          const r = await env.DB.prepare("SELECT id, task_id, status, style, title, audio_url, stream_url, image_url, duration, created_at FROM music_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(identity.id).all();
          music = r.results || [];
        } catch {}
        return response(request, env, { jobs, music });
      }

      if (path === "/api/v1/jobs" && request.method === "POST") {
        const identity = await getIdentity(request, env);
        const lim = jobLimits(env, identity);
        if (!(await rateLimit(env, identity, "jobs", lim.max, lim.window))) {
          return response(request, env, { error: "RATE_LIMIT", message: lim.label }, 429);
        }
        const body = await request.json().catch(() => ({}));
        const prompt = String(body.prompt || "").trim().slice(0, 2000);
        if (!prompt) return response(request, env, { error: "INVALID_INPUT", message: "Промпт обязателен." }, 400);
        if ((body.mode || "image") !== "image") return response(request, env, { error: "UNSUPPORTED_MODE", message: "Только image." }, 400);

        let dataUrl;
        try { dataUrl = await generateTextToImage(env, prompt); }
        catch (e) {
          if (e.message === "WORKERS_AI_NOT_CONFIGURED") return response(request, env, { error: "PROVIDER_NOT_CONFIGURED", message: "Workers AI не подключён." }, 503);
          return response(request, env, { error: "GENERATION_FAILED", message: redactSecrets(env, e.message || String(e)) }, 502);
        }

        const jobId = id();
        let resultUrl = null;
        if (env.R2 && dataUrl.startsWith("data:")) {
          try {
            const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
            const key = "jobs/" + (identity.id || "guest") + "/" + jobId + ".jpg";
            await env.R2.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
            resultUrl = "r2://" + key;
          } catch {}
        }
        try {
          await env.DB.prepare("INSERT INTO jobs (id, owner, mode, provider, provider_job_id, status, prompt, result_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(jobId, identity.subject, "image", "workers-ai", jobId, "succeeded", prompt.slice(0, 500), resultUrl, now(), now()).run();
        } catch {
          try {
            await env.DB.prepare("INSERT INTO jobs (id, user_id, mode, prompt, status, result_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(jobId, identity.id || null, "image", prompt.slice(0, 500), "succeeded", resultUrl, now()).run();
          } catch {}
        }
        return response(request, env, { id: jobId, status: "succeeded", mode: "image", result: { type: "image", dataUrl }, resultUrl }, 201);
      }

      return response(request, env, { error: "NOT_FOUND", message: "Not found" }, 404);
    } catch (error) {
      console.error(redactSecrets(env, error.stack || error.message));
      return response(request, env, { error: "INTERNAL_ERROR", message: "Внутренняя ошибка." }, 500);
    }
  }
};
