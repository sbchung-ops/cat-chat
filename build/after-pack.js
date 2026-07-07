// 패키징 직전 정리 훅: 이 머신에서 폴더마다 자동 생성되는 숨김 DOCX 파일(H7WIWU2.DOCX 등)을
// 걸러낸다. 이 파일이 잠겨 있으면 7z 압축 단계가 "Cannot open 1 file"로 실패한다.
const fs = require('fs');
const path = require('path');

function clean(dir) {
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += clean(p);
    } else if (/\.docx$/i.test(entry.name)) {
      try {
        fs.rmSync(p, { force: true });
        removed += 1;
      } catch (e) {
        console.warn('[after-pack] 삭제 실패:', p, e.message);
      }
    }
  }
  return removed;
}

exports.default = async function afterPack(context) {
  const removed = clean(context.appOutDir);
  if (removed) console.log(`[after-pack] 이물질 DOCX ${removed}개 제거`);
};
