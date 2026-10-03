// app.js — WebFacer entry point: wires everything together.
import { store } from "./state.js";
import { Canvas } from "./canvas.js";
import { LeftPanel } from "./left-panel.js";
import { Inspector } from "./inspector.js";
import { CodePreview } from "./code-preview.js";
import { Exporter } from "./exporter.js";
import { Ribbon } from "./ribbon.js";
import { AnimationPanel } from "./animation.js";
import { getComponent } from "./components.js";
import { clamp, uid } from "./util.js";
import { buildCssText, buildHtmlText, computeClassMap, buildFuncContext } from "./render-css.js";

const $ = (sel) => document.querySelector(sel);

const refs = {
  projectName: $("#project-name"),
  btnCode: $("#btn-code"), btnSave: $("#btn-save"), btnExport: $("#btn-export"),
  zoomOut: $("#zoom-out"), zoomLevel: $("#zoom-level"), zoomIn: $("#zoom-in"),
  stage: $("#canvas-stage"),
  modes: $("#modes"), ribbon: $("#ribbon"),
  leftTabs: $("#left-tabs"), leftBody: $("#left-body"),
  inspector: $("#inspector"),
  codePreview: $("#code-preview"),
  modalNew: $("#start-panel"),
  newName: $("#new-name"), newWidth: $("#new-width"), newHeight: $("#new-height"),
  newFolder: $("#new-folder"), newFolderPick: $("#new-folder-pick"), newFolderClear: $("#new-folder-clear"),
  newCancel: $("#new-cancel"), newCreate: $("#new-create"), newDemo: $("#new-demo"),
  exportTarget: $("#export-target"),
  toast: $("#toast"),
};

// ---------- modules ----------
const canvas = new Canvas({ stage: refs.stage });
const leftPanel = new LeftPanel({ body: refs.leftBody }, canvas);
const inspector = new Inspector(refs.inspector);
const codePreview = new CodePreview(refs.codePreview);
const exporter = new Exporter(canvas);
const ribbon = new Ribbon(refs.modes, refs.ribbon, onRibbonTool);
const animPanel = new AnimationPanel($("#logic-panel"), $("#lp-logic"), $("#tl-master"), $("#tl-detail"), canvas);
$("#lp-close").addEventListener("click", () => animPanel.close());
store.on("change", (r) => {
  if (r.type === "selection" && animPanel.visible && store.selected().length === 1 && store.state.selectedId) {
    animPanel.setTarget(store.state.selectedId);
  }
});

// ---------- init data ----------
function seedDemo() {
  const name = "设计演示";
  const elements = [];
  const mk = (key, over) => {
    const el = makeElement(key, over);
    el.id = uid(el.type);
    elements.push(el);
    return el;
  };
  mk("heading", { name: "大标题", x: 80, y: 80, width: 460, content: "用 WebFacer 图形化制作 CSS" });
  const p = mk("paragraph", { name: "说明文字", x: 80, y: 140, width: 420, content: "从左侧拖入组件，点击画布上的元素，在右侧调整样式，代码会实时生成。" });
  p.props["font-size"] = "15px";
  mk("button", { name: "主按钮", x: 80, y: 280, width: 130, height: 42, content: "开始创作" });
  mk("badge", { name: "标签", x: 640, y: 90, width: 80, content: "NEW" });
  mk("card", { name: "卡片", x: 640, y: 150, width: 320, height: 220 });
  mk("image", { name: "配图", x: 200, y: 360, width: 300, height: 200 });
  return { name, elements };
}

function ensureInit() {
  const saved = store.loadLocal();
  if (saved) {
    store.state.name = saved.name;
    $("title").textContent = saved.name + " · WebFacer";
    refs.projectName.value = saved.name;
    return false;
  }
  // Fresh start: creation is the first step of the 构思 mode.
  store.project.name = "未命名项目";
  refs.projectName.value = "";
  return true;
}

const needCreate = ensureInit();
canvas.layout();
canvas.requestFocus();
setHeaderHeight();

function loadDemo() {
  const demo = seedDemo();
  store.project.name = demo.name;
  store.project.elements = demo.elements;
  store.project.canvasBg = "#ffffff";
  store.project.showGrid = false;
  refs.projectName.value = demo.name;
  $("title").textContent = demo.name + " · WebFacer";
  store._emit({ type: "structure" });
  canvas.layout();
}

// surface unexpected script errors instead of failing silently
window.addEventListener("error", (e) => {
  try { toast("脚本错误：" + (e.message || e), false); } catch (_) { /* ignore */ }
});

// ---------- helpers ----------
function toast(text, ok = true) {
  refs.toast.textContent = text;
  refs.toast.classList.remove("ok", "err");
  refs.toast.classList.add("show", ok ? "ok" : "err");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2600);
}
let toastTimer = null;
window.addEventListener("webfacer:toast", (ev) => toast(ev.detail.text, ev.detail.ok));

function selectedId() { return store.state.selectedId; }
function requireSelection() {
  const id = selectedId();
  if (!id) { toast("请先选中一个元素", false); return null; }
  return id;
}
function setHeaderHeight() {
  const top = document.getElementById("top");
  if (top) document.documentElement.style.setProperty("--header-h", top.offsetHeight + "px");
}
new ResizeObserver(setHeaderHeight).observe(document.getElementById("top"));

// ---------- add / actions ----------
function addAtCenter(typeKey) {
  const c = getComponent(typeKey);
  const W = store.state.width, H = store.state.height;
  const w = c.size.width, h = c.size.height;
  const base = (store.elements().length % 8) * 22;
  const x = Math.max(0, (W - w) / 2 + base);
  const y = Math.max(0, (H - h) / 2 + base);
  const el = store.addElement(typeKey, { x, y });
  store.select(el.id);
}
function deleteSelected() {
  store.selected().forEach(id => store.removeElement(id));
}
function duplicateSelected() {
  const src = store.getElement(selectedId());
  if (src) { store.copyElement(src.id); const el = store.pasteElement(); if (el) store.select(el.id); }
}
function copySelected() {
  const id = requireSelection();
  if (id) { store.copyElement(id); toast("已复制，右键或 Ctrl+V 粘贴"); }
}
function paste() {
  const el = store.pasteElement();
  if (el) store.select(el.id); else toast("剪贴板为空", false);
}
function toggleLock() {
  const ids = store.selected();
  if (!ids.length) { toast("请先选中一个元素", false); return; }
  const allLocked = ids.every(id => store.getElement(id).locked);
  const target = !allLocked;
  const all = new Set();
  ids.forEach(id => { all.add(id); store._descendants(id).forEach(d => all.add(d)); });
  store.updateMany([...all], { locked: target });
  toast(target ? "已锁定所选（含子级）" : "已解锁所选（含子级）");
}
// top-most selected elements: those whose ancestor is not also selected
function selectionRoots() {
  const ids = store.selected();
  const set = new Set(ids);
  return ids.filter(id => {
    let p = (store.getElement(id) || {}).parentId;
    while (p) { if (set.has(p)) return false; p = (store.getElement(p) || {}).parentId; }
    return true;
  });
}
function toggleHide() {
  const ids = store.selected();
  if (!ids.length) { toast("请先选中一个元素", false); return; }
  ids.forEach(id => store.toggleHidden(id));
}

// ---------- zoom ----------
function applyZoomUI() { refs.zoomLevel.textContent = Math.round(store.state.zoom * 100) + "%"; }
refs.zoomOut.addEventListener("click", () => store.setZoom(store.state.zoom - 0.1));
refs.zoomIn.addEventListener("click", () => store.setZoom(store.state.zoom + 0.1));
refs.zoomLevel.addEventListener("click", () => store.setZoom(1));
store.on("change", (r) => { if (r.type === "zoom") applyZoomUI(); });
applyZoomUI();

function fitToView() {
  const stageEl = canvas.stage;
  const w = store.state.width, h = store.state.height;
  const sw = stageEl.clientWidth - 80, sh = stageEl.clientHeight - 80;
  if (sw > 0 && sh > 0) {
    const z = Math.min(sw / w, sh / h, 1);
    store.setZoom(Number(z.toFixed(2)));
  }
}

// ---------- project name / save ----------
refs.projectName.addEventListener("change", () => {
  const v = refs.projectName.value.trim() || "未命名项目";
  store.setProjectName(v);
  $("title").textContent = v + " · WebFacer";
});
function focusName() { refs.projectName.focus(); refs.projectName.select(); }
refs.btnSave.addEventListener("click", doSave);
function doSave() {
  const ok = store.saveLocal();
  toast(ok ? "已保存到浏览器本地" : "保存失败", ok);
}

// ---------- code preview ----------
refs.btnCode.addEventListener("click", () => codePreview.toggle());
function copyCode(kind) {
  const elements = store.elements();
  const classMap = computeClassMap(elements);
  const ctx = buildFuncContext(elements);
  const text = kind === "html"
    ? buildHtmlText(elements, { classMap, title: store.state.name })
    : buildCssText(elements, { classMap, ctx, pageWidth: store.state.width, pageHeight: store.state.height });
  const ok = navigator.clipboard && navigator.clipboard.writeText;
  if (ok) { navigator.clipboard.writeText(text).then(() => toast("已复制 " + (kind === "html" ? "HTML" : "CSS"))); }
  else toast("当前环境不支持复制", false);
}

// ---------- export ----------
exporter.attachMenu(refs.btnExport);
function refreshExportUI() {
  const name = exporter.folderName;
  const t = refs.exportTarget;
  if (name) {
    t.hidden = false;
    t.textContent = "📁 " + name;
    t.title = "导出到：" + name + "（点击更换/导出）";
  } else {
    t.hidden = true;
    t.textContent = "";
    t.title = "尚未选择导出文件夹（「交付」→ 导出到文件夹 或 下载）";
  }
  refs.newFolder.value = name || "";
  refs.newFolderClear.hidden = !name;
}
function setExportFolder(handle) { exporter.dirHandle = handle; refreshExportUI(); }
async function pickExportFolder() {
  if (!exporter.support) { toast("当前环境不支持选择文件夹，导出时以下载方式保存", false); return; }
  try {
    const h = await exporter.chooseFolder();
    setExportFolder(h);
    toast(`导出文件夹：${h.name}`);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    toast("无法选择文件夹：" + (e.message || e), false);
  }
}
refs.newFolderPick.addEventListener("click", pickExportFolder);
refs.newFolderClear.addEventListener("click", () => setExportFolder(null));
refs.exportTarget.addEventListener("click", () => exporter.toggleMenu(refs.btnExport));
window.addEventListener("webfacer:exportfolder", refreshExportUI);
refreshExportUI();

// ---------- project creation (inside the 构思 step) ----------
function openNewModal() {
  refs.modalNew.hidden = false;
  if (ribbon) ribbon.setMode("ideate");
  setTimeout(() => { refs.newName.focus(); refs.newName.select(); }, 0);
}
function createProject() {
  try {
    const name = refs.newName.value.trim() || "未命名项目";
    const width = clamp(parseInt(refs.newWidth.value, 10) || 1200, 200, 8000);
    const height = clamp(parseInt(refs.newHeight.value, 10) || 800, 200, 8000);
    store.newProject({ name, width, height });
    refs.projectName.value = name;
    $("title").textContent = name + " · WebFacer";
    refs.modalNew.hidden = true;
    canvas.layout();
    canvas.requestFocus();
    toast(`已创建「${name}」`);
    refreshExportUI();
  } catch (err) {
    toast("创建失败：" + (err && err.message ? err.message : err), false);
    console.error(err);
  }
}
refs.newCancel.addEventListener("click", () => { refs.modalNew.hidden = true; });
refs.newCreate.addEventListener("click", createProject);
if (refs.newDemo) refs.newDemo.addEventListener("click", () => { loadDemo(); refs.modalNew.hidden = true; toast("已载入示例内容"); });

// ---------- ribbon tool dispatch ----------
// Each entrance preset applies ONLY its own effect (one track), no extras.
const ENTRANCE = {
  "enter-fade": [{ prop: "opacity", from: "0", to: "1" }],
  "enter-up": [{ prop: "transform", from: "translateY(40px)", to: "none" }],
  "enter-left": [{ prop: "transform", from: "translateX(-60px)", to: "none" }],
  "enter-zoom": [{ prop: "transform", from: "scale(.6)", to: "none" }],
  "enter-rotate": [{ prop: "transform", from: "rotate(-14deg)", to: "none" }],
};
function applyEntrancePreset(key) {
  const ids = store.selected();
  if (!ids.length) { toast("请先选中元素", false); return; }
  const props = ENTRANCE[key];
  if (!props) return;
  ids.forEach(id => store.addAnim(id, {
    label: "入场", start: 0, duration: 600,
    tracks: props.map(p => ({ prop: p.prop, keyframes: [
      { t: 0, value: p.from, ease: "ease" },
      { t: 1, value: p.to, ease: "ease" },
    ] })),
  }));
  toast("已为所选元素添加一段入场动画（可在时间轴叠加/排序）");
  if (!animPanel.visible) animPanel.setVisible(true);
  animPanel.setActive(ids[ids.length - 1]);
}

function onRibbonTool(tool) {
  if (tool.type === "add") { addAtCenter(tool.component); return; }
  const id = store.state.selectedId;
  switch (tool.id) {
    // page
    // page
    case "project-new": openNewModal(); break;
    case "load-demo": loadDemo(); toast("已载入示例内容"); break;
    case "new": openNewModal(); break;
    case "save": doSave(); break;
    case "rename": focusName(); break;
    case "zoom-reset": store.setZoom(1); break;
    case "zoom-fit": fitToView(); break;
    case "bg-white": store.setCanvasBg("#ffffff"); break;
    case "bg-dark": store.setCanvasBg("#20232a"); break;
    // layout
    case "align-left": case "align-center-x": case "align-right":
    case "align-top": case "align-center-y": case "align-bottom": {
      const ids = selectionRoots(); if (!ids.length) { toast("请先选中元素", false); break; }
      const which = tool.id.replace("align-", "");
      ids.forEach(x => store.alignElement(x, which));
      break;
    }
    case "z-front": case "z-up": case "z-down": case "z-back": {
      const ids = store.selected(); if (!ids.length) { toast("请先选中元素", false); break; }
      const dir = tool.id.replace("z-", "");
      ids.forEach(x => store.moveZ(x, dir));
      break;
    }
    case "lock": toggleLock(); break;
    case "hide": toggleHide(); break;
    case "group": {
      const ids = store.selected();
      if (store.selected().length < 2) { toast("请至少选中 2 个元素", false); break; }
      if (store.groupElements(ids)) toast("已编组（只新增一层，保留内部嵌套）");
      else toast("请至少选中 2 个元素", false);
      break;
    }
    case "ungroup": {
      const ids = store.selected().filter(id => { const e = store.getElement(id); return e && e.type === "group"; });
      if (!ids.length) { toast("请先选中一个编组（▣）", false); break; }
      ids.forEach(id => store.ungroupElement(id));
      toast("已取消编组（子级已提升，未删除）");
      break;
    }
    case "indent": {
      const id = store.state.selectedId;
      if (!id) { toast("请先选中元素", false); break; }
      if (!store.indentElement(id)) toast("找不到可作为父级的容器", false);
      break;
    }
    case "outdent": {
      const id = store.state.selectedId;
      if (!id) { toast("请先选中元素", false); break; }
      if (!store.outdentElement(id)) toast("已在顶层", false);
      break;
    }
    case "copy": copySelected(); break;
    case "paste": paste(); break;
    case "delete": deleteSelected(); break;
    // motion
    case "logic-panel": animPanel.toggle(); break;
    case "enter-fade": case "enter-up": case "enter-left":
    case "enter-zoom": case "enter-rotate": applyEntrancePreset(tool.id); break;
    // deliver
    case "code": codePreview.toggle(); break;
    case "copy-css": copyCode("css"); break;
    case "copy-html": copyCode("html"); break;
    case "export": exporter.exportToFolder(true); break;
    case "download": exporter.downloadFiles(); break;
    default: break;
  }
}

// ---------- canvas right-click context menu ----------
function showContextMenu(x, y) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  const sel = selectedId();
  const hasSel = !!sel;
  const add = (icon, label, kbd, disabled, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctx-item";
    b.disabled = !!disabled;
    b.innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>${kbd ? `<span class="kbd">${kbd}</span>` : ""}`;
    b.addEventListener("click", () => { closeContextMenu(); fn && fn(); });
    menu.appendChild(b);
  };
  const sep = () => { const d = document.createElement("div"); d.className = "ctx-sep"; menu.appendChild(d); };

  add("↶", "撤销", "Ctrl+Z", !store.canUndo, () => store.undo());
  add("↷", "重做", "Ctrl+Y", !store.canRedo, () => store.redo());
  sep();
  add("⧉", "复制", "Ctrl+C", !hasSel, copySelected);
  add("📋", "粘贴", "Ctrl+V", !store.canPaste, paste);
  sep();
  add("🗑", "删除", "Del", !hasSel, deleteSelected);
  add("⇞", "置顶", "", !hasSel, () => store.moveZ(sel, "front"));
  add("⇟", "置底", "", !hasSel, () => store.moveZ(sel, "back"));
  sep();
  const selCount = store.selected().length;
  add("▣", "编组", "", selCount < 2, () => {
    if (store.groupElements(store.selected())) toast("已编组（只新增一层，保留内部嵌套）");
    else toast("请至少选中 2 个元素", false);
  });
  add("▢", "取消编组", "", !hasSel || (store.getElement(sel) || {}).type !== "group", () => {
    store.ungroupElement(sel);
    toast("已取消编组（子级已提升，未删除）");
  });

  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - mw - 8) + "px";
  menu.style.top = Math.min(y, vh - mh - 8) + "px";
  menu.style.visibility = "visible";
  document.addEventListener("pointerdown", outsideClose);
  // bind context menu element ref
  closeContextMenu._menu = menu;
}
function outsideClose(ev) {
  if (closeContextMenu._menu && !closeContextMenu._menu.contains(ev.target)) closeContextMenu();
}
function closeContextMenu() {
  if (closeContextMenu._menu) { closeContextMenu._menu.remove(); closeContextMenu._menu = null; }
  document.removeEventListener("pointerdown", outsideClose);
}
function attachContextMenu() {
  const el = canvas.canvas;
  el.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const node = ev.target.closest(".el");
    if (node && node.dataset.id) store.select(node.dataset.id);
    showContextMenu(ev.clientX, ev.clientY);
  });
}
attachContextMenu();

// ---------- keyboard shortcuts ----------
window.addEventListener("keydown", (ev) => {
  const tag = (ev.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || ev.target.isContentEditable) return;
  const mod = ev.ctrlKey || ev.metaKey;
  const k = ev.key.toLowerCase();
  if (mod && k === "z") { ev.preventDefault(); if (ev.shiftKey) store.redo(); else store.undo(); }
  else if (mod && k === "y") { ev.preventDefault(); store.redo(); }
  else if (mod && k === "c") { ev.preventDefault(); copySelected(); }
  else if (mod && k === "v") { ev.preventDefault(); paste(); }
  else if (mod && k === "d") { ev.preventDefault(); duplicateSelected(); }
  else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); deleteSelected(); }
  else if (ev.key === "Escape") { store.clearSelection(); codePreview.toggle(false); closeContextMenu(); }
});

// re-render selection frame initial if a demo was seeded
canvas.updateSelectionFrame();

// fresh start: the 构思 step opens the project-creation panel
if (needCreate) openNewModal();
