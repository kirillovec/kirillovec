/**
 * kirillovec AI Studio API — Cloudflare Workers
 * Text→image: FLUX.1 Schnell. Image editing: FLUX.2 Klein 4B.
 * Input images for img2img must be smaller than 512x512 (Workers AI docs).
 */
function secret(env,key){const value=typeof env?.[key]==="string"?env[key]:"";return Object.freeze({present:value.length>0,reveal(){return value},toString(){return ""},valueOf(){return ""},toJSON(){return null}})}
function redactSecrets(env,text){let out=String(text);for(const key of ["REPLICATE_API_TOKEN","RESEND_API_KEY","SELF_HOSTED_API_TOKEN","ACCESS_AUD"]){const value=secret(env,key).reveal();if(value)out=out.split(value).join(`[${key}]`)}return out}
function now(){return new Date().toISOString()}
function id(){return crypto.randomUUID()}
function b64url(buf){const b=typeof buf==="string"?btoa(buf):btoa(String.fromCharCode(...new Uint8Array(buf)));return b.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function sha256hex(s){const data=new TextEncoder().encode(s);const hash=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function corsHeaders(request,env){const origin=request.headers.get("Origin")||"";const allowed=(env.ALLOWED_ORIGINS||"https://kirillovec.ru").split(",").map(s=>s.trim());const ok=allowed.includes(origin)||allowed.includes("*");return{"Access-Control-Allow-Origin":ok?origin:(allowed[0]||"*"),"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"}}
function json(body,status=200,headers={},env){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json",...headers}})}
function response(request,env,body,status=200,extra={}){return json(body,status,{...corsHeaders(request,env),...extra},env)}
function readCookie(request,name){const c=request.headers.get("Cookie")||"";const m=c.match(new RegExp("(?:^|; )"+name+"=([^;]*)"));return m?decodeURIComponent(m[1]):null}
function sessionCookie(token,maxAge){const secure="; Secure; SameSite=None";return `ko_session=${token?encodeURIComponent(token):""}; Path=/; HttpOnly; Max-Age=${maxAge}${secure}`}
async function hashPassword(password){const salt=crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256);return b64url(salt)+"."+b64url(new Uint8Array(bits))}
async function verifyPassword(password,stored){const [s,h]=String(stored).split(".");if(!s||!h)return false;const salt=Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256);return b64url(new Uint8Array(bits))===h}
async function rateLimit(env,identity,bucket,max,windowSeconds){const key=identity.subject||identity.email||"unknown";const cutoff=new Date(Date.now()-windowSeconds*1000).toISOString();await env.DB.prepare("DELETE FROM rate_limits WHERE created_at < ?").bind(cutoff).run();const row=await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE identity = ? AND bucket = ? AND created_at >= ?").bind(key,bucket,cutoff).first();if((row?.count||0)>=max)return false;await env.DB.prepare("INSERT INTO rate_limits (identity, bucket, created_at) VALUES (?, ?, ?)").bind(key,bucket,now()).run();return true}
async function replicate(env,path,init={}){const token=secret(env,"REPLICATE_API_TOKEN");if(!token.present)throw new Error("PROVIDER_NOT_CONFIGURED");const r=await fetch("https://api.replicate.com/v1"+path,{...init,headers:{"Authorization":"Bearer "+token.reveal(),"Content-Type":"application/json",...(init.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok){const e=new Error("PROVIDER_ERROR");e.status=r.status===429?429:502;throw e}return body}
function resultToDataUrl(result){if(!result)throw new Error("EMPTY_RESULT");if(typeof result==="string"&&result.startsWith("data:"))return result;if(result instanceof ArrayBuffer||ArrayBuffer.isView(result)){const bytes=result instanceof ArrayBuffer?new Uint8Array(result):new Uint8Array(result.buffer);let bin="";for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return "data:image/png;base64,"+btoa(bin)}if(result.image)return resultToDataUrl(result.image);throw new Error("UNSUPPORTED_RESULT")}
async function generateTextToImage(env,prompt){if(!env.AI)throw new Error("WORKERS_AI_NOT_CONFIGURED");const result=await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{prompt});return resultToDataUrl(result)}
async function generateImageToImage(env,prompt,imageDataUrl){
  if(!env.AI)throw new Error("WORKERS_AI_NOT_CONFIGURED");
  const m=String(imageDataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if(!m)throw new Error("BAD_IMAGE");
  const binary=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));
  const boundary="----formdata"+Math.random().toString(16).slice(2);
  const parts=[];
  const push=(name,value,filename,type)=>{
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name=\"${name}\"${filename?`; filename=\"${filename}\"`:""}${type?`\r\nContent-Type: ${type}`:""}\r\n\r\n`);
    parts.push(value);parts.push("\r\n");
  };
  push("prompt",prompt);
  push("input_image",binary,"input.png",m[1]||"image/png");
  parts.push(`--${boundary}--\r\n`);
  const encoder=new TextEncoder();
  const blobs=parts.map(p=>typeof p==="string"?encoder.encode(p):p);
  const total=blobs.reduce((n,b)=>n+b.length,0);
  const body=new Uint8Array(total);let o=0;for(const b of blobs){body.set(b,o);o+=b.length}
  const multipart={body,contentType:`multipart/form-data; boundary=${boundary}`};
  try{
    const result=await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b",{multipart:{body:multipart.body,contentType}});
    return resultToDataUrl(result);
  }catch(e){
    // fallback: text-only if edit model fails
    return generateTextToImage(env,prompt);
  }
}
async function getIdentity(request,env){const token=readCookie(request,"ko_session");if(!token)return {guest:true,subject:"guest:"+(request.headers.get("CF-Connecting-IP")||"anon")};const hash=await sha256hex(token);const row=await env.DB.prepare("SELECT s.user_id AS id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(hash,now()).first();if(!row)return {guest:true,subject:"guest:"+(request.headers.get("CF-Connecting-IP")||"anon")};return {guest:false,id:row.id,email:row.email,subject:row.id}}
async function issueSession(env,userId){const token=b64url(crypto.getRandomValues(new Uint8Array(32)));const exp=new Date(Date.now()+30*864e5).toISOString();await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(),userId,await sha256hex(token),exp,now()).run();return sessionCookie(token,30*86400)}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/,"") || "/";

      if (path === "/health" || path === "/api/v1/health") {
        return response(request, env, { ok: true, service: "kirillovec-ai-studio", time: now() });
      }

      // Auth routes
      if (path === "/api/v1/auth/logout" && request.method === "POST") {
        const token = readCookie(request, "ko_session");
        if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256hex(token)).run();
        return json({ ok: true }, 200, { ...corsHeaders(request, env), "Set-Cookie": sessionCookie("", 0) }, env);
      }

      if ((path === "/api/v1/auth/register" || path === "/api/v1/auth/login") && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!email || password.length < 8) return response(request, env, { error: "INVALID_INPUT", message: "Email и пароль (мин. 8) обязательны." }, 400);
        if (path.endsWith("register")) {
          const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
          if (exists) return response(request, env, { error: "EMAIL_TAKEN", message: "Такая почта уже зарегистрирована." }, 409);
          const userId = id();
          await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(userId, email, await hashPassword(password), now()).run();
          const cookie = await issueSession(env, userId);
          return json({ user: { id: userId, email } }, 201, { ...corsHeaders(request, env), "Set-Cookie": cookie }, env);
        }
        const user = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind(email).first();
        if (!user || !(await verifyPassword(password, user.password_hash))) return response(request, env, { error: "INVALID_CREDENTIALS", message: "Неверный email или пароль." }, 401);
        const cookie = await issueSession(env, user.id);
        return json({ user: { id: user.id, email: user.email } }, 200, { ...corsHeaders(request, env), "Set-Cookie": cookie }, env);
      }

      if (path === "/api/v1/auth/me" && request.method === "GET") {
        const identity = await getIdentity(request, env);
        if (identity.guest) return response(request, env, { user: null }, 200);
        return response(request, env, { user: { id: identity.id, email: identity.email } });
      }

      // Capabilities
      if (path === "/api/v1/capabilities" && request.method === "GET") {
        const workersAI = Boolean(env.AI);
        const replicateToken = secret(env, "REPLICATE_API_TOKEN").present;
        const replicateImg = Boolean(replicateToken && env.IMAGE_MODEL);
        return response(request, env, {
          image: {
            enabled: workersAI || replicateImg,
            model: workersAI ? "@cf/black-forest-labs/flux-1-schnell" : (env.IMAGE_MODEL || null),
            provider: workersAI ? "workers-ai" : (replicateImg ? "replicate" : null),
            imageToImage: workersAI,
            imageToImageModel: workersAI ? "@cf/black-forest-labs/flux-2-klein-4b" : null
          },
          video: { enabled: false },
          upload: { enabled: true, maxBytes: 4 * 1024 * 1024 }
        });
      }

      // Create job (text-to-image / image-to-image)
      if (path === "/api/v1/jobs" && request.method === "POST") {
        const identity = await getIdentity(request, env);
        const maxPerHour = Number(env.MAX_JOBS_PER_HOUR || 10);
        if (!(await rateLimit(env, identity, "jobs", maxPerHour, 3600))) {
          return response(request, env, { error: "RATE_LIMIT", message: "Лимит генераций на час. Попробуй позже." }, 429);
        }
        const body = await request.json().catch(() => ({}));
        const mode = body.mode || "image";
        const prompt = String(body.prompt || "").trim().slice(0, 2000);
        if (!prompt) return response(request, env, { error: "INVALID_INPUT", message: "Промпт обязателен." }, 400);
        if (mode !== "image") return response(request, env, { error: "UNSUPPORTED_MODE", message: "Сейчас поддерживается только image." }, 400);

        let dataUrl;
        try {
          if (body.inputImage && typeof body.inputImage === "string" && body.inputImage.startsWith("data:")) {
            dataUrl = await generateImageToImage(env, prompt, body.inputImage);
          } else if (env.AI) {
            dataUrl = await generateTextToImage(env, prompt);
          } else {
            throw new Error("WORKERS_AI_NOT_CONFIGURED");
          }
        } catch (e) {
          const msg = redactSecrets(env, e.message || String(e));
          if (e.message === "WORKERS_AI_NOT_CONFIGURED") return response(request, env, { error: "PROVIDER_NOT_CONFIGURED", message: "Workers AI не подключён." }, 503);
          return response(request, env, { error: "GENERATION_FAILED", message: msg }, 502);
        }

        const jobId = id();
        // Store minimal job record if DB available
        try {
          await env.DB.prepare("INSERT INTO jobs (id, user_id, mode, prompt, status, result_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(jobId, identity.id || null, mode, prompt.slice(0, 500), "succeeded", dataUrl.slice(0, 100) + "...", now()).run();
        } catch (_) {}

        return response(request, env, {
          id: jobId,
          status: "succeeded",
          mode,
          result: { type: "image", dataUrl }
        }, 201);
      }

      if (path.startsWith("/api/v1/jobs/") && request.method === "GET") {
        return response(request, env, { error: "NOT_FOUND", message: "Job polling simplified — result returned synchronously." }, 404);
      }

      return response(request, env, { error: "NOT_FOUND", message: "Not found" }, 404);
    } catch (error) {
      console.error(redactSecrets(env, error.stack || error.message));
      if (error.message === "ACCESS_REQUIRED") return response(request, env, { error: error.message, message: "Cloudflare Access." }, 401);
      return response(request, env, { error: "INTERNAL_ERROR", message: "Внутренняя ошибка." }, 500);
    }
  }
};
