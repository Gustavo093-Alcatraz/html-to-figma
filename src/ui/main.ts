/**
 * UI Thread (Main entry for index.html)
 */

export interface FigmaNode {
  type: "FRAME" | "TEXT" | "RECTANGLE";
  name: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: any;
  text?: string;
  children: FigmaNode[];
}

/**
 * Examples Registry
 * Provides pre-defined HTML snippets for the 'Quick Examples' section.
 */
const EXAMPLES: Record<string, string> = {
  "flex-column": `<div style="display: flex; flex-direction: column; gap: 16px; padding: 24px; background: #1a1a24; border-radius: 12px; width: 300px;">
  <div style="height: 40px; background: #7B61FF; border-radius: 6px;"></div>
  <div style="height: 40px; background: #61DAFB; border-radius: 6px;"></div>
  <div style="height: 40px; background: #FF6B6B; border-radius: 6px;"></div>
</div>`,
  "flex-row": `<div style="display: flex; flex-direction: row; gap: 12px; padding: 20px; background: #18181f; border: 1px solid #2e2e3e; border-radius: 10px;">
  <div style="width: 48px; height: 48px; background: #4ADE80; border-radius: 50%;"></div>
  <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
    <div style="width: 100px; height: 12px; background: #f0f0ff; border-radius: 4px;"></div>
    <div style="width: 60px; height: 8px; background: #8888aa; border-radius: 4px;"></div>
  </div>
</div>`,
  "card": `<div style="width: 260px; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); font-family: sans-serif;">
  <div style="height: 140px; background: linear-gradient(135deg, #7B61FF, #61DAFB);"></div>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px;">
    <h2 style="margin: 0; font-size: 18px; color: #18181f;">Premium Design</h2>
    <p style="margin: 0; font-size: 14px; color: #55556f; line-height: 1.4;">This card was converted from raw HTML to native Figma layers.</p>
    <button style="padding: 10px; background: #7B61FF; color: white; border: none; border-radius: 8px; font-weight: 600;">Action</button>
  </div>
</div>`,
  "button": `<button style="background: #7B61FF; color: white; padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
  Action Button
</button>`
};

/**
 * Recursively parses the DOM and converts it to a Figma-friendly JSON AST.
 * Calculates coordinates relative to parent element.
 */
function walkDOM(el: HTMLElement, parentRect: { left: number; top: number }): FigmaNode | null {
  if (!el || el.offsetParent === null) return null;

  const rect = el.getBoundingClientRect();
  const styles = window.getComputedStyle(el);

  if (styles.display === "none" || styles.visibility === "hidden") return null;

  const figmaNode: FigmaNode = {
    type: styles.display === "flex" || styles.display === "inline-flex" || el.children.length > 0 ? "FRAME" : "RECTANGLE",
    name: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""),
    rect: {
      x: rect.left - parentRect.left,
      y: rect.top - parentRect.top,
      width: rect.width,
      height: rect.height,
    },
    styles: {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      fontFamily: styles.fontFamily,
      fontStyle: styles.fontStyle,
      textAlign: styles.textAlign,
      opacity: styles.opacity,
      paddingTop: styles.paddingTop,
      paddingRight: styles.paddingRight,
      paddingBottom: styles.paddingBottom,
      paddingLeft: styles.paddingLeft,
      display: styles.display,
      flexDirection: styles.flexDirection,
      justifyContent: styles.justifyContent,
      alignItems: styles.alignItems,
      gap: styles.gap,
      columnGap: styles.columnGap,
      rowGap: styles.rowGap,
      borderRadius: styles.borderRadius,
      borderTopLeftRadius: styles.borderTopLeftRadius,
      borderTopRightRadius: styles.borderTopRightRadius,
      borderBottomRightRadius: styles.borderBottomRightRadius,
      borderBottomLeftRadius: styles.borderBottomLeftRadius,
      lineHeight: styles.lineHeight,
      letterSpacing: styles.letterSpacing,
    },
    children: [],
  };

  if (el.children.length === 0 && el.innerText.trim() !== "") {
    figmaNode.type = "TEXT";
    figmaNode.text = el.innerText.trim();
  } else {
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) {
        const childNode = walkDOM(child, rect);
        if (childNode) {
          figmaNode.children.push(childNode);
        }
      }
    }
  }

  return figmaNode;
}

/**
 * Captures HTML from the input area and triggers the conversion.
 */
function handleConvert() {
  const htmlInput = (document.getElementById("html-input") as HTMLTextAreaElement).value;
  const renderRoot = document.getElementById("render-root")!; // FIXED: Corrected ID from render-container to render-root
  const btn = document.getElementById("convert-btn") as HTMLButtonElement;

  if (!htmlInput.trim()) return;

  btn.disabled = true;
  const btnLabel = btn.querySelector('.btn-label') as HTMLElement;
  const btnLoading = btn.querySelector('.btn-loading') as HTMLElement;
  
  if (btnLabel) btnLabel.hidden = true;
  if (btnLoading) btnLoading.hidden = false;

  // Render HTML invisibly to get computed styles
  renderRoot.innerHTML = htmlInput;

  setTimeout(() => {
    try {
      const trees: FigmaNode[] = [];
      const rootElements = Array.from(renderRoot.children);
      const containerRect = renderRoot.getBoundingClientRect();

      for (const el of rootElements) {
        if (el instanceof HTMLElement) {
          const tree = walkDOM(el, containerRect);
          if (tree) trees.push(tree);
        }
      }

      const useAutolayout = (document.getElementById("opt-autolayout") as HTMLInputElement).checked;
      const centerOnCanvas = (document.getElementById("opt-center") as HTMLInputElement).checked;
      const selectAfterImport = (document.getElementById("opt-select") as HTMLInputElement).checked;

      parent.postMessage({
        pluginMessage: {
          type: "CREATE_NODES",
          trees,
          options: {
            useAutolayout,
            centerOnCanvas,
            selectAfterImport,
          },
        },
      }, "*");

      renderRoot.innerHTML = "";
    } catch (err) {
      console.error("Extraction error:", err);
      resetBtn();
    }
  }, 100);
}

function resetBtn() {
  const btn = document.getElementById("convert-btn") as HTMLButtonElement;
  const btnLabel = btn.querySelector('.btn-label') as HTMLElement;
  const btnLoading = btn.querySelector('.btn-loading') as HTMLElement;
  
  btn.disabled = false;
  if (btnLabel) btnLabel.hidden = false;
  if (btnLoading) btnLoading.hidden = true;
}

// ─── Event Listeners ─────────────────────────────────────────

document.getElementById("convert-btn")?.addEventListener("click", handleConvert);

document.getElementById("clear-btn")?.addEventListener("click", () => {
  (document.getElementById("html-input") as HTMLTextAreaElement).value = "";
});

// File Import logic
const fileImport = document.getElementById("file-import") as HTMLInputElement;
const importBtn = document.getElementById("import-btn");

importBtn?.addEventListener("click", () => {
  fileImport.click();
});

fileImport?.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (text) {
      (document.getElementById("html-input") as HTMLTextAreaElement).value = text;
    }
  };
  reader.readAsText(file);
  target.value = "";
});

// Examples chips logic — FIXED: Corrected selector and reference to EXAMPLES object
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const exampleKey = (chip as HTMLElement).dataset.example;
    if (exampleKey && EXAMPLES[exampleKey]) {
      (document.getElementById("html-input") as HTMLTextAreaElement).value = EXAMPLES[exampleKey];
    }
  });
});

// Listen for success/error messages from the plugin
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (msg.type === "SUCCESS" || msg.type === "ERROR") {
    resetBtn();
    if (msg.type === "ERROR") alert(msg.message);
  }
};
