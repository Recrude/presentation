'use client';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  initial,
  embed,
  numberOf,
  reorder,
  reorderMany,
  duplicate,
  validDeck,
  defaultTypography,
  defaultMargin,
  DEFAULT_TAB,
  DEFAULT_GAP,
  ARRANGEMENTS,
  FORMATS,
  isFormat,
  sheetHeight,
  SEQUENCE_LIMIT,
  GALLERY_LIMIT,
  MAX_ASSET,
  type Slide,
  type Photo,
  type Typography,
  type Format,
} from './model';
import { fontData, missingFonts, importFontFiles } from './fonts';
import { COMPOSITES, fontsIn } from './composite';
import { readDeck, saveDeck, readImage, readImages, saveImages } from './storage';
import { SheetHeight, SlideView, sequenceSteps } from './slide-view';
import { PresentationStage } from './presentation-stage';
import { exhibitionVideo, prepareVideo } from './video-cache';
import { previewSource } from './previews';
import { originalSource, warmSlides } from './slide-assets';
import { sortOriginalSlides, projectForPage } from './chronology';
import { detectFolioPalette, type FolioPalette } from './folio-palette';
import { BASE, LEGACY_SLUG, deckEntry, localAsset, presentationUrl, readCatalog, withLocalDraft } from './catalog';
import { assetIds, readPublished } from './published';
import { publishDeck } from './github-publish';
import { exportBackup, importBackup, receiveLegacy } from './transfer';
const presets = [
  ['VED', 'https://ved.kr/'],
  ['What are you doing now?', 'https://whatareyoudoingnow.vercel.app/'],
  ['jaeyeonkim.kr', 'https://jaeyeonkim.kr/'],
  ['영상', 'https://www.youtube-nocookie.com/embed/QIAcSGkOLDk'],
];
const typographyFields: [Exclude<keyof Typography, 'composite' | 'tabs' | 'indent'>, string, number, number, number][] = [
  ['size', '크기', 8, 400, 1], ['leading', '행간', 8, 800, 1], ['paragraph', '문단', 0, 1000, 1], ['tracking', '자간', -300, 1000, 5],
  ['top', '위·왼쪽', 0, 900, 1], ['right', '오른쪽', 0, 900, 1],
];
const endings = [['loop', '반복'], ['hold', '멈춤'], ['next', '다음 장']] as const;
// Keeps the typed text while it is not yet a valid number (e.g. "0." on the way to "0.5").
function NumberField({ label, value, min, max, step = 1, optional = false, placeholder = '—', onChange }: { label: string; value: number | undefined; min: number; max: number; step?: number; optional?: boolean; placeholder?: string; onChange: (value: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => { if ((text === '' ? undefined : Number(text)) !== value) setText(value === undefined ? '' : String(value)); }, [value]);
  return <label>{label}<input type="number" inputMode="decimal" min={min} max={max} step={step} value={text} placeholder={placeholder}
    onChange={e => {
      setText(e.target.value);
      const next = e.target.value === '' ? undefined : Number(e.target.value);
      if (next === undefined ? optional : Number.isFinite(next) && next >= min && next <= max) onChange(next);
    }}
    onBlur={() => setText(value === undefined ? '' : String(value))}/></label>;
}
async function folderFiles(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = entry.createReader(), entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    entries.push(...batch);
  }
  return Promise.all(entries.filter((e): e is FileSystemFileEntry => e.isFile).map(e => new Promise<File>((resolve, reject) => e.file(resolve, reject))));
}
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });
type Drag = {
  /** The grabbed slide; ids are all slides that move with it, in deck order. */
  id: string;
  ids: string[];
  ghost?: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  slot: number;
};
export default function Home({entry, publicView = false}: {entry: {slug: string; shortSlug?: string; date: string; title: string}; publicView?: boolean}) {
  const backupRef = useRef<HTMLInputElement>(null);
  useEffect(() => { document.title = `${entry.date} · ${entry.title}`; }, [entry]);
  const [slides, setSlides] = useState<Slide[]>([]),
    [selected, select] = useState('');
  const [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState('불러오는 중');
  const [assets, setAssets] = useState<Record<string, string>>({}),
    [adding, setAdding] = useState(false),
    [url, setUrl] = useState(''),
    [title, setTitle] = useState('');
  const [cacheStatus, setCacheStatus] = useState('');
  const [videoStatus, setVideoStatus] = useState('');
  const [videoRetry, setVideoRetry] = useState(0);
  const [busy, setBusy] = useState(false),
    [group, setGroup] = useState(true),
    [live, setLive] = useState(false);
  const [navigationVisible, setNavigationVisible] = useState(true);
  const [present, setPresent] = useState(publicView),
    [position, setPosition] = useState(0),
    [printing, setPrinting] = useState(false);
  const [dragUI, setDragUI] = useState<{ ids: string[]; slot: number } | null>(
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
    importMode = useRef<'gallery' | 'folio' | 'sequence'>('gallery'),
    clipRef = useRef<HTMLInputElement>(null),
    fontFileRef = useRef<HTMLInputElement>(null);
  const [fontsMissing, setFontsMissing] = useState<string[]>([]);
  const [shownId, setShownId] = useState('');
  const [fileOver, setFileOver] = useState(false);
  // Other presentations made in this editor, offered as a source of slides.
  const [sources, setSources] = useState<{ slug: string; title: string; date: string }[]>([]),
    [source, setSource] = useState('');
  // 판형 belongs to the presentation; undefined is 16:9. Not part of the slide undo history.
  const [format, setFormat] = useState<Format | undefined>();
  const height = sheetHeight(format);
  // Picked slides (several with ⌘/Shift); the one shown in the panel is `selected`.
  const [picked, setPicked] = useState<string[]>([]);
  const anchorRef = useRef('');
  stateRef.current = slides;
  const visible = slides.filter((s) => !s.hidden),
    active = slides.find((s) => s.id === selected),
    current = visible[position];
  const selection = picked.includes(selected) ? slides.filter(s => picked.includes(s.id)).map(s => s.id) : selected ? [selected] : [];
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
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
  function patchTypography(id: string, values: Partial<Typography>) {
    const typo = stateRef.current.find(s => s.id === id)?.typo || defaultTypography;
    patch(id, { typo: { ...typo, ...values } });
  }
  // A new text slide continues the type of the nearest text slide before it, like a Keynote master.
  function nearestTypography() {
    const at = stateRef.current.findIndex(s => s.id === selected);
    return stateRef.current.slice(0, at + 1).reverse().find(s => s.kind === 'text')?.typo || defaultTypography;
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
      try {
        const draft = publicView ? undefined : await readDeck(entry.slug);
        const snapshot = draft ? null : await readPublished(entry.slug);
        const deck = draft?.slides ?? snapshot?.slides ?? (entry.slug === LEGACY_SLUG && !publicView ? initial : []);
        if (!validDeck(deck)) throw Error('저장된 발표를 읽을 수 없습니다.');
        const loaded: Record<string, string> = { ...(snapshot?.assets || {}), ...(draft?.assets || {}) };
        const ids = assetIds(deck);
        const blobs = publicView ? {} : await readImages(ids);
        let missing = 0;
        for (const id of ids) {
          if (cancelled) return;
          const blob = blobs[id];
          if (blob) { const src = URL.createObjectURL(blob); objectUrls.current.set(id, src); loaded[id] = src; }
          else if (!loaded[id]) missing++;
        }
        if (!cancelled) {
          const saved = draft ? draft.format : snapshot?.format;
          stateRef.current = deck; setSlides(deck); select(deck[0]?.id || ''); setAssets(loaded); setFormat(isFormat(saved) ? saved : undefined);
          setStatus(missing ? `이미지 ${missing}개 없음 · 다시 추가하세요` : ''); setReady(true);
        }
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : '발표를 불러오지 못했습니다.');
      }
    })();
    return () => { cancelled = true; objectUrls.current.forEach(src => URL.revokeObjectURL(src)); objectUrls.current.clear(); };
  }, [entry.slug, publicView]);

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
    // The drop slot comes from the card under the pointer, or the nearest card when the pointer is in
    // a gap, so drops between rows and after the last card land where expected.
    const updateSlot = () => {
      const d = dragRef.current, grid = gridRef.current;
      if (!d?.active || !grid) return;
      const under = document.elementFromPoint(d.x, d.y);
      let hit = under?.closest<HTMLElement>('[data-slide-id]');
      if (!hit && under && grid.contains(under)) {
        let best = Infinity;
        for (const card of grid.querySelectorAll<HTMLElement>('[data-slide-id]')) {
          const r = card.getBoundingClientRect();
          const distance = Math.hypot(Math.max(r.left - d.x, 0, d.x - r.right), Math.max(r.top - d.y, 0, d.y - r.bottom));
          if (distance < best) { best = distance; hit = card; }
        }
      }
      if (!hit) return;
      const id = hit.dataset.slideId, index = stateRef.current.findIndex(s => s.id === id), rect = hit.getBoundingClientRect();
      if (index < 0) return;
      const singleColumn = rect.width > grid.clientWidth * 0.7;
      const after = singleColumn ? d.y > rect.top + rect.height / 2 : d.x > rect.left + rect.width / 2;
      d.slot = index + (after ? 1 : 0);
      setDragUI({ ids: d.ids, slot: d.slot });
    };
    // A small copy of the grabbed thumbnail follows the pointer, with the count when several move.
    const showGhost = (d: Drag) => {
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      const thumbnail = gridRef.current?.querySelector(`[data-slide-id="${CSS.escape(d.id)}"] .thumbnail`);
      if (thumbnail) ghost.append(thumbnail.cloneNode(true));
      if (d.ids.length > 1) ghost.append(Object.assign(document.createElement('span'), { textContent: `${d.ids.length}장` }));
      document.body.append(ghost);
      d.ghost = ghost;
    };
    const finish = () => {
      dragRef.current?.ghost?.remove();
      dragRef.current = null;
      setDragUI(null);
      document.body.classList.remove('dragging');
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
        if (!selectionRef.current.includes(d.id)) select(d.id);
        showGhost(d);
      }
      if (d.active) {
        e.preventDefault();
        if (d.ghost) d.ghost.style.transform = `translate(${d.x + 14}px, ${d.y + 14}px)`;
        updateSlot();
      }
    };
    const end = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d?.active && e.type !== 'pointercancel') change(reorderMany(stateRef.current, d.ids, d.slot));
      finish();
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    let frame = 0;
    // Near the top or bottom of the list (or beyond it) the list scrolls, faster the further out.
    const scroll = () => {
      const d = dragRef.current,
        grid = gridRef.current;
      if (d?.active && grid) {
        const rect = grid.getBoundingClientRect(),
          edge = 96;
        const speed =
          d.y < rect.top + edge
            ? -Math.min(40, (rect.top + edge - d.y) / 3)
            : d.y > rect.bottom - edge
              ? Math.min(40, (d.y - rect.bottom + edge) / 3)
              : 0;
        if (speed && d.x >= rect.left - edge && d.x <= rect.right + edge) {
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
      if (e.key === 'Escape' && dragRef.current) finish();
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
  // Several slides can be picked: ⌘/Ctrl-click adds or removes one, Shift-click a range. Dragging a
  // picked slide moves all of them together, in their current order.
  function pick(id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    const order = stateRef.current.map(s => s.id);
    if (e.shiftKey && order.includes(anchorRef.current)) {
      const [a, b] = [order.indexOf(anchorRef.current), order.indexOf(id)].sort((x, y) => x - y);
      setPicked(order.slice(a, b + 1));
    } else if (e.metaKey || e.ctrlKey) {
      const set = new Set(selectionRef.current);
      if (set.has(id) && set.size > 1) set.delete(id); else set.add(id);
      setPicked(order.filter(x => set.has(x)));
      anchorRef.current = id;
      if (!set.has(id)) { select(order.filter(x => set.has(x)).at(-1)!); return; }
    } else {
      setPicked([id]);
      anchorRef.current = id;
    }
    select(id);
  }
  function beginDrag(e: ReactPointerEvent, s: Slide, handle = false) {
    if (
      e.button !== 0 ||
      e.shiftKey || e.metaKey || e.ctrlKey ||
      !ready ||
      busy ||
      (!handle && e.pointerType !== 'mouse')
    )
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ids = selection.includes(s.id) ? slides.filter(x => selection.includes(x.id)).map(x => x.id) : [s.id];
    dragRef.current = {
      id: s.id,
      ids,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      slot: stateRef.current.findIndex((x) => x.id === s.id),
    };
  }
  // Copies slides (the picked ones by default) right after the last of them and picks the copies,
  // ready to edit or drag.
  function duplicateSlides(ids = selectionRef.current) {
    const { slides: next, copies } = duplicate(stateRef.current, ids);
    if (!copies.length) return;
    change(next);
    setPicked(copies);
    anchorRef.current = copies[0];
    select(copies[0]);
  }
  // ⌘D / Ctrl+D duplicates while editing, outside text fields.
  useEffect(() => {
    if (present || !ready || busy) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'd') return;
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, [contenteditable]')) return;
      e.preventDefault();
      duplicateSlides();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [present, ready, busy]);
  useEffect(() => {
    if (!present) return;
    const key = (e: KeyboardEvent) => {
      const arrow = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key);
      if (arrow) { e.preventDefault(); e.stopImmediatePropagation(); }
      if (!arrow && e.key !== 'Escape' && e.target instanceof HTMLElement && e.target.closest('video, input, button, select, textarea, [contenteditable]')) return;
      if (e.key === 'Escape') {
        if (publicView) { if (document.fullscreenElement) void document.exitFullscreen(); return; }
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
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [present, visible.length, publicView]);
  useEffect(() => {
    const exit = () => {
      if (!document.fullscreenElement && !publicView) setPresent(false);
    };
    document.addEventListener('fullscreenchange', exit);
    return () => document.removeEventListener('fullscreenchange', exit);
  }, []);
  useEffect(() => {
    if (!present) return;
    const decoded: HTMLImageElement[] = [];
    visible.slice(Math.max(0, position - 1), position + 3).forEach(slide => {
      const sources = slide.kind === 'image' ? [originalSource(slide.src)]
        : slide.kind === 'gallery' || slide.kind === 'folio'
          ? (slide.photos || []).map(photo => assets[photo.id]).filter(Boolean)
          : slide.kind === 'sequence' ? (slide.photos || []).slice(0, 4).map(photo => assets[photo.id]).filter(Boolean)
            : (slide.kind === 'clip' || slide.kind === 'text' && publicView) && slide.previewId && assets[slide.previewId] ? [assets[slide.previewId]] : [];
      sources.forEach(src => {
        const image = new Image();
        image.src = src;
        decoded.push(image);
        void image.decode().catch(() => undefined);
      });
    });
    // Keep decoded adjacent images alive only for this small navigation window.
    return () => { decoded.length = 0; };
  }, [position, present, slides, assets]);
  useEffect(() => {
    if (!present) return;
    let timer: ReturnType<typeof setTimeout>;
    const reveal = () => {
      setNavigationVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setNavigationVisible(false), 1800);
    };
    reveal();
    window.addEventListener('pointermove', reveal, { passive: true });
    window.addEventListener('pointerdown', reveal, { passive: true });
    window.addEventListener('keydown', reveal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('keydown', reveal);
    };
  }, [present]);
  useEffect(() => {
    if (!present) return;
    let timer: ReturnType<typeof setTimeout>;
    const restore = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLIFrameElement && focused.closest('.presentation')) {
          focused.blur();
          window.focus();
          document.querySelector<HTMLElement>('.presentation')?.focus({ preventScroll: true });
          setNavigationVisible(true);
        }
      }, 0);
    };
    window.addEventListener('blur', restore);
    return () => { clearTimeout(timer); window.removeEventListener('blur', restore); };
  }, [present]);
  const preloadSources = JSON.stringify(visible.filter(s => s.kind === 'image').map(s => originalSource(s.src)));
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const sources: string[] = JSON.parse(preloadSources);
    const timer = setTimeout(() => {
      setCacheStatus(`원본 준비 0/${sources.length}`);
      void warmSlides(sources, controller.signal, (done, failed) => {
        setCacheStatus(done === sources.length
          ? failed ? `원본 ${failed}장 재시도 필요` : '원본 준비 완료'
          : `원본 준비 ${done}/${sources.length}`);
      });
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ready, preloadSources]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    if (!slides.some(s => !s.hidden && s.kind === 'video')) { setVideoStatus(''); return; }
    let objectUrl = '';
    setVideoStatus('영상 준비 중');
    const timeout = setTimeout(() => controller.abort(), 300000);
    let cancelled = false;
    void prepareVideo(controller.signal, percent => {
      if (!cancelled) setVideoStatus(`영상 다운로드 ${percent}%`);
    }).then(({ blob, persistent }) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setAssets(previous => ({ ...previous, [exhibitionVideo]: objectUrl }));
      setVideoStatus(persistent ? '영상 준비 완료' : '영상 준비 완료 · 이번 탭에서 사용');
    }).catch(() => {
      if (!cancelled) setVideoStatus('영상 다운로드 재시도');
    }).finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ready, videoRetry, slides.some(s => !s.hidden && s.kind === 'video')]);
  const advanceRef = useRef({ id: '', length: 0 });
  advanceRef.current = { id: current?.id || '', length: visible.length };
  useEffect(() => {
    // Auto-advance counts from the moment the slide is actually on screen.
    if (!present || !current?.advance || current.id !== shownId) return;
    const timer = setTimeout(() => setPosition(p => Math.min(p + 1, advanceRef.current.length - 1)), current.advance * 1000);
    return () => clearTimeout(timer);
  }, [present, current?.id, current?.advance, shownId]);
  function finish(id: string) {
    if (advanceRef.current.id === id) setPosition(p => Math.min(p + 1, advanceRef.current.length - 1));
  }
  const textFonts = (deck: Slide[]) => [...new Set(deck.filter(s => s.kind === 'text').flatMap(s => fontsIn(s.text || '', s.typo?.composite === 'bold')))];
  const usedFonts = textFonts(slides).sort().join(',');
  useEffect(() => {
    if (publicView || !usedFonts) return;
    let cancelled = false;
    void missingFonts(usedFonts.split(',')).then(missing => { if (!cancelled) setFontsMissing(missing); });
    return () => { cancelled = true; };
  }, [publicView, usedFonts]);
  async function chooseFontFiles(files: File[]) {
    if (!files.length) return;
    try { await importFontFiles(files); setFontsMissing(usedFonts ? await missingFonts(usedFonts.split(',')) : []); setStatus('글꼴을 이 브라우저에 보관했습니다'); }
    catch (e) { setStatus(e instanceof Error ? e.message : '글꼴 파일을 확인하세요.'); }
    finally { if (fontFileRef.current) fontFileRef.current.value = ''; }
  }
  async function save() {
    const snapshot = stateRef.current;
    setBusy(true);
    try {
      await saveDeck(snapshot, entry.slug, assets, format);
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
      const slide: Slide = {
        id: crypto.randomUUID(),
        title: name.trim() || new URL(parsed.src).hostname,
        ...parsed,
        ...(parsed.kind === 'web' ? { frame: 'browser' as const } : {}),
        hidden: false,
        autoplay: true,
        controls: true,
        muted: true,
      };
      insert([slide]);
      setUrl('');
      setTitle('');
      // A new web page is captured right away: the preview for thumbnails and PDF, and Safari's toolbar color.
      if (slide.kind === 'web') {
        setStatus(`${slide.title} · 캡처 중`);
        preparePreview(slide).then(() => setStatus('캡처 완료 · 저장되지 않음'),
          e => setStatus(`${slide.title} · ${e instanceof Error ? e.message : '캡처 실패'} · 캡처 이미지를 지정할 수 있습니다`));
      }
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
  function chooseSequence(target: string | null = null) {
    importMode.current = 'sequence'; photoTarget.current = target; fileRef.current?.click();
  }
  // Decodes and stores images in this browser. Object URLs are registered only after storage succeeds.
  async function loadPhotos(files: File[], folio = false) {
    const palettes: Record<string, FolioPalette> = {};
    const photos: Photo[] = [],
      entries: [string, Blob][] = [],
      newUrls: Record<string, string> = {};
    try {
      for (const file of files) {
        if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))
          throw Error(`${file.name} · PNG, JPG, WEBP, GIF, AVIF를 선택하세요.`);
        if (file.size > MAX_ASSET)
          throw Error(`${file.name} · 이미지 한 장은 40MB 이하여야 합니다.`);
        const id = crypto.randomUUID(),
          src = URL.createObjectURL(file);
        newUrls[id] = src;
        const img = new Image();
        img.src = src;
        await img.decode();
        if (!img.naturalWidth || !img.naturalHeight)
          throw Error(`${file.name} · 이미지 크기를 읽지 못했습니다.`);
        if (folio) palettes[id] = detectFolioPalette(img);
        photos.push({
          id,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        entries.push([id, file]);
      }
      await saveImages(entries);
    } catch (e) {
      Object.values(newUrls).forEach((src) => URL.revokeObjectURL(src));
      throw e;
    }
    Object.entries(newUrls).forEach(([id, src]) =>
      objectUrls.current.set(id, src),
    );
    setAssets((a) => ({ ...a, ...newUrls }));
    return { photos, palettes };
  }
  // New image slides lay several images out with one height and equal gaps (layout 'rows').
  const sequence = (photos: Photo[], title: string): Slide => ({ id: crypto.randomUUID(), title, kind: 'sequence', src: '', hidden: false, photos, interval: 400, end: 'loop', layout: 'rows' });
  // Several images either flip in place (넘김, a sequence) or sit together on one sheet in the automatic
  // grid (격자, an image set). The sequence timing stays on the slide for switching back.
  function arrange(slide: Slide, kind: 'sequence' | 'gallery') {
    if (kind === 'gallery' && (slide.photos?.length || 0) > GALLERY_LIMIT) { setStatus(`격자는 ${GALLERY_LIMIT}장까지입니다 · 넘김으로 두세요`); return; }
    patch(slide.id, kind === 'sequence' ? { kind, interval: slide.interval ?? 400, end: slide.end ?? 'loop' } : { kind, layout: slide.layout ?? 'rows' });
  }
  async function importPhotos(files: File[]) {
    if (!files.length) return;
    const mode = importMode.current;
    const target = photoTarget.current,
      after = selected,
      grouped = group;
    if (mode === 'folio' && target && files.length !== 1) { setStatus('교체할 이미지 한 장을 선택하세요.'); return; }
    const targetSlide = target ? stateRef.current.find((s) => s.id === target) : undefined;
    const existing = targetSlide?.photos || [];
    const limit = mode === 'sequence' || targetSlide?.kind === 'sequence' ? SEQUENCE_LIMIT : GALLERY_LIMIT;
    if (files.length + existing.length > limit) {
      setStatus(`한 번에 최대 ${limit}장까지 선택할 수 있습니다.`);
      return;
    }
    if (mode === 'sequence') files = [...files].sort(byName);
    setBusy(true);
    setStatus('이미지 불러오는 중');
    try {
      const { photos, palettes } = await loadPhotos(files, mode === 'folio');
      if (target && stateRef.current.some((s) => s.id === target))
        patch(target, mode === 'folio' ? { photos, folioPalette: palettes[photos[0].id] } : { photos: [...existing, ...photos] });
      else if (mode === 'sequence') insert([sequence(photos, photos[0].name.replace(/\.[^.]+$/, ''))], after);
      else {
        const groups = mode === 'folio' ? photos.map(p => [p]) : grouped ? [photos] : photos.map((p) => [p]);
        insert(
          groups.map((ps) => ({
            id: crypto.randomUUID(),
            title: ps[0].name.replace(/\.[^.]+$/, ''),
            kind: mode,
            ...(mode === 'folio' ? { folioPalette: palettes[ps[0].id] } : { layout: 'rows' as const }),
            src: '',
            hidden: false,
            photos: ps,
          })),
          after,
        );
      }
      setStatus('저장되지 않음');
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : '이미지를 추가하지 못했습니다.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  // A clip is stored with a poster frame used for thumbnails, PDF and the moment before playback.
  async function loadClip(file: File): Promise<Slide> {
    if (!/^video\/(mp4|webm)$/.test(file.type)) throw Error(`${file.name} · MP4, WebM 영상을 선택하세요.`);
    if (file.size > MAX_ASSET) throw Error(`${file.name} · 영상 한 개는 40MB 이하여야 합니다. 짧게 자르거나 압축하세요.`);
    const src = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = src;
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(Error(`${file.name} · 이 브라우저에서 재생할 수 없는 영상입니다.`)); });
      if (!video.videoWidth || !video.videoHeight) throw Error(`${file.name} · 영상 크기를 읽지 못했습니다.`);
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, 5000); video.onseeked = () => { clearTimeout(timer); resolve(); }; video.currentTime = Math.min(0.1, (video.duration || 0.2) / 2); });
      const scale = Math.min(1, 1920 / video.videoWidth), canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const poster = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('미리보기 프레임을 만들지 못했습니다.')), 'image/webp', 0.86));
      const mediaId = crypto.randomUUID(), posterId = crypto.randomUUID(), posterUrl = URL.createObjectURL(poster);
      await saveImages([[mediaId, file], [posterId, poster]]);
      objectUrls.current.set(mediaId, src); objectUrls.current.set(posterId, posterUrl);
      setAssets(a => ({ ...a, [mediaId]: src, [posterId]: posterUrl }));
      return { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), kind: 'clip', src: '', hidden: false, media: { id: mediaId, name: file.name, width: video.videoWidth, height: video.videoHeight }, previewId: posterId, end: 'loop', muted: true };
    } catch (e) { URL.revokeObjectURL(src); throw e; }
  }
  async function importClips(files: File[]) {
    if (!files.length) return;
    setBusy(true); setStatus('영상 불러오는 중');
    try { const added: Slide[] = []; for (const file of files) added.push(await loadClip(file)); insert(added); setStatus('저장되지 않음'); }
    catch (e) { setStatus(e instanceof Error ? e.message : '영상을 추가하지 못했습니다.'); }
    finally { setBusy(false); if (clipRef.current) clipRef.current.value = ''; }
  }
  // Finder drop: each folder becomes a sequence (files in name order), loose images one sequence,
  // a single image a picture slide, and each video a clip.
  async function dropFiles(transfer: DataTransfer) {
    const entries = Array.from(transfer.items).map(item => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
    const loose = Array.from(transfer.files);
    setBusy(true); setStatus('불러오는 중');
    try {
      const folders: { name: string; files: File[] }[] = [];
      for (const entry of entries) if (entry.isDirectory) folders.push({ name: entry.name, files: await folderFiles(entry as FileSystemDirectoryEntry) });
      const files = entries.length ? loose.filter(f => entries.some(e => e.isFile && e.name === f.name)) : loose;
      const image = (f: File) => /^image\/(png|jpeg|webp|gif|avif)$/.test(f.type), video = (f: File) => /^video\//.test(f.type);
      const added: Slide[] = [];
      for (const folder of folders) {
        const images = folder.files.filter(image).sort(byName);
        if (images.length > SEQUENCE_LIMIT) throw Error(`${folder.name} · 시퀀스는 최대 ${SEQUENCE_LIMIT}장입니다.`);
        if (images.length) added.push(sequence((await loadPhotos(images)).photos, folder.name));
        for (const file of folder.files.filter(video).sort(byName)) added.push(await loadClip(file));
      }
      const images = files.filter(image).sort(byName);
      if (images.length > SEQUENCE_LIMIT) throw Error(`시퀀스는 최대 ${SEQUENCE_LIMIT}장입니다.`);
      if (images.length) {
        const { photos } = await loadPhotos(images), title = photos[0].name.replace(/\.[^.]+$/, '');
        added.push(photos.length > 1 ? sequence(photos, title) : { id: crypto.randomUUID(), title, kind: 'gallery', src: '', hidden: false, photos, layout: 'rows' });
      }
      for (const file of files.filter(video).sort(byName)) added.push(await loadClip(file));
      if (!added.length) throw Error('이미지·영상 파일이나 폴더를 놓으세요.');
      insert(added);
      setStatus('저장되지 않음');
    } catch (e) { setStatus(e instanceof Error ? e.message : '파일을 추가하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  // Text slides are published as SVG outlines (fonts stay in this browser). Regenerated on every publish.
  async function outlineTexts(deck: Slide[], current: Record<string, string>) {
    const texts = deck.filter(s => !s.hidden && s.kind === 'text');
    if (!texts.length) return { deck, assets: current };
    setStatus('텍스트 윤곽 만드는 중');
    const data = await fontData(textFonts(texts));
    const { textSvg } = await import('./text-svg');
    const entries: [string, Blob][] = [], urls: Record<string, string> = {}, ids: Record<string, string> = {};
    for (const slide of texts) {
      const { blob, missing } = await textSvg(slide, data, height);
      if (missing.length) throw Error(`${slide.title} · 글꼴에 없는 글자: ${[...new Set(missing)].join(' ')}`);
      const id = crypto.randomUUID();
      entries.push([id, blob]); urls[id] = URL.createObjectURL(blob); ids[slide.id] = id;
    }
    await saveImages(entries);
    Object.entries(urls).forEach(([id, src]) => objectUrls.current.set(id, src));
    setAssets(a => ({ ...a, ...urls }));
    const next = deck.map(s => ids[s.id] ? { ...s, previewId: ids[s.id] } : s);
    if (stateRef.current === deck) { stateRef.current = next; setSlides(next); }
    return { deck: next, assets: { ...current, ...urls } };
  }
  async function publish() {
    setBusy(true);
    try {
      const { deck, assets: prepared } = await outlineTexts(stateRef.current, assets);
      await saveDeck(deck, entry.slug, prepared, format);
      setDirty(false);
      await publishDeck(entry.slug, deck, prepared, setStatus, format);
      setStatus('게시됨 · 배포 완료 후 공개 링크에 반영됩니다');
    } catch (e) { setStatus(e instanceof Error ? e.message : '게시 실패 · 편집 내용은 유지됩니다'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!adding || sources.length) return;
    let cancelled = false;
    void readCatalog().then(withLocalDraft).then(config => {
      const list = config.items.map(deckEntry).filter((p): p is NonNullable<typeof p> => !!p && p.slug !== entry.slug);
      if (!cancelled) { setSources(list); setSource(s => s || list[0]?.slug || ''); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [adding, sources.length, entry.slug]);
  // Appends another presentation's slides, hidden, to pick from: this browser's draft of it when
  // there is one (it keeps hidden slides and local images), else its published version.
  // Images are shared by id (they are never rewritten), published files by their URL.
  async function importSlides(slug: string) {
    setBusy(true); setStatus('장표 가져오는 중');
    try {
      const draft = await readDeck(slug);
      const snapshot = draft && validDeck(draft.slides) ? null : await readPublished(slug);
      const from = draft && validDeck(draft.slides) ? draft.slides : snapshot?.slides || [];
      const present = new Set(stateRef.current.map(s => s.id));
      const added = from.filter(s => !present.has(s.id)).map(s => ({ ...s, hidden: true }));
      if (!added.length) throw Error(from.length ? '이미 모두 가져온 장표입니다.' : '가져올 장표가 없습니다.');
      const known: Record<string, string> = { ...(snapshot?.assets || {}), ...(draft?.assets || {}) };
      const ids = assetIds(added).filter(id => !assets[id]), blobs = await readImages(ids), urls: Record<string, string> = {};
      for (const id of ids) {
        if (blobs[id]) { urls[id] = URL.createObjectURL(blobs[id]); objectUrls.current.set(id, urls[id]); }
        else if (known[id]) urls[id] = known[id];
      }
      setAssets(a => ({ ...a, ...urls }));
      change([...stateRef.current, ...added]);
      select(added[0].id);
      setStatus(`${added.length}장을 숨김으로 맨 뒤에 가져왔습니다 · 저장하세요`);
    } catch (e) { setStatus(e instanceof Error ? e.message : '가져오지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function restoreBackup(data: unknown) {
    setBusy(true);
    try {
      const restored = await importBackup(data);
      change(restored.slides); setAssets(a => ({...a, ...restored.assets})); setFormat(restored.format);
      for (const [id, url] of Object.entries(restored.assets)) if (url.startsWith('blob:')) objectUrls.current.set(id, url);
      select(restored.slides[0]?.id || ''); setStatus('불러옴 · 저장하거나 게시하세요');
    } catch(e) { setStatus(e instanceof Error ? e.message : '백업을 읽지 못했습니다'); }
    finally { setBusy(false); }
  }
  async function migrate() {
    setBusy(true); setStatus('이전 주소에서 저장된 작업을 가져오는 중');
    try { await restoreBackup(await receiveLegacy()); }
    catch(e) { setStatus(e instanceof Error ? e.message : '가져오기 실패'); }
    finally { setBusy(false); }
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
    let blob: Blob, toolbar: Pick<Slide, 'tint' | 'tintDark'> = {};
    if (file) blob = file;
    else {
      const response = await fetch(BASE + 'api/capture?url=' + encodeURIComponent(slide.src), { signal: AbortSignal.timeout(55000) });
      if (!response.ok) throw Error(await response.text());
      blob = await response.blob();
      // Safari's toolbar color for this page; a capture image picked by hand keeps the color already read.
      const color = (name: string) => { const value = response.headers.get(name); return value && /^#[0-9a-f]{6}$/.test(value) ? value : undefined; };
      const light = color('X-Toolbar-Color'), dark = color('X-Toolbar-Color-Dark');
      if (light) toolbar = { tint: light, tintDark: dark !== light ? dark : undefined };
    }
    if (!blob.type.startsWith('image/') || blob.size > 40 * 1024 * 1024) throw Error('40MB 이하의 캡처 이미지를 선택하세요.');
    const src = URL.createObjectURL(blob), id = crypto.randomUUID();
    try {
      const image = new Image(); image.src = src; await image.decode();
      await saveImages([[id, blob]]);
      objectUrls.current.set(id, src); setAssets(a => ({ ...a, [id]: src }));
      if (stateRef.current.some(s => s.id === slide.id)) patch(slide.id, { previewId: id, ...toolbar });
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
          ? [originalSource(s.src)]
          : s.kind === 'gallery' || s.kind === 'folio'
            ? (s.photos || []).map((p) => preparedAssets[p.id])
            : s.kind === 'sequence' ? sequenceSteps(s.photos!, s.perFrame)[0].map(p => preparedAssets[p.id])
              : s.kind === 'text' ? []
                : [previewSource(s, preparedAssets)],
      );
      await document.fonts.ready;
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
    <SheetHeight.Provider value={height}>
      <input ref={previewFileRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void captureSelected(file); }}/>
      {!publicView && <div className="editor" style={{ '--sheet-ratio': 1920 / height } as CSSProperties}>
        <div className="deck-label"><a href={`${BASE}edit/`}>목록</a><span>{entry.date} · {entry.title}</span><a href={presentationUrl(entry.slug, false, entry.shortSlug)} target="_blank" rel="noreferrer">공개 링크 ↗</a>{!import.meta.env.DEV && <form method="post" action={`${BASE}logout/`}><button type="submit">로그아웃</button></form>}</div>
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
          <label className="format">판형<select disabled={!ready || busy} value={format || '16:9'} onChange={e => {
            const next = e.target.value as Format;
            setFormat(next === '16:9' ? undefined : next); setDirty(true); setStatus('저장되지 않음');
          }}>{Object.entries(FORMATS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}</select></label>
          <span className="spacer" />
          <span className="status" role="status">
            {status || cacheStatus}
            {!ready && status !== '불러오는 중' && <button onClick={() => location.reload()}>다시 불러오기</button>}
          </span>
          {videoStatus === '영상 다운로드 재시도'
            ? <button onClick={() => setVideoRetry(value => value + 1)}>{videoStatus}</button>
            : <span className="status" role="status">{videoStatus}</span>}
          <button disabled={!ready || busy} onClick={publish}>게시</button>
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
            <div className="row">
              <button disabled={busy} onClick={() => insert([{ id: crypto.randomUUID(), title: '텍스트', kind: 'text', src: '', hidden: false, text: '', typo: { ...nearestTypography() } }])}>텍스트</button>
              <button disabled={busy} onClick={() => chooseSequence()}>시퀀스</button>
              <button disabled={busy} onClick={() => clipRef.current?.click()}>클립</button>
              <span className="note">이미지·영상 파일이나 폴더를 목록에 끌어다 놓아도 됩니다.</span>
            </div>
            <div className="row"><button disabled={busy} onClick={() => insert(initial.filter(s => !slides.some(d => d.id === s.id)))}>원본 포트폴리오 가져오기</button>
            <button disabled={busy} onClick={async () => { setBusy(true); try { await exportBackup(entry.slug, slides, assets, format); setStatus('백업 다운로드 완료'); } catch(e) { setStatus(e instanceof Error ? e.message : '백업 실패'); } finally { setBusy(false); } }}>백업 내보내기</button>
            <button disabled={busy} onClick={() => backupRef.current?.click()}>백업 불러오기</button>
            {entry.slug === LEGACY_SLUG && location.hostname === 'jaeyeonkim.kr' && <button disabled={busy} onClick={migrate}>이전 Vercel 작업 가져오기</button>}
            {sources.length > 0 && <span className="import-source">
              <select aria-label="가져올 발표" value={source} onChange={e => setSource(e.target.value)}>{sources.map(p => <option key={p.slug} value={p.slug}>{p.date} · {p.title}</option>)}</select>
              <button disabled={busy || !source} onClick={() => void importSlides(source)}>장표 숨김으로 가져오기</button>
            </span>}
            <input className="file-input" ref={backupRef} type="file" accept="application/json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { await restoreBackup(JSON.parse(await file.text())); } catch { setStatus('올바른 백업 JSON을 선택하세요.'); } }}/></div>
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
              <button disabled={busy} onClick={() => insert([{id:crypto.randomUUID(),title:'음향형태론 전시 영상',kind:'video',src:'/media/audio-morphology.mp4',hidden:false,autoplay:true,muted:true,controls:true}])}>음향형태론 전시 영상</button>
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
        <input className="file-input" ref={clipRef} type="file" multiple accept="video/mp4,video/webm" onChange={e => void importClips(Array.from(e.target.files || []))}/>
        <input className="file-input" ref={fontFileRef} type="file" multiple accept=".otf,.ttf,font/otf,font/ttf" onChange={e => void chooseFontFiles(Array.from(e.target.files || []))}/>
        <main className={`workspace${fileOver ? ' file-over' : ''}`} inert={!ready || busy}
          onDragOver={e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setFileOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false); }}
          onDrop={e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); setFileOver(false); void dropFiles(e.dataTransfer); }}>
          <div className="grid" ref={gridRef} aria-label="슬라이드 순서">
            {slides.map((s, i) => (
              <article
                data-slide-id={s.id}
                key={s.id}
                className={`card ${selection.includes(s.id) ? 'selected' : ''} ${s.hidden ? 'hidden-slide' : ''} ${dragUI?.ids.includes(s.id) ? 'drag-source' : ''} ${dragUI?.slot === i ? 'drop-before' : ''} ${dragUI?.slot === slides.length && i === slides.length - 1 ? 'drop-after' : ''}`}
              >
                <button
                  className="thumbnail"
                  onPointerDown={(e) => beginDrag(e, s)}
                  onClick={(e) => {
                    if (!suppressClick.current) pick(s.id, e);
                  }}
                  aria-label={`${i + 1}. ${s.title}${s.hidden ? ' 숨김' : ''}`}
                  aria-pressed={selection.includes(s.id)}
                >
                  <SlideView
                    key={s.id}
                    thumbnail
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
                    guides
                  />
                </div>
                <div className="properties">
                  {selection.length > 1 && <div className="row picked">
                    <span>{selection.length}장 선택</span>
                    <button onClick={() => change(stateRef.current.map(s => selection.includes(s.id) ? { ...s, hidden: true } : s))}>숨김</button>
                    <button onClick={() => change(stateRef.current.map(s => selection.includes(s.id) ? { ...s, hidden: false } : s))}>표시</button>
                    <button title="⌘D" onClick={() => duplicateSlides()}>복제</button>
                    <button onClick={() => {
                      const index = slides.findIndex(s => selection.includes(s.id)), next = slides.filter(s => !selection.includes(s.id));
                      change(next); select(next[Math.min(index, next.length - 1)]?.id || '');
                    }}>삭제</button>
                    <span className="note">드래그하면 함께 옮겨집니다</span>
                  </div>}
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
                    <button title={selection.length > 1 ? undefined : '⌘D'} onClick={() => duplicateSlides([active.id])}>복제</button>
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
                  <div className="row number-fields">
                    <NumberField key={`${active.id}-advance`} label="자동 넘김 초" value={active.advance} min={0.1} max={3600} step={0.1} optional onChange={v => patch(active.id, { advance: v })}/>
                    {active.kind !== 'text' && <NumberField key={`${active.id}-margin`} label="바깥 여백" value={active.margin} min={0} max={480} optional placeholder={String(defaultMargin(active))} onChange={v => patch(active.id, { margin: v })}/>}
                    <label className="check"><input type="checkbox" checked={active.transition === 'dissolve'} onChange={e => patch(active.id, { transition: e.target.checked ? 'dissolve' : undefined })}/>디졸브</label>
                  </div>
                  {active.kind === 'text' && <>
                    <textarea className="text-editor" aria-label="텍스트" placeholder="빈 줄로 문단을 나눕니다 · **굵게** · 탭으로 칸 맞춤" value={active.text || ''} onChange={e => patch(active.id, { text: e.target.value })}
                      onKeyDown={e => {
                        // Tab types a tab (the text is laid out on tab stops); Shift-Tab still leaves the field.
                        if (e.key !== 'Tab' || e.shiftKey || e.nativeEvent.isComposing) return;
                        e.preventDefault();
                        if (!document.execCommand('insertText', false, '\t')) {
                          const el = e.currentTarget, at = el.selectionStart;
                          patch(active.id, { text: el.value.slice(0, at) + '\t' + el.value.slice(el.selectionEnd) });
                          requestAnimationFrame(() => el.setSelectionRange(at + 1, at + 1));
                        }
                      }}/>
                    <div className="row font-choice">
                      <label>글꼴<select value={active.typo?.composite || 'regular'} onChange={e => patchTypography(active.id, { composite: e.target.value === 'bold' ? 'bold' : undefined })}>
                        {COMPOSITES.map(c => <option key={c.weight} value={c.weight}>{c.name}</option>)}
                      </select></label>
                      <span className="note">{COMPOSITES.find(c => c.weight === (active.typo?.composite || 'regular'))!.faces.join(' · ')}</span>
                    </div>
                    <div className="number-fields">
                      {typographyFields.map(([key, label, min, max, step]) => <NumberField key={`${active.id}-${key}`} label={label} value={(active.typo || defaultTypography)[key]} min={min} max={max} step={step}
                        onChange={v => { if (v !== undefined) patchTypography(active.id, key === 'top' ? { top: v, left: v } : { [key]: v }); }}/>)}
                      <NumberField key={`${active.id}-indent`} label="내어쓰기" value={active.typo?.indent} min={0} max={1800} optional onChange={v => patchTypography(active.id, { indent: v || undefined })}/>
                      <NumberField key={`${active.id}-tab`} label="탭 간격" value={active.typo?.tabSize} min={8} max={1800} optional placeholder={String(DEFAULT_TAB)}
                        onChange={v => patchTypography(active.id, { tabSize: v, tabs: undefined })}/>
                    </div>
                    {fontsMissing.some(f => fontsIn(active.text || '', active.typo?.composite === 'bold').includes(f)) && <div className="row"><span className="note">글꼴 없음 · {fontsMissing.join(', ')}</span><button disabled={busy} onClick={() => fontFileRef.current?.click()}>글꼴 파일 지정</button></div>}
                  </>}
                  {(active.kind === 'sequence' || active.kind === 'clip' || active.kind === 'gallery') && <div className="row number-fields">
                    {active.kind !== 'clip' && <label>배열<select value={active.kind} onChange={e => arrange(active, e.target.value as 'sequence' | 'gallery')}>
                      <option value="sequence">넘김</option>
                      <option value="gallery" disabled={(active.photos?.length || 0) > GALLERY_LIMIT}>격자</option>
                    </select></label>}
                    {active.kind !== 'clip' && <label>정렬<select value={active.layout || 'cells'} onChange={e => patch(active.id, { layout: e.target.value as Slide['layout'] })}>{ARRANGEMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                    {active.kind !== 'clip' && <label>맞춤<select value={active.fit || 'contain'} onChange={e => patch(active.id, { fit: e.target.value === 'cover' ? 'cover' : undefined })}><option value="contain">contain</option><option value="cover">cover</option></select></label>}
                    {active.kind !== 'clip' && <NumberField key={`${active.id}-gap`} label="이미지 간격" value={active.gap} min={0} max={400} optional placeholder={String(DEFAULT_GAP)} onChange={v => patch(active.id, { gap: v })}/>}
                    {active.kind === 'sequence' && <NumberField key={`${active.id}-interval`} label="간격 ms" value={active.interval} min={40} max={10000} step={10} onChange={v => { if (v !== undefined) patch(active.id, { interval: Math.round(v) }); }}/>}
                    {active.kind === 'sequence' && <NumberField key={`${active.id}-per`} label="한 번에" value={active.perFrame || 1} min={1} max={12} onChange={v => { if (v !== undefined && Number.isInteger(v)) patch(active.id, { perFrame: v === 1 ? undefined : v }); }}/>}
                    {active.kind !== 'gallery' && <label>끝나면<select value={active.end || 'loop'} onChange={e => patch(active.id, { end: e.target.value as Slide['end'] })}>{endings.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                    {active.kind !== 'gallery' && <button onClick={() => setLive(v => !v)}>{live ? '미리보기 닫기' : '미리보기'}</button>}
                  </div>}
                  {['web', 'youtube', 'video'].includes(active.kind) && (
                    <div className="row">
                      <button onClick={() => setLive((v) => !v)}>
                        {live ? '미리보기 닫기' : '미리보기'}
                      </button>
                      <a href={active.kind === 'video' ? localAsset('/audio-morphology.html') : active.src} target="_blank" rel="noreferrer">
                        새 탭 ↗
                      </a>
                      {active.kind !== 'video' && <button disabled={busy} onClick={() => void captureSelected()}>캡처 갱신</button>}
                      <button disabled={busy} onClick={() => previewFileRef.current?.click()}>캡처 이미지 지정</button>
                    </div>
                  )}
                  {active.kind === 'web' && <div className="row"><label className="check"><input type="checkbox" checked={active.frame === 'browser'} onChange={e => patch(active.id, { frame: e.target.checked ? 'browser' : undefined })}/>브라우저 창</label></div>}
                  {(active.kind === 'youtube' || active.kind === 'video') && (
                    <div className="video-settings">
                      {(
                        [
                          ['autoplay', '자동 재생', active.autoplay !== false],
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
                  {(active.kind === 'gallery' || active.kind === 'sequence') && (
                    <div className="photo-list">
                      <button
                        disabled={busy}
                        onClick={() => active.kind === 'sequence' ? chooseSequence(active.id) : chooseFiles(active.id)}
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
      </div>}
      {publicView && !current && <main className="public-empty"><p>{status || (!ready ? '불러오는 중' : '아직 공개된 장표가 없습니다.')}</p><a href={BASE}>목록</a></main>}
      {present && current && (
        <div tabIndex={-1} className={`presentation${current.kind === 'youtube' || current.kind === 'video' ? ' presentation-media' : ''}`}>
          <PresentationStage
            slide={current}
            number={position + 1}
            assets={assets}
            outlined={publicView}
            onShown={setShownId}
            onFinish={finish}
          />
          <nav className={`present-controls${navigationVisible || current.kind === 'web' || current.kind === 'youtube' ? ' is-visible' : ''}`} aria-label="발표 이동">
            {publicView && <button aria-label="전체화면" onClick={() => { void document.documentElement.requestFullscreen().catch(() => {}); }}>⛶</button>}
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
          </nav>
        </div>
      )}
      {printing && <div className="print-deck">
        {/* PDF pages follow the 판형: 320mm wide, height from the sheet ratio. */}
        <style>{`@page{size:320mm ${(320 * height / 1920).toFixed(2)}mm}@media print{.print-slide,.print-slide .slide-viewport{height:${(320 * height / 1920).toFixed(2)}mm}}`}</style>
        {visible.map((s, i) => (
          <section key={s.id} className="print-slide">
            <SlideView slide={s} number={i + 1} assets={assets} print />
          </section>
        ))}
      </div>}
    </SheetHeight.Provider>
  );
}
