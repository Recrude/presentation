#!/usr/bin/env python3
"""PDF 발표 장표 → 공개 발표(public/decks/<id>/)와 목록 항목.

    python3 scripts/pdf-deck.py <발표.pdf> --title "Title" --date 2026-01-15 --slug 260115-codeclub [--venue "Code Club"] [--public]
        [--id deck-…] [--after <목록 항목 id>] [--mask 14:1025,733;1137,743;1137,758;1025,748]

- 쪽마다 한 장의 '조판면'(folio) 장표가 된다. 가로 3840px(2x) webp q80, 세로는 쪽 비율.
- --mask 쪽:x,y;x,y;… 는 PDF 좌표(pt, 왼쪽 위 기준)의 다각형을 둘레의 밝은 바탕색으로 덮는다(연락처 가리기 등).
- 파일은 SHA-256 이름으로 assets/ 에 두고, deck.json 은 게시 서버가 쓰는 것과 같은 형식이다.
- 목록(catalog.json)에는 새 항목을 --after 뒤(없으면 예전 외부 발표들 앞)에 넣는다. 같은 id가 있으면 제목·날짜·슬러그만 고친다.
- 같은 --id 로 다시 돌리면 장표를 새로 만든다(편집기에서 고친 내용은 덮어쓴다).
"""
import argparse, hashlib, io, json, re, subprocess, sys, tempfile, uuid
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('pdf', type=Path)
ap.add_argument('--title', required=True)
ap.add_argument('--date', required=True)
ap.add_argument('--slug', required=True)
ap.add_argument('--venue')
ap.add_argument('--id', default=f'deck-{uuid.uuid4()}')
ap.add_argument('--public', action='store_true')
ap.add_argument('--after')
ap.add_argument('--mask', action='append', default=[])
ap.add_argument('--width', type=int, default=3840)
a = ap.parse_args()
assert re.fullmatch(r'deck-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', a.id), a.id
assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', a.slug) and len(a.slug) <= 64, a.slug
datetime.strptime(a.date, '%Y-%m-%d')

info = subprocess.run(['pdfinfo', str(a.pdf)], capture_output=True, text=True, check=True).stdout
pages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
pw, ph = map(float, re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info).groups())
W, H = a.width, round(a.width * ph / pw)
scale = W / pw
masks = {}
for m in a.mask:
    page, points = m.split(':')
    masks.setdefault(int(page), []).append([tuple(float(v) * scale for v in p.split(',')) for p in points.split(';')])

def pixels(im):
    data = im.tobytes()
    return [tuple(data[i:i + 3]) for i in range(0, len(data), 3)]

def cover(im, polygon):
    """Fill a polygon with the median of the light pixels in a ring around it (the paper)."""
    xs, ys = [p[0] for p in polygon], [p[1] for p in polygon]
    box = (int(min(xs)) - 12, int(min(ys)) - 12, int(max(xs)) + 12, int(max(ys)) + 12)
    ring = [px for px in pixels(im.crop(box)) if sum(px) > 600]
    fill = tuple(sorted(c[i] for c in ring)[len(ring) // 2] for i in range(3)) if ring else (255, 255, 255)
    ImageDraw.Draw(im).polygon(polygon, fill=fill)

def palette(im):
    """Same sample as app/folio-palette.ts: the median left of the original folio number."""
    k = W / 3840
    px = pixels(im.crop((round(130 * k), round(90 * k), round(165 * k), round(145 * k))))
    r, g, b = (sorted(p[i] for p in px)[len(px) // 2] for i in range(3))
    lin = [(v / 255) / 12.92 if v / 255 <= .04045 else ((v / 255 + .055) / 1.055) ** 2.4 for v in (r, g, b)]
    lum = lin[0] * .2126 + lin[1] * .7152 + lin[2] * .0722
    return {'background': f'#{r:02x}{g:02x}{b:02x}', 'foreground': '#000000' if (lum + .05) / .05 >= 1.05 / (lum + .05) else '#ffffff'}

deck_dir = WEB / 'public' / 'decks' / a.id
(deck_dir / 'assets').mkdir(parents=True, exist_ok=True)
slides, assets = [], {}
with tempfile.TemporaryDirectory() as tmp:
    for n in range(1, pages + 1):
        out = Path(tmp) / f'p{n}'
        subprocess.run(['pdftoppm', '-f', str(n), '-l', str(n), '-singlefile', '-scale-to-x', str(W), '-scale-to-y', str(H), '-png', str(a.pdf), str(out)], check=True)
        im = Image.open(f'{out}.png').convert('RGB')
        for polygon in masks.get(n, []): cover(im, polygon)
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=80, method=6); data = buf.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        (deck_dir / 'assets' / f'{digest}.webp').write_bytes(data)
        photo = {'id': str(uuid.uuid4()), 'name': f'p{n:02}.webp', 'width': W, 'height': H}
        assets[photo['id']] = f'/presentations/decks/{a.id}/assets/{digest}.webp'
        slides.append({'id': str(uuid.uuid4()), 'title': f'{n}쪽', 'kind': 'folio', 'src': '', 'hidden': False, 'photos': [photo], 'folioPalette': palette(im)})
        print(f'{n}/{pages}', f'{len(data) / 1e3:.0f}KB', '가림' if n in masks else '', file=sys.stderr)
# Remove files of an earlier run that the new deck no longer uses.
used = {Path(v).name for v in assets.values()}
for f in (deck_dir / 'assets').iterdir():
    if f.name not in used: f.unlink()
snapshot = {'version': 1, 'slug': a.id, 'slides': slides, 'assets': assets, 'publishedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
(deck_dir / 'deck.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')

catalog_path = WEB / 'public' / 'decks' / 'catalog.json'
catalog = json.loads(catalog_path.read_text())
item = {'id': a.id, 'public': a.public, 'presentation': {'title': a.title, 'date': a.date, 'slug': a.slug, **({'venue': a.venue.strip()} if a.venue else {})}}
existing = next((i for i in catalog['items'] if i['id'] == a.id), None)
if existing: existing['presentation'] = item['presentation']; existing['public'] = a.public
else:
    ids = [i['id'] for i in catalog['items']]
    at = ids.index(a.after) + 1 if a.after else next((k for k, i in enumerate(ids) if i.startswith('legacy-')), len(ids))
    catalog['items'].insert(at, item)
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'id': a.id, 'slides': len(slides), 'size': [W, H], 'bytes': sum((deck_dir / 'assets' / n).stat().st_size for n in used)}))
