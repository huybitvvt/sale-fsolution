const domainLabel = document.getElementById('domain-label');
const cookieCount = document.getElementById('cookie-count');
const cookieText = document.getElementById('cookie-text');
const statusMessage = document.getElementById('status-message');
const refreshButton = document.getElementById('refresh-button');
const copyButton = document.getElementById('copy-button');
const importButton = document.getElementById('import-button');

let currentTab = null;

function setStatus(message, kind = '') {
  statusMessage.textContent = message;
  statusMessage.className = `status${kind ? ` ${kind}` : ''}`;
}

function setBusy(busy) {
  refreshButton.disabled = busy;
  copyButton.disabled = busy;
  importButton.disabled = busy;
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const tab = Array.isArray(tabs) ? tabs[0] : null;
      if (!tab?.url) return reject(new Error('Không đọc được URL của tab hiện tại.'));
      let parsed;
      try { parsed = new URL(tab.url); } catch { parsed = null; }
      if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
        return reject(new Error('Trang hiện tại không hỗ trợ đọc cookie. Hãy mở một website HTTP hoặc HTTPS.'));
      }
      currentTab = { ...tab, parsedUrl: parsed };
      resolve(currentTab);
    });
  });
}

function getCookies(tab) {
  const details = { url: tab.parsedUrl.href };
  if (tab.cookieStoreId) details.storeId = tab.cookieStoreId;
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll(details, (cookies) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(Array.isArray(cookies) ? cookies : []);
    });
  });
}

function displayCookies(tab, cookies) {
  domainLabel.textContent = tab.parsedUrl.hostname;
  cookieCount.textContent = `${cookies.length} cookie`;
  cookieText.value = JSON.stringify(cookies, null, 2);
}

async function loadCookies() {
  setBusy(true);
  setStatus('Đang tải cookie…');
  try {
    const tab = await queryActiveTab();
    const cookies = await getCookies(tab);
    displayCookies(tab, cookies);
    setStatus(cookies.length ? 'Đã tải cookie cho tab hiện tại.' : 'Domain hiện tại chưa có cookie.', cookies.length ? 'success' : '');
  } catch (error) {
    domainLabel.textContent = 'Không xác định domain';
    cookieCount.textContent = '0 cookie';
    setStatus(error?.message || 'Không tải được cookie.', 'error');
  } finally {
    setBusy(false);
  }
}

async function copyCookies() {
  try {
    await navigator.clipboard.writeText(cookieText.value || '[]');
    setStatus('Đã sao chép JSON cookie vào clipboard.', 'success');
  } catch {
    cookieText.focus();
    cookieText.select();
    const copied = document.execCommand('copy');
    setStatus(copied ? 'Đã sao chép JSON cookie vào clipboard.' : 'Không truy cập được clipboard. Hãy chọn và sao chép nội dung.', copied ? 'success' : 'error');
  }
}

function domainMatches(hostname, cookieDomain) {
  const domain = String(cookieDomain || '').trim().replace(/^\./, '').toLowerCase();
  const host = String(hostname || '').toLowerCase();
  return Boolean(domain && (host === domain || host.endsWith(`.${domain}`)));
}

function cookieDetailsForCurrentTab(cookie, tab) {
  if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) {
    throw new Error('Mỗi phần tử cookie phải là một object.');
  }
  if (typeof cookie.name !== 'string' || !cookie.name || typeof cookie.value !== 'string') {
    throw new Error('Cookie cần có name và value dạng chuỗi.');
  }

  const host = tab.parsedUrl.hostname;
  const cookieDomain = String(cookie.domain || host).trim();
  if (!domainMatches(host, cookieDomain)) {
    throw new Error(`Cookie “${cookie.name}” thuộc domain khác tab hiện tại.`);
  }
  if (cookie.secure && tab.parsedUrl.protocol !== 'https:') {
    throw new Error(`Cookie Secure “${cookie.name}” chỉ nhập được trên HTTPS.`);
  }

  const path = typeof cookie.path === 'string' && cookie.path.startsWith('/') ? cookie.path : '/';
  const details = {
    url: `${tab.parsedUrl.protocol}//${tab.parsedUrl.host}${path}`,
    name: cookie.name,
    value: cookie.value,
    path,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
  };

  if (!cookie.hostOnly && cookie.domain) details.domain = cookieDomain;
  if (['no_restriction', 'lax', 'strict'].includes(cookie.sameSite)) details.sameSite = cookie.sameSite;
  if (Number.isFinite(cookie.expirationDate) && cookie.expirationDate > 0 && !cookie.session) {
    details.expirationDate = cookie.expirationDate;
  }
  if (tab.cookieStoreId) details.storeId = tab.cookieStoreId;

  if (cookie.partitionKey && typeof cookie.partitionKey === 'object') {
    const topLevelSite = String(cookie.partitionKey.topLevelSite || '');
    if (topLevelSite) {
      let partitionUrl;
      try { partitionUrl = new URL(topLevelSite); } catch { throw new Error(`Partition key của cookie “${cookie.name}” không hợp lệ.`); }
      if (!domainMatches(host, partitionUrl.hostname)) {
        throw new Error(`Partition key của cookie “${cookie.name}” không khớp tab hiện tại.`);
      }
      details.partitionKey = { topLevelSite: partitionUrl.origin };
      if (typeof cookie.partitionKey.hasCrossSiteAncestor === 'boolean') {
        details.partitionKey.hasCrossSiteAncestor = cookie.partitionKey.hasCrossSiteAncestor;
      }
    }
  }

  return details;
}

function setCookie(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.set(details, (cookie) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!cookie) return reject(new Error('Chrome từ chối cookie này.'));
      resolve(cookie);
    });
  });
}

async function importCookies() {
  let cookies;
  try {
    cookies = JSON.parse(cookieText.value);
  } catch {
    setStatus('JSON không hợp lệ. Hãy dán một JSON array cookie.', 'error');
    return;
  }
  if (!Array.isArray(cookies)) {
    setStatus('Dữ liệu nhập phải là một JSON array.', 'error');
    return;
  }

  setBusy(true);
  try {
    const tab = currentTab || await queryActiveTab();
    const results = [];
    for (const cookie of cookies) {
      try {
        const details = cookieDetailsForCurrentTab(cookie, tab);
        await setCookie(details);
        results.push({ ok: true });
      } catch (error) {
        results.push({ ok: false, message: error?.message || 'Không nhập được cookie.' });
      }
    }

    const imported = results.filter((result) => result.ok).length;
    const failed = results.length - imported;
    displayCookies(tab, await getCookies(tab));
    if (failed) {
      const firstError = results.find((result) => !result.ok)?.message || '';
      setStatus(`Đã nhập ${imported}/${results.length} cookie. ${firstError}`, imported ? '' : 'error');
    } else {
      setStatus(`Đã nhập ${imported} cookie vào ${tab.parsedUrl.hostname}.`, 'success');
    }
  } catch (error) {
    setStatus(error?.message || 'Không nhập được cookie.', 'error');
  } finally {
    setBusy(false);
  }
}

refreshButton.addEventListener('click', loadCookies);
copyButton.addEventListener('click', copyCookies);
importButton.addEventListener('click', importCookies);
void loadCookies();
