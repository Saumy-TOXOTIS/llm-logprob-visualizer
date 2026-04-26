'use client';

import { AppLayout } from '@/components/layout/AppLayout';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { FullscreenReader } from '@/components/chat/FullscreenReader';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K -> Search could be mapped to focusing a mock search input in sidebar
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        // search implementation logic placeholder
        console.log('Search focus requested via Ctrl+K');
      }
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        // regenerate logic placeholder
        console.log('Regenerate last message requested via Ctrl+R');
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        // branch logic placeholder
        console.log('Branch chat requested via Ctrl+B');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main className="h-screen w-full relative">
      <AppLayout 
        sidebar={<Sidebar />}
        chat={<ChatPanel />}
        analytics={<AnalyticsPanel />}
      />
      <FullscreenReader />
    </main>
  );
}
