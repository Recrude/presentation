import { localAsset } from './catalog';
'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Photo, Slide } from './model';
import { layoutPhotos, youtubeUrl } from './model';
import colors from './number-colors.json';
import { FolioNumber } from './folio';
import { previewSource } from './previews';
import { originalSource, thumbnailSource } from './slide-assets';
import { TextBody } from './text-slide';
export function SlideView({
  slide,
  number,
  assets,
  live = false,
  playing = false,
  print = false,
  thumbnail = false,
  outlined = false,
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
  /** Sequence or clip reached its end with “다음 장” selected. */
  onFinish?: () => void;
}) {
  const preview = previewSource(slide, assets);
  const [failed, setFailed] = useState(false);
  const original = slide.kind === 'image';
  const uploadedFolio = slide.kind === 'folio';
  const photo = uploadedFolio ? slide.photos?.[0] : undefined;
  const imageSrc = original ? (thumbnail ? thumbnailSource(slide.src) : originalSource(slide.src)) : photo ? assets[photo.id] : undefined;
  const index = original ? Number(slide.src.match(/page-(\d+)/)?.[1]) : -1;
  const palette = uploadedFolio ? slide.folioPalette : (
    colors as Record<string, { background: string; foreground: string }>
  )[index];
  const ratio = original ? 3840 / 2716 : photo ? photo.width / photo.height : slide.kind === 'clip' && slide.media ? slide.media.width / slide.media.height : 16 / 9;
  const moving = (live || playing) && !print && !thumbnail;
  const boxes =
    slide.kind === 'gallery' ? layoutPhotos(slide.photos || []) : [];
  return (
    <div className="slide-viewport">
      <div
        className="slide-sheet"
        style={{ '--ratio': ratio } as CSSProperties}
      >
        {original || uploadedFolio ? (
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
            : <TextBody slide={slide}/>
        ) : slide.kind === 'sequence' ? (
          <Sequence key={slide.id} slide={slide} assets={assets} moving={moving} eager={live || print || playing} onFinish={playing ? onFinish : undefined} onError={() => setFailed(true)}/>
        ) : slide.kind === 'clip' ? (
          moving && slide.media && assets[slide.media.id]
            ? <Clip key={slide.id} slide={slide} src={assets[slide.media.id]} poster={preview} onFinish={playing ? onFinish : undefined}/>
            : preview ? <img draggable={false} className="capture-preview" src={preview} alt={slide.title}/> : <div className="embed-placeholder"><span>영상</span><span>{slide.title}</span></div>
        ) : slide.kind === 'gallery' ? (
          <>
            {slide.photos?.map((p, i) => (
              <div
                key={p.id}
                className="photo-placement"
                style={{
                  left: `${boxes[i].x / 19.2}%`,
                  top: `${boxes[i].y / 10.8}%`,
                  width: `${boxes[i].width / 19.2}%`,
                  height: `${boxes[i].height / 10.8}%`,
                }}
              >
                {assets[p.id] ? (
                  <img
                    draggable={false}
                    src={assets[p.id]}
                    alt={p.name}
                    loading={live || print ? 'eager' : 'lazy'}
                    onError={() => setFailed(true)}
                  />
                ) : (
                  <span>이미지 불러오는 중</span>
                )}
              </div>
            ))}
          </>
        ) : browserFrame(slide, live && !print, preview, print ? (
          preview ? <a href={localAsset(slide.src)} className="capture-slide"><img draggable={false} src={preview} alt={slide.title}/></a> : <div className="embed-placeholder">미리보기 캡처가 필요합니다.</div>
        ) : live && slide.kind === 'video' ? (
          <LocalVideo key={slide.id} slide={slide} src={assets[slide.src] || localAsset(slide.src)} preview={preview} playing={playing}/>
        ) : live ? (
          <>
            <iframe
              key={`${slide.id}-${playing}`}
              src={
                slide.kind === 'youtube'
                  ? youtubeUrl(slide, playing)
                  : slide.src
              }
              title={slide.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            />
          </>
        ) : preview ? (
          <img draggable={false} className="capture-preview" src={preview} alt={slide.title}/>
        ) : (
          <div className="embed-placeholder">
            <span>{slide.kind === 'youtube' ? '영상' : '웹'}</span>
            <span>{slide.title}</span>
          </div>
        ))}
        {failed && (
          <div className="image-failure" role="alert">
            이미지 로딩 실패
          </div>
        )}
      </div>
    </div>
  );
}

function LocalVideo({ slide, src, preview, playing }: { slide: Slide; src: string; preview: string; playing: boolean }) {
  // Finishing a background download must never restart an already playing video.
  const [playbackSource] = useState(src);
  return <video className="local-video" src={playbackSource} poster={preview}
    autoPlay={playing && slide.autoplay !== false} muted={slide.muted !== false}
    controls playsInline preload="auto" aria-label={slide.title}/>;
}

// Steps flip in place at the slide's interval; each step shows `perFrame` images laid out like a gallery.
// Only steps around the current one are mounted and decoded ahead, so long sequences stay light.
export function sequenceSteps(photos: Photo[], perFrame = 1) {
  const steps: Photo[][] = [];
  for (let i = 0; i < photos.length; i += perFrame) steps.push(photos.slice(i, i + perFrame));
  return steps;
}
function Sequence({ slide, assets, moving, eager, onFinish, onError }: { slide: Slide; assets: Record<string, string>; moving: boolean; eager: boolean; onFinish?: () => void; onError: () => void }) {
  const steps = sequenceSteps(slide.photos || [], slide.perFrame || 1);
  const [index, setIndex] = useState(0);
  const images = useRef(new Map<number, HTMLImageElement[]>());
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    if (!moving) { setIndex(0); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = index + 1 < steps.length ? index + 1 : slide.end === 'loop' ? 0 : -1;
      if (next < 0) { if (slide.end === 'next') finish.current?.(); return; }
      await Promise.all((images.current.get(next) || []).map(image => image.decode().catch(() => undefined)));
      if (!cancelled) setIndex(next);
    }, slide.interval || 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [moving, index, steps.length, slide.interval, slide.end]);
  const mounted = new Set(moving ? [-1, 0, 1, 2, 3].map(d => index + d).map(i => slide.end === 'loop' ? (i + steps.length) % steps.length : i) : [0]);
  return <>{steps.map((step, i) => {
    if (!mounted.has(i)) return null;
    const boxes = layoutPhotos(step);
    return <div key={step[0].id} className="sequence-step" style={{ visibility: i === index ? 'visible' : 'hidden' }}>
      {step.map((p, j) => <div key={p.id} className="photo-placement" style={{ left: `${boxes[j].x / 19.2}%`, top: `${boxes[j].y / 10.8}%`, width: `${boxes[j].width / 19.2}%`, height: `${boxes[j].height / 10.8}%` }}>
        {assets[p.id] ? <img draggable={false} src={assets[p.id]} alt={p.name} loading={eager ? 'eager' : 'lazy'} onError={onError}
          ref={node => { const list = images.current.get(i) || []; if (node) images.current.set(i, [...list.filter(n => n.isConnected), node]); }}/> : <span>이미지 불러오는 중</span>}
      </div>)}
    </div>;
  })}</>;
}

function Clip({ slide, src, poster, onFinish }: { slide: Slide; src: string; poster: string; onFinish?: () => void }) {
  // Short muted clips play like a GIF: no controls, loop, hold on the last frame, or move on.
  const [playbackSource] = useState(src);
  return <video className="local-video" src={playbackSource} poster={poster} autoPlay muted playsInline preload="auto"
    loop={slide.end === 'loop'} onEnded={() => { if (slide.end === 'next') onFinish?.(); }} aria-label={slide.title}/>;
}

function browserFrame(slide: Slide, live: boolean, preview: string, content: ReactNode) {
  return slide.kind === 'web' && slide.frame === 'browser' ? <BrowserFrame src={slide.src} live={live} preview={preview}>{content}</BrowserFrame> : content;
}
// Safari (macOS 26) window, measured from a 2x window capture: 25pt corners, 52pt toolbar,
// 14pt traffic lights, 279×36pt address field with 13pt text. Units are pt on the 1920 sheet;
// a live page uses CSS px so the chrome keeps Safari's size relative to the page inside.
function BrowserFrame({ src, live, preview, children }: { src: string; live: boolean; preview: string; children: ReactNode }) {
  let host = src;
  try { host = new URL(src).hostname.replace(/^www\./, ''); } catch {}
  // Safari tints the toolbar with the page colour; the capture's top edge stands in for it.
  const [tint, setTint] = useState('#000000');
  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    const image = new Image();
    image.src = preview;
    void image.decode().then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || cancelled) return;
      context.drawImage(image, image.naturalWidth / 2, 1, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      setTint(`rgb(${r} ${g} ${b})`);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [preview]);
  const channels = tint.match(/\d+/g)?.map(Number) || [0, 0, 0];
  const light = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255 > 0.55;
  return <div className={`browser-stage${live ? ' is-live' : ''}`}>
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
