/* =====================================================================
   3차 발표 · 슬라이드 엔진
   조작: → / 스페이스 = 다음 항목·다음 장, ← = 이전, Home / End
   ===================================================================== */
(() => {
  const root = document.documentElement;
  const stage = document.getElementById('stage');
  const viewport = document.getElementById('viewport');
  const wipeEl = document.getElementById('wipe');
  const slides = [...document.querySelectorAll('.slide')];
  const canVT = typeof document.startViewTransition === 'function';
  if (canVT) root.classList.add('vt');
  let cur = -1;
  let vt = null;
  let wipeTimer = 0;
  const hooks = {};

  /* ---------- 지면 맞추기 ---------- */
  function fit() {
    const s = Math.min(viewport.clientWidth / 1280, viewport.clientHeight / 720);
    stage.style.transform = `translate(-50%, -50%) scale(${Math.max(s, 0.1)})`;
  }

  /* ---------- 슬라이드별 타이머: 떠나면 모두 정리 ---------- */
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  /* ---------- 제목 글자 나누기 ---------- */
  document.querySelectorAll('[data-split]').forEach((h) => {
    let c = 0;
    h.innerHTML = h.textContent.trim().split(/\s+/).map((w) =>
      `<span class="w">${[...w].map((ch) => `<span class="cw"><span class="ch" style="--c:${c++}">${ch}</span></span>`).join('')}</span>`
    ).join(' ');
  });

  /* ---------- 진입 애니메이션 대상 ---------- */
  const RISE = [
    '.body > *', '.grid > *', '.cause > *', '.signs > *', '.checks > li', '.fields > *', '.ppe > *',
    '.acc > *', '.form-row', '.who > *', '.prin > *', '.facts > *', '.eq > *', '.kinds > *',
    '.work > *', '.crit > *', '.cards > *', '.steps > *', '.sum > *', '.tl > li', '.qa', '.profile',
    '.hein-list', '.hein > div', '.cov > *', '.sec-left > *', '.sec-sign', '.sec-toc > li',
    '.fields6 > *', '.acc8 > *', '.laws2 > *', '.work8 > *', '.vid > *',
  ].join(', ');

  /* ---------- 왼쪽 기둥: 장 번호와 진행 막대 ---------- */
  slides.forEach((s, i) => {
    const no = s.querySelector('.rail-no');
    if (no) no.textContent = String(i + 1).padStart(2, '0');
    const bar = s.querySelector('.rail-prog');
    if (bar) bar.innerHTML = slides.map((_, j) => `<i${j <= i ? ' class="on"' : ''}></i>`).join('');
  });
  slides.forEach((s) => {
    const all = [...s.querySelectorAll(RISE)].filter((el) =>
      !el.closest('[data-build]') && !el.matches('[data-build]') && !el.matches('[data-split]')
    );
    const leaves = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
    leaves.forEach((el, i) => { el.classList.add('rise'); el.style.setProperty('--i', Math.min(i, 14)); });
    // 체크박스는 줄 순서대로 체크된다
    s.querySelectorAll('.checks > li').forEach((li, i) => li.style.setProperty('--i', i));
  });

  /* ---------- 숫자 올라가기 ---------- */
  function runCounters(scope, slide) {
    scope.querySelectorAll('[data-count]').forEach((el) => {
      const to = parseFloat(el.dataset.count);
      const dur = parseFloat(el.dataset.dur || '1200');
      el.textContent = '0';
      later(() => {
        const t0 = performance.now();
        const step = (now) => {
          if (!slide.classList.contains('active')) return;
          const p = Math.min(1, (now - t0) / dur);
          const txt = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (el.textContent !== txt) el.textContent = txt;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, parseFloat(el.dataset.delay || '0'));
    });
  }

  /* ---------- 슬라이드 활성화 ---------- */
  function activate(n, dir, from) {
    const to = slides[n];
    clearTimers();
    if (from) hooks[from.dataset.hook]?.leave?.(from);
    slides.forEach((s) => s.classList.remove('active', 'in', 'fresh'));
    to.classList.add('active');
    // 기둥 색이 바뀌는 장(단원 이동, 표지 다음)에서만 제목 글자가 하나씩 올라온다
    to.classList.toggle('fresh', !from || !from.querySelector('.rail') || from.dataset.sec !== to.dataset.sec);
    void to.offsetWidth;
    to.classList.add('in');
    // 이미 보이는 빌드 안의 숫자는 끝값으로
    to.querySelectorAll('[data-build].shown [data-count]').forEach((el) => { el.textContent = el.dataset.count; });
    to.querySelectorAll('[data-build]:not(.shown) [data-count]').forEach((el) => { el.textContent = '0'; });
    hooks[to.dataset.hook]?.enter?.(to, dir);
    try { history.replaceState(null, '', '#' + (n + 1)); } catch (e) {}
  }

  function go(n, instant) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === cur) return;
    const dir = n > cur ? 'fwd' : 'back';
    const from = slides[cur];
    const to = slides[n];
    // 빌드 항목은 전환 전에 맞춰 둔다: 앞으로 가면 닫힌 채, 뒤로 오면 모두 열린 채
    to.querySelectorAll('[data-build]').forEach((b) => b.classList.toggle('shown', dir === 'back'));
    cur = n;

    // 진행 중인 전환은 끝내고 바로 넘어간다 (키를 빠르게 눌러도 밀리지 않게)
    if (wipeTimer) { clearTimeout(wipeTimer); wipeTimer = 0; }
    if (vt) vt.skipTransition();

    if (instant || !from) { activate(n, dir, from); return; }

    // 단원 표지로 들어갈 때: 사선 띠가 훑고 지나가는 사이에 장을 바꾼다
    if (to.classList.contains('section')) {
      wipeEl.classList.remove('run', 'back');
      void wipeEl.offsetWidth;
      wipeEl.classList.toggle('back', dir === 'back');
      wipeEl.classList.add('run');
      wipeTimer = setTimeout(() => { wipeTimer = 0; activate(n, dir, from); }, 400);
      return;
    }

    if (!canVT) { activate(n, dir, from); return; }
    root.dataset.dir = dir;
    vt = document.startViewTransition(() => activate(n, dir, from));
    vt.ready.catch(() => {});
    vt.finished.catch(() => {}).finally(() => { vt = null; });
  }
  wipeEl.addEventListener('animationend', () => wipeEl.classList.remove('run', 'back'));

  function next() {
    const pending = slides[cur].querySelector('[data-build]:not(.shown)');
    if (pending) {
      pending.classList.add('shown');
      runCounters(pending, slides[cur]);
      return;
    }
    go(cur + 1);
  }
  function prev() {
    const shown = slides[cur].querySelectorAll('[data-build].shown');
    if (shown.length) { shown[shown.length - 1].classList.remove('shown'); return; }
    go(cur - 1);
  }

  /* ---------- 키보드 · 터치 ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowRight': case ' ': e.preventDefault(); next(); break;
      case 'ArrowLeft': e.preventDefault(); prev(); break;
      case 'Home': go(0); break;
      case 'End': go(slides.length - 1); break;
    }
  });
  let tx = null, ty = null;
  viewport.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  viewport.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
    tx = ty = null;
  });

  /* =====================================================================
     슬라이드별 동작
     ===================================================================== */

  /* ---------- 무재해 현황판: 숫자판이 돌아가 멈춘다 ---------- */
  {
    const STEP = 1.15; // em, .odo-s i 높이
    document.querySelectorAll('.odo').forEach((el) => {
      const digits = el.dataset.to.length;
      const strip = '01234567890123456789'.split('').map((c) => `<i>${c}</i>`).join('');
      el.innerHTML = Array.from({ length: digits }, () => `<span class="odo-d"><span class="odo-s">${strip}</span></span>`).join('');
    });
    const set = (s, idx, dur, delay) => {
      s.style.transition = dur ? `transform ${dur}s cubic-bezier(.15,.75,.2,1) ${delay || 0}s` : 'none';
      s.style.transform = `translateY(${-idx * STEP}em)`;
    };
    hooks.board = {
      enter(slide) {
        const odo = slide.querySelector('.odo');
        const strips = [...odo.querySelectorAll('.odo-s')];
        const to = odo.dataset.to;
        strips.forEach((s) => set(s, 0));
        void odo.offsetWidth;
        // 앞자리부터 차례로, 한 바퀴 돌고 멈춘다
        later(() => strips.forEach((s, i) => set(s, 10 + Number(to[i]), 1.3 + i * 0.35, i * 0.08)), 450);
        const then = odo.dataset.then;
        if (then) {
          later(() => strips.forEach((s, i) => {
            if (then[i] !== to[i]) set(s, 10 + Number(then[i]), .7);
          }), 3400);
        }
      },
    };
  }

  /* ---------- 하인리히: 300개의 점 중 29개, 그리고 1개 ---------- */
  {
    const COLS = 20, ROWS = 15, CELL = 20;
    // 매번 같은 배치가 나오도록 고정된 의사 난수
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const redCell = { c: 13, r: 9 };
    const taken = new Set([`${redCell.c},${redCell.r}`]);
    const orange = [];
    while (orange.length < 29) {
      // 빨간 점 주변에 몰리도록: 가까울수록 뽑힐 확률이 높다
      const c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS);
      const d = Math.hypot(c - redCell.c, r - redCell.r);
      if (taken.has(`${c},${r}`) || rnd() > Math.exp(-d / 5)) continue;
      taken.add(`${c},${r}`);
      orange.push([c, r]);
    }
    const svg = document.getElementById('dots29');
    svg.innerHTML = orange.map(([c, r]) =>
      `<circle cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="5" fill="#ff7b1c"/>`
    ).join('');
    const x = redCell.c * CELL + CELL / 2, y = redCell.r * CELL + CELL / 2;
    ['red', 'ring'].forEach((id) => {
      const el = document.getElementById(id);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });
  }

  /* ---------- 영상: 이 장에 있을 때만 불러오고, 떠나면 멈춘다 ----------
     (저사양 노트북에서 다른 장을 넘길 때 영상이 뒤에서 돌지 않게) */
  {
    const frame = document.getElementById('vid-frame');
    const id = frame && frame.dataset.yt;
    let iframe = null;
    hooks.video = {
      enter() {
        if (!id || iframe) return;
        iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${id}?rel=0&playsinline=1`;
        iframe.title = '영상';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.appendChild(iframe);
      },
      leave() {
        if (iframe) { iframe.remove(); iframe = null; }
      },
    };
    // 영상을 클릭하면 키보드가 영상 안으로 들어가서 ←/→가 발표 조작에 안 먹는다.
    // 클릭(재생·정지)은 그대로 두고, 곧바로 키보드만 발표 화면으로 되돌린다.
    window.addEventListener('blur', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (a && a.tagName === 'IFRAME') { a.blur(); window.focus(); }
      }, 0);
    });
  }

  /* ---------- 시작 ---------- */
  window.addEventListener('resize', fit);
  fit();
  const start = parseInt((location.hash || '').slice(1), 10);
  go(Number.isFinite(start) ? start - 1 : 0, true);
})();
