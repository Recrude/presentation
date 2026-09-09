import type { Slide } from './model';
export function builtInPreview(src: string) {
  if (src === '/media/audio-morphology.mp4') return '/media/audio-morphology.jpg';
  try {
    const u = new URL(src);
    if (u.hostname === 'www.youtube-nocookie.com' && u.pathname === '/embed/QIAcSGkOLDk') return '/previews/youtube-QIAcSGkOLDk.jpg';
    if (u.pathname !== '/' || u.search || u.hash) return '';
    return ({ 'ved.kr': '/previews/ved.jpg', 'whatareyoudoingnow.vercel.app': '/previews/now.jpg', 'jaeyeonkim.kr': '/previews/jaeyeon.jpg' } as Record<string, string>)[u.hostname] || '';
  } catch { return ''; }
}
export function previewSource(s: Slide, assets: Record<string, string>) {
  return (s.previewId ? assets[s.previewId] : '') || builtInPreview(s.src);
}
