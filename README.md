# PinNote

![PinNote logo](build-res/icon.png)

**轻量级视觉反馈标注工具 · Lightweight Visual Feedback Tool**

在图片上打点、画框、写修改建议、配参考图，一键导出长页 PDF 反馈文档。
Annotate screenshots, gather suggestions, attach references, and export everything as one long-page PDF.

![PinNote 应用截图](docs/screenshot.png)

**[简体中文](#简体中文)** | **[English](#english)** | **[更新日志 Changelog](CHANGELOG.md)**

---

## 简体中文

### 为什么做 PinNote

电商详情页审核、设计评审、UI 走查……纯文字很难说清 **「问题在哪里、要改成什么样」**。

PinNote 把零散的视觉反馈整理成一张清晰、可执行的修改方案：

| | |
|---|---|
| 📍 **精准标注** | 标记点 / 框选区域，缩放画布，逐条定位问题 |
| ✍️ **修改说明** | 每条标注自动连线到建议框，随标注实时更新 |
| 🖼 **参考示例** | 拖入或粘贴参考图，直观表达「改成什么样」 |
| 📄 **一键交付** | 导出长页单页 PDF，直接发给设计师 / 研发 / 供应商 |

### 核心能力

- **多图拼接**：多张长图纵向无缝拼接成一张画布，也可创建空白项目后随时补充
- **粘贴即用**：Ctrl+V 直接粘贴截图，自由选择粘贴为设计稿或参考图
- **版本管理**：项目 / 版本两级管理（V1、V2…），支持重命名、归档、右键菜单操作
- **自动保存**：0.6s 防抖自动保存，顶栏实时显示保存状态
- **导出可控**：2x 超采样长页单页 PDF，超长图自动等比缩放不裁切
- **纯本地**：无账号、无联网、无云端服务，数据完全保存在本地

### 下载

前往 **[Releases](https://github.com/ColinChen404/pinnote/releases/latest)** 下载最新版安装包（如 `PinNote Setup 1.3.0.exe`），按向导安装即用。

✅ Windows 10 / 11

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| V | 鼠标（选择 / 拖动） |
| P | 点批注 |
| B | 框批注 |
| Ctrl+V | 粘贴图片 |
| Ctrl+S | 保存 |
| Delete | 删除选中标注 |
| Esc | 关闭弹窗 / 退出工具 |
| Ctrl+滚轮 / + / − / 0 | 缩放 / 重置缩放 |

### 数据与隐私

- 项目数据（设计稿、标注、建议、参考图）保存在 `%APPDATA%\PinNote\store\`
- 导入的图片会复制进项目目录，删除原图不影响已有项目
- 卸载软件不会自动删除项目数据

### 开发

```bash
npm install      # 安装依赖（包含 Electron 运行时）
npm start        # 启动应用（开发态）
npm run smoke    # 运行 45 项自动化冒烟测试
npm run build    # 打包 Windows 安装包到 dist/
```

技术栈：**Electron + 原生 JavaScript + 本地 JSON 存储**，无前端框架、无构建步骤。
技术细节与开发约定见 [交接说明](交接说明-面向新开发Agent.md)。

### 字体说明

应用内置 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)（思源黑体同源设计），依 [SIL Open Font License](build-res/fonts/LICENSE-NotoSansSC-OFL.txt) 随应用分发。

### 设计理念

PinNote 不追求成为复杂的协作平台，它只专注解决一个问题：

> **让视觉反馈更准确，让修改沟通更高效。**

---

## English

### Why PinNote

Design reviews, e-commerce page audits, UI walkthroughs — plain text can never clearly express *where the problem is and what the expected result looks like*.

PinNote turns scattered visual feedback into one clear, actionable document:

| | |
|---|---|
| 📍 **Precise annotation** | Pin points and box highlights on a zoomable canvas |
| ✍️ **Suggestions** | Each annotation auto-connects to its note card |
| 🖼 **References** | Drag or paste reference images to show the desired look |
| 📄 **One-click delivery** | Export a single long-page PDF for designers / developers / vendors |

### Features

- **Multi-page canvas**: stitch multiple long screenshots seamlessly; start from a blank project anytime
- **Paste to annotate**: Ctrl+V any screenshot, choose to paste as canvas or reference
- **Version management**: projects and versions (V1, V2…) with rename, archive, and context menus
- **Autosave**: 0.6s debounced autosave with live status in the title bar
- **Export**: 2x supersampled single-page PDF; oversized pages auto-scale without cropping
- **Fully local**: no account, no network, no cloud — data never leaves your machine

### Download

Grab the latest installer from **[Releases](https://github.com/ColinChen404/pinnote/releases/latest)** (e.g. `PinNote Setup 1.3.0.exe`).

✅ Windows 10 / 11

### Shortcuts

| Key | Action |
| --- | --- |
| V | Mouse (select / drag) |
| P | Pin annotation |
| B | Box annotation |
| Ctrl+V | Paste image |
| Ctrl+S | Save |
| Delete | Delete selected annotation |
| Esc | Close dialog / exit tool |
| Ctrl+Wheel / + / − / 0 | Zoom / reset zoom |

### Data & Privacy

- Projects live in `%APPDATA%\PinNote\store\`
- Imported images are copied into the project; deleting originals is safe
- Uninstalling never deletes your project data

### Development

```bash
npm install      # install dependencies (Electron runtime included)
npm start        # run the app in dev mode
npm run smoke    # run 45 automated smoke assertions
npm run build    # build the Windows installer into dist/
```

Stack: **Electron + vanilla JavaScript + local JSON storage** — no frontend framework, no build step. See the [development notes](交接说明-面向新开发Agent.md) (Chinese).

### Typeface

The app bundles [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) (the same design as Source Han Sans), distributed under the [SIL Open Font License](build-res/fonts/LICENSE-NotoSansSC-OFL.txt).

### Philosophy

> Making visual communication clearer and easier.

---

## License / 许可

[MIT](LICENSE) © Colin Chen · Typeface 字体: [Noto Sans SC](build-res/fonts/LICENSE-NotoSansSC-OFL.txt) (SIL OFL)
