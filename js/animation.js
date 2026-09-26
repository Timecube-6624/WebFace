// animation.js — master timeline that lists ELEMENTS as expandable rows.
// Expand an element to reveal its own animation clips and their keyframe
// tracks inline (like a non-linear video editor). Clips are draggable to set
// WHEN they start; each clip/track has a working ✕ delete.
import { store } from "./state.js";
import { getComponent } from "./components.js";
import { clamp } from "./util.js";

const TIME_SCALE = 100; // pixels per second on the timeline
const EASE_PRESETS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};
const EASE_LABELS = { linear: "线性", ease: "默认", "ease-in": "缓入", "ease-out": "缓出", "ease-in-out": "缓入缓出" };
const TRACK_CHOICES = ["opacity", "transform", "filter", "left", "top"];

function defaultKeyValue(prop, el) {
  switch (prop) {
    case "opacity": return "1";
    case "transform": return "none";
    case "filter": return "none";
    case "left": return (el ? Math.round(el.x) : 0) + "px";
    case "top": return (el ? Math.round(el.y) : 0) + "px";
    default: return "1";
  }
}
function easeToPoints(ease) {
  if (!ease) return EASE_PRESETS.ease;
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(ease);
  if (m) return m.slice(1).map(Number);
  return EASE_PRESETS[ease] || EASE_PRESETS.ease;
}
function pointsToEase(p) {
  const [x1, y1, x2, y2] = p.map(n => Number(n.toFixed(3)));
  for (const [name, v] of Object.entries(EASE_PRESETS)) if (v[0] === x1 && v[1] === y1 && v[2] === x2 && v[3] === y2) return name;
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}
const $ = (sel, root = document) => root.querySelector(sel);
function timelineEnd() {
  let end = 1500;
  for (const e of store.elements()) for (const a of store.animsOf(e.id)) end = Math.max(end, (a.start || 0) + (a.duration || 600));
  return Math.max(1000, Math.ceil(end / 500) * 500);
}

export class AnimationPanel {
  constructor(panelEl, logicEl, masterEl, detailEl, canvas) {
    this.panel = panelEl;
    this.logicEl = logicEl;
    this.masterEl = masterEl;
    this.canvas = canvas;
    this.activeTarget = null;
    this.activeAnim = null;
    this.selKey = null; // { id, clipId, track, index }
    this.expanded = new Set();
    this.visible = false;
    this._bindStore();
    this._bindResize();
  }

  _bindResize() {
    const handle = this.panel.querySelector("#lp-resize");
    if (!handle) return;
    try { const h = +localStorage.getItem("wf.lp.h"); if (h > 140) this.panel.style.height = h + "px"; } catch (e) {}
    handle.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const startY = ev.clientY, startH = this.panel.getBoundingClientRect().height;
      const maxH = window.innerHeight * 0.72;
      const move = (e2) => this.panel.style.height = Math.min(maxH, Math.max(150, startH + (startY - e2.clientY))) + "px";
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        try { localStorage.setItem("wf.lp.h", String(this.panel.getBoundingClientRect().height)); } catch (e) {}
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }

  _bindStore() {
    store.on("change", (r) => {
      if (!this.visible) return;
      if (["logic", "add", "remove", "structure", "selection", "update-many", "update"].includes(r.type)) this.render();
    });
  }

  toggle() { this.setVisible(!this.visible); }
  setVisible(v) { this.visible = v; this.panel.hidden = !v; if (v) this.render(); }
  close() { this.setVisible(false); }

  setActive(id) {
    this.activeTarget = id; this.activeAnim = this._firstClipId(id);
    if (id) this.expanded.add(id);
    store.select(id); this.selKey = null; this.render();
  }
  setTarget(id) { this.activeTarget = id; this.activeAnim = this._firstClipId(id); if (id) this.expanded.add(id); this.selKey = null; this.render(); }
  selectClip(id, clipId) { this.activeTarget = id; this.activeAnim = clipId; this.expanded.add(id); store.select(id); this.selKey = null; this.render(); }
  _firstClipId(id) { const a = store.animsOf(id); return a.length ? a[0].id : null; }
  toggleExpand(id) { if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id); this.render(); }

  render() { if (!this.visible) return; this.renderLogic(); this.renderTimeline(); }

  // ---------------- logic graph ----------------
  renderLogic() {
    const els = store.elements();
    let h = `<div class="lg-controls"><span class="lg-title">点击逻辑</span>`;
    h += `<label class="lp-label">触发</label><select class="lp-sel" id="lg-trigger">${els.map(e => `<option value="${e.id}">${e.name}</option>`).join("")}</select>`;
    h += `<label class="lp-label">→ 目标</label><select class="lp-sel" id="lg-target">${els.map(e => `<option value="${e.id}">${e.name}</option>`).join("")}</select>`;
    h += `<button class="btn btn-tonal btn-sm" id="lg-add">连接</button><span class="lg-hint">点击画面元素触发 → 播放目标元素动画。</span></div>`;
    this.logicEl.innerHTML = h;
    const col = 3, cw = 168, chh = 92, pad = 8;
    const pos = new Map();
    els.forEach((e, i) => pos.set(e.id, { cx: pad + (i % col) * (cw + 12) + cw / 2, cy: pad + Math.floor(i / col) * (chh + 12) + chh / 2 }));
    const cols = Math.max(1, Math.ceil(els.length / col));
    const gw = pad * 2 + col * cw + (col - 1) * 12, gh = pad * 2 + cols * chh + (cols - 1) * 12;
    let svg = `<svg class="lg-svg" width="${gw}" height="${gh}" style="position:absolute;left:0;top:0;pointer-events:none">`;
    for (const l of (store.logicEdges() || [])) {
      const a = pos.get(l.triggerId), b = pos.get(l.targetId);
      if (!a || !b) continue;
      const mx = (a.cx + b.cx) / 2;
      svg += `<path d="M${a.cx},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${b.cx},${b.cy}" stroke="#aac7ff" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/><circle cx="${b.cx}" cy="${b.cy}" r="3" fill="#aac7ff"/>`;
    }
    svg += `</svg>`;
    let graph = `<div class="lg-graph" style="position:relative;width:${gw}px;height:${gh}px">${svg}`;
    for (const e of els) {
      const c = getComponent(e.type), n = pos.get(e.id);
      const count = store.animsOf(e.id).length;
      graph += `<button class="lg-node${e.id === this.activeTarget ? " active" : ""}${count ? " has-anim" : ""}" data-id="${e.id}" style="left:${n.cx - cw / 2}px;top:${n.cy - chh / 2}px;width:${cw}px;height:${chh}px">
        <span class="lg-node-ic">${c.icon}</span><span class="lg-node-name">${e.name}</span><span class="lg-node-tag">${e.type}</span>${count ? `<span class="lg-node-badge">${count}</span>` : ""}</button>`;
    }
    this.logicEl.insertAdjacentHTML("beforeend", graph + `</div>`);
    $("#lg-add", this.logicEl).addEventListener("click", () => {
      const t = $("#lg-trigger", this.logicEl).value, g = $("#lg-target", this.logicEl).value;
      if (t && g) { if (store.addLogicEdge(t, g)) toast("已连接点击逻辑"); else toast("该逻辑已存在或元素无效", false); }
      else toast("请先选择触发与目标元素", false);
    });
    this.logicEl.querySelectorAll(".lg-node").forEach(b => b.addEventListener("click", () => this.setActive(b.dataset.id)));
  }

  // ---------------- master timeline (expandable rows) ----------------
  renderTimeline() {
    const total = timelineEnd();
    const w = Math.max(400, (total / 1000) * TIME_SCALE);
    let h = `<div class="tl-ctrl"><button class="btn btn-outlined btn-sm" id="tl-playall">▶ 播放全部</button><span class="tl-ctrl-hint">点击元素 ▸ 展开 · ＋新增片断 · 拖片断改开始时间</span></div>`;
    h += `<div class="tl-inner" style="width:${110 + w}px">`;
    // ruler
    h += `<div class="tl-row tl-ruler-row">`;
    h += `<div class="tl-lbl" style="width:110px">主时间轴 (s)</div>`;
    h += `<div class="tl-time" style="width:${w}px;position:relative">`;
    const step = total > 6000 ? 1000 : 250;
    for (let t = 0; t <= total; t += step) {
      const pct = (t / total) * 100;
      h += `<span class="tl-tick" style="left:${pct}%"><i></i>${(t / 1000).toFixed(3)}</span>`;
    }
    h += `<div class="tl-playhead" id="tl-playhead" style="left:0%"></div></div></div>`;
    // element rows
    for (const e of store.elements()) h += this._elRow(e, total, w);
    h += `</div>`;
    this.masterEl.innerHTML = h;
    this._bindTimeline(total, w);
  }

  _elRow(e, total, w) {
    const expanded = this.expanded.has(e.id);
    let s = `<div class="tl-el-group${expanded ? " open" : ""}">`;
    s += `<div class="tl-row tl-el-row">`;
    s += `<div class="tl-lbl" style="width:110px">`;
    s += `<button class="tl-toggle${expanded ? " open" : ""}" data-id="${e.id}" title="展开/收起">${expanded ? "▾" : "▸"}</button>`;
    s += `<button class="tl-el-name${e.id === this.activeTarget ? " on" : ""}" data-id="${e.id}" title="选中该元素">${e.name}</button>`;
    s += `<button class="tl-lane-add" data-id="${e.id}" title="添加动画">＋</button>`;
    s += `</div>`;
    s += `<div class="tl-time" style="width:${w}px;position:relative"></div>`;
    s += `</div>`;
    if (expanded) {
      const clips = store.animsOf(e.id);
      if (!clips.length) {
        s += `<div class="tl-row"><div class="tl-lbl" style="width:110px;padding-left:26px">（无动画）</div><div class="tl-time" style="width:${w}px"></div></div>`;
      } else {
        for (const a of clips) {
          const selClip = e.id === this.activeTarget && a.id === this.activeAnim;
          const x = ((a.start || 0) / total) * 100, wd = Math.max(4, Math.min(100, ((a.duration || 600) / total) * 100));
          s += `<div class="tl-row tl-clip-row">`;
          s += `<div class="tl-lbl" style="width:110px;padding-left:26px"><span class="tl-clip-label">${a.label || "动画"}</span><button class="tl-del-clip" data-id="${e.id}" data-clip="${a.id}" title="删除该动画">×</button></div>`;
          s += `<div class="tl-time" style="width:${w}px;position:relative"><div class="tl-clip${selClip ? " sel" : ""}" data-id="${e.id}" data-clip="${a.id}" style="left:${x}%;width:${wd}%">${a.label || "动画"}</div></div>`;
          s += `</div>`;
          (a.tracks || []).forEach((track, ti) => { s += this._trackRow(e, a, track, ti, total, w); });
          if (selClip) s += this._clipEditor(e, a, total, w);
        }
      }
    }
    s += `</div>`;
    return s;
  }

  _clipEditor(e, a, total, w) {
    return `<div class="tl-row tl-cliped" style="width:${110 + w}px"><div class="tl-cliped-box">
      <span class="tl-kfed-title">片断：${a.label || "动画"}</span>
      <label class="lp-label">开始 <input type="number" id="tl-start" min="0" max="60000" step="1" value="${+(a.start || 0)}"> ms</label>
      <label class="lp-label">时长 <input type="number" id="tl-dur" min="20" max="60000" step="1" value="${+(a.duration || 600)}"> ms</label>
      <button class="btn btn-outlined btn-sm" id="tl-playclip">▶ 播放这一段</button>
    </div></div>`;
  }

  _trackRow(e, a, track, ti, total, w) {
    let s = `<div class="tl-row tl-track-row">`;
    s += `<div class="tl-lbl" style="width:110px;padding-left:36px">${track.prop}<button class="tl-del-track" data-id="${e.id}" data-clip="${a.id}" data-track="${ti}" title="删除该轨道">×</button></div>`;
    s += `<div class="tl-time" style="width:${w}px"><div class="tl-lane" data-id="${e.id}" data-clip="${a.id}" data-track="${ti}">`;
    (track.keyframes || []).forEach((k, ki) => {
      const sel = this.selKey && this.selKey.id === e.id && this.selKey.clipId === a.id && this.selKey.track === ti && this.selKey.index === ki;
      s += `<span class="tl-kf${sel ? " on" : ""}" data-id="${e.id}" data-clip="${a.id}" data-track="${ti}" data-kf="${ki}" style="left:${(k.t || 0) * 100}%" title="${k.value}">◆</span>`;
    });
    s += `</div></div>`;
    s += `</div>`;
    // selected keyframe inline editor
    if (this.selKey && this.selKey.id === e.id && this.selKey.clipId === a.id && this.selKey.track === ti) {
      const kf = track.keyframes[this.selKey.index];
      if (kf) s += this._kfEditor(e, a, track, ti, kf, total, w);
    }
    return s;
  }

  _kfEditor(e, a, track, ti, kf, total, w) {
    return `<div class="tl-row tl-kfed" style="width:${w + 110}px">
      <div class="tl-kfed-box">
        <span class="tl-kfed-title">关键帧：${track.prop}</span>
        <label class="lp-label">值 <input type="text" id="tl-value" value="${kf.value}"></label>
        <label class="lp-label">时间 <input type="number" id="tl-t" min="0" max="1" step="0.001" value="${+(kf.t || 0).toFixed(3)}"></label>
        <button class="btn btn-ghost btn-sm" id="tl-addkf2">＋关键帧</button>
        <button class="btn btn-ghost btn-sm" id="tl-delkf">删除关键帧</button>
        <div class="tl-ease-label">缓动曲线（该关键帧→下一关键帧）</div>
        <div id="tl-ease" class="tl-ease"></div>
      </div></div>`;
  }

  _bindTimeline(total, w) {
    const tl = this.masterEl;
    const ruler = tl.querySelector(".tl-ruler-row .tl-time");
    if (ruler) ruler.addEventListener("pointerdown", (ev) => {
      const rect = ruler.getBoundingClientRect();
      const move = (e2) => this._movePlayhead(clamp((e2.clientX - rect.left) / rect.width, 0, 1));
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); move(ev);
    });
    const pAll = $("#tl-playall", tl);
    if (pAll) pAll.addEventListener("click", () => this.playAll());
    // expand toggles
    tl.querySelectorAll(".tl-toggle").forEach(b => b.addEventListener("click", (ev) => { ev.stopPropagation(); this.toggleExpand(b.dataset.id); }));
    tl.querySelectorAll(".tl-el-name").forEach(b => b.addEventListener("click", () => this.setActive(b.dataset.id)));
    tl.querySelectorAll(".tl-lane-add").forEach(b => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = b.dataset.id;
      const clip = store.addAnim(id, { label: "动画" + (store.animsOf(id).length + 1), start: 0, duration: 600, tracks: [
        { prop: "opacity", keyframes: [{ t: 0, value: "0", ease: "ease" }, { t: 1, value: "1", ease: "ease" }] },
      ] });
      this.activeTarget = id; this.activeAnim = clip.id; this.expanded.add(id); store.select(id);
      toast("已添加动画，可拖动调整开始时间");
    }));
    // clips: select + drag + delete
    tl.querySelectorAll(".tl-clip").forEach(c => {
      const id = c.dataset.id, clipId = c.dataset.clip;
      c.addEventListener("click", (ev) => { ev.stopPropagation(); this.selectClip(id, clipId); });
      c.addEventListener("pointerdown", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const a = store.getAnim(id, clipId); if (!a) return;
        const rect = c.parentElement.getBoundingClientRect();
        const startVal = a.start || 0, startX = ev.clientX;
        const move = (e2) => {
          const ns = Math.max(0, Math.round(startVal + ((e2.clientX - startX) / rect.width) * total));
          a.start = ns; c.style.left = ((ns / total) * 100) + "%";
          const sIn = $("#tl-start", this.masterEl); if (sIn) sIn.value = ns;
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); store._emit({ type: "update", id }); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
    });
    tl.querySelectorAll(".tl-del-clip").forEach(b => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      store.removeAnim(b.dataset.id, b.dataset.clip);
      if (this.activeTarget === b.dataset.id && this.activeAnim === b.dataset.clip) this.activeAnim = this._firstClipId(b.dataset.id);
      toast("已删除该动画");
      this.render();
    }));
    // tracks: add keyframe on lane click; kf select/drag; delete track
    tl.querySelectorAll(".tl-lane").forEach(lane => {
      lane.addEventListener("pointerdown", (ev) => {
        if (ev.target.classList.contains("tl-kf")) return;
        const id = lane.dataset.id, clipId = lane.dataset.clip, ti = +lane.dataset.track;
        const a = store.getAnim(id, clipId); if (!a) return;
        const track = a.tracks[ti]; const el = store.getElement(id);
        const frac = clamp((ev.clientX - lane.getBoundingClientRect().left) / lane.getBoundingClientRect().width, 0, 1);
        const val = el.props[track.prop] || defaultKeyValue(track.prop, el);
        track.keyframes.push({ t: frac, value: val, ease: "ease" });
        track.keyframes.sort((x, y) => x.t - y.t);
        const idx = track.keyframes.findIndex(k => Math.abs(k.t - frac) < 0.0005);
        this.selKey = { id, clipId, track: ti, index: idx >= 0 ? idx : track.keyframes.length - 1 };
        store._emit({ type: "update", id }); this.render();
      });
    });
    tl.querySelectorAll(".tl-kf").forEach(kf => {
      kf.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        const id = kf.dataset.id, clipId = kf.dataset.clip, ti = +kf.dataset.track, ki = +kf.dataset.kf;
        const a = store.getAnim(id, clipId); if (!a) return;
        const lane = kf.parentElement;
        const move = (e2) => {
          const frac = clamp((e2.clientX - lane.getBoundingClientRect().left) / lane.getBoundingClientRect().width, 0, 1);
          a.tracks[ti].keyframes[ki].t = frac;
          a.tracks[ti].keyframes.sort((x, y) => x.t - y.t);
          kf.style.left = (frac * 100) + "%";
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); store._emit({ type: "update", id }); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
      kf.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.selKey = { id: kf.dataset.id, clipId: kf.dataset.clip, track: +kf.dataset.track, index: +kf.dataset.kf };
        this.render();
      });
    });
    tl.querySelectorAll(".tl-del-track").forEach(b => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = b.dataset.id, clipId = b.dataset.clip, ti = +b.dataset.track;
      const a = store.getAnim(id, clipId); if (!a) return;
      a.tracks.splice(ti, 1);
      this.selKey = null;
      store._emit({ type: "update", id });
      this.render();
    }));
    // keyframe editor actions
    const vIn = $("#tl-value", tl); if (vIn) vIn.addEventListener("change", () => this._editKf("value", vIn.value));
    const tIn = $("#tl-t", tl); if (tIn) tIn.addEventListener("change", () => this._editKf("t", clamp(parseFloat(tIn.value) || 0, 0, 1)));
    const delKf = $("#tl-delkf", tl); if (delKf) delKf.addEventListener("click", () => this._delKf());
    const addKf2 = $("#tl-addkf2", tl); if (addKf2) addKf2.addEventListener("click", () => this._addKf());
    // clip controls (start / duration / play one)
    const sIn = $("#tl-start", tl);
    if (sIn) sIn.addEventListener("change", () => {
      const a = store.getAnim(this.activeTarget, this.activeAnim); if (!a) return;
      a.start = Math.max(0, +sIn.value || 0); store._emit({ type: "update", id: this.activeTarget }); this.render();
    });
    const dIn = $("#tl-dur", tl);
    if (dIn) dIn.addEventListener("change", () => {
      const a = store.getAnim(this.activeTarget, this.activeAnim); if (!a) return;
      a.duration = Math.max(20, +dIn.value || 600); store._emit({ type: "update", id: this.activeTarget }); this.render();
    });
    const pClip = $("#tl-playclip", tl);
    if (pClip) pClip.addEventListener("click", () => { if (this.activeTarget) this.canvas.previewPlay(this.activeTarget); });
    const easeHost = $("#tl-ease", tl);
    if (easeHost && this.selKey) {
      const a = store.getAnim(this.selKey.id, this.selKey.clipId);
      const kf = a && a.tracks[this.selKey.track] && a.tracks[this.selKey.track].keyframes[this.selKey.index];
      if (kf) this._renderEaseEditor(easeHost, this.selKey.id, kf);
    }
  }

  _curSelKf() {
    if (!this.selKey) return null;
    const a = store.getAnim(this.selKey.id, this.selKey.clipId);
    if (!a) return null;
    const track = a.tracks[this.selKey.track];
    if (!track || track.keyframes[this.selKey.index] == null) return null;
    return { a, track, kf: track.keyframes[this.selKey.index] };
  }
  _editKf(field, val) {
    const s = this._curSelKf(); if (!s) return;
    if (field === "value") s.kf.value = val; else s.kf.t = clamp(parseFloat(val) || 0, 0, 1);
    store._emit({ type: "update", id: this.selKey.id }); this.render();
  }
  _delKf() {
    const s = this._curSelKf(); if (!s) return;
    if (s.track.keyframes.length <= 2) { toast("关键帧至少保留 2 个", false); return; }
    const id = this.selKey.id;
    s.track.keyframes.splice(this.selKey.index, 1);
    this.selKey = null;
    store._emit({ type: "update", id }); this.render();
  }
  _addKf() {
    const s = this._curSelKf(); if (!s) return;
    const el = store.getElement(this.selKey.id);
    const val = el.props[s.track.prop] || defaultKeyValue(s.track.prop, el);
    s.track.keyframes.push({ t: 0.5, value: s.kf.value, ease: "ease" });
    s.track.keyframes.sort((x, y) => x.t - y.t);
    this.selKey = { ...this.selKey, index: s.track.keyframes.findIndex(k => k.t === 0.5) };
    store._emit({ type: "update", id: this.selKey.id }); this.render();
  }

  _renderEaseEditor(host, id, kf) {
    const pts = easeToPoints(kf.ease);
    let p1 = [pts[0], 1 - pts[1]], p2 = [pts[2], 1 - pts[3]];
    host.innerHTML = `
      <div class="tl-ease-presets">${Object.keys(EASE_PRESETS).map(n => `<button class="pbtn" data-ease="${n}">${EASE_LABELS[n] || n}</button>`).join("")}<span class="tl-ease-out" id="tl-ease-out"></span></div>
      <svg class="tl-ease-svg" id="tl-ease-svg" width="140" height="140" viewBox="0 0 1 1" preserveAspectRatio="none">
        <line x1="0" y1="1" x2="1" y2="0" stroke="#666" stroke-width="0.008"/>
        <path id="tl-ease-path" fill="none" stroke="#aac7ff" stroke-width="0.02"/>
        <circle id="tl-p1" r="0.05" fill="#ffb4ab"/><circle id="tl-p2" r="0.05" fill="#7fd8a4"/></svg>`;
    const svg = $("#tl-ease-svg", host), path = $("#tl-ease-path", host), c1 = $("#tl-p1", host), c2 = $("#tl-p2", host);
    const out = $("#tl-ease-out", host);
    const redraw = () => {
      c1.setAttribute("cx", p1[0]); c1.setAttribute("cy", p1[1]);
      c2.setAttribute("cx", p2[0]); c2.setAttribute("cy", p2[1]);
      path.setAttribute("d", `M0,1 C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} 1,0`);
      kf.ease = pointsToEase([p1[0], 1 - p1[1], p2[0], 1 - p2[1]]); out.textContent = kf.ease;
    };
    redraw();
    const drag = (node, set) => node.addEventListener("pointerdown", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const move = (e2) => { set([clamp((e2.clientX - rect.left) / rect.width, 0, 1), clamp((e2.clientY - rect.top) / rect.height, 0, 1)]); redraw(); };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); store._emit({ type: "update", id }); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
    drag(c1, (v) => p1 = v); drag(c2, (v) => p2 = v);
    host.querySelectorAll(".pbtn").forEach(b => b.addEventListener("click", () => {
      const p = EASE_PRESETS[b.dataset.ease]; p1 = [p[0], 1 - p[1]]; p2 = [p[2], 1 - p[3]];
      kf.ease = b.dataset.ease; redraw(); store._emit({ type: "update", id });
    }));
  }

  playAll() {
    let end = 1500;
    for (const e of store.elements()) {
      const clips = store.animsOf(e.id);
      if (!clips.length) continue;
      for (const a of clips) end = Math.max(end, (a.start || 0) + (a.duration || 600));
      this.canvas.previewPlay(e.id);
    }
    this._playheadRun(end);
  }
  _playheadRun(end) {
    const start = performance.now();
    const step = (now) => { const t = (now - start) / end; this._movePlayhead(Math.min(1, t)); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  _movePlayhead(t) { const ph = $("#tl-playhead", this.masterEl); if (ph) ph.style.left = (t * 100) + "%"; }
}

function toast(text, ok = true) { window.dispatchEvent(new CustomEvent("webfacer:toast", { detail: { text, ok } })); }
