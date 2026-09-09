'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  initial,
  embed,
  numberOf,
  reorder,
  validDeck,
  type Slide,
  type Photo,
} from './model';
import { readDeck, saveDeck, readImage, saveImages } from './storage';
import { SlideView } from './slide-view';
import { previewSource } from './previews';
import { sortOriginalSlides, projectForPage } from './chronology';
import { detectFolioPalette, type FolioPalette } from './folio-palette';
const presets = [
  ['VED', 'https://ved.kr/'],
  ['What are you doing now?', 'https://whatareyoudoingnow.vercel.app/'],
  ['jaeyeonkim.kr', 'https://jaeyeonkim.kr/'],
  ['영상', 'https://www.youtube-nocookie.com/embed/QIAcSGkOLDk'],
];
type Drag = {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  slot: number;
};
export default function Home() {
  const [slides, setSlides] = useState<Slide[]>(initial),
    [selected, select] = useState(initial[0].id);
  const [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState('불러오는 중');
  const [assets, setAssets] = useState<Record<string, string>>({}),
    [adding, setAdding] = useState(false),
    [url, setUrl] = useState(''),
    [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false),
    [group, setGroup] = useState(true),
    [live, setLive] = useState(false);
  const [present, setPresent] = useState(false),
    [position, setPosition] = useState(0),
    [printing, setPrinting] = useState(false);
  const [dragUI, setDragUI] = useState<{ id: string; slot: number } | null>(
      null,
    ),
    [historyCount, setHistoryCount] = useState(0);
  const stateRef = useRef(slides),
    history = useRef<Slide[][]>([]),
    gridRef = useRef<HTMLDivElement>(null),
    dragRef = useRef<Drag | null>(null);
  const objectUrls = useRef(new Map<string, string>()),
    suppressClick = useRef(false),
    fileRef = useRef<HTMLInputElement>(null),
    previewFileRef = useRef<HTMLInputElement>(null),
    photoTarget = useRef<string | null>(null),
    importMode = useRef<'gallery' | 'folio'>('gallery');
  stateRef.current = slides;
  const visible = slides.filter((s) => !s.hidden),
    active = slides.find((s) => s.id === selected),
    current = visible[position];
  function change(next: Slide[]) {
    if (next === stateRef.current) return;
    history.current = [...history.current.slice(-39), stateRef.current];
    setHistoryCount(history.current.length);
    stateRef.current = next;
    setSlides(next);
    setDirty(true);
    setStatus('저장되지 않음');
  }
  function patch(id: string, values: Partial<Slide>) {
    change(
      stateRef.current.map((s) => (s.id === id ? { ...s, ...values } : s)),
    );
  }
  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    stateRef.current = previous;
    setSlides(previous);
    setHistoryCount(history.current.length);
    setDirty(true);
    setStatus('저장되지 않음');
    if (!previous.some((s) => s.id === selected)) select(previous[0]?.id || '');
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let deck: Slide[] = initial;
      try {
        const stored = await readDeck();
        if (stored !== undefined) {
          if (!validDeck(stored))
            throw Error('저장된 발표를 읽을 수 없습니다.');
          deck = stored;
        } else {
          const legacy = JSON.parse(
            localStorage.getItem('jaeyeon-slides-v1') || 'null',
          );
          if (validDeck(legacy)) deck = legacy;
        }
        const ids = [
          ...new Set(deck.flatMap((s) => [...(s.photos?.map((p) => p.id) || []), ...(s.previewId ? [s.previewId] : [])])),
        ];
        let missing = 0;
        const loaded: Record<string, string> = {};
        for (const id of ids) {
          const blob = await readImage(id);
          if (!blob) {
            missing++;
            continue;
          }
          if (cancelled) return;
          const src = URL.createObjectURL(blob);
          objectUrls.current.set(id, src);
          loaded[id] = src;
        }
        if (!cancelled) {
          stateRef.current = deck;
          setSlides(deck);
          select(deck[0]?.id || '');
          setAssets(loaded);
          setStatus(
            missing ? `이미지 ${missing}개 없음 · 다시 추가하세요` : '',
          );
        }
      } catch {
        if (!cancelled) {
          try {
            const legacy = JSON.parse(
              localStorage.getItem('jaeyeon-slides-v1') || 'null',
            );
            if (validDeck(legacy)) {
              stateRef.current = legacy;
              setSlides(legacy);
              select(legacy[0]?.id || '');
            }
          } catch {}
          setStatus(
            '저장된 자료를 읽지 못했습니다. 브라우저 저장 설정을 확인하세요.',
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      objectUrls.current.forEach((src) => URL.revokeObjectURL(src));
      objectUrls.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  useEffect(() => {
    setLive(false);
  }, [selected]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        ctx.registerTool(
          {
            name: 'list_presentation_slides',
            description:
              'Read slides in order with presentation page numbers and visibility.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: () => ({
              slides: stateRef.current.map((s) => ({
                id: s.id,
                title: s.title,
                hidden: s.hidden,
                number: numberOf(stateRef.current, s.id),
                kind: s.kind,
              })),
            }),
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    const updateSlot = () => {
      const d = dragRef.current;
      if (!d?.active) return;
      const hit = document
        .elementFromPoint(d.x, d.y)
        ?.closest<HTMLElement>('[data-slide-id]');
      if (hit) {
        const index = stateRef.current.findIndex(
            (s) => s.id === hit.dataset.slideId,
          ),
          rect = hit.getBoundingClientRect();
        if (index >= 0) {
          const singleColumn =
            rect.width > (gridRef.current?.clientWidth || 0) * 0.7;
          const after = singleColumn
            ? d.y > rect.top + rect.height / 2
            : d.x > rect.left + rect.width / 2;
          d.slot = index + (after ? 1 : 0);
          setDragUI({ id: d.id, slot: d.slot });
        }
      }
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.active && Math.hypot(d.x - d.startX, d.y - d.startY) > 6) {
        d.active = true;
        suppressClick.current = true;
        document.body.classList.add('dragging');
      }
      if (d.active) {
        e.preventDefault();
        updateSlot();
      }
    };
    const end = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d?.active && e.type !== 'pointercancel')
        change(reorder(stateRef.current, d.id, d.slot));
      dragRef.current = null;
      setDragUI(null);
      document.body.classList.remove('dragging');
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    let frame = 0;
    const scroll = () => {
      const d = dragRef.current,
        grid = gridRef.current;
      if (d?.active && grid) {
        const rect = grid.getBoundingClientRect(),
          edge = 64;
        const speed =
          d.y < rect.top + edge
            ? -Math.min(18, (rect.top + edge - d.y) / 3)
            : d.y > rect.bottom - edge
              ? Math.min(18, (d.y - rect.bottom + edge) / 3)
              : 0;
        if (speed && d.x >= rect.left && d.x <= rect.right) {
          grid.scrollTop += speed;
          updateSlot();
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragRef.current = null;
        setDragUI(null);
        document.body.classList.remove('dragging');
      }
    };
    window.addEventListener('keydown', cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', cancel);
    };
  }, []);
  function beginDrag(e: ReactPointerEvent, s: Slide, handle = false) {
    if (
      e.button !== 0 ||
      !ready ||
      busy ||
      (!handle && e.pointerType !== 'mouse')
    )
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: s.id,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      slot: stateRef.current.findIndex((x) => x.id === s.id),
    };
  }
  useEffect(() => {
    if (!present) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPresent(false);
        return;
      }
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        setPosition((p) => Math.min(p + 1, visible.length - 1));
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        setPosition((p) => Math.max(p - 1, 0));
      }
      if (e.key === 'Home') setPosition(0);
      if (e.key === 'End') setPosition(visible.length - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [present, visible.length]);
  useEffect(() => {
    const exit = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    document.addEventListener('fullscreenchange', exit);
    return () => document.removeEventListener('fullscreenchange', exit);
  }, []);
  useEffect(() => {
    if (!present) return;
    visible
      .slice(Math.max(0, position - 1), position + 3)
      .filter((s) => s.kind === 'image')
      .forEach((s) => {
        const img = new Image();
        img.src = s.src;
      });
  }, [position, present]);
  async function save() {
    const snapshot = stateRef.current;
    setBusy(true);
    try {
      await saveDeck(snapshot);
      if (stateRef.current === snapshot) {
        setDirty(false);
        setStatus('이 브라우저에 저장됨');
      }
    } catch {
      setStatus('저장 실패 · 브라우저 저장 공간을 확인하세요.');
    } finally {
      setBusy(false);
    }
  }
  function insert(newSlides: Slide[], after = selected) {
    const next = [...stateRef.current],
      at = next.findIndex((s) => s.id === after);
    next.splice(at + 1, 0, ...newSlides);
    change(next);
    select(newSlides[0].id);
    setAdding(false);
  }
  function addLink(raw = url, name = title) {
    try {
      const parsed = embed(raw);
      insert([
        {
          id: crypto.randomUUID(),
          title: name.trim() || new URL(parsed.src).hostname,
          ...parsed,
          hidden: false,
          autoplay: true,
          controls: false,
          muted: true,
        },
      ]);
      setUrl('');
      setTitle('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : '주소를 확인하세요.');
    }
  }
  function chooseFiles(target: string | null = null) {
    importMode.current = 'gallery';
    photoTarget.current = target;
    fileRef.current?.click();
  }
  function chooseFolioFiles(target: string | null = null) {
    importMode.current = 'folio'; photoTarget.current = target; fileRef.current?.click();
  }
  async function importPhotos(files: File[]) {
    if (!files.length) return;
    const mode = importMode.current;
    const target = photoTarget.current,
      after = selected,
      grouped = group;
    if (mode === 'folio' && target && files.length !== 1) { setStatus('교체할 이미지 한 장을 선택하세요.'); return; }
    const existing = target
      ? stateRef.current.find((s) => s.id === target)?.photos || []
      : [];
    if (files.length + existing.length > 60) {
      setStatus('한 번에 최대 60장까지 선택할 수 있습니다.');
      return;
    }
    setBusy(true);
    setStatus('이미지 불러오는 중');
    const palettes: Record<string, FolioPalette> = {};
    const photos: Photo[] = [],
      entries: [string, Blob][] = [],
      newUrls: Record<string, string> = {};
    try {
      for (const file of files) {
        if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))
          throw Error(`${file.name} · PNG, JPG, WEBP, GIF, AVIF를 선택하세요.`);
        if (file.size > 40 * 1024 * 1024)
          throw Error(`${file.name} · 이미지 한 장은 40MB 이하여야 합니다.`);
        const id = crypto.randomUUID(),
          src = URL.createObjectURL(file);
        newUrls[id] = src;
        const img = new Image();
        img.src = src;
        await img.decode();
        if (!img.naturalWidth || !img.naturalHeight)
          throw Error(`${file.name} · 이미지 크기를 읽지 못했습니다.`);
        if (mode === 'folio') palettes[id] = detectFolioPalette(img);
        photos.push({
          id,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        entries.push([id, file]);
      }
      await saveImages(entries);
      Object.entries(newUrls).forEach(([id, src]) =>
        objectUrls.current.set(id, src),
      );
      setAssets((a) => ({ ...a, ...newUrls }));
      if (target && stateRef.current.some((s) => s.id === target))
        patch(target, mode === 'folio' ? { photos, folioPalette: palettes[photos[0].id] } : { photos: [...existing, ...photos] });
      else {
        const groups = mode === 'folio' ? photos.map(p => [p]) : grouped ? [photos] : photos.map((p) => [p]);
        insert(
          groups.map((ps) => ({
            id: crypto.randomUUID(),
            title: ps[0].name.replace(/\.[^.]+$/, ''),
            kind: mode,
            ...(mode === 'folio' ? { folioPalette: palettes[ps[0].id] } : {}),
            src: '',
            hidden: false,
            photos: ps,
          })),
          after,
        );
      }
    } catch (e) {
      Object.values(newUrls).forEach((src) => URL.revokeObjectURL(src));
      setStatus(
        e instanceof Error ? e.message : '이미지를 추가하지 못했습니다.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function start() {
    if (!visible.length) return;
    setLive(false);
    setPosition(
      Math.max(
        0,
        visible.findIndex((s) => s.id === selected),
      ),
    );
    setPresent(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {}
  }
  async function preparePreview(slide: Slide, file?: File) {
    let blob: Blob;
    if (file) blob = file;
    else {
      const response = await fetch('/api/capture?url=' + encodeURIComponent(slide.src), { signal: AbortSignal.timeout(55000) });
      if (!response.ok) throw Error(await response.text());
      blob = await response.blob();
    }
    if (!blob.type.startsWith('image/') || blob.size > 40 * 1024 * 1024) throw Error('40MB 이하의 캡처 이미지를 선택하세요.');
    const src = URL.createObjectURL(blob), id = crypto.randomUUID();
    try {
      const image = new Image(); image.src = src; await image.decode();
      await saveImages([[id, blob]]);
      objectUrls.current.set(id, src); setAssets(a => ({ ...a, [id]: src })); patch(slide.id, { previewId: id });
    } catch (e) { URL.revokeObjectURL(src); throw e; }
  }
  async function captureSelected(file?: File) {
    if (!active) return; setBusy(true); setStatus('미리보기 캡처 중');
    try { await preparePreview(active, file); setStatus('캡처 완료 · 저장되지 않음'); }
    catch (e) { setStatus(e instanceof Error ? e.message : '캡처 실패 · 이미지 파일을 지정하세요.'); }
    finally { setBusy(false); if (previewFileRef.current) previewFileRef.current.value = ''; }
  }
  async function exportPdf() {
    setPrinting(true);
    setBusy(true);
    setStatus('PDF 이미지 준비 중');
    try {
      for (const slide of visible.filter(s => s.kind === 'web' || s.kind === 'youtube')) {
        if (!previewSource(slide, Object.fromEntries(objectUrls.current))) {
          setStatus(`${slide.title} · 미리보기 캡처 중`); await preparePreview(slide);
        }
      }
      const preparedAssets = Object.fromEntries(objectUrls.current);
      const sources = stateRef.current.filter(s => !s.hidden).flatMap((s) =>
        s.kind === 'image'
          ? [s.src]
          : s.kind === 'gallery' || s.kind === 'folio'
            ? (s.photos || []).map((p) => preparedAssets[p.id])
            : [previewSource(s, preparedAssets)],
      );
      await Promise.all(
        sources.map(
          (src) =>
            new Promise<void>((resolve, reject) => {
              if (!src) return reject(Error('이미지 파일이 없습니다.'));
              const img = new Image(),
                timer = setTimeout(
                  () => reject(Error('이미지 로딩 시간 초과')),
                  30000,
                );
              img.onload = () => {
                clearTimeout(timer);
                resolve();
              };
              img.onerror = () => {
                clearTimeout(timer);
                reject(Error('이미지 로딩 실패'));
              };
              img.src = src;
            }),
        ),
      );
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      window.print();
      setStatus('인쇄 창에서 PDF로 저장 · 임베드는 미리보기 이미지로 포함');
    } catch (e) {
      setStatus('PDF 준비 실패 · ' + (e instanceof Error ? e.message : '미리보기 이미지를 지정하세요.'));
    } finally {
      setBusy(false);
      setPrinting(false);
    }
  }
  return (
    <>
      <input ref={previewFileRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void captureSelected(file); }}/>
      <div className="editor">
        <header className="toolbar">
          <span>
            발표 {visible.length} / 전체 {slides.length}
          </span>
          <button
            disabled={!ready || busy}
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
          >
            추가
          </button>
          <button disabled={!ready || busy} title="원본 작업을 시작 시기순으로 정렬합니다. 추가 슬라이드의 자리는 유지합니다." onClick={() => change(sortOriginalSlides(slides))}>시기순</button>
          <button disabled={!historyCount || busy} onClick={undo}>
            되돌리기
          </button>
          <span className="spacer" />
          <span className="status" role="status">
            {status}
          </span>
          <button disabled={!ready || busy} onClick={save}>
            저장{dirty ? ' *' : ''}
          </button>
          <button
            disabled={!ready || busy || !visible.length}
            onClick={exportPdf}
          >
            {printing ? 'PDF 준비 중' : 'PDF'}
          </button>
          <button disabled={!ready || busy || !visible.length} onClick={start}>
            발표
          </button>
        </header>
        {adding && (
          <section className="add-panel">
            <div className="input-row">
              <input
                aria-label="슬라이드 이름"
                placeholder="이름 (선택)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                aria-label="웹 또는 영상 주소"
                placeholder="웹·유튜브 주소 또는 iframe"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && url.trim()) addLink();
                }}
              />
              <button disabled={!url.trim() || busy} onClick={() => addLink()}>
                링크 추가
              </button>
            </div>
            <div className="row presets">
              <button disabled={busy} onClick={() => insert([{id:crypto.randomUUID(),title:'음향형태론 전시 영상',kind:'video',src:'/media/audio-morphology.mp4',hidden:false,autoplay:true,muted:true,controls:false}])}>음향형태론 전시 영상</button>
              {presets.map(([n, u]) => (
                <button disabled={busy} key={u} onClick={() => addLink(u, n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="row">
              <button disabled={busy} onClick={() => chooseFolioFiles()}>포트폴리오 조판면 추가</button>
              <button disabled={busy} onClick={() => chooseFiles()}>
                이미지 선택
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  checked={group}
                  onChange={(e) => setGroup(e.target.checked)}
                />
                여러 이미지를 한 슬라이드에
              </label>
            </div>
          </section>
        )}
        <input
          className="file-input"
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          onChange={(e) => void importPhotos(Array.from(e.target.files || []))}
        />
        <main className="workspace" inert={!ready || busy}>
          <div className="grid" ref={gridRef} aria-label="슬라이드 순서">
            {slides.map((s, i) => (
              <article
                data-slide-id={s.id}
                key={s.id}
                className={`card ${selected === s.id ? 'selected' : ''} ${s.hidden ? 'hidden-slide' : ''} ${dragUI?.id === s.id ? 'drag-source' : ''} ${dragUI?.slot === i ? 'drop-before' : ''} ${dragUI?.slot === slides.length && i === slides.length - 1 ? 'drop-after' : ''}`}
              >
                <button
                  className="thumbnail"
                  onPointerDown={(e) => beginDrag(e, s)}
                  onClick={() => {
                    if (!suppressClick.current) select(s.id);
                  }}
                  aria-label={`${i + 1}. ${s.title}${s.hidden ? ' 숨김' : ''}`}
                  aria-pressed={selected === s.id}
                >
                  <SlideView
                    key={s.id}
                    slide={s}
                    number={numberOf(slides, s.id)}
                    assets={assets}
                  />
                </button>
                <div className="card-meta">
                  <span>{numberOf(slides, s.id) ?? '—'}</span>
                  <button className="card-title" onClick={() => select(s.id)}>
                    {s.title}
                  </button>
                  <button
                    className="drag-handle"
                    title="드래그 또는 방향키로 이동"
                    aria-label={`${s.title} 순서 이동`}
                    onPointerDown={(e) => beginDrag(e, s, true)}
                    onKeyDown={(e) => {
                      if (
                        [
                          'ArrowLeft',
                          'ArrowUp',
                          'ArrowRight',
                          'ArrowDown',
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        change(
                          reorder(
                            stateRef.current,
                            s.id,
                            i +
                              (['ArrowLeft', 'ArrowUp'].includes(e.key)
                                ? -1
                                : 2),
                          ),
                        );
                      }
                    }}
                  >
                    ↕
                  </button>
                </div>
              </article>
            ))}
            {!slides.length && (
              <button onClick={() => setAdding(true)}>슬라이드 추가</button>
            )}
          </div>
          <aside>
            {active ? (
              <>
                <div className="preview">
                  <SlideView
                    key={`${active.id}-${live}`}
                    slide={active}
                    number={numberOf(slides, active.id)}
                    assets={assets}
                    live={live}
                  />
                </div>
                <div className="properties">
                  <input
                    className="title-input"
                    aria-label="선택한 슬라이드 이름"
                    value={active.title}
                    onChange={(e) =>
                      patch(active.id, { title: e.target.value })
                    }
                  />
                  <div className="row">
                    <button
                      onClick={() =>
                        patch(active.id, { hidden: !active.hidden })
                      }
                    >
                      {active.hidden ? '표시' : '숨김'}
                    </button>
                    <button
                      onClick={() => {
                        const index = slides.indexOf(active),
                          next = slides.filter((s) => s.id !== active.id);
                        change(next);
                        select(
                          next[Math.min(index, next.length - 1)]?.id || '',
                        );
                      }}
                    >
                      삭제
                    </button>
                    <span className="spacer" />
                    <button
                      disabled={slides.indexOf(active) === 0}
                      aria-label="앞으로 이동"
                      onClick={() =>
                        change(
                          reorder(
                            slides,
                            active.id,
                            slides.indexOf(active) - 1,
                          ),
                        )
                      }
                    >
                      ←
                    </button>
                    <button
                      disabled={slides.indexOf(active) === slides.length - 1}
                      aria-label="뒤로 이동"
                      onClick={() =>
                        change(
                          reorder(
                            slides,
                            active.id,
                            slides.indexOf(active) + 2,
                          ),
                        )
                      }
                    >
                      →
                    </button>
                  </div>
                  {['web', 'youtube', 'video'].includes(active.kind) && (
                    <div className="row">
                      <button onClick={() => setLive((v) => !v)}>
                        {live ? '미리보기 닫기' : '미리보기'}
                      </button>
                      <a href={active.kind === 'video' ? '/audio-morphology.html' : active.src} target="_blank" rel="noreferrer">
                        새 탭 ↗
                      </a>
                      {active.kind !== 'video' && <button disabled={busy} onClick={() => void captureSelected()}>캡처 갱신</button>}
                      <button disabled={busy} onClick={() => previewFileRef.current?.click()}>캡처 이미지 지정</button>
                    </div>
                  )}
                  {(active.kind === 'youtube' || active.kind === 'video') && (
                    <div className="video-settings">
                      {(
                        [
                          ['autoplay', '자동 재생', active.autoplay !== false],
                          ['controls', '컨트롤 표시', active.controls === true],
                          ['muted', '음소거', active.muted !== false],
                        ] as const
                      ).map(([key, label, checked]) => (
                        <label className="check" key={key}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              patch(active.id, { [key]: e.target.checked })
                            }
                          />
                          {label}
                        </label>
                      ))}
                      <span className="note">
                        소리를 켜면 브라우저가 자동 재생을 막을 수 있습니다.
                      </span>
                    </div>
                  )}
                  {active.kind === 'image' && <div className="note">{projectForPage(Number(active.src.match(/page-(\d+)/)?.[1]))?.period}</div>}
                  {active.kind === 'folio' && <div className="row"><button disabled={busy} onClick={() => chooseFolioFiles(active.id)}>조판면 이미지 교체</button></div>}
                  {active.kind === 'gallery' && (
                    <div className="photo-list">
                      <button
                        disabled={busy}
                        onClick={() => chooseFiles(active.id)}
                      >
                        이미지 더 넣기
                      </button>
                      {active.photos?.map((p, i) => (
                        <div className="photo-row" key={p.id}>
                          <span>{p.name}</span>
                          <button
                            disabled={i === 0}
                            aria-label={`${p.name} 앞으로`}
                            onClick={() => {
                              const ps = [...active.photos!];
                              [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]];
                              patch(active.id, { photos: ps });
                            }}
                          >
                            ←
                          </button>
                          <button
                            disabled={i === active.photos!.length - 1}
                            aria-label={`${p.name} 뒤로`}
                            onClick={() => {
                              const ps = [...active.photos!];
                              [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]];
                              patch(active.id, { photos: ps });
                            }}
                          >
                            →
                          </button>
                          <button
                            disabled={active.photos!.length === 1}
                            aria-label={`${p.name} 삭제`}
                            onClick={() =>
                              patch(active.id, {
                                photos: active.photos!.filter(
                                  (x) => x.id !== p.id,
                                ),
                              })
                            }
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="properties">슬라이드를 선택하세요.</div>
            )}
          </aside>
        </main>
      </div>
      {present && current && (
        <div className="presentation">
          <SlideView
            key={current.id}
            slide={current}
            number={position + 1}
            assets={assets}
            live
            playing
          />
          <nav className="present-controls" aria-label="발표 이동">
            <button
              disabled={position === 0}
              onClick={() => setPosition((p) => Math.max(0, p - 1))}
            >
              ←
            </button>
            <span>
              {position + 1} / {visible.length}
            </span>
            <button
              disabled={position === visible.length - 1}
              onClick={() =>
                setPosition((p) => Math.min(visible.length - 1, p + 1))
              }
            >
              →
            </button>
            {(current.kind === 'youtube' || current.kind === 'video') && (
              <button
                onClick={() =>
                  patch(current.id, { controls: !current.controls })
                }
              >
                {current.controls ? '컨트롤 숨김' : '컨트롤 표시'}
              </button>
            )}
            <button
              onClick={() => {
                setPresent(false);
                if (document.fullscreenElement) void document.exitFullscreen();
              }}
            >
              종료
            </button>
          </nav>
        </div>
      )}
      <div className="print-deck">
        {visible.map((s, i) => (
          <section key={s.id} className="print-slide">
            <SlideView slide={s} number={i + 1} assets={assets} print />
          </section>
        ))}
      </div>
    </>
  );
}
