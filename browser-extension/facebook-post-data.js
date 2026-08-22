(() => {
  const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFE0E\uFE0F\uFEFF]/g;

  function normalize(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(INVISIBLE, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseCountToken(value) {
    const text = normalize(value).toLocaleLowerCase('vi');
    const match = text.match(/(\d[\d.,\s]*)(?:\s*)(nghìn|nghin|triệu|trieu|tr|k|m|b)?/i);
    if (!match) return null;
    const suffix = String(match[2] || '').toLocaleLowerCase('vi');
    const raw = match[1].replace(/\s+/g, '');
    if (!suffix) {
      const integer = Number(raw.replace(/[.,]/g, ''));
      return Number.isFinite(integer) ? Math.max(0, Math.round(integer)) : null;
    }
    const decimal = Number(raw.replace(',', '.').replace(/\.(?=.*\.)/g, ''));
    if (!Number.isFinite(decimal)) return null;
    const multiplier = ['k', 'nghìn', 'nghin'].includes(suffix)
      ? 1_000
      : ['m', 'triệu', 'trieu', 'tr'].includes(suffix) ? 1_000_000 : 1_000_000_000;
    return Math.max(0, Math.round(decimal * multiplier));
  }

  function metricFromText(text, patterns) {
    const normalized = normalize(text);
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) return parseCountToken(match[1]);
    }
    return null;
  }

  function extractMetricCounts(values) {
    const texts = (Array.isArray(values) ? values : [values]).map(normalize).filter(Boolean);
    let reactionCount = null;
    let commentCount = null;
    let shareCount = null;
    for (const text of texts) {
      if (reactionCount === null) {
        reactionCount = metricFromText(text, [
          /(\d[\d.,\s]*(?:k|m|b|nghìn|nghin|triệu|trieu|tr)?)\s*(?:người\s*)?(?:đã\s*)?(?:bày tỏ cảm xúc|cảm xúc)/i,
          /(\d[\d.,\s]*(?:k|m|b)?)\s*reactions?/i,
          /(?:bày tỏ cảm xúc|cảm xúc|reactions?|yêu thích|love)\s*[:·-]?\s*(\d[\d.,\s]*(?:k|m|b|nghìn|nghin|triệu|trieu|tr)?)/i,
          /(?:xem ai đã bày tỏ cảm xúc|see who reacted)[^\d]*(\d[\d.,\s]*(?:k|m|b)?)/i,
        ]);
      }
      if (commentCount === null) {
        commentCount = metricFromText(text, [
          /(\d[\d.,\s]*(?:k|m|b|nghìn|nghin|triệu|trieu|tr)?)\s*(?:lượt\s*)?bình luận/i,
          /(\d[\d.,\s]*(?:k|m|b)?)\s*comments?/i,
        ]);
      }
      if (shareCount === null) {
        shareCount = metricFromText(text, [
          /(\d[\d.,\s]*(?:k|m|b|nghìn|nghin|triệu|trieu|tr)?)\s*(?:lượt\s*)?chia sẻ/i,
          /(\d[\d.,\s]*(?:k|m|b)?)\s*shares?/i,
        ]);
      }
    }
    return { reactionCount, commentCount, shareCount };
  }

  globalThis.STREALFacebookPostData = Object.freeze({
    normalize,
    parseCountToken,
    extractMetricCounts,
  });
})();
