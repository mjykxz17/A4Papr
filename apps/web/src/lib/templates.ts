/**
 * Starter templates. Each one is a curated collection of blocks with
 * default placements that fits cleanly on an A4 page. Forking creates
 * a fresh cheatsheet on the user's device, then copies the blocks and
 * placements verbatim — the user owns the result and can edit it
 * freely.
 *
 * Adding a new template:
 *   1. Append a `Template` to `TEMPLATES` below.
 *   2. Each block in `blocks[]` is referenced by index in `placements[]`.
 *   3. Keep blocks <= 14 and placements within A4 (210 × 297 mm).
 *
 * Blocks here are intentionally pithy — students should view templates
 * as scaffolding, not finished products.
 */
import type { BlockContent, BlockType } from '@cheatsheet/shared';

export interface TemplateBlock {
  type: BlockType;
  content: BlockContent;
  tags: string[];
}

export interface TemplatePlacement {
  /** Index into the parent template's `blocks[]` array. */
  blockIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Defaults to 0; only set if you need overlap ordering. */
  zIndex?: number;
}

export interface Template {
  id: string;
  name: string;
  /** One-sentence pitch shown in the picker. */
  description: string;
  /** Audience tag — used for filtering / niche positioning later. */
  audience: string;
  blocks: TemplateBlock[];
  placements: TemplatePlacement[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'calc-1',
    name: 'Calculus I — derivatives & integrals',
    description: 'Rules, common derivatives, common integrals, and series expansions.',
    audience: 'STEM undergrad',
    blocks: [
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            "**Derivative rules**\n- Sum: $(f+g)' = f' + g'$\n- Product: $(fg)' = f'g + fg'$\n- Quotient, Chain",
          fontSize: 'sm',
          align: 'left',
        },
        tags: ['calculus', 'derivatives', 'rules'],
      },
      {
        type: 'formula',
        content: { type: 'formula', latex: '\\frac{d}{dx} x^n = n x^{n-1}', displayMode: true },
        tags: ['calculus', 'derivatives'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: '\\frac{d}{dx} \\sin x = \\cos x \\quad \\frac{d}{dx} \\cos x = -\\sin x',
          displayMode: true,
        },
        tags: ['calculus', 'derivatives', 'trig'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: '\\frac{d}{dx} e^x = e^x \\quad \\frac{d}{dx} \\ln x = \\frac{1}{x}',
          displayMode: true,
        },
        tags: ['calculus', 'derivatives'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: '\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C \\quad (n \\ne -1)',
          displayMode: true,
        },
        tags: ['calculus', 'integrals'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: '\\int \\frac{1}{x} \\, dx = \\ln |x| + C',
          displayMode: true,
        },
        tags: ['calculus', 'integrals'],
      },
      {
        type: 'table',
        content: {
          type: 'table',
          headers: ['f(x)', "f'(x)"],
          rows: [
            ['tan x', 'sec² x'],
            ['sec x', 'sec x · tan x'],
            ['arctan x', '1/(1+x²)'],
            ['arcsin x', '1/√(1−x²)'],
          ],
          compact: true,
          headerStyle: 'bold',
        },
        tags: ['calculus', 'derivatives', 'reference'],
      },
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            '**Taylor series at 0**\n- $e^x = \\sum x^n/n!$\n- $\\sin x = \\sum (-1)^n x^{2n+1}/(2n+1)!$\n- $\\cos x = \\sum (-1)^n x^{2n}/(2n)!$',
          fontSize: 'xs',
          align: 'left',
        },
        tags: ['calculus', 'series'],
      },
    ],
    placements: [
      { blockIndex: 0, x: 15, y: 15, width: 85, height: 30 },
      { blockIndex: 1, x: 110, y: 15, width: 85, height: 14 },
      { blockIndex: 2, x: 110, y: 32, width: 85, height: 14 },
      { blockIndex: 3, x: 15, y: 50, width: 85, height: 14 },
      { blockIndex: 4, x: 110, y: 50, width: 85, height: 14 },
      { blockIndex: 5, x: 15, y: 68, width: 85, height: 14 },
      { blockIndex: 6, x: 15, y: 88, width: 90, height: 50 },
      { blockIndex: 7, x: 110, y: 68, width: 85, height: 70 },
    ],
  },
  {
    id: 'linear-algebra',
    name: 'Linear algebra essentials',
    description: 'Matrix ops, determinants, eigenvalues, and the spectral theorem.',
    audience: 'STEM undergrad',
    blocks: [
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            '**Matrix multiply** $(AB)_{ij} = \\sum_k A_{ik} B_{kj}$. *Not commutative.* Associative.',
          fontSize: 'sm',
          align: 'left',
        },
        tags: ['linalg', 'matrices'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: '\\det(AB) = \\det(A)\\det(B), \\quad \\det(A^{-1}) = 1/\\det(A)',
          displayMode: true,
        },
        tags: ['linalg', 'determinants'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: 'A v = \\lambda v \\quad \\Leftrightarrow \\quad \\det(A - \\lambda I) = 0',
          displayMode: true,
        },
        tags: ['linalg', 'eigenvalues'],
      },
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            '**Spectral thm.** Symmetric $A$ ⇒ orthogonal eigenvectors, real eigenvalues. Diagonalisable as $A = Q \\Lambda Q^T$.',
          fontSize: 'sm',
          align: 'left',
        },
        tags: ['linalg', 'eigenvalues', 'spectral'],
      },
      {
        type: 'table',
        content: {
          type: 'table',
          headers: ['Property', 'Implication'],
          rows: [
            ['det = 0', 'singular, no inverse'],
            ['det ≠ 0', 'invertible, full rank'],
            ['Hermitian', 'real eigenvalues'],
            ['Orthogonal Q', 'Q⁻¹ = Qᵀ'],
            ['Symmetric', 'diagonalisable'],
          ],
          compact: true,
          headerStyle: 'bold',
        },
        tags: ['linalg', 'reference'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: '\\|x\\|_2 = \\sqrt{x^T x}, \\quad \\langle x, y \\rangle = x^T y',
          displayMode: true,
        },
        tags: ['linalg', 'norms'],
      },
    ],
    placements: [
      { blockIndex: 0, x: 15, y: 15, width: 90, height: 22 },
      { blockIndex: 1, x: 110, y: 15, width: 85, height: 14 },
      { blockIndex: 2, x: 15, y: 42, width: 90, height: 18 },
      { blockIndex: 3, x: 15, y: 65, width: 90, height: 26 },
      { blockIndex: 4, x: 110, y: 35, width: 85, height: 60 },
      { blockIndex: 5, x: 110, y: 100, width: 85, height: 14 },
    ],
  },
  {
    id: 'algorithms',
    name: 'Algorithms cheatsheet (CS)',
    description: 'Big-O for common ops, classic recurrences, and a Master-theorem table.',
    audience: 'CS undergrad',
    blocks: [
      {
        type: 'table',
        content: {
          type: 'table',
          headers: ['Op', 'Array', 'Linked', 'Hash', 'BST'],
          rows: [
            ['access', 'O(1)', 'O(n)', '—', 'O(log n)'],
            ['search', 'O(n)', 'O(n)', 'O(1)', 'O(log n)'],
            ['insert', 'O(n)', 'O(1)', 'O(1)', 'O(log n)'],
            ['delete', 'O(n)', 'O(1)', 'O(1)', 'O(log n)'],
          ],
          compact: true,
          headerStyle: 'shaded',
        },
        tags: ['ds', 'complexity'],
      },
      {
        type: 'table',
        content: {
          type: 'table',
          headers: ['Sort', 'Best', 'Avg', 'Worst', 'Space'],
          rows: [
            ['merge', 'n log n', 'n log n', 'n log n', 'O(n)'],
            ['quick', 'n log n', 'n log n', 'n²', 'O(log n)'],
            ['heap', 'n log n', 'n log n', 'n log n', 'O(1)'],
            ['radix', 'nk', 'nk', 'nk', 'O(n+k)'],
          ],
          compact: true,
          headerStyle: 'shaded',
        },
        tags: ['sort', 'complexity'],
      },
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            '**Master theorem.** $T(n) = aT(n/b) + f(n)$\n- $f = O(n^c), c < \\log_b a$ → $T = \\Theta(n^{\\log_b a})$\n- $c = \\log_b a$ → $T = \\Theta(n^c \\log n)$\n- $c > \\log_b a$ → $T = \\Theta(f(n))$',
          fontSize: 'xs',
          align: 'left',
        },
        tags: ['recurrence', 'complexity'],
      },
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            '**Graph traversals**\n- BFS: queue, shortest path on unweighted graphs, O(V+E)\n- DFS: stack/recursion, topo sort, cycle detection, O(V+E)\n- Dijkstra: pq, non-negative weights, O((V+E) log V)\n- Bellman–Ford: O(VE), handles negatives',
          fontSize: 'xs',
          align: 'left',
        },
        tags: ['graphs'],
      },
    ],
    placements: [
      { blockIndex: 0, x: 15, y: 15, width: 90, height: 50 },
      { blockIndex: 1, x: 110, y: 15, width: 90, height: 50 },
      { blockIndex: 2, x: 15, y: 70, width: 90, height: 50 },
      { blockIndex: 3, x: 110, y: 70, width: 90, height: 60 },
    ],
  },
  {
    id: 'physics-mechanics',
    name: 'Physics — classical mechanics',
    description: "Kinematics, Newton's laws, energy, rotational dynamics.",
    audience: 'STEM undergrad',
    blocks: [
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex:
            'v = v_0 + at, \\quad x = x_0 + v_0 t + \\tfrac{1}{2} a t^2, \\quad v^2 = v_0^2 + 2 a \\Delta x',
          displayMode: true,
        },
        tags: ['kinematics'],
      },
      {
        type: 'formula',
        content: { type: 'formula', latex: 'F = m a', displayMode: true },
        tags: ['newton'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex: 'KE = \\tfrac{1}{2} m v^2, \\quad PE_{\\text{grav}} = m g h',
          displayMode: true,
        },
        tags: ['energy'],
      },
      {
        type: 'formula',
        content: {
          type: 'formula',
          latex:
            '\\tau = I \\alpha, \\quad L = I \\omega, \\quad KE_{\\text{rot}} = \\tfrac{1}{2} I \\omega^2',
          displayMode: true,
        },
        tags: ['rotation'],
      },
      {
        type: 'table',
        content: {
          type: 'table',
          headers: ['Shape', 'I (about CoM)'],
          rows: [
            ['solid sphere', '(2/5) m r²'],
            ['hollow sphere', '(2/3) m r²'],
            ['solid cylinder', '(1/2) m r²'],
            ['rod (end)', '(1/3) m L²'],
            ['rod (centre)', '(1/12) m L²'],
          ],
          compact: true,
          headerStyle: 'bold',
        },
        tags: ['rotation', 'reference'],
      },
      {
        type: 'text',
        content: {
          type: 'text',
          markdown:
            '**Conservation laws**\n- *Linear momentum* $\\sum p$ when $\\sum F_{ext} = 0$.\n- *Angular momentum* $\\sum L$ when $\\sum \\tau_{ext} = 0$.\n- *Mechanical energy* when only conservative forces.',
          fontSize: 'sm',
          align: 'left',
        },
        tags: ['conservation'],
      },
    ],
    placements: [
      { blockIndex: 0, x: 15, y: 15, width: 90, height: 16 },
      { blockIndex: 1, x: 110, y: 15, width: 50, height: 12 },
      { blockIndex: 2, x: 15, y: 36, width: 90, height: 14 },
      { blockIndex: 3, x: 15, y: 55, width: 90, height: 14 },
      { blockIndex: 4, x: 110, y: 32, width: 90, height: 60 },
      { blockIndex: 5, x: 15, y: 75, width: 90, height: 35 },
    ],
  },
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
