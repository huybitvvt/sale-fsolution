(() => {
  function postIdFromUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.match(/\/posts\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/[?&](?:story_fbid|fbid)=(\d+)/i)?.[1]
      || raw.match(/\/permalink\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/\/share\/p\/([a-z0-9_-]+)/i)?.[1]
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
