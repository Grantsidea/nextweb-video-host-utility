# nextweb-video-host-utility

A throwaway, single-purpose helper: upload a handful of video files, get back real, direct,
public URLs for each one. It has no accounts, no database, and no relationship to the real
NextWeb/DiscoverWebsites.com codebase -- it exists purely so you have real URLs to plug into the
`membership-video-test` app's seed data instead of committing video binaries into that repo.

Delete this repo and its Railway project once you've got your URLs. There's nothing here worth
keeping past that point.

## What it does

- One page (`/`): a file upload form, and a list of everything uploaded so far with a "Copy" button
  next to each direct URL.
- `POST /upload` (multipart field name `video`): saves the file to disk under a randomized
  filename and returns `{ url, filename, size_bytes }`.
- `GET /videos/<filename>`: serves the raw file directly (correct `Content-Type`, HTTP Range
  support for scrubbing) -- this is the URL you paste elsewhere into an HTML5 `<video src="...">`.
- `GET /api/files`: JSON list of everything uploaded (backs the page's list; reads the `uploads/`
  directory directly, there's no database).
- `GET /health`: returns `{"ok":true}`, 200.

No login of any kind -- anyone who knows the URL could upload or browse the list. That's an
accepted tradeoff for a tool you'll use once or twice and then delete, not something worth adding
auth for.

**Uploads do not survive a Railway redeploy.** Railway's filesystem resets on every deploy. Get
your 4 URLs, copy them out, and use them immediately -- don't treat this as long-term storage.

## Run locally

```bash
npm install
npm start
# open http://localhost:4100
```

## Environment variables (Railway)

| Variable | Required? | Notes |
|---|---|---|
| `PORT` | No | Railway sets this automatically. |
| `MAX_UPLOAD_MB` | No | Defaults to `2048` (2 GB). Only a sanity backstop against an accidental huge upload -- lower it if you want, e.g. `MAX_UPLOAD_MB=500`. |

Nothing else. No database, no secrets, no API keys.

## Deploying to Railway

1. Create a new Railway project from this repo (Railway auto-detects it as a Node app from
   `package.json` -- no Dockerfile/Procfile needed, `railway.json` already sets the start command
   and health check).
2. Deploy. No environment variables are required to get it running.
3. Open the app at the Railway-generated `*.up.railway.app` URL, upload your 4 clips, copy each
   direct URL.
4. When you're done: delete the Railway project and this GitHub repo. There is nothing to migrate
   or preserve.
