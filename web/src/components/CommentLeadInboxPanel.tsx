'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { StoredPostComment } from '@/lib/types';

type TabKey = 'inbox' | 'customers' | 'stats' | 'templates';
type SourceKey = 'all' | 'fb-page' | 'fb-group' | 'tiktok' | 'instagram';
type TagKey = 'hot' | 'closed' | 'need' | 'price' | 'review' | 'vip';

type CommentPayload = {
  ok?: boolean;
  comments?: StoredPostComment[];
  count?: number;
  warning?: string;
  error?: string;
};

type TikTokBridgeResult = {
  ok?: boolean;
  comment_id?: string;
  cid?: string;
  id?: string;
  url?: string;
  error?: string;
  method?: string;
};

type TagMeta = {
  key: TagKey;
  label: string;
  icon: string;
  className: string;
};

const SOURCE_META: Record<SourceKey, { label: string; icon: string; className: string }> = {
  all: { label: 'Tất cả', icon: '●', className: 'src-all' },
  'fb-page': { label: 'FB Page', icon: '📘', className: 'src-page' },
  'fb-group': { label: 'FB Group', icon: '👥', className: 'src-group' },
  tiktok: { label: 'TikTok', icon: '🎵', className: 'src-tiktok' },
  instagram: { label: 'Instagram', icon: '📷', className: 'src-instagram' },
};

const TAGS: TagMeta[] = [
  { key: 'hot', label: 'Nóng', icon: '🔥', className: 'tag-hot' },
  { key: 'closed', label: 'Đã chốt', icon: '💰', className: 'tag-closed' },
  { key: 'need', label: 'Có nhu cầu', icon: '🎯', className: 'tag-need' },
  { key: 'price', label: 'Hỏi giá', icon: '❔', className: 'tag-price' },
  { key: 'review', label: 'Xem xét', icon: '🔎', className: 'tag-review' },
  { key: 'vip', label: 'VIP', icon: '⭐', className: 'tag-vip' },
];

const QUICK_REPLIES = [
  {
    title: 'Hỏi nhu cầu',
    text: 'Em chào anh/chị, mình cần hỗ trợ nội dung nào ạ? Anh/chị gửi thêm yêu cầu để bên em tư vấn đúng hơn nhé.',
  },
  {
    title: 'Báo giá',
    text: 'Em đã nhận thông tin. Anh/chị cho em xin nhu cầu cụ thể và số lượng/khối lượng để bên em báo giá chính xác ạ.',
  },
  {
    title: 'Xin SĐT',
    text: 'Anh/chị để lại SĐT hoặc nhắn inbox giúp em, sale bên em sẽ liên hệ tư vấn nhanh ạ.',
  },
  {
    title: 'Đã chốt',
    text: 'Em cảm ơn anh/chị. Bên em sẽ ghi nhận thông tin và liên hệ xác nhận đơn/yêu cầu ngay ạ.',
  },
];

function normalizeText(value?: string) {
  return (value || '').toLowerCase();
}

function sourceKey(row: StoredPostComment): SourceKey {
  const source = normalizeText(row.source);
  if (source.includes('page')) return 'fb-page';
  if (source.includes('tiktok')) return 'tiktok';
  if (source.includes('instagram') || source === 'ig') return 'instagram';
  if (source.includes('facebook')) return 'fb-group';
  return 'fb-group';
}

function sourceLabel(row: StoredPostComment) {
  const key = sourceKey(row);
  return SOURCE_META[key];
}

function commentText(row: StoredPostComment) {
  return row.message || '';
}

function commentTags(row: StoredPostComment): TagMeta[] {
  const text = normalizeText(commentText(row));
  const matched = new Set((row.matched_keywords || []).map((item) => normalizeText(item)));
  const phones = row.phones || (row.phone ? [row.phone] : []);
  const tags = new Set<TagKey>();

  if (phones.length || /gấp|ngay|inbox|ib|nhắn|zalo|sđt|sdt|phone/.test(text)) tags.add('hot');
  if (/chốt|đặt|mua|lấy|order|đơn|ship/.test(text)) tags.add('closed');
  if (row.is_matched || matched.size || /quan tâm|cần|tư vấn|hỗ trợ|muốn|có không|còn không/.test(text)) tags.add('need');
  if (/giá|bao nhiêu|báo giá|quote|phí|tiền/.test(text)) tags.add('price');
  if (phones.length && tags.has('need')) tags.add('vip');
  if (!tags.size || /\?/.test(text)) tags.add('review');

  return TAGS.filter((item) => tags.has(item.key));
}

function commentTime(row: StoredPostComment) {
  const raw = row.created_time || row.fetched_at;
  if (!raw) return '-';
  try {
    return new Date(raw).toLocaleString('vi-VN');
  } catch {
    return raw;
  }
}

function channelName(row: StoredPostComment) {
  if (row.channel_name) return row.channel_name;
  if (row.video_title) return row.video_title;
  if (row.group_id) return row.group_id;
  return row.post_id || '-';
}

function leadRows(comments: StoredPostComment[]) {
  return comments
    .map((row) => {
      const tags = commentTags(row);
      const phones = row.phones || (row.phone ? [row.phone] : []);
      const isLead = phones.length || tags.some((tag) => ['hot', 'closed', 'need', 'price', 'vip'].includes(tag.key));
      if (!isLead) return null;
      return { row, tags, phones };
    })
    .filter(Boolean) as { row: StoredPostComment; tags: TagMeta[]; phones: string[] }[];
}

export function CommentLeadInboxPanel() {
  const [tab, setTab] = useState<TabKey>('inbox');
  const [comments, setComments] = useState<StoredPostComment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceKey>('all');
  const [tagFilter, setTagFilter] = useState<TagKey | ''>('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyStatus, setReplyStatus] = useState('');
  const [tiktokBridgeReady, setTiktokBridgeReady] = useState(false);
  const [tiktokBridgeVersion, setTiktokBridgeVersion] = useState('');

  const loadComments = async () => {
    setBusy(true);
    setStatus('Đang tải inbox bình luận...');
    try {
      const r = await api('/api/post-comments?limit=1000');
      const data: CommentPayload = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (data.ok) {
        const rows = Array.isArray(data.comments) ? data.comments : [];
        setComments(rows);
        setSelectedId((current) => current || rows[0]?.comment_id || '');
        setStatus(data.warning ? `⚠️ ${data.warning}` : rows.length ? `✅ Đã tải ${rows.length} bình luận thật` : 'Chưa có bình luận. Hãy lấy CMT từ bài Facebook/TikTok trước.');
      } else {
        setStatus(`❌ ${data.error || 'Không tải được bình luận'}`);
      }
    } catch {
      setStatus('❌ Lỗi kết nối khi tải bình luận');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadComments();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleBridgeMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== 'streal-tiktok-extension') return;
      if (data.type === 'STREAL_TIKTOK_BRIDGE_READY') {
        setTiktokBridgeReady(true);
        setTiktokBridgeVersion(data.version || '');
      }
    };

    const pingBridge = () => {
      window.postMessage(
        {
          source: 'streal-web-page',
          type: 'STREAL_TIKTOK_BRIDGE_PING',
          requestId: `comment_inbox_ping_${Date.now()}`,
        },
        window.location.origin,
      );
    };

    window.addEventListener('message', handleBridgeMessage);
    pingBridge();
    const pingTimer = window.setInterval(pingBridge, 2500);
    const stopTimer = window.setTimeout(() => window.clearInterval(pingTimer), 15000);
    return () => {
      window.removeEventListener('message', handleBridgeMessage);
      window.clearInterval(pingTimer);
      window.clearTimeout(stopTimer);
    };
  }, []);

  const filtered = useMemo(() => {
    const kw = normalizeText(query);
    return comments.filter((row) => {
      if (sourceFilter !== 'all' && sourceKey(row) !== sourceFilter) return false;
      const tags = commentTags(row);
      if (tagFilter && !tags.some((tag) => tag.key === tagFilter)) return false;
      if (!kw) return true;
      return [row.author_name, row.message, row.post_id, row.channel_name, row.video_title, row.phone, ...(row.phones || [])]
        .filter(Boolean)
        .some((value) => normalizeText(String(value)).includes(kw));
    });
  }, [comments, query, sourceFilter, tagFilter]);

  const selected = filtered.find((row) => row.comment_id === selectedId) || filtered[0] || null;

  const sourceCounts = useMemo(() => {
    const counts: Record<SourceKey, number> = { all: comments.length, 'fb-page': 0, 'fb-group': 0, tiktok: 0, instagram: 0 };
    comments.forEach((row) => {
      counts[sourceKey(row)] += 1;
    });
    return counts;
  }, [comments]);

  const tagCounts = useMemo(() => {
    const counts: Record<TagKey, number> = { hot: 0, closed: 0, need: 0, price: 0, review: 0, vip: 0 };
    comments.forEach((row) => {
      commentTags(row).forEach((tag) => {
        counts[tag.key] += 1;
      });
    });
    return counts;
  }, [comments]);

  const customers = useMemo(() => leadRows(comments), [comments]);

  const syncLead = async (row?: StoredPostComment | null) => {
    const body = row?.post_id ? { source: row.source || '', post_id: row.post_id } : {};
    setStatus('Đang đưa SĐT/comment tiềm năng vào bảng Lead...');
    try {
      const r = await api('/api/leads/from-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      setStatus(data.ok ? `✅ Đã đồng bộ ${data.count || 0} lead vào bảng Lead` : `❌ ${data.error || 'Không đồng bộ được lead'}`);
    } catch {
      setStatus('❌ Lỗi kết nối khi đồng bộ lead');
    }
  };

  const copyReply = async (text: string) => {
    setReplyText(text);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('✅ Đã copy mẫu câu');
    } catch {
      setStatus('Đã chèn mẫu câu vào ô trả lời');
    }
  };

  function requestTiktokExtensionComment(payload: Record<string, unknown>): Promise<TikTokBridgeResult> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve({ ok: false, error: 'Chỉ gửi được TikTok trên Chrome có cài extension' });
        return;
      }

      const requestId = `comment_inbox_tiktok_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const timer = window.setTimeout(() => {
        cleanup();
        resolve({ ok: false, error: 'Không thấy extension phản hồi. Hãy cài/bật Lead Hunter Bridge rồi tải lại trang.' });
      }, 120000);

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.source !== 'streal-tiktok-extension') return;
        if (data.type !== 'STREAL_TIKTOK_COMMENT_RESPONSE') return;
        if (data.requestId !== requestId) return;
        cleanup();
        resolve(data as TikTokBridgeResult);
      };

      function cleanup() {
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timer);
      }

      window.addEventListener('message', handleMessage);
      window.postMessage(
        {
          source: 'streal-web-page',
          type: 'STREAL_TIKTOK_COMMENT_REQUEST',
          requestId,
          payload,
        },
        window.location.origin,
      );
    });
  }

  async function recordTiktokExtensionResult(row: StoredPostComment, statusValue: 'success' | 'failed', message: string, result: TikTokBridgeResult) {
    const r = await api('/api/tiktok/comment/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: statusValue,
        post_id: row.post_id,
        post_url: row.post_url || row.comment_url || result.url,
        video_title: row.video_title,
        channel_name: row.channel_name,
        message,
        comment_id: result.comment_id || result.cid || result.id,
        error: result.error,
        extension_result: result,
      }),
    });
    return r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
  }

  const sendReply = async () => {
    if (!selected) {
      setReplyStatus('Chọn bình luận trước khi trả lời');
      return;
    }
    const message = replyText.trim();
    if (!message) {
      setReplyStatus('Nhập nội dung trả lời');
      return;
    }

    const src = sourceKey(selected);
    setReplyBusy(true);
    setReplyStatus(src === 'tiktok' ? 'Đang gửi bình luận TikTok bằng extension...' : 'Đang gửi trả lời...');
    try {
      if (src === 'tiktok') {
        if (!tiktokBridgeReady) {
          setReplyStatus('Chưa thấy extension. Cài/bật Lead Hunter Bridge, đăng nhập TikTok trên Chrome rồi tải lại trang.');
          return;
        }
        const extensionResult = await requestTiktokExtensionComment({
          post_id: selected.post_id,
          post_url: selected.post_url || selected.comment_url,
          video_title: selected.video_title,
          channel_name: selected.channel_name,
          message,
        });
        if (extensionResult.ok) {
          const saved = await recordTiktokExtensionResult(selected, 'success', message, extensionResult);
          setReplyText('');
          setReplyStatus(saved.warning ? `✅ Đã gửi CMT TikTok, nhưng ${saved.warning}` : '✅ Đã gửi CMT TikTok lên video. TikTok không hỗ trợ gắn reply đúng thread trong bản này.');
          await loadComments();
        } else {
          await recordTiktokExtensionResult(selected, 'failed', message, extensionResult).catch(() => null);
          setReplyStatus(`❌ ${extensionResult.error || 'Extension chưa gửi được bình luận TikTok'}`);
        }
        return;
      }

      if (src === 'instagram') {
        setReplyStatus('Instagram chưa hỗ trợ trả lời comment trong bản này');
        return;
      }

      const r = await api('/api/post-comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: selected.source,
          post_id: selected.post_id,
          group_id: selected.group_id,
          post_url: selected.post_url || selected.comment_url,
          comment_id: selected.comment_id,
          depth: selected.depth || 0,
          message,
        }),
      });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (data.ok) {
        setReplyText('');
        setReplyStatus(data.warning ? `✅ Đã trả lời Facebook, nhưng ${data.warning}` : '✅ Đã trả lời comment Facebook và lưu lịch sử');
        await loadComments();
      } else {
        setReplyStatus(`❌ ${data.error || 'Không gửi được trả lời'}`);
      }
    } catch {
      setReplyStatus('❌ Lỗi kết nối khi gửi trả lời');
    } finally {
      setReplyBusy(false);
    }
  };

  const exportCustomers = () => {
    const rows = [['Tên', 'Kênh', 'SĐT', 'Nội dung', 'Link']];
    customers.forEach(({ row, phones }) => {
      rows.push([row.author_name || 'Ẩn danh', sourceLabel(row).label, phones.join(', '), row.message || '', row.comment_url || row.post_url || '']);
    });
    const csv = rows.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `comment_leads_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`;
    link.click();
    setStatus('✅ Đã xuất danh sách lead comment');
  };

  return (
    <section className="comment-studio module-panel">
      <div className="comment-studio-head">
        <div>
          <div className="module-kicker">Bình luận & Lead</div>
          <h2>Inbox đa kênh</h2>
          <p>Gom comment Facebook Page, Facebook Group, TikTok và các lead có SĐT vào một màn hình xử lý.</p>
        </div>
        <div className="module-actions">
          <button type="button" className="btn-cancel" onClick={() => void loadComments()} disabled={busy}>
            {busy ? 'Đang tải...' : 'Tải lại'}
          </button>
          <button type="button" className="btn-submit" onClick={() => void syncLead(selected)}>
            Tách lead
          </button>
        </div>
      </div>

      <div className="comment-tabs">
        <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
          💬 Inbox <span>{filtered.length}</span>
        </button>
        <button type="button" className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}>
          👤 Khách hàng
        </button>
        <button type="button" className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          📊 Thống kê
        </button>
        <button type="button" className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>
          ⚡ Mẫu câu
        </button>
      </div>

      {tab === 'inbox' ? (
        <div className="comment-inbox-layout">
          <aside className="comment-filter-pane">
            <div className="comment-filter-title">Kênh</div>
            {(Object.keys(SOURCE_META) as SourceKey[]).map((key) => (
              <button key={key} type="button" className={`comment-filter-row ${sourceFilter === key ? 'active' : ''}`} onClick={() => setSourceFilter(key)}>
                <span className={`source-dot ${SOURCE_META[key].className}`} />
                <span>{SOURCE_META[key].icon} {SOURCE_META[key].label}</span>
                <b>{sourceCounts[key]}</b>
              </button>
            ))}

            <div className="comment-filter-title tag-title">Tags</div>
            {TAGS.map((tag) => (
              <button
                key={tag.key}
                type="button"
                className={`comment-filter-row ${tagFilter === tag.key ? 'active' : ''}`}
                onClick={() => setTagFilter((current) => (current === tag.key ? '' : tag.key))}
              >
                <span className={`comment-tag ${tag.className}`}>{tag.icon} {tag.label}</span>
                <b>{tagCounts[tag.key]}</b>
              </button>
            ))}
          </aside>

          <div className="comment-list-pane">
            <div className="comment-list-toolbar">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Tìm tên, SĐT, nội dung..." />
              <button type="button" className={!tagFilter ? 'active' : ''} onClick={() => setTagFilter('')}>
                Tất cả
              </button>
              <button type="button" onClick={() => setTagFilter('review')}>
                Chưa xử lý
              </button>
              <button type="button" onClick={() => setTagFilter('vip')}>
                ⭐
              </button>
            </div>

            <div className="comment-list">
              {filtered.length ? filtered.map((row) => {
                const meta = sourceLabel(row);
                const tags = commentTags(row);
                return (
                  <button
                    key={row.comment_id || `${row.post_id}-${row.author_name}-${row.fetched_at}`}
                    type="button"
                    className={`comment-card ${selected?.comment_id === row.comment_id ? 'active' : ''}`}
                    onClick={() => setSelectedId(row.comment_id || '')}
                  >
                    <div className="comment-avatar">{(row.author_name || '?').trim().charAt(0).toUpperCase()}</div>
                    <div className="comment-card-body">
                      <div className="comment-card-top">
                        <b>{row.author_name || 'Ẩn danh'}</b>
                        <small>{commentTime(row)}</small>
                      </div>
                      <span className={`source-pill ${meta.className}`}>{meta.icon} {meta.label}</span>
                      <p>{commentText(row) || '(Không có nội dung chữ)'}</p>
                      <div className="comment-tags">
                        {tags.map((tag) => <span key={tag.key} className={`comment-tag ${tag.className}`}>{tag.icon} {tag.label}</span>)}
                      </div>
                    </div>
                  </button>
                );
              }) : (
                <div className="comment-empty">Chưa có bình luận phù hợp bộ lọc.</div>
              )}
            </div>
          </div>

          <div className="comment-detail-pane">
            {selected ? (
              <>
                <div className="comment-detail-title">
                  <div>
                    <b>{selected.author_name || 'Ẩn danh'}</b>
                    <small>{channelName(selected)}</small>
                  </div>
                  <span className={`source-pill ${sourceLabel(selected).className}`}>{sourceLabel(selected).icon} {sourceLabel(selected).label}</span>
                </div>
                <div className="comment-detail-message">{selected.message || '(Không có nội dung chữ)'}</div>
                <div className="comment-detail-tags">
                  {commentTags(selected).map((tag) => <span key={tag.key} className={`comment-tag ${tag.className}`}>{tag.icon} {tag.label}</span>)}
                </div>
                <div className="comment-detail-grid">
                  <span>Bài viết</span><b className="mono-cell">{selected.post_id || '-'}</b>
                  <span>Comment ID</span><b className="mono-cell">{selected.comment_id || '-'}</b>
                  <span>SĐT</span><b>{(selected.phones || (selected.phone ? [selected.phone] : [])).join(', ') || '-'}</b>
                  <span>Thời gian</span><b>{commentTime(selected)}</b>
                </div>
                <div className="comment-detail-actions">
                  {(selected.comment_url || selected.post_url) ? <a className="btn-cancel" href={selected.comment_url || selected.post_url} target="_blank" rel="noreferrer">Mở link</a> : null}
                  <button type="button" className="btn-submit" onClick={() => void syncLead(selected)}>Đưa vào Lead</button>
                </div>
                <div className="reply-box">
                  <label>Trả lời comment ngay tại đây</label>
                  {sourceKey(selected) === 'tiktok' ? (
                    <div className="reply-hint">
                      {tiktokBridgeReady
                        ? `Extension đã kết nối${tiktokBridgeVersion ? ` v${tiktokBridgeVersion}` : ''}. TikTok sẽ nhận bình luận trên video, không gắn thread cụ thể.`
                        : 'TikTok cần Chrome extension để gửi bình luận từ phiên đăng nhập thật.'}
                    </div>
                  ) : (
                    <div className="reply-hint">Facebook sẽ reply trực tiếp vào Comment ID đang chọn.</div>
                  )}
                  <div className="reply-template-row">
                    {QUICK_REPLIES.map((item) => (
                      <button key={item.title} type="button" onClick={() => void copyReply(item.text)}>{item.title}</button>
                    ))}
                  </div>
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Chọn mẫu câu hoặc nhập nội dung phản hồi..." />
                  <div className="reply-send-row">
                    <button type="button" className="btn-submit" disabled={replyBusy || !replyText.trim()} onClick={() => void sendReply()}>
                      {replyBusy ? 'Đang gửi...' : sourceKey(selected) === 'tiktok' ? 'Gửi CMT TikTok' : 'Gửi trả lời'}
                    </button>
                    <span>{replyStatus}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="comment-empty detail-empty">💬<br />Chọn bình luận</div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'customers' ? (
        <div className="comment-tab-panel">
          <div className="table-toolbar">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm khách hàng, SĐT, nội dung..." />
            <button type="button" className="btn-cancel" onClick={exportCustomers}>Xuất CSV</button>
            <button type="button" className="btn-submit" onClick={() => void syncLead(null)}>Đồng bộ Lead</button>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Kênh</th>
                  <th>SĐT</th>
                  <th>Tags</th>
                  <th>Nội dung</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {customers.length ? customers.map(({ row, tags, phones }) => (
                  <tr key={row.comment_id || `${row.post_id}-${row.author_name}`}>
                    <td><b>{row.author_name || 'Ẩn danh'}</b><small>{channelName(row)}</small></td>
                    <td><span className={`source-pill ${sourceLabel(row).className}`}>{sourceLabel(row).icon} {sourceLabel(row).label}</span></td>
                    <td>{phones.join(', ') || '-'}</td>
                    <td><div className="comment-tags">{tags.map((tag) => <span key={tag.key} className={`comment-tag ${tag.className}`}>{tag.icon} {tag.label}</span>)}</div></td>
                    <td>{row.message || '-'}</td>
                    <td>{(row.comment_url || row.post_url) ? <a href={row.comment_url || row.post_url} target="_blank" rel="noreferrer">Mở</a> : '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="table-empty">Chưa có khách hàng/lead từ comment.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="comment-tab-panel">
          <div className="comment-stats-grid">
            <div className="comment-stat-card"><b>{comments.length}</b><span>Tổng comment</span></div>
            <div className="comment-stat-card"><b>{customers.length}</b><span>Comment có tín hiệu lead</span></div>
            <div className="comment-stat-card"><b>{customers.filter((item) => item.phones.length).length}</b><span>Có SĐT</span></div>
            <div className="comment-stat-card"><b>{sourceCounts['fb-page'] + sourceCounts['fb-group']}</b><span>Facebook</span></div>
          </div>
          <div className="comment-stats-columns">
            <div>
              <h3>Kênh</h3>
              {(Object.keys(SOURCE_META) as SourceKey[]).filter((key) => key !== 'all').map((key) => (
                <div key={key} className="stat-line"><span>{SOURCE_META[key].icon} {SOURCE_META[key].label}</span><b>{sourceCounts[key]}</b></div>
              ))}
            </div>
            <div>
              <h3>Tags</h3>
              {TAGS.map((tag) => <div key={tag.key} className="stat-line"><span className={`comment-tag ${tag.className}`}>{tag.icon} {tag.label}</span><b>{tagCounts[tag.key]}</b></div>)}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'templates' ? (
        <div className="comment-tab-panel template-grid">
          {QUICK_REPLIES.map((item) => (
            <div key={item.title} className="template-card">
              <b>{item.title}</b>
              <p>{item.text}</p>
              <button type="button" className="btn-cancel" onClick={() => void copyReply(item.text)}>Copy</button>
            </div>
          ))}
        </div>
      ) : null}

      {status ? <div className="comment-studio-status">{status}</div> : null}
    </section>
  );
}
