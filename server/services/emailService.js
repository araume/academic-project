function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
}

function requireNodeMailer() {
  try {
    // Lazy-load so the app can still start if dependency is missing.
    // This route will return a clear error when email is attempted.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('nodemailer');
  } catch (error) {
    throw new Error('Email service dependency missing: install nodemailer.');
  }
}

async function sendVerificationEmail({ to, verifyUrl }) {
  const mode = (process.env.EMAIL_MODE || 'smtp').trim().toLowerCase();
  const from = (process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@thesis.local').trim();
  const subject = 'Verify your Thesis account email';
  const text = `Welcome to Thesis.\n\nVerify your email by opening this link:\n${verifyUrl}\n\nIf you did not create this account, you can ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f2639; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Verify your email</h2>
      <p style="margin-top: 0;">Welcome to Thesis. Confirm that this email belongs to you.</p>
      <p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 8px; background: #0c2e46; color: #fff; text-decoration: none; font-weight: 600;">
          Verify Email
        </a>
      </p>
      <p>If the button does not work, copy and paste this link:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="color: #586978;">If you did not create this account, you can ignore this email.</p>
    </div>
  `;

  if (mode === 'log') {
    console.log(`[Email LOG MODE] Verification email for ${to}: ${verifyUrl}`);
    return { sent: true, mode: 'log', previewUrl: verifyUrl };
  }

  const host = (process.env.EMAIL_HOST || '').trim();
  const port = Number(process.env.EMAIL_PORT || 587);
  const secure = parseBoolean(process.env.EMAIL_SECURE, port === 465);
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = process.env.EMAIL_PASS || '';

  if (!host || !port || !from || !user || !pass) {
    throw new Error('Email SMTP config missing. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, and EMAIL_FROM.');
  }

  const nodemailer = requireNodeMailer();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { sent: true, mode: 'smtp', messageId: info && info.messageId ? info.messageId : null };
}

module.exports = {
  sendVerificationEmail,
};
