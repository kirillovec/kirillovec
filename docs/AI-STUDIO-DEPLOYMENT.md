# AI Studio deployment — free-first configuration

## Current architecture

- The static site is published from GitHub Pages.
- The backend API runs in the Cloudflare Worker `kirillovec-ai-studio-api`.
- D1 database `kirillovec-ai-studio` stores jobs and rate-limit records.
- The Worker has a Workers AI binding named `AI`.
- Text-to-image uses `@cf/black-forest-labs/flux-1-schnell`.
- Uploaded-photo editing uses `@cf/black-forest-labs/flux-2-klein-4b`.
- Video mode currently prepares and copies a prompt for an external provider. It does not generate video inside this Worker.
- R2 is not required and no R2 bucket should be created for the current inline image workflow.

Cloudflare Workers AI has plan-dependent quotas and model usage. Check current account usage and pricing before relying on it. A free allowance is not an unlimited guarantee; do not add a paid provider or upgrade plan without the owner's approval.

## GitHub deployment secrets

In repository **Settings → Secrets and variables → Actions**, the API deployment workflow expects exactly these three repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`

The workflow substitutes `D1_DATABASE_ID` into a temporary copy of `wrangler.toml`, applies the D1 migrations, and deploys the Worker. Never put secret values in repository files or chat.

The workflow is **Actions → Deploy AI Studio API**. Static-site publication uses the separate **Deploy static site to GitHub Pages** workflow.

## Cloudflare Access and Worker JWT validation

Protect the custom API hostname (currently `api.kirillovec.ru`) with a Cloudflare Access application and policy. The Access policy is the external gate in front of the Worker.

The repository currently sets:

```toml
ACCESS_REQUIRED = "false"
```

This means the Worker does not perform a second JWT validation itself. That is intentional for the current setup: the custom API hostname must remain protected by Cloudflare Access. The two Worker-level variables below are therefore **not required** while `ACCESS_REQUIRED` remains false:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`

Only enable `ACCESS_REQUIRED=true` if both variables are configured in the Worker Production environment and the Access JWT validation has been deliberately tested. Do not turn it on as a troubleshooting step; a missing or incorrect value will reject API requests.

`ALLOWED_ORIGINS` should include the website origins, currently `https://kirillovec.ru,https://www.kirillovec.ru`. `MAX_JOBS_PER_HOUR` sets the per-identity generation request limit.

## Uploads and storage

The current photo-editing flow sends a resized image inline to the Worker and then to Workers AI. It does not need persistent object storage. The separate `/api/v1/assets` endpoint remains unavailable unless a storage binding and public base URL are deliberately configured. Do not create an R2 bucket for the current workflow.

## Verification checklist

1. Confirm the latest **Deploy AI Studio API** run is green in GitHub Actions.
2. Open `https://api.kirillovec.ru/health` while signed in through Cloudflare Access; expect JSON with `ok: true`.
3. Open `https://api.kirillovec.ru/api/v1/capabilities`; image should report enabled when the Workers AI binding is present. Video may remain disabled.
4. Open `https://kirillovec.ru/studio/` and test text-to-image first, then upload a JPG, PNG, or WEBP to test photo editing.
5. Video mode is a prompt handoff to the selected external service; the user uploads the source image there manually.

If a test fails, record the exact error message and check Worker logs before changing secrets or enabling paid services.
