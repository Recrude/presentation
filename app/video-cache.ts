export const exhibitionVideo = '/media/audio-morphology.mp4';
const version = '63dcc9cd153d';
const cacheName = 'presentation-video-v1';
const expectedSize = 33530903;

export async function prepareVideo(signal: AbortSignal, progress: (percent: number) => void) {
  const key = `${exhibitionVideo}?v=${version}`;
  let cache: Cache | undefined;
  try { cache = await caches.open(cacheName); } catch { /* Memory playback still works when storage is unavailable. */ }
  const cached = await cache?.match(key);
  if (cached) {
    const blob = await cached.blob();
    if (blob.size === expectedSize) { progress(100); return { blob, persistent: true }; }
    await cache?.delete(key);
  }
  signal.throwIfAborted();
  const response = await fetch(key, { signal });
  if (response.status !== 200 || !response.body) throw Error('영상 다운로드 실패');
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0, lastPercent = -1;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    const percent = Math.min(99, Math.floor(size / expectedSize * 100));
    if (percent !== lastPercent) { progress(percent); lastPercent = percent; }
  }
  if (size !== expectedSize) throw Error('영상 파일을 끝까지 받지 못했습니다.');
  const blob = new Blob(chunks, { type: 'video/mp4' });
  let persistent = false;
  if (cache) {
    try {
      await cache.put(key, new Response(blob, { headers: { 'Content-Type': 'video/mp4' } }));
      persistent = true;
    } catch { /* Quota failure must not prevent playback from the downloaded blob. */ }
  }
  progress(100);
  return { blob, persistent };
}
