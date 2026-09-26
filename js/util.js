// util.js — shared helpers (no build, ES module)
let idCounter = 0;

export function uid(prefix = "el") {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function clamp(v, min, max) {
  v = Number(v);
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function slugify(str) {
  let s = String(str || "")
    .trim()
    .toLowerCase();
  // keep CJK as-is but separate; strip most punctuation/spaces -> hyphen
  s = s.replace(/[\s]+/g, "-");
  s = s.replace(/[^a-z0-9\u4e00-\u9fa5\-_]/g, "");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s || "element";
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Tiny event emitter
export class Emitter {
  constructor() { this._m = new Map(); }
  on(ev, fn) {
    if (!this._m.has(ev)) this._m.set(ev, []);
    this._m.get(ev).push(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) {
    const a = this._m.get(ev);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  emit(ev, ...args) {
    const a = this._m.get(ev);
    if (a) for (const fn of [...a]) fn(...args);
  }
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Attach a drag ghost helper
export function showDragGhost(text, ev) {
  const g = document.createElement("div");
  g.className = "drag-ghost";
  g.textContent = text;
  document.body.appendChild(g);
  moveDragGhost(g, ev);
  return g;
}
export function moveDragGhost(g, ev) {
  g.style.left = (ev.clientX + 12) + "px";
  g.style.top = (ev.clientY + 10) + "px";
}
export function hideDragGhost(g) { if (g) g.remove(); }
