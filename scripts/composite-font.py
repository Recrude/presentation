#!/usr/bin/env python3
"""InDesign 합성 글꼴 → app/composite-font.json.

    python3 scripts/composite-font.py "<…/Document fonts/신중고딕+sfpro-1>" "<…/2608_김재연_포트폴리오.idml>"

- 글자 범주(한글·구두점·기호·로마자·번호)의 유니코드 범위: 패키지의 합성 글꼴 파일(rearranged font)에서 읽는다.
  InDesign 기본 범주를 그대로 쓰므로 같은 문서의 다른 합성 글꼴에도 같은 범위를 쓴다.
- 합성 글꼴별 글꼴·크기·기준선·장평: IDML Resources/Fonts.xml 의 CompositeFontEntry 에서 읽는다.
  기준선은 em 비율로 바꾸고 아래쪽을 +로 둔다(IDML −5 = 0.05em 아래, 포트폴리오 PDF 실측과 일치).
"""
import json, re, sys, zipfile
from pathlib import Path
from html import unescape

binary, idml = Path(sys.argv[1]), Path(sys.argv[2])
COMPOSITES = {'regular': '신중고딕+sfpro-1', 'bold': '$ID/볼드'}
CATEGORIES = ['hangul', 'punctuation', 'symbols', 'alphabetic', 'numbers']  # 파일의 슬롯 1–5; 0 = base(나머지)
ENTRY = {'$ID/Hangul': 'hangul', '한글': 'hangul', '구두점': 'punctuation', '기호': 'symbols', '로마자': 'alphabetic', '번호': 'numbers', '기본': 'base'}
# (InDesign 글꼴 패밀리, 스타일) → PostScript 이름. 새 글꼴을 쓰면 여기에 더한다.
POSTSCRIPT = {
    ('SM3SJGothic', '03'): 'SM3SJGothic-03',
    ('SF Pro Display', 'Regular'): 'SFProDisplay-Regular',
    ('SM3KGothic', 'Regular'): 'SM3KGothic-Regular',
    ('Pretendard', 'Bold'): 'Pretendard-Bold',
    ("Suisse Int'l (OTF)", 'Semi Bold'): 'SuisseIntl-SemiBold',
    ("Suisse Int'l (OTF)", 'Semi Bold Italic'): 'SuisseIntl-SemiBoldItalic',
}
# CSS local() 에서 찾을 이름(PostScript 이름과 전체 이름).
LOCAL = {
    'SM3SJGothic-03': ['SM3SJGothic-03', 'SM3SJGothic 03'],
    'SFProDisplay-Regular': ['SFProDisplay-Regular', 'SF Pro Display Regular'],
    'SM3KGothic-Regular': ['SM3KGothic-Regular', 'SM3KGothic Regular'],
    'Pretendard-Bold': ['Pretendard-Bold', 'Pretendard Bold'],
    'SuisseIntl-SemiBold': ['SuisseIntl-SemiBold', "Suisse Int'l Semi Bold"],
    'SuisseIntl-SemiBoldItalic': ['SuisseIntl-SemiBoldItalic', "Suisse Int'l Semi Bold Italic"],
}

text = binary.read_bytes().decode('latin-1')
body = text[text.index('beginrearrangedfont'):text.index('endrearrangedfont')]
categories = []
for m in re.finditer(r'(\d+) beginusematrix \[[^\]]+\] endusematrix\s+\1 usefont\s+\d+ beginbfrange(.*?)endbfrange', body, re.S):
    slot = int(m.group(1))
    ranges = sorted([int(s, 16), int(e, 16)] for s, e, _ in re.findall(r'<([0-9a-f]+)> <([0-9a-f]+)> <([0-9a-f]+)>', m.group(2)))
    categories.append({'name': CATEGORIES[slot - 1], 'ranges': ranges})
assert [c['name'] for c in categories] == CATEGORIES, categories

fonts_xml = zipfile.ZipFile(idml).read('Resources/Fonts.xml').decode('utf-8')
composites, used = {}, []
for key, name in COMPOSITES.items():
    block = re.search(r'<CompositeFont [^>]*Name="%s"[^>]*>(.*?)</CompositeFont>' % re.escape(name), fonts_xml, re.S).group(1)
    styles = {}
    for e in re.finditer(r'<CompositeFontEntry ([^>]*)>(.*?)</CompositeFontEntry>', block, re.S):
        a = dict(re.findall(r'(\w+)="([^"]*)"', e.group(1)))
        family = unescape(re.search(r'<AppliedFont[^>]*>([^<]*)</AppliedFont>', e.group(2)).group(1))
        style = a['FontStyle'].replace('$ID/', '')
        ps = POSTSCRIPT[(family, style)]
        used.append(ps)
        styles[ENTRY[a['Name']]] = {'font': ps, 'scale': float(a['RelativeSize']) / 100, 'shift': -float(a['BaselineShift']) / 100 + 0.0, 'hscale': float(a['HorizontalScale']) / 100}
    composites[key] = {'name': name.replace('$ID/', ''), **{c: styles[c] for c in [*CATEGORIES, 'base']}}

fonts = list(dict.fromkeys(used))
out = {
    'source': [binary.name, idml.name],
    'note': 'shift = em, positive moves glyphs down; hscale = InDesign 장평.',
    'fonts': {ps: LOCAL[ps] for ps in fonts},
    'categories': categories,
    'composites': composites,
}
dest = Path(__file__).resolve().parent.parent / 'app' / 'composite-font.json'
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
for k, c in composites.items():
    print(k, c['name'], {n: (s['font'], s['scale'], s['shift'], s['hscale']) for n, s in c.items() if n != 'name'})
