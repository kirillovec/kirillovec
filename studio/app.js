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
    if (Array.isArray(saved)) localHistory = saved.slice(-20);
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
    if (!localHistory.length) {
      list.innerHTML =
        '<div class="history-empty">Пока нет подготовленных задач</div>';
      if (count) count.textContent = "0 задач";
      return;
    }
    list.innerHTML = localHistory
      .slice()
      .reverse()
      .map(
        (item, idx) =>
          `<div class="history-item" data-history-idx="${localHistory.length - 1 - idx}" role="button" tabindex="0" title="Нажми, чтобы восстановить">
            <div class="history-thumb">${item.mode === "video" ? "▷" : "▧"}</div>
            <div>
              <strong>${(item.prompt || "Без промпта").slice(0, 60)}${item.prompt && item.prompt.length > 60 ? "…" : ""}</strong>
              <span>${item.mode || "image"}${item.hasFile ? " · с файлом" : ""} · ${new Date(item.ts || Date.now()).toLocaleString("ru-RU")}</span>
            </div>
          </div>`
      )
      .join("");
    if (count) count.textContent = localHistory.length + " задач";

    list.querySelectorAll("[data-history-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        const i = Number(el.dataset.historyIdx);
        const item = localHistory[i];
        if (!item) return;
        prompt.value = item.prompt || "";
        $("#prompt-count").textContent = prompt.value.length + " / 2000";
        setMode(item.mode || "image");
        if (item.ratio && $("#ratio")) $("#ratio").value = item.ratio;
        if (item.quality && $("#quality")) $("#quality").value = item.quality;
        toast("Задача восстановлена из истории");
        prompt.focus();
      });
    });
  }

  function saveHistory(entry) {
    localHistory.push(entry);
    if (localHistory.length > 20) localHistory = localHistory.slice(-20);
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(localHistory));
    } catch (e) {}
    renderHistory();
  }

  $("#copy-prompt")?.addEventListener("click", async () => {
    const text = prompt.value.trim();
    if (!text) {
      toast("Сначала введи промпт");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Промпт скопирован");
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
    navigator.clipboard.writeText(text).catch(() => {});
    const urls = {
      kling: "https://kling.ai/",
      pixverse: "https://pixverse.ai/",
      hailuo: "https://hailuoai.video/",
      flux: "https://fal.ai/models/fal-ai/flux/dev",
      midjourney: "https://www.midjourney.com/",
    };
    const url = urls[service];
    if (url) {
      window.open(url, "_blank", "noopener");
      toast("Промпт скопирован. Вставь его в " + service);
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
    $("#result-status").textContent = "Подготовлено";

    const notice = $("#notice");
    if (notice) {
      notice.style.display = "block";
      notice.textContent = selectedFile
        ? `Файл «${selectedFile.name}» и промпт готовы. Скопируй промпт и открой внешний сервис, либо дождись подключения API.`
        : "Промпт готов. Можно скопировать и продолжить во внешнем сервисе.";
    }

    toast(
      selectedFile
        ? "Задача с файлом сохранена в историю"
        : "Задача сохранена в историю"
    );

    try {
      await navigator.clipboard.writeText(text);
      toast(selectedFile
        ? "Промпт скопирован. Загрузи выбранное фото во внешний сервис вручную."
        : "Промпт скопирован. Теперь выбери внешний сервис.");
    } catch (e) {
      toast("Задача сохранена. Не удалось скопировать автоматически — нажми «Копировать промпт».");
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
