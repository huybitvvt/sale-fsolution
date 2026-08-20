(() => {
  const CANDIDATE_RE = /(?<!\d)(?:(?:\+|00)?84|0)(?:[\s.\-()]?\d){8,10}(?!\d)/g;
  const MOBILE_RE = /^0(?:3|5|7|8|9)\d{8}$/;
  const LANDLINE_RE = /^02\d{8,9}$/;

  function normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('0084')) digits = `0${digits.slice(4)}`;
    else if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
    return MOBILE_RE.test(digits) || LANDLINE_RE.test(digits) ? digits : '';
  }

  function extractPhones(text) {
    const seen = new Set();
    const result = [];
    for (const match of String(text || '').matchAll(CANDIDATE_RE)) {
      const phone = normalizePhone(match[0]);
      if (phone && !seen.has(phone)) {
        seen.add(phone);
        result.push(phone);
      }
    }
    return result;
  }

  globalThis.STREALFacebookPhoneUtils = Object.freeze({ normalizePhone, extractPhones });
})();
