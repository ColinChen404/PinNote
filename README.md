# PinNote

<img src="build-res/icon.png" width="160" alt="PinNote">

## 把设计稿上的问题钉清楚

**一款轻量的设计稿评审工具。**

直接在详情页、UI 稿和截图上打点、框选、写修改意见、附参考图，
再导出为一份清楚、可执行的 PDF 修改单。

无需登录 · 无需上传 · 数据保存在本机

**English**

Turn visual feedback into clear, actionable revisions.

A lightweight tool for reviewing designs, attaching references,
and exporting structured PDF feedback.

**⬇️ [下载最新版 Download](https://github.com/ColinChen404/pinnote/releases/latest)** · Windows 10 / 11

![PinNote 应用截图](docs/screenshot.png)

**[简体中文](#简体中文)** | **[English](#english)** | **[更新日志 Changelog](CHANGELOG.md)**

---

## 简体中文

### 为什么做 PinNote

PinNote 最初只是为了解决一个很具体的问题：**怎么给一张电商详情页提修改意见。**

过去我们的做法，像是从石器时代一路传承下来的：先给详情页截图，再把图片一张张塞进 Excel，最后在旁边另开一列写反馈。

这种方法不是完全不能用，毕竟我也真这么用了四年。问题是，描述"怎么改"往往并不难，痛苦的是每条意见之前，还得先描述"要改的地方到底在哪里"。

"第二屏偏下那张产品图的右边。"
"不是主标题，是主标题下面那行小字。"
"再往下一点，对，就是那里。"

一条本来十几个字就能说清的修改意见，前面常常要先加上一大段寻址说明。反馈的人写得累，设计师找得也累；等设计稿换了一版，截图、排版和位置还得重新来一遍。

其实第一年我就在想：为什么不能直接在原图上点一下？

点出问题位置，框出修改范围，在旁边写清楚怎么改；如果语言还是不够，就再放一张参考图。最后把所有意见整理成一份修改单，直接发给设计师、开发或供应商。不就完了吗？

可惜我不会编程。

感谢有 vibe-coding 的时代。

### 核心能力

- **多图拼接**：多张长图纵向无缝拼接成一张画布，也可创建空白项目后随时补充
- **粘贴即用**：Ctrl+V 直接粘贴截图，自由选择粘贴为设计稿或参考图
- **版本管理**：项目 / 版本两级管理（V1、V2…），支持重命名、归档、右键菜单操作
- **自动保存**：0.6s 防抖自动保存，顶栏实时显示保存状态
- **导出可控**：2x 超采样长页单页 PDF，超长图自动等比缩放不裁切
- **纯本地**：无账号、无联网、无云端服务，数据完全保存在本地

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

PinNote 不追求成为复杂的在线协作或审批平台，只专注解决一个问题：

> 让设计反馈落在具体位置上，变成清楚、可执行的修改意见。

一个人用 PinNote 整理反馈，其他人通过 PDF 接收和执行。
无需登录，无需上传，项目数据保存在本机。

---

## English

### Why PinNote

PinNote started from a very specific problem: **how do you give feedback on an e-commerce product page?**

The old workflow felt inherited from the stone age: screenshot every section of the page, paste the images into Excel one by one, and write your feedback in a column beside them.

It kind of works — I did exactly that for four years. The trouble is, describing *what to change* is easy; the painful part is that every comment has to start by describing *where on earth it applies*.

"Bottom of screen two, the product image, on the right."
"Not the headline — the small line under it."
"A bit lower. Yes, there."

A ten-word comment ends up wearing a whole paragraph of directions. Writing feedback gets exhausting, and finding the spot gets exhausting for the designer too — and when a new draft arrives, the screenshots, the layout, and every position have to be redone.

Back in year one I kept thinking: why can't I just click on the image?

Mark the spot, box the range, write the fix beside it; when words aren't enough, drop in a reference image. Then turn everything into one revision sheet and send it straight to the designer, developer, or supplier. Done.

Unfortunately, I couldn't code.

Thank goodness for the age of vibe-coding.

### Features

- **Multi-page canvas**: stitch multiple long screenshots seamlessly; start from a blank project anytime
- **Paste to annotate**: Ctrl+V any screenshot, choose to paste as canvas or reference
- **Version management**: projects and versions (V1, V2…) with rename, archive, and context menus
- **Autosave**: 0.6s debounced autosave with live status in the title bar
- **Export**: 2x supersampled single-page PDF; oversized pages auto-scale without cropping
- **Fully local**: no account, no network, no cloud — data never leaves your machine

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

PinNote has no ambition to become a complex online collaboration or approval platform. It focuses on one thing:

> Put design feedback exactly where it belongs — as clear, actionable revision notes.

One person organizes feedback in PinNote; everyone else receives and executes it via PDF.
No login, no uploads — project data stays on your machine.

---

## License / 许可

[MIT](LICENSE) © Colin Chen · Typeface 字体: [Noto Sans SC](build-res/fonts/LICENSE-NotoSansSC-OFL.txt) (SIL OFL)
