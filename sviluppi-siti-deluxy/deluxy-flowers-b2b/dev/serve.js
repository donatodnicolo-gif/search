/* Server statico per l'anteprima locale (dev/out). Porta 3230. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const PORT = Number(process.env.PORT) || 3230;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/contact') { res.writeHead(302, { Location: '/pages/richiedi-un-progetto?inviato=1' }); return res.end(); }
  let file = path.join(OUT, url);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(OUT, '404.html');
  const ext = path.extname(file);
  res.writeHead(fs.existsSync(file) ? 200 : 404, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('Anteprima tema su http://localhost:' + PORT));
