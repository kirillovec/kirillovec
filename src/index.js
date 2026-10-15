/**
 * kirillovec AI Studio API — Cloudflare Workers
 * Required binding: DB (D1). Optional upload storage: ASSETS (R2). See docs/AI-STUDIO-DEPLOYMENT.md.
 */
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}});
const now=()=>new Date().toISOString();
function decodeB64Url(value){const base=value.replace(/-/g,"+").replace(/_/g,"/");return atob(base+"=".repeat((4-base.length%4)%4))}
const id=()=>crypto.randomUUID();
function corsHeaders(request,env){const origin=request.headers.get("Origin")||"";const allowed=(env.ALLOWED_ORIGINS||"").split(",").map(s=>s.trim()).filter(Boolean);const h={"Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400"};if(allowed.includes(origin)){h["Access-Control-Allow-Origin"]=origin;h["Access-Control-Allow-Credentials"]="true"}return h}
function response(request,env,data,status=200){return json(data,status,corsHeaders(request,env))}
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
async function replicate(env,path,init={}){if(!env.REPLICATE_API_TOKEN)throw new Error("PROVIDER_NOT_CONFIGURED");const r=await fetch("https://api.replicate.com/v1"+path,{...init,headers:{"Authorization":"Bearer "+env.REPLICATE_API_TOKEN,"Content-Type":"application/json",...(init.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok){const e=new Error("PROVIDER_ERROR");e.status=r.status===429?429:502;e.detail=body.detail||body.title||"Провайдер не смог выполнить запрос.";throw e}return body}
async function handle(request,env){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});
 if(path==="/health"&&request.method==="GET")return response(request,env,{ok:true,service:"kirillovec-ai-studio",time:now()});
 if(path==="/api/v1/capabilities"&&request.method==="GET")return response(request,env,{image:{enabled:Boolean(env.REPLICATE_API_TOKEN&&env.IMAGE_MODEL),model:env.IMAGE_MODEL||null,provider:"replicate"},video:{enabled:Boolean(env.REPLICATE_API_TOKEN&&env.VIDEO_MODEL),model:env.VIDEO_MODEL||null,provider:"replicate"},selfHosted:{enabled:Boolean(env.SELF_HOSTED_API_URL),provider:env.SELF_HOSTED_API_URL?"custom":null},upload:{enabled:Boolean(env.ASSETS&&env.ASSETS_PUBLIC_BASE_URL),maxBytes:20*1024*1024}});
 let identity;try{identity=await accessIdentity(request,env)}catch{return response(request,env,{error:"ACCESS_REQUIRED",message:"Требуется авторизованный доступ через Cloudflare Access."},401)}
 if(!env.DB)return response(request,env,{error:"BACKEND_NOT_CONFIGURED",message:"Не настроена база D1."},503);
 if(path==="/api/v1/assets"&&request.method==="POST"){
  if(!env.ASSETS||!env.ASSETS_PUBLIC_BASE_URL)return response(request,env,{error:"UPLOAD_NOT_CONFIGURED",message:"Загрузка исходных файлов пока отключена, чтобы не требовать платное хранилище. Можно подключить R2 позже, по желанию."},503);
  if(!(await rateLimit(env,identity,"upload",30,3600)))return response(request,env,{error:"RATE_LIMIT",message:"Лимит загрузок исчерпан. Попробуй позже."},429);
  const form=await request.formData(),file=form.get("file");if(!(file instanceof File))return response(request,env,{error:"FILE_REQUIRED",message:"Передай файл в поле file."},400);
  const allowed=new Set(["image/jpeg","image/png","image/webp"]);if(!allowed.has(file.type))return response(request,env,{error:"UNSUPPORTED_FILE",message:"Поддерживаются JPG, PNG и WEBP."},415);
  if(file.size>20*1024*1024)return response(request,env,{error:"FILE_TOO_LARGE",message:"Максимальный размер файла — 20 МБ."},413);
  const assetId=id(),key="uploads/"+assetId+"/"+safeName(file.name);await env.ASSETS.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{owner:identity.subject}});
  const assetUrl=env.ASSETS_PUBLIC_BASE_URL.replace(/\/$/,"")+"/"+key.split("/").map(encodeURIComponent).join("/");
  await env.DB.prepare("INSERT INTO assets (id, owner, object_key, public_url, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(assetId,identity.subject,key,assetUrl,file.type,file.size,now()).run();
  return response(request,env,{id:assetId,url:assetUrl,contentType:file.type,size:file.size},201)
 }
 if(path==="/api/v1/jobs"&&request.method==="POST"){
  if(!(await rateLimit(env,identity,"job",Number(env.MAX_JOBS_PER_HOUR||10),3600)))return response(request,env,{error:"RATE_LIMIT",message:"Достигнут лимит генераций на час."},429);
  let body;try{body=await request.json()}catch{return response(request,env,{error:"INVALID_JSON",message:"Ожидается JSON."},400)}
  const mode=body.mode==="video"?"video":body.mode==="image"?"image":null,prompt=String(body.prompt||"").trim();
  if(!mode||!prompt||prompt.length>2000)return response(request,env,{error:"INVALID_INPUT",message:"Укажи mode=image/video и prompt длиной до 2000 символов."},400);
  if(body.modelSource==="selfHosted"&&!env.SELF_HOSTED_API_URL)return response(request,env,{error:"SELF_HOSTED_NOT_CONFIGURED",message:"Собственная модель ещё не подключена. Выбери внешний API или настрой SELF_HOSTED_API_URL."},503);
  if(body.modelSource==="selfHosted"&&env.SELF_HOSTED_API_URL){
   const ownInput={mode,prompt,aspectRatio:body.aspectRatio,duration:body.duration};if(body.assetId){const a=await env.DB.prepare("SELECT id, public_url FROM assets WHERE id = ? AND owner = ?").bind(String(body.assetId),identity.subject).first();if(!a)return response(request,env,{error:"ASSET_NOT_FOUND",message:"Исходный файл не найден."},404);ownInput.imageUrl=a.public_url}
   const r=await fetch(env.SELF_HOSTED_API_URL.replace(/\/$/,"")+"/jobs",{method:"POST",headers:{"Content-Type":"application/json",...(env.SELF_HOSTED_API_TOKEN?{"Authorization":"Bearer "+env.SELF_HOSTED_API_TOKEN}:{})},body:JSON.stringify(ownInput)});if(!r.ok)return response(request,env,{error:"SELF_HOSTED_ERROR",message:"Собственная модель не приняла задачу."},502);
   const own=await r.json(),jobId=id();await env.DB.prepare("INSERT INTO jobs (id, owner, mode, provider, provider_job_id, status, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(jobId,identity.subject,mode,"self-hosted",String(own.id),own.status||"starting",prompt,now(),now()).run();return response(request,env,{id:jobId,status:own.status||"starting",provider:"self-hosted"},202)
  }
  const model=mode==="video"?env.VIDEO_MODEL:env.IMAGE_MODEL;if(!env.REPLICATE_API_TOKEN||!model)return response(request,env,{error:"PROVIDER_NOT_CONFIGURED",message:"Провайдер не подключён: настрой REPLICATE_API_TOKEN и IMAGE_MODEL / VIDEO_MODEL."},503);
  const input={prompt},ratio=["1:1","3:4","4:3","9:16","16:9"].includes(body.aspectRatio)?body.aspectRatio:(mode==="video"?"16:9":"1:1");
  if(mode==="image"){input.aspect_ratio=ratio;input.output_format="webp"}else{input.duration=[5,8,10].includes(Number(body.duration))?Number(body.duration):5;input.aspect_ratio=ratio}
  if(body.assetId){const a=await env.DB.prepare("SELECT id, public_url, content_type FROM assets WHERE id = ? AND owner = ?").bind(String(body.assetId),identity.subject).first();if(!a)return response(request,env,{error:"ASSET_NOT_FOUND",message:"Исходный файл не найден или принадлежит другому пользователю."},404);if(mode==="video")input.image=a.public_url;else input.image=a.public_url}
  const prediction=await replicate(env,"/models/"+model+"/predictions",{method:"POST",headers:{"Prefer":"wait=1"},body:JSON.stringify({input})});
  const jobId=id();await env.DB.prepare("INSERT INTO jobs (id, owner, mode, provider, provider_job_id, status, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(jobId,identity.subject,mode,"replicate",prediction.id,prediction.status||"starting",prompt,now(),now()).run();
  return response(request,env,{id:jobId,status:prediction.status||"starting",provider:"replicate",result:prediction.output||null},202)
 }
 const match=path.match(/^\/api\/v1\/jobs\/([0-9a-f-]+)$/i);
 if(match&&request.method==="GET"){
  const job=await env.DB.prepare("SELECT id, owner, mode, provider, provider_job_id, status, prompt, result_url, error_message, created_at, updated_at FROM jobs WHERE id = ? AND owner = ?").bind(match[1],identity.subject).first();if(!job)return response(request,env,{error:"JOB_NOT_FOUND",message:"Задача не найдена."},404);
  let remote=null;try{if(job.provider==="replicate")remote=await replicate(env,"/predictions/"+encodeURIComponent(job.provider_job_id),{method:"GET"});else if(job.provider==="self-hosted"&&env.SELF_HOSTED_API_URL){const r=await fetch(env.SELF_HOSTED_API_URL.replace(/\/$/,"")+"/jobs/"+encodeURIComponent(job.provider_job_id),{headers:env.SELF_HOSTED_API_TOKEN?{"Authorization":"Bearer "+env.SELF_HOSTED_API_TOKEN}:{}});if(r.ok)remote=await r.json()}}catch(e){if(e.message==="PROVIDER_NOT_CONFIGURED")return response(request,env,{error:e.message},503)}
  if(remote){const status=remote.status||job.status,outputs=remote.output==null?remote.result??null:remote.output,resultUrl=Array.isArray(outputs)?outputs[0]:typeof outputs==="string"?outputs:outputs?.url||outputs?.video||outputs?.image||null;await env.DB.prepare("UPDATE jobs SET status = ?, result_url = ?, error_message = ?, updated_at = ? WHERE id = ?").bind(status,resultUrl,remote.error?String(remote.error).slice(0,500):null,now(),job.id).run();return response(request,env,{id:job.id,mode:job.mode,status,result:outputs,resultUrl,error:remote.error||null,createdAt:job.created_at,updatedAt:now()})}
  return response(request,env,{id:job.id,mode:job.mode,status:job.status,resultUrl:job.result_url,error:job.error_message,createdAt:job.created_at,updatedAt:job.updated_at})
 }
 if(path==="/api/v1/jobs"&&request.method==="GET"){const result=await env.DB.prepare("SELECT id, mode, provider, status, prompt, result_url, error_message, created_at, updated_at FROM jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 50").bind(identity.subject).all();return response(request,env,{jobs:result.results||[]})}
 return response(request,env,{error:"NOT_FOUND",message:"Маршрут не найден."},404)
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(error){if(error.message==="PROVIDER_NOT_CONFIGURED")return response(request,env,{error:error.message,message:"Не настроен токен или модель провайдера."},503);if(error.message==="ACCESS_REQUIRED")return response(request,env,{error:error.message,message:"Не удалось проверить Cloudflare Access."},401);return response(request,env,{error:"INTERNAL_ERROR",message:error.status===429?"Лимит провайдера превышен.":error.status?error.detail:"Внутренняя ошибка API."},error.status||500)}}};
