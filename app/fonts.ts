import { FONTS, LOCAL_NAMES, family } from './composite';
// Font files never leave this browser: the editor uses installed fonts (local()) or files the
// user picks once, kept in Cache Storage. Publishing turns text into SVG outlines from the same bytes.
const CACHE = 'presentation-fonts-v1';
const descriptors: FontFaceDescriptors = { ascentOverride: '80%', descentOverride: '20%', lineGapOverride: '0%' } as FontFaceDescriptors;
const request = (postscript: string) => new Request(new URL(`/presentation-fonts/${postscript}`, location.origin));
type LocalFont = { postscriptName: string; blob(): Promise<Blob> };
export type FontData = Record<string, ArrayBuffer>;
const registered = new Set<string>();
let localFaces = false;
// Installed fonts first; faces added later from file bytes take precedence for the same family.
function addLocalFaces() {
  if (localFaces) return;
  localFaces = true;
  for (const postscript of FONTS)
    document.fonts.add(new FontFace(family(postscript), LOCAL_NAMES[postscript].map(name => `local("${name}")`).join(', '), descriptors));
}
async function cached(fonts: string[]): Promise<FontData> {
  const result: FontData = {};
  try {
    const cache = await caches.open(CACHE);
    for (const postscript of fonts) { const r = await cache.match(request(postscript)); if (r) result[postscript] = await r.arrayBuffer(); }
  } catch {}
  return result;
}
async function store(postscript: string, data: ArrayBuffer) {
  try { await (await caches.open(CACHE)).put(request(postscript), new Response(data, { headers: { 'Content-Type': 'font/otf' } })); } catch {}
}
async function register(data: FontData) {
  addLocalFaces();
  for (const [postscript, bytes] of Object.entries(data)) {
    if (registered.has(postscript)) continue;
    const face = new FontFace(family(postscript), bytes, descriptors);
    await face.load();
    document.fonts.add(face);
    registered.add(postscript);
  }
}
/** PostScript names among `fonts` that this browser cannot show. */
export async function missingFonts(fonts: string[] = FONTS) {
  await register(await cached(fonts)).catch(() => {});
  const loaded = await Promise.all(fonts.map(postscript => document.fonts.load(`16px "${family(postscript)}"`, 'A가').catch(() => [])));
  return fonts.filter((_, i) => !loaded[i].length);
}
// Chrome can read installed fonts after a permission prompt; other browsers need the files once.
export async function fontData(fonts: string[]): Promise<FontData> {
  const data = await cached(fonts);
  const missing = fonts.filter(postscript => !data[postscript]);
  const query = (window as Window & { queryLocalFonts?: (o: { postscriptNames: string[] }) => Promise<LocalFont[]> }).queryLocalFonts;
  if (missing.length && query) {
    try {
      for (const font of await query({ postscriptNames: missing })) {
        if (!missing.includes(font.postscriptName) || data[font.postscriptName]) continue;
        data[font.postscriptName] = await (await font.blob()).arrayBuffer();
        await store(font.postscriptName, data[font.postscriptName]);
      }
    } catch {}
  }
  const absent = fonts.filter(postscript => !data[postscript]);
  if (absent.length) throw Error(`글꼴 파일을 지정하세요 · ${absent.join(', ')}`);
  await register(data);
  return data;
}
export async function importFontFiles(files: File[]) {
  const { default: opentype } = await import('opentype.js');
  const found: string[] = [];
  for (const file of files) {
    const data = await file.arrayBuffer();
    let name = '';
    try { name = opentype.parse(data).getEnglishName('postScriptName'); } catch {}
    if (!FONTS.includes(name)) throw Error(`${file.name} · 합성글꼴에 쓰는 글꼴이 아닙니다 (${FONTS.join(', ')}).`);
    await store(name, data);
    found.push(name);
  }
  await register(await cached(found));
  return found;
}
