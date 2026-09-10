/*
 * PinNote - 图片标注反馈工具
 * Author:  Colin Chen
 * License: MIT
 * 渲染层（原生 JS，无构建依赖）
 */
(function () {
  const api = window.api;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const uid = () => 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- 状态 ----------
  const state = {
    manifest: { projects: [] },
    project: null,          // 当前项目（完整数据）
    version: null,          // 当前版本对象
    images: [],             // [{path,naturalW,naturalH,dataUrl,displayW,displayH,offsetY}]
    marks: [],              // [{id,type:'point'|'box',x,y,w,h,imgIndex}]
    sugg: {},               // markId -> { id, text, top } (top 为显示坐标)
    refs: [],               // [{id,path,dataUrl,label,top,h}]
    tool: 'select',         // select|point|box
    selected: null,         // markId
    editing: null,          // markId
    readOnly: false,
    saveState: '',
    suggPositions: {},      // markId -> display top（避让后）
    zoom: 1                 // 显示缩放倍数，1 = 基准宽度
  };

  // 基准显示宽度（zoom=1 时）：原图 750→375、790→395、其余统一按 395 等比；标注仍按原图坐标保存，导出 PDF 2x 采样不受影响
  const DISPLAY_WIDTH_FIXED = 395;
  const ZOOM_MIN = 0.2, ZOOM_MAX = 4, ZOOM_STEP = 1.25;
  const SUGG_WIDTH = 260;
  const SUGG_MIN_H = 80;
  const SUGG_GAP = 16;
  const REF_WIDTH = 260;
  const MARK_GAP = 24; // 画布与建议区间距

  let root, sidebar, scrollArea, stageWrap, stage, overlay, svg, suggLayer, refCol, toolbar, saveStateEl;

  // ---------- 多图坐标工具 ----------
  function imgScale(i) { const im = state.images[i]; return im ? (im.displayW / im.naturalW) : 1; }
  function imgOffset(i) { const im = state.images[i]; return im ? im.offsetY : 0; }
  function canvasTotalH() { if (!state.images.length) return 0; const last = state.images[state.images.length - 1]; return last.offsetY + last.displayH; }
  function canvasMaxW() { let w = 0; state.images.forEach(im => { w = Math.max(w, im.displayW); }); return w || DISPLAY_WIDTH_FIXED; }
  function imageAtY(dy) { for (let i = state.images.length - 1; i >= 0; i--) { const im = state.images[i]; if (dy >= im.offsetY && dy <= im.offsetY + im.displayH) return i; } return Math.max(state.images.length - 1, 0); }

  function markNatToDisp(m) {
    const i = m.imgIndex != null ? m.imgIndex : 0, s = imgScale(i), offY = imgOffset(i);
    if (m.type === 'point') return { x: m.x * s, y: offY + m.y * s };
    return { x: m.x * s, y: offY + m.y * s, w: (m.w || 0) * s, h: (m.h || 0) * s };
  }
  function markAnchor(m) {
    const p = markNatToDisp(m);
    if (m.type === 'point') return p;
    return { x: p.x + p.w, y: p.y + p.h / 2 };
  }
  function suggDesiredTop(m) {
    const p = markNatToDisp(m);
    return p.y  - SUGG_MIN_H / 2 + (m.type === 'box' ? p.h / 2 : 0);
  }

  function setSaveState(s, isErr) {
    state.saveState = s;
    if (saveStateEl) {
      saveStateEl.textContent = s;
      saveStateEl.className = 'save-state' + (isErr ? ' error' : '');
    }
  }

  let saveTimer = null;
  function scheduleSave() {
    setSaveState('保存中...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 600);
  }
  async function doSave() {
    if (!state.project) { setSaveState(''); return; }
    try {
      persistProjectData();
      const r = await api.saveProject(state.project);
      if (r.ok) setSaveState('✓ 已保存');
      else setSaveState('保存失败: ' + (r.error || ''), true);
    } catch (e) {
      setSaveState('保存失败: ' + e.message, true);
    }
  }
  function persistProjectData() {
    const v = state.project.versions.find(x => x.id === state.version.id);
    if (!v) return;
    v.marks = state.marks;
    v.suggestions = {};
    Object.keys(state.sugg).forEach(k => { v.suggestions[k] = { text: state.sugg[k].text }; });
    v.refs = state.refs.map(r => ({ id: r.id, path: r.path, label: r.label, top: r.top, h: r.h }));
    v.images = state.images.map(im => ({ path: im.path, naturalW: im.naturalW, naturalH: im.naturalH }));
    delete v.detail; // 旧版单图字段
  }

  // ---------- 初始化 ----------
  async function init() {
    state.manifest = await api.getManifest();
    renderShell();
    initChangelog();
    if (state.manifest.projects.length) {
      await openProject(state.manifest.projects[0].id);
    } else {
      renderSidebar();
      renderWorkspaceEmpty();
    }
    bindGlobalKeys();
  }

  function renderShell() {
    root = $('#root');
    root.innerHTML = '';
    const app = el('div', 'app');
    app.innerHTML = `
      <div class="topbar">
        <div class="tb-left">
          <img class="app-icon" src="build-res/icon.png" alt=""/>
          <span class="logo">PinNote</span>
          <span class="proj-crumb" id="proj-crumb"></span>
        </div>
        <button type="button" class="btn small" id="add-detail-btn" title="追加设计稿到画布下方（也可拖拽图片或 Ctrl+V 粘贴）"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 1v10M1 6h10"/></svg>添加设计稿</button>
        <div class="tb-right">
          <span class="save-state"></span>
          <button type="button" class="btn small" id="save-btn" title="Ctrl+S">保存</button>
          <button type="button" class="btn small primary" id="export-btn" data-tool="export-pdf" title="导出长页 PDF">导出 PDF</button>
          <button type="button" class="btn small" id="archive-btn"></button>
          <button type="button" class="icon-btn" id="more-btn" title="更多">
            <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="13" cy="8" r="1.5" fill="currentColor"/></svg>
          </button>
          <span class="sep-v"></span>
          <div class="win-ctrls">
            <button type="button" class="win-btn" id="win-min" title="最小化"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg></button>
            <button type="button" class="win-btn" id="win-max" title="最大化/还原"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg></button>
            <button type="button" class="win-btn win-close" id="win-close" title="关闭"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/></svg></button>
          </div>
        </div>
      </div>
      <div class="main">
        <div class="sidebar"></div>
        <div class="workspace"></div>
        <button type="button" class="sidebar-expand" id="sidebar-expand" title="展开项目栏">»</button>
      </div>`;
    root.appendChild(app);
    sidebar = $('.sidebar', app);
    toolbar = null;
    saveStateEl = $('.save-state', app);
    // 侧栏空白处右键不弹系统菜单
    sidebar.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#add-detail-btn', app).onclick = onAppendImage;
    $('#save-btn', app).onclick = () => doSave();
    $('#export-btn', app).onclick = onExportPdf;
    $('#archive-btn', app).onclick = onToggleArchive;
    $('#more-btn', app).onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openCtxMenu(r.right - 170, r.bottom + 8, [
        { label: '更新日志', fn: () => showChangelog(false) },
        { label: '快捷键说明', fn: showShortcuts },
        { label: '关于 PinNote', fn: showAbout }
      ]);
    };
    $('#win-min', app).onclick = () => api.winMinimize();
    $('#win-max', app).onclick = () => api.winToggleMaximize();
    $('#win-close', app).onclick = () => api.winClose();
    $('#sidebar-expand', app).onclick = () => setSidebarCollapsed(false);
    renderToolbar();
    applySidebarCollapsed();
  }

  // 顶栏动态状态 + 悬浮工具条状态刷新（保留原函数名，各处调用点不变）
  function renderToolbar() {
    const crumb = document.getElementById('proj-crumb');
    if (crumb) {
      crumb.innerHTML = (state.project && state.version)
        ? `${escapeHtml(state.project.name)} <i class="crumb-sep">/</i> ${escapeHtml(state.version.name)}${state.readOnly ? '<em class="ro-badge">已归档</em>' : ''}`
        : '<span class="crumb-none">未打开项目</span>';
    }
    const addBtn = document.getElementById('add-detail-btn');
    if (addBtn) addBtn.disabled = !state.project || state.readOnly;
    const exBtn = document.querySelector('[data-tool="export-pdf"]');
    if (exBtn) exBtn.disabled = !state.project || !state.images.length;
    const arBtn = document.getElementById('archive-btn');
    if (arBtn) {
      arBtn.textContent = state.project && state.project.archived ? '取消归档' : '归档';
      arBtn.disabled = !state.project;
    }
    updateZoomLabel();
    refreshToolButtons();
  }

  // 无设计稿时导出无意义：置灰（renderWorkspace/renderWorkspaceEmpty 变化后都会调到这里）
  function updateExportBtn() {
    const eb = document.querySelector('[data-tool="export-pdf"]');
    if (eb) eb.disabled = !state.project || !state.images.length;
  }

  // ---------- 侧栏收起/展开 ----------
  function setSidebarCollapsed(v) {
    state.sidebarCollapsed = v;
    try { localStorage.setItem('pinnote_sidebar_collapsed', v ? '1' : '0'); } catch (e) {}
    applySidebarCollapsed();
  }
  function applySidebarCollapsed() {
    let c = false;
    try { c = localStorage.getItem('pinnote_sidebar_collapsed') === '1'; } catch (e) {}
    state.sidebarCollapsed = c;
    const app = $('.app');
    if (app) app.classList.toggle('sb-collapsed', c);
  }

  function refreshToolButtons() {
    if (!toolbar) return;
    toolbar.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === state.tool);
      b.disabled = state.readOnly && b.dataset.tool !== 'select';
    });
  }

  function setTool(t) {
    if (state.readOnly) t = 'select';
    state.tool = t;
    if (overlay) overlay.className = 'overlay' + (t === 'select' ? ' tool-select' : '');
    refreshToolButtons();
  }

  // ---------- 侧边栏 ----------
  function renderSidebar() {
    sidebar.innerHTML = '';
    const head = el('div', 'sidebar-header');
    head.appendChild(el('span', 't', '项目'));
    const ops = el('div', 'sidebar-ops');
    const add = el('button', 'btn small primary sb-add', '+');
    add.title = '新建项目';
    add.onclick = showNewProjectModal;
    ops.appendChild(add);
    const cl = el('button', 'icon-btn sb-collapse', '«');
    cl.title = '收起项目栏';
    cl.onclick = () => setSidebarCollapsed(true);
    ops.appendChild(cl);
    head.appendChild(ops);
    sidebar.appendChild(head);

    const list = el('div', 'sidebar-list');
    const current = state.manifest.projects.filter(p => !p.archived);
    const archived = state.manifest.projects.filter(p => p.archived);

    const section = (label, arr) => {
      if (!arr.length) return;
      list.appendChild(el('div', 'section-label', label));
      arr.forEach(meta => list.appendChild(projectNode(meta)));
    };
    section('当前项目', current);
    section('已归档项目', archived);
    sidebar.appendChild(list);
  }

  function projectNode(meta) {
    const node = el('div', 'proj' + (state.project && state.project.id === meta.id ? ' active' : '') + (meta.archived ? ' archived' : ''));
    const name = el('div', 'proj-name');
    name.appendChild(el('span', 'p-ico', '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.6 1.8h6.2a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>'));
    name.appendChild(el('span', null, escapeHtml(meta.name)));
    const ops = el('span');
    const del = el('span', 'del', '×');
    del.title = '删除项目';
    del.onclick = (e) => { e.stopPropagation(); confirmDeleteProject(meta); };
    ops.appendChild(del);
    name.appendChild(ops);
    name.onclick = () => openProject(meta.id);
    node.appendChild(name);

    if (state.project && state.project.id === meta.id) {
      const vers = el('div', 'versions');
      state.project.versions.forEach(v => {
        const vn = el('div', 'ver' + (state.version && state.version.id === v.id ? ' active' : ''));
        vn.appendChild(el('span', null, escapeHtml(v.name)));
        if (state.project.versions.length > 1) {
          const vd = el('span', 'vdel', '×');
          vd.title = '删除版本';
          vd.onclick = (e) => { e.stopPropagation(); confirmDeleteVersion(v); };
          vn.appendChild(vd);
        }
        vn.onclick = () => switchVersion(v.id);
        vn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isLast = state.project.versions.length <= 1;
          openCtxMenu(e.clientX, e.clientY, [
            { label: '重命名版本', disabled: state.readOnly, hint: '已归档，只读', fn: () => renameVersion(v) },
            { label: '删除版本', disabled: state.readOnly || isLast, hint: isLast ? '至少保留一个版本' : '已归档，只读', fn: () => confirmDeleteVersion(v) }
          ]);
        });
        vers.appendChild(vn);
      });
      if (!state.project.archived) {
        const av = el('div', 'add-version', '+ 添加版本');
        av.onclick = showAddVersionModal;
        vers.appendChild(av);
      }
      node.appendChild(vers);
    }
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openProjectMenu(e.clientX, e.clientY, meta);
    });
    return node;
  }

  // ---------- 项目/版本操作 ----------
  async function openProject(id) {
    const r = await api.loadProject(id);
    if (!r.ok) return;
    state.project = r.project;
    state.readOnly = !!state.project.archived;
    const vid = state.project.currentVersionId || (state.project.versions[0] && state.project.versions[0].id);
    state.version = state.project.versions.find(v => v.id === vid) || state.project.versions[0];
    await loadVersionData();
    renderSidebar();
    renderWorkspace();
    renderToolbar();
  }

  async function switchVersion(vid) {
    if (state.version && state.version.id === vid) return;
    if (!state.readOnly) await doSave();
    state.version = state.project.versions.find(v => v.id === vid);
    state.project.currentVersionId = vid;
    state.zoom = 1;
    await loadVersionData();
    renderSidebar();
    renderWorkspace();
  }

  async function loadVersionData() {
    const v = state.version;
    state.marks = (v.marks || []).map(m => ({ ...m }));
    state.sugg = {};
    Object.keys(v.suggestions || {}).forEach(k => {
      state.sugg[k] = { id: k, text: v.suggestions[k].text || '', top: 0 };
    });
    state.images = [];
    state.refs = [];
    state.suggPositions = {};
    state.selected = null;
    state.editing = null;
    // 加载图片列表（兼容旧版单图 v.detail）
    const imgList = (v.images && v.images.length) ? v.images : (v.detail ? [v.detail] : []);
    for (const imgMeta of imgList) {
      const d = await api.readDataUrl(imgMeta.path);
      if (!d.ok) continue;
      state.images.push({ path: imgMeta.path, naturalW: imgMeta.naturalW, naturalH: imgMeta.naturalH, dataUrl: d.dataUrl, displayW: 0, displayH: 0, offsetY: 0 });
    }
    layoutCanvas();
    for (const rr of (v.refs || [])) {
      const d = await api.readDataUrl(rr.path);
      if (d.ok) state.refs.push({ id: rr.id, path: rr.path, dataUrl: d.dataUrl, label: rr.label, top: rr.top || 0, h: rr.h || 0 });
    }
  }

  function showNewProjectModal() {
    modal({
      title: '新建项目',
      body: `<input type="text" id="np-name" placeholder="项目名称，如 JSQ-C50V3" maxlength="60"/>
             <div class="hint">创建后将自动建立 V1 版本。</div>
             <div class="np-mode">
               <label class="radio"><input type="radio" name="np-mode" value="upload" checked/>上传设计稿（选择本地图片）</label>
               <label class="radio"><input type="radio" name="np-mode" value="blank"/>创建空白项目（之后再上传/拖拽/粘贴）</label>
             </div>`,
      okText: '创建',
      onOk: async (body) => {
        const name = $('#np-name', body).value.trim();
        if (!name) return false;
        const mode = (body.querySelector('input[name="np-mode"]:checked') || {}).value;
        if (mode === 'blank') {
          await createProjectBlank(name);
          return true;
        }
        const pid = uid();
        const project = { id: pid, name, archived: false, versions: [{ id: uid(), name: 'V1' }], currentVersionId: null };
        project.currentVersionId = project.versions[0].id;
        state.project = project;
        state.version = project.versions[0];
        state.marks = []; state.sugg = {}; state.refs = []; state.images = [];
        const ir = await api.importDetail(pid, project.versions[0].id, null);
        if (!ir.ok) {
          if (ir.canceled) { state.project = null; state.version = null; return false; }
          alert('导入失败: ' + ir.error); state.project = null; state.version = null; return false;
        }
        try {
          await pushImagePath(ir.path);
        } catch (e) {
          alert('图片加载失败: ' + e.message);
          state.project = null; state.version = null;
          return false;
        }
        await doSave();
        state.manifest = await api.getManifest();
        renderSidebar(); renderWorkspace(); renderToolbar();
        return true;
      }
    });
  }

  async function pushImagePath(p) {
    const d = await api.readDataUrl(p);
    if (!d.ok) return;
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('图片解码失败: ' + p));
      img.src = d.dataUrl;
      setTimeout(() => rej(new Error('图片加载超时: ' + p)), 10000);
    });
    state.images.push({ path: p, naturalW: img.naturalWidth, naturalH: img.naturalHeight, dataUrl: d.dataUrl, displayW: 0, displayH: 0, offsetY: 0 });
    layoutCanvas();
  }

  // 按基准宽度 × zoom 计算所有图片的显示尺寸和偏移
  function layoutCanvas() {
    let offY = 0;
    state.images.forEach(im => {
      const baseW = im.naturalW === 750 ? 375 : DISPLAY_WIDTH_FIXED;
      im.displayW = Math.round(baseW * state.zoom);
      im.displayH = Math.round(im.naturalH * (im.displayW / im.naturalW));
      im.offsetY = offY;
      offY += im.displayH + 12; // 图片间距 12px
    });
    if (state.images.length > 0) offY -= 12; // 最后一张不加间隙
  }

  function setZoom(z, centerY) {
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (Math.abs(nz - state.zoom) < 0.001) return;
    const oldH = canvasTotalH() || 1;
    let ratio = null;
    if (scrollArea && state.images.length) {
      const cy = centerY != null ? centerY : (scrollArea.scrollTop + scrollArea.clientHeight / 2);
      ratio = cy / Math.max(oldH, 1);
    }
    state.zoom = nz;
    layoutCanvas();
    renderWorkspace();
    if (ratio != null && scrollArea) {
      scrollArea.scrollTop = ratio * canvasTotalH() - scrollArea.clientHeight / 2;
    }
    updateZoomLabel();
  }

  function updateZoomLabel() {
    const el2 = document.getElementById('zoom-label');
    if (el2) el2.textContent = Math.round(state.zoom * 100) + '%';
  }

  function showAddVersionModal() {
    if (!state.project || state.readOnly) return;
    const n = state.project.versions.length + 1;
    modal({
      title: '添加版本 V' + n,
      body: `<div class="np-mode">
               <label class="radio"><input type="radio" name="av-mode" value="upload" checked/>上传设计稿（选择本地图片）</label>
               <label class="radio"><input type="radio" name="av-mode" value="blank"/>创建空白版本（之后再上传/拖拽/粘贴）</label>
             </div>`,
      okText: '创建',
      onOk: async (body) => {
        const mode = (body.querySelector('input[name="av-mode"]:checked') || {}).value || 'upload';
        const v = { id: uid(), name: 'V' + n };
        // 上传模式先选文件，取消时不动任何状态
        let ir = null;
        if (mode === 'upload') {
          ir = await api.importDetail(state.project.id, v.id, null);
          if (!ir.ok) {
            if (!ir.canceled) alert('导入失败: ' + ir.error);
            return false;
          }
        }
        state.project.versions.push(v);
        state.version = v;
        state.project.currentVersionId = v.id;
        state.marks = []; state.sugg = {}; state.refs = []; state.images = [];
        state.zoom = 1;
        if (ir) {
          try {
            await pushImagePath(ir.path);
          } catch (e) {
            alert('图片加载失败: ' + e.message);
          }
        }
        await doSave();
        renderSidebar(); renderWorkspace(); renderToolbar();
        return true;
      }
    });
  }

  function confirmDeleteProject(meta) {
    modal({
      title: '删除项目',
      body: `<div class="danger-hint">确认删除项目「${escapeHtml(meta.name)}」？<br>项目下所有版本、标注、建议、参考图都会被删除，且不可恢复。</div>`,
      okText: '确认删除', danger: true,
      onOk: async () => {
        await api.deleteProject(meta.id);
        state.manifest = await api.getManifest();
        if (state.project && state.project.id === meta.id) {
          state.project = null; state.version = null;
          renderWorkspaceEmpty();
        }
        renderSidebar(); renderToolbar();
        return true;
      }
    });
  }

  function confirmDeleteVersion(v) {
    modal({
      title: '删除版本',
      body: `<div class="danger-hint">确认删除版本「${escapeHtml(v.name)}」？该版本的标注、建议、参考图都会被删除。</div>`,
      okText: '确认删除', danger: true,
      onOk: async () => {
        state.project.versions = state.project.versions.filter(x => x.id !== v.id);
        if (state.version.id === v.id) {
          state.version = state.project.versions[0];
          state.project.currentVersionId = state.version.id;
          await loadVersionData();
        }
        await doSave();
        renderSidebar(); renderWorkspace();
        return true;
      }
    });
  }

  async function onToggleArchive() {
    if (!state.project) return;
    state.project.archived = !state.project.archived;
    state.readOnly = state.project.archived;
    if (state.readOnly) { state.tool = 'select'; state.selected = null; state.editing = null; }
    await doSave();
    state.manifest = await api.getManifest();
    renderSidebar(); renderToolbar(); renderWorkspace();
  }

  // ---------- 工作区 ----------
  function renderWorkspaceEmpty() {
    const ws = $('.workspace');
    toolbar = null;
    ws.innerHTML = '';
    if (!state.project) {
      ws.innerHTML = '<div class="empty-state"><div style="font-size:15px">新建或选择一个项目开始</div></div>';
      updateExportBtn();
      return;
    }
    // 空白项目/版本：上传投放区（上传按钮 + 拖拽 + Ctrl+V 粘贴）
    const vName = state.version ? state.version.name : '';
    const drop = el('div', 'empty-upload');
    drop.innerHTML = `
      <div class="eu-t">${escapeHtml(vName)} 还没有设计稿</div>
      ${state.readOnly ? '<div class="eu-hint">项目已归档，只读</div>' : `
        <button class="btn primary eu-btn">上传设计稿</button>
        <div class="eu-hint">也可直接把图片拖到这里，或按 Ctrl+V 粘贴</div>`}`;
    if (!state.readOnly) {
      drop.querySelector('.eu-btn').onclick = onAppendImage;
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('droppable'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('droppable'));
      drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        drop.classList.remove('droppable');
        const files = Array.from(e.dataTransfer.files || []).filter(f => /\.(jpe?g|png|webp)$/i.test(f.name));
        for (const f of files) await appendImageFromFile(f);
      });
    }
    ws.appendChild(drop);
    updateExportBtn();
  }

  function renderWorkspace() {
    const ws = $('.workspace');
    ws.innerHTML = '';
    if (!state.images.length) { renderWorkspaceEmpty(); return; }
    layoutCanvas();
    updateZoomLabel();
    const totalH = canvasTotalH(), maxW = canvasMaxW();
    scrollArea = el('div', 'scroll-area');
    stageWrap = el('div', 'stage-wrap');
    stage = el('div', 'stage' + (state.readOnly ? ' readonly' : ''));
    stage.style.width = maxW + 'px';
    stage.style.height = totalH + 'px';

    // 每张图
    state.images.forEach((im, i) => {
      const img = el('img', 'detail-img');
      img.src = im.dataUrl;
      img.style.width = im.displayW + 'px'; img.style.height = im.displayH + 'px';
      img.style.position = 'absolute'; img.style.left = '0'; img.style.top = im.offsetY + 'px';
      stage.appendChild(img);
      if (!state.readOnly) {
        const del = el('span', 'imgdel', '×');
        del.title = '删除此图';
        del.style.left = (im.displayW - 22) + 'px'; del.style.top = (im.offsetY + 4) + 'px';
        del.onclick = (e) => { e.stopPropagation(); deleteImage(i); };
        stage.appendChild(del);
      }
    });

    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'links');
    svg.setAttribute('width', maxW);
    svg.setAttribute('height', totalH);
    stage.appendChild(svg);
    overlay = el('div', 'overlay' + (state.tool === 'select' ? ' tool-select' : ''));
    overlay.style.width = maxW + 'px'; overlay.style.height = totalH + 'px';
    stage.appendChild(overlay);
    suggLayer = el('div');
    suggLayer.style.position = 'absolute';
    suggLayer.style.left = (maxW + MARK_GAP) + 'px';
    suggLayer.style.top = '0';
    suggLayer.style.width = SUGG_WIDTH + 'px';
    suggLayer.style.height = totalH + 'px';
    stageWrap.appendChild(stage);
    stageWrap.appendChild(suggLayer);

    refCol = el('div', 'refcol');
    refCol.style.left = (maxW + MARK_GAP + SUGG_WIDTH + MARK_GAP) + 'px';
    refCol.style.height = totalH + 'px';
    stageWrap.appendChild(refCol);

    scrollArea.appendChild(stageWrap);

    const totalW = maxW + MARK_GAP + SUGG_WIDTH + MARK_GAP + 300 + 40;
    stageWrap.style.width = totalW + 'px';

    ws.appendChild(scrollArea);

    // 画布底部悬浮工具条
    const fb = el('div', 'floatbar');
    fb.innerHTML = `
      <button type="button" class="tool-btn" data-tool="select" title="V - 选择/拖动"><img class="tool-ico" src="build-res/icons/mouse.png" alt=""/><span>鼠标</span></button>
      <button type="button" class="tool-btn" data-tool="point" title="P - 点击创建点批注"><img class="tool-ico" src="build-res/icons/point.png" alt=""/><span>点批注</span></button>
      <button type="button" class="tool-btn" data-tool="box" title="B - 拖拽创建框批注"><img class="tool-ico" src="build-res/icons/box.png" alt=""/><span>框批注</span></button>
      <span class="sep"></span>
      <button type="button" class="tool-btn zb" data-z="out" title="缩小 (-)">−</button>
      <span class="zoom-label" id="zoom-label" title="点击重置为 100%">100%</span>
      <button type="button" class="tool-btn zb" data-z="in" title="放大 (+)">+</button>
      <span class="sep"></span>
      <button type="button" class="tool-btn" id="zoom-fit" title="重置缩放"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1 4V1h3M10 1h3v3M13 10v3h-3M4 13H1v-3"/></svg><span>适应</span></button>`;
    fb.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
    fb.querySelector('[data-z="out"]').onclick = () => setZoom(state.zoom / ZOOM_STEP);
    fb.querySelector('[data-z="in"]').onclick = () => setZoom(state.zoom * ZOOM_STEP);
    $('.zoom-label', fb).onclick = () => setZoom(1);
    $('#zoom-fit', fb).onclick = () => setZoom(1);
    ws.appendChild(fb);
    toolbar = fb;

    bindOverlayEvents();
    bindRefDrop();
    bindCanvasDrop();
    renderMarks();
    renderSuggs();
    renderRefs();
    layoutSuggs();
    drawLinks();
    updateExportBtn();
  }

  function stagePointFromEvent(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------- 标注渲染 ----------
  function renderMarks() {
    stage.querySelectorAll('.mark-point,.mark-box').forEach(n => n.remove());
    state.marks.forEach(m => {
      const p = markNatToDisp(m);
      let n;
      if (m.type === 'point') {
        n = el('div', 'mark-point');
        n.style.left = p.x + 'px'; n.style.top = p.y + 'px';
      } else {
        n = el('div', 'mark-box');
        n.style.left = p.x + 'px'; n.style.top = p.y + 'px';
        n.style.width = p.w + 'px'; n.style.height = p.h + 'px';
        if (!state.readOnly) n.appendChild(el('span', 'rs'));
      }
      n.dataset.id = m.id;
      if (state.selected === m.id) n.classList.add('selected');
      bindMarkEvents(n, m);
      stage.appendChild(n);
    });
  }

  // markAnchor 已定义在上方

  function drawLinks() {
    if (!svg) return;
    const w = canvasMaxW() + MARK_GAP + SUGG_WIDTH;
    const h = Math.max(canvasTotalH(), stage ? stage.offsetHeight : 0);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.style.width = w + 'px'; svg.style.height = h + 'px';
    svg.innerHTML = '';
    state.marks.forEach(m => {
      const a = markAnchor(m);
      const st = state.suggPositions[m.id];
      if (st == null) return;
      const sEl = suggLayer.querySelector(`[data-id="${m.id}"]`);
      const sh = sEl ? sEl.offsetHeight : SUGG_MIN_H;
      const x2 = canvasMaxW() + MARK_GAP;
      const y2 = st + sh / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', '#bf4d55');
      line.setAttribute('stroke-width', '1.5');
      if (state.selected === m.id) line.setAttribute('stroke', '#1677ff');
      svg.appendChild(line);
    });
  }

  // ---------- 建议框 ----------
  function renderSuggs() {
    if (!suggLayer) return;
    suggLayer.innerHTML = '';
    state.marks.forEach(m => {
      const s = state.sugg[m.id] || (state.sugg[m.id] = { id: m.id, text: '', top: 0 });
      const box = el('div', 'sugg' + (state.selected === m.id ? ' selected' : '') + (state.readOnly ? ' readonly' : ''));
      box.dataset.id = m.id;
      const ta = el('textarea');
      ta.value = s.text;
      ta.placeholder = '输入修改建议…';
      ta.readOnly = state.readOnly;
      ta.oninput = () => {
        s.text = ta.value;
        autoGrow(ta);
        layoutSuggs();
        scheduleSave();
      };
      ta.onfocus = () => { selectMark(m.id); state.editing = m.id; };
      ta.onblur = () => { if (state.editing === m.id) state.editing = null; };
      box.appendChild(ta);
      if (!state.readOnly) {
        const del = el('span', 'sdel', '×');
        del.onclick = (e) => { e.stopPropagation(); deleteMark(m.id); };
        box.appendChild(del);
      }
      box.onmousedown = () => selectMark(m.id);
      suggLayer.appendChild(box);
      autoGrow(ta);
    });
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    const h = Math.max(ta.scrollHeight + 4, SUGG_MIN_H - 18);
    ta.style.height = h + 'px';
  }

  function layoutSuggs() {
    if (!suggLayer) return;
    // 按期望位置排序，做避让
    const items = state.marks
      .map(m => ({ id: m.id, desired: suggDesiredTop(m) }))
      .sort((a, b) => a.desired - b.desired);
    let cursor = 0;
    items.forEach(it => {
      const sEl = suggLayer.querySelector(`[data-id="${it.id}"]`);
      const h = sEl ? Math.max(sEl.offsetHeight, SUGG_MIN_H) : SUGG_MIN_H;
      let top = Math.max(it.desired, 0);
      if (top < cursor) top = cursor;
      cursor = top + h + SUGG_GAP;
      state.suggPositions[it.id] = top;
      if (sEl) {
        sEl.style.top = top + 'px';
        sEl.style.left = '0';
        sEl.style.width = SUGG_WIDTH + 'px';
      }
    });
    // 调整 suggLayer 高度以容纳溢出内容
    const maxBottom = Math.max(cursor, canvasTotalH());
    suggLayer.style.height = maxBottom + 'px';
    const stageH = Math.max(canvasTotalH(), maxBottom, refsBottom());
    stage.style.height = stageH + 'px';
    svg.setAttribute('height', stageH);
    svg.style.height = stageH + 'px';
    refCol.style.height = stageH + 'px';
    drawLinks();
  }

  function refsBottom() {
    let b = 0;
    state.refs.forEach(r => { b = Math.max(b, (r.top || 0) + (r.h || 0) + 40); });
    return b;
  }

  // ---------- 标注事件 ----------
  let dragCtx = null;

  function bindOverlayEvents() {
    if (!overlay) return;
    overlay.addEventListener('mousedown', (e) => {
      if (state.readOnly) return;
      const p = stagePointFromEvent(e);
      if (state.tool === 'point') {
        const imgIdx = imageAtY(p.y);
        const im = state.images[imgIdx], s = imgScale(imgIdx);
        addMark({ type: 'point',
          x: clamp(p.x / s, 0, im.naturalW),
          y: clamp((p.y - im.offsetY) / s, 0, im.naturalH),
          imgIndex: imgIdx });
      } else if (state.tool === 'box') {
        dragCtx = { kind: 'draw', startX: p.x, startY: p.y, cur: null };
        const ghost = el('div', 'mark-box');
        ghost.style.borderStyle = 'dashed';
        ghost.dataset.ghost = '1';
        stage.appendChild(ghost);
        dragCtx.ghost = ghost;
        e.preventDefault();
      } else {
        selectMark(null);
      }
    });
    overlay.addEventListener('dblclick', () => {
      // 仅选择工具下双击才追加图片，避免与点/框工具冲突
      if (state.readOnly || state.tool !== 'select') return;
      replaceDetailImage();
    });
  }

  async function replaceDetailImage() {
    const ir = await api.importDetailAppend(state.project.id, state.version.id, null);
    if (ir.ok) {
      try {
        await pushImagePath(ir.path);
      } catch (e) {
        alert('图片加载失败: ' + e.message);
        return;
      }
      await doSave();
      renderWorkspace();
    }
  }

  // 重渲染并保持滚动位置（追加图片后不弹回顶部）
  function rerenderKeepScroll() {
    const prevTop = scrollArea ? scrollArea.scrollTop : 0;
    const prevH = scrollArea ? scrollArea.scrollHeight : 0;
    renderWorkspace();
    if (scrollArea && prevH > 0) {
      // 内容变高时按比例维持视口对应内容位置
      const ratio = prevH > 0 ? prevTop / prevH : 0;
      scrollArea.scrollTop = Math.round(ratio * scrollArea.scrollHeight);
    }
  }

  async function onAppendImage() {
    if (state.readOnly) return;
    const ir = await api.importDetailAppend(state.project.id, state.version.id, null);
    if (ir.ok) {
      try {
        await pushImagePath(ir.path);
      } catch (e) {
        alert('图片加载失败: ' + e.message);
        return;
      }
      await doSave();
      rerenderKeepScroll();
      if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight; // 追加后滚到新图
    } else if (!ir.canceled) alert('导入失败: ' + ir.error);
  }

  async function appendImageFromFile(file) {
    const buf = await file.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    const r = await api.saveDetailBuffer(state.project.id, state.version.id, b64);
    if (!r.ok) { alert('保存失败: ' + r.error); return; }
    try {
      await pushImagePath(r.path);
    } catch (e) {
      alert('图片加载失败: ' + e.message);
      return;
    }
    await doSave();
    rerenderKeepScroll();
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight; // 追加后滚到新图
  }

  async function deleteImage(imgIndex) {
    const im = state.images[imgIndex];
    if (im) { try { await api.deleteFile(im.path); } catch (e) {} }
    state.images.splice(imgIndex, 1);
    // 删除属于该图片的标注，其余 reindex
    state.marks = state.marks.filter(m => {
      const mi = m.imgIndex != null ? m.imgIndex : 0;
      if (mi === imgIndex) { delete state.sugg[m.id]; delete state.suggPositions[m.id]; return false; }
      if (mi > imgIndex) m.imgIndex = mi - 1;
      return true;
    });
    layoutCanvas();
    await doSave();
    renderWorkspace();
  }

  function addMark(m) {
    m.id = uid();
    state.marks.push(m);
    state.sugg[m.id] = { id: m.id, text: '', top: 0 };
    state.selected = m.id;
    renderMarks(); renderSuggs(); layoutSuggs();
    scheduleSave();
    const sEl = suggLayer.querySelector(`[data-id="${m.id}"] textarea`);
    if (sEl) sEl.focus();
    state.editing = m.id;
  }

  function deleteMark(id) {
    state.marks = state.marks.filter(m => m.id !== id);
    delete state.sugg[id];
    delete state.suggPositions[id];
    if (state.selected === id) state.selected = null;
    renderMarks(); renderSuggs(); layoutSuggs();
    scheduleSave();
  }

  function selectMark(id) {
    state.selected = id;
    stage.querySelectorAll('.mark-point,.mark-box').forEach(n => {
      n.classList.toggle('selected', n.dataset.id === id);
    });
    suggLayer.querySelectorAll('.sugg').forEach(n => {
      n.classList.toggle('selected', n.dataset.id === id);
    });
    drawLinks();
  }

  function bindMarkEvents(n, m) {
    n.addEventListener('mousedown', (e) => {
      if (state.readOnly) return;
      e.stopPropagation();
      selectMark(m.id);
      const p = stagePointFromEvent(e);
      const isResize = e.target.classList && e.target.classList.contains('rs');
      if (m.type === 'point') {
        dragCtx = { kind: 'move-point', id: m.id };
      } else if (isResize) {
        dragCtx = { kind: 'resize-box', id: m.id, startX: p.x, startY: p.y, ow: m.w, oh: m.h };
      } else {
        const dp = markNatToDisp(m);
        dragCtx = { kind: 'move-box', id: m.id, dx: p.x - dp.x, dy: p.y - dp.y };
      }
      e.preventDefault();
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!dragCtx || !stage) return;
    const p = stagePointFromEvent(e);
    if (dragCtx.kind === 'draw') {
      // 框选范围限制在画布内，不允许越过右缘进入建议区
      const x0 = clamp(dragCtx.startX, 0, canvasMaxW());
      const y0 = clamp(dragCtx.startY, 0, canvasTotalH());
      const px = clamp(p.x, 0, canvasMaxW());
      const py = clamp(p.y, 0, canvasTotalH());
      const x = Math.min(x0, px), y = Math.min(y0, py);
      const w = Math.abs(px - x0), h = Math.abs(py - y0);
      Object.assign(dragCtx.ghost.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      dragCtx.cur = { x, y, w, h };
    } else if (dragCtx.kind === 'move-point') {
      const m = state.marks.find(x => x.id === dragCtx.id);
      if (!m) return;
      const i = m.imgIndex != null ? m.imgIndex : 0, im = state.images[i], s = imgScale(i);
      m.x = clamp(p.x / s, 0, im.naturalW);
      m.y = clamp((p.y - im.offsetY) / s, 0, im.naturalH);
      refreshMarkEl(m); layoutSuggs();
    } else if (dragCtx.kind === 'move-box') {
      const m = state.marks.find(x => x.id === dragCtx.id);
      if (!m) return;
      const i = m.imgIndex != null ? m.imgIndex : 0, im = state.images[i], s = imgScale(i);
      m.x = clamp((p.x - dragCtx.dx) / s, 0, im.naturalW - m.w);
      m.y = clamp((p.y - dragCtx.dy - im.offsetY) / s, 0, im.naturalH - m.h);
      refreshMarkEl(m); layoutSuggs();
    } else if (dragCtx.kind === 'resize-box') {
      const m = state.marks.find(x => x.id === dragCtx.id);
      if (!m) return;
      const i = m.imgIndex != null ? m.imgIndex : 0, im = state.images[i];
      const s = imgScale(i);
      const dw = (p.x - dragCtx.startX) / s, dh = (p.y - dragCtx.startY) / s;
      m.w = clamp(dragCtx.ow + dw, 20, im.naturalW - m.x);
      m.h = clamp(dragCtx.oh + dh, 12, im.naturalH - m.y);
      refreshMarkEl(m); layoutSuggs();
    }
  });

  // 取消未完成的框选（mouseup 丢失时兜底）
  function cancelDraw() {
    if (dragCtx && dragCtx.kind === 'draw' && dragCtx.ghost) dragCtx.ghost.remove();
    dragCtx = null;
  }
  // 任何在画布外的 mousedown（如点击建议框）都取消未完成的框选
  document.addEventListener('mousedown', (e) => {
    if (dragCtx && dragCtx.kind === 'draw' && !(overlay && overlay.contains(e.target))) cancelDraw();
  }, true);
  window.addEventListener('blur', cancelDraw);

  document.addEventListener('mouseup', () => {
    if (!dragCtx) return;
    if (dragCtx.kind === 'draw') {
      if (dragCtx.ghost) dragCtx.ghost.remove();
      const c = dragCtx.cur;
      if (c && c.w > 8 && c.h > 8) {
        // 以框中心判定所属图片，并把框限制在该图片范围内
        const imgIdx = imageAtY(c.y + c.h / 2);
        const im = state.images[imgIdx], s = imgScale(imgIdx);
        const x1 = clamp(c.x, 0, im.displayW);
        const y1 = clamp(c.y, im.offsetY, im.offsetY + im.displayH);
        const x2 = clamp(c.x + c.w, 0, im.displayW);
        const y2 = clamp(c.y + c.h, im.offsetY, im.offsetY + im.displayH);
        const wn = (x2 - x1) / s, hn = (y2 - y1) / s;
        if (wn * s > 8 && hn * s > 8) {
          addMark({ type: 'box', x: x1 / s, y: (y1 - im.offsetY) / s, w: wn, h: hn, imgIndex: imgIdx });
        }
      }
    } else {
      scheduleSave();
    }
    dragCtx = null;
  });

  function refreshMarkEl(m) {
    const n = stage.querySelector(`[data-id="${m.id}"].mark-point,[data-id="${m.id}"].mark-box`);
    if (!n) return;
    const p = markNatToDisp(m);
    if (m.type === 'point') {
      n.style.left = p.x + 'px'; n.style.top = p.y + 'px';
    } else {
      n.style.left = p.x + 'px'; n.style.top = p.y + 'px';
      n.style.width = p.w + 'px'; n.style.height = p.h + 'px';
    }
  }

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // ---------- 参考图 ----------
  function renderRefs() {
    if (!refCol) return;
    refCol.querySelectorAll('.ref-item,.ref-empty').forEach(n => n.remove());
    if (!state.refs.length) {
      const em = el('div', 'ref-empty');
      em.innerHTML = state.readOnly
        ? '<div class="re-plus">＋</div><div class="re-t">暂无参考图</div>'
        : '<div class="re-plus">＋</div><div class="re-t">拖入或粘贴参考图</div>';
      em.style.position = 'relative';
      refCol.appendChild(em);
      return;
    }
    state.refs.forEach(r => {
      const item = el('div', 'ref-item');
      item.dataset.id = r.id;
      item.style.top = (r.top || 0) + 'px';
      const img = el('img');
      img.src = r.dataUrl;
      img.draggable = false;
      img.onload = () => {
        r.h = REF_WIDTH * (img.naturalHeight / img.naturalWidth);
        layoutSuggs();
      };
      item.appendChild(img);
      item.appendChild(el('div', 'rl', escapeHtml(r.label)));
      if (!state.readOnly) {
        const del = el('span', 'rdel', '×');
        del.onclick = (e) => { e.stopPropagation(); deleteRef(r.id); };
        item.appendChild(del);
      }
      item.addEventListener('mousedown', (e) => {
        if (state.readOnly || e.target.classList.contains('rdel')) return;
        e.preventDefault();
        const startY = e.clientY;
        const origTop = r.top || 0;
        const move = (ev) => {
          r.top = Math.max(0, origTop + ev.clientY - startY);
          item.style.top = r.top + 'px';
        };
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          layoutSuggs();
          scheduleSave();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
      refCol.appendChild(item);
    });
  }

  function bindRefDrop() {
    if (!refCol) return;
    refCol.addEventListener('dragover', (e) => {
      if (state.readOnly) return;
      e.preventDefault();
      refCol.classList.add('droppable');
    });
    refCol.addEventListener('dragleave', () => refCol.classList.remove('droppable'));
    refCol.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻止冒泡到 scrollArea，避免参考图同时被加进画布
      refCol.classList.remove('droppable');
      if (state.readOnly) return;
      // 参考图放在鼠标松手位置（相对参考图区顶部）
      const rect = refCol.getBoundingClientRect();
      const dropTop = Math.max(0, Math.round(e.clientY - rect.top));
      const files = Array.from(e.dataTransfer.files || []).filter(f =>
        /\.(jpe?g|png|webp)$/i.test(f.name));
      for (const f of files) {
        await addRefFromFile(f, dropTop);
      }
    });
  }

  function bindCanvasDrop() {
    if (!scrollArea) return;
    scrollArea.addEventListener('dragover', (e) => {
      if (state.readOnly) return;
      e.preventDefault();
      scrollArea.classList.add('droppable');
    });
    scrollArea.addEventListener('dragleave', () => scrollArea.classList.remove('droppable'));
    scrollArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      scrollArea.classList.remove('droppable');
      if (state.readOnly) return;
      const files = Array.from(e.dataTransfer.files || []).filter(f =>
        /\.(jpe?g|png|webp)$/i.test(f.name));
      for (const f of files) {
        await appendImageFromFile(f);
      }
    });
  }

  function nextRefLabel() {
    const nums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    return '图' + (nums[state.refs.length] || ('[' + (state.refs.length + 1) + ']'));
  }

  async function addRefFromFile(file, top) {
    // 读取为 base64，走主进程存入数据目录（不依赖原始路径）
    const buf = await file.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    const label = nextRefLabel();
    const r = await api.saveRefBuffer(state.project.id, state.version.id, 'ref_' + Date.now(), b64);
    if (!r.ok) { alert('参考图保存失败: ' + r.error); return; }
    const d = await api.readDataUrl(r.path);
    state.refs.push({ id: uid(), path: r.path, dataUrl: d.dataUrl, label, top: top != null ? top : 0, h: 0 });
    renderRefs();
    scheduleSave();
  }

  async function deleteRef(id) {
    const r = state.refs.find(x => x.id === id);
    if (r) { try { await api.deleteFile(r.path); } catch (e) {} }
    state.refs = state.refs.filter(x => x.id !== id);
    // 重排编号，保证界面与导出一致
    state.refs.forEach((x, i) => {
      const nums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
      x.label = '图' + (nums[i] || ('[' + (i + 1) + ']'));
    });
    renderRefs(); layoutSuggs();
    scheduleSave();
  }

  function arrayBufferToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // ---------- 导出 PDF ----------
  async function onExportPdf() {
    if (!state.project || !state.images.length) return;
    setSaveState('正在导出 PDF…');
    await doSave();
    const layout = buildExportLayout();
    const r = await api.exportPdf({ project: state.project, version: state.version, layout });
    if (r.ok) setSaveState('✓ 已导出');
    else if (r.canceled) setSaveState('✓ 已保存');
    else { setSaveState('导出失败: ' + r.error, true); alert('导出失败: ' + r.error); }
  }

  function buildExportLayout() {
    const maxW = canvasMaxW();
    const suggLeft = maxW + MARK_GAP;
    const refLeft = suggLeft + SUGG_WIDTH + MARK_GAP;
    const detailImages = state.images.map(im => ({
      dataUrl: im.dataUrl, left: 0, top: im.offsetY, width: im.displayW, height: im.displayH
    }));
    const marks = state.marks.map(m => {
      const p = markNatToDisp(m);
      if (m.type === 'point') return { type: 'point', x: p.x, y: p.y };
      return { type: 'box', x: p.x, y: p.y, w: p.w, h: p.h };
    });
    const suggestions = state.marks.map(m => {
      const sEl = suggLayer.querySelector(`[data-id="${m.id}"]`);
      return {
        left: suggLeft,
        top: state.suggPositions[m.id] || 0,
        width: SUGG_WIDTH,
        height: sEl ? Math.max(sEl.offsetHeight, SUGG_MIN_H) : SUGG_MIN_H,
        text: (state.sugg[m.id] && state.sugg[m.id].text) || ''
      };
    });
    const lines = state.marks.map(m => {
      const a = markAnchor(m);
      const sEl = suggLayer.querySelector(`[data-id="${m.id}"]`);
      const sh = sEl ? Math.max(sEl.offsetHeight, SUGG_MIN_H) : SUGG_MIN_H;
      return { x1: a.x, y1: a.y, x2: suggLeft, y2: (state.suggPositions[m.id] || 0) + sh / 2 };
    });
    const refs = state.refs.map(r => ({
      left: refLeft + 20,
      top: r.top || 0,
      width: REF_WIDTH,
      height: r.h || 0,
      dataUrl: r.dataUrl,
      label: r.label
    }));
    let height = canvasTotalH();
    suggestions.forEach(s => { height = Math.max(height, s.top + s.height + 40); });
    refs.forEach(r => { height = Math.max(height, r.top + r.height + 40); });
    const width = refLeft + 300 + 20;
    return { width, height, detailImages, marks, lines, suggestions, refs };
  }

  // ---------- 快捷键 ----------
  function bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const inInput = tag === 'textarea' || tag === 'input';
      if (e.key === 'Escape') {
        const mask = document.querySelector('.modal-mask');
        if (mask) { mask.remove(); return; } // Esc 关闭弹窗/粘贴选择/更新日志
        if (inInput) { e.target.blur(); state.editing = null; }
        setTool('select');
        selectMark(null);
        return;
      }
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        doSave();
        return;
      }
      if (inInput) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selected && !state.readOnly) {
          e.preventDefault();
          deleteMark(state.selected);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 'p') setTool('point');
      else if (k === 'b') setTool('box');
      else if (e.key === '+' || e.key === '=') setZoom(state.zoom * ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') setZoom(state.zoom / ZOOM_STEP);
      else if (e.key === '0') setZoom(1);
    });

    // Ctrl + 滚轮缩放（以鼠标位置为基准）
    document.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || !state.images.length) return;
      e.preventDefault();
      setZoom(state.zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
    }, { passive: false });

    // Ctrl+V 粘贴图片：文本框内优先粘贴文字；有图片时拦截并路由
    document.addEventListener('paste', (e) => {
      if (!state.project) return;
      // 真实粘贴事件的目标是焦点元素；事件派发到 document 时以 activeElement 为准
      const tgt = (e.target && e.target.tagName) ? e.target : document.activeElement;
      const tag = ((tgt && tgt.tagName) || '').toLowerCase();
      const inInput = tag === 'textarea' || tag === 'input';
      const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
      const imgItems = items.filter(it => it.kind === 'file' && /^image\//.test(it.type));
      if (!imgItems.length) return; // 剪贴板没有图片：走默认行为
      const hasText = items.some(it => it.type === 'text/plain');
      if (inInput && hasText) return; // 文本框内优先粘贴文字
      e.preventDefault();
      if (state.readOnly) { toast('项目已归档，处于只读状态'); return; }
      const files = imgItems.map(it => it.getAsFile()).filter(Boolean);
      if (files.length) routePastedFiles(files);
    });
  }

  // ---------- 右键菜单（自绘，风格与弹窗一致） ----------
  let ctxMenuEl = null;
  function ctxDocDown(e) { if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeCtxMenu(); }
  function ctxEsc(e) { if (e.key === 'Escape') closeCtxMenu(); }
  function closeCtxMenu() {
    if (!ctxMenuEl) return;
    ctxMenuEl.remove();
    ctxMenuEl = null;
    document.removeEventListener('mousedown', ctxDocDown, true);
    document.removeEventListener('keydown', ctxEsc, true);
    document.removeEventListener('scroll', closeCtxMenu, true);
    window.removeEventListener('blur', closeCtxMenu);
  }
  function openCtxMenu(x, y, items) {
    closeCtxMenu();
    const menu = el('div', 'ctx-menu');
    items.forEach((it) => {
      if (it === '-') { menu.appendChild(el('div', 'ctx-sep')); return; }
      const mi = el('div', 'ctx-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : ''), escapeHtml(it.label));
      if (it.disabled) {
        mi.title = it.hint || '';
      } else {
        mi.onclick = () => { closeCtxMenu(); it.fn(); };
      }
      menu.appendChild(mi);
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    ctxMenuEl = menu;
    document.addEventListener('mousedown', ctxDocDown, true);
    document.addEventListener('keydown', ctxEsc, true);
    document.addEventListener('scroll', closeCtxMenu, true);
    window.addEventListener('blur', closeCtxMenu);
  }

  function openProjectMenu(x, y, meta) {
    const archived = !!meta.archived;
    openCtxMenu(x, y, [
      { label: '重命名项目', fn: () => renameProject(meta) },
      { label: archived ? '取消归档' : '归档项目', fn: () => toggleArchiveById(meta.id) },
      '-',
      { label: '删除项目', danger: true, fn: () => confirmDeleteProject(meta) }
    ]);
  }

  function renameProject(meta) {
    const isCurrent = !!(state.project && state.project.id === meta.id);
    modal({
      title: '重命名项目',
      body: `<input type="text" id="rn-name" maxlength="60" value="${escapeHtml(meta.name)}"/>`,
      okText: '重命名',
      onOk: async (body) => {
        const name = $('#rn-name', body).value.trim();
        if (!name) return false;
        if (name !== meta.name) {
          if (isCurrent) {
            state.project.name = name;
            await doSave();
          } else {
            const r = await api.loadProject(meta.id);
            if (!r.ok) return true;
            r.project.name = name;
            await api.saveProject(r.project);
          }
          state.manifest = await api.getManifest();
          renderSidebar();
        }
        return true;
      }
    });
  }

  function renameVersion(v) {
    modal({
      title: '重命名版本',
      body: `<input type="text" id="rv-name" maxlength="60" value="${escapeHtml(v.name)}"/>`,
      okText: '重命名',
      onOk: async (body) => {
        const name = $('#rv-name', body).value.trim();
        if (!name) return false;
        if (name !== v.name) {
          v.name = name;
          await doSave();
          renderSidebar();
        }
        return true;
      }
    });
  }

  async function toggleArchiveById(pid) {
    if (state.project && state.project.id === pid) return onToggleArchive();
    const r = await api.loadProject(pid);
    if (!r.ok) return;
    r.project.archived = !r.project.archived;
    await api.saveProject(r.project);
    state.manifest = await api.getManifest();
    renderSidebar();
  }

  // ---------- 粘贴图片（Ctrl+V，方案C：空画布直达设计稿，否则弹卡片询问） ----------
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = el('div', 'toast'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function nextRefTop() {
    let bottom = 0;
    state.refs.forEach(r => { bottom = Math.max(bottom, (r.top || 0) + (r.h || 0)); });
    return bottom ? bottom + 16 : 0;
  }

  async function routePastedFiles(files) {
    if (!state.images.length) {
      for (const f of files) await appendImageFromFile(f);
      toast(files.length > 1 ? '已粘贴 ' + files.length + ' 张为设计稿' : '已粘贴为设计稿');
    } else {
      askPasteTarget(files);
    }
  }

  function askPasteTarget(files) {
    const n = files.length;
    const mask = el('div', 'modal-mask');
    const m = el('div', 'modal paste-chooser');
    m.innerHTML = `<h3>粘贴图片</h3>
      <div class="mbody">
        <div class="paste-q">要${n > 1 ? '把这 ' + n + ' 张图片' : '把这张图片'}放在哪里？</div>
        <div class="paste-cards">
          <div class="paste-card" data-k="detail">
            <div class="pc-t">粘贴为设计稿</div>
            <div class="pc-d">拼接到画布末尾，可在上面标注</div>
          </div>
          <div class="paste-card" data-k="ref">
            <div class="pc-t">粘贴为参考图</div>
            <div class="pc-d">放到右侧参考图区，作为修改参照</div>
          </div>
        </div>
        <div class="paste-hint">按 Esc 取消粘贴</div>
      </div>`;
    mask.appendChild(m);
    document.body.appendChild(mask);
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    m.querySelector('[data-k="detail"]').onclick = async () => {
      mask.remove();
      for (const f of files) await appendImageFromFile(f);
      toast(n > 1 ? '已粘贴 ' + n + ' 张为设计稿' : '已粘贴为设计稿');
    };
    m.querySelector('[data-k="ref"]').onclick = async () => {
      mask.remove();
      for (const f of files) await addRefFromFile(f, nextRefTop());
      toast(n > 1 ? '已粘贴 ' + n + ' 张为参考图' : '已粘贴为参考图');
    };
  }

  // ---------- 空白项目 ----------
  async function createProjectBlank(name) {
    if (state.project && !state.readOnly) await doSave(); // 保护当前项目的未保存改动
    const pid = uid();
    const project = { id: pid, name, archived: false, versions: [{ id: uid(), name: 'V1' }], currentVersionId: null };
    project.currentVersionId = project.versions[0].id;
    state.project = project;
    state.version = project.versions[0];
    state.marks = []; state.sugg = {}; state.refs = []; state.images = [];
    state.zoom = 1;
    await doSave();
    state.manifest = await api.getManifest();
    renderSidebar(); renderWorkspace(); renderToolbar();
  }

  // ---------- 更新日志 ----------
  async function initChangelog() {
    let ver = '';
    try { ver = await api.getAppVersion(); } catch (e) {}
    if (!ver) return;
    state.appVersion = ver;
    const vb = document.getElementById('ver-badge');
    if (vb) vb.textContent = 'v' + ver;
    let lastSeen = null;
    try { lastSeen = localStorage.getItem('pinnote_seen_version'); } catch (e) {}
    if (lastSeen !== ver) {
      try { localStorage.setItem('pinnote_seen_version', ver); } catch (e) {}
      setTimeout(() => showChangelog(true), 600);
    }
  }

  function showShortcuts() {
    const mask = el('div', 'modal-mask');
    const m = el('div', 'modal shortcuts');
    m.innerHTML = `<h3>快捷键说明</h3>
      <div class="mbody"><div class="sc-list">
        <div class="sc-row"><span class="sc-k">V</span><span>鼠标（选择/拖动）</span></div>
        <div class="sc-row"><span class="sc-k">P</span><span>点批注</span></div>
        <div class="sc-row"><span class="sc-k">B</span><span>框批注</span></div>
        <div class="sc-row"><span class="sc-k">Ctrl+V</span><span>粘贴图片（设计稿/参考图）</span></div>
        <div class="sc-row"><span class="sc-k">Ctrl+S</span><span>保存</span></div>
        <div class="sc-row"><span class="sc-k">Delete</span><span>删除选中标注</span></div>
        <div class="sc-row"><span class="sc-k">Esc</span><span>关闭弹窗 / 退出工具</span></div>
        <div class="sc-row"><span class="sc-k">+ / − / 0</span><span>放大 / 缩小 / 重置缩放</span></div>
        <div class="sc-row"><span class="sc-k">Ctrl+滚轮</span><span>以鼠标为中心缩放</span></div>
      </div></div>`;
    const row = el('div', 'row');
    const ok = el('button', 'btn primary', '知道了');
    ok.onclick = () => mask.remove();
    row.appendChild(ok);
    m.appendChild(row);
    mask.appendChild(m);
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  function showAbout() {
    const mask = el('div', 'modal-mask');
    const m = el('div', 'modal about');
    m.innerHTML = `<div class="about-body">
      <img class="about-icon" src="build-res/icon.png" alt=""/>
      <div class="about-name">PinNote</div>
      <div class="about-ver">${state.appVersion ? 'v' + escapeHtml(state.appVersion) : ''}</div>
      <div class="about-meta">轻量级视觉反馈标注工具<br/>by Colin Chen · MIT License</div>
    </div>`;
    const row = el('div', 'row');
    const ok = el('button', 'btn primary', '关闭');
    ok.onclick = () => mask.remove();
    row.appendChild(ok);
    m.appendChild(row);
    mask.appendChild(m);
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  function showChangelog(onlyLatest) {
    const all = window.PINNOTE_CHANGELOG || [];
    // onlyLatest=true：升级后首次打开，只展示最新一轮；=false：菜单打开，展示完整历史
    const entries = onlyLatest ? all.slice(0, 1) : all;
    const mask = el('div', 'modal-mask');
    const m = el('div', 'modal changelog');
    const body = entries.map((en, i) => `
      <div class="cl-entry${onlyLatest && i === 0 ? ' newest' : ''}">
        <div class="cl-head"><span class="cl-v">v${escapeHtml(en.version)}</span><span class="cl-date">${escapeHtml(en.date)}</span></div>
        <ul>${(en.items || []).map(it => '<li>' + escapeHtml(it) + '</li>').join('')}</ul>
        ${en.credit ? '<div class="cl-credit">' + escapeHtml(en.credit) + '</div>' : ''}
      </div>`).join('');
    m.innerHTML = `<h3>更新日志</h3><div class="mbody cl-body">${body || '<div class="hint">暂无更新记录</div>'}</div>`;
    const row = el('div', 'row');
    const ok = el('button', 'btn primary', '知道了');
    ok.onclick = () => mask.remove();
    row.appendChild(ok);
    m.appendChild(row);
    mask.appendChild(m);
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  // ---------- 通用 ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function modal(opt) {
    const mask = el('div', 'modal-mask');
    const m = el('div', 'modal');
    m.innerHTML = `<h3>${escapeHtml(opt.title)}</h3><div class="mbody">${opt.body}</div>`;
    const row = el('div', 'row');
    const cancel = el('button', 'btn', '取消');
    const ok = el('button', 'btn ' + (opt.danger ? '' : 'primary'), opt.okText || '确定');
    if (opt.danger) { ok.style.background = '#d4380d'; ok.style.borderColor = '#d4380d'; ok.style.color = '#fff'; }
    row.appendChild(cancel); row.appendChild(ok);
    m.appendChild(row);
    mask.appendChild(m);
    document.body.appendChild(mask);
    const close = () => mask.remove();
    cancel.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    ok.onclick = async () => {
      const r = await opt.onOk(m);
      if (r !== false) close();
    };
    const inp = m.querySelector('input');
    if (inp) { inp.focus(); if (inp.value) inp.select(); inp.onkeydown = (e) => { if (e.key === 'Enter') ok.click(); }; }
  }

  // 测试钩子：仅用于自动化冒烟测试（正常使用不暴露额外能力）
  window.__pinTest = {
    openProject,
    switchVersion,
    loadVersionData,
    renderSidebar,
    renderWorkspace,
    appendImageFromFile,
    addRefFromFile,
    createEmptyProject: async (name) => { await createProjectBlank(name || ('BLANK_' + Date.now())); return state.project.id; },
    handlePastedFiles: routePastedFiles,
    getState: () => state
  };

  init();
})();
