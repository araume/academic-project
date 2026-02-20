const sitePageRoot = document.getElementById('sitePageRoot');
const sitePageSlug = document.body && document.body.dataset ? document.body.dataset.pageSlug : '';

function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function renderHero(root, page) {
  const hero = createElement('section', 'hero-card');
  const label = createElement('p', 'hero-label', page.slug === 'faq' ? 'Help Center' : 'About');
  const title = createElement('h1', 'hero-title', page.title || '');
  const subtitle = createElement('p', 'hero-subtitle', page.subtitle || '');
  hero.appendChild(label);
  hero.appendChild(title);
  hero.appendChild(subtitle);
  root.appendChild(hero);
}

function renderAbout(root, page) {
  const body = page.body || {};
  const grid = createElement('section', 'content-grid');

  const left = createElement('article', 'content-card');
  left.appendChild(createElement('h2', 'section-title', 'Overview'));
  left.appendChild(
    createElement(
      'p',
      'section-copy',
      body.overview || 'No overview has been published yet.'
    )
  );

  const right = createElement('article', 'content-card');
  right.appendChild(createElement('h2', 'section-title', 'What You Can Expect'));
  const highlights = Array.isArray(body.highlights) ? body.highlights : [];
  const commitments = Array.isArray(body.commitments) ? body.commitments : [];

  const highlightTitle = createElement('p', 'hero-label', 'Highlights');
  const highlightList = createElement('ul', 'chip-list');
  (highlights.length ? highlights : ['Highlights have not been configured yet.']).forEach((item) => {
    highlightList.appendChild(createElement('li', '', item));
  });

  const commitmentTitle = createElement('p', 'hero-label', 'Commitments');
  const commitmentList = createElement('ul', 'chip-list');
  (commitments.length ? commitments : ['Commitments have not been configured yet.']).forEach((item) => {
    commitmentList.appendChild(createElement('li', '', item));
  });

  right.appendChild(highlightTitle);
  right.appendChild(highlightList);
  right.appendChild(commitmentTitle);
  right.appendChild(commitmentList);

  if (body.contactEmail) {
    const contact = createElement('p', 'contact-chip');
    const link = createElement('a', '', body.contactEmail);
    link.href = `mailto:${body.contactEmail}`;
    contact.appendChild(link);
    right.appendChild(contact);
  }

  grid.appendChild(left);
  grid.appendChild(right);
  root.appendChild(grid);
}

function renderFaq(root, page) {
  const body = page.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const card = createElement('section', 'content-card');
  card.appendChild(createElement('h2', 'section-title', 'Questions and Answers'));

  const list = createElement('div', 'faq-list');
  if (!items.length) {
    list.appendChild(createElement('p', 'empty-state', 'No FAQ items have been published yet.'));
  } else {
    items.forEach((item) => {
      const details = createElement('details', 'faq-item');
      const summary = createElement('summary', '', item.question || '');
      const answer = createElement('p', 'faq-answer', item.answer || '');
      details.appendChild(summary);
      details.appendChild(answer);
      list.appendChild(details);
    });
  }

  card.appendChild(list);
  root.appendChild(card);
}

async function loadSitePage() {
  if (!sitePageRoot || !sitePageSlug) return;
  clearElement(sitePageRoot);
  sitePageRoot.appendChild(createElement('p', 'loading-state', 'Loading content...'));

  try {
    const response = await fetch(`/api/site-pages/${encodeURIComponent(sitePageSlug)}`);
    const data = await response.json();
    if (!response.ok || !data.ok || !data.page) {
      throw new Error(data.message || 'Unable to load page.');
    }

    const page = data.page;
    clearElement(sitePageRoot);
    document.title = page.slug === 'faq' ? 'FAQ' : 'About';
    renderHero(sitePageRoot, page);

    if (page.slug === 'faq') {
      renderFaq(sitePageRoot, page);
    } else {
      renderAbout(sitePageRoot, page);
    }
  } catch (error) {
    clearElement(sitePageRoot);
    sitePageRoot.appendChild(
      createElement('p', 'error-state', error.message || 'Unable to load content.')
    );
  }
}

loadSitePage();
