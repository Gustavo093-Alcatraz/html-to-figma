/**
 * code.ts — Figma Plugin Main Thread Entry Point
 *
 * This file runs in Figma's main sandbox — it has access to the Figma API
 * but NO access to the DOM, window, or any browser APIs.
 *
 * Responsibilities:
 *   1. Open the plugin UI (sandboxed iframe)
 *   2. Receive the FigmaNode AST from the UI thread via figma.ui.onmessage
 *   3. Load all required fonts (async, must complete before creating TextNodes)
 *   4. Delegate node creation to converter.ts
 *   5. Send success/error feedback back to the UI thread
 */

import { loadAllFonts } from './fontLoader';
import { buildFigmaTrees } from './converter';
import type { FigmaNode } from '../ui/main';

// ─── Plugin setup ────────────────────────────────────────────

// Show the plugin UI at a comfortable size for the textarea + examples
figma.showUI(__html__, {
  width: 360,
  height: 520,
  title: 'HTML to Figma',
  themeColors: true,  // respects Figma's light/dark preference
});

// ─── Message handler ─────────────────────────────────────────

figma.ui.onmessage = async (msg: {
  type: string;
  trees?: FigmaNode[];
  options?: { centerOnCanvas: boolean; selectAfterImport: boolean; useAutolayout: boolean };
}) => {

  if (msg.type !== 'CREATE_NODES') return;
  if (!msg.trees || msg.trees.length === 0) {
    figma.ui.postMessage({ type: 'ERROR', message: 'No nodes received from UI.' });
    return;
  }

  const options = {
    centerOnCanvas: msg.options?.centerOnCanvas ?? true,
    selectAfterImport: msg.options?.selectAfterImport ?? true,
    useAutolayout: msg.options?.useAutolayout ?? true,
  };

  try {
    // STEP 1: Load all fonts required by the AST.
    // This MUST complete before we create any TextNode, or Figma will throw.
    await loadAllFonts(msg.trees);

    // STEP 2: Recursively convert the JSON AST into native Figma nodes
    const created = buildFigmaTrees(msg.trees, options);

    // STEP 3: Report success back to the UI thread
    figma.ui.postMessage({
      type: 'SUCCESS',
      nodeCount: created.length,
    });

  } catch (err) {
    // Report any unexpected errors back to the UI thread
    const message = err instanceof Error ? err.message : String(err);
    console.error('[HTML to Figma] Conversion error:', message);
    figma.ui.postMessage({ type: 'ERROR', message });
  }
};
