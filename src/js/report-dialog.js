(function setupReportDialog() {
  if (window.showReportDialog) return;

  const categories = [
    { value: 'spam', label: 'Spam or misleading' },
    { value: 'fraud', label: 'Fraud or scam' },
    { value: 'impersonation', label: 'Impersonation' },
    { value: 'false_info', label: 'False information' },
    { value: 'harassment', label: 'Harassment or bullying' },
    { value: 'hate_speech', label: 'Hate speech' },
    { value: 'sexual_content', label: 'Sexual content' },
    { value: 'violence', label: 'Violence or threat' },
    { value: 'copyright', label: 'Copyright or IP violation' },
    { value: 'illegal_activity', label: 'Illegal activity' },
    { value: 'other', label: 'Other' },
  ];

  const categoryMap = new Map(categories.map((item) => [item.value, item.label]));
  let modal = null;
  let resolver = null;

  function ensureStyles() {
    if (document.getElementById('reportDialogStyles')) return;
    const style = document.createElement('style');
    style.id = 'reportDialogStyles';
    style.textContent = `
      .report-dialog-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(10, 14, 18, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        z-index: 9999;
      }
      .report-dialog-backdrop.is-hidden {
        display: none;
      }
      .report-dialog-card {
        width: min(540px, 96vw);
        background: var(--surface, #ffffff);
        color: var(--text, #1f2f3d);
        border-radius: 14px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 24px 56px rgba(0, 0, 0, 0.26);
        padding: 18px;
      }
      .report-dialog-card h3 {
        margin: 0 0 6px;
        font-size: 1.04rem;
      }
      .report-dialog-subtitle {
        margin: 0 0 14px;
        color: var(--muted, #627585);
        font-size: 0.9rem;
      }
      .report-dialog-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }
      .report-dialog-field label {
        font-size: 0.82rem;
        font-weight: 600;
      }
      .report-dialog-field select,
      .report-dialog-field input,
      .report-dialog-field textarea {
        width: 100%;
        border: 1px solid rgba(89, 103, 118, 0.35);
        border-radius: 10px;
        padding: 10px 11px;
        font: inherit;
        background: var(--surface-soft, rgba(255, 255, 255, 0.8));
        color: inherit;
      }
      .report-dialog-field textarea {
        min-height: 88px;
        resize: vertical;
      }
      .report-dialog-field.is-hidden {
        display: none;
      }
      .report-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 2px;
      }
      .report-dialog-actions button {
        border-radius: 10px;
        border: 1px solid rgba(89, 103, 118, 0.28);
        padding: 9px 14px;
        font: inherit;
        font-size: 0.86rem;
        cursor: pointer;
      }
      .report-dialog-cancel {
        background: transparent;
        color: inherit;
      }
      .report-dialog-submit {
        background: var(--accent, #da9b2b);
        border-color: var(--accent, #da9b2b);
        color: #1b1f24;
        font-weight: 600;
      }
      .report-dialog-error {
        min-height: 16px;
        margin: 4px 0 0;
        color: #b3372d;
        font-size: 0.8rem;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'report-dialog-backdrop is-hidden';
    modal.innerHTML = `
      <div class="report-dialog-card" role="dialog" aria-modal="true" aria-label="Report content">
        <h3 id="reportDialogTitle">Report content</h3>
        <p class="report-dialog-subtitle" id="reportDialogSubtitle">Tell us what happened.</p>
        <div class="report-dialog-field">
          <label for="reportDialogCategory">Reason</label>
          <select id="reportDialogCategory">
            ${categories
              .map((item) => `<option value="${item.value}">${item.label}</option>`)
              .join('')}
          </select>
        </div>
        <div class="report-dialog-field is-hidden" id="reportDialogCustomWrap">
          <label for="reportDialogCustom">Custom reason</label>
          <input id="reportDialogCustom" type="text" maxlength="220" placeholder="Write your custom reason" />
        </div>
        <div class="report-dialog-field">
          <label for="reportDialogDetails">Additional details (optional)</label>
          <textarea id="reportDialogDetails" maxlength="900" placeholder="Add context that helps review this report."></textarea>
        </div>
        <p class="report-dialog-error" id="reportDialogError"></p>
        <div class="report-dialog-actions">
          <button type="button" class="report-dialog-cancel" id="reportDialogCancel">Cancel</button>
          <button type="button" class="report-dialog-submit" id="reportDialogSubmit">Submit report</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const categoryInput = modal.querySelector('#reportDialogCategory');
    const customWrap = modal.querySelector('#reportDialogCustomWrap');
    const cancelButton = modal.querySelector('#reportDialogCancel');
    const submitButton = modal.querySelector('#reportDialogSubmit');

    categoryInput.addEventListener('change', () => {
      customWrap.classList.toggle('is-hidden', categoryInput.value !== 'other');
    });

    cancelButton.addEventListener('click', () => {
      closeDialog(null);
    });
    submitButton.addEventListener('click', () => {
      submitDialog();
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeDialog(null);
      }
    });
  }

  function closeDialog(payload) {
    if (!modal) return;
    modal.classList.add('is-hidden');
    const activeResolver = resolver;
    resolver = null;
    if (activeResolver) {
      activeResolver(payload);
    }
  }

  function submitDialog() {
    if (!modal || !resolver) return;
    const categoryInput = modal.querySelector('#reportDialogCategory');
    const customInput = modal.querySelector('#reportDialogCustom');
    const detailsInput = modal.querySelector('#reportDialogDetails');
    const errorEl = modal.querySelector('#reportDialogError');

    const category = String(categoryInput.value || 'other').trim();
    const customReason = String(customInput.value || '').trim();
    const details = String(detailsInput.value || '').trim();
    if (category === 'other' && !customReason) {
      errorEl.textContent = 'Enter a custom reason for "Other".';
      customInput.focus();
      return;
    }

    const baseLabel = category === 'other' ? customReason : (categoryMap.get(category) || 'Other');
    const reason = details ? `${baseLabel} - ${details}` : baseLabel;
    closeDialog({
      category,
      customReason: customReason || null,
      details: details || null,
      reason,
    });
  }

  window.showReportDialog = function showReportDialog(options) {
    ensureStyles();
    ensureModal();
    const settings = options || {};
    const titleEl = modal.querySelector('#reportDialogTitle');
    const subtitleEl = modal.querySelector('#reportDialogSubtitle');
    const categoryInput = modal.querySelector('#reportDialogCategory');
    const customInput = modal.querySelector('#reportDialogCustom');
    const customWrap = modal.querySelector('#reportDialogCustomWrap');
    const detailsInput = modal.querySelector('#reportDialogDetails');
    const errorEl = modal.querySelector('#reportDialogError');

    titleEl.textContent = settings.title || 'Report content';
    subtitleEl.textContent = settings.subtitle || 'Tell us what happened.';
    categoryInput.value = 'spam';
    customInput.value = '';
    detailsInput.value = '';
    errorEl.textContent = '';
    customWrap.classList.add('is-hidden');

    modal.classList.remove('is-hidden');
    categoryInput.focus();

    return new Promise((resolve) => {
      resolver = resolve;
    });
  };
})();
