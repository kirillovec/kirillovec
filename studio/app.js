(function () {
  const $ = (s) => document.querySelector(s);
  const prompt = $("#prompt");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const navButtons = [...document.querySelectorAll("[data-view]")];
  let mode = "image";
  let selectedFile = null;
  let localHistory = [];
  const historyStorageKey = "kirillovec-ai-studio-history-v1";

  try {
    const saved = JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
    if (Array.isArray(saved)) {
      localHistory = saved
        .filter((item) => item && typeof item === "object" && typeof item.prompt === "string")
        .slice(-20)
        .map((item) => ({
          prompt: item.prompt.slice(0, 2000),
          mode: item.mode === "video" ? "video" : "image",
          hasFile: Boolean(item.hasFile),
          ts: Number(item.ts) || Date.now(),
          ratio: typeof item.ratio === "string" ? item.ratio : "auto",
          quality: typeof item.quality === "string" ? item.quality : "Стандартное",
        }));
    }
  } catch (e) {}

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (el.style.display = "none"), 4200);
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    $("#mode-caption").textContent =
      mode === "image" ? "Текст → изображение" : "Текст / изображение → видео";
    $("#duration-field").hidden = mode !== "video";
    if ($("#ratio")) $("#ratio").value = mode === "video" ? "16:9" : "auto";
    $("#generate").textContent =
      mode === "image" ? "✦　Создать изображение" : "▷　Создать видео";
    $("#crumb-title").textContent = mode === "image" ? "Изображения" : "Видео";
    $("#page-title").textContent =
      mode === "image" ? "Преврати идею в визуал" : "Оживи идею в видео";
    $("#page-subtitle").textContent =
      mode === "image"
        ? "Создавай изображения по описанию или подготовь исходник для редактирования."
        : "Подготовь видеозадачу: опиши сцену и движение, при желании добавь исходный кадр.";
    if ($("#file-input"))
      $("#file-input").accept = "image/png,image/jpeg,image/webp";
  }

  modeButtons.forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode))
  );

  // Улучшенные пресеты под стиль kirillovec
  const examples = {
    cinematic:
      "Кинематографичная ночная сцена в городе, холодный неоновый свет, отражения на мокром асфальте, дым, глубокие тени, реалистичная фактура, плёночная цветокоррекция, высокая детализация.",
    portrait:
      "Реалистичный портрет мужчины в полумраке, мягкий боковой свет из окна, лёгкий дым, усталый взгляд, городской фон в боке, объектив 85 мм, editorial photography, атмосфера одиночества.",
    music:
      "Обложка мрачного романтического хип-хоп сингла, окно обычной московской многоэтажки ночью, холодные городские огни, лёгкий дым, реалистичная фотография, минимализм, без роз и сердечек, крупная типографика «kirillovec», атмосфера дыма и одиночества.",
    motion:
      "Оживи загруженное фото: естественное движение человека и одежды, плавный медленный наезд камеры, сохранение внешности и пропорций, лёгкий дым, реалистичная кинематографичная сцена.",
    smoke:
      "Атмосфера дыма и ночи, сигаретный дым в луче света из окна, тёмный интерьер, городские огни за стеклом, холодные тона, кинематографичный реализм, высокая детализация.",
    cover:
      "Обложка альбома «НИЗКО», тёмный минимализм, окно в ночной город, дым, холодный свет, реалистичная фотография, крупная типографика, без лишних элементов, атмосфера усталости и одиночества.",
  };

  document.querySelectorAll("[data-prompt]").forEach((b) =>
    b.addEventListener("click", () => {
      prompt.value = examples[b.dataset.prompt] || prompt.value;
      $("#prompt-count").textContent = prompt.value.length + " / 2000";
      if (b.dataset.prompt === "motion") setMode("video");
      prompt.focus();
    })
  );

  navButtons.forEach((b) =>
    b.addEventListener("click", () => {
      navButtons.forEach((n) => n.classList.remove("active"));
      b.classList.add("active");
      document
        .querySelectorAll("[data-tool]")
        .forEach((t) => t.classList.remove("active"));
      const view = b.dataset.view;
      if (view === "image") setMode("image");
      if (view === "video") setMode("video");
      if (view === "create") {
        setMode("image");
        $("#prompt").focus();
      }
      if (view === "history")
        $("#history-list").scrollIntoView({ behavior: "smooth", block: "center" });
    })
  );

  document.querySelectorAll("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-tool]")
        .forEach((n) => n.classList.remove("active"));
      b.classList.add("active");
      const tool = b.dataset.tool;
      const meta = {
        animate: {
          mode: "video",
          title: "Анимация фото",
          sub: "Загрузи кадр и опиши движение — промпт для image-to-video.",
          prompt:
            "Оживи исходное изображение: естественное движение человека и одежды, плавный медленный наезд камеры, сохранение внешности, пропорций и освещения, лёгкий дым, реалистичная кинематографичная сцена.",
          btn: "▷　Анимировать",
        },
        edit: {
          mode: "image",
          title: "Редактирование",
          sub: "Опиши правки. Исходный файл желателен — для image-to-image.",
          prompt:
            "Отредактируй загруженное изображение, сохранив композицию и основные черты. Измени: ",
          btn: "✎　Редактировать",
        },
        face: {
          mode: "image",
          title: "Работа с лицом",
          sub: "Загрузи референс и опиши результат. Обработка — через API или внешний сервис.",
          prompt:
            "Аккуратно измени лицо по загруженному референсу: сохрани естественное освещение, пропорции и реалистичную интеграцию в сцену. Цель: ",
          btn: "◎　Обработать лицо",
        },
        cover: {
          mode: "image",
          title: "Обложка трека",
          sub: "Стиль под обложку сингла / альбома. Можно с исходником или с нуля.",
          prompt: examples.cover,
          btn: "🎤　Сделать обложку",
        },
      }[tool] || {
        mode: "image",
        title: "Инструмент",
        sub: "",
        prompt: "",
        btn: "✦　Создать",
      };

      setMode(meta.mode);
      prompt.value = meta.prompt;
      $("#prompt-count").textContent = prompt.value.length + " / 2000";
      $("#page-title").textContent = meta.title;
      $("#page-subtitle").textContent = meta.sub;
      $("#generate").textContent = meta.btn;
      $("#crumb-title").textContent = meta.title;
      if (tool === "animate" || tool === "edit" || tool === "face") {
        const upload = document.querySelector(".upload");
        if (upload) {
          upload.style.borderColor = "var(--accent)";
          setTimeout(() => (upload.style.borderColor = ""), 1800);
        }
      }
      prompt.focus();
      toast(meta.title + ": промпт готов. Добавь исходник при необходимости и нажми кнопку.");
    })
  );

  prompt.addEventListener(
    "input",
    () => ($("#prompt-count").textContent = prompt.value.length + " / 2000")
  );

  // File handling + drag & drop
  const fileInput = $("#file-input");
  const uploadZone = document.querySelector(".upload");

  function attachFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast(
        "Пока поддерживаются только JPG, PNG и WEBP. Для видео используй вкладку внешнего сервиса."
      );
      if (fileInput) fileInput.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("Файл больше 10 МБ. Выбери изображение поменьше.");
      if (fileInput) fileInput.value = "";
      return;
    }
    selectedFile = file;
    const old = $("#file-thumb");
    if (old && old.dataset.url) URL.revokeObjectURL(old.dataset.url);
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.id = "file-thumb";
    img.alt = "Предпросмотр";
    img.src = url;
    img.dataset.url = url;
    if (old) old.replaceWith(img);
    else {
      const preview = $("#file-preview");
      if (preview) preview.prepend(img);
    }
    $("#file-name").textContent = file.name;
    $("#file-size").textContent =
      (file.size / 1024 / 1024).toFixed(2) + " МБ · " + file.type;
    $("#file-preview").style.display = "flex";
    toast("Файл прикреплён: " + file.name);
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      attachFile(file);
    });
  }

  if (uploadZone) {
    ["dragenter", "dragover"].forEach((ev) =>
      uploadZone.addEventListener(ev, (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = "var(--accent)";
        uploadZone.style.background = "#15121b";
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      uploadZone.addEventListener(ev, (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = "";
        uploadZone.style.background = "";
      })
    );
    uploadZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      attachFile(file);
    });
  }

  $("#remove-file")?.addEventListener("click", () => {
    selectedFile = null;
    if (fileInput) fileInput.value = "";
    const thumb = $("#file-thumb");
    if (thumb && thumb.dataset.url) URL.revokeObjectURL(thumb.dataset.url);
    $("#file-preview").style.display = "none";
    toast("Файл удалён");
  });

  function renderHistory() {
    const list = $("#history-list");
    const count = $("#history-count");
    if (!list) return;
    list.replaceChildren();
    if (!localHistory.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "Пока нет подготовленных задач";
      list.appendChild(empty);
      if (count) count.textContent = "0 задач";
      return;
    }

    localHistory.slice().reverse().forEach((item, idx) => {
      const historyIndex = localHistory.length - 1 - idx;
      const row = document.createElement("div");
      row.className = "history-item";
      row.dataset.historyIdx = String(historyIndex);
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.title = "Нажми, чтобы восстановить промпт";

      const thumb = document.createElement("div");
      thumb.className = "history-thumb";
      thumb.textContent = item.mode === "video" ? "▷" : "▧";

      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = (item.prompt || "Без промпта").slice(0, 60) +
        (item.prompt && item.prompt.length > 60 ? "…" : "");
      const meta = document.createElement("span");
      meta.textContent = (item.mode || "image") +
        (item.hasFile ? " · исходник был прикреплён (не сохранён)" : "") +
        " · " + new Date(item.ts || Date.now()).toLocaleString("ru-RU");
      details.append(title, meta);
      row.append(thumb, details);

      const restore = () => {
        const entry = localHistory[historyIndex];
        if (!entry) return;
        prompt.value = entry.prompt || "";
        $("#prompt-count").textContent = prompt.value.length + " / 2000";
        setMode(entry.mode || "image");
        if (entry.ratio && $("#ratio")) $("#ratio").value = entry.ratio;
        if (entry.quality && $("#quality")) $("#quality").value = entry.quality;
        toast("Промпт восстановлен. Если нужен исходник, прикрепи его повторно.");
        prompt.focus();
      };
      row.addEventListener("click", restore);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          restore();
        }
      });
      list.appendChild(row);
    });
    if (count) count.textContent = localHistory.length + " задач";
  }

  function saveHistory(entry) {
    localHistory.push(entry);
    if (localHistory.length > 20) localHistory = localHistory.slice(-20);
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(localHistory));
    } catch (e) {}
    renderHistory();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (e) {}
    field.remove();
    return copied;
  }

  function showPreparedTask(entry) {
    const stage = $("#result-stage");
    if (!stage) return;
    stage.replaceChildren();
    stage.style.display = "block";

    const wrap = document.createElement("div");
    wrap.style.cssText = "width:100%;max-width:620px;margin:auto;display:grid;gap:14px";
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = entry.mode === "video" ? "Видеозадача подготовлена" : "Задача на изображение подготовлена";
    title.style.cssText = "margin:0 0 5px;font-size:17px";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Следующий шаг — открыть внешний сервис и запустить генерацию там.";
    subtitle.style.cssText = "margin:0;color:var(--muted);font-size:12px";
    heading.append(title, subtitle);
    wrap.appendChild(heading);

    if (selectedFile) {
      const fileRow = document.createElement("div");
      fileRow.style.cssText = "display:flex;gap:12px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#0d0d11";
      const thumb = $("#file-thumb");
      if (thumb && thumb.src) {
        const image = document.createElement("img");
        image.src = thumb.src;
        image.alt = "Исходное изображение";
        image.style.cssText = "width:64px;height:64px;object-fit:cover;border-radius:8px";
        fileRow.appendChild(image);
      }
      const fileText = document.createElement("span");
      fileText.textContent = selectedFile.name + " · " + (selectedFile.size / 1024 / 1024).toFixed(2) + " МБ. Файл пока находится только в этой вкладке.";
      fileText.style.cssText = "font-size:12px;color:var(--muted)";
      fileRow.appendChild(fileText);
      wrap.appendChild(fileRow);
    }

    const promptBox = document.createElement("pre");
    promptBox.textContent = entry.prompt;
    promptBox.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:190px;overflow:auto;margin:0;padding:13px;border:1px solid var(--line);border-radius:10px;background:#0b0b0e;color:#e8e3f0;font:12px/1.55 system-ui";
    wrap.appendChild(promptBox);

    const steps = document.createElement("p");
    steps.textContent = selectedFile
      ? "1. Скопируй промпт. 2. В открывшемся сервисе загрузи этот файл вручную. 3. Вставь промпт и запусти задачу."
      : "1. Скопируй промпт. 2. Открой сервис. 3. Вставь промпт и запусти задачу.";
    steps.style.cssText = "margin:0;color:#d5c8e7;font-size:12px";
    wrap.appendChild(steps);
    const choose = document.createElement("p");
    choose.textContent = "Сервис выбирается кнопками Kling, PixVerse, Hailuo или Flux под формой.";
    choose.style.cssText = "margin:0;color:var(--muted);font-size:11px";
    wrap.appendChild(choose);
    stage.appendChild(wrap);
  }

  $("#copy-prompt")?.addEventListener("click", async () => {
    const text = prompt.value.trim();
    if (!text) {
      toast("Сначала введи промпт");
      return;
    }
    try {
      const copied = await copyText(text);
      toast(copied ? "Промпт скопирован" : "Автокопирование недоступно — выдели промпт вручную");
    } catch (e) {
      toast("Не удалось скопировать — выдели текст вручную");
    }
  });

  // Кнопки внешних сервисов
  function openExternal(service) {
    const text = prompt.value.trim();
    if (!text) {
      toast("Сначала введи промпт");
      return;
    }
    const urls = {
      kling: "https://kling.ai/",
      pixverse: "https://pixverse.ai/",
      hailuo: "https://hailuoai.video/",
    };
    const url = urls[service];
    if (url) {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      copyText(text).then((copied) => {
        const message = copied ? "Промпт скопирован." : "Скопируй промпт кнопкой под полем.";
        toast((opened ? "Сервис открыт. " : "Браузер заблокировал новое окно. Разреши всплывающие окна. ") + message + " Загрузи исходник вручную.");
      });
    }
  }

  // Generate button
  $("#generate")?.addEventListener("click", async () => {
    const text = prompt.value.trim();
    if (!text) {
      toast("Сначала введи промпт. Исходное фото можно прикрепить дополнительно.");
      return;
    }

    const entry = {
      prompt: text,
      mode,
      hasFile: !!selectedFile,
      ts: Date.now(),
      ratio: $("#ratio")?.value,
      quality: $("#quality")?.value,
    };
    saveHistory(entry);
    $("#result-status").textContent = "Промпт готов";
    showPreparedTask(entry);

    const notice = $("#notice");
    if (notice) {
      notice.style.display = "block";
      notice.textContent = selectedFile
        ? `Исходник «${selectedFile.name}» выбран локально. Он не отправлен на сервер — загрузи его вручную в открывшемся сервисе.`
        : "Промпт готов и сохранён в локальной истории. Выбери внешний сервис ниже.";
    }

    toast(
      selectedFile
        ? "Задача с файлом сохранена в историю"
        : "Задача сохранена в историю"
    );

    try {
      const copied = await copyText(text);
      toast(copied
        ? (selectedFile ? "Промпт скопирован. Прикрепи исходник вручную во внешнем сервисе." : "Промпт скопирован. Теперь выбери внешний сервис.")
        : "Задача сохранена. Скопируй промпт вручную кнопкой под полем.");
    } catch (e) {
      toast("Задача сохранена. Скопируй промпт вручную кнопкой под полем.");
    }
  });

  // External service buttons (if present in DOM)
  document.querySelectorAll("[data-external]").forEach((btn) => {
    btn.addEventListener("click", () => openExternal(btn.dataset.external));
  });

  renderHistory();
  setMode("image");
  const hint = $("#integration-hint");
  if (hint) hint.textContent = "Бесплатный внешний режим: промпт копируется здесь, исходник загружается вручную в выбранный сервис.";
})();
