(async function injectAdminNavLink() {
  const profileMenu = document.getElementById('profileMenu');
  if (!profileMenu) return;

  try {
    const response = await fetch('/api/admin/me');
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok || data.allowed !== true) {
      return;
    }

    const existing = profileMenu.querySelector('a[href="/admin"]');
    if (existing) return;

    const accountLink = profileMenu.querySelector('a[href="/account"]');
    const link = document.createElement('a');
    link.href = '/admin';
    link.textContent = 'Admin';

    if (accountLink && accountLink.nextSibling) {
      profileMenu.insertBefore(link, accountLink.nextSibling);
    } else if (accountLink) {
      profileMenu.appendChild(link);
    } else {
      profileMenu.insertBefore(link, profileMenu.firstChild);
    }
  } catch (error) {
    // ignore; nav still works for non-admin users
  }
})();
