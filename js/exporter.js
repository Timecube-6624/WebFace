// exporter.js — build the WebFacer archive: an UNCOMPRESSED .zip holding
// index.html + style.css (the generated page) and webfacer.json (the data that
// belongs to WebFacer itself: project name, author, canvas, elements, animations,
// click logic), so a saved archive can be identified and re-opened later.
import { store } from "./state.js";
import { buildCssText, buildHtmlText, computeClassMap, buildFuncContext } from "./render-css.js";

const ARCHIVE_FORMAT = "webfacer-archive";
const ARCHIVE_VERSION = 1;
const META_FILE = "webfacer.json";

// ---- CRC-32 (a stored zip entry still needs it) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const le16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
const le32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
const headerBytes = (arr) => new Uint8Array(arr.flat());

// Build a ZIP with method 0 (store): everything is written verbatim, nothing is
// compressed — a .zip container that is trivially readable without inflating.
export function buildZip(entries, when = new Date()) {
  const enc = new TextEncoder();
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const date = (((when.getFullYear() - 1980) & 0x7F) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = typeof e.text === "string" ? enc.encode(e.text)
      : (e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data || []));
    const crc = crc32(data);
    const local = headerBytes([0x50, 0x4b, 0x03, 0x04,
      ...le16(20), ...le16(0x0800), ...le16(0),
      ...le16(time), ...le16(date),
      ...le32(crc), ...le32(data.length), ...le32(data.length),
      ...le16(name.length), ...le16(0)]);
    parts.push(local, name, data);
    central.push(headerBytes([0x50, 0x4b, 0x01, 0x02,
      ...le16(20), ...le16(20), ...le16(0x0800), ...le16(0),
      ...le16(time), ...le16(date),
      ...le32(crc), ...le32(data.length), ...le32(data.length),
      ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(0), ...le32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) { parts.push(c); centralSize += c.length; }
  parts.push(headerBytes([0x50, 0x4b, 0x05, 0x06,
    ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length),
    ...le32(centralSize), ...le32(centralStart), ...le16(0)]));
  return new Blob(parts, { type: "application/zip" });
}

function safeFileName(name) {
  const s = String(name || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^[.\s]+|[.\s]+$/g, "");
  return s || "webfacer-project";
}

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

  // the WebFacer-specific data that ships inside the archive
  toArchiveMeta() {
    const p = store.state;
    const elements = store.elements();
    return {
      format: ARCHIVE_FORMAT,
      formatVersion: ARCHIVE_VERSION,
      generator: "WebFacer",
      exportedAt: new Date().toISOString(),
      files: ["index.html", "style.css"],
      project: {
        id: p.id,
        name: p.name,
        author: p.author || "",
        width: p.width,
        height: p.height,
        canvasBg: p.canvasBg,
        showGrid: !!p.showGrid,
      },
      counts: {
        elements: elements.length,
        animations: elements.reduce((n, e) => n + ((e.anims || []).length), 0),
        logic: (store.logicEdges() || []).length,
      },
      logic: store.logicEdges() || [],
      elements,
    };
  }

  archiveEntries() {
    const { html, css } = this._buildFiles();
    return [
      { name: "index.html", text: html },
      { name: "style.css", text: css },
      { name: META_FILE, text: JSON.stringify(this.toArchiveMeta(), null, 2) + "\n" },
    ];
  }
  archiveName() { return safeFileName(store.state.name) + ".zip"; }

  // one action: an uncompressed zip with the page + the WebFacer data
  async exportArchive() {
    let blob;
    try { blob = buildZip(this.archiveEntries()); }
    catch (e) { toast("打包失败：" + e.message, false); return; }
    const name = this.archiveName();
    if (this.dirHandle) {
      try {
        await this._writeFile(this.dirHandle, name, blob);
        toast(`已导出 ${name} 到「${this.dirHandle.name}」（index.html + style.css + ${META_FILE}）`);
        return;
      } catch (e) {
        toast("写入文件夹失败，改为下载：" + (e && e.message ? e.message : e), false);
      }
    }
    this._downloadBlob(name, blob);
    toast(`已下载 ${name}（index.html + style.css + ${META_FILE}）`);
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

  _downloadBlob(name, blob) {
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
    mk("📦", this.dirHandle ? `导出 zip 到「${this.dirHandle.name}」` : "导出 zip 存档", () => this.exportArchive());
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
