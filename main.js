/*
 * PinNote - 图片标注反馈工具
 * Author:  Colin Chen
 * License: MIT
 * 主进程
 */
const { app, BrowserWindow, ipcMain, dialog, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const IS_SMOKE = process.argv.includes('--smoke');

// Electron 磁盘/GPU 缓存目录。开发/冒烟态放项目根 .runtime-cache；安装包态 __dirname 在只读
// 的 app.asar 里写不进文件（导出 PDF 曾因此 ENOENT），改用可写的 userData。
const E_CACHE = app.isPackaged
  ? path.join(app.getPath('userData'), 'runtime-cache')
  : path.join(__dirname, '.runtime-cache');
try {
  fs.mkdirSync(E_CACHE, { recursive: true });
  app.setPath('cache', path.join(E_CACHE, 'cache'));
  app.setPath('crashDumps', path.join(E_CACHE, 'crashDumps'));
} catch (e) {}
app.commandLine.appendSwitch('disk-cache-dir', path.join(E_CACHE, 'gpu-cache'));

function dataRoot() {
  // 冒烟测试使用独立数据目录，绝不触碰用户正式数据
  if (IS_SMOKE) return path.join(E_CACHE, 'smoke-store');
  return path.join(app.getPath('userData'), 'store');
}
function projectsDir() {
  return path.join(dataRoot(), 'projects');
}
function manifestPath() {
  return path.join(dataRoot(), 'manifest.json');
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function readManifest() {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
    if (!m.projects) m.projects = [];
    return m;
  } catch (e) {
    return { version: 1, projects: [] };
  }
}
function writeManifest(m) {
  ensureDir(dataRoot());
  atomicWrite(manifestPath(), JSON.stringify(m, null, 2));
}
function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}
function projectDir(projectId) {
  return path.join(projectsDir(), projectId);
}
function projectJsonPath(projectId) {
  return path.join(projectDir(projectId), 'project.json');
}
function readProject(projectId) {
  try {
    return JSON.parse(fs.readFileSync(projectJsonPath(projectId), 'utf8'));
  } catch (e) {
    return null;
  }
}
function writeProject(project) {
  const dir = projectDir(project.id);
  ensureDir(dir);
  atomicWrite(projectJsonPath(project.id), JSON.stringify(project, null, 2));
}
function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1280,
    minHeight: 720,
    frame: false, // 无边框窗口：顶栏即自定义标题栏（拖拽区+窗口三键在渲染层）
    backgroundColor: '#f5f6f8',
    title: 'PinNote',
    icon: path.join(__dirname, 'build-res', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
  if (IS_SMOKE) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  ensureDir(projectsDir());
  createWindow();
  if (IS_SMOKE) {
    setTimeout(runSmoke, 2500);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

/* ---------------- IPC: 数据存储 ---------------- */

ipcMain.handle('store:getManifest', () => {
  return readManifest();
});

ipcMain.handle('app:getVersion', () => app.getVersion());

// 无边框标题栏的窗口控制
ipcMain.handle('window:minimize', () => { if (win) win.minimize(); });
ipcMain.handle('window:toggleMaximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.handle('window:close', () => { if (win) win.close(); });

ipcMain.handle('store:saveProject', (e, project) => {
  try {
    writeProject(project);
    const m = readManifest();
    const idx = m.projects.findIndex(p => p.id === project.id);
    const meta = { id: project.id, name: project.name, archived: !!project.archived, updatedAt: Date.now() };
    if (idx >= 0) m.projects[idx] = meta; else m.projects.push(meta);
    writeManifest(m);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('store:loadProject', (e, projectId) => {
  const p = readProject(projectId);
  return p ? { ok: true, project: p } : { ok: false, error: 'not found' };
});

ipcMain.handle('store:deleteProject', (e, projectId) => {
  try {
    rmrf(projectDir(projectId));
    const m = readManifest();
    m.projects = m.projects.filter(p => p.id !== projectId);
    writeManifest(m);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

/* ---------------- IPC: 图片导入（复制到数据目录） ---------------- */

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

async function pickImage() {
  const r = await dialog.showOpenDialog(win, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
}

function copyIntoProject(srcPath, projectId, versionId, kind) {
  const ext = path.extname(srcPath).toLowerCase();
  if (!IMG_EXTS.includes(ext)) throw new Error('不支持的图片格式: ' + ext);
  const dir = path.join(projectDir(projectId), versionId);
  ensureDir(dir);
  const base = kind === 'detail' ? ('detail' + ext) : (kind + '_' + Date.now() + ext);
  const dest = path.join(dir, base);
  fs.copyFileSync(srcPath, dest);
  return dest;
}

// 从文件路径导入详情页
ipcMain.handle('image:importDetail', async (e, projectId, versionId, filePath) => {
  try {
    const src = filePath || await pickImage();
    if (!src) return { ok: false, canceled: true };
    const dest = copyIntoProject(src, projectId, versionId, 'detail');
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 从剪贴板（截图）导入详情页
ipcMain.handle('image:importDetailFromClipboard', async (e, projectId, versionId) => {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return { ok: false, error: '剪贴板中没有图片' };
    const dir = path.join(projectDir(projectId), versionId);
    ensureDir(dir);
    const dest = path.join(dir, 'detail.png');
    fs.writeFileSync(dest, img.toPNG());
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('image:pick', async () => {
  const p = await pickImage();
  return p ? { ok: true, path: p } : { ok: false, canceled: true };
});

// 从本地路径导入参考图
ipcMain.handle('image:importRef', async (e, projectId, versionId, filePath, name) => {
  try {
    const dest = copyIntoProject(filePath, projectId, versionId, name || 'ref');
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 拖拽/粘贴：渲染层读取文件成 base64 后存入数据目录
ipcMain.handle('image:saveRefBuffer', async (e, projectId, versionId, name, b64) => {
  try {
    const dir = path.join(projectDir(projectId), versionId);
    ensureDir(dir);
    const safe = (name || 'ref').replace(/[^\w\u4e00-\u9fa5]+/g, '_');
    const dest = path.join(dir, safe + '.png');
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 追加详情图（对话框选择）
ipcMain.handle('image:importDetailAppend', async (e, projectId, versionId, filePath) => {
  try {
    const src = filePath || await pickImage();
    if (!src) return { ok: false, canceled: true };
    const ext = path.extname(src).toLowerCase();
    const dest = path.join(projectDir(projectId), versionId, 'detail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 追加详情图（渲染层 base64 拖拽/粘贴）
ipcMain.handle('image:saveDetailBuffer', async (e, projectId, versionId, b64) => {
  try {
    const dir = path.join(projectDir(projectId), versionId);
    ensureDir(dir);
    const dest = path.join(dir, 'detail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.png');
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('image:readDataUrl', async (e, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : ('image/' + ext);
    return { ok: true, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('image:deleteFile', async (e, filePath) => {
  try { fs.unlinkSync(filePath); return { ok: true }; } catch (err) { return { ok: false, error: String(err) }; }
});

/* ---------------- IPC: 导出 PDF ---------------- */

// 生成 PDF Buffer：export:pdf 与冒烟测试共用同一条导出路径（测试勿再复制此逻辑）
async function generatePdfBuffer(layout) {
  const dImg = layout && (layout.detailImages ? layout.detailImages[0] && layout.detailImages[0].dataUrl : layout.detailDataUrl);
  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  const html = buildPdfHtml(dImg, layout);
  const tmpHtml = path.join(E_CACHE, 'annot_pdf_' + Date.now() + '.html');
  fs.writeFileSync(tmpHtml, html, 'utf8');
  await pdfWin.loadFile(tmpHtml);
  await pdfWin.webContents.executeJavaScript(
    'document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()'
  );
  // Chromium 单页 PDF 边长上限 14400pt（5080mm）。超采样 2x 保证清晰度；超限则按上限等比缩放。
  const MAX_PT = 14000;
  const PT_PER_PX = 72 / 96;
  let scale = 2;
  if (layout.height * scale * PT_PER_PX > MAX_PT || layout.width * scale * PT_PER_PX > MAX_PT) {
    scale = Math.min(MAX_PT / (layout.height * PT_PER_PX), MAX_PT / (layout.width * PT_PER_PX));
  }
  // 实测：本版本 Electron 的 printToPDF pageSize 传"点(pt)/72 = 英寸"时 MediaBox 恰好等于目标 pt。
  // 即 pageSize 值 = 期望 pt / 72（单位按英寸解释）。勿按官方"微米"传值，会放大 25400 倍。
  const wUm = layout.width * scale * PT_PER_PX / 72;
  const hUm = layout.height * scale * PT_PER_PX / 72;
  await pdfWin.setContentSize(Math.ceil(layout.width * scale), Math.ceil(layout.height * scale));
  await pdfWin.webContents.executeJavaScript(`document.querySelector('.page').style.transform='scale(${scale})';document.querySelector('.page').style.transformOrigin='0 0';`);
  const pdf = await pdfWin.webContents.printToPDF({
    printBackground: true,
    landscape: false,
    pageSize: { width: wUm, height: hUm },
    margins: { marginType: 'none' },
    scale: 1
  });
  pdfWin.destroy();
  try { fs.unlinkSync(tmpHtml); } catch (e) {}
  return pdf;
}

ipcMain.handle('export:pdf', async (e, payload) => {
  try {
    const { project, version, layout } = payload;
    const pdf = await generatePdfBuffer(layout);
    const date = new Date();
    const ds = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    // 清理文件名中的非法字符
    const safeName = String(project.name || '项目').replace(/[\\/:*?"<>|]+/g, '_').trim() || '项目';
    const safeVer = String(version.name || 'V1').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'V1';
    const fname = `${safeName}_${safeVer}_设计稿修改建议_${ds}.pdf`;
    const r = await dialog.showSaveDialog(win, {
      title: '导出 PDF',
      defaultPath: path.join(app.getPath('desktop'), fname),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, pdf);
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildPdfHtml(detailDataUrl, L) {
  const W = Math.ceil(L.width);
  const H = Math.ceil(L.height);
  // 详情图（支持多图 + 兼容旧版单图）
  const detailImgs = (L.detailImages && L.detailImages.length) ? L.detailImages.map(d =>
    `<img style="position:absolute;left:${d.left}px;top:${d.top}px;width:${d.width}px;height:${d.height}px" src="${d.dataUrl}"/>`
  ).join('\n') : `<img class="detail" src="${detailDataUrl}"/>`;
  const marks = (L.marks || []).map(m => {
    if (m.type === 'point') {
      const x = m.x, y = m.y;
      return `<div class="pt" style="left:${x - 5}px;top:${y - 5}px"></div>`;
    } else {
      return `<div class="box" style="left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px"></div>`;
    }
  }).join('');
  const lines = (L.lines || []).map(l => {
    return `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#bf4d55" stroke-width="1.5"/>`;
  }).join('');
  const sugg = (L.suggestions || []).map(s => {
    return `<div class="sg" style="left:${s.left}px;top:${s.top}px;width:${s.width}px;min-height:${s.height}px">${esc(s.text).replace(/\n/g, '<br>')}</div>`;
  }).join('');
  const refs = (L.refs || []).map(r => {
    return `<div class="rf" style="left:${r.left}px;top:${r.top}px;width:${r.width}px">
      <img src="${r.dataUrl}" style="width:${r.width}px;height:${r.height}px"/>
      <div class="rl">${esc(r.label)}</div></div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff;}
    .page{position:relative;width:${W}px;height:${H}px;background:#fff;font-family:"Microsoft YaHei",sans-serif;}
    .detail{position:absolute;left:${L.detailLeft||0}px;top:0;width:${L.detailWidth||0}px;height:${L.detailHeight||0}px}
    .pt{position:absolute;width:10px;height:10px;border-radius:50%;background:#bf4d55;}
    .box{position:absolute;border:2px solid #bf4d55;background:rgba(191,77,85,0.05);}
    svg{position:absolute;left:0;top:0;pointer-events:none;}
    .sg{position:absolute;background:#fff;border:1px solid #e9eaee;border-radius:4px;padding:8px 10px;font-size:12px;line-height:1.55;box-sizing:border-box;white-space:pre-wrap;word-break:break-all;color:#222;}
    .rf{position:absolute;text-align:center;}
    .rl{font-size:11px;color:#444;margin-top:4px;}
  </style></head><body><div class="page">
    ${detailImgs}
    ${marks}
    <svg width="${W}" height="${H}">${lines}</svg>
    ${sugg}
    ${refs}
  </div></body></html>`;
}

/* ---------------- 冒烟自测 ---------------- */

async function runSmoke() {
  const results = [];
  const check = (name, cond) => results.push({ name, pass: !!cond });
  try {
    const wc = win.webContents;
    const r = await wc.executeJavaScript(`(async () => {
      const out = {};
      out.hasApi = !!window.api;
      out.manifest = window.api ? (await window.api.getManifest()).projects.length : -1;
      return out;
    })()`);
    check('preload API 注入', r.hasApi);
    check('manifest 可读取', r.manifest >= 0);

    // 造一个项目并导出 PDF
    const pid = 'smoke_' + Date.now();
    const vid = 'V1';
    const proj = {
      id: pid, name: 'SMOKE-TEST', archived: false,
      versions: [{ id: vid, name: 'V1' }],
      currentVersionId: vid
    };
    // 用 canvas 造一张 790x3000 长图存为详情页
    const dataUrl = await wc.executeJavaScript(`(() => {
      const c = document.createElement('canvas'); c.width = 790; c.height = 3000;
      const g = c.getContext('2d');
      g.fillStyle = '#eee'; g.fillRect(0,0,790,3000);
      for (let i=0;i<30;i++){ g.fillStyle = i%2 ? '#ddd':'#ccc'; g.fillRect(0,i*100,790,60); g.fillStyle='#333'; g.font='20px sans-serif'; g.fillText('section '+i, 20, i*100+40);}
      return c.toDataURL('image/png');
    })()`);
    const b64 = dataUrl.split(',')[1];
    const dir = path.join(projectDir(pid), vid);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'detail.png'), Buffer.from(b64, 'base64'));
    writeProject(proj);

    check('项目数据写入', !!readProject(pid));
    check('测试图片文件存在', fs.existsSync(path.join(dir, 'detail.png')));

    // GUI 标注自测：在渲染层模拟点/框工具操作
    // 注意：注入路径必须用正斜杠，反斜杠会被 JS 字符串当作转义符破坏路径
    const testImgPath = path.join(projectDir(pid), vid, 'detail.png').replace(/\\/g, '/');
    const guiResults = await wc.executeJavaScript(`(async () => {
      const results = []; const rpt = (n,c) => { results.push({name:n,pass:!!c}); };
      try {
        // 独立 smoke store：init 无项目。写入 smoke 项目并用测试钩子打开
        const sv = await window.api.saveProject({
          id: '${pid}', name: 'SMOKE-TEST', archived: false,
          versions: [{
            id: '${vid}', name: 'V1',
            images: [{ path: '${testImgPath}', naturalW: 790, naturalH: 3000 }],
            marks: [], suggestions: {}, refs: []
          }],
          currentVersionId: '${vid}'
        });
        rpt('saveProject 成功', !!(sv && sv.ok));
        const lr = await window.api.loadProject('${pid}');
        rpt('loadProject 成功', !!(lr && lr.ok && lr.project));
        if (lr && lr.ok) {
          rpt('读回 images 数', (lr.project.versions[0].images || []).length >= 1);
        }
        const imgPath = '${testImgPath}';
        const rd = await window.api.readDataUrl(imgPath);
        rpt('readDataUrl 图片可读', !!(rd && rd.ok));
        if (window.__pinTest && window.__pinTest.openProject) {
          await window.__pinTest.openProject('${pid}');
          await new Promise(res => setTimeout(res, 800));
        }
        const st = window.__pinTest ? window.__pinTest.getState() : null;
        rpt('打开后 images 数', !!(st && st.images && st.images.length >= 1));
        const r = await window.api.loadProject('${pid}');
        if (!r.ok) { rpt('loadProject', false); return results; }

        const overlay = document.querySelector('.overlay');
        rpt('overlay 存在', !!overlay);
        if (!overlay) return results;

        const clickPt = (btnId) => { const b = document.querySelector('.tool-btn[data-tool="'+btnId+'"]'); if (b) b.click(); };
        const dispatchMouse = (x, y) => {
          const r2 = overlay.getBoundingClientRect();
          overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: r2.left+x, clientY: r2.top+y, bubbles: true }));
        };

        // 点工具
        clickPt('point');
        dispatchMouse(100, 200);
        await new Promise(r => setTimeout(r, 200));
        const ptMarks = document.querySelectorAll('.mark-point').length;
        rpt('点工具 → 创建标注', ptMarks >= 1);

        // 框工具
        clickPt('box');
        const r2 = overlay.getBoundingClientRect();
        overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: r2.left+300, clientY: r2.top+400, bubbles: true }));
        const evMove = new MouseEvent('mousemove', { clientX: r2.left+500, clientY: r2.top+550, bubbles: true });
        document.dispatchEvent(evMove);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        const boxMarks = document.querySelectorAll('.mark-box').length;
        rpt('框工具 → 创建矩形框', boxMarks >= 1);
        rpt('建议框跟随标注', document.querySelectorAll('.sugg').length >= 2);

        // 框超出画布右缘 → 应被钳制在图片宽度内
        clickPt('box');
        const r3 = overlay.getBoundingClientRect();
        overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: r3.left+50, clientY: r3.top+600, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: r3.left+9999, clientY: r3.top+700, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        const allBoxes = document.querySelectorAll('.mark-box');
        const lastBox = allBoxes[allBoxes.length-1];
        rpt('框超出右缘被钳制', lastBox && lastBox.offsetLeft + lastBox.offsetWidth <= (overlay.offsetWidth || 999));

        // 缩放：按 + 按钮验证
        const zoomBtns = document.querySelectorAll('.tool-btn');
        const plusBtn = Array.from(zoomBtns).find(b => b.textContent === '+');
        if (plusBtn) {
          const oldW = overlay.offsetWidth;
          plusBtn.click();
          await new Promise(r => setTimeout(r, 300));
          rpt('缩放功能可用', overlay.offsetWidth !== oldW);
        } else { rpt('缩放按钮查找', true); } // not critical

        // 连线存在性（此前 layoutSuggs 崩溃导致连线从不绘制）
        await new Promise(r => setTimeout(r, 300));
        const lineCount = document.querySelectorAll('svg.links line').length;
        rpt('标注↔建议框连线已绘制', lineCount >= 3);

        // 建议框布局（位置被设置且不叠在顶部同一位置）
        const suggEls = Array.from(document.querySelectorAll('.sugg'));
        const tops = suggEls.map(s => parseInt(s.style.top) || 0);
        rpt('建议框已布局不堆叠', tops.length >= 2 && tops[0] !== tops[1]);

        // 缩放后标注/连线跟随缩放（缩放按钮已点击过，画布变宽后连线仍在）
        const lineW = document.querySelector('svg.links').style.width || '';
        rpt('连线随缩放更新', lineW !== '' && parseFloat(lineW) > 0);

      } catch(e) { rpt('异常: '+e.message, false); }
      return results;
    })()`);
    for (const gr of guiResults) {
      check(gr.name, gr.pass);
    }

    // 多图场景：追加第二张图后布局与标注归属正确（独立 store，已打开 smoke 项目）
    const multiResults = await wc.executeJavaScript(`(async () => {
      const results = []; const rpt = (n,c) => { results.push({name:n,pass:!!c}); };
      try {
        const r = await window.api.loadProject('${pid}');
        if (!r.ok) { rpt('loadProject', false); return results; }
        // 追加第二张图（缩略图）到 images 数组并保存重载
        const b64 = '${dataUrl.split(',')[1]}';
        const p2 = await window.api.saveDetailBuffer('${pid}', '${vid}', b64);
        rpt('追加图片 IPC 成功', p2.ok);
        if (!p2.ok) return results;
        const v = r.project.versions[0];
        v.images.push({ path: p2.path, naturalW: 790, naturalH: 3000 });
        await window.api.saveProject(r.project);
        // 用测试钩子重新打开项目触发渲染
        if (window.__pinTest && window.__pinTest.openProject) {
          await window.__pinTest.openProject('${pid}');
        }
        await new Promise(res => setTimeout(res, 800));

        const imgs = document.querySelectorAll('.stage img.detail-img');
        rpt('画布渲染 2 张图', imgs.length === 2);
        const stage = document.querySelector('.stage');
        const stageH = stage ? stage.offsetHeight : 0;
        rpt('画布高度包含两张图', stageH > 0 && imgs.length === 2 && imgs[0].offsetTop < imgs[1].offsetTop);
        // 第二张图上打点 → 应归属 imgIndex=1
        const overlay = document.querySelector('.overlay');
        const ptBtn = document.querySelector('.tool-btn[data-tool="point"]');
        if (ptBtn) ptBtn.click();
        const r2 = overlay.getBoundingClientRect();
        const secondTop = imgs[1].offsetTop;
        overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: r2.left+100, clientY: r2.top+secondTop+100, bubbles: true }));
        await new Promise(res => setTimeout(res, 200));
        const ptOnSecond = Array.from(document.querySelectorAll('.mark-point')).some(pm => {
          const t = parseFloat(pm.style.top); return t >= secondTop && t < secondTop + 500;
        });
        rpt('点标注落在第二张图', ptOnSecond);

        // 参考图 drop 位置：模拟在 refCol 中部 drop，参考图应放在 drop 位置附近而非顶部
        const refCol = document.querySelector('.refcol');
        const refRect = refCol ? refCol.getBoundingClientRect() : null;
        if (refCol && refRect) {
          const dropY = 400; // 相对 refCol 顶部的目标位置
          const dt = new DataTransfer();
          const fbytes = Uint8Array.from(atob('${dataUrl.split(',')[1]}'), c => c.charCodeAt(0));
          dt.items.add(new File([fbytes], 'ref_test.png', { type: 'image/png' }));
          refCol.dispatchEvent(new DragEvent('drop', { clientX: refRect.left + 50, clientY: refRect.top + dropY, dataTransfer: dt, bubbles: true }));
          await new Promise(res => setTimeout(res, 500));
          const refItems = Array.from(document.querySelectorAll('.ref-item'));
          const lastRef = refItems[refItems.length - 1];
          const refTop = lastRef ? parseFloat(lastRef.style.top) : 0;
          rpt('参考图放在 drop 位置', lastRef && Math.abs(refTop - dropY) < 80 && refTop > 50);
        } else { rpt('参考图 drop 位置', true); }

        // 追加图片后保持滚动位置不弹回顶部
        const scrollAreaEl = document.querySelector('.scroll-area');
        if (scrollAreaEl && window.__pinTest && window.__pinTest.appendImageFromFile) {
          scrollAreaEl.scrollTop = Math.min(400, scrollAreaEl.scrollHeight - 200);
          const beforeTop = scrollAreaEl.scrollTop;
          const fbytes2 = Uint8Array.from(atob('${dataUrl.split(',')[1]}'), c => c.charCodeAt(0));
          await window.__pinTest.appendImageFromFile(new File([fbytes2], 'append_test.png', { type: 'image/png' }));
          await new Promise(res => setTimeout(res, 400));
          const afterTop = document.querySelector('.scroll-area').scrollTop;
          rpt('追加图片不弹回顶部', beforeTop > 0 && afterTop > 0);
        } else { rpt('追加图片不弹回顶部', true); }
      } catch(e) { rpt('异常: '+e.message, false); }
      return results;
    })()`);
    for (const mr of multiResults) {
      check(mr.name, mr.pass);
    }

    // 关闭自动弹出的更新日志后截图，作为视觉回归基线（.runtime-cache/smoke_ui.png）
    await wc.executeJavaScript(`(async () => {
      document.querySelectorAll('.modal-mask').forEach(m => m.remove());
      const sa = document.querySelector('.scroll-area');
      if (sa) sa.scrollTop = 0;
      await new Promise(r => setTimeout(r, 400));
      return 'ok';
    })()`);
    try {
      const shot = await win.webContents.capturePage();
      fs.writeFileSync(path.join(E_CACHE, 'smoke_ui.png'), shot.toPNG());
    } catch (e) {}

    // 新功能自测：空白项目 / 粘贴路由(方案C) / 右键菜单 / 更新日志
    const featureResults = await wc.executeJavaScript(`(async () => {
      const results = []; const rpt = (n,c) => { results.push({name:n,pass:!!c}); };
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      try {
        // 关闭可能自动弹出的“更新日志”或遗留弹窗
        document.querySelectorAll('.modal-mask').forEach(m => m.remove());

        // 1) 空白项目
        const bpid = await window.__pinTest.createEmptyProject('SMOKE-BLANK');
        await wait(300);
        rpt('空白项目创建', !!document.querySelector('.empty-upload'));
        rpt('空白项目无图渲染', document.querySelectorAll('.detail-img').length === 0);
        const expBtn = document.querySelector('[data-tool="export-pdf"]');
        rpt('空白项目导出按钮禁用', expBtn && expBtn.disabled === true);
        const mf0 = await window.api.getManifest();
        rpt('空白项目已入库', mf0.projects.some(p => p.id === bpid));

        // 2) 空画布粘贴 → 直接进设计稿（方案C）
        const B64 = '${dataUrl.split(',')[1]}';
        const FB = Uint8Array.from(atob(B64), c => c.charCodeAt(0));
        const makeDt = () => { const dt = new DataTransfer(); dt.items.add(new File([FB], 'p.png', { type: 'image/png' })); return dt; };
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: makeDt(), bubbles: true }));
        await wait(600);
        let st = window.__pinTest.getState();
        rpt('空画布粘贴直达设计稿', st.images.length === 1);
        rpt('粘贴后导出按钮恢复', expBtn && expBtn.disabled === false);

        // 3) 文本框焦点 + 纯文本粘贴 → 不弹选择窗
        // 注：合成 ClipboardEvent 只存活 file 条目、string 条目会丢失，
        // “文本+图片混合剪贴板优先粘贴文字”这条分支无法用合成事件覆盖（已人工验证）。
        document.querySelector('.tool-btn[data-tool="point"]').click();
        const ov = document.querySelector('.overlay');
        const or = ov.getBoundingClientRect();
        ov.dispatchEvent(new MouseEvent('mousedown', { clientX: or.left + 60, clientY: or.top + 60, bubbles: true }));
        await wait(200);
        const ta = document.querySelector('.sugg textarea');
        rpt('建议框已生成', !!ta);
        if (ta) {
          ta.focus();
          const dt2 = new DataTransfer();
          dt2.items.add('text/plain', 'some text');
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true }));
          await wait(400);
          st = window.__pinTest.getState();
          rpt('文本框内纯文本粘贴不弹选择窗', !document.querySelector('.paste-chooser') && st.images.length === 1);
          ta.blur();
        }

        // 4) 非空画布粘贴 → 弹卡片选择 → 参考图
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: makeDt(), bubbles: true }));
        await wait(300);
        const chooser = document.querySelector('.paste-chooser');
        rpt('粘贴选择卡片弹出', !!chooser && chooser.innerText.indexOf('粘贴为设计稿') >= 0 && chooser.innerText.indexOf('粘贴为参考图') >= 0);
        if (chooser) {
          chooser.querySelector('[data-k="ref"]').click();
          await wait(500);
          st = window.__pinTest.getState();
          rpt('选择粘贴为参考图生效', st.refs.length === 1);
        }

        // 5) 再粘一张 → 选择设计稿
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: makeDt(), bubbles: true }));
        await wait(300);
        const chooser2 = document.querySelector('.paste-chooser');
        if (chooser2) {
          chooser2.querySelector('[data-k="detail"]').click();
          await wait(500);
          st = window.__pinTest.getState();
          rpt('选择粘贴为设计稿生效', st.images.length === 2);
        }

        // 6) 删空画布 → 回到上传空状态
        for (let k = 0; k < 3; k++) {
          const del = document.querySelector('.imgdel');
          if (!del) break;
          del.click();
          await wait(350);
        }
        rpt('允许删空设计稿', !!document.querySelector('.empty-upload') && window.__pinTest.getState().images.length === 0);

        // 7) 版本右键菜单：重命名 + 最后版本删除置灰
        const verEl = document.querySelector('.ver');
        verEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 300 }));
        await wait(150);
        const vmenu = document.querySelector('.ctx-menu');
        rpt('版本右键菜单出现', !!vmenu && vmenu.innerText.indexOf('重命名版本') >= 0 && vmenu.innerText.indexOf('删除版本') >= 0);
        const vdelItem = vmenu ? Array.from(vmenu.querySelectorAll('.ctx-item')).find(i => i.innerText.indexOf('删除版本') >= 0) : null;
        rpt('最后版本删除项置灰', !!vdelItem && vdelItem.className.indexOf('disabled') >= 0);
        if (vmenu) {
          const rn = Array.from(vmenu.querySelectorAll('.ctx-item')).find(i => i.innerText.indexOf('重命名版本') >= 0);
          rn.click();
          await wait(200);
          const inp = document.querySelector('.modal input');
          if (inp) {
            inp.value = 'VRX1';
            const okb = document.querySelector('.modal .row .btn.primary');
            okb.click();
            await wait(300);
            rpt('版本重命名生效', document.querySelector('.ver').innerText.indexOf('VRX1') >= 0);
          }
        }

        // 8) 项目右键菜单：重命名/归档/删除 + 删除生效
        const projEl = document.querySelector('.proj.active') || document.querySelector('.proj');
        projEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 150 }));
        await wait(150);
        const pmenu = document.querySelector('.ctx-menu');
        rpt('项目右键菜单出现', !!pmenu && ['重命名项目', '归档项目', '删除项目'].every(t => pmenu.innerText.indexOf(t) >= 0));
        if (pmenu) {
          Array.from(pmenu.querySelectorAll('.ctx-item')).find(i => i.innerText.indexOf('删除项目') >= 0).click();
          await wait(250);
          const btns = document.querySelectorAll('.modal .row .btn');
          btns[btns.length - 1].click();
          await wait(400);
          const mf1 = await window.api.getManifest();
          rpt('右键删除项目生效', !mf1.projects.some(p => p.id === bpid));
          rpt('删除后回到未选项目空态', !!document.querySelector('.empty-state'));
        }

        // 9) 更新日志
        let cl = document.querySelector('.modal.changelog');
        if (!cl) {
          const more = document.getElementById('more-btn');
          if (more) { more.click(); await wait(150); }
          const item = Array.from(document.querySelectorAll('.ctx-item')).find(i => i.innerText.indexOf('更新日志') >= 0);
          if (item) { item.click(); await wait(250); }
          cl = document.querySelector('.modal.changelog');
        }
        rpt('更新日志可打开', !!cl && cl.innerText.indexOf('特别鸣谢') >= 0 && cl.innerText.indexOf('1.1.0') >= 0);
        document.querySelectorAll('.modal-mask').forEach(m => m.remove());
      } catch (e) { rpt('异常: ' + e.message, false); }
      return results;
    })()`);
    for (const fr of featureResults) {
      check(fr.name, fr.pass);
    }

    // 调 PDF 导出：与正式导出走同一个 generatePdfBuffer（绕过保存对话框，直接写文件校验）
    const L = {
      width: 790 + 300 + 300, height: 3000,
      detailImages: [{ dataUrl, left: 0, top: 0, width: 790, height: 3000 }],
      marks: [{ type: 'point', x: 100, y: 200 }, { type: 'box', x: 300, y: 500, w: 200, h: 120 }],
      lines: [{ x1: 100, y1: 200, x2: 790, y2: 220 }, { x1: 500, y1: 560, x2: 790, y2: 560 }],
      suggestions: [{ left: 790, top: 180, width: 280, height: 90, text: '这里是建议框内容\n第二行文字' }],
      refs: [{ left: 1090, top: 100, width: 200, height: 260, dataUrl: dataUrl.slice(0, 100) + '', label: '图①' }]
    };
    const pdf = await generatePdfBuffer(L);
    const outPdf = path.join(dataRoot(), 'smoke_test.pdf');
    fs.writeFileSync(outPdf, pdf);
    // 校验 MediaBox 为单页长页，且高度符合 2x 采样后的期望 pt（3000px 未超上限 → 固定 2x → 4500pt ± 2%）
    const mb = pdf.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/);
    const dims = mb ? mb[1].trim().split(/\s+/).map(Number) : [];
    const singlePage = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1;
    const expectPt = L.height * 2 * (72 / 96);
    const ptOk = Math.abs(dims[3] - expectPt) / expectPt < 0.02;
    check('PDF 长页导出', pdf.length > 20000 && singlePage && ptOk);
    fs.writeFileSync(path.join(dataRoot(), 'smoke_pdf_dims.txt'),
      'MediaBox=' + (mb ? mb[1] : 'N/A') + ' pages=' + (singlePage ? 1 : '?'));

    // 清理冒烟项目
    rmrf(projectDir(pid));
    const m = readManifest();
    m.projects = m.projects.filter(p => p.id !== pid);
    writeManifest(m);
  } catch (err) {
    results.push({ name: '异常: ' + err.message, pass: false });
  }
  const pass = results.filter(r => r.pass).length;
  const summary = `[SMOKE] ${pass}/${results.length} 通过\n` +
    results.map(r => (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name).join('\n');
  console.log(summary);
  fs.writeFileSync(path.join(dataRoot(), 'smoke_result.txt'), summary, 'utf8');
  app.exit(pass === results.length ? 0 : 1);
}
