import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LM Logprob Visualizer',
  description: 'Interactive token-level logprob visualization and chat client for local LLMs.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-screen bg-background text-foreground overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
