(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const promptEl = $("#prompt"), config = window.AI_STUDIO_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const historyKey = "kirillovec-ai-studio-history-v2";
  let mode = "image", selectedFile = null, previewUrl = null, history = [];

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), 3200);
  }

  function setMode(m) {
    mode = ["image", "audio", "video", "text"].includes(m) ? m : "image";
    ["image", "audio", "video", "text"].forEach((name) => document.body.classList.toggle("mode-" + name, name === mode));
    document.querySelectorAll("[data-mode]").forEach((b) => {
      const on = b.getAttribute("data-mode") === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const labels = { image: "Генерация и редактирование изображений", audio: "Музыка и промпты для Suno", video: "Видео-конструктор", text: "Текстовая мастерская" };
    const caption = $("#mode-caption");
    if (caption) caption.textContent = labels[mode];
    const crumb = $("#crumb-title");
    if (crumb) crumb.textContent = ({ image: "Изображения", audio: "Аудио", video: "Видео", text: "Тексты" })[mode];
    const gen = $("#generate");
    if (gen) gen.textContent = mode === "audio" ? "✦ Создать трек" : "✦ Создать изображение";
    try { window.history.replaceState(null, "", "?mode=" + mode); } catch (_) {}
  }

  const PRESETS = {
    music: "Square album cover, Russian underground rap aesthetic, night city lights through window, cigarette smoke, dark minimalism, moody lighting, cinematic, high detail",
    cover: "Album cover \"НИЗКО\", dark minimal window overlooking night city, typography, smoke atmosphere, cold blue and amber tones, Russian rap album art",
    smoke: "Cinematic still, cigarette smoke in cold light from window, night city bokeh, lonely atmosphere, film grain, dark mood",
    window: "Looking out of a rainy apartment window at night, city lights blurred, condensation on glass, melancholic mood, cinematic photography",
    low: "Low angle shot, dark room, window with night city view, silhouette, smoke rising, album cover composition for \"НИЗКО\"",
    cinematic: "Cinematic frame for music video, night street, neon reflections, rain, moody color grade, 35mm film look",
    portrait: "Atmospheric portrait of a young man, night city background, soft rim light, smoke, introspective expression, cinematic photography",
    restore: "Carefully restore the uploaded old photograph. Preserve the exact identity, facial features, age, expression, clothing, pose and original composition. Repair scratches, dust, fading and visible damage; recover natural detail and balanced contrast. Keep the result photorealistic and historically faithful. Do not beautify, redesign, add objects or change the person.",
    product: "Create a premium commercial product photograph of the uploaded subject. Preserve the exact product identity, shape, proportions, labels, text and material details. Use a clean studio background, controlled softbox lighting, realistic shadows, precise focus and professional e-commerce art direction. Do not invent logos or alter packaging.",
    character: "Use the uploaded image as the identity reference. Preserve the same person or character, recognizable facial structure, hairstyle, age, skin details and defining features. Create a new cinematic composition while keeping identity consistent. Do not change facial proportions or substitute another person."
  };

  $("#copy-image-prompt")?.addEventListener("click", async () => {
    const value = promptEl?.value.trim() || "";
    if (!value) { toast("Сначала напиши промпт"); return; }
    try { await navigator.clipboard.writeText(value); toast("Промпт скопирован"); }
    catch (_) { toast("Не удалось скопировать промпт"); }
  });
  $("#download-image-prompt")?.addEventListener("click", () => {
    const value = promptEl?.value.trim() || "";
    if (!value) { toast("Сначала напиши промпт"); return; }
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kirillovec-image-prompt-" + Date.now() + ".txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.querySelectorAll("[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-prompt");
      if (PRESETS[key] && promptEl) {
        promptEl.value = PRESETS[key];
        promptEl.dispatchEvent(new Event("input"));
      }
    });
  });

  if (promptEl) {
    promptEl.addEventListener("input", () => {
      const c = $("#prompt-count");
      if (c) c.textContent = promptEl.value.length + " / 2000";
    });
  }

  const fileInput = $("#file-input");
  const filePreview = $("#file-preview");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        toast("Поддерживаются только JPG, PNG и WEBP");
        fileInput.value = "";
        return;
      }
      if (f.size > 4 * 1024 * 1024) {
        toast("Файл больше 4 МБ");
        fileInput.value = "";
        return;
      }
      selectedFile = f;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(f);
      const img = $("#file-thumb");
      if (img) img.src = previewUrl;
      const name = $("#file-name");
      if (name) name.textContent = f.name;
      const size = $("#file-size");
      if (size) size.textContent = (f.size / 1024).toFixed(0) + " KB";
      if (filePreview) filePreview.style.display = "flex";
    });
  }
  const removeFile = $("#remove-file");
  if (removeFile) {
    removeFile.addEventListener("click", () => {
      selectedFile = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      const thumb = $("#file-thumb");
      if (thumb) thumb.removeAttribute("src");
      if (fileInput) fileInput.value = "";
      if (filePreview) filePreview.style.display = "none";
    });
  }

  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => setMode(b.getAttribute("data-mode")));
  });

  document.querySelectorAll("[data-view]").forEach((b) => {
    b.addEventListener("click", () => {
      const title = $("#crumb-title");
      if (title) title.textContent = b.textContent.trim() || b.getAttribute("data-view");
      document.querySelectorAll("[data-view]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    });
  });

  const pillars = {};
  document.querySelectorAll("[data-pillar]").forEach((row) => {
    const name = row.getAttribute("data-pillar");
    pillars[name] = new Set();
    row.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("active");
        const v = chip.getAttribute("data-v");
        if (chip.classList.contains("active")) pillars[name].add(v);
        else pillars[name].delete(v);
        rebuildStyle();
      });
    });
  });

  function rebuildStyle() {
    const parts = [];
    Object.values(pillars).forEach((set) => set.forEach((v) => parts.push(v)));
    const out = $("#style-out");
    const count = $("#style-count");
    if (out) out.textContent = parts.length ? parts.join(", ") : "Выбери чипы выше — Style соберётся сам";
    if (count) count.textContent = parts.length;
  }

  const copyStyle = $("#copy-style");
  if (copyStyle) {
    copyStyle.addEventListener("click", async () => {
      const text = $("#style-out")?.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        toast("Style скопирован");
      } catch {
        toast("Не удалось скопировать");
      }
    });
  }

  document.querySelectorAll("[data-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.getAttribute("data-tag");
      const ta = $("#lyrics");
      if (!ta) return;
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const val = ta.value;
      ta.value = val.slice(0, start) + tag + "\n" + val.slice(end);
      ta.focus();
    });
  });

  const copyLyrics = $("#copy-lyrics");
  if (copyLyrics) {
    copyLyrics.addEventListener("click", async () => {
      const text = $("#lyrics")?.value || "";
      try {
        await navigator.clipboard.writeText(text);
        toast("Lyrics скопированы");
      } catch {
        toast("Не удалось скопировать");
      }
    });
  }

  const AUDIO_PRESETS = {
    nizko: {
      genre: ["southern hip hop", "lo-fi hip hop"],
      instruments: ["808 bass", "dark piano", "atmospheric pads", "vinyl crackle"],
      mood: ["nocturnal", "melancholic", "introspective"],
      vocal: ["male rap vocals", "raw spoken flow"],
      production: ["dark mix", "spacey reverb", "minimal arrangement"]
    },
    smoke: {
      genre: ["cloud rap", "lo-fi hip hop"],
      instruments: ["atmospheric pads", "dark piano", "sparse drums"],
      mood: ["nocturnal", "cold and distant", "heavy atmosphere"],
      vocal: ["male rap vocals", "melodic rap delivery"],
      production: ["dark mix", "cinematic atmosphere", "tape saturation"]
    },
    trap: {
      genre: ["trap rap"],
      instruments: ["808 bass", "trap hi-hats"],
      mood: ["aggressive", "heavy atmosphere"],
      vocal: ["male rap vocals", "autotuned vocals"],
      production: ["hard-hitting low end", "dark mix"]
    },
    melodic: {
      genre: ["melodic rap"],
      instruments: ["dark piano", "atmospheric pads", "guitar sample"],
      mood: ["melancholic", "nostalgic", "nocturnal"],
      vocal: ["melodic rap delivery", "emotional singing hooks", "double-tracked chorus"],
      production: ["spacey reverb", "cinematic atmosphere"]
    }
  };

  document.querySelectorAll("[data-audio-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-audio-preset");
      const p = AUDIO_PRESETS[key];
      if (!p) return;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      Object.keys(pillars).forEach((k) => pillars[k].clear());
      Object.entries(p).forEach(([pillar, values]) => {
        values.forEach((v) => {
          const chip = document.querySelector(`.chip[data-v="${v}"]`);
          if (chip) {
            chip.classList.add("active");
            if (pillars[pillar]) pillars[pillar].add(v);
          }
        });
      });
      rebuildStyle();
      toast("Пресет применён");
    });
  });

  function showResult(dataUrl, promptText) {
    const stage = $("#result-stage");
    const status = $("#result-status");
    if (!stage) return;
    stage.innerHTML = "";
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = promptText || "result";
    img.style.cssText = "max-width:100%;max-height:420px;border-radius:12px;display:block;margin:0 auto";
    stage.appendChild(img);
    if (status) status.textContent = "Готово";
    const download = document.createElement("a");
    download.href = dataUrl;
    download.download = "kirillovec-ai-studio-" + new Date().toISOString().slice(0, 10) + ".jpg";
    download.textContent = "Скачать изображение";
    download.style.cssText = "display:inline-block;margin-top:12px;padding:9px 13px;border:1px solid #493761;border-radius:10px;color:#d9c8ff;text-decoration:none;font-size:13px";
    stage.appendChild(download);
    history.unshift({ prompt: promptText, dataUrl, ts: Date.now() });
    history = history.slice(0, 4);
    try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch (_) {
      history = history.slice(0, 2);
      try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch (_) {}
    }
    renderHistory();
  }

  async function fileToDataUrl(file) {
    const bitmap = await createImageBitmap(file);
    // FLUX.2 Klein reference-image input must stay below 512x512.
    const maxEdge = 496;
    let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    let dataUrl = "";
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Не удалось обработать исходное фото");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        dataUrl = canvas.toDataURL("image/jpeg", attempt < 2 ? 0.9 : 0.82);
        if (dataUrl.length <= 4 * 1024 * 1024) break;
        scale *= 0.78;
      }
    } finally {
      bitmap.close();
    }
    if (!dataUrl || dataUrl.length > 4 * 1024 * 1024) throw new Error("Не удалось сжать фото до допустимого размера");
    return dataUrl;
  }

  async function pollMusic(taskId, statusEl) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const res = await fetch(apiBase + "/api/v1/music/status/" + encodeURIComponent(taskId), { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "status " + res.status);
      if (statusEl) statusEl.textContent = data.status === "pending" ? "Генерация... " + (i + 1) : data.status;
      if (data.status === "succeeded" && data.tracks && data.tracks.length) return data.tracks;
      if (data.status === "failed") throw new Error(data.errorMessage || "Генерация трека не удалась");
    }
    throw new Error("Таймаут ожидания трека");
  }

  function showMusicResult(tracks) {
    const stage = $("#result-stage");
    const status = $("#result-status");
    if (!stage) return;
    stage.innerHTML = "";
    tracks.forEach((t, idx) => {
      const box = document.createElement("div");
      box.style.cssText = "margin-bottom:12px";
      const title = document.createElement("div");
      title.style.cssText = "font-size:13px;margin-bottom:6px;color:#c7c3d1";
      title.textContent = (t.title || "Трек " + (idx + 1)) + (t.duration ? " · " + Math.round(t.duration) + "s" : "");
      box.appendChild(title);
      if (t.audioUrl || t.streamUrl) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = t.audioUrl || t.streamUrl;
        audio.style.cssText = "width:100%;margin-bottom:6px";
        box.appendChild(audio);
        const a = document.createElement("a");
        a.href = t.audioUrl || t.streamUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Скачать MP3";
        a.style.cssText = "font-size:12px;color:#c9a7ff";
        box.appendChild(a);
      }
      stage.appendChild(box);
    });
    if (status) status.textContent = "Готово";
  }

  const generateBtn = $("#generate");
  const audioGenerateBtn = $("#generate-audio-btn");
  if (audioGenerateBtn) audioGenerateBtn.addEventListener("click", async () => {
    setMode("audio");
    const style = $("#style-out")?.textContent || "";
    const lyrics = $("#lyrics")?.value || "";
    const title = $("#track-title")?.value || "";
    const weirdness = $("#suno-weirdness")?.value || "50";
    const influence = $("#suno-influence")?.value || "75";
    const packet = "TITLE: " + title + "\n\nSTYLE:\n" + style + "\n\nLYRICS:\n" + lyrics + "\n\nSUNO SETTINGS\nWeirdness: " + weirdness + "\nStyle Influence: " + influence;
    window.open("https://suno.com/create", "_blank", "noopener");
    try { await navigator.clipboard.writeText(packet); toast("Пакет скопирован. Вставь Style и Lyrics в Suno."); }
    catch (_) { toast("Suno открыт. Скопируй Style и Lyrics вручную."); }
  });
  if (generateBtn) {
    generateBtn.addEventListener("click", async () => {
      if (!apiBase) { toast("API не настроен"); return; }
      generateBtn.disabled = true;
      const status = $("#result-status");
      const stage = $("#result-stage");

      if (mode === "audio") {
        generateBtn.disabled = false;
        toast("Режим Suno работает без платного API: используй «Скопировать пакет и открыть Suno».");
        return;
      }

      const p = (promptEl && promptEl.value.trim()) || "";
      if (!p) { toast("Напиши промпт"); generateBtn.disabled = false; return; }
      if (status) status.textContent = "Генерация...";
      if (stage) stage.innerHTML = '<div class="empty"><h3>Генерация...</h3><p>FLUX · Workers AI</p></div>';
      try {
        const payload = { mode: "image", prompt: p };
        if (selectedFile) {
          if (status) status.textContent = "Подготовка фото...";
          payload.inputImage = await fileToDataUrl(selectedFile);
        }
        const res = await fetch(apiBase + "/api/v1/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.message || data.error || ("HTTP " + res.status);
          toast(msg);
          if (status) status.textContent = "Ошибка";
          if (stage) {
            const card = document.createElement("div");
            card.className = "empty";
            const heading = document.createElement("h3");
            heading.textContent = "Не удалось";
            const detail = document.createElement("p");
            detail.textContent = msg;
            card.append(heading, detail);
            stage.replaceChildren(card);
          }
          return;
        }
        const dataUrl = data.result && data.result.dataUrl;
        if (!dataUrl) { toast("Нет изображения"); if (status) status.textContent = "Ошибка"; return; }
        showResult(dataUrl, p);
        toast("Готово");
      } catch (e) {
        toast("Ошибка сети: " + (e.message || "unknown"));
        if (status) status.textContent = "Ошибка";
        if (stage) stage.innerHTML = '<div class="empty"><h3>Ошибка сети</h3></div>';
      } finally {
        generateBtn.disabled = false;
      }
    });
  }

  try { history = JSON.parse(localStorage.getItem(historyKey) || "[]"); } catch { history = []; }
  function renderHistory() {
    const list = $("#history-list");
    const count = $("#history-count");
    if (count) count.textContent = history.length;
    if (!list) return;
    if (!history.length) { list.innerHTML = '<div class="history-empty">История изображений</div>'; return; }
    list.textContent = "";
    history.slice(0, 20).forEach((h, i) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      const thumb = document.createElement("div");
      thumb.className = "history-thumb";
      if (h.dataUrl) {
        const img = document.createElement("img");
        img.src = h.dataUrl;
        img.alt = "";
        img.style.cssText = "width:38px;height:38px;object-fit:cover;border-radius:8px";
        thumb.replaceWith(img);
        item.appendChild(img);
      } else {
        thumb.textContent = "▧";
        item.appendChild(thumb);
      }
      const label = document.createElement("div");
      label.style.cssText = "font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1";
      label.textContent = (h.prompt || "Без названия").slice(0, 60);
      item.appendChild(label);
      const open = () => { if (h.dataUrl) showResult(h.dataUrl, h.prompt); };
      item.addEventListener("click", open);
      item.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
      list.appendChild(item);
    });
  }

  async function syncServerHistory() {
    if (!apiBase) return;
    try {
      const res = await fetch(apiBase + "/api/v1/jobs", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const remote = (data.jobs || []).map((j) => ({
        id: j.id,
        prompt: j.prompt || "",
        dataUrl: null,
        resultUrl: j.result_url || null,
        ts: Date.parse(j.created_at) || Date.now(),
        remote: true
      }));
      const music = (data.music || []).map((m) => ({
        id: m.id || m.task_id,
        prompt: (m.title || m.style || "трек") + (m.audio_url ? "" : " (ожидание)"),
        dataUrl: null,
        audioUrl: m.audio_url || m.stream_url || null,
        ts: Date.parse(m.created_at) || Date.now(),
        remote: true,
        music: true
      }));
      if (!remote.length && !music.length) return;
      const byId = new Map(history.filter((h) => h.id).map((h) => [h.id, h]));
      remote.concat(music).forEach((item) => {
        const prev = byId.get(item.id) || {};
        byId.set(item.id, { ...prev, ...item, dataUrl: prev.dataUrl || item.dataUrl });
      });
      const localOnly = history.filter((h) => !h.id);
      history = [...localOnly, ...byId.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
      try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch (_) {}
      renderHistory();
    } catch (_) {}
  }

  const TEXT_TEMPLATES = {
    song: "Напиши оригинальный текст песни на тему: [тема].\nЖанр и настроение: [жанр / эмоция].\nВокал: [тип голоса].\nСтруктура: [Intro] / [Verse 1] / [Chorus] / [Verse 2] / [Bridge] / [Final Chorus] / [Outro].\nИзбегай клише, сохраняй естественную речь и сильные образы.",
    poem: "Создай оригинальное стихотворение на тему [тема]. Используй конкретные образы, естественную интонацию, цельное развитие мысли и сильную финальную строку.",
    script: "Разработай сценарий музыкального клипа. Укажи открывающий кадр, развитие действия, кульминацию и финал. Для каждого эпизода опиши действие, план камеры, движение, свет и переход.",
    ad: "Создай рекламный текст для [продукт / проект]. Укажи аудиторию, главное преимущество, заголовок, основное сообщение и призыв к действию.",
    prompt: "Создай подробный AI-промпт. Укажи объект, действие, окружение, композицию, освещение, стиль, камеру, детали и negative prompt.",
    description: "Создай ясное и выразительное описание. Подготовь заголовок, краткое описание, ключевые особенности и заключение."
  };
  const TEXT_KINDS = { song:"ТЕКСТ ПЕСНИ", poem:"СТИХОТВОРЕНИЕ", script:"СЦЕНАРИЙ", ad:"РЕКЛАМНЫЙ ТЕКСТ", prompt:"AI-ПРОМПТ", description:"ОПИСАНИЕ" };
  function downloadText(filename, content) {
    if (!content || !content.trim()) { toast("Сначала подготовь текст"); return; }
    const blob = new Blob([content], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function buildTextDraft() {
    const kind = $("#text-kind")?.value || "song";
    const brief = $("#text-brief")?.value.trim() || "[Опиши идею]";
    const structures = {
      song:"[Intro]\n\n[Verse 1]\n\n[Chorus]\n\n[Verse 2]\n\n[Bridge]\n\n[Final Chorus]\n\n[Outro]",
      poem:"Образный центр:\nРитм и рифмовка:\nРазвитие мысли:\nФинальная строка:",
      script:"1. Открывающий кадр\n2. Развитие действия\n3. Кульминация\n4. Финальный кадр\nДля каждого кадра: план, движение камеры, свет и действие.",
      ad:"Заголовок:\nОсновное сообщение:\nПреимущество:\nПризыв к действию:",
      prompt:"SUBJECT:\nACTION:\nSETTING:\nCOMPOSITION:\nLIGHTING:\nSTYLE:\nCAMERA:\nDETAILS:\nNEGATIVE PROMPT:",
      description:"Заголовок:\nКраткое описание:\nКлючевые особенности:\nЗаключение:"
    };
    const output = "ЗАДАЧА: " + TEXT_KINDS[kind] + "\n\nИСХОДНАЯ ИДЕЯ:\n" + brief + "\n\nШАБЛОН / СТРУКТУРА:\n" + structures[kind] + "\n\nИНСТРУКЦИЯ ДЛЯ AI:\n" + TEXT_TEMPLATES[kind];
    if ($("#text-output")) $("#text-output").value=output;
  }
  $("#build-text-draft")?.addEventListener("click", buildTextDraft);
  $("#copy-text-draft")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#text-output")?.value || ""); toast("Текст скопирован"); }
    catch (_) { toast("Не удалось скопировать"); }
  });
  $("#download-text-draft")?.addEventListener("click", () => downloadText("kirillovec-text-" + Date.now() + ".txt", $("#text-output")?.value || ""));
  document.querySelectorAll("[data-text-template]").forEach((b) => b.addEventListener("click", () => {
    const key=b.getAttribute("data-text-template");
    if ($("#text-kind")) $("#text-kind").value=key==="clip"?"script":key==="image"?"prompt":key;
    buildTextDraft(); toast("Шаблон добавлен");
  }));

  function buildVideoPrompt() {
    const kind=$("#video-type")?.value || "text";
    const brief=$("#video-brief")?.value.trim() || "";
    if (!brief) { toast("Опиши сцену"); return; }
    const prefix=kind==="image"?"IMAGE TO VIDEO. Preserve the source image identity, composition and key visual details.":"TEXT TO VIDEO. Create a coherent cinematic video from the description.";
    const output=prefix+"\nSCENE: "+brief+"\nCAMERA: deliberate cinematic camera movement, stable motion, intentional framing.\nMOTION: natural continuous movement, physically plausible actions.\nLIGHTING: consistent cinematic lighting and color grade.\nTEMPORAL CONSISTENCY: preserve subject appearance, clothing, environment and object continuity across frames.\nQUALITY: detailed, realistic motion, no flicker, no morphing, no unintended text or logos.";
    if ($("#video-output")) $("#video-output").value=output;
  }
  $("#build-video-prompt")?.addEventListener("click", buildVideoPrompt);
  $("#copy-video-prompt")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#video-output")?.value || ""); toast("Видеопромпт скопирован"); }
    catch (_) { toast("Не удалось скопировать"); }
  });
  $("#download-video-prompt")?.addEventListener("click", () => downloadText("kirillovec-video-prompt-" + Date.now() + ".txt", $("#video-output")?.value || ""));


  const PROJECTS_KEY = "kirillovec-creative-projects-v1";
  function readProjects() {
    try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]"); } catch (_) { return []; }
  }
  function renderProjects() {
    const list = $("#project-list");
    const count = $("#project-count");
    const projects = readProjects();
    if (count) count.textContent = String(projects.length);
    if (!list) return;
    list.replaceChildren();
    if (!projects.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "Сохранённых проектов пока нет";
      list.appendChild(empty);
      return;
    }
    projects.slice(0, 12).forEach((project) => {
      const row = document.createElement("div");
      row.className = "project-item";
      const info = document.createElement("div");
      info.className = "project-info";
      const title = document.createElement("strong");
      title.textContent = project.title || ({audio:"Аудиопроект",image:"Изображение",video:"Видеопроект",text:"Текстовый проект"}[project.mode] || "Проект");
      const meta = document.createElement("span");
      meta.textContent = (project.mode || "project").toUpperCase() + " · " + new Date(project.createdAt || Date.now()).toLocaleDateString("ru-RU");
      info.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "project-actions";
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Открыть";
      open.addEventListener("click", () => {
        if ($("#track-title") && project.mode === "audio") $("#track-title").value = project.title || "";
        if ($("#prompt")) $("#prompt").value = project.prompt || "";
        if ($("#style-out")) $("#style-out").textContent = project.style || "";
        if ($("#lyrics")) $("#lyrics").value = project.lyrics || "";
        if ($("#video-brief")) $("#video-brief").value = project.videoBrief || "";
        if ($("#video-output")) $("#video-output").value = project.videoPrompt || "";
        if ($("#text-brief")) $("#text-brief").value = project.textBrief || "";
        if ($("#text-output")) $("#text-output").value = project.textDraft || "";
        if ($("#creative-brief")) $("#creative-brief").value = project.creativeBrief || "";
        if ($("#creative-pack-output")) $("#creative-pack-output").value = project.creativePack || "";
        setMode(project.mode || "audio");
        toast("Проект открыт");
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Удалить";
      remove.addEventListener("click", () => {
        const next = readProjects().filter((item) => item.id !== project.id);
        try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); renderProjects(); toast("Проект удалён"); }
        catch (_) { toast("Не удалось обновить библиотеку"); }
      });
      actions.append(open, remove);
      row.append(info, actions);
      list.appendChild(row);
    });
  }

  function currentProject() {
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      createdAt: new Date().toISOString(),
      mode,
      title: (mode === "audio" ? $("#track-title")?.value : mode === "image" ? $("#prompt")?.value : mode === "video" ? $("#video-brief")?.value : $("#text-brief")?.value || $("#creative-brief")?.value) || ({audio:"Аудиопроект",image:"Изображение",video:"Видеопроект",text:"Текстовый проект"}[mode] || "Проект"),
      prompt: $("#prompt")?.value || "",
      style: $("#style-out")?.textContent || "",
      lyrics: $("#lyrics")?.value || "",
      videoBrief: $("#video-brief")?.value || "",
      videoPrompt: $("#video-output")?.value || "",
      textBrief: $("#text-brief")?.value || "",
      textDraft: $("#text-output")?.value || "",
      creativeBrief: $("#creative-brief")?.value || "",
      creativePack: $("#creative-pack-output")?.value || ""
    };
  }
  $("#save-project")?.addEventListener("click", () => {
    const projects = readProjects();
    projects.unshift(currentProject());
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 50)));
      renderProjects();
      toast("Проект сохранён в этом браузере");
    } catch (_) { toast("Недостаточно места в браузере. Экспортируй или удали старые данные."); }
  });
  $("#export-projects")?.addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), projects: readProjects(), imageHistory: history };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download="kirillovec-projects-" + Date.now() + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#build-creative-pack")?.addEventListener("click", () => {
    const brief = $("#creative-brief")?.value.trim() || "";
    if (!brief) { toast("Сначала опиши идею"); return; }
    const pack = [
      "KIRILLOVEC CREATIVE PACK",
      "ОБЩАЯ ИДЕЯ: " + brief,
      "",
      "1. AUDIO / SUNO",
      "Create an original song based on this concept. Define genre, tempo, instrumentation, vocal character, mood, arrangement and production. Keep lyrics and Style separate.",
      "",
      "2. IMAGE",
      "Create a coherent key visual for this concept. Define subject, composition, camera angle, lighting, palette, texture and aspect ratio. Preserve a consistent visual identity.",
      "",
      "3. VIDEO",
      "Develop a short cinematic sequence from this concept. Provide scene-by-scene action, camera movement, transitions, lighting and temporal continuity.",
      "",
      "4. TEXT",
      "Develop a concise creative description, tagline and supporting narrative for this concept. Use a distinctive voice and avoid generic clichés."
    ].join("\n");
    if ($("#creative-pack-output")) $("#creative-pack-output").value=pack;
    toast("Пакет из четырёх направлений готов");
  });
  $("#download-creative-pack")?.addEventListener("click", () => downloadText("kirillovec-creative-pack-" + Date.now() + ".txt", $("#creative-pack-output")?.value || ""));
  $("#download-audio-pack")?.addEventListener("click", () => {
    const packet = "TITLE: " + ($("#track-title")?.value || "") + "\n\nSTYLE:\n" + ($("#style-out")?.textContent || "") + "\n\nLYRICS:\n" + ($("#lyrics")?.value || "") + "\n\nSUNO SETTINGS\nWeirdness: " + ($("#suno-weirdness")?.value || "50") + "\nStyle Influence: " + ($("#suno-influence")?.value || "75");
    downloadText("kirillovec-suno-pack-" + Date.now() + ".txt", packet);
  });

  async function loadCapabilities() {
    const apiStatus = $("#api-status");
    const modelStatus = $("#model-status");
    const usageStatus = $("#usage-status");
    const refresh = $("#refresh-status");
    if (!apiBase) {
      if (apiStatus) apiStatus.textContent = "API не настроен в конфигурации.";
      if (modelStatus) modelStatus.textContent = "Генерация недоступна.";
      return;
    }
    if (refresh) refresh.disabled = true;
    if (apiStatus) apiStatus.textContent = "Проверяем API…";
    if (modelStatus) modelStatus.textContent = "Получаем список моделей…";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      let res;
      try {
        res = await fetch(apiBase + "/api/v1/capabilities", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
      const image = data.image || {};
      const models = [];
      if (image.enabled && image.model) models.push("Текст → изображение: " + image.model);
      if (image.imageToImage && image.imageToImageModel) models.push("Фото → фото: " + image.imageToImageModel);
      if (apiStatus) {
        apiStatus.textContent = "API доступен · HTTP " + res.status;
        apiStatus.style.color = "#9bd6a8";
      }
      if (modelStatus) {
        modelStatus.textContent = models.length ? models.join("\n") : "Генерация изображений сейчас отключена.";
        modelStatus.style.whiteSpace = "pre-line";
      }
      const limits = data.limits || {};
      const imageLimit = limits.image || {};
      if (usageStatus) {
        const max = Number(imageLimit.max || 0);
        const hours = Math.round((imageLimit.windowSeconds || 3600) / 3600 * 10) / 10;
        const unit = max === 1 ? "генерация" : (max > 1 && max < 5 ? "генерации" : "генераций");
        const allowance = max ? "Лимит изображений: " + max + " " + unit + " за " + hours + " ч" : "Лимит не сообщён";
        const videoState = data.video && data.video.enabled ? "видеогенерация доступна" : "видеорендеринг выключен, конструктор промптов доступен";
        const musicState = data.music && data.music.enabled ? "Suno API доступен" : "ручной режим Suno доступен, API выключен";
        usageStatus.textContent = (limits.guest ? "Гостевой режим · " : "Аккаунт · ") + allowance +
          " · " + videoState + " · " + musicState;
      }
    } catch (error) {
      if (apiStatus) {
        apiStatus.textContent = error.name === "AbortError" ? "API не ответил за 9 секунд." : "Не удалось проверить API: " + (error.message || "ошибка сети");
        apiStatus.style.color = "#e2a0a0";
      }
      if (modelStatus) modelStatus.textContent = "Состояние моделей неизвестно. Проверка не запускает генерацию и не расходует лимит.";
      if (usageStatus) usageStatus.textContent = "";
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }
  $("#refresh-status")?.addEventListener("click", loadCapabilities);

  renderHistory();
  renderProjects();
  ["suno-weirdness", "suno-influence"].forEach((id) => {
    const input = $("#" + id);
    const output = $("#" + (id === "suno-weirdness" ? "weirdness-value" : "influence-value"));
    if (input && output) {
      output.textContent = input.value;
      input.addEventListener("input", () => { output.textContent = input.value; });
    }
  });
  const requestedMode = new URLSearchParams(location.search).get("mode") || "audio";
  setMode(requestedMode);
  syncServerHistory();
  loadCapabilities();
  console.log("[kirillovec AI Studio] ready, api=", apiBase);
})();
