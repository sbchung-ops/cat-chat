const { contextBridge, ipcRenderer } = require('electron');

// 렌더러에 최소 API만 노출 (오버레이 여부 판별 + 클릭 통과 토글 + 종료)
contextBridge.exposeInMainWorld('overlayAPI', {
  isOverlay: true,
  setIgnore: (ignore) => ipcRenderer.send('overlay:set-ignore', ignore),
  quit: () => ipcRenderer.send('overlay:quit'),
});
