# Auth upgrade (2026-11-18)

## Already on main
- migrations/0004_auth_upgrade.sql
- account/index.html (verification UI, OAuth buttons, profile)

## Worker + static still need deploy of local build
See conversation artifacts or re-apply:
- src/index.js — email verify, resend, profile, OAuth Google/Yandex/VK, GET /api/v1/jobs history
- index.html, studio/index.html, artist/index.html — visible «Войти» CTA + guest banner in Studio

## After Worker deploy
1. Run Deploy AI Studio API (applies D1 migration 0004).
2. Optional OAuth secrets in Worker:
   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
   - YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET
   - VK_CLIENT_ID / VK_CLIENT_SECRET
3. RESEND_API_KEY for verification emails.
4. Provider redirect URIs:
   - https://api.kirillovec.ru/api/v1/auth/oauth/google/callback
   - https://api.kirillovec.ru/api/v1/auth/oauth/yandex/callback
   - https://api.kirillovec.ru/api/v1/auth/oauth/vk/callback
