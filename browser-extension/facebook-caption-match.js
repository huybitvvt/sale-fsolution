(() => {
  const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFE0E\uFE0F\uFEFF]/g;

  function normalizeCaptionText(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(INVISIBLE_CHARACTERS, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactCaptionText(value) {
    return normalizeCaptionText(value).replace(/\s+/g, '');
  }

  function containsOnce(actual, expected) {
    const first = actual.indexOf(expected);
    return first >= 0 && first === actual.lastIndexOf(expected);
  }

  function textMatches(actualValue, expectedValue) {
    const actual = normalizeCaptionText(actualValue);
    const expected = normalizeCaptionText(expectedValue);
    if (!actual || !expected) return false;
    if (actual === expected || containsOnce(actual, expected)) return true;

    // Facebook Lexical can rebuild paragraphs and insert zero-width characters,
    // causing innerText to lose whitespace at DOM boundaries. Compare a compact
    // representation while still rejecting duplicated or missing text.
    const actualCompact = compactCaptionText(actual);
    const expectedCompact = compactCaptionText(expected);
    return containsOnce(actualCompact, expectedCompact);
  }

  function removeRepeatedTrailingLines(value) {
    let lines = String(value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => normalizeCaptionText(line))
      .filter(Boolean);
    let changed = true;
    while (changed && lines.length >= 2) {
      changed = false;
      for (let size = 1; size <= Math.floor(lines.length / 2); size += 1) {
        const tail = lines.slice(-size).join('\n').toLocaleLowerCase('vi');
        const previous = lines.slice(-size * 2, -size).join('\n').toLocaleLowerCase('vi');
        if (tail !== previous) continue;
        lines = lines.slice(0, -size);
        changed = true;
        break;
      }
    }
    return lines.join('\n');
  }

  function textOrSignatureMatchesOne(actualValue, expectedValue, allowContainedShort) {
    const actual = compactCaptionText(actualValue).toLocaleLowerCase('vi');
    const expected = compactCaptionText(expectedValue).toLocaleLowerCase('vi');
    if (!actual || !expected) return false;
    // A short phrase is too easy to confuse with another search result. It is
    // only safe when the visible text is exactly that phrase.
    if (expected.length < 36) return actual === expected || (allowContainedShort && containsOnce(actual, expected));
    if (textMatches(actualValue, expectedValue)) return true;
    const signature = expected.slice(0, Math.min(72, expected.length));
    return actual.includes(signature);
  }

  function textOrSignatureMatches(actualValue, expectedValue, allowContainedShort = false) {
    const deduped = removeRepeatedTrailingLines(expectedValue);
    return [expectedValue, deduped]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .some((value) => textOrSignatureMatchesOne(actualValue, value, allowContainedShort));
  }

  globalThis.STREALFacebookCaptionMatcher = Object.freeze({
    normalizeCaptionText,
    removeRepeatedTrailingLines,
    textMatches,
    textOrSignatureMatches,
  });
})();
