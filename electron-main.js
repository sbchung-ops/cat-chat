const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// CATCHAT_SERVER가 설정되면 원격 서버(배포된 PoC 서버)에 접속하고 로컬 서버는 띄우지 않는다.
// 패키징된 배포 앱은 기본으로 Vercel PoC 서버에 붙는다.
// 예: $env:CATCHAT_SERVER="https://cat-chat-navy.vercel.app"; npm run desktop
const DEFAULT_REMOTE_URL = 'https://cat-chat-navy.vercel.app';
const REMOTE_URL = (process.env.CATCHAT_SERVER || (app.isPackaged ? DEFAULT_REMOTE_URL : '')).replace(/\/$/, '');
let server = null;
let BASE_URL = REMOTE_URL;
if (!REMOTE_URL) {
  // WebSocket + 정적 서버를 이 프로세스 안에서 구동 (require 시 listen 시작)
  const local = require('./server');
  server = local.server;
  BASE_URL = `http://localhost:${local.PORT}`;
}

const DEBUG = !!process.env.CATCHAT_DEBUG; // 불투명 배경 + DevTools

let win = null;
let tray = null;

function whenServerReady(cb) {
  if (!server || server.listening) cb(); // 원격 서버 모드면 바로 진행
  else server.once('listening', cb);
}

// 창은 작업영역 전체 크기로 "고정"한다. 접기/펼치기/꾸미기/이벤트는 전부 DOM 안에서만 일어난다.
// (Windows에서 투명 창은 리사이즈할 때마다 깜빡이므로, 창 크기를 절대 바꾸지 않는 것이 핵심)
function placeOverlay() {
  if (!win) return;
  win.setBounds(screen.getPrimaryDisplay().workArea);
}

function createWindow() {
  win = new BrowserWindow({
    frame: false,
    transparent: !DEBUG,
    resizable: false,
    movable: false,
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

  placeOverlay();
  win.loadURL(BASE_URL);

  win.once('ready-to-show', () => {
    placeOverlay();
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
      { label: '위치 재조정', click: placeOverlay },
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
  whenServerReady(() => {
    createWindow();
    createTray();
  });
  // 작업표시줄 크기 변경 등에 대응
  screen.on('display-metrics-changed', placeOverlay);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) whenServerReady(createWindow);
  });
});

// 오버레이는 창을 닫아도 트레이로 유지. 명시적 종료(app.quit)만 프로세스 종료.
app.on('window-all-closed', (e) => { /* keep alive in tray */ });
