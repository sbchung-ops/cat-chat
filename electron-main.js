const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// CATCHAT_SERVER가 설정되면 원격 서버(배포된 PoC 서버)에 접속하고 로컬 서버는 띄우지 않는다
// 예: $env:CATCHAT_SERVER="https://cat-chat-xxxx.onrender.com"; npm run desktop
const REMOTE_URL = (process.env.CATCHAT_SERVER || '').replace(/\/$/, '');
let server = null;
let BASE_URL = REMOTE_URL;
if (!REMOTE_URL) {
  // WebSocket + 정적 서버를 이 프로세스 안에서 구동 (require 시 listen 시작)
  const local = require('./server');
  server = local.server;
  BASE_URL = `http://localhost:${local.PORT}`;
}

const BAR_HEIGHT = 300;       // 기본(펼침) 높이 px
const CUSTOMIZE_HEIGHT = 640; // 꾸미기 패널이 뜰 때 높이
const COLLAPSED_W = 210;      // 접힘 손잡이 창 크기
const COLLAPSED_H = 110;
const DEBUG = !!process.env.CATCHAT_DEBUG; // 불투명 배경 + DevTools

let win = null;
let tray = null;
let currentMode = 'normal'; // 'normal' | 'customize' | 'collapsed'

// ---- 접힘 손잡이 사용자 지정 위치 (드래그로 이동, 파일로 영속화) ----
let collapsedPos = null; // { x, y } | null(기본: 우하단)
const collapsedPosFile = () => path.join(app.getPath('userData'), 'collapsed-pos.json');
function loadCollapsedPos() {
  try {
    const p = JSON.parse(fs.readFileSync(collapsedPosFile(), 'utf8'));
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) collapsedPos = p;
  } catch { /* 없으면 기본 위치 */ }
}
function saveCollapsedPos() {
  try { fs.writeFileSync(collapsedPosFile(), JSON.stringify(collapsedPos)); } catch { /* 무시 */ }
}

// 창이 화면(멀티 모니터 포함) 밖으로 나가지 않게 가까운 디스플레이 작업영역으로 클램프
function clampToWorkArea(x, y, w, h) {
  const { workArea } = screen.getDisplayNearestPoint({ x: x + Math.round(w / 2), y: y + Math.round(h / 2) });
  return {
    x: Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - w),
    y: Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - h),
  };
}

function whenServerReady(cb) {
  if (!server || server.listening) cb(); // 원격 서버 모드면 바로 진행
  else server.once('listening', cb);
}

// 모드별로 작업표시줄 위에 창을 배치/리사이즈
function placeBottom() {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay(); // 작업표시줄 제외 영역
  const bottom = workArea.y + workArea.height;
  let w = workArea.width, h = BAR_HEIGHT, x = workArea.x;
  if (currentMode === 'customize') {
    h = Math.min(workArea.height, CUSTOMIZE_HEIGHT);
  } else if (currentMode === 'collapsed') {
    w = COLLAPSED_W; h = COLLAPSED_H;
    if (collapsedPos) { // 드래그로 옮겨둔 위치 우선
      const c = clampToWorkArea(collapsedPos.x, collapsedPos.y, w, h);
      win.setBounds({ x: c.x, y: c.y, width: w, height: h });
      return;
    }
    x = workArea.x + workArea.width - w;
  }
  win.setBounds({ x, y: bottom - h, width: w, height: h });
}

function setMode(mode) {
  if (!['normal', 'customize', 'collapsed'].includes(mode)) return;
  currentMode = mode;
  placeBottom();
}

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: BAR_HEIGHT,
    frame: false,
    transparent: !DEBUG,
    resizable: false,
    movable: true, // 접힘 그립(-webkit-app-region: drag)으로만 이동 가능 (다른 모드엔 드래그 영역 없음)
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,     // 작업표시줄에 안 뜸
    alwaysOnTop: true,     // 항상 위
    focusable: true,       // 입력창 포커스 필요
    hasShadow: false,
    show: false,           // 렌더 완료 후 표시 (투명창 빈 화면 방지)
    backgroundColor: DEBUG ? '#FFE9D6' : '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver'); // 전체화면 앱 위에서도 최대한 유지
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  placeBottom();
  watchCollapsedMove();
  win.loadURL(BASE_URL);

  win.once('ready-to-show', () => {
    placeBottom();
    win.show();
    if (!DEBUG) win.setIgnoreMouseEvents(true, { forward: true });
    console.log('[overlay] shown at', JSON.stringify(win.getBounds()));
  });

  if (DEBUG) win.webContents.openDevTools({ mode: 'detach' });

  win.webContents.on('did-finish-load', () => console.log('[overlay] did-finish-load'));
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[overlay] did-fail-load', code, desc));
  win.webContents.on('render-process-gone', (_e, d) => console.error('[overlay] render-process-gone', JSON.stringify(d)));
  win.webContents.on('console-message', (_e, level, message) => console.log('[renderer]', message));

  win.on('closed', () => { win = null; });
}

// 렌더러가 위젯 위/밖으로 이동할 때 클릭 통과 토글
ipcMain.on('overlay:set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('overlay:quit', () => app.quit());
ipcMain.on('overlay:mode', (_e, mode) => setMode(mode));

// 냥냥 이벤트: 전용 투명 창(항상 클릭 통과)에서 재생 — 본 창은 리사이즈하지 않아 화면이 튀지 않는다
let eventWin = null;
let eventHideTimer = null;
function createEventWindow() {
  eventWin = new BrowserWindow({
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // 포커스를 뺏지 않음
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  eventWin.setAlwaysOnTop(true, 'screen-saver');
  eventWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  eventWin.setIgnoreMouseEvents(true); // 항상 클릭 통과
  eventWin.setBounds(screen.getPrimaryDisplay().workArea);
  eventWin.loadURL(`${BASE_URL}/event.html`);
  eventWin.on('closed', () => { eventWin = null; });
}
ipcMain.on('overlay:nyan', () => {
  if (!eventWin) return;
  eventWin.setBounds(screen.getPrimaryDisplay().workArea);
  eventWin.showInactive();
  eventWin.webContents.send('nyan:play');
  clearTimeout(eventHideTimer);
  eventHideTimer = setTimeout(() => { if (eventWin) eventWin.hide(); }, 7500);
});

// 접힘 그립은 OS 네이티브 창 드래그(-webkit-app-region: drag)로 움직인다.
// 접힘 모드에서 창이 이동하면 마지막 위치를 저장 (연속 move 이벤트는 디바운스)
let moveSaveTimer = null;
function watchCollapsedMove() {
  if (!win) return;
  win.on('move', () => {
    if (currentMode !== 'collapsed') return;
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      if (!win || currentMode !== 'collapsed') return;
      const [x, y] = win.getPosition();
      collapsedPos = { x, y };
      saveCollapsedPos();
    }, 250);
  });
}

function makeTrayIcon() {
  // 16x16 분홍 원형 아이콘을 코드로 생성 (외부 파일 불필요)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 7.5, cy = 7.5, r = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) {
        buf[i] = 0xF6; buf[i + 1] = 0xA8; buf[i + 2] = 0xB8; buf[i + 3] = 255; // 분홍
      } else {
        buf[i + 3] = 0; // 투명
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray() {
  try {
    tray = new Tray(makeTrayIcon());
    tray.setToolTip('냥냥 채팅');
    const menu = Menu.buildFromTemplate([
      { label: '보이기 / 숨기기', click: () => { if (!win) return; win.isVisible() ? win.hide() : win.show(); } },
      { label: '위치 재조정', click: placeBottom },
      { label: '손잡이 위치 초기화', click: () => { collapsedPos = null; saveCollapsedPos(); placeBottom(); } },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => { if (!win) return; win.isVisible() ? win.hide() : win.show(); });
  } catch (e) {
    console.warn('tray 생성 실패(무시 가능):', e.message);
  }
}

app.whenReady().then(() => {
  loadCollapsedPos();
  whenServerReady(() => {
    createWindow();
    createEventWindow();
    createTray();
  });
  // 작업표시줄 크기 변경 등에 대응
  screen.on('display-metrics-changed', placeBottom);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) whenServerReady(createWindow);
  });
});

// 오버레이는 창을 닫아도 트레이로 유지. 명시적 종료(app.quit)만 프로세스 종료.
app.on('window-all-closed', (e) => { /* keep alive in tray */ });
