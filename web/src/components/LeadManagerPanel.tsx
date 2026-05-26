'use client';

import type { Lead } from '@/lib/types';
import { pct } from '@/lib/format';

type LeadRow = Lead & { post_id?: string };

export function LeadManagerPanel({
  leads,
  onExtract,
  onSyncPhones,
}: {
  leads: Record<string, Lead[]>;
  onExtract: () => Promise<void>;
  onSyncPhones: () => Promise<void>;
}) {
  const rows: LeadRow[] = Object.entries(leads).flatMap(([postId, items]) => (items || []).map((item) => ({ ...item, post_id: postId })));

  return (
    <section className="module-panel">
      <div className="module-head">
        <div>
          <div className="module-kicker">Lead</div>
          <h2>Khách hàng tiềm năng</h2>
        </div>
        <div className="module-actions">
          <button type="button" className="btn-cancel" onClick={() => void onSyncPhones()}>
            Lấy SĐT từ comment
          </button>
          <button type="button" className="btn-submit" onClick={() => void onExtract()}>
            Tách lead AI
          </button>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Nhu cầu</th>
              <th>SĐT</th>
              <th>Nguồn</th>
              <th>Bài viết</th>
              <th>Link</th>
              <th>Độ chắc</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((item, idx) => (
                <tr key={`${item.post_id}-${idx}`}>
                  <td>
                    <b>{item.name || 'Ẩn danh'}</b>
                    <small>{item.location || item.product_or_service || ''}</small>
                  </td>
                  <td>{item.need || item.evidence || '-'}</td>
                  <td>{item.phone || '-'}</td>
                  <td>{item.platform ? `${item.platform} · ` : ''}{item.source === 'post' ? 'Bài viết' : 'Bình luận'}</td>
                  <td className="mono-cell">{item.post_id || '-'}</td>
                  <td>
                    {(item.comment_url || item.post_url) ? (
                      <a href={item.comment_url || item.post_url} target="_blank" rel="noreferrer">
                        Mở
                      </a>
                    ) : '-'}
                  </td>
                  <td>{pct(item.confidence) || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="table-empty">
                  Chưa có lead. Bấm Lấy SĐT từ comment hoặc Tách lead AI sau khi tải bài/comment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
