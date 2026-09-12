const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const PORT = process.env.PORT || 4100;
// Generous backstop, not a real content policy -- this tool is for one person to move a
// handful of test clips through, not to be a public upload service. Disk-streamed by multer,
// so a large file doesn't blow up server memory; this just guards against an accidental
// runaway upload eating all of Railway's disk.
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PAGES_DIR = path.join(__dirname, '..', 'pages');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PAGES_DIR, { recursive: true });

const app = express();
app.use(express.urlencoded({ extended: false })); // multer leaves other form fields as strings here

// No accounts, no login -- this tool is explicitly single-user (see README). Anyone who knows
// the Railway subdomain could technically hit /upload too; that's an accepted tradeoff for a
// throwaway tool you'll delete once you have your 4 URLs, not something to build auth around.
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const unique = crypto.randomBytes(4).toString('hex');
    cb(null, `${Date.now()}-${unique}${base ? `-${base}` : ''}${ext}`);
  },
});

// Format is deliberately NOT restricted (mp4 preferred, but anything is accepted) -- per the
// brief, this just needs to hand back a working direct URL for whatever file comes in.
const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES } });

function fileUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/videos/${encodeURIComponent(filename)}`;
}

function pageUrl(req, slug) {
  return `${req.protocol}://${req.get('host')}/${encodeURIComponent(slug)}.html`;
}

function escHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function titleFromSlug(slug) {
  return (
    slug
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Video'
  );
}

// Auto-dedupes rather than rejecting -- this is a single-person throwaway tool re-run a handful
// of times, not a system where a slug collision should block an upload that already succeeded.
function uniqueSlug(candidate) {
  const base = slugify(candidate) || 'page';
  let slug = base;
  let n = 2;
  while (fs.existsSync(path.join(PAGES_DIR, `${slug}.html`))) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

// A real, live, static HTML file written to disk and served the same way /videos/<file> is --
// not a mockup and not dynamically assembled per-request. This is the actual page a viewer
// lands on: the video is embedded directly in it with a real <video> tag, not linked to from a
// separate page.
function buildPageHtml({ title, videoUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(title)}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 16px; }
  video { width: 100%; max-height: 480px; background: #000; border-radius: 8px; display: block; }
</style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <video src="${escHtml(videoUrl)}" controls playsinline></video>
</body>
</html>
`;
}

// No database -- the pages themselves are the source of truth. Reading title/video back out of
// each generated file (rather than tracking it separately) means the listing can never drift
// from what's actually being served.
function listPages(req) {
  return fs
    .readdirSync(PAGES_DIR)
    .filter((name) => name.endsWith('.html'))
    .map((name) => {
      const slug = name.slice(0, -'.html'.length);
      const html = fs.readFileSync(path.join(PAGES_DIR, name), 'utf8');
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      const videoMatch = html.match(/<video[^>]*\ssrc="([^"]*)"/);
      const videoUrl = videoMatch ? videoMatch[1] : null;
      const stat = fs.statSync(path.join(PAGES_DIR, name));

      let sizeBytes = null;
      if (videoUrl) {
        try {
          const videoFilename = decodeURIComponent(videoUrl.split('/videos/')[1] || '');
          if (videoFilename) sizeBytes = fs.statSync(path.join(UPLOAD_DIR, videoFilename)).size;
        } catch {
          // The underlying file may have been removed by hand -- the page itself still exists
          // and is still listed, just without a size.
        }
      }

      return {
        slug,
        title: titleMatch ? titleMatch[1] : slug,
        video_url: videoUrl,
        page_url: pageUrl(req, slug),
        size_bytes: sizeBytes,
        created_at: stat.mtime,
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/api/files', (req, res) => res.json({ files: listPages(req) }));

// Body field `slug` (optional): the page's URL name, e.g. "creator-1" -> /creator-1.html.
// Body field `title` (optional): defaults to a title-cased version of the slug.
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "video").' });

  const requestedSlug = (req.body && req.body.slug) || path.basename(req.file.originalname, path.extname(req.file.originalname));
  const slug = uniqueSlug(requestedSlug);
  const title = (req.body && req.body.title && req.body.title.trim()) || titleFromSlug(slug);
  const videoUrl = fileUrl(req, req.file.filename);

  fs.writeFileSync(path.join(PAGES_DIR, `${slug}.html`), buildPageHtml({ title, videoUrl }));

  res.status(201).json({
    slug,
    title,
    page_url: pageUrl(req, slug),
    video_url: videoUrl,
    filename: req.file.filename,
    size_bytes: req.file.size,
  });
});

// Serves uploaded files directly as raw bytes (correct Content-Type by extension, and HTTP
// Range support out of the box) -- this is what the generated pages' <video src="..."> points
// at, and still available directly if you ever need the raw file instead of the page.
app.use('/videos', express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore' }));

// Real static files, same mechanism as /videos above -- GET /<slug>.html returns actual bytes
// from disk, not a dynamically-assembled response.
app.use(express.static(PAGES_DIR, { index: false, dotfiles: 'ignore' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Max is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`nextweb-video-host-utility listening on http://localhost:${PORT}`);
});
