// Preview the app on this PC: serves the "app" folder at http://localhost:5500
// Uses only Node's built-in web server, nothing to install. Stop it with Ctrl+C (or close the window).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'app');
const PORT = 5500;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('Not allowed'); } // stay inside the app folder
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); // always show your latest changes
    res.end(data);
  });
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Divtracker preview: ${url}  (Ctrl+C to stop)`);
  // Open it in your browser automatically (Windows / Mac / Linux)
  const open = { win32: `start "" "${url}"`, darwin: `open "${url}"` }[process.platform] || `xdg-open "${url}"`;
  require('child_process').exec(open);
});
