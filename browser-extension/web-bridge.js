(() => {
  const SOURCE = 'streal-web-page';
  const EXTENSION_SOURCE = 'streal-tiktok-extension';

  chrome.runtime.sendMessage({ type: 'STREAL_EXTENSION_SET_API_ORIGIN', origin: window.location.origin });

  function postToPage(payload) {
    window.postMessage({ ...payload, source: EXTENSION_SOURCE }, window.location.origin);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'STREAL_FACEBOOK_GROUP_QUEUE_PROGRESS') return false;
    postToPage(message);
    return false;
  });

  window.addEventListener('message', (event) => {
    try {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== SOURCE) return;

    if (data.type === 'STREAL_TIKTOK_BRIDGE_PING') {
      postToPage({
        type: 'STREAL_TIKTOK_BRIDGE_READY',
        requestId: data.requestId || '',
        version: chrome.runtime.getManifest().version,
      });
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_COOKIE_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_GET_FACEBOOK_COOKIE',
          requestId: data.requestId,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_COOKIE_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_COOKIE_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong tra cookie' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_GROUP_QUEUE_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_START_FACEBOOK_GROUP_QUEUE',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_GROUP_QUEUE_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_GROUP_QUEUE_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong khoi dong duoc hang doi Facebook' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_GROUP_QUEUE_CANCEL_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_CANCEL_FACEBOOK_GROUP_QUEUE',
          requestId: data.requestId,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_GROUP_QUEUE_CANCEL_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_GROUP_QUEUE_CANCEL_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong huy duoc hang doi Facebook' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_POST_METRICS_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_COLLECT_FACEBOOK_POST_METRICS',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_POST_METRICS_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_POST_METRICS_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong doc duoc tuong tac Facebook' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_RESOLVE_POST_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_RESOLVE_FACEBOOK_POST',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_RESOLVE_POST_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension không phản hồi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_RESOLVE_POST_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension không tìm được bài Facebook' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_POST_REFERENCE_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_FIND_FACEBOOK_POST_REFERENCE',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_POST_REFERENCE_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_POST_REFERENCE_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong tim thay bai Facebook' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_FACEBOOK_COLLECT_POST_DATA_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_COLLECT_FACEBOOK_POST_DATA',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_FACEBOOK_COLLECT_POST_DATA_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension không phản hồi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_FACEBOOK_COLLECT_POST_DATA_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension không đọc được bài Facebook' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_CLIPBOARD_READ_REQUEST') {
      navigator.clipboard.readText()
        .then((value) => postToPage({
          type: 'STREAL_CLIPBOARD_READ_RESPONSE',
          requestId: data.requestId,
          ok: Boolean(String(value || '').trim()),
          value: String(value || '').trim(),
          error: String(value || '').trim() ? '' : 'Clipboard đang trống',
        }))
        .catch((error) => postToPage({
          type: 'STREAL_CLIPBOARD_READ_RESPONSE',
          requestId: data.requestId,
          ok: false,
          error: error?.message || 'Không đọc được clipboard',
        }));
      return;
    }

    if (data.type === 'STREAL_TIKTOK_COLLECT_VIDEOS_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_COLLECT_TIKTOK_VIDEOS',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_TIKTOK_COLLECT_VIDEOS_RESPONSE',
              requestId: data.requestId,
              ok: false,
              videos: [],
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_TIKTOK_COLLECT_VIDEOS_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, videos: [], error: 'Extension khong tra danh sach video' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_TIKTOK_OPEN_COMMENT_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_OPEN_TIKTOK_COMMENT',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_TIKTOK_OPEN_COMMENT_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_TIKTOK_OPEN_COMMENT_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong mo duoc comment TikTok' }),
          });
        },
      );
      return;
    }

    if (data.type === 'STREAL_TIKTOK_COLLECT_DOM_COMMENTS_REQUEST') {
      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_COLLECT_TIKTOK_DOM_COMMENTS',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_TIKTOK_COLLECT_DOM_COMMENTS_RESPONSE',
              requestId: data.requestId,
              ok: false,
              videos: [],
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_TIKTOK_COLLECT_DOM_COMMENTS_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, videos: [], error: 'Extension khong tra comment TikTok' }),
          });
        },
      );
      return;
    }

    if (data.type !== 'STREAL_TIKTOK_COMMENT_REQUEST') return;

      chrome.runtime.sendMessage(
        {
          type: 'STREAL_EXTENSION_SEND_COMMENT',
          requestId: data.requestId,
          payload: data.payload || {},
        },
        (response) => {
          if (chrome.runtime.lastError) {
            postToPage({
              type: 'STREAL_TIKTOK_COMMENT_RESPONSE',
              requestId: data.requestId,
              ok: false,
              error: chrome.runtime.lastError.message || 'Extension khong phan hoi',
            });
            return;
          }
          postToPage({
            type: 'STREAL_TIKTOK_COMMENT_RESPONSE',
            requestId: data.requestId,
            ...(response || { ok: false, error: 'Extension khong tra ket qua' }),
          });
        },
      );
    } catch (error) {
      // Reloading an unpacked extension invalidates content scripts already
      // injected into open tabs. Ignore that stale bridge until the tab reloads.
      if (/extension context invalidated/i.test(String(error?.message || error))) return;
      throw error;
    }
  });
})();
