'use client';
import { useState, type CSSProperties } from 'react';
import type { Slide } from './model';
import { layoutPhotos, youtubeUrl } from './model';
import colors from './number-colors.json';
import { FolioNumber } from './folio';
import { previewSource } from './previews';
import { originalSource, thumbnailSource } from './slide-assets';
export function SlideView({
  slide,
  number,
  assets,
  live = false,
  playing = false,
  print = false,
  thumbnail = false,
}: {
  slide: Slide;
  number: number | null;
  assets: Record<string, string>;
  live?: boolean;
  playing?: boolean;
  print?: boolean;
  thumbnail?: boolean;
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
  const ratio = original ? 3840 / 2716 : photo ? photo.width / photo.height : 16 / 9;
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
        ) : print ? (
          preview ? <a href={slide.src} className="capture-slide"><img draggable={false} src={preview} alt={slide.title}/></a> : <div className="embed-placeholder">미리보기 캡처가 필요합니다.</div>
        ) : live && slide.kind === 'video' ? (
          <LocalVideo key={slide.id} slide={slide} src={assets[slide.src] || slide.src} preview={preview} playing={playing}/>
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
        )}
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
