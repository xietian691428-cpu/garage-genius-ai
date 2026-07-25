/**
 * Minimal typings for Node.js built-in `node:sqlite` (Node ≥ 22.5).
 * @types/node may lag behind experimental SQLite APIs.
 */

declare module "node:sqlite" {
  export interface DatabaseSyncOptions {
    readOnly?: boolean;
    enableForeignKeys?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
  }

  export class StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
