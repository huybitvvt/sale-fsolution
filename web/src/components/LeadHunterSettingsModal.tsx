'use client';

import { useEffect, useState } from 'react';
import type { LeadLevel } from '@/lib/lead-hunter';
import {
  configFromForm,
  DEFAULT_LEAD_HUNTER_CONFIG,
  DEFAULT_SCORE_RULES,
  loadLeadHunterConfig,
  resetLeadHunterConfig,
  saveLeadHunterConfig,
  SCORE_RULE_LABELS,
  type LeadHunterConfig,
  type LeadScoreRules,
} from '@/lib/lead-hunter-config';

type Props = {
  open: boolean;
  groups: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (config: LeadHunterConfig) => void | Promise<void>;
};

function linesOf(items: string[]) {
  return items.join('\n');
}

export function LeadHunterSettingsModal({ open, groups, onClose, onSaved }: Props) {
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [needKeywordsText, setNeedKeywordsText] = useState('');
  const [platformKeywordsText, setPlatformKeywordsText] = useState('');
  const [businessModulesText, setBusinessModulesText] = useState('');
  const [crmStatusesText, setCrmStatusesText] = useState('');
  const [levels, setLevels] = useState<LeadLevel[]>(DEFAULT_LEAD_HUNTER_CONFIG.levels);
  const [scoreRules, setScoreRules] = useState<LeadScoreRules>(DEFAULT_SCORE_RULES);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const cfg = loadLeadHunterConfig();
    setGroupIds(cfg.groupIds || []);
    setNeedKeywordsText(linesOf(cfg.needKeywords));
    setPlatformKeywordsText(linesOf(cfg.platformKeywords));
    setBusinessModulesText(linesOf(cfg.businessModules));
    setCrmStatusesText(linesOf(cfg.crmStatuses));
    setLevels(cfg.levels);
    setScoreRules(cfg.scoreRules);
    setError('');
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    const config = configFromForm({
      groupIds,
      needKeywordsText,
      platformKeywordsText,
      businessModulesText,
      crmStatusesText,
      levels,
      scoreRules,
    });
    if (!config.needKeywords.length) {
      setError('Cần ít nhất một từ khóa nhu cầu');
      return;
    }
    if (!config.crmStatuses.length) {
      setError('Cần ít nhất một trạng thái CRM');
      return;
    }
    try {
      await onSaved(config);
      saveLeadHunterConfig(config);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được cấu hình');
    }
  }

  async function handleReset() {
    const config = resetLeadHunterConfig();
    setGroupIds(config.groupIds);
    setNeedKeywordsText(linesOf(config.needKeywords));
    setPlatformKeywordsText(linesOf(config.platformKeywords));
    setBusinessModulesText(linesOf(config.businessModules));
    setCrmStatusesText(linesOf(config.crmStatuses));
    setLevels(config.levels);
    setScoreRules(config.scoreRules);
    try {
      await onSaved(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được cấu hình');
      return;
    }
    setError('');
  }

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="modal modal-wide lead-settings-modal">
        <div className="modal-hd">
          <span>Cài đặt Lead Hunter · F-Solution</span>
          <span className="modal-close" onClick={onClose} role="presentation">✕</span>
        </div>

        <p className="lead-settings-hint">
          Chọn nhóm cố định cần quét và từ khóa cho từng mức lead. Cấu hình này dùng chung cho đội sale.
          Mỗi dòng là một từ hoặc cụm từ.
        </p>

        <div className="lead-settings-groups">
          <div className="lead-settings-levels-hd">Nhóm Facebook cần quét</div>
          {groups.length ? (
            <div className="lead-settings-group-list">
              {groups.map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={groupIds.includes(group.id)}
                    onChange={(event) => setGroupIds((current) => event.target.checked
                      ? [...new Set([...current, group.id])]
                      : current.filter((id) => id !== group.id))}
                  />
                  <span>{group.name || group.id}</span>
                </label>
              ))}
            </div>
          ) : <p>Chưa có nhóm Facebook được giao quyền.</p>}
        </div>

        <div className="lead-settings-grid">
          <label className="lead-process-field">
            <span>Từ khóa nhu cầu (+10 điểm)</span>
            <textarea rows={6} value={needKeywordsText} onChange={(e) => setNeedKeywordsText(e.target.value)} />
          </label>
          <label className="lead-process-field">
            <span>Từ khóa nền tảng / giải pháp (+30 matching)</span>
            <textarea rows={6} value={platformKeywordsText} onChange={(e) => setPlatformKeywordsText(e.target.value)} />
          </label>
          <label className="lead-process-field">
            <span>Module nghiệp vụ (+30 matching)</span>
            <textarea rows={6} value={businessModulesText} onChange={(e) => setBusinessModulesText(e.target.value)} />
          </label>
          <label className="lead-process-field">
            <span>Trạng thái CRM (hiển thị & chọn khi lưu lead)</span>
            <textarea rows={6} value={crmStatusesText} onChange={(e) => setCrmStatusesText(e.target.value)} />
          </label>
        </div>

        <div className="lead-settings-score-rules">
          <div className="lead-settings-levels-hd">Bảng chấm điểm (F-Solution)</div>
          <div className="lead-settings-score-grid">
            {SCORE_RULE_LABELS.map(({ key, label }) => (
              <label key={key} className="lead-settings-score-item">
                <span>{label}</span>
                <input
                  type="number"
                  min={0}
                  value={scoreRules[key]}
                  onChange={(e) => {
                    setScoreRules((prev) => ({
                      ...prev,
                      [key]: Math.max(0, Number(e.target.value) || 0),
                    }));
                  }}
                />
                <span className="lead-settings-score-pt">điểm</span>
              </label>
            ))}
          </div>
        </div>

        <div className="lead-settings-levels">
          <div className="lead-settings-levels-hd">Ngưỡng chấm điểm theo mức Lead</div>
          <div className="lead-settings-levels-table">
            {levels.map((level, idx) => (
              <div key={level.id} className="lead-settings-level-row">
                <span className="lead-level-badge" style={{ color: level.color, background: level.bg }}>
                  {level.label}
                </span>
                <label>
                  Nhãn
                  <input
                    type="text"
                    value={level.label}
                    onChange={(e) => {
                      const next = [...levels];
                      next[idx] = { ...level, label: e.target.value };
                      setLevels(next);
                    }}
                  />
                </label>
                <label>
                  Từ
                  <input
                    type="number"
                    value={level.min}
                    onChange={(e) => {
                      const next = [...levels];
                      next[idx] = { ...level, min: Number(e.target.value) || 0 };
                      setLevels(next);
                    }}
                  />
                </label>
                <label>
                  Đến
                  <input
                    type="number"
                    value={level.max}
                    onChange={(e) => {
                      const next = [...levels];
                      next[idx] = { ...level, max: Number(e.target.value) || 0 };
                      setLevels(next);
                    }}
                  />
                </label>
                <label className="lead-settings-level-keywords">
                  Từ khóa quét (mỗi dòng một từ/cụm từ)
                  <textarea
                    rows={3}
                    value={(level.keywords || []).join('\n')}
                    onChange={(e) => {
                      const next = [...levels];
                      next[idx] = {
                        ...level,
                        keywords: e.target.value.split(/\r?\n/).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean),
                      };
                      setLevels(next);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        {error ? <div className="modal-result error">{error}</div> : null}

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={handleReset}>Mặc định F-Solution</button>
          <button type="button" className="btn-cancel" onClick={onClose}>Đóng</button>
          <button type="button" className="btn-submit" onClick={() => void handleSave()}>Lưu cài đặt</button>
        </div>
      </div>
    </div>
  );
}
