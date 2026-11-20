(function () {
  "use strict";
  const apiBase = String((window.AI_STUDIO_CONFIG || {}).apiBaseUrl || "").replace(/\/$/, "");
  const $ = (s) => document.querySelector(s);

  async function syncAccount() {
    const chip = $("#account-chip");
    const banner = $("#auth-banner");
    const bannerText = $("#auth-banner-text");
    const bannerCta = $("#auth-banner-cta");
    if (!banner && !chip) return;
    if (!apiBase) {
      if (banner) banner.style.display = "flex";
      return;
    }
    try {
      const res = await fetch(apiBase + "/api/v1/auth/me", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const user = data.user;
      if (chip) {
        if (user) {
          chip.textContent = user.email || "Аккаунт";
          chip.title = user.email || "";
          chip.classList.add("user");
        } else {
          chip.textContent = "Войти";
          chip.classList.remove("user");
        }
      }
      if (banner) {
        banner.style.display = "flex";
        if (user) {
          banner.classList.add("logged");
          if (bannerText) bannerText.innerHTML = "<strong>" + (user.email || "Аккаунт") + "</strong> · история сохраняется в аккаунте";
          if (bannerCta) { bannerCta.textContent = "Аккаунт →"; bannerCta.href = "/account/"; }
        } else {
          banner.classList.remove("logged");
          if (bannerText) bannerText.innerHTML = "<strong>Гостевой режим.</strong> Регистрация сохраняет историю и поднимает лимиты.";
          if (bannerCta) { bannerCta.textContent = "Создать аккаунт →"; bannerCta.href = "/account/"; }
        }
      }
    } catch (e) {
      if (banner) banner.style.display = "flex";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncAccount);
  else syncAccount();
})();
