import { FAMILY, POSTSCRIPT, type FontKey } from './composite';
// Font files never leave this browser: the editor uses installed fonts (CSS local()) or files the
// user picks once, kept in Cache Storage. Publishing turns text into SVG outlines from the same bytes.
const CACHE = 'presentation-fonts-v1';
const keys = Object.keys(FAMILY) as FontKey[];
const descriptors: FontFaceDescriptors = { ascentOverride: '80%', descentOverride: '20%', lineGapOverride: '0%' } as FontFaceDescriptors;
const request = (key: FontKey) => new Request(new URL(`/presentation-fonts/${POSTSCRIPT[key]}`, location.origin));
type LocalFont = { postscriptName: string; blob(): Promise<Blob> };
export type FontData = Record<FontKey, ArrayBuffer>;
const registered = new Set<FontKey>();
async function cached(): Promise<Partial<FontData>> {
  const result: Partial<FontData> = {};
  try {
    const cache = await caches.open(CACHE);
    for (const key of keys) { const r = await cache.match(request(key)); if (r) result[key] = await r.arrayBuffer(); }
  } catch {}
  return result;
}
async function store(key: FontKey, data: ArrayBuffer) {
  try { await (await caches.open(CACHE)).put(request(key), new Response(data, { headers: { 'Content-Type': 'font/otf' } })); } catch {}
}
async function register(data: Partial<FontData>) {
  for (const key of keys) {
    if (!data[key] || registered.has(key)) continue;
    const face = new FontFace(FAMILY[key], data[key]!, descriptors);
    await face.load();
    document.fonts.add(face);
    registered.add(key);
  }
}
export async function fontsAvailable() {
  await register(await cached()).catch(() => {});
  const loaded = await Promise.all(keys.map(key => document.fonts.load(`16px "${FAMILY[key]}"`, key === 'hangul' ? '가' : 'A').catch(() => [])));
  return loaded.every(faces => faces.length > 0);
}
// Chrome can read installed fonts after a permission prompt; other browsers need the files once.
export async function fontData(): Promise<FontData> {
  const data = await cached();
  const missing = keys.filter(key => !data[key]);
  const query = (window as Window & { queryLocalFonts?: (o: { postscriptNames: string[] }) => Promise<LocalFont[]> }).queryLocalFonts;
  if (missing.length && query) {
    try {
      for (const font of await query({ postscriptNames: missing.map(key => POSTSCRIPT[key]) })) {
        const key = missing.find(k => POSTSCRIPT[k] === font.postscriptName);
        if (!key || data[key]) continue;
        data[key] = await (await font.blob()).arrayBuffer();
        await store(key, data[key]!);
      }
    } catch {}
  }
  const absent = keys.filter(key => !data[key]);
  if (absent.length) throw Error(`글꼴 파일을 지정하세요 · ${absent.map(key => POSTSCRIPT[key]).join(', ')}`);
  await register(data);
  return data as FontData;
}
export async function importFontFiles(files: File[]) {
  const { default: opentype } = await import('opentype.js');
  const found: FontKey[] = [];
  for (const file of files) {
    const data = await file.arrayBuffer();
    let name = '';
    try { name = opentype.parse(data).getEnglishName('postScriptName'); } catch {}
    const key = keys.find(k => POSTSCRIPT[k] === name);
    if (!key) throw Error(`${file.name} · ${keys.map(k => POSTSCRIPT[k]).join(' 또는 ')} 파일을 선택하세요.`);
    await store(key, data);
    found.push(key);
  }
  await register(await cached());
  return found;
}
