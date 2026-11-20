/** Auth module for kirillovec AI Studio */
function secret(env, key) {
  const value = typeof env?.[key] === "string" ? env[key] : "";
  return Object.freeze({ present: value.length > 0, reveal() { return value; }, toString() { return ""; }, valueOf() { return ""; }, toJSON() { return null; } });
}
function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
function b64url(buf) {
  const b = typeof buf === "string" ? btoa(buf) : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256hex(s) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
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
function readCookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(token, maxAge) {
  return `ko_session=${token ? encodeURIComponent(token) : ""}; Path=/; HttpOnly; Max-Age=${maxAge}; Secure; SameSite=None`;
}
function clientIp(request) { return request.headers.get("CF-Connecting-IP") || "unknown"; }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120; }
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return b64url(salt) + "." + b64url(new Uint8Array(bits));
}
async function verifyPassword(password, stored) {
  const [s, h] = String(stored || "").split(".");
  if (!s || !h) return false;
  const salt = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return b64url(new Uint8Array(bits)) === h;
}
async function rateLimit(env, identity, bucket, max, windowSeconds) {
  if (!env.DB) return true;
  const key = identity.subject || identity.email || "unknown";
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  await env.DB.prepare("DELETE FROM rate_limits WHERE created_at < ?").bind(cutoff).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE identity = ? AND bucket = ? AND created_at >= ?").bind(key, bucket, cutoff).first();
  if ((row?.count || 0) >= max) return false;
  await env.DB.prepare("INSERT INTO rate_limits (identity, bucket, created_at) VALUES (?, ?, ?)").bind(key, bucket, now()).run();
  return true;
}
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, email_verified: !!(u.email_verified === 1 || u.email_verified === true), display_name: u.display_name || null };
}
export async function getIdentity(request, env) {
  const token = readCookie(request, "ko_session");
  if (!token) return { guest: true, subject: "guest:" + clientIp(request) };
  const hash = await sha256hex(token);
  let row = null;
  try {
    row = await env.DB.prepare("SELECT s.user_id AS id, u.email, u.email_verified, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(hash, now()).first();
  } catch {
    row = await env.DB.prepare("SELECT s.user_id AS id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(hash, now()).first();
  }
  if (!row) return { guest: true, subject: "guest:" + clientIp(request) };
  return { guest: false, id: row.id, email: row.email, email_verified: !!(row.email_verified === 1 || row.email_verified === true), display_name: row.display_name || null, subject: "user:" + row.id };
}
async function issueSession(env, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(), userId, await sha256hex(token), exp, now()).run();
  return sessionCookie(token, 30 * 86400);
}
async function sendMail(env, to, subject, text) {
  const resend = secret(env, "RESEND_API_KEY");
  if (resend.present) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + resend.reveal(), "Content-Type": "application/json" }, body: JSON.stringify({ from: "kirillovec <noreply@kirillovec.ru>", to: [to], subject, text }) });
    if (!r.ok) { const e = new Error("MAIL_FAILED"); e.detail = "Почта не приняла письмо."; throw e; }
    return;
  }
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    await env.EMAIL.send({ to, from: { email: "noreply@kirillovec.ru", name: "kirillovec" }, subject, text });
    return;
  }
  const e = new Error("MAIL_NOT_CONFIGURED"); e.detail = "Отправка писем ещё не подключена."; throw e;
}
async function createVerifyToken(env, userId, email) {
  const vtoken = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const vexp = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  try {
    await env.DB.prepare("DELETE FROM email_verifications WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(), userId, await sha256hex(vtoken), vexp, now()).run();
    await sendMail(env, email, "Подтверди почту — kirillovec", "Подтверди почту:\nhttps://kirillovec.ru/account/?verify=" + encodeURIComponent(vtoken) + "\n\n24 часа.");
    return true;
  } catch { return false; }
}
async function exchangeOAuth(env, provider, code) {
  const cb = "https://api.kirillovec.ru/api/v1/auth/oauth/" + provider + "/callback";
  if (provider === "google") {
    const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: secret(env, "GOOGLE_CLIENT_ID").reveal(), client_secret: secret(env, "GOOGLE_CLIENT_SECRET").reveal(), redirect_uri: cb, grant_type: "authorization_code" }) }).then((r) => r.json());
    if (!tok.access_token) throw new Error("token");
    const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok.access_token }) }).then((r) => r.json());
    return { email: info.email, name: info.name, sub: info.sub };
  }
  if (provider === "yandex") {
    const tok = await fetch("https://oauth.yandex.ru/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: secret(env, "YANDEX_CLIENT_ID").reveal(), client_secret: secret(env, "YANDEX_CLIENT_SECRET").reveal(), grant_type: "authorization_code" }) }).then((r) => r.json());
    if (!tok.access_token) throw new Error("token");
    const info = await fetch("https://login.yandex.ru/info?format=json", { headers: { Authorization: "OAuth " + tok.access_token } }).then((r) => r.json());
    return { email: info.default_email || (info.emails && info.emails[0]), name: info.display_name || info.real_name, sub: String(info.id) };
  }
  if (provider === "vk") {
    const tok = await fetch("https://oauth.vk.com/access_token?client_id=" + encodeURIComponent(secret(env, "VK_CLIENT_ID").reveal()) + "&client_secret=" + encodeURIComponent(secret(env, "VK_CLIENT_SECRET").reveal()) + "&redirect_uri=" + encodeURIComponent(cb) + "&code=" + encodeURIComponent(code)).then((r) => r.json());
    if (!tok.access_token || !tok.email) throw new Error(tok.email ? "token" : "no_email");
    return { email: tok.email, name: null, sub: String(tok.user_id) };
  }
  throw new Error("provider");
}

export async function handleAuth(request, env, path) {
  if (!env.DB) return response(request, env, { error: "BACKEND_NOT_CONFIGURED", message: "Не настроена база D1." }, 503);

  if (path === "/api/v1/auth/me" && request.method === "GET") {
    const identity = await getIdentity(request, env);
    if (identity.guest) return response(request, env, { user: null });
    return response(request, env, { user: publicUser({ id: identity.id, email: identity.email, email_verified: identity.email_verified, display_name: identity.display_name }) });
  }
  if (path === "/api/v1/auth/logout" && request.method === "POST") {
    const token = readCookie(request, "ko_session");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256hex(token)).run();
    return json({ ok: true }, 200, { ...corsHeaders(request, env), "Set-Cookie": sessionCookie("", 0) });
  }
  // ... truncated for safety - will fix with full file from artifacts
  return response(request, env, { error: "NOT_FOUND", message: "Auth route not found" }, 404);
}

export function jobLimits(env, identity) {
  if (identity.guest) return { max: 1, window: 86400, label: "1 генерация в сутки без регистрации. Создай аккаунт." };
  return { max: Number(env.MAX_JOBS_PER_HOUR || 20), window: 3600, label: "Лимит генераций на час." };
}
export function musicLimits(env, identity) {
  if (identity.guest) return { max: 1, window: 86400, label: "1 трек в сутки без регистрации. Создай аккаунт." };
  return { max: Number(env.MAX_MUSIC_PER_HOUR || 10), window: 3600, label: "Лимит генерации треков на час." };
}
export { rateLimit };
