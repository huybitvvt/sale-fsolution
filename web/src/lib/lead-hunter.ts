import type { Lead } from '@/lib/types';
import {
  DEFAULT_LEAD_HUNTER_CONFIG,
  loadLeadHunterConfig,
  type LeadHunterConfig,
} from '@/lib/lead-hunter-config';

export type { LeadHunterConfig };
export { DEFAULT_LEAD_HUNTER_CONFIG, loadLeadHunterConfig };

export const LEAD_NEED_KEYWORDS = DEFAULT_LEAD_HUNTER_CONFIG.needKeywords;
export const LEAD_PLATFORM_KEYWORDS = DEFAULT_LEAD_HUNTER_CONFIG.platformKeywords;
export const LEAD_BUSINESS_MODULES = DEFAULT_LEAD_HUNTER_CONFIG.businessModules;
export const LEAD_CRM_STATUSES = DEFAULT_LEAD_HUNTER_CONFIG.crmStatuses;

export type LeadLevelId = 'cold' | 'interest' | 'warm' | 'hot' | 'vip';

export type LeadLevel = {
  id: LeadLevelId;
  label: string;
  min: number;
  max: number;
  color: string;
  bg: string;
};

export const LEAD_LEVELS: LeadLevel[] = DEFAULT_LEAD_HUNTER_CONFIG.levels;

export function getLeadHunterConfig(): LeadHunterConfig {
  return loadLeadHunterConfig();
}

export function getLeadCrmStatuses(config = getLeadHunterConfig()): string[] {
  return config.crmStatuses;
}

export function getLeadLevels(config = getLeadHunterConfig()): LeadLevel[] {
  return config.levels;
}

function haystack(lead: Lead): string {
  return [
    lead.need,
    lead.comment_text,
    lead.evidence,
    lead.product_or_service,
    lead.budget,
    lead.urgency,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function firstMatch(text: string, keywords: string[]): string {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return '';
}

export function detectLeadFields(lead: Lead, config = getLeadHunterConfig()) {
  const text = haystack(lead);
  return {
    matched_keyword: firstMatch(text, config.needKeywords),
    platform_tag: firstMatch(text, config.platformKeywords),
    business_module: firstMatch(text, config.businessModules),
  };
}

export function scoreLead(lead: Lead, config = getLeadHunterConfig()): { score: number; breakdown: string[] } {
  const text = haystack(lead);
  const rules = config.scoreRules;
  let score = 0;
  const breakdown: string[] = [];

  if (firstMatch(text, config.needKeywords)) {
    score += rules.needKeyword;
    breakdown.push(`Từ khóa nhu cầu +${rules.needKeyword}`);
  }
  if (text.includes('báo giá') || text.includes('bao gia')) {
    score += rules.priceRequest;
    breakdown.push(`Báo giá +${rules.priceRequest}`);
  }
  if (lead.phone || (lead.phones && lead.phones.length)) {
    score += rules.phone;
    breakdown.push(`SĐT +${rules.phone}`);
  }
  if (
    /trong tháng|trong tuần|tuần này|tháng này|deadline|hạn chót|triển khai trong/.test(text)
  ) {
    score += rules.deadline;
    breakdown.push(`Deadline +${rules.deadline}`);
  }
  if (/gấp|khẩn|urgent|asap|triển khai gấp/.test(text)) {
    score += rules.urgent;
    breakdown.push(`Yêu cầu gấp +${rules.urgent}`);
  }
  if (/ngân sách|budget|triệu|tỷ|chi phí/.test(text) || lead.budget) {
    score += rules.budget;
    breakdown.push(`Ngân sách +${rules.budget}`);
  }
  const fields = detectLeadFields(lead, config);
  if (fields.platform_tag || fields.business_module) {
    score += rules.matching;
    breakdown.push(`Matching solution +${rules.matching}`);
  }

  return { score, breakdown };
}

export function leadLevelFromScore(score: number, config = getLeadHunterConfig()): LeadLevel {
  for (const level of config.levels) {
    if (score >= level.min && score <= level.max) return level;
  }
  return config.levels[0]!;
}

export function defaultCrmStatus(lead: Lead, score: number, config = getLeadHunterConfig()): string {
  if (lead.crm_status) return lead.crm_status;
  if (score > 10) return config.crmStatuses[0] || 'Lead mới';
  return config.crmStatuses.includes('Theo dõi') ? 'Theo dõi' : (config.crmStatuses[config.crmStatuses.length - 1] || 'Theo dõi');
}

export function formatLeadDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

export function isProcessedLead(lead: Lead): boolean {
  return Boolean(lead.processed_at) || lead.source === 'processed_post';
}

export function enrichLead(
  lead: Lead,
  config = getLeadHunterConfig(),
): Lead & {
  score: number;
  lead_level: LeadLevelId;
  lead_level_label: string;
} {
  const { score, breakdown } = scoreLead(lead, config);
  const level = leadLevelFromScore(score, config);
  const fields = detectLeadFields(lead, config);
  return {
    ...lead,
    ...fields,
    score,
    score_breakdown: breakdown,
    lead_level: level.id,
    lead_level_label: level.label,
    crm_status: defaultCrmStatus(lead, score, config),
  };
}
