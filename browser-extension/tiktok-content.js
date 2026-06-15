(() => {
  const FINAL = true;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function clickIfVisible(selector) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const target = nodes.find(isVisible);
    if (target) {
      target.click();
      return true;
    }
    return false;
  }

  function maybeOpenCommentPanel() {
    const selectors = [
      '[data-e2e="comment-icon"]',
      'button[aria-label*="comment" i]',
      'button[aria-label*="bình luận" i]',
      'div[role="button"][aria-label*="comment" i]',
    ];
    selectors.some(clickIfVisible);
  }

  function tiktokPageError() {
    const body = (document.body?.innerText || '').toLowerCase();
    return (
      body.includes('đã xảy ra lỗi') ||
      body.includes('vui lòng thử lại sau') ||
      body.includes('something went wrong') ||
      body.includes('please try again later')
    );
  }

  function findCommentInput() {
    const selectors = [
      '[data-e2e="comment-input"] [contenteditable="true"]',
      '[data-e2e="comment-input"] textarea',
      'div.public-DraftEditor-content[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="comment" i]',
      'textarea[placeholder*="bình luận" i]',
      'div[contenteditable="true"]',
      'textarea',
    ];
    for (const selector of selectors) {
      const found = Array.from(document.querySelectorAll(selector)).find((el) => {
        if (!isVisible(el)) return false;
        const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`.toLowerCase();
        const text = `${el.textContent || ''}`.toLowerCase();
        return !label.includes('search') && !label.includes('tìm kiếm') && !text.includes('search');
      });
      if (found) return found;
    }
    return null;
  }

  function setTextValue(input, value) {
    input.focus();
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
      if (descriptor?.set) descriptor.set.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function buttonText(button) {
    return `${button.textContent || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-e2e') || ''}`.trim().toLowerCase();
  }

  function isDisabled(button) {
    return button.disabled || button.getAttribute('aria-disabled') === 'true' || button.className?.toString().toLowerCase().includes('disabled');
  }

  function findPostButton() {
    const selectors = [
      '[data-e2e="comment-post"]',
      '[data-e2e*="comment-post"]',
      '[data-e2e*="comment-submit"]',
      'button[data-e2e*="comment-post"]',
      'button[type="submit"]',
      'button[aria-label*="post" i]',
      'button[aria-label*="đăng" i]',
      'button[aria-label*="gửi" i]',
      'div[role="button"][aria-label*="post" i]',
      'div[role="button"][aria-label*="đăng" i]',
      'div[role="button"][aria-label*="gửi" i]',
    ];
    for (const selector of selectors) {
      const direct = Array.from(document.querySelectorAll(selector)).find((button) => isVisible(button) && !isDisabled(button));
      if (direct) return direct;
    }

    return Array.from(document.querySelectorAll('button, div[role="button"]')).find((button) => {
      if (!isVisible(button) || isDisabled(button)) return false;
      const text = buttonText(button);
      return text === 'post' || text === 'đăng' || text === 'gửi' || text.includes('comment-post');
    });
  }

  function submitCommentByKeyboard(input) {
    input.focus();
    const events = [
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ctrlKey: true }),
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ctrlKey: true }),
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
    ];
    events.forEach((event) => input.dispatchEvent(event));
  }

  async function waitFor(getter, timeoutMs, onTick) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = getter();
      if (value) return value;
      if (onTick) onTick();
      await sleep(500);
    }
    return null;
  }

  function loginHint() {
    const body = (document.body?.innerText || '').toLowerCase();
    return body.includes('log in') || body.includes('login') || body.includes('đăng nhập');
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripTiktokPrefix(value) {
    return String(value || '').replace(/^tiktok_/, '').trim();
  }

  async function copyText(value) {
    const text = String(value || '');
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    }
  }

  function compact(value, fallback) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback || '-';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCommentContextCard(payload, found) {
    const old = document.querySelector('[data-streal-comment-context-card="true"]');
    if (old) old.remove();

    const commentText = compact(payload.comment_text, '(Comment không có nội dung chữ)');
    const replyText = String(payload.reply_text || '').replace(/\s+/g, ' ').trim();
    const authorName = compact(payload.author_name, 'Ẩn danh');
    const card = document.createElement('section');
    card.setAttribute('data-streal-comment-context-card', 'true');
    card.style.position = 'fixed';
    card.style.zIndex = '2147483647';
    card.style.right = '24px';
    card.style.bottom = '24px';
    card.style.width = 'min(420px, calc(100vw - 32px))';
    card.style.maxHeight = 'calc(100vh - 48px)';
    card.style.overflow = 'auto';
    card.style.borderRadius = '18px';
    card.style.background = '#0f172a';
    card.style.color = '#e5e7eb';
    card.style.font = '500 14px/1.45 Arial, sans-serif';
    card.style.boxShadow = '0 24px 70px rgba(0,0,0,.45)';
    card.style.border = '1px solid rgba(148,163,184,.28)';
    card.style.padding = '16px';

    const safeFoundText = found
      ? 'Đã tìm thấy comment gần khớp, cuộn tới vị trí đó và tô xanh.'
      : 'Chưa thấy comment trong vùng TikTok đang tải. Dùng nội dung bên dưới để dò hoặc cuộn thêm trong panel bình luận.';

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fff">Lead Hunter - comment cần xử lý</div>
          <div style="margin-top:4px;color:#93c5fd;font-weight:700">${escapeHtml(authorName)}</div>
        </div>
        <button type="button" data-streal-close-card="true" style="border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:999px;width:32px;height:32px;cursor:pointer;font-size:18px">×</button>
      </div>
      <div style="border-radius:14px;background:rgba(255,255,255,.08);padding:12px;margin-bottom:12px">
        <div style="color:#9ca3af;font-size:12px;text-transform:uppercase;font-weight:800;margin-bottom:6px">Comment gốc</div>
        <div data-streal-original-text="true" style="white-space:pre-wrap;color:#fff">${escapeHtml(commentText)}</div>
      </div>
      <div style="border-radius:14px;background:rgba(37,99,235,.18);padding:12px;margin-bottom:12px">
        <div style="color:#bfdbfe;font-size:12px;text-transform:uppercase;font-weight:800;margin-bottom:6px">Câu trả lời đã copy</div>
        <div data-streal-reply-text="true" style="white-space:pre-wrap;color:#fff">${escapeHtml(replyText || 'Chưa có câu trả lời')}</div>
      </div>
      <div style="color:#cbd5e1;margin-bottom:12px">${safeFoundText}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-streal-copy-reply="true" style="border:0;background:#2563eb;color:#fff;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer">Copy câu trả lời</button>
        <button type="button" data-streal-copy-comment="true" style="border:1px solid rgba(148,163,184,.5);background:transparent;color:#fff;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer">Copy comment gốc</button>
        <button type="button" data-streal-open-search="true" style="border:1px solid rgba(148,163,184,.5);background:transparent;color:#fff;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer">Gợi ý tìm</button>
      </div>
      <div data-streal-card-status="true" style="margin-top:10px;color:#86efac;font-size:13px"></div>
    `;

    const status = card.querySelector('[data-streal-card-status="true"]');
    const setStatus = (text) => {
      if (status) status.textContent = text;
    };
    card.querySelector('[data-streal-close-card="true"]')?.addEventListener('click', () => card.remove());
    card.querySelector('[data-streal-copy-reply="true"]')?.addEventListener('click', async () => {
      await copyText(replyText);
      setStatus('Đã copy câu trả lời. Dán vào ô bình luận TikTok để gửi thủ công.');
    });
    card.querySelector('[data-streal-copy-comment="true"]')?.addEventListener('click', async () => {
      await copyText(commentText);
      setStatus('Đã copy comment gốc. Có thể dùng Ctrl+F để tìm nếu TikTok hỗ trợ.');
    });
    card.querySelector('[data-streal-open-search="true"]')?.addEventListener('click', async () => {
      await copyText(commentText);
      setStatus('Đã copy comment gốc. TikTok web không hỗ trợ deep-link tới từng comment ổn định, nên không tự cuộn.');
    });

    document.body.appendChild(card);
    if (replyText) void copyText(replyText);
  }

  function nearestScrollableParent(el) {
    let node = el?.parentElement || null;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const canScroll = /(auto|scroll)/i.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 20;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollToCommentElement(target) {
    const scroller = nearestScrollableParent(target);
    const targetRect = target.getBoundingClientRect();
    const scrollerRect = scroller === document.scrollingElement || scroller === document.documentElement
      ? { top: 0, height: window.innerHeight }
      : scroller.getBoundingClientRect();
    const nextTop = scroller.scrollTop + targetRect.top - scrollerRect.top - Math.max(48, scrollerRect.height * 0.25);
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
  }

  function highlightCommentElement(target, payload) {
    scrollToCommentElement(target);
    target.style.outline = '4px solid #2563eb';
    target.style.boxShadow = '0 0 0 8px rgba(37, 99, 235, 0.22)';
    target.style.borderRadius = '12px';
    target.style.background = 'rgba(37, 99, 235, 0.08)';
    target.setAttribute('data-streal-focused-comment', 'true');

    const oldBadge = document.querySelector('[data-streal-comment-badge="true"]');
    if (oldBadge) oldBadge.remove();
    const badge = document.createElement('div');
    badge.setAttribute('data-streal-comment-badge', 'true');
    badge.textContent = 'Lead Hunter: comment cần trả lời đang được tô xanh. Câu trả lời đã copy, dán Ctrl+V để gửi thủ công.';
    badge.style.position = 'fixed';
    badge.style.zIndex = '2147483647';
    badge.style.top = '16px';
    badge.style.left = '50%';
    badge.style.transform = 'translateX(-50%)';
    badge.style.maxWidth = '760px';
    badge.style.padding = '12px 16px';
    badge.style.borderRadius = '999px';
    badge.style.background = '#111827';
    badge.style.color = '#fff';
    badge.style.font = '600 14px/1.35 Arial, sans-serif';
    badge.style.boxShadow = '0 12px 30px rgba(0,0,0,.35)';
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 12000);

    const commentText = String(payload.comment_text || '').trim();
    if (commentText) {
      try {
        window.sessionStorage.setItem('streal_last_comment_text', commentText);
      } catch (error) {
        // Best effort only.
      }
    }
  }

  function findCommentCandidate(payload) {
    const targetText = normalizeText(payload.comment_text).slice(0, 180);
    const author = normalizeText(payload.author_name).slice(0, 80);
    const rawCommentId = stripTiktokPrefix(payload.comment_id);
    const nodes = Array.from(document.querySelectorAll(
      '[data-e2e*="comment"], [class*="Comment"], [class*="comment"], div, p, span',
    ));
    const scored = [];
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || '');
      if (!text || text.length > 1600) continue;
      let score = 0;
      if (targetText && text.includes(targetText)) score += 1000 - Math.min(text.length, 900);
      if (author && text.includes(author)) score += 120;
      const html = `${node.id || ''} ${node.getAttribute('href') || ''} ${node.getAttribute('data-e2e') || ''}`;
      if (rawCommentId && html.includes(rawCommentId)) score += 300;
      if (score <= 0) continue;
      const container = node.closest('[data-e2e*="comment"], [class*="Comment"], [class*="comment"]') || node;
      scored.push({ node: container, score, length: text.length });
    }
    scored.sort((a, b) => b.score - a.score || a.length - b.length);
    return scored[0]?.node || null;
  }

  async function focusComment(payload) {
    if (tiktokPageError()) {
      return { ok: false, final: FINAL, error: 'Trang TikTok đang báo lỗi, chưa thể định vị comment.' };
    }

    maybeOpenCommentPanel();
    await sleep(1200);
    const target = findCommentCandidate(payload);
    if (target) highlightCommentElement(target, payload);
    renderCommentContextCard(payload, Boolean(target));
    return {
      ok: true,
      final: FINAL,
      target_found: Boolean(target),
      message: target
        ? 'Đã mở video, tô xanh comment đang hiển thị và ghim bảng xử lý.'
        : 'Đã mở video và ghim bảng comment cần xử lý. Không tự cuộn để tránh TikTok nhảy video.',
      url: window.location.href,
      method: target ? 'focus-visible-comment' : 'open-context-card',
    };
  }

  function readCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getVideoId(payload) {
    const raw = String(payload.video_id || payload.post_id || window.location.href || '')
      .replace(/^tiktok_/, '')
      .trim();
    return raw.match(/\d{8,}/)?.[0] || '';
  }

  function friendlyPublishError(payload, fallback) {
    const text = String(payload?.status_msg || payload?.message || fallback || '').trim();
    if (!text) return 'TikTok khong nhan binh luan qua phien Chrome hien tai.';
    if (/login|session|expired|auth|verify|captcha/i.test(text)) {
      return 'TikTok yeu cau dang nhap/xac minh lai tren Chrome truoc khi gui binh luan.';
    }
    return text;
  }

  async function publishCommentByApi(payload, reason) {
    const message = String(payload.message || '').trim();
    const videoId = getVideoId(payload);
    if (!videoId) {
      throw new Error(`${reason} Khong xac dinh duoc ID video TikTok de gui bang API.`);
    }

    const params = new URLSearchParams({
      aweme_id: videoId,
      aid: '1988',
      app_language: 'vi-VN',
      browser_language: navigator.language || 'vi-VN',
      device_platform: 'webapp',
      region: 'VN',
      os: 'windows',
    });
    const body = new URLSearchParams({ aweme_id: videoId, text: message });
    const csrf = readCookie('tt_csrf_token') || readCookie('csrf_session_id');
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
    if (csrf) {
      headers['X-Secsdk-Csrf-Token'] = csrf;
      headers['x-secsdk-csrf-token'] = csrf;
    }

    const response = await fetch(`/api/comment/publish/?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      throw new Error(`${reason} Gui API TikTok loi ${response.status}: ${friendlyPublishError(data, response.statusText)}`);
    }
    const statusCode = data.status_code;
    const comment = data.comment || data.comments?.[0] || {};
    if (statusCode !== 0 && statusCode !== '0' && statusCode !== undefined) {
      throw new Error(`${reason} ${friendlyPublishError(data, 'TikTok khong nhan binh luan.')}`);
    }
    if ((data.status_msg || data.message) && !comment.cid && !comment.id && !comment.comment_id) {
      throw new Error(`${reason} ${friendlyPublishError(data, 'TikTok khong nhan binh luan.')}`);
    }
    const commentId = comment.cid || comment.id || comment.comment_id || `extension_api_${Date.now()}`;
    return {
      ok: true,
      final: FINAL,
      comment_id: String(commentId),
      message: 'Extension da gui binh luan TikTok bang phien Chrome',
      url: window.location.href,
      method: 'api',
    };
  }

  async function postComment(payload) {
    const message = String(payload.message || '').trim();
    if (!message) throw new Error('Thieu noi dung binh luan');
    if (tiktokPageError()) {
      throw new Error('Khung binh luan TikTok dang loi hoac TikTok chan phien gui tu Chrome.');
    }

    maybeOpenCommentPanel();
    let sawTikTokError = false;
    const input = await waitFor(() => {
      if (tiktokPageError()) {
        sawTikTokError = true;
        return null;
      }
      return findCommentInput();
    }, 30000, () => {
      if (!sawTikTokError) maybeOpenCommentPanel();
    });
    if (!input) {
      if (sawTikTokError || tiktokPageError()) {
        throw new Error('Khung binh luan TikTok dang loi hoac TikTok chan phien gui tu Chrome.');
      }
      if (loginHint()) {
        throw new Error('Chrome chua dang nhap TikTok hoac TikTok yeu cau dang nhap lai.');
      }
      throw new Error('Khong thay o binh luan TikTok.');
    }

    setTextValue(input, message);
    await sleep(800);

    const button = await waitFor(findPostButton, 12000);
    if (!button) {
      if (tiktokPageError()) {
        throw new Error('Khung binh luan TikTok dang loi hoac TikTok chan phien gui tu Chrome.');
      }
      submitCommentByKeyboard(input);
      await sleep(1800);
      if (!tiktokPageError()) {
        return {
          ok: true,
          final: FINAL,
          comment_id: `extension_keyboard_${Date.now()}`,
          message: 'Extension da thu gui binh luan TikTok bang phim Enter',
          url: window.location.href,
          method: 'dom-keyboard',
        };
      }
      throw new Error('Da dien noi dung nhung TikTok khong hien nut dang binh luan.');
    }

    button.click();
    await sleep(1800);

    return {
      ok: true,
      final: FINAL,
      comment_id: `extension_${Date.now()}`,
      message: 'Extension da bam gui binh luan TikTok',
      url: window.location.href,
      method: 'dom-click',
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'STREAL_TIKTOK_FOCUS_COMMENT') {
      focusComment(message.payload || {})
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, final: FINAL, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type !== 'STREAL_TIKTOK_DO_COMMENT') return false;
    postComment(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, final: FINAL, error: error?.message || String(error) }));
    return true;
  });
})();
