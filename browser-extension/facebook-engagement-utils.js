(() => {
  function normalizeText(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(/[\u00a0\u202f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('vi');
  }

  function parseCompactCount(value) {
    let raw = normalizeText(value).replace(/\s+/g, '');
    if (!raw) return null;
    let multiplier = 1;
    const suffixes = [
      { pattern: /(nghìn|ngan|n|k)$/i, value: 1000 },
      { pattern: /(triệu|trieu|tr|m)$/i, value: 1000000 },
    ];
    for (const suffix of suffixes) {
      if (!suffix.pattern.test(raw)) continue;
      multiplier = suffix.value;
      raw = raw.replace(suffix.pattern, '');
      break;
    }
    if (!/^\d[\d.,]*$/.test(raw)) return null;
    let numeric = raw;
    if (multiplier > 1) {
      const lastComma = numeric.lastIndexOf(',');
      const lastDot = numeric.lastIndexOf('.');
      const decimalAt = Math.max(lastComma, lastDot);
      numeric = decimalAt >= 0
        ? `${numeric.slice(0, decimalAt).replace(/[.,]/g, '')}.${numeric.slice(decimalAt + 1)}`
        : numeric;
    } else {
      numeric = numeric.replace(/[.,]/g, '');
    }
    const parsed = Number(numeric);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * multiplier) : null;
  }

  const COUNT = '(\\d[\\d.,]*\\s*(?:k|m|n|tr|nghìn|ngan|triệu|trieu)?)';
  const patterns = {
    reaction_count: [
      new RegExp(`${COUNT}\\s*(?:lượt\\s*)?(?:bày tỏ cảm xúc|cảm xúc|reactions?)`, 'i'),
      new RegExp(`(?:tất cả cảm xúc|all reactions|reactions?)\\s*[:·-]?\\s*${COUNT}`, 'i'),
    ],
    comment_count: [new RegExp(`${COUNT}\\s*(?:bình luận|comments?)`, 'i')],
    share_count: [new RegExp(`${COUNT}\\s*(?:lượt\\s*)?(?:chia sẻ|shares?)`, 'i')],
  };

  function extractEngagementMetrics(values) {
    const result = { reaction_count: null, comment_count: null, share_count: null };
    for (const rawValue of values || []) {
      const text = normalizeText(rawValue);
      if (!text || text.length > 600) continue;
      for (const [key, matchers] of Object.entries(patterns)) {
        for (const matcher of matchers) {
          const match = text.match(matcher);
          if (!match) continue;
          const count = parseCompactCount(match[1]);
          if (count !== null && (result[key] === null || count > result[key])) result[key] = count;
        }
      }
    }
    return result;
  }

  globalThis.STREALFacebookEngagementUtils = Object.freeze({
    normalizeText,
    parseCompactCount,
    extractEngagementMetrics,
  });
})();
