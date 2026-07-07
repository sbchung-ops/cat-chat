// 냥냥 이벤트 레이어 생성 (index.html의 인라인 이벤트와 전용 이벤트 창(event.html)이 공유)
(function () {
  // catItems: manifest의 cats 항목 배열 [{ file, size_px, ... }]
  function build(catItems) {
    const W = window.innerWidth, H = window.innerHeight;
    const layer = document.createElement('div');
    layer.className = 'nyan-event';

    // 발자국 산책로: 방금 지나간 듯 한 걸음씩 순차 스탬프 (좌우 발 교차, 큼직하게)
    const trails = 6;
    for (let t = 0; t < trails; t++) {
      const fromLeft = t % 2 === 0;
      const angle = (Math.random() * 40 - 20) * (Math.PI / 180);
      const y0 = (H * 0.08) + Math.random() * H * 0.68;
      const stepLen = 150 + Math.random() * 50;
      const dir = fromLeft ? 1 : -1;
      const x0 = fromLeft ? -50 : W + 50;
      const steps = Math.ceil((W + 200) / stepLen);
      const size = 42 + Math.random() * 18; // 발자국 크기 (px)
      for (let i = 0; i < steps; i++) {
        const px = x0 + Math.cos(angle) * stepLen * i * dir;
        const py = y0 + Math.sin(angle) * stepLen * i;
        if (px < -90 || px > W + 90 || py < -90 || py > H + 90) break;
        const side = i % 2 ? 1 : -1; // 왼발/오른발 교차
        const paw = document.createElement('span');
        paw.className = 'nyan-paw';
        paw.textContent = '🐾';
        paw.style.fontSize = size + 'px';
        paw.style.left = (px - Math.sin(angle) * size * 0.5 * side) + 'px';
        paw.style.top = (py + Math.cos(angle) * size * 0.5 * side) + 'px';
        paw.style.setProperty('--rot', ((angle * 180 / Math.PI) * dir + (Math.random() * 16 - 8)) + 'deg');
        paw.style.animationDelay = (t * 260 + i * 150) + 'ms'; // 한 걸음씩 순서대로
        layer.appendChild(paw);
      }
    }

    // 고양이들: 상하좌우 가장자리에서 큼직하게 빼꼼 튀어나왔다 들어감
    if (catItems && catItems.length) {
      const edges = ['left', 'right', 'bottom', 'top'];
      for (let i = 0; i < 16; i++) {
        const edge = edges[i % 4];
        const it = catItems[Math.floor(Math.random() * catItems.length)];
        const img = document.createElement('img');
        img.className = 'nyan-cat nyan-cat-' + (edge === 'left' || edge === 'right' ? 'x' : 'y');
        img.src = 'assets/' + it.file;
        const ch = Math.round(H * (0.30 + Math.random() * 0.14)); // 화면 높이의 30~44%
        const cw = Math.round(ch * (it.size_px[0] / it.size_px[1]));
        img.style.height = ch + 'px';
        if (edge === 'left' || edge === 'right') {
          img.style.top = Math.random() * Math.max(0, H - ch) + 'px';
          img.style[edge] = '-8px';
          img.style.setProperty('--hide', ((edge === 'left' ? -1 : 1) * cw * 1.2) + 'px');
          img.style.setProperty('--rot', ((edge === 'left' ? 1 : -1) * (8 + Math.random() * 10)) + 'deg');
        } else {
          img.style.left = Math.random() * Math.max(0, W - cw) + 'px';
          img.style[edge] = '-8px';
          img.style.setProperty('--hide', ((edge === 'top' ? -1 : 1) * ch * 1.25) + 'px');
          img.style.setProperty('--rot', edge === 'top' ? (172 + Math.random() * 16) + 'deg' : (Math.random() * 12 - 6) + 'deg');
        }
        img.style.animationDelay = (Math.random() * 2400) + 'ms';
        layer.appendChild(img);
      }
    }
    return layer;
  }

  window.NyanFX = { build, TOTAL_MS: 7000 };
})();
