(() => {
  const CONTROL_TEXT = /^(aa|soạn|nhập tin nhắn|nhập @, tin nhắn|message|write a message|type a message|gửi|send|đã gửi|sent|đã xem|seen|đang nhập|typing|zalo|tất cả|all|chưa đọc|unread|tìm kiếm|search|thông báo|notifications|tắt thông báo|mute notifications|trang cá nhân|profile|thông tin|info|file|ảnh|photo|video|sticker|gif)$/i;
  const SYSTEM_TEXT = /^(tin nhắn và cuộc gọi|bạn đã tạo nhóm này|bạn chưa kết nối|các bạn không phải|giờ đây, các bạn|now you can|cuộc gọi|missed call|đã thu hồi|recalled|đã ghim|pinned|đã đổi|changed|đã thêm|added|đã rời|left)\b/i;
  const MENU_TEXT = /^(đoạn chat|tin nhắn|danh bạ|khám phá|nhật ký|cloud của tôi|zalo ai|todo|media|file phương tiện|quyền riêng tư|privacy|cài đặt|settings|tùy chỉnh|customize)$/i;

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

  function isTimestampText(text) {
    const value = normalize(text);
    return /^(\d{1,2}:\d{2})(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?$/.test(value)
      || /^(hôm nay|today|hôm qua|yesterday)(?:,?\s+lúc)?\s+\d{1,2}:\d{2}$/i.test(value)
      || /^\d{1,2}:\d{2}\s+\d{1,2}\s+tháng\s+\d{1,2},?\s+\d{4}$/i.test(value)
      || /^(đã gửi|sent|đã xem|seen)\s*(\d{1,2}:\d{2})?$/i.test(value);
  }

  function isLikelyMessageText(text, title = '') {
    const value = normalize(text);
    if (!value || value.length > 2000) return false;
    if (!/[0-9a-zà-ỹ]/i.test(value)) return false;
    if (CONTROL_TEXT.test(value)) return false;
    if (SYSTEM_TEXT.test(value)) return false;
    if (MENU_TEXT.test(value)) return false;
    if (isTimestampText(value)) return false;
    if (title && value.toLowerCase() === normalize(title).toLowerCase()) return false;
    if (/^(hôm nay|today|hôm qua|yesterday|thứ \w+|mon|tue|wed|thu|fri|sat|sun)$/i.test(value)) return false;
    return true;
  }

  function rectScoreForCenter(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return -9999;
    const viewportCenter = window.innerWidth / 2;
    const center = rect.left + rect.width / 2;
    const centerPenalty = Math.abs(center - viewportCenter) / Math.max(1, window.innerWidth);
    const widthScore = rect.width >= 420 && rect.width <= window.innerWidth * 0.9 ? 90 : 0;
    const heightScore = Math.min(90, rect.height / 8);
    return widthScore + heightScore - centerPenalty * 120;
  }

  function isComposerCandidate(node) {
    if (!isVisible(node)) return false;
    const label = normalize(`${node.getAttribute('aria-label') || ''} ${node.getAttribute('placeholder') || ''} ${node.getAttribute('role') || ''} ${node.className || ''}`);
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.48) return false;
    return /nhập.*tin nhắn|tin nhắn|message|textbox|compose|chat/i.test(label)
      || node.isContentEditable
      || node.matches('textarea, input');
  }

  function findComposer() {
    return [
      ...document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea, input[placeholder], input[aria-label]'),
    ].find(isComposerCandidate) || null;
  }

  function findThreadShell() {
    const composer = findComposer();
    if (composer) {
      let current = composer.parentElement;
      let best = null;
      let bestScore = -9999;
      for (let depth = 0; current && depth < 18; depth += 1, current = current.parentElement) {
        if (!isVisible(current)) continue;
        const rect = current.getBoundingClientRect();
        if (rect.height < window.innerHeight * 0.5 || rect.width < 420) continue;
        if (rect.width > window.innerWidth * 0.92) continue;
        const score = rectScoreForCenter(rect);
        if (score > bestScore) {
          best = current;
          bestScore = score;
        }
      }
      if (best) return best;
    }
    const candidates = [
      ...document.querySelectorAll('[role="main"], main, [class*="chat"], [class*="conversation"], [class*="message"]'),
    ].filter((node) => isVisible(node));
    return candidates.sort((a, b) => rectScoreForCenter(b.getBoundingClientRect()) - rectScoreForCenter(a.getBoundingClientRect()))[0]
      || document.body;
  }

  function threadBounds(shell) {
    const rect = shell?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return {
        left: Math.max(0, rect.left - 8),
        right: Math.min(window.innerWidth, rect.right + 8),
        top: Math.max(0, rect.top - 8),
        bottom: Math.min(window.innerHeight, rect.bottom + 8),
        width: rect.width,
      };
    }
    return {
      left: window.innerWidth * 0.24,
      right: window.innerWidth * 0.78,
      top: 0,
      bottom: window.innerHeight,
      width: window.innerWidth * 0.54,
    };
  }

  function isInsideThreadColumn(node, shell, bounds) {
    if (!isVisible(node)) return false;
    if (shell && shell !== document.body && !shell.contains(node)) return false;
    const rect = node.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    if (center < bounds.left || center > bounds.right) return false;
    if (rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2) return false;
    const blocked = node.closest('[role="navigation"], nav, aside, [class*="sidebar"], [class*="left"], [class*="right-info"], [class*="contact-list"]');
    return !blocked;
  }

  function findConversationTitle(shell, bounds) {
    const blocked = /^(zalo|tin nhắn|đoạn chat|thông báo|notifications|tất cả|all)$/i;
    const nodes = [
      ...document.querySelectorAll('h1, h2, h3, [role="heading"], [class*="header"] strong, [class*="header"] span, [class*="title"], [class*="name"]'),
    ];
    const candidates = [];
    nodes.forEach((node) => {
      if (!isInsideThreadColumn(node, shell, bounds)) return;
      const rect = node.getBoundingClientRect();
      if (rect.top > bounds.top + Math.max(170, window.innerHeight * 0.22)) return;
      const text = normalize(node.innerText || node.textContent || node.getAttribute('title') || node.getAttribute('aria-label') || '');
      if (!text || text.length > 120 || CONTROL_TEXT.test(text) || MENU_TEXT.test(text) || blocked.test(text)) return;
      candidates.push({ text, score: 200 - rect.top + Math.min(60, text.length) });
    });
    candidates.sort((a, b) => b.score - a.score);
    const fromCandidate = candidates[0]?.text || '';
    if (fromCandidate) return fromCandidate;
    const title = normalize(document.title.replace(/\(\d+\)\s*/g, '').replace(/\s*[-|]\s*Zalo.*$/i, ''));
    return title && !blocked.test(title) ? title : 'Zalo';
  }

  function conversationIdFromContext(title) {
    try {
      const url = new URL(window.location.href);
      const parts = url.pathname.split('/').filter(Boolean);
      for (const key of ['chat', 'conversation', 'convo', 't']) {
        const idx = parts.indexOf(key);
        if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
      }
      for (const name of ['id', 'uid', 'phone', 'thread_id', 'conversation_id']) {
        const value = url.searchParams.get(name) || new URLSearchParams(url.hash.replace(/^#/, '')).get(name);
        if (value) return value;
      }
      const hash = normalize(url.hash);
      if (hash && hash !== '#') return `hash_${hashString(hash)}`;
    } catch {
      // ignored
    }
    return `zalo_${hashString(`${window.location.href}|${title}`)}`;
  }

  function collectParticipants(title) {
    if (!title || /^zalo$/i.test(title)) return [];
    return [{ id: '', name: title, profile_url: '' }];
  }

  function senderFromNode(node, shellBounds) {
    const aria = normalize(node.getAttribute('aria-label') || '');
    const classes = normalize(node.className || '');
    const rect = node.getBoundingClientRect();
    const geometrySelf = rect.left > shellBounds.left + shellBounds.width * 0.52;
    const classSelf = /\b(me|self|mine|right|owner|sent|out|outgoing)\b|message-out|msg-out|chat-item-me|bubble-me/i.test(classes);
    const self = classSelf || geometrySelf || /(^|\b)(bạn|you)\s*:/i.test(aria);
    return {
      sender_name: self ? 'Nhân viên' : 'Khách hàng',
      sender_id: '',
      sender_type: self ? 'staff' : 'customer',
      direction: self ? 'outgoing' : 'incoming',
      sender_is_self: self,
    };
  }

  function messageRootForLeaf(node) {
    let current = node;
    let best = node;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      const classes = normalize(current.className || '');
      if (/(message|msg|chat|bubble|item)/i.test(classes)) {
        best = current;
        if (rect.width < Math.min(820, window.innerWidth * 0.7) && rect.height < 320) return current;
      }
      if (rect.width > 0 && rect.width < Math.min(760, window.innerWidth * 0.62) && rect.height < 260) {
        best = current;
      }
    }
    return best;
  }

  function displayTimeNear(node) {
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      const explicit = normalize(
        current.querySelector?.('time, abbr')?.getAttribute('datetime')
        || current.querySelector?.('abbr')?.getAttribute('data-utime')
        || '',
      );
      if (explicit) return explicit;
      const text = normalize(current.innerText || current.textContent || '');
      const match = text.match(/(?:^|\s)(\d{1,2}:\d{2}(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?)(?:\s|$)/);
      if (match?.[1]) return match[1];
      const ariaTime = normalize(current.getAttribute?.('aria-label') || '').match(/(\d{1,2}:\d{2}(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?)/)?.[1] || '';
      if (ariaTime) return ariaTime;
    }
    return '';
  }

  function hasTextChildWithSameText(node, text) {
    const children = [...(node.children || [])].filter((child) => normalize(child.innerText || child.textContent || ''));
    if (!children.length) return false;
    const childText = normalize(children.map((child) => child.innerText || child.textContent || '').join(' '));
    return childText === text;
  }

  function collectMessages(root, limit, title, bounds) {
    const rawNodes = [
      ...root.querySelectorAll('[dir="auto"], span, p, div[class*="text"], div[class*="content"], div[class*="bubble"], [data-id] span'),
    ].filter((node) => node instanceof Element && isInsideThreadColumn(node, root, bounds));
    const byKey = new Map();
    let lastDisplayTime = '';
    rawNodes.forEach((node, index) => {
      const text = normalize(node.innerText || node.textContent || '');
      if (isTimestampText(text)) {
        lastDisplayTime = text;
        return;
      }
      if (!isLikelyMessageText(text, title)) return;
      if (hasTextChildWithSameText(node, text)) return;
      const messageRoot = messageRootForLeaf(node);
      if (!isInsideThreadColumn(messageRoot, root, bounds)) return;
      if (messageRoot.closest?.('[contenteditable="true"], textarea, input, [role="textbox"]')) return;
      const rootText = normalize(messageRoot.innerText || messageRoot.textContent || '');
      if (rootText.length > 2400 || MENU_TEXT.test(rootText) || SYSTEM_TEXT.test(rootText)) return;
      const sender = senderFromNode(messageRoot, bounds);
      const timestamp = displayTimeNear(messageRoot);
      const displayTime = timestamp || lastDisplayTime || '';
      const rawId = messageRoot.getAttribute('data-id') || messageRoot.getAttribute('id') || '';
      const key = `${sender.direction}|${text}|${displayTime}|${rawId || index}`;
      if (byKey.has(key)) return;
      byKey.set(key, {
        message_id: `zalo_dom_${hashString(key)}`,
        text,
        sent_at: timestamp && /^\d+$/.test(timestamp) ? new Date(Number(timestamp) * 1000).toISOString() : '',
        display_time: displayTime,
        dom_index: index,
        source: 'zalo_web_dom',
        ...sender,
      });
    });
    const rows = [...byKey.values()];
    return rows.slice(Math.max(0, rows.length - limit));
  }

  function collectZaloThread(payload = {}) {
    const host = window.location.hostname;
    if (!host.endsWith('zalo.me')) {
      return { ok: false, final: true, error: 'Tab hiện tại không phải Zalo Web.' };
    }
    const shell = findThreadShell();
    const bounds = threadBounds(shell);
    const limit = Math.max(20, Math.min(Number(payload.limit || 120), 300));
    const title = findConversationTitle(shell, bounds);
    const messages = collectMessages(shell, limit, title, bounds);
    const conversationUrl = window.location.href;
    const conversationId = conversationIdFromContext(title);
    return {
      ok: messages.length > 0,
      final: true,
      source: 'zalo_web_dom',
      conversation_id: conversationId,
      conversation_url: conversationUrl,
      conversation_title: title,
      customer_name: title,
      participants: collectParticipants(title),
      messages,
      count: messages.length,
      captured_at: new Date().toISOString(),
      warning: messages.length ? 'Chỉ đọc các bong bóng chat thật đang hiển thị trong hội thoại Zalo Web.' : 'Không thấy bong bóng tin nhắn trong hội thoại Zalo đang mở.',
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'STREAL_ZALO_COLLECT_THREAD') return false;
    try {
      sendResponse(collectZaloThread(message.payload || {}));
    } catch (error) {
      sendResponse({ ok: false, final: true, error: error?.message || String(error) });
    }
    return false;
  });
})();
