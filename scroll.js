/**
 * JANI BUŃKA — Signature scroll reveal (v1)
 *
 * Scroll-driven: path draws as the user scrolls through the hero wrapper.
 * Each of the 5 pen-strokes gets equal scroll time (prevents the big swash
 * from eating 78% of the scroll and the small letters snapping in).
 *
 * Button animation: decoupled from scroll position entirely.
 * Drives strokeDashoffset directly on a rAF timer at a constant, readable
 * pace with gentle ease-in/ease-out. No browser scroll-behavior fighting.
 */

(function () {
  'use strict';

  /* ── Elements ─────────────────────────────────────────────────── */
  const wrapper   = document.getElementById('heroWrapper');
  const pathEl    = document.querySelector('svg.squiggle path');
  const scrollCue = document.querySelector('.hero-scroll');
  const revealBtn = document.getElementById('revealBtn');
  const navbar    = document.getElementById('navbar');
  if (!wrapper || !pathEl) return;

  /* ── Mobile ───────────────────────────────────────────────────── */
  const isMobile = () => window.innerWidth <= 768;
  function setWrapperHeight() { wrapper.style.height = isMobile() ? '200vh' : '280vh'; }
  function setStroke()        { pathEl.style.strokeWidth = isMobile() ? '22' : '18'; }
  setWrapperHeight(); setStroke();
  window.addEventListener('resize', setWrapperHeight, { passive: true });
  window.addEventListener('resize', setStroke,        { passive: true });

  /* ── Path + subpath setup ─────────────────────────────────────── */
  const totalLen = pathEl.getTotalLength();
  pathEl.style.strokeDasharray  = totalLen;
  pathEl.style.strokeDashoffset = totalLen;

  /* Build one temp path per M-separated subpath to measure each independently */
  const svgNS      = 'http://www.w3.org/2000/svg';
  const measureSvg = document.createElementNS(svgNS, 'svg');
  Object.assign(measureSvg.style, { position:'absolute', width:'0', height:'0', overflow:'hidden', pointerEvents:'none' });
  measureSvg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(measureSvg);

  const subpaths   = (pathEl.getAttribute('d') || '').split(/(?=[Mm])/).map(s => s.trim()).filter(Boolean).map(sub => {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', sub); measureSvg.appendChild(p); return p.getTotalLength();
  }).filter(len => len > 0);

  const subCount  = subpaths.length || 1;
  const subOff    = [];
  let   runOff    = 0;
  subpaths.forEach(len => { subOff.push(runOff); runOff += len; });

  /* Given uniform progress p (0-1) where each subpath gets equal time,
     return the arc length for strokeDashoffset. */
  function arcForP(p) {
    const si = Math.min(Math.floor(p * subCount), subCount - 1);
    const lt = Math.min(Math.max(p * subCount - si, 0), 1);
    return subOff[si] + lt * subpaths[si];
  }

  /* ── Build a time→arcLength look-up table for the button animation ──
   *
   * This is the key to smooth button animation at constant perceived speed.
   *
   * We want the pen tip to advance at ~constant pixels/second on screen.
   * arcForP(p) already ensures equal-time per subpath, but the visual
   * speed within each stroke still varies because the path itself curves
   * (sharp bends cover fewer screen pixels per arc-length unit than
   * straight sections). For the button animation we approximate constant
   * SCREEN SPEED by sampling getPointAtLength at many points and building
   * a cumulative visual-distance table, then inverting it.
   *
   * Scroll-driven draw uses a simple smoothstep because at human scrolling
   * speeds the variation isn't perceptible.
   */
  const LUT_STEPS = 800;
  const lutArcLen = new Float32Array(LUT_STEPS + 1); // arc length at each LUT step
  const lutVisDst = new Float32Array(LUT_STEPS + 1); // cumulative visual distance

  for (let i = 0; i <= LUT_STEPS; i++) {
    lutArcLen[i] = arcForP(i / LUT_STEPS);
  }
  for (let i = 1; i <= LUT_STEPS; i++) {
    try {
      const a = pathEl.getPointAtLength(lutArcLen[i - 1]);
      const b = pathEl.getPointAtLength(lutArcLen[i]);
      // Don't accumulate distance across subpath gaps (pen lifts).
      // Detect a jump: if point moves more than 5% of viewBox width it's a pen lift.
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      lutVisDst[i] = lutVisDst[i - 1] + (dist > 50 ? 0 : dist);
    } catch (_) {
      lutVisDst[i] = lutVisDst[i - 1];
    }
  }
  const totalVisDst = lutVisDst[LUT_STEPS];

  /* Given animation time t (0-1), return the arc length that puts the
     pen tip at a position it would be if moving at constant screen speed. */
  function arcForConstantSpeed(t) {
    if (totalVisDst === 0) return arcForP(t);
    const target = t * totalVisDst;
    let lo = 0, hi = LUT_STEPS;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lutVisDst[mid] < target) lo = mid + 1; else hi = mid;
    }
    if (lo === 0) return lutArcLen[0];
    const i0 = lo - 1, i1 = lo;
    const d0 = lutVisDst[i0], d1 = lutVisDst[i1];
    const frac = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    return lutArcLen[i0] + frac * (lutArcLen[i1] - lutArcLen[i0]);
  }

  /* ── Apply draw ───────────────────────────────────────────────── */
  /* Scroll version: smoothstep per subpath gives gentle easing */
  function applyDrawScroll(p) {
    const ss = p * p * (3 - 2 * p); // smoothstep
    pathEl.style.strokeDashoffset = totalLen - arcForP(ss);
  }

  /* Button version: constant visual speed from the LUT, with gentle
     ease-in and ease-out only at the very start and end (5% each). */
  function applyDrawButton(t) {
    // Gentle ease: remap t so we accelerate over first 5% and decelerate last 5%
    let remapped;
    if (t < 0.05) {
      remapped = (t / 0.05) * (t / 0.05) * 0.05; // quad ease-in for first 5%
    } else if (t > 0.95) {
      const u = (t - 0.95) / 0.05;
      remapped = 0.95 + u * (2 - u) * 0.05; // quad ease-out for last 5%
    } else {
      remapped = t; // perfectly linear in the middle
    }
    pathEl.style.strokeDashoffset = totalLen - arcForConstantSpeed(remapped);
  }

  /* ── Scroll-driven draw ─────────────────────────────────────────── */
  let buttonAnimating = false;

  function getScrollP() {
    const scrolled  = Math.max(-wrapper.getBoundingClientRect().top, 0);
    const maxScroll = wrapper.offsetHeight - window.innerHeight;
    return maxScroll > 0 ? Math.min(scrolled / maxScroll, 1) : 0;
  }

  function applyScrollState(sp) {
    applyDrawScroll(Math.min(sp / 0.80, 1));

    if (scrollCue) {
      const op = sp > 0.82 && sp < 0.96
        ? Math.min((sp - 0.82) / 0.08, 1)
        : sp >= 0.96 ? Math.max(0, 1 - (sp - 0.96) / 0.04) : 0;
      scrollCue.style.opacity = op;
    }
    if (revealBtn) {
      revealBtn.style.opacity       = sp < 0.05 ? '1' : String(Math.max(0, 1 - sp / 0.12));
      revealBtn.style.pointerEvents = sp > 0.08 ? 'none' : 'auto';
    }
    if (navbar) navbar.classList.toggle('visible', sp >= 1);
  }

  let ticking = false;
  function onScroll() {
    if (buttonAnimating) return;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { applyScrollState(getScrollP()); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Reveal button ────────────────────────────────────────────── */
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      if (buttonAnimating) return;
      buttonAnimating = true;
      revealBtn.style.opacity       = '0';
      revealBtn.style.pointerEvents = 'none';

      const DURATION      = 2000; // ms — easy pace to follow each stroke
      const startScrollY  = window.scrollY;
      const targetScrollY = wrapper.offsetTop + wrapper.offsetHeight - window.innerHeight;
      const scrollDist    = targetScrollY - startScrollY;
      const SCROLL_DUR    = DURATION + 600;

      let t0 = null, scrollDone = false, cancelled = false;

      function scrollEase(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

      /* If the user scrolls or touches the screen while the button
         animation is running, stop driving scroll/draw ourselves and
         hand control straight back to the normal scroll handler — so
         a manual scroll attempt is never fought or ignored. */
      function cancelOnUserInput() {
        if (cancelled) return;
        cancelled       = true;
        buttonAnimating = false;
        if (revealBtn) revealBtn.style.pointerEvents = 'none';
        onScroll(); // sync draw state to wherever the user actually is now
      }
      window.addEventListener('wheel',     cancelOnUserInput, { passive: true, once: true });
      window.addEventListener('touchmove', cancelOnUserInput, { passive: true, once: true });
      window.addEventListener('keydown',   (e) => {
        if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)) cancelOnUserInput();
      }, { once: true });

      function frame(ts) {
        if (cancelled) return;
        if (!t0) t0 = ts;
        const elapsed  = ts - t0;
        const timeFrac = Math.min(elapsed / DURATION, 1);

        applyDrawButton(timeFrac);

        if (!scrollDone) {
          const sf = Math.min(elapsed / SCROLL_DUR, 1);
          window.scrollTo({ top: startScrollY + scrollDist * scrollEase(sf), behavior: 'instant' });
          if (sf >= 1) scrollDone = true;
        }

        if (scrollCue) {
          scrollCue.style.opacity = timeFrac > 0.88 ? String(Math.min((timeFrac - 0.88) / 0.1, 1)) : '0';
        }

        if (timeFrac < 1 || !scrollDone) {
          requestAnimationFrame(frame);
        } else {
          buttonAnimating = false;
          if (navbar) navbar.classList.add('visible');
        }
      }
      requestAnimationFrame(frame);
    });
  }

})();
