(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const prompt = $("#prompt"), config = window.AI_STUDIO_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const historyKey = "kirillovec-ai-studio-history-v2";
  let mode = "image", selectedFile = null, localHistory = [], pollTimer = null, capabilities = null;
  const selected = { genre: new Set(), instruments: new Set(), mood: new Set(), vocal: new Set(), production: new Set() };
  const labels = {starting:"Запускается",processing:"Выполняется",queued:"В очереди",succeeded:"Готово",failed:"Ошибка"};

  function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.style.display="block";clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display="none",4500);}
  function setStatus(text){const el=$("#result-status");if(el)el.textContent=text;}
  function setNotice(text,kind){const el=$("#notice");if(!el)return;el.textContent=text;el.style.display="block";el.style.borderColor=kind==="error"?"#754044":"#55432d";}

  function updateAvailability(){
    const btn = $("#generate");
    if (btn) {
      btn.disabled = mode === "image" && !capabilities?.image?.enabled;
      if (mode === "image") btn.textContent = capabilities?.image?.enabled ? "✦ Создать изображение" : "Модель не подключена";
    }
    const hint = $("#model-hint");
    if (hint && mode === "image") hint.textContent = capabilities?.image?.enabled ? "Модель доступна." : "Модель изображений не подключена.";
    const vp = $("#video-providers");
    if (vp) vp.style.display = mode === "video" ? "block" : "none";
  }

  function setMode(next){
    mode = next === "video" ? "video" : next === "audio" ? "audio" : "image";
    document.body.classList.toggle("mode-audio", mode === "audio");
    document.querySelectorAll("[data-mode]").forEach(b => {
      const active = b.dataset.mode === mode;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    const titles = {
      image: ["Изображения", "Преврати идею в визуал", "Текст → изображение", "Обложки и кадры"],
      audio: ["Аудио / Suno", "Собери Style и Lyrics для Suno", "Style + Lyrics", "Промпт-билдер"],
      video: ["Видео", "Оживи исходное фото", "Фото → видео", "Внешний сервис"]
    };
    const t = titles[mode];
    if ($("#crumb-title")) $("#crumb-title").textContent = t[0];
    if ($("#page-title")) $("#page-title").textContent = t[1];
    if ($("#mode-caption")) $("#mode-caption").textContent = t[2];
    if ($("#page-eyebrow")) $("#page-eyebrow").textContent = t[3];
    if ($("#page-subtitle")) $("#page-subtitle").textContent =
      mode === "audio" ? "Конструктор в духе usesuno: жанр, инструменты, настроение, вокал, продакшн → копируй в Suno."
      : mode === "video" ? "Скопируй промпт и открой внешний видеосервис."
      : "Создавай изображения или редактируй исходный кадр.";
    if ($("#panel-title")) $("#panel-title").textContent = mode === "audio" ? "Suno Prompt Builder" : "Новая генерация";
    updateAvailability();
  }

  const examples = {
    music: "Square album cover, 1:1. Night view from a high-rise window in a Russian city, cold distant lights, thin cigarette smoke in a beam of light, dark minimal interior silhouette, deep shadows, muted blue-grey palette, photorealistic, film grain, no people faces, no hearts, no cliché symbols. Leave clean dark negative space in the lower third for bold typography \"kirillovec\". High detail, album cover composition.",
    cover: "Square album cover for the project «НИЗКО». Dark minimalism: open window at night, city lights blurred outside, soft smoke drifting indoors, cold side light, almost black shadows, photorealistic still. Large bold title space for \"НИЗКО\" and small signature \"kirillovec\". Square 1:1, serious rap album artwork.",
    smoke: "Album-ready frame: cigarette smoke in a sharp ray of light from a night window, dark room, city glow beyond the glass, cold cyan-grey tones, film grain, photorealistic. Square composition with empty dark area for typography. No faces.",
    cinematic: "Cinematic night still for a rap album cover: wet asphalt reflecting neon, smoke in a light beam, deep contrast, teal and amber accents, 35mm film look, square 1:1, negative space for title.",
    portrait: "Editorial half-portrait for album artwork: man in dim room light from a window, soft smoke, city bokeh, 85mm f/1.8, natural skin, serious expression, dark clothing. Square crop friendly.",
    window: "Square album cover: close view of a night apartment window, condensation, distant tower blocks, thin smoke, cold blue light, almost monochrome, film grain. Lower area empty for \"kirillovec\".",
    low: "Square cover concept «НИЗКО»: looking down from a balcony at night, sparse street lights far below, fog, deep black sky, cold desaturated colours. Bold negative space for НИЗКО."
  };

  const audioPresets = {
    nizko: {
      genre: ["southern hip hop", "melodic rap"],
      instruments: ["808 bass", "dark piano", "atmospheric pads", "sparse drums"],
      mood: ["nocturnal", "melancholic", "introspective", "heavy atmosphere"],
      vocal: ["male rap vocals", "melodic rap delivery", "emotional singing hooks"],
      production: ["dark mix", "spacey reverb", "minimal arrangement", "cinematic atmosphere"],
      lyrics: "[Intro]\nтишина и дым...\n\n[Verse]\nсмотришь вниз с балкона — огни далеко\nгород как чужой, а ты всё ещё тут\n\n[Chorus]\nнизко... слишком низко\nно дыхание ещё есть\n\n[Verse]\n\n[Chorus]\n\n[Outro]\n"
    },
    smoke: {
      genre: ["cloud rap", "lo-fi hip hop"],
      instruments: ["atmospheric pads", "vinyl crackle", "dark piano", "sparse drums"],
      mood: ["nocturnal", "cold and distant", "nostalgic"],
      vocal: ["male rap vocals", "raw spoken flow"],
      production: ["dark mix", "spacey reverb", "tape saturation"],
      lyrics: "[Verse]\nдым в луче из окна\nгород за стеклом — чужая жизнь\n\n[Chorus]\nостанься в этой ночи ещё немного\n\n[Verse]\n\n[Outro]\n"
    },
    trap: {
      genre: ["trap rap", "southern hip hop"],
      instruments: ["808 bass", "trap hi-hats", "atmospheric pads"],
      mood: ["aggressive", "nocturnal", "heavy atmosphere"],
      vocal: ["male rap vocals", "autotuned vocals", "double-tracked chorus"],
      production: ["hard-hitting low end", "dark mix"],
      lyrics: "[Intro]\n\n[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]\n\n[Outro]\n"
    },
    melodic: {
      genre: ["melodic rap", "emo rap"],
      instruments: ["dark piano", "guitar sample", "atmospheric pads", "808 bass"],
      mood: ["melancholic", "nostalgic", "introspective"],
      vocal: ["melodic rap delivery", "emotional singing hooks", "autotuned vocals"],
      production: ["spacey reverb", "cinematic atmosphere", "minimal arrangement"],
      lyrics: "[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Chorus]\n"
    }
  };

  function buildStyle(){
    const parts = [];
    ["genre","instruments","mood","vocal","production"].forEach(k => {
      if (selected[k].size) parts.push([...selected[k]].join(", "));
    });
    return parts.join(", ");
  }

  function refreshStyleOut(){
    const s = buildStyle();
    const el = $("#style-out");
    if (el) el.textContent = s || "Выбери чипы выше — Style соберётся сам";
    if ($("#style-count")) $("#style-count").textContent = s.length + " симв.";
  }

  document.querySelectorAll(".chip-row .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const pillar = btn.closest("[data-pillar]")?.dataset.pillar;
      const v = btn.dataset.v;
      if (!pillar || !v) return;
      if (selected[pillar].has(v)) { selected[pillar].delete(v); btn.classList.remove("active"); }
      else { selected[pillar].add(v); btn.classList.add("active"); }
      refreshStyleOut();
    });
  });

  document.querySelectorAll("[data-audio-preset]").forEach(b => {
    b.addEventListener("click", () => {
      const p = audioPresets[b.dataset.audioPreset];
      if (!p) return;
      Object.keys(selected).forEach(k => selected[k].clear());
      document.querySelectorAll(".chip-row .chip").forEach(c => c.classList.remove("active"));
      ["genre","instruments","mood","vocal","production"].forEach(k => {
        (p[k] || []).forEach(v => {
          selected[k].add(v);
          document.querySelectorAll(`.chip-row[data-pillar="${k}"] .chip`).forEach(chip => {
            if (chip.dataset.v === v) chip.classList.add("active");
          });
        });
      });
      if ($("#lyrics") && p.lyrics) $("#lyrics").value = p.lyrics;
      refreshStyleOut();
      setMode("audio");
      toast("Пресет применён");
    });
  });

  document.querySelectorAll("[data-tag]").forEach(b => {
    b.addEventListener("click", () => {
      const ta = $("#lyrics");
      if (!ta) return;
      const tag = b.dataset.tag + "\n";
      const start = ta.selectionStart || ta.value.length;
      ta.value = ta.value.slice(0, start) + tag + ta.value.slice(start);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + tag.length;
    });
  });

  async function copyText(text, okMsg){
    try { await navigator.clipboard.writeText(text); toast(okMsg || "Скопировано"); }
    catch { toast("Не удалось скопировать"); }
  }
  if ($("#copy-style")) $("#copy-style").addEventListener("click", () => {
    const s = buildStyle();
    if (!s) { toast("Сначала выбери Style-чипы"); return; }
    copyText(s, "Style скопирован — вставь в Suno");
  });
  if ($("#copy-lyrics")) $("#copy-lyrics").addEventListener("click", () => {
    const t = ($("#lyrics")?.value || "").trim();
    if (!t) { toast("Lyrics пустые"); return; }
    copyText(t, "Lyrics скопированы");
  });

  document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => {
    if (!prompt) return;
    prompt.value = examples[b.dataset.prompt] || prompt.value;
    if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000";
    prompt.focus();
  }));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(n => n.classList.toggle("active", n === b));
    const v = b.dataset.view;
    if (v === "audio") setMode("audio");
    else if (v === "image" || v === "create") setMode("image");
    else if (v === "history") $("#history-list")?.scrollIntoView({behavior:"smooth", block:"center"});
  }));
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    const map = { edit: "Edit the uploaded image, keep composition. Change: ", face: "Process the image, keep natural proportions. Goal: ", cover: examples.cover };
    const text = map[b.dataset.tool];
    if (!text) return;
    setMode("image");
    if (prompt) { prompt.value = text; if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000"; prompt.focus(); }
  }));
  if (prompt) prompt.addEventListener("input", () => { if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000"; });

  function attachFile(file){
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { toast("JPG, PNG или WEBP"); return; }
    if (file.size > 4*1024*1024) { toast("Макс. 4 МБ"); return; }
    selectedFile = file;
    const old = $("#file-thumb");
    if (old?.dataset.url) URL.revokeObjectURL(old.dataset.url);
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.id = "file-thumb"; img.src = url; img.dataset.url = url; img.alt = "";
    old?.replaceWith(img);
    if ($("#file-name")) $("#file-name").textContent = file.name;
    if ($("#file-size")) $("#file-size").textContent = (file.size/1048576).toFixed(2) + " МБ · до 512px";
    if ($("#file-preview")) $("#file-preview").style.display = "flex";
    toast("Исходник прикреплён");
  }
  if ($("#file-input")) $("#file-input").addEventListener("change", e => attachFile(e.target.files?.[0]));
  if ($("#remove-file")) $("#remove-file").addEventListener("click", () => {
    selectedFile = null;
    if ($("#file-input")) $("#file-input").value = "";
    const img = $("#file-thumb");
    if (img?.dataset.url) URL.revokeObjectURL(img.dataset.url);
    if ($("#file-preview")) $("#file-preview").style.display = "none";
  });

  function saveHistory(item){
    const i = localHistory.findIndex(e => e.id && e.id === item.id);
    if (i >= 0) localHistory[i] = item; else localHistory.push(item);
    localHistory = localHistory.slice(-20);
    try { localStorage.setItem(historyKey, JSON.stringify(localHistory)); } catch {}
    renderHistory();
  }
  function renderHistory(){
    const list = $("#history-list");
    if (!list) return;
    list.replaceChildren();
    if (!localHistory.length) { list.innerHTML = '<div class="history-empty">История изображений</div>'; if ($("#history-count")) $("#history-count").textContent = "0"; return; }
    localHistory.slice().reverse().forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item";
      const thumb = document.createElement("div");
      thumb.className = "history-thumb";
      if (item.resultUrl) {
        const im = document.createElement("img");
        im.src = item.resultUrl; im.alt = ""; im.loading = "lazy";
        im.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:8px";
        thumb.append(im);
      } else thumb.textContent = "▧";
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = (item.prompt || "Задача").slice(0, 60);
      const meta = document.createElement("span");
      meta.textContent = (labels[item.status] || item.status || "") + " · " + new Date(item.ts).toLocaleString("ru-RU");
      detail.append(title, meta);
      row.append(thumb, detail);
      row.addEventListener("click", () => {
        if (prompt) prompt.value = item.prompt || "";
        setMode("image");
        if (item.resultUrl) showResult(item.resultUrl);
      });
      list.append(row);
    });
    if ($("#history-count")) $("#history-count").textContent = String(localHistory.length);
  }
  function showResult(url){
    const stage = $("#result-stage");
    if (!stage) return;
    stage.replaceChildren();
    const media = document.createElement("img");
    media.src = url; media.alt = "Результат"; media.loading = "eager";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:center;margin-top:14px";
    const a = document.createElement("a");
    a.href = url; a.download = "kirillovec-" + Date.now() + ".jpg";
    a.textContent = "↓ Скачать";
    a.style.cssText = "padding:10px 16px;border:1px solid #57466f;border-radius:999px;background:#211a2d;color:#e6d8ff;font-size:12px;font-weight:700";
    actions.append(a);
    stage.append(media, actions);
  }

  async function fileAsDataUrl(file){
    let bitmap;
    try {
      try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch { bitmap = await createImageBitmap(file); }
      const maxSide = 512;
      const scale = Math.min(1, maxSide / bitmap.width, maxSide / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res, rej) => canvas.toBlob(v => v ? res(v) : rej(new Error("compress")), "image/jpeg", 0.85));
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("read")); r.readAsDataURL(blob); });
    } finally { bitmap?.close?.(); }
  }

  async function api(path, options = {}){
    if (!apiBase) throw new Error("API не настроен");
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || (path === "/api/v1/jobs" && options.method === "POST" ? 150000 : 30000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiBase + path, { ...options, signal: controller.signal, mode: "cors", credentials: "include", headers: { ...(options.headers || {}) } });
      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("API вернул не JSON");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || ("Ошибка " + response.status));
      return data;
    } catch (err) {
      if (controller.signal.aborted) throw new Error(timeoutMs >= 120000 ? "Таймаут генерации. Попробуй без фото." : "API не ответил");
      if (err instanceof TypeError) throw new Error("Нет связи с API");
      throw err;
    } finally { clearTimeout(timeout); }
  }

  async function refreshCapabilities(){
    try {
      const data = await api("/api/v1/capabilities", { cache: "no-store", timeoutMs: 25000 });
      capabilities = data;
      if ($("#integration-hint")) $("#integration-hint").textContent = "API: изображения " + (data.image?.enabled ? "ок" : "нет") + " · аудио = Suno helper";
      updateAvailability();
    } catch (e) {
      capabilities = null;
      if ($("#integration-hint")) $("#integration-hint").textContent = "API: " + e.message;
      updateAvailability();
    }
  }

  if ($("#generate")) $("#generate").addEventListener("click", async () => {
    if (mode !== "image") return;
    const text = (prompt?.value || "").trim();
    if (!text) { toast("Опиши, что создать"); return; }
    if (!capabilities?.image?.enabled) { toast("Модель не подключена"); return; }
    const btn = $("#generate");
    btn.disabled = true;
    setStatus("Генерация…");
    setNotice("Отправляем…");
    try {
      const body = { mode: "image", prompt: text };
      if (selectedFile) body.imageDataUrl = await fileAsDataUrl(selectedFile);
      const job = await api("/api/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), timeoutMs: 150000 });
      const item = { id: job.id, prompt: text, status: job.status || "queued", ts: Date.now() };
      if (job.resultUrl) {
        item.status = "succeeded"; item.resultUrl = job.resultUrl; saveHistory(item);
        showResult(job.resultUrl); setStatus("Готово"); setNotice("Готово.");
      } else { saveHistory(item); setNotice("В очереди…"); }
    } catch (e) {
      setStatus("Ошибка"); setNotice(e.message, "error"); toast(e.message);
    } finally { updateAvailability(); }
  });

  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");
    if (Array.isArray(saved)) localHistory = saved.filter(x => x && typeof x.prompt === "string").slice(-20);
  } catch {}

  async function syncAccount(){
    const chip = $("#account-chip");
    if (!apiBase) return;
    try {
      const me = await api("/api/v1/auth/me", { timeoutMs: 12000 });
      if (chip) chip.textContent = me.user ? me.user.email : "Войти";
      if (!me.user) return;
      const data = await api("/api/v1/jobs", { timeoutMs: 20000 });
      const remote = (data.jobs || []).map(job => ({
        id: job.id,
        prompt: job.prompt || "",
        status: job.status || "",
        resultUrl: job.result_url || "",
        ts: Date.parse(job.created_at) || Date.now()
      })).filter(x => x.prompt);
      const byId = new Map(localHistory.filter(x => x.id).map(x => [x.id, x]));
      remote.forEach(item => byId.set(item.id, { ...(byId.get(item.id) || {}), ...item }));
      const onlyLocal = localHistory.filter(x => !x.id);
      localHistory = [...onlyLocal, ...byId.values()].sort((a,b) => (a.ts||0)-(b.ts||0)).slice(-20);
      renderHistory();
    } catch {}
  }

  renderHistory();
  setMode("image");
  syncAccount();
  try {
    const params = new URLSearchParams(location.search);
    const preset = params.get("preset");
    if (preset && examples[preset] && prompt) {
      prompt.value = examples[preset];
      if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000";
    }
    if (params.get("tab") === "audio") setMode("audio");
  } catch {}
  refreshCapabilities();
})();
