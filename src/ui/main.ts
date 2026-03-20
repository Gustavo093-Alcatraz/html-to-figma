/**
 * UI Main Thread — DOM Parser & Serializer
 *
 * This file runs inside the plugin's sandboxed iframe.
 * It has full access to the browser DOM APIs, including
 * window.getComputedStyle(), getBoundingClientRect(), etc.
 *
 * Flow:
 *  1. User pastes HTML → clicks Convert
 *  2. HTML is injected into the hidden #render-root div
 *  3. walkDOM() recursively traverses each element,
 *     extracts computed styles + bounding rect,
 *     and builds a FigmaNode AST (plain JSON)
 *  4. The AST is sent to the main thread via parent.postMessage()
 */

// ─── Types shared between UI and plugin threads ─────────────
export interface FigmaNode {
  type: 'FRAME' | 'TEXT' | 'RECTANGLE';
  name: string;
  /** Computed CSS properties we care about */
  styles: {
    // Layout
    display: string;
    flexDirection: string;
    flexWrap: string;
    justifyContent: string;
    alignItems: string;
    gap: string;
    rowGap: string;
    columnGap: string;
    // Sizing
    width: string;
    height: string;
    minWidth: string;
    maxWidth: string;
    // Spacing
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    // Appearance
    backgroundColor: string;
    borderRadius: string;
    borderTopLeftRadius: string;
    borderTopRightRadius: string;
    borderBottomLeftRadius: string;
    borderBottomRightRadius: string;
    opacity: string;
    // Typography (for TEXT nodes)
    color: string;
    fontSize: string;
    fontWeight: string;
    fontFamily: string;
    fontStyle: string;
    textAlign: string;
    lineHeight: string;
    letterSpacing: string;
  };
  /** Bounding box in the #render-root coordinate space */
  rect: { x: number; y: number; width: number; height: number };
  /** Only present when type === 'TEXT' */
  text?: string;
  children: FigmaNode[];
}

/** Keys of computed style properties we need to extract */
const STYLE_KEYS: (keyof FigmaNode['styles'])[] = [
  'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems',
  'gap', 'rowGap', 'columnGap',
  'width', 'height', 'minWidth', 'maxWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'backgroundColor', 'borderRadius',
  'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
  'opacity',
  'color', 'fontSize', 'fontWeight', 'fontFamily', 'fontStyle',
  'textAlign', 'lineHeight', 'letterSpacing',
];

// ─── DOM → FigmaNode AST ────────────────────────────────────

/**
 * Determines whether an element should be treated as a text node.
 * We consider an element "textual" if all its meaningful content
 * is in text nodes (no element children with visible content).
 */
function isTextElement(el: Element): boolean {
  const textTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'SPAN', 'LABEL', 'A', 'STRONG', 'EM', 'B', 'I',
    'BUTTON', 'LI', 'TD', 'TH', 'CAPTION', 'FIGCAPTION',
    'SMALL', 'MARK', 'CODE', 'PRE', 'BLOCKQUOTE', 'CITE']);
  if (textTags.has(el.tagName)) return true;
  // Also treat as text if element only has text node children
  const childElements = Array.from(el.childNodes).filter(
    n => n.nodeType === Node.ELEMENT_NODE
  );
  return childElements.length === 0 && (el.textContent?.trim() ?? '') !== '';
}

/**
 * Extracts computed style values we care about into a plain object.
 */
function extractStyles(el: Element): FigmaNode['styles'] {
  const cs = window.getComputedStyle(el);
  const styles = {} as FigmaNode['styles'];
  for (const key of STYLE_KEYS) {
    // getPropertyValue uses kebab-case; camelCase works too via the object
    styles[key] = (cs as unknown as Record<string, string>)[key] ?? '';
  }
  return styles;
}

/**
 * Recursively walks a DOM element and produces a FigmaNode AST.
 * Returns null for invisible / irrelevant elements.
 */
function walkDOM(el: Element, rootRect: DOMRect): FigmaNode | null {
  const cs = window.getComputedStyle(el);

  // Skip invisible, script, style elements
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT'].includes(el.tagName)) return null;

  const rect = el.getBoundingClientRect();
  // Skip elements with zero size (can happen for empty containers)
  if (rect.width === 0 && rect.height === 0) return null;

  const styles = extractStyles(el);

  // Bounding box relative to the render root container
  const nodeRect = {
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
  };

  const name = el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    (el.className && typeof el.className === 'string'
      ? `.${el.className.trim().split(/\s+/).join('.')}` : '');

  // TEXT NODE PATH
  if (isTextElement(el)) {
    const text = el.textContent?.trim() ?? '';
    if (!text) return null;
    return {
      type: 'TEXT',
      name,
      styles,
      rect: nodeRect,
      text,
      children: [],
    };
  }

  // CONTAINER NODE PATH — recurse into children
  const children: FigmaNode[] = [];
  for (const child of Array.from(el.children)) {
    const childNode = walkDOM(child, rootRect);
    if (childNode) children.push(childNode);
  }

  const isFlexOrGrid = styles.display === 'flex' || styles.display === 'grid' || styles.display === 'inline-flex';

  return {
    type: isFlexOrGrid ? 'FRAME' : 'RECTANGLE',
    name,
    styles,
    rect: nodeRect,
    children,
  };
}

// ─── Example HTML snippets ──────────────────────────────────
const EXAMPLES: Record<string, string> = {
  'flex-column': `<div style="display:flex; flex-direction:column; gap:16px; padding:24px; background:#1a1a2e; border-radius:12px; width:320px;">
  <h1 style="color:#7B61FF; font-size:28px; font-weight:700;">Hello Figma!</h1>
  <p style="color:#ccccdd; font-size:14px; line-height:1.6;">This is a paragraph of text demonstrating the flex column layout conversion.</p>
  <div style="background:#2a2a3e; padding:16px; border-radius:8px;">
    <span style="color:#4ADE80; font-size:13px;">Nested element</span>
  </div>
</div>`,

  'flex-row': `<div style="display:flex; flex-direction:row; gap:12px; padding:16px; background:#ffffff; border-radius:10px; align-items:center;">
  <div style="width:48px; height:48px; background:#7B61FF; border-radius:50%;"></div>
  <div style="display:flex; flex-direction:column; gap:4px;">
    <span style="color:#111827; font-size:15px; font-weight:600;">Jane Doe</span>
    <span style="color:#6B7280; font-size:13px;">UX Designer</span>
  </div>
</div>`,

  'card': `<div style="display:flex; flex-direction:column; gap:0; background:#ffffff; border-radius:16px; overflow:hidden; width:300px; box-shadow:0 4px 24px rgba(0,0,0,0.12);">
  <div style="height:160px; background:linear-gradient(135deg,#7B61FF,#61DAFB);"></div>
  <div style="display:flex; flex-direction:column; gap:12px; padding:20px;">
    <h2 style="color:#111827; font-size:18px; font-weight:700;">Card Title</h2>
    <p style="color:#6B7280; font-size:14px;">A beautiful card component built with Flexbox, now in Figma!</p>
    <button style="background:#7B61FF; color:#fff; padding:10px 20px; border-radius:8px; font-size:14px; font-weight:600; border:none;">Get Started</button>
  </div>
</div>`,

  'button': `<button style="display:inline-flex; align-items:center; gap:8px; background:#7B61FF; color:#ffffff; font-size:14px; font-weight:600; padding:12px 24px; border-radius:8px; border:none; cursor:pointer;">
  <span style="font-size:16px;">🚀</span>
  <span>Launch Plugin</span>
</button>`,
};

// ─── UI Event Wiring ────────────────────────────────────────

const htmlInput     = document.getElementById('html-input')    as HTMLTextAreaElement;
const convertBtn    = document.getElementById('convert-btn')   as HTMLButtonElement;
const clearBtn      = document.getElementById('clear-btn')     as HTMLButtonElement;
const statusEl      = document.getElementById('status')        as HTMLDivElement;
const renderRoot    = document.getElementById('render-root')   as HTMLDivElement;
const btnLabel      = convertBtn.querySelector('.btn-label')   as HTMLSpanElement;
const btnLoading    = convertBtn.querySelector('.btn-loading') as HTMLSpanElement;
const btnIcon       = convertBtn.querySelector('.btn-icon')    as unknown as SVGElement;
const optCenter     = document.getElementById('opt-center')    as HTMLInputElement;
const optSelect     = document.getElementById('opt-select')    as HTMLInputElement;

/** Displays a status message in the UI */
function showStatus(msg: string, type: 'success' | 'error' | 'info') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.hidden = false;
}

/** Sets the button into loading state */
function setLoading(loading: boolean) {
  convertBtn.disabled = loading;
  btnLabel.hidden = loading;
  btnIcon.setAttribute('hidden', loading ? 'true' : '');
  btnLoading.hidden = !loading;
}

/** Main conversion handler */
function handleConvert() {
  const html = htmlInput.value.trim();
  if (!html) {
    showStatus('⚠️ Please paste some HTML code first.', 'error');
    return;
  }

  setLoading(true);
  statusEl.hidden = true;

  // Use a small timeout so the UI can repaint and show the loading state
  // before we do (potentially expensive) synchronous DOM operations.
  setTimeout(() => {
    try {
      // STEP 1: Inject HTML into the hidden render root.
      // The browser will compute layout and styles for all elements.
      renderRoot.innerHTML = html;

      // STEP 2: Get the bounding rect of the render root (our coordinate origin)
      const rootRect = renderRoot.getBoundingClientRect();

      // STEP 3: Walk the rendered DOM tree and build the FigmaNode AST
      const trees: FigmaNode[] = [];
      for (const child of Array.from(renderRoot.children)) {
        const node = walkDOM(child, rootRect);
        if (node) trees.push(node);
      }

      if (trees.length === 0) {
        throw new Error('No visible elements found in the provided HTML. Make sure elements have a non-zero size.');
      }

      // STEP 4: Clean up the render root to free memory
      renderRoot.innerHTML = '';

      // STEP 5: Send the AST to the Figma main thread
      parent.postMessage(
        {
          pluginMessage: {
            type: 'CREATE_NODES',
            trees,
            options: {
              centerOnCanvas: optCenter.checked,
              selectAfterImport: optSelect.checked,
            },
          },
        },
        '*'
      );

      // Show interim status — final confirmation comes back from main thread
      showStatus('⏳ Building Figma nodes…', 'info');
    } catch (err) {
      renderRoot.innerHTML = '';
      setLoading(false);
      showStatus(`❌ Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, 30);
}

// ─── Listen for messages from the main thread ───────────────
window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  setLoading(false);

  if (msg.type === 'SUCCESS') {
    showStatus(`✅ Done! Created ${msg.nodeCount} node${msg.nodeCount !== 1 ? 's' : ''} on the canvas.`, 'success');
  } else if (msg.type === 'ERROR') {
    showStatus(`❌ Error: ${msg.message}`, 'error');
  }
};

// ─── Event listeners ────────────────────────────────────────

convertBtn.addEventListener('click', handleConvert);

clearBtn.addEventListener('click', () => {
  htmlInput.value = '';
  statusEl.hidden = true;
  htmlInput.focus();
});

// Ctrl/Cmd+Enter to convert
htmlInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleConvert();
});

// Example chips
document.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.example ?? '';
    if (EXAMPLES[key]) {
      htmlInput.value = EXAMPLES[key];
      statusEl.hidden = true;
      htmlInput.focus();
    }
  });
});
