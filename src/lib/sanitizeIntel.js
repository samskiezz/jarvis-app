const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const ADDRESS_RE = /\b\d{1,5}\s+[\w\s]{1,40}\b(?:st|street|rd|road|ave|avenue|blvd|lane|ln|dr|drive|way)\b/gi;
const SECRET_KEYS = /pass(word)?|token|secret|api[-_]?key|private|credential/i;

export function sanitizeIntelPayload(payload) {
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !SECRET_KEYS.test(key))
          .map(([key, val]) => [key, walk(val)])
      );
    }
    if (typeof value === 'string') {
      return value
        .replace(EMAIL_RE, '[REDACTED_EMAIL]')
        .replace(PHONE_RE, '[REDACTED_PHONE]')
        .replace(ADDRESS_RE, '[REDACTED_ADDRESS]');
    }
    return value;
  };

  return walk(payload);
}
