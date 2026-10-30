import { spawn } from 'node:child_process';
export async function localGitHub(req, res) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host) || req.headers.origin !== `http://${host}` || req.headers['x-local-publish'] !== '1' || req.method !== 'POST') {
    res.writeHead(403); res.end(); return;
  }
  try {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 60 * 1024 * 1024) throw Error('size'); }
    const { path, method, body } = JSON.parse(raw);
    const allowed = method === 'GET' && /^(git\/ref\/heads\/main|git\/commits\/[a-f0-9]{40})$/.test(path)
      || method === 'POST' && ['git/blobs','git/trees','git/commits'].includes(path)
      || method === 'PATCH' && path === 'git/refs/heads/main' && body?.force === false;
    if (!allowed) {res.writeHead(403);res.end();return;}
    const args = ['api',`repos/Recrude/presentation/${path}`,'--method',method];
    if (body !== undefined) args.push('--input','-');
    const child = spawn('gh',args,{stdio:['pipe','pipe','pipe']});
    let output = ''; child.stdout.on('data',data => output += data);
    child.stderr.resume();
    child.on('error',()=>{if(!res.writableEnded){res.writeHead(502);res.end();}});
    child.on('close',code=>{if(!res.writableEnded){res.writeHead(code ? 502 : 200,{'Content-Type':'application/json'});res.end(code ? '{"error":"GitHub request failed"}' : output);}});
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  } catch {res.writeHead(400);res.end();}
}
