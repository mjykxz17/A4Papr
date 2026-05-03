import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import './print.css';

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: 'white' }}>{children}</body>
    </html>
  );
}
