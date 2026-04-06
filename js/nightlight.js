// ── Night-light mode ──────────────────────────────────────────────────────────
// Slider: 0 = off, 1000 = full red tint overlay.
// Creates a fixed full-screen div that applies a red-shift tint via mix-blend-mode.

(function initNightlight() {
  // Create the overlay element once
  const overlay = document.createElement('div');
  overlay.id = 'nightlight-overlay';
  document.body.appendChild(overlay);

  const slider   = document.getElementById('nightlight-slider');
  const resetBtn = document.getElementById('nightlight-reset-btn');
  const btn      = document.getElementById('nightlight-btn');
  const wrap     = document.getElementById('nightlight-wrap');

  function applyNightlight(val) {
    // val 0–1
    const opacity = val * 0.55; // max ~55% tint
    overlay.style.opacity = opacity > 0 ? String(opacity) : '0';
    overlay.style.display = opacity > 0 ? 'block' : 'none';

    // Thumb: gray → red
    const r = Math.round(136 + (255 - 136) * val);
    const g = Math.round(136 * (1 - val));
    const b = Math.round(136 * (1 - val));
    const thumbHex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    slider.style.setProperty('--thumb-color', thumbHex);

    // Icon color: red tint when active
    btn.style.color = val > 0
      ? `rgb(255, ${Math.round(80 * (1 - val))}, 0)`
      : '';
  }

  applyNightlight(0);

  slider.addEventListener('input', () => applyNightlight(Number(slider.value) / 1000));

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    slider.value = 0;
    applyNightlight(0);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !wrap.classList.contains('nightlight-open');
    closeOtherPanels('nightlight-wrap');
    wrap.classList.toggle('nightlight-open', opening);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('nightlight-open');
  });
})();
