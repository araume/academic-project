const tabButtons = document.querySelectorAll('.tab-button');
const forms = document.querySelectorAll('[data-form]');
const switchButtons = document.querySelectorAll('[data-switch]');

function showForm(target) {
  tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.target === target);
  });
  forms.forEach((form) => {
    form.classList.toggle('is-hidden', form.dataset.form !== target);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showForm(button.dataset.target);
  });
});

switchButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showForm(button.dataset.switch);
  });
});

const passwordToggles = document.querySelectorAll('[data-toggle="password"]');
passwordToggles.forEach((toggle) => {
  toggle.addEventListener('change', () => {
    const targetForm = toggle.dataset.target;
    const form = document.querySelector(`[data-form="${targetForm}"]`);
    if (!form) {
      return;
    }
    const passwordInput = form.querySelector('input[name="password"]');
    if (passwordInput) {
      passwordInput.type = toggle.checked ? 'text' : 'password';
    }
  });
});

async function submitForm(form, endpoint) {
  const message = document.querySelector(`[data-message="${form.dataset.form}"]`);
  if (message) {
    message.textContent = '';
  }

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Something went wrong.');
    }

    window.location.href = '/home';
  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }
  }
}

forms.forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const isSignup = form.dataset.form === 'signup';
    submitForm(form, isSignup ? '/api/signup' : '/api/login');
  });
});
