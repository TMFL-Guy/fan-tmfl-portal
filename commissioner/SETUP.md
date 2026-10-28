# TMFL Commissioner Headquarters — Free GitHub Pages setup

**Current publishing method: Option B — GitHub confirmation.** No Cloudflare Worker, OAuth app, paid hosting, or API token is required.

## Open the dashboard

https://tmfl-guy.github.io/fan-tmfl-portal/commissioner/

## Publish an update

1. Choose the JSON file in Commissioner Headquarters.
2. Edit its contents (or use the Highlight Editor).
3. Click **Publish via GitHub**. Your browser downloads the updated JSON and opens that file's GitHub editor.
4. In GitHub's editor, replace the entire file contents with the contents of the downloaded JSON file.
5. Click **Commit changes** to publish to the Fan Portal.

Only GitHub accounts with write access to the repository can commit. The GitHub Pages dashboard itself is public; it does not authenticate users or grant write access. Changes made there are local until you commit on GitHub.

The old Cloudflare Worker source (`commissioner/worker.js`) is retained only as an unused alternative. It is not required for Option B.

This lightweight dashboard currently edits official results, highlights, news, and alerts. It is not yet a full migration of the original standalone Commissioner Portal.
