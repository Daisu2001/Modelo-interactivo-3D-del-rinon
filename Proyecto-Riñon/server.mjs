import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const port=Number(process.env.PORT||8080);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  let filename;try{filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);res.end('Solicitud inválida');return;}
  if(filename!==root&&!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');
  fs.stat(filename,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Archivo no encontrado');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(filename).pipe(res);});
});
server.listen(port,'127.0.0.1',()=>console.log(`Atlas renal listo: http://localhost:${port}\nCtrl+C para detener. No requiere npm install.`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`El puerto ${port} está ocupado. En Git Bash usa: PORT=8081 npm start`:e.message);process.exitCode=1;});
