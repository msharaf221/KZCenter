import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { useApp } from '../../contexts/AppContext';

interface LayoutProps {
  children: ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const { sidebarOpen } = useApp();

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="rtl">
      <Sidebar />
      <div
        className="flex-1 flex flex-col transition-all duration-300"
        style={{ marginRight: sidebarOpen ? '256px' : '64px' }}
      >
        <Header title={title} />
        <main className="flex-1 p-6 mt-16">
          {children}
        </main>
      </div>
    </div>
  );
}
