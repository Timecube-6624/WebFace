// left-panel.js — library (draggable components) + layers tree with
// hierarchy editing: drag to re-parent / reorder, group & ungroup.
import { store } from "./state.js";
import { COMPONENTS, LIBRARY_ORDER, getComponent } from "./components.js";
import { showDragGhost, moveDragGhost, hideDragGhost } from "./util.js";

export class LeftPanel {
  constructor(refs, canvas) {
    this.body = refs.body;
    this.canvas = canvas;
    this.tabs = [...document.querySelectorAll("#left-tabs .panel-tab")];
    this.activeTab = "library";
    this.collapsed = new Set(); // layer ids whose children are hidden
    this._bindTabs();
    this._bindStore();
    this._setTab("library");
  }

  _bindTabs() {
    this.tabs.forEach(tab => tab.addEventListener("click", () => this._setTab(tab.dataset.tab)));
  }
  _setTab(name) {
    this.activeTab = name;
    this.tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    if (name === "library") this._renderLibrary();
    else this._renderLayers();
  }
  _bindStore() {
    store.on("change", () => { if (this.activeTab === "layers") this._renderLayers(); });
  }

  // ----- Library grid -----
  _renderLibrary() {
    const grid = document.createElement("div");
    grid.className = "library-grid";
    this.body.textContent = "";
    for (const key of LIBRARY_ORDER) {
      const c = COMPONENTS[key];
      if (!c) continue;
      const item = document.createElement("div");
      item.className = "lib-item";
      item.dataset.type = key;
      item.title = `拖到画布添加「${c.label}」`;
      const thumb = document.createElement("div");
      thumb.className = "lib-thumb";
      thumb.textContent = c.icon;
      const name = document.createElement("div");
      name.className = "lib-name";
      name.textContent = c.label;
      item.appendChild(thumb); item.appendChild(name);
      this._makeDraggable(item, key);
      grid.appendChild(item);
    }
    this.body.appendChild(grid);
  }

  _makeDraggable(item, typeKey) {
    let ghost = null;
    item.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const c = getComponent(typeKey);
      ghost = showDragGhost(`＋ ${c.label}`, ev);
      const move = (e) => moveDragGhost(ghost, e);
      const up = (e) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        hideDragGhost(ghost); ghost = null;
        const pos = this.canvas.coordsFromClient(e.clientX, e.clientY);
        if (pos.inside) this.canvas.addAt(typeKey, pos);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  // ----- Layers tree -----
  _renderLayers() {
    this.body.textContent = "";
    const sel = store.selected();
    const bar = document.createElement("div");
    bar.className = "layers-bar";
    const mk = (label, title, fn, disabled) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-outlined btn-sm"; b.textContent = label; b.title = title;
      if (disabled) b.disabled = true;
      b.addEventListener("click", fn);
      return b;
    };
    bar.appendChild(mk("编组", "把选中的多个元素编成一组", () => {
      const g = store.groupElements(store.selected());
      if (g) toast("已编组（只新增一层，保留内部嵌套）"); else toast("请至少选中 2 个元素", false);
    }, sel.length < 2));
    bar.appendChild(mk("取消编组", "解散选中的编组（▣），子级会提升到上一级（不会删除）", () => {
      const ids = store.selected().filter(id => { const e = store.getElement(id); return e && e.type === "group"; });
      if (!ids.length) { toast("请先选中一个编组（▣）", false); return; }
      ids.forEach(id => store.ungroupElement(id));
      toast("已取消编组（子级已提升，未删除）");
    }, !sel.some(id => (store.getElement(id) || {}).type === "group")));
    this.body.appendChild(bar);

    const root = document.createElement("div");
    root.className = "layers";
    const els = store.elements();
    const walk = (pid, parentEl, depth) => {
      for (const el of els.filter(e => (e.parentId || null) === pid)) {
        const kids = els.filter(e => e.parentId === el.id);
        const isCont = getComponent(el.type).isContainer;
        const row = document.createElement("div");
        row.className = "layer-row" + (store.isSelected(el.id) ? " sel" : "");
        row.dataset.id = el.id;

        const tog = document.createElement("span");
        tog.className = "tog";
        if (kids.length) {
          tog.textContent = this.collapsed.has(el.id) ? "▸" : "▾";
          tog.addEventListener("pointerdown", (e) => e.stopPropagation());
          tog.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.collapsed.has(el.id)) this.collapsed.delete(el.id); else this.collapsed.add(el.id);
            this._renderLayers();
          });
        } else { tog.textContent = ""; tog.style.width = "12px"; }

        const handle = document.createElement("span");
        handle.className = "drag";
        handle.textContent = "⠿";
        handle.title = "拖动可调整层级 / 顺序";
        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = getComponent(el.type).icon;
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = el.name;
        const type = document.createElement("span");
        type.className = "type";
        type.textContent = el.type;
        const vis = document.createElement("span");
        vis.className = "tog";
        vis.textContent = store.isHidden(el.id) ? "◌" : "◉";
        vis.title = "显示/隐藏";
        vis.addEventListener("pointerdown", (e) => e.stopPropagation());
        vis.addEventListener("click", (e) => { e.stopPropagation(); store.toggleHidden(el.id); });

        row.appendChild(tog); row.appendChild(handle); row.appendChild(icon);
        row.appendChild(name); row.appendChild(type);
        if (isCont && kids.length) {
          const count = document.createElement("span");
          count.className = "count";
          count.textContent = kids.length;
          count.title = `包含 ${kids.length} 个子级`;
          row.appendChild(count);
        }
        row.appendChild(vis);
        if (isCont) row.classList.add("is-group");

        row.addEventListener("click", () => store.select(el.id));
        row.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); store.select(el.id); this._layerMenu(el.id, e.clientX, e.clientY); });
        this._makeLayerDrag(row, el.id);
        parentEl.appendChild(row);

        if (kids.length && !this.collapsed.has(el.id)) {
          const box = document.createElement("div");
          box.className = "layer-children";
          walk(el.id, box, depth + 1);
          parentEl.appendChild(box);
        }
      }
    };
    walk(null, root, 0);
    this.body.appendChild(root);
  }

  _makeLayerDrag(row, id) {
    row.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".tog")) return;
      const startX = ev.clientX, startY = ev.clientY;
      let dragging = false;
      const move = (e) => {
        if (!dragging) {
          if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 5) return;
          dragging = true;
          row.classList.add("dragging");
        }
        this._hlDrop(e);
      };
      const up = (e) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        row.classList.remove("dragging");
        this._clearDrop();
        if (dragging) this._applyDrop(id, e);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
  _hlDrop(ev) {
    this._clearDrop();
    const t = this._dropTarget(ev);
    if (t && t.row) t.row.classList.add(t.mode === "into" ? "drop-into" : "drop-line");
  }
  _clearDrop() {
    this.body.querySelectorAll(".drop-into,.drop-line").forEach(n => n.classList.remove("drop-into", "drop-line"));
  }
  _dropTarget(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return null;
    const row = el.closest(".layer-row");
    if (!row) return { row: null, mode: "root" };
    const targetId = row.dataset.id;
    const rect = row.getBoundingClientRect();
    const rel = (ev.clientY - rect.top) / rect.height;
    if (store.isContainer(targetId) && rel > 0.3 && rel < 0.7) return { row, targetId, mode: "into" };
    return { row, targetId, mode: rel < 0.5 ? "before" : "after" };
  }
  _applyDrop(id, ev) {
    const t = this._dropTarget(ev);
    if (!t) return;
    if (!t.targetId) { store.setParent(id, null); toast("已移到顶层"); return; }
    if (t.targetId === id) return;
    const target = store.getElement(t.targetId);
    if (!target) return;
    if (t.mode === "into") { store.setParent(id, t.targetId); toast(`已放入「${target.name}」`); return; }
    if (!store.setParent(id, target.parentId || null)) return;
    store.reorderRelative(id, t.targetId, t.mode === "after");
    toast(t.mode === "after" ? "已移到该层之后" : "已移到该层之前");
  }

  _layerMenu(id, x, y) {
    const old = document.querySelector(".ctx-menu");
    if (old) old.remove();
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    const add = (icon, label, disabled, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ctx-item"; b.disabled = !!disabled;
      b.innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>`;
      b.addEventListener("click", () => { menu.remove(); fn(); });
      menu.appendChild(b);
    };
    const el = store.getElement(id);
    const isCont = el && getComponent(el.type).isContainer;
    add("▣", "编组所选", store.selected().length < 2, () => {
      const g = store.groupElements(store.selected());
      if (g) toast("已编组（只新增一层，保留内部嵌套）"); else toast("请至少选中 2 个元素", false);
    });
    add("▢", "取消编组（子级提升）", el.type !== "group", () => { store.ungroupElement(id); toast("已取消编组（子级已提升，未删除）"); });
    add("⇞", "提升子级（保留容器）", !(isCont && store.childrenOf(id).length), () => { store.ungroupElement(id, { keepSelf: true }); toast("已把子级提升到上一级"); });
    add("⇥", "缩进（降为上一同级容器的子级）", false, () => { if (!store.indentElement(id)) toast("找不到可作为父级的容器", false); });
    add("⇤", "取消缩进（提升一级）", !el.parentId, () => store.outdentElement(id));
    add("⬆", "上移一层", false, () => store.moveZ(id, "up"));
    add("⬇", "下移一层", false, () => store.moveZ(id, "down"));
    add("🗑", "删除", false, () => store.removeElement(id));
    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
    menu.style.visibility = "visible";
    const close = (e2) => { if (!menu.contains(e2.target)) { menu.remove(); document.removeEventListener("pointerdown", close); } };
    setTimeout(() => document.addEventListener("pointerdown", close), 0);
  }
}

function toast(text, ok = true) {
  window.dispatchEvent(new CustomEvent("webfacer:toast", { detail: { text, ok } }));
}
