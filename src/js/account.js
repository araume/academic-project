const usernameForm = document.getElementById('usernameForm');
const emailForm = document.getElementById('emailForm');
const passwordForm = document.getElementById('passwordForm');
const recoveryForm = document.getElementById('recoveryForm');

const usernameInput = document.getElementById('usernameInput');
const currentEmailInput = document.getElementById('currentEmailInput');
const newEmailInput = document.getElementById('newEmailInput');
const emailCurrentPasswordInput = document.getElementById('emailCurrentPasswordInput');
const passwordCurrentInput = document.getElementById('passwordCurrentInput');
const passwordNewInput = document.getElementById('passwordNewInput');
const passwordConfirmInput = document.getElementById('passwordConfirmInput');
const recoveryEmailInput = document.getElementById('recoveryEmailInput');
const recoveryCurrentPasswordInput = document.getElementById('recoveryCurrentPasswordInput');

const summaryEmail = document.getElementById('summaryEmail');
const summaryRecoveryEmail = document.getElementById('summaryRecoveryEmail');
const emailStatusBadge = document.getElementById('emailStatusBadge');

const usernameMessage = document.getElementById('usernameMessage');
const emailMessage = document.getElementById('emailMessage');
const passwordMessage = document.getElementById('passwordMessage');
const recoveryMessage = document.getElementById('recoveryMessage');
const verificationLinkWrap = document.getElementById('verificationLinkWrap');
const verificationLink = document.getElementById('verificationLink');

function setMessage(target, text, type = 'error') {
  if (!target) return;
  target.textContent = text || '';
  target.classList.toggle('success', type === 'success');
}

function setVerificationLink(url) {
  if (!verificationLinkWrap || !verificationLink) return;
  if (!url) {
    verificationLinkWrap.classList.add('is-hidden');
    verificationLink.href = '#';
    return;
  }
  verificationLink.href = url;
  verificationLinkWrap.classList.remove('is-hidden');
}

function setEmailBadge(isVerified) {
  if (!emailStatusBadge) return;
  emailStatusBadge.classList.remove('status-badge--verified', 'status-badge--pending');
  if (isVerified) {
    emailStatusBadge.classList.add('status-badge--verified');
    emailStatusBadge.textContent = 'Verified';
    return;
  }
  emailStatusBadge.classList.add('status-badge--pending');
  emailStatusBadge.textContent = 'Pending verification';
}

function applyAccount(account) {
  if (usernameInput) {
    usernameInput.value = account.username || '';
  }
  if (currentEmailInput) {
    currentEmailInput.value = account.email || '';
  }
  if (summaryEmail) {
    summaryEmail.textContent = account.email || '-';
  }
  if (recoveryEmailInput) {
    recoveryEmailInput.value = account.recoveryEmail || '';
  }
  if (summaryRecoveryEmail) {
    summaryRecoveryEmail.textContent = account.recoveryEmail || 'Not set';
  }
  setEmailBadge(Boolean(account.emailVerified));
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

async function loadAccount() {
  const data = await apiRequest('/api/account');
  applyAccount(data.account || {});
}

async function handleUsernameSubmit(event) {
  event.preventDefault();
  setMessage(usernameMessage, '');
  const username = usernameInput ? usernameInput.value.trim() : '';
  if (!username) {
    setMessage(usernameMessage, 'Username is required.');
    return;
  }

  try {
    const data = await apiRequest('/api/account/username', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (usernameInput) {
      usernameInput.value = data.username || username;
    }
    setMessage(usernameMessage, data.message || 'Username updated.', 'success');
  } catch (error) {
    setMessage(usernameMessage, error.message);
  }
}

async function handleEmailSubmit(event) {
  event.preventDefault();
  setMessage(emailMessage, '');
  setVerificationLink(null);

  const newEmail = newEmailInput ? newEmailInput.value.trim() : '';
  const currentPassword = emailCurrentPasswordInput ? emailCurrentPasswordInput.value : '';
  if (!newEmail || !currentPassword) {
    setMessage(emailMessage, 'New email and current password are required.');
    return;
  }

  try {
    const data = await apiRequest('/api/account/email', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEmail, currentPassword }),
    });
    const emailMessageType = data.emailSent === false ? 'error' : 'success';
    setMessage(emailMessage, data.message || 'Email updated.', emailMessageType);
    if (newEmailInput) newEmailInput.value = '';
    if (emailCurrentPasswordInput) emailCurrentPasswordInput.value = '';
    if (data.devVerificationLink) {
      setVerificationLink(data.devVerificationLink);
    }
    await loadAccount();
  } catch (error) {
    setMessage(emailMessage, error.message);
  }
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  setMessage(passwordMessage, '');

  const currentPassword = passwordCurrentInput ? passwordCurrentInput.value : '';
  const newPassword = passwordNewInput ? passwordNewInput.value : '';
  const confirmPassword = passwordConfirmInput ? passwordConfirmInput.value : '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    setMessage(passwordMessage, 'Complete all password fields.');
    return;
  }
  if (newPassword !== confirmPassword) {
    setMessage(passwordMessage, 'New password and confirmation do not match.');
    return;
  }

  try {
    const data = await apiRequest('/api/account/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (passwordCurrentInput) passwordCurrentInput.value = '';
    if (passwordNewInput) passwordNewInput.value = '';
    if (passwordConfirmInput) passwordConfirmInput.value = '';
    setMessage(passwordMessage, data.message || 'Password updated.', 'success');
  } catch (error) {
    setMessage(passwordMessage, error.message);
  }
}

async function handleRecoverySubmit(event) {
  event.preventDefault();
  setMessage(recoveryMessage, '');

  const recoveryEmail = recoveryEmailInput ? recoveryEmailInput.value.trim() : '';
  const currentPassword = recoveryCurrentPasswordInput ? recoveryCurrentPasswordInput.value : '';
  if (!currentPassword) {
    setMessage(recoveryMessage, 'Current password is required.');
    return;
  }

  try {
    const data = await apiRequest('/api/account/recovery-email', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoveryEmail, currentPassword }),
    });
    if (recoveryCurrentPasswordInput) recoveryCurrentPasswordInput.value = '';
    if (recoveryEmailInput) recoveryEmailInput.value = data.recoveryEmail || '';
    if (summaryRecoveryEmail) {
      summaryRecoveryEmail.textContent = data.recoveryEmail || 'Not set';
    }
    setMessage(recoveryMessage, data.message || 'Recovery email updated.', 'success');
  } catch (error) {
    setMessage(recoveryMessage, error.message);
  }
}

if (usernameForm) {
  usernameForm.addEventListener('submit', handleUsernameSubmit);
}

if (emailForm) {
  emailForm.addEventListener('submit', handleEmailSubmit);
}

if (passwordForm) {
  passwordForm.addEventListener('submit', handlePasswordSubmit);
}

if (recoveryForm) {
  recoveryForm.addEventListener('submit', handleRecoverySubmit);
}

async function init() {
  try {
    await loadAccount();
  } catch (error) {
    setMessage(emailMessage, error.message);
  }
}

init();
