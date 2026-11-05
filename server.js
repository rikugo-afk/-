import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const server = http.createServer(async (req, res) => {
  const pathname=new URL(req.url,'http://localhost').pathname;
  const name=pathname==='/'?'index.html':/^\/(app\.[a-f0-9]{12}\.js|style\.[a-f0-9]{12}\.css)$/.test(pathname)?pathname.slice(1):null;
  const entry=name?[name,name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html']:null;
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(fileURLToPath(new URL('dist/'+entry[0], import.meta.url)));
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }); res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load application'); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Order Desk listening on port ' + (process.env.PORT || 3000)));
