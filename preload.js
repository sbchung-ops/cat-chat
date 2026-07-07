const { contextBridge, ipcRenderer } = require('electron');

// 렌더러에 최소 API만 노출 (오버레이 여부 판별 + 클릭 통과 토글 + 종료)
contextBridge.exposeInMainWorld('overlayAPI', {
  isOverlay: true,
  setIgnore: (ignore) => ipcRenderer.send('overlay:set-ignore', ignore),
  quit: () => ipcRenderer.send('overlay:quit'),
  mode: (mode) => ipcRenderer.send('overlay:mode', mode), // 'normal' | 'customize' | 'collapsed'
  // 냥냥 이벤트: 전용 투명 창에서 재생 (본 창은 리사이즈하지 않음 → 화면 튐 없음)
  nyan: () => ipcRenderer.send('overlay:nyan'),
  onNyanPlay: (cb) => ipcRenderer.on('nyan:play', cb),
});
