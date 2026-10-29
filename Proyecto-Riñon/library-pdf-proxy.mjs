import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Solo se sirven los documentos que ya pertenecen al catálogo del Atlas.
const html = fs.readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const documentIds = new Set([...html.matchAll(/data-preview-url="https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/preview"/g)].map(match => match[1]));
let sharedAgent;

function proxyAgent() {
  const value = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!value) return undefined;
  if (sharedAgent) return sharedAgent;
  const proxy = new URL(value);
  if (!['http:', 'https:'].includes(proxy.protocol)) return undefined;
  const agent = new https.Agent({keepAlive: true, maxSockets: 6});
  agent.createConnection = (options, callback) => {
    const headers = {Host: `${options.host}:${options.port || 443}`};
    if (proxy.username) headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`;
    const connect = (proxy.protocol === 'https:' ? https : http).request({hostname: proxy.hostname, port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80), method: 'CONNECT', path: `${options.host}:${options.port || 443}`, headers, agent: false});
    let finished = false;
    const done = (error, socket) => { if (!finished) { finished = true; callback(error, socket); } };
    connect.once('error', done);
    connect.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) { socket.destroy(); done(new Error('No se pudo conectar con el documento.')); return; }
      if (head.length) socket.unshift(head);
      const secure = tls.connect({...options, socket, servername: options.servername || options.host});
      secure.once('error', done);
      secure.once('secureConnect', () => done(null, secure));
    });
    connect.setTimeout(30000, () => connect.destroy(new Error('Tiempo de conexión agotado.')));
    connect.end();
  };
  sharedAgent = agent;
  return agent;
}

export function serveLibraryPdf(req, res, pathname) {
  const match = pathname.match(/^\/api\/library-pdf\/([\w-]+)$/);
  if (!match) return false;
  if (!documentIds.has(match[1])) { res.writeHead(404); res.end('Documento no disponible.'); return true; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {Allow: 'GET, HEAD'}); res.end(); return true; }
  const range = req.headers.range || 'bytes=0-';
  if (!/^bytes=\d+-\d*$/.test(range)) { res.writeHead(416); res.end(); return true; }
  const agent = proxyAgent();
  const url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(match[1])}&export=download&confirm=t`;
  const upstream = https.get(url, {agent, headers: {Range: range, 'User-Agent': 'Atlas-Renal-PDF-Reader'}}, response => {
    if (![200, 206].includes(response.statusCode) || /text\/html/.test(response.headers['content-type'] || '')) {
      response.destroy(); res.writeHead(502); res.end('No se pudo cargar el PDF desde Google Drive.'); return;
    }
    const headers = {'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=300'};
    for (const key of ['content-length', 'content-range']) if (response.headers[key]) headers[key] = response.headers[key];
    if (!req.headers.range) delete headers['content-range'];
    res.writeHead(req.headers.range ? response.statusCode : 200, headers);
    if (req.method === 'HEAD') { response.destroy(); res.end(); }
    else { response.once('error', () => res.destroy()); response.pipe(res); }
  });
  upstream.setTimeout(45000, () => upstream.destroy(new Error('Tiempo de carga agotado.')));
  upstream.once('error', () => {
    if (!res.headersSent) { res.writeHead(502); res.end('No se pudo cargar el documento.'); }
    else res.destroy();
  });
  res.once('close', () => { if (!res.writableFinished) upstream.destroy(); });
  return true;
}
