'use client';

import type { ImageBlockContent } from '@cheatsheet/shared';

/**
 * Render an image inside its placement. Uses object-fit: contain so the
 * image preserves aspect ratio and never overflows the block's bounds.
 * The url is either a `/uploads/{hash}.{ext}` relative path served by
 * Next.js's static handler, or a full https URL pasted by the user.
 */
export function ImageBlockView({ content }: { content: ImageBlockContent }) {
  if (!content.url) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">
        No image
      </div>
    );
  }
  return (
    // Direct <img> is intentional: uploads are content-addressed and the
    // canvas controls dimensions explicitly, so Next's `<Image>` would
    // add no value here. The next/next/no-img-element rule isn't loaded
    // in this project's ESLint config.
    <img
      src={content.url}
      alt={content.alt}
      className="block h-full w-full object-contain"
      draggable={false}
    />
  );
}
