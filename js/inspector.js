// inspector.js — right-hand style editor, grouped by category.
import { store } from "./state.js";
import { getComponent } from "./components.js";

const SWATCHES = [
  "#ffffff", "#e5e7eb", "#111827", "#374151", "#6b7280",
  "#4f8cff", "#0ea5e9", "#10b981", "#f59e0b", "#f2635f",
  "#a855f7", "#ec4899", "#14b8a6", "#facc15", "#000000",
];

function parseLen(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function toHex(v) {
  if (!v || String(v) === "transparent") return "#ffffff";
  const c = String(v).trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map(x => x + x).join("");
  return "#ffffff";
}

export class Inspector {
  constructor(el) {
    this.el = el;
    this._sel = null;
    this._bindStore();
    this.render();
  }
  _bindStore() {
    store.on("change", (r) => {
      if (r.type === "selection" || r.type === "structure" || r.type === "remove") {
        this.render();
      } else if (r.type === "update" && store.state.selectedId === r.id) {
        // don't rebuild on every keystroke; update header name label only
        this._syncHeaderName();
      }
    });
  }
  _syncHeaderName() {
    const input = this.el.querySelector(".insp-name");
    const el = store.getElement(this._sel);
    if (el && input && document.activeElement !== input) input.value = el.name;
  }

  _selected() {
    return store.getElement(store.state.selectedId);
  }

  render() {
    this.el.textContent = "";
    const el = this._selected();
    this._sel = el ? el.id : null;
    this._ids = store.selected();
    if (!this._ids.length && el) this._ids = [el.id];
    if (!el) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = "<strong>未选中元素</strong><small>点击画布上的元素，或从左侧<br>拖入一个组件开始编辑</small>";
      this.el.appendChild(empty);
      return;
    }

    // header
    const multi = this._ids.length > 1;
    const head = document.createElement("div");
    head.className = "insp-head";
    const name = document.createElement("input");
    name.className = "insp-name";
    name.value = multi ? `已选 ${this._ids.length} 个元素` : el.name;
    name.spellcheck = false;
    if (multi) { name.readOnly = true; name.title = "多选时，下方样式修改将应用到全部选中元素"; }
    name.addEventListener("change", () => {
      if (multi) return;
      store.pushHistory();
      store.updateElement(el.id, { name: name.value.trim() || el.name }, { history: false });
    });
    const meta = document.createElement("div");
    meta.className = "insp-meta";
    meta.innerHTML = multi
      ? `<span class="chip">多选 ${this._ids.length}</span><span class="chip">修改将应用到全部</span>`
      : `<span class="chip">${el.type}</span><span class="chip">${Math.round(el.width)}×${Math.round(el.height)}</span>`;
    head.appendChild(name);
    head.appendChild(meta);
    this.el.appendChild(head);

    // groups
    const groups = this._buildGroups(el);
    for (const g of groups) {
      this.el.appendChild(this._group(g));
    }
  }

  // ----- schema -----
  _buildGroups(el) {
    const isContainer = getComponent(el.type).isContainer;
    const groups = [];

    groups.push({ title: "位置与尺寸", closed: false, fields: [
      this._field("x", "X", "number", "meta", { min: -5000, max: 8000, step: 1 }),
      this._field("y", "Y", "number", "meta", { min: -5000, max: 8000, step: 1 }),
      this._field("width", "宽 W", "number", "meta", { min: 8, max: 8000, step: 1 }),
      this._field("height", "高 H", "number", "meta", { min: 8, max: 8000, step: 1 }),
    ]});

    groups.push({ title: "排版", closed: false, fields: [
      this._field("font-family", "字体", "text", "prop", { ph: "inherit / 字体名" }),
      this._field("font-size", "字号", "number", "prop", { unit: "px", min: 1, max: 400, step: 1 }),
      this._field("font-weight", "字重", "select", "prop", { options: [
        ["300", "300 · 细"], ["400", "400 · 常规"], ["500", "500 · 中"], ["600", "600 · 半粗"], ["700", "700 · 粗"], ["800", "800 · 超粗"],
      ] }),
      this._field("color", "文字颜色", "color", "prop"),
      this._field("line-height", "行高", "number", "prop", { min: 0.5, max: 8, step: 0.1 }),
      this._field("text-align", "对齐", "seg", "prop", { options: [["left", "左"], ["center", "中"], ["right", "右"]] }),
      this._field("letter-spacing", "字间距", "number", "prop", { unit: "px", min: -10, max: 100, step: 1 }),
      this._field("text-decoration", "装饰", "seg", "prop", { options: [["none", "无"], ["underline", "下划线"], ["line-through", "删除线"]] }),
    ]});

    groups.push({ title: "背景", closed: false, fields: [
      this._field("background-color", "背景色", "color", "prop"),
      this._field("background-image", "图片/渐变", "text", "prop", { ph: "linear-gradient(...) 或 url(...)" }),
    ]});

    groups.push({ title: "边框", closed: false, fields: [
      this._field("border-width", "描边", "number", "prop", { unit: "px", min: 0, max: 60, step: 1 }),
      this._field("border-style", "线型", "select", "prop", { options: [
        ["none", "无"], ["solid", "实线"], ["dashed", "虚线"], ["dotted", "点线"],
      ] }),
      this._field("border-color", "描边色", "color", "prop"),
      this._field("border-radius", "圆角", "number", "prop", { unit: "px", min: 0, max: 1000, step: 1 }),
    ]});

    groups.push({ title: "间距", closed: false, fields: [
      this._field("padding", "内边距", "number", "prop", { unit: "px", min: 0, max: 400, step: 1 }),
      this._field("margin", "外边距", "number", "prop", { unit: "px", min: -200, max: 400, step: 1 }),
    ]});

    groups.push({ title: "效果", closed: false, fields: [
      this._field("boxShadow", "阴影", "text", "prop", { ph: "0 4px 12px rgba(0,0,0,.2)" }),
      this._field("opacity", "不透明度", "range", "prop", { min: 0, max: 1, step: 0.01 }),
      this._field("transform", "变换", "text", "prop", { ph: "rotate(8deg) scale(1.1)" }),
    ]});

    if (isContainer) {
      groups.push({ title: "容器布局", closed: false, fields: [
        this._field("display", "布局方式", "select", "prop", { options: [["block", "块级 Block"], ["flex", "弹性 Flex"]] }),
        this._field("flex-direction", "主轴方向", "seg", "prop", { options: [["row", "横向"], ["column", "纵向"]] }),
        this._field("align-items", "交叉轴对齐", "select", "prop", { options: [
          ["flex-start", "起始"], ["center", "居中"], ["flex-end", "末尾"], ["stretch", "拉伸"],
        ] }),
        this._field("justify-content", "主轴对齐", "select", "prop", { options: [
          ["flex-start", "起始"], ["center", "居中"], ["flex-end", "末尾"], ["space-between", "两端"], ["space-around", "环绕"],
        ] }),
        this._field("gap", "间距", "number", "prop", { unit: "px", min: 0, max: 200, step: 1 }),
      ]});
    }

    // content group for text-bearing elements
    const hasContent = !isContainer && el.type !== "divider";
    if (hasContent) {
      groups.push({ title: "内容", closed: false, fields: [
        this._field("content", el.type === "image" ? "图片地址" : el.type === "input" ? "占位文字" : "内容", "textarea", "meta"),
      ]});
    }

    return groups;
  }

  _field(key, label, type, target, opts = {}) {
    return { key, label, type, target, opts };
  }

  // ----- generic value get/set -----
  _get(el, f) {
    if (f.target === "meta") return el[f.key];
    return (el.props || {})[f.key];
  }
  _set(el, f, val) {
    const patch = f.target === "meta" ? { [f.key]: val } : { props: { [f.key]: val } };
    const ids = (this._ids && this._ids.length) ? this._ids : (el ? [el.id] : []);
    if (ids.length > 1) store.updateMany(ids, patch, { history: false });
    else if (ids.length) store.updateElement(ids[0], patch, { history: false });
  }

  // ----- renderers -----
  _group(g) {
    const box = document.createElement("div");
    box.className = "insp-group" + (g.closed ? " closed" : "");
    const head = document.createElement("button");
    head.className = "insp-group-head";
    head.innerHTML = `<span>${g.title}</span><span class="chev">▾</span>`;
    head.addEventListener("click", () => { box.classList.toggle("closed"); });
    const body = document.createElement("div");
    body.className = "insp-group-body";
    const twoCol = g.fields.length % 2 === 0 && g.fields.every(f => ["number", "color", "select"].includes(f.type));
    if (twoCol) body.classList.add("insp-grid");
    for (const f of g.fields) {
      const wrapped = this._fieldDom(f);
      if (wrapped) body.appendChild(wrapped);
    }
    box.appendChild(head);
    box.appendChild(body);
    return box;
  }

  _fieldDom(f) {
    const el = this._selected();
    if (!el) return null;
    const wrap = document.createElement("label");
    wrap.className = "field";
    const label = document.createElement("span");
    label.textContent = f.label;
    wrap.appendChild(label);

    let input;
    const val = this._get(el, f);

    if (f.type === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.className = "ctl";
      input.min = f.opts.min; input.max = f.opts.max; input.step = f.opts.step ?? 1;
      input.value = parseLen(val);
      if (f.opts.unit) {
        const row = document.createElement("div");
        row.className = "field-row";
        row.appendChild(input);
        const unit = document.createElement("span");
        unit.className = "unit";
        unit.textContent = f.opts.unit;
        row.appendChild(unit);
        input.addEventListener("change", () => {
          store.pushHistory();
          const n = Number(input.value);
          this._set(el, f, `${isNaN(n) ? 0 : n}${f.opts.unit}`);
          this._emitSizeChange(f);
        });
        this._wrapInput(wrap, row, input);
        return wrap;
      }
      input.addEventListener("change", () => {
        store.pushHistory();
        const n = Number(input.value);
        this._set(el, f, isNaN(n) ? 0 : n);
        this._emitSizeChange(f);
      });
      wrap.appendChild(input);
      return wrap;
    }

    if (f.type === "text") {
      input = document.createElement("input");
      input.type = "text";
      input.className = "ctl";
      input.placeholder = f.opts.ph || "";
      input.value = val == null ? "" : val;
      input.addEventListener("change", () => {
        store.pushHistory();
        this._set(el, f, input.value.trim());
      });
      wrap.appendChild(input);
      return wrap;
    }

    if (f.type === "textarea") {
      input = document.createElement("textarea");
      input.className = "ctl";
      input.rows = 3;
      input.value = f.key === "content" ? (el.content || "") : (val == null ? "" : val);
      input.addEventListener("change", () => {
        store.pushHistory();
        if (f.key === "content") {
          const ids = (this._ids && this._ids.length) ? this._ids : [el.id];
          if (ids.length > 1) store.updateMany(ids, { content: input.value }, { history: false });
          else store.updateElement(el.id, { content: input.value }, { history: false });
        } else this._set(el, f, input.value);
      });
      wrap.appendChild(input);
      return wrap;
    }

    if (f.type === "select") {
      input = document.createElement("select");
      input.className = "ctl";
      for (const [v, t] of f.opts.options) {
        const o = document.createElement("option");
        o.value = v; o.textContent = t;
        if (String(val) === String(v)) o.selected = true;
        input.appendChild(o);
      }
      input.addEventListener("change", () => {
        store.pushHistory();
        this._set(el, f, input.value);
      });
      wrap.appendChild(input);
      return wrap;
    }

    if (f.type === "seg") {
      const seg = document.createElement("div");
      seg.className = "seg";
      for (const [v, t] of f.opts.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t;
        b.dataset.v = v;
        if (String(val) === String(v)) b.classList.add("on");
        b.addEventListener("click", () => {
          store.pushHistory();
          this._set(el, f, v);
          seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        });
        seg.appendChild(b);
      }
      wrap.appendChild(seg);
      return wrap;
    }

    if (f.type === "color") {
      const row = document.createElement("div");
      row.className = "dual";
      const color = document.createElement("input");
      color.type = "color";
      color.className = "ctl";
      color.value = toHex(val);
      const text = document.createElement("input");
      text.type = "text";
      text.className = "ctl";
      text.value = val == null ? "" : String(val);
      text.placeholder = "颜色值";
      row.appendChild(color);
      row.appendChild(text);
      wrap.appendChild(row);
      // swatches
      const sw = document.createElement("div");
      sw.className = "swatches";
      for (const c of SWATCHES) {
        const s = document.createElement("div");
        s.className = "swatch";
        s.style.background = c;
        s.title = c;
        s.addEventListener("click", () => {
          store.pushHistory();
          this._set(el, f, c);
          color.value = c; text.value = c;
        });
        sw.appendChild(s);
      }
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "pbtn";
      clear.textContent = "透明";
      clear.addEventListener("click", () => {
        store.pushHistory();
        this._set(el, f, "transparent");
        text.value = "transparent";
      });
      sw.appendChild(clear);
      wrap.appendChild(sw);

      let cpushed = false;
      color.addEventListener("input", () => {
        if (!cpushed) { store.pushHistory(); cpushed = true; }
        this._set(el, f, color.value);
      });
      color.addEventListener("change", () => { cpushed = false; this._set(el, f, color.value); });
      text.addEventListener("change", () => {
        store.pushHistory();
        const v = text.value.trim();
        this._set(el, f, v);
        color.value = toHex(v);
      });
      return wrap;
    }

    if (f.type === "range") {
      input = document.createElement("input");
      input.type = "range";
      input.className = "ctl";
      input.min = f.opts.min; input.max = f.opts.max; input.step = f.opts.step ?? 0.01;
      input.value = val == null ? f.opts.max : val;
      const valLabel = document.createElement("span");
      valLabel.style.cssText = "font-size:11px;color:var(--text-dim);margin-left:6px;min-width:36px;text-align:right";
      const pct = Math.round((Number(input.value) * 100));
      valLabel.textContent = pct + "%";
      const row = document.createElement("div");
      row.className = "field-row";
      row.appendChild(input);
      row.appendChild(valLabel);
      let pushed = false;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        valLabel.textContent = Math.round(v * 100) + "%";
        if (!pushed) { store.pushHistory(); pushed = true; }
        this._set(el, f, v);
      });
      input.addEventListener("change", () => { pushed = false; });
      wrap.appendChild(row);
      return wrap;
    }

    return null;
  }

  _wrapInput(wrap, row, input) {
    wrap.appendChild(row);
  }
  _emitSizeChange(f) {
    // size/pos changes update the frame size chip in header intact; no extra work
  }
}
