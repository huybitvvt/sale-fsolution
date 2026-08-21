'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { api, AI_TIMEOUT_MS, PUBLISH_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, formatFetchError } from '@/lib/api';
import { APP_BRAND } from '@/lib/app-brand';
import { buildFacebookPostMessage } from '@/lib/facebook-post-message';
import type { ContentPipelinePost, FacebookPublishedPost, FbPage, GroupRow, StoredPostComment } from '@/lib/types';
import { PostPublishPreview } from '@/components/PostPublishPreview';
import type { SheetData } from 'write-excel-file/browser';

type PipelinePayload = {
  posts?: ContentPipelinePost[];
};

type Props = {
  data: PipelinePayload;
  busy: boolean;
  status: string;
  onReload: () => Promise<void>;
  onResearch: (sourceFilter: string) => Promise<void>;
  initialGroups?: GroupRow[];
  initialPages?: FbPage[];
  staffName?: string;
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
  post_url?: string;
  error?: string;
  delivery?: string;
};

type ExtensionQueueResponse = {
  ok?: boolean;
  error?: string;
  activeRequestId?: string;
  targetCount?: number;
  alreadyStopped?: boolean;
};

type ExtensionMetricsResponse = {
  ok?: boolean;
  error?: string;
  reaction_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
};

type ExtensionReferenceResponse = ExtensionMetricsResponse & {
  postId?: string;
  postUrl?: string;
};

type ExtensionPostReferenceResponse = {
  ok?: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  ambiguous?: boolean;
};

type ExtensionFacebookComment = {
  comment_id?: string;
  author_id?: string;
  author_name?: string;
  message?: string;
  created_time?: string;
};

type ExtensionPostDataResponse = {
  ok?: boolean;
  postId?: string;
  postUrl?: string;
  reactionCount?: number;
  commentCount?: number;
  shareCount?: number;
  comments?: ExtensionFacebookComment[];
  error?: string;
};

type PostMediaItem = { url: string; type?: 'image' | 'video'; name?: string };

type HistoryRow = {
  id: string;
  queueRequestId?: string;
  title: string;
  content: string;
  mediaUrl: string;
  mediaUrls?: string[];
  hashtags: string;
  scheduledAt: string;
  targets: PublishTarget[];
  status: string;
  results?: PublishResult[];
  publisherName?: string;
  createdAt: string;
  facebookRecord?: FacebookPublishedPost;
};

const HISTORY_KEY = 'seeding-post-history-v2';
const PUBLISH_INTERVAL_MINUTES = 5;
const FACEBOOK_HISTORY_POLL_MS = 60 * 1000;
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const historyDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const historyDateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const PARTNER_POST_PRESETS = [
  {
    title: 'Hướng dẫn điều chỉnh ty đàn guitar xử lý rè dây',
    content: 'Video bài nói hướng dẫn người mới kiểm tra cần đàn, nhận biết tiếng rè và cách mang đàn tới shop để được cân chỉnh an toàn.',
    mediaUrl: 'https://www.tiktok.com/@guitarsaithanh/video/7350012345678901234',
    scheduledAt: '2026-06-11T09:00',
  },
  {
    title: 'Review đàn acoustic tầm 3 triệu – đáng mua không?',
    content: 'Bài review có hook ngắn, demo âm thanh, điểm mạnh/yếu và CTA inbox để nhận bảng giá/clip test từng cây.',
    mediaUrl: 'https://example.com/video/review-acoustic-3tr.mp4',
    scheduledAt: '2026-06-11T19:30',
  },
  {
    title: 'Chương trình Thanh Lý Đàn Tận Xưởng – Acoustic giảm đến 30%',
    content: 'Bài khuyến mãi ngắn, nêu rõ số lượng còn lại, ưu đãi theo khung giờ và lời kêu gọi đặt lịch đến thử đàn.',
    mediaUrl: 'https://example.com/images/thanh-ly-dan-acoustic.jpg',
    scheduledAt: '2026-06-12T10:15',
  },
];

function targetKey(target: PublishTarget) {
  return `${target.type}:${target.id}`;
}

function safeList<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? payload as T[] : [];
}

function detectVideoMedia(url: string) {
  const cleanUrl = url.trim();
  if (!cleanUrl) return { mediaUrl: '', nativeVideoUrl: '' };
  const isDirectVideo = /\.(mp4|mov|m4v|webm|avi|mkv|flv|wmv|3gp|ogv)(\?|$)/i.test(cleanUrl);
  return isDirectVideo
    ? { mediaUrl: '', nativeVideoUrl: cleanUrl }
    : { mediaUrl: cleanUrl, nativeVideoUrl: '' };
}

function directMediaItem(url: string): PostMediaItem | null {
  const cleanUrl = url.trim();
  if (!cleanUrl || !/\.(jpe?g|png|webp|gif|mp4|mov|m4v|webm)(\?|$)/i.test(cleanUrl)) return null;
  return {
    url: cleanUrl,
    type: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(cleanUrl) ? 'video' : 'image',
    name: cleanUrl.split('?')[0].split('/').pop() || 'facebook-media',
  };
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return historyDateTimeFormatter.format(parsed);
}

function historyDateKey(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = historyDateKeyFormatter.formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function historyFingerprint(row: Pick<HistoryRow, 'title' | 'content' | 'scheduledAt' | 'targets'>) {
  const targets = [...(row.targets || [])]
    .map((target) => `${target.type}:${target.id}`)
    .sort()
    .join(',');
  return [row.title.trim(), row.content.trim(), row.scheduledAt || '', targets].join('|');
}

function displayPostStatus(status: string) {
  const value = (status || '').trim().toLowerCase();
  if (value === 'posted') return 'Đã đăng';
  if (value === 'success') return 'Đã đăng';
  if (value === 'pending') return 'Chờ Facebook xác nhận';
  if (value === 'scheduled') return 'Đã lưu lịch';
  if (value === 'partial') return 'Đã đăng một phần';
  if (value === 'failed') return 'Lỗi';
  if (value === 'draft') return 'Bản nháp';
  return status || '-';
}

function deliveryLabel(result?: PublishResult) {
  if (!result) return 'Đang chờ';
  if (result.delivery === 'legacy_unverified') return 'Chưa có link/Post ID để xác minh';
  if (result.delivery === 'cancelled') return 'Đã hủy';
  if (!result.ok) return `Lỗi: ${result.error || 'không xác định'}`;
  if (result.delivery === 'auto_resolved') return 'Đã tự tìm và gắn bài';
  if (result.delivery === 'manual_reference') return 'Đã gắn link thủ công';
  if (result.delivery === 'pending_review') return 'Chờ Facebook kiểm duyệt';
  if (result.delivery === 'published') return 'Facebook báo đã đăng';
  if (result.delivery === 'submitted') return 'Đã gửi, chưa xác định kiểm duyệt';
  if (result.delivery === 'submitting') return 'Đang gửi lên Facebook';
  if (result.delivery === 'awaiting_user') return 'Chờ nhân viên bấm Đăng';
  if (result.delivery === 'opening') return 'Đang mở Facebook';
  if (result.post_id) return 'Đã đăng';
  return result.delivery || 'Đã xử lý';
}

function facebookDestinationUrl(record: FacebookPublishedPost) {
  const targetId = String(record.target_id || '').trim();
  if (!targetId) return '';
  return record.target_type === 'group'
    ? `https://www.facebook.com/groups/${encodeURIComponent(targetId)}`
    : `https://www.facebook.com/${encodeURIComponent(targetId)}`;
}

function facebookTargetUrl(target?: PublishTarget) {
  if (!target?.id) return '';
  return target.type === 'group'
    ? `https://www.facebook.com/groups/${encodeURIComponent(target.id)}`
    : `https://www.facebook.com/${encodeURIComponent(target.id)}`;
}

function findFacebookRecordForHistory(row: HistoryRow, posts: FacebookPublishedPost[]): FacebookPublishedPost | undefined {
  if (row.facebookRecord) return row.facebookRecord;
  const reqId = row.id.replace(/^(chrome|pipeline|local)-/, '');
  const byReqId = posts.find((p) => p.source_post_id === reqId || p.external_key?.includes(reqId));
  if (byReqId) return byReqId;
  const byTarget = posts.find((p) => row.targets.some((t) => t.id === p.target_id) && p.content && (row.content?.includes(p.content.slice(0, 30)) || p.content.includes(row.content?.slice(0, 30) || '')));
  return byTarget;
}

function publishResultPerformance(result?: PublishResult) {
  if (!result) return 'pending';
  if (result.delivery === 'legacy_unverified') return 'pending';
  if (result.delivery === 'cancelled') return 'cancelled';
  if (!result.ok) return 'failed';
  if (!result.delivery || result.post_id || ['published', 'pending_review', 'submitted'].includes(result.delivery)) {
    return 'success';
  }
  return 'pending';
}

function historyPillClass(status: string) {
  const value = status.toLowerCase();
  if (value.includes('lỗi') || value.includes('failed') || value.includes('chưa xác nhận') || value.includes('hủy')) return 'pill-danger';
  if (value.includes('đang') || value.includes('chờ') || value.includes('khởi tạo') || value.includes('pending') || value.includes('chưa xác minh')) return 'pill-pending';
  return 'pill-ok';
}

function recoverableFacebookHistoryResults(row: HistoryRow): PublishResult[] {
  if (!row.id.startsWith('chrome-')) return [];
  const transientDeliveries = new Set(['opening', 'awaiting_user', 'submitting', 'cancelled']);
  return (row.results || []).filter((result) => {
    if (!result.target?.id) return false;
    const delivery = String(result.delivery || '').trim().toLowerCase();
    if (transientDeliveries.has(delivery)) return false;
    if (result.post_id || result.post_url) return true;
    if (['published', 'pending_review', 'submitted', 'confirmation_timeout', 'failed'].includes(delivery)) return true;
    return result.ok === false && Boolean(String(result.error || '').trim());
  });
}

function facebookHistoryTargetKey(requestId: string, target: Pick<PublishTarget, 'type' | 'id'>) {
  return `${requestId}|${target.type}:${target.id}`;
}

function canCancelFacebookQueue(row: HistoryRow) {
  if (!row.id.startsWith('chrome-')) return false;
  const status = row.status.trim().toLowerCase();
  if (row.queueRequestId && status.startsWith('lỗi khởi động')) return true;
  return [
    'đang khởi tạo',
    'đang chuẩn bị',
    'chờ bấm đăng',
    'đang gửi',
    'chưa xác nhận',
  ].some((prefix) => status.startsWith(prefix));
}

function markFacebookQueueCancelled(row: HistoryRow): HistoryRow {
  const completedDeliveries = new Set(['published', 'pending_review', 'submitted']);
  const results = row.targets.map((target) => {
    const current = row.results?.find((item) => targetKey(item.target) === targetKey(target));
    if (current && completedDeliveries.has(String(current.delivery || ''))) return current;
    return { ok: false, target, delivery: 'cancelled', error: 'Đã hủy bởi người dùng' };
  });
  return { ...row, status: 'Đã hủy bởi người dùng', results };
}

async function readPayload(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function apiErrorMessage(res: Response, payload: Record<string, unknown>): string {
  if (payload.auth_required) return 'Phiên đăng nhập hết hạn. Hãy tải lại trang và đăng nhập lại.';
  if (payload.error) return String(payload.error);
  if (!res.ok) return `Lỗi server (${res.status})`;
  return '';
}

function requestFacebookReferenceFromExtension(record: FacebookPublishedPost): Promise<ExtensionPostReferenceResponse> {
  const requestId = `facebook_resolve_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      resolve({ ok: false, error: 'Extension không phản hồi khi tự tìm bài Facebook.' });
    }, 65000);
    const handleResponse = (event: MessageEvent) => {
      if (event.source !== window) return;
      const payload = event.data || {};
      if (payload.source !== 'streal-tiktok-extension' || payload.type !== 'STREAL_FACEBOOK_RESOLVE_POST_RESPONSE' || payload.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', handleResponse);
      resolve({
        ok: payload.ok === true,
        postId: payload.postId ? String(payload.postId) : undefined,
        postUrl: payload.postUrl ? String(payload.postUrl) : undefined,
        error: payload.error ? String(payload.error) : undefined,
        ambiguous: payload.ambiguous === true,
      });
    };
    window.addEventListener('message', handleResponse);
    window.postMessage({
      source: 'streal-web-page',
      type: 'STREAL_FACEBOOK_RESOLVE_POST_REQUEST',
      requestId,
      payload: {
        target_type: record.target_type,
        target_id: record.target_id,
        content: record.content || '',
      },
    }, window.location.origin);
  });
}

function requestFacebookPostDataFromExtension(record: FacebookPublishedPost): Promise<ExtensionPostDataResponse> {
  const requestId = `facebook_post_data_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      resolve({ ok: false, error: 'Extension không phản hồi khi đọc bài Facebook.' });
    }, 85000);
    const handleResponse = (event: MessageEvent) => {
      if (event.source !== window) return;
      const payload = event.data || {};
      if (payload.source !== 'streal-tiktok-extension' || payload.type !== 'STREAL_FACEBOOK_COLLECT_POST_DATA_RESPONSE' || payload.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', handleResponse);
      resolve({
        ok: payload.ok === true,
        postId: payload.postId ? String(payload.postId) : undefined,
        postUrl: payload.postUrl ? String(payload.postUrl) : undefined,
        reactionCount: Number.isFinite(Number(payload.reactionCount)) ? Number(payload.reactionCount) : undefined,
        commentCount: Number.isFinite(Number(payload.commentCount)) ? Number(payload.commentCount) : undefined,
        shareCount: Number.isFinite(Number(payload.shareCount)) ? Number(payload.shareCount) : undefined,
        comments: safeList<ExtensionFacebookComment>(payload.comments),
        error: payload.error ? String(payload.error) : undefined,
      });
    };
    window.addEventListener('message', handleResponse);
    window.postMessage({
      source: 'streal-web-page',
      type: 'STREAL_FACEBOOK_COLLECT_POST_DATA_REQUEST',
      requestId,
      payload: {
        post_id: record.facebook_post_id || '',
        post_url: record.post_url || '',
        content: record.content || '',
      },
    }, window.location.origin);
  });
}

function applyTargetRows(
  groupRows: GroupRow[],
  pageRows: FbPage[],
  setGroups: (rows: GroupRow[]) => void,
  setPages: (rows: FbPage[]) => void,
  setSelectedGroups: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  setSelectedPages: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
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
}

export function MarketingPipelinePanel({
  data,
  busy,
  status,
  onReload,
  initialGroups = [],
  initialPages = [],
  staffName = '',
}: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [postMedia, setPostMedia] = useState<PostMediaItem[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [hashtags, setHashtags] = useState('#guitar #guitarsaithanh');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({});
  const [selectedPages, setSelectedPages] = useState<Record<string, boolean>>({});
  const [captionVariants, setCaptionVariants] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [facebookPosts, setFacebookPosts] = useState<FacebookPublishedPost[]>([]);
  const [facebookHistoryBusy, setFacebookHistoryBusy] = useState<Record<string, boolean>>({});
  const [facebookManualLinks, setFacebookManualLinks] = useState<Record<string, string>>({});
  const [facebookComments, setFacebookComments] = useState<Record<string, StoredPostComment[]>>({});
  const [expandedComments, setExpandedComments] = useState('');
  const [localStatus, setLocalStatus] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [assistedQueueBusy, setAssistedQueueBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cancellingHistoryIds, setCancellingHistoryIds] = useState<Record<string, boolean>>({});
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');
  const [historyExporting, setHistoryExporting] = useState(false);
  const [historyExportError, setHistoryExportError] = useState('');
  const assistedQueueRequestRef = useRef('');
  const assistedQueuePayloadRef = useRef<{ requestId: string; title: string; content: string; hashtags: string; mediaUrls: string[]; targets: PublishTarget[] } | null>(null);
  const localFacebookHistoryRecoveryRef = useRef<Set<string>>(new Set());
  const persistAssistedHistoryRef = useRef<(status: string, results?: PublishResult[], error?: string) => Promise<FacebookPublishedPost[]>>(async () => []);
  const resolveAndSyncFacebookPostRef = useRef<(record: FacebookPublishedPost, options?: { automatic?: boolean; allowManualFallback?: boolean; forceReference?: boolean }) => Promise<void>>(async () => {});

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
    void loadFacebookHistory();
  }, []);

  useEffect(() => {
    void loadFacebookHistory();
  }, [data.posts]);

  useEffect(() => {
    const refreshHistory = () => {
      if (document.visibilityState === 'visible') void loadFacebookHistory();
    };
    const timer = window.setInterval(refreshHistory, FACEBOOK_HISTORY_POLL_MS);
    window.addEventListener('focus', refreshHistory);
    document.addEventListener('visibilitychange', refreshHistory);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshHistory);
      document.removeEventListener('visibilitychange', refreshHistory);
    };
  }, []);

  async function loadFacebookHistory() {
    try {
      const response = await api('/api/facebook-posts');
      const payload = await response.json().catch(() => ({ posts: [] }));
      if (response.ok && payload.ok && Array.isArray(payload.posts)) setFacebookPosts(payload.posts);
    } catch {
      // The pipeline/local history remains available when the migration is not installed yet.
    }
  }

  useEffect(() => {
    const persistedTargets = new Set(
      facebookPosts
        .filter((item) => item.source === 'chrome_extension' && item.source_post_id)
        .map((item) => facebookHistoryTargetKey(String(item.source_post_id), {
          type: item.target_type,
          id: item.target_id,
        })),
    );
    const recoveries = history.map((row) => {
      const requestId = row.id.startsWith('chrome-') ? row.id.slice('chrome-'.length) : '';
      const results = recoverableFacebookHistoryResults(row).filter((result) => {
        const key = facebookHistoryTargetKey(requestId, result.target);
        return requestId && !persistedTargets.has(key) && !localFacebookHistoryRecoveryRef.current.has(key);
      });
      return { row, requestId, results };
    }).filter((item) => item.requestId && item.results.length).slice(0, 5);

    recoveries.forEach(({ row, requestId, results }) => {
      const recoveryKeys = results.map((result) => facebookHistoryTargetKey(requestId, result.target));
      recoveryKeys.forEach((key) => localFacebookHistoryRecoveryRef.current.add(key));
      void api('/api/facebook-posts/extension-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          content: buildFacebookPostMessage({ title: row.title, content: row.content, hashtags: row.hashtags }),
          hashtags: row.hashtags,
          media_urls: row.mediaUrls?.length ? row.mediaUrls : row.mediaUrl ? [row.mediaUrl] : [],
          targets: results.map((result) => result.target),
          status: 'recovered',
          results: results.map((item) => ({ ...item, ...item.target, target: undefined })),
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({ posts: [] }));
        const saved = safeList<FacebookPublishedPost>(payload.posts);
        if (response.ok && payload.ok && saved.length) {
          const savedIds = new Set(saved.map((item) => item.id));
          setFacebookPosts((prev) => [...saved, ...prev.filter((item) => !savedIds.has(item.id))]);
          return;
        }
        recoveryKeys.forEach((key) => localFacebookHistoryRecoveryRef.current.delete(key));
      }).catch(() => {
        recoveryKeys.forEach((key) => localFacebookHistoryRecoveryRef.current.delete(key));
      });
    });
  }, [facebookPosts, history]);

  async function persistAssistedHistory(status: string, results: PublishResult[] = [], error = ''): Promise<FacebookPublishedPost[]> {
    const snapshot = assistedQueuePayloadRef.current;
    if (!snapshot) return [];
    try {
      const response = await api('/api/facebook-posts/extension-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: snapshot.requestId,
          content: buildFacebookPostMessage({
            title: snapshot.title,
            content: snapshot.content,
            hashtags: snapshot.hashtags,
          }),
          hashtags: snapshot.hashtags,
          media_urls: snapshot.mediaUrls,
          targets: snapshot.targets,
          status,
          error,
          results: results.map((item) => ({ ...item, ...item.target, target: undefined })),
        }),
      });
      const payload = await response.json().catch(() => ({ posts: [] }));
      const saved = safeList<FacebookPublishedPost>(payload.posts);
      if (response.ok && payload.ok && saved.length) {
        const savedIds = new Set(saved.map((item) => item.id));
        setFacebookPosts((prev) => [...saved, ...prev.filter((item) => !savedIds.has(item.id))]);
      } else {
        await loadFacebookHistory();
      }
      return saved;
    } catch {
      // Keep local history; a later backend publish/list refresh can recover the UI.
      return [];
    }
  }
  persistAssistedHistoryRef.current = persistAssistedHistory;

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 80)));
    } catch {
      // Local history is a convenience only; posting flow must not fail because storage is full.
    }
  }, [history]);

  useEffect(() => {
    const handleFacebookQueueProgress = (event: MessageEvent) => {
      if (event.source !== window) return;
      const payload = event.data || {};
      if (payload.source !== 'streal-tiktok-extension') return;
      if (payload.type !== 'STREAL_FACEBOOK_GROUP_QUEUE_PROGRESS') return;
      if (payload.requestId !== assistedQueueRequestRef.current) return;
      const completed = Number(payload.completedCount || 0);
      const total = Number(payload.targetCount || 0);
      const targetType: PublishTarget['type'] = payload.targetType === 'page' ? 'page' : 'group';
      const targetId = String(payload.targetId || payload.groupId || '');
      const targetName = String(payload.targetName || payload.groupName || targetId || 'Facebook');
      const target: PublishTarget = { type: targetType, id: targetId, name: targetName };
      const historyId = `chrome-${payload.requestId}`;
      const updateHistory = (nextStatus: string, result?: PublishResult, finalResults?: PublishResult[]) => {
        setHistory((prev) => prev.map((row) => {
          if (row.id !== historyId) return row;
          let results = finalResults || row.results || [];
          if (result?.target.id) {
            results = [...results.filter((item) => targetKey(item.target) !== targetKey(result.target)), result];
          }
          return { ...row, status: nextStatus, results };
        }));
      };
      if (payload.status === 'opening') {
        updateHistory(`Đang chuẩn bị ${Number(payload.currentNumber || completed + 1)}/${total}`, {
          ok: true, target, delivery: 'opening',
        });
        setLocalStatus(`Đang mở ${targetName} (${Number(payload.currentNumber || completed + 1)}/${total})...`);
      } else if (payload.status === 'ready') {
        const attached = Number(payload.mediaAttachedCount || 0);
        updateHistory(`Chờ bấm Đăng ${Number(payload.currentNumber || completed + 1)}/${total}`, {
          ok: true, target, delivery: 'awaiting_user',
        });
        setLocalStatus(
          attached
            ? `Đã điền caption và chọn ${attached} media tại ${targetName}. Kiểm tra preview rồi tự bấm Đăng.`
            : `Đã điền caption tại ${targetName}. Kiểm tra rồi tự bấm Đăng.`
        );
      } else if (payload.status === 'auto_ready') {
        const attached = Number(payload.mediaAttachedCount || 0);
        updateHistory(`Đang tự động đăng ${Number(payload.currentNumber || completed + 1)}/${total}`, {
          ok: true, target, delivery: 'submitting',
        });
        setLocalStatus(
          attached
            ? `Đã điền caption và xác nhận ${attached} media tại ${targetName}. Extension đang tự bấm Đăng.`
            : `Đã điền caption tại ${targetName}. Extension đang tự bấm Đăng.`
        );
      } else if (payload.status === 'submitting') {
        updateHistory(`Đang gửi ${completed + 1}/${total}`, {
          ok: true, target, delivery: 'submitting',
        });
        setLocalStatus(`Đang chờ Facebook xác nhận bài tại ${targetName}...`);
      } else if (payload.status === 'confirmed') {
        const outcome = ['published', 'pending_review'].includes(payload.outcome) ? payload.outcome : 'submitted';
        updateHistory(`Đã gửi ${completed}/${total}`, {
          ok: true, target, delivery: outcome,
          post_id: payload.postId ? String(payload.postId) : undefined,
          post_url: payload.postUrl ? String(payload.postUrl) : undefined,
        });
        const outcomeText = outcome === 'pending_review'
          ? 'đang chờ kiểm duyệt'
          : outcome === 'published' ? 'đã đăng' : 'đã gửi thao tác đăng';
        setLocalStatus(`Đã ghi nhận ${targetName}: ${outcomeText} (${completed}/${total}). Đang chuyển nơi tiếp theo...`);
      } else if (payload.status === 'resolving_references') {
        updateHistory(`Đang tự tìm link cho ${Number(payload.missingCount || 0)} bài`, undefined);
        setLocalStatus(`Đã đăng xong; extension đang tự mở lại nơi đăng để gắn link cho ${Number(payload.missingCount || 0)} bài còn thiếu.`);
      } else if (payload.status === 'done') {
        const finalResults: PublishResult[] = safeList<Record<string, unknown>>(payload.results).map((item) => ({
          ok: item.ok !== false,
          target: {
            type: item.type === 'page' ? 'page' : 'group',
            id: String(item.id || ''),
            name: String(item.name || item.id || ''),
          },
          delivery: String(item.delivery || 'submitted'),
          post_id: item.post_id ? String(item.post_id) : undefined,
          post_url: item.post_url ? String(item.post_url) : undefined,
          error: item.error ? String(item.error) : undefined,
        }));
        updateHistory(`Hoàn tất ${completed}/${total} · kiểm tra trạng thái từng nơi`, undefined, finalResults);
        void persistAssistedHistoryRef.current('done', finalResults).then((saved) => {
          saved.forEach((record) => {
            void resolveAndSyncFacebookPostRef.current(record, { automatic: true, allowManualFallback: false });
          });
        });
        setAssistedQueueBusy(false);
        setLocalStatus(`Hoàn tất đăng hỗ trợ ${completed}/${total} nơi. Xem trạng thái chi tiết trong lịch sử.`);
      } else if (payload.status === 'cancelled') {
        setHistory((prev) => prev.map((row) => row.id === historyId ? markFacebookQueueCancelled(row) : row));
        assistedQueueRequestRef.current = '';
        setAssistedQueueBusy(false);
        setLocalStatus('Đã hủy hàng đợi đăng Facebook. Các Group/Page còn lại sẽ không được mở tiếp.');
        void persistAssistedHistoryRef.current('cancelled', [], 'Người dùng đã hủy hàng đợi');
      } else if (payload.status === 'confirmation_timeout') {
        updateHistory(`Chưa xác nhận tại ${targetName}`, {
          ok: false, target, delivery: 'confirmation_timeout', error: 'Facebook chưa đóng hộp soạn bài sau 45 giây.',
        });
        setLocalStatus(`Facebook chưa xác nhận bài tại ${targetName}. Kiểm tra lỗi rồi bấm Đăng lại.`);
        void persistAssistedHistoryRef.current('failed', [{ ok: false, target, delivery: 'confirmation_timeout', error: 'Facebook chưa xác nhận thao tác đăng.' }]);
      } else if (payload.status === 'error') {
        updateHistory(`Lỗi tại ${targetName}`, {
          ok: false, target, delivery: 'failed', error: String(payload.error || 'không chuẩn bị được bài viết'),
        });
        setAssistedQueueBusy(false);
        setLocalStatus(`Extension dừng tại ${targetName}: ${payload.error || 'không chuẩn bị được bài viết'}`);
        void persistAssistedHistoryRef.current('failed', [{ ok: false, target, delivery: 'failed', error: String(payload.error || 'Không chuẩn bị được bài viết') }], String(payload.error || 'Không chuẩn bị được bài viết'));
      }
    };
    window.addEventListener('message', handleFacebookQueueProgress);
    return () => window.removeEventListener('message', handleFacebookQueueProgress);
  }, []);

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
      mediaUrls: post.media_urls || [],
      hashtags: post.hashtags || '',
      scheduledAt: post.scheduled_at || '',
      targets: (post.scheduled_targets || []).map((target) => ({
        type: target.type === 'page' ? 'page' : 'group',
        id: target.id || '-',
        name: target.name || target.id || '-',
      })),
      status: post.status === 'scheduled' && post.publish_interval_minutes
        ? `Đang chờ ${post.scheduled_target_index || 0}/${post.scheduled_targets?.length || 0} · ${post.publish_interval_minutes} phút/lượt`
        : post.status || 'draft',
      results: (post.publish_results || []).map((item) => ({
        ok: !!item.ok,
        target: { type: item.type === 'page' ? 'page' : 'group', id: item.id || '', name: item.name || item.id || '' },
        post_id: item.post_id,
        error: item.error,
        delivery: item.delivery,
      })),
      publisherName: post.created_by_staff_name || 'Không xác định',
      createdAt: post.created_at || post.updated_at || '',
    }));
  }, [data.posts]);

  const persistedFacebookHistory = useMemo<HistoryRow[]>(() => facebookPosts.map((post) => ({
    id: `facebook-${post.id}`,
    title: post.content?.split('\n').find(Boolean)?.slice(0, 100) || post.target_name || 'Bài Facebook',
    content: post.content || '',
    mediaUrl: post.media_urls?.[0] || '',
    mediaUrls: post.media_urls || [],
    hashtags: '',
    scheduledAt: '',
    targets: [{ type: post.target_type, id: post.target_id, name: post.target_name || post.target_id }],
    status: post.legacy_unverified ? 'Chưa xác minh · lịch sử cũ' : post.status,
    results: [{
      ok: post.legacy_unverified ? false : post.status !== 'failed',
      target: { type: post.target_type, id: post.target_id, name: post.target_name || post.target_id },
      post_id: post.facebook_post_id || undefined,
      error: post.error_message || undefined,
      delivery: post.legacy_unverified ? 'legacy_unverified' : post.delivery,
    }],
    publisherName: post.created_by_staff_name || post.created_by_staff_username || 'Không xác định',
    createdAt: post.published_at || post.created_at || '',
    facebookRecord: post,
  })), [facebookPosts]);

  const visibleHistory = useMemo(() => {
    const importedKeys = new Set([...persistedFacebookHistory, ...importedHistory].map(historyFingerprint));
    const persistedChromeIds = new Set(facebookPosts.filter((item) => item.source === 'chrome_extension').map((item) => `chrome-${item.source_post_id}`));
    const persistedPipelineIds = new Set(facebookPosts.filter((item) => ['content_pipeline', 'scheduled_pipeline'].includes(item.source || '')).map((item) => `pipeline-${item.source_post_id}`));
    const seen = new Set<string>();
    return [...persistedFacebookHistory, ...importedHistory, ...history].map((row) => {
      if (row.facebookRecord) return row;
      const facebookRecord = findFacebookRecordForHistory(row, facebookPosts);
      return facebookRecord ? { ...row, facebookRecord } : row;
    }).filter((row) => {
      if (row.id.startsWith('pipeline-') && importedKeys.has(historyFingerprint(row)) && persistedFacebookHistory.some((item) => historyFingerprint(item) === historyFingerprint(row))) return false;
      if (persistedPipelineIds.has(row.id)) return false;
      if (row.id.startsWith('local-') && importedKeys.has(historyFingerprint(row))) return false;
      if (persistedChromeIds.has(row.id)) return false;
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [facebookPosts, history, importedHistory, persistedFacebookHistory]);

  const invalidHistoryRange = Boolean(historyFromDate && historyToDate && historyFromDate > historyToDate);
  const filteredHistory = useMemo(() => {
    if (invalidHistoryRange) return [];
    return visibleHistory.filter((row) => {
      if (!historyFromDate && !historyToDate) return true;
      const dateKey = historyDateKey(row.createdAt);
      if (!dateKey) return false;
      if (historyFromDate && dateKey < historyFromDate) return false;
      if (historyToDate && dateKey > historyToDate) return false;
      return true;
    });
  }, [historyFromDate, historyToDate, invalidHistoryRange, visibleHistory]);

  async function loadTargets() {
    setLoadingTargets(true);
    setLocalStatus('');
    const errors: string[] = [];
    let groupRows: GroupRow[] = [];
    let pageRows: FbPage[] = [];

    try {
      const res = await api('/api/channels/publish-targets', { timeoutMs: 30000 });
      const payload = await readPayload(res);
      let storageLabel = '';
      if (!res.ok || payload.auth_required) {
        const msg = apiErrorMessage(res, payload);
        errors.push(msg || 'Không tải được nhóm/Page từ DB.');
      } else if (payload.ok === false) {
        errors.push(String(payload.error || 'Không tải được nhóm/Page từ DB.'));
      } else {
        groupRows = safeList<GroupRow>(payload.groups).filter((item) => item?.id);
        pageRows = safeList<FbPage>(payload.pages).filter((item) => item?.id);
        storageLabel = payload.storage === 'supabase' ? 'Supabase' : 'local';
        if (payload.storage === 'local' && !groupRows.length && !pageRows.length) {
          errors.push('Chưa có kênh trong DB. Vào Quản lý nhóm để thêm nhóm/Page.');
        }
      }

      if (groupRows.length || pageRows.length) {
        applyTargetRows(groupRows, pageRows, setGroups, setPages, setSelectedGroups, setSelectedPages);
        const parts = [
          groupRows.length ? `${groupRows.length} nhóm` : '',
          pageRows.length ? `${pageRows.length} Page` : '',
        ].filter(Boolean);
        setLocalStatus(parts.length && storageLabel ? `Đã tải ${parts.join(', ')} từ ${storageLabel}.` : parts.length ? `Đã tải ${parts.join(', ')}.` : '');
      } else if (initialGroups.length || initialPages.length) {
        applyTargetRows(
          initialGroups.filter((item) => item?.id),
          initialPages.filter((item) => item?.id),
          setGroups,
          setPages,
          setSelectedGroups,
          setSelectedPages,
        );
      } else {
        setGroups([]);
        setPages([]);
      }

      if (errors.length) {
        setLocalStatus(errors.join(' '));
      }
    } catch (error) {
      if (initialGroups.length || initialPages.length) {
        applyTargetRows(
          initialGroups.filter((item) => item?.id),
          initialPages.filter((item) => item?.id),
          setGroups,
          setPages,
          setSelectedGroups,
          setSelectedPages,
        );
      } else {
        setGroups([]);
        setPages([]);
      }
      setLocalStatus(`Lỗi kết nối khi tải nhóm/Page từ DB: ${formatFetchError(error)}`);
    } finally {
      setLoadingTargets(false);
    }
  }

  function loadPreset(item: typeof PARTNER_POST_PRESETS[number]) {
    setTitle(item.title);
    setContent(item.content);
    setMediaUrl(item.mediaUrl);
    setPostMedia([]);
    setScheduledAt(item.scheduledAt);
    setLocalStatus('Đã nạp bài mẫu từ đối tác vào form. Có thể chỉnh lại rồi Đăng ngay hoặc Đặt lịch.');
  }

  function setAllTargets(checked: boolean) {
    setSelectedGroups(Object.fromEntries(groups.map((group) => [group.id, checked])));
    setSelectedPages(Object.fromEntries(pages.map((page) => [page.id, checked])));
  }

  function buildMessage(target?: PublishTarget) {
    const variant = target ? captionVariants[targetKey(target)] : '';
    return buildFacebookPostMessage({
      title,
      content: variant || content,
      hashtags,
    });
  }

  async function copyAndOpenTarget(target: PublishTarget) {
    const message = buildMessage(target);
    const facebookUrl = target.type === 'group'
      ? `https://www.facebook.com/groups/${target.id}`
      : `https://www.facebook.com/${target.id}`;
    window.open(facebookUrl, '_blank', 'noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(message);
      setLocalStatus(`Đã sao chép caption và mở ${target.name || target.id}. Dán nội dung để đăng trực tiếp trên Facebook.`);
    } catch {
      setLocalStatus(`Đã mở ${target.name || target.id}, nhưng trình duyệt chặn sao chép. Hãy copy nội dung trong ô caption.`);
    }
  }

  async function startAssistedGroupQueue() {
    const assistedTargets = selectedTargets;
    if (!assistedTargets.length) {
      setLocalStatus('Chọn ít nhất một Facebook Group hoặc Page để đăng qua Chrome.');
      return;
    }
    const requestId = `facebook_queue_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    assistedQueueRequestRef.current = requestId;
    setAssistedQueueBusy(true);
    setLocalStatus(`Đang gửi ${assistedTargets.length} nơi sang Chrome Extension...`);
    const directMedia = directMediaItem(mediaUrl);
    const assistedMedia = postMedia.length ? postMedia : directMedia ? [directMedia] : [];
    const linkPreviewUrl = !assistedMedia.length ? mediaUrl.trim() : '';
    assistedQueuePayloadRef.current = {
      requestId,
      title,
      content,
      hashtags,
      mediaUrls: assistedMedia.map((item) => item.url),
      targets: assistedTargets,
    };
    const historyId = `chrome-${requestId}`;
    setHistory((prev) => [{
      id: historyId,
      title,
      content,
      mediaUrl,
      mediaUrls: assistedMedia.map((item) => item.url),
      hashtags,
      scheduledAt: '',
      targets: assistedTargets,
      status: 'Đang khởi tạo qua Chrome',
      results: [],
      publisherName: staffName || 'Không xác định',
      createdAt: new Date().toISOString(),
    }, ...prev.filter((row) => row.id !== historyId)].slice(0, 80));

    const response = await new Promise<ExtensionQueueResponse>((resolve) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        resolve({ ok: false, error: 'Không thấy extension phản hồi. Hãy cập nhật Seeding Fsolution Bridge lên 0.1.46 và tải lại trang.' });
      }, 6000);
      function handleResponse(event: MessageEvent) {
        if (event.source !== window) return;
        const payload = event.data || {};
        if (payload.source !== 'streal-tiktok-extension') return;
        if (payload.type !== 'STREAL_FACEBOOK_GROUP_QUEUE_RESPONSE' || payload.requestId !== requestId) return;
        window.clearTimeout(timer);
        window.removeEventListener('message', handleResponse);
        resolve(payload);
      }
      window.addEventListener('message', handleResponse);
      window.postMessage({
        source: 'streal-web-page',
        type: 'STREAL_FACEBOOK_GROUP_QUEUE_REQUEST',
        requestId,
        payload: {
          tasks: assistedTargets.map((target, index) => ({
            taskId: `${requestId}_${index}`,
            type: target.type,
            id: target.id,
            name: target.name,
            message: [buildMessage(target), linkPreviewUrl].filter(Boolean).join('\n\n'),
            media: assistedMedia,
          })),
        },
      }, window.location.origin);
    });

    if (!response.ok) {
      setHistory((prev) => prev.map((row) => row.id === historyId
        ? {
            ...row,
            queueRequestId: String(response.activeRequestId || ''),
            status: `Lỗi khởi động: ${response.error || 'extension không phản hồi'}`,
          }
        : row));
      assistedQueueRequestRef.current = '';
      setAssistedQueueBusy(false);
      setLocalStatus(`Không khởi động được đăng qua Chrome: ${response.error || 'extension không phản hồi'}`);
      return;
    }
    void persistAssistedHistory('pending');
    setLocalStatus(
      `Đã giao ${response.targetCount || assistedTargets.length} nơi cho Chrome. `
      + 'Extension sẽ tự bấm Đăng, ghi trạng thái và chuyển sang nơi kế tiếp sau khi Facebook xác nhận.'
    );
  }

  async function cancelAssistedGroupQueue(row: HistoryRow) {
    const requestId = row.queueRequestId
      || (row.id.startsWith('chrome-') ? row.id.slice('chrome-'.length) : '');
    if (!requestId || cancellingHistoryIds[row.id]) return;
    if (!window.confirm('Hủy hàng đợi này? Các Group/Page chưa xử lý sẽ không được mở tiếp.')) return;

    setCancellingHistoryIds((prev) => ({ ...prev, [row.id]: true }));
    setLocalStatus('Đang yêu cầu Chrome hủy hàng đợi Facebook...');
    try {
      const response = await new Promise<ExtensionQueueResponse>((resolve) => {
        const timer = window.setTimeout(() => {
          window.removeEventListener('message', handleResponse);
          resolve({ ok: false, error: 'Không thấy extension phản hồi. Hãy cập nhật Seeding Fsolution Bridge lên 0.1.46 và tải lại trang.' });
        }, 6000);
        function handleResponse(event: MessageEvent) {
          if (event.source !== window) return;
          const payload = event.data || {};
          if (payload.source !== 'streal-tiktok-extension') return;
          if (payload.type !== 'STREAL_FACEBOOK_GROUP_QUEUE_CANCEL_RESPONSE' || payload.requestId !== requestId) return;
          window.clearTimeout(timer);
          window.removeEventListener('message', handleResponse);
          resolve(payload);
        }
        window.addEventListener('message', handleResponse);
        window.postMessage({
          source: 'streal-web-page',
          type: 'STREAL_FACEBOOK_GROUP_QUEUE_CANCEL_REQUEST',
          requestId,
        }, window.location.origin);
      });

      if (!response.ok) {
        setLocalStatus(`Không hủy được hàng đợi: ${response.error || 'extension không phản hồi'}`);
        return;
      }
      setHistory((prev) => prev.map((item) => item.id === row.id ? markFacebookQueueCancelled(item) : item));
      if (assistedQueueRequestRef.current === requestId) {
        assistedQueueRequestRef.current = '';
        setAssistedQueueBusy(false);
      }
      setLocalStatus(response.alreadyStopped
        ? 'Hàng đợi cũ không còn chạy; đã cập nhật dòng lịch sử thành Đã hủy.'
        : 'Đã hủy hàng đợi. Các Group/Page còn lại sẽ không được mở tiếp.');
    } finally {
      setCancellingHistoryIds((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  }

  async function exportPostHistoryExcel() {
    if (invalidHistoryRange || !filteredHistory.length || historyExporting) return;
    setHistoryExporting(true);
    setHistoryExportError('');
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      const header = (value: string) => ({
        value,
        type: String,
        fontWeight: 'bold' as const,
        textColor: '#FFFFFF',
        backgroundColor: '#1D4ED8',
        align: 'center' as const,
        alignVertical: 'center' as const,
        height: 28,
        borderColor: '#B8C5D9',
        borderStyle: 'thin' as const,
      });
      const textCell = (value: unknown, wrap = false) => ({
        value: String(value ?? ''),
        type: String,
        format: '@',
        wrap,
        alignVertical: 'top' as const,
        borderColor: '#D9E1EC',
        borderStyle: 'thin' as const,
      });
      const numberCell = (value: number, backgroundColor = '') => ({
        value,
        type: Number,
        align: 'center' as const,
        alignVertical: 'center' as const,
        backgroundColor: backgroundColor || undefined,
        borderColor: '#D9E1EC',
        borderStyle: 'thin' as const,
      });
      const percentageCell = (value: number) => ({
        value,
        type: Number,
        format: '0.0%',
        align: 'center' as const,
        alignVertical: 'center' as const,
        borderColor: '#D9E1EC',
        borderStyle: 'thin' as const,
      });

      const historySheet: SheetData = [
        [
          header('STT'),
          header('Thời gian'),
          header('Người đăng'),
          header('Tiêu đề'),
          header('Nội dung'),
          header('Media'),
          header('Lịch đăng'),
          header('Nơi đăng'),
          header('Trạng thái'),
          header('Kết quả từng nơi'),
          header('Reaction'),
          header('Comment'),
          header('Share'),
          header('Tổng tương tác'),
        ],
        ...filteredHistory.map((row, index) => {
          const fbMatch = row.facebookRecord || facebookPosts.find((post) => `facebook-${post.id}` === row.id);
          return [
            numberCell(index + 1),
            textCell(formatDateTime(row.createdAt)),
            textCell(row.publisherName || 'Không xác định'),
            textCell(row.title || 'Bài đăng', true),
            textCell(row.content || '', true),
            textCell(row.mediaUrls?.length ? `${row.mediaUrls.length} media` : row.mediaUrl || ''),
            textCell(formatDateTime(row.scheduledAt)),
            textCell(row.targets.map((target) => target.name || target.id).join(', '), true),
            textCell(displayPostStatus(row.status), true),
            textCell(row.targets.map((target) => {
              const result = row.results?.find((item) => targetKey(item.target) === targetKey(target));
              return `${target.name || target.id}: ${deliveryLabel(result)}`;
            }).join(' · '), true),
            fbMatch?.reaction_count != null ? numberCell(fbMatch.reaction_count) : textCell('—'),
            fbMatch?.comment_count != null ? numberCell(fbMatch.comment_count) : textCell('—'),
            fbMatch?.share_count != null ? numberCell(fbMatch.share_count) : textCell('—'),
            fbMatch?.total_interactions != null ? numberCell(fbMatch.total_interactions) : textCell('—'),
          ];
        }),
      ];

      type PublisherStats = {
        name: string;
        posts: number;
        completedPosts: number;
        targets: number;
        successfulTargets: number;
        failedTargets: number;
        cancelledTargets: number;
        pendingTargets: number;
        totalReactions: number;
        totalComments: number;
        totalShares: number;
      };
      const statsByPublisher = new Map<string, PublisherStats>();
      filteredHistory.forEach((row) => {
        const name = row.publisherName || 'Không xác định';
        const key = name.trim().toLocaleLowerCase('vi') || 'không xác định';
        const stats = statsByPublisher.get(key) || {
          name,
          posts: 0,
          completedPosts: 0,
          targets: 0,
          successfulTargets: 0,
          failedTargets: 0,
          cancelledTargets: 0,
          pendingTargets: 0,
          totalReactions: 0,
          totalComments: 0,
          totalShares: 0,
        };
        stats.posts += 1;
        stats.targets += row.targets.length;
        let rowSuccessfulTargets = 0;
        row.targets.forEach((target) => {
          const result = row.results?.find((item) => targetKey(item.target) === targetKey(target));
          const state = publishResultPerformance(result);
          if (state === 'success') {
            stats.successfulTargets += 1;
            rowSuccessfulTargets += 1;
          } else if (state === 'failed') {
            stats.failedTargets += 1;
          } else if (state === 'cancelled') {
            stats.cancelledTargets += 1;
          } else {
            stats.pendingTargets += 1;
          }
        });
        if (rowSuccessfulTargets > 0 || /^(đã đăng|hoàn tất)/i.test(row.status.trim())) stats.completedPosts += 1;

        // Accumulate metrics from matched facebook posts
        const fbMatch = row.facebookRecord || facebookPosts.find((post) => `facebook-${post.id}` === row.id);
        if (fbMatch) {
          stats.totalReactions += fbMatch.reaction_count ?? 0;
          stats.totalComments += fbMatch.comment_count ?? 0;
          stats.totalShares += fbMatch.share_count ?? 0;
        }

        statsByPublisher.set(key, stats);
      });
      const publisherStats = [...statsByPublisher.values()].sort((left, right) => left.name.localeCompare(right.name, 'vi'));
      const totals = publisherStats.reduce((sum, item) => ({
        posts: sum.posts + item.posts,
        completedPosts: sum.completedPosts + item.completedPosts,
        targets: sum.targets + item.targets,
        successfulTargets: sum.successfulTargets + item.successfulTargets,
        failedTargets: sum.failedTargets + item.failedTargets,
        cancelledTargets: sum.cancelledTargets + item.cancelledTargets,
        pendingTargets: sum.pendingTargets + item.pendingTargets,
        totalReactions: sum.totalReactions + item.totalReactions,
        totalComments: sum.totalComments + item.totalComments,
        totalShares: sum.totalShares + item.totalShares,
      }), {
        posts: 0,
        completedPosts: 0,
        targets: 0,
        successfulTargets: 0,
        failedTargets: 0,
        cancelledTargets: 0,
        pendingTargets: 0,
        totalReactions: 0,
        totalComments: 0,
        totalShares: 0,
      });
      const performanceSheet: SheetData = [
        [
          header('Người đăng'),
          header('Tổng bài'),
          header('Bài hoàn tất'),
          header('Tổng nơi đăng'),
          header('Nơi thành công'),
          header('Nơi lỗi'),
          header('Nơi đã hủy'),
          header('Nơi đang chờ'),
          header('Tỷ lệ thành công'),
          header('Tổng Reaction'),
          header('Tổng Comment'),
          header('Tổng Share'),
          header('TB tương tác/bài'),
        ],
        ...publisherStats.map((item) => [
          textCell(item.name),
          numberCell(item.posts),
          numberCell(item.completedPosts),
          numberCell(item.targets),
          numberCell(item.successfulTargets, '#DCFCE7'),
          numberCell(item.failedTargets, '#FEE2E2'),
          numberCell(item.cancelledTargets, '#FEF3C7'),
          numberCell(item.pendingTargets),
          percentageCell(item.targets ? item.successfulTargets / item.targets : 0),
          numberCell(item.totalReactions),
          numberCell(item.totalComments),
          numberCell(item.totalShares),
          numberCell(item.posts ? Math.round((item.totalReactions + item.totalComments + item.totalShares) / item.posts) : 0),
        ]),
        [
          { ...textCell('TỔNG'), fontWeight: 'bold' as const, backgroundColor: '#DBEAFE' },
          numberCell(totals.posts, '#DBEAFE'),
          numberCell(totals.completedPosts, '#DBEAFE'),
          numberCell(totals.targets, '#DBEAFE'),
          numberCell(totals.successfulTargets, '#DCFCE7'),
          numberCell(totals.failedTargets, '#FEE2E2'),
          numberCell(totals.cancelledTargets, '#FEF3C7'),
          numberCell(totals.pendingTargets, '#DBEAFE'),
          percentageCell(totals.targets ? totals.successfulTargets / totals.targets : 0),
          numberCell(totals.totalReactions, '#DBEAFE'),
          numberCell(totals.totalComments, '#DBEAFE'),
          numberCell(totals.totalShares, '#DBEAFE'),
          numberCell(totals.posts ? Math.round((totals.totalReactions + totals.totalComments + totals.totalShares) / totals.posts) : 0, '#DBEAFE'),
        ],
      ];

      await writeXlsxFile([
        {
          sheet: 'Lịch sử đăng bài',
          data: historySheet,
          columns: [
            { width: 7 }, { width: 21 }, { width: 24 }, { width: 32 }, { width: 55 },
            { width: 30 }, { width: 21 }, { width: 42 }, { width: 28 }, { width: 60 },
            { width: 14 }, { width: 14 }, { width: 12 }, { width: 18 },
          ],
          stickyRowsCount: 1,
          orientation: 'landscape' as const,
          showGridLines: false,
        },
        {
          sheet: 'Hiệu suất Sale',
          data: performanceSheet,
          columns: [
            { width: 28 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 },
            { width: 14 }, { width: 16 }, { width: 16 }, { width: 20 },
            { width: 16 }, { width: 16 }, { width: 14 }, { width: 20 },
          ],
          stickyRowsCount: 1,
          orientation: 'landscape' as const,
          showGridLines: false,
        },
      ], {
        fontFamily: 'Arial',
        fontSize: 11,
      }).toFile(`lich-su-dang-bai_${historyFromDate || 'tat-ca'}_${historyToDate || 'tat-ca'}.xlsx`);
    } catch (error) {
      setHistoryExportError(error instanceof Error ? error.message : 'Không xuất được file Excel');
    } finally {
      setHistoryExporting(false);
    }
  }

  async function collectFacebookMetricsWithExtension(record: FacebookPublishedPost): Promise<ExtensionMetricsResponse> {
    if (!record.post_url) return { ok: false, error: 'Bài chưa có permalink Facebook để extension mở.' };
    const requestId = `facebook_metrics_${record.id}_${Date.now()}`;
    return new Promise<ExtensionMetricsResponse>((resolve) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        resolve({ ok: false, error: 'Extension không phản hồi. Hãy cập nhật bản 0.1.46 và tải lại tab F-Solution/Facebook.' });
      }, 60000);
      function handleResponse(event: MessageEvent) {
        if (event.source !== window) return;
        const payload = event.data || {};
        if (payload.source !== 'streal-tiktok-extension') return;
        if (payload.type !== 'STREAL_FACEBOOK_POST_METRICS_RESPONSE' || payload.requestId !== requestId) return;
        window.clearTimeout(timer);
        window.removeEventListener('message', handleResponse);
        resolve(payload);
      }
      window.addEventListener('message', handleResponse);
      window.postMessage({
        source: 'streal-web-page',
        type: 'STREAL_FACEBOOK_POST_METRICS_REQUEST',
        requestId,
        payload: { postUrl: record.post_url, message: record.content || '' },
      }, window.location.origin);
    });
  }

  async function findFacebookReferenceWithExtension(record: FacebookPublishedPost): Promise<ExtensionReferenceResponse> {
    const requestId = `facebook_reference_${record.id}_${Date.now()}`;
    return new Promise<ExtensionReferenceResponse>((resolve) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        resolve({ ok: false, error: 'Extension không phản hồi. Hãy cập nhật bản 0.1.46 và tải lại tab F-Solution/Facebook.' });
      }, 60000);
      function handleResponse(event: MessageEvent) {
        if (event.source !== window) return;
        const payload = event.data || {};
        if (payload.source !== 'streal-tiktok-extension') return;
        if (payload.type !== 'STREAL_FACEBOOK_POST_REFERENCE_RESPONSE' || payload.requestId !== requestId) return;
        window.clearTimeout(timer);
        window.removeEventListener('message', handleResponse);
        resolve(payload);
      }
      window.addEventListener('message', handleResponse);
      window.postMessage({
        source: 'streal-web-page',
        type: 'STREAL_FACEBOOK_POST_REFERENCE_REQUEST',
        requestId,
        payload: {
          targetType: record.target_type,
          targetId: record.target_id,
          message: record.content || '',
        },
      }, window.location.origin);
    });
  }

  async function fetchFacebookMetrics(record: FacebookPublishedPost): Promise<FacebookPublishedPost> {
    const response = await api(`/api/facebook-posts/${encodeURIComponent(record.id)}/refresh`, { method: 'POST' });
    const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không cập nhật được tương tác');
    setFacebookPosts((prev) => prev.map((item) => item.id === record.id ? payload.post : item));
    return payload.post as FacebookPublishedPost;
  }

  async function fetchFacebookComments(record: FacebookPublishedPost) {
    const response = await api(`/api/facebook-posts/${encodeURIComponent(record.id)}/comments`, { method: 'POST' });
    const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không lấy được comment');
    const comments = safeList<StoredPostComment>(payload.comments);
    setFacebookComments((prev) => ({ ...prev, [record.id]: comments }));
    return { count: Number(payload.count || comments.length), comments };
  }

  async function saveFacebookReference(
    record: FacebookPublishedPost,
    postUrl: string,
    delivery = 'manual_reference',
  ): Promise<FacebookPublishedPost> {
    const response = await api(`/api/facebook-posts/${encodeURIComponent(record.id)}/reference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_url: postUrl.trim(), delivery, verified_content: true }),
    });
    const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không gắn được link bài Facebook');
    setFacebookPosts((prev) => prev.map((item) => item.id === record.id ? payload.post : item));
    return payload.post as FacebookPublishedPost;
  }

  async function attachManualFacebookReference(record: FacebookPublishedPost) {
    if (facebookHistoryBusy[record.id]) return;
    const postUrl = String(facebookManualLinks[record.id] || '').trim();
    if (!postUrl) {
      setLocalStatus('Dán permalink bài Facebook trước khi bấm Gắn link.');
      return;
    }
    setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: true }));
    setLocalStatus('Đang mở permalink bằng extension để kiểm tra và lưu...');
    try {
      const validation = await requestFacebookPostDataFromExtension({
        ...record,
        facebook_post_id: null,
        post_url: postUrl,
      });
      if (!validation.ok) throw new Error(validation.error || 'Extension không mở được permalink Facebook');
      const verifiedPostUrl = validation.postUrl || postUrl;
      const resolved = await saveFacebookReference(record, verifiedPostUrl, 'manual_reference');
      const browserResult = await saveFacebookBrowserData(resolved, validation);
      setFacebookManualLinks((prev) => ({ ...prev, [record.id]: '' }));
      setLocalStatus(`Đã gắn permalink và lưu ${browserResult.count} comment từ giao diện Facebook.`);
    } catch (error) {
      setLocalStatus(`Không gắn được permalink: ${formatFetchError(error)}`);
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
    }
  }

  async function saveFacebookBrowserData(record: FacebookPublishedPost, extension: ExtensionPostDataResponse) {
    const response = await api(`/api/facebook-posts/${encodeURIComponent(record.id)}/browser-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_url: extension.postUrl || record.post_url,
        reaction_count: extension.reactionCount,
        comment_count: extension.commentCount,
        share_count: extension.shareCount,
        comments: extension.comments || [],
      }),
    });
    const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Server không lưu được dữ liệu extension');
    const comments = safeList<StoredPostComment>(payload.comments);
    setFacebookPosts((prev) => prev.map((item) => item.id === record.id ? payload.post : item));
    setFacebookComments((prev) => ({ ...prev, [record.id]: comments }));
    return { post: payload.post as FacebookPublishedPost, count: Number(payload.count || comments.length), comments };
  }

  async function restoreFacebookRecordFromHistory(row: HistoryRow): Promise<FacebookPublishedPost | null> {
    if (row.facebookRecord) return row.facebookRecord;
    if (!row.targets.length) return null;
    const reqId = row.id.replace(/^(chrome|pipeline|local)-/, '') || `history_${Date.now()}`;
    const isFailed = historyPillClass(row.status) === 'pill-danger';
    const response = await api('/api/facebook-posts/extension-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: reqId,
        content: buildFacebookPostMessage({
          title: row.title,
          content: row.content,
          hashtags: row.hashtags,
        }),
        hashtags: row.hashtags,
        media_urls: row.mediaUrls?.length ? row.mediaUrls : row.mediaUrl ? [row.mediaUrl] : [],
        targets: row.targets,
        status: isFailed ? 'failed' : 'success',
        results: (row.results || []).map((item) => ({ ...item, ...item.target, target: undefined })),
      }),
    });
    const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
    const saved = safeList<FacebookPublishedPost>(payload.posts);
    if (!response.ok || !payload.ok || !saved.length) return null;
    const savedIds = new Set(saved.map((item) => item.id));
    setFacebookPosts((prev) => [...saved, ...prev.filter((item) => !savedIds.has(item.id))]);
    return saved[0];
  }

  async function autoAttachHistoryReference(row: HistoryRow) {
    if (facebookHistoryBusy[row.id]) return;
    setFacebookHistoryBusy((prev) => ({ ...prev, [row.id]: true }));
    setLocalStatus('Đang đồng bộ record Facebook...');
    try {
      const record = await restoreFacebookRecordFromHistory(row);
      if (!record) return;
      await resolveAndSyncFacebookPost(record, {
        automatic: false,
        allowManualFallback: true,
        forceReference: Boolean(record.facebook_post_id),
      });
    } catch (error) {
      setLocalStatus(`Không tự tìm được link: ${formatFetchError(error)}`);
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [row.id]: false }));
    }
  }

  async function fetchFacebookBrowserData(record: FacebookPublishedPost) {
    if (!record.post_url) throw new Error('Bài chưa có permalink Facebook để extension mở.');
    const extension = await requestFacebookPostDataFromExtension(record);
    if (!extension.ok) throw new Error(extension.error || 'Extension không đọc được dữ liệu bài Facebook');
    let resolved = record;
    if (!resolved.facebook_post_id && extension.postUrl) {
      resolved = await saveFacebookReference(resolved, extension.postUrl, 'extension_reference');
    }
    return saveFacebookBrowserData(resolved, extension);
  }

  async function resolveAndSyncFacebookPost(
    record: FacebookPublishedPost,
    options: { automatic?: boolean; allowManualFallback?: boolean; forceReference?: boolean } = {},
  ) {
    if (facebookHistoryBusy[record.id]) return;
    const automatic = options.automatic === true;
    const allowManualFallback = options.allowManualFallback !== false;
    const forceReference = options.forceReference === true;
    setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: true }));
    if (!automatic) setLocalStatus('Đang tự tìm bài Facebook, gắn permalink và rà soát comment...');
    const errors: string[] = [];
    try {
      let resolved = forceReference ? { ...record, facebook_post_id: null, post_url: '' } : record;
      if (!resolved.facebook_post_id && resolved.target_type === 'page') {
        const response = await api(`/api/facebook-posts/${encodeURIComponent(record.id)}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: forceReference }),
        });
        const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
        if (response.ok && payload.ok && payload.post) {
          resolved = payload.post as FacebookPublishedPost;
          setFacebookPosts((prev) => prev.map((item) => item.id === record.id ? resolved : item));
        } else if (payload.error) {
          errors.push(String(payload.error));
        }
      }

      if (!resolved.facebook_post_id) {
        const extensionResult = automatic
          ? await findFacebookReferenceWithExtension(record)
          : await requestFacebookReferenceFromExtension(record);
        if (extensionResult.ok && extensionResult.postUrl) {
          resolved = await saveFacebookReference(
            record,
            extensionResult.postUrl,
            automatic ? 'auto_resolved' : 'manual_reference',
          );
          errors.length = 0;
        } else if (extensionResult.error) {
          errors.push(extensionResult.error);
        }
      }

      if (!resolved.facebook_post_id) {
        if (!automatic) {
          const manualHint = allowManualFallback ? ' Dán permalink vào ô Gắn link của bài này để xử lý chắc chắn.' : '';
          setLocalStatus(`Chưa tự tìm được link: ${errors.at(-1) || 'Facebook không trả permalink.'}.${manualHint}`);
        }
        return;
      }

      if (automatic && resolved.target_type === 'group') {
        return;
      }

      let synced = resolved;
      let browserFallbackAttempted = false;
      let commentCount: number | null = null;
      if (resolved.target_type === 'group') {
        browserFallbackAttempted = true;
        try {
          const browserResult = await fetchFacebookBrowserData(resolved);
          synced = browserResult.post;
          commentCount = browserResult.count;
        } catch (browserError) {
          errors.push(`extension: ${formatFetchError(browserError)}`);
        }
      } else {
        try {
          synced = await fetchFacebookMetrics(resolved);
        } catch (error) {
          const graphError = formatFetchError(error);
          browserFallbackAttempted = true;
          try {
            const browserResult = await fetchFacebookBrowserData(resolved);
            synced = browserResult.post;
            commentCount = browserResult.count;
          } catch (browserError) {
            errors.push(`tương tác: ${graphError}`);
            errors.push(`extension: ${formatFetchError(browserError)}`);
          }
        }
      }
      if (commentCount === null) {
        try {
          const result = await fetchFacebookComments(synced);
          commentCount = result.count;
        } catch (error) {
          const graphError = formatFetchError(error);
          if (!browserFallbackAttempted) {
            browserFallbackAttempted = true;
            try {
              const browserResult = await fetchFacebookBrowserData(synced);
              synced = browserResult.post;
              commentCount = browserResult.count;
            } catch (browserError) {
              errors.push(`comment: ${graphError}`);
              errors.push(`extension: ${formatFetchError(browserError)}`);
            }
          } else {
            errors.push(`comment: ${graphError}`);
          }
        }
      }
      const summary = commentCount === null ? '' : `, đã rà ${commentCount} comment`;
      setLocalStatus(errors.length
        ? `Đã tự gắn bài${summary}; một số dữ liệu chưa đọc được (${errors.join(' · ')}).`
        : `Đã tự gắn link, cập nhật tương tác${summary}.`);
    } catch (error) {
      if (!automatic) setLocalStatus(`Không tự gắn/đồng bộ được: ${formatFetchError(error)}`);
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
    }
  }
  resolveAndSyncFacebookPostRef.current = resolveAndSyncFacebookPost;
  async function refreshFacebookMetrics(record: FacebookPublishedPost) {
    setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: true }));
    setLocalStatus('Đang cập nhật tương tác từ Facebook...');
    if (record.target_type === 'group') {
      try {
        const browserResult = await fetchFacebookBrowserData(record);
        setLocalStatus(`Đã đọc trực tiếp bài Group: ${browserResult.post.total_interactions ?? 0} tương tác, ${browserResult.count} comment.`);
      } catch (error) {
        setLocalStatus(`Không cập nhật được tương tác Group qua extension: ${formatFetchError(error)}`);
      } finally {
        setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
      }
      return;
    }
    try {
      await fetchFacebookMetrics(record);
      setLocalStatus('Đã cập nhật like/reaction, comment và share từ dữ liệu Facebook hiện có.');
    } catch (error) {
      const graphError = formatFetchError(error);
      setLocalStatus('Facebook API không cấp metrics; extension đang mở bài để đọc trực tiếp...');
      try {
        const browserResult = await fetchFacebookBrowserData(record);
        setLocalStatus(`Đã đọc trực tiếp bài Facebook: ${browserResult.post.total_interactions ?? 0} tương tác, ${browserResult.count} comment.`);
      } catch (browserError) {
        setLocalStatus(`Không cập nhật được tương tác. API: ${graphError} · Extension: ${formatFetchError(browserError)}`);
      }
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
    }
  }

  async function attachFacebookReference(record: FacebookPublishedPost) {
    await resolveAndSyncFacebookPost(record, {
      automatic: false,
      allowManualFallback: true,
      forceReference: Boolean(record.facebook_post_id),
    });
  }

  async function autoAttachFacebookReference(record: FacebookPublishedPost) {
    setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: true }));
    setLocalStatus('Đang tự tìm bài khớp nội dung trên Facebook...');
    try {
      const reference = await findFacebookReferenceWithExtension(record);
      if (!reference.ok || !reference.postUrl) throw new Error(reference.error || 'Không tìm thấy link bài Facebook');
      await saveFacebookReference(record, reference.postUrl, 'extension_reference');
      setLocalStatus('Đã tự tìm và gắn link bài Facebook.');
    } catch (error) {
      setLocalStatus(`Không tự tìm được link: ${formatFetchError(error)}`);
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
    }
  }

  async function collectFacebookComments(record: FacebookPublishedPost) {
    setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: true }));
    setLocalStatus('Đang thu thập comment Facebook...');
    if (record.target_type === 'group') {
      try {
        const browserResult = await fetchFacebookBrowserData(record);
        setExpandedComments(record.id);
        setLocalStatus(`Đã đọc và lưu ${browserResult.count} comment Group trực tiếp từ giao diện Facebook.`);
      } catch (error) {
        setLocalStatus(`Không lấy được comment Group qua extension: ${formatFetchError(error)}`);
      } finally {
        setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
      }
      return;
    }
    try {
      const result = await fetchFacebookComments(record);
      setExpandedComments(record.id);
      setLocalStatus(`Đã lưu ${result.count} comment; người chưa có SĐT vẫn được giữ trong danh sách tiềm năng.`);
    } catch (error) {
      const graphError = formatFetchError(error);
      setLocalStatus('Facebook API không cấp comment; extension đang mở bài để đọc trực tiếp...');
      try {
        const browserResult = await fetchFacebookBrowserData(record);
        setExpandedComments(record.id);
        setLocalStatus(`Đã đọc và lưu ${browserResult.count} comment trực tiếp từ giao diện Facebook.`);
      } catch (browserError) {
        setLocalStatus(`Không lấy được comment. API: ${graphError} · Extension: ${formatFetchError(browserError)}`);
      }
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [record.id]: false }));
    }
  }

  async function createLeadFromFacebookComment(recordId: string, comment: StoredPostComment) {
    if (!comment.post_id || !comment.comment_id) return;
    setFacebookHistoryBusy((prev) => ({ ...prev, [`comment-${comment.comment_id}`]: true }));
    try {
      const response = await api('/api/leads/from-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: comment.source || 'facebook', post_id: comment.post_id, comment_id: comment.comment_id, include_without_phone: true }),
      });
      const payload = await response.json().catch(() => ({ ok: false, error: `Server lỗi ${response.status}` }));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không tạo được Lead');
      setFacebookComments((prev) => ({ ...prev, [recordId]: (prev[recordId] || []).map((item) => item.comment_id === comment.comment_id ? { ...item, lead_exists: true } : item) }));
      setLocalStatus(payload.new_count ? 'Đã tạo Lead từ commenter.' : 'Commenter đã có trong CRM, không tạo bản ghi trùng.');
    } catch (error) {
      setLocalStatus(`Không tạo được Lead: ${formatFetchError(error)}`);
    } finally {
      setFacebookHistoryBusy((prev) => ({ ...prev, [`comment-${comment.comment_id}`]: false }));
    }
  }

  function appendHistory(row: Omit<HistoryRow, 'id' | 'createdAt'>) {
    setHistory((prev) => [{
      ...row,
      publisherName: row.publisherName || staffName || 'Không xác định',
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
        timeoutMs: AI_TIMEOUT_MS,
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
    } catch (err: unknown) {
      setLocalStatus(`Lỗi AI viết bài: ${formatFetchError(err) || 'Không tạo được biến thể'}`);
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
    if (selectedTargets.some((target) => target.type === 'group')) {
      setLocalStatus('Facebook Group chỉ đăng được qua Chrome. Dùng nút Đăng qua Chrome; API chỉ còn hỗ trợ Page.');
      return;
    }
    setPublishing(true);
    setLocalStatus(
      selectedTargets.length > 1
        ? `Đang xếp hàng ${selectedTargets.length} nơi, mỗi lượt cách nhau ${PUBLISH_INTERVAL_MINUTES} phút...`
        : 'Đang đăng bài...'
    );
    try {
      // Tự động phát hiện video URL để gửi native_video_url thay vì link preview
      const mediaUrls = postMedia.map((item) => item.url).filter(Boolean);
      const detectedMedia = detectVideoMedia(mediaUrl);
      const body = {
        title,
        message: baseMessage,
        media_url: mediaUrls.length ? '' : detectedMedia.mediaUrl,
        native_video_url: mediaUrls.length ? '' : detectedMedia.nativeVideoUrl,
        media_urls: mediaUrls,
        targets: selectedTargets.map((t) => ({
          type: t.type,
          id: t.id,
          name: t.name,
          message: buildMessage(t),
        })),
        stagger_minutes: selectedTargets.length > 1 ? PUBLISH_INTERVAL_MINUTES : 0,
      };
      const res = await api('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeoutMs: PUBLISH_TIMEOUT_MS,
      });
      const payload = await readPayload(res);

      if (payload.queued) {
        appendHistory({
          title,
          content,
          mediaUrl,
          mediaUrls,
          hashtags,
          scheduledAt: '',
          targets: selectedTargets,
          status: `Đang chờ 0/${payload.target_count || selectedTargets.length} · ${payload.interval_minutes || PUBLISH_INTERVAL_MINUTES} phút/lượt`,
          results: [],
        });
        setLocalStatus(
          `Đã xếp hàng ${payload.target_count || selectedTargets.length} nơi. `
          + `Lượt đầu chạy trong khoảng 30 giây, các lượt sau cách nhau ${payload.interval_minutes || PUBLISH_INTERVAL_MINUTES} phút.`
        );
      } else if (payload.results) {
        const results: PublishResult[] = (payload.results as Record<string, unknown>[]).map((r) => ({
          ok: r.ok !== false,
          target: { type: r.type === 'page' ? 'page' : 'group', id: String(r.id || ''), name: String(r.name || '') },
          post_id: r.post_id ? String(r.post_id) : undefined,
          error: r.error ? String(r.error) : undefined,
        }));
        const okCount = results.filter((item) => item.ok).length;
        const failCount = results.length - okCount;
        const errorLines = results
          .filter((item) => !item.ok)
          .map((item) => `${item.target.name || item.target.id}: ${item.error || 'Lỗi không xác định'}`);
        appendHistory({
          title,
          content,
          mediaUrl,
          mediaUrls,
          hashtags,
          scheduledAt: '',
          targets: selectedTargets,
          status: failCount ? `Đã đăng ${okCount}, lỗi ${failCount}` : 'Đã đăng',
          results,
        });
        setLocalStatus(
          failCount
            ? `Đã đăng ${okCount}/${results.length} nơi, lỗi ${failCount}. ${errorLines.join(' · ')}`
            : `Đã đăng ${okCount}/${results.length} nơi.`
        );
      } else {
        const error = payload.error || 'Lỗi không xác định từ server.';
        appendHistory({
          title, content, mediaUrl, mediaUrls, hashtags, scheduledAt: '', targets: selectedTargets,
          status: `Lỗi: ${error}`,
          results: selectedTargets.map((target) => ({ ok: false, target, error })),
        });
        setLocalStatus(error);
      }
    } catch (err: unknown) {
      const error = `Lỗi kết nối: ${formatFetchError(err)}`;
      appendHistory({
        title,
        content,
        mediaUrl,
        mediaUrls: postMedia.map((item) => item.url).filter(Boolean),
        hashtags,
        scheduledAt: '',
        targets: selectedTargets,
        status: error,
        results: selectedTargets.map((target) => ({ ok: false, target, error })),
      });
      setLocalStatus(error);
    } finally {
      setPublishing(false);
      void onReload();
      void loadFacebookHistory();
    }
  }

  async function scheduleDraft() {
    const message = buildMessage();
    if (!message || !title.trim() || !content.trim()) {
      setLocalStatus('Nhập đủ tiêu đề và nội dung bài viết trước khi đặt lịch.');
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
    if (selectedTargets.some((target) => target.type === 'group')) {
      setLocalStatus('Không thể đặt lịch nền cho Group vì Groups API đã ngừng hỗ trợ. Hãy dùng Đăng qua Chrome khi tới giờ.');
      return;
    }
    setPublishing(true);
    setLocalStatus('Đang lưu lịch đăng lên backend...');
    try {
      const mediaUrls = postMedia.map((item) => item.url).filter(Boolean);
      const detectedMedia = detectVideoMedia(mediaUrl);
      const res = await api('/api/content-pipeline/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          media_url: mediaUrls.length ? '' : detectedMedia.mediaUrl,
          native_video_url: mediaUrls.length ? '' : detectedMedia.nativeVideoUrl,
          media_urls: mediaUrls,
          hashtags,
          scheduled_at: scheduledAt,
          targets: selectedTargets.map((t) => ({
            type: t.type,
            id: t.id,
            name: t.name,
            message: buildMessage(t),
          })),
          publish_interval_minutes: selectedTargets.length > 1 ? PUBLISH_INTERVAL_MINUTES : 0,
          status: 'scheduled',
        }),
        timeoutMs: 60000,
      });
      const payload = await readPayload(res);
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Không lưu được lịch đăng');
      setLocalStatus(
        selectedTargets.length > 1
          ? `Đã lưu lịch. Tới giờ hệ thống đăng lần lượt, mỗi nơi cách nhau ${PUBLISH_INTERVAL_MINUTES} phút.`
          : 'Đã lưu lịch đăng. Backend sẽ tự kiểm tra và đăng khi tới giờ.'
      );
      void onReload();
    } catch (err: unknown) {
      setLocalStatus(`Lỗi đặt lịch: ${formatFetchError(err)}`);
    } finally {
      setPublishing(false);
    }
  }

  async function uploadImageFile(files?: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (postMedia.length + selected.length > 10) {
      setLocalStatus('Tối đa 10 file cho một bài đăng.');
      return;
    }
    setUploadingImage(true);
    setLocalStatus(`Đang upload ${selected.length} file ảnh/video...`);
    try {
      const form = new FormData();
      selected.forEach((file) => form.append('media', file));
      const res = await api('/api/uploads/post-media', { method: 'POST', body: form, timeoutMs: UPLOAD_TIMEOUT_MS });
      const payload = await readPayload(res);
      if (!res.ok || !payload.ok || !Array.isArray(payload.media)) throw new Error(payload.error || 'Không upload được ảnh/video');
      const uploaded: PostMediaItem[] = payload.media.map((item: PostMediaItem) => ({
        url: item.url,
        type: item.type === 'video' ? 'video' : 'image',
        name: item.name || '',
      }));
      setPostMedia((prev) => [...prev, ...uploaded].slice(0, 10));
      setLocalStatus('Đã upload media. Bấm Đăng qua Chrome để đăng ảnh/video thật lên Facebook.');
    } catch (err: unknown) {
      setLocalStatus(`Lỗi upload ảnh/video: ${formatFetchError(err)}`);
    } finally {
      setUploadingImage(false);
    }
  }

  function checkLinks() {
    if (postMedia.length) {
      setLocalStatus(`Đã có ${postMedia.length} media upload từ máy. Khi đăng, Facebook sẽ nhận dạng ảnh/video thật, không phải link preview.`);
      return;
    }
    const url = mediaUrl.trim();
    if (!url) {
      setLocalStatus('Chưa nhập link ảnh/video để kiểm tra.');
      return;
    }
    try {
      const parsed = new URL(url);
      const isVideo = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(parsed.pathname) || /youtube|youtu\.be|tiktok|facebook|fb\.watch|fb\.gg|reel|short/i.test(parsed.hostname);
      setLocalStatus(
        isVideo
          ? 'Link video hợp lệ. Hệ thống sẽ tự động đăng native video nếu backend có quyền upload; nếu không sẽ fallback link preview.'
          : 'Link hợp lệ. Khi đăng link dán tay, Facebook sẽ hiển thị dạng link preview.'
      );
    } catch {
      setLocalStatus('Link ảnh/video chưa đúng định dạng URL.');
    }
  }

  const targetCount = selectedTargets.length;
  const previewAuthor = selectedTargets[0]?.name || APP_BRAND.name;
  const previewHint = selectedTargets[0]
    ? (selectedTargets[0].type === 'page' ? 'Facebook Page' : 'Facebook Group')
    : 'Facebook';

  return (
    <section className="module-panel marketing-panel seeding-studio">
      <div className="module-head">
        <div>
          <div className="module-kicker">Bài viết</div>
          <h2>Bài viết chuẩn</h2>
          <p className="module-subline">
            Đồng bộ theo khung đối tác: tiêu đề, nội dung, ảnh/video thật, lịch đăng và chọn nơi đăng trong một màn hình.
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
          <div className="seeding-section-title">📄 Bài viết chuẩn</div>

          <div className="seeding-compose-split">
            <div className="seeding-compose-form">
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
            <span>Ảnh/video từ máy hoặc link preview</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
              multiple
              disabled={uploadingImage}
              onChange={(event) => {
                void uploadImageFile(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
            <input
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder="Dán YouTube/TikTok/link nếu muốn đăng dạng link preview"
            />
            {postMedia.length ? (
              <div className="post-media-grid">
                {postMedia.map((item, idx) => (
                  <div className="post-media-item" key={`${item.url}-${idx}`}>
                    {item.type === 'video' ? <video src={item.url} muted controls /> : <img src={item.url} alt="" />}
                    <button
                      type="button"
                      aria-label="Xoá media"
                      disabled={publishing}
                      onClick={() => setPostMedia((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {mediaUrl ? <small className="seeding-media-hint">Link preview hiện tại: <a href={mediaUrl} target="_blank" rel="noreferrer">Mở link</a></small> : null}
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
            <button
              type="button"
              className="btn-cancel"
              disabled={assistedQueueBusy || !selectedTargets.length}
              onClick={() => void startAssistedGroupQueue()}
            >
              {assistedQueueBusy ? 'Chrome đang xử lý...' : '🧭 Đăng qua Chrome'}
            </button>
            <button type="button" className="btn-cancel" disabled={publishing} onClick={() => void scheduleDraft()}>
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
                <div key={targetKey(target)} className="caption-variant-card">
                  <span>{target.type === 'page' ? 'Page' : 'Nhóm'} · {target.name}</span>
                  <textarea
                    value={captionVariants[targetKey(target)] || ''}
                    onChange={(event) => setCaptionVariants((prev) => ({
                      ...prev,
                      [targetKey(target)]: event.target.value,
                    }))}
                    placeholder="AI sẽ tạo caption riêng cho nơi đăng này"
                  />
                  <div className="caption-variant-actions">
                    <button type="button" className="btn-cancel" onClick={() => void copyAndOpenTarget(target)}>
                      📋 Sao chép &amp; mở Facebook
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
            </div>

            <aside className="seeding-compose-preview">
              <PostPublishPreview
                authorName={previewAuthor}
                authorHint={previewHint}
                title={title}
                content={content}
                hashtags={hashtags}
                mediaUrl={mediaUrl}
                postMedia={postMedia}
                scheduledAt={scheduledAt}
              />
            </aside>
          </div>
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
            {loadingTargets && !groups.length && !pages.length ? (
              <div className="seeding-empty-target">Đang tải nhóm/Page...</div>
            ) : null}
            {!loadingTargets && !groups.length && !pages.length ? (
              <div className="seeding-empty-target">
                Chưa có nhóm/Page trong DB. Vào mục <b>Kênh</b> để thêm nhóm/Page, rồi bấm Tải nhóm/Page.
              </div>
            ) : null}
          </div>

          <div className="target-note">
            File ảnh/video upload từ máy sẽ đăng dạng media thật; link YouTube/TikTok hoặc link dán tay sẽ đăng dạng link preview.
            Facebook Page vẫn hỗ trợ đăng qua API; Group dùng hoàn toàn phiên Chrome vì Groups API đã ngừng hỗ trợ.
            Với <b>Đăng qua Chrome</b>, extension xử lý lần lượt, bắt permalink ngay từ phản hồi đăng hoặc DOM, lưu từng kết quả về hệ thống rồi mới chuyển nơi tiếp theo. Nếu Facebook báo lỗi hoặc chặn thao tác, hàng đợi sẽ dừng.
          </div>
        </aside>
      </div>

      <div className="seeding-history">
        <div className="seeding-history-head">
          <div className="seeding-section-title">📋 Lịch sử đăng bài</div>
          <div className="history-actions seeding-history-actions">
            <label className="history-date-field">
              <span>Từ ngày</span>
              <input
                type="date"
                value={historyFromDate}
                max={historyToDate || undefined}
                onChange={(event) => setHistoryFromDate(event.target.value)}
              />
            </label>
            <label className="history-date-field">
              <span>Đến ngày</span>
              <input
                type="date"
                value={historyToDate}
                min={historyFromDate || undefined}
                onChange={(event) => setHistoryToDate(event.target.value)}
              />
            </label>
            {historyFromDate || historyToDate ? (
              <button
                type="button"
                className="table-icon-button history-clear-button"
                title="Xóa bộ lọc ngày"
                onClick={() => {
                  setHistoryFromDate('');
                  setHistoryToDate('');
                  setHistoryExportError('');
                }}
              >
                <X size={17} aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="history-export-button"
              disabled={invalidHistoryRange || !filteredHistory.length || historyExporting}
              onClick={() => void exportPostHistoryExcel()}
            >
              <Download size={17} aria-hidden="true" />
              <span>{historyExporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
          </div>
        </div>
        <div className={`history-filter-meta${invalidHistoryRange ? ' error' : ''}`}>
          {invalidHistoryRange
            ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'
            : `Hiển thị ${filteredHistory.length}/${visibleHistory.length} bài đăng${historyFromDate || historyToDate ? ' trong khoảng đã chọn' : ''}.`}
        </div>
        <div className="data-table-wrap">
          <table className="data-table seeding-history-table">
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Nội dung</th>
                <th>Link ảnh/video</th>
                <th>Lịch đăng</th>
                <th>Nơi đăng</th>
                <th>Người đăng</th>
                <th>Trạng thái</th>
                <th>Tương tác</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length ? filteredHistory.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.title || 'Bài đăng'}</b>
                    <small>{formatDateTime(row.createdAt)}</small>
                  </td>
                  <td>{row.content || '-'}</td>
                  <td>
                    {row.mediaUrls?.length
                      ? `${row.mediaUrls.length} media`
                      : row.mediaUrl ? <a href={row.mediaUrl} target="_blank" rel="noreferrer">Mở link</a> : '-'}
                  </td>
                  <td>{formatDateTime(row.scheduledAt)}</td>
                  <td>{row.targets.length ? row.targets.map((target) => target.name).join(', ') : '-'}</td>
                  <td>{row.publisherName || 'Không xác định'}</td>
                  <td>
                    <span className={historyPillClass(row.status)}>
                      {displayPostStatus(row.status)}
                    </span>
                    {row.targets.length ? (
                      <small className="publish-error-detail">
                        {row.targets.map((target) => {
                          const result = row.results?.find((item) => targetKey(item.target) === targetKey(target));
                          return `${target.name}: ${deliveryLabel(result)}`;
                        }).join(' · ')}
                      </small>
                    ) : null}
                    {canCancelFacebookQueue(row) ? (
                      <button
                        type="button"
                        className="seeding-history-cancel"
                        disabled={!!cancellingHistoryIds[row.id]}
                        onClick={() => void cancelAssistedGroupQueue(row)}
                      >
                        {cancellingHistoryIds[row.id]
                          ? 'Đang hủy...'
                          : row.queueRequestId ? 'Hủy hàng đợi cũ' : 'Hủy hàng đợi'}
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {row.facebookRecord ? (
                      <div className="facebook-metrics-cell">
                        <span>❤️ {row.facebookRecord.reaction_count ?? '—'}</span>
                        <span>💬 {row.facebookRecord.comment_count ?? '—'}</span>
                        <span>↗ {row.facebookRecord.share_count ?? '—'}</span>
                        <b>Tổng {row.facebookRecord.total_interactions ?? '—'}</b>
                        <small>{row.facebookRecord.legacy_unverified
                          ? 'Lịch sử cũ chưa có link/Post ID'
                          : row.facebookRecord.metrics_updated_at ? `Cập nhật ${formatDateTime(row.facebookRecord.metrics_updated_at)}` : 'Chưa đồng bộ'}</small>
                      </div>
                    ) : (
                      <div className="facebook-metrics-cell">
                        <span>❤️ —</span>
                        <span>💬 —</span>
                        <span>↗ —</span>
                        <b>Tổng —</b>
                        <small>Chưa đồng bộ</small>
                      </div>
                    )}
                  </td>
                  <td>
                    {row.facebookRecord ? (
                      <div className="facebook-history-actions">
                        {row.facebookRecord.post_url
                          ? <a href={row.facebookRecord.post_url} target="_blank" rel="noreferrer">Xem bài Facebook</a>
                          : <a href={facebookDestinationUrl(row.facebookRecord)} target="_blank" rel="noreferrer">Mở nơi đăng</a>}
                        <button type="button" disabled={!!facebookHistoryBusy[row.facebookRecord.id]} onClick={() => void attachFacebookReference(row.facebookRecord!)}>
                          {facebookHistoryBusy[row.facebookRecord.id]
                            ? 'Đang dò...'
                            : row.facebookRecord.facebook_post_id ? 'Dò lại bằng extension' : 'Dò link bằng extension'}
                        </button>
                        {!row.facebookRecord.post_url ? (
                          <div className="facebook-manual-reference">
                            <input
                              type="url"
                              inputMode="url"
                              aria-label={`Permalink Facebook cho ${row.facebookRecord.target_name || row.facebookRecord.target_id}`}
                              placeholder="Dán permalink bài Facebook"
                              value={facebookManualLinks[row.facebookRecord.id] || ''}
                              onChange={(event) => setFacebookManualLinks((prev) => ({ ...prev, [row.facebookRecord!.id]: event.target.value }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void attachManualFacebookReference(row.facebookRecord!);
                                }
                              }}
                            />
                            <button
                              type="button"
                              disabled={!!facebookHistoryBusy[row.facebookRecord.id] || !String(facebookManualLinks[row.facebookRecord.id] || '').trim()}
                              onClick={() => void attachManualFacebookReference(row.facebookRecord!)}
                            >
                              Gắn link
                            </button>
                          </div>
                        ) : null}
                        <button type="button" disabled={!!facebookHistoryBusy[row.facebookRecord.id] || (!row.facebookRecord.facebook_post_id && !row.facebookRecord.post_url)} onClick={() => void refreshFacebookMetrics(row.facebookRecord!)}>Cập nhật tương tác</button>
                        <button type="button" disabled={!!facebookHistoryBusy[row.facebookRecord.id] || (!row.facebookRecord.facebook_post_id && !row.facebookRecord.post_url)} onClick={() => void collectFacebookComments(row.facebookRecord!)}>Xem comment</button>
                      </div>
                    ) : (
                      <div className="facebook-history-actions">
                        {row.targets[0] && facebookTargetUrl(row.targets[0])
                          ? <a href={facebookTargetUrl(row.targets[0])} target="_blank" rel="noreferrer">Mở nơi đăng</a>
                          : null}
                        <button type="button" disabled={!!facebookHistoryBusy[row.id]} onClick={() => void autoAttachHistoryReference(row)}>
                          {facebookHistoryBusy[row.id] ? 'Đang tự tìm...' : 'Tự tìm & gắn link'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="table-empty">
                    {visibleHistory.length ? 'Không có bài đăng trong khoảng ngày đã chọn' : 'Chưa có bài đăng nào'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {expandedComments ? (
          <div className="facebook-comment-results">
            <div className="seeding-history-head">
              <div className="seeding-section-title">Comment / khách hàng tiềm năng</div>
              <button type="button" className="table-icon-button" onClick={() => setExpandedComments('')}>Đóng</button>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Người comment</th><th>Nội dung</th><th>Facebook</th><th>SĐT</th><th>Nguồn SĐT</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
                <tbody>
                  {(facebookComments[expandedComments] || []).length ? (facebookComments[expandedComments] || []).map((comment, index) => (
                    <tr key={comment.comment_id || index}>
                      <td>{comment.author_name || 'Ẩn danh'}</td>
                      <td>{comment.message || '—'}</td>
                      <td>{comment.author_url ? <a href={comment.author_url} target="_blank" rel="noreferrer">Mở profile</a> : '—'}</td>
                      <td>{comment.phones?.join(', ') || comment.phone || 'Chưa có'}</td>
                      <td>{comment.phones_auto?.length ? 'Facebook Comment' : comment.phones_manual?.length ? 'Nhân viên cập nhật' : 'Chưa có'}</td>
                      <td>{comment.lead_exists ? 'Đã có trong CRM' : comment.phones?.length || comment.phone ? 'Có SĐT' : 'Lead tiềm năng · chưa có SĐT'}</td>
                      <td><button type="button" disabled={comment.lead_exists || !!facebookHistoryBusy[`comment-${comment.comment_id}`]} onClick={() => void createLeadFromFacebookComment(expandedComments, comment)}>{comment.lead_exists ? 'Đã có CRM' : 'Tạo Lead'}</button></td>
                    </tr>
                  )) : <tr><td colSpan={7} className="table-empty">Bài chưa có comment hoặc Facebook không cấp quyền đọc.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="seeding-status-line">{localStatus || status}</div>
      {historyExportError ? <div className="module-status history-export-error">{historyExportError}</div> : null}
    </section>
  );
}
