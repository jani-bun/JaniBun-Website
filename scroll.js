/**
 * JANI BUŃKA — Signature scroll reveal
 *
 * Features:
 *  - Sticky-pin hero: wrapper is 280vh tall on desktop, 200vh on mobile
 *  - SVG path draws in as user scrolls through the wrapper, at an EVEN
 *    visual pace (see "Even-paced draw" below) so no part of the
 *    signature whips by faster or slower than the rest
 *  - "Reveal" button triggers a smooth auto-scroll animation through the
 *    full reveal, eased with no abrupt speed changes
 *  - "Keep scrolling" cue appears once signature is complete
 *  - Nav slides in only after the wrapper is fully scrolled past
 *  - Mobile: shorter wrapper, slightly thicker stroke, same draw logic
 */

(function () {
  'use strict';

  /* ── Elements ─────────────────────────────────────────────────── */
  const wrapper    = document.getElementById('heroWrapper');
  const pathEl     = document.querySelector('svg.squiggle path');
  const scrollCue  = document.querySelector('.hero-scroll');
  const revealBtn  = document.getElementById('revealBtn');
  const navbar     = document.getElementById('navbar');

  if (!wrapper || !pathEl) return;

  /* ── Mobile detection ─────────────────────────────────────────── */
  const isMobile = () => window.innerWidth <= 768;

  /* ── Wrapper height: shorter on mobile so the reveal isn't brutal ── */
  function setWrapperHeight () {
    wrapper.style.height = isMobile() ? '200vh' : '280vh';
  }
  setWrapperHeight();
  window.addEventListener('resize', setWrapperHeight, { passive: true });

  /* ── Squiggle stroke width: a touch thicker on mobile only ─────── */
  function setStroke () {
    pathEl.style.strokeWidth = isMobile() ? '22' : '18';
  }
  setStroke();
  window.addEventListener('resize', setStroke, { passive: true });

  /* ── Path length setup ────────────────────────────────────────── */
  const totalLen = pathEl.getTotalLength();
  pathEl.style.strokeDasharray  = totalLen;
  pathEl.style.strokeDashoffset = totalLen; // fully hidden at start

  /* ── Even-paced draw ───────────────────────────────────────────
   * WHY the draw used to feel uneven:
   * The signature is really five separate pen strokes joined by "moveto"
   * jumps (M commands) — one long sweeping initial. and then four small,
   * tight letterform pieces. A signature like this is almost never one
   * smooth continuous line: ~78% of the path's total length belongs to
   * that single opening swash, leaving the four detailed letter pieces
   * sharing the remaining ~22%.
   *
   * strokeDashoffset draws proportionally to raw length, so the swash —
   * most of the length — drew across most of the scroll, while each
   * small letter got a sliver of scroll distance and seemed to "snap"
   * into place. That's the stutter: not a bug in the numbers, but a
   * mismatch between path-length-proportion and how long each stroke
   * should *visually* take to draw.
   *
   * Fix: split the path into its real M-separated subpaths and give each
   * one an EQUAL share of scroll progress, regardless of its length.
   * Within each subpath, draw at a constant rate along that subpath only
   * (so we never measure "speed" across a pen-lift, which isn't a draw
   * speed at all — it's just where the pen moved with the line up).
   */
  const d = pathEl.getAttribute('d') || '';
  // Split into individual subpath "d" strings, each starting with its own M.
  const subpathDs = d
    .split(/(?=[Mm])/)
    .map(s => s.trim())
    .filter(Boolean);

  // Build one offscreen <path> per subpath so we can measure/sample each
  // independently with the browser's own getTotalLength/getPointAtLength —
  // fully precise, no manual curve math needed.
  const svgNS = 'http://www.w3.org/2000/svg';
  const measureSvg = document.createElementNS(svgNS, 'svg');
  measureSvg.style.position = 'absolute';
  measureSvg.style.width = '0';
  measureSvg.style.height = '0';
  measureSvg.style.overflow = 'hidden';
  measureSvg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(measureSvg);

  const subpaths = subpathDs.map(sub => {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', sub);
    measureSvg.appendChild(p);
    const len = p.getTotalLength();
    return { el: p, len };
  }).filter(sp => sp.len > 0); // drop any degenerate/zero-length pieces

  const subCount = subpaths.length || 1;

  // Cumulative arc-length (on the REAL path) where each subpath starts —
  // needed because strokeDashoffset is driven off the full path's total
  // length, not each subpath's own length.
  let runningOffset = 0;
  const subpathArcOffsets = subpaths.map(sp => {
    const offset = runningOffset;
    runningOffset += sp.len;
    return offset;
  });

  /* Given uniform progress p (0–1) across the WHOLE signature, return the
     arc length (in the real path's coordinate system) to use for
     strokeDashoffset, where each subpath gets an equal slice of p and
     draws at a constant rate within that slice. */
  function arcLengthForProgress (p) {
    if (subpaths.length === 0) return p * totalLen;
    let subIndex = Math.floor(p * subCount);
    if (subIndex >= subCount) subIndex = subCount - 1;
    let localT = p * subCount - subIndex;
    if (localT < 0) localT = 0;
    if (localT > 1) localT = 1;
    const sp = subpaths[subIndex];
    return subpathArcOffsets[subIndex] + localT * sp.len;
  }

  /* Gentle smoothstep at the very start/end of the whole draw so it eases
     in and out rather than starting at full speed instantly. Applied
     globally (not per-subpath) so it doesn't reintroduce per-letter
     speed bumps. */
  function smoothstep (t) {
    return t * t * (3 - 2 * t);
  }

  /* ── Core scroll handler ──────────────────────────────────────── */
  function getProgress () {
    const scrolled  = Math.max(-wrapper.getBoundingClientRect().top, 0);
    const maxScroll = wrapper.offsetHeight - window.innerHeight;
    return Math.min(scrolled / maxScroll, 1);
  }

  function applyProgress (progress) {
    /* Draw path — completes at 80% so there's a beat before release.
       Uses the per-subpath even-paced mapping instead of raw arc length. */
    const rawDraw = Math.min(progress / 0.80, 1);
    const eased   = smoothstep(rawDraw);
    const drawnLength = arcLengthForProgress(eased);
    pathEl.style.strokeDashoffset = totalLen - drawnLength;

    /* "Keep scrolling" cue — fades in once drawn, out before release */
    if (scrollCue) {
      const op = progress > 0.82 && progress < 0.96
        ? Math.min((progress - 0.82) / 0.08, 1)
        : progress >= 0.96
          ? Math.max(0, 1 - (progress - 0.96) / 0.04)
          : 0;
      scrollCue.style.opacity = op;
    }

    /* Reveal button — visible at start, hides once user has started scrolling */
    if (revealBtn) {
      revealBtn.style.opacity = progress < 0.05 ? 1 : Math.max(0, 1 - (progress / 0.12));
      revealBtn.style.pointerEvents = progress > 0.08 ? 'none' : 'auto';
    }

    /* Nav — show after wrapper fully scrolled past */
    if (navbar) {
      navbar.classList.toggle('visible', progress >= 1);
    }
  }

  let ticking = false;
  function onScroll () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      applyProgress(getProgress());
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // init

  /* ── Auto-scroll on "Reveal" button click ─────────────────────── */
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      /* Target scroll position = bottom of wrapper (full reveal + release) */
      const targetY = wrapper.offsetTop + wrapper.offsetHeight - window.innerHeight;

      /* Smooth animated scroll — duration scales with distance, and uses
         a single continuous ease for the whole trip so there's no change
         in speed at any point along the way. */
      const startY    = window.scrollY;
      const distance  = targetY - startY;
      const duration  = Math.min(Math.max(Math.abs(distance) / 0.4, 1800), 3200); // ms
      let   startTime = null;
      let   cancelled = false;

      /* Ease in-out sine — gentler and more uniform-feeling than cubic,
         with no inflection point where rate-of-change jumps. */
      function ease (t) {
        return -(Math.cos(Math.PI * t) - 1) / 2;
      }

      /* If the user scrolls/touches manually mid-animation, stop driving
         the scroll position so the two don't fight (a common cause of
         perceived stutter). */
      function cancelOnUserInput () {
        cancelled = true;
      }
      window.addEventListener('wheel', cancelOnUserInput, { passive: true, once: true });
      window.addEventListener('touchmove', cancelOnUserInput, { passive: true, once: true });

      function step (timestamp) {
        if (cancelled) return;
        if (!startTime) startTime = timestamp;
        const elapsed  = timestamp - startTime;
        const fraction = Math.min(elapsed / duration, 1);
        window.scrollTo(0, startY + distance * ease(fraction));
        if (fraction < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    });
  }

})();