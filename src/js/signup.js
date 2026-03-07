const APP_THEME_STORAGE_KEY = 'thesis.theme';
const APP_THEME_CLASS = 'theme-dark';

const form = document.getElementById('signupWizardForm');
const messageEl = document.getElementById('signupMessage');
const progressBar = document.getElementById('wizardProgressBar');
const stepChips = Array.from(document.querySelectorAll('.step-chip'));
const stepPanels = Array.from(document.querySelectorAll('.wizard-step'));

const step1Back = document.getElementById('step1Back');
const step1Next = document.getElementById('step1Next');
const step2Back = document.getElementById('step2Back');
const step2Next = document.getElementById('step2Next');
const step3Back = document.getElementById('step3Back');
const submitButton = document.getElementById('signupSubmitButton');
const showPasswordToggle = document.getElementById('signupShowPassword');

const signupCourseSelect = document.getElementById('signupCourseSelect');

let currentStep = 1;

function applyStoredThemePreference() {
  try {
    const theme = String(localStorage.getItem(APP_THEME_STORAGE_KEY) || '').trim().toLowerCase();
    if (theme === 'dark') {
      document.body.classList.add(APP_THEME_CLASS);
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.body.classList.remove(APP_THEME_CLASS);
      document.documentElement.style.colorScheme = 'light';
    }
  } catch (error) {
    document.body.classList.remove(APP_THEME_CLASS);
    document.documentElement.style.colorScheme = 'light';
  }
}

async function parseApiResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return {
    ok: false,
    message: text ? text.slice(0, 500) : 'Request failed.',
  };
}

function setMessage(text, type = 'error') {
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.classList.toggle('success', type === 'success');
}

function getStepElement(step) {
  return stepPanels.find((panel) => Number(panel.dataset.step) === Number(step)) || null;
}

function focusFirstField(step) {
  const panel = getStepElement(step);
  if (!panel) return;
  const target = panel.querySelector('input, select, textarea');
  if (target) target.focus();
}

function updateStepUI() {
  stepPanels.forEach((panel) => {
    panel.classList.toggle('is-active', Number(panel.dataset.step) === currentStep);
  });
  stepChips.forEach((chip) => {
    chip.classList.toggle('is-active', Number(chip.dataset.stepIndex) === currentStep);
  });
  if (progressBar) {
    progressBar.style.width = `${(currentStep / 3) * 100}%`;
  }
}

function goToStep(step) {
  const parsed = Number(step);
  if (![1, 2, 3].includes(parsed)) return;
  currentStep = parsed;
  updateStepUI();
  focusFirstField(parsed);
}

function normalizePayload(rawPayload) {
  const payload = { ...rawPayload };
  Object.keys(payload).forEach((key) => {
    if (typeof payload[key] === 'string') {
      payload[key] = payload[key].trim();
    }
  });
  return payload;
}

function getPayload() {
  if (!form) return {};
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  return normalizePayload(payload);
}

function validateStep1(payload) {
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '');
  if (!email || !password) {
    setMessage('Email and password are required.');
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMessage('Please enter a valid email address.');
    return false;
  }
  if (password.length < 8 || password.length > 128) {
    setMessage('Password must be 8 to 128 characters.');
    return false;
  }
  return true;
}

function validateStep2(payload) {
  const course = String(payload.course || '').trim();
  const studentNumber = String(payload.studentNumber || '').trim();
  const professorCode = String(payload.professorCode || '').replace(/\s+/g, '').trim();

  if (!course) {
    setMessage('Course is required.');
    return false;
  }
  if (!studentNumber && !professorCode) {
    setMessage('Provide a student number, or enter a professor one-time code.');
    return false;
  }
  return true;
}

function validateStep3(payload) {
  const gender = String(payload.gender || '').trim();
  const contentPreference = String(payload.contentPreference || '').trim();
  if (!gender) {
    setMessage('Gender is required.');
    return false;
  }
  if (!contentPreference) {
    setMessage('Content preference is required.');
    return false;
  }
  return true;
}

function setSubmitLoading(loading) {
  if (!submitButton) return;
  submitButton.disabled = loading;
  submitButton.textContent = loading ? 'Creating account...' : 'Create account';
}

async function handleSubmit(event) {
  event.preventDefault();
  setMessage('');
  if (!form) return;

  const payload = getPayload();
  if (!validateStep1(payload) || !validateStep2(payload) || !validateStep3(payload)) {
    return;
  }

  setSubmitLoading(true);
  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseApiResponse(response);
    if (!response.ok || !data.ok) {
      throw new Error((data && data.message) || 'Signup failed.');
    }

    let noticeMessage = data.message || 'Account created. Check your email and verify your account before logging in.';
    if (data.devVerificationLink) {
      noticeMessage += ` (Dev link: ${data.devVerificationLink})`;
    }
    const noticePayload = {
      type: data.emailSent === false ? 'error' : 'success',
      message: noticeMessage,
      email: String(payload.email || '').trim().toLowerCase(),
      showResend: true,
    };
    try {
      sessionStorage.setItem('signup.notice', JSON.stringify(noticePayload));
    } catch (error) {
      // ignore storage failures and continue redirect
    }
    window.location.href = '/login';
  } catch (error) {
    setMessage(error.message || 'Signup failed.');
  } finally {
    setSubmitLoading(false);
  }
}

async function populateCourses() {
  if (!signupCourseSelect) return;
  try {
    const response = await fetch('/assets/course-list.txt', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load courses.');
    }
    const text = await response.text();
    const courses = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const uniqueCourses = Array.from(new Set(courses)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    uniqueCourses.forEach((course) => {
      const option = document.createElement('option');
      option.value = course;
      option.textContent = course;
      signupCourseSelect.appendChild(option);
    });
  } catch (error) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Unable to load courses';
    option.disabled = true;
    signupCourseSelect.appendChild(option);
  }
}

if (showPasswordToggle) {
  showPasswordToggle.addEventListener('change', () => {
    if (!form) return;
    const passwordInput = form.querySelector('input[name="password"]');
    if (passwordInput) {
      passwordInput.type = showPasswordToggle.checked ? 'text' : 'password';
    }
  });
}

if (step1Back) {
  step1Back.addEventListener('click', () => {
    window.location.href = '/login';
  });
}

if (step1Next) {
  step1Next.addEventListener('click', () => {
    const payload = getPayload();
    if (!validateStep1(payload)) return;
    setMessage('');
    goToStep(2);
  });
}

if (step2Back) {
  step2Back.addEventListener('click', () => {
    setMessage('');
    goToStep(1);
  });
}

if (step2Next) {
  step2Next.addEventListener('click', () => {
    const payload = getPayload();
    if (!validateStep2(payload)) return;
    setMessage('');
    goToStep(3);
  });
}

if (step3Back) {
  step3Back.addEventListener('click', () => {
    setMessage('');
    goToStep(2);
  });
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}

applyStoredThemePreference();
updateStepUI();
populateCourses();
