const REPORT_CATEGORIES = Object.freeze([
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
]);

const REPORT_CATEGORY_MAP = new Map(REPORT_CATEGORIES.map((item) => [item.value, item.label]));

function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function normalizeReportCategory(value) {
  const normalized = sanitizeText(value, 64).toLowerCase().replace(/[^a-z0-9_]/g, '');
  return REPORT_CATEGORY_MAP.has(normalized) ? normalized : 'other';
}

function buildReportReason({ category, customReason, details, fallbackReason }) {
  const normalizedCategory = normalizeReportCategory(category);
  const normalizedCustom = sanitizeText(customReason, 220);
  const normalizedDetails = sanitizeText(details, 900);
  const normalizedFallback = sanitizeText(fallbackReason, 900);

  const categoryLabel = REPORT_CATEGORY_MAP.get(normalizedCategory) || REPORT_CATEGORY_MAP.get('other');
  const headline =
    normalizedCategory === 'other' && normalizedCustom ? normalizedCustom : categoryLabel || 'Other';

  const summaryBase = headline ? headline.trim() : '';
  const summary =
    summaryBase && normalizedDetails ? `${summaryBase} - ${normalizedDetails}` : (summaryBase || normalizedDetails);

  if (summary) return summary;
  return normalizedFallback || 'Unspecified report';
}

function parseReportPayload(payload = {}) {
  const category = normalizeReportCategory(payload.category);
  const customReason = sanitizeText(payload.customReason, 220);
  const details = sanitizeText(payload.details, 900);
  const fallbackReason = sanitizeText(payload.reason, 900);
  const reason = buildReportReason({ category, customReason, details, fallbackReason });
  return {
    category,
    customReason,
    details,
    reason,
  };
}

module.exports = {
  REPORT_CATEGORIES,
  parseReportPayload,
  buildReportReason,
  normalizeReportCategory,
};
