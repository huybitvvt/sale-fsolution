import os
import re
import subprocess
import sys
import time
import uuid

from flask import Flask, jsonify, request
from flask_cors import CORS


PORT = int(os.environ.get('PORT', '8080') or 8080)
WORKER_API_KEY = os.environ.get('WORKER_API_KEY', '')
PLAYWRIGHT_HEADLESS = os.environ.get('PLAYWRIGHT_HEADLESS', 'true').lower() in ('1', 'true', 'yes', 'on')
PLAYWRIGHT_USER_DATA_DIR = os.environ.get('PLAYWRIGHT_USER_DATA_DIR', './data/playwright/tiktok-worker-profile')
PLAYWRIGHT_TIMEOUT_MS = int(os.environ.get('PLAYWRIGHT_TIMEOUT_MS', '60000') or 60000)
TIKTOK_COOKIE = os.environ.get('TIKTOK_COOKIE', '')


app = Flask(__name__)
CORS(app)


def _authorized() -> bool:
    if not WORKER_API_KEY:
        return True
    auth = request.headers.get('Authorization', '')
    token = auth.replace('Bearer ', '', 1).strip() if auth.startswith('Bearer ') else ''
    return token == WORKER_API_KEY or request.headers.get('X-Worker-Key') == WORKER_API_KEY


def _extract_tiktok_video_id(raw: str) -> tuple[str, str]:
    value = (raw or '').strip()
    if not value:
        return '', ''
    if re.fullmatch(r'\d{8,}', value):
        return value, f'https://www.tiktok.com/@/video/{value}'
    match = re.search(r'/video/(\d{8,})', value)
    if match:
        return match.group(1), value
    match = re.search(r'(?:^|_)(\d{8,})(?:$|[?#&])', value)
    if match:
        return match.group(1), f'https://www.tiktok.com/@/video/{match.group(1)}'
    return '', value


def _extract_tiktok_handle(raw: str) -> tuple[str, str]:
    value = (raw or '').strip()
    if not value:
        return '', ''
    match = re.search(r'tiktok\.com/@([^/?#]+)', value, re.I)
    if match:
        handle = match.group(1).strip().lstrip('@')
        return handle, f'https://www.tiktok.com/@{handle}'
    handle = value.strip().lstrip('@').strip('/ ')
    if re.fullmatch(r'[A-Za-z0-9._-]{2,80}', handle):
        return handle, f'https://www.tiktok.com/@{handle}'
    return '', value


def _parse_cookie_header(cookie: str) -> list[dict]:
    rows = []
    for part in (cookie or '').split(';'):
        if '=' not in part:
            continue
        name, value = part.split('=', 1)
        name = name.strip()
        value = value.strip()
        if not name:
            continue
        rows.append({
            'name': name,
            'value': value,
            'domain': '.tiktok.com',
            'path': '/',
            'secure': True,
        })
    return rows


def _collect_video_links_from_page(page, handle: str, max_videos: int) -> list[dict]:
    rows = []
    seen = set()
    for _ in range(8):
        try:
            links = page.evaluate(
                """() => Array.from(document.querySelectorAll('a[href*="/video/"]')).map((a) => ({
                  href: a.href,
                  text: (a.innerText || a.getAttribute('aria-label') || a.title || '').trim(),
                }))"""
            )
        except Exception:
            links = []

        for item in links or []:
            href = str((item or {}).get('href') or '')
            match = re.search(r'/video/(\d{8,})', href)
            if not match:
                continue
            video_id = match.group(1)
            if video_id in seen:
                continue
            seen.add(video_id)
            rows.append({
                'video_id': video_id,
                'post_url': href.split('?')[0],
                'channel_name': f'@{handle}',
                'video_title': str((item or {}).get('text') or '')[:220] or f'Video {video_id}',
            })
            if len(rows) >= max_videos:
                return rows

        try:
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(1200)
        except Exception:
            break
    return rows


def _click_first_visible(locator) -> bool:
    try:
        count = min(locator.count(), 8)
    except Exception:
        return False
    for idx in range(count):
        item = locator.nth(idx)
        try:
            if item.is_visible(timeout=800):
                item.click(timeout=3000)
                return True
        except Exception:
            continue
    return False


def _install_playwright_browsers() -> tuple[bool, str]:
    try:
        result = subprocess.run(
            [
                sys.executable,
                '-m',
                'playwright',
                'install',
                'chromium',
                'chromium-headless-shell',
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=240,
        )
        return result.returncode == 0, (result.stdout or '')[-1200:]
    except Exception as e:
        return False, str(e)


def _launch_persistent_context(p, launch_opts: dict):
    def launch_once():
        return p.chromium.launch_persistent_context(
            PLAYWRIGHT_USER_DATA_DIR,
            **launch_opts,
        )

    first_error = None
    for attempt in range(4):
        try:
            return launch_once()
        except Exception as e:
            first_error = e
            message = str(e)
            if 'ETXTBSY' not in message and 'Text file busy' not in message:
                break
            time.sleep(2 + attempt)

    try:
        return launch_once()
    except Exception as first_error:
        message = str(first_error)
        missing_browser = (
            "Executable doesn't exist" in message
            or 'Please run the following command to download new browsers' in message
            or 'playwright install' in message
        )
        if not missing_browser:
            raise

        ok, install_output = _install_playwright_browsers()
        if not ok:
            raise RuntimeError(
                'Playwright thiếu browser và tự cài lại không thành công: '
                f'{install_output[:900]}'
            ) from first_error

        time.sleep(3)
        for attempt in range(4):
            try:
                return launch_once()
            except Exception as e:
                if 'ETXTBSY' not in str(e) and 'Text file busy' not in str(e):
                    raise
                time.sleep(2 + attempt)
        return launch_once()


def _run_channel_videos(body: dict) -> tuple[dict, str]:
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return {}, 'Worker chưa cài Playwright. Chạy: pip install playwright && python -m playwright install chromium'

    raw_channel = str(body.get('channel') or body.get('url') or body.get('profile_url') or '').strip()
    max_videos = max(1, min(int(body.get('max_videos') or 8), 30))
    cookie = str(body.get('cookie') or TIKTOK_COOKIE or '').strip()
    handle, profile_url = _extract_tiktok_handle(raw_channel)
    if not handle:
        return {}, 'Không nhận diện được kênh TikTok. Nhập @username hoặc link kênh.'

    os.makedirs(PLAYWRIGHT_USER_DATA_DIR, exist_ok=True)
    timeout = max(15000, min(PLAYWRIGHT_TIMEOUT_MS, 180000))
    context = None
    try:
        with sync_playwright() as p:
            launch_opts = {
                'headless': PLAYWRIGHT_HEADLESS,
                'viewport': {'width': 1366, 'height': 1000},
                'locale': 'vi-VN',
                'args': [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--no-first-run',
                ],
            }
            context = _launch_persistent_context(p, launch_opts)
            if cookie:
                try:
                    context.add_cookies(_parse_cookie_header(cookie))
                except Exception:
                    pass

            page = context.pages[0] if context.pages else context.new_page()
            page.set_default_timeout(timeout)
            page.goto(profile_url, wait_until='domcontentloaded', timeout=timeout)
            page.wait_for_timeout(3500)
            videos = _collect_video_links_from_page(page, handle, max_videos)
            if not videos:
                return {}, 'Worker đã mở kênh nhưng không thấy video công khai. Kiểm tra kênh, cookie TikTok hoặc trạng thái đăng nhập.'
            return {
                'ok': True,
                'method': 'playwright-worker',
                'channel': f'@{handle}',
                'profile_url': profile_url,
                'count': len(videos),
                'videos': videos,
            }, ''
    except Exception as e:
        return {}, f'Worker Playwright không gom được video kênh TikTok: {str(e)[:260]}'
    finally:
        try:
            if context:
                context.close()
        except Exception:
            pass


def _run_comment(body: dict) -> tuple[dict, str]:
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return {}, 'Worker chưa cài Playwright. Chạy: pip install playwright && python -m playwright install chromium'

    raw_url = str(body.get('url') or body.get('video_url') or body.get('post_url') or '').strip()
    raw_video_id = str(body.get('video_id') or '').strip()
    post_id = str(body.get('post_id') or '').strip()
    message = str(body.get('message') or body.get('text') or '').strip()
    comment_text = str(body.get('comment_text') or '').strip()
    cookie = str(body.get('cookie') or TIKTOK_COOKIE or '').strip()

    if post_id.startswith('tiktok_') and not raw_video_id:
        raw_video_id = post_id.replace('tiktok_', '', 1)
    video_id, final_url = _extract_tiktok_video_id(raw_video_id or raw_url)
    if not video_id:
        return {}, 'Không nhận diện được video TikTok để worker xử lý.'
    if not message:
        return {}, 'Thiếu nội dung bình luận.'
    if not final_url:
        final_url = raw_url or f'https://www.tiktok.com/@/video/{video_id}'

    os.makedirs(PLAYWRIGHT_USER_DATA_DIR, exist_ok=True)
    timeout = max(15000, min(PLAYWRIGHT_TIMEOUT_MS, 180000))
    context = None
    try:
        with sync_playwright() as p:
            launch_opts = {
                'headless': PLAYWRIGHT_HEADLESS,
                'viewport': {'width': 1366, 'height': 900},
                'locale': 'vi-VN',
                'args': [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--no-first-run',
                ],
            }
            context = _launch_persistent_context(p, launch_opts)
            if cookie:
                try:
                    context.add_cookies(_parse_cookie_header(cookie))
                except Exception:
                    pass

            page = context.pages[0] if context.pages else context.new_page()
            page.set_default_timeout(timeout)
            page.goto(final_url, wait_until='domcontentloaded', timeout=timeout)
            page.wait_for_timeout(2500)

            for selector in (
                '[data-e2e="comment-icon"]',
                'button[aria-label*="comment" i]',
                'button[aria-label*="bình luận" i]',
                'div[role="button"][aria-label*="comment" i]',
            ):
                _click_first_visible(page.locator(selector))
                page.wait_for_timeout(450)

            target_found = False
            if comment_text:
                try:
                    target_found = bool(page.evaluate(
                        """(text) => {
                          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                          const needle = normalize(text).slice(0, 100);
                          if (!needle) return false;
                          const nodes = Array.from(document.querySelectorAll('div, span, p'));
                          for (const node of nodes) {
                            if (!normalize(node.innerText || node.textContent).includes(needle)) continue;
                            node.scrollIntoView({ block: 'center', inline: 'nearest' });
                            let parent = node;
                            for (let depth = 0; depth < 10 && parent; depth += 1, parent = parent.parentElement) {
                              const actions = Array.from(parent.querySelectorAll('button, [role="button"], span'));
                              const reply = actions.find((item) => /reply|trả lời/i.test(item.innerText || item.getAttribute('aria-label') || ''));
                              if (reply) {
                                reply.click();
                                return true;
                              }
                            }
                            return true;
                          }
                          return false;
                        }""",
                        comment_text,
                    ))
                    page.wait_for_timeout(900)
                except Exception:
                    target_found = False

            typed = False
            for selector in (
                '[data-e2e="comment-input"] [contenteditable="true"]',
                'div.public-DraftEditor-content[contenteditable="true"]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]',
                'textarea[placeholder*="comment" i]',
                'textarea[placeholder*="bình luận" i]',
            ):
                try:
                    loc = page.locator(selector)
                    if loc.count():
                        loc.first.click(timeout=3000)
                        page.keyboard.insert_text(message)
                        typed = True
                        break
                except Exception:
                    continue
            if not typed:
                return {}, 'Worker đã mở TikTok nhưng không tìm thấy ô nhập bình luận.'

            page.wait_for_timeout(700)
            submitted = False
            for selector in (
                '[data-e2e="comment-post"]',
                'button[data-e2e*="comment-post"]',
                'button[aria-label*="post" i]',
                'button[aria-label*="đăng" i]',
                'button[aria-label*="gửi" i]',
                'div[role="button"][aria-label*="post" i]',
            ):
                if _click_first_visible(page.locator(selector)):
                    submitted = True
                    break
            if not submitted:
                for key in ('Control+Enter', 'Meta+Enter', 'Enter'):
                    try:
                        page.keyboard.press(key)
                        submitted = True
                        break
                    except Exception:
                        continue
            if not submitted:
                return {}, 'Worker đã nhập bình luận nhưng không bấm được nút gửi.'

            page.wait_for_timeout(1800)
            return {
                'ok': True,
                'method': 'playwright-worker',
                'url': final_url,
                'video_id': video_id,
                'comment_id': f'worker_{uuid.uuid4().hex}',
                'reply_target_found': target_found,
            }, ''
    except Exception as e:
        return {}, f'Worker Playwright không gửi được TikTok: {str(e)[:260]}'
    finally:
        try:
            if context:
                context.close()
        except Exception:
            pass


@app.get('/health')
def health():
    return jsonify({
        'ok': True,
        'service': 'tiktok-playwright-worker',
        'headless': PLAYWRIGHT_HEADLESS,
        'has_cookie': bool(TIKTOK_COOKIE),
    })


@app.post('/tiktok/comment')
def tiktok_comment():
    if not _authorized():
        return jsonify({'ok': False, 'error': 'Unauthorized worker key'}), 401
    body = request.get_json() or {}
    payload, error = _run_comment(body)
    if error:
        return jsonify({'ok': False, 'error': error, 'method': 'playwright-worker'}), 502
    return jsonify(payload)


@app.post('/tiktok/channel-videos')
def tiktok_channel_videos():
    if not _authorized():
        return jsonify({'ok': False, 'error': 'Unauthorized worker key'}), 401
    body = request.get_json() or {}
    payload, error = _run_channel_videos(body)
    if error:
        return jsonify({'ok': False, 'error': error, 'method': 'playwright-worker'}), 502
    return jsonify(payload)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
