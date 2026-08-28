(() => {
  const CONTROL_TEXT = /^(thích|like|trả lời|reply|chuyển tiếp|forward|gửi|send|đã xem|seen|active now|đang hoạt động|nhập tin nhắn|message|messenger)$/i;

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function hashString(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function profileIdFromUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      if (!url.hostname.endsWith('facebook.com') && !url.hostname.endsWith('messenger.com')) return '';
      const id = url.searchParams.get('id');
      if (id) return id;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'profile.php') return id || '';
      if (parts[0] === 'user' && parts[1]) return parts[1];
      if (parts[0] && !/^(messages|groups|pages|events|marketplace|watch|reel|photo|share|t|e2ee)$/i.test(parts[0])) return parts[0];
    } catch {
      // ignored
    }
    return '';
  }

  function conversationIdFromUrl(value) {
    try {
      const url = new URL(String(value || window.location.href), window.location.href);
      const parts = url.pathname.split('/').filter(Boolean);
      const e2eeIndex = parts.findIndex((part) => part === 'e2ee');
      if (e2eeIndex >= 0 && parts[e2eeIndex + 1] === 't' && parts[e2eeIndex + 2]) return decodeURIComponent(parts[e2eeIndex + 2]);
      const tIndex = parts.findIndex((part) => part === 't');
      if (tIndex >= 0 && parts[tIndex + 1]) return decodeURIComponent(parts[tIndex + 1]);
      const thread = url.searchParams.get('thread_id') || url.searchParams.get('tid');
      if (thread) return thread;
    } catch {
      // ignored
    }
    return '';
  }

  function conversationTitle() {
    const title = normalize(document.title.replace(/\(\d+\)\s*/g, '').replace(/\s*[-|]\s*Messenger.*$/i, '').replace(/\s*[-|]\s*Facebook.*$/i, ''));
    const heading = [...document.querySelectorAll('h1, h2, [role="heading"]')]
      .map((node) => normalize(node.innerText || node.textContent || ''))
      .find((text) => text && text.length < 120 && !/messenger|facebook|đoạn chat|chats/i.test(text));
    return heading || title || 'Messenger';
  }

  function collectParticipants(root) {
    const byKey = new Map();
    [...root.querySelectorAll('a[href]')].forEach((anchor) => {
      if (!isVisible(anchor)) return;
      const href = anchor.href || '';
      const id = profileIdFromUrl(href);
      if (!id) return;
      const name = normalize(anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || '');
      if (!name || CONTROL_TEXT.test(name) || name.length > 120) return;
      const key = id || href;
      if (!byKey.has(key)) {
        byKey.set(key, { id, name, profile_url: href });
      }
    });
    const heading = conversationTitle();
    if (heading && ![...byKey.values()].some((item) => item.name === heading)) {
      byKey.set(`title:${heading}`, { id: '', name: heading, profile_url: '' });
    }
    return [...byKey.values()].slice(0, 20);
  }

  function messageTextFromNode(node) {
    const leaves = [...node.querySelectorAll('[dir="auto"], span, div')]
      .filter((child) => isVisible(child) && !child.querySelector('[dir="auto"]'))
      .map((child) => normalize(child.innerText || child.textContent || ''))
      .filter((text) => text && text.length <= 2000 && !CONTROL_TEXT.test(text));
    const unique = [...new Set(leaves)];
    if (unique.length) return unique.join('\n').slice(0, 5000);
    return normalize(node.innerText || node.textContent || '').slice(0, 5000);
  }

  function senderFromNode(node) {
    const aria = normalize(node.getAttribute('aria-label') || '');
    const text = normalize(node.innerText || node.textContent || '');
    const combined = `${aria} ${text}`;
    const self = /(^|\b)(bạn đã gửi|you sent|you:|bạn:)(\b|:)/i.test(combined);
    const senderMatch = aria.match(/^(.+?)\s+(?:đã gửi|sent)\b/i) || combined.match(/(?:tin nhắn của|message from)\s+(.+?)(?:[:·]|$)/i);
    const senderName = normalize(senderMatch?.[1] || (self ? 'Nhân viên' : 'Khách hàng'));
    return {
      sender_name: senderName,
      sender_id: '',
      sender_type: self ? 'staff' : 'customer',
      direction: self ? 'outgoing' : 'incoming',
      sender_is_self: self,
    };
  }

  function isLikelyConversationMessage(node, text) {
    if (!text || text.length > 5000) return false;
    if (CONTROL_TEXT.test(text)) return false;
    if (/^(\d{1,2}:\d{2}|hôm nay|today|thứ \w+|mon|tue|wed|thu|fri|sat|sun)$/i.test(text)) return false;
    const nav = node.closest('[role="navigation"], [aria-label*="Chats"], [aria-label*="Danh sách"], [data-pagelet*="LeftRail"]');
    if (nav) return false;
    return true;
  }

  function collectMessages(root, limit) {
    const nodes = [
      ...root.querySelectorAll('[data-testid*="message"], [data-testid*="mwchat"], [role="row"], [aria-label*="Tin nhắn"], [aria-label*="Message"]'),
    ].filter((node) => node instanceof Element && isVisible(node));
    const byKey = new Map();
    nodes.forEach((node, index) => {
      const text = messageTextFromNode(node);
      if (!isLikelyConversationMessage(node, text)) return;
      const sender = senderFromNode(node);
      const timestamp = normalize(node.querySelector('time, abbr')?.getAttribute('datetime') || node.querySelector('abbr')?.getAttribute('data-utime') || '');
      const key = `${sender.sender_name}|${text}|${timestamp || index}`;
      if (byKey.has(key)) return;
      byKey.set(key, {
        message_id: `dom_${hashString(key)}`,
        text,
        sent_at: timestamp && /^\d+$/.test(timestamp) ? new Date(Number(timestamp) * 1000).toISOString() : timestamp,
        dom_index: index,
        ...sender,
      });
    });
    const rows = [...byKey.values()];
    return rows.slice(Math.max(0, rows.length - limit));
  }

  function collectMessengerThread(payload = {}) {
    const host = window.location.hostname;
    const path = window.location.pathname;
    if (!host.endsWith('messenger.com') && !(host.endsWith('facebook.com') && /\/messages\b/.test(path))) {
      return { ok: false, final: true, error: 'Tab hiện tại không phải Messenger/Facebook Messages.' };
    }
    const root = document.querySelector('[role="main"]') || document.body;
    const limit = Math.max(20, Math.min(Number(payload.limit || 120), 300));
    const messages = collectMessages(root, limit);
    const title = conversationTitle();
    const conversationUrl = window.location.href;
    const conversationId = conversationIdFromUrl(conversationUrl) || `url_${hashString(conversationUrl)}`;
    return {
      ok: messages.length > 0,
      final: true,
      source: 'chrome_dom',
      conversation_id: conversationId,
      conversation_url: conversationUrl,
      conversation_title: title,
      customer_name: title,
      participants: collectParticipants(root),
      messages,
      count: messages.length,
      captured_at: new Date().toISOString(),
      warning: messages.length ? 'PoC chỉ đọc các tin nhắn đang được Messenger render trên màn hình/tab hiện tại.' : 'Không thấy bong bóng tin nhắn trong hội thoại đang mở.',
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'STREAL_MESSENGER_COLLECT_THREAD') return false;
    try {
      sendResponse(collectMessengerThread(message.payload || {}));
    } catch (error) {
      sendResponse({ ok: false, final: true, error: error?.message || String(error) });
    }
    return false;
  });
})();
