(() => {
  if (window.__strealFacebookProfileDetectorLoaded) return;
  window.__strealFacebookProfileDetectorLoaded = true;

  const CONTACT_LABELS = ['thông tin liên hệ', 'contact info', 'contact information', 'thông tin cơ bản và liên hệ'];
  const BIO_LABELS = ['giới thiệu', 'intro', 'chi tiết về', 'details about'];
  const SKIP_PATHS = /^\/(groups|pages|watch|marketplace|gaming|events|reel|reels|photo|photos|permalink|share|messages|notifications)(\/|$)/i;
  let lastUrl = '';
  let scanTimer = 0;
  let scanAttempts = 0;
  let dismissedUrl = '';

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  }

  function isProfileUrl() {
    const path = location.pathname;
    if (!path || path === '/' || SKIP_PATHS.test(path)) return false;
    if (/^\/profile\.php$/i.test(path)) return Boolean(new URLSearchParams(location.search).get('id'));
    const parts = path.split('/').filter(Boolean);
    return parts.length === 1 || (parts.length === 2 && /^about(?:_|$)/i.test(parts[1]));
  }

  function profileIdentity() {
    const params = new URLSearchParams(location.search);
    const pathId = location.pathname.split('/').filter(Boolean)[0] || '';
    const uid = params.get('id') || (/^\d{5,}$/.test(pathId) ? pathId : '');
    const heading = [...document.querySelectorAll('h1')].find((node) => node.textContent?.trim());
    const titleName = document.title.replace(/\s*\|\s*Facebook.*$/i, '').trim();
    return { uid, name: heading?.textContent?.trim() || titleName || 'Facebook User', profileUrl: location.href };
  }

  function trustedSections() {
    const sections = [];
    const nodes = document.querySelectorAll('span, h2, h3, div[role="heading"]');
    for (const node of nodes) {
      const text = normalizedText(node.textContent);
      if (!text || text.length > 80) continue;
      const contact = CONTACT_LABELS.some((label) => text === label || text.startsWith(`${label} `));
      const bio = !contact && BIO_LABELS.some((label) => text === label || text.startsWith(`${label} `));
      if (!contact && !bio) continue;
      let container = node.parentElement;
      for (let level = 0; level < 3 && container?.parentElement; level += 1) container = container.parentElement;
      if (container) sections.push({ container, source: contact ? 'facebook_public_contact' : 'facebook_public_bio' });
    }
    return sections;
  }

  function removePanel() {
    document.getElementById('streal-public-phone-panel')?.remove();
  }

  function showPanel(result) {
    removePanel();
    const panel = document.createElement('aside');
    panel.id = 'streal-public-phone-panel';
    Object.assign(panel.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483646', width: '310px',
      padding: '16px', borderRadius: '14px', background: '#fff', color: '#172033',
      boxShadow: '0 16px 44px rgba(15,23,42,.28)', font: '14px/1.45 Arial,sans-serif', border: '1px solid #dbe4f0',
    });
    const title = document.createElement('strong');
    title.textContent = result.name;
    title.style.display = 'block';
    title.style.fontSize = '16px';
    const detail = document.createElement('div');
    detail.style.margin = '8px 0 12px';
    detail.textContent = result.phone
      ? `Phone: ${result.phone}\nNguồn: ${result.source === 'facebook_public_contact' ? 'Facebook Public Contact' : 'Facebook Public Bio'}`
      : 'Không tìm thấy SĐT công khai trong thông tin liên hệ/giới thiệu.';
    detail.style.whiteSpace = 'pre-line';
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    const button = (label) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      Object.assign(item.style, { border: '0', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', fontWeight: '700' });
      return item;
    };
    if (result.phone) {
      const copy = button('Copy');
      copy.onclick = async () => { await navigator.clipboard.writeText(result.phone); copy.textContent = 'Đã copy'; };
      const save = button('Lưu vào Lead');
      save.style.background = '#1d4ed8';
      save.style.color = '#fff';
      save.onclick = () => {
        save.disabled = true;
        save.textContent = 'Đang lưu...';
        chrome.runtime.sendMessage({ type: 'STREAL_SAVE_PUBLIC_FACEBOOK_CONTACT', payload: {
          name: result.name, phone: result.phone, phone_source: result.source,
          facebook_uid: result.uid, profile_url: result.profileUrl,
        } }, (response) => {
          save.disabled = false;
          save.textContent = response?.ok ? (response.created ? 'Đã tạo Lead' : 'Đã cập nhật CRM') : 'Không lưu được';
          if (!response?.ok) save.title = response?.error || 'Hãy đăng nhập F-Solution và thử lại';
        });
      };
      actions.append(copy, save);
    }
    const close = button('Đóng');
    close.onclick = () => { dismissedUrl = location.href; removePanel(); };
    actions.append(close);
    panel.append(title, detail, actions);
    document.documentElement.appendChild(panel);
  }

  function scanProfile() {
    if (!isProfileUrl()) return;
    const identity = profileIdentity();
    for (const section of trustedSections()) {
      const phone = globalThis.STREALFacebookPhoneUtils?.extractPhones(section.container.innerText || '')?.[0] || '';
      if (phone) {
        showPanel({ ...identity, phone, source: section.source });
        return;
      }
    }
    scanAttempts += 1;
    if (scanAttempts >= 4) showPanel({ ...identity, phone: '', source: '' });
    else scheduleScan(1300);
  }

  function scheduleScan(delay = 900) {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanProfile();
    }, delay);
  }

  function checkNavigation() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scanAttempts = 0;
    dismissedUrl = '';
    removePanel();
    if (isProfileUrl()) scheduleScan(1200);
  }

  const observer = new MutationObserver(() => {
    if (isProfileUrl() && dismissedUrl !== location.href && scanAttempts < 4 && !document.getElementById('streal-public-phone-panel')) scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(checkNavigation, 1000);
  checkNavigation();
})();
