const replacements: Record<string, string> = {
  '/slides/page-74.webp': '/slides/page-74-white.png',
  '/slides/page-75.webp': '/slides/page-75-white.png',
  '/slides/page-76.webp': '/slides/page-76-white.png',
  '/slides/page-77.webp': '/slides/page-77-white.png',
};

export function originalSource(src: string): string {
  return replacements[src] || src;
}
