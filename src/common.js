export const DEFAULT_TARGET_LANG = 'zh-CN';
export const DEFAULT_SOURCE_LANG = 'auto';
const MIN_TRANSLATABLE_LENGTH = 3;

export function normalizeWhitespace(text = '') {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function shouldTranslateText(text = '') {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < MIN_TRANSLATABLE_LENGTH) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(normalized);
}

export function splitForGoogleTranslate(text, maxLength = 1800) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const words = normalized.split(' ');
  const chunks = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      chunks.push(current);
      current = word;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function normalizeGoogleTranslateResponse(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return '';
  }

  return payload[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] ?? '' : ''))
    .join('')
    .trim();
}

export function buildGoogleTranslateUrl(text, targetLang = DEFAULT_TARGET_LANG, sourceLang = DEFAULT_SOURCE_LANG) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLang);
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  return url.toString();
}
