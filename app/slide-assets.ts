import manifest from './slide-assets.json';
const assets: Record<string, { full: string; thumbnail: string }> = manifest;
export function originalSource(src: string): string {
  return assets[src]?.full || src;
}
export function thumbnailSource(src: string): string {
  return assets[src]?.thumbnail || src;
}

export async function warmSlides(sources: string[], signal: AbortSignal, progress: (done: number, failed: number) => void) {
  let cursor = 0, done = 0, failed = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < sources.length && !signal.aborted) {
      const src = sources[cursor++];
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 20000);
      try {
        const response = await fetch(src, { cache: 'force-cache', signal: timeout.signal });
        if (!response.ok) throw Error('이미지 로딩 실패');
        await response.blob();
      } catch { failed++; }
      finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
      if (!signal.aborted) progress(++done, failed);
    }
  }));
}
