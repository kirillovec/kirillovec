(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const toast = (message) => {
    const node = $("#toast");
    if (node) { node.textContent = message; node.style.display = "block"; setTimeout(() => node.style.display = "none", 3200); }
  };
  const linkInput = $("#suno-public-link");
  const linkStatus = $("#suno-link-status");
  const fields = {
    title: $("#suno-pack-title"), creator: $("#suno-pack-creator"),
    style: $("#suno-pack-style"), lyrics: $("#suno-pack-lyrics")
  };
  const files = { audio: null, cover: null, video: null };
  ["audio", "cover", "video"].forEach((kind) => {
    const input = $("#suno-pack-" + kind);
    const label = $("#suno-pack-" + kind + "-name");
    if (!input) return;
    input.addEventListener("change", () => {
      files[kind] = input.files && input.files[0] || null;
      if (label) label.textContent = files[kind] ? files[kind].name + " · " + (files[kind].size / 1048576).toFixed(2) + " МБ" : "Файл не выбран";
    });
  });
  function getPublicSunoUrl() {
    const raw = (linkInput && linkInput.value || "").trim();
    if (!raw) return "";
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error("Вставь полную ссылку Suno."); }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "suno.com" && host !== "suno.ai") throw new Error("Поддерживаются только ссылки suno.com.");
    if (!/^\/(s|song|hook)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) throw new Error("Нужна публичная ссылка на песню или Hook: /s/, /song/ или /hook/.");
    return url.origin + url.pathname;
  }
  $("#suno-open-public")?.addEventListener("click", () => {
    try {
      const url = getPublicSunoUrl();
      if (!url) throw new Error("Сначала вставь ссылку на песню.");
      window.open(url, "_blank", "noopener,noreferrer");
      if (linkStatus) linkStatus.textContent = "Ссылка проверена по формату. Открыта публичная страница Suno; приватные песни недоступны.";
    } catch (error) { toast(error.message); }
  });
  $("#suno-check-public")?.addEventListener("click", () => {
    try {
      const url = getPublicSunoUrl();
      if (!url) throw new Error("Вставь ссылку на песню.");
      if (linkStatus) linkStatus.textContent = "Формат ссылки корректен: " + url + ". Автоматическое извлечение медиа с Suno не гарантируется: сайт не передаёт cookies и не обходит приватность или ограничения доступа.";
      toast("Ссылка распознана");
    } catch (error) { if (linkStatus) linkStatus.textContent = error.message; toast(error.message); }
  });
  function safeName(value) {
    return String(value || "suno-track").normalize("NFKC").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "suno-track";
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }
  function zipStore(entries) {
    const encoder = new TextEncoder();
    const local = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255];
    const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
      const crc = crc32(data);
      const header = new Uint8Array([
        0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,
        ...u32(crc), ...u32(data.length), ...u32(data.length),
        ...u16(name.length),0,0
      ]);
      local.push(header, name, data);
      const centralHeader = new Uint8Array([
        0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,0,0,
        ...u32(crc), ...u32(data.length), ...u32(data.length),
        ...u16(name.length),0,0,0,0,0,0,0,0,0,0,
        ...u32(offset)
      ]);
      central.push(centralHeader, name);
      offset += header.length + name.length + data.length;
    }
    const centralSize = central.reduce((n, part) => n + part.length, 0);
    const end = new Uint8Array([0x50,0x4b,0x05,0x06,0,0,0,0,...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(offset),0,0]);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  }
  function metadata() {
    let source = "";
    try { source = getPublicSunoUrl(); } catch (_) { source = (linkInput && linkInput.value || "").trim(); }
    return {
      title: fields.title.value.trim(), creator: fields.creator.value.trim(),
      style: fields.style.value.trim(), lyrics: fields.lyrics.value,
      suno_url: source, created_at: new Date().toISOString(),
      note: "Экспорт локально подготовленных пользователем файлов. Наличие ссылки не означает разрешение на использование."
    };
  }
  async function audioToWav(file) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("Браузер не поддерживает Web Audio для WAV.");
    const ctx = new AudioCtx();
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      const channels = Math.min(2, buffer.numberOfChannels);
      const frames = buffer.length;
      const out = new ArrayBuffer(44 + frames * channels * 2);
      const view = new DataView(out);
      const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      write(0,"RIFF"); view.setUint32(4,36 + frames * channels * 2,true); write(8,"WAVE");
      write(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true);
      view.setUint16(22,channels,true); view.setUint32(24,buffer.sampleRate,true);
      view.setUint32(28,buffer.sampleRate * channels * 2,true); view.setUint16(32,channels * 2,true);
      view.setUint16(34,16,true); write(36,"data"); view.setUint32(40,frames * channels * 2,true);
      const channelData = Array.from({length:channels}, (_,i) => buffer.getChannelData(i));
      let pos = 44;
      for (let i = 0; i < frames; i++) for (let ch = 0; ch < channels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        view.setInt16(pos, sample < 0 ? sample * 32768 : sample * 32767, true); pos += 2;
      }
      return new Blob([out], { type: "audio/wav" });
    } finally { await ctx.close(); }
  }
  $("#suno-download-original")?.addEventListener("click", () => {
    if (!files.audio) return toast("Сначала выбери аудиофайл со своего устройства.");
    downloadBlob(files.audio, safeName(fields.title.value) + "-" + safeName(files.audio.name));
  });
  $("#suno-download-wav")?.addEventListener("click", async () => {
    if (!files.audio) return toast("Сначала выбери аудиофайл со своего устройства.");
    const button = $("#suno-download-wav"); button.disabled = true; button.textContent = "Конвертация…";
    try { downloadBlob(await audioToWav(files.audio), safeName(fields.title.value) + ".wav"); toast("WAV подготовлен в браузере"); }
    catch (error) { toast(error.message || "Не удалось создать WAV"); }
    finally { button.disabled = false; button.textContent = "Конвертировать в WAV"; }
  });
  $("#suno-download-cover")?.addEventListener("click", () => {
    if (!files.cover) return toast("Сначала выбери файл обложки.");
    downloadBlob(files.cover, safeName(fields.title.value) + "-cover" + (files.cover.name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0]);
  });
  $("#suno-download-video")?.addEventListener("click", () => {
    if (!files.video) return toast("Сначала выбери видеофайл.");
    downloadBlob(files.video, safeName(fields.title.value) + "-video" + (files.video.name.match(/\.[a-z0-9]+$/i) || [".mp4"])[0]);
  });
  $("#suno-download-lyrics")?.addEventListener("click", () => {
    if (!fields.lyrics.value.trim()) return toast("Добавь текст песни.");
    downloadBlob(new Blob([fields.lyrics.value], {type:"text/plain;charset=utf-8"}), safeName(fields.title.value) + "-lyrics.txt");
  });
  $("#suno-download-pack")?.addEventListener("click", async () => {
    const button = $("#suno-download-pack");
    const entries = [];
    const meta = metadata();
    if (files.audio) entries.push({name:"audio/" + safeName(files.audio.name),bytes:await files.audio.arrayBuffer()});
    if (files.cover) entries.push({name:"cover/" + safeName(files.cover.name),bytes:await files.cover.arrayBuffer()});
    if (files.video) entries.push({name:"video/" + safeName(files.video.name),bytes:await files.video.arrayBuffer()});
    if (meta.lyrics.trim()) entries.push({name:"lyrics/" + safeName(meta.title) + ".txt",bytes:new TextEncoder().encode(meta.lyrics)});
    entries.push({name:"metadata.json",bytes:new TextEncoder().encode(JSON.stringify(meta,null,2))});
    entries.push({name:"README.txt",bytes:new TextEncoder().encode("KIRILLOVEC · SUNO ASSET PACK\n\nАрхив содержит только файлы, выбранные пользователем на этом устройстве, и введённые метаданные.\nПубличная ссылка Suno сама по себе не даёт прав на скачивание или коммерческое использование.\nСкачивайте и используйте только собственные или разрешённые материалы.\n")});
    if (!files.audio && !files.cover && !files.video && !meta.lyrics.trim()) return toast("Добавь хотя бы один файл или текст Lyrics.");
    button.disabled = true; button.textContent = "Собираю ZIP…";
    try {
      downloadBlob(zipStore(entries), safeName(meta.title) + "-suno-assets.zip");
      toast("ZIP-пакет собран локально");
    } catch (error) { toast(error.message || "Не удалось собрать ZIP"); }
    finally { button.disabled = false; button.textContent = "Скачать всё одним ZIP"; }
  });
})();