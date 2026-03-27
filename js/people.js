// ── People section — loads from people.json ───────────────────────────────────
//
// Data shape (people.json):
// [{ name, role, bio, image, links: { twitter, github, itch } }]
//
// Images are grayscaled + tinted with the accent color via CSS filter.
// Hovering a card removes the filter, revealing the natural photo.

(async function () {
  const grid = document.getElementById('people-grid');
  if (!grid) return;

  let people;
  try {
    const res = await fetch('people.json');
    people = await res.json();
  } catch (e) {
    console.warn('people.json failed to load:', e);
    return;
  }

  people.forEach((person, i) => {
    const card = document.createElement('div');
    card.className = 'person-card card-base onload-animation';
    card.style.setProperty('--delay', `${i * 60}ms`);

    // ── Photo
    const photoWrap = document.createElement('div');
    photoWrap.className = 'person-photo-wrap';

    if (person.image) {
      const img = document.createElement('img');
      img.className = 'person-photo';
      img.src = person.image;
      img.alt = person.name;
      img.loading = 'lazy';
      photoWrap.appendChild(img);
    } else {
      // Placeholder monogram
      const mono = document.createElement('div');
      mono.className = 'person-monogram';
      mono.textContent = person.name
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      photoWrap.appendChild(mono);
    }

    // ── Info
    const info = document.createElement('div');
    info.className = 'person-info';

    const nameEl = document.createElement('p');
    nameEl.className = 'person-name';
    nameEl.textContent = person.name;

    const roleEl = document.createElement('p');
    roleEl.className = 'person-role';
    roleEl.textContent = person.role;

    const bioEl = document.createElement('p');
    bioEl.className = 'person-bio';
    bioEl.textContent = person.bio;

    info.appendChild(nameEl);
    info.appendChild(roleEl);
    info.appendChild(bioEl);

    // ── Social links
    const socials = [];
    if (person.links?.twitter) socials.push({ href: person.links.twitter, icon: 'fa-brands fa-x-twitter', label: 'Twitter/X' });
    if (person.links?.github)  socials.push({ href: person.links.github,  icon: 'fa-brands fa-github',    label: 'GitHub' });
    if (person.links?.itch)    socials.push({ href: person.links.itch,    icon: 'fa-brands fa-itch-io',   label: 'itch.io' });

    if (socials.length) {
      const linksEl = document.createElement('div');
      linksEl.className = 'person-links';
      socials.forEach(({ href, icon, label }) => {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', label);
        a.innerHTML = `<i class="${icon}"></i>`;
        linksEl.appendChild(a);
      });
      info.appendChild(linksEl);
    }

    card.appendChild(photoWrap);
    card.appendChild(info);
    grid.appendChild(card);
  });
})();
