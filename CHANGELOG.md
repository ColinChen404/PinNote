# 更新日志 / Changelog

本文件记录 PinNote 的所有重要变更。/ All notable changes to PinNote are documented here.

## v1.6.0 · 2026-09-21

- 新增：版本对比模式——顶栏「版本对比」一键并排查看历史版本设计稿，滚动与缩放同步，两稿顶部对齐
- 进入对比时项目栏自动收起；历史版本只读、仅展示设计稿图；再次展开项目栏时以浮层覆盖，不挤压当前版本
- 宽度分配以当前版本优先：画布与批注列始终完整显示，剩余空间才分给对比窗格与参考图
- 参考图面板宽度自适应：窗口空间充裕时自动加宽（上限 30%），参考图随之放大

> English
> - New: Version Compare — view a historical version side-by-side from the top bar, with synced scrolling/zoom and top-aligned canvases
> - Entering compare collapses the project sidebar; the historical pane is read-only images only; re-expanding the sidebar overlays it instead of squeezing the current version
> - Layout gives priority to the current version: its canvas and note column always fit; remaining space goes to the compare pane and references
> - The reference panel widens adaptively (up to 30%) when there is room, scaling reference images accordingly

## v1.5.0 · 2026-09-11

- 交互重构：默认即选择/移动——双击左键打点、右键拖动框选，无需先切换工具
- 点批注/框批注按钮改为一次性操作：完成一次自动回默认，配图钉/四角框光标跟随与状态提示
- 快捷键：Q 点批注（一次性）、W 框批注（一次性）、E 取消恢复默认
- 移除：画布双击追加图片（改用顶栏「添加设计稿」或直接拖拽图片进画板）
- 修复：参考图面板与画板滚动不同步——现在视觉分离、滚动同步；参考图面板不再显示独立滚动条

> English
> - Interaction rework: select/move is the default — double-click to pin, right-drag to box, no tool switching needed
> - The pin/box buttons are now one-shot: arm, place once with cursor guides and a status hint, then back to default
> - Shortcuts: Q pin (one-shot), W box (one-shot), E cancel
> - Removed: double-click-to-append image (use the toolbar button or drag & drop)
> - Fixed: the reference panel now scrolls in sync with the board; its separate scrollbar is gone

## v1.4.0 · 2026-09-10

- 布局重构：无边框标题栏，保存/导出/归档移至顶栏，批注工具移至画布底部毛玻璃悬浮工具条
- 建议框与参考图改为白色卡片配质感阴影
- 左侧项目栏支持收起/展开（默认展开）
- 全新应用图标与批注工具图标；批注配色调整为低饱和质感红
- 顶栏「…」菜单：更新日志 / 快捷键说明 / 关于；升级后首次打开只展示本轮更新
- ❤️ 特别鸣谢：ChatGPT image 2.5 的平面设计支持

## v1.3.0 · 2026-09-11

- 换掉丑陋的微软雅黑字体：全应用与导出 PDF 改用 **Noto Sans SC**（思源黑体同源设计，SIL OFL 免费商用），界面更清爽现代
- 修改说明文字增大：12px → 13px，行距加宽，应用内阅读更舒服，导出 PDF 保持一致
- 修复：升级后首次打开可能不弹更新日志的问题，现在会补齐展示所有错过的更新

> English
> - Replaced the Microsoft YaHei typeface: the app and exported PDFs now use **Noto Sans SC** (same design as Source Han Sans, SIL OFL licensed)
> - Larger note text: 12px → 13px with more breathing room, consistent with exported PDFs
> - Fixed: the "What's New" dialog could be silently skipped after an upgrade; it now catches up on everything you missed

## v1.2.1 · 2026-09-11

- 修复安装版点击「导出 PDF」报错（临时文件被写入只读的应用包内）。1.2.0 安装版用户请升级

> English
> - Fixed "Export PDF" failing in the installed app (temp files written into a read-only location). 1.2.0 users should upgrade

## v1.2.0 · 2026-09-10

- 全新视觉改版：无边框标题栏，保存/导出/归档移至顶栏，批注工具移至画布底部毛玻璃悬浮工具条
- 建议框与参考图改为白色卡片配质感阴影
- 左侧项目栏支持收起/展开（默认展开）
- 全新应用图标与批注工具图标；批注配色调整为低饱和质感红
- 顶栏「…」菜单：更新日志 / 快捷键说明 / 关于；升级后首次打开只展示本轮更新
- ❤️ 特别鸣谢：ChatGPT image 2.5 的平面设计支持

## v1.1.0 · 2026-09-09

- 新增：Ctrl+V 粘贴图片，可选粘贴为设计稿或参考图
- 新增：创建空白项目/空白版本，拖拽、粘贴、按钮均可上传设计稿
- 新增：侧栏右键菜单——项目支持重命名/归档/删除，版本支持重命名/删除
- 新增：应用内更新日志
- 调整：界面与导出文档统一使用「设计稿」
- ❤️ 特别鸣谢：凯元姐，本轮由粘贴引发的更新由她提出

## v1.0.0 · 2026-07-21

- 首个版本：图片标注（标记点/框选）、修改建议、参考图、项目/版本管理、长页单页 PDF 导出
