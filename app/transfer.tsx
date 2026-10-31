import { useEffect, useState } from 'react';
import { BASE, LEGACY_SLUG } from './catalog';
import { type Slide, validDeck } from './model';
import { assetIds } from './published';
import { readDeck, readImages, saveImages } from './storage';
type Backup = {version: 1; slug: string; slides: Slide[]; images: Record<string,string>};
async function encode(blob: Blob): Promise<string> {
  return new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
}
async function pack(slug: string, slides: Slide[], assets: Record<string,string>): Promise<Backup> {
  const images: Record<string,string> = {};
  for (const id of assetIds(slides)) {
    if (!assets[id]) throw Error('누락된 이미지가 있어 백업할 수 없습니다.');
    const r = await fetch(assets[id]); if (!r.ok) throw Error('이미지를 읽지 못했습니다.');
    images[id] = await encode(await r.blob());
  }
  return {version:1,slug,slides,images};
}
export async function exportBackup(slug: string, slides: Slide[], assets: Record<string,string>) {
  const data = await pack(slug,slides,assets);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = slug+'.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),10000);
}
export async function importBackup(value: unknown) {
  const b = value as Backup;
  if (!b || b.version !== 1 || !validDeck(b.slides) || !b.images || typeof b.images !== 'object') throw Error('백업 파일 형식을 확인하세요.');
  const entries: [string,Blob][] = [], assets: Record<string,string> = {};
  for (const id of assetIds(b.slides)) {
    const data = b.images[id];
    if (typeof data !== 'string' || !/^data:(?:image\/(?:png|jpeg|webp|gif|avif|svg\+xml)|video\/(?:mp4|webm));base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 56 * 1024 * 1024) throw Error('백업 이미지 형식을 확인하세요.');
    const blob = await (await fetch(data)).blob(); entries.push([id,blob]);
  }
  // An imported copy must not replace image records used by another presentation.
  const remap = new Map(entries.map(([id]) => [id, crypto.randomUUID()]));
  await saveImages(entries.map(([id, blob]) => [remap.get(id)!, blob]));
  for (const [id,blob] of entries) assets[remap.get(id)!] = URL.createObjectURL(blob);
  const slides = b.slides.map(s => ({...s,
    ...(s.photos ? {photos:s.photos.map(photo => ({...photo,id:remap.get(photo.id)!}))} : {}),
    ...(s.previewId ? {previewId:remap.get(s.previewId)!} : {}),
    ...(s.media ? {media:{...s.media,id:remap.get(s.media.id)!}} : {}),
  }));
  return {slides,assets};
}
const oldOrigin = 'https://presentation-wine-ten.vercel.app';
export async function receiveLegacy(): Promise<unknown> {
  const popup = window.open(`${oldOrigin}${BASE}migrate/`, 'presentation-transfer', 'width=640,height=480');
  if (!popup) throw Error('팝업을 허용하고 다시 가져오세요.');
  return new Promise((resolve,reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); popup.close(); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== oldOrigin || event.source !== popup || event.data?.type !== 'presentation-backup') return;
      cleanup();
      if (event.data.error) reject(Error(event.data.error)); else resolve(event.data.backup);
    };
    window.addEventListener('message', receive);
    timer = setTimeout(() => { cleanup(); reject(Error('가져오기가 완료되지 않았습니다. 이전 주소의 편집 페이지에서 백업을 내보낸 뒤 불러오세요.')); }, 90000);
  });
}
export function MigrationPage() {
  const [status,setStatus] = useState('저장된 작업을 읽는 중');
  useEffect(() => {
    if (location.origin !== oldOrigin || !window.opener) { setStatus('편집 페이지에서 가져오기를 시작하세요.'); return; }
    void (async () => {
      const urls: string[] = [];
      try {
        const draft = await readDeck(LEGACY_SLUG);
        if (!draft || !validDeck(draft.slides)) throw Error('이 브라우저의 이전 주소에 저장된 작업이 없습니다.');
        const assets = {...draft.assets};
        const blobs = await readImages(assetIds(draft.slides));
        for (const [id,blob] of Object.entries(blobs)) { const url = URL.createObjectURL(blob); urls.push(url); assets[id] = url; }
        const backup = await pack(LEGACY_SLUG,draft.slides,assets);
        window.opener.postMessage({type:'presentation-backup',backup},'https://jaeyeonkim.kr');
        setStatus('전달했습니다. 이 창을 닫으세요.');
      } catch(e) {
        const error = e instanceof Error ? e.message : '가져오기 실패';
        setStatus(error); window.opener.postMessage({type:'presentation-backup',error},'https://jaeyeonkim.kr');
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    })();
  },[]);
  return <main className="public-empty"><p>{status}</p></main>;
}
