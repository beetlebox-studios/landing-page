// ── Page search ───────────────────────────────────────────────────────────────
//
// Opens an inline search bar in the navbar. On input:
//   - Clears previous highlights
//   - Walks all visible text nodes (skipping nav, dev panel, scripts)
//   - Wraps every match in <mark class="search-hl">
//   - Marks the first match as search-hl--current and scrolls to it
//   - Shows "N / M" counter
//   - Enter / Shift+Enter cycles through matches
//   - Escape closes and clears

(function () {
  const wrap     = document.getElementById('search-wrap');
  const input    = document.getElementById('search-input');
  const countEl  = document.getElementById('search-count');
  const btn      = document.getElementById('search-btn');

  // Nodes to skip entirely when walking the DOM for text
  const SKIP_SELECTORS = '#navbar, #dev-panel, script, style, noscript, [aria-hidden="true"]';

  let marks = [];     // all current <mark> elements
  let cursor = -1;    // index of the active match

  // ── Open / close ──────────────────────────────────────────────────────────
  function open() {
    wrap.classList.add('open');
    input.focus();
  }

  function close() {
    wrap.classList.remove('open');
    input.value = '';
    clearHighlights();
    countEl.textContent = '';
    cursor = -1;
    input.blur();
  }

  btn.addEventListener('click', () => {
    if (wrap.classList.contains('open')) {
      if (input.value) {
        // If there's a query, cycle to next match on button click
        moveCursor(1);
      } else {
        close();
      }
    } else {
      open();
    }
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      moveCursor(e.shiftKey ? -1 : 1);
    }
  });

  // Global: open with Ctrl+F / Cmd+F only if we handle it
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      open();
    }
    if (e.key === 'Escape' && wrap.classList.contains('open')) {
      close();
    }
  });

  // ── Live search on input ───────────────────────────────────────────────────
  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearHighlights();
    if (!query) { countEl.textContent = ''; cursor = -1; return; }
    highlight(query);
    if (marks.length) {
      cursor = 0;
      activate(0);
      countEl.textContent = `1 / ${marks.length}`;
    } else {
      countEl.textContent = '0';
    }
  });

  // ── Highlight logic ────────────────────────────────────────────────────────
  function highlight(query) {
    const re = new RegExp(escapeRegex(query), 'gi');
    const body = document.body;

    // Collect text nodes outside skipped containers
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Skip if inside a skipped container
          let el = node.parentElement;
          while (el && el !== body) {
            if (el.matches(SKIP_SELECTORS)) return NodeFilter.FILTER_REJECT;
            el = el.parentElement;
          }
          // Skip whitespace-only nodes
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          // Only accept if the text actually matches
          if (!re.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          re.lastIndex = 0;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    // Replace each text node with highlighted fragments
    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (!parent) return;

      const frag = document.createDocumentFragment();
      let last = 0;
      re.lastIndex = 0;
      let m;
      const val = textNode.nodeValue;

      while ((m = re.exec(val)) !== null) {
        // Text before match
        if (m.index > last) {
          frag.appendChild(document.createTextNode(val.slice(last, m.index)));
        }
        // The match wrapped in <mark>
        const mark = document.createElement('mark');
        mark.className = 'search-hl';
        mark.textContent = m[0];
        frag.appendChild(mark);
        marks.push(mark);
        last = re.lastIndex;
      }

      // Remaining text after last match
      if (last < val.length) {
        frag.appendChild(document.createTextNode(val.slice(last)));
      }

      parent.replaceChild(frag, textNode);
    });
  }

  function clearHighlights() {
    // Replace each <mark> with its text content, merging text nodes after
    marks.forEach(mark => {
      if (!mark.parentNode) return;
      mark.replaceWith(mark.textContent);
    });
    // Normalize merges adjacent text nodes produced by replaceWith
    document.body.normalize();
    marks = [];
  }

  // ── Cursor movement ────────────────────────────────────────────────────────
  function moveCursor(dir) {
    if (!marks.length) return;
    cursor = ((cursor + dir) % marks.length + marks.length) % marks.length;
    activate(cursor);
    countEl.textContent = `${cursor + 1} / ${marks.length}`;
  }

  function activate(idx) {
    marks.forEach((m, i) => m.classList.toggle('search-hl--current', i === idx));
    marks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Util ───────────────────────────────────────────────────────────────────
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
})();
