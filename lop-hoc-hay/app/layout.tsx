import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Lớp Học Số · Quản lý lớp học', description: 'Không gian quản lí lớp học, thi đua, quỹ lớp và rèn luyện.', icons: { icon: '/favicon.svg?v=21' } };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="vi"><body>{children}</body></html>; }
