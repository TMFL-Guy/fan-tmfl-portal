# TMFL Commissioner Headquarters — secure publishing setup

The commissioner UI is in `commissioner/index.html`. The **Cloudflare Worker** in `commissioner/worker.js` handles GitHub OAuth and publishing. The public GitHub Pages site cannot securely store OAuth secrets.

## Setup (one time)
1. Create a Cloudflare account and a Worker named `tmfl-commissioner`; deploy the contents of `commissioner/worker.js`.
2. In GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, create an OAuth app. Set homepage to your Worker URL and authorization callback to `https://YOUR-WORKER.workers.dev/auth/callback`.
3. In Cloudflare Worker Settings, set **secrets** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` (random, 48+ characters). Set **variables** `ALLOWED_GITHUB_ID=241678722` and `GITHUB_REPO=TMFL-Guy/fan-tmfl-portal`.
4. Visit the Worker URL (not the GitHub Pages /commissioner/ URL). Sign in using the authorized GitHub account, edit JSON, and click Publish.

**Security:** OAuth authorization is verified against GitHub user ID 241678722. Tokens are stored in encrypted, HttpOnly cookies, not in the webpage or localStorage. The server restricts writable paths, validates JSON, checks request origin, and uses GitHub file SHA for conflict protection. Keep Worker secrets private. OAuth `repo` scope grants broad repository access to the signed-in OAuth token; a narrowly scoped GitHub App is preferable for stronger least privilege. The Worker uses one-hour sessions. Re-login after expiry.

The dashboard is a new lightweight editor, not a complete migration of every tool in the older local commissioner HTML. The old portal remains available separately.
