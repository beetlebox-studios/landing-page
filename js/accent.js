// ── Accent color picker ───────────────────────────────────────────────────────
// Updates --hue on :root from a simple hue slider. Resets to default on reload.

const DEFAULT_HUE = 140;

function hueToHex(hue) {
  const h = ((hue % 360) + 360) % 360;
  const s = 1, l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// ── Favicon recoloring ────────────────────────────────────────────────────────
// Draws beetle_square.png onto a canvas, overlays the accent color using the
// same grayscale + color blend-mode technique as the hero logo CSS mask,
// then sets the favicon href to the resulting data URL.

const FAVICON_SRC = 'https://raw.githubusercontent.com/beetlebox-studios/branding-assets/main/logo/beetle_square.png';
const FAVICON_SIZE = 64;
let _faviconImg = null; // cached Image element

function updateFavicon(hex) {
  const draw = (img) => {
    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext('2d');

    // 1. Fill solid accent color
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);

    // 2. Mask to the image's alpha shape — keeps only pixels where the logo is
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

function applyHue(hue) {
  document.documentElement.style.setProperty('--hue', hue);
  const hex = hueToHex(hue);
  const orb = document.getElementById('accent-orb');
  if (orb) orb.style.background = `linear-gradient(to bottom, ${hueToHex((hue + 20) % 360)}, ${hex})`;
  updateFavicon(hex);
}

(function initAccent() {
  applyHue(DEFAULT_HUE);

  const btn    = document.getElementById('accent-btn');
  const popup  = document.getElementById('accent-popup');
  const slider = document.getElementById('hue-slider');
  const wrap   = document.getElementById('accent-wrap');

  slider.value = DEFAULT_HUE;
  slider.addEventListener('input', () => applyHue(Number(slider.value)));

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
