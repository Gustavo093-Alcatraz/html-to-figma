/**
 * colorUtils.ts — Web Color String → Figma RGBA
 *
 * Figma uses RGB values in the range [0, 1].
 * This module parses common web color formats and converts them.
 *
 * Supported formats:
 *   #RGB  #RRGGBB  #RRGGBBAA
 *   rgb(r, g, b)  rgba(r, g, b, a)
 *   transparent / named colors (subset)
 */

export interface FigmaRGBA {
  r: number; // 0–1
  g: number; // 0–1
  b: number; // 0–1
  a: number; // 0–1
}

/** Fallback color when parsing fails */
const TRANSPARENT: FigmaRGBA = { r: 0, g: 0, b: 0, a: 0 };

/** Top HTML color keywords → hex mapping */
const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF',
  aquamarine: '#7FFFD4', azure: '#F0FFFF', beige: '#F5F5DC',
  bisque: '#FFE4C4', black: '#000000', blanchedalmond: '#FFEBCD',
  blue: '#0000FF', blueviolet: '#8A2BE2', brown: '#A52A2A',
  chartreuse: '#7FFF00', coral: '#FF7F50', cornflowerblue: '#6495ED',
  crimson: '#DC143C', cyan: '#00FFFF', darkblue: '#00008B',
  darkgray: '#A9A9A9', darkgreen: '#006400', darkviolet: '#9400D3',
  deeppink: '#FF1493', dodgerblue: '#1E90FF', firebrick: '#B22222',
  forestgreen: '#228B22', fuchsia: '#FF00FF', gold: '#FFD700',
  gray: '#808080', green: '#008000', greenyellow: '#ADFF2F',
  hotpink: '#FF69B4', indianred: '#CD5C5C', indigo: '#4B0082',
  ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA',
  lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6',
  lightcoral: '#F08080', lightcyan: '#E0FFFF', lightgray: '#D3D3D3',
  lightgreen: '#90EE90', lightpink: '#FFB6C1', lightsalmon: '#FFA07A',
  lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lime: '#00FF00',
  limegreen: '#32CD32', linen: '#FAF0E6', magenta: '#FF00FF',
  maroon: '#800000', mediumblue: '#0000CD', mediumpurple: '#9370DB',
  mediumseagreen: '#3CB371', mediumslateblue: '#7B68EE', midnightblue: '#191970',
  mintcream: '#F5FFFA', navy: '#000080', oldlace: '#FDF5E6',
  olive: '#808000', olivedrab: '#6B8E23', orange: '#FFA500',
  orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA',
  palegreen: '#98FB98', palevioletred: '#DB7093', papayawhip: '#FFEFD5',
  pink: '#FFC0CB', plum: '#DDA0DD', powderblue: '#B0E0E6',
  purple: '#800080', red: '#FF0000', rosybrown: '#BC8F8F',
  royalblue: '#4169E1', saddlebrown: '#8B4513', salmon: '#FA8072',
  seagreen: '#2E8B57', sienna: '#A0522D', silver: '#C0C0C0',
  skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090',
  snow: '#FFFAFA', springgreen: '#00FF7F', steelblue: '#4682B4',
  tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8', tomato: '#FF6347',
  turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3',
  white: '#FFFFFF', whitesmoke: '#F5F5F5', yellow: '#FFFF00',
  yellowgreen: '#9ACD32',
};

/** Clamp a number to [0, 1] */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Parse a hex color string (#RGB, #RRGGBB, #RRGGBBAA) */
function parseHex(hex: string): FigmaRGBA | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    // #RGB → #RRGGBB
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: 1,
    };
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  return null;
}

/**
 * Parse any CSS color string and return a Figma-compatible RGBA object.
 * All values are in the [0, 1] range.
 */
export function parseColor(color: string): FigmaRGBA {
  if (!color || color === 'transparent' || color === 'none') return TRANSPARENT;

  const c = color.trim().toLowerCase();

  // Named color keyword
  if (NAMED_COLORS[c]) {
    const result = parseHex(NAMED_COLORS[c]);
    return result ?? TRANSPARENT;
  }

  // Hex color
  if (c.startsWith('#')) {
    return parseHex(c) ?? TRANSPARENT;
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  // The browser always returns rgb/rgba from getComputedStyle
  const rgbMatch = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return {
      r: clamp01(parseInt(rgbMatch[1], 10) / 255),
      g: clamp01(parseInt(rgbMatch[2], 10) / 255),
      b: clamp01(parseInt(rgbMatch[3], 10) / 255),
      a: rgbMatch[4] !== undefined ? clamp01(parseFloat(rgbMatch[4])) : 1,
    };
  }

  // hsl / oklch — browser usually resolves these to rgb via getComputedStyle,
  // but as a fallback attempt a quick hsl parse
  const hslMatch = c.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)/);
  if (hslMatch) {
    return hslToRgba(
      parseFloat(hslMatch[1]),
      parseFloat(hslMatch[2]),
      parseFloat(hslMatch[3]),
      hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1,
    );
  }

  // Fallback: opaque black
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Convert HSL (degrees, %, %) → FigmaRGBA */
function hslToRgba(h: number, s: number, l: number, a: number): FigmaRGBA {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const factor = s * Math.min(l, 1 - l);
  const f = (n: number) => l - factor * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4), a: clamp01(a) };
}

/**
 * Converts a CSS pixel value string (e.g. "16px", "1.5em") to a number.
 * Returns 0 for unparseable values.
 */
export function parsePx(value: string): number {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}
