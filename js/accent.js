// ── Accent color picker ───────────────────────────────────────────────────────
// Slider goes: white (0) → default green (0.5) → visible gray (1)
// Instead of shifting --hue, we interpolate --primary directly.

const DEFAULT_VAL = 0.5; // center = green

// Three anchor colors in oklch(L C H) notation
const STOPS = [
  { l: 0.96, c: 0.00, h: 140 },   // white-ish
  { l: 0.75, c: 0.18, h: 140 },   // default green
  { l: 0.48, c: 0.03, h: 140 },   // visible gray (same hue family, low chroma)
];

function lerpStop(t) {
  // t is 0–1; map to two-segment piecewise between the three stops
  if (t <= 0.5) {
    const s = t / 0.5;
    const a = STOPS[0], b = STOPS[1];
    return {
      l: a.l + (b.l - a.l) * s,
      c: a.c + (b.c - a.c) * s,
      h: a.h,
    };
  } else {
    const s = (t - 0.5) / 0.5;
    const a = STOPS[1], b = STOPS[2];
    return {
      l: a.l + (b.l - a.l) * s,
      c: a.c + (b.c - a.c) * s,
      h: a.h,
    };
  }
}

function oklchToHex({ l, c, h }) {
  // Convert oklch → linear-light sRGB → gamma sRGB → hex
  const hRad = h * Math.PI / 180;
  const a_ = c * Math.cos(hRad);
  const b_ = c * Math.sin(hRad);

  // OKLab → XYZ (D65)
  const L_ = l + 0.3963377774 * a_ + 0.2158037573 * b_;
  const M_ = l - 0.1055613458 * a_ - 0.0638541728 * b_;
  const S_ = l - 0.0894841775 * a_ - 1.2914855480 * b_;

  const L3 = L_ * L_ * L_;
  const M3 = M_ * M_ * M_;
  const S3 = S_ * S_ * S_;

  let r =  4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3;
  let g = -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3;
  let b = -0.0041960863 * L3 - 0.7034186147 * M3 + 1.7076147010 * S3;

  // Gamma encode
  const gamma = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
  r = Math.round(Math.min(Math.max(gamma(r), 0), 1) * 255);
  g = Math.round(Math.min(Math.max(gamma(g), 0), 1) * 255);
  b = Math.round(Math.min(Math.max(gamma(b), 0), 1) * 255);

  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ── Favicon recoloring ────────────────────────────────────────────────────────

const FAVICON_SRC  = 'https://raw.githubusercontent.com/beetlebox-studios/branding-assets/main/logo/beetle_square.png';
const FAVICON_SIZE = 64;
let _faviconImg    = null;

function updateFavicon(hex) {
  const draw = (img) => {
    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
    ctx.globalCompositeOperation = 'source-over';
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = canvas.toDataURL('image/png');
  };

  if (_faviconImg?.complete && _faviconImg.naturalWidth) {
    draw(_faviconImg);
  } else {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _faviconImg = img; draw(img); };
    img.src = FAVICON_SRC;
  }
}

function applyVal(val) {
  const { l, c, h } = lerpStop(val);
  const oklchStr = `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h})`;
  document.documentElement.style.setProperty('--primary', oklchStr);

  // --primary-dim: slightly lower lightness
  const dimStr = `oklch(${(l * 0.88).toFixed(4)} ${(c * 0.80).toFixed(4)} ${h})`;
  document.documentElement.style.setProperty('--primary-dim', dimStr);

  const hex = oklchToHex({ l, c, h });

  // Update slider thumb color
  const slider = document.getElementById('hue-slider');
  if (slider) slider.style.setProperty('--thumb-color', hex);

  const orb = document.getElementById('accent-orb');
  if (orb) orb.style.background = hex;
  updateFavicon(hex);
}

(function initAccent() {
  applyVal(DEFAULT_VAL);

  const btn       = document.getElementById('accent-btn');
  const slider    = document.getElementById('hue-slider');
  const wrap      = document.getElementById('accent-wrap');
  const resetBtn  = document.getElementById('accent-reset-btn');

  slider.min   = 0;
  slider.max   = 1000;
  slider.step  = 1;
  slider.value = DEFAULT_VAL * 1000;
  slider.addEventListener('input', () => applyVal(Number(slider.value) / 1000));

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    slider.value = DEFAULT_VAL * 1000;
    applyVal(DEFAULT_VAL);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !wrap.classList.contains('accent-open');
    closeOtherPanels('accent-wrap');
    wrap.classList.toggle('accent-open', opening);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('accent-open');
  });
})();
