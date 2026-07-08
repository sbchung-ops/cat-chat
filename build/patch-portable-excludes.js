// 이 PC(회사 EDR)는 폴더마다 랜덤 이름의 숨김 *.DOCX 카나리아 파일을 잠깐씩 떨군다.
// electron-builder가 앱 폴더를 7za로 압축할 때 그 파일이 끼면 "Cannot open 1 file"로 빌드가 깨진다.
//
// nsis(설치본)는 package.json build.nsis.preCompressedFileExtensions 에 ".DOCX/.docx"를 넣어
// 7za 제외(-xr!*.DOCX)로 회피한다(정식 옵션). 하지만 portable 타깃은 옵션 스키마가 이 키를
// 받지 않아, app-builder-lib 내부 기본 제외 목록에 DOCX를 넣도록 여기서 직접 패치한다.
// npm install 후엔 이 파일이 초기화되므로, win 빌드 스크립트가 매번 이 패치를 먼저 돌린다(멱등).
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
const MEDIA = '".avi", ".mov", ".m4v", ".mp4", ".m4p", ".qt", ".mkv", ".webm", ".vmdk"';
const MEDIA_DOCX = MEDIA + ', ".DOCX", ".docx"';

if (!fs.existsSync(target)) {
  console.warn('[patch] NsisTarget.js 없음, 건너뜀:', target);
  process.exit(0);
}
let src = fs.readFileSync(target, 'utf8');

if (src.includes('".DOCX", ".docx"')) {
  console.log('[patch] 이미 패치됨');
  process.exit(0);
}

// portable 타깃: 빈 옵션(Object.create(null)) 대신 media+DOCX 기본 제외를 준다.
const before = `targetName === "portable"\n                ? Object.create(null)`;
const after = `targetName === "portable"\n                ? {\n                    preCompressedFileExtensions: [${MEDIA_DOCX}],\n                    ...this.packager.config.portable,\n                  }`;

if (!src.includes('? Object.create(null)')) {
  console.warn('[patch] 예상한 패턴을 못 찾음(라이브러리 버전 변경?). 수동 확인 필요:', target);
  process.exit(0);
}
src = src.replace('? Object.create(null)', `? {\n                    preCompressedFileExtensions: [${MEDIA_DOCX}],\n                    ...this.packager.config.portable,\n                  }`);
fs.writeFileSync(target, src, 'utf8');
console.log('[patch] portable 기본 제외 목록에 DOCX 추가 완료');
