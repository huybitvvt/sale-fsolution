'use client';

type Props = {
  compact?: boolean;
};

export function CookieRefreshGuide({ compact = false }: Props) {
  const steps = [
    'Mở Chrome và đăng nhập đúng tài khoản Facebook của nhân sự.',
    'Vào Facebook, xử lý hết xác minh/captcha nếu Facebook yêu cầu.',
    'Dùng Cookie Editor trên facebook.com và export dạng Header String.',
    'Cookie mới phải có c_user=... và xs=... rồi dán vào đúng nhân sự.',
    'Bấm lưu, sau đó tải lại bài viết để kiểm tra.',
  ];

  return (
    <div className={`cookie-refresh-guide${compact ? ' compact' : ''}`}>
      <div className="cookie-refresh-title">
        <span>🍪</span>
        <div>
          <b>Cookie Facebook hết hạn?</b>
          <small>Cập nhật lại cookie theo các bước dưới đây.</small>
        </div>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="cookie-refresh-note">
        Lưu ý: mỗi nhân sự dùng cookie Facebook riêng. Không dùng chung cookie cho nhiều tài khoản.
      </div>
    </div>
  );
}
