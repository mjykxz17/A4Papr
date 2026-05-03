/** Re-export the shared db client so route handlers don't reach across packages. */
export { getDb, blocks, cheatsheets, blockPlacements } from '@cheatsheet/db';
export type {
  CheatsheetRow,
  BlockRow,
  BlockPlacementRow,
  NewCheatsheet,
  NewBlock,
  NewBlockPlacement,
} from '@cheatsheet/db';
