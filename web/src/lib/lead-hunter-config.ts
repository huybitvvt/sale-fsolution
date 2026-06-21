import type { LeadLevel, LeadLevelId } from '@/lib/lead-hunter';

export type LeadScoreRules = {
  needKeyword: number;
  priceRequest: number;
  phone: number;
  deadline: number;
  urgent: number;
  budget: number;
  matching: number;
};

export type LeadHunterConfig = {
  needKeywords: string[];
  platformKeywords: string[];
  businessModules: string[];
  crmStatuses: string[];
  levels: LeadLevel[];
  scoreRules: LeadScoreRules;
};

export const DEFAULT_SCORE_RULES: LeadScoreRules = {
  needKeyword: 10,
  priceRequest: 20,
  phone: 30,
  deadline: 20,
  urgent: 25,
  budget: 25,
  matching: 30,
};

export const SCORE_RULE_LABELS: { key: keyof LeadScoreRules; label: string }[] = [
  { key: 'needKeyword', label: 'Từ khóa nhu cầu' },
  { key: 'priceRequest', label: 'Yêu cầu báo giá' },
  { key: 'phone', label: 'Có số điện thoại' },
  { key: 'deadline', label: 'Có deadline' },
  { key: 'urgent', label: 'Yêu cầu gấp' },
  { key: 'budget', label: 'Có ngân sách' },
  { key: 'matching', label: 'Matching giải pháp F-Solution' },
];

export const DEFAULT_LEAD_HUNTER_CONFIG: LeadHunterConfig = {
  needKeywords: [
    'tôi cần',
    'nhu cầu',
    'cần hỗ trợ',
    'cần xây dựng',
    'cần tool',
    'cần phần mềm',
    'tìm đơn vị làm',
    'tìm người làm',
    'cần đơn vị',
    'cần làm',
  ],
  platformKeywords: [
    'appsheet',
    'app sheet',
    'google sheet',
    'webapp',
    'web app',
    'phần mềm',
    'excel',
  ],
  businessModules: [
    'bán hàng',
    'khách hàng',
    'crm',
    'sale',
    'vận đơn',
    'quản lý đơn',
    'hàng hóa',
    'marketing',
    'kế toán',
    'thuế',
    'nhân sự',
    'chấm công',
    'kho',
    'thiết bị',
    'quản lý kho',
    'quản lý vận tải',
  ],
  crmStatuses: [
    'Lead mới',
    'Đã liên hệ',
    'Đang tư vấn',
    'Đã demo',
    'Đang báo giá',
    'Chốt deal',
    'Thất bại',
    'Theo dõi',
  ],
  levels: [
    { id: 'cold', label: 'Lead lạnh', min: 0, max: 10, color: '#475569', bg: '#f1f5f9' },
    { id: 'interest', label: 'Lead quan tâm', min: 11, max: 30, color: '#1d4ed8', bg: '#dbeafe' },
    { id: 'warm', label: 'Lead ấm', min: 31, max: 60, color: '#a16207', bg: '#fef9c3' },
    { id: 'hot', label: 'Lead nóng', min: 61, max: 90, color: '#c2410c', bg: '#ffedd5' },
    { id: 'vip', label: 'Lead rất nóng', min: 91, max: 999, color: '#b91c1c', bg: '#fee2e2' },
  ],
  scoreRules: { ...DEFAULT_SCORE_RULES },
};

const STORAGE_KEY = 'lead-hunter-config-v2';

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeLevels(levels: LeadLevel[]): LeadLevel[] {
  const byId = new Map<LeadLevelId, LeadLevel>();
  for (const level of DEFAULT_LEAD_HUNTER_CONFIG.levels) {
    const incoming = levels.find((item) => item.id === level.id);
    byId.set(level.id, {
      ...level,
      label: String(incoming?.label || level.label).trim() || level.label,
      min: Number.isFinite(incoming?.min) ? Number(incoming!.min) : level.min,
      max: Number.isFinite(incoming?.max) ? Number(incoming!.max) : level.max,
    });
  }
  return DEFAULT_LEAD_HUNTER_CONFIG.levels.map((level) => byId.get(level.id)!);
}

function normalizeScoreRules(rules?: Partial<LeadScoreRules>): LeadScoreRules {
  const base = DEFAULT_SCORE_RULES;
  const pick = (key: keyof LeadScoreRules) => {
    const val = rules?.[key];
    return Number.isFinite(val) ? Math.max(0, Number(val)) : base[key];
  };
  return {
    needKeyword: pick('needKeyword'),
    priceRequest: pick('priceRequest'),
    phone: pick('phone'),
    deadline: pick('deadline'),
    urgent: pick('urgent'),
    budget: pick('budget'),
    matching: pick('matching'),
  };
}

function mergeConfig(parsed: Partial<LeadHunterConfig>): LeadHunterConfig {
  return {
    needKeywords: parsed.needKeywords?.length ? parsed.needKeywords.map((s) => s.trim().toLowerCase()).filter(Boolean) : DEFAULT_LEAD_HUNTER_CONFIG.needKeywords,
    platformKeywords: parsed.platformKeywords?.length ? parsed.platformKeywords.map((s) => s.trim().toLowerCase()).filter(Boolean) : DEFAULT_LEAD_HUNTER_CONFIG.platformKeywords,
    businessModules: parsed.businessModules?.length ? parsed.businessModules.map((s) => s.trim().toLowerCase()).filter(Boolean) : DEFAULT_LEAD_HUNTER_CONFIG.businessModules,
    crmStatuses: parsed.crmStatuses?.length ? parsed.crmStatuses.map((s) => s.trim()).filter(Boolean) : DEFAULT_LEAD_HUNTER_CONFIG.crmStatuses,
    levels: parsed.levels?.length ? normalizeLevels(parsed.levels) : DEFAULT_LEAD_HUNTER_CONFIG.levels,
    scoreRules: normalizeScoreRules(parsed.scoreRules),
  };
}

export function loadLeadHunterConfig(): LeadHunterConfig {
  if (typeof window === 'undefined') return DEFAULT_LEAD_HUNTER_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeConfig(JSON.parse(raw) as Partial<LeadHunterConfig>);
    const legacy = window.localStorage.getItem('lead-hunter-config-v1');
    if (legacy) return mergeConfig(JSON.parse(legacy) as Partial<LeadHunterConfig>);
    return DEFAULT_LEAD_HUNTER_CONFIG;
  } catch {
    return DEFAULT_LEAD_HUNTER_CONFIG;
  }
}

export function saveLeadHunterConfig(config: LeadHunterConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetLeadHunterConfig(): LeadHunterConfig {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_LEAD_HUNTER_CONFIG;
}

export function configFromForm(input: {
  needKeywordsText: string;
  platformKeywordsText: string;
  businessModulesText: string;
  crmStatusesText: string;
  levels: LeadLevel[];
  scoreRules: LeadScoreRules;
}): LeadHunterConfig {
  return {
    needKeywords: splitLines(input.needKeywordsText),
    platformKeywords: splitLines(input.platformKeywordsText),
    businessModules: splitLines(input.businessModulesText),
    crmStatuses: input.crmStatusesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    levels: normalizeLevels(input.levels),
    scoreRules: normalizeScoreRules(input.scoreRules),
  };
}
