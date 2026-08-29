const TIKTOK_HOST = 'https://www.tiktok.com';
const STREAL_API_ORIGIN_KEY = 'strealApiOrigin';

function isAllowedApiOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return (url.protocol === 'https:' && (
      url.hostname.endsWith('.vercel.app')
      || url.hostname === 'sale-fsolution-nqif.onrender.com'
      || url.hostname === 'sale-fsolution.onrender.com'
    ))
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

async function saveFacebookPublicContact(payload) {
  const stored = await chrome.storage.local.get(STREAL_API_ORIGIN_KEY);
  const origin = String(stored?.[STREAL_API_ORIGIN_KEY] || '');
  if (!isAllowedApiOrigin(origin)) {
    return { ok: false, error: 'Hay mo va dang nhap F-Solution mot lan truoc khi luu Lead.' };
  }
  try {
    const appTabs = await chrome.tabs.query({ url: `${origin}/*` });
    const appTab = appTabs.find((tab) => Number.isInteger(tab.id));
    if (appTab?.id) {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: appTab.id },
        world: 'MAIN',
        args: [payload || {}],
        func: async (contact) => {
          const response = await fetch('/api/facebook-contacts', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact),
          });
          const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
          return response.ok ? data : { ok: false, error: data.error || `Server ${response.status}` };
        },
      });
      if (injected?.[0]?.result) return injected[0].result;
    }
  } catch {
    // Fall through to a direct extension request when the app tab cannot be injected.
  }
  const response = await fetch(`${origin}/api/facebook-contacts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
  return response.ok ? data : { ok: false, error: data.error || `Server ${response.status}` };
}

async function saveMessengerThread(payload, preferredAppTabId) {
  const stored = await chrome.storage.local.get(STREAL_API_ORIGIN_KEY);
  const origin = String(stored?.[STREAL_API_ORIGIN_KEY] || '');
  if (!isAllowedApiOrigin(origin)) {
    return { ok: false, error: 'Hay mo va dang nhap F-Solution mot lan truoc khi dong bo Messenger.' };
  }
  try {
    const appTabs = await chrome.tabs.query({ url: `${origin}/*` });
    const appTab = appTabs.find((tab) => tab.id === preferredAppTabId)
      || appTabs.find((tab) => tab.active && Number.isInteger(tab.id))
      || appTabs.find((tab) => Number.isInteger(tab.id));
    if (appTab?.id) {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: appTab.id },
        world: 'MAIN',
        args: [payload || {}],
        func: async (thread) => {
          const response = await fetch('/api/messenger/sync', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(thread),
          });
          const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
          return response.ok ? data : { ok: false, error: data.error || `Server ${response.status}` };
        },
      });
      if (injected?.[0]?.result) return injected[0].result;
    }
  } catch {
    // Fall through to a direct extension request when the app tab cannot be injected.
  }
  const response = await fetch(`${origin}/api/messenger/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
  return response.ok ? data : { ok: false, error: data.error || `Server ${response.status}` };
}

async function authorizeZaloThread(payload, preferredAppTabId) {
  const stored = await chrome.storage.local.get(STREAL_API_ORIGIN_KEY);
  const origin = String(stored?.[STREAL_API_ORIGIN_KEY] || '');
  if (!isAllowedApiOrigin(origin)) {
    return { ok: false, error: 'Hay mo va dang nhap F-Solution mot lan truoc khi dong bo Zalo.' };
  }
  const cleanPayload = { ...(payload || {}) };
  delete cleanPayload.messages;
  delete cleanPayload.ignored_message_ids;
  try {
    const appTabs = await chrome.tabs.query({ url: `${origin}/*` });
    const appTab = appTabs.find((tab) => tab.id === preferredAppTabId)
      || appTabs.find((tab) => tab.active && Number.isInteger(tab.id))
      || appTabs.find((tab) => Number.isInteger(tab.id));
    if (appTab?.id) {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: appTab.id },
        world: 'MAIN',
        args: [cleanPayload],
        func: async (thread) => {
          const response = await fetch('/api/zalo/sync/authorize', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(thread),
          });
          const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
          return response.ok ? data : { ...data, ok: false, error: data.error || `Server ${response.status}` };
        },
      });
      if (injected?.[0]?.result) return injected[0].result;
    }
  } catch {
    // Fall through to a direct extension request.
  }
  const response = await fetch(`${origin}/api/zalo/sync/authorize`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleanPayload),
  });
  const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
  return response.ok ? data : { ...data, ok: false, error: data.error || `Server ${response.status}` };
}

async function saveZaloThread(payload, preferredAppTabId) {
  const stored = await chrome.storage.local.get(STREAL_API_ORIGIN_KEY);
  const origin = String(stored?.[STREAL_API_ORIGIN_KEY] || '');
  if (!isAllowedApiOrigin(origin)) {
    return { ok: false, error: 'Hay mo va dang nhap F-Solution mot lan truoc khi dong bo Zalo.' };
  }
  try {
    const appTabs = await chrome.tabs.query({ url: `${origin}/*` });
    const appTab = appTabs.find((tab) => tab.id === preferredAppTabId)
      || appTabs.find((tab) => tab.active && Number.isInteger(tab.id))
      || appTabs.find((tab) => Number.isInteger(tab.id));
    if (appTab?.id) {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: appTab.id },
        world: 'MAIN',
        args: [payload || {}],
        func: async (thread) => {
          const authorizationPayload = { ...(thread || {}) };
          delete authorizationPayload.messages;
          delete authorizationPayload.ignored_message_ids;
          const authorizationResponse = await fetch('/api/zalo/sync/authorize', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authorizationPayload),
          });
          const authorizationData = await authorizationResponse.json().catch(() => ({ ok: false, error: `Server ${authorizationResponse.status}` }));
          if (!authorizationResponse.ok || !authorizationData.ok) {
            return { ...authorizationData, ok: false, error: authorizationData.error || `Server ${authorizationResponse.status}` };
          }
          let uploadedCount = 0;
          const mediaWarnings = new Set();
          const messages = [];
          for (const rawMessage of Array.isArray(thread?.messages) ? thread.messages : []) {
            const message = { ...(rawMessage || {}) };
            const mediaUrls = new Set(Array.isArray(message.media_urls)
              ? message.media_urls.filter((url) => /^https:\/\/res\.cloudinary\.com\//i.test(String(url || '')))
              : []);
            for (const item of Array.isArray(message.media_uploads) ? message.media_uploads.slice(0, 8) : []) {
              try {
                const sourceUrl = String(item?.source_url || '');
                const blobResponse = await fetch(String(item?.data_url || ''));
                const blob = await blobResponse.blob();
                if (!blob.size || !/^image\//i.test(blob.type || '')) throw new Error('Dữ liệu ảnh không hợp lệ');
                const extension = /png/i.test(blob.type) ? 'png' : /webp/i.test(blob.type) ? 'webp' : /gif/i.test(blob.type) ? 'gif' : 'jpg';
                const form = new FormData();
                form.append('image', blob, `zalo-image.${extension}`);
                const uploadResponse = await fetch('/api/uploads/zalo-media', {
                  method: 'POST', credentials: 'include', body: form,
                });
                const uploadData = await uploadResponse.json().catch(() => ({ ok: false, error: `Server ${uploadResponse.status}` }));
                if (!uploadResponse.ok || !uploadData.ok || !uploadData.image_url) {
                  throw new Error(uploadData.error || `Server ${uploadResponse.status}`);
                }
                if (sourceUrl) mediaUrls.delete(sourceUrl);
                mediaUrls.add(uploadData.image_url);
                uploadedCount += 1;
              } catch (error) {
                mediaWarnings.add(error?.message || String(error));
              }
            }
            delete message.media_uploads;
            delete message.media_candidates;
            message.media_urls = [...mediaUrls].slice(0, 10);
            messages.push(message);
          }
          const cleanThread = { ...(thread || {}), messages };
          const response = await fetch('/api/zalo/sync', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleanThread),
          });
          const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
          if (!response.ok) return { ok: false, error: data.error || `Server ${response.status}`, media_upload_count: uploadedCount };
          const mediaWarning = [...mediaWarnings].filter(Boolean).join(' | ');
          return {
            ...data,
            media_upload_count: uploadedCount,
            warning: [data.warning, mediaWarning ? `Chưa lưu được một số ảnh Zalo: ${mediaWarning}` : ''].filter(Boolean).join(' | '),
          };
        },
      });
      if (injected?.[0]?.result) return injected[0].result;
    }
  } catch {
    // Fall through to a direct extension request when the app tab cannot be injected.
  }
  const cleanPayload = {
    ...(payload || {}),
    messages: (Array.isArray(payload?.messages) ? payload.messages : []).map((rawMessage) => {
      const message = { ...(rawMessage || {}) };
      delete message.media_uploads;
      delete message.media_candidates;
      return message;
    }),
  };
  const authorizationPayload = { ...(payload || {}) };
  delete authorizationPayload.messages;
  delete authorizationPayload.ignored_message_ids;
  const authorizationResponse = await fetch(`${origin}/api/zalo/sync/authorize`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authorizationPayload),
  });
  const authorizationData = await authorizationResponse.json().catch(() => ({ ok: false, error: `Server ${authorizationResponse.status}` }));
  if (!authorizationResponse.ok || !authorizationData.ok) {
    return { ...authorizationData, ok: false, error: authorizationData.error || `Server ${authorizationResponse.status}` };
  }
  const response = await fetch(`${origin}/api/zalo/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleanPayload),
  });
  const data = await response.json().catch(() => ({ ok: false, error: `Server ${response.status}` }));
  return response.ok ? data : { ok: false, error: data.error || `Server ${response.status}` };
}

async function findOpenMessengerTab() {
  const patterns = [
    'https://www.messenger.com/*',
    'https://*.messenger.com/*',
    'https://www.facebook.com/messages*',
    'https://*.facebook.com/messages*',
  ];
  const groups = await Promise.all(patterns.map((url) => chrome.tabs.query({ url }).catch(() => [])));
  const byId = new Map();
  groups.flat().forEach((tab) => {
    if (Number.isInteger(tab?.id)) byId.set(tab.id, tab);
  });
  const tabs = [...byId.values()];
  return tabs.find((tab) => tab.active) || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
}

async function findOpenZaloTab() {
  const patterns = [
    'https://chat.zalo.me/*',
    'https://*.zalo.me/*',
  ];
  const groups = await Promise.all(patterns.map((url) => chrome.tabs.query({ url }).catch(() => [])));
  const byId = new Map();
  groups.flat().forEach((tab) => {
    if (Number.isInteger(tab?.id)) byId.set(tab.id, tab);
  });
  const tabs = [...byId.values()].filter((tab) => {
    try {
      return new URL(tab.url || '').hostname.endsWith('zalo.me');
    } catch {
      return false;
    }
  });
  const chatTabs = tabs.filter((tab) => {
    try {
      return new URL(tab.url || '').hostname === 'chat.zalo.me';
    } catch {
      return false;
    }
  });
  return chatTabs.find((tab) => tab.active)
    || chatTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
    || tabs.find((tab) => tab.active)
    || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
    || null;
}

async function collectMessengerThread(request, sender) {
  const tab = await findOpenMessengerTab();
  if (!tab?.id) {
    return { ok: false, error: 'Hay mo san mot hoi thoai Messenger tren messenger.com hoac facebook.com/messages roi bam dong bo lai.' };
  }
  try {
    await waitForTabLoaded(tab.id, 20000);
    let result = await sendTabMessage(tab.id, {
      type: 'STREAL_MESSENGER_COLLECT_THREAD',
      requestId: request.requestId,
      payload: request.payload || {},
    });
    if (!result?.ok && /receiving end|could not establish connection|khong ton tai|does not exist/i.test(String(result?.error || ''))) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['messenger-content.js'] });
      await sleep(500);
      result = await sendTabMessage(tab.id, {
        type: 'STREAL_MESSENGER_COLLECT_THREAD',
        requestId: request.requestId,
        payload: request.payload || {},
      });
    }
    if (!result?.ok) return { ok: false, error: result?.error || result?.warning || 'Extension chua doc duoc hoi thoai Messenger.' };
    const saved = await saveMessengerThread(result, sender?.tab?.id);
    if (sender?.tab?.id) {
      try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
    }
    return {
      ...saved,
      messenger_tab_id: tab.id,
      extension_warning: result.warning || '',
      extension_count: Number(result.count || 0),
      scan_rounds: Number(result.scan_rounds || 0),
      error: saved?.error || saved?.warning || '',
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function collectZaloThread(request, sender) {
  const tab = await findOpenZaloTab();
  if (!tab?.id) {
    return { ok: false, error: 'Hay mo san mot hoi thoai tren https://chat.zalo.me roi bam dong bo lai.' };
  }
  try {
    await waitForTabLoaded(tab.id, 20000);
    let metadata = await sendTabMessage(tab.id, {
      type: 'STREAL_ZALO_COLLECT_THREAD',
      requestId: request.requestId,
      payload: { ...(request.payload || {}), metadataOnly: true },
    });
    if (!metadata?.ok && /receiving end|could not establish connection|khong ton tai|does not exist/i.test(String(metadata?.error || ''))) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['zalo-content.js'] });
      await sleep(500);
      metadata = await sendTabMessage(tab.id, {
        type: 'STREAL_ZALO_COLLECT_THREAD',
        requestId: request.requestId,
        payload: { ...(request.payload || {}), metadataOnly: true },
      });
    }
    if (!metadata?.ok) {
      return {
        ok: false,
        error: metadata?.error || metadata?.warning || 'Extension chua doc duoc nhom Zalo.',
        extension_count: 0,
        scan_rounds: 0,
        identity_source: metadata?.identity_source || '',
        identity_confidence: metadata?.identity_confidence || '',
      };
    }
    const expectedConversationId = String(request?.payload?.expectedConversationId || '');
    if (expectedConversationId && metadata.conversation_id !== expectedConversationId) {
      return {
        ok: false,
        error: 'Nhóm Zalo đang mở không phải nhóm vừa được cho phép. Hãy mở đúng nhóm rồi bấm đồng bộ lại.',
        expected_conversation_id: expectedConversationId,
        actual_conversation_id: metadata.conversation_id || '',
      };
    }
    const authorization = await authorizeZaloThread(metadata, sender?.tab?.id);
    if (!authorization?.ok) {
      if (sender?.tab?.id) {
        try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
      }
      return {
        ...authorization,
        ok: false,
        zalo_tab_id: tab.id,
        extension_count: 0,
        scan_rounds: 0,
        identity_source: metadata.identity_source || '',
        identity_confidence: metadata.identity_confidence || '',
        error: authorization?.error || authorization?.warning || 'Nhóm Zalo chưa được phép đồng bộ.',
      };
    }
    try { await chrome.tabs.update(tab.id, { active: true }); } catch {}
    const result = await sendTabMessage(tab.id, {
      type: 'STREAL_ZALO_COLLECT_THREAD',
      requestId: request.requestId,
      payload: { ...(request.payload || {}), authorizedGroup: true },
    });
    if (!result?.ok) {
      if (sender?.tab?.id) {
        try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
      }
      return { ok: false, error: result?.error || result?.warning || 'Extension chua doc duoc tin nhan nhom Zalo.' };
    }
    if (metadata.conversation_id && result.conversation_id !== metadata.conversation_id) {
      if (sender?.tab?.id) {
        try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
      }
      return { ok: false, error: 'Nhóm Zalo đã thay đổi sau khi kiểm tra quyền. Hãy giữ nguyên nhóm rồi đồng bộ lại.' };
    }
    const saved = await saveZaloThread(result, sender?.tab?.id);
    if (sender?.tab?.id) {
      try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
    }
    return {
      ...saved,
      zalo_tab_id: tab.id,
      extension_warning: [result.warning, result.media_capture_warning].filter(Boolean).join(' | '),
      extension_count: Number(result.count || 0),
      scan_rounds: Number(result.scan_rounds || 0),
      identity_source: result.identity_source || '',
      identity_confidence: result.identity_confidence || '',
      media_capture_count: Number(result.media_capture_count || 0),
      media_capture_warning: result.media_capture_warning || '',
      error: saved?.error || saved?.warning || '',
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function persistFacebookQueueHistory(queue, status = 'pending', error = '') {
  if (!queue?.requestId || !Array.isArray(queue.tasks) || !queue.tasks.length) return { ok: false };
  const stored = await chrome.storage.local.get(STREAL_API_ORIGIN_KEY);
  const origin = String(stored?.[STREAL_API_ORIGIN_KEY] || '');
  if (!isAllowedApiOrigin(origin)) return { ok: false };
  const payload = {
    request_id: queue.requestId,
    content: queue.tasks[0]?.message || '',
    media_urls: (queue.tasks[0]?.media || []).map((item) => item.url).filter(Boolean),
    targets: queue.tasks.map((task) => ({ type: task.type, id: task.id, name: task.name })),
    results: queue.results || [],
    status,
    error,
  };
  try {
    const tabs = await chrome.tabs.query({ url: `${origin}/*` });
    const tab = tabs.find((item) => Number.isInteger(item.id));
    if (tab?.id) {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'MAIN', args: [payload],
        func: async (history) => {
          const response = await fetch('/api/facebook-posts/extension-result', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(history),
          });
          return response.json().catch(() => ({ ok: false }));
        },
      });
      return result?.[0]?.result || { ok: false };
    }
  } catch {
    // Try a direct request below; it may still work when the app tab was closed.
  }
  try {
    const response = await fetch(`${origin}/api/facebook-posts/extension-result`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return response.json().catch(() => ({ ok: false }));
  } catch {
    return { ok: false };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTikTokUrl(payload) {
  const rawUrl = String(payload.comment_url || payload.post_url || payload.video_url || payload.url || '').trim();
  const videoIdFromUrl = rawUrl.match(/\/video\/(\d+)/)?.[1] || '';
  const rawVideoId = String(payload.video_id || payload.post_id || '').replace(/^tiktok_/, '').trim();
  const videoId = videoIdFromUrl || rawVideoId.match(/\d{8,}/)?.[0] || '';
  const channelName = String(payload.channel_name || payload.channel || payload.author_unique_id || payload.username || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '');

  if (rawUrl && rawUrl.includes('tiktok.com') && !rawUrl.includes('/@/video/')) return rawUrl;
  if (videoId && channelName) return `${TIKTOK_HOST}/@${encodeURIComponent(channelName)}/video/${encodeURIComponent(videoId)}`;
  if (rawUrl && rawUrl.includes('tiktok.com')) return rawUrl;
  return '';
}

function getVideoId(payload, url) {
  const raw = String(payload.video_id || payload.post_id || url || '')
    .replace(/^tiktok_/, '')
    .trim();
  return raw.match(/\d{8,}/)?.[0] || '';
}

function friendlyTikTokError(payload, fallback) {
  const text = String(payload?.status_msg || payload?.message || fallback || '').trim();
  if (!text) return 'TikTok khong nhan binh luan qua phien Chrome hien tai.';
  if (/login|session|expired|auth|verify|captcha/i.test(text)) {
    return 'TikTok yeu cau dang nhap/xac minh/captcha lai tren Chrome truoc khi gui binh luan.';
  }
  return text;
}


function conciseSendError(apiError, domError) {
  const joined = [apiError, domError].filter(Boolean).join(' | ');
  if (/403|status_code.*?214|khong nhan binh luan|kh?ng nh?n b?nh lu?n/i.test(joined)) {
    return 'TikTok tu choi gui tu dong bang phien Chrome hien tai (403). Da mo video va copy noi dung, hay dan Ctrl+V de gui thu cong.';
  }
  if (/login|session|captcha|verify|dang nhap|xac minh/i.test(joined)) {
    return 'TikTok yeu cau dang nhap/xac minh/captcha lai tren Chrome truoc khi gui binh luan.';
  }
  return joined || 'Khong gui duoc comment TikTok qua API/extension.';
}

function getTikTokCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: '.tiktok.com' }, (cookies) => {
      if (chrome.runtime.lastError) {
        resolve({ cookieHeader: '', csrf: '', error: chrome.runtime.lastError.message });
        return;
      }
      const rows = Array.isArray(cookies) ? cookies : [];
      const cookieHeader = rows.map((item) => `${item.name}=${item.value}`).join('; ');
      const csrf =
        rows.find((item) => item.name === 'tt_csrf_token')?.value ||
        rows.find((item) => item.name === 'csrf_session_id')?.value ||
        '';
      resolve({ cookieHeader, csrf, error: '' });
    });
  });
}

function getFacebookCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: '.facebook.com' }, (cookies) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, cookie: '', c_user: '', error: chrome.runtime.lastError.message });
        return;
      }
      const rows = Array.isArray(cookies) ? cookies : [];
      const cookie = rows.map((item) => `${item.name}=${item.value}`).join('; ');
      const cUser = rows.find((item) => item.name === 'c_user')?.value || '';
      if (!cookie || !cUser) {
        resolve({
          ok: false,
          cookie: '',
          c_user: '',
          error: 'Chrome chua dang nhap Facebook hoac extension chua du quyen doc cookie facebook.com.',
        });
        return;
      }
      resolve({ ok: true, cookie, c_user: cUser, error: '' });
    });
  });
}

async function publishCommentFromBackground(payload, url, previousError) {
  const text = String(payload.message || payload.text || '').trim();
  const videoId = getVideoId(payload, url);
  if (!videoId) {
    return { ok: false, final: true, error: `${previousError || ''} Khong xac dinh duoc ID video TikTok.`.trim() };
  }

  const cookieInfo = await getTikTokCookies();
  if (!cookieInfo.cookieHeader) {
    return {
      ok: false,
      final: true,
      error: `${previousError || ''} Khong doc duoc cookie TikTok trong Chrome. Hay cap quyen cookies cho extension va reload extension.`.trim(),
    };
  }

  const params = new URLSearchParams({
    aweme_id: videoId,
    aid: '1988',
    app_language: 'vi-VN',
    browser_language: 'vi-VN',
    device_platform: 'webapp',
    region: 'VN',
    os: 'windows',
  });
  const body = new URLSearchParams({ aweme_id: videoId, text });
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': TIKTOK_HOST,
    'Referer': url,
  };
  if (cookieInfo.csrf) {
    headers['X-Secsdk-Csrf-Token'] = cookieInfo.csrf;
    headers['x-secsdk-csrf-token'] = cookieInfo.csrf;
  }

  let response;
  try {
    response = await fetch(`${TIKTOK_HOST}/api/comment/publish/?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
    });
  } catch (error) {
    return {
      ok: false,
      final: true,
      error: `${previousError || ''} Background API loi ket noi TikTok: ${error?.message || String(error)}`.trim(),
    };
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }
  if (!response.ok) {
    return {
      ok: false,
      final: true,
      error: `${previousError || ''} Background API TikTok loi ${response.status}: ${friendlyTikTokError(data, response.statusText)}`.trim(),
    };
  }
  const statusCode = data.status_code;
  const comment = data.comment || data.comments?.[0] || {};
  if (statusCode !== 0 && statusCode !== '0' && statusCode !== undefined) {
    return {
      ok: false,
      final: true,
      error: `${previousError || ''} Background API TikTok: ${friendlyTikTokError(data, 'TikTok khong nhan binh luan.')}`.trim(),
    };
  }
  if ((data.status_msg || data.message) && !comment.cid && !comment.id && !comment.comment_id) {
    return {
      ok: false,
      final: true,
      error: `${previousError || ''} Background API TikTok: ${friendlyTikTokError(data, 'TikTok khong nhan binh luan.')}`.trim(),
    };
  }

  return {
    ok: true,
    final: true,
    comment_id: String(comment.cid || comment.id || comment.comment_id || `extension_bg_${Date.now()}`),
    message: 'Extension da gui binh luan TikTok bang background Chrome',
    url,
    method: 'background-api',
  };
}

function normalizeTikTokApiComment(item, videoId, depth = 0, parentId = '') {
  const user = item?.user || {};
  const cid = String(item?.cid || item?.id || item?.comment_id || '').trim();
  const text = String(item?.text || item?.share_info?.desc || '').trim();
  if (!cid || !text) return null;
  const authorName = String(user.nickname || user.unique_id || user.uid || 'Ẩn danh').trim();
  return {
    id: cid,
    cid,
    text,
    author_name: authorName,
    author_id: String(user.uid || user.sec_uid || user.unique_id || authorName || '').trim(),
    create_time: item.create_time || null,
    depth,
    parent_comment_id: parentId,
    source: 'chrome_api',
    video_id: videoId,
  };
}

async function fetchTikTokCommentsByApi(video, limit, cookieInfo) {
  const url = normalizeTikTokUrl(video) || String(video.post_url || video.url || '').trim();
  const videoId = getVideoId(video, url);
  if (!videoId || !url) {
    return { ok: false, comments: [], error: 'Khong xac dinh duoc video TikTok de doc API.' };
  }
  if (!cookieInfo?.cookieHeader) {
    return { ok: false, comments: [], error: 'Chrome chua co cookie TikTok de doc API nhanh.' };
  }

  const comments = [];
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Referer': url,
    'Origin': TIKTOK_HOST,
  };
  if (cookieInfo.csrf) {
    headers['X-Secsdk-Csrf-Token'] = cookieInfo.csrf;
    headers['x-secsdk-csrf-token'] = cookieInfo.csrf;
  }

  async function requestJson(path, params) {
    const response = await fetch(`${TIKTOK_HOST}${path}?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(`TikTok API ${path} loi ${response.status}: ${friendlyTikTokError(data, response.statusText)}`);
    }
    const statusCode = data.status_code;
    if (statusCode !== 0 && statusCode !== '0' && statusCode !== undefined) {
      throw new Error(`TikTok API ${path}: ${friendlyTikTokError(data, 'TikTok khong tra comment.')}`);
    }
    return data;
  }

  async function fetchReplies(parentId, remain) {
    const rows = [];
    let cursor = 0;
    for (let page = 0; page < 3 && rows.length < remain; page += 1) {
      const count = Math.min(30, remain - rows.length);
      const params = new URLSearchParams({
        item_id: videoId,
        comment_id: parentId,
        cursor: String(cursor),
        count: String(count),
        aid: '1988',
        app_language: 'vi-VN',
        browser_language: 'vi-VN',
        device_platform: 'webapp',
        region: 'VN',
        os: 'windows',
      });
      const data = await requestJson('/api/comment/list/reply/', params);
      const batch = Array.isArray(data.comments) ? data.comments : [];
      if (!batch.length) break;
      for (const item of batch) {
        const row = normalizeTikTokApiComment(item, videoId, 1, parentId);
        if (row) rows.push(row);
        if (rows.length >= remain) break;
      }
      const nextCursor = Number(data.cursor ?? cursor);
      if (!data.has_more || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return rows;
  }

  try {
    let cursor = 0;
    for (let page = 0; page < 8 && comments.length < limit; page += 1) {
      const count = Math.min(50, limit - comments.length);
      const params = new URLSearchParams({
        aweme_id: videoId,
        cursor: String(cursor),
        count: String(count),
        aid: '1988',
        app_language: 'vi-VN',
        browser_language: 'vi-VN',
        device_platform: 'webapp',
        region: 'VN',
        os: 'windows',
      });
      const data = await requestJson('/api/comment/list/', params);
      const batch = Array.isArray(data.comments) ? data.comments : [];
      if (!batch.length) {
        const msg = data.status_msg || data.message || 'TikTok API khong tra comment.';
        return { ok: false, comments, error: msg };
      }
      for (const item of batch) {
        const row = normalizeTikTokApiComment(item, videoId, 0, '');
        if (row) comments.push(row);
        const replyTotal = Number(item.reply_comment_total || item.reply_comment_count || 0);
        if (row?.id && replyTotal > 0 && comments.length < limit) {
          try {
            const replies = await fetchReplies(row.id, Math.min(20, limit - comments.length));
            comments.push(...replies);
          } catch {
            // Reply API is best-effort; keep root comments.
          }
        }
        if (comments.length >= limit) break;
      }
      const nextCursor = Number(data.cursor ?? cursor);
      if (!data.has_more || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return {
      ok: comments.length > 0,
      comments: comments.slice(0, limit),
      error: comments.length ? '' : 'TikTok API khong tra comment.',
      method: 'chrome-api',
    };
  } catch (error) {
    return { ok: false, comments, error: error?.message || String(error), method: 'chrome-api' };
  }
}

function waitForTabLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(), timeoutMs);

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') finish();
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === 'complete') finish();
    });
  });
}

async function sendMessageWithRetries(tabId, message) {
  let lastError = '';
  for (let i = 0; i < 30; i += 1) {
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false, error: 'TikTok tab khong tra ket qua' });
      });
    });
    if (response?.ok || response?.final) return response;
    lastError = response?.error || lastError;
    await sleep(1000);
  }
  return {
    ok: false,
    final: true,
    error: lastError || 'Extension chua ket noi duoc tab TikTok. Hay tai lai TikTok roi thu lai.',
  };
}

async function handleSendComment(request) {
  const payload = request.payload || {};
  const url = normalizeTikTokUrl(payload);
  const text = String(payload.message || payload.text || '').trim();

  if (!url) {
    return {
      ok: false,
      final: true,
      error: 'Thieu link video TikTok chuan. Hay lay comment lai bang link video dang https://www.tiktok.com/@kenh/video/id hoac dam bao co ten kenh.',
    };
  }
  if (!text) {
    return { ok: false, final: true, error: 'Nhap noi dung binh luan truoc khi gui' };
  }

  // First try background cookie/API publish to avoid flaky DOM automation.
  const apiResult = await publishCommentFromBackground({ ...payload, message: text }, url, '');
  if (apiResult?.ok) return apiResult;

  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabLoaded(tab.id);
  await sleep(2500);

  const response = await sendMessageWithRetries(tab.id, {
    type: 'STREAL_TIKTOK_DO_COMMENT',
    requestId: request.requestId,
    payload: { ...payload, url, message: text },
  });
  if (response?.ok) return response;

  return {
    ok: false,
    final: true,
    error: conciseSendError(apiResult?.error, response?.error),
    url,
  };
}

async function openTikTokCommentContext(request) {
  const payload = request.payload || {};
  const url = normalizeTikTokUrl({
    ...payload,
    post_url: payload.comment_url || payload.url || payload.post_url,
  });
  if (!url) {
    return {
      ok: false,
      final: true,
      error: 'Thieu link video TikTok de mo dung comment.',
    };
  }

  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabLoaded(tab.id);
  await sleep(2500);
  const response = await sendMessageWithRetries(tab.id, {
    type: 'STREAL_TIKTOK_FOCUS_COMMENT',
    requestId: request.requestId,
    payload: { ...payload, url },
  });
  if (response?.ok) return response;
  return {
    ok: false,
    final: true,
    url,
    error: response?.error || 'Da mo video TikTok nhung chua dinh vi duoc comment.',
  };
}

async function collectTikTokChannelVideos(request) {
  const payload = request.payload || {};
  const rawChannel = String(payload.channel || payload.channel_url || payload.url || '').trim();
  const maxVideos = Math.max(1, Math.min(Number(payload.max_videos || 20) || 20, 50));
  const handle = rawChannel.match(/tiktok\.com\/@([^/?#]+)/i)?.[1] || rawChannel.replace(/^@+/, '').trim();
  if (!handle) {
    return { ok: false, final: true, error: 'Thieu link kenh TikTok hoac @username de gom video.' };
  }
  const channelUrl = rawChannel.includes('tiktok.com')
    ? rawChannel
    : `${TIKTOK_HOST}/@${encodeURIComponent(handle)}`;

  const tab = await chrome.tabs.create({ url: channelUrl, active: true });
  await waitForTabLoaded(tab.id, 35000);
  await sleep(4000);

  let result = { ok: false, videos: [], error: 'Khong gom duoc video tu trang TikTok.' };
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [maxVideos],
      func: async (limit) => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const normalize = (href) => {
          try {
            const url = new URL(href, window.location.href);
            const match = url.href.match(/\/@([^/?#]+)\/video\/(\d{8,})/);
            if (!match) return null;
            return {
              video_id: match[2],
              post_url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`,
              channel_name: `@${match[1]}`,
              video_title: '',
            };
          } catch {
            return null;
          }
        };
        const collect = () => {
          const byId = new Map();
          document.querySelectorAll('a[href*="/video/"]').forEach((a) => {
            const item = normalize(a.href);
            if (!item || byId.has(item.video_id)) return;
            const cardText = (a.closest('div')?.innerText || a.getAttribute('title') || '').trim();
            item.video_title = cardText.slice(0, 180) || `Video ${item.video_id}`;
            byId.set(item.video_id, item);
          });
          return Array.from(byId.values());
        };

        window.scrollTo(0, 0);
        await sleep(1000);
        let rows = collect();
        for (let i = 0; i < 18 && rows.length < limit; i += 1) {
          window.scrollBy(0, Math.max(700, window.innerHeight || 900));
          await sleep(1200);
          rows = collect();
        }
        return {
          ok: rows.length > 0,
          videos: rows.slice(0, limit),
          page_title: document.title,
          url: window.location.href,
        };
      },
    });
    result = injected?.[0]?.result || result;
  } catch (error) {
    result = { ok: false, videos: [], error: error?.message || String(error) };
  }

  try {
    const closeResult = chrome.tabs.remove(tab.id);
    if (closeResult?.catch) closeResult.catch(() => {});
  } catch (error) {
    // Khong chan ket qua gom video neu Chrome khong dong duoc tab phu.
  }
  if (!result.ok) {
    return {
      ok: false,
      final: true,
      error: result.error || 'Chrome da mo kenh TikTok nhung khong thay link video. Hay mo kenh cong khai va thu lai.',
      videos: result.videos || [],
    };
  }
  return {
    ok: true,
    final: true,
    videos: result.videos || [],
    url: result.url || channelUrl,
    message: `Da gom ${result.videos?.length || 0} video tu Chrome`,
  };
}

async function collectTikTokDomComments(request) {
  const payload = request.payload || {};
  const maxVideos = Math.max(1, Math.min(Number(payload.max_videos || 8) || 8, 50));
  const limitPerVideo = Math.max(1, Math.min(Number(payload.limit_per_video || 80) || 80, 300));
  let videos = Array.isArray(payload.videos) ? payload.videos : [];
  if (!videos.length) {
    const collected = await collectTikTokChannelVideos({
      requestId: request.requestId,
      payload: {
        channel: payload.channel || payload.channel_url || payload.url || '',
        max_videos: maxVideos,
      },
    });
    if (!collected?.ok || !collected.videos?.length) {
      return {
        ok: false,
        final: true,
        error: collected?.error || 'Khong gom duoc video TikTok bang Chrome.',
        videos: [],
      };
    }
    videos = collected.videos;
  }

  const results = [];
  const cookieInfo = await getTikTokCookies();
  for (const video of videos.slice(0, maxVideos)) {
    const url = normalizeTikTokUrl(video) || String(video.post_url || video.url || '').trim();
    if (!url) continue;
    const apiResult = await fetchTikTokCommentsByApi(video, limitPerVideo, cookieInfo);
    if (apiResult.ok && apiResult.comments.length) {
      results.push({
        ...video,
        video_id: video.video_id || getVideoId(video, url),
        post_url: url,
        video_title: video.video_title || `Video ${getVideoId(video, url)}`,
        comments: apiResult.comments,
        error: '',
        method: 'chrome-api',
      });
      continue;
    }

    const tab = await chrome.tabs.create({ url, active: true });
    await waitForTabLoaded(tab.id, 35000);
    await sleep(3500);

    let result = { ok: false, comments: [], error: 'Khong scrape duoc comment TikTok.' };
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [limitPerVideo],
        func: async (limit) => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
          const simpleHash = (value) => {
            let hash = 0;
            const text = String(value || '');
            for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
            return Math.abs(hash).toString(36);
          };
          const clickCommentPanel = () => {
            const selectors = [
              '[data-e2e="comment-icon"]',
              'button[aria-label*="comment" i]',
              'button[aria-label*="bình luận" i]',
              'div[role="button"][aria-label*="comment" i]',
            ];
            for (const selector of selectors) {
              const node = Array.from(document.querySelectorAll(selector)).find(isVisible);
              if (node) {
                try { node.click(); } catch {}
                return true;
              }
            }
            return false;
          };
          const findCommentScroller = () => {
            const candidates = [];
            document.querySelectorAll('[data-e2e*="comment"], [class*="Comment"], [class*="comment"], [role="tabpanel"], aside, section, div').forEach((node) => {
              if (!isVisible(node)) return;
              const rect = node.getBoundingClientRect();
              const extra = node.scrollHeight - node.clientHeight;
              if (rect.left < window.innerWidth * 0.45 || rect.height < 220 || rect.width < 240 || extra < 60) return;
              const attr = `${node.className || ''} ${node.getAttribute('data-e2e') || ''}`.toLowerCase();
              const text = normalize(node.innerText || node.textContent || '').slice(0, 400).toLowerCase();
              let score = extra / 20;
              if (attr.includes('comment')) score += 220;
              if (text.includes('bình luận') || text.includes('comment')) score += 120;
              if (text.includes('bạn có thể thích') || text.includes('you may like')) score -= 260;
              candidates.push({ node, score });
            });
            candidates.sort((a, b) => b.score - a.score);
            return candidates[0]?.score >= 120 ? candidates[0].node : null;
          };
          const expandReplies = () => {
            Array.from(document.querySelectorAll('button, [role="button"], div, span')).slice(0, 1500).forEach((node) => {
              if (!isVisible(node)) return;
              const rect = node.getBoundingClientRect();
              if (rect.left < window.innerWidth * 0.45) return;
              const text = normalize(node.innerText || node.textContent || '').toLowerCase();
              if (/xem\s+\d*\s*(câu\s+)?trả\s+lời/.test(text) || /view\s+\d*\s*repl/.test(text)) {
                try { node.click(); } catch {}
              }
            });
          };
          const parseComment = (node, index) => {
            const rect = node.getBoundingClientRect();
            if (rect.left < window.innerWidth * 0.45) return null;
            const rawLines = String(node.innerText || node.textContent || '')
              .split(/\n+/)
              .map((line) => normalize(line))
              .filter(Boolean);
            const lines = rawLines.filter((line) => {
              const lower = line.toLowerCase();
              if (!lower || lower === 'bình luận' || lower === 'comments' || lower === 'bạn có thể thích') return false;
              if (lower.includes('sponsored') || lower.includes('learn more')) return false;
              if (/^\d+\s*bình luận$/.test(lower)) return false;
              return true;
            });
            if (!lines.length) return null;
            const joined = lines.join(' ');
            if (joined.length < 2 || joined.length > 900) return null;
            if (!/(trả lời|reply|giờ trước|phút trước|ngày trước|tuần trước|-\d|^\w)/i.test(joined)) return null;
            const author = lines[0]?.slice(0, 80) || 'Ẩn danh';
            const messageParts = lines.slice(1).filter((line) => {
              const lower = line.toLowerCase();
              if (/^(trả lời|reply|like|thích|xem.*trả lời|view.*repl)/.test(lower)) return false;
              if (/^\d+(\.\d+)?[kmb]?$/.test(lower)) return false;
              if (/^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm)\s+trước$/.test(lower)) return false;
              if (/^\d{1,2}-\d{1,2}$/.test(lower)) return false;
              return true;
            });
            const text = normalize(messageParts.join(' ') || lines.slice(1).join(' ') || joined);
            if (!text || text === author || text.length < 2) return null;
            return {
              id: `dom_${simpleHash(`${author}|${text}|${index}`)}`,
              author_name: author,
              author_id: author,
              text,
              depth: 0,
            };
          };
          const collect = () => {
            const byKey = new Map();
            const selectors = [
              '[data-e2e*="comment-level"]',
              '[data-e2e*="comment-item"]',
              '[class*="CommentItem"]',
              '[class*="DivCommentContent"]',
              '[class*="comment-item"]',
              'div',
            ];
            let index = 0;
            for (const selector of selectors) {
              document.querySelectorAll(selector).forEach((node) => {
                if (byKey.size >= limit) return;
                if (!isVisible(node)) return;
                const item = parseComment(node, index);
                index += 1;
                if (!item) return;
                const key = `${item.author_name}|${item.text}`.toLowerCase();
                if (!byKey.has(key)) byKey.set(key, item);
              });
              if (byKey.size >= limit) break;
            }
            return Array.from(byKey.values()).slice(0, limit);
          };

          clickCommentPanel();
          await sleep(1200);
          let scroller = findCommentScroller();
          if (!scroller) {
            return {
              ok: false,
              comments: [],
              comment_count: 0,
              page_title: document.title,
              url: window.location.href,
              error: 'Khong xac dinh duoc panel binh luan TikTok, bo qua de tranh cuon nham video.',
            };
          }
          let rows = collect();
          for (let i = 0; i < 22 && rows.length < limit; i += 1) {
            expandReplies();
            const delta = Math.max(420, Math.floor((scroller.clientHeight || window.innerHeight || 800) * 0.75));
            try { scroller.scrollBy({ top: delta, behavior: 'smooth' }); } catch { scroller.scrollTop += delta; }
            scroller.dispatchEvent(new Event('scroll', { bubbles: false }));
            await sleep(950);
            scroller = findCommentScroller() || scroller;
            rows = collect();
          }
          return {
            ok: rows.length > 0,
            comments: rows,
            comment_count: rows.length,
            page_title: document.title,
            url: window.location.href,
          };
        },
      });
      result = injected?.[0]?.result || result;
    } catch (error) {
      result = { ok: false, comments: [], error: error?.message || String(error) };
    }

    results.push({
      ...video,
      video_id: video.video_id || getVideoId(video, url),
      post_url: url,
      video_title: video.video_title || result.page_title || `Video ${getVideoId(video, url)}`,
      comments: result.comments || [],
      error: result.error || apiResult.error || '',
      method: result.comments?.length ? 'chrome-dom' : 'chrome-dom-failed',
    });

    try {
      const closeResult = chrome.tabs.remove(tab.id);
      if (closeResult?.catch) closeResult.catch(() => {});
    } catch {}
  }

  const totalComments = results.reduce((sum, item) => sum + (item.comments?.length || 0), 0);
  return {
    ok: totalComments > 0,
    final: true,
    videos: results,
    comment_count: totalComments,
    video_count: results.length,
    message: `Chrome da lay ${totalComments} comment tu ${results.length} video TikTok`,
    error: totalComments ? '' : 'Chrome da mo video TikTok nhung chua scrape duoc comment nao tu DOM.',
  };
}

const FACEBOOK_QUEUE_STORAGE_KEY = 'streal_facebook_group_queue_v1';
const cancelledFacebookQueueRequests = new Set();

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (value) => resolve(value?.[key] || null)));
}

function storageSet(key, value) {
  return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
}

function storageRemove(key) {
  return new Promise((resolve) => chrome.storage.local.remove([key], resolve));
}

function tabExists(tabId) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve(false);
      return;
    }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(tab?.id));
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve({ ok: false, error: 'Thieu tab dich' });
      return;
    }
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: true });
    });
  });
}

async function notifyFacebookQueue(queue, status, extra = {}) {
  if (!queue?.originTabId) return;
  await sendTabMessage(queue.originTabId, {
    type: 'STREAL_FACEBOOK_GROUP_QUEUE_PROGRESS',
    requestId: queue.requestId,
    status,
    completedCount: queue.index || 0,
    targetCount: queue.tasks?.length || 0,
    ...extra,
  });
}

async function sendFacebookPrepareWithRetries(tabId, payload) {
  let lastError = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await shouldStopFacebookQueue(payload.requestId)) {
      return { ok: false, final: true, cancelled: true };
    }
    const response = await sendTabMessage(tabId, {
      type: 'STREAL_FACEBOOK_PREPARE_GROUP_POST',
      payload,
    });
    if (response?.ok || response?.final) return response;
    lastError = response?.error || lastError;
    await sleep(500);
  }
  return { ok: false, error: lastError || 'Extension chua ket noi duoc tab Facebook.' };
}

async function shouldStopFacebookQueue(requestId) {
  if (cancelledFacebookQueueRequests.has(requestId)) return true;
  const current = await storageGet(FACEBOOK_QUEUE_STORAGE_KEY);
  return !current || current.requestId !== requestId || current.status === 'cancelled';
}

function facebookTargetUrl(task, recentFirst = false) {
  const targetType = task?.type === 'page' ? 'page' : 'group';
  const targetId = encodeURIComponent(String(task?.id || ''));
  if (targetType === 'page') return `https://www.facebook.com/${targetId}${recentFirst ? '/?sk=posts' : ''}`;
  return `https://www.facebook.com/groups/${targetId}${recentFirst ? '/?sorting_setting=CHRONOLOGICAL' : ''}`;
}

function assignKnownFacebookMetrics(target, source) {
  const mappings = [
    ['reaction_count', 'reaction_count'],
    ['comment_count', 'comment_count'],
    ['share_count', 'share_count'],
  ];
  for (const [targetKey, sourceKey] of mappings) {
    const value = source?.[sourceKey];
    if (value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0) {
      target[targetKey] = Math.trunc(Number(value));
    }
  }
}

async function resolveMissingFacebookQueueReferences(queue) {
  const missing = (queue.results || []).filter((item) => (
    item?.ok
    && item.delivery !== 'pending_review'
    && !item.post_id
    && !item.post_url
  ));
  if (!missing.length || !queue.facebookTabId) return queue;
  queue.status = 'resolving_references';
  await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
  if (queue.originTabId) {
    try { await chrome.tabs.update(queue.originTabId, { active: true }); } catch {}
  }
  await notifyFacebookQueue(queue, 'resolving_references', { missingCount: missing.length });

  for (const result of missing) {
    if (await shouldStopFacebookQueue(queue.requestId)) break;
    const task = (queue.tasks || []).find((item) => item.type === result.type && String(item.id) === String(result.id));
    if (!task) continue;
    try {
      await chrome.tabs.update(queue.facebookTabId, { url: facebookTargetUrl(task, true), active: false });
      await waitForTabLoaded(queue.facebookTabId, 45000);
      await sleep(1200);
      const resolved = await sendTabMessage(queue.facebookTabId, {
        type: 'STREAL_FACEBOOK_FIND_PUBLISHED_POST',
        payload: { message: task.message, targetType: task.type, targetId: task.id },
      });
      if (!resolved?.ok || !resolved.postUrl) continue;
      if (resolved.postId) result.post_id = String(resolved.postId);
      result.post_url = String(resolved.postUrl || '');
      result.delivery = 'published';
      result.reference_method = 'facebook_feed_match';
      assignKnownFacebookMetrics(result, resolved);
      await persistFacebookQueueHistory(queue, 'resolving_references');
    } catch {
      // Keep the published result; the backend/UI can retry reference discovery later.
    }
  }
  return queue;
}

async function collectFacebookPostMetrics(message) {
  const payload = message?.payload || {};
  const postUrl = String(payload.postUrl || payload.post_url || '').trim();
  let parsed = null;
  try {
    parsed = new URL(postUrl);
  } catch {
    return { ok: false, error: 'Link bài Facebook không hợp lệ.' };
  }
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'facebook.com' && !parsed.hostname.endsWith('.facebook.com'))) {
    return { ok: false, error: 'Chỉ hỗ trợ permalink trên facebook.com.' };
  }

  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: postUrl, active: false });
    await waitForTabLoaded(tab.id, 45000);
    await sleep(1500);
    const result = await sendTabMessage(tab.id, {
      type: 'STREAL_FACEBOOK_READ_POST_METRICS',
      payload: { message: String(payload.message || payload.content || '') },
    });
    return result?.ok ? result : { ok: false, error: result?.error || 'Không đọc được tương tác từ Facebook.' };
  } finally {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
  }
}

async function findFacebookPostReference(message, sender) {
  const payload = message?.payload || {};
  const task = {
    type: payload.targetType === 'page' || payload.target_type === 'page' ? 'page' : 'group',
    id: String(payload.targetId || payload.target_id || '').trim(),
    message: String(payload.message || payload.content || '').trim(),
  };
  if (!task.id || !task.message) return { ok: false, error: 'Thiếu nơi đăng hoặc nội dung bài để dò link.' };
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: facebookTargetUrl(task, true), active: true });
    await waitForTabLoaded(tab.id, 45000);
    await sleep(1500);
    const result = await sendTabMessage(tab.id, {
      type: 'STREAL_FACEBOOK_FIND_PUBLISHED_POST',
      payload: { message: task.message, targetType: task.type, targetId: task.id },
    });
    return result?.ok ? result : { ok: false, error: result?.error || 'Không tìm thấy bài khớp nội dung trên Facebook.' };
  } finally {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
    if (sender?.tab?.id) {
      try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
    }
  }
}

async function openCurrentFacebookQueueTask(queue) {
  if (await shouldStopFacebookQueue(queue?.requestId)) return { ok: true, cancelled: true };
  const task = queue?.tasks?.[queue.index];
  if (!task) {
    await resolveMissingFacebookQueueReferences(queue);
    queue.status = 'done';
    await persistFacebookQueueHistory(queue, 'done');
    await notifyFacebookQueue(queue, 'done', { results: queue.results || [] });
    if (queue?.originTabId) {
      try { await chrome.tabs.update(queue.originTabId, { active: true }); } catch {}
    }
    await storageRemove(FACEBOOK_QUEUE_STORAGE_KEY);
    return { ok: true, done: true };
  }

  const targetType = task.type === 'page' ? 'page' : 'group';
  const targetUrl = facebookTargetUrl(task);
  await notifyFacebookQueue(queue, 'opening', {
    targetType,
    targetId: task.id,
    targetName: task.name,
    groupId: task.id,
    groupName: task.name,
    currentNumber: queue.index + 1,
  });

  let tab = null;
  if (queue.facebookTabId) {
    try {
      tab = await chrome.tabs.update(queue.facebookTabId, { url: targetUrl, active: true });
    } catch {
      tab = null;
    }
  }
  if (!tab) tab = await chrome.tabs.create({ url: targetUrl, active: true });
  queue.facebookTabId = tab.id;
  queue.status = 'opening';
  await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
  await waitForTabLoaded(tab.id, 45000);
  await sleep(1500);
  if (await shouldStopFacebookQueue(queue.requestId)) return { ok: true, cancelled: true };

  const response = await sendFacebookPrepareWithRetries(tab.id, {
    requestId: queue.requestId,
    taskId: task.taskId,
    targetType,
    targetId: task.id,
    targetName: task.name,
    groupId: task.id,
    groupName: task.name,
    message: task.message,
    media: task.media || [],
  });
  if (await shouldStopFacebookQueue(queue.requestId)) return { ok: true, cancelled: true };
  if (!response?.ok) {
    queue.status = 'paused';
    queue.error = response?.error || 'Khong dien duoc bai viet tren Facebook.';
    await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
    await notifyFacebookQueue(queue, 'error', {
      targetType,
      targetId: task.id,
      targetName: task.name,
      groupId: task.id,
      groupName: task.name,
      error: queue.error,
    });
    return { ok: false, error: queue.error };
  }

  queue.status = response.auto_submit ? 'auto_submitting' : 'ready';
  queue.error = '';
  await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
  await notifyFacebookQueue(queue, response.auto_submit ? 'auto_ready' : 'ready', {
    targetType,
    targetId: task.id,
    targetName: task.name,
    groupId: task.id,
    groupName: task.name,
    currentNumber: queue.index + 1,
    mediaAttachedCount: Math.max(0, Number(response.media_attached_count || 0) || 0),
  });
  return { ok: true, ready: true };
}

async function startFacebookGroupQueue(request, sender) {
  const payload = request.payload || {};
  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const tasks = rawTasks.slice(0, 50).map((task, index) => {
    const media = (Array.isArray(task.media) ? task.media : [])
      .slice(0, 10)
      .map((item) => ({
        url: String(item?.url || '').trim(),
        type: item?.type === 'video' ? 'video' : 'image',
        name: String(item?.name || '').trim(),
      }))
      .filter((item) => /^https?:\/\//i.test(item.url));
    return {
      taskId: String(task.taskId || `${request.requestId || Date.now()}_${index}`),
      type: task.type === 'page' ? 'page' : 'group',
      id: String(task.id || task.groupId || '').trim(),
      name: String(task.name || task.groupName || task.id || '').trim(),
      message: String(task.message || '').trim(),
      media,
    };
  }).filter((task) => task.id && task.message);
  if (!tasks.length) return { ok: false, error: 'Chua co Facebook Group/Page va noi dung hop le.' };

  const existing = await storageGet(FACEBOOK_QUEUE_STORAGE_KEY);
  const existingIsActive = existing?.tasks?.length
    && existing.index < existing.tasks.length
    && !['paused', 'done', 'cancelled'].includes(existing.status);
  const existingAgeMs = existing?.createdAt
    ? Math.max(0, Date.now() - new Date(existing.createdAt).getTime())
    : Number.POSITIVE_INFINITY;
  const existingFacebookTabAlive = existingIsActive
    ? await tabExists(existing.facebookTabId)
    : false;
  // A queue left at `ready` means an older extension prepared Facebook but the
  // user closed the composer or reloaded the web app before confirmation. A new
  // queue explicitly replaces that abandoned attempt. Any active queue is also
  // safe to replace after a long extension/browser interruption.
  const canReplaceExisting = existingIsActive
    && (existing.status === 'ready' || !existingFacebookTabAlive || existingAgeMs > 10 * 60 * 1000);
  if (existingIsActive && !canReplaceExisting) {
    return {
      ok: false,
      error: 'Dang co mot hang doi Facebook chua hoan thanh.',
      activeRequestId: String(existing.requestId || ''),
      activeStatus: String(existing.status || ''),
    };
  }

  const queue = {
    requestId: String(request.requestId || `facebook_queue_${Date.now()}`),
    originTabId: sender?.tab?.id || null,
    facebookTabId: canReplaceExisting ? (existing.facebookTabId || null) : null,
    index: 0,
    status: 'queued',
    tasks,
    results: [],
    createdAt: new Date().toISOString(),
  };
  cancelledFacebookQueueRequests.delete(queue.requestId);
  await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
  void persistFacebookQueueHistory(queue, 'pending');
  openCurrentFacebookQueueTask(queue).catch(async (error) => {
    if (await shouldStopFacebookQueue(queue.requestId)) return;
    queue.status = 'paused';
    queue.error = error?.message || String(error);
    await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
    await persistFacebookQueueHistory(queue, 'failed', queue.error);
    await notifyFacebookQueue(queue, 'error', { error: queue.error });
  });
  return { ok: true, accepted: true, targetCount: tasks.length };
}

async function cancelFacebookGroupQueue(request) {
  const requestId = String(request.requestId || '').trim();
  if (!requestId) return { ok: false, error: 'Thieu ma hang doi Facebook.' };

  const queue = await storageGet(FACEBOOK_QUEUE_STORAGE_KEY);
  if (!queue || queue.requestId !== requestId) {
    return { ok: true, cancelled: true, alreadyStopped: true };
  }
  if (queue.status === 'done' || queue.status === 'cancelled') {
    return { ok: true, cancelled: true, alreadyStopped: true };
  }

  cancelledFacebookQueueRequests.add(requestId);
  queue.status = 'cancelled';
  queue.cancelledAt = new Date().toISOString();
  queue.error = '';
  await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
  await persistFacebookQueueHistory(queue, 'cancelled', 'Nguoi dung da huy hang doi');
  if (queue.facebookTabId) {
    await sendTabMessage(queue.facebookTabId, {
      type: 'STREAL_FACEBOOK_CANCEL_GROUP_POST',
      requestId,
    });
  }
  await notifyFacebookQueue(queue, 'cancelled', {
    cancelledAt: queue.cancelledAt,
    results: queue.results || [],
  });
  return {
    ok: true,
    cancelled: true,
    completedCount: queue.index || 0,
    targetCount: queue.tasks?.length || 0,
  };
}

async function resolveFacebookPostReference(request, sender) {
  const payload = request.payload || {};
  const targetType = payload.target_type === 'page' ? 'page' : 'group';
  const targetId = String(payload.target_id || '').trim();
  const content = String(payload.content || '').replace(/\s+/g, ' ').trim();
  if (!targetId || !content) return { ok: false, error: 'Thiếu nơi đăng hoặc nội dung để tự tìm bài Facebook.' };

  const query = encodeURIComponent(content.slice(0, 100));
  const targetUrl = targetType === 'group'
    ? `https://www.facebook.com/groups/${encodeURIComponent(targetId)}/search/?q=${query}`
    : `https://www.facebook.com/${encodeURIComponent(targetId)}/search/?q=${query}`;
  const tab = await chrome.tabs.create({ url: targetUrl, active: true });
  try {
    await waitForTabLoaded(tab.id, 45000);
    await sleep(1600);
    let response = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      response = await sendTabMessage(tab.id, {
        type: 'STREAL_FACEBOOK_FIND_EXISTING_POST',
        payload: { content, target_type: targetType, target_id: targetId },
      });
      if (response?.ok || response?.ambiguous || response?.final) break;
      await sleep(500);
    }
    if (response?.ok) {
      try { await chrome.tabs.remove(tab.id); } catch {}
      if (sender?.tab?.id) {
        try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
      }
      return response;
    }
    return response || { ok: false, error: 'Extension không tìm thấy bài Facebook khớp nội dung.' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function collectFacebookPostData(request, sender) {
  const payload = request.payload || {};
  const postUrl = String(payload.post_url || '').trim();
  let parsed = null;
  try { parsed = new URL(postUrl); } catch {}
  if (!parsed || !parsed.hostname.endsWith('facebook.com')) {
    return { ok: false, error: 'Thiếu permalink Facebook hợp lệ để đọc tương tác.' };
  }
  const tab = await chrome.tabs.create({ url: postUrl, active: true });
  try {
    await waitForTabLoaded(tab.id, 45000);
    await sleep(1600);
    let response = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      response = await sendTabMessage(tab.id, {
        type: 'STREAL_FACEBOOK_COLLECT_POST_DATA',
        payload,
      });
      if (response?.ok || response?.final) break;
      await sleep(500);
    }
    if (response?.ok) {
      try { await chrome.tabs.remove(tab.id); } catch {}
      if (sender?.tab?.id) {
        try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
      }
      return response;
    }
    return response || { ok: false, error: 'Extension không đọc được dữ liệu bài Facebook.' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
    if (sender?.tab?.id) {
      try { await chrome.tabs.update(sender.tab.id, { active: true }); } catch {}
    }
  }
}

async function handleFacebookQueueEvent(message, sender) {
  const queue = await storageGet(FACEBOOK_QUEUE_STORAGE_KEY);
  if (!queue || queue.requestId !== message.requestId) return { ok: false, error: 'Khong tim thay hang doi Facebook.' };
  if (queue.status === 'cancelled') return { ok: false, cancelled: true, error: 'Hang doi Facebook da bi huy.' };
  const task = queue.tasks?.[queue.index];
  if (!task || task.taskId !== message.taskId) return { ok: false, error: 'Bai dang hien tai khong khop hang doi.' };
  if (queue.facebookTabId && sender?.tab?.id && queue.facebookTabId !== sender.tab.id) {
    return { ok: false, error: 'Xac nhan den tu sai tab Facebook.' };
  }

  if (['auto_submit_error', 'facebook_error', 'confirmation_timeout'].includes(message.status)) {
    queue.status = 'paused';
    queue.error = message.error || 'Facebook khong xac nhan duoc thao tac dang.';
    await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
    await persistFacebookQueueHistory(queue, 'failed', queue.error);
    await notifyFacebookQueue(queue, 'error', {
      targetType: task.type,
      targetId: task.id,
      targetName: task.name,
      groupId: task.id,
      groupName: task.name,
      currentNumber: queue.index + 1,
      error: queue.error,
    });
    return { ok: false, error: queue.error };
  }

  if (message.status !== 'confirmed') {
    await notifyFacebookQueue(queue, message.status || 'progress', {
      targetType: task.type,
      targetId: task.id,
      targetName: task.name,
      groupId: task.id,
      groupName: task.name,
      currentNumber: queue.index + 1,
      error: message.error || '',
    });
    return { ok: true };
  }

  const confirmedResult = {
    ok: true,
    type: task.type,
    id: task.id,
    name: task.name,
    confirmedAt: message.confirmedAt || new Date().toISOString(),
    delivery: ['published', 'pending_review'].includes(message.outcome) ? message.outcome : 'submitted',
    post_id: message.postId || '',
    post_url: message.postUrl || '',
    method: message.automatic ? 'auto-chrome-composer' : 'user-confirmed-chrome',
    reference_method: message.referenceMethod || '',
  };
  assignKnownFacebookMetrics(confirmedResult, {
    reaction_count: message.reactionCount,
    comment_count: message.commentCount,
    share_count: message.shareCount,
  });
  queue.results = [...(queue.results || []), confirmedResult];
  queue.index += 1;
  queue.status = queue.index >= queue.tasks.length ? 'done' : 'advancing';
  await storageSet(FACEBOOK_QUEUE_STORAGE_KEY, queue);
  await persistFacebookQueueHistory(queue, queue.status === 'done' ? 'done' : 'progress');
  await notifyFacebookQueue(queue, 'confirmed', {
    targetType: task.type,
    targetId: task.id,
    targetName: task.name,
    groupId: task.id,
    groupName: task.name,
    completedCount: queue.index,
    outcome: ['published', 'pending_review'].includes(message.outcome) ? message.outcome : 'submitted',
    postId: message.postId || '',
    postUrl: message.postUrl || '',
    reactionCount: message.reactionCount,
    commentCount: message.commentCount,
    shareCount: message.shareCount,
  });
  if (await shouldStopFacebookQueue(queue.requestId)) {
    return { ok: true, cancelled: true, completedCount: queue.index, targetCount: queue.tasks.length };
  }
  await openCurrentFacebookQueueTask(queue);
  return { ok: true, completedCount: queue.index, targetCount: queue.tasks.length };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'STREAL_EXTENSION_SET_API_ORIGIN') {
    if (!isAllowedApiOrigin(message.origin)) {
      sendResponse({ ok: false, error: 'API origin khong hop le' });
      return false;
    }
    chrome.storage.local.set({ [STREAL_API_ORIGIN_KEY]: message.origin })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_SAVE_PUBLIC_FACEBOOK_CONTACT') {
    saveFacebookPublicContact(message.payload || {})
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_COLLECT_MESSENGER_THREAD') {
    collectMessengerThread(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_COLLECT_ZALO_THREAD') {
    collectZaloThread(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_START_FACEBOOK_GROUP_QUEUE') {
    startFacebookGroupQueue(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_CANCEL_FACEBOOK_GROUP_QUEUE') {
    cancelFacebookGroupQueue(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_COLLECT_FACEBOOK_POST_METRICS') {
    collectFacebookPostMetrics(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_RESOLVE_FACEBOOK_POST') {
    resolveFacebookPostReference(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_FIND_FACEBOOK_POST_REFERENCE') {
    findFacebookPostReference(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_COLLECT_FACEBOOK_POST_DATA') {
    collectFacebookPostData(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_FACEBOOK_GROUP_QUEUE_EVENT') {
    handleFacebookQueueEvent(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_GET_FACEBOOK_COOKIE') {
    getFacebookCookies()
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, cookie: '', error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_COLLECT_TIKTOK_VIDEOS') {
    collectTikTokChannelVideos(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error), videos: [] }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_COLLECT_TIKTOK_DOM_COMMENTS') {
    collectTikTokDomComments(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error), videos: [] }));
    return true;
  }
  if (message?.type === 'STREAL_EXTENSION_OPEN_TIKTOK_COMMENT') {
    openTikTokCommentContext(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type !== 'STREAL_EXTENSION_SEND_COMMENT') return false;
  handleSendComment(message)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error) }));
  return true;
});

