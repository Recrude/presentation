import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import opentype, { type Font } from 'opentype.js';
import type { Slide } from './model';
import { TextBody } from './text-slide';
import { FONTS, fontsIn, runStyles, styleSample } from './composite';
import type { FontData } from './fonts';
// The browser lays out the text exactly as the editor shows it (keep-all, tracking, composite runs).
// Each glyph is then drawn from the font file at the position the browser gave it, so the public
// SVG matches the editor without shipping the font.
const parsed = new WeakMap<ArrayBuffer, Font>();
const font = (data: ArrayBuffer) => parsed.get(data) || parsed.set(data, opentype.parse(data)).get(data)!;
const n = (v: number) => String(Math.round(v * 100) / 100);
function mount(host: HTMLElement, slide: Slide) {
  const root = createRoot(host);
  flushSync(() => root.render(createElement(TextBody, { slide })));
  return root;
}
export async function textSvg(slide: Slide, data: FontData): Promise<{ blob: Blob; missing: string[] }> {
  const fonts: Record<string, Font> = {};
  for (const postscript of fontsIn(slide.text || '')) {
    if (!data[postscript]) throw Error(`글꼴 파일을 지정하세요 · ${postscript}`);
    fonts[postscript] = font(data[postscript]);
  }
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;width:1920px;height:1080px;visibility:hidden;pointer-events:none';
  document.body.append(host);
  const root = mount(host, slide);
  const probeHost = document.createElement('div');
  probeHost.style.cssText = host.style.cssText;
  document.body.append(probeHost);
  const probeRoot = mount(probeHost, { ...slide, text: runStyles.map((s, i) => s.bold ? `**${styleSample(i)}**` : styleSample(i)).join('\n\n') });
  try {
    await document.fonts.ready;
    const origin = host.getBoundingClientRect(), range = document.createRange();
    // Baseline offset from the top of a glyph's text box, measured per run style with a baseline marker.
    const ascent = new Map<number, number>();
    for (const span of probeHost.querySelectorAll<HTMLElement>('[data-run]')) {
      const style = Number(span.dataset.run), text = span.firstChild!;
      if (ascent.has(style) || text.textContent!.length < 1) continue;
      const marker = document.createElement('i');
      marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      span.append(marker);
      range.setStart(text, 0); range.setEnd(text, 1);
      ascent.set(style, marker.getBoundingClientRect().bottom - range.getBoundingClientRect().top);
      marker.remove();
    }
    const defs = new Map<string, string>(), uses: string[] = [], missing: string[] = [];
    for (const span of host.querySelectorAll<HTMLElement>('[data-run]')) {
      const style = Number(span.dataset.run), { font: postscript, hscale } = runStyles[style], face = fonts[postscript], key = `f${FONTS.indexOf(postscript)}g`;
      const size = parseFloat(getComputedStyle(span).fontSize), node = span.firstChild as Text;
      let offset = 0;
      for (const char of node.data) {
        range.setStart(node, offset); range.setEnd(node, offset += char.length);
        const rect = range.getClientRects()[0];
        if (!rect || /\s/.test(char)) continue;
        const glyph = face.charToGlyph(char);
        if (!glyph.index) { missing.push(char); continue; }
        const id = key + glyph.index;
        if (!defs.has(id)) defs.set(id, glyph.getPath(0, 0, face.unitsPerEm).toPathData(1));
        if (!defs.get(id)) continue;
        const k = size / face.unitsPerEm, scale = hscale === 1 ? k.toFixed(6) : `${(k * hscale).toFixed(6)} ${k.toFixed(6)}`;
        uses.push(`<use href="#${id}" transform="translate(${n(rect.left - origin.left)} ${n(rect.top - origin.top + ascent.get(style)!)}) scale(${scale})"/>`);
      }
    }
    const paths = [...defs].filter(([, d]) => d).map(([id, d]) => `<path id="${id}" d="${d}"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080"><defs>${paths}</defs><g fill="#ffffff">${uses.join('')}</g></svg>\n`;
    return { blob: new Blob([svg], { type: 'image/svg+xml' }), missing };
  } finally {
    root.unmount(); probeRoot.unmount(); host.remove(); probeHost.remove();
  }
}
