# nextweb-video-host-utility

A throwaway, single-purpose helper: upload a handful of video files, get back a real, live,
hosted page for each one with the video actually embedded in it -- not just a raw file URL. It
has no accounts, no database, and no relationship to the real NextWeb/DiscoverWebsites.com
codebase -- it exists purely so you have real pages to plug into the `membership-video-test`
app's seed data instead of committing video binaries into that repo.

Delete this repo and its Railway project once you've got your URLs. There's nothing here worth
keeping past that point.

## What it does

- One page (`/`): a file upload form (with optional page name/title fields), and a list of
  everything uploaded so far with a "Copy" button next to each page URL.
- `POST /upload` (multipart field name `video`; optional fields `slug` and `title`): saves the
  file to disk under a randomized filename, then writes a real static HTML page to disk at
  `pages/<slug>.html` with that video embedded via a genuine `<video>` tag -- not a mockup, not
  assembled per-request, an actual file served the same way `/videos/<file>` is. `slug` defaults
  to a sanitized version of the original filename (auto-deduped with a numeric suffix on
  collision, e.g. `creator-1-2`) if omitted; `title` defaults to a title-cased version of the
  slug. Returns `{ slug, title, page_url, video_url, filename, size_bytes }` -- **`page_url` is
  the one to use elsewhere**, not `video_url`.
- `GET /<slug>.html`: the real hosted page -- title/heading plus the embedded video. This is what
  you paste in as a creator's website/video source elsewhere.
- `GET /videos/<filename>`: still serves the raw file directly (correct `Content-Type`, HTTP
  Range support for scrubbing) -- this is what each generated page's `<video src="...">` points
  at, and still available directly if you ever need the raw file instead of the page.
- `GET /api/files`: JSON list of every generated page (backs the page's list; reads the `pages/`
  directory directly and reads title/video URL back out of each page's own HTML -- there's no
  database, so the page files themselves are the source of truth).
- `GET /health`: returns `{"ok":true}`, 200.

Uploads made before this feature existed (raw files with no corresponding page) won't show up in
the listing or have a `page_url` -- re-upload them to get a real page.

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
