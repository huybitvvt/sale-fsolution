(() => {
  const CONTROL_SOURCE = 'streal-facebook-content';
  const CAPTURE_SOURCE = 'streal-facebook-main';
  const START_TYPE = 'STREAL_FACEBOOK_POST_CAPTURE_START';
  const STOP_TYPE = 'STREAL_FACEBOOK_POST_CAPTURE_STOP';
  const RESULT_TYPE = 'STREAL_FACEBOOK_POST_REFERENCE_CAPTURED';
  const GRAPHQL_PATH = /\/(?:api\/)?graphql(?:batch)?\/?/i;

  function cleanFacebookUrl(value) {
    const raw = String(value || '')
      .replace(/\\u0025/gi, '%')
      .replace(/\\u0026/gi, '&')
      .replace(/\\\//g, '/')
      .trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, 'https://www.facebook.com/');
      if (parsed.protocol !== 'https:' || (parsed.hostname !== 'facebook.com' && !parsed.hostname.endsWith('.facebook.com'))) return '';
      if (!(/\/posts\//i.test(parsed.pathname)
        || /\/(?:permalink|story)\.php$/i.test(parsed.pathname)
        || /\/(?:permalink|multi_permalinks|share\/[pvr]|reel|videos)\//i.test(parsed.pathname)
        || parsed.searchParams.has('story_fbid')
        || parsed.searchParams.has('fbid')
        || parsed.searchParams.has('multi_permalinks'))) return '';
      parsed.hash = '';
      for (const key of ['__cft__', '__tn__', 'mibextid', 'ref', 'refid']) parsed.searchParams.delete(key);
      return parsed.href;
    } catch {
      return '';
    }
  }

  function normalizePostId(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('_')) raw = raw.split('_').filter(Boolean).at(-1) || '';
    if (/^(?:pfbid[a-z0-9]+|\d{6,})$/i.test(raw)) return raw;
    try {
      const decoded = typeof atob === 'function' ? atob(raw) : '';
      const match = decoded.match(/(?:Post|Story|Feedback):(?:\d+_)?(\d{6,})/i)
        || decoded.match(/(?:^|\D)(\d{8,})(?:\D|$)/);
      return match?.[1] || '';
    } catch {
      return '';
    }
  }

  function postIdFromUrl(value) {
    const raw = String(value || '');
    return normalizePostId(
      raw.match(/\/posts\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/[?&](?:story_fbid|fbid|multi_permalinks)=(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || raw.match(/\/(?:permalink|multi_permalinks)\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || '',
    );
  }

  function requestBodyText(body) {
    if (typeof body === 'string') return body;
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const values = [];
      for (const [key, value] of body.entries()) {
        if (typeof value === 'string') values.push(`${key}=${value}`);
      }
      return values.join('&');
    }
    return '';
  }

  function isCreatePostGraphqlRequest(url, body = '') {
    let path = '';
    try { path = new URL(String(url || ''), 'https://www.facebook.com/').pathname; } catch {}
    if (!GRAPHQL_PATH.test(path)) return false;
    const requestText = requestBodyText(body);
    if (!requestText) return true;
    return /Composer.*Create|StoryCreateMutation|CreateStory|Comet.*(?:Post|Create)|Group.*(?:Post|Create)|Page.*(?:Post|Create)/i.test(requestText);
  }

  function parseJsonPayloads(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return [];
    const payloads = [];
    const attempts = [raw.replace(/^for\s*\(;;\);?/, '').trim()];
    attempts.push(...raw.split(/\r?\n/).map((line) => line.replace(/^for\s*\(;;\);?/, '').trim()).filter(Boolean));
    for (const text of attempts) {
      try {
        const parsed = JSON.parse(text);
        if (!payloads.includes(parsed)) payloads.push(parsed);
      } catch {}
    }
    return payloads;
  }

  function extractGraphqlPostReference(rawText, context = {}) {
    const urlCandidates = [];
    const idCandidates = [];
    const addUrl = (value, score = 0) => {
      const postUrl = cleanFacebookUrl(value);
      if (!postUrl) return;
      const targetId = String(context.targetId || '').trim();
      const targetBonus = targetId && postUrl.includes(`/${targetId}/`) ? 20 : 0;
      urlCandidates.push({ postUrl, postId: postIdFromUrl(postUrl), score: score + targetBonus });
    };
    const addId = (value, score = 0) => {
      const postId = normalizePostId(value);
      if (postId && postId !== String(context.targetId || '')) idCandidates.push({ postId, score });
    };

    const walk = (node, path = []) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, [...path, String(index)]));
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        const nextPath = [...path, key];
        const contextPath = nextPath.join('_');
        const isPostContext = /(?:story|post|composer|create)/i.test(contextPath)
          && !/(?:attachment|shared|quoted)/i.test(contextPath);
        if (typeof value === 'string' || typeof value === 'number') {
          if (/permalink/i.test(key)) addUrl(value, 190);
          else if (isPostContext && /(?:wwwurl|post_url|story_url|^url$)/i.test(key)) addUrl(value, 150);
          if (/^(?:post_?id|story_fbid)$/i.test(key)) addId(value, isPostContext ? 190 : 150);
          if (/^legacy_fbid$/i.test(key) && isPostContext) addId(value, 180);
          if (/^id$/i.test(key) && /(?:^|_)(?:post|story)(?:_|$)/i.test(String(path.at(-1) || ''))) addId(value, 130);
        } else {
          walk(value, nextPath);
        }
      }
    };
    parseJsonPayloads(rawText).forEach((payload) => walk(payload));

    const raw = String(rawText || '');
    const urlPattern = /https:\\?\/\\?\/(?:www\.|m\.)?facebook\.com[^"'\s<]+/gi;
    for (const match of raw.matchAll(urlPattern)) {
      const rawUrl = cleanFacebookUrl(match[0]);
      if (rawUrl && (!context.targetId || rawUrl.includes(`/${context.targetId}/`))) addUrl(rawUrl, 140);
    }
    const idPattern = /["'](?:post_id|postId|legacy_fbid|story_fbid)["']\s*:\s*["']?(pfbid[a-z0-9]+|\d{6,})/gi;
    for (const match of raw.matchAll(idPattern)) addId(match[1], 160);

    const bestUrl = urlCandidates.sort((a, b) => b.score - a.score)[0];
    if (bestUrl) return bestUrl;
    const bestId = idCandidates.sort((a, b) => b.score - a.score)[0];
    if (!bestId) return null;
    const targetId = encodeURIComponent(String(context.targetId || '').trim());
    const postId = encodeURIComponent(bestId.postId);
    if (!targetId) return null;
    const postUrl = context.targetType === 'page'
      ? `https://www.facebook.com/${targetId}/posts/${postId}/`
      : `https://www.facebook.com/groups/${targetId}/posts/${postId}/`;
    return { ...bestId, postUrl };
  }

  globalThis.STREALFacebookNetworkCapture = Object.freeze({
    cleanFacebookUrl,
    normalizePostId,
    postIdFromUrl,
    isCreatePostGraphqlRequest,
    extractGraphqlPostReference,
  });

  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  let activeCapture = null;

  function currentCapture() {
    if (!activeCapture) return null;
    if (Date.now() > activeCapture.expiresAt) activeCapture = null;
    return activeCapture;
  }

  function publishReference(rawText, method) {
    const capture = currentCapture();
    if (!capture) return;
    const reference = extractGraphqlPostReference(rawText, capture);
    if (!reference?.postUrl) return;
    window.postMessage({
      source: CAPTURE_SOURCE,
      type: RESULT_TYPE,
      requestId: capture.requestId,
      taskId: capture.taskId,
      method,
      postId: reference.postId || '',
      postUrl: reference.postUrl,
    }, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== CONTROL_SOURCE) return;
    if (data.type === START_TYPE) {
      activeCapture = {
        requestId: String(data.requestId || ''),
        taskId: String(data.taskId || ''),
        targetType: data.targetType === 'page' ? 'page' : 'group',
        targetId: String(data.targetId || ''),
        expiresAt: Date.now() + 60_000,
      };
    } else if (data.type === STOP_TYPE) {
      activeCapture = null;
    }
  });

  const originalFetch = window.fetch;
  window.fetch = async function strealFacebookFetch(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' || args[0] instanceof URL ? String(args[0]) : String(args[0]?.url || '');
      const body = args[1]?.body || args[0]?.body || '';
      if (currentCapture() && isCreatePostGraphqlRequest(url, body)) {
        response.clone().text().then((text) => publishReference(text, 'graphql_fetch')).catch(() => {});
      }
    } catch {}
    return response;
  };

  if (typeof XMLHttpRequest === 'function') {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function strealFacebookXhrOpen(method, url, ...args) {
      this.__strealGraphqlUrl = String(url || '');
      return originalOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function strealFacebookXhrSend(body) {
      try {
        if (currentCapture() && isCreatePostGraphqlRequest(this.__strealGraphqlUrl, body)) {
          this.addEventListener('load', () => {
            try {
              const raw = this.responseType === 'json' ? JSON.stringify(this.response) : String(this.responseText || '');
              publishReference(raw, 'graphql_xhr');
            } catch {}
          }, { once: true });
        }
      } catch {}
      return originalSend.call(this, body);
    };
  }
})();
