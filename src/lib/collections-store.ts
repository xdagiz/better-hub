import Database from "better-sqlite3";

const DB_PATH = process.env.GITHUB_SYNC_DB_PATH ?? "./better-github.db";

const globalForCollDb = globalThis as typeof globalThis & {
  __collDb?: Database.Database;
  __collSchemaReady?: boolean;
};

function getDb(): Database.Database {
  if (!globalForCollDb.__collDb) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    globalForCollDb.__collDb = db;
  }
  ensureSchema(globalForCollDb.__collDb);
  return globalForCollDb.__collDb;
}

function ensureSchema(db: Database.Database) {
  if (globalForCollDb.__collSchemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pr_collections_user_updated
      ON pr_collections (user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS pr_collection_items (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES pr_collections(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_title TEXT NOT NULL,
      reviewed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pr_collection_items_coll_pos
      ON pr_collection_items (collection_id, position);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_collection_items_unique_pr
      ON pr_collection_items (collection_id, owner, repo, pr_number);
  `);

  globalForCollDb.__collSchemaReady = true;
}

// --- Interfaces ---

export interface Collection {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  reviewed: boolean;
  position: number;
  addedAt: string;
}

interface CollectionRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface CollectionItemRow {
  id: string;
  collection_id: string;
  owner: string;
  repo: string;
  pr_number: number;
  pr_title: string;
  reviewed: number;
  position: number;
  added_at: string;
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToItem(row: CollectionItemRow): CollectionItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    owner: row.owner,
    repo: row.repo,
    prNumber: row.pr_number,
    prTitle: row.pr_title,
    reviewed: row.reviewed === 1,
    position: row.position,
    addedAt: row.added_at,
  };
}

// --- Collection CRUD ---

export function createCollection(userId: string, name: string): Collection {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO pr_collections (id, user_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, name, now, now);

  return { id, userId, name, createdAt: now, updatedAt: now };
}

export function listCollections(userId: string): Collection[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM pr_collections WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId) as CollectionRow[];
  return rows.map(rowToCollection);
}

export function getCollection(
  collectionId: string,
  userId: string
): Collection | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM pr_collections WHERE id = ? AND user_id = ?`)
    .get(collectionId, userId) as CollectionRow | undefined;
  return row ? rowToCollection(row) : null;
}

export function renameCollection(
  collectionId: string,
  userId: string,
  name: string
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE pr_collections SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(name, now, collectionId, userId);
}

export function deleteCollection(
  collectionId: string,
  userId: string
): void {
  const db = getDb();
  db.prepare(`DELETE FROM pr_collection_items WHERE collection_id = ?`).run(
    collectionId
  );
  db.prepare(
    `DELETE FROM pr_collections WHERE id = ? AND user_id = ?`
  ).run(collectionId, userId);
}

// --- Item CRUD ---

export function addItem(
  collectionId: string,
  userId: string,
  item: { owner: string; repo: string; prNumber: number; prTitle: string }
): CollectionItem | null {
  const db = getDb();

  // Verify ownership
  const coll = db
    .prepare(`SELECT id FROM pr_collections WHERE id = ? AND user_id = ?`)
    .get(collectionId, userId) as { id: string } | undefined;
  if (!coll) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get next position
  const maxPos = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) as max_pos FROM pr_collection_items WHERE collection_id = ?`
    )
    .get(collectionId) as { max_pos: number };

  try {
    db.prepare(
      `INSERT INTO pr_collection_items (id, collection_id, owner, repo, pr_number, pr_title, reviewed, position, added_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      collectionId,
      item.owner,
      item.repo,
      item.prNumber,
      item.prTitle,
      maxPos.max_pos + 1,
      now
    );
  } catch {
    // Unique constraint violation — PR already in collection
    return null;
  }

  // Touch collection updated_at
  db.prepare(
    `UPDATE pr_collections SET updated_at = ? WHERE id = ?`
  ).run(now, collectionId);

  return {
    id,
    collectionId,
    owner: item.owner,
    repo: item.repo,
    prNumber: item.prNumber,
    prTitle: item.prTitle,
    reviewed: false,
    position: maxPos.max_pos + 1,
    addedAt: now,
  };
}

export function removeItem(itemId: string, userId: string): void {
  const db = getDb();
  // Join to verify ownership
  db.prepare(
    `DELETE FROM pr_collection_items
     WHERE id = ? AND collection_id IN (
       SELECT id FROM pr_collections WHERE user_id = ?
     )`
  ).run(itemId, userId);
}

export function getItems(
  collectionId: string,
  userId: string
): CollectionItem[] {
  const db = getDb();

  // Verify ownership
  const coll = db
    .prepare(`SELECT id FROM pr_collections WHERE id = ? AND user_id = ?`)
    .get(collectionId, userId) as { id: string } | undefined;
  if (!coll) return [];

  const rows = db
    .prepare(
      `SELECT * FROM pr_collection_items WHERE collection_id = ? ORDER BY position ASC`
    )
    .all(collectionId) as CollectionItemRow[];
  return rows.map(rowToItem);
}

export function toggleReviewed(
  itemId: string,
  userId: string,
  reviewed: boolean
): void {
  const db = getDb();
  db.prepare(
    `UPDATE pr_collection_items
     SET reviewed = ?
     WHERE id = ? AND collection_id IN (
       SELECT id FROM pr_collections WHERE user_id = ?
     )`
  ).run(reviewed ? 1 : 0, itemId, userId);
}

export function getCollectionsForPR(
  userId: string,
  owner: string,
  repo: string,
  prNumber: number
): { collection: Collection; hasItem: boolean }[] {
  const db = getDb();
  const collections = db
    .prepare(
      `SELECT * FROM pr_collections WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId) as CollectionRow[];

  return collections.map((row) => {
    const item = db
      .prepare(
        `SELECT id FROM pr_collection_items
         WHERE collection_id = ? AND owner = ? AND repo = ? AND pr_number = ?`
      )
      .get(row.id, owner, repo, prNumber) as { id: string } | undefined;
    return {
      collection: rowToCollection(row),
      hasItem: !!item,
    };
  });
}
