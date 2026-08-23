'use client';

import type { TableBlockContent } from '@cheatsheet/shared';

export function TableBlockView({ content }: { content: TableBlockContent }) {
  const padding = content.compact ? 'px-1 py-0.5' : 'px-2 py-1';
  const headerClass =
    content.headerStyle === 'bold'
      ? 'font-semibold border-b border-slate-700'
      : content.headerStyle === 'shaded'
        ? 'bg-slate-100 font-medium border-b border-slate-300'
        : '';

  return (
    <div className="h-full w-full overflow-hidden p-1">
      <table
        className="w-full border-collapse"
        style={{ fontSize: 'calc(7pt * var(--font-scale, 1))' }}
      >
        <thead>
          <tr>
            {content.headers.map((h, i) => (
              <th key={i} className={`${padding} ${headerClass} text-left`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {content.rows.map((row, r) => (
            <tr key={r} className="border-b border-slate-200">
              {row.map((cell, c) => (
                <td key={c} className={padding}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
