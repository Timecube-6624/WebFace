// ribbon.js — PowerPoint-style mode tabs + per-mode tool groups (ribbon).
// Each tool is either { type:'add', component, label, icon } to insert a
// component, or { id, label, icon } dispatched to the app's handler.

export const MODES = [
  {
    id: "ideate", label: "构思",
    groups: [
      { label: "文本内容", tools: [
        { type: "add", component: "heading", label: "标题", icon: "H" },
        { type: "add", component: "paragraph", label: "正文", icon: "¶" },
        { type: "add", component: "button", label: "按钮", icon: "▣" },
        { type: "add", component: "badge", label: "徽章", icon: "◉" },
        { type: "add", component: "link", label: "链接", icon: "↗" },
        { type: "add", component: "input", label: "输入框", icon: "⌗" },
      ]},
      { label: "媒体与组件", tools: [
        { type: "add", component: "image", label: "图片", icon: "◇" },
        { type: "add", component: "emoji", label: "图标", icon: "☺" },
        { type: "add", component: "card", label: "卡片", icon: "▭" },
        { type: "add", component: "container", label: "容器", icon: "⊡" },
        { type: "add", component: "divider", label: "分割线", icon: "―" },
      ]},
    ],
  },
  {
    id: "page", label: "页面",
    groups: [
      { label: "画布", tools: [
        { id: "new", label: "新建", icon: "＋" },
        { id: "save", label: "保存", icon: "▤" },
        { id: "rename", label: "重命名", icon: "✎" },
      ]},
      { label: "视图", tools: [
        { id: "zoom-reset", label: "100%", icon: "⤢" },
        { id: "zoom-fit", label: "适应", icon: "⛶" },
      ]},
      { label: "背景", tools: [
        { id: "bg-white", label: "白底", icon: "▢" },
        { id: "bg-dark", label: "深底", icon: "▣" },
      ]},
    ],
  },
  {
    id: "layout", label: "排布",
    groups: [
      { label: "对齐", tools: [
        { id: "align-left", label: "左对齐", icon: "⬅" },
        { id: "align-center-x", label: "水平居中", icon: "↔" },
        { id: "align-right", label: "右对齐", icon: "➡" },
        { id: "align-top", label: "顶对齐", icon: "⬆" },
        { id: "align-center-y", label: "垂直居中", icon: "↕" },
        { id: "align-bottom", label: "底对齐", icon: "⬇" },
      ]},
      { label: "层级", tools: [
        { id: "z-front", label: "置顶", icon: "⇞" },
        { id: "z-up", label: "上移", icon: "▲" },
        { id: "z-down", label: "下移", icon: "▼" },
        { id: "z-back", label: "置底", icon: "⇟" },
      ]},
      { label: "对象", tools: [
        { id: "lock", label: "锁定", icon: "🔒" },
        { id: "hide", label: "隐藏", icon: "◐" },
        { id: "copy", label: "复制", icon: "⧉" },
        { id: "paste", label: "粘贴", icon: "📋" },
        { id: "delete", label: "删除", icon: "🗑" },
      ]},
    ],
  },
  {
    id: "motion", label: "动态",
    groups: [
      { label: "逻辑动画", tools: [
        { id: "logic-panel", label: "逻辑面板", icon: "⧉" },
      ]},
      { label: "入场动画", tools: [
        { id: "enter-fade", label: "淡入", icon: "◌" },
        { id: "enter-up", label: "上滑", icon: "↥" },
        { id: "enter-left", label: "左滑", icon: "↤" },
        { id: "enter-zoom", label: "缩放", icon: "⤢" },
        { id: "enter-rotate", label: "旋转", icon: "↻" },
      ]},
    ],
  },
  {
    id: "deliver", label: "交付",
    groups: [
      { label: "代码", tools: [
        { id: "code", label: "代码预览", icon: "‹›" },
        { id: "copy-css", label: "复制 CSS", icon: "{}" },
        { id: "copy-html", label: "复制 HTML", icon: "<>" },
      ]},
      { label: "导出", tools: [
        { id: "export", label: "导出到文件夹", icon: "📁" },
        { id: "download", label: "下载文件", icon: "⬇" },
        { id: "save", label: "保存", icon: "▤" },
      ]},
    ],
  },
];

export class Ribbon {
  constructor(modesEl, ribbonEl, onTool, active = "ideate") {
    this.modesEl = modesEl;
    this.ribbonEl = ribbonEl;
    this.onTool = onTool;
    this.active = active;
    this._renderModes();
    this.setMode(this.active);
  }

  _renderModes() {
    this.modesEl.textContent = "";
    for (const m of MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mode-tab";
      b.dataset.mode = m.id;
      b.textContent = m.label;
      b.addEventListener("click", () => this.setMode(m.id));
      this.modesEl.appendChild(b);
    }
  }

  setMode(id) {
    this.active = MODES.some(m => m.id === id) ? id : "ideate";
    [...this.modesEl.children].forEach(t => t.classList.toggle("active", t.dataset.mode === this.active));
    this._renderRibbon();
  }

  _renderRibbon() {
    const mode = MODES.find(m => m.id === this.active) || MODES[0];
    const frag = document.createDocumentFragment();
    for (const g of mode.groups) {
      const grp = document.createElement("div");
      grp.className = "ribbon-group";
      const label = document.createElement("div");
      label.className = "ribbon-group-label";
      label.textContent = g.label;
      const tools = document.createElement("div");
      tools.className = "ribbon-tools";
      for (const t of g.tools) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ribbon-tool";
        b.title = t.label + (t.type === "add" ? "（插入到画布）" : "");
        const icon = document.createElement("span");
        icon.className = "rt-icon";
        icon.textContent = t.icon;
        const lbl = document.createElement("span");
        lbl.className = "rt-label";
        lbl.textContent = t.label;
        b.appendChild(icon);
        b.appendChild(lbl);
        b.addEventListener("click", () => this.onTool(t));
        tools.appendChild(b);
      }
      grp.appendChild(label);
      grp.appendChild(tools);
      frag.appendChild(grp);
    }
    this.ribbonEl.textContent = "";
    this.ribbonEl.appendChild(frag);
  }
}
