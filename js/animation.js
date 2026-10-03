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
    this.detailEl = detailEl;   // middle pane of the panel: clip / keyframe editor
    // the pane's innerHTML is rebuilt on every render, so the content lives in
    // .tl-detail-body (the resize handle next to it survives), with a fallback for
    // documents that do not have that wrapper.
    this.detailBody = (detailEl && detailEl.querySelector && detailEl.querySelector(".tl-detail-body")) || detailEl;
    this.canvas = canvas;
    this.activeTarget = null;
    this.activeAnim = null;
    this.selKey = null; // { id, clipId, track, index }
    this.detailOpen = false; // is the left editor pane expanded?
    this.expanded = new Set();
    this.visible = false;
    this._bindStore();
    this._bindResize();
  }

  _bindResize() {
    // height of the whole panel
    const handle = this.panel.querySelector("#lp-resize");
    if (handle) {
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
    // width of the middle editor pane
    const wHandle = this.panel.querySelector("#tl-detail-resize");
    if (wHandle && this.detailEl) {
      try { const w = +localStorage.getItem("wf.tl.dw"); if (w >= 160) this.detailEl.style.flexBasis = w + "px"; } catch (e) {}
      wHandle.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        const startX = ev.clientX, startW = this.detailEl.getBoundingClientRect().width || 226;
        const move = (e2) => this.detailEl.style.flexBasis = Math.min(560, Math.max(170, startW + (e2.clientX - startX))) + "px";
        const up = () => {
          window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
          try { localStorage.setItem("wf.tl.dw", String(Math.round(this.detailEl.getBoundingClientRect().width))); } catch (e) {}
        };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
    }
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
    this.detailOpen = !!id;
    store.select(id); this.selKey = null; this.render();
  }
  // Called by app.js on EVERY "selection" change — including the ones this panel
  // triggers itself (store.select inside _activateClip/_addKfAt). Resetting here
  // would throw away the clip/keyframe the user just clicked, so while the target
  // is unchanged we keep what is being edited (that is why the 2nd/3rd track of an
  // element could never open the same 片断 panel as the first one).
  setTarget(id) {
    if (id && id === this.activeTarget && store.animsOf(id).some(a => a.id === this.activeAnim)) {
      this.expanded.add(id);
      return;
    }
    this.activeTarget = id; this.activeAnim = this._firstClipId(id);
    if (id) this.expanded.add(id);
    this.selKey = null; this.detailOpen = false;
    this.render();
  }
  selectClip(id, clipId) { this.activeTarget = id; this.activeAnim = clipId; this.expanded.add(id); store.select(id); this.selKey = null; this.render(); }
  _firstClipId(id) { const a = store.animsOf(id); return a.length ? a[0].id : null; }
  toggleExpand(id) { if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id); this.render(); }

  render() { if (!this.visible) return; this.renderLogic(); this.renderTimeline(); this.renderDetail(); }

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
    let h = `<div class="tl-ctrl"><button class="btn btn-outlined btn-sm" id="tl-playall" title="按主时间轴播放所有元素的所有片断">▶ 播放全部</button><span class="tl-ctrl-hint">点击元素 ▸ 展开 · 拖动条形改片断时间 · 点击条形加关键帧 · 片断/关键帧面板在中间栏</span></div>`;
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
    s += `<button class="tl-lane-add" data-id="${e.id}" title="添加动画片断">＋</button>`;
    s += `</div>`;
    s += `<div class="tl-time" style="width:${w}px;position:relative"></div>`;
    s += `</div>`;
    if (expanded) {
      const clips = store.animsOf(e.id);
      if (!clips.length) {
        s += `<div class="tl-row"><div class="tl-lbl" style="width:110px;padding-left:26px">（无动画）</div><div class="tl-time" style="width:${w}px"></div></div>`;
      } else {
        // No clip header row: each PROPERTY TRACK is drawn as a bar spanning its
        // clip's time range, and the keyframes sit inside that bar. Clips of the
        // same element are separated by a divider (.tl-clip-group).
        for (const a of clips) {
          const x = ((a.start || 0) / total) * 100;
          const wd = Math.min(100, ((a.duration || 600) / total) * 100);
          const tracks = a.tracks || [];
          s += `<div class="tl-clip-group">`;
          if (!tracks.length) {
            s += `<div class="tl-row tl-track-row">`;
            s += `<div class="tl-lbl" style="width:110px;padding-left:36px">（空片断）<button class="tl-del-clip" data-id="${e.id}" data-clip="${a.id}" title="删除该片断">×</button></div>`;
            s += `<div class="tl-time" style="width:${w}px"><div class="tl-bar empty" data-id="${e.id}" data-clip="${a.id}" data-track="0" style="left:${x}%;width:${Math.max(2, wd)}%" title="空片断：拖动改时间"></div></div>`;
            s += `</div>`;
          } else {
            tracks.forEach((track, ti) => { s += this._trackRow(e, a, track, ti, total, w); });
          }
          s += `</div>`;
        }
      }
    }
    s += `</div>`;
    return s;
  }

  _trackRow(e, a, track, ti, total, w) {
    const selClip = e.id === this.activeTarget && a.id === this.activeAnim;
    const selTrack = !!(this.selKey && this.selKey.id === e.id && this.selKey.clipId === a.id && this.selKey.track === ti);
    const x = ((a.start || 0) / total) * 100;
    const wd = Math.max(2, Math.min(100, ((a.duration || 600) / total) * 100));
    const t0 = +(a.start || 0), t1 = t0 + (+(a.duration) || 600);
    let s = `<div class="tl-row tl-track-row${selTrack ? " on" : ""}">`;
    s += `<div class="tl-lbl" style="width:110px;padding-left:36px">${track.prop}<button class="tl-del-track" data-id="${e.id}" data-clip="${a.id}" data-track="${ti}" title="删除该轨道">×</button></div>`;
    s += `<div class="tl-time" style="width:${w}px"><div class="tl-bar${selClip ? " sel" : ""}" data-id="${e.id}" data-clip="${a.id}" data-track="${ti}" style="left:${x}%;width:${wd}%" title="${track.prop}：${t0}~${t1}ms（拖动条形改片断时间 · 点击条形加关键帧）">`;
    s += `<span class="tl-bar-name">${track.prop}</span>`;
    // keyframe t is clip-relative (0..1) → position inside the bar, i.e. inside [start, start+duration]
    (track.keyframes || []).forEach((k, ki) => {
      const sel = selTrack && this.selKey.index === ki;
      s += `<span class="tl-kf${sel ? " on" : ""}" data-id="${e.id}" data-clip="${a.id}" data-track="${ti}" data-kf="${ki}" style="left:${((k.t || 0) * 100).toFixed(3)}%" title="${k.value}">◆</span>`;
    });
    s += `</div></div>`;
    s += `</div>`;
    return s;
  }

  // ---------------- left editor pane (clip + keyframe) ----------------
  // The editors used to be rendered as extra rows INSIDE the timeline, which pushed
  // the tracks around; they now live in the pane on the left of the timeline and the
  // matching track/bar is highlighted instead (see .tl-bar.sel / .tl-track-row.on).
  renderDetail() {
    const host = this.detailBody || this.detailEl;
    if (!host || !this.detailEl) return;
    const el = this.activeTarget ? store.getElement(this.activeTarget) : null;
    const clip = el ? store.getAnim(el.id, this.activeAnim) : null;
    const sel = this._curSelKf();
    let h = "";
    if (this.detailOpen && el && clip) {
      h += `<div class="tld-block">
        <div class="tld-head"><span>片断</span><button class="tld-close" id="tld-close" title="收起面板">×</button></div>
        <label class="lp-label">开始 <input type="number" id="tl-start" min="0" max="60000" step="1" value="${+(clip.start || 0)}"> ms</label>
        <label class="lp-label">时长 <input type="number" id="tl-dur" min="20" max="60000" step="1" value="${+(clip.duration || 600)}"> ms</label>
        <div class="tld-actions">
          <button class="btn btn-outlined btn-sm" id="tl-playclip">▶ 播放这一段</button>
          <button class="btn btn-ghost btn-sm" id="tl-delclip">删除片断</button>
        </div>
      </div>`;
      if (sel) {
        h += `<div class="tld-block">
          <div class="tld-head"><span>关键帧 · ${sel.track.prop}</span></div>
          <label class="lp-label">值 <input type="text" id="tl-value" value="${sel.kf.value}"></label>
          <label class="lp-label">时间 <input type="number" id="tl-t" min="0" max="1" step="0.001" value="${+(sel.kf.t || 0).toFixed(3)}"></label>
          <div class="tld-actions">
            <button class="btn btn-ghost btn-sm" id="tl-addkf2">＋关键帧</button>
            <button class="btn btn-ghost btn-sm" id="tl-delkf">删除关键帧</button>
          </div>
          <div class="tl-ease-label">缓动曲线（该关键帧→下一关键帧）</div>
          <div id="tl-ease" class="tl-ease"></div>
        </div>`;
      } else {
        h += `<div class="tld-hint">点时间轴上任意一条轨道里的 ◆ 关键帧，可以改它的值、时间和缓动曲线。</div>`;
      }
    }
    this.detailEl.hidden = !h;
    host.innerHTML = h;
    this._bindDetail();
  }

  _bindDetail() {
    const d = this.detailBody || this.detailEl;
    if (!d) return;
    const close = $("#tld-close", d);
    if (close) close.addEventListener("click", () => { this.detailOpen = false; this.renderDetail(); });
    const sIn = $("#tl-start", d);
    if (sIn) sIn.addEventListener("change", () => {
      const a = store.getAnim(this.activeTarget, this.activeAnim); if (!a) return;
      a.start = Math.max(0, +sIn.value || 0); store._emit({ type: "update", id: this.activeTarget }); this.render();
    });
    const dIn = $("#tl-dur", d);
    if (dIn) dIn.addEventListener("change", () => {
      const a = store.getAnim(this.activeTarget, this.activeAnim); if (!a) return;
      a.duration = Math.max(20, +dIn.value || 600); store._emit({ type: "update", id: this.activeTarget }); this.render();
    });
    const pClip = $("#tl-playclip", d);
    if (pClip) pClip.addEventListener("click", () => { if (this.activeTarget) this.canvas.previewPlay(this.activeTarget, this.activeAnim); });
    const dClip = $("#tl-delclip", d);
    if (dClip) dClip.addEventListener("click", () => {
      const id = this.activeTarget, clipId = this.activeAnim;
      if (!id || !clipId) return;
      store.removeAnim(id, clipId);
      this.activeAnim = this._firstClipId(id);
      this.selKey = null;
      this.detailOpen = false;
      toast("已删除该片断");
      this.render();
    });
    const vIn = $("#tl-value", d); if (vIn) vIn.addEventListener("change", () => this._editKf("value", vIn.value));
    const tIn = $("#tl-t", d); if (tIn) tIn.addEventListener("change", () => this._editKf("t", clamp(parseFloat(tIn.value) || 0, 0, 1)));
    const delKf = $("#tl-delkf", d); if (delKf) delKf.addEventListener("click", () => this._delKf());
    const addKf2 = $("#tl-addkf2", d); if (addKf2) addKf2.addEventListener("click", () => this._addKf());
    const easeHost = $("#tl-ease", d);
    if (easeHost && this.selKey) {
      const a = store.getAnim(this.selKey.id, this.selKey.clipId);
      const kf = a && a.tracks[this.selKey.track] && a.tracks[this.selKey.track].keyframes[this.selKey.index];
      if (kf) this._renderEaseEditor(easeHost, this.selKey.id, kf);
    }
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
      this.activeTarget = id; this.activeAnim = clip.id; this.expanded.add(id);
      this.detailOpen = true;
      store.select(id);
      toast("已添加动画，可拖动调整开始时间");
    }));
    // track bars: drag = move the whole clip in time; click = add a keyframe.
    // The bar spans the clip's [start, start+duration] range, so a keyframe at
    // clip-relative t lands at start + t*duration on the master timeline.
    tl.querySelectorAll(".tl-bar").forEach(bar => {
      const id = bar.dataset.id, clipId = bar.dataset.clip, ti = +bar.dataset.track;
      bar.addEventListener("pointerdown", (ev) => {
        if (ev.target.classList.contains("tl-kf")) return; // diamonds handle their own drag
        ev.preventDefault(); ev.stopPropagation();
        const a = store.getAnim(id, clipId); if (!a) return;
        const laneRect = bar.parentElement.getBoundingClientRect(); // full-width time area
        const startVal = a.start || 0, startX = ev.clientX, startY = ev.clientY;
        let moved = false;
        const move = (e2) => {
          if (!moved && Math.abs(e2.clientX - startX) < 3 && Math.abs(e2.clientY - startY) < 3) return;
          moved = true;
          const ns = Math.max(0, Math.round(startVal + ((e2.clientX - startX) / (laneRect.width || 1)) * total));
          a.start = ns; // every bar of this clip moves together
          tl.querySelectorAll(`.tl-bar[data-clip="${clipId}"]`).forEach(b => b.style.left = ((ns / total) * 100) + "%");
          const sIn = $("#tl-start", this.detailEl); if (sIn) sIn.value = ns;
        };
        const up = (e2) => {
          window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
          if (moved) {
            this.activeTarget = id; this.activeAnim = clipId; this.expanded.add(id);
            this.detailOpen = true;
            store.select(id); // emits "selection" -> panel + canvas follow the clip
            store._emit({ type: "update", id }); // re-render so all bars show the new start
          } else {
            const r = bar.getBoundingClientRect();
            const frac = clamp((e2.clientX - r.left) / (r.width || 1), 0, 1);
            if (a.tracks && a.tracks[ti]) this._addKfAt(id, clipId, ti, frac);
            else this._activateClip(id, clipId); // track-less clip: just select it
          }
        };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
    });
    tl.querySelectorAll(".tl-del-clip").forEach(b => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      store.removeAnim(b.dataset.id, b.dataset.clip);
      if (this.activeTarget === b.dataset.id && this.activeAnim === b.dataset.clip) this.activeAnim = this._firstClipId(b.dataset.id);
      toast("已删除该片断");
      this.render();
    }));
    // keyframes: drag to retime (position is clip-relative), click to edit
    tl.querySelectorAll(".tl-kf").forEach(kf => {
      kf.addEventListener("pointerdown", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const id = kf.dataset.id, clipId = kf.dataset.clip, ti = +kf.dataset.track, ki = +kf.dataset.kf;
        const a = store.getAnim(id, clipId); if (!a) return;
        const track = a.tracks[ti]; if (!track) return;
        const kfObj = track.keyframes[ki]; if (!kfObj) return;
        const bar = kf.parentElement; // .tl-bar — its width IS the clip's duration
        const move = (e2) => {
          const r = bar.getBoundingClientRect();
          const frac = clamp((e2.clientX - r.left) / (r.width || 1), 0, 1);
          kfObj.t = frac;
          track.keyframes.sort((x, y) => x.t - y.t);
          kf.style.left = (frac * 100) + "%";
        };
        const up = () => {
          window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
          this.activeTarget = id; this.activeAnim = clipId; this.expanded.add(id);
          this.selKey = { id, clipId, track: ti, index: track.keyframes.indexOf(kfObj) };
          this.detailOpen = true;
          store._emit({ type: "update", id });
        };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
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
    // the clip / keyframe editors live in the left pane (see renderDetail)
  }

  // Select (and reveal the editor of) one clip without touching selKey.
  _activateClip(id, clipId) {
    this.activeTarget = id; this.activeAnim = clipId; this.expanded.add(id);
    this.detailOpen = true;
    store.select(id);
    this.render();
  }

  // Add a keyframe at a CLIP-RELATIVE fraction (0..1) and select it.
  _addKfAt(id, clipId, ti, frac) {
    const a = store.getAnim(id, clipId); if (!a) return;
    const track = a.tracks && a.tracks[ti]; if (!track) return;
    const el = store.getElement(id);
    const val = ((el && el.props[track.prop]) || defaultKeyValue(track.prop, el));
    const kf = { t: frac, value: val, ease: "ease" };
    track.keyframes.push(kf);
    track.keyframes.sort((x, y) => x.t - y.t);
    this.activeTarget = id; this.activeAnim = clipId; this.expanded.add(id);
    this.selKey = { id, clipId, track: ti, index: track.keyframes.indexOf(kf) };
    this.detailOpen = true;
    store.select(id);
    store._emit({ type: "update", id });
    this.render();
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
    const playable = store.elements().filter(e => store.animsOf(e.id).some(a => a && (a.tracks || []).length));
    if (!playable.length) { toast("没有可播放的动画：先给元素添加片断", false); return; }
    // The canvas node map can be out of date (right after a structure change, say).
    // An element without a node has nothing to animate, so rebuild once and retry —
    // otherwise those elements are silently skipped and only the first one seems to play.
    const hasNode = (id) => (this.canvas.nodeFor ? !!this.canvas.nodeFor(id) : true);
    if (playable.some(e => !hasNode(e.id)) && typeof this.canvas.render === "function") this.canvas.render();

    let end = 1500, els = 0, clips = 0, anims = 0;
    const skipped = [], failed = [];
    for (const e of playable) {
      const cs = store.animsOf(e.id).filter(a => a && (a.tracks || []).length);
      els++; clips += cs.length;
      for (const a of cs) end = Math.max(end, (a.start || 0) + (a.duration || 600));
      const r = this._tryPreview(e.id);
      anims += r.count || 0;
      if (!r.count) { const why = r.why || "未知原因"; skipped.push(e.name + "（" + why + "）"); this._warnSkip(e, why); }
      if (r.failed && r.failed.length) { const why = "值无效：" + r.failed.join("/"); failed.push(e.name + "：" + r.failed.join("/")); this._warnSkip(e, why); }
    }
    this._playheadRun(end);
    let msg = `▶ 播放全部：${els} 个元素 · ${clips} 个片断 · ${anims} 条属性动画`;
    if (skipped.length) msg += `　未播放：${skipped.join("、")}`;
    if (failed.length) msg += `　值无效：${failed.join("、")}`;
    toast(msg, !skipped.length && !failed.length);
  }

  // detail for the console when something could not be played
  _warnSkip(el, why) {
    const node = this.canvas.nodeFor ? this.canvas.nodeFor(el.id) : null;
    const map = this.canvas.nodeMap;
    const keys = map ? [...map.keys()] : [];
    console.warn("[WebFacer 播放]", el.name, why, {
      元素id: el.id,
      画布里有这个id吗: keys.includes(el.id),
      画布节点数: keys.length,
      画布前几个id: keys.slice(0, 5),
      片断: store.animsOf(el.id).map(a => ({
        start: a.start, duration: a.duration,
        轨道: (a.tracks || []).map(t => t.prop + "×" + ((t.keyframes || []).length)),
      })),
    });
  }
  // One element blowing up must never stop the others from playing.
  _tryPreview(id) {
    try {
      return this.canvas.previewPlay(id) || {};
    } catch (err) {
      return { count: 0, failed: [], why: "播放出错：" + ((err && err.message) || err) };
    }
  }

  _playheadRun(end) {
    const start = performance.now();
    const step = (now) => { const t = (now - start) / end; this._movePlayhead(Math.min(1, t)); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  _movePlayhead(t) { const ph = $("#tl-playhead", this.masterEl); if (ph) ph.style.left = (t * 100) + "%"; }
}

function toast(text, ok = true) { window.dispatchEvent(new CustomEvent("webfacer:toast", { detail: { text, ok } })); }
