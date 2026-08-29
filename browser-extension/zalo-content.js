(() => {
  const CONTROL_TEXT = /^(aa|soạn|soạn tin nhắn|nhập tin nhắn|nhập @, tin nhắn|message|write a message|type a message|gửi|send|đã gửi|sent|đã xem|seen|đang nhập|typing|zalo|tất cả|all|chưa đọc|unread|tìm kiếm|search|thông báo|notifications|tắt thông báo|mute notifications|trang cá nhân|profile|thông tin|info|file|ảnh|photo|video|sticker|gif|emoji|like)$/i;
  const SYSTEM_TEXT = /^(tin nhắn và cuộc gọi|bạn đã tạo nhóm này|bạn chưa kết nối|các bạn không phải|giờ đây, các bạn|now you can|cuộc gọi|missed call|đã thu hồi|recalled|đã ghim|pinned|đã đổi|changed|đã thêm|added|đã rời|left)\b/i;
  const MENU_TEXT = /^(đoạn chat|tin nhắn|danh bạ|khám phá|nhật ký|cloud của tôi|zalo ai|todo|media|file phương tiện|quyền riêng tư|privacy|cài đặt|settings|tùy chỉnh|customize)$/i;
  const ICON_CODE_TEXT = /^(?:\/-)?(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)$|^(?:>|<|:o|:-o|:-h|:-\(\(|:\(\(|:\)|:-\)|;\)|;-\)|:d|:-d|:\*|:-\*)$/i;
  const HEADER_NOISE_TEXT = /^(người lạ|stranger|nhóm chung(?:\s*\(\d+\))?|mutual groups?|gửi kết bạn|gửi yêu cầu kết bạn.*|thêm bạn|kết bạn|more|xem thêm)$/i;
  const MESSAGE_CONTENT_CLASS_RE = /(bubble|message-content|msg-content|chat-content|text-content|content-message)/i;
  const MESSAGE_ROW_CLASS_RE = /(message-item|msg-item|chat-item|zmessage|message-row|msg-row)/i;
  const BLOCKED_REGION_SELECTOR = '[role="navigation"], nav, aside, [class*="sidebar"], [class*="contact-list"], [class*="right-info"], [class*="toolbar"], [class*="compose"], [class*="emoji-picker"]';
  const QUOTED_CONTENT_SELECTOR = '[class*="quoted"], [class*="quote-content"], [class*="quote-message"], [class*="reference"], [class*="reply-preview"], [data-quoted="true"]';
  const MESSAGE_CONTROL_SELECTOR = 'button, [role="button"], [class*="reaction"], [class*="menu-button"], [class*="tooltip"]';

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextPaint() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });
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

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && Number(style.opacity || 1) !== 0;
  }

  function rectOverlap(a, b) {
    if (!a || !b) return 0;
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  function isInsideScrollerViewport(node, scroller) {
    if (!node || !scroller || !scroller.contains(node) || !isVisible(node)) return false;
    const rect = node.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    return rectOverlap(rect, viewport) > 0
      && rect.right > viewport.left
      && rect.left < viewport.right;
  }

  function textQuality(value) {
    const text = normalize(value);
    if (!text) return 0;
    const letters = (text.match(/[0-9a-zà-ỹ]/gi) || []).length;
    const symbols = (text.match(/[^0-9a-zà-ỹ\s]/gi) || []).length;
    return letters - symbols * 0.35;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function validDateParts(day, month, year) {
    const probe = new Date(year, month - 1, day);
    return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
  }

  function parseTimelineMarker(value, now = new Date()) {
    const text = normalize(value);
    if (!text || text.length > 80) return null;
    const lower = text.toLocaleLowerCase('vi-VN');
    if (/^(đã gửi|sent|đã xem|seen)(?:\s+\d{1,2}:\d{2})?$/.test(lower)) {
      return { kind: 'status', text };
    }

    let match = lower.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      const day = Number(match[3]);
      const month = Number(match[4]);
      const year = Number(match[5].length === 2 ? `20${match[5]}` : match[5]);
      if (hour < 24 && minute < 60 && validDateParts(day, month, year)) {
        return { kind: 'datetime', text, hour, minute, day, month, year, dateKey: `${year}-${pad2(month)}-${pad2(day)}` };
      }
    }

    match = lower.match(/^(?:(?:t|thứ)\s*[2-7]|cn|chủ nhật)?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      if (validDateParts(day, month, year)) {
        return { kind: 'date', text, day, month, year, dateKey: `${year}-${pad2(month)}-${pad2(day)}` };
      }
    }

    match = lower.match(/^(hôm nay|today|hôm qua|yesterday)(?:,?\s+lúc)?(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (match) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (/hôm qua|yesterday/.test(match[1])) date.setDate(date.getDate() - 1);
      const marker = {
        kind: match[2] ? 'datetime' : 'date',
        text,
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        dateKey: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      };
      if (match[2]) {
        marker.hour = Number(match[2]);
        marker.minute = Number(match[3]);
      }
      return marker;
    }

    match = lower.match(/^(\d{1,2}):(\d{2})$/);
    if (match && Number(match[1]) < 24 && Number(match[2]) < 60) {
      return { kind: 'time', text, hour: Number(match[1]), minute: Number(match[2]) };
    }
    return null;
  }

  function isTimestampText(text) {
    return Boolean(parseTimelineMarker(text));
  }

  function markerIso(marker, fallbackDateKey = '') {
    if (!marker || !['time', 'datetime'].includes(marker.kind)) return '';
    const dateKey = marker.dateKey || fallbackDateKey;
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(marker.hour),
      Number(marker.minute),
      0,
      0,
    );
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function markerDisplayTime(marker, fallbackDateKey = '') {
    if (!marker || !['time', 'datetime'].includes(marker.kind)) return '';
    const timeText = `${pad2(marker.hour)}:${pad2(marker.minute)}`;
    const dateKey = marker.dateKey || fallbackDateKey;
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${timeText} ${Number(match[3])}/${Number(match[2])}/${match[1]}` : timeText;
  }

  function isNoiseText(text, title = '', { structuralMessage = false } = {}) {
    const value = normalize(text);
    if (!value || value.length > 5000) return true;
    if (ICON_CODE_TEXT.test(value)) return true;
    if (/^\/[-a-z0-9_]+$/i.test(value)) return true;
    if (value.includes('/-') && /\/(?:-)(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/i.test(value) && !/[à-ỹ]/i.test(value)) return true;
    if (!structuralMessage && value.length <= 6 && /^[:;\-><()dpho*]+$/i.test(value)) return true;
    if (!structuralMessage && !/[0-9a-zà-ỹ]/i.test(value)) return true;
    if (CONTROL_TEXT.test(value) || SYSTEM_TEXT.test(value) || MENU_TEXT.test(value) || HEADER_NOISE_TEXT.test(value)) return true;
    if (isTimestampText(value)) return true;
    if (!structuralMessage && title && value.toLocaleLowerCase('vi-VN') === normalize(title).toLocaleLowerCase('vi-VN')) return true;
    return false;
  }

  function cleanTitleText(value) {
    let text = normalize(value)
      .replace(/^zalo\s*[-–|]\s*/i, '')
      .replace(/\s*[-–|]\s*zalo$/i, '');
    text = text.replace(/\b(vừa truy cập|online|offline|đang hoạt động|last seen|active)\b.*$/i, '').trim();
    if (!text || text.length > 120 || textQuality(text) < Math.max(2, text.length * 0.2)) return '';
    if (CONTROL_TEXT.test(text) || MENU_TEXT.test(text) || SYSTEM_TEXT.test(text) || ICON_CODE_TEXT.test(text) || HEADER_NOISE_TEXT.test(text)) return '';
    if (/gửi yêu cầu kết bạn|nhóm chung|người lạ/i.test(text)) return '';
    if (text.includes('/-') && /\/(?:-)(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/i.test(text) && !/[à-ỹ]/i.test(text)) return '';
    return text;
  }

  function isComposerCandidate(node) {
    if (!isVisible(node)) return false;
    const label = normalize(`${node.getAttribute('aria-label') || ''} ${node.getAttribute('placeholder') || ''} ${node.getAttribute('role') || ''} ${node.className || ''}`);
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.45 || rect.width < 120) return false;
    return /nhập.*tin nhắn|tin nhắn|message|textbox|compose|chat-input/i.test(label)
      || node.isContentEditable
      || node.matches('textarea');
  }

  function findComposer() {
    return [
      ...document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea, input[placeholder], input[aria-label]'),
    ].filter(isComposerCandidate).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function findThreadShell(composer) {
    if (!composer) return document.body;
    let current = composer.parentElement;
    let best = composer.parentElement || document.body;
    for (let depth = 0; current && depth < 16; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      if (rect.height >= window.innerHeight * 0.55 && rect.width >= 420 && rect.width <= window.innerWidth * 0.96) {
        best = current;
        if (rect.height >= window.innerHeight * 0.8) break;
      }
    }
    return best || document.body;
  }

  function messageEvidence(node) {
    try {
      return Math.min(40, node.querySelectorAll('[data-id], [data-key], [data-msg-id], [data-message-id], [class*="message"], [class*="msg-"], [class*="bubble"], [class*="chat-item"]').length);
    } catch {
      return 0;
    }
  }

  function scoreScrollerCandidate(node, composer, shell) {
    if (!node || !isVisible(node)) return -Infinity;
    const rect = node.getBoundingClientRect();
    if (rect.width < Math.min(340, window.innerWidth * 0.32) || rect.height < 220) return -Infinity;
    if (composer && node.contains(composer)) return -Infinity;
    const classes = normalize(node.className || '');
    if (/(sidebar|contact-list|conversation-list|friend-list|nav-list|chat-input|composer)/i.test(classes)) return -Infinity;
    const style = window.getComputedStyle(node);
    const overflowAmount = Number(node.scrollHeight || 0) - Number(node.clientHeight || 0);
    const explicitlyScrollable = /(auto|scroll|overlay)/i.test(style.overflowY || '');
    if (!explicitlyScrollable && overflowAmount < 40) return -Infinity;
    const composerRect = composer?.getBoundingClientRect?.();
    const horizontalOverlap = composerRect
      ? Math.max(0, Math.min(rect.right, composerRect.right) - Math.max(rect.left, composerRect.left))
      : 0;
    let score = 220;
    if (explicitlyScrollable) score += 120;
    score += Math.min(160, Math.max(0, overflowAmount) / 12);
    score += Math.min(130, rect.height / 5);
    score += messageEvidence(node) * 14;
    if (composerRect && rect.bottom <= composerRect.top + 100) score += 100;
    if (composerRect && horizontalOverlap >= Math.min(rect.width, composerRect.width) * 0.55) score += 120;
    if (rect.left + rect.width / 2 > window.innerWidth * 0.42) score += 55;
    if (rect.width > window.innerWidth * 0.94) score -= 180;
    if (rect.left < window.innerWidth * 0.12 && rect.right < window.innerWidth * 0.62) score -= 160;
    if (shell && shell !== document.body && !shell.contains(node)) score -= 80;
    return score;
  }

  function findMessageScroller(shell, composer) {
    const scope = shell && shell !== document.body ? shell : document;
    const candidates = [...scope.querySelectorAll('main, section, [role="main"], div')]
      .map((node) => ({ node, score: scoreScrollerCandidate(node, composer, shell) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.node || null;
  }

  function headerCandidateText(node) {
    const ownText = normalize(node.innerText || node.textContent || '');
    const attrText = normalize(node.getAttribute('title') || node.getAttribute('aria-label') || '');
    const own = cleanTitleText(ownText);
    const attr = cleanTitleText(attrText);
    if (own && own.length <= 80) return own;
    return attr && attr.length <= 80 ? attr : '';
  }

  function scoreHeaderCandidate(node, scroller) {
    if (!isVisible(node) || scroller.contains(node)) return null;
    if (node.closest(`${BLOCKED_REGION_SELECTOR}, button, [role="button"]`)) return null;
    const rect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const bandTop = Math.max(0, scrollerRect.top - Math.min(280, window.innerHeight * 0.36));
    if (rect.top < bandTop || rect.bottom > scrollerRect.top + 24) return null;
    if (rect.right < scrollerRect.left || rect.left > scrollerRect.right) return null;
    if (rect.height > 82 || rect.width < 14 || rect.width > Math.min(620, scrollerRect.width * 0.72)) return null;
    const text = headerCandidateText(node);
    if (!text) return null;
    const style = window.getComputedStyle(node);
    const fontSize = Number.parseFloat(style.fontSize || '0') || 0;
    const fontWeight = Number.parseInt(style.fontWeight || '400', 10) || (/bold/i.test(style.fontWeight || '') ? 700 : 400);
    const classes = normalize(node.className || '');
    let score = fontSize * 12 + (fontWeight >= 600 ? 80 : 0);
    score += /header|conversation|chat-title|user-name|display-name/i.test(classes) ? 70 : 0;
    score -= Math.abs(rect.left - (scrollerRect.left + 32)) * 0.12;
    score -= Math.abs(rect.bottom - scrollerRect.top) * 0.1;
    score -= Math.max(0, text.length - 36) * 2;
    if (/^[A-ZÀ-Ỹ\s]+$/.test(text) && text.length > 3) score -= 80;
    return { node, text, score };
  }

  function findConversationHeader(scroller) {
    const selectors = [
      'h1', 'h2', 'h3', '[role="heading"]', 'strong', 'b', '[title]', '[aria-label]',
      '[class*="display-name"]', '[class*="user-name"]', '[class*="conversation-name"]',
      '[class*="chat-title"]', '[class*="header"] [class*="name"]', '[class*="truncate"]',
      '[class*="title"]', '[class*="name"]',
    ];
    const candidates = [...document.querySelectorAll(selectors.join(', '))]
      .map((node) => scoreHeaderCandidate(node, scroller))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (candidates[0]?.text) return candidates[0];
    const fallback = cleanTitleText(document.title.replace(/\(\d+\)\s*/g, ''));
    return { node: null, text: fallback || '', score: -1 };
  }

  function stableIdValue(value) {
    const text = normalize(value);
    if (!text || text.length < 4 || text.length > 300) return '';
    if (/^(active|selected|true|false|chat|conversation|panel|content|main|root|undefined|null)$/i.test(text)) return '';
    if (/\s{2,}/.test(text)) return '';
    return text;
  }

  function stableAttributeValue(name, value) {
    const text = stableIdValue(value);
    if (!text) return '';
    if (/^data-(conversation-id|thread-id|uid|user-id|zalo-id)$/.test(name)) return text;
    if (/^(data-id|data-key|id)$/.test(name)) {
      if (/^(chat|conversation|message|header|content|panel|view|main|root)[-_a-z]*$/i.test(text)) return '';
      if (!/\d/.test(text) && !/^[a-f0-9-]{8,}$/i.test(text)) return '';
    }
    return text;
  }

  function idFromUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      const parts = url.pathname.split('/').filter(Boolean);
      for (const key of ['chat', 'conversation', 'convo', 'thread', 't']) {
        const idx = parts.indexOf(key);
        const candidate = stableIdValue(parts[idx + 1] || '');
        if (idx >= 0 && candidate) return { value: candidate, source: `url_path_${key}` };
      }
      for (const name of ['id', 'uid', 'phone', 'thread_id', 'conversation_id']) {
        const candidate = stableIdValue(url.searchParams.get(name) || new URLSearchParams(url.hash.replace(/^#/, '')).get(name) || '');
        if (candidate) return { value: candidate, source: `url_${name}` };
      }
      const hash = stableIdValue(url.hash.replace(/^#\/?/, ''));
      if (hash && !/^chat$/i.test(hash)) return { value: hash, source: 'url_hash' };
    } catch {
      // ignored
    }
    return null;
  }

  function idFromElement(node) {
    if (!node) return null;
    const attributes = [
      'data-conversation-id', 'data-thread-id', 'data-uid', 'data-user-id',
      'data-zalo-id', 'data-id', 'data-key', 'id',
    ];
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      for (const name of attributes) {
        const value = stableAttributeValue(name, current.getAttribute?.(name) || '');
        if (value) return { value, source: `dom_${name.replace(/^data-/, '')}` };
      }
      const href = current.getAttribute?.('href') || current.querySelector?.('a[href]')?.getAttribute('href') || '';
      const fromHref = href ? idFromUrl(href) : null;
      if (fromHref) return fromHref;
    }
    return null;
  }

  function stableAvatarFingerprint(headerNode, scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const roots = [];
    if (headerNode) {
      let current = headerNode.parentElement;
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) roots.push(current);
    }
    for (const root of roots) {
      const image = [...root.querySelectorAll('img')].find((node) => {
        if (!isVisible(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.bottom <= scrollerRect.top + 24 && rect.width >= 28 && rect.height >= 28;
      });
      const raw = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
      if (!raw || /^(blob:|data:)/i.test(raw)) continue;
      try {
        const url = new URL(raw, window.location.href);
        url.search = '';
        url.hash = '';
        if (url.pathname && !/^\/$/.test(url.pathname)) return `${url.hostname}${url.pathname}`;
      } catch {
        // ignored
      }
    }
    return '';
  }

  function findSelectedConversationElement(title, scroller) {
    const wanted = normalize(title).toLocaleLowerCase('vi-VN');
    const selectors = '[aria-selected="true"], [data-selected="true"], [class*="selected"], [class*="active"]';
    const scrollerRect = scroller.getBoundingClientRect();
    return [...document.querySelectorAll(selectors)].find((node) => {
      if (!isVisible(node) || scroller.contains(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.left >= scrollerRect.right || rect.top >= scrollerRect.bottom) return false;
      const text = normalize(node.innerText || node.textContent || '').toLocaleLowerCase('vi-VN');
      return wanted && (text === wanted || text.startsWith(`${wanted} `) || text.includes(` ${wanted} `));
    }) || null;
  }

  function conversationIdentity(title, headerNode, scroller) {
    const fromCurrentUrl = idFromUrl(window.location.href);
    if (fromCurrentUrl) {
      return { id: `zalo_url_${hashString(`${fromCurrentUrl.source}|${fromCurrentUrl.value}`)}`, source: fromCurrentUrl.source, confidence: 'high' };
    }
    const fromHeader = idFromElement(headerNode);
    if (fromHeader) {
      return { id: `zalo_dom_${hashString(`${fromHeader.source}|${fromHeader.value}`)}`, source: fromHeader.source, confidence: 'high' };
    }
    const selected = findSelectedConversationElement(title, scroller);
    const fromSelected = idFromElement(selected);
    if (fromSelected) {
      return { id: `zalo_dom_${hashString(`${fromSelected.source}|${fromSelected.value}`)}`, source: `selected_${fromSelected.source}`, confidence: 'high' };
    }
    const avatar = stableAvatarFingerprint(headerNode, scroller);
    if (avatar) {
      return { id: `zalo_avatar_${hashString(avatar)}`, source: 'header_avatar', confidence: 'medium' };
    }
    return { id: `zalo_title_${hashString(normalize(title).toLocaleLowerCase('vi-VN') || 'unknown')}`, source: 'title_fallback', confidence: 'low' };
  }

  function collectParticipants(title, identity) {
    if (!title || /^zalo$/i.test(title)) return [];
    return [{ id: identity?.confidence === 'high' ? identity.id : '', name: title, profile_url: '' }];
  }

  function classTrail(node, stopNode) {
    const values = [];
    let current = node;
    for (let depth = 0; current && current !== stopNode && depth < 6; depth += 1, current = current.parentElement) {
      values.push(normalize(current.className || ''));
    }
    return values.join(' ');
  }

  function senderFromNode(node, scroller) {
    const aria = normalize(node.getAttribute('aria-label') || '');
    const classes = classTrail(node, scroller);
    const rect = node.getBoundingClientRect();
    const shellBounds = scroller.getBoundingClientRect();
    const geometrySelf = rect.left + rect.width / 2 > shellBounds.left + shellBounds.width * 0.58;
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

  function validMessageContainer(node, scroller) {
    if (!node || node === scroller || !isInsideScrollerViewport(node, scroller)) return false;
    const rect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return rect.width >= 12 && rect.height >= 10 && rect.width < scrollerRect.width * 0.93 && rect.height < 640;
  }

  function messageRootForLeaf(node, scroller) {
    let current = node;
    let contentCandidate = null;
    let rowCandidate = null;
    let geometryCandidate = null;
    for (let depth = 0; current && current !== scroller && depth < 10; depth += 1, current = current.parentElement) {
      if (!validMessageContainer(current, scroller)) continue;
      const classes = normalize(current.className || '');
      const rect = current.getBoundingClientRect();
      if (!contentCandidate && (MESSAGE_CONTENT_CLASS_RE.test(classes) || /bubble/i.test(classes))) contentCandidate = current;
      if (!rowCandidate && (MESSAGE_ROW_CLASS_RE.test(classes) || current.hasAttribute('data-msg-id') || current.hasAttribute('data-message-id'))) rowCandidate = current;
      const style = window.getComputedStyle(current);
      const hasVisualBox = style.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || Number.parseFloat(style.borderRadius || '0') >= 4;
      if (!geometryCandidate && hasVisualBox && rect.width < scroller.getBoundingClientRect().width * 0.78) geometryCandidate = current;
    }
    return contentCandidate || rowCandidate || geometryCandidate || node.parentElement || node;
  }

  function isQuotedOrControlNode(node, root) {
    const quoted = node.closest?.(QUOTED_CONTENT_SELECTOR);
    if (quoted && quoted !== root) return true;
    const control = node.closest?.(MESSAGE_CONTROL_SELECTOR);
    return Boolean(control && control !== root);
  }

  function messageRawId(root, scroller) {
    const attributes = ['data-msg-id', 'data-message-id', 'data-id', 'data-key'];
    let current = root;
    for (let depth = 0; current && current !== scroller && depth < 6; depth += 1, current = current.parentElement) {
      for (const name of attributes) {
        const value = stableAttributeValue(name, current.getAttribute?.(name) || '');
        if (value) return `${name}:${value}`;
      }
      const id = stableAttributeValue('id', current.getAttribute?.('id') || '');
      if (id && /\d/.test(id)) return `id:${id}`;
    }
    return '';
  }

  function collectMedia(root) {
    const urls = new Set();
    let hasVisualMedia = false;
    root.querySelectorAll?.('img, video, source').forEach((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return;
      const rect = node.getBoundingClientRect();
      const classes = classTrail(node, root);
      if (rect.width < 38 || rect.height < 38 || /avatar|reaction|toolbar|button-icon/i.test(classes)) return;
      hasVisualMedia = true;
      const raw = node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('poster') || '';
      if (!raw || /^(blob:|data:)/i.test(raw)) return;
      try {
        const url = new URL(raw, window.location.href);
        if (url.protocol === 'https:') urls.add(url.href);
      } catch {
        // ignored
      }
    });
    root.querySelectorAll?.('[style*="background"]').forEach((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return;
      const rect = node.getBoundingClientRect();
      const classes = classTrail(node, root);
      if (rect.width < 38 || rect.height < 38 || /avatar|reaction|toolbar|button-icon/i.test(classes)) return;
      const style = window.getComputedStyle(node).backgroundImage || '';
      const match = style.match(/url\(["']?(.+?)["']?\)/);
      if (!match?.[1]) return;
      hasVisualMedia = true;
      if (/^(blob:|data:)/i.test(match[1])) return;
      try {
        const url = new URL(match[1], window.location.href);
        if (url.protocol === 'https:') urls.add(url.href);
      } catch {
        // ignored
      }
    });
    return { urls: [...urls].slice(0, 10), hasVisualMedia };
  }

  function leafTextCandidates(root) {
    const selectors = '[dir="auto"], p, span, small, div, li, [class*="text"], [class*="content"]';
    return [...root.querySelectorAll(selectors)].filter((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return false;
      const text = normalize(node.innerText || node.textContent || '');
      if (!text) return false;
      const directText = normalize([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' '));
      if (directText) return true;
      return ![...node.children].some((child) => normalize(child.innerText || child.textContent || ''));
    });
  }

  function extractMessageText(root, title) {
    const parts = [];
    leafTextCandidates(root).forEach((node) => {
      const directText = normalize([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' '));
      const text = directText || normalize(node.innerText || node.textContent || '');
      if (isNoiseText(text, title, { structuralMessage: true })) return;
      if (parts[parts.length - 1] === text || parts.includes(text)) return;
      parts.push(text);
    });
    if (parts.length) return normalize(parts.join('\n'));
    let fallback = normalize(root.innerText || root.textContent || '');
    const marker = parseTimelineMarker(fallback);
    if (marker || isNoiseText(fallback, title, { structuralMessage: true })) return '';
    fallback = fallback.replace(/(?:^|\s)\d{1,2}:\d{2}(?:\s+\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})?\s*$/i, '').trim();
    return fallback;
  }

  function directDisplayMarker(root) {
    const candidates = [root, ...root.querySelectorAll('time, abbr, [class*="time"], [class*="date"], span, small')];
    let best = null;
    candidates.forEach((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return;
      const explicit = normalize(node.getAttribute?.('datetime') || node.getAttribute?.('data-utime') || '');
      const marker = parseTimelineMarker(explicit || node.innerText || node.textContent || '');
      if (!marker || !['time', 'datetime'].includes(marker.kind)) return;
      if (!best || marker.kind === 'datetime') best = marker;
    });
    return best;
  }

  function timelineDateMarkers(scroller) {
    const byKey = new Map();
    const nodes = scroller.querySelectorAll('time, abbr, [class*="time"], [class*="date"], span, p');
    nodes.forEach((node) => {
      if (!isInsideScrollerViewport(node, scroller)) return;
      const marker = parseTimelineMarker(node.getAttribute?.('datetime') || node.innerText || node.textContent || '');
      if (!marker?.dateKey) return;
      const rect = node.getBoundingClientRect();
      const key = `${marker.dateKey}|${Math.round(rect.top)}`;
      if (!byKey.has(key)) byKey.set(key, { ...marker, top: rect.top });
    });
    return [...byKey.values()].sort((a, b) => a.top - b.top);
  }

  function nearestDateKey(root, dateMarkers) {
    const top = root.getBoundingClientRect().top;
    let current = '';
    for (const marker of dateMarkers) {
      if (marker.top <= top + 3) current = marker.dateKey;
      else break;
    }
    return current;
  }

  function collectMessageRoots(scroller) {
    const selector = '[data-id], [data-key], [data-msg-id], [data-message-id], [class*="message"], [class*="msg-"], [class*="bubble"], [class*="chat-item"], [dir="auto"], div[class*="text"], div[class*="content"], p, span';
    const roots = new Set();
    const considerNode = (node) => {
      if (!isInsideScrollerViewport(node, scroller) || isQuotedOrControlNode(node, scroller)) return;
      const text = normalize(node.innerText || node.textContent || '');
      const hasMedia = node.matches('img, video') || node.querySelector?.('img, video, source, [style*="background"]');
      if ((!text || isTimestampText(text)) && !hasMedia) return;
      const root = messageRootForLeaf(node, scroller);
      if (validMessageContainer(root, scroller)) roots.add(root);
      else if (validMessageContainer(node, scroller)) roots.add(node);
    };
    scroller.querySelectorAll(selector).forEach(considerNode);

    // Zalo frequently ships minified class names. Keep a geometry-based fallback so
    // a UI rename cannot make a populated conversation look completely empty.
    if (roots.size < 3) {
      scroller.querySelectorAll('div, li').forEach((node) => {
        const directText = normalize([...node.childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent || '')
          .join(' '));
        const directMedia = [...node.children].some((child) => child.matches?.('img, video, source'));
        if (!directText && !directMedia) return;
        considerNode(node);
      });
    }
    return [...roots].sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
  }

  function messageContentKey(row, { looseTime = false } = {}) {
    const displayTime = normalize(row.display_time || '');
    const time = looseTime ? (displayTime.match(/\d{1,2}:\d{2}/)?.[0] || displayTime) : displayTime;
    return `${row.direction}|${normalize(row.text)}|${time}|${(row.media_urls || []).join('|')}`;
  }

  function collectMessages(scroller, limit, title, seed = '', round = 0) {
    const roots = collectMessageRoots(scroller);
    const dateMarkers = timelineDateMarkers(scroller);
    const rows = [];
    const nearbyContent = new Map();
    roots.forEach((root, index) => {
      if (root.closest?.('[contenteditable="true"], textarea, input, [role="textbox"]')) return;
      const media = collectMedia(root);
      const text = extractMessageText(root, title);
      if (!text && !media.hasVisualMedia) return;
      const finalText = text || '[Ảnh]';
      const sender = senderFromNode(root, scroller);
      const directMarker = directDisplayMarker(root);
      const dateKey = directMarker?.dateKey || nearestDateKey(root, dateMarkers);
      const sentAt = markerIso(directMarker, dateKey);
      const displayTime = markerDisplayTime(directMarker, dateKey);
      const rawId = messageRawId(root, scroller);
      const rawKey = rawId || `${sender.direction}|${finalText}|${displayTime}|${media.urls.join('|')}`;
      const row = {
        message_id: `zalo_dom_${hashString(`${seed}|${rawKey}`)}`,
        text: finalText,
        sent_at: sentAt,
        display_time: displayTime,
        dom_index: index,
        capture_round: round,
        source: 'zalo_web_dom',
        media_urls: media.urls,
        media_type: media.hasVisualMedia ? 'image' : 'text',
        dom_message_id: rawId,
        date_context: dateKey,
        ...sender,
      };
      const contentKey = messageContentKey(row, { looseTime: true });
      const top = root.getBoundingClientRect().top;
      const previous = nearbyContent.get(contentKey);
      if (previous && Math.abs(previous.top - top) < 14) {
        if (row.sent_at && !previous.row.sent_at) Object.assign(previous.row, row);
        return;
      }
      nearbyContent.set(contentKey, { top, row });
      rows.push(row);
    });
    return rows.slice(Math.max(0, rows.length - limit));
  }

  function mergeMessages(target, rows) {
    rows.forEach((row) => {
      const direct = target.get(row.message_id);
      if (direct) {
        target.set(row.message_id, { ...direct, ...row, sent_at: row.sent_at || direct.sent_at, display_time: row.display_time || direct.display_time });
        return;
      }
      const contentKey = messageContentKey(row, { looseTime: true });
      const existing = [...target.entries()].find(([, item]) => messageContentKey(item, { looseTime: true }) === contentKey);
      if (existing && (!row.dom_message_id || !existing[1].dom_message_id || row.dom_message_id === existing[1].dom_message_id)) {
        target.set(existing[0], {
          ...existing[1],
          ...row,
          message_id: existing[1].message_id,
          sent_at: row.sent_at || existing[1].sent_at,
          display_time: row.display_time || existing[1].display_time,
        });
        return;
      }
      target.set(row.message_id, row);
    });
  }

  function visibleScrollerSignature(scroller) {
    const text = normalize(scroller.innerText || scroller.textContent || '').slice(0, 4000);
    return hashString(`${text}|${scroller.scrollHeight}|${scroller.scrollTop}`);
  }

  async function settleScroll(scroller, pauseMs, atTop) {
    try {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch {
      // ignored
    }
    await sleep(pauseMs);
    await nextPaint();
    await nextPaint();
    if (atTop) await sleep(Math.min(500, Math.max(180, pauseMs / 2)));
  }

  function sortCollectedMessages(rows) {
    return rows.sort((a, b) => {
      const aTime = Date.parse(a.sent_at || '');
      const bTime = Date.parse(b.sent_at || '');
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
      const roundOrder = Number(b.capture_round || 0) - Number(a.capture_round || 0);
      if (roundOrder) return roundOrder;
      return Number(a.dom_index || 0) - Number(b.dom_index || 0);
    });
  }

  async function collectAcrossScroll(scroller, title, identity, limit, payload = {}) {
    const messages = new Map();
    const originalBottomGap = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    const maxScrolls = Math.max(1, Math.min(Number(payload.maxScrolls || 36), 80));
    const pauseMs = Math.max(300, Math.min(Number(payload.pauseMs || 700), 1800));
    const deep = payload.deep !== false;
    const seed = identity.id;
    let rounds = 1;

    mergeMessages(messages, collectMessages(scroller, limit, title, seed, 0));
    if (deep && messages.size < limit) {
      let stableRounds = 0;
      let stableTopRounds = 0;
      for (let step = 0; step < maxScrolls && messages.size < limit; step += 1) {
        const beforeTop = Number(scroller.scrollTop || 0);
        const beforeHeight = Number(scroller.scrollHeight || 0);
        const beforeCount = messages.size;
        const beforeSignature = visibleScrollerSignature(scroller);
        const jump = Math.max(280, Math.floor((scroller.clientHeight || window.innerHeight) * 0.68));
        scroller.scrollTop = Math.max(0, beforeTop - jump);
        const requestedTop = scroller.scrollTop <= 2;
        await settleScroll(scroller, pauseMs, requestedTop);
        rounds += 1;
        mergeMessages(messages, collectMessages(scroller, limit, title, seed, step + 1));
        const afterTop = Number(scroller.scrollTop || 0);
        const afterHeight = Number(scroller.scrollHeight || 0);
        const afterSignature = visibleScrollerSignature(scroller);
        const unchanged = messages.size === beforeCount
          && Math.abs(afterTop - beforeTop) < 8
          && Math.abs(afterHeight - beforeHeight) < 8
          && afterSignature === beforeSignature;
        stableRounds = unchanged ? stableRounds + 1 : 0;
        const stableAtTop = requestedTop
          && afterTop <= 2
          && messages.size === beforeCount
          && Math.abs(afterHeight - beforeHeight) < 8;
        stableTopRounds = stableAtTop ? stableTopRounds + 1 : 0;
        if (stableTopRounds >= 2 || stableRounds >= 3) break;
      }
    }

    try {
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight - originalBottomGap);
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch {
      // ignored
    }
    return {
      messages: sortCollectedMessages([...messages.values()]).slice(-limit),
      rounds,
    };
  }

  async function stableHeader(scroller) {
    let previous = '';
    let last = findConversationHeader(scroller);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sleep(180);
      last = findConversationHeader(scroller);
      const current = normalize(last.text).toLocaleLowerCase('vi-VN');
      if (current && current === previous) return last;
      previous = current;
    }
    return last;
  }

  async function collectZaloThread(payload = {}) {
    const host = window.location.hostname;
    if (!host.endsWith('zalo.me')) {
      return { ok: false, final: true, error: 'Tab hiện tại không phải Zalo Web.' };
    }
    const composer = findComposer();
    const shell = findThreadShell(composer);
    const scroller = findMessageScroller(shell, composer);
    if (!scroller) {
      return {
        ok: false,
        final: true,
        error: 'Không xác định được khung cuộn tin nhắn Zalo. Hãy mở một hội thoại, tải lại Zalo Web rồi thử lại.',
      };
    }
    const header = await stableHeader(scroller);
    const title = cleanTitleText(header.text);
    if (!title) {
      return { ok: false, final: true, error: 'Chưa đọc được tên hội thoại từ phần đầu khung chat Zalo.' };
    }
    const identity = conversationIdentity(title, header.node, scroller);
    const limit = Math.max(20, Math.min(Number(payload.limit || 500), 1000));
    const collected = await collectAcrossScroll(scroller, title, identity, limit, payload);
    const headerAfter = findConversationHeader(scroller);
    const titleAfter = cleanTitleText(headerAfter.text);
    if (titleAfter && normalize(titleAfter).toLocaleLowerCase('vi-VN') !== normalize(title).toLocaleLowerCase('vi-VN')) {
      return {
        ok: false,
        final: true,
        error: 'Hội thoại Zalo đã thay đổi trong lúc đồng bộ. Hãy giữ nguyên cuộc chat và bấm đồng bộ lại.',
      };
    }
    const messages = collected.messages;
    return {
      ok: messages.length > 0,
      final: true,
      source: 'zalo_web_dom',
      conversation_id: identity.id,
      conversation_url: window.location.href,
      conversation_title: title,
      customer_name: title,
      customer_id: identity.confidence === 'high' ? identity.id : '',
      participants: collectParticipants(title, identity),
      messages,
      count: messages.length,
      captured_at: new Date().toISOString(),
      identity_source: identity.source,
      identity_confidence: identity.confidence,
      scan_rounds: collected.rounds,
      warning: messages.length
        ? `Đã quét ${messages.length} tin nhắn Zalo qua ${collected.rounds} lượt cuộn.`
        : 'Không thấy bong bóng tin nhắn trong hội thoại Zalo đang mở.',
    };
  }

  const testApi = {
    cleanTitleText,
    hashString,
    markerDisplayTime,
    markerIso,
    messageContentKey,
    parseTimelineMarker,
    stableAttributeValue,
    stableIdValue,
  };
  if (typeof globalThis !== 'undefined' && globalThis.__STREAL_ZALO_TEST_MODE__) {
    globalThis.__STREAL_ZALO_TEST_API__ = testApi;
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'STREAL_ZALO_COLLECT_THREAD') return false;
    collectZaloThread(message.payload || {})
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error) }));
    return true;
  });
})();
