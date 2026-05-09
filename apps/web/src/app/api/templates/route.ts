/**
 * GET /api/templates
 * Returns the list of starter templates (id, name, description, audience)
 * for the picker UI. Doesn't require a session — same content for every
 * caller.
 */
import { NextResponse } from 'next/server';
import { TEMPLATES } from '@/lib/templates';
import { withRoute } from '@/lib/route-helpers';

export const GET = withRoute(
  async () => {
    return NextResponse.json({
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        audience: t.audience,
        blockCount: t.blocks.length,
      })),
    });
  },
  { requireSession: false, csrf: false },
);
