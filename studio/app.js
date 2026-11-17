(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const prompt = $("#prompt"), config = window.AI_STUDIO_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const historyKey = "kirillovec-ai-studio-history-v2";
  let mode = "image", selectedFile = null, localHistory = [], currentJob = null, pollTimer = null, capabilities = null;
  const labels = {starting:"Запускается",starting_up:"Запускается",processing:"Выполняется",queued:"В очереди",succeeded:"Готово",failed:"Ошибка",canceled:"Отменено"};
  function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.style.display="block";clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display="none",4500);}
  function setStatus(text){const el=$("#result-status");if(el)el.textContent=text;}
  function setNotice(text,kind){const el=$("#notice");if(!el)return;el.textContent=text;el.style.display="block";el.style.borderColor=kind==="error"?"#754044":"#55432d";}
  function updateAvailability(){
    const enabled = mode === "video" || Boolean(capabilities?.image?.enabled);
    const btn = $("#generate");
    if (!btn) return;
    btn.disabled = !enabled;
    btn.textContent = mode === "video" ? "▶　Скопировать промпт для видео" : (enabled ? "✦　Создать изображение" : "Модель не подключена");
    const hint = $("#model-hint");
    if (hint) hint.textContent = mode === "video" ? "Видео: скопируй промпт и загрузи исходник на внешней площадке." : (enabled ? "Модель доступна." : "Модель изображений не подключена.");
    const vp = $("#video-providers");
    if (vp) vp.style.display = mode === "video" ? "block" : "none";
  }
  function setMode(next){
    mode = next === "video" ? "video" : "image";
    document.querySelectorAll("[data-mode]").forEach(b => { const active = b.dataset.mode === mode; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); });
    if ($("#mode-caption")) $("#mode-caption").textContent = mode === "video" ? "Фото → видео · внешний сервис" : "Текст → изображение";
    if ($("#crumb-title")) $("#crumb-title").textContent = mode === "video" ? "Видео" : "Изображения";
    if ($("#page-title")) $("#page-title").textContent = mode === "video" ? "Оживи исходное фото" : "Преврати идею в визуал";
    if ($("#page-subtitle")) $("#page-subtitle").textContent = mode === "video" ? "Опиши движение и сцену. Скопируй промпт и передай фото выбранному видеосервису." : "Создавай изображения по описанию или редактируй исходный кадр.";
    if ($("#file-input")) $("#file-input").accept = "image/png,image/jpeg,image/webp";
    updateAvailability();
  }
  const examples = {
    music: "Square album cover, 1:1. Night view from a high-rise window in a Russian city, cold distant lights, thin cigarette smoke in a beam of light, dark minimal interior silhouette, deep shadows, muted blue-grey palette, photorealistic, film grain, no people faces, no hearts, no cliché symbols. Leave clean dark negative space in the lower third for bold typography \"kirillovec\". High detail, album cover composition, editorial music artwork.",
    cover: "Square album cover for the project «НИЗКО». Dark minimalism: open window at night, city lights blurred outside, soft smoke drifting indoors, cold side light, almost black shadows, restrained colour, photorealistic still. Large bold title space for \"НИЗКО\" and small signature \"kirillovec\". No faces, no decorative clichés, no cartoon style. Square 1:1, high detail, serious rap album artwork.",
    smoke: "Album-ready frame: cigarette smoke in a sharp ray of light from a night window, dark room, city glow beyond the glass, cold cyan-grey tones, heavy atmosphere of solitude, film grain, photorealistic, cinematic still. Square composition with empty dark area for typography. Mood of late night and emptiness. No text in the image, no logos, no faces.",
    cinematic: "Cinematic night still for a rap album cover: wet asphalt reflecting neon, smoke in a light beam, deep contrast, teal and amber accents, 35mm film look, high detail, square 1:1 framing, strong negative space for title. Urban, cold, no people in focus, no hearts or glitter. Photorealistic album artwork mood.",
    portrait: "Editorial half-portrait for album artwork: man in dim room light from a window, soft smoke, city bokeh outside, 85mm f/1.8 look, natural skin, serious expression, dark clothing, muted colours. Square crop friendly, space near edges for typography. Photorealistic, no heavy retouch, no cliché poses.",
    window: "Square album cover: close view of a night apartment window, condensation and soft reflections, distant tower blocks, one thin trail of smoke, cold blue light, almost monochrome, photorealistic, film grain. Minimal, quiet, heavy mood. Leave lower area dark and empty for the name \"kirillovec\".",
    low: "Square cover concept «НИЗКО»: looking down from a balcony at night, sparse street lights far below, fog or smoke in the air, deep black sky, cold desaturated colours, photorealistic, cinematic. Feeling of being low and detached. Bold negative space for the word НИЗКО. No people, no symbols, album cover composition."
  };
  document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => {
    prompt.value = examples[b.dataset.prompt] || prompt.value;
    if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000";
    prompt.focus();
  }));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(n => n.classList.toggle("active", n === b));
    const v = b.dataset.view;
    if (v === "image" || v === "create") { setMode("image"); prompt.focus(); }
    if (v === "history") $("#history-list")?.scrollIntoView({behavior:"smooth", block:"center"});
  }));
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    const tool = b.dataset.tool;
    const map = {
      animate: "Edit the uploaded image: add a subtle sense of motion in the frame, keep face and proportions, cinematic night light, photorealistic.",
      edit: "Edit the uploaded image, keep composition. Change: ",
      face: "Process the image, keep natural proportions and realistic lighting. Goal: ",
      cover: examples.cover
    };
    const text = map[tool];
    if (!text) return;
    setMode("image");
    prompt.value = text;
    if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000";
    prompt.focus();
  }));
  prompt.addEventListener("input", () => { if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000"; });
  function attachFile(file){
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { toast("Поддерживаются JPG, PNG и WEBP. HEIC сначала преобразуй в JPG."); if ($("#file-input")) $("#file-input").value = ""; return; }
    if (file.size > 4*1024*1024) { toast("Максимальный размер файла — 4 МБ."); if ($("#file-input")) $("#file-input").value = ""; return; }
    selectedFile = file;
    const old = $("#file-thumb");
    if (old?.dataset.url) URL.revokeObjectURL(old.dataset.url);
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.id = "file-thumb"; img.alt = "Предпросмотр"; img.src = url; img.dataset.url = url;
    old?.replaceWith(img);
    if ($("#file-name")) $("#file-name").textContent = file.name;
    if ($("#file-size")) $("#file-size").textContent = (file.size/1048576).toFixed(2) + " МБ · будет уменьшено до 512px (лимит модели)";
    if ($("#file-preview")) $("#file-preview").style.display = "flex";
    toast("Исходник прикреплён");
  }
  if ($("#file-input")) $("#file-input").addEventListener("change", e => attachFile(e.target.files?.[0]));
  const upload = document.querySelector(".upload");
  if (upload) {
    ["dragenter","dragover"].forEach(ev => upload.addEventListener(ev, e => { e.preventDefault(); upload.style.borderColor = "var(--accent)"; }));
    ["dragleave","drop"].forEach(ev => upload.addEventListener(ev, e => { e.preventDefault(); upload.style.borderColor = ""; }));
    upload.addEventListener("drop", e => attachFile(e.dataTransfer.files?.[0]));
    upload.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file-input")?.click(); } });
  }
  const removeBtn = $("#remove-file");
  if (removeBtn) removeBtn.addEventListener("click", () => {
    selectedFile = null;
    if ($("#file-input")) $("#file-input").value = "";
    const img = $("#file-thumb");
    if (img?.dataset.url) URL.revokeObjectURL(img.dataset.url);
    if ($("#file-preview")) $("#file-preview").style.display = "none";
  });
  function saveHistory(item){
    const existing = localHistory.findIndex(entry => entry.id && entry.id === item.id);
    if (existing >= 0) localHistory[existing] = item; else localHistory.push(item);
    localHistory = localHistory.slice(-20);
    const persisted = localHistory.map(entry => ({...entry}));
    let imageBudget = 2 * 1024 * 1024;
    for (let i = persisted.length - 1; i >= 0; i--) {
      const url = persisted[i].resultUrl;
      if (!url) continue;
      if (url.length <= imageBudget) imageBudget -= url.length; else delete persisted[i].resultUrl;
    }
    try { localStorage.setItem(historyKey, JSON.stringify(persisted)); }
    catch { try { localStorage.setItem(historyKey, JSON.stringify(persisted.map(({resultUrl, ...entry}) => entry))); } catch {} }
    renderHistory();
  }
  function renderHistory(){
    const list = $("#history-list");
    if (!list) return;
    list.replaceChildren();
    if (!localHistory.length) {
      list.innerHTML = '<div class="history-empty">История появится после запуска задач</div>';
      if ($("#history-count")) $("#history-count").textContent = "0 задач";
      return;
    }
    localHistory.slice().reverse().forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item";
      const thumb = document.createElement("div");
      thumb.className = "history-thumb";
      if (item.resultUrl) {
        const preview = document.createElement("img");
        preview.src = item.resultUrl; preview.alt = ""; preview.loading = "lazy";
        preview.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:8px";
        thumb.append(preview);
      } else thumb.textContent = "▧";
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = (item.prompt || "Задача").slice(0, 65);
      const meta = document.createElement("span");
      meta.textContent = (labels[item.status] || item.status || "Подготовлено") + " · " + new Date(item.ts).toLocaleString("ru-RU");
      detail.append(title, meta);
      row.append(thumb, detail);
      row.addEventListener("click", () => {
        prompt.value = item.prompt || "";
        setMode("image");
        if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000";
        if (item.resultUrl) showResult(item.resultUrl);
      });
      list.append(row);
    });
    if ($("#history-count")) $("#history-count").textContent = localHistory.length + " задач";
  }
  function showResult(url){
    const stage = $("#result-stage");
    if (!stage) return;
    stage.replaceChildren();
    const media = document.createElement("img");
    media.src = url; media.alt = "Результат генерации"; media.loading = "eager";
    const mime = (String(url).match(/^data:(image\/[a-z0-9.+-]+)/i) || [])[1] || "image/png";
    const ext = mime.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
    const actions = document.createElement("div");
    actions.className = "result-actions";
    const download = document.createElement("a");
    download.href = url;
    download.download = "kirillovec-ai-studio-" + new Date().toISOString().slice(0, 10) + "." + ext;
    download.textContent = "↓ Скачать изображение";
    actions.append(download);
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
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Не удалось подготовить изображение.");
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(v => v ? resolve(v) : reject(new Error("Не удалось сжать изображение.")), "image/jpeg", 0.85);
      });
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(error?.message || "Не удалось подготовить фото. Попробуй JPG (не HEIC).");
    } finally { bitmap?.close?.(); }
  }
  async function api(path, options = {}){
    if (!apiBase) throw new Error("API сайта не настроен.");
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || (path === "/api/v1/jobs" && options.method === "POST" ? 150000 : 30000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const { timeoutMs: _t, signal: externalSignal, ...fetchOptions } = options;
    if (externalSignal) externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const response = await fetch(apiBase + path, {
        ...fetchOptions, signal: controller.signal, mode: "cors",
        credentials: "include", headers: { ...(options.headers || {}) }
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        if (response.redirected || /cloudflareaccess|cdn-cgi\/access/i.test(response.url)) throw new Error("Cloudflare Access: авторизуйся на https://api.kirillovec.ru");
        throw new Error("API вернул не JSON.");
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || ("Ошибка API: " + response.status));
      return data;
    } catch (err) {
      if (controller.signal.aborted || err?.name === "AbortError" || err?.name === "TimeoutError") {
        throw new Error(timeoutMs >= 120000 ? "Генерация заняла слишком много времени. Попробуй без исходного фото или меньший JPG." : "API не ответил вовремя.");
      }
      if (err instanceof TypeError) throw new Error("Не удалось связаться с API.");
      throw err;
    } finally { clearTimeout(timeout); }
  }
  async function refreshCapabilities(){
    try {
      const data = await api("/api/v1/capabilities", { cache: "no-store", timeoutMs: 25000 });
      capabilities = data;
      const image = data.image?.enabled;
      if ($("#integration-hint")) $("#integration-hint").textContent = "API доступен. Изображения: " + (image ? "подключено" : "не подключено") + ".";
      updateAvailability();
      return data;
    } catch (e) {
      capabilities = null;
      if ($("#integration-hint")) $("#integration-hint").textContent = "API пока недоступен: " + e.message;
      updateAvailability();
      if ($("#model-hint")) $("#model-hint").textContent = e.message;
      return null;
    }
  }
  async function pollJob(jobId){
    clearInterval(pollTimer);
    let attempts = 0;
    const check = async () => {
      try {
        const data = await api("/api/v1/jobs/" + encodeURIComponent(jobId));
        setStatus(labels[data.status] || data.status || "Выполняется");
        if (data.resultUrl) {
          clearInterval(pollTimer);
          showResult(data.resultUrl);
          setStatus("Готово");
          setNotice("Генерация завершена.");
          const item = localHistory.find(x => x.id === jobId);
          if (item) { item.status = "succeeded"; item.resultUrl = data.resultUrl; saveHistory(item); }
          return;
        }
        if (["failed","canceled"].includes(data.status)) {
          clearInterval(pollTimer);
          setNotice(data.error || "Ошибка задачи.", "error");
          return;
        }
        if (++attempts > 180) { clearInterval(pollTimer); setNotice("Ожидание остановлено по тайм-ауту.", "error"); }
      } catch (e) { clearInterval(pollTimer); setNotice(e.message, "error"); }
    };
    await check();
    pollTimer = setInterval(check, Math.max(4000, Number(config.pollIntervalMs) || 5000));
  }
  if ($("#model-source")) $("#model-source").addEventListener("change", updateAvailability);
  $("#generate").addEventListener("click", async () => {
    const text = prompt.value.trim();
    if (mode === "video") {
      if (!text) { toast("Сначала опиши движение и сцену."); prompt.focus(); return; }
      try { await navigator.clipboard.writeText(text); toast("Промпт скопирован."); setNotice("Промпт скопирован. Вставь его на внешней площадке."); }
      catch { toast("Не удалось скопировать."); }
      return;
    }
    if (!text) { toast("Сначала опиши, что хочешь создать."); prompt.focus(); return; }
    if (!capabilities?.image?.enabled) { toast("Модель изображений не подключена."); return; }
    const btn = $("#generate");
    btn.disabled = true;
    setStatus("Запускается");
    setNotice("Отправляем задание…");
    try {
      const body = { mode: "image", prompt: text };
      if (selectedFile) {
        setStatus("Подготовка фото…");
        body.imageDataUrl = await fileAsDataUrl(selectedFile);
      }
      setStatus("Генерация…");
      const job = await api("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 150000
      });
      const item = { id: job.id, prompt: text, status: job.status || "queued", ts: Date.now() };
      if (job.resultUrl) {
        item.status = "succeeded"; item.resultUrl = job.resultUrl; saveHistory(item);
        showResult(job.resultUrl); setStatus("Готово"); setNotice("Генерация завершена.");
      } else {
        saveHistory(item); setStatus(labels[job.status] || "В очереди"); setNotice("Задание принято. Ожидаем результат…"); pollJob(job.id);
      }
    } catch (e) {
      setStatus("Не запущено"); setNotice(e.message, "error"); toast(e.message);
    } finally { updateAvailability(); }
  });
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");
    if (Array.isArray(saved)) localHistory = saved.filter(x => x && typeof x.prompt === "string").slice(-20);
  } catch {}
  renderHistory();
  setMode("image");
  try {
    const params = new URLSearchParams(location.search);
    const preset = params.get("preset");
    if (preset && examples[preset]) {
      prompt.value = examples[preset];
      if ($("#prompt-count")) $("#prompt-count").textContent = prompt.value.length + " / 2000";
      if (history.replaceState) history.replaceState(null, "", "/studio/");
    }
  } catch {}
  refreshCapabilities();
})();
