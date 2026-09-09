export type FolioPalette = { background: string; foreground: string };
export function contrastingInk(r: number, g: number, b: number) {
  const lin = [r, g, b].map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  const luminance = lin[0] * .2126 + lin[1] * .7152 + lin[2] * .0722;
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
export function detectFolioPalette(image: HTMLImageElement): FolioPalette {
  const scale = image.naturalWidth / 3840;
  const canvas = document.createElement('canvas'); canvas.width = 35; canvas.height = 55;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('쪽번호 배경색을 읽지 못했습니다.');
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 35, 55);
  // Sample to the left of the number, away from the rules and glyphs.
  ctx.drawImage(image, 130 * scale, 90 * scale, 35 * scale, 55 * scale, 0, 0, 35, 55);
  const pixels = ctx.getImageData(0, 0, 35, 55).data;
  const channels = [[], [], []] as number[][];
  for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) channels[c].push(pixels[i + c]);
  const [r, g, b] = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  return { background: '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''), foreground: contrastingInk(r, g, b) };
}
