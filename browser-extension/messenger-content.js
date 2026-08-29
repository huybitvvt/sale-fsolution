(() => {
  const CONTROL_TEXT = /^(thích|like|trả lời|reply|chuyển tiếp|forward|gửi|send|đã xem|seen|active now|đang hoạt động|nhập tin nhắn|soạn|soạn tin nhắn|compose|write a message|type a message|message|messenger|aa)$/i;
  const SYSTEM_TEXT = /^(các bạn không phải là bạn bè|you are not connected|sống tại|làm việc tại|học tại|đã gửi|sent|đã xem|seen|giờ đây, các bạn|now you can|nhập, tin nhắn do|type, message from|bắt đầu đoạn chat|started a chat|đã tham gia|joined|đã rời|left)\b/i;
  const MENU_TEXT = /^(đoạn chat|chats|tất cả|chưa đọc|nhóm|cộng đồng|community|trang cá nhân|profile|tắt thông báo|mute notifications|tìm kiếm|search|thông tin về đoạn chat|chat info|tùy chỉnh đoạn chat|customize chat|file phương tiện, file và liên kết|media, files and links|quyền riêng tư và hỗ trợ|privacy and support|mở rộng đoạn chat|xem chi tiết|more|notifications)$/i;

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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextPaint() {
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      setTimeout(finish, 50);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    });
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

  function isTimestampText(text) {
    const value = normalize(text);
    return /^(\d{1,2}:\d{2})(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?$/.test(value)
      || /^(hôm nay|today|hôm qua|yesterday)(?:\s+lúc)?\s+\d{1,2}:\d{2}$/i.test(value)
      || /^\d{1,2}:\d{2}\s+\d{1,2}\s+tháng\s+\d{1,2},?\s+\d{4}$/i.test(value);
  }

  function isLikelyMessageText(text, title = '') {
    const value = normalize(text);
    if (!value || value.length > 2000) return false;
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
    const widthScore = rect.width >= 360 && rect.width <= window.innerWidth * 0.72 ? 80 : 0;
    const heightScore = Math.min(80, rect.height / 8);
    return widthScore + heightScore - centerPenalty * 120;
  }

  function isComposerCandidate(node) {
    if (!isVisible(node)) return false;
    const label = normalize(`${node.getAttribute('aria-label') || ''} ${node.getAttribute('data-lexical-editor') || ''} ${node.getAttribute('role') || ''}`);
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.42) return false;
    return /tin nhắn|message|aa|textbox|true/i.test(label) || node.isContentEditable || node.matches('textarea, input');
  }

  function findComposer() {
    return [
      ...document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea, input[aria-label]'),
    ].find(isComposerCandidate) || null;
  }

  function findThreadShell() {
    const composer = findComposer();
    if (composer) {
      let current = composer.parentElement;
      let best = null;
      let bestScore = -9999;
      for (let depth = 0; current && depth < 16; depth += 1, current = current.parentElement) {
        if (!isVisible(current)) continue;
        const rect = current.getBoundingClientRect();
        if (rect.height < window.innerHeight * 0.45 || rect.width < 360) continue;
        if (rect.width > window.innerWidth * 0.82) continue;
        const score = rectScoreForCenter(rect);
        if (score > bestScore) {
          best = current;
          bestScore = score;
        }
      }
      if (best) return best;
    }
    const candidates = [
      ...document.querySelectorAll('[role="main"] [role="grid"], [role="main"] [aria-label*="Tin nhắn"], [role="main"] [aria-label*="Message"], [role="main"]'),
    ].filter((node) => isVisible(node));
    return candidates.sort((a, b) => rectScoreForCenter(b.getBoundingClientRect()) - rectScoreForCenter(a.getBoundingClientRect()))[0]
      || document.querySelector('[role="main"]')
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

  function findThreadScroller(shell, bounds) {
    const candidates = [shell, ...shell.querySelectorAll('div, [role="grid"], [role="list"]')]
      .filter((node) => {
        if (!isVisible(node) || node.closest('[role="navigation"], aside')) return false;
        const rect = node.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        if (center < bounds.left || center > bounds.right) return false;
        if (rect.height < Math.min(240, window.innerHeight * 0.34)) return false;
        return Number(node.scrollHeight || 0) > Number(node.clientHeight || 0) + 80;
      });
    candidates.sort((a, b) => {
      const score = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const overflowBonus = /auto|scroll/i.test(style.overflowY || '') ? 240 : 0;
        const range = Math.min(400, Math.max(0, Number(node.scrollHeight || 0) - Number(node.clientHeight || 0)) / 8);
        return overflowBonus + range + Math.min(180, rect.height / 4) - Math.abs(rect.left + rect.width / 2 - (bounds.left + bounds.right) / 2) / 5;
      };
      return score(b) - score(a);
    });
    return candidates[0] || shell;
  }

  function isInsideThreadColumn(node, shell, bounds) {
    if (!isVisible(node)) return false;
    if (shell && shell !== document.body && !shell.contains(node)) return false;
    const rect = node.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    if (center < bounds.left || center > bounds.right) return false;
    if (rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2) return false;
    const blocked = node.closest('[role="navigation"], [data-pagelet*="LeftRail"], [data-pagelet*="RightRail"], [aria-label*="Danh sách"], [aria-label*="Chats"], [aria-label*="Thông tin"], [aria-label*="Info"]');
    return !blocked;
  }

  function findConversationTitle(shell, bounds) {
    const blocked = /^(facebook|messenger|đoạn chat|chats|thông báo|notifications|tất cả|all)$/i;
    const nodes = [
      ...document.querySelectorAll('h1, h2, h3, [role="heading"], strong, a[href] [dir="auto"]'),
    ];
    const candidates = [];
    nodes.forEach((node) => {
      if (!isInsideThreadColumn(node, shell, bounds)) return;
      const rect = node.getBoundingClientRect();
      if (rect.top > bounds.top + Math.max(170, window.innerHeight * 0.22)) return;
      const text = normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '');
      if (!text || text.length > 120 || CONTROL_TEXT.test(text) || MENU_TEXT.test(text) || blocked.test(text)) return;
      candidates.push({ text, score: 200 - rect.top + Math.min(60, text.length) });
    });
    candidates.sort((a, b) => b.score - a.score);
    const fromCandidate = candidates[0]?.text || '';
    if (fromCandidate) return fromCandidate;
    const title = normalize(document.title.replace(/\(\d+\)\s*/g, '').replace(/\s*[-|]\s*Messenger.*$/i, '').replace(/\s*[-|]\s*Facebook.*$/i, ''));
    return title && !blocked.test(title) ? title : 'Messenger';
  }

  function collectParticipants(root, title) {
    const byKey = new Map();
    [...root.querySelectorAll('a[href]')].forEach((anchor) => {
      if (!isVisible(anchor)) return;
      const href = anchor.href || '';
      const id = profileIdFromUrl(href);
      if (!id) return;
      const name = normalize(anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || '');
      if (!name || CONTROL_TEXT.test(name) || MENU_TEXT.test(name) || name.length > 120) return;
      const key = id || href;
      if (!byKey.has(key)) {
        byKey.set(key, { id, name, profile_url: href });
      }
    });
    if (title && !/messenger|facebook/i.test(title) && ![...byKey.values()].some((item) => item.name === title)) {
      byKey.set(`title:${title}`, { id: '', name: title, profile_url: '' });
    }
    return [...byKey.values()].slice(0, 20);
  }

  function senderFromNode(node, shellBounds) {
    const aria = normalize(node.getAttribute('aria-label') || '');
    const text = normalize(node.innerText || node.textContent || '');
    const combined = `${aria} ${text}`;
    const rect = node.getBoundingClientRect();
    const geometrySelf = rect.left > shellBounds.left + shellBounds.width * 0.52;
    const self = /(^|\b)(bạn đã gửi|you sent|you:|bạn:)(\b|:)/i.test(combined) || geometrySelf;
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

  function messageRootForLeaf(node) {
    let current = node;
    let best = node;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      if (rect.width > 0 && rect.width < Math.min(760, window.innerWidth * 0.5) && rect.height < 260) {
        best = current;
      }
      if (current.getAttribute('role') === 'row' || /message|tin nhắn/i.test(current.getAttribute('aria-label') || '')) {
        return current;
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
      const ariaTime = normalize(current.getAttribute?.('aria-label') || '').match(/(\d{1,2}:\d{2}(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?)/)?.[1] || '';
      if (ariaTime) return ariaTime;
    }
    return '';
  }

  function collectMessages(root, limit, title, bounds, round = 0) {
    const leaves = [...root.querySelectorAll('[dir="auto"]')]
      .filter((node) => node instanceof Element && isInsideThreadColumn(node, root, bounds) && !node.querySelector('[dir="auto"]'));
    const byKey = new Map();
    let lastDisplayTime = '';
    leaves.forEach((node, index) => {
      const text = normalize(node.innerText || node.textContent || '');
      if (isTimestampText(text)) {
        lastDisplayTime = text;
        return;
      }
      if (!isLikelyMessageText(text, title)) return;
      const messageRoot = messageRootForLeaf(node);
      if (!isInsideThreadColumn(messageRoot, root, bounds)) return;
      const rootText = normalize(messageRoot.innerText || messageRoot.textContent || '');
      if (rootText.length > 2400) return;
      if (MENU_TEXT.test(rootText)) return;
      const sender = senderFromNode(messageRoot, bounds);
      const timestamp = displayTimeNear(messageRoot);
      const displayTime = timestamp || lastDisplayTime || '';
      const key = `${sender.direction}|${text}|${displayTime || index}`;
      if (byKey.has(key)) return;
      byKey.set(key, {
        message_id: `dom_${hashString(key)}`,
        text,
        sent_at: timestamp && /^\d+$/.test(timestamp) ? new Date(Number(timestamp) * 1000).toISOString() : '',
        display_time: displayTime,
        dom_index: index,
        capture_round: round,
        ...sender,
      });
    });
    const rows = [...byKey.values()];
    return rows.slice(Math.max(0, rows.length - limit));
  }

  function messageContentKey(row) {
    return `${row?.direction || row?.sender_type || ''}|${normalize(row?.text)}|${normalize(row?.display_time)}`;
  }

  function mergeMessages(target, rows) {
    rows.forEach((row) => {
      const direct = target.get(row.message_id);
      if (direct) {
        target.set(row.message_id, { ...direct, ...row, sent_at: row.sent_at || direct.sent_at, display_time: row.display_time || direct.display_time });
        return;
      }
      const contentKey = messageContentKey(row);
      const existing = [...target.entries()].find(([, item]) => messageContentKey(item) === contentKey);
      if (existing) {
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

  async function settleScroll(scroller, maxWaitMs, atTop) {
    try { scroller.dispatchEvent(new Event('scroll', { bubbles: true })); } catch {}
    const startedAt = Date.now();
    const minimumWait = Math.min(maxWaitMs, atTop ? 320 : 200);
    let previous = visibleScrollerSignature(scroller);
    let stableChecks = 0;
    while (Date.now() - startedAt < maxWaitMs) {
      await sleep(80);
      await nextPaint();
      const current = visibleScrollerSignature(scroller);
      stableChecks = current === previous ? stableChecks + 1 : 0;
      previous = current;
      if (Date.now() - startedAt >= minimumWait && stableChecks >= 2) break;
    }
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

  async function collectAcrossScroll(scroller, limit, title, bounds, payload = {}) {
    const messages = new Map();
    const originalBottomGap = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    const maxScrolls = Math.max(1, Math.min(Number(payload.maxScrolls || 34), 70));
    const pauseMs = Math.max(320, Math.min(Number(payload.pauseMs || 560), 1200));
    const deep = payload.deep !== false;
    let rounds = 1;

    mergeMessages(messages, collectMessages(scroller, limit, title, bounds, 0));
    if (deep && messages.size < limit) {
      let stableRounds = 0;
      let stableTopRounds = 0;
      for (let step = 0; step < maxScrolls && messages.size < limit; step += 1) {
        const beforeTop = Number(scroller.scrollTop || 0);
        const beforeHeight = Number(scroller.scrollHeight || 0);
        const beforeCount = messages.size;
        const beforeSignature = visibleScrollerSignature(scroller);
        const jump = Math.max(320, Math.floor((scroller.clientHeight || window.innerHeight) * 0.82));
        scroller.scrollTop = Math.max(0, beforeTop - jump);
        const requestedTop = scroller.scrollTop <= 2;
        await settleScroll(scroller, pauseMs, requestedTop);
        rounds += 1;
        mergeMessages(messages, collectMessages(scroller, limit, title, bounds, step + 1));

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
    } catch {}
    return { messages: sortCollectedMessages([...messages.values()]).slice(-limit), rounds };
  }

  async function collectMessengerThread(payload = {}) {
    const host = window.location.hostname;
    const path = window.location.pathname;
    if (!host.endsWith('messenger.com') && !(host.endsWith('facebook.com') && /\/messages\b/.test(path))) {
      return { ok: false, final: true, error: 'Tab hiện tại không phải Messenger/Facebook Messages.' };
    }
    const shell = findThreadShell();
    const bounds = threadBounds(shell);
    const limit = Math.max(20, Math.min(Number(payload.limit || 300), 500));
    const title = findConversationTitle(shell, bounds);
    const scroller = findThreadScroller(shell, bounds);
    const collected = await collectAcrossScroll(scroller, limit, title, bounds, payload);
    const messages = collected.messages;
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
      participants: collectParticipants(shell, title),
      messages,
      count: messages.length,
      scan_rounds: collected.rounds,
      captured_at: new Date().toISOString(),
      warning: messages.length
        ? `Đã quét ${messages.length} tin nhắn Messenger qua ${collected.rounds} lượt cuộn.`
        : 'Không thấy bong bóng tin nhắn trong hội thoại đang mở.',
    };
  }

  globalThis.__STREAL_MESSENGER_TEST_API__ = {
    collectMessengerThread,
    collectAcrossScroll,
    isTimestampText,
    messageContentKey,
    mergeMessages,
  };
  if (globalThis.__STREAL_MESSENGER_TEST_MODE__) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'STREAL_MESSENGER_COLLECT_THREAD') return false;
    collectMessengerThread(message.payload || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error) }));
    return true;
  });
})();
