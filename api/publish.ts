import type { IncomingMessage, ServerResponse } from 'node:http';
import { executePublish, githubTransport, PublishError } from '../server/publish.ts';
// @ts-expect-error shared Node authentication module
import { authSettings, sessionValid } from '../server/presentation-auth.mjs';
const origins=new Set(['https://jaeyeonkim.kr','https://presentation-wine-ten.vercel.app']);
export default async function handler(req: IncomingMessage & {body?: unknown}, res: ServerResponse) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  const end=(status:number,body:unknown)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  if(req.method!=='POST'){res.setHeader('Allow','POST');end(405,{error:'POST 요청만 허용합니다.'});return;}
  const config=authSettings();
  const request=new Request('https://presentation-wine-ten.vercel.app/presentations/api/publish/',{headers:{cookie:req.headers.cookie||''}});
  if(!config || !sessionValid(request,config)){end(401,{error:'로그인이 만료되었습니다. 다시 로그인한 뒤 게시하세요.'});return;}
  if(!origins.has(req.headers.origin||'') || req.headers['x-presentation-publish']!=='1'){end(403,{error:'허용되지 않은 게시 요청입니다.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){end(400,{error:'게시 형식을 확인하세요.'});return;}
  const token=process.env.PRESENTATION_GITHUB_TOKEN;
  if(!token){end(503,{error:'서버 게시 연결을 준비하고 있습니다.'});return;}
  try {
    let body=req.body;
    if(body===undefined) {let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>3*1024*1024)throw new PublishError('요청 크기가 너무 큽니다.',413);}body=JSON.parse(raw);}
    else if(typeof body==='string') {if(Buffer.byteLength(body)>3*1024*1024)throw new PublishError('요청 크기가 너무 큽니다.',413);body=JSON.parse(body);}
    else if(Buffer.byteLength(JSON.stringify(body))>3*1024*1024)throw new PublishError('요청 크기가 너무 큽니다.',413);
    end(200,await executePublish(body,githubTransport(token),config.sessionKey));
  } catch(e) {end(e instanceof PublishError?e.status:502,{error:e instanceof PublishError?e.message:'게시를 완료하지 못했습니다. 편집 내용은 유지됩니다.'});}
}
