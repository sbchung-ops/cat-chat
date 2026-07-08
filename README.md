# 🐱 냥냥 채팅 (데스크톱 오버레이)

브라우저가 아니라 **바탕화면 위에 투명하게 고양이만 떠 있는** 실시간 채팅 데스크톱 앱.
배경 박스 없이, 평소 쓰는 화면 위에 고양이 캐릭터가 작업표시줄 바로 위에 앉아 있고,
말풍선으로 대화합니다. (Electron + WebSocket)

## 실행

```bash
npm install      # 최초 1회 (ws + electron)
npm run desktop  # 바탕화면 오버레이 실행
```

- 실행하면 화면 하단에 내 고양이가 나타나고, 우하단에 작은 입력 도크가 뜹니다.
- **빈 공간은 클릭이 그대로 바탕화면/아이콘으로 통과**되어 평소처럼 사용 가능합니다.
  (고양이와 입력창 위에서만 클릭이 앱에 전달됨)

## 사용법

- **채팅**: 우하단 입력창에 메시지 → 내 고양이 머리 위 말풍선으로 표시 (최근 1개, 12초 후 사라짐)
- **⚙ 설정**: 닉네임 변경 + `🎲 다른 고양이`로 캐릭터 다시 뽑기
- **✕**: 종료 (또는 트레이의 분홍 아이콘 → 종료 / 보이기·숨기기 / 위치 재조정)
- 재접속해도 같은 고양이·닉네임 유지 (localStorage)

## 여러 명이 같이 쓰기

같은 서버(기본 3000 포트)에 붙으면 접속자 수만큼 고양이가 나란히 섭니다.
- 같은 PC: 창을 여러 개 띄우거나 브라우저로 `http://localhost:3000`
- 다른 PC: `http://<이 PC의 IP>:3000` (방화벽 3000 인바운드 허용 필요)
  브라우저로 접속한 사람도 고양이로 참여됩니다.

## 배포 (PoC — Render)

이 앱은 상시 WebSocket 서버가 필요해서 Vercel/Netlify(서버리스)로는 배포할 수 없고,
무료로 WS를 지원하는 **Render**를 사용합니다. `render.yaml`이 포함되어 있습니다.

1. https://render.com 에 GitHub 계정으로 로그인
2. **New → Blueprint** → 이 저장소(`cat-chat`) 선택 → Apply
3. 빌드가 끝나면 `https://cat-chat-xxxx.onrender.com` 형태의 URL이 생깁니다

현재 PoC 서버: `https://cat-chat-y05q.onrender.com`

친구들이 참여하는 방법 (Windows):
- **포터블 앱 (권장)**: `냥냥채팅-포터블.exe` 더블클릭 → 설치 없이 바로 실행, 서버에 자동 접속
- **설치형 앱**: `냥냥채팅-설치.exe` 실행 → 자동 설치 후 실행
- **압축본**: `냥냥채팅-windows.zip` 압축 해제 → 폴더 안 `냥냥 채팅.exe` 실행
  (회사 PC 등 .exe 다운로드가 막힌 환경 대비용)
- **브라우저**: 배포 URL을 그냥 열면 됩니다 (설치 불필요)
- **개발 모드로 원격 서버 접속**:
  ```powershell
  $env:CATCHAT_SERVER="https://cat-chat-y05q.onrender.com"; npm run desktop
  ```

> ⚠️ **처음 실행 시 파란 SmartScreen 경고**가 뜹니다(코드 서명 안 된 앱이라 정상).
> `추가 정보` → `실행`을 누르면 됩니다. 친구에게 이 절차를 함께 알려주세요.

> Render 무료 플랜은 15분간 접속이 없으면 잠들었다가 첫 접속 시 ~30초 걸려 깨어납니다.
> (그동안 고양이가 안 보여도 잠시 기다리면 자동 접속됩니다.)

### Windows 빌드 (배포자용)

```powershell
npm run dist:win   # 포터블 + 설치본 동시 빌드 → dist\ 에 생성
```

이 PC는 회사 보안 에이전트가 폴더마다 랜덤 이름의 숨김 `*.DOCX` 카나리아 파일을 잠깐씩
떨궈서, electron-builder가 앱을 7za로 압축할 때 그 파일이 끼면 `Cannot open 1 file`로
빌드가 깨진다. 이를 7za 제외(`-xr!*.DOCX`)로 우회한다:
- **설치본(nsis)**: `package.json`의 `build.nsis.preCompressedFileExtensions`에 `.DOCX/.docx` 추가 (정식 옵션)
- **포터블**: 옵션 스키마가 이 키를 안 받아, `build/patch-portable-excludes.js`가 빌드 직전
  app-builder-lib 내부 기본 제외 목록에 DOCX를 주입 (win 빌드 스크립트가 자동 실행, 멱등)

## 구조

```
cat-chat/
├── electron-main.js   # Electron 메인: 투명·항상위·작업표시줄 위 고정 창, 클릭 통과 토글, 트레이
├── preload.js         # 렌더러에 최소 API 노출 (클릭 통과 / 종료)
├── server.js          # HTTP 정적 서빙 + WebSocket 서버 (Electron이 require 해서 함께 구동)
└── public/
    ├── index.html     # 오버레이 DOM (고양이 영역 + 우하단 도크 + 설정 팝오버)
    ├── style.css      # 투명 배경, 고양이/말풍선/도크 스타일 + 애니메이션
    ├── cat.js         # 고양이 SVG 생성기 (털색8×무늬4×액세서리7×표정4 조합)
    └── app.js         # WebSocket 클라이언트, 말풍선/타이핑/설정/클릭통과 처리
```

## 참고 (Windows)

- 창은 `screen.getPrimaryDisplay()` 작업표시줄 위에 폭 전체로 배치됩니다.
  다른 모니터에 두고 싶으면 `electron-main.js`의 `placeBottom()`에서 대상 디스플레이를 바꾸면 됩니다.
- 렌더링 문제 디버깅: `CATCHAT_DEBUG=1 npm run desktop` (불투명 배경 + DevTools).

## 프로토콜 (WebSocket, JSON)

| 방향 | type | 설명 |
|------|------|------|
| C→S | `join` | 입장 (nickname, character 선택적) |
| S→C | `welcome` | 본인 정보 + 현재 접속자 명단 |
| S→C | `user-joined` / `user-left` | 입장/퇴장 알림 |
| C→S / S→C | `chat` | 메시지 (200자 제한) / 브로드캐스트 |
| C→S / S→C | `typing` | 입력 중 상태 |
| C→S / S→C | `rename` / `renamed` | 닉네임 변경 |
| C→S / S→C | `recharacter` | 고양이 캐릭터 변경 |
