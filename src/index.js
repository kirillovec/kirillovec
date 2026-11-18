/**
 * kirillovec AI Studio API — Cloudflare Workers
 * Text→image: FLUX.1 Schnell. Image editing: FLUX.2 Klein 4B.
 * Input images for img2img must be smaller than 512x512 (Workers AI docs).
 */
function secret(env,key){const value=typeof env?.[key]==="string"?env[key]:"";return Object.freeze({present:value.length>0,reveal(){return value},toString(){return ""},valueOf(){return ""},toJSON(){return null}})}
function redactSecrets(env,text){let out=String(text);for(const key of ["REPLICATE_API_TOKEN","RESEND_API_KEY","SELF_HOSTED_API_TOKEN","ACCESS_AUD"]){const value=secret(env,key).reveal();if(value.length>6&&out.includes(value))out=out.split(value).join("[redacted]")}return out.replace(/bearer\s+[a-z0-9\-._~+/]+=*/gi,"Bearer [redacted]").replace(/\b(r8_|sk_live_|sk-)[A-Za-z0-9_\-]{8,}/g,"[redacted]")}
const json=(data,status=200,extra={},env)=>new Response(redactSecrets(env,JSON.stringify(data)),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}});
const now=()=>new Date().toISOString();
function decodeB64Url(value){const base=value.replace(/-/g,"+").replace(/_/g,"/");return atob(base+"=".repeat((4-base.length%4)%4))}
const id=()=>crypto.randomUUID();
function corsHeaders(request,env){const origin=request.headers.get("Origin")||"";const allowed=(env.ALLOWED_ORIGINS||"").split(",").map(s=>s.trim()).filter(Boolean);const h={"Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400"};if(allowed.includes(origin)){h["Access-Control-Allow-Origin"]=origin;h["Access-Control-Allow-Credentials"]="true"}return h}
function response(request,env,data,status=200){return json(data,status,corsHeaders(request,env),env)}
async function accessIdentity(request,env){
 if(env.ACCESS_REQUIRED!=="true")return{email:"development",subject:"development"};
 const assertion=request.headers.get("Cf-Access-Jwt-Assertion");if(!assertion||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)throw new Error("ACCESS_REQUIRED");
 const parts=assertion.split(".");if(parts.length!==3)throw new Error("ACCESS_REQUIRED");
 let header,payload;try{header=JSON.parse(decodeB64Url(parts[0]));payload=JSON.parse(decodeB64Url(parts[1]))}catch{throw new Error("ACCESS_REQUIRED")}
 if(!header.kid||!(payload.aud===env.ACCESS_AUD||(Array.isArray(payload.aud)&&payload.aud.includes(env.ACCESS_AUD))))throw new Error("ACCESS_REQUIRED");
 const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
 const jwksUrl="https://"+domain+"/cdn-cgi/access/certs";let jwks=await env.JWKS_CACHE?.get("cloudflare-access-jwks","json");
 if(!jwks){const r=await fetch(jwksUrl);if(!r.ok)throw new Error("ACCESS_REQUIRED");jwks=await r.json();await env.JWKS_CACHE?.put("cloudflare-access-jwks",JSON.stringify(jwks),{expirationTtl:3600})}
 const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid);if(!jwk)throw new Error("ACCESS_REQUIRED");
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
 const signed=new TextEncoder().encode(parts[0]+"."+parts[1]);const signature=Uint8Array.from(decodeB64Url(parts[2]),c=>c.charCodeAt(0));
 const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,signature,signed);const seconds=Math.floor(Date.now()/1000);
 if(!valid||!payload.exp||payload.exp<seconds||(payload.nbf&&payload.nbf>seconds)||!payload.iss?.includes(domain))throw new Error("ACCESS_REQUIRED");
 return{email:String(payload.email||payload.sub||""),subject:String(payload.sub||payload.email||"")};
}
function safeName(name){return String(name||"upload").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)||"upload"}
async function rateLimit(env,identity,bucket,max,windowSeconds){const key=identity.subject||identity.email||"unknown";const cutoff=new Date(Date.now()-windowSeconds*1000).toISOString();await env.DB.prepare("DELETE FROM rate_limits WHERE created_at < ?").bind(cutoff).run();const row=await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE identity = ? AND bucket = ? AND created_at >= ?").bind(key,bucket,cutoff).first();if((row?.count||0)>=max)return false;await env.DB.prepare("INSERT INTO rate_limits (identity, bucket, created_at) VALUES (?, ?, ?)").bind(key,bucket,now()).run();return true}
async function replicate(env,path,init={}){const token=secret(env,"REPLICATE_API_TOKEN");if(!token.present)throw new Error("PROVIDER_NOT_CONFIGURED");const r=await fetch("https://api.replicate.com/v1"+path,{...init,headers:{"Authorization":"Bearer "+token.reveal(),"Content-Type":"application/json",...(init.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok){const e=new Error("PROVIDER_ERROR");e.status=r.status===429?429:502;throw e}return body}
function arrayBufferToBase64(buffer){const bytes=new Uint8Array(buffer);let binary="";for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);return btoa(binary)}
function detectImageMime(b64){if(b64.startsWith("/9j/"))return "image/jpeg";if(b64.startsWith("iVBOR"))return "image/png";if(b64.startsWith("UklGR"))return "image/webp";return "image/png"}
function resultToDataUrl(result){let b64=null;if(typeof result==="string"){if(result.startsWith("data:"))return result;b64=result}else if(result instanceof ArrayBuffer){b64=arrayBufferToBase64(result)}else if(result instanceof Uint8Array){b64=arrayBufferToBase64(result.buffer)}else if(result?.image){b64=typeof result.image==="string"?result.image:arrayBufferToBase64(result.image)}else if(result?.data){b64=typeof result.data==="string"?result.data:arrayBufferToBase64(result.data)}if(!b64)throw new Error("WORKERS_AI_EMPTY_RESULT");if(b64.startsWith("data:"))return b64;return "data:"+detectImageMime(b64)+";base64,"+b64}
async function generateTextToImage(env,prompt){if(!env.AI)throw new Error("WORKERS_AI_NOT_CONFIGURED");const result=await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{prompt});return resultToDataUrl(result)}
async function generateImageToImage(env,prompt,imageDataUrl){
  if(!env.AI)throw new Error("WORKERS_AI_NOT_CONFIGURED");
  const raw=String(imageDataUrl||"");
  const match=raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error("INVALID_IMAGE");
  const mime=match[1];
  const image_b64=match[2];
  if(image_b64.length<100)throw new Error("INVALID_IMAGE");
  let bytes;try{bytes=Uint8Array.from(atob(image_b64),c=>c.charCodeAt(0))}catch{throw new Error("INVALID_IMAGE")}
  const safeMime=mime==="image/webp"?"image/jpeg":mime;
  const ext=safeMime==="image/png"?"png":"jpg";
  const imageBlob=new Blob([bytes],{type:safeMime});
  const form=new FormData();
  form.append("prompt",prompt);
  form.append("input_image_0",imageBlob,"reference."+ext);
  form.append("width","768");
  form.append("height","768");
  const multipart=new Response(form);
  const contentType=multipart.headers.get("content-type");
  try{
    const result=await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b",{multipart:{body:multipart.body,contentType}});
    return resultToDataUrl(result);
  }catch(err){
    const msg=String(err?.message||err||"");
    if(/could not be decoded|unable to decode|invalid image|truncated|corrupt|decode/i.test(msg)){
      const e=new Error("IMAGE_DECODE_FAILED");
      e.detail="Модель не смогла прочитать исходное фото. Нужен JPG меньше 512×512.";
      throw e;
    }
    throw err;
  }
}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function sha256hex(text){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function hashPassword(password,saltBytes){const salt=saltBytes||crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256);return "pbkdf2$100000$"+b64url(salt)+"$"+b64url(new Uint8Array(bits))}
async function verifyPassword(password,stored){const parts=String(stored||"").split("$");if(parts.length!==4||parts[0]!=="pbkdf2")return false;const salt=Uint8Array.from(atob(parts[2].replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-parts[2].length%4)%4)),c=>c.charCodeAt(0));const next=await hashPassword(password,salt);return next===stored}
function readCookie(request,name){const m=(request.headers.get("Cookie")||"").match(new RegExp("(?:^|; )"+name+"=([^;]+)"));return m?decodeURIComponent(m[1]):""}
function sessionCookie(token,maxAge){return "ko_session="+encodeURIComponent(token)+"; HttpOnly; Secure; Path=/; SameSite=None; Max-Age="+maxAge}
function clientIp(request){return request.headers.get("CF-Connecting-IP")||"unknown"}
function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=120}
async function userFromSession(request,env){if(!env.DB)return null;const token=readCookie(request,"ko_session");if(!token||token.length<20)return null;const hash=await sha256hex(token);const row=await env.DB.prepare("SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(hash,now()).first();return row||null}

async function sendResetMail(env,to,link){
 const subject="Сброс пароля — kirillovec";
 const text="Чтобы задать новый пароль, открой ссылку в течение 30 минут:\n"+link+"\n\nЕсли это был не ты, ничего делать не нужно.";
 const resend=secret(env,"RESEND_API_KEY");
 if(resend.present){
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resend.reveal(),"Content-Type":"application/json"},body:JSON.stringify({from:"kirillovec <noreply@kirillovec.ru>",to:[to],subject,text})});
  if(!r.ok){const e=new Error("MAIL_FAILED");e.detail="Почта не приняла письмо.";throw e}
  return;
 }
 if(env.EMAIL&&typeof env.EMAIL.send==="function"){
  await env.EMAIL.send({to,from:{email:"noreply@kirillovec.ru",name:"kirillovec"},subject,text});
  return;
 }
 const e=new Error("MAIL_NOT_CONFIGURED");e.detail="Отправка писем ещё не подключена. Войди и смени пароль в аккаунте.";throw e;
}

async function issueSession(env,userId){const token=b64url(crypto.getRandomValues(new Uint8Array(32)));const exp=new Date(Date.now()+30*864e5).toISOString();await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(),userId,await sha256hex(token),exp,now()).run();return sessionCookie(token,30*86400)}
async function handle(request,env){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});
 if(path==="/health"&&request.method==="GET")return response(request,env,{ok:true,service:"kirillovec-ai-studio",time:now()});
 if(path.startsWith("/api/v1/auth/")){
  if(!env.DB)return response(request,env,{error:"BACKEND_NOT_CONFIGURED",message:"Не настроена база D1."},503);
  if(path==="/api/v1/auth/me"&&request.method==="GET"){const user=await userFromSession(request,env);if(!user)return response(request,env,{user:null});return response(request,env,{user:{id:user.id,email:user.email}})}
  if(path==="/api/v1/auth/logout"&&request.method==="POST"){const token=readCookie(request,"ko_session");if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256hex(token)).run();return json({ok:true},200,{...corsHeaders(request,env),"Set-Cookie":sessionCookie("",0)},env)}
  if((path==="/api/v1/auth/register"||path==="/api/v1/auth/login")&&request.method==="POST"){
   if(!(await rateLimit(env,{subject:clientIp(request)},path.endsWith("register")?"register":"login",path.endsWith("register")?8:20,3600)))return response(request,env,{error:"RATE_LIMIT",message:"Слишком много попыток."},429);
   let body;try{body=await request.json()}catch{return response(request,env,{error:"INVALID_JSON",message:"Ожидается JSON."},400)}
   const email=String(body.email||"").trim().toLowerCase();const password=String(body.password||"");
   if(!validEmail(email)||password.length<8||password.length>72)return response(request,env,{error:"INVALID_INPUT",message:"Нужны почта и пароль от 8 до 72 символов."},400);
   if(path.endsWith("register")){const exists=await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();if(exists)return response(request,env,{error:"EMAIL_TAKEN",message:"Такая почта уже зарегистрирована."},409);const userId=id();await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(userId,email,await hashPassword(password),now()).run();const cookie=await issueSession(env,userId);return json({user:{id:userId,email}},201,{...corsHeaders(request,env),"Set-Cookie":cookie},env)}
   const user=await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind(email).first();
   if(!user||!(await verifyPassword(password,user.password_hash)))return response(request,env,{error:"INVALID_LOGIN",message:"Неверная почта или пароль."},401);
   const cookie=await issueSession(env,user.id);return json({user:{id:user.id,email:user.email}},200,{...corsHeaders(request,env),"Set-Cookie":cookie},env)
  }
  if(path==="/api/v1/auth/password"&&request.method==="POST"){
   const session=await userFromSession(request,env);if(!session)return response(request,env,{error:"AUTH_REQUIRED",message:"Сначала войди."},401);
   if(!(await rateLimit(env,{subject:session.id},"password",8,3600)))return response(request,env,{error:"RATE_LIMIT",message:"Слишком много попыток."},429);
   let body;try{body=await request.json()}catch{return response(request,env,{error:"INVALID_JSON",message:"Ожидается JSON."},400)}
   const current=String(body.currentPassword||""),password=String(body.password||"");
   if(password.length<8||password.length>72)return response(request,env,{error:"INVALID_INPUT",message:"Новый пароль — от 8 до 72 символов."},400);
   const row=await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(session.id).first();
   if(!row||!(await verifyPassword(current,row.password_hash)))return response(request,env,{error:"INVALID_LOGIN",message:"Текущий пароль неверный."},401);
   await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password),session.id).run();
   await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(session.id).run();
   return response(request,env,{ok:true});
  }
  if(path==="/api/v1/auth/forgot"&&request.method==="POST"){
   if(!(await rateLimit(env,{subject:clientIp(request)},"forgot",5,3600)))return response(request,env,{error:"RATE_LIMIT",message:"Слишком много попыток. Попробуй позже."},429);
   let body;try{body=await request.json()}catch{return response(request,env,{error:"INVALID_JSON",message:"Ожидается JSON."},400)}
   const email=String(body.email||"").trim().toLowerCase();
   if(!validEmail(email))return response(request,env,{error:"INVALID_INPUT",message:"Укажи почту."},400);
   if(!secret(env,"RESEND_API_KEY").present&&!(env.EMAIL&&typeof env.EMAIL.send==="function"))return response(request,env,{error:"MAIL_NOT_CONFIGURED",message:"Письма ещё не подключены. Если помнишь пароль, смени его после входа."},503);
   const generic={ok:true,message:"Если почта зарегистрирована, отправили ссылку. Она действует 30 минут."};
   const user=await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
   if(!user)return response(request,env,generic);
   const token=b64url(crypto.getRandomValues(new Uint8Array(32)));
   const exp=new Date(Date.now()+30*60*1000).toISOString();
   await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();
   await env.DB.prepare("INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(),user.id,await sha256hex(token),exp,now()).run();
   try{await sendResetMail(env,user.email,"https://kirillovec.ru/account/?reset="+encodeURIComponent(token))}
   catch(e){await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();return response(request,env,{error:e.message==="MAIL_NOT_CONFIGURED"?"MAIL_NOT_CONFIGURED":"MAIL_FAILED",message:e.detail||"Не удалось отправить письмо."},e.message==="MAIL_NOT_CONFIGURED"?503:502)}
   return response(request,env,generic);
  }
  if(path==="/api/v1/auth/reset"&&request.method==="POST"){
   if(!(await rateLimit(env,{subject:clientIp(request)},"reset",10,3600)))return response(request,env,{error:"RATE_LIMIT",message:"Слишком много попыток."},429);
   let body;try{body=await request.json()}catch{return response(request,env,{error:"INVALID_JSON",message:"Ожидается JSON."},400)}
   const token=String(body.token||""),password=String(body.password||"");
   if(token.length<20||password.length<8||password.length>72)return response(request,env,{error:"INVALID_INPUT",message:"Нужны ссылка из письма и новый пароль от 8 символов."},400);
   const row=await env.DB.prepare("SELECT id, user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?").bind(await sha256hex(token),now()).first();
   if(!row)return response(request,env,{error:"INVALID_TOKEN",message:"Ссылка недействительна или устарела."},400);
   await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password),row.user_id).run();
   await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.user_id).run();
   await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id).run();
   const user=await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(row.user_id).first();
   const cookie=await issueSession(env,row.user_id);
   return json({user:{id:user.id,email:user.email}},200,{...corsHeaders(request,env),"Set-Cookie":cookie},env);
  }
  return response(request,env,{error:"NOT_FOUND",message:"Маршрут не найден."},404)
 }
 if(path==="/api/v1/capabilities"&&request.method==="GET"){
  const workersAI=Boolean(env.AI);const replicateToken=secret(env,"REPLICATE_API_TOKEN").present;const replicateImg=Boolean(replicateToken&&env.IMAGE_MODEL);const replicateVid=Boolean(replicateToken&&env.VIDEO_MODEL);
  return response(request,env,{image:{enabled:workersAI||replicateImg,model:workersAI?"@cf/black-forest-labs/flux-1-schnell":(env.IMAGE_MODEL||null),provider:workersAI?"workers-ai":(replicateImg?"replicate":null),imageToImage:workersAI,imageToImageModel:workersAI?"@cf/black-forest-labs/flux-2-klein-4b":null},video:{enabled:replicateVid,model:env.VIDEO_MODEL||null,provider:replicateVid?"replicate":null},selfHosted:{enabled:Boolean(env.SELF_HOSTED_API_URL),provider:env.SELF_HOSTED_API_URL?"custom":null},upload:{enabled:true,storage:"request-inline",maxBytes:4*1024*1024}})
 }
 let identity;try{identity=await accessIdentity(request,env)}catch{return response(request,env,{error:"ACCESS_REQUIRED",message:"Требуется авторизованный доступ через Cloudflare Access."},401)}
 if(identity.subject==="development"){const guestHash=await sha256hex(clientIp(request));identity={email:"",subject:"guest:"+guestHash}}
 if(!env.DB)return response(request,env,{error:"BACKEND_NOT_CONFIGURED",message:"Не настроена база D1."},503);
 const sessionUser=await userFromSession(request,env);if(sessionUser)identity={email:sessionUser.email,subject:"user:"+sessionUser.id};
 if(path==="/api/v1/jobs"&&request.method==="POST"){
  if(!(await rateLimit(env,identity,"job",Number(env.MAX_JOBS_PER_HOUR||10),3600)))return response(request,env,{error:"RATE_LIMIT",message:"Достигнут лимит генераций на час."},429);
  let body;try{body=await request.json()}catch{return response(request,env,{error:"INVALID_JSON",message:"Ожидается JSON."},400)}
  const mode=body.mode==="video"?"video":body.mode==="image"?"image":null,prompt=String(body.prompt||"").trim();
  if(!mode||!prompt||prompt.length>2000)return response(request,env,{error:"INVALID_INPUT",message:"Укажи mode=image/video и prompt до 2000 символов."},400);
  if(mode==="image"&&env.AI){
   try{
    let resultUrl;let providerLabel="workers-ai";
    const incomingImage=body.imageDataUrl||body.image||null;
    if(incomingImage){
      const dataUrl=String(incomingImage);
      const validType=["data:image/jpeg;base64,","data:image/png;base64,","data:image/webp;base64,"].some(p=>dataUrl.startsWith(p));
      const payload=dataUrl.split(",")[1]||"";
      if(!validType||!/^[A-Za-z0-9+/=]+$/.test(payload)||payload.length>5600000)return response(request,env,{error:"INVALID_IMAGE",message:"Исходник: JPG/PNG/WEBP до ~4 МБ."},400);
      resultUrl=await generateImageToImage(env,prompt,dataUrl);providerLabel="workers-ai-img2img";
    }else{resultUrl=await generateTextToImage(env,prompt)}
    const jobId=id();
    await env.DB.prepare("INSERT INTO jobs (id, owner, mode, provider, provider_job_id, status, prompt, result_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(jobId,identity.subject,"image",providerLabel,jobId,"succeeded",prompt,null,now(),now()).run();
    return response(request,env,{id:jobId,status:"succeeded",provider:providerLabel,resultUrl},200);
   }catch(e){
    const safe=e.message==="IMAGE_DECODE_FAILED"?"Не удалось прочитать фото.":(e.message==="INVALID_IMAGE"?"Некорректный исходник.":"Ошибка генерации.");
    const code=e.message==="IMAGE_DECODE_FAILED"||e.message==="INVALID_IMAGE"?e.message:"GENERATION_FAILED";
    return response(request,env,{error:code,message:safe},code==="GENERATION_FAILED"?502:400);
   }
  }
  return response(request,env,{error:"PROVIDER_NOT_CONFIGURED",message:"Нет доступного провайдера."},503)
 }
 const match=path.match(/^\/api\/v1\/jobs\/([a-zA-Z0-9_-]+)$/i);
 if(match&&request.method==="GET"){
  const job=await env.DB.prepare("SELECT id, owner, mode, provider, status, prompt, result_url, error_message, created_at, updated_at FROM jobs WHERE id = ? AND owner = ?").bind(match[1],identity.subject).first();
  if(!job)return response(request,env,{error:"JOB_NOT_FOUND",message:"Задача не найдена."},404);
  return response(request,env,{id:job.id,mode:job.mode,status:job.status,resultUrl:job.result_url,error:job.error_message,createdAt:job.created_at,updatedAt:job.updated_at})
 }
 if(path==="/api/v1/jobs"&&request.method==="GET"){
  const result=await env.DB.prepare("SELECT id, mode, provider, status, prompt, result_url, error_message, created_at, updated_at FROM jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 50").bind(identity.subject).all();
  return response(request,env,{jobs:result.results||[]})
 }
 return response(request,env,{error:"NOT_FOUND",message:"Маршрут не найден."},404)
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(error){if(error.message==="PROVIDER_NOT_CONFIGURED"||error.message==="PROVIDER_ERROR")return response(request,env,{error:"PROVIDER_ERROR",message:error.status===429?"Лимит провайдера.":"Провайдер не смог выполнить запрос."},error.status||502);if(error.message==="ACCESS_REQUIRED")return response(request,env,{error:error.message,message:"Cloudflare Access."},401);return response(request,env,{error:"INTERNAL_ERROR",message:"Внутренняя ошибка."},500)}}};
