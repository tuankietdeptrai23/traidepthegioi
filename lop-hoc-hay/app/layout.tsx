import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Lớp Học Hay · Cùng lớp tiến bộ', description: 'Không gian quản lí lớp học, thi đua, quỹ lớp và rèn luyện.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="vi"><body>{children}</body></html>; }
