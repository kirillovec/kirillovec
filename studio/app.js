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
    btn.disabled = !enabled;
    btn.textContent = mode === "video" ? "▶　Скопировать промпт для видео" : (enabled ? "✦　Создать изображение" : "Модель не подключена");
    $("#model-hint").textContent = mode === "video" ? "Видео готовится через внешнюю площадку: скопируй промпт и загрузи исходник там вручную." : (enabled ? "Модель доступна. Задание будет выполнено через API сайта." : "Для генерации изображений ещё не подключена модель.");
    $("#video-providers").style.display = mode === "video" ? "block" : "none";
  }
  function setMode(next){
    mode = next === "video" ? "video" : "image";
    document.querySelectorAll("[data-mode]").forEach(b => { const active = b.dataset.mode === mode; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); });
    $("#mode-caption").textContent = mode === "video" ? "Фото → видео · внешний сервис" : "Текст → изображение";
    $("#crumb-title").textContent = mode === "video" ? "Видео" : "Изображения";
    $("#page-title").textContent = mode === "video" ? "Оживи исходное фото" : "Преврати идею в визуал";
    $("#page-subtitle").textContent = mode === "video" ? "Опиши движение и сцену. Скопируй промпт и передай фото выбранному видеосервису." : "Создавай изображения по описанию или редактируй исходный кадр.";
    if ($("#file-input")) $("#file-input").accept = "image/png,image/jpeg,image/webp";
    updateAvailability();
  }
  const examples = {
    cinematic: "Кинематографичный ночной кадр: мокрый асфальт, холодный неоновый свет, дым в луче, глубокие тени, плёночная цветокоррекция, высокая детализация, реалистичная фактура, cinematic still, 35mm.",
    portrait: "Реалистичный портрет мужчины в полумраке, мягкий боковой свет из окна, лёгкий сигаретный дым, городской фон в боке, объектив 85mm f/1.8, editorial photography, естественная кожа, без ретуши.",
    music: "Обложка рэп-трека: окно московской многоэтажки ночью, холодные городские огни, тонкий дым, тёмный минимализм, реалистичная фотография, без клише и сердечек, крупная типографика kirillovec, album cover composition.",
    smoke: "Атмосфера дыма и ночи: сигаретный дым в луче света из окна, тёмный интерьер, городские огни за стеклом, холодные сине-серые тона, кинематографичный реализм, film grain, mood of solitude.",
    cover: "Обложка альбома «НИЗКО»: тёмный минимализм, окно в ночной город, дым, холодный свет, реалистичная фотография, крупная типографика НИЗКО / kirillovec, square album cover, high detail."
  };
  document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => {
    prompt.value = examples[b.dataset.prompt] || prompt.value;
    $("#prompt-count").textContent = prompt.value.length + " / 2000";
    prompt.focus();
  }));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(n => n.classList.toggle("active", n === b));
    const v = b.dataset.view;
    if (v === "image" || v === "create") { setMode("image"); prompt.focus(); }
    if (v === "history") $("#history-list").scrollIntoView({behavior:"smooth", block:"center"});
  }));
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    const tool = b.dataset.tool;
    const map = {
      animate: "Отредактируй загруженное изображение: добавь естественное ощущение движения в кадре, сохрани внешность и пропорции, кинематографичный свет.",
      edit: "Отредактируй загруженное изображение, сохранив композицию. Измени: ",
      face: "Обработай изображение с сохранением естественных пропорций и реалистичного освещения. Цель: ",
      cover: examples.cover
    };
    const text = map[tool];
    if (!text) return;
    setMode("image");
    prompt.value = text;
    $("#prompt-count").textContent = prompt.value.length + " / 2000";
    prompt.focus();
  }));
  prompt.addEventListener("input", () => $("#prompt-count").textContent = prompt.value.length + " / 2000");
  function attachFile(file){
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { toast("Поддерживаются JPG, PNG и WEBP. HEIC сначала преобразуй в JPG."); $("#file-input").value = ""; return; }
    if (file.size > 4*1024*1024) { toast("Максимальный размер файла — 4 МБ. Уменьши изображение или сохрани его в WEBP."); $("#file-input").value = ""; return; }
    selectedFile = file;
    const old = $("#file-thumb");
    if (old?.dataset.url) URL.revokeObjectURL(old.dataset.url);
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.id = "file-thumb"; img.alt = "Предпросмотр"; img.src = url; img.dataset.url = url;
    old?.replaceWith(img);
    $("#file-name").textContent = file.name;
    $("#file-size").textContent = (file.size/1048576).toFixed(2) + " МБ · перед отправкой будет перекодировано в JPG";
    $("#file-preview").style.display = "flex";
    toast("Исходник прикреплён");
  }
  $("#file-input").addEventListener("change", e => attachFile(e.target.files?.[0]));
  const upload = document.querySelector(".upload");
  ["dragenter","dragover"].forEach(ev => upload.addEventListener(ev, e => { e.preventDefault(); upload.style.borderColor = "var(--accent)"; }));
  ["dragleave","drop"].forEach(ev => upload.addEventListener(ev, e => { e.preventDefault(); upload.style.borderColor = ""; }));
  upload.addEventListener("drop", e => attachFile(e.dataTransfer.files?.[0]));
  upload.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file-input").click(); } });
  $("#remove-file").addEventListener("click", () => {
    selectedFile = null;
    $("#file-input").value = "";
    const img = $("#file-thumb");
    if (img?.dataset.url) URL.revokeObjectURL(img.dataset.url);
    $("#file-preview").style.display = "none";
  });
  function saveHistory(item){
    const existing = localHistory.findIndex(entry => entry.id && entry.id === item.id);
    if (existing >= 0) localHistory[existing] = item;
    else localHistory.push(item);
    localHistory = localHistory.slice(-20);
    const persisted = localHistory.map(entry => ({...entry}));
    let imageBudget = 2 * 1024 * 1024;
    for (let i = persisted.length - 1; i >= 0; i--) {
      const url = persisted[i].resultUrl;
      if (!url) continue;
      if (url.length <= imageBudget) imageBudget -= url.length;
      else delete persisted[i].resultUrl;
    }
    try {
      localStorage.setItem(historyKey, JSON.stringify(persisted));
    } catch {
      try {
        localStorage.setItem(historyKey, JSON.stringify(persisted.map(({resultUrl, ...entry}) => entry)));
      } catch {}
    }
    renderHistory();
  }
  function renderHistory(){
    const list = $("#history-list");
    list.replaceChildren();
    if (!localHistory.length) {
      list.innerHTML = '<div class="history-empty">История появится после запуска задач</div>';
      $("#history-count").textContent = "0 задач";
      return;
    }
    localHistory.slice().reverse().forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item";
      const thumb = document.createElement("div");
      thumb.className = "history-thumb";
      if (item.resultUrl) {
        const preview = document.createElement("img");
        preview.src = item.resultUrl;
        preview.alt = "";
        preview.loading = "lazy";
        preview.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:8px";
        thumb.append(preview);
      } else {
        thumb.textContent = "▧";
      }
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
        $("#prompt-count").textContent = prompt.value.length + " / 2000";
        if (item.resultUrl) showResult(item.resultUrl);
      });
      list.append(row);
    });
    $("#history-count").textContent = localHistory.length + " задач";
  }
  function showResult(url){
    const stage = $("#result-stage");
    stage.replaceChildren();
    const media = document.createElement("img");
    media.src = url;
    media.alt = "Результат генерации";
    media.loading = "eager";
    const mime = (String(url).match(/^data:(image\/[a-z0-9.+-]+)/i) || [])[1] || "image/png";
    const ext = mime.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
    const actions = document.createElement("div");
    actions.className = "result-actions";
    const download = document.createElement("a");
    download.href = url;
    download.download = "kirillovec-ai-studio-" + new Date().toISOString().slice(0, 10) + "." + ext;
    download.textContent = "↓ Скачать изображение";
    download.setAttribute("aria-label", "Скачать созданное изображение");
    actions.append(download);
    stage.append(media, actions);
  }
  async function fileAsDataUrl(file){
    // Always re-encode to JPEG so Workers AI / Flux can decode reliably.
    // WebP and some progressive JPEGs fail with "source image could not be decoded".
    let bitmap;
    try {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      const maxSide = 1024;
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
        canvas.toBlob(
          value => value ? resolve(value) : reject(new Error("Не удалось сжать исходное изображение.")),
          "image/jpeg",
          0.9
        );
      });
      if (blob.size > 3.5 * 1024 * 1024) {
        const blob2 = await new Promise((resolve, reject) => {
          canvas.toBlob(
            value => value ? resolve(value) : reject(new Error("Не удалось сжать исходное изображение.")),
            "image/jpeg",
            0.72
          );
        });
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Не удалось прочитать подготовленное изображение."));
          reader.readAsDataURL(blob2);
        });
      }
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Не удалось прочитать подготовленное изображение."));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(error?.message || "Не удалось подготовить фото. Попробуй JPG или PNG (не HEIC).");
    } finally {
      bitmap?.close?.();
    }
  }
  async function api(path, options = {}){
    if (!apiBase) throw new Error("API сайта не настроен.");
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || (path === "/api/v1/jobs" && options.method === "POST" ? 120000 : 30000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const { timeoutMs: _timeoutMs, signal: externalSignal, ...fetchOptions } = options;
    if (externalSignal) externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const response = await fetch(apiBase + path, {
        ...fetchOptions, signal: controller.signal, mode: "cors",
        credentials: "include", headers: { ...(options.headers || {}) }
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        if (response.redirected || /cloudflareaccess|cdn-cgi\/access/i.test(response.url)) {
          throw new Error("Cloudflare Access перенаправил запрос на страницу входа. Сначала авторизуйся на https://api.kirillovec.ru, затем обнови AI Studio.");
        }
        throw new Error("API вернул не JSON. Проверь адрес сервера и настройки Cloudflare Access.");
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || ("Ошибка API: " + response.status));
      return data;
    } catch (err) {
      if (controller.signal.aborted || err?.name === "AbortError" || err?.name === "TimeoutError") {
        throw new Error(timeoutMs >= 120000 ? "Сервер не завершил генерацию за 2 минуты. Проверь лимит Workers AI и попробуй ещё раз." : "API не ответил вовремя. Проверь соединение и авторизацию Cloudflare Access.");
      }
      if (err instanceof TypeError) throw new Error("Не удалось связаться с API (" + apiBase + "). Проверь CORS, Cloudflare Access и доступность сервера.");
      throw err;
    } finally { clearTimeout(timeout); }
  }
  async function refreshCapabilities(){
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      let data;
      try {
        data = await api("/api/v1/capabilities", {
          signal: controller.signal,
          cache: "no-store"
        });
      } finally {
        clearTimeout(timeout);
      }
      capabilities = data;
      const image = data.image?.enabled;
      $("#integration-hint").textContent = "API доступен. Изображения: " + (image ? "подключено" : "не подключено") + ".";
      updateAvailability();
      return data;
    } catch (e) {
      capabilities = null;
      $("#integration-hint").textContent = "API пока недоступен: " + e.message;
      updateAvailability();
      $("#model-hint").textContent = e.message;
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
          setNotice("Генерация завершена. Результат получен через API сайта.");
          const item = localHistory.find(x => x.id === jobId);
          if (item) { item.status = "succeeded"; item.resultUrl = data.resultUrl; saveHistory(item); }
          return;
        }
        if (["failed","canceled"].includes(data.status)) {
          clearInterval(pollTimer);
          setNotice(data.error || "Провайдер завершил задачу с ошибкой.", "error");
          return;
        }
        if (++attempts > 180) {
          clearInterval(pollTimer);
          setNotice("Ожидание остановлено по тайм-ауту. Задача могла продолжить работу на сервере.", "error");
        }
      } catch (e) {
        clearInterval(pollTimer);
        setNotice(e.message, "error");
      }
    };
    await check();
    pollTimer = setInterval(check, Math.max(4000, Number(config.pollIntervalMs) || 5000));
  }
  $("#model-source").addEventListener("change", updateAvailability);
  $("#generate").addEventListener("click", async () => {
    const text = prompt.value.trim();
    if (mode === "video") {
      if (!text) { toast("Сначала опиши движение и сцену."); prompt.focus(); return; }
      try {
        await navigator.clipboard.writeText(text);
        toast("Промпт скопирован. Загрузи исходник на выбранной площадке.");
        setNotice("Промпт скопирован в буфер. Открой внешний сервис и вставь описание там.");
      } catch {
        toast("Не удалось скопировать. Выдели текст вручную.");
      }
      return;
    }
    if (!text) { toast("Сначала опиши, что хочешь создать."); prompt.focus(); return; }
    if (!capabilities?.image?.enabled) { toast("Модель изображений не подключена."); return; }
    const btn = $("#generate");
    btn.disabled = true;
    setStatus("Запускается");
    setNotice("Отправляем задание в API…");
    try {
      const body = {
        mode: "image",
        prompt: text,
        aspectRatio: ($("#ratio") && $("#ratio").value === "auto") ? "1:1" : (($("#ratio") && $("#ratio").value) || "1:1"),
        modelSource: ($("#model-source") && $("#model-source").value) || "api"
      };
      if (selectedFile) {
        setStatus("Подготовка фото…");
        body.imageDataUrl = await fileAsDataUrl(selectedFile);
      }
      setStatus("Отправка в генератор…");
      const job = await api("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 120000
      });
      const item = { id: job.id, prompt: text, status: job.status || "queued", ts: Date.now() };
      if (job.resultUrl) {
        item.status = "succeeded";
        item.resultUrl = job.resultUrl;
        saveHistory(item);
        showResult(job.resultUrl);
        setStatus("Готово");
        setNotice("Генерация завершена.");
      } else {
        saveHistory(item);
        setStatus(labels[job.status] || "В очереди");
        setNotice("Задание принято. Ожидаем результат…");
        pollJob(job.id);
      }
    } catch (e) {
      setStatus("Не запущено");
      setNotice(e.message, "error");
      toast(e.message);
    } finally {
      updateAvailability();
    }
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
      $("#prompt-count").textContent = prompt.value.length + " / 2000";
      if (history.replaceState) history.replaceState(null, "", "/studio/");
    }
  } catch {}
  refreshCapabilities();
})();
