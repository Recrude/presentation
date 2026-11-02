import { localAsset } from './catalog';
'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { Box, Photo, Range, Slide } from './model';
import { DEFAULT_TAB, captionRoom, captionTypography, defaultTypography, layoutPhotos, marginOf, ranged, sequenceSteps, stepDuration, vimeoPlayer, youtubeUrl, type Typography } from './model';
import colors from './number-colors.json';
import { FolioNumber } from './folio';
import { previewSource } from './previews';
import { originalSource, thumbnailSource } from './slide-assets';
import { TextBody } from './text-slide';
/** Height of the presentation's sheet in px on the 1920-wide sheet (its 판형). */
export const SheetHeight = createContext(1080);
export function SlideView({
  slide,
  number,
  assets,
  live = false,
  playing = false,
  print = false,
  thumbnail = false,
  outlined = false,
  guides = false,
  paused = false,
  onFinish,
}: {
  slide: Slide;
  number: number | null;
  assets: Record<string, string>;
  live?: boolean;
  playing?: boolean;
  print?: boolean;
  thumbnail?: boolean;
  /** Public viewer: text slides show their published SVG outlines instead of live type. */
  outlined?: boolean;
  /** Editor preview: show a text slide's top, left and right margins. */
  guides?: boolean;
  /** Sequence held where it is (Space in the presentation): its step and that step's videos stop. */
  paused?: boolean;
  /** Sequence or clip reached its end with “다음 장” selected. */
  onFinish?: () => void;
}) {
  const preview = previewSource(slide, assets);
  const height = useContext(SheetHeight);
  const [failed, setFailed] = useState(false);
  const original = slide.kind === 'image';
  const uploadedFolio = slide.kind === 'folio';
  const photo = uploadedFolio ? slide.photos?.[0] : undefined;
  const imageSrc = original ? (thumbnail ? thumbnailSource(slide.src) : originalSource(slide.src)) : photo ? assets[photo.id] : undefined;
  const index = original ? Number(slide.src.match(/page-(\d+)/)?.[1]) : -1;
  const palette = uploadedFolio ? slide.folioPalette : (
    colors as Record<string, { background: string; foreground: string }>
  )[index];
  const ratio = original ? 3840 / 2716 : photo ? photo.width / photo.height : slide.kind === 'clip' && slide.media ? slide.media.width / slide.media.height : 1920 / height;
  const moving = (live || playing) && !print && !thumbnail;
  const margin = marginOf(slide);
  const boxes =
    slide.kind === 'gallery' ? layoutPhotos(slide.photos || [], height, slide, margin, captionRoom(slide.photos)) : [];
  // Media, single images and plain embeds sit inside the slide's margin (px on its own 1920-wide sheet).
  const inset = (content: ReactNode) => Object.values(margin).some(v => v > 0) && !['text', 'gallery', 'sequence'].includes(slide.kind) && !(slide.kind === 'web' && slide.frame === 'browser')
    ? <div className="slide-inset" style={{ left: `${margin.left / 19.2}%`, right: `${margin.right / 19.2}%`, top: `${margin.top * ratio / 19.2}%`, bottom: `${margin.bottom * ratio / 19.2}%` }}>{content}</div>
    : content;
  return (
    <div className="slide-viewport">
      <div
        className="slide-sheet"
        style={{ '--ratio': ratio } as CSSProperties}
      >
        {inset(original || uploadedFolio ? (
          <>
            <img
              decoding="async"
              draggable={false}
              className="original"
              src={imageSrc}
              alt={slide.title}
              loading={live || print ? 'eager' : 'lazy'}
              onError={() => setFailed(true)}
            />
            {original && palette && (
              <svg
                className="folio"
                viewBox={`0 0 3840 ${3840 / ratio}`}
                aria-label={number === null ? '숨긴 슬라이드' : `${number}쪽`}
              >
                <rect
                  x="146"
                  y="94"
                  width="126"
                  height="49"
                  fill={palette.background}
                />
                <FolioNumber number={number} fill={palette.foreground} />
              </svg>
            )}
          </>
        ) : slide.kind === 'text' ? (
          outlined ? (slide.previewId && assets[slide.previewId] ? <img draggable={false} className="capture-preview" src={assets[slide.previewId]} alt={slide.text} onError={() => setFailed(true)}/> : null)
            : <>
              <TextBody slide={slide}/>
              {guides && <MarginGuides typo={slide.typo || defaultTypography} height={height}/>}
            </>
        ) : slide.kind === 'sequence' ? (
          <Sequence key={slide.id} slide={slide} assets={assets} moving={moving} paused={paused} eager={live || print || playing} outlined={outlined} onFinish={playing ? onFinish : undefined} onError={() => setFailed(true)}/>
        ) : slide.kind === 'clip' ? (
          moving && slide.media && assets[slide.media.id]
            ? <Clip key={slide.id} slide={slide} range={slide.media} src={assets[slide.media.id]} poster={preview} onFinish={playing ? onFinish : undefined}/>
            : preview ? <img draggable={false} className="capture-preview" src={preview} alt={slide.title}/> : <div className="embed-placeholder"><span>영상</span><span>{slide.title}</span></div>
        ) : slide.kind === 'gallery' ? (
          <>
            {slide.photos?.map((p, i) => (
              <div
                key={p.id}
                className="photo-placement"
                style={{
                  left: `${boxes[i].x / 19.2}%`,
                  top: `${boxes[i].y / height * 100}%`,
                  width: `${boxes[i].width / 19.2}%`,
                  height: `${boxes[i].height / height * 100}%`,
                }}
              >
                <PhotoMedia photo={p} assets={assets} fit={slide.fit} moving={moving} eager={live || print} onError={() => setFailed(true)}/>
              </div>
            ))}
            {slide.photos?.map((p, i) => p.caption && <Caption key={`${p.id}-caption`} photo={p} box={boxes[i]} align={slide.captionAlign} outlined={outlined} assets={assets}/>)}
          </>
        ) : browserFrame(slide, live && !print, preview, print ? (
          preview ? <a href={localAsset(slide.src)} className="capture-slide"><img draggable={false} src={preview} alt={slide.title}/></a> : <div className="embed-placeholder">미리보기 캡처가 필요합니다.</div>
        ) : live && slide.kind === 'video' ? (
          <LocalVideo key={slide.id} slide={slide} src={assets[slide.src] || localAsset(slide.src)} preview={preview} playing={playing}/>
        ) : live ? (
          <EmbedFrame key={`${slide.id}-${playing}`} slide={slide} playing={playing}/>
        ) : preview ? (
          <img draggable={false} className="capture-preview" src={preview} alt={slide.title}/>
        ) : (
          <div className="embed-placeholder">
            <span>{slide.kind === 'youtube' ? '영상' : '웹'}</span>
            <span>{slide.title}</span>
          </div>
        )))}
        {failed && (
          <div className="image-failure" role="alert">
            이미지 로딩 실패
          </div>
        )}
      </div>
    </div>
  );
}

// Tab stops inside the text width: explicit stops and the hanging indent, then every tabSize px.
function tabStops(typo: Typography) {
  const width = 1920 - typo.left - typo.right, size = typo.tabSize || DEFAULT_TAB;
  const every = Array.from({ length: Math.floor(width / size) }, (_, i) => (i + 1) * size).filter(x => x < width);
  return [...new Set([...(typo.tabs || []), ...(typo.indent ? [typo.indent] : []), ...every])].sort((a, b) => a - b);
}
function MarginGuides({ typo, height }: { typo: Typography; height: number }) {
  const x = (px: number) => `${px / 19.2}%`;
  return <div className="margin-guides" aria-hidden="true">
    <i style={{ left: 0, right: 0, top: `${typo.top / height * 100}%`, height: 1 }}/>
    <i style={{ top: 0, bottom: 0, left: x(typo.left), width: 1 }}/>
    <i style={{ top: 0, bottom: 0, left: x(1920 - typo.right), width: 1 }}/>
    {tabStops(typo).map(stop => <i key={stop} className="tab-stop" style={{ top: 0, bottom: 0, left: x(typo.left + stop), width: 1 }}/>)}
  </div>;
}

function LocalVideo({ slide, src, preview, playing }: { slide: Slide; src: string; preview: string; playing: boolean }) {
  // Finishing a background download must never restart an already playing video.
  const [playbackSource] = useState(src);
  const ref = useRef<HTMLVideoElement>(null);
  useRange(ref, slide, 'hold');
  return <video ref={ref} className="local-video" src={playbackSource} poster={preview}
    autoPlay={playing && slide.autoplay !== false} muted={slide.muted !== false}
    controls playsInline preload="auto" aria-label={slide.title}/>;
}

// Steps (see sequenceSteps) flip in place, each after its images' durations (the slide's interval for
// images without one). Only steps around the current one are mounted and decoded ahead, so long sequences stay light.
// Paused, the current step keeps the time it has left and goes on from there.
function Sequence({ slide, assets, moving, paused, eager, outlined, onFinish, onError }: { slide: Slide; assets: Record<string, string>; moving: boolean; paused: boolean; eager: boolean; outlined: boolean; onFinish?: () => void; onError: () => void }) {
  const steps = sequenceSteps(slide.photos || [], slide.perFrame || 1), height = useContext(SheetHeight);
  // Every step keeps the room of the slide's longest caption, so images keep their size from step to step.
  const below = captionRoom(slide.photos);
  const [index, setIndex] = useState(0);
  const images = useRef(new Map<number, HTMLImageElement[]>());
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const delay = stepDuration(steps[index] || [], slide.interval || 400);
  const left = useRef<{ index: number; delay: number; ms: number } | null>(null);
  useEffect(() => {
    if (!moving) { setIndex(0); left.current = null; return; }
    if (paused) return;
    let cancelled = false;
    const ms = left.current?.index === index && left.current.delay === delay ? left.current.ms : delay, start = performance.now();
    const timer = setTimeout(async () => {
      const next = index + 1 < steps.length ? index + 1 : slide.end === 'loop' ? 0 : -1;
      if (next < 0) { if (slide.end === 'next') finish.current?.(); return; }
      await Promise.all((images.current.get(next) || []).map(image => image.decode().catch(() => undefined)));
      if (!cancelled) setIndex(next);
    }, ms);
    return () => { cancelled = true; clearTimeout(timer); left.current = { index, delay, ms: Math.max(0, ms - (performance.now() - start)) }; };
  }, [moving, paused, index, steps.length, delay, slide.end]);
  const mounted = new Set(moving ? [-1, 0, 1, 2, 3].map(d => index + d).map(i => slide.end === 'loop' ? (i + steps.length) % steps.length : i) : [0]);
  return <>{steps.map((step, i) => {
    if (!mounted.has(i)) return null;
    const boxes = layoutPhotos(step, height, slide, marginOf(slide), below);
    return <div key={step[0].id} className="sequence-step" style={{ visibility: i === index ? 'visible' : 'hidden' }}>
      {step.map((p, j) => <div key={p.id} className="photo-placement" style={{ left: `${boxes[j].x / 19.2}%`, top: `${boxes[j].y / height * 100}%`, width: `${boxes[j].width / 19.2}%`, height: `${boxes[j].height / height * 100}%` }}>
        <PhotoMedia photo={p} assets={assets} fit={slide.fit} moving={moving} active={moving && i === index} paused={paused} eager={eager} onError={onError}
          imageRef={node => { const list = images.current.get(i) || []; if (node) images.current.set(i, [...list.filter(n => n.isConnected), node]); }}/>
      </div>)}
      {step.map((p, j) => p.caption && <Caption key={`${p.id}-caption`} photo={p} box={boxes[j]} align={slide.captionAlign} outlined={outlined} assets={assets}/>)}
    </div>;
  })}</>;
}

// A caption under its image: live type in the editor, its published outlines in the public viewer
// (nothing until it has them, like a text slide).
function Caption({ photo, box, align, outlined, assets }: { photo: Photo; box: Box; align: Slide['captionAlign']; outlined: boolean; assets: Record<string, string> }) {
  const { x, y, width, height } = box;
  const slide = useMemo<Slide>(() => ({ id: photo.id, title: photo.name, kind: 'text', src: '', hidden: false, text: photo.caption, typo: captionTypography({ x, y, width, height }, align) }), [photo.id, photo.name, photo.caption, x, y, width, height, align]);
  if (outlined) return photo.captionId && assets[photo.captionId] ? <img draggable={false} className="caption-outline" src={assets[photo.captionId]} alt={photo.caption}/> : null;
  return <TextBody slide={slide} caption={align || 'left'}/>;
}

// One item of a grid or sequence. While the slide moves, a video is loaded with the steps around the
// current one and plays muted from its start while its own step shows (looping if the step lasts
// longer); in thumbnails and print it is its still frame.
function PhotoMedia({ photo, assets, fit, moving, active = moving, paused = false, eager, onError, imageRef }: { photo: Photo; assets: Record<string, string>; fit?: Slide['fit']; moving: boolean; active?: boolean; paused?: boolean; eager: boolean; onError: () => void; imageRef?: (node: HTMLImageElement | null) => void }) {
  const still = photo.video ? photo.poster && assets[photo.poster] : assets[photo.id];
  if (photo.video && moving && assets[photo.id]) return <StepVideo src={assets[photo.id]} range={photo} poster={still || undefined} fit={fit} name={photo.name} active={active} paused={paused} onError={onError}/>;
  return still ? <img draggable={false} src={still} style={{ objectFit: fit || 'contain' }} alt={photo.name} loading={eager ? 'eager' : 'lazy'} onError={onError} ref={imageRef}/> : <span>이미지 불러오는 중</span>;
}
function StepVideo({ src, range, poster, fit, name, active, paused, onError }: { src: string; range: Range; poster?: string; fit?: Slide['fit']; name: string; active: boolean; paused: boolean; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playbackSource] = useState(src);
  useRange(ref, range, 'loop');
  // Its step coming up starts it from the range start; pausing the sequence stops it where it is.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active) { video.currentTime = range.from || 0; if (!paused) void video.play().catch(() => undefined); }
    else video.pause();
  }, [active]);
  useEffect(() => {
    const video = ref.current;
    if (!video || !active) return;
    if (paused) video.pause(); else void video.play().catch(() => undefined);
  }, [paused]);
  return <video ref={ref} src={playbackSource} poster={poster} muted loop={!ranged(range)} playsInline preload="auto" style={{ objectFit: fit || 'contain' }} aria-label={name} onError={onError}/>;
}

function Clip({ slide, range = {}, src, poster, onFinish }: { slide: Slide; range?: Range; src: string; poster: string; onFinish?: () => void }) {
  // Short muted clips play like a GIF: no controls, loop, hold on the last frame, or move on.
  const [playbackSource] = useState(src);
  const ref = useRef<HTMLVideoElement>(null), end = slide.end || 'loop';
  useRange(ref, range, end, onFinish);
  return <video ref={ref} className="local-video" src={playbackSource} poster={poster} autoPlay muted playsInline preload="auto"
    loop={end === 'loop' && !ranged(range)} aria-label={slide.title}/>;
}

// Keeps a video inside its range: it starts at from, and on reaching to (or the file's end) loops back
// to from, holds there, or moves on. Playing from outside the range starts it again at from. Without a
// range the element plays by itself (loop attribute) and only its end is reported.
function useRange(ref: RefObject<HTMLVideoElement | null>, { from = 0, to }: Range, end: 'loop' | 'hold' | 'next', onFinish?: () => void) {
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const limited = ranged({ from, to });
    let frame = 0;
    const seek = () => { video.currentTime = from; };
    const reach = () => {
      if (end === 'loop' && limited) { seek(); void video.play().catch(() => undefined); return; }
      video.pause();
      if (end === 'next') finish.current?.();
    };
    // Checked every frame while playing, so the end lands within a frame (timeupdate comes every 250 ms).
    const watch = () => {
      cancelAnimationFrame(frame);
      if (to !== undefined && video.currentTime >= to) reach();
      if (!video.paused) frame = requestAnimationFrame(watch);
    };
    const play = () => { if (video.currentTime < from - 0.05 || to !== undefined && video.currentTime >= to) seek(); watch(); };
    if (limited) {
      if (video.readyState >= 1) { if (video.currentTime < from || to !== undefined && video.currentTime >= to) seek(); }
      else video.addEventListener('loadedmetadata', seek, { once: true });
      video.addEventListener('play', play);
      if (!video.paused) watch();
    }
    video.addEventListener('ended', reach);
    return () => { cancelAnimationFrame(frame); video.removeEventListener('loadedmetadata', seek); video.removeEventListener('play', play); video.removeEventListener('ended', reach); };
  }, [from, to, end]);
}

// A live embed. Vimeo's player keeps a range through its postMessage API: it starts at from and at to
// goes back to from when the player loops (loop=1 or background=1 in its address), else pauses.
function EmbedFrame({ slide, playing }: { slide: Slide; playing: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const vimeo = slide.kind === 'web' && vimeoPlayer(slide.src) && ranged(slide);
  const { from = 0, to } = slide;
  useEffect(() => {
    const player = ref.current?.contentWindow;
    if (!vimeo || !player) return;
    const send = (method: string, value?: unknown) => player.postMessage(value === undefined ? { method } : { method, value }, 'https://player.vimeo.com');
    let loops = false;
    try { const q = new URL(slide.src).searchParams; loops = q.get('loop') === '1' || q.get('background') === '1'; } catch {}
    const listen = () => { send('addEventListener', 'timeupdate'); if (from) send('setCurrentTime', from); };
    const message = (e: MessageEvent) => {
      if (e.origin !== 'https://player.vimeo.com' || e.source !== player) return;
      let data = e.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
      if (data?.event === 'ready') listen();
      if (data?.event !== 'timeupdate') return;
      const seconds = Number(data.data?.seconds);
      // The player's own loop goes back to 0; the range takes it back to from.
      if (seconds < from - 0.5) send('setCurrentTime', from);
      else if (to !== undefined && seconds >= to) { if (loops) send('setCurrentTime', from); else send('pause'); }
    };
    addEventListener('message', message);
    // A range set while the player is already up applies at once (before that, its ready event does).
    listen();
    return () => removeEventListener('message', message);
  }, [vimeo, from, to, slide.src]);
  // The start also goes into the address, so the player opens there before its API answers.
  const src = slide.kind === 'youtube' ? youtubeUrl(slide, playing) : vimeo && from ? `${slide.src.split('#')[0]}#t=${Math.floor(from)}s` : slide.src;
  return <iframe ref={ref} src={src} title={slide.title}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
  />;
}

function browserFrame(slide: Slide, live: boolean, preview: string, content: ReactNode) {
  return slide.kind === 'web' && slide.frame === 'browser' ? <BrowserFrame slide={slide} live={live} preview={preview}>{content}</BrowserFrame> : content;
}
// Safari (macOS 26) window, measured from 2x window captures: 25pt corners, 52pt toolbar,
// 14pt traffic lights, 279×36pt address field with 13pt text. Units are pt on the 1920 sheet;
// a live page uses CSS px so the chrome keeps Safari's size relative to the page inside.
// The toolbar takes the page's light theme-color, else its body background (read by the capture, see api/capture.mjs).
function BrowserFrame({ slide, live, preview, children }: { slide: Slide; live: boolean; preview: string; children: ReactNode }) {
  let host = slide.src;
  try { host = new URL(slide.src).hostname.replace(/^www\./, ''); } catch {}
  // Always the light-scheme color, whatever the viewer's setting (tintDark of older captures is ignored).
  const stored = slide.tint;
  // Without a color from the capture (an image picked by hand, older slides) the capture's top edge
  // stands in when it is one solid color.
  const [sampled, setSampled] = useState('');
  useEffect(() => {
    setSampled('');
    if (stored || !preview) return;
    let cancelled = false;
    const image = new Image();
    image.src = preview;
    void image.decode().then(() => {
      const width = image.naturalWidth, canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || cancelled) return;
      context.drawImage(image, 0, 0, width, 1, 0, 0, width, 1);
      const row = context.getImageData(0, 0, width, 1).data;
      const points = [0, 1, 2, 3, 4].map(i => { const x = Math.round((width - 1) * i / 4) * 4; return [row[x], row[x + 1], row[x + 2]]; });
      if (points.some(p => p.some((v, c) => Math.abs(v - points[0][c]) > 8))) return;
      setSampled('#' + [0, 1, 2].map(c => Math.round(points.reduce((sum, p) => sum + p[c], 0) / 5).toString(16).padStart(2, '0')).join(''));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [stored, preview]);
  const tint = stored || sampled || '#000000';
  const channels = [1, 3, 5].map(i => parseInt(tint.slice(i, i + 2), 16));
  const light = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255 > 0.55;
  const margin = marginOf(slide);
  return <div className={`browser-stage${live ? ' is-live' : ''}`} style={{ '--frame-top': margin.top, '--frame-right': margin.right, '--frame-bottom': margin.bottom, '--frame-left': margin.left } as CSSProperties}>
    <div className={`browser-window${light ? ' is-light' : ''}`} style={{ '--tint': tint } as CSSProperties}>
      <div className="browser-bar" aria-hidden="true">
        <span className="browser-light"/><span className="browser-light"/><span className="browser-light"/>
        <span className="browser-address">
          <span className="browser-field">
            <svg className="browser-globe" viewBox="0 0 26 26"><g fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="13" cy="13" r="11.2"/><ellipse cx="13" cy="13" rx="5" ry="11.2"/><path d="M13 1.8v22.4M1.8 13h22.4M3.6 7.2h18.8M3.6 18.8h18.8"/></g></svg>
            <span className="browser-host">{host}</span>
            <svg className="browser-reader" viewBox="0 0 23 27"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1.5" y="1.5" width="20" height="12" rx="3"/><path d="M1.5 19h20M1.5 25h13"/></g></svg>
          </span>
        </span>
      </div>
      <div className="browser-page">{children}</div>
    </div>
  </div>;
}
