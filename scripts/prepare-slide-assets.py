from pathlib import Path
from PIL import Image
import hashlib,json
root=Path(__file__).resolve().parents[1]
manifest={}; total=0; small=0
out=root/'public/thumbnails';out.mkdir(exist_ok=True)
for i in range(79):
 name=f'page-{i:02}'
 src=root/'public/slides'/f'{name}{"-white.png" if i in range(74,78) else ".webp"}'
 digest=hashlib.sha256(src.read_bytes()).hexdigest()[:12]
 im=Image.open(src).convert('RGB');im.thumbnail((640,640))
 thumb=out/f'{name}-{digest}.webp';im.save(thumb,'WEBP',quality=78,method=6)
 manifest[f'/slides/{name}.webp']={'full':f'/slides/{src.name}?v={digest}','thumbnail':f'/thumbnails/{thumb.name}'}
 total+=src.stat().st_size;small+=thumb.stat().st_size
(root/'app/slide-assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
print({'original_bytes':total,'thumbnail_bytes':small,'reduction_percent':round((1-small/total)*100,1)})
