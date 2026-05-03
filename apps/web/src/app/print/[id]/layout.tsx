import type { ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import './print.css';

/**
 * The print route shares the root <html>/<body> from src/app/layout.tsx.
 * This layout must NOT redeclare them (doing so causes a React hydration
 * mismatch and Next's dev overlay was being captured into the PDF).
 *
 * Body styles for print are scoped via the print.css `:has` selector
 * targeting the .print-root marker we put on the page wrapper.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
