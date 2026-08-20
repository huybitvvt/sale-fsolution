(() => {
  function postIdFromUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.match(/\/posts\/(\d+)/i)?.[1]
      || raw.match(/[?&](?:story_fbid|fbid)=(\d+)/i)?.[1]
      || raw.match(/\/permalink\/(\d+)/i)?.[1]
      || '';
  }

  function isPostReferenceUrl(value) {
    return Boolean(postIdFromUrl(value));
  }

  globalThis.STREALFacebookPostReference = Object.freeze({
    postIdFromUrl,
    isPostReferenceUrl,
  });
})();
