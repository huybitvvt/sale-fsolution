'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CommentAuthorHeading, CommentAuthorLink } from '@/components/CommentAuthorLink';
import { api } from '@/lib/api';
import { buildTikTokCommentUrl } from '@/lib/utils';
import { extractPhones, phonesForComment } from '@/lib/phone-utils';
import type { ManagedChannel, StoredPostComment } from '@/lib/types';
import './omni-inbox.css';

type TabKey = 'inbox' | 'customers' | 'stats' | 'templates' | 'messenger' | 'zalo';
type ChannelFilter = 'all' | 'facebook' | 'tiktok' | 'instagram';
type SourceKey = 'fb-page' | 'fb-group' | 'tiktok' | 'instagram';
type TagKey = string;
type WorkflowFilter = 'all' | 'open' | 'done' | 'starred';

type NamedChannelOption = {
  key: string;
  label: string;
  platform?: string;
  count: number;
};

type CommentPayload = {
  ok?: boolean;
  comments?: StoredPostComment[];
  count?: number;
  warning?: string;
  error?: string;
};

type MessengerMessage = {
  message_key?: string;
  conversation_key?: string;
  conversation_id?: string;
  message_id?: string;
  sender_id?: string;
  sender_name?: string;
  sender_type?: string;
  direction?: string;
  text?: string;
  phone?: string;
  phones?: string[];
  display_time?: string;
  sent_at?: string;
  raw_message?: {
    media_urls?: string[];
    media_type?: string;
    [key: string]: unknown;
  };
  owner_key?: string;
  captured_at?: string;
};

type MessengerConversation = {
  conversation_key?: string;
  conversation_id?: string;
  conversation_url?: string;
  title?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  phones?: string[];
  message_count?: number;
  latest_message_at?: string;
  captured_by_staff_id?: string;
  captured_by_staff_name?: string;
  captured_by_staff_username?: string;
  owner_key?: string;
  captured_at?: string;
  updated_at?: string;
};

type MessengerStaffOption = {
  id: string;
  name?: string;
  username?: string;
  role?: string;
};

type MessengerSyncResult = {
  ok?: boolean;
  conversation?: MessengerConversation;
  messages?: MessengerMessage[];
  count?: number;
  warning?: string;
  error?: string;
  extension_warning?: string;
  extension_count?: number;
  scan_rounds?: number;
  identity_source?: string;
  identity_confidence?: string;
  media_capture_count?: number;
  media_capture_warning?: string;
  media_upload_count?: number;
};

type TikTokBridgeResult = {
  ok?: boolean;
  comment_id?: string;
  cid?: string;
  id?: string;
  post_id?: string;
  post_url?: string;
  url?: string;
  error?: string;
  method?: string;
  manual?: boolean;
  fallback_allowed?: boolean;
  warning?: string;
};

type TikTokOpenCommentResult = {
  ok?: boolean;
  url?: string;
  error?: string;
  message?: string;
  method?: string;
  target_found?: boolean;
  scrolled?: number;
  typed?: boolean;
};

type TagMeta = {
  key: TagKey;
  label: string;
  icon: string;
  className: string;
  system?: boolean;
};

type ReplyTemplate = {
  id: string;
  trigger: string;
  title: string;
  text: string;
  system?: boolean;
};

const CHANNEL_FILTERS: { key: ChannelFilter; label: string; materialIcon: string }[] = [
  { key: 'all', label: 'Tất cả kênh', materialIcon: 'apps' },
  { key: 'facebook', label: 'Facebook', materialIcon: 'public' },
  { key: 'tiktok', label: 'TikTok', materialIcon: 'movie' },
];

const SOURCE_META: Record<SourceKey, { label: string; icon: string; materialIcon: string; className: string; chipClass: string }> = {
  'fb-page': { label: 'Facebook', icon: '📘', materialIcon: 'public', className: 'src-page', chipClass: 'facebook' },
  'fb-group': { label: 'Facebook', icon: '👥', materialIcon: 'public', className: 'src-group', chipClass: 'facebook' },
  tiktok: { label: 'TikTok', icon: '🎵', materialIcon: 'movie', className: 'src-tiktok', chipClass: 'tiktok' },
  instagram: { label: 'Instagram', icon: '📷', materialIcon: 'photo_camera', className: 'src-instagram', chipClass: 'instagram' },
};

const TAGS: TagMeta[] = [
  { key: 'hot', label: 'Nóng', icon: '🔥', className: 'tag-hot' },
  { key: 'closed', label: 'Đã chốt', icon: '💰', className: 'tag-closed' },
  { key: 'need', label: 'Có nhu cầu', icon: '🎯', className: 'tag-need' },
  { key: 'price', label: 'Hỏi giá', icon: '❔', className: 'tag-price' },
  { key: 'review', label: 'Xem xét', icon: '🔎', className: 'tag-review' },
  { key: 'vip', label: 'VIP', icon: '⭐', className: 'tag-vip' },
];

const QUICK_REPLIES: ReplyTemplate[] = [
  {
    id: 'need',
    trigger: 'nhucau',
    title: 'Hỏi nhu cầu',
    text: 'Em chào anh/chị, mình cần hỗ trợ nội dung nào ạ? Anh/chị gửi thêm yêu cầu để bên em tư vấn đúng hơn nhé.',
  },
  {
    id: 'price',
    trigger: 'baogia',
    title: 'Báo giá',
    text: 'Em đã nhận thông tin. Anh/chị cho em xin nhu cầu cụ thể và số lượng/khối lượng để bên em báo giá chính xác ạ.',
  },
  {
    id: 'phone',
    trigger: 'sdt',
    title: 'Xin SĐT',
    text: 'Anh/chị để lại SĐT hoặc nhắn inbox giúp em, sale bên em sẽ liên hệ tư vấn nhanh ạ.',
  },
  {
    id: 'closed',
    trigger: 'chot',
    title: 'Đã chốt',
    text: 'Em cảm ơn anh/chị. Bên em sẽ ghi nhận thông tin và liên hệ xác nhận đơn/yêu cầu ngay ạ.',
  },
];

const WORKFLOW_STORAGE_KEY = 'streal-comment-inbox-workflow-v1';
const MANUAL_TAG_STORAGE_KEY = 'streal-comment-manual-tags-v1';

function readWorkflowStore() {
  if (typeof window === 'undefined') return { processed: [] as string[], starred: [] as string[] };
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      processed: Array.isArray(parsed.processed) ? parsed.processed.filter(Boolean) : [],
      starred: Array.isArray(parsed.starred) ? parsed.starred.filter(Boolean) : [],
    };
  } catch {
    return { processed: [] as string[], starred: [] as string[] };
  }
}

function readManualTagStore() {
  if (typeof window === 'undefined') return {} as Record<string, string[]>;
  try {
    const raw = window.localStorage.getItem(MANUAL_TAG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string[]> : {};
  } catch {
    return {};
  }
}

function templateRows(rows?: ReplyTemplate[]) {
  const source = Array.isArray(rows) && rows.length ? rows : QUICK_REPLIES;
  return source.map((item, index) => ({
    id: String(item.id || item.trigger || item.title || index),
    trigger: String(item.trigger || item.title || '').replace(/^\//, '').trim().toLowerCase(),
    title: String(item.title || item.trigger || 'Mẫu câu'),
    text: String(item.text || ''),
    system: Boolean(item.system),
  })).filter((item) => item.text);
}

function tagRows(rows?: (Partial<TagMeta> & { id?: string; color?: string })[]) {
  const source: (Partial<TagMeta> & { id?: string; color?: string })[] = Array.isArray(rows) && rows.length ? rows : TAGS;
  return source.map((item, index) => {
    const key = String(item.key || item.id || item.label || index);
    const color = String((item as { color?: string }).color || '').toLowerCase();
    return {
      key,
      label: String(item.label || key),
      icon: String(item.icon || '🏷️'),
      className: String(item.className || `tag-${color || key}`),
      system: Boolean(item.system),
    };
  });
}

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

function channelFilterKey(row: StoredPostComment): ChannelFilter {
  const key = sourceKey(row);
  if (key === 'tiktok') return 'tiktok';
  if (key === 'instagram') return 'instagram';
  return 'facebook';
}

function matchesChannelFilter(row: StoredPostComment, filter: ChannelFilter) {
  if (filter === 'all') return true;
  return channelFilterKey(row) === filter;
}

function commentChannelKeys(row: StoredPostComment) {
  const keys = new Set<string>();
  const name = (row.channel_name || '').trim();
  const groupId = (row.group_id || '').trim();
  if (name) keys.add(name);
  if (groupId && groupId !== name) keys.add(groupId);
  return [...keys];
}

function rowMatchesManagedChannel(row: StoredPostComment, channel: ManagedChannel) {
  const targetId = (channel.target_id || '').trim();
  const channelName = (channel.channel_name || '').trim();
  const groupId = (row.group_id || '').trim();
  const postId = (row.post_id || '').trim();
  const postUrl = (row.post_url || '').trim();
  const link = (channel.link || '').trim();
  if (targetId && (groupId === targetId || postId.includes(targetId))) return true;
  if (channelName && commentChannelKeys(row).some((key) => key === channelName)) return true;
  if (link && postUrl && postUrl.includes(link.replace(/^https?:\/\//, ''))) return true;
  return false;
}

function matchesNamedChannelFilter(
  row: StoredPostComment,
  filterKey: string,
  managedChannels: ManagedChannel[] = [],
) {
  if (!filterKey) return true;
  if (commentChannelKeys(row).includes(filterKey)) return true;
  const managed = managedChannels.find((item) => item.id === filterKey);
  if (managed) return rowMatchesManagedChannel(row, managed);
  return false;
}

function platformForNamedChannel(option: NamedChannelOption) {
  const platform = (option.platform || '').toLowerCase();
  if (platform.includes('tiktok')) return 'tiktok';
  if (platform.includes('instagram')) return 'instagram';
  if (platform) return 'facebook';
  return 'all' as ChannelFilter;
}

function workflowId(row: StoredPostComment) {
  return row.comment_id || commentKey(row);
}

function isRowProcessed(row: StoredPostComment, processedSet: Set<string>) {
  return Boolean(row.processed) || processedSet.has(workflowId(row)) || processedSet.has(commentKey(row));
}

function isRowStarred(row: StoredPostComment, starredSet: Set<string>) {
  return Boolean(row.starred) || starredSet.has(workflowId(row)) || starredSet.has(commentKey(row));
}

function sourceLabel(row: StoredPostComment) {
  const key = sourceKey(row);
  return SOURCE_META[key];
}

function commentText(row: StoredPostComment) {
  return row.message || '';
}

function commentKey(row: StoredPostComment) {
  return (
    row.comment_id ||
    [
      row.source || 'comment',
      row.post_id || row.group_id || 'post',
      row.author_id || row.author_name || 'author',
      row.created_time || row.fetched_at || 'time',
      (row.message || '').slice(0, 80),
    ].join('|')
  );
}

function commentTags(row: StoredPostComment, tagOptions: TagMeta[] = TAGS, manualTagIds: string[] = []): TagMeta[] {
  const text = normalizeText(commentText(row));
  const matched = new Set((row.matched_keywords || []).map((item) => normalizeText(item)));
  const phones = row.phones?.length ? row.phones : (row.phone ? [row.phone] : []);
  const tags = new Set<TagKey>();

  if (phones.length || /gấp|ngay|inbox|ib|nhắn|zalo|sđt|sdt|phone/.test(text)) tags.add('hot');
  if (/chốt|đặt|mua|lấy|order|đơn|ship/.test(text)) tags.add('closed');
  if (row.is_matched || matched.size || /quan tâm|cần|tư vấn|hỗ trợ|muốn|có không|còn không/.test(text)) tags.add('need');
  if (/giá|bao nhiêu|báo giá|quote|phí|tiền/.test(text)) tags.add('price');
  if (phones.length && tags.has('need')) tags.add('vip');
  if (!tags.size || /\?/.test(text)) tags.add('review');

  manualTagIds.forEach((item) => item && tags.add(item));
  return tagOptions.filter((item) => tags.has(item.key));
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

function commentTimeShort(row: StoredPostComment) {
  const raw = row.created_time || row.fetched_at;
  if (!raw) return '-';
  try {
    const date = new Date(raw);
    const diff = Date.now() - date.getTime();
    if (diff > 86400000 * 2) return date.toLocaleDateString('vi-VN');
    if (diff > 86400000) return 'Hôm qua';
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return raw;
  }
}

function messengerTime(value?: string) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

function messengerDisplayTime(row: MessengerMessage) {
  return row.display_time || messengerTime(row.sent_at || row.captured_at);
}

function zaloDisplayTime(row: MessengerMessage) {
  return row.display_time || (row.sent_at ? messengerTime(row.sent_at) : 'Không rõ giờ');
}

function messengerConversationKey(row: MessengerConversation | MessengerMessage) {
  return row.conversation_key || row.conversation_id || '';
}

function isMessengerSystemText(value?: string, conversation?: MessengerConversation | null) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text) return true;
  if (/^(?:\/-)?(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)$/.test(text)) return true;
  if (/^(?:>|<|:o|:-o|:-h|:-\(\(|:\(\(|:\)|:-\)|;\)|;-\)|:d|:-d|:\*|:-\*)$/.test(text)) return true;
  if (/^\/[-a-z0-9_]+$/i.test(text)) return true;
  if (text.includes('/-') && /\/-(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/.test(text) && !/[à-ỹ]/.test(text)) return true;
  if (/^(\d{1,2}:\d{2})(\s+\d{1,2}\/\d{1,2}\/\d{2,4})?$/.test(text)) return true;
  const conversationNames = [
    conversation?.customer_name,
    conversation?.title,
  ].map((item) => String(item || '').replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
  if (conversationNames.includes(text)) return true;
  if ([
    'aa',
    'all',
    'chat info',
    'chats',
    'community',
    'cộng đồng',
    'customize chat',
    'đoạn chat',
    'file phương tiện, file và liên kết',
    'media, files and links',
    'messenger',
    'mute notifications',
    'nhóm',
    'notifications',
    'privacy and support',
    'profile',
    'quyền riêng tư và hỗ trợ',
    'search',
    'soạn',
    'soạn tin nhắn',
    'tất cả',
    'tắt thông báo',
    'thông báo',
    'thông tin về đoạn chat',
    'type a message',
    'trang cá nhân',
    'tùy chỉnh đoạn chat',
    'unread',
    'write a message',
  ].includes(text)) return true;
  return [
    'các bạn không phải là bạn bè',
    'you are not connected',
    'sống tại ',
    'làm việc tại ',
    'học tại ',
    'giờ đây, các bạn',
    'now you can',
    'nhập, tin nhắn do',
    'type, message from',
    'đã gửi ',
    'sent ',
    'đã xem',
    'seen',
  ].some((prefix) => text.startsWith(prefix));
}

function safeConversationTitle(value?: string, fallback = 'Hội thoại') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (
    /^(?:\/-)?(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)$/.test(lower)
    || /^(?:>|<|:o|:-o|:-h|:-\(\(|:\(\(|:\)|:-\)|;\)|;-\)|:d|:-d|:\*|:-\*)$/.test(lower)
    || /^\/[-a-z0-9_]+$/i.test(lower)
    || (lower.includes('/-') && /\/-(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/.test(lower) && !/[à-ỹ]/.test(lower))
  ) {
    return fallback;
  }
  return text;
}

function messengerMediaUrls(row: MessengerMessage) {
  const rawUrls = row.raw_message?.media_urls;
  return Array.isArray(rawUrls)
    ? rawUrls.map((item) => String(item || '').trim()).filter((item) => /^https:\/\//i.test(item)).slice(0, 6)
    : [];
}

function authorInitials(name?: string) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function tagMaterialIcon(key: string) {
  const map: Record<string, { icon: string; filled?: boolean; color?: string }> = {
    hot: { icon: 'local_fire_department', filled: true, color: '#ef4444' },
    closed: { icon: 'verified', color: '#16a34a' },
    need: { icon: 'stars', filled: true, color: '#f97316' },
    price: { icon: 'payments', color: '#3b82f6' },
    review: { icon: 'search', color: '#64748b' },
    vip: { icon: 'workspace_premium', color: '#9333ea' },
  };
  return map[key] || { icon: 'label', color: '#64748b' };
}

function MaterialIcon({ name, filled, className, style }: { name: string; filled?: boolean; className?: string; style?: CSSProperties }) {
  return <span className={`material-symbols-outlined${filled ? ' filled' : ''}${className ? ` ${className}` : ''}`} style={style}>{name}</span>;
}

function channelName(row: StoredPostComment) {
  if (row.channel_name) return row.channel_name;
  if (row.group_id) return row.group_id;
  return row.post_id || '-';
}

function postTitle(row: StoredPostComment) {
  return row.post_title || row.video_title || '-';
}

export function CommentLeadInboxPanel() {
  const [tab, setTab] = useState<TabKey>('inbox');
  const [comments, setComments] = useState<StoredPostComment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [sourceFilter, setSourceFilter] = useState<ChannelFilter>('all');
  const [namedChannelFilter, setNamedChannelFilter] = useState('');
  const [managedChannels, setManagedChannels] = useState<ManagedChannel[]>([]);
  const [tagFilter, setTagFilter] = useState<TagKey | ''>('');
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyStatus, setReplyStatus] = useState('');
  const [templates, setTemplates] = useState<ReplyTemplate[]>(() => templateRows(QUICK_REPLIES));
  const [templateForm, setTemplateForm] = useState({ title: '', trigger: '', text: '' });
  const [tagOptions, setTagOptions] = useState<TagMeta[]>(() => tagRows(TAGS));
  const [newTagLabel, setNewTagLabel] = useState('');
  const [manualTagsByComment, setManualTagsByComment] = useState<Record<string, string[]>>(() => readManualTagStore());
  const [tiktokBridgeReady, setTiktokBridgeReady] = useState(false);
  const [tiktokBridgeVersion, setTiktokBridgeVersion] = useState('');
  const [processedIds, setProcessedIds] = useState<string[]>(() => readWorkflowStore().processed);
  const [starredIds, setStarredIds] = useState<string[]>(() => readWorkflowStore().starred);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneHint, setPhoneHint] = useState('');
  const [messengerConversations, setMessengerConversations] = useState<MessengerConversation[]>([]);
  const [messengerMessages, setMessengerMessages] = useState<MessengerMessage[]>([]);
  const [selectedMessengerId, setSelectedMessengerId] = useState('');
  const [messengerStaffOptions, setMessengerStaffOptions] = useState<MessengerStaffOption[]>([]);
  const [messengerStaffFilter, setMessengerStaffFilter] = useState('');
  const [messengerCanManage, setMessengerCanManage] = useState(false);
  const [messengerBusy, setMessengerBusy] = useState(false);
  const [zaloConversations, setZaloConversations] = useState<MessengerConversation[]>([]);
  const [zaloMessages, setZaloMessages] = useState<MessengerMessage[]>([]);
  const [selectedZaloId, setSelectedZaloId] = useState('');
  const [zaloStaffOptions, setZaloStaffOptions] = useState<MessengerStaffOption[]>([]);
  const [zaloStaffFilter, setZaloStaffFilter] = useState('');
  const [zaloCanManage, setZaloCanManage] = useState(false);
  const [zaloBusy, setZaloBusy] = useState(false);

  const processedSet = useMemo(() => new Set(processedIds), [processedIds]);
  const starredSet = useMemo(() => new Set(starredIds), [starredIds]);

  const loadWorkflow = useCallback(async () => {
    try {
      const r = await api('/api/post-comments/workflow');
      if (!r.ok) return;
      const data = await r.json().catch(() => ({}));
      if (!data.ok) return;
      const processed = Array.isArray(data.processed) ? data.processed.filter(Boolean) : [];
      const starred = Array.isArray(data.starred) ? data.starred.filter(Boolean) : [];
      setProcessedIds(processed);
      setStarredIds(starred);
    } catch {
      const local = readWorkflowStore();
      setProcessedIds(local.processed);
      setStarredIds(local.starred);
    }
  }, []);

  const persistWorkflow = async (row: StoredPostComment, patch: { processed?: boolean; starred?: boolean }) => {
    const commentId = row.comment_id || '';
    if (!commentId) return;
    try {
      const r = await api('/api/post-comments/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId, ...patch }),
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) {
        setProcessedIds(Array.isArray(data.processed) ? data.processed : []);
        setStarredIds(Array.isArray(data.starred) ? data.starred : []);
      }
    } catch {
      // localStorage fallback handled by useEffect
    }
  };

  const loadComments = useCallback(async () => {
    setBusy(true);
    setStatus('Đang tải inbox bình luận...');
    try {
      const params = new URLSearchParams({ limit: '5000' });
      if (sourceFilter === 'tiktok') params.set('source', 'tiktok');
      else if (sourceFilter === 'instagram') params.set('source', 'instagram');
      else if (sourceFilter === 'facebook') params.set('source', 'facebook');

      const r = await api(`/api/post-comments?${params.toString()}`);
      if (r.status === 401) {
        setStatus('❌ Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        setComments([]);
        return;
      }
      const data: CommentPayload = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (!r.ok || data.ok === false) {
        setStatus(`❌ ${data.error || `Không tải được bình luận (${r.status})`}`);
        return;
      }
      const rows = Array.isArray(data.comments) ? data.comments : [];
      setComments(rows);

      const tagMap: Record<string, string[]> = {};
      const processedFromRows: string[] = [];
      const starredFromRows: string[] = [];
      rows.forEach((row) => {
        const key = commentKey(row);
        if (Array.isArray(row.manual_tags) && row.manual_tags.length) {
          tagMap[key] = row.manual_tags;
        }
        const wid = workflowId(row);
        if (row.processed) processedFromRows.push(wid);
        if (row.starred) starredFromRows.push(wid);
      });
      setManualTagsByComment((current) => ({ ...current, ...tagMap }));
      setProcessedIds((current) => Array.from(new Set([...current, ...processedFromRows])));
      setStarredIds((current) => Array.from(new Set([...current, ...starredFromRows])));

      setSelectedId((current) => {
        if (current && rows.some((row) => commentKey(row) === current)) return current;
        return rows[0] ? commentKey(rows[0]) : '';
      });
      setStatus(data.warning ? `⚠️ ${data.warning}` : rows.length ? `✅ Đã tải ${rows.length} bình luận` : 'Chưa có bình luận. Hãy lấy CMT từ bài Facebook/TikTok trước.');
    } catch {
      setStatus('❌ Lỗi kết nối khi tải bình luận');
    } finally {
      setBusy(false);
    }
  }, [sourceFilter]);

  async function loadTemplateConfig() {
    try {
      const [templateRes, tagRes] = await Promise.all([
        api('/api/comment-templates'),
        api('/api/comment-tags'),
      ]);
      const templateData = await templateRes.json().catch(() => ({}));
      const tagData = await tagRes.json().catch(() => ({}));
      if (templateData.ok) setTemplates(templateRows(templateData.templates));
      if (tagData.ok) setTagOptions(tagRows(tagData.tags));
    } catch {
      // Giữ bộ mặc định nếu backend chưa sẵn sàng.
    }
  }

  const reloadInbox = useCallback(async () => {
    await loadWorkflow();
    await loadComments();
  }, [loadComments, loadWorkflow]);

  const loadMessenger = useCallback(async (conversationKey = selectedMessengerId, staffFilter = messengerStaffFilter) => {
    setMessengerBusy(true);
    setStatus('Đang tải lịch sử Messenger...');
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (conversationKey) params.set('conversation_key', conversationKey);
      if (staffFilter) params.set('staff_id', staffFilter);
      const r = await api(`/api/messenger/conversations?${params.toString()}`);
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (!r.ok || !data.ok) {
        setStatus(`❌ ${data.error || 'Không tải được Messenger'}`);
        return;
      }
      const conversations = Array.isArray(data.conversations) ? data.conversations as MessengerConversation[] : [];
      const messages = Array.isArray(data.messages) ? data.messages as MessengerMessage[] : [];
      const staff = Array.isArray(data.staff) ? data.staff as MessengerStaffOption[] : [];
      setMessengerConversations(conversations);
      setMessengerMessages(messages);
      setMessengerCanManage(Boolean(data.can_manage));
      setMessengerStaffOptions(staff);
      setSelectedMessengerId((current) => {
        if (conversationKey && conversations.some((item) => messengerConversationKey(item) === conversationKey)) return conversationKey;
        if (current && conversations.some((item) => messengerConversationKey(item) === current)) return current;
        return conversations[0] ? messengerConversationKey(conversations[0]) : '';
      });
      setStatus(data.warning ? `⚠️ ${data.warning}` : conversations.length ? `✅ Đã tải ${conversations.length} hội thoại Messenger` : 'Chưa có lịch sử Messenger. Mở một hội thoại rồi bấm đồng bộ.');
    } catch {
      setStatus('❌ Lỗi kết nối khi tải Messenger');
    } finally {
      setMessengerBusy(false);
    }
  }, [messengerStaffFilter, selectedMessengerId]);

  const loadZalo = useCallback(async (conversationKey = selectedZaloId, staffFilter = zaloStaffFilter) => {
    setZaloBusy(true);
    setStatus('Đang tải lịch sử Zalo...');
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (conversationKey) params.set('conversation_key', conversationKey);
      if (staffFilter) params.set('staff_id', staffFilter);
      const r = await api(`/api/zalo/conversations?${params.toString()}`);
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (!r.ok || !data.ok) {
        setStatus(`❌ ${data.error || 'Không tải được Zalo'}`);
        return -1;
      }
      const conversations = Array.isArray(data.conversations) ? data.conversations as MessengerConversation[] : [];
      const messages = Array.isArray(data.messages) ? data.messages as MessengerMessage[] : [];
      const staff = Array.isArray(data.staff) ? data.staff as MessengerStaffOption[] : [];
      setZaloConversations(conversations);
      setZaloMessages(messages);
      setZaloCanManage(Boolean(data.can_manage));
      setZaloStaffOptions(staff);
      setSelectedZaloId((current) => {
        if (conversationKey && conversations.some((item) => messengerConversationKey(item) === conversationKey)) return conversationKey;
        if (current && conversations.some((item) => messengerConversationKey(item) === current)) return current;
        return conversations[0] ? messengerConversationKey(conversations[0]) : '';
      });
      setStatus(data.warning ? `⚠️ ${data.warning}` : conversations.length ? `✅ Đã tải ${conversations.length} hội thoại Zalo` : 'Chưa có lịch sử Zalo. Mở một hội thoại Zalo Web rồi bấm đồng bộ.');
      return conversations.length;
    } catch {
      setStatus('❌ Lỗi kết nối khi tải Zalo');
      return -1;
    } finally {
      setZaloBusy(false);
    }
  }, [selectedZaloId, zaloStaffFilter]);

  useEffect(() => {
    void loadWorkflow();
    void loadTemplateConfig();
    void (async () => {
      try {
        const r = await api('/api/channels');
        const data = await r.json().catch(() => ({}));
        if (data.ok && Array.isArray(data.channels)) {
          setManagedChannels(data.channels);
        }
      } catch {
        /* giữ danh sách rỗng */
      }
    })();
  }, [loadWorkflow]);

  useEffect(() => {
    if (tab !== 'inbox') return;
    void loadComments();
  }, [sourceFilter, tab, loadComments]);

  useEffect(() => {
    if (tab === 'stats' && !comments.length && !busy) void reloadInbox();
  }, [tab, comments.length, busy, reloadInbox]);

  useEffect(() => {
    if (tab === 'messenger') void loadMessenger();
  }, [tab, loadMessenger]);

  useEffect(() => {
    if (tab === 'zalo') void loadZalo();
  }, [tab, loadZalo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      WORKFLOW_STORAGE_KEY,
      JSON.stringify({ processed: processedIds, starred: starredIds }),
    );
  }, [processedIds, starredIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MANUAL_TAG_STORAGE_KEY, JSON.stringify(manualTagsByComment));
  }, [manualTagsByComment]);

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

  const tagsForRow = useCallback((row: StoredPostComment) => {
    const key = commentKey(row);
    const manual = manualTagsByComment[key] || row.manual_tags || [];
    return commentTags(row, tagOptions, manual);
  }, [manualTagsByComment, tagOptions]);

  const filtered = useMemo(() => {
    const kw = normalizeText(query);
    return comments.filter((row) => {
      if (!matchesChannelFilter(row, sourceFilter)) return false;
      if (!matchesNamedChannelFilter(row, namedChannelFilter, managedChannels)) return false;
      if (workflowFilter === 'open' && isRowProcessed(row, processedSet)) return false;
      if (workflowFilter === 'done' && !isRowProcessed(row, processedSet)) return false;
      if (workflowFilter === 'starred' && !isRowStarred(row, starredSet)) return false;
      const tags = tagsForRow(row);
      if (tagFilter && !tags.some((tag) => tag.key === tagFilter)) return false;
      if (!kw) return true;
      return [row.author_name, row.message, row.post_id, row.post_title, row.channel_name, row.video_title, row.phone, ...(row.phones || [])]
        .filter(Boolean)
        .some((value) => normalizeText(String(value)).includes(kw));
    });
  }, [comments, query, sourceFilter, namedChannelFilter, managedChannels, tagFilter, workflowFilter, processedSet, starredSet, tagsForRow]);

  const selected = filtered.find((row) => commentKey(row) === selectedId) || filtered[0] || null;

  useEffect(() => {
    setReplyStatus('');
    setPhoneHint('');
    if (!selected) {
      setPhoneInput('');
      return;
    }
    setPhoneInput(phonesForComment(selected).join(', '));
  }, [selectedId, selected?.comment_id, selected?.phone, selected?.phones?.join('|')]);

  const patchCommentPhone = (commentId: string, patch: Pick<StoredPostComment, 'phone' | 'phones' | 'phones_auto' | 'phones_manual'>) => {
    if (!commentId) return;
    setComments((rows) => rows.map((row) => (
      String(row.comment_id || '') === commentId ? { ...row, ...patch } : row
    )));
  };

  const workflowCounts = useMemo(() => {
    let done = 0;
    let starred = 0;
    comments.forEach((row) => {
      if (isRowProcessed(row, processedSet)) done += 1;
      if (isRowStarred(row, starredSet)) starred += 1;
    });
    return { all: comments.length, done, open: Math.max(comments.length - done, 0), starred };
  }, [comments, processedSet, starredSet]);

  const channelCounts = useMemo(() => {
    const counts: Record<ChannelFilter, number> = { all: comments.length, facebook: 0, tiktok: 0, instagram: 0 };
    comments.forEach((row) => {
      if (namedChannelFilter && !matchesNamedChannelFilter(row, namedChannelFilter, managedChannels)) return;
      counts[channelFilterKey(row)] += 1;
    });
    return counts;
  }, [comments, namedChannelFilter, managedChannels]);

  const namedChannelOptions = useMemo(() => {
    const map = new Map<string, NamedChannelOption>();

    const upsert = (key: string, label: string, platform?: string) => {
      const cleanKey = key.trim();
      const cleanLabel = label.trim();
      if (!cleanKey) return;
      const existing = map.get(cleanKey);
      if (existing) {
        if (!existing.platform && platform) existing.platform = platform;
        return;
      }
      map.set(cleanKey, { key: cleanKey, label: cleanLabel || cleanKey, platform, count: 0 });
    };

    managedChannels.forEach((item) => {
      if (item.id) upsert(String(item.id), item.channel_name || item.target_id || String(item.id), item.platform);
      commentChannelKeys({ channel_name: item.channel_name, group_id: item.target_id } as StoredPostComment).forEach((key) => {
        upsert(key, item.channel_name || key, item.platform);
      });
    });

    comments.forEach((row) => {
      if (!matchesChannelFilter(row, sourceFilter)) return;
      commentChannelKeys(row).forEach((key) => {
        upsert(key, key, row.source);
      });
    });

    map.forEach((option) => {
      option.count = comments.filter((row) => {
        if (!matchesChannelFilter(row, sourceFilter)) return false;
        return matchesNamedChannelFilter(row, option.key, managedChannels) || commentChannelKeys(row).includes(option.key);
      }).length;
    });

    return [...map.values()]
      .filter((item) => item.count > 0 || managedChannels.some((ch) => ch.id === item.key || ch.channel_name === item.label))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
  }, [comments, managedChannels, sourceFilter]);

  const tagCounts = useMemo(() => {
    const counts: Record<TagKey, number> = {};
    tagOptions.forEach((tag) => { counts[tag.key] = 0; });
    comments.forEach((row) => {
      tagsForRow(row).forEach((tag) => {
        counts[tag.key] = (counts[tag.key] || 0) + 1;
      });
    });
    return counts;
  }, [comments, tagOptions, tagsForRow]);

  const customers = useMemo(() => filtered
    .map((row) => {
      const tags = tagsForRow(row);
      const phones = row.phones?.length ? row.phones : (row.phone ? [row.phone] : []);
      return { row, tags, phones };
    })
    .filter(Boolean) as { row: StoredPostComment; tags: TagMeta[]; phones: string[] }[], [filtered, tagsForRow]);

  const statsDashboard = useMemo(() => {
    const withPhone = customers.filter((item) => item.phones.length).length;
    const hotCount = comments.filter((row) => tagsForRow(row).some((tag) => tag.key === 'hot')).length;
    const processRate = comments.length ? Math.round((workflowCounts.done / comments.length) * 100) : 0;
    const leadRate = comments.length ? Math.round((customers.length / comments.length) * 100) : 0;

    const channelRows = CHANNEL_FILTERS
      .filter((channel) => channel.key !== 'all')
      .map((channel) => ({
        ...channel,
        count: channelCounts[channel.key],
        pct: comments.length ? Math.round((channelCounts[channel.key] / comments.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const tagRows = tagOptions
      .map((tag) => ({
        tag,
        count: tagCounts[tag.key] || 0,
        pct: comments.length ? Math.round(((tagCounts[tag.key] || 0) / comments.length) * 100) : 0,
        meta: tagMaterialIcon(tag.key),
      }))
      .sort((a, b) => b.count - a.count);

    const dailyMap: Record<string, number> = {};
    comments.forEach((row) => {
      const raw = row.created_time || row.fetched_at;
      if (!raw) return;
      try {
        const label = new Date(raw).toLocaleDateString('vi-VN');
        dailyMap[label] = (dailyMap[label] || 0) + 1;
      } catch {
        /* ignore */
      }
    });
    const parseViDate = (value: string) => {
      const [d, m, y] = value.split('/').map((part) => Number(part));
      return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
    };
    const dailyRows = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => parseViDate(b.date) - parseViDate(a.date))
      .slice(0, 7);
    const dailyMax = dailyRows.reduce((max, row) => Math.max(max, row.count), 1);

    const authorMap: Record<string, number> = {};
    comments.forEach((row) => {
      const name = row.author_name || 'Ẩn danh';
      authorMap[name] = (authorMap[name] || 0) + 1;
    });
    const topAuthors = Object.entries(authorMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const authorMax = topAuthors.reduce((max, row) => Math.max(max, row.count), 1);

    return {
      withPhone,
      hotCount,
      processRate,
      leadRate,
      channelRows,
      tagRows,
      dailyRows,
      dailyMax,
      topAuthors,
      authorMax,
      workflow: workflowCounts,
    };
  }, [comments, customers, channelCounts, tagCounts, tagOptions, workflowCounts, tagsForRow]);

  const syncLead = async (row?: StoredPostComment | null) => {
    const body = row?.post_id ? { source: row.source || '', post_id: row.post_id, include_without_phone: true } : { include_without_phone: true };
    setStatus('Đang đưa commenter tiềm năng vào bảng Lead (kể cả chưa có SĐT)...');
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

  const saveCommentPhone = async (row: StoredPostComment, phones: string[]) => {
    const commentId = String(row.comment_id || '').trim();
    if (!commentId) {
      setPhoneHint('Comment chưa có ID, không lưu được SĐT');
      return;
    }
    setPhoneBusy(true);
    setPhoneHint('Đang lưu SĐT...');
    try {
      const r = await api('/api/post-comments/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId, phones }),
      });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (!data.ok) {
        setPhoneHint(data.error || 'Không lưu được SĐT');
        return;
      }
      patchCommentPhone(commentId, {
        phone: data.phone || '',
        phones: data.phones || [],
        phones_auto: data.phones_auto || [],
        phones_manual: data.phones_manual || [],
      });
      setPhoneInput((data.phones || []).join(', '));
      setPhoneHint(phones.length ? '✅ Đã lưu SĐT' : '✅ Đã xoá SĐT');
    } catch {
      setPhoneHint('❌ Lỗi kết nối khi lưu SĐT');
    } finally {
      setPhoneBusy(false);
    }
  };

  const extractCommentPhone = async (row: StoredPostComment) => {
    const fromText = extractPhones(commentText(row));
    if (!fromText.length) {
      setPhoneHint('Không tìm thấy SĐT trong nội dung comment');
      return;
    }
    setPhoneInput(fromText.join(', '));
    await saveCommentPhone(row, fromText);
  };

  const slashMatch = replyText.match(/(^|\s)\/([^\s/]*)$/);
  const slashQuery = normalizeText(slashMatch?.[2] || '');
  const templateSuggestions = useMemo(() => {
    if (!slashMatch) return [];
    return templates
      .filter((item) => !slashQuery || normalizeText(item.trigger).includes(slashQuery) || normalizeText(item.title).includes(slashQuery))
      .slice(0, 8);
  }, [slashMatch, slashQuery, templates]);

  const insertTemplate = (template: ReplyTemplate) => {
    setReplyText((current) => {
      const match = current.match(/(^|\s)\/([^\s/]*)$/);
      if (!match || match.index === undefined) return template.text;
      const prefix = current.slice(0, match.index) + match[1];
      return `${prefix}${template.text}`.trimStart();
    });
    setReplyStatus(`Đã chèn /${template.trigger}`);
  };

  const copyTemplate = async (template: ReplyTemplate) => {
    try {
      await navigator.clipboard.writeText(template.text);
      setStatus(`✅ Đã sao chép mẫu /${template.trigger}`);
    } catch {
      setStatus('❌ Không sao chép được. Hãy thử lại.');
    }
  };

  const createTemplate = async () => {
    if (!templateForm.title.trim() || !templateForm.text.trim()) {
      setStatus('Nhập tên và nội dung mẫu câu trước');
      return;
    }
    try {
      const r = await api('/api/comment-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm),
      });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (data.ok) {
        setTemplates(templateRows(data.templates));
        setTemplateForm({ title: '', trigger: '', text: '' });
        setStatus('✅ Đã thêm mẫu câu mới');
      } else {
        setStatus(`❌ ${data.error || 'Không thêm được mẫu câu'}`);
      }
    } catch {
      setStatus('❌ Lỗi kết nối khi thêm mẫu câu');
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const r = await api(`/api/comment-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (data.ok) {
        setTemplates(templateRows(data.templates));
        setStatus('Đã xoá mẫu câu');
      } else {
        setStatus(`❌ ${data.error || 'Không xoá được mẫu câu'}`);
      }
    } catch {
      setStatus('❌ Lỗi kết nối khi xoá mẫu câu');
    }
  };

  const createTag = async () => {
    const label = newTagLabel.trim();
    if (!label) return;
    try {
      const r = await api('/api/comment-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, icon: '🏷️', color: 'blue' }),
      });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (data.ok) {
        setTagOptions(tagRows(data.tags));
        setNewTagLabel('');
        setStatus('✅ Đã thêm tag mới');
      } else {
        setStatus(`❌ ${data.error || 'Không thêm được tag'}`);
      }
    } catch {
      setStatus('❌ Lỗi kết nối khi thêm tag');
    }
  };

  const toggleManualTag = async (row: StoredPostComment, tagKey: string) => {
    const key = commentKey(row);
    const current = manualTagsByComment[key] || row.manual_tags || [];
    const next = current.includes(tagKey) ? current.filter((item) => item !== tagKey) : [...current, tagKey];
    setManualTagsByComment((state) => ({ ...state, [key]: next }));
    try {
      await api('/api/post-comments/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: row.comment_id, tags: next }),
      });
    } catch {
      // localStorage vẫn giữ tag để sale lọc trong phiên web hiện tại.
    }
    setStatus(next.includes(tagKey) ? '✅ Đã gắn tag cho comment' : 'Đã bỏ tag khỏi comment');
  };

  const markProcessed = useCallback((row: StoredPostComment) => {
    const key = commentKey(row);
    const wid = workflowId(row);
    setProcessedIds((current) => Array.from(new Set([...current, wid, key])));
    setComments((current) => current.map((item) => (commentKey(item) === key ? { ...item, processed: true } : item)));
    void persistWorkflow(row, { processed: true });
  }, []);

  const toggleWorkflow = (row: StoredPostComment, type: 'processed' | 'starred') => {
    const key = commentKey(row);
    const wid = workflowId(row);
    if (type === 'processed') {
      const next = !isRowProcessed(row, processedSet);
      setProcessedIds((current) => (next ? Array.from(new Set([...current, wid, key])) : current.filter((item) => item !== wid && item !== key)));
      setComments((current) => current.map((item) => (commentKey(item) === key ? { ...item, processed: next } : item)));
      void persistWorkflow(row, { processed: next });
      setStatus(next ? '✅ Đã đánh dấu comment đã xử lý' : 'Đã chuyển comment về trạng thái chưa xử lý');
      return;
    }
    const next = !isRowStarred(row, starredSet);
    setStarredIds((current) => (next ? Array.from(new Set([...current, wid, key])) : current.filter((item) => item !== wid && item !== key)));
    setComments((current) => current.map((item) => (commentKey(item) === key ? { ...item, starred: next } : item)));
    void persistWorkflow(row, { starred: next });
    if (next) {
      const tags = manualTagsByComment[key] || row.manual_tags || [];
      if (!tags.includes('vip')) void toggleManualTag(row, 'vip');
    }
    setStatus(next ? '⭐ Đã ghim/VIP comment để ưu tiên xử lý' : 'Đã bỏ ghim/VIP comment');
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

  function requestMessengerSync(payload: Record<string, unknown>): Promise<MessengerSyncResult> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve({ ok: false, error: 'Chỉ đồng bộ được Messenger trên Chrome có cài extension' });
        return;
      }

      const requestId = `messenger_sync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const timer = window.setTimeout(() => {
        cleanup();
        resolve({ ok: false, error: 'Không thấy extension phản hồi. Hãy cập nhật Lead Hunter Bridge rồi tải lại web.' });
      }, 90000);

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.source !== 'streal-tiktok-extension') return;
        if (data.type !== 'STREAL_MESSENGER_SYNC_RESPONSE') return;
        if (data.requestId !== requestId) return;
        cleanup();
        resolve(data as MessengerSyncResult);
      };

      function cleanup() {
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timer);
      }

      window.addEventListener('message', handleMessage);
      window.postMessage(
        {
          source: 'streal-web-page',
          type: 'STREAL_MESSENGER_SYNC_REQUEST',
          requestId,
          payload,
        },
        window.location.origin,
      );
    });
  }

  async function syncCurrentMessengerThread() {
    setMessengerBusy(true);
    setStatus('Đang tự cuộn và đọc hội thoại Messenger đang mở...');
    try {
      const result = await requestMessengerSync({ limit: 500, maxScrolls: 34, pauseMs: 560 });
      if (!result.ok) {
        const diagnostics = result.scan_rounds
          ? ` (đã quét ${result.extension_count ?? 0} tin qua ${result.scan_rounds} lượt)`
          : '';
        setStatus(`❌ ${result.error || result.warning || 'Không đồng bộ được Messenger'}${diagnostics}`);
        return;
      }
      const conversationId = result.conversation ? messengerConversationKey(result.conversation) : '';
      if (conversationId) setSelectedMessengerId(conversationId);
      setMessengerMessages(Array.isArray(result.messages) ? result.messages : []);
      await loadMessenger(conversationId);
      const note = result.extension_warning ? ` (${result.extension_warning})` : '';
      setStatus(`✅ Đã đồng bộ ${result.count || 0} tin nhắn Messenger${note}`);
    } catch {
      setStatus('❌ Lỗi khi gọi extension đồng bộ Messenger');
    } finally {
      setMessengerBusy(false);
    }
  }

  function requestZaloSync(payload: Record<string, unknown>): Promise<MessengerSyncResult> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve({ ok: false, error: 'Chỉ đồng bộ được Zalo Web trên Chrome có cài extension' });
        return;
      }

      const requestId = `zalo_sync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const timer = window.setTimeout(() => {
        cleanup();
        resolve({ ok: false, error: 'Không thấy extension phản hồi. Hãy cập nhật Lead Hunter Bridge rồi tải lại web.' });
      }, 90000);

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.source !== 'streal-tiktok-extension') return;
        if (data.type !== 'STREAL_ZALO_SYNC_RESPONSE') return;
        if (data.requestId !== requestId) return;
        cleanup();
        resolve(data as MessengerSyncResult);
      };

      function cleanup() {
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timer);
      }

      window.addEventListener('message', handleMessage);
      window.postMessage(
        {
          source: 'streal-web-page',
          type: 'STREAL_ZALO_SYNC_REQUEST',
          requestId,
          payload,
        },
        window.location.origin,
      );
    });
  }

  async function syncCurrentZaloThread() {
    setZaloBusy(true);
    setStatus('Đang đọc hội thoại Zalo Web đang mở bằng extension...');
    try {
      const result = await requestZaloSync({ limit: 500, maxScrolls: 34, pauseMs: 600 });
      if (!result.ok) {
        const diagnostics = result.scan_rounds
          ? ` (đã quét ${result.extension_count ?? 0} tin qua ${result.scan_rounds} lượt)`
          : '';
        setStatus(`❌ ${result.error || result.warning || 'Không đồng bộ được Zalo'}${diagnostics}`);
        return;
      }
      const conversationId = result.conversation ? messengerConversationKey(result.conversation) : '';
      if (conversationId) setSelectedZaloId(conversationId);
      if (Array.isArray(result.messages) && result.messages.length) {
        setZaloMessages((current) => {
          const byKey = new Map<string, MessengerMessage>();
          [...current, ...result.messages!].forEach((item, index) => {
            const key = item.message_key || `${item.direction || ''}|${item.text || ''}|${item.display_time || ''}|${index}`;
            byKey.set(key, { ...byKey.get(key), ...item });
          });
          return [...byKey.values()];
        });
      }
      const loadedCount = await loadZalo(conversationId);
      const scannedCount = result.extension_count ?? result.count ?? 0;
      if (loadedCount < 1) {
        const detail = result.error || result.warning || 'API chưa trả lại hội thoại vừa lưu';
        setStatus(`❌ Extension đã đọc ${scannedCount} tin nhưng chưa tải lại được hội thoại: ${detail}`);
        return;
      }
      const details = [
        result.media_upload_count ? `đã lưu ${result.media_upload_count} ảnh` : '',
        result.warning || '',
        result.extension_warning || '',
      ].filter(Boolean).join(' | ');
      setStatus(`✅ Đã đồng bộ ${result.count || 0} tin nhắn Zalo${details ? ` (${details})` : ''}`);
    } catch {
      setStatus('❌ Lỗi khi gọi extension đồng bộ Zalo');
    } finally {
      setZaloBusy(false);
    }
  }

  async function deleteSelectedMessengerConversation() {
    const conversationKey = selectedMessengerId || (selectedMessenger ? messengerConversationKey(selectedMessenger) : '');
    if (!conversationKey) {
      setStatus('❌ Chưa chọn hội thoại Messenger để xoá.');
      return;
    }
    const label = safeConversationTitle(selectedMessenger?.customer_name || selectedMessenger?.title, conversationKey);
    if (typeof window !== 'undefined' && !window.confirm(`Xoá hội thoại Messenger "${label}" khỏi hệ thống? Tin nhắn đã lưu cũng sẽ bị xoá. Thao tác này không xoá tin thật trên Messenger.`)) {
      return;
    }

    setMessengerBusy(true);
    setStatus('Đang xoá hội thoại Messenger...');
    try {
      const r = await api(`/api/messenger/conversations/${encodeURIComponent(conversationKey)}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (!r.ok || !data.ok) {
        setStatus(`❌ ${data.error || 'Không xoá được hội thoại Messenger'}`);
        return;
      }
      const remaining = messengerConversations.filter((item) => messengerConversationKey(item) !== conversationKey);
      const nextId = remaining[0] ? messengerConversationKey(remaining[0]) : '';
      setMessengerConversations(remaining);
      setMessengerMessages([]);
      setSelectedMessengerId(nextId);
      await loadMessenger(nextId, messengerStaffFilter);
      setStatus(data.warning ? `⚠️ Đã xoá hội thoại Messenger, nhưng có cảnh báo: ${data.warning}` : '✅ Đã xoá hội thoại Messenger khỏi hệ thống.');
    } catch {
      setStatus('❌ Lỗi kết nối khi xoá hội thoại Messenger');
    } finally {
      setMessengerBusy(false);
    }
  }

  async function deleteSelectedZaloConversation() {
    const conversationKey = selectedZaloId || (selectedZalo ? messengerConversationKey(selectedZalo) : '');
    if (!conversationKey) {
      setStatus('❌ Chưa chọn hội thoại Zalo để xoá.');
      return;
    }
    const label = safeConversationTitle(selectedZalo?.customer_name || selectedZalo?.title, conversationKey);
    if (typeof window !== 'undefined' && !window.confirm(`Xoá hội thoại Zalo "${label}" khỏi hệ thống? Tin nhắn đã lưu cũng sẽ bị xoá.`)) {
      return;
    }

    setZaloBusy(true);
    setStatus('Đang xoá hội thoại Zalo...');
    try {
      const r = await api(`/api/zalo/conversations/${encodeURIComponent(conversationKey)}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
      if (!r.ok || !data.ok) {
        setStatus(`❌ ${data.error || 'Không xoá được hội thoại Zalo'}`);
        return;
      }
      const remaining = zaloConversations.filter((item) => messengerConversationKey(item) !== conversationKey);
      const nextId = remaining[0] ? messengerConversationKey(remaining[0]) : '';
      setZaloConversations(remaining);
      setZaloMessages([]);
      setSelectedZaloId(nextId);
      await loadZalo(nextId, zaloStaffFilter);
      setStatus(data.warning ? `⚠️ Đã xoá hội thoại Zalo, nhưng có cảnh báo: ${data.warning}` : '✅ Đã xoá hội thoại Zalo khỏi hệ thống.');
    } catch {
      setStatus('❌ Lỗi kết nối khi xoá hội thoại Zalo');
    } finally {
      setZaloBusy(false);
    }
  }

  function requestTiktokOpenComment(payload: Record<string, unknown>): Promise<TikTokOpenCommentResult> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve({ ok: false, error: 'Chỉ mở được comment TikTok trên Chrome có cài extension' });
        return;
      }

      const requestId = `comment_inbox_tiktok_open_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const timer = window.setTimeout(() => {
        cleanup();
        resolve({
          ok: false,
          error: 'Không thấy extension phản hồi khi mở comment. Hãy cập nhật Lead Hunter Bridge rồi tải lại trang.',
        });
      }, 120000);

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.source !== 'streal-tiktok-extension') return;
        if (data.type !== 'STREAL_TIKTOK_OPEN_COMMENT_RESPONSE') return;
        if (data.requestId !== requestId) return;
        cleanup();
        resolve(data as TikTokOpenCommentResult);
      };

      function cleanup() {
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timer);
      }

      window.addEventListener('message', handleMessage);
      window.postMessage(
        {
          source: 'streal-web-page',
          type: 'STREAL_TIKTOK_OPEN_COMMENT_REQUEST',
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
        customer_name: row.author_name || '',
        customer_need: row.message || '',
        error: result.error,
        extension_result: result,
      }),
    });
    return r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
  }

  async function requestTiktokPlaywrightComment(row: StoredPostComment, message: string): Promise<TikTokBridgeResult> {
    try {
      const r = await api('/api/tiktok/comment/playwright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: row.post_id || '',
          post_url: row.post_url || row.comment_url || '',
          comment_url: row.comment_url || '',
          comment_id: row.comment_id || '',
          comment_text: row.message || '',
          author_name: row.author_name || '',
          channel_name: row.channel_name || '',
          video_title: row.video_title || '',
          message,
        }),
      });
      return r.json().catch(() => ({ ok: false, error: `Server lỗi ${r.status}` }));
    } catch {
      return { ok: false, error: 'Không kết nối được Playwright backend' };
    }
  }

  async function prepareManualTikTokReply(row: StoredPostComment, message: string, fallbackReason = '') {
    const targetUrl = row.comment_url || row.post_url || '';
    if (!targetUrl) {
      setReplyStatus('Comment TikTok này chưa có link video để mở.');
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    let openResult: TikTokOpenCommentResult = { ok: false, url: targetUrl };
    if (tiktokBridgeReady) {
      openResult = await requestTiktokOpenComment({
        post_url: row.post_url || targetUrl,
        comment_url: row.comment_url || '',
        post_id: row.post_id || '',
        comment_id: row.comment_id || '',
        comment_text: row.message || '',
        author_name: row.author_name || '',
        channel_name: row.channel_name || '',
        video_title: row.video_title || '',
        reply_text: message,
      });
      if (!openResult.ok) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
    const result: TikTokBridgeResult = {
      ok: true,
      manual: true,
      method: openResult.ok ? 'manual-copy-open-context' : 'manual-copy-open',
      url: openResult.url || targetUrl,
      comment_id: `manual_${row.comment_id || Date.now()}`,
    };
    await recordTiktokExtensionResult(row, 'success', message, result).catch(() => null);
    markProcessed(row);
    const prefix = fallbackReason ? `TikTok chưa nhận gửi trực tiếp (${fallbackReason}). ` : '';
    if (openResult.ok && openResult.target_found) {
      const scrollNote = openResult.scrolled ? ` (cuộn ${openResult.scrolled} lần)` : '';
      setReplyStatus(`✅ ${prefix}Đã copy câu trả lời, tìm thấy comment${scrollNote}, tô xanh và ghim bảng xử lý. Dán Ctrl+V rồi gửi.`);
    } else if (openResult.ok) {
      setReplyStatus(`✅ ${prefix}Đã mở video và cuộn tìm comment. Nếu chưa thấy, bấm "Tự cuộn tìm" trên bảng TikTok hoặc Ctrl+F.`);
    } else {
      setReplyStatus(`✅ ${prefix}Đã copy câu trả lời và mở video TikTok. Nếu chưa thấy comment, dùng Ctrl+F tìm: "${(row.message || '').slice(0, 80)}"${openResult.error ? ` · ${openResult.error}` : ''}`);
    }
  }

  async function openCommentLink(row: StoredPostComment) {
    const targetUrl = row.comment_url || row.post_url || '';
    if (!targetUrl) return;
    if (sourceKey(row) !== 'tiktok') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      setReplyStatus('Đã mở link bình luận/bài viết.');
      return;
    }

    if (!tiktokBridgeReady) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      setReplyStatus('Chưa thấy extension, đã mở link TikTok thường.');
      return;
    }

    setReplyStatus('Đang mở TikTok và định vị comment...');
    const openResult = await requestTiktokOpenComment({
      post_url: row.post_url || targetUrl,
      comment_url: row.comment_url || '',
      post_id: row.post_id || '',
      comment_id: row.comment_id || '',
      comment_text: row.message || '',
      author_name: row.author_name || '',
      channel_name: row.channel_name || '',
      video_title: row.video_title || '',
    });
    if (openResult.ok && openResult.target_found) {
      setReplyStatus('✅ Đã mở TikTok và tô xanh comment đang hiển thị.');
      return;
    }
    if (openResult.ok) {
      setReplyStatus('✅ Đã mở TikTok kèm bảng comment cần xử lý. Nếu chưa thấy comment, dùng nội dung trên bảng để dò.');
      return;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    setReplyStatus(`${openResult.error || 'Extension chưa định vị được comment'}, đã mở link TikTok thường.`);
  }

  async function openDirectMessage(row: StoredPostComment) {
    const src = sourceKey(row);
    if (src === 'tiktok') {
      const url = buildTikTokCommentUrl(row);
      if (!url) {
        setReplyStatus('Comment TikTok này chưa có link video/comment để mở.');
        return;
      }
      if (tiktokBridgeReady) {
        setReplyStatus('Đang mở đúng video và định vị comment trên TikTok...');
        const openResult = await requestTiktokOpenComment({
          post_url: row.post_url || url,
          comment_url: url,
          post_id: row.post_id || '',
          comment_id: row.comment_id || '',
          comment_text: row.message || '',
          author_name: row.author_name || '',
          channel_name: row.channel_name || '',
          video_title: row.video_title || '',
          reply_text: selected?.comment_id === row.comment_id ? replyText.trim() : '',
        });
        if (openResult.ok) {
          setReplyStatus(
            openResult.target_found
              ? openResult.typed
                ? `✅ Đã tìm comment, tô xanh và gõ vào ô bình luận${openResult.scrolled ? ` (${openResult.scrolled} lần cuộn)` : ''}. Bấm gửi trên TikTok.`
                : `✅ Đã mở TikTok và tô xanh comment${openResult.scrolled ? ` sau ${openResult.scrolled} lần cuộn` : ''}. Gõ nội dung vào ô bình luận hoặc dùng nút Gõ vào ô comment.`
              : openResult.typed
                ? '✅ Đã gõ câu trả lời vào ô Thêm bình luận trên TikTok. Kiểm tra rồi bấm gửi.'
                : '✅ Đã mở video và cuộn tìm comment. Bấm "Tự cuộn tìm" hoặc "Gõ vào ô comment" trên bảng TikTok.',
          );
          return;
        }
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      setReplyStatus('Đã mở link comment TikTok. Cài extension Chrome để tự định vị comment trên video.');
      return;
    }

    const url = row.comment_url || row.post_url || '';
    if (src === 'fb-page' || src === 'fb-group') {
      const target = url || 'https://www.facebook.com/messages';
      window.open(target, '_blank', 'noopener,noreferrer');
      setReplyStatus('Đã mở Facebook theo comment/bài viết để nhắn khách thủ công nếu cần.');
      return;
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function sendDirectTikTokReply(row: StoredPostComment, message: string) {
    if (!tiktokBridgeReady) {
      return { ok: false, error: 'Chưa thấy extension Lead Hunter Bridge' } as TikTokBridgeResult;
    }

    const result = await requestTiktokExtensionComment({
      post_url: row.post_url || row.comment_url || '',
      comment_url: row.comment_url || '',
      post_id: row.post_id || '',
      comment_id: row.comment_id || '',
      comment_text: row.message || '',
      author_name: row.author_name || '',
      channel_name: row.channel_name || '',
      video_title: row.video_title || '',
      message,
    });
    return result;
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
    setReplyStatus(src === 'tiktok' ? 'Đang thử gửi TikTok bằng Playwright backend...' : 'Đang gửi trả lời...');
    try {
      if (src === 'tiktok') {
        const playwrightResult = await requestTiktokPlaywrightComment(selected, message);
        if (playwrightResult.ok) {
          markProcessed(selected);
          setReplyText('');
          setReplyStatus(`✅ Đã gửi comment TikTok bằng Playwright browser${playwrightResult.warning ? ` · ${playwrightResult.warning}` : ''}`);
          await loadComments();
          return;
        }

        setReplyStatus(`Playwright chưa gửi được (${playwrightResult.error || 'không rõ lỗi'}). Đang thử Chrome extension...`);
        const directResult = await sendDirectTikTokReply(selected, message);
        if (directResult.ok) {
          await recordTiktokExtensionResult(selected, 'success', message, directResult).catch(() => null);
          markProcessed(selected);
          setReplyText('');
          setReplyStatus('✅ Đã gửi comment TikTok trực tiếp từ UI qua Chrome extension và lưu lịch sử.');
          await loadComments();
          return;
        }

        await recordTiktokExtensionResult(selected, 'failed', message, directResult).catch(() => null);
        await prepareManualTikTokReply(selected, message, directResult.error || 'TikTok chặn phiên gửi tự động');
        setReplyText('');
        await loadComments();
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
          customer_name: selected.author_name || '',
          customer_need: selected.message || '',
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
    const rows = [['Tên', 'Kênh', 'ID bài viết', 'Tiêu đề bài viết', 'SĐT', 'Nội dung', 'Link']];
    customers.forEach(({ row, phones }) => {
      rows.push([
        row.author_name || 'Ẩn danh',
        sourceLabel(row).label,
        row.post_id || '',
        postTitle(row) === '-' ? '' : postTitle(row),
        phones.join(', '),
        row.message || '',
        row.comment_url || row.post_url || '',
      ]);
    });
    const csv = rows.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `comment_leads_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`;
    link.click();
    setStatus('✅ Đã xuất danh sách lead comment');
  };

  const selectedMeta = selected ? sourceLabel(selected) : null;
  const selectedSrc = selected ? sourceKey(selected) : null;
  const selectedMessenger = messengerConversations.find((item) => messengerConversationKey(item) === selectedMessengerId) || null;
  const visibleMessengerMessages = messengerMessages.filter((message) => !isMessengerSystemText(message.text, selectedMessenger));
  const selectedZalo = zaloConversations.find((item) => messengerConversationKey(item) === selectedZaloId) || null;
  const visibleZaloMessages = zaloMessages.filter((message) => !isMessengerSystemText(message.text, selectedZalo));

  return (
    <section className="omni-inbox module-panel">
      <header className="omni-topbar">
        <div className="omni-topbar-left">
          <span className="omni-brand">OmniInbox</span>
          <nav className="omni-nav">
            <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>Inbox</button>
            <button type="button" className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}>Khách hàng</button>
            <button type="button" className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>Thống kê</button>
            <button type="button" className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>Mẫu câu</button>
            <button type="button" className={tab === 'messenger' ? 'active' : ''} onClick={() => setTab('messenger')}>Messenger</button>
            <button type="button" className={tab === 'zalo' ? 'active' : ''} onClick={() => setTab('zalo')}>Zalo</button>
          </nav>
        </div>
        <div className="omni-topbar-right">
          {tab === 'messenger' ? (
            <>
              {messengerCanManage ? (
                <select
                  className="omni-channel-select"
                  value={messengerStaffFilter}
                  onChange={(e) => {
                    const nextStaff = e.target.value;
                    setMessengerStaffFilter(nextStaff);
                    setSelectedMessengerId('');
                    void loadMessenger('', nextStaff);
                  }}
                  aria-label="Lọc hội thoại Messenger theo nhân viên"
                >
                  <option value="">Tất cả nhân viên</option>
                  {messengerStaffOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.username || item.id}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className="omni-btn-ghost" onClick={() => window.open('https://www.messenger.com/', '_blank', 'noopener,noreferrer')}>
                Mở Messenger
              </button>
              <button type="button" className="omni-btn-ghost" onClick={() => void loadMessenger()} disabled={messengerBusy}>
                {messengerBusy ? 'Đang tải...' : 'Tải lại'}
              </button>
              <button type="button" className="omni-btn-primary" onClick={() => void syncCurrentMessengerThread()} disabled={messengerBusy}>
                Đồng bộ hội thoại đang mở
              </button>
            </>
          ) : tab === 'zalo' ? (
            <>
              {zaloCanManage ? (
                <select
                  className="omni-channel-select"
                  value={zaloStaffFilter}
                  onChange={(e) => {
                    const nextStaff = e.target.value;
                    setZaloStaffFilter(nextStaff);
                    setSelectedZaloId('');
                    void loadZalo('', nextStaff);
                  }}
                  aria-label="Lọc hội thoại Zalo theo nhân viên"
                >
                  <option value="">Tất cả nhân viên</option>
                  {zaloStaffOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.username || item.id}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className="omni-btn-ghost" onClick={() => window.open('https://chat.zalo.me/', '_blank', 'noopener,noreferrer')}>
                Mở Zalo Web
              </button>
              <button type="button" className="omni-btn-ghost" onClick={() => void loadZalo()} disabled={zaloBusy}>
                {zaloBusy ? 'Đang tải...' : 'Tải lại'}
              </button>
              <button type="button" className="omni-btn-primary" onClick={() => void syncCurrentZaloThread()} disabled={zaloBusy}>
                Đồng bộ hội thoại Zalo đang mở
              </button>
            </>
          ) : (
            <>
              <select
                className="omni-channel-select"
                value={namedChannelFilter}
                onChange={(e) => setNamedChannelFilter(e.target.value)}
                aria-label="Lọc theo kênh"
              >
                <option value="">Tất cả kênh ({comments.length})</option>
                {namedChannelOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </select>
              <div className="omni-search">
                <MaterialIcon name="search" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm lead, SĐT, nội dung..." type="text" />
              </div>
              <button type="button" className="omni-btn-ghost" onClick={() => void reloadInbox()} disabled={busy}>
                {busy ? 'Đang tải...' : 'Tải lại'}
              </button>
              <button type="button" className="omni-btn-primary" onClick={() => void syncLead(selected)}>Tách lead</button>
            </>
          )}
        </div>
      </header>

      {tab === 'inbox' ? (
        <div className="omni-body">
          <aside className="omni-sidebar">
            <div className="omni-sidebar-head">
              <p>OmniChannel</p>
              <p>Bộ lọc đang dùng</p>
            </div>
            <div className="omni-sidebar-scroll">
              <p className="omni-section-label">Nền tảng</p>
              {CHANNEL_FILTERS.map((channel) => (
                <button
                  key={channel.key}
                  type="button"
                  className={`omni-filter-btn ${sourceFilter === channel.key ? 'active' : ''}`}
                  onClick={() => {
                    setSourceFilter(channel.key);
                    if (namedChannelFilter) {
                      const selected = namedChannelOptions.find((item) => item.key === namedChannelFilter);
                      const platform = selected ? platformForNamedChannel(selected) : 'all';
                      if (channel.key !== 'all' && platform !== 'all' && platform !== channel.key) {
                        setNamedChannelFilter('');
                      }
                    }
                  }}
                >
                  <MaterialIcon name={channel.materialIcon} />
                  <span>{channel.label}</span>
                  <b>{channelCounts[channel.key]}</b>
                </button>
              ))}

              <p className="omni-section-label" style={{ marginTop: 24 }}>Kênh theo dõi</p>
              <button
                type="button"
                className={`omni-filter-btn ${!namedChannelFilter ? 'active' : ''}`}
                onClick={() => setNamedChannelFilter('')}
              >
                <MaterialIcon name="hub" />
                <span>Tất cả kênh</span>
                <b>{sourceFilter === 'all' ? comments.length : channelCounts[sourceFilter]}</b>
              </button>
              {namedChannelOptions.length ? namedChannelOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`omni-filter-btn omni-filter-btn-channel ${namedChannelFilter === item.key ? 'active' : ''}`}
                  onClick={() => setNamedChannelFilter((current) => (current === item.key ? '' : item.key))}
                  title={item.label}
                >
                  <MaterialIcon name={platformForNamedChannel(item) === 'tiktok' ? 'movie' : 'groups'} />
                  <span>{item.label}</span>
                  <b>{item.count}</b>
                </button>
              )) : (
                <p className="omni-filter-empty">Chưa có kênh. Thêm tại Quản lý nhóm.</p>
              )}

              <p className="omni-section-label" style={{ marginTop: 24 }}>Tags</p>
              {tagOptions.map((tag) => {
                const meta = tagMaterialIcon(tag.key);
                return (
                  <button
                    key={tag.key}
                    type="button"
                    className={`omni-filter-btn ${tagFilter === tag.key ? 'active' : ''}`}
                    onClick={() => setTagFilter((current) => (current === tag.key ? '' : tag.key))}
                  >
                    <MaterialIcon name={meta.icon} filled={meta.filled} style={{ color: meta.color, fontSize: 16 }} />
                    <span>{tag.label}</span>
                    <b>{tagCounts[tag.key] || 0}</b>
                  </button>
                );
              })}
            </div>
            <div className="omni-sidebar-foot">
              <div className="omni-add-filter">
                <MaterialIcon name="add_circle" style={{ fontSize: 16 }} />
                <input value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)} placeholder="Thêm tag mới" onKeyDown={(e) => { if (e.key === 'Enter') void createTag(); }} />
                <button type="button" onClick={() => void createTag()} aria-label="Thêm tag">+</button>
              </div>
              <div className="omni-workflow-icons">
                <button type="button" className={workflowFilter === 'open' ? 'active' : ''} title="Chưa xử lý" onClick={() => setWorkflowFilter((c) => (c === 'open' ? 'all' : 'open'))}>
                  <MaterialIcon name="pending_actions" />
                </button>
                <button type="button" className={workflowFilter === 'starred' ? 'active' : ''} title="VIP" onClick={() => setWorkflowFilter((c) => (c === 'starred' ? 'all' : 'starred'))}>
                  <MaterialIcon name="stars" />
                </button>
                <button type="button" className={workflowFilter === 'done' ? 'active' : ''} title="Đã xử lý" onClick={() => setWorkflowFilter((c) => (c === 'done' ? 'all' : 'done'))}>
                  <MaterialIcon name="done_all" />
                </button>
              </div>
            </div>
          </aside>

          <div className="omni-main">
            <section className="omni-stream">
              <div className="omni-stream-head">
                <div className="omni-stream-head-top">
                  <h2>Inbox Stream</h2>
                  <span className="omni-unread-badge">{workflowCounts.open} chưa xử lý</span>
                </div>
                <div className="omni-pills">
                  <button type="button" className={!tagFilter && workflowFilter === 'all' ? 'active' : ''} onClick={() => { setTagFilter(''); setWorkflowFilter('all'); }}>Tất cả</button>
                  <button type="button" className={workflowFilter === 'open' ? 'active' : ''} onClick={() => setWorkflowFilter((c) => (c === 'open' ? 'all' : 'open'))}>Chưa xử lý</button>
                  <button type="button" className={workflowFilter === 'starred' ? 'active' : ''} onClick={() => setWorkflowFilter((c) => (c === 'starred' ? 'all' : 'starred'))}>VIP</button>
                </div>
              </div>
              <div className="omni-stream-list">
                {filtered.length ? filtered.map((row) => {
                  const meta = sourceLabel(row);
                  const tags = tagsForRow(row);
                  const key = commentKey(row);
                  const isProcessed = isRowProcessed(row, processedSet);
                  const isStarred = isRowStarred(row, starredSet);
                  const hotTag = tags.find((t) => t.key === 'hot');
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`omni-stream-item ${selected && commentKey(selected) === key ? 'active' : ''}`}
                      onClick={() => setSelectedId(key)}
                    >
                      <div className="omni-stream-item-top">
                        <CommentAuthorLink row={row} className="omni-author-link" />
                        <small>{commentTimeShort(row)}</small>
                      </div>
                      <span className={`omni-channel-chip ${meta.chipClass}`}>
                        <MaterialIcon name={meta.materialIcon} style={{ fontSize: 10 }} />
                        {meta.label}
                      </span>
                      <div className="omni-stream-post">
                        <span className="mono" title={row.post_id || ''}>{row.post_id || '-'}</span>
                        <span className="omni-stream-post-title" title={postTitle(row)}>{postTitle(row)}</span>
                      </div>
                      <p>{commentText(row) || '(Không có nội dung)'}</p>
                      {phonesForComment(row).length ? (
                        <div className="omni-stream-phone">
                          <MaterialIcon name="call" style={{ fontSize: 12 }} />
                          {phonesForComment(row).join(', ')}
                        </div>
                      ) : null}
                      <div className="omni-stream-item-foot">
                        {isStarred ? (
                          <span className="omni-status-chip vip">VIP</span>
                        ) : hotTag ? (
                          <span className="omni-status-chip hot">{hotTag.label}</span>
                        ) : (
                          <span className={`omni-status-chip ${isProcessed ? 'done' : 'open'}`}>{isProcessed ? 'Đã xử lý' : 'Chưa xử lý'}</span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          className="omni-dm-link"
                          onClick={(event) => { event.stopPropagation(); void openDirectMessage(row); }}
                          onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void openDirectMessage(row); } }}
                        >
                          <MaterialIcon name="chat_bubble" style={{ fontSize: 14 }} />
                          Nhắn tin
                        </span>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="omni-empty">Chưa có bình luận phù hợp bộ lọc.</div>
                )}
              </div>
            </section>

            <section className="omni-thread">
              {selected && selectedMeta ? (
                <>
                  <header className="omni-thread-head">
                    <div className="omni-thread-user">
                      <div className="omni-avatar">{authorInitials(selected.author_name)}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                          <CommentAuthorHeading row={selected} />
                          <span className="omni-thread-channel">
                            <MaterialIcon name={selectedMeta.materialIcon} style={{ fontSize: 12 }} />
                            {selectedMeta.label}
                          </span>
                        </div>
                        <p>{channelName(selected)}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="omni-btn-ghost" style={{ padding: 8, borderRadius: 999 }} onClick={() => void loadComments()} title="Tải lại">
                        <MaterialIcon name="history" />
                      </button>
                    </div>
                  </header>

                  <div className="omni-thread-scroll">
                    <div className="omni-message-card">
                      <p className="omni-message-text">{selected.message || '(Không có nội dung)'}</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                        <span className={`omni-status-chip ${isRowProcessed(selected, processedSet) ? 'done' : 'open'}`}>
                          {isRowProcessed(selected, processedSet) ? 'ĐÃ XỬ LÝ' : 'CHƯA XỬ LÝ'}
                        </span>
                        {isRowStarred(selected, starredSet) ? <span className="omni-status-chip vip">VIP</span> : null}
                      </div>

                      <div className="omni-tag-row">
                        {tagOptions.map((tag) => {
                          const meta = tagMaterialIcon(tag.key);
                          const active = (manualTagsByComment[commentKey(selected)] || selected.manual_tags || []).includes(tag.key);
                          return (
                            <button
                              key={tag.key}
                              type="button"
                              className={`omni-tag-pill ${active ? 'active' : ''}`}
                              onClick={() => void toggleManualTag(selected, tag.key)}
                            >
                              <MaterialIcon name={meta.icon} filled={meta.filled} style={{ fontSize: 14, color: meta.color }} />
                              {tag.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="omni-meta-grid">
                        <div><span>ID bài viết</span><b className="mono">{selected.post_id || '-'}</b></div>
                        <div className="omni-meta-wide"><span>Tiêu đề bài viết</span><b title={postTitle(selected)}>{postTitle(selected)}</b></div>
                        <div><span>Comment ID</span><b className="mono">{selected.comment_id || '-'}</b></div>
                        <div><span>Thời gian</span><b>{commentTime(selected)}</b></div>
                      </div>

                      <div className="omni-phone-panel">
                        <label htmlFor="omni-phone-input">SĐT</label>
                        <div className="omni-phone-input-row">
                          <input
                            id="omni-phone-input"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="Nhập SĐT hoặc lấy từ nội dung CMT..."
                            disabled={phoneBusy}
                          />
                          <button
                            type="button"
                            className="omni-btn-ghost"
                            disabled={phoneBusy}
                            onClick={() => void extractCommentPhone(selected)}
                          >
                            Lấy từ CMT
                          </button>
                          <button
                            type="button"
                            className="omni-btn-primary"
                            disabled={phoneBusy}
                            onClick={() => {
                              const phones = phoneInput
                                .split(/[,;\n|/]+/)
                                .map((item) => item.trim())
                                .filter(Boolean);
                              void saveCommentPhone(selected, phones);
                            }}
                          >
                            {phoneBusy ? 'Đang lưu...' : 'Lưu SĐT'}
                          </button>
                        </div>
                        {selected.phones_auto?.length ? (
                          <p className="omni-phone-note">
                            Trong nội dung: {selected.phones_auto.join(', ')}
                            {selected.phones_manual?.length ? ' · Đã chỉnh tay' : ''}
                          </p>
                        ) : null}
                        {phoneHint ? <p className="omni-phone-hint">{phoneHint}</p> : null}
                      </div>

                      <div className="omni-action-row">
                        {(selected.comment_url || selected.post_url) ? (
                          <button type="button" className="omni-btn-ghost" onClick={() => void openCommentLink(selected)}>Mở link</button>
                        ) : (
                          <button type="button" className="omni-btn-ghost" disabled>Mở link</button>
                        )}
                        <button type="button" className="omni-btn-primary" onClick={() => void syncLead(selected)}>Đưa vào Lead</button>
                        <button type="button" className="omni-btn-ghost" onClick={() => toggleWorkflow(selected, 'processed')}>
                          {isRowProcessed(selected, processedSet) ? 'Bỏ xử lý' : 'Đã xử lý'}
                        </button>
                        <button type="button" className="omni-btn-ghost" onClick={() => toggleWorkflow(selected, 'starred')}>
                          <MaterialIcon name="stars" filled style={{ fontSize: 16, color: '#9333ea' }} />
                          {isRowStarred(selected, starredSet) ? 'Bỏ VIP' : 'Ghim VIP'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <footer className="omni-composer">
                    <div className="omni-composer-inner">
                      <div className="omni-quick-replies">
                        <label>Trả lời nhanh</label>
                        {templates.slice(0, 6).map((item) => (
                          <button key={item.id} type="button" onClick={() => insertTemplate(item)}>/{item.trigger || item.title}</button>
                        ))}
                      </div>
                      <div className="omni-textarea-wrap">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Nhập tin nhắn hoặc gõ / để chèn mẫu câu..."
                        />
                        {templateSuggestions.length ? (
                          <div className="omni-slash-menu">
                            {templateSuggestions.map((item) => (
                              <button key={item.id} type="button" onClick={() => insertTemplate(item)}>
                                <b>/{item.trigger}</b>
                                <span>{item.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="omni-composer-foot">
                        <p>
                          {selectedSrc === 'tiktok'
                            ? (tiktokBridgeReady
                              ? 'Trả lời trực tiếp: bấm Gửi TikTok Reply → extension bấm Trả lời + gõ vào "Thêm câu trả lời..."'
                              : 'Cần Chrome extension để trả lời trực tiếp vào comment TikTok')
                            : 'Trả lời trực tiếp vào comment Facebook'}
                          {replyStatus ? ` · ${replyStatus}` : ''}
                        </p>
                        <button type="button" className="omni-send-btn" disabled={replyBusy || !replyText.trim()} onClick={() => void sendReply()}>
                          {replyBusy ? 'Đang gửi...' : selectedSrc === 'tiktok' ? 'Gửi TikTok Reply' : 'Gửi trả lời'}
                          <MaterialIcon name="send" style={{ fontSize: 18 }} />
                        </button>
                      </div>
                    </div>
                  </footer>
                </>
              ) : (
                <div className="omni-empty">
                  <MaterialIcon name="forum" style={{ fontSize: 48, marginBottom: 12 }} />
                  <div>Chọn bình luận để xem chi tiết</div>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'customers' ? (
        <div className="omni-tab-panel">
          <div className="omni-topbar-right" style={{ marginBottom: 16 }}>
            <div className="omni-search" style={{ display: 'block' }}>
              <MaterialIcon name="search" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm khách hàng, SĐT..." type="text" />
            </div>
            <button type="button" className="omni-btn-ghost" onClick={exportCustomers}>Xuất CSV</button>
            <button type="button" className="omni-btn-primary" onClick={() => void syncLead(null)}>Đồng bộ Lead</button>
          </div>
          <div className="omni-table-wrap">
            <table className="omni-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Kênh</th>
                  <th>ID bài viết</th>
                  <th>Tiêu đề bài viết</th>
                  <th>SĐT</th>
                  <th>Tags</th>
                  <th>Nội dung</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {customers.length ? customers.map(({ row, tags, phones }) => (
                  <tr key={row.comment_id || `${row.post_id}-${row.author_name}`}>
                    <td><CommentAuthorLink row={row} /><br /><small>{channelName(row)}</small></td>
                    <td>{sourceLabel(row).label}</td>
                    <td className="mono omni-post-id-cell" title={row.post_id || ''}>{row.post_id || '-'}</td>
                    <td className="omni-post-title-cell" title={postTitle(row)}>{postTitle(row)}</td>
                    <td>{phones.join(', ') || 'Chưa có'}</td>
                    <td>{tags.map((tag) => tag.label).join(', ') || '-'}</td>
                    <td>{row.message || '-'}</td>
                    <td>{(row.comment_url || row.post_url) ? <button type="button" className="omni-dm-link" onClick={() => void openCommentLink(row)}>Mở</button> : '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="omni-empty">Chưa có khách hàng/lead từ comment.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'messenger' ? (
        <div className="omni-tab-panel omni-messenger-page">
          <div className="omni-messenger-note">
            <MaterialIcon name="info" style={{ fontSize: 18 }} />
            <span>
              Extension tự cuộn lên để gom lịch sử Messenger đang mở, dừng sớm khi đã tới đầu hoặc DOM không còn tải thêm tin.
            </span>
          </div>
          <div className="omni-messenger-grid">
            <aside className="omni-messenger-list">
              <div className="omni-messenger-list-head">
                <b>Hội thoại đã lưu</b>
                <small>{messengerConversations.length} hội thoại</small>
              </div>
              {messengerConversations.length ? messengerConversations.map((item, index) => {
                const cid = messengerConversationKey(item);
                const phones = item.phones?.length ? item.phones.join(', ') : (item.customer_phone || '');
                const staffLabel = messengerCanManage && item.captured_by_staff_name
                  ? `NV ${item.captured_by_staff_name} · `
                  : '';
                return (
                  <button
                    key={cid || item.conversation_url || item.title || `messenger-${index}`}
                    type="button"
                    className={`omni-messenger-card ${selectedMessengerId === cid ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedMessengerId(cid);
                      void loadMessenger(cid);
                    }}
                  >
                    <div className="omni-avatar sm">{authorInitials(item.customer_name || item.title)}</div>
                    <span>
                      <b>{item.customer_name || item.title || cid || 'Hội thoại Messenger'}</b>
                      <small>
                        {staffLabel}{item.message_count || 0} tin · {phones ? `SĐT ${phones} · ` : ''}{messengerTime(item.latest_message_at || item.updated_at || item.captured_at)}
                      </small>
                    </span>
                  </button>
                );
              }) : (
                <div className="omni-empty">Chưa có hội thoại. Mở Messenger rồi bấm “Đồng bộ hội thoại đang mở”.</div>
              )}
            </aside>

            <section className="omni-messenger-thread">
              <div className="omni-messenger-thread-head">
                <div>
                  <h3>{selectedMessenger?.customer_name || selectedMessenger?.title || 'Chọn hội thoại Messenger'}</h3>
                  <p>Chỉ hiển thị nội dung tin nhắn và ngày giờ đã đọc.</p>
                </div>
                <div className="omni-thread-actions">
                  {selectedMessenger?.conversation_url ? (
                    <button type="button" className="omni-btn-ghost" onClick={() => window.open(selectedMessenger.conversation_url, '_blank', 'noopener,noreferrer')}>
                      Mở gốc
                    </button>
                  ) : null}
                  {selectedMessengerId ? (
                    <button type="button" className="omni-btn-danger" onClick={() => void deleteSelectedMessengerConversation()} disabled={messengerBusy}>
                      Xoá hội thoại
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="omni-messenger-messages">
                {visibleMessengerMessages.length ? visibleMessengerMessages.map((message, index) => {
                  const outgoing = message.direction === 'outgoing' || message.sender_type === 'staff';
                  return (
                    <div key={message.message_key || `${message.conversation_id}-${index}`} className={`omni-message-row ${outgoing ? 'outgoing' : 'incoming'}`}>
                      {!outgoing ? (
                        <div className="omni-message-avatar">{authorInitials(message.sender_name || selectedMessenger?.customer_name || selectedMessenger?.title || 'K')}</div>
                      ) : null}
                      <div className="omni-message-bubble">
                        <p>{message.text}</p>
                        <small>{messengerDisplayTime(message)}</small>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="omni-empty">
                    {messengerBusy ? 'Đang tải Messenger...' : 'Chưa có tin nhắn cho hội thoại này.'}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'zalo' ? (
        <div className="omni-tab-panel omni-messenger-page">
          <div className="omni-messenger-note">
            <MaterialIcon name="info" style={{ fontSize: 18 }} />
            <span>
              PoC này đọc hội thoại Zalo Web đang mở bằng Chrome, tự cuộn lên nhiều lượt để gom thêm tin cũ. Nếu cuộc trò chuyện quá dài, cuộn sâu hơn rồi đồng bộ lại.
            </span>
          </div>
          <div className="omni-messenger-grid">
            <aside className="omni-messenger-list">
              <div className="omni-messenger-list-head">
                <b>Hội thoại Zalo đã lưu</b>
                <small>{zaloConversations.length} hội thoại</small>
              </div>
              {zaloConversations.length ? zaloConversations.map((item, index) => {
                const cid = messengerConversationKey(item);
                const phones = item.phones?.length ? item.phones.join(', ') : (item.customer_phone || '');
                const staffLabel = zaloCanManage && item.captured_by_staff_name
                  ? `NV ${item.captured_by_staff_name} · `
                  : '';
                return (
                  <button
                    key={cid || item.conversation_url || item.title || `zalo-${index}`}
                    type="button"
                    className={`omni-messenger-card ${selectedZaloId === cid ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedZaloId(cid);
                      void loadZalo(cid);
                    }}
                  >
                    <div className="omni-avatar sm">{authorInitials(item.customer_name || item.title)}</div>
                    <span>
                      <b>{safeConversationTitle(item.customer_name || item.title, cid || 'Hội thoại Zalo')}</b>
                      <small>
                        {staffLabel}{item.message_count || 0} tin · {phones ? `SĐT ${phones} · ` : ''}{messengerTime(item.latest_message_at || item.updated_at || item.captured_at)}
                      </small>
                    </span>
                  </button>
                );
              }) : (
                <div className="omni-empty">Chưa có hội thoại. Mở Zalo Web rồi bấm “Đồng bộ hội thoại Zalo đang mở”.</div>
              )}
            </aside>

            <section className="omni-messenger-thread">
              <div className="omni-messenger-thread-head">
                <div>
                  <h3>{safeConversationTitle(selectedZalo?.customer_name || selectedZalo?.title, 'Chọn hội thoại Zalo')}</h3>
                  <p>Chỉ hiển thị nội dung tin nhắn và ngày giờ đã đọc.</p>
                </div>
                <div className="omni-thread-actions">
                  {selectedZalo?.conversation_url ? (
                    <button type="button" className="omni-btn-ghost" onClick={() => window.open(selectedZalo.conversation_url, '_blank', 'noopener,noreferrer')}>
                      Mở gốc
                    </button>
                  ) : null}
                  {selectedZaloId ? (
                    <button type="button" className="omni-btn-danger" onClick={() => void deleteSelectedZaloConversation()} disabled={zaloBusy}>
                      Xoá hội thoại
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="omni-messenger-messages">
                {visibleZaloMessages.length ? visibleZaloMessages.map((message, index) => {
                  const outgoing = message.direction === 'outgoing' || message.sender_type === 'staff';
                  const mediaUrls = messengerMediaUrls(message);
                  return (
                    <div key={message.message_key || `${message.conversation_id}-${index}`} className={`omni-message-row ${outgoing ? 'outgoing' : 'incoming'}`}>
                      {!outgoing ? (
                        <div className="omni-message-avatar">{authorInitials(message.sender_name || safeConversationTitle(selectedZalo?.customer_name || selectedZalo?.title, 'K'))}</div>
                      ) : null}
                      <div className="omni-message-bubble">
                        {message.text && message.text !== '[Ảnh]' ? <p>{message.text}</p> : null}
                        {mediaUrls.length ? (
                          <div className="omni-message-media-grid">
                            {mediaUrls.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="Ảnh Zalo" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        ) : message.text === '[Ảnh]' ? (
                          <p>[Ảnh]</p>
                        ) : null}
                        <small>{zaloDisplayTime(message)}</small>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="omni-empty">
                    {zaloBusy ? 'Đang tải Zalo...' : 'Chưa có tin nhắn cho hội thoại này.'}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="omni-tab-panel omni-stats-page">
          <div className="omni-stats-hero">
            <div>
              <p className="omni-stats-kicker">Báo cáo Inbox</p>
              <h2>Thống kê đa kênh</h2>
              <p>Tổng hợp comment Facebook, TikTok và tín hiệu lead từ dữ liệu thật đang lưu trong hệ thống.</p>
            </div>
            <button type="button" className="omni-btn-ghost" onClick={() => void reloadInbox()} disabled={busy}>
              <MaterialIcon name="refresh" style={{ fontSize: 18 }} />
              {busy ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>

          <div className="omni-stats-kpi-grid">
            <div className="omni-stat-card omni-stat-primary">
              <MaterialIcon name="forum" />
              <b>{comments.length}</b>
              <span>Tổng comment</span>
            </div>
            <div className="omni-stat-card omni-stat-warn">
              <MaterialIcon name="pending_actions" />
              <b>{statsDashboard.workflow.open}</b>
              <span>Chưa xử lý</span>
            </div>
            <div className="omni-stat-card omni-stat-success">
              <MaterialIcon name="done_all" />
              <b>{statsDashboard.workflow.done}</b>
              <span>Đã xử lý ({statsDashboard.processRate}%)</span>
            </div>
            <div className="omni-stat-card omni-stat-vip">
              <MaterialIcon name="stars" filled />
              <b>{statsDashboard.workflow.starred}</b>
              <span>Ghim VIP</span>
            </div>
            <div className="omni-stat-card">
              <MaterialIcon name="person_search" />
              <b>{customers.length}</b>
              <span>Lead tiềm năng ({statsDashboard.leadRate}%)</span>
            </div>
            <div className="omni-stat-card omni-stat-hot">
              <MaterialIcon name="local_fire_department" filled />
              <b>{statsDashboard.hotCount}</b>
              <span>Comment nóng</span>
            </div>
            <div className="omni-stat-card">
              <MaterialIcon name="call" />
              <b>{statsDashboard.withPhone}</b>
              <span>Có SĐT</span>
            </div>
          </div>

          <div className="omni-stats-columns">
            <section className="omni-stats-panel">
              <div className="omni-stats-panel-head">
                <h3>Phân bổ kênh</h3>
                <span>{comments.length} comment</span>
              </div>
              {statsDashboard.channelRows.length ? statsDashboard.channelRows.map((channel) => (
                <div key={channel.key} className="omni-bar-row">
                  <div className="omni-bar-label">
                    <MaterialIcon name={channel.materialIcon} style={{ fontSize: 16 }} />
                    <span>{channel.label}</span>
                    <b>{channel.count}</b>
                  </div>
                  <div className="omni-bar-track">
                    <div className="omni-bar-fill" style={{ width: `${channel.pct}%` }} />
                  </div>
                  <small>{channel.pct}%</small>
                </div>
              )) : (
                <div className="omni-empty">Chưa có dữ liệu kênh.</div>
              )}
            </section>

            <section className="omni-stats-panel">
              <div className="omni-stats-panel-head">
                <h3>Trạng thái xử lý</h3>
                <span>{statsDashboard.processRate}% hoàn thành</span>
              </div>
              <div
                className="omni-workflow-ring"
                style={{ background: `conic-gradient(#059669 0 ${statsDashboard.processRate}%, #fef3c7 ${statsDashboard.processRate}% 100%)` }}
              >
                <div className="omni-workflow-ring-center">
                  <b>{statsDashboard.processRate}%</b>
                  <small>đã xử lý</small>
                </div>
              </div>
              <div className="omni-workflow-legend">
                <div><i className="dot open" /> Chưa xử lý <b>{statsDashboard.workflow.open}</b></div>
                <div><i className="dot done" /> Đã xử lý <b>{statsDashboard.workflow.done}</b></div>
                <div><i className="dot vip" /> VIP <b>{statsDashboard.workflow.starred}</b></div>
              </div>
            </section>
          </div>

          <div className="omni-stats-columns">
            <section className="omni-stats-panel">
              <div className="omni-stats-panel-head">
                <h3>Tags phổ biến</h3>
                <span>{tagOptions.length} tag</span>
              </div>
              {statsDashboard.tagRows.filter((row) => row.count > 0).length ? statsDashboard.tagRows.filter((row) => row.count > 0).map(({ tag, count, pct, meta }) => (
                <div key={tag.key} className="omni-bar-row">
                  <div className="omni-bar-label">
                    <MaterialIcon name={meta.icon} filled={meta.filled} style={{ fontSize: 16, color: meta.color }} />
                    <span>{tag.label}</span>
                    <b>{count}</b>
                  </div>
                  <div className="omni-bar-track">
                    <div className="omni-bar-fill tag" style={{ width: `${pct}%` }} />
                  </div>
                  <small>{pct}%</small>
                </div>
              )) : (
                <div className="omni-empty">Chưa có tag nào được gắn.</div>
              )}
            </section>

            <section className="omni-stats-panel">
              <div className="omni-stats-panel-head">
                <h3>7 ngày gần nhất</h3>
                <span>Theo ngày comment</span>
              </div>
              {statsDashboard.dailyRows.length ? statsDashboard.dailyRows.map((row) => (
                <div key={row.date} className="omni-bar-row">
                  <div className="omni-bar-label">
                    <MaterialIcon name="calendar_today" style={{ fontSize: 16 }} />
                    <span>{row.date}</span>
                    <b>{row.count}</b>
                  </div>
                  <div className="omni-bar-track">
                    <div
                      className="omni-bar-fill daily"
                      style={{ width: `${Math.round((row.count / statsDashboard.dailyMax) * 100)}%` }}
                    />
                  </div>
                </div>
              )) : (
                <div className="omni-empty">Chưa có dữ liệu theo ngày.</div>
              )}
            </section>
          </div>

          <section className="omni-stats-panel omni-stats-wide">
            <div className="omni-stats-panel-head">
              <h3>Top khách hàng comment nhiều nhất</h3>
              <span>Top 5</span>
            </div>
            {statsDashboard.topAuthors.length ? (
              <div className="omni-top-authors">
                {statsDashboard.topAuthors.map((row, index) => (
                  <div key={row.name} className="omni-top-author-row">
                    <span className="omni-top-rank">#{index + 1}</span>
                    <div className="omni-avatar sm">{authorInitials(row.name)}</div>
                    <div className="omni-top-author-meta">
                      <b>{row.name}</b>
                      <small>{row.count} comment</small>
                    </div>
                    <div className="omni-bar-track compact">
                      <div
                        className="omni-bar-fill"
                        style={{ width: `${Math.round((row.count / statsDashboard.authorMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="omni-empty">Chưa có dữ liệu khách hàng.</div>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'templates' ? (
        <div className="omni-tab-panel">
          <div className="omni-template-editor">
            <input value={templateForm.title} onChange={(e) => setTemplateForm((s) => ({ ...s, title: e.target.value }))} placeholder="Tên mẫu câu" />
            <input value={templateForm.trigger} onChange={(e) => setTemplateForm((s) => ({ ...s, trigger: e.target.value }))} placeholder="Lệnh /, ví dụ baogia" />
            <textarea value={templateForm.text} onChange={(e) => setTemplateForm((s) => ({ ...s, text: e.target.value }))} placeholder="Nội dung trả lời nhanh..." rows={4} />
            <button type="button" className="omni-btn-primary" onClick={() => void createTemplate()}>+ Thêm mẫu câu</button>
          </div>
          <div className="omni-template-grid">
            {templates.map((item) => (
              <div key={item.id} className="omni-template-card">
                <b>{item.title}</b>
                <small>/{item.trigger}</small>
                <p style={{ margin: '12px 0', fontSize: 13, color: 'var(--omni-on-surface-variant)' }}>{item.text}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="omni-btn-ghost" onClick={() => void copyTemplate(item)}>Sao chép</button>
                  {!item.system ? <button type="button" className="omni-btn-ghost" onClick={() => void deleteTemplate(item.id)}>Xoá</button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {status ? <div className="omni-status-bar">{status}</div> : null}
    </section>
  );
}
