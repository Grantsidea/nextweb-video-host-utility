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
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

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

function listUploads(req) {
  return fs
    .readdirSync(UPLOAD_DIR)
    .filter((name) => name !== '.gitkeep')
    .map((name) => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, name));
      return { filename: name, url: fileUrl(req, name), size_bytes: stat.size, uploaded_at: stat.mtime };
    })
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
}

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/api/files', (req, res) => res.json({ files: listUploads(req) }));

app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "video").' });
  res.status(201).json({ filename: req.file.filename, url: fileUrl(req, req.file.filename), size_bytes: req.file.size });
});

// Serves uploaded files directly as raw bytes (correct Content-Type by extension, and HTTP
// Range support out of the box) -- this is what makes the returned URL drop straight into a
// <video src="..."> tag elsewhere and just work, rather than pointing at an HTML page.
app.use('/videos', express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore' }));

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
