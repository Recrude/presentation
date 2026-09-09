"""Rebuild numeric artwork from locally installed SF Pro Display Regular.
Font files are neither copied nor served. Coordinates match the original 3840x2716 slides.
"""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import ImageFont
import json
font_path='/Library/Fonts/SF-Pro-Display-Regular.otf'
font=TTFont(font_path); cmap=font.getBestCmap(); glyphs=font.getGlyphSet(); units=font['head'].unitsPerEm
shaper=ImageFont.truetype(font_path,units)
data={'family':'SF Pro Display Regular','units':units,'size':46.5,'center':209,'baseline':135.5,'glyphs':{},'kerning':{}}
for c in '0123456789':
 name=cmap[ord(c)];pen=SVGPathPen(glyphs);glyphs[name].draw(pen)
 data['glyphs'][c]={'path':pen.getCommands(),'advance':font['hmtx'][name][0]}
for a in '0123456789':
 for b in '0123456789':
  k=shaper.getlength(a+b)-shaper.getlength(a)-shaper.getlength(b)
  if k:data['kerning'][a+b]=k
open('app/folio-glyphs.json','w').write(json.dumps(data,separators=(',',':'))+'\n')
print('SF Pro numeric outlines generated')
