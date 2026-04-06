// ── Gallery — infinite 3D carousel ────────────────────────────────────────────
//
// Adapted from gradientslider by Clément Grellier
// (https://github.com/clementgrellier/gradientslider, MIT license)
//
// Data driven: loads data/gallery.json  →  { image, description }[]

// ── Configuration ─────────────────────────────────────────────────────────────

const GALLERY_FRICTION    = 0.88;
const GALLERY_DRAG_SENS   = 1.0;
const GALLERY_MAX_ROT     = 22;
const GALLERY_MAX_DEPTH   = 120;
const GALLERY_MIN_SCALE   = 0.90;
const GALLERY_SCALE_RANGE = 0.12;
const GALLERY_GAP         = 24;
const GALLERY_AUTO_SPEED  = 55;   // px/s constant auto-scroll
const GALLERY_ARC_DIP     = 60;   // px cards drop at edges of arc
const GALLERY_ARC_TILT    = 6;    // deg rotateZ tilt at edges

// ── DOM refs ──────────────────────────────────────────────────────────────────

let gStage, gCardsRoot;

// ── State ─────────────────────────────────────────────────────────────────────

let gItems     = [];
let gPositions = null;

let CARD_W     = 260;
let CARD_H     = 340;
let G_STEP     = CARD_W + GALLERY_GAP;
let G_TRACK    = 0;
let G_SCROLL_X = 0;
let G_VW_HALF  = 0;

let gVX       = 0;
let gRafId    = null;
let gLastTime = 0;

// ── Math helpers ──────────────────────────────────────────────────────────────

function gMod(n, m) { return ((n % m) + m) % m; }

// ── Layout & transforms ───────────────────────────────────────────────────────

function gMeasure() {
  const sample = gItems[0]?.el;
  if (!sample) return;
  const r = sample.getBoundingClientRect();
  CARD_W  = r.width  || CARD_W;
  CARD_H  = r.height || CARD_H;
  G_STEP  = CARD_W + GALLERY_GAP;
  G_TRACK = gItems.length * G_STEP;
  gItems.forEach((it, i) => { it.x = i * G_STEP; });
  gPositions = new Float32Array(gItems.length);
}

function gTransformFor(screenX) {
  const norm    = Math.max(-1, Math.min(1, screenX / G_VW_HALF));
  const absNorm = Math.abs(norm);
  const inv     = 1 - absNorm;
  const ry    = -norm * GALLERY_MAX_ROT;
  const tz    = inv  * GALLERY_MAX_DEPTH;
  const scale = GALLERY_MIN_SCALE + inv * GALLERY_SCALE_RANGE;
  const arcY  = absNorm * absNorm * GALLERY_ARC_DIP;
  const rz    = norm * GALLERY_ARC_TILT;
  return {
    transform: `translate3d(${screenX}px,calc(-50% + ${arcY.toFixed(1)}px),${tz}px) rotateY(${ry}deg) rotateZ(${rz.toFixed(2)}deg) scale(${scale})`,
    tz
  };
}

function gUpdateTransforms() {
  const half = G_TRACK / 2;
  let closestIdx = -1, closestDist = Infinity;

  for (let i = 0; i < gItems.length; i++) {
    let pos = gItems[i].x - G_SCROLL_X;
    if (pos < -half) pos += G_TRACK;
    if (pos >  half) pos -= G_TRACK;
    gPositions[i] = pos;
    const dist = Math.abs(pos);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  }

  const prevIdx = (closestIdx - 1 + gItems.length) % gItems.length;
  const nextIdx = (closestIdx + 1) % gItems.length;

  for (let i = 0; i < gItems.length; i++) {
    const it  = gItems[i];
    const pos = gPositions[i];
    const { transform, tz } = gTransformFor(pos);
    it.el.style.transform = transform;
    it.el.style.zIndex    = String(1000 + Math.round(tz));
    const isCore = i === closestIdx || i === prevIdx || i === nextIdx;
    const norm = Math.max(-1, Math.min(1, pos / G_VW_HALF));
    const blur = isCore ? 0 : 2.5 * Math.pow(Math.abs(norm), 1.1);
    it.el.style.filter = blur > 0 ? `blur(${blur.toFixed(2)}px)` : '';
  }
}

// ── Animation loop ────────────────────────────────────────────────────────────

function gTick(t) {
  const dt = gLastTime ? (t - gLastTime) / 1000 : 0;
  gLastTime = t;

  G_SCROLL_X = gMod(G_SCROLL_X + (gVX + GALLERY_AUTO_SPEED) * dt, G_TRACK);

  const decay = Math.pow(GALLERY_FRICTION, dt * 60);
  gVX *= decay;
  if (Math.abs(gVX) < 0.02) gVX = 0;

  gUpdateTransforms();
  gRafId = requestAnimationFrame(gTick);
}

function gStartCarousel() {
  if (gRafId) cancelAnimationFrame(gRafId);
  gLastTime = 0;
  gRafId = requestAnimationFrame(gTick);
}

// ── Card construction ─────────────────────────────────────────────────────────

function gBuildCards(items) {
  gCardsRoot.innerHTML = '';
  gItems = [];

  items.forEach((data, i) => {
    // Outer shell — receives JS 3D transform
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.style.willChange = 'transform';

    // Polaroid frame
    const polaroid = document.createElement('div');
    polaroid.className = 'polaroid';

    // Photo area
    const photoWrap = document.createElement('div');
    photoWrap.className = 'polaroid__photo';

    const img = new Image();
    img.className  = 'polaroid__img';
    img.decoding   = 'async';
    img.loading    = 'eager';
    img.draggable  = false;
    img.src        = data.image;
    img.alt        = data.description || '';
    photoWrap.appendChild(img);

    // Tint overlay (develops away on hover)
    const tint = document.createElement('div');
    tint.className = 'polaroid__tint';
    photoWrap.appendChild(tint);

    polaroid.appendChild(photoWrap);

    // White bottom strip
    const strip = document.createElement('div');
    strip.className = 'polaroid__strip';
    if (data.description) {
      const label = document.createElement('p');
      label.className   = 'polaroid__label';
      label.textContent = data.description;
      strip.appendChild(label);
    }
    polaroid.appendChild(strip);

    card.appendChild(polaroid);
    gCardsRoot.appendChild(card);

    gItems.push({ el: card, img, x: i * G_STEP });
  });

  gPositions = new Float32Array(gItems.length);
}

// ── Input ─────────────────────────────────────────────────────────────────────

function gInitInput() {
  // Only intercept horizontal wheel — let vertical scroll pass through to the page
  gStage.addEventListener('wheel', (e) => {
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!isHorizontal) return; // let the browser handle vertical scroll normally
    e.preventDefault();
    gVX += e.deltaX * 0.5 * 20;
  }, { passive: false });

  gStage.addEventListener('dragstart', e => e.preventDefault());

  let dragging = false, lastX = 0, lastT = 0, lastDelta = 0;

  gStage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // touch handled separately
    dragging = true; lastX = e.clientX; lastT = performance.now(); lastDelta = 0;
    gStage.setPointerCapture(e.pointerId);
  });
  gStage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx  = e.clientX - lastX;
    const dt  = Math.max(1, now - lastT) / 1000;
    G_SCROLL_X = gMod(G_SCROLL_X - dx * GALLERY_DRAG_SENS, G_TRACK);
    lastDelta = dx / dt; lastX = e.clientX; lastT = now;
  });
  gStage.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    gStage.releasePointerCapture(e.pointerId);
    gVX = -lastDelta * GALLERY_DRAG_SENS;
  });

  // Touch: horizontal swipe scrolls carousel, vertical falls through to page
  let touchStartX = 0, touchStartY = 0, touchAxis = null;
  gStage.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchAxis = null;
    lastX = touchStartX; lastT = performance.now(); lastDelta = 0;
  }, { passive: true });
  gStage.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (!touchAxis) touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (touchAxis === 'y') return; // let page scroll
    e.preventDefault();
    const now = performance.now();
    const moveDx = e.touches[0].clientX - lastX;
    const dt = Math.max(1, now - lastT) / 1000;
    G_SCROLL_X = gMod(G_SCROLL_X - moveDx * GALLERY_DRAG_SENS, G_TRACK);
    lastDelta = moveDx / dt; lastX = e.touches[0].clientX; lastT = now;
  }, { passive: false });
  gStage.addEventListener('touchend', () => {
    if (touchAxis === 'x') gVX = -lastDelta * GALLERY_DRAG_SENS;
  }, { passive: true });

  window.addEventListener('resize', () => {
    clearTimeout(gInitInput._rt);
    gInitInput._rt = setTimeout(() => {
      const ratio = G_TRACK ? G_SCROLL_X / G_TRACK : 0;
      gMeasure();
      G_VW_HALF  = gStage.clientWidth * 0.5;
      G_SCROLL_X = gMod(ratio * G_TRACK, G_TRACK);
      gUpdateTransforms();
    }, 80);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (gRafId) { cancelAnimationFrame(gRafId); gRafId = null; }
    } else {
      gStartCarousel();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initGallery() {
  gStage     = document.getElementById('gallery-stage');
  gCardsRoot = document.getElementById('gallery-cards');
  if (!gStage || !gCardsRoot) return;

  let galleryData;
  try {
    const res = await fetch('data/gallery.json');
    galleryData = await res.json();
  } catch (e) {
    console.warn('gallery.js: failed to load data/gallery.json', e);
    return;
  }

  if (!galleryData.length) return;

  G_VW_HALF = gStage.clientWidth * 0.5;
  gBuildCards(galleryData);

  await new Promise(r => requestAnimationFrame(r));
  gMeasure();
  G_TRACK = gItems.length * G_STEP;
  gUpdateTransforms();
  gInitInput();
  gStartCarousel();
}

document.addEventListener('DOMContentLoaded', initGallery);
