// 预览截图工具：用本地 Electron 离屏渲染 design-mock/index.html 并输出 preview.png
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const variant = process.argv[2] || 'default';
const w = parseInt(process.argv[3] || '1440', 10);
const h = parseInt(process.argv[4] || '900', 10);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: w, height: h, show: false,
    webPreferences: { offscreen: true }
  });
  await win.loadFile(path.join(__dirname, 'index.html'));
  if (variant !== 'default') {
    // variant 形如 accent=blue,card=cream,canvas=dots
    await win.webContents.executeJavaScript(`
      (${JSON.stringify(variant)}).split(',').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) document.body.dataset[k] = v;
      });
    `);
  }
  await new Promise(r => setTimeout(r, 900));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, `preview-${variant.replace(/[,=]/g, '_')}.png`), img.toPNG());
  app.quit();
});
