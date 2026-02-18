import Database from "better-sqlite3";

export type GithubSyncJobStatus = "pending" | "running" | "failed";

export interface GithubCacheEntry<T> {
  data: T;
  syncedAt: string;
}

export interface GithubSyncJob<TPayload = unknown> {
  id: number;
  userId: string;
  dedupeKey: string;
  jobType: string;
  payload: TPayload;
  attempts: number;
}

interface GithubSyncJobRow {
  id: number;
  user_id: string;
  dedupe_key: string;
  job_type: string;
  payload_json: string;
  attempts: number;
}

interface GithubCacheRow {
  data_json: string;
  synced_at: string;
}

const DB_PATH = process.env.GITHUB_SYNC_DB_PATH ?? "./better-github.db";
const MAX_ATTEMPTS = 8;
const RUNNING_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const globalForGithubSyncDb = globalThis as typeof globalThis & {
  __githubSyncDb?: Database.Database;
  __githubSyncSchemaReady?: boolean;
};

function getDb(): Database.Database {
  if (!globalForGithubSyncDb.__githubSyncDb) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    globalForGithubSyncDb.__githubSyncDb = db;
  }
  ensureSchema(globalForGithubSyncDb.__githubSyncDb);
  return globalForGithubSyncDb.__githubSyncDb;
}

function ensureSchema(db: Database.Database) {
  if (globalForGithubSyncDb.__githubSyncSchemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS github_cache_entries (
      user_id TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      cache_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (user_id, cache_key)
    );

    CREATE INDEX IF NOT EXISTS idx_github_cache_entries_user_cache_type
      ON github_cache_entries (user_id, cache_type);

    CREATE TABLE IF NOT EXISTS github_sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      job_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      started_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_sync_jobs_dedupe_active
      ON github_sync_jobs (user_id, dedupe_key)
      WHERE status IN ('pending', 'running');

    CREATE INDEX IF NOT EXISTS idx_github_sync_jobs_due
      ON github_sync_jobs (user_id, status, next_attempt_at, id);
  `);

  globalForGithubSyncDb.__githubSyncSchemaReady = true;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function getGithubCacheEntry<T>(
  userId: string,
  cacheKey: string
): GithubCacheEntry<T> | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT data_json, synced_at
       FROM github_cache_entries
       WHERE user_id = ? AND cache_key = ?`
    )
    .get(userId, cacheKey) as GithubCacheRow | undefined;

  if (!row) return null;

  return {
    data: parseJson<T>(row.data_json),
    syncedAt: row.synced_at,
  };
}

export function upsertGithubCacheEntry<T>(
  userId: string,
  cacheKey: string,
  cacheType: string,
  data: T
) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO github_cache_entries (user_id, cache_key, cache_type, data_json, synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, cache_key) DO UPDATE SET
       cache_type = excluded.cache_type,
       data_json = excluded.data_json,
       synced_at = excluded.synced_at`
  ).run(userId, cacheKey, cacheType, JSON.stringify(data), now);
}

export function enqueueGithubSyncJob<TPayload>(
  userId: string,
  dedupeKey: string,
  jobType: string,
  payload: TPayload
) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR IGNORE INTO github_sync_jobs
      (user_id, dedupe_key, job_type, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`
  ).run(userId, dedupeKey, jobType, JSON.stringify(payload), now, now, now);
}

function recoverTimedOutRunningJobs(db: Database.Database, userId: string) {
  const now = Date.now();
  const threshold = new Date(now - RUNNING_JOB_TIMEOUT_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  db.prepare(
    `UPDATE github_sync_jobs
     SET status = 'pending', started_at = NULL, updated_at = ?
     WHERE user_id = ? AND status = 'running' AND started_at IS NOT NULL AND started_at <= ?`
  ).run(nowIso, userId, threshold);
}

export function claimDueGithubSyncJobs<TPayload>(
  userId: string,
  limit = 5
): GithubSyncJob<TPayload>[] {
  const db = getDb();
  const now = new Date().toISOString();

  recoverTimedOutRunningJobs(db, userId);

  const rows = db
    .prepare(
      `SELECT id, user_id, dedupe_key, job_type, payload_json, attempts
       FROM github_sync_jobs
       WHERE user_id = ? AND status = 'pending' AND next_attempt_at <= ?
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT ?`
    )
    .all(userId, now, limit) as GithubSyncJobRow[];

  if (rows.length === 0) return [];

  const markRunning = db.prepare(
    `UPDATE github_sync_jobs
     SET status = 'running', started_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`
  );

  const claimed: GithubSyncJob<TPayload>[] = [];
  const startedAt = now;

  for (const row of rows) {
    const result = markRunning.run(startedAt, startedAt, row.id);
    if (result.changes === 0) continue;

    claimed.push({
      id: row.id,
      userId: row.user_id,
      dedupeKey: row.dedupe_key,
      jobType: row.job_type,
      payload: parseJson<TPayload>(row.payload_json),
      attempts: row.attempts,
    });
  }

  return claimed;
}

export function markGithubSyncJobSucceeded(id: number) {
  const db = getDb();
  db.prepare(`DELETE FROM github_sync_jobs WHERE id = ?`).run(id);
}

export function markGithubSyncJobFailed(id: number, attempts: number, error: string) {
  const db = getDb();
  const nextAttempts = attempts + 1;
  const now = Date.now();
  const status: GithubSyncJobStatus =
    nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

  const backoffSeconds = Math.min(15 * 60, Math.max(5, 2 ** nextAttempts));
  const nextAttemptAt = new Date(now + backoffSeconds * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  db.prepare(
    `UPDATE github_sync_jobs
     SET status = ?,
         attempts = ?,
         next_attempt_at = ?,
         started_at = NULL,
         last_error = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(status, nextAttempts, nextAttemptAt, error.slice(0, 2000), nowIso, id);
}

