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
  onClose: () => void;
  onSaved: (config: LeadHunterConfig) => void;
};

function linesOf(items: string[]) {
  return items.join('\n');
}

export function LeadHunterSettingsModal({ open, onClose, onSaved }: Props) {
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
    setNeedKeywordsText(linesOf(cfg.needKeywords));
    setPlatformKeywordsText(linesOf(cfg.platformKeywords));
    setBusinessModulesText(linesOf(cfg.businessModules));
    setCrmStatusesText(linesOf(cfg.crmStatuses));
    setLevels(cfg.levels);
    setScoreRules(cfg.scoreRules);
    setError('');
  }, [open]);

  if (!open) return null;

  function handleSave() {
    const config = configFromForm({
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
    saveLeadHunterConfig(config);
    onSaved(config);
    onClose();
  }

  function handleReset() {
    const config = resetLeadHunterConfig();
    setNeedKeywordsText(linesOf(config.needKeywords));
    setPlatformKeywordsText(linesOf(config.platformKeywords));
    setBusinessModulesText(linesOf(config.businessModules));
    setCrmStatusesText(linesOf(config.crmStatuses));
    setLevels(config.levels);
    setScoreRules(config.scoreRules);
    onSaved(config);
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
          Từ khóa và ngưỡng điểm dùng để <b>chấm điểm</b> và <b>hiển thị trạng thái</b> trên /lead.
          Mỗi dòng là một mục. Lưu trên trình duyệt này.
        </p>

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
              </div>
            ))}
          </div>
        </div>

        {error ? <div className="modal-result error">{error}</div> : null}

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={handleReset}>Mặc định F-Solution</button>
          <button type="button" className="btn-cancel" onClick={onClose}>Đóng</button>
          <button type="button" className="btn-submit" onClick={handleSave}>Lưu cài đặt</button>
        </div>
      </div>
    </div>
  );
}
