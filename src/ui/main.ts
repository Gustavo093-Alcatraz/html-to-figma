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
 * Recursively parses the DOM and converts it to a Figma-friendly JSON AST.
 * We now use relative coordinates (node relative to parent) for better
 * compatibility with both Auto Layout and manual positioning.
 */
function walkDOM(el: HTMLElement, parentRect: { left: number; top: number }): FigmaNode | null {
  if (!el || el.offsetParent === null) return null; // Skip hidden elements

  const rect = el.getBoundingClientRect();
  const styles = window.getComputedStyle(el);

  if (styles.display === "none" || styles.visibility === "hidden") return null;

  // Calculate coordinates relative to parent
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

  // Special handling for text nodes
  if (el.children.length === 0 && el.innerText.trim() !== "") {
    figmaNode.type = "TEXT";
    figmaNode.text = el.innerText.trim();
  } else {
    // Process children recursively, passing current rect as parentRect
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) {
        const childNode = walkDOM(child, rect); // current rect becomes parentRect
        if (childNode) {
          figmaNode.children.push(childNode);
        }
      }
    }
  }

  return figmaNode;
}

/**
 * Captures HTML from the input areas and triggers the conversion.
 */
function handleConvert() {
  const htmlInput = (document.getElementById("html-input") as HTMLTextAreaElement).value;
  const renderContainer = document.getElementById("render-container")!;
  const btn = document.getElementById("convert-btn") as HTMLButtonElement;

  if (!htmlInput.trim()) return;

  btn.disabled = true;
  btn.innerText = "Processing...";

  // 1. Render HTML invisibly to get computed styles
  renderContainer.innerHTML = htmlInput;

  // Wait a frame for the browser to calculate layout
  setTimeout(() => {
    try {
      const trees: FigmaNode[] = [];
      const rootElements = Array.from(renderContainer.children);

      // Use the renderContainer's rect as the initial parentRect (0,0 reference)
      const containerRect = renderContainer.getBoundingClientRect();

      for (const el of rootElements) {
        if (el instanceof HTMLElement) {
          const tree = walkDOM(el, containerRect);
          if (tree) trees.push(tree);
        }
      }

      // 2. Capture options
      const useAutolayout = (document.getElementById("opt-autolayout") as HTMLInputElement).checked;
      const centerOnCanvas = (document.getElementById("opt-center") as HTMLInputElement).checked;
      const selectAfterImport = (document.getElementById("opt-select") as HTMLInputElement).checked;

      // 3. Send AST to Figma Main Thread
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

      renderContainer.innerHTML = "";
    } catch (err) {
      console.error("Extraction error:", err);
      btn.disabled = false;
      btn.innerText = "Convert to Figma";
    }
  }, 100);
}

// Event Listeners
document.getElementById("convert-btn")?.addEventListener("click", handleConvert);

// Clear button logic
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
  
  // Reset input so the same file can be imported again if needed
  target.value = "";
});

// Listen for success/error messages from the plugin
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  const btn = document.getElementById("convert-btn") as HTMLButtonElement;

  if (msg.type === "SUCCESS" || msg.type === "ERROR") {
    btn.disabled = false;
    btn.innerText = "Convert to Figma";
    if (msg.type === "ERROR") alert(msg.message);
  }
};

// Example buttons
document.querySelectorAll(".example-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const html = (btn as HTMLElement).dataset.html || "";
    (document.getElementById("html-input") as HTMLTextAreaElement).value = html;
  });
});
