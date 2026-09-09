// Source: original portfolio's “작업 시기” fields; page indices are zero-based.
export const projects = [
  { title: '흐름지각', start: '2019.08', period: '2019.08', first: 74, last: 74 },
  { title: 'My Computer Has a Virus', start: '2020.11', period: '2020.11', first: 75, last: 75 },
  { title: '홍익시디 소식지', start: '2021.04', period: '2021.04–2022.09', first: 57, last: 60 },
  { title: 'R777 웹사이트', start: '2021.07', period: '2021.07–2021.11', first: 61, last: 63 },
  { title: 'Pigment', start: '2022.05', period: '2022.05–2022.10', first: 64, last: 67 },
  { title: '대체 텍스트–이미지 기반 재귀적 학습 모델', start: '2022.11', period: '2022.11', first: 76, last: 76 },
  { title: '디자인 도구 기술과 한국 그래픽 디자인 포스터', start: '2022.11', period: '2022.11', first: 77, last: 77 },
  { title: 'NCPT 99.8 Feat.TAEYONG', start: '2024.06', period: '2024.06–2024.08', first: 54, last: 56 },
  { title: 'ONKNOWN', start: '2024.10', period: '2024.10–2025.02 / 2026.01–2026.03', first: 68, last: 73 },
  { title: '카더가든 From Apartment', start: '2024.12', period: '2024.12–2025.02', first: 45, last: 48 },
  { title: 'PWD.SIDI Constant of Intergration', start: '2025.03', period: '2025.03–2025.04', first: 31, last: 40 },
  { title: '낯선 접점 Strange Interface', start: '2025.04', period: '2025.04–07 / 2025.05–07 / 2025.09–12', first: 24, last: 30 },
  { title: 'Vibrant Images', start: '2025.06', period: '2025.06–2025.07', first: 41, last: 44 },
  { title: '장기하 하기장기하', start: '2025.06', period: '2025.06–2025.07', first: 49, last: 53 },
  { title: '음향형태론 Audio Morphology', start: '2025.12', period: '2025.12–2026.01', first: 16, last: 23 },
  { title: '제16회 광주비엔날레', start: '2026.03', period: '2026.03–2026.08', first: 8, last: 12 },
  { title: '신영준 Tourist', start: '2026.03', period: '2026.03–2026.08', first: 13, last: 15 },
  { title: 'Visual Engineering Design', start: '2026.04', period: '2026.04–진행 중', first: 2, last: 7 },
];
export const chronologicalPages = [0, 1, ...projects.flatMap(p => Array.from({ length: p.last - p.first + 1 }, (_, i) => p.first + i)), 78];
export function projectForPage(index: number) { return projects.find(p => index >= p.first && index <= p.last); }
export function sortOriginalSlides<T extends { kind: string; src: string }>(slides: T[]): T[] {
  const rank = new Map(chronologicalPages.map((page, i) => [page, i]));
  const originalIndex = (s: T) => s.kind === 'image' ? Number(s.src.match(/^\/slides\/page-(\d+)\.webp$/)?.[1]) : NaN;
  const originals = slides.filter(s => rank.has(originalIndex(s))).sort((a, b) => rank.get(originalIndex(a))! - rank.get(originalIndex(b))!);
  let i = 0;
  return slides.map(s => rank.has(originalIndex(s)) ? originals[i++] : s);
}
