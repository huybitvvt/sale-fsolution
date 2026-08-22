(() => {
  if (window.__strealFacebookGroupAssistantLoaded) return;
  window.__strealFacebookGroupAssistantLoaded = true;

  const state = {
    requestId: '',
    taskId: '',
    targetType: 'group',
    groupId: '',
    groupName: '',
    message: '',
    media: [],
    editor: null,
    dialog: null,
    postClickedAt: 0,
    completionTimer: null,
    autoSubmitTimer: null,
    submissionAutomatic: false,
    preSubmitFailureNotices: new Set(),
    preSubmitPostUrls: new Set(),
    preSubmitPostIds: new Set(),
    postReferenceObserver: null,
    postReferenceCandidates: [],
    networkReferenceMethod: '',
    networkPendingReview: false,
    preparedKey: '',
    mediaAttachedCount: 0,
    cancelledRequestIds: new Set(),
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const captionTextMatches = globalThis.STREALFacebookCaptionMatcher?.textMatches
    || ((actual, expected) => normalize(actual) === normalize(expected));
  const captionOrSignatureMatches = globalThis.STREALFacebookCaptionMatcher?.textOrSignatureMatches
    || captionTextMatches;

  function isVisible(node) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function showStatus(message, tone = 'info') {
    let panel = document.getElementById('streal-facebook-assistant-status');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'streal-facebook-assistant-status';
      Object.assign(panel.style, {
        position: 'fixed',
        right: '18px',
        bottom: '18px',
        zIndex: '2147483647',
        maxWidth: '360px',
        padding: '12px 14px',
        borderRadius: '12px',
        boxShadow: '0 12px 36px rgba(15, 23, 42, .28)',
        font: '600 14px/1.45 Arial, sans-serif',
        whiteSpace: 'pre-line',
      });
      document.documentElement.appendChild(panel);
    }
    panel.style.background = tone === 'error' ? '#fee2e2' : tone === 'success' ? '#dcfce7' : '#eff6ff';
    panel.style.color = tone === 'error' ? '#991b1b' : tone === 'success' ? '#166534' : '#1e3a8a';
    panel.textContent = message;
  }

  function sendProgress(status, extra = {}) {
    chrome.runtime.sendMessage({
      type: 'STREAL_FACEBOOK_GROUP_QUEUE_EVENT',
      requestId: state.requestId,
      taskId: state.taskId,
      targetType: state.targetType,
      targetId: state.groupId,
      targetName: state.groupName,
      groupId: state.groupId,
      groupName: state.groupName,
      status,
      ...extra,
    });
  }

  function setNetworkReferenceCapture(active) {
    window.postMessage({
      source: 'streal-facebook-content',
      type: active ? 'STREAL_FACEBOOK_POST_CAPTURE_START' : 'STREAL_FACEBOOK_POST_CAPTURE_STOP',
      requestId: state.requestId,
      taskId: state.taskId,
      targetType: state.targetType,
      targetId: state.groupId,
    }, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== 'streal-facebook-main' || data.type !== 'STREAL_FACEBOOK_POST_REFERENCE_CAPTURED') return;
    if (!state.postClickedAt || data.requestId !== state.requestId || data.taskId !== state.taskId) return;
    state.networkReferenceMethod = String(data.method || 'facebook_graphql');
    if (data.isPending === true) {
      state.networkPendingReview = true;
      state.postReferenceCandidates = [];
      return;
    }
    rememberPostReference(data.postUrl || '', 300);
  });

  const COMPOSER_TITLES = ['tạo bài viết', 'create post', 'đăng bài'];
  const COMPOSER_TRIGGER_PHRASES = [
    'bạn viết gì đi',
    'bạn đang nghĩ gì',
    'hãy viết gì đó',
    'viết gì đó',
    'bạn muốn chia sẻ điều gì',
    'tạo bài viết',
    'write something',
    "what's on your mind",
    'create post',
    'start a post',
    'post something',
  ];
  const COMPOSER_INPUT_PHRASES = [
    'bạn viết gì đi',
    'bạn đang nghĩ gì',
    'hãy viết gì đó',
    'viết gì đó',
    'bạn muốn chia sẻ điều gì',
    'write something',
    "what's on your mind",
    'start a post',
    'post something',
  ];
  const COMMENT_PHRASES = ['bình luận', 'comment', 'trả lời', 'reply'];

  function nodeText(node) {
    return normalize(`${node?.getAttribute?.('aria-label') || ''} ${node?.innerText || node?.textContent || ''}`).toLowerCase();
  }

  function isCommentControl(node) {
    const label = nodeText(node);
    return COMMENT_PHRASES.some((phrase) => label.includes(phrase));
  }

  function composerDialogScore(dialog) {
    if (!isVisible(dialog)) return -1;
    const headings = Array.from(dialog.querySelectorAll('[role="heading"], h1, h2, h3'))
      .filter(isVisible)
      .map(nodeText);
    const hasComposerHeading = headings.some((heading) => (
      COMPOSER_TITLES.some((title) => heading === title || heading.startsWith(`${title} `))
    ));
    if (!hasComposerHeading) return -1;

    let score = 100;
    const dialogLabel = normalize(dialog.getAttribute('aria-label') || '').toLowerCase();
    if (COMPOSER_TITLES.some((title) => dialogLabel.includes(title))) score += 30;
    if (Array.from(dialog.querySelectorAll('[contenteditable="true"]')).some((node) => isVisible(node) && !isCommentControl(node))) {
      score += 20;
    }
    const text = nodeText(dialog);
    if (text.includes('thêm vào bài viết') || text.includes('add to your post')) score += 10;
    return score;
  }

  function findComposerDialog() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible);
    const scored = dialogs
      .map((dialog) => ({ dialog, score: composerDialogScore(dialog) }))
      .filter((item) => item.score >= 100)
      .sort((a, b) => b.score - a.score);
    return scored[0]?.dialog || null;
  }

  function findComposerEditors(dialog) {
    if (!dialog || composerDialogScore(dialog) < 100) return null;
    const candidates = Array.from(dialog.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"]'))
      .filter((node) => isVisible(node) && !isCommentControl(node))
      .map((node) => {
        const label = nodeText(node);
        if (label.includes('search') || label.includes('tìm kiếm')) return { node, score: -1 };
        let score = node.getAttribute('role') === 'textbox' ? 20 : 0;
        if (node.hasAttribute('data-lexical-editor')) score += 10;
        if (['bạn viết gì đi', 'bạn đang nghĩ gì', "what's on your mind", 'write something']
          .some((phrase) => label.includes(phrase))) score += 50;
        return { node, score };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);
    return candidates.map((item) => item.node);
  }

  function findComposerEditor(dialog) {
    return findComposerEditors(dialog)?.[0] || null;
  }

  function findComposerEditorContainingMessage(dialog, message) {
    const candidates = [state.editor, ...(findComposerEditors(dialog) || [])]
      .filter((node, index, items) => node?.isConnected && isVisible(node) && items.indexOf(node) === index);
    return candidates.find((node) => editorContainsMessage(node, message)) || null;
  }

  function findComposerTrigger() {
    const nodes = Array.from(document.querySelectorAll('[role="button"], button, [tabindex="0"]'));
    const candidates = nodes
      .filter((node) => {
        const text = nodeText(node);
        if (
          !isVisible(node)
          || node.closest('[role="dialog"], [role="tab"]')
          || (
            node.closest('[role="article"]')
            && !COMPOSER_INPUT_PHRASES.some((phrase) => text.includes(phrase))
          )
          || isCommentControl(node)
        ) return false;
        return COMPOSER_TRIGGER_PHRASES.some((phrase) => text.includes(phrase));
      })
      .map((node) => {
        const text = nodeText(node);
        let score = node.closest('main, [role="main"]') ? 20 : 0;
        if (['bạn viết gì đi', 'bạn đang nghĩ gì', "what's on your mind", 'write something']
          .some((phrase) => text.includes(phrase))) score += 80;
        if (text === 'tạo bài viết' || text === 'create post') score += 20;
        return { node, score };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.node || null;
  }

  function scrollTowardGroupFeed() {
    const feedLandmark = Array.from(document.querySelectorAll('[role="feed"], [role="article"]'))
      .find(isVisible);
    if (feedLandmark) {
      feedLandmark.scrollIntoView({ behavior: 'auto', block: 'start' });
      window.scrollBy(0, -Math.max(120, Math.round((window.innerHeight || 800) * 0.28)));
      return;
    }

    // Some Groups do not mount the feed/composer until the tall cover area has
    // left the viewport. A small bounded scroll makes Facebook render that lazy
    // section without jumping deep into the list of posts.
    const viewportHeight = Math.max(600, window.innerHeight || 0);
    const pageHeight = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
    );
    const maxScrollTop = Math.max(0, pageHeight - viewportHeight);
    const currentScrollTop = Math.max(
      0,
      window.scrollY || document.documentElement?.scrollTop || 0,
    );
    const nextScrollTop = Math.min(maxScrollTop, currentScrollTop + Math.round(viewportHeight * 0.62));
    if (nextScrollTop > currentScrollTop) {
      window.scrollTo({ top: nextScrollTop, behavior: 'auto' });
    }
  }

  async function waitForComposerTrigger(requestId, targetType) {
    let trigger = findComposerTrigger();
    for (let attempt = 0; attempt < 36 && !trigger; attempt += 1) {
      if (state.cancelledRequestIds.has(requestId)) return null;
      if (targetType === 'group' && [3, 11, 21].includes(attempt)) {
        scrollTowardGroupFeed();
      }
      await sleep(250);
      trigger = findComposerTrigger();
    }
    return trigger;
  }

  function detectGroupComposerBlocker() {
    const controls = Array.from(document.querySelectorAll('button, [role="button"]')).filter(isVisible);
    const joinPhrases = ['tham gia nhóm', 'join group'];
    const hasJoinControl = controls.some((node) => {
      const values = [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.innerText,
        node.textContent,
      ].map((value) => normalize(value).toLowerCase()).filter(Boolean);
      return values.some((value) => (
        joinPhrases.some((phrase) => value === phrase || value.startsWith(`${phrase} `))
      ));
    });
    if (hasJoinControl) {
      return 'Tài khoản Facebook đang mở chưa tham gia Group này. Hãy tham gia Group và chờ được duyệt trước khi đăng.';
    }

    const main = document.querySelector('main, [role="main"]');
    const mainText = nodeText(main);
    const restrictedPhrases = [
      'chỉ quản trị viên mới có thể đăng',
      'chỉ quản trị viên và người kiểm duyệt mới có thể đăng',
      'tính năng đăng bài đã bị tắt',
      'only admins can post',
      'posting has been turned off',
    ];
    if (restrictedPhrases.some((phrase) => mainText.includes(phrase))) {
      return 'Group này đang giới hạn quyền đăng bài; Facebook không cấp ô tạo bài cho tài khoản hiện tại.';
    }
    return '';
  }

  function editorContainsMessage(editor, message) {
    return captionTextMatches(editor?.innerText || editor?.textContent, message);
  }

  function selectEditorContents(editor) {
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearEditor(editor) {
    selectEditorContents(editor);
    try {
      document.execCommand('delete', false);
    } catch {
      // The DOM fallback below clears editors that ignore execCommand.
    }
    if (normalize(editor.innerText || editor.textContent)) {
      editor.replaceChildren();
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
        data: null,
      }));
    }
  }

  async function setEditorText(editor, message) {
    if (editorContainsMessage(editor, message)) return true;

    // Facebook currently uses Lexical. Its paste handler is more stable than
    // mutating innerHTML and preserves the blank line between title and body.
    clearEditor(editor);
    try {
      selectEditorContents(editor);
      const transfer = new DataTransfer();
      transfer.setData('text/plain', message);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }));
    } catch {
      // Continue with execCommand when synthetic paste is unavailable.
    }
    await sleep(150);

    if (!editorContainsMessage(editor, message)) {
      clearEditor(editor);
      try {
        selectEditorContents(editor);
        document.execCommand('insertText', false, message);
      } catch {
        // Continue with the paragraph-by-paragraph fallback below.
      }
      await sleep(100);
    }

    if (!editorContainsMessage(editor, message)) {
      clearEditor(editor);
      try {
        const lines = message.replace(/\r\n?/g, '\n').split('\n');
        lines.forEach((line, index) => {
          if (line) document.execCommand('insertText', false, line);
          if (index < lines.length - 1) document.execCommand('insertParagraph', false);
        });
      } catch {
        // Continue with the DOM fallback below.
      }
      await sleep(100);
    }

    if (!editorContainsMessage(editor, message)) {
      const fragment = document.createDocumentFragment();
      message.replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
        const row = document.createElement('div');
        if (line) row.textContent = line;
        else row.appendChild(document.createElement('br'));
        fragment.appendChild(row);
      });
      editor.replaceChildren(fragment);
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: null,
      }));
      await sleep(100);
    }
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return editorContainsMessage(editor, message);
  }

  function normalizeMedia(items) {
    return (Array.isArray(items) ? items : [])
      .slice(0, 10)
      .map((item) => ({
        url: String(item?.url || '').trim(),
        type: item?.type === 'video' ? 'video' : 'image',
        name: String(item?.name || '').trim(),
      }))
      .filter((item) => /^https?:\/\//i.test(item.url));
  }

  function mediaExtension(type, mimeType) {
    const byMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
    };
    return byMime[String(mimeType || '').toLowerCase()] || (type === 'video' ? 'mp4' : 'jpg');
  }

  function mediaFilename(item, index, mimeType) {
    let filename = item.name;
    if (!filename) {
      try {
        filename = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '');
      } catch {
        filename = '';
      }
    }
    filename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    const extension = mediaExtension(item.type, mimeType);
    if (!filename) filename = `facebook-media-${index + 1}.${extension}`;
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename = `${filename}.${extension}`;
    return filename;
  }

  async function downloadMediaFile(item, index) {
    const response = await fetch(item.url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`không tải được ${item.name || `media ${index + 1}`} (HTTP ${response.status})`);
    const blob = await response.blob();
    if (!blob.size) throw new Error(`${item.name || `media ${index + 1}`} là file rỗng`);
    const fallbackMime = item.type === 'video' ? 'video/mp4' : 'image/jpeg';
    const mimeType = blob.type || fallbackMime;
    if (!/^(image|video)\//i.test(mimeType)) {
      throw new Error(`${item.name || `media ${index + 1}`} không phải file ảnh/video trực tiếp`);
    }
    return new File([blob], mediaFilename(item, index, mimeType), {
      type: mimeType,
      lastModified: Date.now(),
    });
  }

  function findMediaInput(dialog) {
    if (!dialog || composerDialogScore(dialog) < 100) return null;
    const roots = [dialog];
    const candidates = [];
    roots.forEach((root, rootIndex) => {
      root.querySelectorAll('input[type="file"]').forEach((input) => {
        if (candidates.some((item) => item.input === input)) return;
        const accept = String(input.getAttribute('accept') || '').toLowerCase();
        if (!accept.includes('image') && !accept.includes('video')) return;
        let score = rootIndex === 0 ? 20 : 0;
        if (accept.includes('image')) score += 8;
        if (accept.includes('video')) score += 8;
        if (input.multiple) score += 3;
        candidates.push({ input, score });
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.input || null;
  }

  function findNewDetachedMediaInput(previousInputs) {
    const freshInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter((input) => {
      if (previousInputs.has(input)) return false;
      const accept = String(input.getAttribute('accept') || '').toLowerCase();
      return accept.includes('image') || accept.includes('video');
    });
    // Facebook occasionally mounts the picker in a portal outside the dialog.
    // Only accept an unambiguous input created by our media-button click so an
    // existing comment attachment control can never be selected.
    return freshInputs.length === 1 ? freshInputs[0] : null;
  }

  function findMediaTrigger(dialog) {
    if (!dialog) return null;
    const phrases = ['ảnh/video', 'ảnh hoặc video', 'photo/video', 'photo or video', 'add photos', 'add photo'];
    return Array.from(dialog.querySelectorAll('button, [role="button"], [aria-label]')).find((node) => {
      if (!isVisible(node)) return false;
      const text = normalize(`${node.getAttribute('aria-label') || ''} ${node.innerText || node.textContent || ''}`).toLowerCase();
      return phrases.some((phrase) => text.includes(phrase));
    }) || null;
  }

  async function waitForMediaInput(dialog) {
    if (!dialog || composerDialogScore(dialog) < 100) return null;
    let input = findMediaInput(dialog);
    if (input) return input;
    const previousInputs = new Set(document.querySelectorAll('input[type="file"]'));
    const trigger = findMediaTrigger(dialog);
    if (trigger) trigger.click();
    for (let attempt = 0; attempt < 20 && !input; attempt += 1) {
      await sleep(250);
      input = findMediaInput(dialog) || findNewDetachedMediaInput(previousInputs);
    }
    return input;
  }

  async function attachMedia(dialog, items) {
    if (!items.length) return { ok: true, attachedCount: 0, previewDetected: true, mediaNodeCountBefore: 0 };
    const input = await waitForMediaInput(dialog);
    if (!input) return { ok: false, error: 'Không tìm thấy nút chọn ảnh/video trong hộp soạn bài Facebook.' };

    const files = [];
    for (let index = 0; index < items.length; index += 1) {
      showStatus(`Đang tải media ${index + 1}/${items.length} cho ${state.groupName}...`);
      try {
        files.push(await downloadMediaFile(items[index], index));
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    }

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    const mediaNodeCountBefore = dialog.querySelectorAll('img, video').length;
    let assignedCount = 0;
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
      if (setter) setter.call(input, transfer.files);
      else input.files = transfer.files;
      assignedCount = Number(input.files?.length || 0);
      if (assignedCount < files.length) {
        return { ok: false, error: 'Facebook không nhận đủ danh sách file ảnh/video.' };
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      return { ok: false, error: `Facebook không nhận danh sách media: ${error?.message || String(error)}` };
    }

    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (!dialog?.isConnected) return { ok: false, error: 'Hộp soạn bài Facebook đã đóng khi đang gắn media.' };
      const mediaNodeCount = dialog.querySelectorAll('img, video').length;
      const hasMediaControl = Array.from(dialog.querySelectorAll('button, [role="button"], [aria-label]')).some((node) => {
        const label = normalize(`${node.getAttribute('aria-label') || ''} ${node.innerText || node.textContent || ''}`).toLowerCase();
        return ['xóa ảnh', 'xóa video', 'remove photo', 'remove video', 'chỉnh sửa', 'edit photo'].some((phrase) => label.includes(phrase));
      });
      if (mediaNodeCount > mediaNodeCountBefore || hasMediaControl) {
        return { ok: true, attachedCount: assignedCount, previewDetected: true, mediaNodeCountBefore };
      }
      await sleep(250);
    }
    // Facebook often consumes and clears input.files immediately after accepting the
    // change event. Keep the successful hand-off, then let the auto-submit guard wait
    // for a visible preview before it is allowed to click Post.
    return { ok: true, attachedCount: assignedCount, previewDetected: false, mediaNodeCountBefore };
  }

  async function preparePost(payload) {
    const nextRequestId = String(payload.requestId || '');
    const nextTaskId = String(payload.taskId || '');
    const nextTargetType = payload.targetType === 'page' ? 'page' : 'group';
    const nextGroupId = String(payload.targetId || payload.groupId || '');
    const nextGroupName = String(payload.targetName || payload.groupName || nextGroupId || 'Facebook');
    const nextMessage = String(payload.message || '').trim();
    const nextMedia = normalizeMedia(payload.media);
    const preparedKey = `${nextRequestId}:${nextTaskId}`;
    if (state.cancelledRequestIds.has(nextRequestId)) {
      return { ok: false, final: true, cancelled: true };
    }

    if (
      state.preparedKey === preparedKey
      && state.dialog?.isConnected
      && composerDialogScore(state.dialog) >= 100
      && state.editor?.isConnected
      && editorContainsMessage(state.editor, nextMessage)
    ) {
      return { ok: true, ready: true, auto_submit: true, media_attached_count: state.mediaAttachedCount };
    }

    state.requestId = nextRequestId;
    state.taskId = nextTaskId;
    state.targetType = nextTargetType;
    state.groupId = nextGroupId;
    state.groupName = nextGroupName;
    state.message = nextMessage;
    state.media = nextMedia;
    state.preparedKey = '';
    state.mediaAttachedCount = 0;
    state.postClickedAt = 0;
    state.submissionAutomatic = false;
    setNetworkReferenceCapture(false);
    stopPostReferenceObserver();
    state.preSubmitPostUrls = new Set();
    state.preSubmitPostIds = new Set();
    state.postReferenceCandidates = [];
    state.networkPendingReview = false;
    if (state.completionTimer) clearInterval(state.completionTimer);
    if (state.autoSubmitTimer) clearTimeout(state.autoSubmitTimer);
    state.autoSubmitTimer = null;

    if (!state.message) return { ok: false, error: 'Bài đăng chưa có nội dung.' };

    showStatus(`Đang chuẩn bị bài cho ${state.groupName}...`);
    let dialog = findComposerDialog();
    let editor = findComposerEditor(dialog);
    if (!editor) {
      showStatus(`Đang chờ Facebook tải vùng tạo bài cho ${state.groupName}...`);
      const trigger = await waitForComposerTrigger(nextRequestId, state.targetType);
      if (state.cancelledRequestIds.has(nextRequestId)) {
        return { ok: false, final: true, cancelled: true };
      }
      if (!trigger) {
        const groupBlocker = state.targetType === 'group' ? detectGroupComposerBlocker() : '';
        const error = groupBlocker || (state.targetType === 'page'
          ? 'Không tìm thấy ô tạo bài viết trên Page. Hãy kiểm tra quyền quản trị/chế độ dùng Facebook với tư cách Page.'
          : 'Không tìm thấy ô tạo bài viết sau khi đã chờ Facebook tải phần thảo luận. Hãy kiểm tra đã tham gia Group và Group có cho phép thành viên đăng bài.');
        showStatus(error, 'error');
        return { ok: false, final: true, error };
      }
      trigger.click();
      for (let attempt = 0; attempt < 30 && !editor; attempt += 1) {
        await sleep(300);
        dialog = findComposerDialog();
        editor = findComposerEditor(dialog);
      }
    }
    if (!editor) {
      const error = 'Facebook đã mở nhưng chưa xuất hiện ô nhập bài viết.';
      showStatus(error, 'error');
      return { ok: false, error };
    }
    if (state.cancelledRequestIds.has(nextRequestId)) {
      return { ok: false, final: true, cancelled: true };
    }

    const filled = await setEditorText(editor, state.message);
    if (!filled) {
      const error = 'Không điền được caption. Hãy dán nội dung thủ công rồi bấm Đăng.';
      showStatus(error, 'error');
      return { ok: false, error };
    }
    if (state.cancelledRequestIds.has(nextRequestId)) {
      return { ok: false, final: true, cancelled: true };
    }

    state.editor = editor;
    state.dialog = dialog;
    const mediaResult = await attachMedia(state.dialog, state.media);
    if (state.cancelledRequestIds.has(nextRequestId)) {
      return { ok: false, final: true, cancelled: true };
    }
    if (!mediaResult.ok) {
      const error = `Không gắn được media: ${mediaResult.error}`;
      showStatus(`${error}\nHàng đợi đã dừng để tránh đăng bài thiếu ảnh/video.`, 'error');
      sendProgress('media_error', { error });
      return { ok: false, final: true, error };
    }

    state.preparedKey = preparedKey;
    state.mediaAttachedCount = mediaResult.attachedCount;
    setNetworkReferenceCapture(true);

    const mediaHint = mediaResult.attachedCount
      ? ` và chọn ${mediaResult.attachedCount} media`
      : '';
    const previewHint = mediaResult.attachedCount && !mediaResult.previewDetected
      ? '\nĐang đợi Facebook hiển thị đủ preview media.'
      : '';
    showStatus(`Đã điền caption${mediaHint} cho ${state.groupName}.${previewHint}\nExtension sẽ tự bấm Đăng khi bài viết sẵn sàng.`);
    state.autoSubmitTimer = setTimeout(() => {
      state.autoSubmitTimer = null;
      autoSubmitPreparedPost(preparedKey, {
        attachedCount: mediaResult.attachedCount,
        mediaNodeCountBefore: Number(mediaResult.mediaNodeCountBefore || 0),
        previewDetected: Boolean(mediaResult.previewDetected),
      }).catch((error) => {
        failAutomaticSubmission(preparedKey, error?.message || String(error));
      });
    }, 1200);
    return {
      ok: true,
      ready: true,
      auto_submit: true,
      media_attached_count: mediaResult.attachedCount,
    };
  }

  function resolvePostButton(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    const button = element?.closest?.('button, [role="button"]') || null;
    if (!button || !isVisible(button)) return null;
    if (button.matches(':disabled, [aria-disabled="true"]')) return null;
    const label = normalize(button.getAttribute('aria-label') || '').toLowerCase();
    const text = normalize(button.innerText || button.textContent || '').toLowerCase();
    const postLabels = ['đăng', 'đăng bài viết', 'post', 'publish'];
    if (![label, text].some((value) => postLabels.includes(value))) return null;

    // Facebook can replace the Lexical editor node after a synthetic paste. Do
    // not require the cached editor element to still be inside the dialog when
    // the user clicks Post. Validate the current composer dialog instead.
    const buttonDialog = button.closest('[role="dialog"]');
    const storedDialogMatches = state.dialog?.isConnected
      && isVisible(state.dialog)
      && state.dialog.contains(button);
    const currentDialogMatches = buttonDialog && composerDialogScore(buttonDialog) >= 100;
    if (!storedDialogMatches && !currentDialogMatches) return null;
    return { button, dialog: buttonDialog || state.dialog };
  }

  function findPostButton(dialog) {
    if (!dialog || composerDialogScore(dialog) < 100) return null;
    const candidates = Array.from(dialog.querySelectorAll('button, [role="button"]'));
    for (const candidate of candidates) {
      const match = resolvePostButton(candidate);
      if (match) return match;
    }
    return null;
  }

  function hasMediaPreview(dialog, mediaNodeCountBefore) {
    if (!dialog?.isConnected || composerDialogScore(dialog) < 100) return false;
    if (dialog.querySelectorAll('img, video').length > mediaNodeCountBefore) return true;
    return Array.from(dialog.querySelectorAll('button, [role="button"], [aria-label]')).some((node) => {
      const label = nodeText(node);
      return ['xóa ảnh', 'xóa video', 'remove photo', 'remove video', 'chỉnh sửa ảnh', 'edit photo']
        .some((phrase) => label.includes(phrase));
    });
  }

  function failAutomaticSubmission(preparedKey, error) {
    if (state.preparedKey !== preparedKey || state.cancelledRequestIds.has(state.requestId)) return;
    stopPostReferenceObserver();
    setNetworkReferenceCapture(false);
    state.preparedKey = '';
    state.postClickedAt = 0;
    state.submissionAutomatic = false;
    showStatus(`${error}\nHàng đợi đã dừng để tránh đăng sai hoặc đăng lặp.`, 'error');
    sendProgress('auto_submit_error', { error });
  }

  function beginPostSubmission(match, automatic = false) {
    if (!match || !state.requestId || !state.preparedKey || state.postClickedAt) return false;
    state.dialog = match.dialog;
    state.postClickedAt = Date.now();
    state.submissionAutomatic = automatic;
    state.preSubmitFailureNotices = new Set(
      collectPostFailures().map((notice) => notice.toLowerCase()),
    );
    state.preSubmitPostUrls = new Set(
      [...document.querySelectorAll('[role="article"] a[href]')]
        .map((anchor) => canonicalPostReferenceUrl(anchor.href || ''))
        .filter((href) => isBrowsablePostUrl(href)),
    );
    state.preSubmitPostIds = new Set([...state.preSubmitPostUrls].map(postIdFromUrl).filter(Boolean));
    startPostReferenceObserver();
    state.networkReferenceMethod = '';
    state.networkPendingReview = false;
    setNetworkReferenceCapture(true);
    showStatus(`Đang chờ Facebook xác nhận bài tại ${state.groupName}...`);
    sendProgress('submitting', { automatic });
    watchForCompletion();
    return true;
  }

  async function autoSubmitPreparedPost(preparedKey, mediaState) {
    let stableReadyChecks = 0;
    let lastReason = 'Không tìm thấy nút Đăng hợp lệ trong hộp soạn bài Facebook.';
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (state.cancelledRequestIds.has(state.requestId) || state.preparedKey !== preparedKey) return;
      const dialog = state.dialog?.isConnected && composerDialogScore(state.dialog) >= 100
        ? state.dialog
        : findComposerDialog();
      const editor = findComposerEditorContainingMessage(dialog, state.message);
      const captionReady = Boolean(editor);
      const previewReady = !mediaState.attachedCount
        || mediaState.previewDetected
        || hasMediaPreview(dialog, mediaState.mediaNodeCountBefore);
      const match = findPostButton(dialog);

      if (!captionReady) lastReason = 'Không xác nhận được caption trong hộp soạn bài Facebook.';
      else if (!previewReady) lastReason = 'Facebook chưa hiển thị preview ảnh/video nên extension không tự đăng.';
      else if (!match) lastReason = 'Nút Đăng chưa xuất hiện hoặc vẫn đang bị vô hiệu hóa.';

      if (captionReady && previewReady && match) {
        state.editor = editor;
        stableReadyChecks += 1;
        if (stableReadyChecks >= 2) {
          if (!beginPostSubmission(match, true)) return;
          try {
            match.button.click();
          } catch (error) {
            state.postClickedAt = 0;
            failAutomaticSubmission(preparedKey, `Không tự bấm được nút Đăng: ${error?.message || String(error)}`);
          }
          return;
        }
      } else {
        stableReadyChecks = 0;
      }
      await sleep(500);
    }
    failAutomaticSubmission(preparedKey, `${lastReason} Đã chờ 30 giây.`);
  }

  function isPendingArticle(article) {
    if (!article) return false;
    const text = normalize(article.innerText || article.textContent || '').toLowerCase();
    const hasPendingBadge = text.includes('đang chờ')
      || text.includes('chờ phê duyệt')
      || text.includes('chờ kiểm duyệt')
      || text.includes('chờ duyệt')
      || text.includes('chờ quản trị viên')
      || text.includes('nội dung của bạn')
      || text.includes('chỉ bạn mới nhìn thấy')
      || text.includes('pending approval')
      || text.includes('pending review')
      || text.includes('submitted for approval')
      || text.includes('only you can see');
    const hasActionControls = (text.includes('chỉnh sửa') || text.includes('edit'))
      && (text.includes('xóa') || text.includes('delete') || text.includes('remove'));
    const hasEngagementControls = (text.includes('thích') || text.includes('like'))
      || (text.includes('bình luận') || text.includes('comment'))
      || (text.includes('chia sẻ') || text.includes('share'));
    return hasPendingBadge || (hasActionControls && !hasEngagementControls);
  }

  function detectPostOutcome() {
    if (state.networkPendingReview) return 'pending_review';
    if (window.location.href.includes('my_pending_content') || window.location.href.includes('pending')) {
      return 'pending_review';
    }
    const pendingPhrases = [
      'chờ phê duyệt',
      'chờ kiểm duyệt',
      'chờ quản trị viên',
      'chờ duyệt',
      'đang chờ',
      'quản trị viên phê duyệt',
      'my_pending_content',
      'chỉ bạn mới nhìn thấy',
      'gửi bài viết để phê duyệt',
      'đã gửi bài viết của bạn',
      'đã gửi đến người kiểm duyệt',
      'bài viết đang chờ',
      'pending approval',
      'submitted for approval',
      'waiting for approval',
      'pending review',
      'pending post',
      'sent for approval',
      'admin approval',
    ];
    const noticeNodes = Array.from(document.querySelectorAll('[role="alert"], [role="status"], [aria-live]'))
      .filter((node) => isVisible(node) && normalize(node.innerText || node.textContent || '').length <= 600);
    const noticeText = noticeNodes
      .map((node) => normalize(node.innerText || node.textContent || '').toLowerCase())
      .join(' ');
    if (pendingPhrases.some((phrase) => noticeText.includes(phrase))) return 'pending_review';

    const pageText = normalize(document.body ? document.body.innerText : '').toLowerCase();
    if (pageText.includes('nội dung của bạn') && pageText.includes('đang chờ')) {
      return 'pending_review';
    }

    const publishedPhrases = [
      'đã đăng',
      'post published',
      'post was published',
      'successfully posted',
    ];
    if (publishedPhrases.some((phrase) => noticeText.includes(phrase))) return 'published';
    return 'submitted';
  }

  function postIdFromUrl(url) {
    return globalThis.STREALFacebookPostReference?.postIdFromUrl(url)
      || String(url || '').match(/\/posts\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || String(url || '').match(/[?&](?:story_fbid|fbid)=(\d+)/i)?.[1]
      || String(url || '').match(/\/permalink\/(pfbid[a-z0-9]+|\d+)/i)?.[1]
      || String(url || '').match(/\/share\/p\/([a-z0-9_-]+)/i)?.[1]
      || '';
  }

  function groupIdFromUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      if (parsed.hostname !== 'facebook.com' && !parsed.hostname.endsWith('.facebook.com')) return '';
      const value = parsed.pathname.match(/\/groups\/([^/?#]+)/i)?.[1] || '';
      return value ? decodeURIComponent(value) : '';
    } catch {
      return '';
    }
  }

  function isNumericFacebookId(value) {
    return /^\d+$/.test(String(value || '').trim());
  }

  function facebookGroupIdsConflict(left, right) {
    const leftValue = String(left || '').trim();
    const rightValue = String(right || '').trim();
    return Boolean(
      leftValue
      && rightValue
      && isNumericFacebookId(leftValue)
      && isNumericFacebookId(rightValue)
      && leftValue !== rightValue
    );
  }

  function isPostReferenceUrl(url) {
    return globalThis.STREALFacebookPostReference?.isPostReferenceUrl(url)
      || Boolean(postIdFromUrl(url));
  }

  function isOpaqueFacebookShareId(value) {
    const text = String(value || '').trim();
    return Boolean(text && !/^\d+$/.test(text) && !/^pfbid/i.test(text));
  }

  function isBrowsablePostUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      if (parsed.protocol !== 'https:' || (parsed.hostname !== 'facebook.com' && !parsed.hostname.endsWith('.facebook.com'))) return false;
      return isPostReferenceUrl(parsed.href)
        || /\/(?:share\/(?:p|v|r)|reel|videos)\//i.test(parsed.pathname)
        || (/\/(?:photo|permalink)\.php$/i.test(parsed.pathname) && Boolean(parsed.searchParams.get('fbid') || parsed.searchParams.get('story_fbid')));
    } catch {
      return false;
    }
  }

  function canonicalPostReferenceUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      parsed.hash = '';
      for (const key of ['__cft__', '__tn__', 'mibextid', 'ref', 'refid']) parsed.searchParams.delete(key);
      return parsed.href;
    } catch {
      return String(url || '').trim();
    }
  }

  const PUBLISHED_REFERENCE_PHRASES = [
    'xem bài viết',
    'view post',
    'đã đăng',
    'đã chia sẻ',
    'post published',
    'post was published',
    'successfully posted',
  ];

  function postReferenceScore(anchor) {
    if (!(anchor instanceof Element)) return 0;
    const article = anchor.closest('[role="article"]');
    if (article && captionTextMatches(article.innerText || article.textContent || '', state.message)) return 120;
    const notice = anchor.closest('[role="alert"], [role="status"]');
    const context = normalize(notice?.innerText || notice?.textContent || anchor.innerText || anchor.textContent || '').toLowerCase();
    return PUBLISHED_REFERENCE_PHRASES.some((phrase) => context.includes(phrase)) ? 100 : 0;
  }

  function rememberPostReference(url, score = 0) {
    const postUrl = canonicalPostReferenceUrl(url);
    const postId = postIdFromUrl(postUrl);
    if (!isBrowsablePostUrl(postUrl)) return;
    if (state.preSubmitPostUrls.has(postUrl) || (postId && state.preSubmitPostIds.has(postId))) return;
    const existing = state.postReferenceCandidates.find((candidate) => (
      postId ? candidate.postId === postId : candidate.postUrl === postUrl
    ));
    if (existing) {
      existing.score = Math.max(existing.score, score);
      if (score >= existing.score) existing.postUrl = postUrl;
      return;
    }
    state.postReferenceCandidates.push({ postId, postUrl, score, detectedAt: Date.now() });
  }

  function capturePostReferenceLinks(root) {
    const element = root instanceof Element ? root : root?.parentElement;
    if (!element) return;
    const anchors = [];
    if (element.matches?.('a[href]')) anchors.push(element);
    anchors.push(...element.querySelectorAll?.('a[href]') || []);
    for (const anchor of anchors) {
      if (!isBrowsablePostUrl(anchor.href || '')) continue;
      rememberPostReference(anchor.href, postReferenceScore(anchor));
    }
  }

  function stopPostReferenceObserver() {
    state.postReferenceObserver?.disconnect();
    state.postReferenceObserver = null;
  }

  function startPostReferenceObserver() {
    stopPostReferenceObserver();
    state.postReferenceCandidates = [];
    state.postReferenceObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        capturePostReferenceLinks(mutation.target);
        for (const node of mutation.addedNodes || []) capturePostReferenceLinks(node);
      }
    });
    state.postReferenceObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }

  const POST_REFERENCE_SELECTOR = [
    'a[href*="/posts/"]',
    'a[href*="story_fbid="]',
    'a[href*="/permalink/"]',
    'a[href*="fbid="]',
    'a[href*="multi_permalinks="]',
    'a[href*="/multi_permalinks/"]',
    'a[href*="/share/p/"]',
    'a[href*="/share/v/"]',
    'a[href*="/share/r/"]',
    'a[href*="/reel/"]',
    'a[href*="/videos/"]',
    'a[href*="permalink.php"]',
    'a[href*="story.php"]',
  ].join(', ');

  function findMatchingPublishedArticle(expectedMessage) {
    return Array.from(document.querySelectorAll('[role="article"]'))
      .find((article) => isVisible(article) && !isPendingArticle(article) && captionTextMatches(article.innerText || article.textContent || '', expectedMessage)) || null;
  }

  function findLikelyPublishedArticle(expectedMessage) {
    return Array.from(document.querySelectorAll('[role="article"]'))
      .find((article) => (
        isVisible(article)
        && !isPendingArticle(article)
        && captionOrSignatureMatches(article.innerText || article.textContent || '', expectedMessage, true)
      )) || null;
  }

  function engagementMetricsFromArticle(article) {
    if (!article) return { reaction_count: null, comment_count: null, share_count: null };
    const values = [];
    for (const line of String(article.innerText || '').split(/\r?\n/)) {
      const text = normalize(line);
      if (text && text.length <= 240) values.push(text);
    }
    for (const node of article.querySelectorAll('[aria-label], [role="button"], a, span')) {
      const label = normalize(node.getAttribute?.('aria-label') || '');
      const text = normalize(node.innerText || node.textContent || '');
      if (label && label.length <= 240) values.push(label);
      const peopleCount = label.match(/^(\d[\d.,]*\s*(?:k|m|n|tr|nghìn|ngan|triệu|trieu)?)\s+(?:người|people)(?:\s+khác)?$/i);
      if (peopleCount) values.push(`${peopleCount[1]} cảm xúc`);
      if (text && text.length <= 240) values.push(text);
    }
    const metrics = globalThis.STREALFacebookEngagementUtils?.extractEngagementMetrics(values)
      || { reaction_count: null, comment_count: null, share_count: null };
    const articleText = normalize(article.innerText || article.textContent || '').toLowerCase();
    const controlsLoaded = (articleText.includes('thích') || articleText.includes('like'))
      && (articleText.includes('bình luận') || articleText.includes('comment'));
    if (controlsLoaded) {
      for (const key of ['reaction_count', 'comment_count', 'share_count']) {
        if (metrics[key] === null) metrics[key] = 0;
      }
    }
    return metrics;
  }

  function referenceFromArticle(article) {
    if (!article) return { postId: '', postUrl: '' };
    let urlOnlyReference = '';
    for (const anchor of article.querySelectorAll(POST_REFERENCE_SELECTOR)) {
      const postUrl = canonicalPostReferenceUrl(anchor.href || '');
      if (!isBrowsablePostUrl(postUrl)) continue;
      const postId = postIdFromUrl(postUrl);
      if (postId) return { postId, postUrl };
      if (!urlOnlyReference) urlOnlyReference = postUrl;
    }
    return { postId: '', postUrl: urlOnlyReference };
  }

  function facebookControlLabel(node) {
    return normalize(node?.getAttribute?.('aria-label') || node?.innerText || node?.textContent || '').toLowerCase();
  }

  function findFacebookControl(root, phrases) {
    return Array.from(root?.querySelectorAll?.('button, [role="button"], [tabindex="0"]') || [])
      .find((node) => isVisible(node) && phrases.includes(facebookControlLabel(node))) || null;
  }

  function referenceMatchesTarget(postUrl, targetType, targetId) {
    if (!isBrowsablePostUrl(postUrl)) return false;
    if (targetType === 'page' || !targetId) return true;
    const linkedGroupId = groupIdFromUrl(postUrl);
    // Facebook's Copy link action can return /share/p/<opaque-id> first. The
    // canonical Group is checked again after that URL is opened and redirected.
    // Some real Group links use a vanity slug instead of the numeric group id
    // saved in our CRM, so only reject when both sides are numeric ids.
    return !facebookGroupIdsConflict(linkedGroupId, targetId);
  }

  async function readFacebookClipboard() {
    try {
      const value = await navigator.clipboard.readText();
      if (value) return value;
    } catch {}
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-hidden', 'true');
    Object.assign(textarea.style, { position: 'fixed', left: '-9999px', top: '0' });
    document.body.appendChild(textarea);
    textarea.focus();
    try {
      document.execCommand('paste');
      return textarea.value;
    } catch {
      return '';
    } finally {
      textarea.remove();
    }
  }

  async function copyPostReferenceFromShare(article, payload = {}) {
    const shareButton = findFacebookControl(article, ['chia sẻ', 'share']);
    if (!shareButton) return { postId: '', postUrl: '' };
    try {
      shareButton.click();
    } catch {
      return { postId: '', postUrl: '' };
    }

    let copyButton = null;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      copyButton = findFacebookControl(document, ['sao chép liên kết', 'copy link']);
      if (copyButton) break;
      await sleep(300);
    }
    if (!copyButton) return { postId: '', postUrl: '' };

    try {
      copyButton.click();
    } catch {
      return { postId: '', postUrl: '' };
    }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(250);
      try {
        const copied = canonicalPostReferenceUrl(await readFacebookClipboard());
        if (!referenceMatchesTarget(copied, payload.target_type, payload.target_id)) continue;
        return { postId: postIdFromUrl(copied), postUrl: copied };
      } catch {
        // clipboardRead permission is declared by the extension; retry briefly
        // because Facebook can update the clipboard after its share dialog closes.
      }
    }
    return { postId: '', postUrl: '' };
  }

  async function findNewPublishedPostReference() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (state.networkPendingReview || detectPostOutcome() === 'pending_review') {
        return { postId: '', postUrl: '', isPending: true };
      }
      const currentPostId = postIdFromUrl(window.location.href);
      if (currentPostId && !state.preSubmitPostIds.has(currentPostId) && !window.location.href.includes('my_pending_content')) {
        const article = findMatchingPublishedArticle(state.message);
        if (article) {
          return { postId: currentPostId, postUrl: window.location.href, isPublished: true, ...engagementMetricsFromArticle(article) };
        }
      }
      for (const article of document.querySelectorAll('[role="article"]')) {
        if (!isVisible(article) || !captionTextMatches(article.innerText || '', state.message)) continue;
        if (isPendingArticle(article)) {
          return { postId: '', postUrl: '', isPending: true };
        }
        for (const anchor of article.querySelectorAll(POST_REFERENCE_SELECTOR)) rememberPostReference(anchor.href, 120);
      }
      for (const notice of document.querySelectorAll('[role="alert"], [role="status"]')) {
        if (!isVisible(notice)) continue;
        for (const anchor of notice.querySelectorAll(POST_REFERENCE_SELECTOR)) rememberPostReference(anchor.href, postReferenceScore(anchor));
      }
      const best = [...state.postReferenceCandidates].sort((a, b) => b.score - a.score || b.detectedAt - a.detectedAt)[0];
      if (best?.score >= 100) {
        const article = findMatchingPublishedArticle(state.message);
        if (article) {
          const articleReference = referenceFromArticle(article);
          if (!best.postId || !articleReference.postId || best.postId === articleReference.postId) {
            return {
              postId: articleReference.postId || best.postId,
              postUrl: articleReference.postUrl || best.postUrl,
              isPublished: true,
              ...engagementMetricsFromArticle(article),
            };
          }
        }
        // A Group can redirect to my_pending_content shortly after the composer
        // closes. Give Facebook time to expose moderation state before trusting
        // a create-mutation reference that has not appeared in matching DOM.
        if (best.score >= 300 && attempt >= 8) {
          return { postId: best.postId, postUrl: best.postUrl, isNetworkCaptured: true };
        }
      }
      await sleep(750);
    }
    return { postId: '', postUrl: '' };
  }

  async function resolvePublishedPostFromFeed(payload) {
    const expectedMessage = String(payload?.message || '').trim();
    if (!expectedMessage) return { ok: false, error: 'Thiếu nội dung để đối chiếu bài vừa đăng.' };
    window.scrollTo({ top: 0, behavior: 'instant' });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const article = findMatchingPublishedArticle(expectedMessage) || findLikelyPublishedArticle(expectedMessage);
      if (article) {
        const reference = referenceFromArticle(article);
        if (reference.postUrl) return { ok: true, ...reference, ...engagementMetricsFromArticle(article) };
        const copied = await copyPostReferenceFromShare(article, {
          target_type: payload?.targetType,
          target_id: payload?.targetId,
        });
        if (copied.postUrl) return { ok: true, ...copied, ...engagementMetricsFromArticle(article), method: 'facebook_share_copy' };
      }
      if (attempt === 4 || attempt === 8) window.scrollBy({ top: 700, behavior: 'instant' });
      await sleep(700);
    }
    return { ok: false, error: 'Chưa thấy bài vừa đăng trên feed Facebook.' };
  }

  async function readCurrentPostMetrics(payload) {
    const expectedMessage = String(payload?.message || '').trim();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const article = (expectedMessage && findMatchingPublishedArticle(expectedMessage))
        || Array.from(document.querySelectorAll('[role="article"]')).find(isVisible)
        || null;
      if (article) {
        const metrics = engagementMetricsFromArticle(article);
        if (Object.values(metrics).some((value) => value !== null)) {
          const reference = referenceFromArticle(article);
          return { ok: true, ...reference, ...metrics };
        }
      }
      await sleep(500);
    }
    return { ok: false, error: 'Facebook chưa hiển thị số tương tác trên bài viết.' };
  }

  function collectPostFailures() {
    const notices = Array.from(document.querySelectorAll('[role="alert"], [role="status"]'))
      .filter(isVisible)
      .map((node) => normalize(node.innerText || node.textContent))
      .filter(Boolean);
    const failurePhrases = [
      'không thể đăng',
      'không thể chia sẻ',
      'đã xảy ra lỗi',
      'thử lại sau',
      'tạm thời bị chặn',
      'chúng tôi hạn chế tần suất',
      "couldn't post",
      'unable to post',
      'something went wrong',
      'try again later',
      'temporarily blocked',
      'we limit how often',
    ];
    return notices.filter((notice) => {
      const normalizedNotice = notice.toLowerCase();
      return failurePhrases.some((phrase) => normalizedNotice.includes(phrase));
    });
  }

  function detectPostFailure() {
    return collectPostFailures().find(
      (notice) => !state.preSubmitFailureNotices.has(notice.toLowerCase()),
    ) || '';
  }

  function watchForCompletion() {
    if (state.completionTimer) clearInterval(state.completionTimer);
    state.completionTimer = setInterval(() => {
      if (!state.postClickedAt) return;
      const facebookFailure = detectPostFailure();
      if (facebookFailure) {
        clearInterval(state.completionTimer);
        state.completionTimer = null;
        stopPostReferenceObserver();
        setNetworkReferenceCapture(false);
        state.postClickedAt = 0;
        state.preparedKey = '';
        const error = `Facebook từ chối đăng: ${facebookFailure}`;
        showStatus(`${error}\nHàng đợi đã dừng.`, 'error');
        sendProgress('facebook_error', { error, automatic: state.submissionAutomatic });
        return;
      }
      const dialogGone = !state.dialog || !state.dialog.isConnected || !isVisible(state.dialog);
      if (dialogGone) {
        clearInterval(state.completionTimer);
        state.completionTimer = null;
        setTimeout(async () => {
          const delayedFailure = detectPostFailure();
          if (delayedFailure) {
            stopPostReferenceObserver();
            setNetworkReferenceCapture(false);
            state.preparedKey = '';
            const error = `Facebook từ chối đăng: ${delayedFailure}`;
            showStatus(`${error}\nHàng đợi đã dừng.`, 'error');
            sendProgress('facebook_error', { error, automatic: state.submissionAutomatic });
            return;
          }
          let outcome = detectPostOutcome();
          showStatus(`Facebook đã đóng hộp đăng tại ${state.groupName}. Đang tự tìm link bài viết...`);
          const reference = await findNewPublishedPostReference();
          stopPostReferenceObserver();
          setNetworkReferenceCapture(false);
          if (reference.isPending || outcome === 'pending_review') {
            outcome = 'pending_review';
          } else if (reference.isPublished && outcome === 'submitted') {
            outcome = 'published';
          }
          const outcomeText = outcome === 'pending_review'
            ? 'Facebook báo đang chờ kiểm duyệt'
            : outcome === 'published' ? 'Facebook báo đã đăng' : 'đã gửi thao tác đăng';
          showStatus(`Đã ghi nhận ${state.groupName}: ${outcomeText}. Đang chuyển nơi tiếp theo...`, 'success');
          sendProgress('confirmed', {
            confirmedAt: new Date().toISOString(),
            outcome,
            postId: outcome === 'pending_review' ? '' : reference.postId,
            postUrl: outcome === 'pending_review' ? '' : reference.postUrl,
            reactionCount: reference.reaction_count,
            commentCount: reference.comment_count,
            shareCount: reference.share_count,
            referenceMethod: state.networkReferenceMethod || (reference.postUrl ? 'facebook_dom' : ''),
            automatic: state.submissionAutomatic,
          });
        }, 800);
        return;
      }
      if (Date.now() - state.postClickedAt > 45000) {
        clearInterval(state.completionTimer);
        state.completionTimer = null;
        stopPostReferenceObserver();
        setNetworkReferenceCapture(false);
        state.postClickedAt = 0;
        state.preparedKey = '';
        const error = 'Facebook chưa xác nhận đăng xong sau 45 giây.';
        showStatus(`${error}\nHàng đợi đã dừng để tránh đăng lặp.`, 'error');
        sendProgress('confirmation_timeout', { error, automatic: state.submissionAutomatic });
      }
    }, 500);
  }

  function handlePostIntent(event) {
    if (!state.requestId || !state.preparedKey || state.postClickedAt) return;
    const match = resolvePostButton(event.target);
    if (!match) return;
    // Capture pointerdown as well as click because Facebook may replace/remove
    // the composer during its own click handler before a later listener runs.
    beginPostSubmission(match, false);
  }

  document.addEventListener('pointerdown', handlePostIntent, true);
  document.addEventListener('click', handlePostIntent, true);

  async function findExistingPostReference(payload) {
    const expected = String(payload?.content || '').trim();
    if (!expected) return { ok: false, final: true, error: 'Lịch sử không có nội dung để đối chiếu bài Facebook.' };
    let matchedArticleWaits = 0;
    let shareCopyAttempted = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const matches = [];
      let matchingArticleVisible = false;
      let matchingArticle = null;
      for (const article of document.querySelectorAll('[role="article"]')) {
        if (!isVisible(article) || isPendingArticle(article)) continue;
        const text = article.innerText || article.textContent || '';
        if (!captionOrSignatureMatches(text, expected, true)) continue;
        matchingArticleVisible = true;
        matchingArticle ||= article;
        const ref = referenceFromArticle(article);
        if (ref.postId && ref.postUrl) {
          matches.push(ref);
        } else if (ref.postUrl) {
          const extractedId = postIdFromUrl(ref.postUrl);
          if (extractedId) matches.push({ postId: extractedId, postUrl: ref.postUrl });
        }
        for (const anchor of article.querySelectorAll('a[href]')) {
          const href = anchor.href || '';
          if (!isBrowsablePostUrl(href)) continue;
          const postId = postIdFromUrl(href);
          if (postId) matches.push({ postId, postUrl: href });
        }
      }
      const unique = [...new Map(matches.map((item) => [item.postId, item])).values()].filter((item) => item.postId);
      if (unique.length === 1) return { ok: true, ...unique[0], method: 'facebook_dom_match' };
      if (unique.length > 1) {
        return { ok: false, final: true, ambiguous: true, error: 'Facebook hiển thị nhiều bài trùng nội dung; cần chọn link thủ công để tránh gắn nhầm.' };
      }
      if (matchingArticle && !shareCopyAttempted) {
        shareCopyAttempted = true;
        showStatus('Đã thấy đúng bài. Đang bấm Chia sẻ → Sao chép liên kết...');
        const copied = await copyPostReferenceFromShare(matchingArticle, payload);
        if (copied.postUrl) {
          showStatus('Đã sao chép đúng link bài Facebook.', 'success');
          return { ok: true, ...copied, method: 'facebook_share_copy' };
        }
        return {
          ok: false,
          final: true,
          error: 'Đã thấy đúng bài nhưng Facebook/Chrome không cho extension đọc link từ nút Chia sẻ. Hãy bấm Sao chép liên kết rồi dùng Dán clipboard & lưu.',
        };
      }
      if (matchingArticleVisible && matchedArticleWaits < 6) {
        matchedArticleWaits += 1;
        await sleep(700);
        continue;
      }
      matchedArticleWaits = 0;
      window.scrollBy({ top: Math.max(520, Math.floor(window.innerHeight * 0.75)), behavior: 'smooth' });
      await sleep(850);
    }
    return { ok: false, final: true, error: 'Không tìm thấy bài khớp nội dung trong kết quả Facebook.' };
  }

  function commentIdFromUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return String(url.searchParams.get('comment_id') || url.searchParams.get('reply_comment_id') || '').trim();
    } catch {
      return '';
    }
  }

  function profileIdFromUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      if (!url.hostname.endsWith('facebook.com')) return '';
      const numeric = url.searchParams.get('id');
      if (numeric && /^\d+$/.test(numeric)) return numeric;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'user' && parts[1]) return parts[1];
      const slug = parts[0] || '';
      return /^(groups|pages|photo|watch|reel|share|permalink)$/i.test(slug) ? '' : slug;
    } catch {
      return '';
    }
  }

  function facebookCommentFromArticle(article, index) {
    const aria = normalize(article.getAttribute('aria-label') || '');
    const ariaMatch = aria.match(/(?:bình luận của|comment by)\s+(.+?)(?:\s+(?:vào|on)\b|$)/i);
    const anchors = [...article.querySelectorAll('a[href]')];
    const authorAnchor = anchors.find((anchor) => {
      const label = normalize(anchor.innerText || anchor.textContent || '');
      return label && profileIdFromUrl(anchor.href || '') && !/thích|like|phản hồi|reply/i.test(label);
    });
    const authorName = normalize(ariaMatch?.[1] || authorAnchor?.innerText || authorAnchor?.textContent || '') || 'Ẩn danh';
    const blocked = /^(thích|like|phản hồi|reply|chia sẻ|share|xem thêm|see more|đã chỉnh sửa|edited|tác giả|author)$/i;
    const candidates = [...article.querySelectorAll('[dir="auto"]')]
      .filter((node) => !node.querySelector('[dir="auto"]'))
      .map((node) => normalize(node.innerText || node.textContent || ''))
      .filter((text) => text && text !== authorName && !blocked.test(text) && !/^\d+\s*(phút|giờ|ngày|tuần|tháng|năm|m|h|d|w|y)$/i.test(text));
    const message = candidates.sort((a, b) => b.length - a.length)[0] || '';
    if (!message || message.length > 5000) return null;
    const commentAnchor = anchors.find((anchor) => commentIdFromUrl(anchor.href || ''));
    const timeNode = article.querySelector('abbr[data-utime], time[datetime]');
    const unixTime = Number(timeNode?.getAttribute('data-utime') || 0);
    return {
      comment_id: commentIdFromUrl(commentAnchor?.href || ''),
      author_id: profileIdFromUrl(authorAnchor?.href || ''),
      author_name: authorName,
      message,
      created_time: Number.isFinite(unixTime) && unixTime > 0
        ? new Date(unixTime * 1000).toISOString()
        : String(timeNode?.getAttribute('datetime') || ''),
      dom_index: index,
    };
  }

  async function expandFacebookComments() {
    const phrases = /(xem|hiển thị).*(bình luận|phản hồi)|(view|show).*(comments?|repl(?:y|ies))/i;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const control = [...document.querySelectorAll('button, [role="button"]')]
        .find((node) => isVisible(node) && phrases.test(normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || '')));
      if (!control) break;
      try { control.click(); } catch { break; }
      await sleep(900);
    }
  }

  function facebookPostContentMatches(article, expectedContent, allowContainedShort = false) {
    const expected = String(expectedContent || '').trim();
    if (!expected) return false;
    if (captionOrSignatureMatches(article.innerText || article.textContent || '', expected, allowContainedShort)) return true;
    return [...article.querySelectorAll('[dir="auto"]')]
      .filter((node) => !node.querySelector('[dir="auto"]'))
      .some((node) => (
        captionTextMatches(node.innerText || node.textContent || '', expected)
        || (allowContainedShort && captionOrSignatureMatches(node.innerText || node.textContent || '', expected, true))
      ));
  }

  function nearbyFacebookMetricCount(root, phrases) {
    const indicators = [...root.querySelectorAll('[aria-label], img[alt]')]
      .filter((node) => {
        const label = normalize(node.getAttribute('aria-label') || node.getAttribute('alt') || '').toLowerCase();
        return label && phrases.some((phrase) => label.includes(phrase));
      });
    for (const indicator of indicators) {
      let scope = indicator.parentElement;
      for (let depth = 0; scope && root.contains(scope) && depth < 5; depth += 1, scope = scope.parentElement) {
        const text = normalize(scope.innerText || scope.textContent || '');
        if (text.length > 80) break;
        const tokens = [...scope.querySelectorAll('a, span')]
          .map((node) => normalize(node.innerText || node.textContent || ''))
          .filter((value) => /^\d[\d.,]*\s*(?:k|m|b|nghìn|nghin|triệu|trieu|tr)?$/i.test(value));
        for (const token of tokens) {
          const count = globalThis.STREALFacebookPostData?.parseCountToken(token);
          if (count !== null && count !== undefined) return count;
        }
      }
    }
    return null;
  }

  function facebookPostObjectId(value) {
    return String(value || '').trim().split('_').at(-1) || '';
  }

  function facebookPostIdsMatch(left, right) {
    const leftId = facebookPostObjectId(left);
    const rightId = facebookPostObjectId(right);
    return Boolean(leftId && rightId && leftId === rightId);
  }

  function isFacebookPostDialog(node) {
    if (!node || node.getAttribute?.('role') !== 'dialog') return false;
    const heading = normalize(node.querySelector('[role="heading"], h1, h2, h3')?.innerText || '');
    return /(?:bài viết của|post by|post from)/i.test(heading);
  }

  function visibleFacebookPostContainers() {
    const articles = [...document.querySelectorAll('[role="article"]')].filter(isVisible);
    const postDialogs = [...document.querySelectorAll('[role="dialog"]')]
      .filter((dialog) => isVisible(dialog) && isFacebookPostDialog(dialog));
    return [...articles, ...postDialogs.filter((dialog) => !articles.includes(dialog))];
  }

  async function collectFacebookPostData(payload) {
    const expectedPostId = String(payload?.post_id || postIdFromUrl(payload?.post_url) || '').trim();
    const expectedContent = String(payload?.content || '').trim();
    const targetType = payload?.target_type === 'page' ? 'page' : 'group';
    const expectedTargetId = String(payload?.target_id || '').trim();
    const currentPostId = postIdFromUrl(window.location.href);
    const trustedOpenedPermalink = Boolean(expectedPostId && currentPostId && (
      facebookPostIdsMatch(currentPostId, expectedPostId) || isOpaqueFacebookShareId(expectedPostId)
    ));
    if (targetType === 'group' && expectedTargetId) {
      const openedGroupId = groupIdFromUrl(window.location.href);
      if (facebookGroupIdsConflict(openedGroupId, expectedTargetId)) {
        return {
          ok: false,
          final: true,
          contentMismatch: true,
          error: 'Permalink đang mở không thuộc đúng Group trong lịch sử. Extension đã từ chối đồng bộ.',
        };
      }
    }
    let postArticle = null;
    let matchedByReference = false;
    let matchedByContent = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const containers = visibleFacebookPostContainers();
      postArticle = containers.find((article) => [...article.querySelectorAll('a[href]')]
        .some((anchor) => facebookPostIdsMatch(postIdFromUrl(anchor.href || ''), expectedPostId)));
      matchedByReference = Boolean(postArticle);
      if (!postArticle && trustedOpenedPermalink) {
        postArticle = containers.find(isFacebookPostDialog)
          || containers.find((article) => /bình luận|comment|chia sẻ|share/i.test(normalize(article.innerText || article.textContent || '')));
        matchedByReference = Boolean(postArticle);
      }
      if (!postArticle && expectedContent) {
        postArticle = containers.find((article) => captionOrSignatureMatches(
          article.innerText || article.textContent || '',
          expectedContent,
          trustedOpenedPermalink,
        ));
        matchedByContent = Boolean(postArticle);
      }
      if (!postArticle) {
        postArticle = containers.find((article) => /bình luận|comment|chia sẻ|share/i.test(normalize(article.innerText || article.textContent || '')));
      }
      if (postArticle) break;
      await sleep(500);
    }
    if (!postArticle) return { ok: false, final: true, error: 'Extension không nhận diện được khung bài viết Facebook.' };
    let warning = '';
    if (!facebookPostContentMatches(postArticle, expectedContent, trustedOpenedPermalink)) {
      // A Group permalink can be a perfectly valid post ID while still pointing
      // at somebody else's post. Caption agreement is mandatory for Group data.
      if (targetType === 'group' || (!matchedByReference && !matchedByContent && !trustedOpenedPermalink)) {
        return {
          ok: false,
          final: true,
          contentMismatch: true,
          error: 'Permalink đang mở là một bài khác, nội dung không khớp lịch sử. Hệ thống đã từ chối gắn/đồng bộ để tránh sai dữ liệu.',
        };
      }
      warning = 'Caption trên Facebook lệch nhẹ so với lịch sử; extension vẫn đồng bộ vì permalink/post id đang mở khớp.';
    }

    await expandFacebookComments();
    const metricNodes = [postArticle, ...postArticle.querySelectorAll('[aria-label], a, span')];
    const metricTexts = metricNodes.flatMap((node) => [
      node.getAttribute?.('aria-label') || '',
      node.innerText || node.textContent || '',
      `${node.getAttribute?.('aria-label') || ''} ${node.innerText || node.textContent || ''}`,
    ]);
    const metrics = globalThis.STREALFacebookPostData?.extractMetricCounts(metricTexts)
      || { reactionCount: null, commentCount: null, shareCount: null };
    if (metrics.reactionCount === null) {
      metrics.reactionCount = nearbyFacebookMetricCount(postArticle, [
        'bày tỏ cảm xúc', 'reaction', 'yêu thích', 'love', 'thương thương', 'haha', 'wow', 'buồn', 'phẫn nộ',
      ]);
    }
    if (metrics.commentCount === null) {
      metrics.commentCount = nearbyFacebookMetricCount(postArticle, ['bình luận', 'comment']);
    }
    if (metrics.shareCount === null) {
      metrics.shareCount = nearbyFacebookMetricCount(postArticle, ['chia sẻ', 'share']);
    }
    const commentArticles = [...document.querySelectorAll('[role="article"]')]
      .filter((article) => article !== postArticle && isVisible(article))
      .filter((article) => {
        const aria = normalize(article.getAttribute('aria-label') || '');
        if (/bình luận của|comment by/i.test(aria)) return true;
        if (!postArticle.contains(article) || facebookPostContentMatches(article, expectedContent, trustedOpenedPermalink)) return false;
        return /(?:trả lời|reply)/i.test(normalize(article.innerText || article.textContent || ''));
      });
    const comments = commentArticles
      .map((article, index) => facebookCommentFromArticle(article, index))
      .filter(Boolean);
    const uniqueComments = [...new Map(comments.map((item) => [
      `${item.comment_id || ''}|${item.author_id || item.author_name}|${item.message}`,
      item,
    ])).values()];
    return {
      ok: true,
      method: 'facebook_dom_post_data',
      postId: expectedPostId || postIdFromUrl(window.location.href),
      postUrl: String(window.location.href || payload?.post_url || ''),
      reactionCount: metrics.reactionCount ?? 0,
      commentCount: metrics.commentCount ?? uniqueComments.length,
      shareCount: metrics.shareCount ?? 0,
      comments: uniqueComments,
      warning,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'STREAL_FACEBOOK_CANCEL_GROUP_POST') {
      if (!message.requestId || message.requestId !== state.requestId) {
        sendResponse({ ok: true, alreadyStopped: true });
        return false;
      }
      if (state.completionTimer) clearInterval(state.completionTimer);
      if (state.autoSubmitTimer) clearTimeout(state.autoSubmitTimer);
      state.cancelledRequestIds.add(message.requestId);
      state.completionTimer = null;
      state.autoSubmitTimer = null;
      state.requestId = '';
      state.taskId = '';
      state.preparedKey = '';
      state.postClickedAt = 0;
      state.submissionAutomatic = false;
      state.preSubmitFailureNotices = new Set();
      state.preSubmitPostUrls = new Set();
      state.preSubmitPostIds = new Set();
      stopPostReferenceObserver();
      setNetworkReferenceCapture(false);
      state.postReferenceCandidates = [];
      showStatus('Đã hủy hàng đợi đăng Facebook. Bài chưa đăng sẽ không tự chuyển sang nơi khác.', 'error');
      sendResponse({ ok: true, cancelled: true });
      return false;
    }
    if (message?.type === 'STREAL_FACEBOOK_FIND_PUBLISHED_POST') {
      resolvePublishedPostFromFeed(message.payload || {})
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'STREAL_FACEBOOK_FIND_EXISTING_POST') {
      findExistingPostReference(message.payload || {})
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'STREAL_FACEBOOK_READ_POST_METRICS') {
      readCurrentPostMetrics(message.payload || {})
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'STREAL_FACEBOOK_COLLECT_POST_DATA') {
      collectFacebookPostData(message.payload || {})
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type !== 'STREAL_FACEBOOK_PREPARE_GROUP_POST') return false;
    preparePost(message.payload || {})
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
})();
