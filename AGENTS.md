# AGENTS.md

## Repo Shape
- This repo is a single static page. `index.html` contains the UI, styles, and all client-side logic inline.
- There is no package manager, build step, test runner, lint config, or CI workflow in the repo. Do not assume Node/Vite/npm commands exist.
- `api-notes.md` is the only repo-local API reference and should be treated as the source of truth for endpoint paths, headers, and payload shapes.

## Current Intent
- `index.html` started as a test/debug page, but the current requirement is to use it directly in the real environment.
- Prefer production-facing changes over adding more debug tooling, mock flows, or test-only copy.
- If you change wording or UI, remove or downplay `Debug` / `调试` framing instead of extending it.

## API Facts That Matter
- Current backend base URL in the repo is `http://yushi.tjnu.edu.cn:61004/brmcsf/`.
- Login flow is `POST api/logon/login?time=<timestamp>` with JSON body `{ code, password }`, where `password` must be the MD5 of the plaintext password.
- `index.html` currently computes MD5 in-browser via the external CDN script `https://cdn.jsdelivr.net/npm/blueimp-md5@2.19.0/js/md5.min.js`. Do not break login by removing that dependency without replacing the hashing step.
- After login, later business requests require `token` and `loginid` headers. Endpoint details for rooms, time slots, booking, and order lookup are already listed in `api-notes.md`.

## Editing Guidance
- Keep the app runnable as a plain HTML file; avoid introducing framework, bundler, or server assumptions unless the user explicitly asks for a stack change.
- When backend request details change, update both `index.html` and `api-notes.md` together so the live page and local API notes stay aligned.
- Optional: **merge `conf/accounts.env` from the browser** without uploading the whole file: run `scripts/save_accounts_conf_server.py` behind Nginx with `proxy_set_header X-Shower-Internal 1` and `auth_basic` (see `api-notes.md` §8). Set `<meta name="shower-conf-merge-url" content="/api/merge-accounts-env">` when deploying.

## Verification
- There is no automated verification in this repo. Validation is manual by opening `index.html` in a browser and exercising the real API flow.
