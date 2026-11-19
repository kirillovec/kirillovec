(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const promptEl = $("#prompt"), config = window.AI_STUDIO_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const historyKey = "kirillovec-ai-studio-history-v2";
  let mode = "image", selectedFile = null, history = [];

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), 3200);
  }

  function setMode(m) {
    mode = m;
    document.body.classList.toggle("mode-audio", m === "audio");
    document.querySelectorAll("[data-mode]").forEach((b) => {
      const on = b.getAttribute("data-mode") === m;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const caption = $("#mode-caption");
    if (caption) caption.textContent = m === "image" ? "Текст → изображение" : m === "audio" ? "Style + Lyrics для Suno" : "Видео-промпты";
  }

  const PRESETS = {
    music: "Square album cover, Russian underground rap aesthetic, night city lights through window, cigarette smoke, dark minimalism, moody lighting, cinematic, high detail",
    cover: "Album cover \"НИЗКО\", dark minimal window overlooking night city, typography, smoke atmosphere, cold blue and amber tones, Russian rap album art",
    smoke: "Cinematic still, cigarette smoke in cold light from window, night city bokeh, lonely atmosphere, film grain, dark mood",
    window: "Looking out of a rainy apartment window at night, city lights blurred, condensation on glass, melancholic mood, cinematic photography",
    low: "Low angle shot, dark room, window with night city view, silhouette, smoke rising, album cover composition for \"НИЗКО\"",
    cinematic: "Cinematic frame for music video, night street, neon reflections, rain, moody color grade, 35mm film look",
    portrait: "Atmospheric portrait of a young man, night city background, soft rim light, smoke, introspective expression, cinematic photography"
  };

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
      if (f.size > 4 * 1024 * 1024) {
        toast("Файл больше 4 МБ");
        return;
      }
      selectedFile = f;
      const url = URL.createObjectURL(f);
      const img = $("#file-thumb");
      if (img) img.src = url;
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
      if (fileInput) fileInput.value = "";
      if (filePreview) filePreview.style.display = "none";
    });
  }

  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => setMode(b.getAttribute("data-mode")));
  });

  document.querySelectorAll("[data-view]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const title = $("#crumb-title");
      if (title) title.textContent = b.textContent.trim() || b.getAttribute("data-view");
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

    history.unshift({ prompt: promptText, dataUrl, ts: Date.now() });
    history = history.slice(0, 30);
    try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch (_) {}
    renderHistory();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  const generateBtn = $("#generate");
  if (generateBtn) {
    generateBtn.addEventListener("click", async () => {
      const p = (promptEl && promptEl.value.trim()) || "";
      if (!p) {
        toast("Напиши промпт");
        return;
      }
      if (!apiBase) {
        toast("API не настроен");
        return;
      }
      generateBtn.disabled = true;
      const status = $("#result-status");
      if (status) status.textContent = "Генерация...";
      const stage = $("#result-stage");
      if (stage) stage.innerHTML = '<div class="empty"><h3>Генерация...</h3><p>FLUX · Workers AI</p></div>';

      try {
        const payload = { mode: "image", prompt: p };
        if (selectedFile) {
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
          if (stage) stage.innerHTML = '<div class="empty"><h3>Не удалось</h3><p>' + msg + '</p></div>';
          return;
        }
        const dataUrl = data.result && data.result.dataUrl;
        if (!dataUrl) {
          toast("Нет изображения в ответе");
          if (status) status.textContent = "Ошибка";
          return;
        }
        showResult(dataUrl, p);
        toast("Готово");
      } catch (e) {
        toast("Ошибка сети: " + (e.message || "unknown"));
        if (status) status.textContent = "Ошибка";
        if (stage) stage.innerHTML = '<div class="empty"><h3>Ошибка сети</h3><p>Проверь API</p></div>';
      } finally {
        generateBtn.disabled = false;
      }
    });
  }

  try {
    history = JSON.parse(localStorage.getItem(historyKey) || "[]");
  } catch {
    history = [];
  }
  function renderHistory() {
    const list = $("#history-list");
    const count = $("#history-count");
    if (count) count.textContent = history.length;
    if (!list) return;
    if (!history.length) {
      list.innerHTML = '<div class="history-empty">История изображений</div>';
      return;
    }
    list.innerHTML = history
      .slice(0, 20)
      .map((h, i) => {
        const thumb = h.dataUrl
          ? `<img src="${h.dataUrl}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px">`
          : `<div class="history-thumb">▧</div>`;
        return `<div class="history-item" data-i="${i}">${thumb}<div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${(h.prompt || "").slice(0, 60)}</div></div>`;
      })
      .join("");
    list.querySelectorAll(".history-item").forEach((el) => {
      el.addEventListener("click", () => {
        const i = Number(el.getAttribute("data-i"));
        const h = history[i];
        if (h && h.dataUrl) showResult(h.dataUrl, h.prompt);
      });
    });
  }
  renderHistory();

  setMode("image");
  console.log("[kirillovec AI Studio] ready, api=", apiBase);
})();
