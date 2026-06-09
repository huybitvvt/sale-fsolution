'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { ContentPipelinePost, FbPage, GroupRow } from '@/lib/types';

type PipelinePayload = {
  posts?: ContentPipelinePost[];
};

type Props = {
  data: PipelinePayload;
  busy: boolean;
  status: string;
  onReload: () => Promise<void>;
  onResearch: (sourceFilter: string) => Promise<void>;
};

type PublishTarget = {
  type: 'group' | 'page';
  id: string;
  name: string;
};

type PublishResult = {
  ok: boolean;
  target: PublishTarget;
  post_id?: string;
  error?: string;
};

type HistoryRow = {
  id: string;
  title: string;
  content: string;
  mediaUrl: string;
  hashtags: string;
  scheduledAt: string;
  targets: PublishTarget[];
  status: string;
  results?: PublishResult[];
  createdAt: string;
};

const HISTORY_KEY = 'seeding-post-history-v2';

function targetKey(target: PublishTarget) {
  return `${target.type}:${target.id}`;
}

function safeList<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? payload as T[] : [];
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('vi-VN');
}

async function readPayload(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function MarketingPipelinePanel({ data, busy, status, onReload }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [hashtags, setHashtags] = useState('#guitar #guitarsaithanh');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({});
  const [selectedPages, setSelectedPages] = useState<Record<string, boolean>>({});
  const [captionVariants, setCaptionVariants] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [localStatus, setLocalStatus] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(safeList<HistoryRow>(JSON.parse(raw)));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadTargets();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 80)));
    } catch {
      // Local history is a convenience only; posting flow must not fail because storage is full.
    }
  }, [history]);

  const selectedTargets = useMemo<PublishTarget[]>(() => {
    const groupTargets = groups
      .filter((group) => group.id && selectedGroups[group.id])
      .map((group) => ({ type: 'group' as const, id: group.id, name: group.name || group.id }));
    const pageTargets = pages
      .filter((page) => page.id && selectedPages[page.id])
      .map((page) => ({ type: 'page' as const, id: page.id, name: page.name || page.id }));
    return [...groupTargets, ...pageTargets];
  }, [groups, pages, selectedGroups, selectedPages]);

  const importedHistory = useMemo<HistoryRow[]>(() => {
    return (data.posts || []).map((post) => ({
      id: `pipeline-${post.id}`,
      title: post.article_title || 'Bản nháp content',
      content: post.content || '',
      mediaUrl: post.article_url || '',
      hashtags: post.hashtags || '',
      scheduledAt: post.scheduled_at || '',
      targets: (post.scheduled_targets || []).map((target) => ({
        type: target.type === 'page' ? 'page' : 'group',
        id: target.id || '-',
        name: target.name || target.id || '-',
      })),
      status: post.status || 'draft',
      createdAt: post.created_at || post.updated_at || '',
    }));
  }, [data.posts]);

  const visibleHistory = useMemo(() => {
    const seen = new Set<string>();
    return [...history, ...importedHistory].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [history, importedHistory]);

  async function loadTargets() {
    setLoadingTargets(true);
    setLocalStatus('');
    try {
      const [groupRes, pageRes] = await Promise.all([api('/api/groups'), api('/api/pages')]);
      const groupPayload = await readPayload(groupRes);
      const pagePayload = await readPayload(pageRes);
      const groupRows = safeList<GroupRow>(groupPayload).filter((item) => item?.id);
      const pageRows = safeList<FbPage>(pagePayload).filter((item) => item?.id);
      setGroups(groupRows);
      setPages(pageRows);
      setSelectedGroups((prev) => {
        const next: Record<string, boolean> = {};
        groupRows.forEach((group) => {
          next[group.id] = prev[group.id] ?? true;
        });
        return next;
      });
      setSelectedPages((prev) => {
        const next: Record<string, boolean> = {};
        pageRows.forEach((page) => {
          next[page.id] = prev[page.id] ?? false;
        });
        return next;
      });
      if (!pageRows.length && !Array.isArray(pagePayload) && pagePayload?.error) {
        setLocalStatus(`Không đồng bộ được Page: ${pagePayload.error}`);
      }
    } catch {
      setGroups([]);
      setPages([]);
      setLocalStatus('Lỗi kết nối khi tải danh sách nhóm/Page.');
    } finally {
      setLoadingTargets(false);
    }
  }

  function setAllTargets(checked: boolean) {
    setSelectedGroups(Object.fromEntries(groups.map((group) => [group.id, checked])));
    setSelectedPages(Object.fromEntries(pages.map((page) => [page.id, checked])));
  }

  function buildMessage(target?: PublishTarget) {
    const variant = target ? captionVariants[targetKey(target)] : '';
    const body = (variant || content).trim();
    return [
      title.trim(),
      body,
      mediaUrl.trim(),
      hashtags.trim(),
    ].filter(Boolean).join('\n\n');
  }

  function appendHistory(row: Omit<HistoryRow, 'id' | 'createdAt'>) {
    setHistory((prev) => [{
      ...row,
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
    }, ...prev].slice(0, 80));
  }

  async function generatePostCaptions() {
    const base = content.trim() || title.trim();
    if (!base) {
      setLocalStatus('Nhập tiêu đề hoặc nội dung gốc trước khi dùng AI viết bài.');
      return;
    }
    if (!selectedTargets.length) {
      setLocalStatus('Chọn ít nhất một nhóm hoặc Page để AI tạo biến thể theo nơi đăng.');
      return;
    }
    setGenerating(true);
    setLocalStatus('');
    try {
      const res = await api('/api/ai/caption-variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: base,
          targets: selectedTargets.map((target) => ({ id: target.id, name: target.name, type: target.type })),
        }),
      });
      const payload = await readPayload(res);
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'AI chưa tạo được biến thể');
      const next: Record<string, string> = {};
      safeList<{ id?: string; type?: string; caption?: string }>(payload.captions).forEach((item) => {
        const type = item.type === 'page' ? 'page' : 'group';
        if (item.id && item.caption) next[`${type}:${item.id}`] = item.caption;
      });
      setCaptionVariants(next);
      setLocalStatus(`Đã tạo ${Object.keys(next).length} biến thể nội dung.${payload.warning ? ` ${payload.warning}` : ''}`);
    } catch (err: any) {
      setLocalStatus(`Lỗi AI viết bài: ${err?.message || 'Không tạo được biến thể'}`);
    } finally {
      setGenerating(false);
    }
  }

  async function publishNow() {
    const baseMessage = buildMessage();
    if (!baseMessage) {
      setLocalStatus('Nhập nội dung bài viết trước khi đăng.');
      return;
    }
    if (!selectedTargets.length) {
      setLocalStatus('Chọn ít nhất một nhóm hoặc Page để đăng.');
      return;
    }
    setPublishing(true);
    setLocalStatus(`Đang đăng tới ${selectedTargets.length} nơi...`);
    const results: PublishResult[] = [];
    for (const target of selectedTargets) {
      const message = buildMessage(target);
      try {
        const endpoint = target.type === 'page' ? '/api/page-post' : '/api/post';
        const body = target.type === 'page'
          ? { page_id: target.id, message }
          : { group_id: target.id, message };
        const res = await api(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await readPayload(res);
        results.push({
          ok: !!payload.ok,
          target,
          post_id: payload.post_id,
          error: payload.error,
        });
      } catch (err: any) {
        results.push({ ok: false, target, error: err?.message || 'Lỗi kết nối' });
      }
    }
    const okCount = results.filter((item) => item.ok).length;
    const failCount = results.length - okCount;
    appendHistory({
      title,
      content,
      mediaUrl,
      hashtags,
      scheduledAt: '',
      targets: selectedTargets,
      status: failCount ? `Đã đăng ${okCount}, lỗi ${failCount}` : 'Đã đăng',
      results,
    });
    setLocalStatus(`Đã đăng ${okCount}/${results.length} nơi${failCount ? `, lỗi ${failCount}` : ''}.`);
    setPublishing(false);
    void onReload();
  }

  function scheduleDraft() {
    const message = buildMessage();
    if (!message) {
      setLocalStatus('Nhập nội dung bài viết trước khi đặt lịch.');
      return;
    }
    if (!scheduledAt) {
      setLocalStatus('Chọn ngày giờ cần đăng.');
      return;
    }
    if (!selectedTargets.length) {
      setLocalStatus('Chọn ít nhất một nhóm hoặc Page để đặt lịch.');
      return;
    }
    appendHistory({
      title,
      content,
      mediaUrl,
      hashtags,
      scheduledAt,
      targets: selectedTargets,
      status: 'Đã lưu lịch',
    });
    setLocalStatus('Đã lưu lịch đăng trong màn hình. Muốn tự chạy nền cần bật worker/cron phía backend.');
  }

  function checkLinks() {
    const url = mediaUrl.trim();
    if (!url) {
      setLocalStatus('Chưa nhập link ảnh/video để kiểm tra.');
      return;
    }
    try {
      const parsed = new URL(url);
      const isVideo = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(parsed.pathname) || /youtube|youtu\.be|tiktok|facebook|fb\.watch/i.test(parsed.hostname);
      setLocalStatus(isVideo
        ? 'Link hợp lệ. Hiện backend đang đăng link vào nội dung để Facebook tự tạo preview; upload video trực tiếp cần thêm driver upload riêng.'
        : 'Link hợp lệ. Khi đăng, link sẽ được chèn vào nội dung bài viết.');
    } catch {
      setLocalStatus('Link ảnh/video chưa đúng định dạng URL.');
    }
  }

  const targetCount = selectedTargets.length;

  return (
    <section className="module-panel marketing-panel seeding-studio">
      <div className="module-head">
        <div>
          <div className="module-kicker">Đăng nhóm / Fanpage</div>
          <h2>Đăng bài hội nhóm</h2>
          <p className="module-subline">
            Soạn một kịch bản gốc, chọn nhiều nhóm/Page, tạo biến thể caption bằng AI rồi đăng hoặc lưu lịch trong một màn hình.
          </p>
        </div>
        <div className="module-actions">
          <button type="button" className="btn-cancel" disabled={loadingTargets || busy} onClick={() => void loadTargets()}>
            {loadingTargets ? 'Đang tải...' : 'Tải nhóm/Page'}
          </button>
          <button type="button" className="btn-cancel" disabled={busy} onClick={() => void onReload()}>
            Tải lịch sử
          </button>
        </div>
      </div>

      <div className="seeding-layout">
        <div className="seeding-compose-card">
          <div className="seeding-section-title">📣 Đăng bài hội nhóm</div>

          <label className="seeding-field">
            <span>Tiêu đề bài viết</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="VD: Review đàn guitar acoustic tầm 3 triệu"
            />
          </label>

          <label className="seeding-field">
            <span>Nội dung</span>
            <textarea
              className="seeding-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Nội dung bài đăng..."
            />
          </label>

          <label className="seeding-field">
            <span>Link ảnh / video (URL)</span>
            <input
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>

          <div className="seeding-form-grid">
            <label className="seeding-field">
              <span>Đặt lịch đăng</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
            <label className="seeding-field">
              <span>Hashtags</span>
              <input
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
                placeholder="#guitar #guitarsaithanh"
              />
            </label>
          </div>

          <div className="seeding-toolbar">
            <button type="button" className="btn-submit" disabled={publishing} onClick={() => void publishNow()}>
              {publishing ? 'Đang đăng...' : '📣 Đăng ngay'}
            </button>
            <button type="button" className="btn-cancel" disabled={publishing} onClick={scheduleDraft}>
              ⏰ Đặt lịch
            </button>
            <button type="button" className="btn-cancel" disabled={generating || !targetCount} onClick={() => void generatePostCaptions()}>
              {generating ? 'AI đang viết...' : '🤖 AI viết bài'}
            </button>
            <button type="button" className="btn-cancel" onClick={checkLinks}>
              🔗 Check links
            </button>
          </div>

          {Object.keys(captionVariants).length ? (
            <div className="seeding-caption-variants">
              <div className="seeding-section-title">Biến thể nội dung theo từng nơi đăng</div>
              {selectedTargets.map((target) => (
                <label key={targetKey(target)} className="caption-variant-card">
                  <span>{target.type === 'page' ? 'Page' : 'Nhóm'} · {target.name}</span>
                  <textarea
                    value={captionVariants[targetKey(target)] || ''}
                    onChange={(event) => setCaptionVariants((prev) => ({
                      ...prev,
                      [targetKey(target)]: event.target.value,
                    }))}
                    placeholder="AI sẽ tạo caption riêng cho nơi đăng này"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="seeding-target-card">
          <div className="seeding-target-head">
            <div>
              <b>Chọn nhóm/Page để đăng</b>
              <span>{targetCount} nơi đang chọn</span>
            </div>
            <div className="seeding-target-actions">
              <button type="button" onClick={() => setAllTargets(true)}>Tất cả</button>
              <button type="button" onClick={() => setAllTargets(false)}>Bỏ chọn</button>
            </div>
          </div>

          <div className="seeding-target-list">
            {groups.map((group) => (
              <label key={`group-${group.id}`} className="seeding-target-row">
                <input
                  type="checkbox"
                  checked={!!selectedGroups[group.id]}
                  onChange={(event) => setSelectedGroups((prev) => ({ ...prev, [group.id]: event.target.checked }))}
                />
                <span>
                  <b>{group.name || group.id}</b>
                  <small>Facebook Group</small>
                </span>
              </label>
            ))}
            {pages.map((page) => (
              <label key={`page-${page.id}`} className="seeding-target-row">
                <input
                  type="checkbox"
                  checked={!!selectedPages[page.id]}
                  onChange={(event) => setSelectedPages((prev) => ({ ...prev, [page.id]: event.target.checked }))}
                />
                <span>
                  <b>{page.name || page.id}</b>
                  <small>Facebook Page</small>
                </span>
              </label>
            ))}
            {!groups.length && !pages.length ? (
              <div className="seeding-empty-target">
                Chưa có nhóm/Page. Vào Quản lý nhóm để thêm nhóm hoặc bấm Đồng bộ Page FB.
              </div>
            ) : null}
          </div>

          <div className="target-note">
            Link video hiện được đăng dạng URL preview. Muốn upload video thật như n8n cần thêm driver upload/video riêng.
          </div>
        </aside>
      </div>

      <div className="seeding-history">
        <div className="seeding-section-title">📋 Lịch sử đăng bài</div>
        <div className="data-table-wrap">
          <table className="data-table seeding-history-table">
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Nội dung</th>
                <th>Link ảnh/video</th>
                <th>Lịch đăng</th>
                <th>Nơi đăng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.length ? visibleHistory.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.title || 'Bài đăng'}</b>
                    <small>{formatDateTime(row.createdAt)}</small>
                  </td>
                  <td>{row.content || '-'}</td>
                  <td>{row.mediaUrl ? <a href={row.mediaUrl} target="_blank" rel="noreferrer">Mở link</a> : '-'}</td>
                  <td>{formatDateTime(row.scheduledAt)}</td>
                  <td>{row.targets.length ? row.targets.map((target) => target.name).join(', ') : '-'}</td>
                  <td>
                    <span className={row.status.includes('lỗi') || row.status.includes('failed') ? 'pill-danger' : 'pill-ok'}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="table-empty">Chưa có bài đăng nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="seeding-status-line">{localStatus || status}</div>
    </section>
  );
}
