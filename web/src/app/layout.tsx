import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CrickEye Pro — AI Cricket Biomechanics & Net Tracking',
  description: 'AI-Powered Cricket Biomechanics, YOLOv8 Pose Estimation, and Delivery Tracking Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
