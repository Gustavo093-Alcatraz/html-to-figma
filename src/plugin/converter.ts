/**
 * converter.ts — FigmaNode AST → Native Figma Nodes
 *
 * This module recursively walks the FigmaNode JSON tree received from
 * the UI thread and creates native Figma API nodes.
 *
 * Mapping rules:
 *   FigmaNode.type === 'FRAME'     → figma.createFrame() with Auto Layout if flex/grid
 *   FigmaNode.type === 'TEXT'      → figma.createText() (font must be pre-loaded)
 *   FigmaNode.type === 'RECTANGLE' → figma.createRectangle() for opaque visual boxes
 *                                    or figma.createFrame() if it has children
 */

import type { FigmaNode } from '../ui/main';
import { parseColor, parsePx } from './colorUtils';
import { resolveFontName } from './fontLoader';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Maps CSS justify-content values to Figma's CounterAxisAlignItems enum.
 * Used for Auto Layout primary axis alignment.
 */
function mapJustifyContent(value: string): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  switch (value) {
    case 'center':      return 'CENTER';
    case 'flex-end':
    case 'end':         return 'MAX';
    case 'space-between': return 'SPACE_BETWEEN';
    default:            return 'MIN';
  }
}

/**
 * Maps CSS align-items values to Figma's CounterAxisAlignItems enum.
 * Used for Auto Layout cross-axis alignment.
 */
function mapAlignItems(value: string): 'MIN' | 'CENTER' | 'MAX' | 'BASELINE' {
  switch (value) {
    case 'center':       return 'CENTER';
    case 'flex-end':
    case 'end':          return 'MAX';
    case 'baseline':     return 'BASELINE';
    default:             return 'MIN';
  }
}

/**
 * Maps CSS text-align to Figma's TextAlignHorizontal enum.
 */
function mapTextAlign(value: string): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (value) {
    case 'center':  return 'CENTER';
    case 'right':   return 'RIGHT';
    case 'justify': return 'JUSTIFIED';
    default:        return 'LEFT';
  }
}

/**
 * Creates a solid paint fill from a CSS color string.
 * Returns undefined if the color is fully transparent.
 */
function makeSolidFill(color: string): SolidPaint | undefined {
  const { r, g, b, a } = parseColor(color);
  if (a === 0) return undefined;
  return {
    type: 'SOLID',
    color: { r, g, b },
    opacity: a,
  };
}

/**
 * Applies border-radius to a node that supports cornerRadius.
 * Handles both uniform and per-corner radii.
 */
function applyBorderRadius(
  node: FrameNode | RectangleNode,
  styles: FigmaNode['styles']
): void {
  const tl = parsePx(styles.borderTopLeftRadius);
  const tr = parsePx(styles.borderTopRightRadius);
  const br = parsePx(styles.borderBottomRightRadius);
  const bl = parsePx(styles.borderBottomLeftRadius);

  if (tl === tr && tr === br && br === bl) {
    node.cornerRadius = tl;
  } else {
    // Mixed radii — Figma uses individual corner properties
    node.topLeftRadius     = tl;
    node.topRightRadius    = tr;
    node.bottomRightRadius = br;
    node.bottomLeftRadius  = bl;
  }
}

// ─── Node Builders ──────────────────────────────────────────

/**
 * Creates a Figma Frame node (container).
 * If the source element had display:flex or display:grid,
 * enables Auto Layout on this frame.
 */
function createFrameFromNode(figmaNode: FigmaNode): FrameNode {
  const frame = figma.createFrame();
  const { styles, rect } = figmaNode;

  frame.name = figmaNode.name;

  // Position and size — use bounding rect from DOM
  frame.x = Math.round(rect.x);
  frame.y = Math.round(rect.y);
  frame.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));

  // Background fill
  const bg = makeSolidFill(styles.backgroundColor);
  frame.fills = bg ? [bg] : [];

  // Opacity
  const opacity = parseFloat(styles.opacity);
  if (!isNaN(opacity)) frame.opacity = opacity;

  // Border radius
  applyBorderRadius(frame, styles);

  // ── Auto Layout ─────────────────────────────────────────
  const display = styles.display;
  const isFlexLike = display === 'flex' || display === 'inline-flex' || display === 'grid';

  if (isFlexLike) {
    frame.layoutMode = styles.flexDirection === 'column' || styles.flexDirection === 'column-reverse'
      ? 'VERTICAL'
      : 'HORIZONTAL';

    // Padding
    frame.paddingTop    = Math.round(parsePx(styles.paddingTop));
    frame.paddingRight  = Math.round(parsePx(styles.paddingRight));
    frame.paddingBottom = Math.round(parsePx(styles.paddingBottom));
    frame.paddingLeft   = Math.round(parsePx(styles.paddingLeft));

    // Gap — CSS gap applies to both axes; use rowGap/columnGap if present
    const primaryGap = frame.layoutMode === 'VERTICAL'
      ? parsePx(styles.rowGap || styles.gap)
      : parsePx(styles.columnGap || styles.gap);
    frame.itemSpacing = Math.max(0, Math.round(primaryGap));

    // Alignment
    frame.primaryAxisAlignItems = mapJustifyContent(styles.justifyContent);
    frame.counterAxisAlignItems = mapAlignItems(styles.alignItems);

    // Use hug contents sizing so the frame fits its children
    frame.primaryAxisSizingMode   = 'FIXED';
    frame.counterAxisSizingMode   = 'FIXED';

    // Clipping — match overflow
    frame.clipsContent = false;
  } else {
    // Non-flex frames get no auto layout — treat as a fixed container
    frame.layoutMode = 'NONE';
    frame.clipsContent = false;
  }

  return frame;
}

/**
 * Creates a Figma Rectangle node for non-flex block elements.
 * If the node has children, creates a Frame to contain them instead.
 */
function createRectangleFromNode(figmaNode: FigmaNode): RectangleNode {
  const rect = figma.createRectangle();
  const { styles, rect: r } = figmaNode;

  rect.name = figmaNode.name;
  rect.x = Math.round(r.x);
  rect.y = Math.round(r.y);
  rect.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));

  const bg = makeSolidFill(styles.backgroundColor);
  rect.fills = bg ? [bg] : [];

  applyBorderRadius(rect, styles);

  const opacity = parseFloat(styles.opacity);
  if (!isNaN(opacity)) rect.opacity = opacity;

  return rect;
}

/**
 * Creates a Figma Text node.
 * Font MUST already be loaded before calling this function.
 */
function createTextFromNode(figmaNode: FigmaNode): TextNode {
  const text = figma.createText();
  const { styles, rect: r } = figmaNode;

  text.name = figmaNode.name;
  text.x = Math.round(r.x);
  text.y = Math.round(r.y);

  // Set the font first (already loaded by fontLoader.ts)
  const fontName = resolveFontName(
    styles.fontFamily,
    styles.fontWeight,
    styles.fontStyle
  );
  try {
    text.fontName = fontName;
  } catch {
    // Fallback to Inter if this specific style failed
    text.fontName = { family: 'Inter', style: 'Regular' };
  }

  // Characters (text content)
  text.characters = figmaNode.text ?? '';

  // Font size
  const fontSize = parsePx(styles.fontSize);
  if (fontSize > 0) text.fontSize = Math.round(fontSize);

  // Color fill
  const fill = makeSolidFill(styles.color);
  text.fills = fill ? [fill] : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }];

  // Text alignment
  text.textAlignHorizontal = mapTextAlign(styles.textAlign);

  // Letter spacing (CSS in px → Figma in %)
  const letterSpacing = parsePx(styles.letterSpacing);
  if (letterSpacing !== 0 && fontSize > 0) {
    text.letterSpacing = { value: (letterSpacing / fontSize) * 100, unit: 'PERCENT' };
  }

  // Line height
  const lineHeight = styles.lineHeight;
  if (lineHeight && lineHeight !== 'normal') {
    const lhPx = parsePx(lineHeight);
    if (lhPx > 0) {
      text.lineHeight = { value: lhPx, unit: 'PIXELS' };
    }
  }

  // Opacity
  const opacity = parseFloat(styles.opacity);
  if (!isNaN(opacity)) text.opacity = opacity;

  // Resize to fit content
  text.textAutoResize = 'WIDTH_AND_HEIGHT';

  return text;
}

// ─── Recursive Tree Walker ──────────────────────────────────

/**
 * Recursively converts a FigmaNode AST into Figma native nodes.
 * Returns the top-level SceneNode for this subtree.
 */
export function convertNode(figmaNode: FigmaNode): SceneNode | null {
  let node: SceneNode | null = null;

  if (figmaNode.type === 'TEXT') {
    // Leaf text node — no children
    node = createTextFromNode(figmaNode);

  } else if (figmaNode.type === 'FRAME') {
    // Container with Auto Layout
    const frame = createFrameFromNode(figmaNode);

    // Recursively convert and append children
    for (const child of figmaNode.children) {
      const childNode = convertNode(child);
      if (childNode) {
        frame.appendChild(childNode);

        // When using Auto Layout, reset child position to let Figma manage it
        if (frame.layoutMode !== 'NONE') {
          if ('x' in childNode) childNode.x = 0;
          if ('y' in childNode) childNode.y = 0;
        }
      }
    }

    node = frame;

  } else {
    // RECTANGLE type
    if (figmaNode.children.length > 0) {
      // Has children → create a plain Frame to contain them
      const frame = createFrameFromNode({ ...figmaNode, type: 'FRAME' });
      frame.layoutMode = 'NONE';
      for (const child of figmaNode.children) {
        const childNode = convertNode(child);
        if (childNode) frame.appendChild(childNode);
      }
      node = frame;
    } else {
      // Leaf visual box → create a Rectangle
      node = createRectangleFromNode(figmaNode);
    }
  }

  return node;
}

/**
 * Converts multiple root-level FigmaNode trees and places them on the canvas.
 * Returns the total number of top-level nodes created.
 */
export function buildFigmaTrees(
  trees: FigmaNode[],
  options: { centerOnCanvas: boolean; selectAfterImport: boolean }
): SceneNode[] {
  const created: SceneNode[] = [];

  let offsetX = 0;
  for (const tree of trees) {
    const node = convertNode(tree);
    if (!node) continue;

    // Offset multiple root nodes horizontally so they don't overlap
    node.x = offsetX;
    node.y = 0;
    offsetX += (('width' in node ? node.width : 0) ?? 0) + 40;

    figma.currentPage.appendChild(node);
    created.push(node);
  }

  if (created.length === 0) return created;

  if (options.centerOnCanvas) {
    figma.viewport.scrollAndZoomIntoView(created);
  }

  if (options.selectAfterImport) {
    figma.currentPage.selection = created;
  }

  return created;
}
