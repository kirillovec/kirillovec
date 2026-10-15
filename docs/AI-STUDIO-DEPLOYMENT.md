# Deploying the AI Studio backend

The public website stays on GitHub Pages. The API runs separately as a Cloudflare Worker.

## Resources
1. Create a Cloudflare Worker named `kirillovec-ai-studio-api`.
2. Create D1 database `kirillovec-ai-studio` and R2 bucket `kirillovec-ai-studio-assets`.
3. Replace the placeholder `database_id` in `wrangler.toml` with the actual D1 ID; set the actual bucket name if needed.
4. Apply `migrations/0001_initial.sql` to D1; bind D1 as `DB` and R2 as `ASSETS`.
5. Optionally create KV and bind it as `JWKS_CACHE`.
6. Route a custom hostname such as `api.kirillovec.ru` to this Worker. Keep `workers_dev=false`; don't expose a bypass hostname that avoids Access.

## Access and secrets
Create a Cloudflare Access self-hosted application for the API hostname. Configure Worker variables:
- `ACCESS_REQUIRED=true`
- `ACCESS_TEAM_DOMAIN`: your team domain, without scheme
- `ACCESS_AUD`: the Access application's AUD tag
- `ALLOWED_ORIGINS=https://kirillovec.ru,https://www.kirillovec.ru` (adjust to actual canonical domain)
- `IMAGE_MODEL`: available Replicate model slug, e.g. `black-forest-labs/flux-schnell`
- `VIDEO_MODEL`: currently available Replicate video model slug
- `ASSETS_PUBLIC_BASE_URL`: HTTPS public/custom domain for the R2 bucket
- `MAX_JOBS_PER_HOUR=10`

Add `REPLICATE_API_TOKEN` as a Worker **secret**, never a GitHub file or frontend variable. The Worker verifies the Cloudflare Access JWT signature, audience, issuer and expiry for job, upload and history endpoints. Health and capabilities expose no credentials.

Optional own-model adapter:
- `SELF_HOSTED_API_URL`: HTTPS endpoint implementing `POST /jobs` and `GET /jobs/:id`
- `SELF_HOSTED_API_TOKEN`: Worker secret for that endpoint
The GPU inference service itself must be deployed separately.

## Frontend
Set `apiBaseUrl` in `studio/config.js` to the API origin, e.g. `https://api.kirillovec.ru`. This URL is public configuration, not a secret. The GitHub Pages workflow deploys the frontend when changes reach `main`.

## Smoke tests
- `GET https://api.kirillovec.ru/health` returns `{"ok":true,...}`.
- `GET https://api.kirillovec.ru/api/v1/capabilities` shows configured model availability.
- Open `https://kirillovec.ru/studio/`, authenticate via Access, submit a prompt and follow the job status.
- Job status values are provider-driven: typically `starting`, `processing`, `succeeded`, `failed`, or `canceled`.

## Important
- Model input schemas differ. The first adapter expects common Replicate fields `prompt`, `aspect_ratio`, `output_format`, optional `image`, and video `duration`. Select compatible model slugs and adapt input mapping if needed.
- R2 source files are exposed at the configured HTTPS public domain so model providers can read them. Don't upload confidential media without reviewing access and retention. For private assets, implement short-lived signed URLs instead.
- Rate limiting is per authenticated Access identity. Set provider spending limits and billing alerts before inviting other users.
- The UI does not claim generation is active until the API reports it configured.
