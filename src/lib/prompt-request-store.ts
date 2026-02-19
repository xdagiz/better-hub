import Database from "better-sqlite3";

const DB_PATH = process.env.GITHUB_SYNC_DB_PATH ?? "./better-github.db";

const globalForPromptDb = globalThis as typeof globalThis & {
  __promptDb?: Database.Database;
  __promptSchemaReady?: number;
};

function getDb(): Database.Database {
  if (!globalForPromptDb.__promptDb) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    globalForPromptDb.__promptDb = db;
  }
  ensureSchema(globalForPromptDb.__promptDb);
  return globalForPromptDb.__promptDb;
}

const SCHEMA_VERSION = 2;

function ensureSchema(db: Database.Database) {
  if (globalForPromptDb.__promptSchemaReady === SCHEMA_VERSION) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      pr_number INTEGER,
      conversation_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_requests_repo
      ON prompt_requests (owner, repo, status);

    CREATE INDEX IF NOT EXISTS idx_prompt_requests_user
      ON prompt_requests (user_id);
  `);

  // Migration: add error_message column if missing (for existing DBs)
  try {
    db.exec(`ALTER TABLE prompt_requests ADD COLUMN error_message TEXT`);
  } catch {
    // column already exists
  }

  globalForPromptDb.__promptSchemaReady = SCHEMA_VERSION;
}

// --- Interfaces ---

export type PromptRequestStatus = "open" | "processing" | "completed" | "rejected";

export interface PromptRequest {
  id: string;
  userId: string;
  owner: string;
  repo: string;
  title: string;
  body: string;
  status: PromptRequestStatus;
  prNumber: number | null;
  conversationId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PromptRequestRow {
  id: string;
  user_id: string;
  owner: string;
  repo: string;
  title: string;
  body: string;
  status: string;
  pr_number: number | null;
  conversation_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPromptRequest(row: PromptRequestRow): PromptRequest {
  return {
    id: row.id,
    userId: row.user_id,
    owner: row.owner,
    repo: row.repo,
    title: row.title,
    body: row.body,
    status: row.status as PromptRequestStatus,
    prNumber: row.pr_number,
    conversationId: row.conversation_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- CRUD ---

export function createPromptRequest(
  userId: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  conversationId?: string
): PromptRequest {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO prompt_requests (id, user_id, owner, repo, title, body, status, conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
  ).run(id, userId, owner, repo, title, body, conversationId ?? null, now, now);

  return {
    id,
    userId,
    owner,
    repo,
    title,
    body,
    status: "open",
    prNumber: null,
    conversationId: conversationId ?? null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getPromptRequest(id: string): PromptRequest | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM prompt_requests WHERE id = ?`)
    .get(id) as PromptRequestRow | undefined;
  return row ? rowToPromptRequest(row) : null;
}

export function listPromptRequests(
  owner: string,
  repo: string,
  opts?: { status?: PromptRequestStatus }
): PromptRequest[] {
  const db = getDb();

  if (opts?.status) {
    const rows = db
      .prepare(
        `SELECT * FROM prompt_requests WHERE owner = ? AND repo = ? AND status = ? ORDER BY created_at DESC`
      )
      .all(owner, repo, opts.status) as PromptRequestRow[];
    return rows.map(rowToPromptRequest);
  }

  const rows = db
    .prepare(
      `SELECT * FROM prompt_requests WHERE owner = ? AND repo = ? ORDER BY created_at DESC`
    )
    .all(owner, repo) as PromptRequestRow[];
  return rows.map(rowToPromptRequest);
}

export function countPromptRequests(
  owner: string,
  repo: string,
  status?: PromptRequestStatus
): number {
  const db = getDb();

  if (status) {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count FROM prompt_requests WHERE owner = ? AND repo = ? AND status = ?`
      )
      .get(owner, repo, status) as { count: number };
    return row.count;
  }

  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM prompt_requests WHERE owner = ? AND repo = ?`
    )
    .get(owner, repo) as { count: number };
  return row.count;
}

export function updatePromptRequestStatus(
  id: string,
  status: PromptRequestStatus,
  opts?: { prNumber?: number; errorMessage?: string | null }
): PromptRequest | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE prompt_requests SET status = ?, pr_number = COALESCE(?, pr_number), error_message = ?, updated_at = ? WHERE id = ?`
  ).run(status, opts?.prNumber ?? null, opts?.errorMessage ?? null, now, id);

  return getPromptRequest(id);
}

export function updatePromptRequestContent(
  id: string,
  updates: { title?: string; body?: string }
): PromptRequest | null {
  const db = getDb();
  const now = new Date().toISOString();

  const sets: string[] = ["updated_at = ?"];
  const params: any[] = [now];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    params.push(updates.title);
  }
  if (updates.body !== undefined) {
    sets.push("body = ?");
    params.push(updates.body);
  }

  params.push(id);
  db.prepare(`UPDATE prompt_requests SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  return getPromptRequest(id);
}

export function deletePromptRequest(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM prompt_requests WHERE id = ?`).run(id);
}
