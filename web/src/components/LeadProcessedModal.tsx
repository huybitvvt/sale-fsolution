'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FbPost, Lead } from '@/lib/types';
import {
  enrichLead,
  formatLeadDateTime,
  getLeadCrmStatuses,
  getLeadHunterConfig,
  leadLevelFromScore,
  scoreLead,
} from '@/lib/lead-hunter';

type Props = {
  post: FbPost | null;
  groupName?: string;
  processorName?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (crmStatus: string, assignedSale: string) => Promise<Lead>;
  onOpenLeads: () => void;
};

export function LeadProcessedModal({
  post,
  groupName,
  processorName,
  busy,
  onClose,
  onConfirm,
  onOpenLeads,
}: Props) {
  const [crmStatus, setCrmStatus] = useState('Lead mới');
  const [assignedSale, setAssignedSale] = useState('');
  const [savedLead, setSavedLead] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [crmStatuses, setCrmStatuses] = useState<string[]>(() => getLeadCrmStatuses());

  useEffect(() => {
    if (!post) {
      setCrmStatus('Lead mới');
      setAssignedSale('');
      setSavedLead(null);
      setError('');
    } else {
      setCrmStatuses(getLeadCrmStatuses(getLeadHunterConfig()));
      setCrmStatus(getLeadCrmStatuses(getLeadHunterConfig())[0] || 'Lead mới');
    }
  }, [post]);

  const preview = useMemo(() => {
    if (!post) return null;
    const cfg = getLeadHunterConfig();
    const message = post.message || '';
    const phones = message.match(/(?:0|\+84)[\d.\s-]{8,14}\d/g) || [];
    return enrichLead({
      name: post.from?.name || 'Ẩn danh',
      need: message,
      evidence: message.slice(0, 300),
      post_id: post.id,
      group_id: post._group_id || post.group_id,
      post_url: post.permalink_url,
      platform: 'facebook',
      source: 'processed_post',
      phone: phones[0] || '',
      phones,
    }, cfg);
  }, [post]);

  if (!post || !preview) return null;

  const level = leadLevelFromScore(preview.score || 0, getLeadHunterConfig());
  const { breakdown } = scoreLead(preview, getLeadHunterConfig());
  const gid = post._group_id || post.group_id || '';

  async function handleSave() {
    setError('');
    try {
      const lead = await onConfirm(crmStatus, assignedSale);
      setSavedLead(lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được lead');
    }
  }

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      role="presentation"
    >
      <div className="modal modal-wide lead-process-modal">
        <div className="modal-hd">
          <span>{savedLead ? '✅ Đã đưa vào Lead CRM' : 'Chấm điểm Lead — F-Solution'}</span>
          <span className="modal-close" onClick={() => !busy && onClose()} role="presentation">
            ✕
          </span>
        </div>

        <div className="lead-process-preview">
          <p><b>{preview.name}</b> · {groupName || gid || 'Nhóm'}</p>
          <p className="lead-process-message">{preview.need || '—'}</p>
        </div>

        <div className="lead-process-score-row">
          <span
            className="lead-level-badge lead-process-score-badge"
            style={{ color: level.color, background: level.bg }}
          >
            {preview.score} điểm · {level.label}
          </span>
          {processorName ? <span className="lead-process-meta">Người xử lý: <b>{processorName}</b></span> : null}
        </div>

        {breakdown.length ? (
          <ul className="lead-process-breakdown">
            {breakdown.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="lead-process-hint">Chưa đủ tín hiệu nhu cầu — lead sẽ ở mức lạnh/theo dõi.</p>
        )}

        {savedLead ? (
          <div className="lead-process-saved">
            <p>
              <b>{savedLead.lead_level_label || level.label}</b> · {savedLead.score} điểm ·{' '}
              <span className="lead-crm-status">{savedLead.crm_status}</span>
            </p>
            <p className="lead-process-meta">
              {savedLead.processed_by || processorName} · {formatLeadDateTime(savedLead.processed_at)}
            </p>
          </div>
        ) : (
          <div className="lead-process-form">
            <label className="lead-process-field">
              <span>Trạng thái Lead</span>
              <select value={crmStatus} disabled={busy} onChange={(e) => setCrmStatus(e.target.value)}>
                {crmStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="lead-process-field">
              <span>Sale phụ trách (tuỳ chọn)</span>
              <input
                type="text"
                value={assignedSale}
                disabled={busy}
                placeholder="Tên sale..."
                onChange={(e) => setAssignedSale(e.target.value)}
              />
            </label>
          </div>
        )}

        {error ? <div className="modal-result error">{error}</div> : null}

        <div className="modal-actions">
          {savedLead ? (
            <>
              <button type="button" className="btn-cancel" onClick={onClose}>Đóng</button>
              <button type="button" className="btn-submit" onClick={onOpenLeads}>Mở /lead</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-cancel" disabled={busy} onClick={onClose}>Huỷ</button>
              <button type="button" className="btn-submit" disabled={busy} onClick={() => void handleSave()}>
                {busy ? 'Đang lưu...' : 'Lưu vào Lead CRM'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
