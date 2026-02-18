import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.env.GITHUB_SYNC_DB_PATH ?? "./better-github.db";

const globalForEmbedDb = globalThis as typeof globalThis & {
  __embedDb?: Database.Database;
  __embedSchemaReady?: boolean;
};

function getDb(): Database.Database {
  if (!globalForEmbedDb.__embedDb) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    globalForEmbedDb.__embedDb = db;
  }
  ensureSchema(globalForEmbedDb.__embedDb);
  return globalForEmbedDb.__embedDb;
}

function ensureSchema(db: Database.Database) {
  if (globalForEmbedDb.__embedSchemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_embeddings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content_key TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      item_number INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      title TEXT,
      snippet TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_search_embeddings_user_repo
      ON search_embeddings (user_id, owner, repo);

    CREATE INDEX IF NOT EXISTS idx_search_embeddings_user_content
      ON search_embeddings (user_id, content_type, content_key);
  `);

  globalForEmbedDb.__embedSchemaReady = true;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContentType =
  | "pr"
  | "issue"
  | "pr_comment"
  | "issue_comment"
  | "review";

export interface EmbeddingEntry {
  userId: string;
  contentType: ContentType;
  contentKey: string;
  owner: string;
  repo: string;
  itemNumber: number;
  contentHash: string;
  embedding: number[];
  title: string | null;
  snippet: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  contentType: ContentType;
  contentKey: string;
  owner: string;
  repo: string;
  itemNumber: number;
  title: string | null;
  snippet: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

interface EmbeddingRow {
  id: string;
  user_id: string;
  content_type: string;
  content_key: string;
  owner: string;
  repo: string;
  item_number: number;
  content_hash: string;
  embedding_json: string;
  title: string | null;
  snippet: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeId(
  userId: string,
  contentType: string,
  contentKey: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${contentType}:${contentKey}`)
    .digest("hex");
}

export function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function getExistingContentHash(
  userId: string,
  contentType: string,
  contentKey: string
): string | null {
  const db = getDb();
  const id = makeId(userId, contentType, contentKey);
  const row = db
    .prepare(`SELECT content_hash FROM search_embeddings WHERE id = ?`)
    .get(id) as { content_hash: string } | undefined;
  return row?.content_hash ?? null;
}

export function upsertEmbedding(entry: EmbeddingEntry): void {
  const db = getDb();
  const id = makeId(entry.userId, entry.contentType, entry.contentKey);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO search_embeddings (id, user_id, content_type, content_key, owner, repo, item_number, content_hash, embedding_json, title, snippet, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content_hash = excluded.content_hash,
       embedding_json = excluded.embedding_json,
       title = excluded.title,
       snippet = excluded.snippet,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`
  ).run(
    id,
    entry.userId,
    entry.contentType,
    entry.contentKey,
    entry.owner,
    entry.repo,
    entry.itemNumber,
    entry.contentHash,
    JSON.stringify(entry.embedding),
    entry.title,
    entry.snippet,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    now,
    now
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────

export function searchEmbeddings(
  userId: string,
  queryEmbedding: number[],
  options: {
    owner?: string;
    repo?: string;
    topK?: number;
    contentTypes?: ContentType[];
  } = {}
): SearchResult[] {
  const db = getDb();
  const { owner, repo, topK = 30, contentTypes } = options;

  // Build query with filters
  const conditions: string[] = ["user_id = ?"];
  const params: (string | number)[] = [userId];

  if (owner) {
    conditions.push("owner = ?");
    params.push(owner);
  }
  if (repo) {
    conditions.push("repo = ?");
    params.push(repo);
  }
  if (contentTypes && contentTypes.length > 0) {
    conditions.push(
      `content_type IN (${contentTypes.map(() => "?").join(",")})`
    );
    params.push(...contentTypes);
  }

  const rows = db
    .prepare(
      `SELECT * FROM search_embeddings WHERE ${conditions.join(" AND ")}`
    )
    .all(...params) as EmbeddingRow[];

  // Compute cosine similarity in JS
  const scored = rows.map((row) => {
    const embedding = JSON.parse(row.embedding_json) as number[];
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return {
      contentType: row.content_type as ContentType,
      contentKey: row.content_key,
      owner: row.owner,
      repo: row.repo,
      itemNumber: row.item_number,
      title: row.title,
      snippet: row.snippet,
      metadata: row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : null,
      similarity,
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

export function keywordSearch(
  userId: string,
  query: string,
  options: {
    owner?: string;
    repo?: string;
    topK?: number;
    contentTypes?: ContentType[];
  } = {}
): SearchResult[] {
  const db = getDb();
  const { owner, repo, topK = 20, contentTypes } = options;

  const conditions: string[] = ["user_id = ?"];
  const params: (string | number)[] = [userId];

  if (owner) {
    conditions.push("owner = ?");
    params.push(owner);
  }
  if (repo) {
    conditions.push("repo = ?");
    params.push(repo);
  }
  if (contentTypes && contentTypes.length > 0) {
    conditions.push(
      `content_type IN (${contentTypes.map(() => "?").join(",")})`
    );
    params.push(...contentTypes);
  }

  // LIKE match on title and snippet
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (keywords.length > 0) {
    const likeClauses = keywords.map(
      () => "(LOWER(title) LIKE ? OR LOWER(snippet) LIKE ?)"
    );
    conditions.push(`(${likeClauses.join(" OR ")})`);
    for (const kw of keywords) {
      params.push(`%${kw}%`, `%${kw}%`);
    }
  }

  const rows = db
    .prepare(
      `SELECT * FROM search_embeddings WHERE ${conditions.join(" AND ")} LIMIT ?`
    )
    .all(...params, topK) as EmbeddingRow[];

  return rows.map((row) => ({
    contentType: row.content_type as ContentType,
    contentKey: row.content_key,
    owner: row.owner,
    repo: row.repo,
    itemNumber: row.item_number,
    title: row.title,
    snippet: row.snippet,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : null,
    similarity: 0,
  }));
}
