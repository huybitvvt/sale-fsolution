import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'material-symbols/outlined.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Seeding Fsolution',
  description: 'Theo dõi bài viết, lọc bình luận và quản lý sale đa kênh',
  icons: {
    icon: '/st-real-logo.jpg',
    shortcut: '/favicon.ico',
  },
};

const roboto = Roboto({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-roboto',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${roboto.className} ${roboto.variable}`}>{children}</body>
    </html>
  );
}
