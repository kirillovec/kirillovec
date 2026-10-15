# Deploying the AI Studio backend — free-first configuration

The site stays on GitHub Pages. The API runs as a Cloudflare Worker. This configuration deliberately does **not** require R2, a paid GPU, or an external paid generation API to deploy the basic backend. It uses Cloudflare Workers and D1, subject to Cloudflare's current free-plan quotas and terms. Always check the current plan and usage in your dashboard; no service can be promised free without checking your account.

## Required one-time setup

1. In Cloudflare, create a D1 database named `kirillovec-ai-studio` (check the current free allowance before use).
2. In **Workers & Pages**, the deployment workflow will deploy the Worker `kirillovec-ai-studio-api`.
3. Create a scoped Cloudflare API token with Workers Scripts edit and D1 edit permissions for this account. Do not share it in chat.
4. In GitHub repository **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `D1_DATABASE_ID`
5. Open **Actions → Deploy AI Studio API → Run workflow**. The workflow applies the D1 migration and deploys the Worker.
6. Add a custom domain such as `api.kirillovec.ru` to the Worker. Keep the site on GitHub Pages.
7. Configure Cloudflare Access for the API hostname.

## Worker variables

- `ACCESS_REQUIRED=true`
- `ACCESS_TEAM_DOMAIN`: your Cloudflare Zero Trust team domain, without scheme
- `ACCESS_AUD`: the Access application's AUD tag
- `ALLOWED_ORIGINS=https://kirillovec.ru,https://www.kirillovec.ru` (remove `www` if unused)
- `MAX_JOBS_PER_HOUR=10`

The Worker has no provider configured by default. Image/video generation remains disabled until a provider is deliberately configured. External inference providers such as Replicate may charge per use; do not add a paid provider or token unless you have reviewed its pricing and chosen to enable it.

## Free-first limitations

- **Image/video generation:** a Worker does not provide a free GPU. Real generation requires a model running on hardware you control or a provider with a currently available free allowance. Free allowances may be limited or change; check terms and usage before enabling.
- **Uploads:** R2 is intentionally optional and not bound in the default setup. Upload endpoints remain disabled until you explicitly choose a storage provider. This avoids creating an R2 bucket or exposing storage costs.
- **Own model:** set `SELF_HOSTED_API_URL` only if you already operate a compatible inference endpoint on hardware you control. A home PC/GPU can incur electricity and internet costs and must be secured.
- **Spending safety:** keep provider tokens out of GitHub files and frontend code. Configure hard spending limits wherever available before testing.

## Smoke tests

- `GET https://api.kirillovec.ru/health` should return `{"ok":true,...}`.
- `GET https://api.kirillovec.ru/api/v1/capabilities` should show image/video disabled until a provider is intentionally configured.
- Open `https://kirillovec.ru/studio/` after the frontend API URL is configured.

The frontend API URL is public configuration, not a secret. Set `apiBaseUrl` in `studio/config.js` to `https://api.kirillovec.ru` only after the API hostname exists and passes its health check.
