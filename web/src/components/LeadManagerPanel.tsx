'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Lead } from '@/lib/types';
import { api } from '@/lib/api';
import { LeadHunterSettingsModal } from '@/components/LeadHunterSettingsModal';
import type { LeadHunterConfig } from '@/lib/lead-hunter-config';
import { loadLeadHunterConfig, saveLeadHunterConfig, SCORE_RULE_LABELS } from '@/lib/lead-hunter-config';
import {
  enrichLead,
  formatLeadDateTime,
  isProcessedLead,
  leadLevelFromScore,
  type LeadLevelId,
} from '@/lib/lead-hunter';

type LeadRow = Lead & { post_id?: string };
type LeadSelection = { postId: string; leadKey: string };
type GroupOption = { id: string; name: string };

function selectionKey(postId: string, leadKey: string) {
  return `${postId}|${leadKey}`;
}

function mergeLeadHunterConfig(base: LeadHunterConfig, incoming: Partial<LeadHunterConfig>): LeadHunterConfig {
  const incomingLevels = Array.isArray(incoming.levels) ? incoming.levels : [];
  return {
    ...base,
    ...incoming,
    levels: base.levels.map((level) => ({
      ...level,
      ...(incomingLevels.find((item) => item.id === level.id) || {}),
    })),
  };
}

function LeadLevelBadge({
  score,
  levelId,
  config,
  showScore = false,
}: {
  score: number;
  levelId?: string;
  config: LeadHunterConfig;
  showScore?: boolean;
}) {
  const level = config.levels.find((item) => item.id === levelId) || leadLevelFromScore(score, config);
  const text = showScore ? `${score} · ${level.label}` : level.label;
  return (
    <span
      className="lead-level-badge"
      style={{ color: level.color, background: level.bg }}
      title={level.label}
    >
      {text}
    </span>
  );
}

export function LeadManagerPanel({
  leads,
  groupNames = {},
  busy,
  isAdmin = false,
  currentStaffId = '',
  onReload,
  onDelete,
  onDeleteMany,
}: {
  leads: Record<string, Lead[]>;
  groupNames?: Record<string, string>;
  busy?: boolean;
  isAdmin?: boolean;
  currentStaffId?: string;
  onReload: () => Promise<void>;
  onDelete: (postId: string, leadKey: string, name?: string) => Promise<void>;
  onDeleteMany: (items: LeadSelection[]) => Promise<void>;
}) {
  const [config, setConfig] = useState<LeadHunterConfig>(() => loadLeadHunterConfig());
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api('/api/lead-hunter/config'), api('/api/groups')]).then(async ([configResponse, groupsResponse]) => {
      const configData = await configResponse.json().catch(() => null);
      const groupsData = await groupsResponse.json().catch(() => []);
      if (cancelled) return;
      if (configResponse.ok && configData?.config) {
        const mergedConfig = mergeLeadHunterConfig(loadLeadHunterConfig(), configData.config as Partial<LeadHunterConfig>);
        setConfig(mergedConfig);
        saveLeadHunterConfig(mergedConfig);
      }
      if (groupsResponse.ok && Array.isArray(groupsData)) {
        setGroups(groupsData.map((group) => ({ id: String(group.id || ''), name: String(group.name || group.channel_name || group.id || '') })).filter((group) => group.id));
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const [levelFilter, setLevelFilter] = useState<LeadLevelId | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [minScore, setMinScore] = useState('');
  const [showScoreTable, setShowScoreTable] = useState(false);

  const rows = useMemo<LeadRow[]>(
    () =>
      Object.entries(leads)
        .flatMap(([postId, items]) => (items || []).map((item) => enrichLead({ ...item, post_id: postId }, config)))
        .filter((item) => isProcessedLead(item) || item.source === 'group_scan')
        .sort((a, b) => {
          const at = new Date(a.created_at || a.processed_at || 0).getTime();
          const bt = new Date(b.created_at || b.processed_at || 0).getTime();
          if (bt !== at) return bt - at;
          return (b.score || 0) - (a.score || 0);
        }),
    [leads, config],
  );

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      const levelId = config.levels.some((level) => level.id === row.lead_level)
        ? row.lead_level!
        : leadLevelFromScore(row.score || 0, config).id;
      if (levelFilter && levelId !== levelFilter) return false;
      if (statusFilter && (row.crm_status || '') !== statusFilter) return false;
      const min = Number(minScore);
      if (minScore.trim() && Number.isFinite(min) && (row.score || 0) < min) return false;
      if (!q) return true;
      const hay = [
        row.name,
        row.need,
        row.phone,
        row.processed_by,
        row.group_id && groupNames[row.group_id],
        row.crm_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, levelFilter, statusFilter, searchText, minScore, config, groupNames]);

  const levelStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const level of config.levels) counts[level.id] = 0;
    for (const row of rows) {
      const id = config.levels.some((level) => level.id === row.lead_level)
        ? row.lead_level!
        : leadLevelFromScore(row.score || 0, config).id;
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }, [rows, config]);

  const selectableKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of filteredRows) {
      if (item.lead_key && item.post_id) {
        keys.add(selectionKey(item.post_id, item.lead_key));
      }
    }
    return keys;
  }, [filteredRows]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedItems = useMemo(() => {
    const items: LeadSelection[] = [];
    for (const item of filteredRows) {
      if (!item.lead_key || !item.post_id) continue;
      const key = selectionKey(item.post_id, item.lead_key);
      if (!selectableKeys.has(key) || !selected[key]) continue;
      items.push({ postId: item.post_id, leadKey: item.lead_key });
    }
    return items;
  }, [filteredRows, selectableKeys, selected]);
  const allSelected = selectableKeys.size > 0 && selectedItems.length === selectableKeys.size;
  const hasSelectableRows = selectableKeys.size > 0;
  const hasActiveFilter = Boolean(levelFilter || statusFilter || searchText.trim() || minScore.trim());
  const actionBusy = Boolean(busy || workflowBusy);

  async function saveConfig(next: LeadHunterConfig) {
    const response = await api('/api/lead-hunter/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Không lưu được cấu hình quét');
    const mergedConfig = mergeLeadHunterConfig(next, (data.config || {}) as Partial<LeadHunterConfig>);
    setConfig(mergedConfig);
    saveLeadHunterConfig(mergedConfig);
    setWorkflowStatus('Đã lưu nhóm quét và từ khóa cho cả đội sale.');
  }

  async function scanGroups() {
    setWorkflowBusy(true);
    setWorkflowStatus('Đang quét nhóm Facebook...');
    try {
      const response = await api('/api/leads/scan-groups', { method: 'POST', timeoutMs: 120000 });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `Quét nhóm lỗi (${response.status})`);
      setWorkflowStatus(`Đã quét ${data.scanned_posts || 0} bài, tìm thấy ${data.matched_count || 0} lead.${data.warning ? ` ${data.warning}` : ''}`);
      await onReload();
    } catch (error) {
      setWorkflowStatus(error instanceof Error ? error.message : 'Không quét được nhóm');
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function claimLead(item: LeadRow) {
    if (!item.lead_key || !item.post_id) return;
    setWorkflowBusy(true);
    setWorkflowStatus('Đang nhận lead...');
    try {
      const response = await api('/api/leads/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_key: item.lead_key, post_id: item.post_id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Không nhận được lead');
      setWorkflowStatus('Đã nhận lead cho bạn.');
      await onReload();
    } catch (error) {
      setWorkflowStatus(error instanceof Error ? error.message : 'Không nhận được lead');
      await onReload();
    } finally {
      setWorkflowBusy(false);
    }
  }

  function toggleRow(postId: string, leadKey: string, checked: boolean) {
    const key = selectionKey(postId, leadKey);
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const item of filteredRows) {
      if (!item.lead_key || !item.post_id) continue;
      next[selectionKey(item.post_id, item.lead_key)] = true;
    }
    setSelected(next);
  }

  function toggleLevelFilter(levelId: LeadLevelId) {
    setLevelFilter((prev) => (prev === levelId ? '' : levelId));
    setSelected({});
  }

  function clearFilters() {
    setLevelFilter('');
    setStatusFilter('');
    setSearchText('');
    setMinScore('');
    setSelected({});
  }

  return (
    <section className="module-panel">
      <div className="module-head">
        <div>
          <div className="module-kicker">Lead Hunter · F-Solution</div>
          <h2>Lead từ nhóm Facebook</h2>
          <p className="module-sub">
            Lead được quét theo từ khóa. Sale tự nhận lead; ảnh xác nhận nhắn riêng được lưu cạnh phần bình luận trong Inbox.
          </p>
        </div>
        <div className="module-actions">
          <button type="button" className="btn-submit" disabled={actionBusy} onClick={() => void scanGroups()}>
            {workflowBusy ? 'Đang xử lý...' : 'Quét nhóm đã cấu hình'}
          </button>
          {isAdmin ? (
            <button type="button" className="btn-cancel" onClick={() => setSettingsOpen(true)}>
              ⚙️ Nhóm và từ khóa
            </button>
          ) : null}
          {selectedItems.length ? (
            <button
              type="button"
              className="btn-cancel danger"
              disabled={actionBusy}
              onClick={() => void onDeleteMany(selectedItems)}
            >
              {allSelected ? `Xoá hết (${selectedItems.length})` : `Xoá đã chọn (${selectedItems.length})`}
            </button>
          ) : null}
        </div>
      </div>

      {workflowStatus ? <div className="lead-workflow-status" role="status">{workflowStatus}</div> : null}

      <div className="lead-crm-filters">
        <input
          type="search"
          className="lead-crm-search"
          placeholder="Tìm tên, SĐT, nhu cầu, người xử lý..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className="lead-crm-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {config.crmStatuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <label className="lead-crm-min-score">
          <span>Điểm từ</span>
          <input
            type="number"
            min={0}
            placeholder="0"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
        </label>
        {hasActiveFilter ? (
          <button type="button" className="btn-cancel lead-crm-clear-filter" onClick={clearFilters}>
            Bỏ lọc
          </button>
        ) : null}
      </div>

      <div className="lead-score-table-panel">
        <button
          type="button"
          className="lead-score-table-toggle"
          onClick={() => setShowScoreTable((v) => !v)}
        >
          {showScoreTable ? '▾' : '▸'} Bảng chấm điểm F-Solution
        </button>
        {showScoreTable ? (
          <table className="lead-score-table">
            <thead>
              <tr>
                <th>Điều kiện</th>
                <th>Điểm</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_RULE_LABELS.map(({ key, label }) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td><b>+{config.scoreRules[key]}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="lead-level-summary">
        {config.levels.map((level) => {
          const active = levelFilter === level.id;
          const count = levelStats[level.id] || 0;
          return (
            <button
              key={level.id}
              type="button"
              className={`lead-level-card${active ? ' active' : ''}${count ? '' : ' empty'}`}
              style={
                {
                  '--lead-accent': level.color,
                  '--lead-bg': level.bg,
                } as CSSProperties
              }
              title={active ? 'Bỏ lọc mức này' : `Lọc ${level.label}`}
              onClick={() => toggleLevelFilter(level.id)}
            >
              <span className="lead-level-card-count">{count}</span>
              <span className="lead-level-card-label">{level.label}</span>
            </button>
          );
        })}
      </div>

      {hasActiveFilter ? (
        <p className="lead-crm-filter-meta">
          Hiển thị <b>{filteredRows.length}</b> / {rows.length} lead
        </p>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table lead-crm-table">
          <thead>
            <tr>
              <th className="select-col">
                {hasSelectableRows ? (
                  <input
                    type="checkbox"
                    title="Chọn tất cả"
                    disabled={busy}
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                ) : null}
              </th>
              <th>Điểm</th>
              <th>Mức Lead</th>
              <th>Chi tiết điểm</th>
              <th>Người xử lý</th>
              <th>Thời gian xử lý</th>
              <th>Tên Facebook</th>
              <th>Nội dung nhu cầu</th>
              <th>Group</th>
              <th>Trạng thái</th>
              <th>Sale phụ trách</th>
              <th>Minh chứng nhắn</th>
              <th>SĐT</th>
              <th>Link bài viết</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? (
              filteredRows.map((item, idx) => {
                const canSelect = Boolean(item.lead_key && item.post_id);
                const key = canSelect ? selectionKey(item.post_id!, item.lead_key!) : '';
                const groupLabel = (item.group_id && groupNames[item.group_id]) || item.group_id || '-';
                const postLink = item.post_url || item.comment_url || '';
                const messageProofs = (item.follow_ups || []).filter((followUp) => followUp.action_type === 'message');
                return (
                  <tr key={`${item.lead_key || item.post_id}-${idx}`}>
                    <td className="select-col">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={Boolean(selected[key])}
                          onChange={(e) => toggleRow(item.post_id!, item.lead_key!, e.target.checked)}
                        />
                      ) : null}
                    </td>
                    <td className="lead-score-cell">
                      <b>{item.score ?? 0}</b>
                    </td>
                    <td>
                      <LeadLevelBadge
                        score={item.score || 0}
                        levelId={item.lead_level}
                        config={config}
                      />
                    </td>
                    <td className="lead-breakdown-cell">
                      {item.score_breakdown?.length ? (
                        <ul className="lead-breakdown-list">
                          {item.score_breakdown.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="lead-breakdown-empty">—</span>
                      )}
                    </td>
                    <td>
                      <b>{item.processed_by || '-'}</b>
                    </td>
                    <td className="mono-cell">{formatLeadDateTime(item.processed_at || item.created_at)}</td>
                    <td>
                      <b>{item.name || 'Ẩn danh'}</b>
                    </td>
                    <td className="lead-need-cell">{item.need || '-'}</td>
                    <td>{groupLabel}</td>
                    <td>
                      <span className="lead-crm-status">{item.crm_status || '-'}</span>
                    </td>
                    <td>{item.assigned_sale || '-'}</td>
                    <td>
                      {messageProofs.length ? (
                        <div className="lead-proof-list">
                          <span>{messageProofs.length} ảnh</span>
                          {messageProofs.slice(-2).map((followUp, proofIndex) => (
                            followUp.image_url ? (
                              <a key={followUp.id || `${followUp.created_at}-${proofIndex}`} href={followUp.image_url} target="_blank" rel="noreferrer">
                                {followUp.staff_name || 'Minh chứng'} · {formatLeadDateTime(followUp.created_at)}
                              </a>
                            ) : null
                          ))}
                        </div>
                      ) : 'Chưa có'}
                    </td>
                    <td>{item.phone || '-'}</td>
                    <td>
                      {postLink ? (
                        <a href={postLink} target="_blank" rel="noreferrer">
                          Mở
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {canSelect && (!item.assigned_sale_staff_id && !item.assigned_sale) ? (
                        <button type="button" className="btn-submit lead-row-action" disabled={actionBusy} onClick={() => void claimLead(item)}>
                          Nhận lead
                        </button>
                      ) : canSelect && (isAdmin || item.assigned_sale_staff_id === currentStaffId) ? (
                        <span className="lead-row-action">Đã nhận</span>
                      ) : canSelect ? (
                        <button
                          type="button"
                          className="table-icon-button danger"
                          title="Xoá"
                          disabled={actionBusy}
                          onClick={() => void onDelete(item.post_id!, item.lead_key!, item.name)}
                        >
                          ✕
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={15} className="table-empty">
                  {rows.length
                    ? 'Không có lead phù hợp bộ lọc. Thử bỏ lọc hoặc đổi điều kiện.'
                    : 'Chưa có lead trong pool. Cấu hình nhóm và từ khóa rồi bấm “Quét nhóm đã cấu hình”.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LeadHunterSettingsModal
        open={settingsOpen}
        groups={groups}
        onClose={() => setSettingsOpen(false)}
        onSaved={async (next) => { await saveConfig(next); setSelected({}); }}
      />

    </section>
  );
}
