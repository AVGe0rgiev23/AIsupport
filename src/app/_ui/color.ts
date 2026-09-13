function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const full = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

const DARK = "#0f172a";
const LIGHT = "#ffffff";

/** Text colour with the better WCAG contrast against a brand colour. An
 *  unparseable value (widgetConfig is free-form data) falls back to white. */
export function readableOn(background: string): string {
  const l = luminance(background);
  if (l === null) return LIGHT;
  const contrastWithWhite = 1.05 / (l + 0.05);
  const contrastWithDark = (l + 0.05) / (luminance(DARK)! + 0.05);
  return contrastWithDark > contrastWithWhite ? DARK : LIGHT;
}
