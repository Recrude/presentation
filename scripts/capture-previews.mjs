import { capture } from '../api/capture.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('public/previews',{recursive:true});
for(const [name,url] of [['ved','https://ved.kr/'],['now','https://whatareyoudoingnow.vercel.app/'],['jaeyeon','https://jaeyeonkim.kr/'],['youtube-QIAcSGkOLDk','https://www.youtube-nocookie.com/embed/QIAcSGkOLDk']]) {
 await writeFile(`public/previews/${name}.jpg`,await capture(url)); console.log(name,'captured');
}
