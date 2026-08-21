(() => {
  function postIdFromUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.includes('/my_pending_content') || raw.includes('/pending_posts')) return '';
    return raw.match(/\/posts\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/[?&](?:story_fbid|fbid|multi_permalinks)=(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/\/permalink\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/\/multi_permalinks\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/\/share\/[pvr]\/([a-z0-9_-]+)/i)?.[1]
      || raw.match(/\/(?:reel|videos)\/([a-z0-9_-]+)/i)?.[1]
      || raw.match(/[?&]v=([a-z0-9_-]+)/i)?.[1]
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
