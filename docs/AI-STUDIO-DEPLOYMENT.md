# Deploying the AI Studio backend

The public website stays on GitHub Pages. The API runs separately as a Cloudflare Worker. The deployment workflow is in GitHub Actions; it applies D1 migrations and deploys the Worker after the required GitHub repository secrets are configured.

## One-time Cloudflare setup

1. In the Cloudflare dashboard, open the account that manages `kirillovec.ru`.
2. Create a **D1 database** named `kirillovec-ai-studio`.
3. Create an **R2 bucket** named `kirillovec-ai-studio-assets`.
4. Create a custom domain for the bucket or another HTTPS-accessible R2 public domain. Use this later as `ASSETS_PUBLIC_BASE_URL`. The generation provider must be able to fetch uploaded source images from this URL.
5. In **Workers & Pages**, create/prepare the Worker named `kirillovec-ai-studio-api`. The GitHub workflow deploys the code to this Worker.
6. Create a Cloudflare API token with only the permissions needed for Workers Scripts (edit), D1 (edit), and R2 (read/write) on this account. Do not share the token in chat.
7. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `CLOUDFLARE_API_TOKEN`: the scoped Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
   - `D1_DATABASE_ID`: the ID of the D1 database created above.
8. Open **Actions → Deploy AI Studio API** in the repository and choose **Run workflow**. The workflow applies `migrations/0001_initial.sql` to D1 and deploys the Worker. It must finish successfully before continuing.
9. In the Worker settings, add the runtime variables and secret listed below. Bind the existing D1 database as `DB` and the R2 bucket as `ASSETS`; the checked-in `wrangler.toml` describes these bindings.
10. Add a Worker custom domain such as `api.kirillovec.ru` in Cloudflare. Do not create a public `workers.dev` bypass.
11. Configure Cloudflare Access for `api.kirillovec.ru`, then add the Access values to the Worker as described below.

## Worker variables and secrets

Set these Worker variables:
- `ACCESS_REQUIRED=true`
- `ACCESS_TEAM_DOMAIN`: your Cloudflare Zero Trust team domain, without scheme (for example `your-team.cloudflareaccess.com`)
- `ACCESS_AUD`: the Access application's AUD tag
- `ALLOWED_ORIGINS=https://kirillovec.ru,https://www.kirillovec.ru` (remove `www` if it is not used)
- `IMAGE_MODEL`: a currently available Replicate image model slug, for example `black-forest-labs/flux-schnell`
- `VIDEO_MODEL`: a currently available Replicate video model slug
- `ASSETS_PUBLIC_BASE_URL`: the public HTTPS base URL for the R2 bucket
- `MAX_JOBS_PER_HOUR=10`

Add `REPLICATE_API_TOKEN` as a Worker **secret**, never as a frontend variable or committed file. The Worker verifies the Cloudflare Access JWT signature, audience, issuer, and expiry for job, upload, and history endpoints. Health and capabilities do not expose credentials.

Optional own-model adapter:
- `SELF_HOSTED_API_URL`: HTTPS endpoint implementing `POST /jobs` and `GET /jobs/:id`
- `SELF_HOSTED_API_TOKEN`: Worker secret for that endpoint

The GPU inference service itself must be deployed separately.

## Frontend

After the API hostname is live and its health endpoint responds, set `apiBaseUrl` in `studio/config.js` to `https://api.kirillovec.ru`. This is public configuration, not a secret. Commit that change to `main`; the GitHub Pages workflow deploys the frontend.

## Smoke tests

- `GET https://api.kirillovec.ru/health` returns `{"ok":true,...}`.
- `GET https://api.kirillovec.ru/api/v1/capabilities` shows whether image and video providers are configured.
- Open `https://kirillovec.ru/studio/`, authenticate through Access, submit a prompt, and follow the job status.

## Important

- Model input schemas differ. The first adapter expects common Replicate fields `prompt`, `aspect_ratio`, `output_format`, optional `image`, and video `duration`. Select compatible model slugs and adapt input mapping if needed.
- R2 source files are exposed at the configured HTTPS public domain so model providers can read them. Do not upload confidential media without reviewing access and retention. For private assets, implement short-lived signed URLs instead.
- Rate limiting is per authenticated Access identity. Set provider spending limits and billing alerts before inviting other users.
- The UI does not claim generation is active until the API reports it configured.
