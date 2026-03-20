/**
 * fontLoader.ts — Async font loading deduplication
 *
 * Figma requires figma.loadFontAsync() to be called before setting
 * `characters` on a TextNode. This module:
 *   1. Collects all unique {family, style} pairs from the AST
 *   2. Loads them all in parallel before any node creation begins
 *   3. Falls back to Inter Regular if a font isn't available
 *
 * This prevents the dreaded "Font not loaded" runtime errors.
 */

import type { FigmaNode } from '../ui/main';

/** A Figma-compatible font name */
interface Font {
  family: string;
  style: string;
}

/** Maps CSS font-weight numbers to Figma font style names */
const WEIGHT_TO_STYLE: Record<string, string> = {
  '100': 'Thin',
  '200': 'ExtraLight',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
  '800': 'ExtraBold',
  '900': 'Black',
  'normal': 'Regular',
  'bold': 'Bold',
};

/** Default fallback font available in Figma */
const FALLBACK_FONT: Font = { family: 'Inter', style: 'Regular' };

/**
 * Derives a Figma font name from computed CSS font properties.
 * CSS font-family can be a comma-separated list; we use the first one
 * and fall back to Inter if it looks like a generic family.
 */
export function resolveFontName(
  fontFamily: string,
  fontWeight: string,
  fontStyle: string
): FontName {
  // Extract first font family from the comma-separated list
  const rawFamily = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
  const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system', 'ui-sans-serif']);
  const family = genericFamilies.has(rawFamily.toLowerCase()) ? FALLBACK_FONT.family : rawFamily || FALLBACK_FONT.family;

  // Combine weight and italic into a Figma style string
  const weightStyle = WEIGHT_TO_STYLE[fontWeight] ?? 'Regular';
  const isItalic = fontStyle === 'italic' || fontStyle === 'oblique';
  const style = isItalic && weightStyle === 'Regular'
    ? 'Italic'
    : isItalic
    ? `${weightStyle} Italic`
    : weightStyle;

  return { family, style };
}

/**
 * Recursively collects all unique font combinations needed by TEXT nodes.
 */
function collectFonts(node: FigmaNode, fonts: Set<string>): void {
  if (node.type === 'TEXT') {
    const { family, style } = resolveFontName(
      node.styles.fontFamily,
      node.styles.fontWeight,
      node.styles.fontStyle
    );
    fonts.add(`${family}::${style}`);
  }
  for (const child of node.children) {
    collectFonts(child, fonts);
  }
}

/**
 * Loads all fonts required by the node tree.
 * Falls back to Inter Regular if a font fails to load.
 * Must be called and awaited BEFORE any TextNode is created.
 */
export async function loadAllFonts(trees: FigmaNode[]): Promise<void> {
  const fontKeys = new Set<string>();

  for (const tree of trees) {
    collectFonts(tree, fontKeys);
  }

  // Always ensure our fallback is loaded
  fontKeys.add(`${FALLBACK_FONT.family}::${FALLBACK_FONT.style}`);

  const loadPromises = Array.from(fontKeys).map(async (key) => {
    const [family, style] = key.split('::');
    try {
      await figma.loadFontAsync({ family, style });
    } catch {
      // Font not found — silently fall back to Inter Regular
      // (the converter will also use the fallback when setting characters)
      try {
        await figma.loadFontAsync(FALLBACK_FONT);
      } catch {
        // Inter Regular unavailable — nothing we can do
      }
    }
  });

  await Promise.all(loadPromises);
}
