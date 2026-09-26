// components.js — component type definitions (library) and defaults.
// NOTE: all CSS property keys are kebab-case so they are valid both as
// inline CSS (CSSStyleDeclaration.setProperty) and in exported CSS text.

export const COMPONENTS = {
  heading: {
    key: "heading",
    label: "标题",
    icon: "H",
    tag: "h2",
    isContainer: false,
    size: { width: 320, height: 44 },
    content: "标题文字",
    props: {
      "font-size": "28px", "font-weight": 700, "color": "#111827",
      "line-height": 1.2, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "0px", "background-color": "transparent",
      "border-width": "0px", "border-style": "none", "border-color": "transparent",
      "border-radius": "0px", "box-shadow": "none", "opacity": 1,
      "display": "block", "width": "100%", "height": "auto",
    },
  },
  paragraph: {
    key: "paragraph",
    label: "正文",
    icon: "¶",
    tag: "p",
    isContainer: false,
    size: { width: 340, height: 80 },
    content: "这是一段正文文字，用来演示段落样式。",
    props: {
      "font-size": "15px", "font-weight": 400, "color": "#374151",
      "line-height": 1.7, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "0px", "background-color": "transparent",
      "border-width": "0px", "border-style": "none", "border-color": "transparent",
      "border-radius": "0px", "box-shadow": "none", "opacity": 1,
      "display": "block", "width": "100%", "height": "auto",
    },
  },
  button: {
    key: "button", label: "按钮", icon: "▣", tag: "button", isContainer: false,
    size: { width: 120, height: 40 },
    content: "按钮",
    props: {
      "font-size": "14px", "font-weight": 600, "color": "#ffffff",
      "line-height": 1, "text-align": "center", "font-family": "inherit",
      "margin": "0px", "padding": "0px 20px", "background-color": "#4f8cff",
      "border-width": "0px", "border-style": "solid", "border-color": "transparent",
      "border-radius": "8px", "box-shadow": "0 2px 8px rgba(79,140,255,.35)", "opacity": 1,
      "display": "inline-flex", "width": "auto", "height": "auto",
      "align-items": "center", "justify-content": "center",
    },
  },
  card: {
    key: "card", label: "卡片", icon: "▭", tag: "div", isContainer: true,
    size: { width: 260, height: 180 },
    content: "",
    props: {
      "font-size": "14px", "font-weight": 400, "color": "#111827",
      "line-height": 1.5, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "20px", "background-color": "#ffffff",
      "border-width": "1px", "border-style": "solid", "border-color": "#e5e7eb",
      "border-radius": "12px", "box-shadow": "0 6px 18px rgba(0,0,0,.08)", "opacity": 1,
      "display": "block", "width": "100%", "height": "100%",
      "align-items": "flex-start", "justify-content": "flex-start", "gap": "8px",
    },
  },
  container: {
    key: "container", label: "容器", icon: "⊡", tag: "div", isContainer: true,
    size: { width: 420, height: 260 },
    content: "",
    props: {
      "font-size": "14px", "font-weight": 400, "color": "#111827",
      "line-height": 1.5, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "16px", "background-color": "rgba(255,255,255,0.0)",
      "border-width": "0px", "border-style": "solid", "border-color": "#e5e7eb",
      "border-radius": "0px", "box-shadow": "none", "opacity": 1,
      "display": "block", "width": "100%", "height": "100%",
      "align-items": "flex-start", "justify-content": "flex-start", "gap": "10px",
    },
  },
  image: {
    key: "image", label: "图片", icon: "◇", tag: "img", isContainer: false,
    size: { width: 220, height: 150 },
    content: "",
    props: {
      "font-size": "14px", "font-weight": 400, "color": "#9aa3b2",
      "line-height": 1.5, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "0px", "background-color": "#e5e7eb",
      "border-width": "0px", "border-style": "solid", "border-color": "transparent",
      "border-radius": "8px", "box-shadow": "none", "opacity": 1,
      "display": "flex", "width": "100%", "height": "100%",
      "object-fit": "cover", "align-items": "center", "justify-content": "center",
    },
  },
  badge: {
    key: "badge", label: "徽章", icon: "◉", tag: "span", isContainer: false,
    size: { width: 90, height: 26 },
    content: "NEW",
    props: {
      "font-size": "12px", "font-weight": 600, "color": "#ffffff",
      "line-height": 1, "text-align": "center", "font-family": "inherit",
      "margin": "0px", "padding": "4px 12px", "background-color": "#10b981",
      "border-width": "0px", "border-style": "solid", "border-color": "transparent",
      "border-radius": "999px", "box-shadow": "none", "opacity": 1,
      "display": "inline-flex", "width": "auto", "height": "auto",
      "align-items": "center", "justify-content": "center",
    },
  },
  input: {
    key: "input", label: "输入框", icon: "⌗", tag: "input", isContainer: false,
    size: { width: 240, height: 38 },
    content: "请输入…",
    props: {
      "font-size": "14px", "font-weight": 400, "color": "#111827",
      "line-height": 1.5, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "0px 12px", "background-color": "#ffffff",
      "border-width": "1px", "border-style": "solid", "border-color": "#d1d5db",
      "border-radius": "8px", "box-shadow": "none", "opacity": 1,
      "display": "block", "width": "100%", "height": "100%",
    },
  },
  link: {
    key: "link", label: "链接", icon: "↗", tag: "a", isContainer: false,
    size: { width: 90, height: 22 },
    content: "了解更多",
    props: {
      "font-size": "14px", "font-weight": 400, "color": "#4f8cff",
      "line-height": 1.5, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "0px", "background-color": "transparent",
      "border-width": "0px", "border-style": "solid", "border-color": "transparent",
      "border-radius": "0px", "box-shadow": "none", "opacity": 1,
      "display": "inline-block", "width": "auto", "height": "auto",
      "text-decoration": "underline",
    },
  },
  divider: {
    key: "divider", label: "分割线", icon: "―", tag: "hr", isContainer: false,
    size: { width: 300, height: 2 },
    content: "",
    props: {
      "font-size": "14px", "font-weight": 400, "color": "#e5e7eb",
      "line-height": 1.5, "text-align": "left", "font-family": "inherit",
      "margin": "0px", "padding": "0px", "background-color": "#e5e7eb",
      "border-width": "0px", "border-style": "solid", "border-color": "transparent",
      "border-radius": "0px", "box-shadow": "none", "opacity": 1,
      "display": "block", "width": "100%", "height": "2px",
    },
  },
  emoji: {
    key: "emoji", label: "图标", icon: "☺", tag: "div", isContainer: false,
    size: { width: 56, height: 56 },
    content: "😀",
    props: {
      "font-size": "44px", "font-weight": 400, "color": "#111827",
      "line-height": 1, "text-align": "center", "font-family": "inherit",
      "margin": "0px", "padding": "0px", "background-color": "transparent",
      "border-width": "0px", "border-style": "solid", "border-color": "transparent",
      "border-radius": "0px", "box-shadow": "none", "opacity": 1,
      "display": "flex", "width": "auto", "height": "auto",
      "align-items": "center", "justify-content": "center",
    },
  },
};

// order for the library grid
export const LIBRARY_ORDER = [
  "heading", "paragraph", "button", "badge", "link", "input",
  "card", "container", "image", "divider", "emoji",
];

export function getComponent(key) {
  return COMPONENTS[key] || COMPONENTS.container;
}

export function makeElement(typeKey, overrides = {}) {
  const c = getComponent(typeKey);
  const def = {
    id: "", // assigned by state
    type: c.key,
    name: c.label,
    x: 60, y: 60,
    width: c.size.width,
    height: c.size.height,
    parentId: null,
    props: deepCloneProps(c.props),
    content: c.content,
    locked: false,
  };
  return Object.assign(def, overrides);
}

function deepCloneProps(p) { return JSON.parse(JSON.stringify(p || {})); }
