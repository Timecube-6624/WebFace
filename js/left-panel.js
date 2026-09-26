// left-panel.js — library (draggable components) + layers tree.
import { store } from "./state.js";
import { COMPONENTS, LIBRARY_ORDER, getComponent } from "./components.js";
import { showDragGhost, moveDragGhost, hideDragGhost } from "./util.js";

export class LeftPanel {
  constructor(refs, canvas) {
    this.body = refs.body;
    this.canvas = canvas;
    this.tabs = [...document.querySelectorAll("#left-tabs .panel-tab")];
    this.activeTab = "library";
    this._bindTabs();
    this._bindStore();
    this._setTab("library");
  }

  _bindTabs() {
    this.tabs.forEach(tab => {
      tab.addEventListener("click", () => this._setTab(tab.dataset.tab));
    });
  }
  _setTab(name) {
    this.activeTab = name;
    this.tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    if (name === "library") this._renderLibrary();
    else this._renderLayers();
  }

  _bindStore() {
    store.on("change", (reason) => {
      if (this.activeTab === "layers") this._renderLayers();
      if (this.activeTab === "library" && (reason.type === "add" || reason.type === "remove" || reason.type === "structure")) {
        // library grid static; no re-render needed
      }
    });
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
      item.appendChild(thumb);
      item.appendChild(name);
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
      const move = (e) => {
        moveDragGhost(ghost, e);
        // highlight drop target
      };
      const up = (e) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        hideDragGhost(ghost);
        ghost = null;
        const pos = this.canvas.coordsFromClient(e.clientX, e.clientY);
        if (pos.inside) {
          this.canvas.addAt(typeKey, pos);
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  // ----- Layers tree -----
  _renderLayers() {
    this.body.textContent = "";
    const root = document.createElement("div");
    root.className = "layers";
    const els = store.elements();
    const childrenOf = (pid) => els.filter(e => e.parentId === pid);

    const walk = (pid, parentEl) => {
      for (const el of els.filter(e => e.parentId === pid)) {
        const row = document.createElement("div");
        row.className = "layer-row" + (store.state.selectedId === el.id ? " sel" : "");
        row.dataset.id = el.id;

        const tog = document.createElement("span");
        tog.className = "tog";
        tog.textContent = store.isHidden(el.id) ? "●" : "◐";
        tog.title = "显示/隐藏";
        tog.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); });
        tog.addEventListener("click", (ev) => { ev.stopPropagation(); store.toggleHidden(el.id); });

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = getComponent(el.type).icon;

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = el.name;

        const type = document.createElement("span");
        type.className = "type";
        type.textContent = el.type;

        row.appendChild(tog);
        row.appendChild(icon);
        row.appendChild(name);
        row.appendChild(type);

        row.addEventListener("click", () => store.select(el.id));
        parentEl.appendChild(row);

        const kids = childrenOf(el.id);
        if (kids.length) {
          const childBox = document.createElement("div");
          childBox.className = "layer-children";
          walk(el.id, childBox);
          parentEl.appendChild(childBox);
        }
      }
    };

    walk(null, root);
    this.body.appendChild(root);
  }
}
