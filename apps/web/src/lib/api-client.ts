import type {
  Block,
  CreateBlockInput,
  PlacementPatch,
  UpdateBlockInput,
} from '@cheatsheet/shared';

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  createBlock(input: CreateBlockInput): Promise<Block> {
    return request<Block>('/api/blocks', { method: 'POST', body: JSON.stringify(input) });
  },
  updateBlock(id: string, input: UpdateBlockInput): Promise<Block> {
    return request<Block>(`/api/blocks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  deleteBlock(id: string): Promise<void> {
    return request<void>(`/api/blocks/${id}`, { method: 'DELETE' });
  },
  patchPlacements(cheatsheetId: string, patch: PlacementPatch): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/cheatsheets/${cheatsheetId}/placements`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
  },
  exportPdf(cheatsheetId: string): Promise<Blob> {
    return fetch(`/api/cheatsheets/${cheatsheetId}/export`, {
      method: 'POST',
      credentials: 'same-origin',
    }).then((res) => {
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      return res.blob();
    });
  },
};
