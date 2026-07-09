const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- 고양이 캐릭터 배정 (실제 에셋 기반) ----
// character = { cat: <slug>, hat: <slug|null>, neck: <slug|null>, item: <slug|null> }
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'assets', 'manifest.json'), 'utf8'));
const CAT_SLUGS = new Set();
const HAT_SLUGS = new Set();
const NECK_SLUGS = new Set();
const OTHER_SLUGS = new Set();
for (const it of manifest) {
  if (it.category === 'cats') CAT_SLUGS.add(it.slug);
  else if (it.category === 'accessories/hats') HAT_SLUGS.add(it.slug);
  else if (it.category === 'accessories/neck') NECK_SLUGS.add(it.slug);
  else if (it.category === 'accessories/other') OTHER_SLUGS.add(it.slug);
}
const CAT_LIST = [...CAT_SLUGS];
const HAT_LIST = [...HAT_SLUGS];
const NECK_LIST = [...NECK_SLUGS];
const OTHER_LIST = [...OTHER_SLUGS];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomCharacter(usedCatSlugs) {
  // 접속 중인 유저가 아직 안 쓴 품종을 우선 배정
  const avail = CAT_LIST.filter((s) => !usedCatSlugs.has(s));
  const pool = avail.length ? avail : CAT_LIST;
  const maybe = (arr) => (Math.random() < 0.4 ? pick(arr) : null);
  return { cat: pick(pool), hat: maybe(HAT_LIST), neck: maybe(NECK_LIST), item: maybe(OTHER_LIST) };
}

function slotOk(v, set) { return v == null || (typeof v === 'string' && set.has(v)); }

// 꽃이 소품 → 모자로 이동: 예전 클라이언트가 보낸 item 슬롯의 꽃을 hat 슬롯으로 옮긴다
function migrateCharacter(c) {
  if (c && typeof c === 'object' && c.item === 'acc_other_05_flower') {
    c.item = null;
    if (!c.hat) c.hat = 'acc_hat_11_flower';
  }
  if (c && typeof c === 'object' && c.item === 'acc_other_04_small_red_bow') {
    c.item = null;
  }
  return c;
}

function validCharacter(c) {
  return c && typeof c === 'object'
    && typeof c.cat === 'string' && CAT_SLUGS.has(c.cat)
    && slotOk(c.hat, HAT_SLUGS)
    && slotOk(c.neck, NECK_SLUGS)
    && slotOk(c.item, OTHER_SLUGS);
}

function normalizeCharacter(c) {
  return {
    cat: c.cat,
    hat: c.hat && HAT_SLUGS.has(c.hat) ? c.hat : null,
    neck: c.neck && NECK_SLUGS.has(c.neck) ? c.neck : null,
    item: c.item && OTHER_SLUGS.has(c.item) ? c.item : null,
  };
}

// ---- 유저/세션 관리 ----
const users = new Map(); // userId -> { ws, nickname, character, connectedAt, typing }

const NICK_ADJ = ['졸린', '통통한', '수줍은', '용감한', '나른한', '호기심', '느긋한', '재빠른', '엉뚱한', '포근한'];
const NICK_NOUN = ['냥이', '치즈냥', '까망이', '솜뭉치', '젤리', '수염이', '꼬리', '츄르', '방울이', '식빵'];

function autoNickname() {
  return NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)]
    + NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)]
    + Math.floor(Math.random() * 90 + 10);
}

function sanitizeNickname(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().slice(0, 10);
  return trimmed.length ? trimmed : null;
}

function usedCatSlugs() {
  const keys = new Set();
  for (const u of users.values()) keys.add(u.character.cat);
  return keys;
}

function publicUser(id, u) {
  return { userId: id, nickname: u.nickname, character: u.character, typing: !!u.typing };
}

function broadcast(payload, exceptWs) {
  const msg = JSON.stringify(payload);
  for (const u of users.values()) {
    if (u.ws !== exceptWs && u.ws.readyState === u.ws.OPEN) u.ws.send(msg);
  }
}

// ---- 채팅 로그 (메모리 + Upstash Redis 백업) ----
// 카톡처럼 지난 대화를 볼 수 있게 최근 메시지를 서버 메모리에 쌓아둔다.
// 새로 접속하는 유저는 welcome에 담긴 history로 지난 대화를 받는다.
// 매일 오전 5시(KST)에 전부 비운다 (하루치만 유지).
//
// Render 무료 플랜은 트래픽이 끊기면 프로세스를 내리고, 재배포 때도 재시작되므로
// 메모리만으로는 5시가 아닌데도 로그가 날아간다. 그래서 Upstash Redis(REST)에
// 로그를 백업해 두고 부팅 시 복원한다. 환경변수가 없으면(로컬/Electron) 메모리만 쓴다.
const CHAT_LOG_MAX = 300;
let chatLog = [];

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// "채팅 하루"는 KST 오전 5시에 시작한다. 날짜별 키를 쓰면 서버가 5시에 잠들어 있어도
// 깨어났을 때 새 날짜 키(=빈 로그)를 읽게 되어 초기화가 저절로 지켜진다.
function chatDayKey() {
  const kstChatDay = new Date(Date.now() + (9 - 5) * 3600 * 1000);
  return `catchat:log:${kstChatDay.toISOString().slice(0, 10)}`;
}

// 저장은 1초 디바운스: 메시지 폭주 시에도 Redis 명령 수를 아낀다 (무료 한도 보호)
let saveTimer = null;
function scheduleSave() {
  if (!REDIS_URL || !REDIS_TOKEN || saveTimer) return;
  saveTimer = setTimeout(saveLog, 1000);
}

async function saveLog() {
  saveTimer = null;
  try {
    // TTL 25시간: 어제 키는 손대지 않아도 알아서 사라진다
    await redis(['SET', chatDayKey(), JSON.stringify(chatLog), 'EX', '90000']);
  } catch (e) {
    console.error('[chat-log] Redis 저장 실패:', e.message);
  }
}

// 부팅 시 오늘 로그 복원. welcome은 이 프라미스를 기다렸다가 보낸다 —
// 절전에서 깨어난 직후 첫 접속자가 빈 history를 받는 걸 막는다.
const logRestored = (async () => {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const raw = await redis(['GET', chatDayKey()]);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved)) {
      // 복원 중 도착한 새 메시지가 있으면 뒤에 이어 붙인다
      chatLog = [...saved, ...chatLog].slice(-CHAT_LOG_MAX);
      console.log(`[chat-log] Redis에서 ${saved.length}개 메시지 복원`);
    }
  } catch (e) {
    console.error('[chat-log] Redis 복원 실패:', e.message);
  }
})();

// 재배포/절전 진입 시 Render가 SIGTERM을 보낸다: 디바운스 대기 중인 저장을 마저 한다
process.on('SIGTERM', () => {
  const pending = saveTimer ? (clearTimeout(saveTimer), saveLog()) : Promise.resolve();
  pending.finally(() => process.exit(0));
});

function pushLog(entry) {
  chatLog.push(entry);
  if (chatLog.length > CHAT_LOG_MAX) chatLog.splice(0, chatLog.length - CHAT_LOG_MAX);
  scheduleSave();
}

// 다음 오전 5시(KST = UTC+9, 서머타임 없음)까지 남은 밀리초
function msUntilNext5amKST() {
  const DAY = 24 * 3600 * 1000;
  const KST_OFFSET = 9 * 3600 * 1000;
  const FIVE_AM = 5 * 3600 * 1000;
  const kstNow = Date.now() + KST_OFFSET;
  const sinceKstMidnight = ((kstNow % DAY) + DAY) % DAY;
  let wait = FIVE_AM - sinceKstMidnight;
  if (wait <= 0) wait += DAY;
  return wait;
}

function scheduleDailyClear() {
  setTimeout(() => {
    chatLog = [];
    // Redis는 지울 필요 없다: 5시부터는 chatDayKey()가 새 날짜 키를 가리키고,
    // 어제 키는 TTL로 알아서 만료된다.
    broadcast({ type: 'history-cleared' });
    console.log('[chat-log] 오전 5시(KST) 채팅 기록 초기화');
    scheduleDailyClear();
  }, msUntilNext5amKST());
}
scheduleDailyClear();

const wss = new WebSocketServer({ server });
// 프록시(Render/Cloudflare) 뒤에서는 소켓이 거칠게 끊기며 error 이벤트가 흔하다.
// 리스너가 없으면 Node가 프로세스를 통째로 죽이므로 반드시 삼켜준다.
wss.on('error', (e) => console.error('[wss]', e.message));

// 죽은 연결 정리: 30초마다 ping, 응답 없으면 끊는다
// (거칠게 끊긴 클라이언트는 close 이벤트가 한참 늦게 와서 유령 고양이로 남는다)
setInterval(() => {
  for (const u of users.values()) {
    if (u.ws.isAlive === false) { u.ws.terminate(); continue; }
    u.ws.isAlive = false;
    try { u.ws.ping(); } catch { /* 이미 죽은 소켓 */ }
  }
}, 30000);

wss.on('connection', (ws) => {
  let userId = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (e) => console.error('[ws]', e.message));

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }

    if (data.type === 'join' && !userId) {
      userId = crypto.randomUUID();
      const nickname = sanitizeNickname(data.nickname) || autoNickname();
      // 재접속 유저는 저장된 캐릭터 유지, 신규는 미사용 품종 위주로 랜덤 배정
      const character = validCharacter(migrateCharacter(data.character))
        ? normalizeCharacter(data.character)
        : randomCharacter(usedCatSlugs());
      const user = { ws, nickname, character, connectedAt: Date.now(), typing: false };
      users.set(userId, user);

      const roster = [...users.entries()].map(([id, u]) => publicUser(id, u));
      // 절전에서 막 깨어난 서버라면 Redis 복원이 끝난 뒤에 history를 보낸다
      logRestored.then(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'welcome', userId, nickname, character, roster, history: chatLog }));
        }
      });
      broadcast({ type: 'user-joined', user: publicUser(userId, user) }, ws);
      return;
    }

    if (!userId || !users.has(userId)) return;
    const user = users.get(userId);

    if (data.type === 'chat') {
      const text = typeof data.text === 'string' ? data.text.trim().slice(0, 200) : '';
      if (!text) return;
      user.typing = false;
      const ts = Date.now();
      // 로그/브로드캐스트에 닉네임·캐릭터를 함께 담아, 보낸 사람이 나가거나
      // 이름을 바꿔도 기록에는 당시 이름·고양이가 그대로 남게 한다.
      pushLog({ userId, nickname: user.nickname, character: user.character, text, ts });
      broadcast({ type: 'chat', userId, nickname: user.nickname, character: user.character, text, ts });
      return;
    }

    if (data.type === 'typing') {
      const isTyping = !!data.isTyping;
      if (user.typing !== isTyping) {
        user.typing = isTyping;
        broadcast({ type: 'typing', userId, isTyping }, ws);
      }
      return;
    }

    if (data.type === 'rename') {
      const nickname = sanitizeNickname(data.nickname);
      if (!nickname) return;
      user.nickname = nickname;
      broadcast({ type: 'renamed', userId, nickname });
      return;
    }

    if (data.type === 'recharacter') {
      if (!validCharacter(migrateCharacter(data.character))) return;
      user.character = normalizeCharacter(data.character);
      broadcast({ type: 'recharacter', userId, character: user.character });
      return;
    }
  });

  ws.on('close', () => {
    if (userId && users.has(userId)) {
      const user = users.get(userId);
      users.delete(userId);
      broadcast({ type: 'user-left', userId, nickname: user.nickname });
    }
  });
});

function start(port = PORT) {
  if (!server.listening) {
    server.listen(port, () => {
      console.log(`🐱 cat-chat server running: http://localhost:${port}`);
    });
  }
  return server;
}

if (require.main === module || process.versions.electron) start();

// Electron 메인 프로세스에서 require 시 서버 인스턴스 재사용
module.exports = { server, PORT, start };
