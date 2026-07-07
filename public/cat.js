// 실제 PNG 에셋을 합성해 고양이 캐릭터를 렌더링한다.
// character = { cat: <slug>, hat: <slug|null>, neck: <slug|null>, item: <slug|null> }
(function () {
  const ASSET_BASE = 'assets/';
  const CAT_DISPLAY_H = 82; // 오버레이에서 고양이 표시 높이(px)

  // ---- 고양이별 실측 머리 기하 (이미지 알파 실루엣 + 눈동자 픽셀 측정값) ----
  // earTop: 귀 끝 / faceTop: 귀 밑(머리 돔 시작) / eyeY: 눈높이 / headW: 눈높이에서의 머리 폭 /
  // headCx: 머리 중심 x / bottom: 발 끝 — 모두 이미지 크기 대비 비율
  // chinFu: 턱 밑 목선(눈 아래 faceUnit 배수, 실루엣이 가장 잘록한 지점 실측) / neckCx: 목 중심 x
  const CAT_METRICS = {
    cat_01_korean_shorthair:    { earTop: 0.0473, faceTop: 0.1538, eyeY: 0.3905, headW: 0.6535, headCx: 0.4331, bottom: 0.9822, chinFu: 0.65, neckCx: 0.4356 },
    cat_02_american_shorthair:  { earTop: 0.0694, faceTop: 0.1734, eyeY: 0.3468, headW: 0.5685, headCx: 0.3836, bottom: 0.9827, chinFu: 1.10, neckCx: 0.3757 },
    cat_03_ragdoll:             { earTop: 0.0678, faceTop: 0.1695, eyeY: 0.3446, headW: 0.5577, headCx: 0.3974, bottom: 0.9944, chinFu: 1.05, neckCx: 0.3788 },
    cat_04_russian_blue:        { earTop: 0.0678, faceTop: 0.1864, eyeY: 0.3200, headW: 0.5857, headCx: 0.3821, bottom: 0.9831, chinFu: 1.75, neckCx: 0.3786, hatDx: 0.04,
      // 모자별 개별 보정: 얕은 모자들이 높게 떠서 내림
      hatFit: {
        acc_hat_05_straw_hat:       { dy: 0.30, dx: -0.06 },
        acc_hat_08_ski_helmet:      { dy: 0.30 },
        acc_hat_09_yellow_hard_hat: { dy: 0.30 },
        acc_hat_03_blue_beanie:     { dy: 0.30 },
        acc_hat_10_red_cap:         { dx: -0.06, dy: 0.15 },
        acc_hat_06_aviator_hat:     { dx: -0.03 },
      } }, // eyeY 수동 보정
    cat_05_maine_coon:          { earTop: 0.0541, faceTop: 0.1622, eyeY: 0.3243, headW: 0.5562, headCx: 0.3994, bottom: 0.9946, chinFu: 1.00, neckCx: 0.3774 },
    cat_06_siamese:             { earTop: 0.0621, faceTop: 0.1921, eyeY: 0.3559, headW: 0.6212, headCx: 0.4053, bottom: 0.9831, chinFu: 1.20, neckCx: 0.3992, eyeDy: 0.20 },
    cat_07_scottish_fold:       { earTop: 0.0745, faceTop: 0.0870, eyeY: 0.2981, headW: 0.6343, headCx: 0.3806, bottom: 0.9814, chinFu: 1.00, neckCx: 0.3780 },
    cat_08_tuxedo:              { earTop: 0.0670, faceTop: 0.1955, eyeY: 0.3687, headW: 0.6385, headCx: 0.4231, bottom: 0.9832, hatDy: 0.20, chinFu: 1.05, neckCx: 0.4173 },
    cat_09_sphynx:              { earTop: 0.0339, faceTop: 0.1921, eyeY: 0.3672, headW: 0.6167, headCx: 0.4625, bottom: 0.9774, earHalf: 0.80, chinFu: 0.90, neckCx: 0.4792, eyeDy: 0.12, eyeDx: 0.05 }, // 귀가 커서 넓게 파냄
    cat_10_persian:             { earTop: 0.0663, faceTop: 0.1326, eyeY: 0.3315, headW: 0.5882, headCx: 0.3912, bottom: 0.9669, chinFu: 0.70, neckCx: 0.3662 },
    cat_11_bombay:              { earTop: 0.0670, faceTop: 0.1844, eyeY: 0.3352, headW: 0.5797, headCx: 0.3659, bottom: 0.9609, chinFu: 1.35, neckCx: 0.3591 },
    cat_12_norwegian_forest_cat:{ earTop: 0.0543, faceTop: 0.1685, eyeY: 0.3641, headW: 0.5882, headCx: 0.4020, bottom: 0.9783, hatDy: 0.15, chinFu: 0.90, neckCx: 0.3835 },
    cat_13_british_shorthair:   { earTop: 0.0670, faceTop: 0.1788, eyeY: 0.3520, headW: 0.5862, headCx: 0.3793, bottom: 0.9777, chinFu: 1.10, neckCx: 0.3819, eyeDy: 0.25 },
    cat_14_bengal:              { earTop: 0.0604, faceTop: 0.1868, eyeY: 0.3626, headW: 0.5714, headCx: 0.3503, bottom: 0.9670, chinFu: 1.00, neckCx: 0.3457 },
    cat_15_devon_rex:           { earTop: 0.0670, faceTop: 0.1899, eyeY: 0.3799, headW: 0.6667, headCx: 0.3780, bottom: 0.9665, chinFu: 0.85, neckCx: 0.3530 },
    cat_16_turkish_angora:      { earTop: 0.0663, faceTop: 0.1823, eyeY: 0.3481, headW: 0.5862, headCx: 0.4414, bottom: 0.9669, chinFu: 1.00, neckCx: 0.4164, eyeDy: 0.30 },
  };
  const METRIC_DEFAULT = { earTop: 0.06, faceTop: 0.17, eyeY: 0.36, headW: 0.60, headCx: 0.40, bottom: 0.97, chinFu: 1.0 };
  const CAT_ANCHORS = {
    cat_01_korean_shorthair:     { l: [31, 61], r: [66, 61], m: [46, 72], gs: 1.02, ms: 1.00 },
    cat_02_american_shorthair:   { l: [29, 63], r: [64, 63], m: [43, 75], gs: 1.00, ms: 0.98 },
    cat_03_ragdoll:              { l: [36, 64], r: [70, 64], m: [52, 76], gs: 1.00, ms: 0.98 },
    cat_04_russian_blue:         { l: [33, 65], r: [67, 65], m: [46, 78], gs: 1.00, ms: 0.96 },
    cat_05_maine_coon:           { l: [42, 66], r: [73, 66], m: [56, 78], gs: 1.03, ms: 1.00 },
    cat_06_siamese:              { l: [31, 73], r: [67, 73], m: [49, 79], gs: 0.96, ms: 0.92 },
    cat_07_scottish_fold:        { l: [26, 54], r: [61, 54], m: [43, 66], gs: 0.98, ms: 0.92 },
    cat_08_tuxedo:               { l: [35, 72], r: [71, 72], m: [50, 82], gs: 1.00, ms: 1.02, gdx: -2 },
    cat_09_sphynx:               { l: [32, 69], r: [64, 69], m: [47, 81], gs: 0.94, ms: 0.88 },
    cat_10_persian:              { l: [43, 65], r: [78, 65], m: [54, 74], gs: 1.00, ms: 1.04, gdx: -2 },
    cat_11_bombay:               { l: [29, 66], r: [62, 66], m: [45, 77], gs: 1.02, ms: 1.02 },
    cat_12_norwegian_forest_cat: { l: [37, 67], r: [73, 67], m: [52, 82], gs: 1.00, ms: 0.96 },
    cat_13_british_shorthair:    { l: [31, 68], r: [66, 68], m: [46, 76], gs: 0.96, ms: 1.00 },
    cat_14_bengal:               { l: [29, 75], r: [65, 75], m: [45, 81], gs: 0.98, ms: 1.00 },
    cat_15_devon_rex:            { l: [24, 71], r: [60, 71], m: [40, 83], gs: 0.98, ms: 0.98 },
    cat_16_turkish_angora:       { l: [39, 69], r: [75, 69], m: [53, 78], gs: 0.96, ms: 1.00 },
  };

  // ---- 모자: 눈썹선(눈 살짝 위)에 착용선이 오게 → 귀가 모자 안으로 들어가 안 보임 ----
  // w: 머리 폭 대비 배율 / oy: 모자 이미지에서 착용선 위치(0=위,1=아래)
  // clip: 착용선 아래를 잘라냄(모자 안쪽이 그려진 일러스트용) / ax: 머리가 들어가는 지점의 x(캡처럼 챙이 한쪽인 모자용)
  // keepEars: 귀를 지우지 않는 모자(좁은 모자라 귀가 보이는 게 자연스러움)
  // lineDy: 착용선 추가 하강(faceUnit 단위, +면 얼굴 아래쪽으로)
  // dx: 좌우 미세조정(머리 폭 단위, +면 오른쪽)
  const HAT_SPECS = {
    acc_hat_01_chef_hat:        { w: 1.10, oy: 0.86, clip: true, keepEars: true, dx: 0.05 }, // 살짝 오른쪽
    acc_hat_02_beret:           { w: 1.24, oy: 0.70 },
    acc_hat_03_blue_beanie:     { w: 1.22, oy: 0.86 },
    acc_hat_04_top_hat:         { w: 1.12, oy: 0.84, keepEars: true },             // 귀 보임
    acc_hat_05_straw_hat:       { w: 1.55, oy: 0.80, dx: 0.07 },                   // 눈 위 + 살짝 오른쪽
    acc_hat_06_aviator_hat:     { w: 1.44, oy: 0.60, lineDy: 0.50 },               // 스키헬멧처럼 푹
    acc_hat_07_frog_hat:        { w: 1.46, oy: 0.52, dx: 0.06 },                   // 더 크게 + 오른쪽 + 푹
    acc_hat_08_ski_helmet:      { w: 1.34, oy: 0.72, lineDy: 0.65 },               // 더 크게, 고글이 눈 덮음
    acc_hat_09_yellow_hard_hat: { w: 1.20, oy: 0.82 },
    acc_hat_10_red_cap:         { w: 1.34, oy: 0.74, ax: 0.58 },                   // 더 크게, 크라운 기준
    // 꽃은 머리에 다는 작은 장식이라 귀는 그대로 두고 위치만 맞춘다
    acc_hat_11_flower:          { w: 0.55, oy: 0.85, dx: -0.28, lineDy: -0.15, keepEars: true },
    acc_hat_12_wizard_hat:      { w: 1.36, oy: 0.78, dx: 0.04, lineDy: -0.08 },
  };

  // ---- 목장식: 고양이별 실측 턱선(chinFu)에, 목 중심(neckCx) 정렬 ----
  // w: 머리 폭 대비 배율 / oy: 장식 이미지에서 턱선에 닿는 지점(0=위,1=아래) — 장식마다 매듭 위치가 달라 개별 지정
  const NECK_SPECS = {
    acc_neck_01_red_bow_tie:     { w: 0.65, oy: 0.20 },
    acc_neck_02_orange_necktie:  { w: 0.38, oy: 0.05 },
    acc_neck_03_green_bow_tie:   { w: 0.65, oy: 0.20 },
    acc_neck_05_blue_necktie:    { w: 0.50, oy: 0.05 },
    acc_neck_08_purple_bow:      { w: 0.60, oy: 0.20 },
    acc_neck_10_blue_bell_bow:   { w: 0.69, oy: 0.20 },
  };

  // ---- 기타 소품 ----
  // at: 'eye'(눈) | 'mouth'(입가) | 'dome'(머리 위) | 'ground'(발치) | 'float'(공중)
  // dx: 머리 폭 대비 좌우 오프셋
  const OTHER_SPECS = {
    acc_other_01_round_glasses: { at: 'eye',    w: 1.18, oy: 0.50, dx: 0 },
    acc_other_02_monocle:       { at: 'eye',    w: 0.66, oy: 0.48, dx: 0.23 },
    acc_other_03_mustache:      { at: 'mouth',  w: 0.78, oy: 0.58, dx: 0 },
    acc_other_06_sprout_pot:    { at: 'ground', w: 0.62, oy: 1.0,  dx: 0.58 },
    acc_other_07_carrot:        { at: 'ground', w: 0.43, oy: 1.0,  dx: 0.02 },
    acc_other_08_star:          { at: 'float',  w: 0.50, oy: 0.5,  dx: 0.80, float: true },
    acc_other_09_heart:         { at: 'float',  w: 0.48, oy: 0.5,  dx: 0.80, float: true },
    acc_other_10_broom:         { at: 'ground', w: 0.92, oy: 0.96, dx: 0.74 },
  };
  const OTHER_Z = { acc_other_06_sprout_pot: 5, acc_other_07_carrot: 6, acc_other_10_broom: 0 };
  const OTHER_FIT = {
    acc_other_01_round_glasses: {
      cat_01_korean_shorthair:    { dx: 0.01, dy: 0.00, w: 1.02 },
      cat_02_american_shorthair:  { dx: 0.00, dy: 0.03, w: 0.98 },
      cat_03_ragdoll:             { dx: -0.01, dy: 0.03, w: 1.00 },
      cat_04_russian_blue:        { dx: 0.02, dy: 0.06, w: 1.00 },
      cat_05_maine_coon:          { dx: -0.01, dy: 0.05, w: 1.02 },
      cat_06_siamese:             { dx: 0.01, dy: 0.02, w: 0.94 },
      cat_07_scottish_fold:       { dx: -0.01, dy: 0.03, w: 0.92 },
      cat_08_tuxedo:              { dx: -0.01, dy: 0.03, w: 0.96 },
      cat_09_sphynx:              { dx: -0.01, dy: 0.01, w: 0.92 },
      cat_10_persian:             { dx: -0.02, dy: 0.04, w: 1.00 },
      cat_11_bombay:              { dx: -0.01, dy: 0.06, w: 1.02 },
      cat_12_norwegian_forest_cat:{ dx: -0.01, dy: 0.03, w: 1.00 },
      cat_13_british_shorthair:   { dx: 0.00, dy: 0.01, w: 0.97 },
      cat_14_bengal:              { dx: 0.00, dy: 0.03, w: 1.02 },
      cat_15_devon_rex:           { dx: 0.00, dy: 0.00, w: 0.96 },
      cat_16_turkish_angora:      { dx: -0.03, dy: -0.01, w: 0.98 },
    },
    acc_other_02_monocle: {
      cat_01_korean_shorthair:    { dx: 0.24, dy: 0.00, w: 1.00 },
      cat_02_american_shorthair:  { dx: 0.24, dy: 0.03, w: 0.96 },
      cat_03_ragdoll:             { dx: 0.23, dy: 0.03, w: 0.96 },
      cat_04_russian_blue:        { dx: 0.24, dy: 0.06, w: 0.98 },
      cat_05_maine_coon:          { dx: 0.23, dy: 0.04, w: 1.00 },
      cat_06_siamese:             { dx: 0.25, dy: 0.02, w: 0.92 },
      cat_07_scottish_fold:       { dx: 0.23, dy: 0.03, w: 0.90 },
      cat_08_tuxedo:              { dx: 0.24, dy: 0.03, w: 0.94 },
      cat_09_sphynx:              { dx: 0.24, dy: 0.01, w: 0.92 },
      cat_10_persian:             { dx: 0.22, dy: 0.04, w: 0.98 },
      cat_11_bombay:              { dx: 0.23, dy: 0.06, w: 1.00 },
      cat_12_norwegian_forest_cat:{ dx: 0.23, dy: 0.03, w: 0.98 },
      cat_13_british_shorthair:   { dx: 0.24, dy: 0.01, w: 0.94 },
      cat_14_bengal:              { dx: 0.24, dy: 0.03, w: 0.98 },
      cat_15_devon_rex:           { dx: 0.24, dy: 0.00, w: 0.92 },
      cat_16_turkish_angora:      { dx: 0.21, dy: -0.01, w: 0.96 },
    },
    acc_other_03_mustache: {
      cat_01_korean_shorthair:    { dx: 0.00, dy: -0.04, w: 0.98 },
      cat_02_american_shorthair:  { dx: -0.01, dy: -0.02, w: 0.95 },
      cat_03_ragdoll:             { dx: -0.01, dy: -0.02, w: 0.96 },
      cat_04_russian_blue:        { dx: 0.00, dy: 0.08, w: 0.98 },
      cat_05_maine_coon:          { dx: -0.01, dy: -0.01, w: 1.00 },
      cat_06_siamese:             { dx: 0.00, dy: 0.04, w: 0.92 },
      cat_07_scottish_fold:       { dx: -0.01, dy: 0.00, w: 0.92 },
      cat_08_tuxedo:              { dx: -0.01, dy: 0.01, w: 0.96 },
      cat_09_sphynx:              { dx: 0.02, dy: -0.03, w: 0.88 },
      cat_10_persian:             { dx: -0.02, dy: -0.02, w: 0.98 },
      cat_11_bombay:              { dx: -0.01, dy: 0.05, w: 0.98 },
      cat_12_norwegian_forest_cat:{ dx: -0.01, dy: -0.01, w: 0.98 },
      cat_13_british_shorthair:   { dx: 0.00, dy: 0.03, w: 0.94 },
      cat_14_bengal:              { dx: 0.00, dy: 0.00, w: 0.98 },
      cat_15_devon_rex:           { dx: 0.00, dy: -0.04, w: 0.92 },
      cat_16_turkish_angora:      { dx: -0.03, dy: -0.02, w: 0.96 },
    },
  };

  let byslug = {};
  const CATS = [], HATS = [], NECKS = [], OTHERS = [];

  function setCatalog(list) {
    byslug = {};
    CATS.length = HATS.length = NECKS.length = OTHERS.length = 0;
    for (const it of list) {
      byslug[it.slug] = it;
      if (it.category === 'cats') CATS.push(it);
      else if (it.category === 'accessories/hats') HATS.push(it);
      else if (it.category === 'accessories/neck') NECKS.push(it);
      else if (it.category === 'accessories/other') OTHERS.push(it);
    }
  }

  function esc(s) { return String(s).replace(/"/g, '&quot;'); }

  function layerTag(it, left, top, w, h, z, extra) {
    return `<img class="cat-layer" src="${ASSET_BASE}${esc(it.file)}" alt="" `
      + `style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w.toFixed(1)}px;`
      + `height:${h.toFixed(1)}px;z-index:${z};${extra || ''}">`;
  }

  // character -> 합성된 고양이 HTML (.cat-figure)
  function catHTML(character) {
    const catIt = byslug[character && character.cat] || CATS[0];
    if (!catIt) return '<div class="cat-figure"></div>';
    const [cw, ch] = catIt.size_px;
    const Hc = CAT_DISPLAY_H;
    const Wc = Hc * (cw / ch);
    const M = CAT_METRICS[catIt.slug] || METRIC_DEFAULT;

    // 실측 기준점 (렌더 px)
    const headWpx = M.headW * Wc;
    const cx = M.headCx * Wc;
    const earTopPx = M.earTop * Hc;
    const faceTopPx = M.faceTop * Hc;
    const eyePx = M.eyeY * Hc;
    const groundPx = M.bottom * Hc;
    const faceUnit = eyePx - faceTopPx;          // 머리 돔~눈 거리 (얼굴 크기 단위)
    const browPx = eyePx - 0.45 * faceUnit;      // 눈썹선 = 모자 착용선
    const mouthPx = eyePx + 0.75 * faceUnit;     // 입가
    const chinPx = eyePx + (M.chinFu || 1.0) * faceUnit; // 턱 밑 목선 (고양이별 실측)

    // 모자를 쓰면 귀를 제거: "머리 폭 구간"만 위에서 파낸다 (꼬리·등털은 그대로, 단면은 모자가 덮음)
    // 단, keepEars 모자(탑햇·셰프)는 귀를 남긴다.
    const hatSpec0 = character && character.hat && byslug[character.hat]
      ? (HAT_SPECS[character.hat] || {}) : null;
    const removeEars = !!(hatSpec0 && !hatSpec0.keepEars);
    let catClip = '';
    if (removeEars) {
      const cY = ((M.faceTop + 0.35 * (M.eyeY - M.faceTop)) * 100).toFixed(1);
      const half = M.earHalf || 0.56; // 귀가 큰 고양이는 더 넓게
      const nL = ((M.headCx - half * M.headW) * 100).toFixed(1);
      const nR = ((M.headCx + half * M.headW) * 100).toFixed(1);
      catClip = `clip-path:polygon(0% 0%, ${nL}% 0%, ${nL}% ${cY}%, ${nR}% ${cY}%, ${nR}% 0%, 100% 0%, 100% 100%, 0% 100%);`;
    }
    let layers = layerTag(catIt, 0, 0, Wc, Hc, 1, catClip);

    // 목장식
    const neckSlug = character && character.neck;
    if (neckSlug && byslug[neckSlug]) {
      const it = byslug[neckSlug];
      const spec = NECK_SPECS[neckSlug] || { w: 0.55, oy: 0.20 };
      const W = headWpx * spec.w;
      const H = W * (it.size_px[1] / it.size_px[0]);
      const neckCxPx = (M.neckCx || M.headCx) * Wc; // 목 중심(머리 중심과 다를 수 있음)
      layers += layerTag(it, neckCxPx - W / 2, chinPx - spec.oy * H, W, H, 3);
    }

    // 기타 소품
    const itemSlug = character && character.item;
    if (itemSlug && byslug[itemSlug]) {
      const it = byslug[itemSlug];
      const spec = OTHER_SPECS[itemSlug] || { at: 'eye', w: 0.5, oy: 0.5, dx: 0 };
      const fit = (OTHER_FIT[itemSlug] && OTHER_FIT[itemSlug][catIt.slug]) || {};
      const anchor = CAT_ANCHORS[catIt.slug];
      const scale = Hc / ch;
      let layerExtra = '';
      let W = headWpx * spec.w * (fit.w || 1);
      let H = W * (it.size_px[1] / it.size_px[0]);
      let x = cx + (((fit.dx != null ? fit.dx : (spec.dx || 0))) + (spec.at === 'eye' ? (M.eyeDx || 0) : 0)) * headWpx - W / 2;
      let y = 0;
      // eyeDy/eyeDx: 안경류 전용 눈 위치 보정(faceUnit/머리폭 단위) — eyeY/headCx를 바꾸면 모자/턱선 캘리브레이션이 틀어져 분리
      if (anchor && itemSlug === 'acc_other_01_round_glasses') {
        const lx = anchor.l[0] * scale;
        const ly = anchor.l[1] * scale;
        const rx = anchor.r[0] * scale;
        const ry = anchor.r[1] * scale;
        const eyeGap = Math.max(1, rx - lx);
        const lensLx = 31 / 112;
        const lensRx = 80 / 112;
        const lensCy = 35 / 66;
        W = eyeGap / (lensRx - lensLx) * (anchor.gs || 1);
        H = W * (it.size_px[1] / it.size_px[0]);
        x = lx - W * lensLx + (anchor.gdx || 0) * scale;
        y = ((ly + ry) / 2) - H * lensCy;
      } else if (anchor && itemSlug === 'acc_other_02_monocle') {
        const eyeGap = Math.max(1, (anchor.r[0] - anchor.l[0]) * scale);
        W = eyeGap * 1.06 * (anchor.gs || 1);
        H = W * (it.size_px[1] / it.size_px[0]);
        x = anchor.r[0] * scale - W * 0.50;
        y = anchor.r[1] * scale - H * 0.42;
      } else if (anchor && itemSlug === 'acc_other_03_mustache') {
        const eyeGap = Math.max(1, (anchor.r[0] - anchor.l[0]) * scale);
        W = eyeGap * 1.18 * (anchor.ms || 1);
        H = W * (it.size_px[1] / it.size_px[0]);
        x = anchor.m[0] * scale - W * 0.50;
        y = anchor.m[1] * scale - H * 0.72;
      } else if (spec.at === 'eye') y = eyePx + (M.eyeDy || 0) * faceUnit - spec.oy * H;
      else if (spec.at === 'mouth') y = mouthPx - spec.oy * H;
      else if (spec.at === 'dome') y = faceTopPx - spec.oy * H + 0.15 * faceUnit;
      else if (spec.at === 'ground') y = groundPx - spec.oy * H;
      else if (spec.at === 'float') y = earTopPx + 0.5 * faceUnit - spec.oy * H;
      if (!(anchor && (itemSlug === 'acc_other_01_round_glasses' || itemSlug === 'acc_other_02_monocle' || itemSlug === 'acc_other_03_mustache'))) y += (fit.dy || 0) * faceUnit;
      const extra = layerExtra + (spec.float ? `animation:charm-float ${((2.7 + (catIt.slug.length % 5) * 0.12)).toFixed(2)}s ease-in-out infinite;` : '');
      layers += layerTag(it, x, y, W, H, OTHER_Z[itemSlug] || 4, extra);
    }

    // 모자 (맨 위: 귀를 완전히 덮음)
    const hatSlug = character && character.hat;
    if (hatSlug && byslug[hatSlug]) {
      const it = byslug[hatSlug];
      const spec = HAT_SPECS[hatSlug] || { w: 1.12, oy: 0.84 };
      const fit = (M.hatFit && M.hatFit[hatSlug]) || {}; // 고양이×모자 개별 보정
      const W = headWpx * spec.w * (M.hatW || 1) * (fit.w || 1);
      const H = W * (it.size_px[1] / it.size_px[0]);
      const ax = spec.ax != null ? spec.ax : 0.5; // 머리가 들어가는 지점(챙 있는 모자는 크라운 중심)
      // 착용선 = 눈썹선 + 모자별 하강 + 고양이별 미세조정(hatDy/hatDx) + 조합별 보정
      const lineY = browPx + ((spec.lineDy || 0) + (M.hatDy || 0) + (fit.dy || 0)) * faceUnit;
      const hx = cx + ((spec.dx || 0) + (M.hatDx || 0) + (fit.dx || 0)) * headWpx - ax * W;
      const extra = spec.clip ? `clip-path:inset(0 0 ${((1 - spec.oy) * 100).toFixed(1)}% 0);` : '';
      layers += layerTag(it, hx, lineY - spec.oy * H, W, H, 7, extra);
    }

    return `<div class="cat-figure" style="width:${Wc.toFixed(1)}px;height:${Hc.toFixed(1)}px;">${layers}</div>`;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function randomCharacter() {
    const maybe = (arr) => (Math.random() < 0.4 && arr.length ? pick(arr).slug : null);
    return {
      cat: CATS.length ? pick(CATS).slug : 'cat_01_korean_shorthair',
      hat: maybe(HATS),
      neck: maybe(NECKS),
      item: maybe(OTHERS),
    };
  }

  window.CatRender = {
    setCatalog, catHTML, randomCharacter,
    thumb: (slug) => (byslug[slug] ? ASSET_BASE + byslug[slug].file : ''),
    nameOf: (slug) => (byslug[slug] ? byslug[slug].name_ko : ''),
    get cats() { return CATS; },
    get hats() { return HATS; },
    get necks() { return NECKS; },
    get others() { return OTHERS; },
    has: (slug) => !!byslug[slug],
  };
})();
