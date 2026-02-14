const passwordToggles = document.querySelectorAll('[data-toggle="password"]');
const loginForm = document.querySelector('[data-form="login"]');
const signupForm = document.querySelector('[data-form="signup"]');
const loginMessage = document.querySelector('[data-message="login"]');
const signupMessage = document.querySelector('[data-message="signup"]');

const signupModal = document.getElementById('signupModal');
const openSignupModalButton = document.getElementById('openSignupModal');
const closeSignupModalButton = document.getElementById('closeSignupModal');
const backToLoginButton = document.getElementById('backToLogin');
const signupCourseSelect = document.getElementById('signupCourseSelect');
const resendVerificationButton = document.getElementById('resendVerificationButton');
const openForgotPasswordModalButton = document.getElementById('openForgotPasswordModal');
const forgotPasswordModal = document.getElementById('forgotPasswordModal');
const closeForgotPasswordModalButton = document.getElementById('closeForgotPasswordModal');
const backToLoginFromForgotButton = document.getElementById('backToLoginFromForgot');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const requestResetCodeButton = document.getElementById('requestResetCodeButton');
const verifyResetCodeButton = document.getElementById('verifyResetCodeButton');
const completePasswordResetButton = document.getElementById('completePasswordResetButton');
const resetEmailInput = document.getElementById('resetEmailInput');
const resetCodeInput = document.getElementById('resetCodeInput');
const resetNewPasswordInput = document.getElementById('resetNewPasswordInput');
const resetConfirmPasswordInput = document.getElementById('resetConfirmPasswordInput');
const resetCodeStep = document.getElementById('resetCodeStep');
const resetPasswordStep = document.getElementById('resetPasswordStep');
const forgotPasswordMessage = document.getElementById('forgotPasswordMessage');

let pendingVerificationEmail = '';
const resetFlowState = {
  step: 'request',
  resetToken: '',
};

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

function setMessage(target, text, type = 'error') {
  if (!target) return;
  target.textContent = text || '';
  target.classList.toggle('success', type === 'success');
}

function openSignupModal() {
  if (!signupModal) return;
  signupModal.classList.remove('is-hidden');
  const firstInput = signupModal.querySelector('input[name="email"]');
  if (firstInput) {
    firstInput.focus();
  }
}

function closeSignupModal() {
  if (!signupModal) return;
  signupModal.classList.add('is-hidden');
  setMessage(signupMessage, '');
}

function normalizeResetCode(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function setForgotStep(step) {
  resetFlowState.step = step;
  if (step === 'request') {
    resetCodeStep.classList.add('is-hidden');
    resetPasswordStep.classList.add('is-hidden');
    requestResetCodeButton.classList.remove('is-hidden');
    verifyResetCodeButton.classList.add('is-hidden');
    completePasswordResetButton.classList.add('is-hidden');
    resetFlowState.resetToken = '';
    if (resetCodeInput) resetCodeInput.value = '';
    if (resetNewPasswordInput) resetNewPasswordInput.value = '';
    if (resetConfirmPasswordInput) resetConfirmPasswordInput.value = '';
    return;
  }
  if (step === 'verify') {
    resetCodeStep.classList.remove('is-hidden');
    resetPasswordStep.classList.add('is-hidden');
    requestResetCodeButton.classList.add('is-hidden');
    verifyResetCodeButton.classList.remove('is-hidden');
    completePasswordResetButton.classList.add('is-hidden');
    if (resetNewPasswordInput) resetNewPasswordInput.value = '';
    if (resetConfirmPasswordInput) resetConfirmPasswordInput.value = '';
    return;
  }
  resetCodeStep.classList.remove('is-hidden');
  resetPasswordStep.classList.remove('is-hidden');
  requestResetCodeButton.classList.add('is-hidden');
  verifyResetCodeButton.classList.add('is-hidden');
  completePasswordResetButton.classList.remove('is-hidden');
}

function openForgotPasswordModal() {
  if (!forgotPasswordModal) return;
  setForgotStep('request');
  setMessage(forgotPasswordMessage, '');
  if (resetEmailInput && !resetEmailInput.value) {
    resetEmailInput.value = currentLoginEmail();
  }
  forgotPasswordModal.classList.remove('is-hidden');
  if (resetEmailInput) {
    resetEmailInput.focus();
  }
}

function closeForgotPasswordModal() {
  if (!forgotPasswordModal) return;
  forgotPasswordModal.classList.add('is-hidden');
  setForgotStep('request');
  setMessage(forgotPasswordMessage, '');
}

if (openSignupModalButton) {
  openSignupModalButton.addEventListener('click', openSignupModal);
}

if (closeSignupModalButton) {
  closeSignupModalButton.addEventListener('click', closeSignupModal);
}

if (backToLoginButton) {
  backToLoginButton.addEventListener('click', closeSignupModal);
}

if (openForgotPasswordModalButton) {
  openForgotPasswordModalButton.addEventListener('click', openForgotPasswordModal);
}

if (closeForgotPasswordModalButton) {
  closeForgotPasswordModalButton.addEventListener('click', closeForgotPasswordModal);
}

if (backToLoginFromForgotButton) {
  backToLoginFromForgotButton.addEventListener('click', closeForgotPasswordModal);
}

if (signupModal) {
  signupModal.addEventListener('click', (event) => {
    if (event.target === signupModal) {
      closeSignupModal();
    }
  });
}

if (forgotPasswordModal) {
  forgotPasswordModal.addEventListener('click', (event) => {
    if (event.target === forgotPasswordModal) {
      closeForgotPasswordModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSignupModal();
    closeForgotPasswordModal();
  }
});

passwordToggles.forEach((toggle) => {
  toggle.addEventListener('change', () => {
    const targetForm = toggle.dataset.target;
    const form = document.querySelector(`[data-form="${targetForm}"]`);
    if (!form) return;

    const passwordInput = form.querySelector('input[name="password"]');
    if (passwordInput) {
      passwordInput.type = toggle.checked ? 'text' : 'password';
    }
  });
});

function hideResendButton() {
  if (resendVerificationButton) {
    resendVerificationButton.classList.add('is-hidden');
  }
}

function showResendButton() {
  if (resendVerificationButton) {
    resendVerificationButton.classList.remove('is-hidden');
  }
}

function currentLoginEmail() {
  if (!loginForm) return '';
  const input = loginForm.querySelector('input[name="email"]');
  return input ? String(input.value || '').trim().toLowerCase() : '';
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!loginForm) return;
  setMessage(loginMessage, '');
  hideResendButton();

  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseApiResponse(response);
    if (!response.ok || !data.ok) {
      if (data && data.requiresVerification) {
        pendingVerificationEmail = currentLoginEmail();
        setMessage(loginMessage, data.message || 'Please verify your email before logging in.');
        showResendButton();
        return;
      }
      throw new Error((data && data.message) || 'Login failed.');
    }

    window.location.href = '/home';
  } catch (error) {
    setMessage(loginMessage, error.message || 'Login failed.');
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  if (!signupForm) return;
  setMessage(signupMessage, '');

  const formData = new FormData(signupForm);
  const payload = Object.fromEntries(formData.entries());
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

    pendingVerificationEmail = String(payload.email || '').trim().toLowerCase();
    hideResendButton();
    if (data.emailSent === false) {
      setMessage(
        loginMessage,
        data.message || 'Account created, but verification email was not sent. Use resend verification.',
        'error'
      );
      showResendButton();
    } else {
      setMessage(loginMessage, data.message || 'Verification email sent. Check your inbox.', 'success');
    }

    if (data.devVerificationLink) {
      setMessage(
        loginMessage,
        `${loginMessage.textContent} (Dev link: ${data.devVerificationLink})`,
        'success'
      );
    }

    signupForm.reset();
    closeSignupModal();
  } catch (error) {
    setMessage(signupMessage, error.message || 'Signup failed.');
  }
}

async function resendVerification() {
  const email = pendingVerificationEmail || currentLoginEmail();
  if (!email) {
    setMessage(loginMessage, 'Enter your email first, then try resend verification.');
    return;
  }
  setMessage(loginMessage, 'Sending verification email...', 'success');
  try {
    const response = await fetch('/api/verification/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await parseApiResponse(response);
    if (!response.ok || !data.ok) {
      throw new Error((data && data.message) || 'Unable to resend verification.');
    }
    setMessage(loginMessage, data.message || 'Verification email sent.', 'success');
    if (data.devVerificationLink) {
      setMessage(loginMessage, `${loginMessage.textContent} (Dev link: ${data.devVerificationLink})`, 'success');
    }
  } catch (error) {
    setMessage(loginMessage, error.message || 'Unable to resend verification.');
  }
}

async function requestPasswordResetCode() {
  const email = String((resetEmailInput && resetEmailInput.value) || '').trim().toLowerCase();
  if (!email) {
    setMessage(forgotPasswordMessage, 'Enter your account email first.');
    return;
  }

  setMessage(forgotPasswordMessage, 'Sending reset code...', 'success');
  try {
    const response = await fetch('/api/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await parseApiResponse(response);
    if (!response.ok || !data.ok) {
      throw new Error((data && data.message) || 'Unable to send reset code.');
    }
    if (data.devResetCode) {
      setMessage(forgotPasswordMessage, `Code sent. Dev code: ${data.devResetCode}`, 'success');
    } else {
      setMessage(forgotPasswordMessage, data.message || 'If the account exists, a reset code has been sent.', 'success');
    }
    setForgotStep('verify');
    if (resetCodeInput) {
      resetCodeInput.focus();
    }
  } catch (error) {
    setMessage(forgotPasswordMessage, error.message || 'Unable to send reset code.');
  }
}

async function verifyPasswordResetCode() {
  const email = String((resetEmailInput && resetEmailInput.value) || '').trim().toLowerCase();
  const code = normalizeResetCode(resetCodeInput && resetCodeInput.value);

  if (!email || !code) {
    setMessage(forgotPasswordMessage, 'Enter your email and 6-character code.');
    return;
  }
  if (code.length !== 6) {
    setMessage(forgotPasswordMessage, 'Reset code must be 6 characters.');
    return;
  }

  setMessage(forgotPasswordMessage, 'Verifying code...', 'success');
  try {
    const response = await fetch('/api/password-reset/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await parseApiResponse(response);
    if (!response.ok || !data.ok) {
      throw new Error((data && data.message) || 'Unable to verify code.');
    }
    resetFlowState.resetToken = data.resetToken || '';
    setForgotStep('reset');
    setMessage(forgotPasswordMessage, data.message || 'Code verified. Set your new password.', 'success');
    if (resetNewPasswordInput) {
      resetNewPasswordInput.focus();
    }
  } catch (error) {
    setMessage(forgotPasswordMessage, error.message || 'Unable to verify code.');
  }
}

async function completePasswordReset() {
  const email = String((resetEmailInput && resetEmailInput.value) || '').trim().toLowerCase();
  const newPassword = String((resetNewPasswordInput && resetNewPasswordInput.value) || '');
  const confirmPassword = String((resetConfirmPasswordInput && resetConfirmPasswordInput.value) || '');

  if (!resetFlowState.resetToken) {
    setMessage(forgotPasswordMessage, 'Reset session expired. Request a new code.');
    setForgotStep('request');
    return;
  }
  if (!newPassword || !confirmPassword) {
    setMessage(forgotPasswordMessage, 'Enter and confirm your new password.');
    return;
  }
  if (newPassword.length < 8) {
    setMessage(forgotPasswordMessage, 'New password must be at least 8 characters.');
    return;
  }
  if (newPassword !== confirmPassword) {
    setMessage(forgotPasswordMessage, 'Passwords do not match.');
    return;
  }

  setMessage(forgotPasswordMessage, 'Updating password...', 'success');
  try {
    const response = await fetch('/api/password-reset/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken: resetFlowState.resetToken,
        newPassword,
      }),
    });
    const data = await parseApiResponse(response);
    if (!response.ok || !data.ok) {
      throw new Error((data && data.message) || 'Unable to reset password.');
    }

    if (loginForm) {
      const loginEmailInput = loginForm.querySelector('input[name="email"]');
      if (loginEmailInput) {
        loginEmailInput.value = email;
      }
    }
    setMessage(loginMessage, 'Password reset successful. You can now log in.', 'success');
    setMessage(forgotPasswordMessage, data.message || 'Password updated successfully.', 'success');
    setTimeout(() => {
      closeForgotPasswordModal();
    }, 800);
  } catch (error) {
    setMessage(forgotPasswordMessage, error.message || 'Unable to reset password.');
  }
}

function showVerifyStatusFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const verified = params.get('verified');
  if (!verified) return;

  if (verified === 'success') {
    setMessage(loginMessage, 'Email verified. You can now log in.', 'success');
  } else if (verified === 'expired') {
    setMessage(loginMessage, 'Verification link expired. Please resend verification.');
    showResendButton();
  } else if (verified === 'already') {
    setMessage(loginMessage, 'Email is already verified. You can log in.', 'success');
  } else if (verified === 'invalid') {
    setMessage(loginMessage, 'Invalid verification link.');
  } else if (verified === 'error') {
    setMessage(loginMessage, 'Could not verify email. Please try again.');
  }

  params.delete('verified');
  const query = params.toString();
  const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState({}, '', cleanUrl);
}

if (loginForm) {
  loginForm.addEventListener('submit', handleLoginSubmit);
}

if (signupForm) {
  signupForm.addEventListener('submit', handleSignupSubmit);
}

if (resendVerificationButton) {
  resendVerificationButton.addEventListener('click', resendVerification);
}

if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (resetFlowState.step === 'request') {
      requestPasswordResetCode();
      return;
    }
    if (resetFlowState.step === 'verify') {
      verifyPasswordResetCode();
      return;
    }
    completePasswordReset();
  });
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

    const uniqueCourses = Array.from(new Set(courses));
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

populateCourses();
showVerifyStatusFromQuery();
setForgotStep('request');
