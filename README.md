# WebFace · 可视化 CSS 制作

一个像 PPT 一样的网页应用，用来**图形化地制作 CSS**：在画布上放置、拖动、缩放组件，用右侧面板调整样式，源代码实时生成，并把 `index.html` + `style.css` 导出到你选择的文件夹。

纯原生 HTML / JS / CSS 实现，**无需构建工具**，可离线打开使用。

## 运行

方式一：直接用浏览器打开 `index.html`（支持 `file://` 双击）。
> 已把 `js/` 下的 ES 模块打包成单文件 `js/bundle.js`（经典脚本），因此通过 `file://` 直接打开也能正常工作；而 Chrome 对 `file://` 下的原生 `import` 模块有限制。

方式二（推荐，用本地服务，导出文件夹功能更完整）：

```powershell
npm start            # 等价于 node serve.mjs . 4173
```
然后浏览器打开 <http://127.0.0.1:4173>

> 说明：“导出到所选文件夹”使用浏览器原生的 `showDirectoryPicker`，需要在 `http/https` 或 `localhost` 下打开才可用（Chrome/Edge）；`file://` 下会自动回退为“下载文件”。

## 开发 / 重新打包

源码是 ES 模块（`js/app.js`、`js/canvas.js` 等）。`index.html` 引用的是构建产物 `js/bundle.js`。如果你改了 `js/` 下的源码，需要重新生成：

```powershell
npm run build        # 等价于 node build.mjs ，生成 js/bundle.js
```

单独直接运行 `js/app.js` 需要本地服务环境（`npm start` 或其它静态服务器）。

## 使用流程

1. **新建项目**：点顶栏「新建」，设名称与画布尺寸；随后会让你**选择导出文件夹**（Chrome/Edge 支持 File System Access API）。
2. **添加元素**：从左侧「组件」面板把组件拖到画布（标题/正文/按钮/卡片/容器/图片/徽章/输入框/图标等）。
3. **编辑样式**：点击画布上的元素选中它，在右侧「检查器」按分类调整：
   - 位置与尺寸（X / Y / 宽 / 高）
   - 排版（字体 / 字号 / 字重 / 颜色 / 行高 / 对齐 / 字间距 / 装饰）
   - 背景（背景色 / 渐变或图片）
   - 边框（描边粗细 / 线型 / 颜色 / 圆角）
   - 间距（内边距 / 外边距）
   - 效果（阴影 / 不透明度 / 变换）
   - 内容（文字 / 图片地址）
   - 容器布局（Flex 方向 / 对齐 / 间距，容器类元素适用）
4. **图层**：左侧「图层」标签可查看元素树、点选、显示/隐藏。把元素拖进「卡片/容器」内会自动成为其子元素（导出时嵌套进该容器）。
5. **预览源码**：点顶栏「代码」，可切换查看：当前元素 CSS、整页 CSS、导出的 HTML。
6. **导出**：点顶栏「导出」下拉，选择「导出到所选文件夹」会把 `index.html` 与 `style.css` 写入该目录；或选「下载」单独下载文件。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z`（或 `Ctrl+Y`） |
| 复制选中元素 | `Ctrl+D` |
| 删除选中元素 | `Delete` / `Backspace` |
| 清除选择 / 关闭代码预览 | `Esc` |
| 双击元素 | 定位到其「内容」编辑 |

## 目录结构

```
index.html            页面骨架、工具栏、面板、预览、弹窗（引用 js/bundle.js）
css/app.css           设计系统与布局样式
js/app.js             入口，装配各模块、快捷键、弹窗（源码，ES 模块）
js/state.js           项目/元素状态、历史撤销重做、localStorage 持久化
js/canvas.js          画布渲染与交互（选中/移动/缩放/拖入/父子容器）
js/components.js      组件库定义与默认样式
js/inspector.js       右侧样式检查器
js/left-panel.js      左侧组件库 + 图层树
js/code-preview.js    源码实时预览（当前元素/整页 CSS / HTML）
js/render-css.js      元素→CSS 规则、类名分配、HTML 生成（预览与导出共用）
js/exporter.js        导出（File System Access API 写文件 + 下载回退）
js/util.js            通用工具
js/bundle.js          打包产物（由 build.mjs 生成，index.html 实际引用的文件）
build.mjs             打包脚本：把 js/*.js 的 ES 模块打成单文件经典脚本
serve.mjs             本地静态服务器（node serve.mjs . 4173）
```

## 说明

- 导出时按「画布绝对坐标」生成样式，尽可能还原 WYSIWYG 效果；子元素在导出中嵌套到其父容器内并相对定位。
- 导出文件夹选择使用浏览器原生 `showDirectoryPicker`，目前 Chrome / Edge 支持；不支持时自动改用「下载」方式。
