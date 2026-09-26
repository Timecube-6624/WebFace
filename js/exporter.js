// exporter.js — write index.html + style.css to a user-chosen folder,
// with a download fallback when the File System Access API is unavailable.
import { store } from "./state.js";
import { buildCssText, buildHtmlText, computeClassMap, buildFuncContext } from "./render-css.js";

function toast(text, ok = true) {
  window.dispatchEvent(new CustomEvent("webfacer:toast", { detail: { text, ok } }));
}

export class Exporter {
  constructor(canvas) {
    this.canvas = canvas;
    this.dirHandle = null;
    this.menu = null;
  }

  get support() { return typeof window.showDirectoryPicker === "function"; }
  get folderName() { return this.dirHandle ? this.dirHandle.name : null; }

  _buildFiles() {
    const elements = store.elements();
    const classMap = computeClassMap(elements);
    const ctx = buildFuncContext(elements);
    const W = store.state.width, H = store.state.height;
    const pageClass = ".webfacer-page";
    const css = buildCssText(elements, { classMap, ctx, pageWidth: W, pageHeight: H, pageClass });
    const html = buildHtmlText(elements, { classMap, title: store.state.name, logic: store.logicEdges() });
    return { html, css };
  }

  async chooseFolder() {
    if (!this.support) throw new Error("当前浏览器不支持选择文件夹，将改用下载方式。");
    this.dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    window.dispatchEvent(new CustomEvent("webfacer:exportfolder"));
    return this.dirHandle;
  }

  async _writeFile(handle, name, content) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  async exportToFolder(promptIfMissing = true) {
    if (!this.dirHandle) {
      if (!this.support) { this.downloadFiles(); return; }
      if (!promptIfMissing) { toast("尚未选择导出文件夹", false); return; }
      try { await this.chooseFolder(); }
      catch (e) { if (e.name === "AbortError") return; this.downloadFiles(); return; }
    }
    const { html, css } = this._buildFiles();
    try {
      await this._writeFile(this.dirHandle, "index.html", html);
      await this._writeFile(this.dirHandle, "style.css", css);
      toast(`已导出到「${this.dirHandle.name}」 (index.html + style.css)`);
    } catch (e) {
      toast("写入文件夹失败：" + e.message, false);
    }
  }

  downloadFiles() {
    const { html, css } = this._buildFiles();
    this._download("index.html", html);
    this._download("style.css", css);
    toast("已开始下载 index.html 和 style.css");
  }

  _download(name, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  // ----- dropdown menu on the export button -----
  attachMenu(btn) {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.toggleMenu(btn);
    });
  }
  toggleMenu(btn) {
    if (this.menu) { this.closeMenu(); return; }
    const m = document.createElement("div");
    m.className = "export-menu";
    m.style.cssText = "position:fixed;top:44px;right:12px;background:var(--panel-3);border:1px solid var(--border);border-radius:8px;padding:6px;z-index:120;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:2px;min-width:200px";
    const mk = (icon, label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "text-align:left;background:transparent;border:none;color:var(--text);padding:8px 10px;border-radius:5px;cursor:pointer;font-size:12px;font-family:var(--font)";
      b.textContent = `${icon}  ${label}`;
      b.addEventListener("mouseenter", () => b.style.background = "var(--panel-2)");
      b.addEventListener("mouseleave", () => b.style.background = "transparent");
      b.addEventListener("click", () => { this.closeMenu(); fn(); });
      m.appendChild(b);
    };
    mk("📁", this.dirHandle ? `导出到「${this.dirHandle.name}」` : "选择文件夹并导出…", () => this.exportToFolder(true));
    mk("⬇", "下载 index.html / style.css", () => this.downloadFiles());
    this.menu = m;
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener("pointerdown", this._closeOut = () => this.closeMenu()), 0);
  }
  closeMenu() {
    if (this.menu) this.menu.remove();
    this.menu = null;
    if (this._closeOut) { document.removeEventListener("pointerdown", this._closeOut); this._closeOut = null; }
  }
}
