// code-preview.js — live source preview (current element CSS, full CSS, HTML).
import { store } from "./state.js";
import { buildCssText, buildHtmlText, elementRule, computeClassMap, buildFuncContext } from "./render-css.js";
import { escapeHtml } from "./util.js";

export class CodePreview {
  constructor(root) {
    this.root = root;          // #code-preview
    this.tabs = [...root.querySelectorAll(".cp-tab")];
    this.code = root.querySelector("#cp-code");
    this.active = "css";
    this.visible = false;
    this._bindTabs();
    this._bindActions();
    this._bindStore();
  }

  _bindTabs() {
    this.tabs.forEach(t => t.addEventListener("click", () => {
      this.active = t.dataset.tab;
      this.tabs.forEach(x => x.classList.toggle("active", x === t));
      this.render();
    }));
  }
  _bindActions() {
    this.root.querySelector("#cp-close").addEventListener("click", () => this.toggle(false));
    this.root.querySelector("#cp-copy").addEventListener("click", () => {
      const text = this.code.textContent;
      navigator.clipboard.writeText(text).then(() => window.dispatchEvent(new CustomEvent("webfacer:toast", { detail: { text: "已复制", ok: true } })));
    });
  }
  _bindStore() {
    store.on("change", () => { if (this.visible) this.render(); });
  }

  toggle(show) {
    this.visible = show == null ? !this.visible : show;
    this.root.hidden = !this.visible;
    if (this.visible) this.render();
  }

  _currentText() {
    const elements = store.elements();
    const classMap = computeClassMap(elements);
    const ctx = buildFuncContext(elements);
    const W = store.state.width, H = store.state.height;
    const sel = store.getElement(store.state.selectedId);
    if (this.active === "css") {
      if (!sel) return "/* 请先在画布上选中一个元素，查看它的 CSS。 */\n";
      return elementRule(sel, classMap.get(sel.id), ctx) + "\n";
    }
    if (this.active === "html") {
      return buildHtmlText(elements, { classMap, title: store.state.name, logic: store.logicEdges() });
    }
    // all css
    return buildCssText(elements, { classMap, ctx, pageWidth: W, pageHeight: H });
  }

  render() {
    const isCss = this.active === "css" || this.active === "all";
    const text = this._currentText();
    this.code.textContent = text;
    const esc = escapeHtml(text);
    this.code.innerHTML = isCss ? this._hlCss(esc) : this._hlHtml(esc);
  }

  _hlCss(esc) {
    let out = esc.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="tok-cmt">${m}</span>`);
    out = out.replace(/^(\s*)([.#][A-Za-z0-9_-]+)/gm, (m, p1, p2) => `${p1}<span class="tok-sel">${p2}</span>`);
    out = out.replace(/(^|\s)([a-zA-Z-]+)(\s*:)/gm, (m, p1, p2, p3) => `${p1}<span class="tok-prop">${p2}</span>${p3}`);
    return out;
  }
  _hlHtml(esc) {
    return esc.replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g, (m, a, b) => `${a}<span class="tok-sel">${b}</span>`);
  }
}
