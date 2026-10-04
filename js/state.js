// state.js — project/element store with undo-redo and persistence.
import { Emitter, uid, deepClone } from "./util.js";
import { makeElement, getComponent } from "./components.js";

const LS_KEY = "webfacer.project.v1";

function newAnimClip() {
  return {
    id: uid("anim"),
    label: "动画",
    start: 0,          // ms — when it starts on the master timeline
    duration: 600,     // ms
    tracks: [
      { prop: "opacity", keyframes: [
        { t: 0, value: "0", ease: "ease" },
        { t: 1, value: "1", ease: "ease" },
      ] },
    ],
  };
}

export class Store extends Emitter {
  constructor() {
    super();
    this.project = this._emptyProject();
    this.history = [];
    this.future = [];
    this._historyLock = 0;
    this.hidden = new Set(); // transient visibility (not persisted)
    this.clip = null;        // internal clipboard for copy/paste
  }

  _emptyProject() {
    return {
      id: uid("proj"),
      name: "未命名项目",
      author: "",
      width: 1200,
      height: 800,
      zoom: 1,
      selectedId: null,
      selectedIds: [],
      canvasBg: "#ffffff",
      showGrid: false,
      logic: [],
      elements: [],
    };
  }

  get state() { return this.project; }

  // ----- event-safe mutation -----
  _emit(reason) { this.emit("change", reason); }

  // ------ history ------
  pushHistory() {
    if (this._historyLock > 0) return;
    this.history.push(this._snapshot());
    if (this.history.length > 200) this.history.shift();
    this.future = [];
  }
  _snapshot() {
    const p = this.project;
    return {
      name: p.name, width: p.width, height: p.height,
      canvasBg: p.canvasBg, showGrid: p.showGrid,
      logic: deepClone(p.logic || []),
      elements: deepClone(p.elements),
    };
  }
  _restore(snap) {
    const p = this.project;
    p.name = snap.name;
    p.width = snap.width;
    p.height = snap.height;
    p.canvasBg = snap.canvasBg;
    p.showGrid = snap.showGrid;
    p.logic = snap.logic || [];
    p.elements = snap.elements;
    // drop selection if removed
    if (p.selectedId && !this._findAny(p.selectedId)) { p.selectedId = null; p.selectedIds = []; }
    p.selectedIds = (p.selectedIds || []).filter(id => this._findAny(id));
  }
  get canUndo() { return this.history.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo() {
    if (!this.canUndo) return;
    this.future.push(this._snapshot());
    this._restore(this.history.pop());
    this._emit({ type: "structure" });
    this._emit({ type: "selection" });
  }
  redo() {
    if (!this.canRedo) return;
    this.history.push(this._snapshot());
    this._restore(this.future.pop());
    this._emit({ type: "structure" });
    this._emit({ type: "selection" });
  }

  // ------ element queries ------
  isHidden(id) { return this.hidden.has(id); }
  toggleHidden(id) {
    // hiding a parent hides its whole subtree, so children "follow" it
    const ids = [id, ...this._descendants(id)];
    const hide = !this.hidden.has(id);
    for (const i of ids) { if (hide) this.hidden.add(i); else this.hidden.delete(i); }
    for (const i of ids) this._emit({ type: "update", id: i });
  }
  setLockedTree(id, locked) {
    // locking a parent locks its subtree
    const ids = [id, ...this._descendants(id)];
    this.updateMany(ids, { locked: !!locked });
  }
  elements() { return this.project.elements; }
  getElement(id) { return this.project.elements.find(e => e.id === id) || null; }
  _findAny(id) {
    return this.project.elements.find(e => e.id === id) || null;
  }
  childrenOf(id) { return this.project.elements.filter(e => e.parentId === id); }
  _descendants(id) {
    const out = [];
    const walk = (pid) => {
      this.project.elements.forEach(e => {
        if (e.parentId === pid) { out.push(e.id); walk(e.id); }
      });
    };
    walk(id);
    return out;
  }

  // ------ selection ------
  select(id) {
    if (!this._findAny(id)) return;
    this.project.selectedId = id;
    this.project.selectedIds = [id];
    this._emit({ type: "selection", id });
  }
  addToSelection(id) {
    if (!this._findAny(id)) return;
    const ids = this.project.selectedIds;
    if (!ids.includes(id)) ids.push(id);
    this.project.selectedId = id;
    this._emit({ type: "selection" });
  }
  toggleSelect(id) {
    if (!this._findAny(id)) return;
    const ids = this.project.selectedIds;
    if (ids.includes(id)) ids.splice(ids.indexOf(id), 1);
    else ids.push(id);
    this.project.selectedId = ids.length ? ids[ids.length - 1] : null;
    this._emit({ type: "selection" });
  }
  setSelection(ids) {
    this.project.selectedIds = ids.filter(id => this._findAny(id));
    this.project.selectedId = this.project.selectedIds.length ? this.project.selectedIds[this.project.selectedIds.length - 1] : null;
    this._emit({ type: "selection" });
  }
  clearSelection() {
    if (this.project.selectedId == null && this.project.selectedIds.length === 0) return;
    this.project.selectedId = null;
    this.project.selectedIds = [];
    this._emit({ type: "selection", id: null });
  }
  isSelected(id) { return this.project.selectedIds.includes(id); }
  selected() { return this.project.selectedIds.slice(); }
  get multiSelected() { return this.project.selectedIds.length > 1; }

  // ------ mutations ------
  addElement(typeKey, opts = {}) {
    this.pushHistory();
    const el = makeElement(typeKey, opts);
    el.id = uid(el.type);
    if (opts.name) el.name = opts.name;
    // default position: keep within canvas, offset to avoid stacking
    const placed = this._placement(el, opts);
    el.x = placed.x; el.y = placed.y;
    if (opts.parentId) el.parentId = opts.parentId;
    this.project.elements.push(el);
    this._emit({ type: "add", id: el.id });
    return el;
  }

  _placement(el, opts) {
    let x = opts.x, y = opts.y;
    if (x == null || y == null) {
      const base = this.project.elements.filter(e => !e.parentId).length % 8;
      x = 60 + (base * 24);
      y = 60 + (base * 24);
    }
    return { x, y };
  }

  updateElement(id, patch, opts = {}) {
    const el = this.getElement(id);
    if (!el) return;
    if (opts.history !== false && this._historyLock === 0) this.pushHistory();
    const { props, ...rest } = patch;
    let moved = [];
    if (rest.x != null || rest.y != null) {
      const nx = rest.x != null ? rest.x : el.x;
      const ny = rest.y != null ? rest.y : el.y;
      delete rest.x; delete rest.y;
      Object.assign(el, rest);
      moved = this._translateWithDescendants(id, nx, ny);
    } else {
      Object.assign(el, rest);
    }
    if (props) Object.assign(el.props, props);
    this._emit({ type: "update", id });
    for (const mid of moved) this._emit({ type: "update", id: mid });
  }

  // Move an element to (x,y) and translate all of its descendants by the same
  // delta, so children keep their original offset but follow the parent.
  _translateWithDescendants(id, x, y) {
    const el = this.getElement(id);
    if (!el) return [];
    const dx = x - el.x, dy = y - el.y;
    el.x = x; el.y = y;
    const moved = [];
    if (dx || dy) {
      for (const did of this._descendants(id)) {
        const d = this.getElement(did);
        if (d) { d.x += dx; d.y += dy; moved.push(did); }
      }
    }
    return moved;
  }

  removeElement(id) {
    const el = this.getElement(id);
    if (!el) return;
    this.pushHistory();
    const ids = new Set([id, ...this._descendants(id)]);
    this.project.elements = this.project.elements.filter(e => !ids.has(e.id));
    this.project.logic = (this.project.logic || []).filter(l => !ids.has(l.triggerId) && !ids.has(l.targetId));
    this.project.selectedIds = this.project.selectedIds.filter(sid => !ids.has(sid));
    if (this.project.selectedId && ids.has(this.project.selectedId)) this.project.selectedId = null;
    this._emit({ type: "remove", id });
    this._emit({ type: "selection" });
    this._emit({ type: "logic" });
  }

  updateMany(ids, patch, opts = {}) {
    const list = [...new Set(ids)].map(id => this.getElement(id)).filter(Boolean);
    if (!list.length) return;
    if (opts.history !== false && this._historyLock === 0) this.pushHistory();
    const hasPos = patch.x != null || patch.y != null;
    for (const el of list) {
      if (hasPos) {
        const nx = patch.x != null ? patch.x : el.x;
        const ny = patch.y != null ? patch.y : el.y;
        this._translateWithDescendants(el.id, nx, ny);
      }
      if (patch.width != null) el.width = patch.width;
      if (patch.height != null) el.height = patch.height;
      if (patch.name != null) el.name = patch.name;
      if (patch.content != null) el.content = patch.content;
      if (patch.locked != null) el.locked = !!patch.locked;
      if (patch.props) Object.assign(el.props, patch.props);
    }
    this._emit({ type: "update-many" });
  }

  duplicateElement(id) {
    const src = this.getElement(id);
    if (!src) return;
    this.pushHistory();
    const clone = deepClone(src);
    clone.id = uid(src.type);
    clone.name = src.name + " 副本";
    clone.x = src.x + 24;
    clone.y = src.y + 24;
    this.project.elements.push(clone);
    // clone descendants too (simple: same parent)
    this.project.elements.forEach(e => {
      if (src.parentId && e.id !== clone.id && e.parentId === src.parentId) { /* no-op */ }
    });
    this._emit({ type: "add", id: clone.id });
    return clone;
  }

  // scale all elements (canvas resize)
  resizeCanvas(width, height) {
    this.pushHistory();
    this.project.width = width;
    this.project.height = height;
    this._emit({ type: "resize-canvas" });
  }

  setZoom(z) {
    this.project.zoom = Math.max(0.1, Math.min(4, Number(z) || 1));
    this._emit({ type: "zoom" });
  }
  setProjectName(name) {
    this.project.name = name;
    this._emit({ type: "meta" });
  }
  setAuthor(author) {
    this.project.author = author || "";
    this._emit({ type: "meta" });
  }

  setCanvasBg(color) {
    this.pushHistory();
    this.project.canvasBg = color || "#ffffff";
    this._emit({ type: "canvas" });
  }
  toggleGrid() {
    this.pushHistory();
    this.project.showGrid = !this.project.showGrid;
    this._emit({ type: "canvas" });
  }

  // ----- alignment (single element relative to canvas) -----
  alignElement(id, which) {
    const el = this.getElement(id);
    if (!el) return;
    this.pushHistory();
    const W = this.project.width, H = this.project.height;
    const w = el.width, h = el.height;
    let nx = el.x, ny = el.y;
    switch (which) {
      case "left": nx = 0; break;
      case "center-x": nx = (W - w) / 2; break;
      case "right": nx = W - w; break;
      case "top": ny = 0; break;
      case "center-y": ny = (H - h) / 2; break;
      case "bottom": ny = H - h; break;
      default: break;
    }
    const moved = this._translateWithDescendants(id, nx, ny);
    this._emit({ type: "update", id });
    for (const mid of moved) this._emit({ type: "update", id: mid });
  }

  // ----- z-order (later in array = rendered on top) -----
  moveZ(id, dir) {
    const arr = this.project.elements;
    const i = arr.findIndex(e => e.id === id);
    if (i < 0) return;
    this.pushHistory();
    const [el] = arr.splice(i, 1);
    let j = i;
    if (dir === "front") j = arr.length;
    else if (dir === "back") j = 0;
    else if (dir === "up") j = Math.min(arr.length, i + 1);
    else if (dir === "down") j = Math.max(0, i - 1);
    arr.splice(j, 0, el);
    this._emit({ type: "structure" });
  }

  // ----- hierarchy: reparent / indent / outdent / reorder -----
  isContainer(id) {
    const el = this.getElement(id);
    return !!el && getComponent(el.type).isContainer;
  }
  setParent(id, parentId) {
    const el = this.getElement(id);
    if (!el) return false;
    if (parentId) {
      if (parentId === id) return false;
      const p = this.getElement(parentId);
      if (!p || !getComponent(p.type).isContainer) return false;
      if (this._descendants(id).includes(parentId)) return false; // prevent cycles
    }
    const changed = (el.parentId || null) !== (parentId || null);
    if (!changed && !parentId) return true;
    this.pushHistory();
    el.parentId = parentId || null;
    // Keep children drawn ON TOP of their parent (and the subtree contiguous),
    // so nesting immediately shows a visible change on the canvas.
    if (parentId) this._placeSubtreeAfterParent(id);
    this._emit({ type: "structure" });
    return true;
  }
  _placeSubtreeAfterParent(id) {
    const el = this.getElement(id);
    if (!el || !el.parentId) return;
    const arr = this.project.elements;
    const ids = [id, ...this._descendants(id)];
    const moved = ids.map(i => arr.find(e => e.id === i)).filter(Boolean);
    for (const m of moved) { const k = arr.indexOf(m); if (k >= 0) arr.splice(k, 1); }
    const pIdx = arr.findIndex(e => e.id === el.parentId);
    const at = pIdx < 0 ? arr.length : pIdx + 1;
    arr.splice(at, 0, ...moved);
  }
  // move `id` to sit next to `refId` in the element array (z-order + sibling order)
  reorderRelative(id, refId, after) {
    if (id === refId) return;
    const arr = this.project.elements;
    const i = arr.findIndex(e => e.id === id);
    if (i < 0) return;
    this.pushHistory();
    const [el] = arr.splice(i, 1);
    let j = arr.findIndex(e => e.id === refId);
    if (j < 0) arr.push(el);
    else { if (after) j += 1; arr.splice(j, 0, el); }
    this._emit({ type: "structure" });
  }
  indentElement(id) {
    const el = this.getElement(id);
    if (!el) return false;
    const sibs = this.project.elements.filter(e => (e.parentId || null) === (el.parentId || null));
    const i = sibs.findIndex(e => e.id === id);
    for (let j = i - 1; j >= 0; j--) {
      if (getComponent(sibs[j].type).isContainer) return this.setParent(id, sibs[j].id);
    }
    return false;
  }
  outdentElement(id) {
    const el = this.getElement(id);
    if (!el || !el.parentId) return false;
    const p = this.getElement(el.parentId);
    return this.setParent(id, p ? (p.parentId || null) : null);
  }

  // ----- grouping -----
  // Wraps only the OUTERMOST selected elements, so existing inner nesting is
  // preserved (grouping once adds exactly one level).
  groupElements(ids) {
    const set = new Set(ids);
    const roots = ids.filter(id => {
      let p = (this.getElement(id) || {}).parentId;
      while (p) { if (set.has(p)) return false; p = (this.getElement(p) || {}).parentId; }
      return !!this.getElement(id);
    });
    const list = roots.map(i => this.getElement(i)).filter(Boolean);
    if (!list.length) return null;
    if (list.length === 1 && [...new Set(ids)].length < 2) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const e of list) {
      x1 = Math.min(x1, e.x); y1 = Math.min(y1, e.y);
      x2 = Math.max(x2, e.x + e.width); y2 = Math.max(y2, e.y + e.height);
    }
    this.pushHistory();
    const g = makeElement("group", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, name: "编组" });
    g.id = uid("group");
    g.parentId = list[0].parentId || null;
    // insert behind the grouped elements (lowest index) so children stay on top
    const arr = this.project.elements;
    let minIdx = arr.length;
    for (const e of list) minIdx = Math.min(minIdx, arr.findIndex(x => x.id === e.id));
    arr.splice(minIdx < 0 ? arr.length : minIdx, 0, g);
    for (const e of list) e.parentId = g.id;
    this._emit({ type: "structure" });
    this.setSelection([g.id]);
    return g;
  }
  // Dissolve a group: children move up to the group's parent.
  // opts.keepSelf = true keeps the container element itself (just elevates children).
  ungroupElement(id, opts = {}) {
    const g = this.getElement(id);
    if (!g) return;
    const keepSelf = !!opts.keepSelf;
    const kids = this.childrenOf(id);
    this.pushHistory();
    for (const k of kids) k.parentId = g.parentId || null;
    if (!keepSelf) {
      this.project.elements = this.project.elements.filter(e => e.id !== id);
      this.project.logic = (this.project.logic || []).filter(l => l.triggerId !== id && l.targetId !== id);
      this.project.selectedIds = this.project.selectedIds.filter(s => s !== id);
      if (!this.project.selectedIds.length) this.project.selectedId = null;
    }
    this._emit({ type: "structure" });
    if (!keepSelf) this._emit({ type: "logic" });
    this._emit({ type: "selection" });
    if (!keepSelf && kids.length) this.setSelection(kids.map(k => k.id));
  }

  setLocked(id, locked) {
    const el = this.getElement(id);
    if (!el) return;
    this.updateElement(id, { locked: !!locked });
  }

  // ----- animation clips (each element can have MULTIPLE clips at different times) -----
  animsOf(id) {
    const el = this.getElement(id);
    return (el && Array.isArray(el.anims)) ? el.anims : [];
  }
  getAnim(id, clipId) {
    return this.animsOf(id).find(a => a.id === clipId) || null;
  }
  addAnim(id, clip) {
    const el = this.getElement(id);
    if (!el) return null;
    this.pushHistory();
    if (!Array.isArray(el.anims)) el.anims = [];
    const c = Object.assign(newAnimClip(), clip, {
      id: (clip && clip.id) || uid("anim"),
      start: (clip && clip.start) != null ? clip.start : 0,
      duration: (clip && clip.duration) || 600,
      label: (clip && clip.label) || "动画",
    });
    el.anims.push(c);
    this._emit({ type: "update", id });
    return c;
  }
  updateAnim(id, clipId, patch = {}) {
    const a = this.getAnim(id, clipId);
    if (!a) return;
    this.pushHistory();
    if (patch.start != null) a.start = patch.start;
    if (patch.duration != null) a.duration = patch.duration;
    if (patch.label != null) a.label = patch.label;
    if (patch.tracks) a.tracks = patch.tracks;
    this._emit({ type: "update", id });
  }
  removeAnim(id, clipId) {
    const el = this.getElement(id);
    if (!el || !Array.isArray(el.anims)) return;
    this.pushHistory();
    el.anims = el.anims.filter(a => a.id !== clipId);
    this._emit({ type: "update", id });
  }
  clearProjectAnimations() {
    for (const e of this.project.elements) e.anims = [];
    this._emit({ type: "structure" });
  }

  // ----- click logic (trigger element -> animate target) -----
  logicEdges() { return this.project.logic || []; }
  logicFor(targetId) { return (this.project.logic || []).filter(l => l.targetId === targetId); }
  hasLogic(triggerId, targetId) {
    return (this.project.logic || []).some(l => l.triggerId === triggerId && l.targetId === targetId);
  }
  addLogicEdge(triggerId, targetId) {
    if (!this._findAny(triggerId) || !this._findAny(targetId)) return null;
    if (this.hasLogic(triggerId, targetId)) return null;
    this.pushHistory();
    if (!this.project.logic) this.project.logic = [];
    const edge = { id: uid("lg"), triggerId, targetId };
    this.project.logic.push(edge);
    this._emit({ type: "logic" });
    return edge;
  }
  removeLogicEdge(edgeId) {
    if (!(this.project.logic || []).some(l => l.id === edgeId)) return;
    this.pushHistory();
    this.project.logic = (this.project.logic || []).filter(l => l.id !== edgeId);
    this._emit({ type: "logic" });
  }

  // ----- copy / paste (internal clipboard) -----
  copyElement(id) {
    const el = this.getElement(id);
    if (!el) return null;
    this.clip = deepClone(el);
    this._emit({ type: "clipboard" });
    return this.clip;
  }
  get canPaste() { return !!this.clip; }
  pasteElement() {
    if (!this.clip) return null;
    this.pushHistory();
    const clone = deepClone(this.clip);
    clone.id = uid(clone.type);
    clone.name = (this.clip.name || this.clip.type) + " 副本";
    clone.x = (this.clip.x || 60) + 24;
    clone.y = (this.clip.y || 60) + 24;
    clone.parentId = null;
    this.project.elements.push(clone);
    this._emit({ type: "add", id: clone.id });
    return clone;
  }

  // ------ persistence ------
  toJSON() {
    const p = this.project;
    return {
      version: 1,
      project: {
        id: p.id, name: p.name, author: p.author || "", width: p.width, height: p.height, zoom: p.zoom,
        canvasBg: p.canvasBg, showGrid: p.showGrid,
        logic: p.logic || [],
        elements: p.elements,
      },
    };
  }
  saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.toJSON())); return true; }
    catch (e) { console.warn("save failed", e); return false; }
  }
  loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.project) return null;
      this.loadProject(data.project);
      return this.project;
    } catch (e) { console.warn("load failed", e); return null; }
  }
  loadProject(p) {
    this.project = {
      id: p.id || uid("proj"),
      name: p.name || "未命名项目",
      author: p.author || "",
      width: p.width || 1200,
      height: p.height || 800,
      zoom: p.zoom || 1,
      selectedId: null,
      selectedIds: [],
      canvasBg: p.canvasBg || "#ffffff",
      showGrid: p.showGrid === true,
      logic: Array.isArray(p.logic) ? p.logic : [],
      elements: Array.isArray(p.elements) ? p.elements : [],
    };
    this.history = [];
    this.future = [];
    this._emit({ type: "structure" });
    this._emit({ type: "selection" });
    this._emit({ type: "zoom" });
  }
  newProject(opts = {}) {
    const p = this.project;
    const old = deepClone({ id: p.id, name: p.name, width: p.width, height: p.height, elements: p.elements });
    this.history.push(old);
    this.future = [];
    this.project = this._emptyProject();
    this.project.name = opts.name || "未命名项目";
    this.project.width = opts.width || 1200;
    this.project.height = opts.height || 800;
    this.project.id = uid("proj");
    this._emit({ type: "structure" });
    this._emit({ type: "selection" });
    this._emit({ type: "meta" });
    this._emit({ type: "zoom" });
  }
}

export const store = new Store();
