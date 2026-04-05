// ── CardGrid — generalized data-driven card renderer ─────────────────────────
//
// Usage:
//   new CardGrid({ src, target, type })
//
// JSON shape — person:
//   { name, role, bio, image, links: { personal, twitter, github, itch, newgrounds, linkedin } }
//
// JSON shape — game:
//   { title, meta, description, image, credits: ["Name", …], links: { itch, trailer } }
//
// The game card's filter button cross-references the people grid by name.
// Both grids are loaded via a shared registry so they can communicate.

// ── Shared state ─────────────────────────────────────────────────────────────

// Maps grid-id → array of { item, cardEl } after each grid loads.
const GRID_REGISTRY = {};

// Active filter state
let activeFilter    = null;  // game title string, or null for "show all"
let activeFilterBtn = null;  // the DOM button that set the active filter

// ── CardGrid class ────────────────────────────────────────────────────────────

class CardGrid {
  constructor({ src, target, type }) {
    this.src    = src;
    this.target = target;
    this.type   = type;
    this._init();
  }

  async _init() {
    const grid = document.getElementById(this.target);
    if (!grid) return;

    let items;
    try {
      const res = await fetch(this.src);
      items = await res.json();
    } catch (e) {
      console.warn(`CardGrid: failed to load ${this.src}`, e);
      return;
    }

    const def = CARD_TYPES[this.type];
    if (!def) { console.warn(`CardGrid: unknown type "${this.type}"`); return; }

    // Register entries so other grids can look them up
    GRID_REGISTRY[this.target] = [];

    items.forEach((item, i) => {
      const card = def.buildCard(item, i);
      GRID_REGISTRY[this.target].push({ item, card });
      grid.appendChild(card);
    });
  }
}

// ── Filter logic ──────────────────────────────────────────────────────────────

function applyFilter(gameTitle, credits, btn) {
  const peopleEntries = GRID_REGISTRY['people-grid'];
  if (!peopleEntries) return;

  const creditSet = new Set((credits ?? []).map(n => n.toLowerCase()));
  const isFilterOn = !!gameTitle;

  // Reset the previously active button before updating state
  if (activeFilterBtn) {
    activeFilterBtn.classList.remove('game-filter-btn--active');
    activeFilterBtn = null;
  }

  activeFilter = gameTitle ?? null;

  // Mark the new button active (if there is one)
  if (isFilterOn && btn) {
    btn.classList.add('game-filter-btn--active');
    activeFilterBtn = btn;
  }

  const peopleGrid = document.getElementById('people-grid');
  peopleGrid.classList.toggle('people-grid--filtered', isFilterOn);

  peopleEntries.forEach(({ item, card }) => {
    const match = !isFilterOn || creditSet.has(item.name.toLowerCase());
    card.classList.toggle('person-card--hidden', !match);
  });

  updateFilterBanner(gameTitle);

  if (isFilterOn) {
    document.getElementById('people')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateFilterBanner(gameTitle) {
  const existing = document.getElementById('people-filter-banner');

  if (!gameTitle) {
    existing?.remove();
    return;
  }

  const banner = existing ?? (() => {
    const b = el('div', 'people-filter-banner');
    b.id = 'people-filter-banner';
    const section = document.getElementById('people');
    section.querySelector('.section-inner')?.prepend(b);
    return b;
  })();

  banner.innerHTML = '';

  const label = el('span', 'people-filter-label');
  label.textContent = `Filtered: ${gameTitle}`;
  banner.appendChild(label);

  const clearBtn = el('button', 'people-filter-clear');
  clearBtn.setAttribute('aria-label', 'Clear filter');
  clearBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Show all';
  clearBtn.addEventListener('click', () => applyFilter(null, null, null));
  banner.appendChild(clearBtn);
}

// ── Card type definitions ─────────────────────────────────────────────────────

const CARD_TYPES = {

  // ── Person card ─────────────────────────────────────────────────────────────
  person: {
    buildCard(item, i) {
      const card = el('div', 'person-card card-base onload-animation');
      card.style.setProperty('--delay', `${i * 60}ms`);

      // Photo / monogram
      const photoWrap = el('div', 'person-photo-wrap');
      if (item.image) {
        photoWrap.appendChild(makeImg(item.image, item.name, 'person-photo'));
      } else {
        photoWrap.appendChild(monogram(item.name));
      }

      // Hover overlay with link buttons (conditionally rendered)
      const linkDefs = [
        { key: 'personal',   icon: 'fa-solid fa-globe',        label: 'Personal site' },
        { key: 'twitter',    icon: 'fa-brands fa-x-twitter',   label: 'Twitter/X' },
        { key: 'github',     icon: 'fa-brands fa-github',      label: 'GitHub' },
        { key: 'itch',       icon: 'fa-brands fa-itch-io',     label: 'itch.io' },
        { key: 'newgrounds', icon: 'fa-brands fa-newgrounds',  label: 'Newgrounds' },
        { key: 'linkedin',   icon: 'fa-brands fa-linkedin',    label: 'LinkedIn' },
      ];
      const populated = linkDefs.filter(d => item.links?.[d.key]);
      if (populated.length) {
        const overlay = el('div', 'person-overlay');
        populated.forEach(({ key, icon, label }) => {
          const a = el('a', 'person-overlay-btn');
          a.href   = item.links[key];
          a.target = '_blank';
          a.rel    = 'noopener';
          a.setAttribute('aria-label', label);
          a.innerHTML = `<i class="${icon}"></i>`;
          overlay.appendChild(a);
        });
        photoWrap.appendChild(overlay);
      }

      // Info
      const info = el('div', 'person-info');
      info.appendChild(text('p', 'person-name', item.name));
      info.appendChild(text('p', 'person-role', item.role));

      card.appendChild(photoWrap);
      card.appendChild(info);
      return card;
    }
  },

  // ── Game card ────────────────────────────────────────────────────────────────
  game: {
    buildCard(item, i) {
      const card = el('div', 'work-card card-base onload-animation');
      card.style.setProperty('--delay', `${i * 60}ms`);

      // ── Image wrap
      const imgWrap = el('div', 'work-img-wrap');

      // Static thumbnail — always present as the base layer
      if (item.image) {
        imgWrap.appendChild(makeImg(item.image, item.title, 'work-img'));
      }
      imgWrap.appendChild(el('div', 'work-placeholder-bg'));

      // GIF preview — sits above thumbnail, hidden until hover or eye-button tap.
      // src is left empty and only assigned on mouseenter so the GIF
      // starts from frame 1 each time (browsers restart a GIF when src is set).
      // On mouseleave src is cleared, stopping playback and freeing memory.
      let gifEl = null;
      let gifPinnedByBtn = false; // true when user toggled it on via the eye button
      if (item.gif) {
        gifEl = makeImg('', item.title, 'work-gif');
        gifEl.setAttribute('aria-hidden', 'true');
        card.addEventListener('mouseenter', () => { if (!gifPinnedByBtn) gifEl.src = item.gif; });
        card.addEventListener('mouseleave', () => { if (!gifPinnedByBtn) gifEl.src = ''; });
        imgWrap.appendChild(gifEl);
      }

      // ── Overlay buttons (top-right of image): link + filter + gif preview
      const btnWrap = el('div', 'game-img-btns');

      if (item.gif) {
        const eyeBtn = el('button', 'game-img-btn game-gif-btn');
        eyeBtn.setAttribute('aria-label', `Preview ${item.title}`);
        eyeBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        eyeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          gifPinnedByBtn = !gifPinnedByBtn;
          eyeBtn.classList.toggle('game-gif-btn--active', gifPinnedByBtn);
          if (gifPinnedByBtn) {
            gifEl.src = item.gif;
          } else {
            gifEl.src = '';
          }
        });
        btnWrap.appendChild(eyeBtn);
      }

      if (item.links?.link) {
        const linkBtn = el('a', 'game-img-btn');
        linkBtn.href   = item.links.link;
        linkBtn.target = '_blank';
        linkBtn.rel    = 'noopener';
        linkBtn.setAttribute('aria-label', `Play ${item.title}`);
        linkBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
        linkBtn.addEventListener('click', e => e.stopPropagation());
        btnWrap.appendChild(linkBtn);
      }

      if (Array.isArray(item.credits)) {
        const filterBtn = el('button', 'game-img-btn');
        filterBtn.setAttribute('aria-label', `Filter team by ${item.title}`);
        filterBtn.innerHTML = '<i class="fa-solid fa-users"></i>';
        filterBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activeFilter === item.title) {
            applyFilter(null, null, null);
          } else {
            applyFilter(item.title, item.credits, filterBtn);
          }
        });
        btnWrap.appendChild(filterBtn);
      }

      if (btnWrap.children.length) imgWrap.appendChild(btnWrap);

      // ── Info
      const info = el('div', 'work-info');
      info.appendChild(text('p', 'work-title', item.title));
      info.appendChild(text('p', 'work-meta',  item.meta));
      if (item.description) {
        info.appendChild(text('p', 'work-desc', item.description));
      }

      const linkDefs = [
        { key: 'itch',    icon: 'fa-brands fa-itch-io',  label: 'itch.io' },
        { key: 'trailer', icon: 'fa-brands fa-youtube',  label: 'Trailer' },
        { key: 'steam',   icon: 'fa-brands fa-steam',    label: 'Steam' },
        { key: 'github',  icon: 'fa-brands fa-github',   label: 'GitHub' },
      ];
      const linksEl = buildLinks(item.links, linkDefs, 'work-links');
      if (linksEl) info.appendChild(linksEl);

      card.appendChild(imgWrap);
      card.appendChild(info);
      return card;
    }
  },

};

// ── Shared DOM helpers ────────────────────────────────────────────────────────

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function text(tag, className, content) {
  const node = el(tag, className);
  node.textContent = content ?? '';
  return node;
}

function makeImg(src, alt, className) {
  const img = el('img', className);
  img.src     = src;
  img.alt     = alt;
  img.loading = 'lazy';
  return img;
}

function monogram(name) {
  const node = el('div', 'person-monogram');
  node.textContent = (name ?? '?')
    .split(' ')
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return node;
}

function buildLinks(links, defs, className) {
  if (!links) return null;
  const populated = defs.filter(d => links[d.key]);
  if (!populated.length) return null;

  const wrap = el('div', className);
  populated.forEach(({ key, icon, label }) => {
    const a = el('a');
    a.href   = links[key];
    a.target = '_blank';
    a.rel    = 'noopener';
    a.setAttribute('aria-label', label);
    a.innerHTML = `<i class="${icon}"></i>`;
    wrap.appendChild(a);
  });
  return wrap;
}

// ── Game jam card (compact) ───────────────────────────────────────────────────

CARD_TYPES['game-jam'] = {
  buildCard(item, i) {
    const card = el('div', 'jam-card card-base onload-animation');
    card.style.setProperty('--delay', `${i * 40}ms`);

    // Image wrap with optional GIF preview on hover
    const imgWrap = el('div', 'jam-img-wrap');

    if (item.image) {
      imgWrap.appendChild(makeImg(item.image, item.title, 'jam-thumb'));
    }

    if (item.gif) {
      const gifEl = makeImg('', item.title, 'jam-gif');
      gifEl.setAttribute('aria-hidden', 'true');
      card.addEventListener('mouseenter', () => { gifEl.src = item.gif; });
      card.addEventListener('mouseleave', () => { gifEl.src = ''; });
      imgWrap.appendChild(gifEl);
    }

    card.appendChild(imgWrap);

    const info = el('div', 'jam-info');
    info.appendChild(text('p', 'jam-title', item.title));
    info.appendChild(text('p', 'jam-meta',  item.meta));

    if (item.links?.link) {
      const a = el('a', 'jam-link');
      a.href   = item.links.link;
      a.target = '_blank';
      a.rel    = 'noopener';
      a.setAttribute('aria-label', `Play ${item.title}`);
      a.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
      info.appendChild(a);
    }

    card.appendChild(info);
    return card;
  }
};

// ── Split loader — main games vs jam games ────────────────────────────────────

(async () => {
  let items;
  try {
    const res = await fetch('data/games.json');
    items = await res.json();
  } catch (e) {
    console.warn('CardGrid: failed to load games.json', e);
    return;
  }

  const mainGrid = document.getElementById('games-grid');
  const jamGrid  = document.getElementById('jam-grid');
  GRID_REGISTRY['games-grid'] = [];
  GRID_REGISTRY['jam-grid']   = [];

  items.forEach((item, i) => {
    if (item.jam) {
      const card = CARD_TYPES['game-jam'].buildCard(item, i);
      GRID_REGISTRY['jam-grid'].push({ item, card });
      jamGrid?.appendChild(card);
    } else {
      const card = CARD_TYPES['game'].buildCard(item, i);
      GRID_REGISTRY['games-grid'].push({ item, card });
      mainGrid?.appendChild(card);
    }
  });
})();

new CardGrid({ src: 'data/people.json', target: 'people-grid', type: 'person' });
