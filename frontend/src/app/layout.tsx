import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Imobi360 - Sistema de Gestão para Imobiliárias e Incorporadoras',
  description: 'Plataforma imobiliária de atendimento, CRM e gestão',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Imobi360',
  },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
