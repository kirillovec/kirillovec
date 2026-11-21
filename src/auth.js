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
    const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok.access_token } }).then((r) => r.json());
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
  if ((path === "/api/v1/auth/register" || path === "/api/v1/auth/login") && request.method === "POST") {
    if (!(await rateLimit(env, { subject: clientIp(request) }, path.endsWith("register") ? "register" : "login", path.endsWith("register") ? 8 : 20, 3600)))
      return response(request, env, { error: "RATE_LIMIT", message: "Слишком много попыток." }, 429);
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!validEmail(email) || password.length < 8 || password.length > 72)
      return response(request, env, { error: "INVALID_INPUT", message: "Нужны почта и пароль от 8 символов." }, 400);
    if (path.endsWith("register")) {
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (exists) return response(request, env, { error: "EMAIL_TAKEN", message: "Такая почта уже зарегистрирована." }, 409);
      const userId = id();
      const ph = await hashPassword(password);
      try { await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 0, ?)").bind(userId, email, ph, now()).run(); }
      catch { await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(userId, email, ph, now()).run(); }
      const cookie = await issueSession(env, userId);
      const mailed = await createVerifyToken(env, userId, email);
      return json({ user: publicUser({ id: userId, email, email_verified: 0, display_name: null }), message: mailed ? "Аккаунт создан. Проверь почту." : "Аккаунт создан." }, 201, { ...corsHeaders(request, env), "Set-Cookie": cookie });
    }
    let user;
    try { user = await env.DB.prepare("SELECT id, email, password_hash, email_verified, display_name FROM users WHERE email = ?").bind(email).first(); }
    catch { user = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind(email).first(); }
    if (!user || !(await verifyPassword(password, user.password_hash)))
      return response(request, env, { error: "INVALID_CREDENTIALS", message: "Неверный email или пароль." }, 401);
    const cookie = await issueSession(env, user.id);
    return json({ user: publicUser(user) }, 200, { ...corsHeaders(request, env), "Set-Cookie": cookie });
  }
  if (path === "/api/v1/auth/profile" && request.method === "POST") {
    const identity = await getIdentity(request, env);
    if (identity.guest) return response(request, env, { error: "AUTH_REQUIRED", message: "Сначала войди." }, 401);
    const body = await request.json().catch(() => ({}));
    const name = String(body.display_name || "").trim().slice(0, 40);
    try { await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name || null, identity.id).run(); }
    catch { return response(request, env, { error: "SCHEMA", message: "Нужна миграция 0004." }, 503); }
    const user = await env.DB.prepare("SELECT id, email, email_verified, display_name FROM users WHERE id = ?").bind(identity.id).first();
    return response(request, env, { user: publicUser(user) });
  }
  if (path === "/api/v1/auth/password" && request.method === "POST") {
    const identity = await getIdentity(request, env);
    if (identity.guest) return response(request, env, { error: "AUTH_REQUIRED", message: "Сначала войди." }, 401);
    const body = await request.json().catch(() => ({}));
    const password = String(body.password || "");
    if (password.length < 8) return response(request, env, { error: "INVALID_INPUT", message: "Пароль от 8 символов." }, 400);
    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(identity.id).first();
    if (!row || !(await verifyPassword(String(body.currentPassword || ""), row.password_hash)))
      return response(request, env, { error: "INVALID_LOGIN", message: "Текущий пароль неверный." }, 401);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), identity.id).run();
    return response(request, env, { ok: true });
  }
  if (path === "/api/v1/auth/forgot" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const generic = { ok: true, message: "Если почта есть — отправили ссылку (30 мин)." };
    if (!validEmail(email)) return response(request, env, { error: "INVALID_INPUT", message: "Укажи почту." }, 400);
    const user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
    if (!user) return response(request, env, generic);
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    try {
      await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();
      await env.DB.prepare("INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(), user.id, await sha256hex(token), new Date(Date.now() + 30 * 60 * 1000).toISOString(), now()).run();
      await sendMail(env, user.email, "Сброс пароля — kirillovec", "https://kirillovec.ru/account/?reset=" + encodeURIComponent(token));
    } catch (e) {
      return response(request, env, { error: e.message || "MAIL_FAILED", message: e.detail || "Письмо не отправлено." }, 503);
    }
    return response(request, env, generic);
  }
  if (path === "/api/v1/auth/reset" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || ""), password = String(body.password || "");
    if (token.length < 20 || password.length < 8) return response(request, env, { error: "INVALID_INPUT", message: "Нужны ссылка и пароль." }, 400);
    const row = await env.DB.prepare("SELECT id, user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?").bind(await sha256hex(token), now()).first();
    if (!row) return response(request, env, { error: "INVALID_TOKEN", message: "Ссылка недействительна." }, 400);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), row.user_id).run();
    await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.user_id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id).run();
    let user;
    try { user = await env.DB.prepare("SELECT id, email, email_verified, display_name FROM users WHERE id = ?").bind(row.user_id).first(); }
    catch { user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(row.user_id).first(); }
    const cookie = await issueSession(env, row.user_id);
    return json({ user: publicUser(user) }, 200, { ...corsHeaders(request, env), "Set-Cookie": cookie });
  }
  if (path === "/api/v1/auth/resend-verification" && request.method === "POST") {
    const identity = await getIdentity(request, env);
    if (identity.guest) return response(request, env, { error: "AUTH_REQUIRED", message: "Сначала войди." }, 401);
    if (identity.email_verified) return response(request, env, { ok: true, message: "Уже подтверждена." });
    const mailed = await createVerifyToken(env, identity.id, identity.email);
    if (!mailed) return response(request, env, { error: "MAIL_NOT_CONFIGURED", message: "Почта недоступна." }, 503);
    return response(request, env, { ok: true, message: "Письмо отправлено." });
  }
  if (path === "/api/v1/auth/verify" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "");
    if (token.length < 20) return response(request, env, { error: "INVALID_TOKEN", message: "Ссылка недействительна." }, 400);
    const row = await env.DB.prepare("SELECT id, user_id FROM email_verifications WHERE token_hash = ? AND expires_at > ?").bind(await sha256hex(token), now()).first();
    if (!row) return response(request, env, { error: "INVALID_TOKEN", message: "Ссылка недействительна." }, 400);
    try { await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id).run(); }
    catch { return response(request, env, { error: "SCHEMA", message: "Нужна миграция 0004." }, 503); }
    await env.DB.prepare("DELETE FROM email_verifications WHERE user_id = ?").bind(row.user_id).run();
    let user;
    try { user = await env.DB.prepare("SELECT id, email, email_verified, display_name FROM users WHERE id = ?").bind(row.user_id).first(); }
    catch { user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(row.user_id).first(); }
    return response(request, env, { user: publicUser(user) });
  }
  const oauthStart = path.match(/^\/api\/v1\/auth\/oauth\/(google|yandex|vk)\/start$/);
  if (oauthStart && request.method === "GET") {
    const provider = oauthStart[1];
    const redirect = new URL(request.url).searchParams.get("redirect") || "https://kirillovec.ru/studio/";
    const state = b64url(crypto.getRandomValues(new Uint8Array(16))) + "." + b64url(redirect);
    const cb = "https://api.kirillovec.ru/api/v1/auth/oauth/" + provider + "/callback";
    let authUrl;
    if (provider === "google") {
      const cid = secret(env, "GOOGLE_CLIENT_ID");
      if (!cid.present) return response(request, env, { error: "OAUTH_NOT_CONFIGURED", message: "GOOGLE_CLIENT_ID не задан." }, 503);
      authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encodeURIComponent(cid.reveal()) + "&redirect_uri=" + encodeURIComponent(cb) + "&response_type=code&scope=openid%20email%20profile&state=" + encodeURIComponent(state);
    } else if (provider === "yandex") {
      const cid = secret(env, "YANDEX_CLIENT_ID");
      if (!cid.present) return response(request, env, { error: "OAUTH_NOT_CONFIGURED", message: "YANDEX_CLIENT_ID не задан." }, 503);
      authUrl = "https://oauth.yandex.ru/authorize?response_type=code&client_id=" + encodeURIComponent(cid.reveal()) + "&redirect_uri=" + encodeURIComponent(cb) + "&state=" + encodeURIComponent(state);
    } else {
      const cid = secret(env, "VK_CLIENT_ID");
      if (!cid.present) return response(request, env, { error: "OAUTH_NOT_CONFIGURED", message: "VK_CLIENT_ID не задан." }, 503);
      authUrl = "https://oauth.vk.com/authorize?client_id=" + encodeURIComponent(cid.reveal()) + "&redirect_uri=" + encodeURIComponent(cb) + "&response_type=code&scope=email&state=" + encodeURIComponent(state) + "&v=5.199";
    }
    return Response.redirect(authUrl, 302);
  }
  const oauthCb = path.match(/^\/api\/v1\/auth\/oauth\/(google|yandex|vk)\/callback$/);
  if (oauthCb && request.method === "GET") {
    const provider = oauthCb[1];
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "";
    let redirectTo = "https://kirillovec.ru/studio/";
    try { const p = state.split("."); if (p[1]) redirectTo = atob(p[1].replace(/-/g, "+").replace(/_/g, "/")); } catch {}
    if (url.searchParams.get("error") || !code)
      return Response.redirect(redirectTo + (redirectTo.includes("?") ? "&" : "?") + "oauth_error=" + encodeURIComponent(url.searchParams.get("error") || "no_code"), 302);
    try {
      const profile = await exchangeOAuth(env, provider, code);
      if (!profile.email) throw new Error("no_email");
      let user = await env.DB.prepare("SELECT id, email, email_verified, display_name FROM users WHERE email = ?").bind(profile.email.toLowerCase()).first();
      if (!user) {
        const userId = id();
        const ph = await hashPassword(b64url(crypto.getRandomValues(new Uint8Array(24))));
        try {
          await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, display_name, oauth_provider, oauth_subject, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)").bind(userId, profile.email.toLowerCase(), ph, profile.name || null, provider, profile.sub || null, now()).run();
        } catch {
          await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(userId, profile.email.toLowerCase(), ph, now()).run();
        }
        user = { id: userId, email: profile.email.toLowerCase(), email_verified: 1, display_name: profile.name || null };
      } else {
        try { await env.DB.prepare("UPDATE users SET email_verified = 1, oauth_provider = ?, oauth_subject = ? WHERE id = ?").bind(provider, profile.sub || null, user.id).run(); } catch {}
      }
      const cookie = await issueSession(env, user.id);
      return new Response(null, { status: 302, headers: { Location: redirectTo, "Set-Cookie": cookie } });
    } catch (e) {
      return Response.redirect(redirectTo + (redirectTo.includes("?") ? "&" : "?") + "oauth_error=" + encodeURIComponent(e.message || "oauth_failed"), 302);
    }
  }
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
