#!/usr/bin/env python3
"""InDesign 합성 글꼴(Document fonts/신중고딕+sfpro-1) → app/composite-font.json.

    python3 scripts/composite-font.py "<.../Document fonts/신중고딕+sfpro-1>"

파일 안의 rearranged font 정의에서 글꼴 슬롯별 유니코드 범위·배율·기준선을 읽는다.
글꼴 목록 순서: 0–2 = SM3SJGothic-03, 3–5 = SFProDisplay-Regular. 슬롯 0은 나머지 전부(기본).
"""
import json, re, sys
from pathlib import Path

text = Path(sys.argv[1]).read_bytes().decode('latin-1')
body = text[text.index('beginrearrangedfont'):text.index('endrearrangedfont')]
slots = []
for m in re.finditer(r'(\d+) beginusematrix \[([^\]]+)\] endusematrix\s+\1 usefont\s+\d+ beginbfrange(.*?)endbfrange', body, re.S):
    slot = int(m.group(1))
    a, _, _, _, _, ty = (float(v) for v in m.group(2).split())
    ranges = [[int(s, 16), int(e, 16)] for s, e, _ in re.findall(r'<([0-9a-f]+)> <([0-9a-f]+)> <([0-9a-f]+)>', m.group(3))]
    slots.append({'slot': slot, 'font': 'hangul' if slot < 3 else 'latin', 'scale': a, 'shift': round(-ty, 4) + 0.0, 'ranges': ranges})
# 브라우저에서 쓰는 run 종류: 같은 글꼴·배율·기준선이면 한 종류로 묶는다.
classes = {}
for s in slots:
    key = f"{s['font']}:{s['scale']}:{s['shift']}"
    c = classes.setdefault(key, {'font': s['font'], 'scale': s['scale'], 'shift': s['shift'], 'ranges': []})
    c['ranges'] += s['ranges']
out = {
    'source': Path(sys.argv[1]).name,
    'fonts': {'hangul': 'SM3SJGothic-03', 'latin': 'SFProDisplay-Regular'},
    'default': {'font': 'hangul', 'scale': 1, 'shift': 0},
    'note': 'shift = em, positive moves glyphs down (PostScript matrix ty is negated).',
    'classes': [{**c, 'ranges': sorted(c['ranges'])} for c in classes.values()],
}
dest = Path(__file__).resolve().parent.parent / 'app' / 'composite-font.json'
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
print(dest, [(c['font'], c['scale'], c['shift'], len(c['ranges'])) for c in out['classes']])
