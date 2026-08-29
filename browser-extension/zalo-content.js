(() => {
  const CONTROL_TEXT = /^(aa|soạn|nhập tin nhắn|nhập @, tin nhắn|message|write a message|type a message|gửi|send|đã gửi|sent|đã xem|seen|đang nhập|typing|zalo|tất cả|all|chưa đọc|unread|tìm kiếm|search|thông báo|notifications|tắt thông báo|mute notifications|trang cá nhân|profile|thông tin|info|file|ảnh|photo|video|sticker|gif|emoji|like)$/i;
  const SYSTEM_TEXT = /^(tin nhắn và cuộc gọi|bạn đã tạo nhóm này|bạn chưa kết nối|các bạn không phải|giờ đây, các bạn|now you can|cuộc gọi|missed call|đã thu hồi|recalled|đã ghim|pinned|đã đổi|changed|đã thêm|added|đã rời|left)\b/i;
  const MENU_TEXT = /^(đoạn chat|tin nhắn|danh bạ|khám phá|nhật ký|cloud của tôi|zalo ai|todo|media|file phương tiện|quyền riêng tư|privacy|cài đặt|settings|tùy chỉnh|customize)$/i;
  const ICON_CODE_TEXT = /^(?:\/-)?(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)$|^(?:>|<|:o|:-o|:-h|:-\(\(|:\(\(|:\)|:-\)|;\)|;-\)|:d|:-d|:\*|:-\*)$/i;

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) !== 0;
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

  function textQuality(value) {
    const text = normalize(value);
    if (!text) return 0;
    const letters = (text.match(/[0-9a-zà-ỹ]/gi) || []).length;
    const symbols = (text.match(/[^0-9a-zà-ỹ\s]/gi) || []).length;
    return letters - symbols * 0.35;
  }

  function isTimestampText(text) {
    const value = normalize(text);
    return /^(\d{1,2}:\d{2})(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?$/.test(value)
      || /^(hôm nay|today|hôm qua|yesterday)(?:,?\s+lúc)?\s+\d{1,2}:\d{2}$/i.test(value)
      || /^\d{1,2}:\d{2}\s+\d{1,2}\s+tháng\s+\d{1,2},?\s+\d{4}$/i.test(value)
      || /^(đã gửi|sent|đã xem|seen)\s*(\d{1,2}:\d{2})?$/i.test(value);
  }

  function isNoiseText(text, title = '') {
    const value = normalize(text);
    if (!value || value.length > 2000) return true;
    if (ICON_CODE_TEXT.test(value)) return true;
    if (/^\/[-a-z0-9_]+$/i.test(value)) return true;
    if (value.includes('/-') && /\/-(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/i.test(value) && !/[à-ỹ]/i.test(value)) return true;
    if (value.length <= 6 && /^[:;\-><()dpho*]+$/i.test(value)) return true;
    if (!/[0-9a-zà-ỹ]/i.test(value)) return true;
    if (CONTROL_TEXT.test(value)) return true;
    if (SYSTEM_TEXT.test(value)) return true;
    if (MENU_TEXT.test(value)) return true;
    if (isTimestampText(value)) return true;
    if (title && value.toLowerCase() === normalize(title).toLowerCase()) return true;
    if (/^(hôm nay|today|hôm qua|yesterday|thứ \w+|mon|tue|wed|thu|fri|sat|sun)$/i.test(value)) return true;
    return false;
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
    const blocked = node.closest('[role="navigation"], nav, aside, [class*="sidebar"], [class*="left"], [class*="right-info"], [class*="contact-list"], [class*="toolbar"], [class*="compose"], [class*="emoji"], [class*="sticker"]');
    return !blocked;
  }

  function cleanTitleText(value) {
    let text = normalize(value).replace(/^zalo\s*[-–|]\s*/i, '').replace(/\s*[-–|]\s*zalo$/i, '');
    text = text.replace(/\b(vừa truy cập|online|offline|đang hoạt động|last seen|active)\b.*$/i, '').trim();
    if (!text || text.length > 120 || textQuality(text) < Math.max(2, text.length * 0.2)) return '';
    if (CONTROL_TEXT.test(text) || MENU_TEXT.test(text) || SYSTEM_TEXT.test(text) || ICON_CODE_TEXT.test(text)) return '';
    if (text.includes('/-') && /\/-(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/i.test(text) && !/[à-ỹ]/i.test(text)) return '';
    return text;
  }

  function findConversationTitle(shell, bounds) {
    const headerSelectors = [
      '[class*="header"] [title]',
      '[class*="header"] [class*="name"]',
      '[class*="header"] strong',
      '[class*="header"] span',
      'h1',
      'h2',
      '[role="heading"]',
      '[class*="conv"] [class*="name"]',
      '[class*="chat"] [class*="title"]',
    ];
    const candidates = [];
    document.querySelectorAll(headerSelectors.join(', ')).forEach((node) => {
      if (!isInsideThreadColumn(node, shell, bounds)) return;
      const rect = node.getBoundingClientRect();
      if (rect.top > bounds.top + Math.max(140, window.innerHeight * 0.18)) return;
      const text = cleanTitleText(node.getAttribute('title') || node.innerText || node.textContent || node.getAttribute('aria-label') || '');
      if (!text) return;
      candidates.push({ text, score: 300 - rect.top + Math.min(80, text.length) });
    });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]?.text) return candidates[0].text;
    const title = cleanTitleText(document.title.replace(/\(\d+\)\s*/g, ''));
    return title || 'Zalo';
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
    return `zalo_title_${hashString(title || 'unknown')}`;
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
    const classSelf = /\b(me|self|mine|right|owner|sent|out|outgoing)\b|message-out|msg-out|chat-item-me|bubble-me|msg-sent/i.test(classes);
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
    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      const classes = normalize(current.className || '');
      if (/(message|msg|chat|bubble|item)/i.test(classes) && !/(toolbar|compose|input|emoji|sticker)/i.test(classes)) {
        best = current;
        if (rect.width < Math.min(900, window.innerWidth * 0.74) && rect.height < 420) return current;
      }
      if (rect.width > 0 && rect.width < Math.min(800, window.innerWidth * 0.68) && rect.height < 320) {
        best = current;
      }
    }
    return best;
  }

  function displayTimeNear(node) {
    let current = node;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const explicit = normalize(
        current.querySelector?.('time, abbr')?.getAttribute('datetime')
        || current.querySelector?.('abbr')?.getAttribute('data-utime')
        || '',
      );
      if (explicit) return explicit;
      const ariaTime = normalize(current.getAttribute?.('aria-label') || '').match(/(\d{1,2}:\d{2}(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?)/)?.[1] || '';
      if (ariaTime) return ariaTime;
      const text = normalize(current.innerText || current.textContent || '');
      const match = text.match(/(?:^|\s)(\d{1,2}:\d{2}(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?)(?:\s|$)/);
      if (match?.[1]) return match[1];
    }
    return '';
  }

  function hasTextChildWithSameText(node, text) {
    const children = [...(node.children || [])].filter((child) => normalize(child.innerText || child.textContent || ''));
    if (!children.length) return false;
    const childText = normalize(children.map((child) => child.innerText || child.textContent || '').join(' '));
    return childText === text;
  }

  function collectMediaUrls(root) {
    const urls = new Set();
    root.querySelectorAll?.('img, video, source').forEach((node) => {
      if (!isVisible(node)) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) return;
      const raw = node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('poster') || '';
      const src = normalize(raw);
      if (!src || /^(blob:|data:)/i.test(src)) return;
      if (/avatar|emoji|sticker|icon|reaction/i.test(src)) return;
      try {
        const url = new URL(src, window.location.href);
        if (url.protocol === 'https:') urls.add(url.href);
      } catch {
        // ignored
      }
    });
    root.querySelectorAll?.('[style*="background"]').forEach((node) => {
      if (!isVisible(node)) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) return;
      const style = window.getComputedStyle(node).backgroundImage || '';
      const match = style.match(/url\(["']?(.+?)["']?\)/);
      if (!match?.[1] || /^(blob:|data:)/i.test(match[1])) return;
      try {
        const url = new URL(match[1], window.location.href);
        if (url.protocol === 'https:' && !/avatar|emoji|sticker|icon|reaction/i.test(url.href)) urls.add(url.href);
      } catch {
        // ignored
      }
    });
    return [...urls].slice(0, 10);
  }

  function findMessageScroller(shell, bounds) {
    const childNodes = shell.querySelectorAll ? [...shell.querySelectorAll('*')] : [];
    const candidates = [shell, ...childNodes].filter((node) => {
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < Math.min(360, bounds.width * 0.55) || rect.height < 220) return false;
      if (rect.left + rect.width / 2 < bounds.left || rect.left + rect.width / 2 > bounds.right) return false;
      const style = window.getComputedStyle(node);
      const scrollable = /(auto|scroll|overlay)/i.test(style.overflowY || '') || node.scrollHeight > node.clientHeight + 80;
      return scrollable && node.scrollHeight > node.clientHeight + 80;
    });
    candidates.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    return candidates[0] || document.scrollingElement || document.documentElement;
  }

  function collectMessages(root, limit, title, bounds, seed = '', round = 0) {
    const rawNodes = [
      ...root.querySelectorAll('[data-id], [data-msg-id], [class*="message"], [class*="msg"], [class*="bubble"], [dir="auto"], span, p'),
    ].filter((node) => node instanceof Element && isInsideThreadColumn(node, root, bounds));
    const byKey = new Map();
    let lastDisplayTime = '';
    rawNodes.forEach((node, index) => {
      const text = normalize(node.innerText || node.textContent || '');
      if (isTimestampText(text)) {
        lastDisplayTime = text;
        return;
      }
      const messageRoot = messageRootForLeaf(node);
      if (!isInsideThreadColumn(messageRoot, root, bounds)) return;
      if (messageRoot.closest?.('[contenteditable="true"], textarea, input, [role="textbox"], [class*="toolbar"], [class*="compose"], [class*="emoji"], [class*="sticker"]')) return;
      const mediaUrls = collectMediaUrls(messageRoot);
      const hasText = !isNoiseText(text, title) && !hasTextChildWithSameText(node, text);
      if (!hasText && !mediaUrls.length) return;
      const finalText = hasText ? text : '[Ảnh]';
      const rootText = normalize(messageRoot.innerText || messageRoot.textContent || '');
      if (rootText.length > 2800 || SYSTEM_TEXT.test(rootText) || MENU_TEXT.test(rootText) || ICON_CODE_TEXT.test(rootText)) return;
      const sender = senderFromNode(messageRoot, bounds);
      const displayTime = displayTimeNear(messageRoot) || lastDisplayTime || '';
      const rawId = messageRoot.getAttribute('data-id') || messageRoot.getAttribute('data-msg-id') || messageRoot.getAttribute('id') || '';
      const stableKey = rawId
        ? `${sender.direction}|${rawId}`
        : `${sender.direction}|${finalText}|${displayTime}|${mediaUrls.join('|')}`;
      const key = `${seed}|${stableKey}`;
      if (byKey.has(key)) return;
      byKey.set(key, {
        message_id: `zalo_dom_${hashString(key)}`,
        text: finalText,
        sent_at: '',
        display_time: displayTime,
        dom_index: index,
        capture_round: round,
        source: 'zalo_web_dom',
        media_urls: mediaUrls,
        media_type: mediaUrls.length ? 'image' : 'text',
        ...sender,
      });
    });
    const rows = [...byKey.values()];
    return rows.slice(Math.max(0, rows.length - limit));
  }

  function mergeMessages(target, rows) {
    rows.forEach((row) => {
      const key = `${row.direction}|${row.text}|${row.display_time || ''}|${(row.media_urls || []).join('|')}`;
      target.set(key, { ...target.get(key), ...row });
    });
  }

  async function collectAcrossScroll(shell, bounds, title, limit, payload = {}) {
    const messages = new Map();
    const scroller = findMessageScroller(shell, bounds);
    const isPageScroller = scroller === document.scrollingElement || scroller === document.documentElement;
    const originalTop = isPageScroller ? window.scrollY : scroller.scrollTop;
    const maxScrolls = Math.max(1, Math.min(Number(payload.maxScrolls || 28), 80));
    const pauseMs = Math.max(250, Math.min(Number(payload.pauseMs || 650), 1800));
    const deep = payload.deep !== false;
    const seed = conversationIdFromContext(title);

    mergeMessages(messages, collectMessages(shell, limit, title, bounds, seed, 0));
    if (!deep || messages.size >= limit) {
      return [...messages.values()]
        .sort((a, b) => Number(a.dom_index || 0) - Number(b.dom_index || 0))
        .slice(-limit);
    }

    let stableRounds = 0;
    for (let step = 0; step < maxScrolls && messages.size < limit; step += 1) {
      const beforeTop = isPageScroller ? window.scrollY : scroller.scrollTop;
      const beforeCount = messages.size;
      const jump = Math.max(360, Math.floor((scroller.clientHeight || window.innerHeight) * 0.85));
      if (isPageScroller) {
        window.scrollTo(0, Math.max(0, beforeTop - jump));
      } else {
        scroller.scrollTop = Math.max(0, beforeTop - jump);
      }
      await sleep(pauseMs);
      mergeMessages(messages, collectMessages(shell, limit, title, bounds, seed, step + 1));
      const afterTop = isPageScroller ? window.scrollY : scroller.scrollTop;
      if (messages.size === beforeCount && Math.abs(afterTop - beforeTop) < 12) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }
      if (stableRounds >= 2) break;
    }

    try {
      if (isPageScroller) window.scrollTo(0, originalTop);
      else scroller.scrollTop = originalTop;
    } catch {
      // ignored
    }
    const rows = [...messages.values()].sort((a, b) => (
      (Number(b.capture_round || 0) - Number(a.capture_round || 0))
      || (Number(a.dom_index || 0) - Number(b.dom_index || 0))
    ));
    return rows.slice(Math.max(0, rows.length - limit));
  }

  async function collectZaloThread(payload = {}) {
    const host = window.location.hostname;
    if (!host.endsWith('zalo.me')) {
      return { ok: false, final: true, error: 'Tab hiện tại không phải Zalo Web.' };
    }
    const shell = findThreadShell();
    const bounds = threadBounds(shell);
    const limit = Math.max(20, Math.min(Number(payload.limit || 500), 1000));
    const title = findConversationTitle(shell, bounds);
    const conversationUrl = window.location.href;
    const conversationId = conversationIdFromContext(title);
    const messages = await collectAcrossScroll(shell, bounds, title, limit, payload);
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
      warning: messages.length
        ? `Đã quét ${messages.length} tin nhắn Zalo đang render qua nhiều lần cuộn. Nếu còn thiếu tin cũ, cuộn lên thêm rồi đồng bộ lại.`
        : 'Không thấy bong bóng tin nhắn trong hội thoại Zalo đang mở.',
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'STREAL_ZALO_COLLECT_THREAD') return false;
    collectZaloThread(message.payload || {})
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error) }));
    return true;
  });
})();
