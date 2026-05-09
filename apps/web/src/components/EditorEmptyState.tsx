'use client';

interface Props {
  onUseTemplate: () => void;
  onGenerate: () => void;
  onAddBlock: () => void;
  aiEnabled: boolean;
}

/**
 * First-time experience overlay shown when the canvas has no
 * placements. Three calls to action — pick the path with the lowest
 * activation cost for the user (templates) at the top.
 *
 * TODO(audience): the copy below leans STEM-undergrad. If you target a
 * different niche (med-school, law, A-level / JC students, language
 * learners), swap the headline + the template list to match. The
 * tighter the audience, the better this section converts.
 */
export function EditorEmptyState({ onUseTemplate, onGenerate, onAddBlock, aiEnabled }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-20">
      <div className="pointer-events-auto max-w-md rounded-xl border border-slate-200 bg-white/95 p-6 shadow-lg backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">
          One A4 page, optimised for the exam.
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Drag math, formulas, and notes onto a paper-accurate page. Pick the fastest start — a
          template, a paste of your lecture notes, or a blank page.
        </p>

        <div className="mt-4 grid gap-2">
          <button
            onClick={onUseTemplate}
            className="rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-accent hover:bg-accent/5"
          >
            <span className="block font-medium">Use a template</span>
            <span className="text-xs text-slate-500">
              Calculus, linear algebra, algorithms, classical mechanics.
            </span>
          </button>

          <button
            onClick={onGenerate}
            disabled={!aiEnabled}
            className="rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              aiEnabled
                ? 'Paste lecture notes; Claude proposes blocks for review.'
                : 'AI extraction is disabled (no ANTHROPIC_API_KEY).'
            }
          >
            <span className="block font-medium">
              Generate from notes {!aiEnabled && <span className="text-xs">(disabled)</span>}
            </span>
            <span className="text-xs text-slate-500">
              Paste your lecture text; you review every block before it lands.
            </span>
          </button>

          <button
            onClick={onAddBlock}
            className="rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-accent hover:bg-accent/5"
          >
            <span className="block font-medium">Start blank</span>
            <span className="text-xs text-slate-500">Build it block by block.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
