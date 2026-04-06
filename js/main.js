// main.js — shared utilities

// Close all navbar panels except the one with the given id
function closeOtherPanels(exceptId) {
  if (exceptId !== 'lang-wrap')        document.getElementById('lang-wrap')?.classList.remove('lang-open');
  if (exceptId !== 'accent-wrap')      document.getElementById('accent-wrap')?.classList.remove('accent-open');

  if (exceptId !== 'search-wrap') {
    const sw = document.getElementById('search-wrap');
    if (sw?.classList.contains('open')) {
      sw.classList.remove('open');
      const input = document.getElementById('search-input');
      if (input) { input.value = ''; input.blur(); }
      const countEl = document.getElementById('search-count');
      if (countEl) countEl.textContent = '';
    }
  }
}
