# Secure TMFL Commissioner Publishing — deployment required

This repository contains **source code only**. GitHub Pages cannot securely restrict a public HTML page or store GitHub OAuth secrets. The existing public `/commissioner/` page is **not private** until it is removed or replaced.

## Required setup (owner: TMFL-Guy)

1. Create a GitHub OAuth App in GitHub Developer Settings. Set its authorization callback URL to `https://YOUR-WORKER-DOMAIN/callback`. Keep the OAuth client secret private.
2. Create a Cloudflare Worker, deploying `secure-publisher/worker.js`. Configure secrets `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (a long random secret), and `OWNER_GITHUB_ID` (the numeric GitHub account ID of TMFL-Guy, not a guessed value). Never commit these secrets.
3. Bundle the original Commissioner Portal as a **private Worker static asset** named `index.html` and configure `env.ASSETS`. Do not publish that dashboard on GitHub Pages. The Worker must gate asset requests; do not enable an independent public asset URL.
4. Connect the original dashboard's Save & Publish buttons to `POST /api/publish` with JSON `{"file":"tmfl-official-results.json","content":"{...JSON text...}"}`. Same-origin cookies authenticate the request. Existing portal publishing controls do not yet call this endpoint.
5. Verify login as TMFL-Guy, confirm a different GitHub account receives 403, verify data persistence and publishing, then remove the public `commissioner/index.html` from GitHub Pages (or replace it with a redirect to the secure Worker). **Do not remove it before migrating your saved data.**

### Security and limitations
- Login uses GitHub OAuth, numeric owner ID verification, signed/encrypted HttpOnly session cookie, CSRF Origin check, and an explicit file allowlist.
- The OAuth App requests the broad `repo` scope because GitHub OAuth Apps cannot restrict scopes to one repository. A GitHub App with fine-grained permissions is a stronger future alternative.
- This Worker is a deployment starting point, not a completed production installation. Validate and test before trusting it with real data.
- GitHub Pages deployment happens automatically after a successful commit if Pages is configured to deploy from main.
- Browser localStorage on the old file:// portal does **not** automatically migrate to the hosted portal. Back up and import your saved content before changing locations.
- The uploaded `tmfl-news-settings (1).json` contains an **unpublished** article; it has intentionally **not** been added to the public repository.
