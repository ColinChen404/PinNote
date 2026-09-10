# PinNote 交接说明（面向新一代开发 Agent / 开发者）

> 本文件用于让一个**没有历史对话上下文**的新 Agent（或开发者）仅凭本文件夹即可理解和继续开发 PinNote。
> 请先完整阅读本文件，再浏览代码。

---

## 1. 这是什么

**PinNote** —— 一款轻量桌面视觉反馈标注工具（Electron + 原生 JS，无前端框架）。

用途：在图片上「打点」或「画框」标注问题、写下修改建议、提供参考示例图，最终**一键导出长页 PDF**，反馈给设计/审核方。最初为电商详情页审核与设计反馈而做。

作者：Colin Chen ｜ 协议：MIT。

## 2. 运行前的硬前提（必须先读）

- 依赖里 `electron` / `electron-builder` 的 **node_modules 已就位**（含 electron 运行时二进制）。
  - ⚠️ 若删除 node_modules 想重装：**国内网络直连 GitHub 下载 electron 二进制会 `ETIMEDOUT`**。请勿盲目 `rm -rf node_modules` 后重装。
  - 若必须重装，可复用本机其他目录下已装好的 `node_modules/electron/`（含 `dist/` 与 `path.txt`）整体拷贝过来，再 `npm install` 补全其余依赖。
- 本项目为**纯本地自包含**：所有运行时缓存、打包输出都落在**当前项目文件夹内**，不依赖任何外部绝对路径（已把历史写死的 `E:\soft\...` 绝对路径全部改为相对路径）。

## 3. 常用命令

| 命令 | 作用 |
|------|------|
| `npm start` | 启动应用（开发态） |
| `npm run smoke` | 跑**冒烟测试**（无需手动点 UI，自动验证 25 项核心功能） |
| `npm run build` | 用 electron-builder 打 Windows 安装包，输出到 `dist/` |

> 冒烟测试会自动启动一次应用窗口做自动化验证；在**无图形界面/纯命令行沙箱**里跑可能出现 GPU 报错，属正常，不代表功能坏——需在带桌面的环境查看真实结果。

## 4. 项目结构

```
├── main.js          # Electron 主进程：窗口、IPC、文件存储、PDF 导出、冒烟测试
├── preload.js       # contextBridge：向渲染层暴露 window.api
├── index.html       # 入口 HTML
├── src/
│   ├── app.js       # 渲染层全部逻辑（多图、缩放、标注、建议框、粘贴、右键菜单）—— 核心
│   ├── changelog.js # 更新日志数据（发版时新条目加最上面，同时升 package.json 版本号）
│   └── style.css    # 简约风样式，主色 #4f6ef7
├── build-res/       # icon.png / icon.ico / icons/（工具图标）等打包资源；由 vision/make_icons.py 生成
├── vision/          # 视觉素材源文件（软件图标/工具图标）+ 图标生成脚本
├── dist/            # 打包产物：PinNote Setup 1.2.0.exe（NSIS 安装包）
├── smoke_test.pdf   # 冒烟测试导出的 PDF 样例
├── .runtime-cache/  # 运行时缓存 + 冒烟测试隔离数据目录
└── 交接说明-面向新开发Agent.md  (本文件)
```

## 5. 核心架构（改代码前必读）

### 5.1 双进程
- **主进程 `main.js`**：窗口管理、`userData` 存项目、图片文件读写、转 dataURL、PDF 导出（拼 HTML→用 electron 打印成 PDF）。
- **渲染层 `src/app.js`**：所有交互、画布渲染、标注绘制。
- **无边框窗口**（1.2.0 起）：`frame:false`，顶栏即自定义标题栏——拖拽区靠 `-webkit-app-region:drag`（按钮已豁免），窗口三键走 `window:minimize/toggleMaximize/close` IPC；保存/导出/归档在顶栏，批注工具条悬浮于画布底部（class `.floatbar`，随 renderWorkspace 重建）。
- **图标**：改图标后跑 `python vision/make_icons.py` 重新生成 build-res/icon.ico（16~256 多尺寸）与 icon.png。

### 5.2 状态模型（重点）
顶层 `state` 含关键字段：
- `state.images[]` —— **多图数组**，每张图带 `offsetY`（纵向位移）。用户可**在画布区继续追加图片**，纵向无缝拼接成一张长画布。⚠️ **旧的 `state.detail` 单图对象已废弃删除**，任何残留 `.displayH` 引用都会抛 TypeError（历史上就崩过）。
- `state.marks[]` —— 标注点/框，每条标注带 `imgIndex` 指明属于哪张图。
- `state.zoom` —— 缩放因子（0.2~4，步进 1.25），每张图显示尺寸 = 基准宽度 × zoom。
- `state.refs[]` / `state.suggPositions` —— 参考示例图与建议框位置。

### 5.3 多图 + 缩放坐标换算辅助函数
多个上下文中都用到的关键函数（改动布局/点击命中时必须走它们，别手写坐标）：
`imgScale()`、`imgOffset()`、`imageAtY()`、`markNatToDisp()`、`markAnchor()`、`suggDesiredTop()`、`layoutCanvas()`、`canvasTotalH()`。

规律：
- 自然尺寸用 `naturalW/naturalH`，显示尺寸 = 自然 × `zoom`。
- 画布总高用 `canvasTotalH()` 计算，**不要假设 `state.detail.displayH`**（不存在）。

### 5.4 追加图片不弹顶
`rerenderKeepScroll()`：重渲染后按「原滚动高度 / 原总高」的**比例**恢复视口滚动位置，避免追加图片跳到页面顶部。

## 6. 交互细节与已知「坑」（历史踩过的雷）

1. **参考图 drop 默认放目标位置**：在参考图区拖入图片时，放在指针 drop 的 y 位置（`clientY - rect.top`），**不要**固定放最顶部。
2. **框选钳制**：画框的 mousemove/mouseup 坐标必须钳制在画布内；`move-box` 要减 `im.offsetY`；resize 有 `im.naturalW - m.x` 上界，防止框拖出图边界、越到文字反馈区。
3. **未完成框选取消**：按 Esc / 点画布外 / 窗口失焦要取消未完成的框（document capture mousedown 处理）。
4. **切版本清状态**：切换数据版本时必须清空 `state.refs = []`；`state.suggPositions = {}`，否则参考图/建议框会串到别的项目。
5. **路径注入（极重要）**：凡是要注入到渲染层 JS/CSS 的**本地文件路径**，必须用**正斜杠**（`path.join(...).replace(/\\/g, '/')`）。反斜杠在 JS 字符串里会被当八进制转义破坏，导致图片读取/资源加载失败。
6. **追加图片文件名**：导入/追加图片时文件名加随机后缀，避免重名互相覆盖。
7. **模板字面量里写反斜杠（冒烟测试专属雷）**：`runSmoke` 的 executeJavaScript 脚本是模板字符串包裹的，脚本里正则的 `\/` 会被模板求值先坍缩成 `/`（如 `/^image\//` 变 `/^image//`，直接 SyntaxError），必须写成 `\\/` 才能在注入后的脚本里存活一个 `\`。`node --check main.js` 查不出这种错（模板本身合法），要在渲染层报错里看。
8. **合成 ClipboardEvent 只存活 file 条目**：`new ClipboardEvent('paste', {clipboardData})` 传入的 DataTransfer 里 string 类条目（如 text/plain）会丢失，"文本+图片混合剪贴板优先粘贴文字"的分支无法用合成事件覆盖，只能人工验证。

## 7. 冒烟测试（能长期用的自动化回归）

- 入口：主进程检测 `--smoke` 参数；渲染层暴露 `window.__pinTest`（openProject/getState/appendImageFromFile/addRefFromFile 等钩子）。
- **绝不让测试污染真实用户数据**：`IS_SMOKE` 时数据根目录指向独立的 `smoke-store`（本项目 `.runtime-cache/smoke-store`），与正式 `userData` 完全隔离。
- 覆盖：点/框工具、坐标钳制、缩放、连线、建议框布局、**多图追加**、**参考图 drop 位置**、**追加不弹顶**、PDF 导出、**粘贴路由（方案C：空画布直达设计稿/否则弹卡片询问）**、**空白项目与删空**、**侧栏右键菜单**、**更新日志**等 40+ 项断言。
- 冒烟里用合成 `ClipboardEvent('paste', { clipboardData })` 模拟粘贴；`window.__pinTest.createEmptyProject / handlePastedFiles` 是新功能测试钩子。

## 8. 打包与发布

- `npm run build` → electron-builder → `dist/PinNote Setup 1.0.0.exe`（NSIS 向导式安装包）。
- NSIS 配置：`oneClick:false`、`allowToChangeInstallationDirectory:true`（用户可选安装目录）、创建桌面与开始菜单快捷方式。
- 图标：`build-res/icon.png` / `icon.ico`（打包入 exe）。
- **发版三件事**：① `package.json` 升版本号；② `src/changelog.js` 顶部加条目（应用启动检测到版本变化会自动弹一次更新日志，署名/致谢写条目 credit 字段）；③ `npm run build`（安装包名含版本号），并同步 README 下载区与《使用说明》。
- **打包卡死的排雷经验**：若 electron-builder/NSIS 子进程异常后卡住等待，先 `taskkill` 残留 node 进程并清掉 `dist/` 再重建。

## 9. 数据位置（面向使用方）

- 用户正式数据目录：Electron `userData` 下的 `store/`（默认 `%APPDATA%/PinNote/store`）。
- 缓存/测试隔离数据：本项目 `.runtime-cache/`。

## 10. 给新 Agent 的建议改动流程

1. 先 `npm run smoke` 确认基线通过。
2. 读 `src/app.js` 对应功能段 + 上方辅助函数，优先复用手写好的坐标系函数。
3. 改完**一定重跑冒烟测试**，不要只靠手点 UI。
4. 涉及本地路径拼接务必用正斜杠（见 §6.5）。
5. 涉及截图回归时，需在**带桌面**环境跑（避免 §2 GPU 报错误判）。
