(function () {
  const BUBBLE_LIFETIME = 12000;
  const STORAGE_KEY = 'cat-chat-profile';
  const OVERLAY = !!(window.overlayAPI && window.overlayAPI.isOverlay);

  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const catsRow = $('catsRow');
  const onlineCount = $('onlineCount');
  const toastArea = $('toastArea');
  const chatForm = $('chatForm');
  const chatInput = $('chatInput');
  const quitBtn = $('quitBtn');
  const settingsBtn = $('settingsBtn');
  const collapseBtn = $('collapseBtn');
  const handle = $('handle');
  const handleGrip = $('handleGrip');
  const handleBadge = $('handleBadge');
  const customizer = $('customizer');
  const czPreview = $('czPreview');
  const czGrid = $('czGrid');
  const czTabs = $('czTabs');
  const nickEdit = $('nickEdit');
  const czRandom = $('czRandom');
  const czSave = $('czSave');
  const czClose = $('czClose');

  let ws = null;
  let myId = null;
  const catEls = new Map();
  const bubbleTimers = new Map();

  let collapsed = false;
  let unseen = 0;

  // ---- Electron 창 모드 ----
  function setMode(mode) {
    if (OVERLAY && window.overlayAPI.mode) window.overlayAPI.mode(mode);
  }

  // ---- 프로필 ----
  function loadProfile() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }
  function saveProfile(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
  let profile = loadProfile();
  let editCharacter = null;
  // 저장된 프로필이 없으면 첫 접속: 입장 후 꾸미기 창을 자동으로 띄운다
  const isFirstVisit = !profile.nickname && !profile.character;
  let firstVisitGreeted = false;

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // ---- 고양이 DOM ----
  function addCat(user, animate) {
    if (catEls.has(user.userId)) return;
    const root = document.createElement('div');
    root.className = 'cat' + (user.userId === myId ? ' me' : '') + (animate ? ' enter' : '');
    root.dataset.userId = user.userId;
    root.innerHTML = `
      <div class="bubble hidden"><span class="bubble-text"></span></div>
      <div class="typing-bubble hidden"><span></span><span></span><span></span></div>
      ${window.CatRender.catHTML(user.character)}
      <div class="cat-nick">${escapeHtml(user.nickname)}${user.userId === myId ? ' <em>(나)</em>' : ''}</div>
    `;
    catsRow.appendChild(root);
    catEls.set(user.userId, {
      root,
      figureWrap: root,
      bubble: root.querySelector('.bubble'),
      bubbleText: root.querySelector('.bubble-text'),
      typingBubble: root.querySelector('.typing-bubble'),
      nick: root.querySelector('.cat-nick'),
    });
    if (user.typing) setTyping(user.userId, true);
    updateCount();
  }

  function replaceCatFigure(userId, character) {
    const el = catEls.get(userId);
    if (!el) return;
    const oldFig = el.root.querySelector('.cat-figure');
    if (oldFig) {
      const tmp = document.createElement('div');
      tmp.innerHTML = window.CatRender.catHTML(character);
      oldFig.replaceWith(tmp.firstElementChild);
    }
  }

  function removeCat(userId) {
    const el = catEls.get(userId);
    if (!el) return;
    catEls.delete(userId);
    clearTimeout(bubbleTimers.get(userId));
    bubbleTimers.delete(userId);
    el.root.classList.add('leave');
    setTimeout(() => el.root.remove(), 350);
    updateCount();
  }

  function updateCount() { onlineCount.textContent = catEls.size; }

  // ---- 말풍선 ----
  function showBubble(userId, text) {
    const el = catEls.get(userId);
    if (!el) return;
    setTyping(userId, false);
    el.bubbleText.textContent = text;
    el.bubble.classList.remove('hidden', 'pop');
    void el.bubble.offsetWidth;
    el.bubble.classList.add('pop');
    document.querySelectorAll('.cat.speaking').forEach((c) => c.classList.remove('speaking'));
    el.root.classList.add('speaking');
    clearTimeout(bubbleTimers.get(userId));
    bubbleTimers.set(userId, setTimeout(() => {
      el.bubble.classList.add('hidden');
      el.root.classList.remove('speaking');
    }, BUBBLE_LIFETIME));
  }

  function setTyping(userId, isTyping) {
    const el = catEls.get(userId);
    if (!el) return;
    el.typingBubble.classList.toggle('hidden', !isTyping);
    if (isTyping) el.bubble.classList.add('hidden');
  }

  // ---- 냥냥 이벤트: 채팅에 '냥냥'이 나오면 화면 가득 고양이 + 발자국 ----
  const NYAN_RE = /냥냥/;
  let nyanLayer = null;
  let nyanTimer = null;

  function cancelNyanEvent() {
    if (!nyanLayer) return;
    clearTimeout(nyanTimer);
    nyanLayer.remove();
    nyanLayer = null;
  }

  function playNyanEvent() {
    if (collapsed) return; // 접힌 상태면 생략
    // 오버레이: 전용 투명 이벤트 창에서 재생 (본 창은 리사이즈하지 않아 화면이 튀지 않음)
    if (OVERLAY && window.overlayAPI.nyan) { window.overlayAPI.nyan(); return; }
    // 브라우저: 이 페이지 안에서 직접 재생
    if (nyanLayer) return;
    nyanLayer = window.NyanFX.build(window.CatRender.cats);
    overlay.appendChild(nyanLayer);
    nyanTimer = setTimeout(cancelNyanEvent, window.NyanFX.TOTAL_MS);
  }

  // ---- 토스트 ----
  function toast(text, kind) {
    if (collapsed) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = text;
    toastArea.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  // ---- 접기 / 펼치기 ----
  // 화면 튐 방지: 커질 때는 창을 먼저 키우고 내용을 등장시키고,
  // 작아질 때는 퇴장 애니메이션이 끝난 뒤 창을 줄인다.
  const UI_EXIT_MS = 200, UI_ENTER_MS = 320;
  let uiAnimTimer = null;

  function collapse() {
    if (collapsed) return;
    collapsed = true;
    cancelNyanEvent(); // 접으면 이벤트도 정리 (창 크기 복원 충돌 방지)
    closeCustomizer(true); // 접힘이 우선: 꾸미기는 즉시 숨김
    overlay.classList.remove('ui-enter');
    overlay.classList.add('ui-exit');
    clearTimeout(uiAnimTimer);
    uiAnimTimer = setTimeout(() => {
      if (!collapsed) return; // 애니메이션 중 다시 펼친 경우
      overlay.classList.remove('ui-exit');
      overlay.classList.add('collapsed');
      handle.classList.remove('hidden');
      handle.classList.add('pop-in');
      handleGrip.classList.remove('hidden');
      setMode('collapsed');
    }, UI_EXIT_MS);
  }
  function expand() {
    if (!collapsed) return;
    collapsed = false;
    clearTimeout(uiAnimTimer);
    setMode('normal'); // 창을 먼저 키운다
    handle.classList.add('hidden');
    handle.classList.remove('pop-in');
    handleGrip.classList.add('hidden');
    unseen = 0;
    handleBadge.classList.add('hidden');
    handle.classList.remove('has-new');
    // 창 리사이즈가 끝난 다음에 내용을 드러낸다
    // (작은 접힘 창 안에 고양이들이 한 프레임 그려졌다가 튀는 문제 방지)
    let revealed = false;
    const reveal = () => {
      if (revealed || collapsed) return;
      revealed = true;
      window.removeEventListener('resize', reveal);
      overlay.classList.remove('ui-exit', 'collapsed');
      overlay.classList.add('ui-enter');
      uiAnimTimer = setTimeout(() => overlay.classList.remove('ui-enter'), UI_ENTER_MS);
    };
    if (OVERLAY) {
      window.addEventListener('resize', reveal);
      setTimeout(reveal, 150); // resize 이벤트 유실 대비
    } else {
      reveal();
    }
  }
  function bumpUnseen() {
    unseen += 1;
    handleBadge.textContent = unseen > 99 ? '99+' : String(unseen);
    handleBadge.classList.remove('hidden');
    handle.classList.add('has-new');
  }

  collapseBtn.addEventListener('click', collapse);
  // pop-in이 남아 있으면 has-new 위글 애니메이션을 덮어쓰므로 재생 후 제거
  handle.addEventListener('animationend', (e) => { if (e.animationName === 'handle-in') handle.classList.remove('pop-in'); });

  handle.addEventListener('click', expand);

  // ---- WebSocket ----
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', nickname: profile.nickname, character: profile.character }));
    });

    ws.addEventListener('message', (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'welcome') {
        myId = msg.userId;
        profile.nickname = msg.nickname;
        profile.character = msg.character;
        editCharacter = { ...msg.character };
        saveProfile(profile);
        catsRow.innerHTML = '';
        catEls.clear();
        // 내 고양이를 항상 맨 왼쪽에
        const roster = msg.roster.slice().sort((a, b) => (a.userId === myId ? -1 : b.userId === myId ? 1 : 0));
        roster.forEach((u) => addCat(u, false));
        chatInput.disabled = false;
        nickEdit.value = msg.nickname;
        // 첫 접속: 닉네임과 고양이를 정할 수 있게 꾸미기 창을 자동으로 연다 (재접속 시엔 안 뜸)
        if (isFirstVisit && !firstVisitGreeted) {
          firstVisitGreeted = true;
          setTimeout(() => { if (!collapsed) openCustomizer(); }, 450);
        }
        return;
      }
      if (msg.type === 'user-joined') { addCat(msg.user, true); toast(`${msg.user.nickname} 냥이가 놀러왔어요`, 'join'); return; }
      if (msg.type === 'user-left') { removeCat(msg.userId); toast(`${msg.nickname} 냥이가 떠났어요`, 'leave'); return; }
      if (msg.type === 'chat') {
        showBubble(msg.userId, msg.text);
        if (collapsed && msg.userId !== myId) bumpUnseen();
        if (NYAN_RE.test(msg.text)) playNyanEvent();
        return;
      }
      if (msg.type === 'typing') { setTyping(msg.userId, msg.isTyping); return; }
      if (msg.type === 'renamed') {
        const el = catEls.get(msg.userId);
        if (el) el.nick.innerHTML = escapeHtml(msg.nickname) + (msg.userId === myId ? ' <em>(나)</em>' : '');
        if (msg.userId === myId) { profile.nickname = msg.nickname; saveProfile(profile); }
        return;
      }
      if (msg.type === 'recharacter') {
        replaceCatFigure(msg.userId, msg.character);
        if (msg.userId === myId) { profile.character = msg.character; editCharacter = { ...msg.character }; saveProfile(profile); }
        return;
      }
    });

    ws.addEventListener('close', () => {
      chatInput.disabled = true;
      setTimeout(connect, 2000);
    });
  }

  // ---- 입력 ----
  let typingTimer = null, typingSent = false;
  chatInput.addEventListener('input', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!typingSent && chatInput.value.length > 0) { typingSent = true; ws.send(JSON.stringify({ type: 'typing', isTyping: true })); }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 1800);
    if (chatInput.value.length === 0) stopTyping();
  });
  function stopTyping() {
    if (typingSent && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
    typingSent = false; clearTimeout(typingTimer);
  }
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat', text }));
    stopTyping();
    if (myId) showBubble(myId, text);
    chatInput.value = '';
  });

  // ---- 꾸미기 패널 ----
  let activeTab = 'cat';
  const SLOT_OF = { cat: 'cat', hat: 'hat', neck: 'neck', item: 'item' };

  function renderPreview(pop) {
    czPreview.innerHTML = window.CatRender.catHTML(editCharacter);
    if (pop) { czPreview.classList.remove('pop'); void czPreview.offsetWidth; czPreview.classList.add('pop'); }
  }

  function listFor(tab) {
    if (tab === 'cat') return window.CatRender.cats;
    if (tab === 'hat') return window.CatRender.hats;
    if (tab === 'neck') return window.CatRender.necks;
    return window.CatRender.others;
  }

  function renderGrid() {
    const slot = SLOT_OF[activeTab];
    const items = listFor(activeTab);
    const cur = editCharacter[slot] || null;
    let html = '';
    if (activeTab !== 'cat') {
      html += `<div class="cz-item none-item${cur === null ? ' selected' : ''}" data-slug="">없음</div>`;
    }
    for (const it of items) {
      const sel = cur === it.slug ? ' selected' : '';
      html += `<div class="cz-item${sel}" data-slug="${it.slug}">`
        + `<img src="${window.CatRender.thumb(it.slug)}" alt="">`
        + `<span class="cz-name">${escapeHtml(it.name_ko)}</span></div>`;
    }
    czGrid.innerHTML = html;
  }

  // 선택 시엔 그리드를 다시 만들지 않고 선택 표시만 바꾼다 (스크롤/화면 안 튐)
  function updateGridSelection() {
    const cur = editCharacter[SLOT_OF[activeTab]] || '';
    czGrid.querySelectorAll('.cz-item').forEach((el) => {
      el.classList.toggle('selected', (el.dataset.slug || '') === cur);
    });
  }

  czGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.cz-item');
    if (!item) return;
    editCharacter[SLOT_OF[activeTab]] = item.dataset.slug || null;
    updateGridSelection();
    renderPreview(false);
  });

  czTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.cz-tab');
    if (!tab) return;
    activeTab = tab.dataset.tab;
    czTabs.querySelectorAll('.cz-tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderGrid();
  });

  const CZ_OUT_MS = 180, CZ_IN_MS = 280;
  let czAnimTimer = null;

  function openCustomizer() {
    editCharacter = { ...(profile.character || window.CatRender.randomCharacter()) };
    nickEdit.value = profile.nickname || '';
    activeTab = 'cat';
    czTabs.querySelectorAll('.cz-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'cat'));
    setMode('customize'); // 창을 먼저 키운다
    clearTimeout(czAnimTimer);
    customizer.classList.remove('hidden', 'cz-out');
    customizer.classList.add('cz-in');
    czAnimTimer = setTimeout(() => customizer.classList.remove('cz-in'), CZ_IN_MS);
    renderGrid();
    renderPreview(true);
  }
  function closeCustomizer(immediate) {
    if (customizer.classList.contains('hidden')) return;
    clearTimeout(czAnimTimer);
    customizer.classList.remove('cz-in');
    if (immediate) {
      customizer.classList.remove('cz-out');
      customizer.classList.add('hidden');
      if (!collapsed) setMode('normal');
      return;
    }
    customizer.classList.add('cz-out');
    czAnimTimer = setTimeout(() => {
      customizer.classList.remove('cz-out');
      customizer.classList.add('hidden');
      if (!collapsed) setMode('normal'); // 퇴장이 끝난 뒤 창을 줄인다
    }, CZ_OUT_MS);
  }

  settingsBtn.addEventListener('click', () => {
    if (customizer.classList.contains('hidden') || customizer.classList.contains('cz-out')) openCustomizer();
    else closeCustomizer();
  });
  czClose.addEventListener('click', () => closeCustomizer());
  czRandom.addEventListener('click', () => { editCharacter = window.CatRender.randomCharacter(); renderGrid(); renderPreview(true); });
  czSave.addEventListener('click', () => {
    const nick = nickEdit.value.trim();
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (nick && nick !== profile.nickname) ws.send(JSON.stringify({ type: 'rename', nickname: nick }));
      ws.send(JSON.stringify({ type: 'recharacter', character: editCharacter }));
    }
    closeCustomizer();
  });

  // ---- 종료 ----
  if (quitBtn) {
    if (OVERLAY) quitBtn.addEventListener('click', () => window.overlayAPI.quit());
    else quitBtn.style.display = 'none';
  }

  // ---- Electron 클릭 통과 토글 ----
  if (OVERLAY) {
    let ignoring = true;
    window.overlayAPI.setIgnore(true);
    const isWidget = (el) => !!(el && el.closest && el.closest('.interactive, .cat'));
    window.addEventListener('mousemove', (e) => {
      const over = isWidget(document.elementFromPoint(e.clientX, e.clientY));
      if (over && ignoring) { ignoring = false; window.overlayAPI.setIgnore(false); }
      else if (!over && !ignoring) { ignoring = true; window.overlayAPI.setIgnore(true); }
    });
  }

  // ---- 시작: manifest 로드 후 연결 ----
  fetch('assets/manifest.json')
    .then((r) => r.json())
    .then((list) => {
      window.CatRender.setCatalog(list);
      // 꽃이 소품 → 모자로 이동: 예전 프로필의 item 슬롯을 hat 슬롯으로 옮긴다
      if (profile.character && profile.character.item === 'acc_other_05_flower') {
        profile.character.item = null;
        if (!profile.character.hat) profile.character.hat = 'acc_hat_11_flower';
        saveProfile(profile);
      }
      if (profile.character && profile.character.item === 'acc_other_04_small_red_bow') {
        profile.character.item = null;
        saveProfile(profile);
      }
      if (!profile.character || !window.CatRender.has(profile.character.cat)) {
        profile.character = window.CatRender.randomCharacter();
      }
      editCharacter = { ...profile.character };
      connect();
    })
    .catch((err) => { console.error('manifest load failed', err); });
})();
