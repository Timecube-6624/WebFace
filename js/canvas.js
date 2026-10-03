// canvas.js — renders the design surface and handles all canvas interaction.
import { store } from "./state.js";
import { getComponent } from "./components.js";
import { clamp, debounce } from "./util.js";

const SNAP = 4;       // movement snap (px)
const MIN_SIZE = 8;   // min element size (px)

const HANDLE_DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function isImageUrl(v) {
  if (!v) return false;
  return /^(https?:)?\/\//i.test(v) || /^data:/i.test(v) || /^blob:/i.test(v);
}
function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Canvas {
  constructor(refs) {
    this.stage = refs.stage;
    this.nodeMap = new Map(); // id -> DOM node
    this.zoom = store.state.zoom;
    this._drag = null;
    this._bound = false;

    this._build();
    this._bindStore();
    this._bindPointer();
    this.render();
  }

  // ----- DOM structure -----
  _build() {
    const wrap = document.createElement("div");
    wrap.className = "canvas-wrap";
    const canvas = document.createElement("div");
    canvas.className = "canvas";
    canvas.id = "canvas";
    wrap.appendChild(canvas);
    this.stage.appendChild(wrap);
    this.wrap = wrap;
    this.canvas = canvas;

    // selection frame + resize handles
    const frame = document.createElement("div");
    frame.className = "select-frame";
    const label = document.createElement("div");
    label.className = "frame-label";
    const size = document.createElement("div");
    size.className = "frame-size";
    frame.appendChild(label);
    frame.appendChild(size);
    for (const dir of HANDLE_DIRS) {
      const h = document.createElement("div");
      h.className = "rhandle";
      h.dataset.dir = dir;
      frame.appendChild(h);
    }
    this.frame = frame;
    this.frameLabel = label;
    this.frameSize = size;
    canvas.appendChild(frame);
    // marquee selection box
    const marquee = document.createElement("div");
    marquee.className = "canvas-highlight marquee";
    marquee.style.display = "none";
    this.marquee = marquee;
    canvas.appendChild(marquee);
  }

  _bindStore() {
    store.on("change", (reason) => {
      switch (reason.type) {
        case "add":
        case "remove":
        case "structure":
          this.render();
          break;
        case "update":
          this.updateNode(reason.id);
          break;
        case "update-many":
          this.render();
          break;
        case "selection":
          this.updateSelectionFrame();
          break;
        case "zoom":
          this.layout();
          this.updateSelectionFrame();
          break;
        case "resize-canvas":
          this.layout();
          this.render();
          break;
        case "canvas":
          this.applyCanvasStyle();
          break;
        default:
          break;
      }
    });
  }

  // ----- layout / zoom -----
  layout() {
    const z = store.state.zoom;
    const W = store.state.width;
    const H = store.state.height;
    this.zoom = z;
    this.canvas.style.width = W + "px";
    this.canvas.style.height = H + "px";
    this.canvas.style.transform = `scale(${z})`;
    this.canvas.style.transformOrigin = "0 0";
    this.wrap.style.width = (W * z) + "px";
    this.wrap.style.height = (H * z) + "px";
    this.applyCanvasStyle();
  }

  applyCanvasStyle() {
    const bg = store.state.canvasBg || "#ffffff";
    this.canvas.style.backgroundColor = bg;
    this.canvas.classList.toggle("no-grid", !store.state.showGrid);
  }

  // ----- coordinate mapping -----
  _clientToCanvas(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / this.zoom,
      y: (ev.clientY - rect.top) / this.zoom,
    };
  }

  // ----- rendering -----
  render() {
    const docs = document.createDocumentFragment();
    this.nodeMap.clear();
    for (const el of store.elements()) {
      const node = this._buildNode(el);
      this._applyStyle(node, el);
      this.nodeMap.set(el.id, node);
      docs.appendChild(node);
    }
    this.canvas.textContent = "";
    this.canvas.appendChild(docs);
    this.canvas.appendChild(this.frame);
    this.updateSelectionFrame();
  }

  _buildNode(el) {
    let node;
    if (el.type === "image") {
      if (isImageUrl(el.content)) {
        node = document.createElement("img");
        node.src = el.content;
        node.alt = el.name || "";
        node.draggable = false;
      } else {
        node = document.createElement("div");
        node.textContent = "图片 · 在右侧设置地址";
        node.classList.add("img-ph");
      }
    } else if (el.type === "input") {
      node = document.createElement("input");
      node.type = "text";
      node.readOnly = true;
      node.tabIndex = -1;
      node.placeholder = el.content || "";
    } else {
      node = document.createElement("div");
      if (el.type === "link") node.style.textDecoration = "underline";
      node.textContent = el.content || "";
    }
    node.className = "el";
    if (el.locked) node.classList.add("locked");
    if (el.type === "group") node.classList.add("is-group-el");
    if (store.isSelected(el.id)) node.classList.add("selected");
    node.dataset.id = el.id;
    return node;
  }

  _applyStyle(node, el) {
    // Fully rebuild the inline style so changing a value to 0 / none / transparent
    // actually takes effect (previously such values were skipped and the old
    // inline value stuck, e.g. border-radius could not be reduced to 0).
    node.style.cssText = "";
    for (const [k, v] of Object.entries(el.props || {})) {
      if (v == null || k === "width" || k === "height") continue;
      const val = String(v).trim();
      if (!val) continue;
      try { node.style.setProperty(k, val); } catch (e) { /* ignore invalid */ }
    }
    // geometry last so explicit canvas size wins over props like width:auto/100%
    node.style.left = el.x + "px";
    node.style.top = el.y + "px";
    node.style.width = el.width + "px";
    node.style.height = el.height + "px";
    if (store.isHidden(el.id)) node.style.display = "none";
    // content type-dependent apply
    if (el.type === "image") node.src = el.content || "";
    if (el.type === "input") node.placeholder = el.content || "";
    if (el.type !== "image" && el.type !== "input" && el.type !== "link") node.textContent = el.content || "";
  }

  updateNode(id) {
    const el = store.getElement(id);
    const node = this.nodeMap.get(id);
    if (el && node && (el.type === "image" || el.type === "input")) { this.render(); return; }
    if (el && node) this._applyStyle(node, el);
    if (store.state.selectedId === id) this.updateSelectionFrame();
    else if (!el) this.render();
  }

  updateSelectionFrame() {
    // sync per-element 'selected' outlines
    for (const [id, node] of this.nodeMap) node.classList.toggle("selected", store.isSelected(id));
    const sel = store.selected();
    if (sel.length === 0) { this.frame.classList.remove("on"); return; }
    let left, top, right, bottom;
    for (const id of sel) {
      const el = store.getElement(id);
      if (!el) continue;
      left = left == null ? el.x : Math.min(left, el.x);
      top = top == null ? el.y : Math.min(top, el.y);
      right = right == null ? el.x + el.width : Math.max(right, el.x + el.width);
      bottom = bottom == null ? el.y + el.height : Math.max(bottom, el.y + el.height);
    }
    this.frame.classList.add("on");
    this.frame.style.left = left + "px";
    this.frame.style.top = top + "px";
    this.frame.style.width = (right - left) + "px";
    this.frame.style.height = (bottom - top) + "px";
    this.frame.classList.toggle("group", sel.length > 1);
    // hide resize handles for group selection
    this.frame.querySelectorAll(".rhandle").forEach(h => { h.style.display = sel.length > 1 ? "none" : ""; });
    if (sel.length === 1) {
      const el = store.getElement(sel[0]);
      this.frameLabel.textContent = el ? el.name : "";
      this.frameSize.textContent = el ? `${Math.round(el.width)} × ${Math.round(el.height)}` : "";
    } else {
      this.frameLabel.textContent = sel.length + " 个元素";
      this.frameSize.textContent = "";
    }
  }

  // ----- pointer interaction -----
  _bindPointer() {
    this.canvas.addEventListener("pointerdown", this._onPointerDown.bind(this));
    this.canvas.addEventListener("dblclick", this._onDblClick.bind(this));
  }

  _onPointerDown(ev) {
    const handle = ev.target.closest(".rhandle");
    if (handle) {
      if (handle.closest(".select-frame").classList.contains("on")) {
        this._startResize(ev, handle.dataset.dir);
      }
      return;
    }
    const node = ev.target.closest(".el");
    if (node) {
      const id = node.dataset.id;
      const el = store.getElement(id);
      if (!el || el.locked) return;
      if (store.isSelected(id)) this._startMove(ev, store.selected());
      else { store.select(id); this._startMove(ev, [id]); }
      return;
    }
    // empty canvas -> start marquee selection
    this._startMarquee(ev);
  }

  _onDblClick(ev) {
    const node = ev.target.closest(".el");
    if (!node) return;
    const id = node.dataset.id;
    const el = store.getElement(id);
    if (!el) return;
    // request content edit via a custom event the inspector can hook
    window.dispatchEvent(new CustomEvent("webfacer:edit-content", { detail: { id } }));
  }

  _snap(v) { return Math.round(v / SNAP) * SNAP; }

  _startMove(ev, ids) {
    const start = this._clientToCanvas(ev);
    // Move only the "roots" of the selection; the store translates descendants
    // automatically so children follow their parent without double-moving.
    const idSet = new Set(ids);
    const roots = ids.filter(id => {
      let p = (store.getElement(id) || {}).parentId;
      while (p) { if (idSet.has(p)) return false; p = (store.getElement(p) || {}).parentId; }
      return !!store.getElement(id);
    });
    const group = roots.map(id => {
      const e = store.getElement(id);
      return e ? { id, x: e.x, y: e.y } : null;
    }).filter(Boolean);
    if (!group.length) return;
    this._drag = { mode: "move", group, cStart: start, historyPushed: false };
    this._addWindowListeners();
  }

  _startMarquee(ev) {
    const start = this._clientToCanvas(ev);
    this._drag = { mode: "marquee", cStart: start, sx: start.x, sy: start.y };
    const m = this.marquee;
    m.style.display = "block";
    m.style.left = start.x + "px";
    m.style.top = start.y + "px";
    m.style.width = "0px";
    m.style.height = "0px";
    this._addWindowListeners();
  }
  _drawMarquee(cur) {
    const d = this._drag;
    const x = Math.min(d.sx, cur.x), y = Math.min(d.sy, cur.y);
    const w = Math.abs(cur.x - d.sx), h = Math.abs(cur.y - d.sy);
    const m = this.marquee;
    m.style.left = x + "px";
    m.style.top = y + "px";
    m.style.width = w + "px";
    m.style.height = h + "px";
    d.rect = { x, y, w, h };
    return { x, y, w, h };
  }

  _startResize(ev, dir) {
    const id = store.state.selectedId;
    const el = store.getElement(id);
    if (!el) return;
    const start = this._clientToCanvas(ev);
    this._drag = {
      mode: "resize", id, dir,
      cStart: start,
      startLeft: el.x, startTop: el.y,
      startRight: el.x + el.width, startBottom: el.y + el.height,
      historyPushed: false,
    };
    this._addWindowListeners();
  }

  _addWindowListeners() {
    this._onMove = this._handleMove.bind(this);
    this._onUp = this._handleUp.bind(this);
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
  }
  _removeWindowListeners() {
    if (this._onMove) window.removeEventListener("pointermove", this._onMove);
    if (this._onUp) window.removeEventListener("pointerup", this._onUp);
    this._onMove = this._onUp = null;
  }

  _handleMove(ev) {
    const d = this._drag;
    if (!d) return;
    const cur = this._clientToCanvas(ev);
    if (d.mode === "move") {
      if (!d.historyPushed) { store.pushHistory(); d.historyPushed = true; }
      const sx = d.group[0].x, sy = d.group[0].y;
      let nx = sx + (cur.x - d.cStart.x);
      let ny = sy + (cur.y - d.cStart.y);
      nx = clamp(this._snap(nx), 0, store.state.width - 1);
      ny = clamp(this._snap(ny), 0, store.state.height - 1);
      const dx = nx - sx, dy = ny - sy;
      for (const g of d.group) {
        // No automatic re-parenting: moving an element never changes its
        // hierarchy. Grouping/nesting is manual (编组 button or layer drag).
        store.updateElement(g.id, { x: g.x + dx, y: g.y + dy }, { history: false });
      }
    } else if (d.mode === "marquee") {
      this._drawMarquee(cur);
    } else if (d.mode === "resize") {
      if (!d.historyPushed) { store.pushHistory(); d.historyPushed = true; }
      const dir = d.dir;
      const dx = cur.x - d.cStart.x;
      const dy = cur.y - d.cStart.y;
      let left = d.startLeft, top = d.startTop;
      let right = d.startRight, bottom = d.startBottom;
      if (dir.includes("e")) right = d.startRight + dx;
      if (dir.includes("w")) left = d.startLeft + dx;
      if (dir.includes("s")) bottom = d.startBottom + dy;
      if (dir.includes("n")) top = d.startTop + dy;
      let w = right - left, h = bottom - top;
      if (w < MIN_SIZE) { if (dir.includes("w")) left = right - MIN_SIZE; w = MIN_SIZE; }
      if (h < MIN_SIZE) { if (dir.includes("n")) top = bottom - MIN_SIZE; h = MIN_SIZE; }
      w = clamp(w, MIN_SIZE, store.state.width);
      h = clamp(h, MIN_SIZE, store.state.height);
      store.updateElement(d.id, { x: left, y: top, width: w, height: h }, { history: false });
    }
  }

  _handleUp() {
    const d = this._drag;
    if (d && d.mode === "marquee") {
      const r = d.rect;
      if (!r || (r.w < 4 && r.h < 4)) {
        store.clearSelection();
      } else {
        const ids = store.elements().filter(el => rectsIntersect(r, { x: el.x, y: el.y, w: el.width, h: el.height })).map(el => el.id);
        store.setSelection(ids);
      }
    }
    this.marquee.style.display = "none";
    this._drag = null;
    this._removeWindowListeners();
  }

  _hitTestParent(id, nx, ny) {
    const el = store.getElement(id);
    if (!el) return null;
    const cx = nx + el.width / 2;
    const cy = ny + el.height / 2;
    const desc = new Set(store._descendants(id));
    let best = null;
    let bestArea = Infinity;
    for (const c of store.elements()) {
      if (c.id === id) continue;
      if (desc.has(c.id)) continue;
      if (!getComponent(c.type).isContainer) continue;
      const r = { x: c.x, y: c.y, w: c.width, h: c.height };
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        const a = r.w * r.h;
        if (a < bestArea) { bestArea = a; best = c; }
      }
    }
    return best ? best.id : null;
  }

  // ----- select element from outside (library drop) -----
  coordsFromClient(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (cx - rect.left) / this.zoom;
    const y = (cy - rect.top) / this.zoom;
    const inside = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
    return { x, y, inside };
  }

  addAt(typeKey, canvasPos) {
    const c = getComponent(typeKey);
    const x = Math.max(0, canvasPos.x - (c.size ? c.size.width : 0) / 2);
    const y = Math.max(0, canvasPos.y - (c.size ? c.size.height : 0) / 2);
    // Inserted at the top level; nesting into a container is a manual action.
    const el = store.addElement(typeKey, { x, y });
    store.select(el.id);
    return el;
  }

  centerOnCanvasPos(canvasPos) {
    // snap-drop position helper used by library drag-drop
    return canvasPos;
  }

  requestFocus() { this.canvas.focus(); }

  nodeFor(id) { return this.nodeMap.get(id) || null; }

  previewPlay(id) {
    const node = this.nodeMap.get(id);
    const clips = store.animsOf(id);
    if (!node || !clips.length || !node.animate) return;
    node.getAnimations && node.getAnimations().forEach(a => a.cancel());
    for (const anim of clips) {
      const dur = +anim.duration || 300;
      const delay = +(anim.start || 0);
      for (const track of (anim.tracks || [])) {
        const kfs = (track.keyframes || []).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
        if (!kfs.length) continue;
        const wf = kfs.map(k => ({ [track.prop]: k.value, offset: +k.t, easing: k.ease || "ease" }));
        try { node.animate(wf, { duration: dur, delay, fill: "backwards" }); } catch (e) { /* ignore */ }
      }
    }
  }
}
