import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const secret=randomBytes(32).toString('hex');
export async function localPublish(req,res,executePublish) {
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host) || req.headers.origin!==`http://${host}` || req.headers['x-presentation-publish']!=='1' || req.method!=='POST'){res.writeHead(403);res.end('{}');return;}
  const git=(path,method='GET',body)=>new Promise((resolve,reject)=>{
    const args=['api',`repos/Recrude/presentation/${path}`,'--method',method];if(body!==undefined)args.push('--input','-');
    const child=spawn('gh',args,{stdio:['pipe','pipe','pipe']});let output='';
    child.stdout.on('data',data=>output+=data);child.stderr.resume();child.on('error',reject);
    child.on('close',code=>{if(code)reject(Error('GitHub 게시 실패'));else{try{resolve(JSON.parse(output));}catch(e){reject(e);}}});
    child.stdin.end(body===undefined?undefined:JSON.stringify(body));
  });
  try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>3*1024*1024)throw Error('요청 크기가 너무 큽니다.');}
    res.end(JSON.stringify(await executePublish(JSON.parse(raw),git,secret)));
  }catch(e){res.statusCode=e.status||502;res.end(JSON.stringify({error:e.message||'게시 실패'}));}
}
