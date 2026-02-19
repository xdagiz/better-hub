import Database from "better-sqlite3";

const DB_PATH = process.env.GITHUB_SYNC_DB_PATH ?? "./better-github.db";

const globalForChatDb = globalThis as typeof globalThis & {
  __chatDb?: Database.Database;
  __chatSchemaReady?: boolean;
};

function getDb(): Database.Database {
  if (!globalForChatDb.__chatDb) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    globalForChatDb.__chatDb = db;
  }
  ensureSchema(globalForChatDb.__chatDb);
  return globalForChatDb.__chatDb;
}

function ensureSchema(db: Database.Database) {
  if (globalForChatDb.__chatSchemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      chat_type TEXT NOT NULL,
      context_key TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_user_context
      ON chat_conversations (user_id, context_key);

    CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_type
      ON chat_conversations (user_id, chat_type);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
      ON chat_messages (conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS ghost_tabs (
      user_id TEXT NOT NULL,
      tab_id TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (user_id, tab_id)
    );

    CREATE TABLE IF NOT EXISTS ghost_tab_state (
      user_id TEXT PRIMARY KEY,
      active_tab_id TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 1
    );
  `);

  globalForChatDb.__chatSchemaReady = true;
}

export interface ChatConversation {
  id: string;
  userId: string;
  chatType: string;
  contextKey: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  user_id: string;
  chat_type: string;
  context_key: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

function rowToConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    userId: row.user_id,
    chatType: row.chat_type,
    contextKey: row.context_key,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function getOrCreateConversation(
  userId: string,
  chatType: string,
  contextKey: string
): ChatConversation {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      `SELECT * FROM chat_conversations WHERE user_id = ? AND context_key = ?`
    )
    .get(userId, contextKey) as ConversationRow | undefined;

  if (existing) return rowToConversation(existing);

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO chat_conversations (id, user_id, chat_type, context_key, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, userId, chatType, contextKey, now, now);

  return {
    id,
    userId,
    chatType,
    contextKey,
    title: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveMessage(
  conversationId: string,
  message: { id: string; role: string; content: string }
): ChatMessage {
  const db = getDb();
  const now = new Date().toISOString();

  // Upsert message (in case of re-saves during streaming)
  db.prepare(
    `INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content`
  ).run(message.id, conversationId, message.role, message.content, now);

  // Update conversation timestamp and title
  db.prepare(
    `UPDATE chat_conversations SET updated_at = ? WHERE id = ?`
  ).run(now, conversationId);

  // Auto-generate title from first user message if not set
  if (message.role === "user") {
    db.prepare(
      `UPDATE chat_conversations SET title = ? WHERE id = ? AND title IS NULL`
    ).run(message.content.slice(0, 100), conversationId);
  }

  return {
    id: message.id,
    conversationId,
    role: message.role,
    content: message.content,
    createdAt: now,
  };
}

export function getConversation(
  userId: string,
  contextKey: string
): { conversation: ChatConversation; messages: ChatMessage[] } | null {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT * FROM chat_conversations WHERE user_id = ? AND context_key = ?`
    )
    .get(userId, contextKey) as ConversationRow | undefined;

  if (!row) return null;

  const messages = db
    .prepare(
      `SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC`
    )
    .all(row.id) as MessageRow[];

  return {
    conversation: rowToConversation(row),
    messages: messages.map(rowToMessage),
  };
}

export function deleteConversation(conversationId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM chat_messages WHERE conversation_id = ?`).run(
    conversationId
  );
  db.prepare(`DELETE FROM chat_conversations WHERE id = ?`).run(
    conversationId
  );
}

export function listConversations(
  userId: string,
  chatType?: string
): ChatConversation[] {
  const db = getDb();

  const rows = chatType
    ? (db
        .prepare(
          `SELECT * FROM chat_conversations WHERE user_id = ? AND chat_type = ? ORDER BY updated_at DESC LIMIT 50`
        )
        .all(userId, chatType) as ConversationRow[])
    : (db
        .prepare(
          `SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
        )
        .all(userId) as ConversationRow[]);

  return rows.map(rowToConversation);
}

// ─── Ghost Tabs ────────────────────────────────────────────────────────────

export interface GhostTab {
  id: string;
  label: string;
}

export interface GhostTabState {
  tabs: GhostTab[];
  activeTabId: string;
  counter: number;
}

interface GhostTabRow {
  user_id: string;
  tab_id: string;
  label: string;
  position: number;
}

interface GhostTabStateRow {
  user_id: string;
  active_tab_id: string;
  counter: number;
}

function generateTabId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultGhostTabState(): { tabs: GhostTab[]; activeTabId: string; counter: number } {
  const id = generateTabId();
  return { tabs: [{ id, label: "Thread 1" }], activeTabId: id, counter: 1 };
}

export function getGhostTabState(userId: string): GhostTabState {
  const db = getDb();

  const tabs = db
    .prepare(`SELECT * FROM ghost_tabs WHERE user_id = ? ORDER BY position ASC`)
    .all(userId) as GhostTabRow[];

  const stateRow = db
    .prepare(`SELECT * FROM ghost_tab_state WHERE user_id = ?`)
    .get(userId) as GhostTabStateRow | undefined;

  if (tabs.length === 0 || !stateRow) {
    // Initialize default state for new users
    const defaults = createDefaultGhostTabState();
    const insertTab = db.prepare(
      `INSERT OR REPLACE INTO ghost_tabs (user_id, tab_id, label, position) VALUES (?, ?, ?, ?)`
    );
    const insertState = db.prepare(
      `INSERT OR REPLACE INTO ghost_tab_state (user_id, active_tab_id, counter) VALUES (?, ?, ?)`
    );
    db.transaction(() => {
      insertTab.run(userId, defaults.tabs[0].id, defaults.tabs[0].label, 0);
      insertState.run(userId, defaults.activeTabId, defaults.counter);
    })();
    return defaults;
  }

  return {
    tabs: tabs.map((t) => ({ id: t.tab_id, label: t.label })),
    activeTabId: stateRow.active_tab_id,
    counter: stateRow.counter,
  };
}

export function addGhostTab(
  userId: string,
  tabId: string,
  label: string,
  counter: number
): void {
  const db = getDb();

  // Get max position
  const maxPos = db
    .prepare(`SELECT MAX(position) as mp FROM ghost_tabs WHERE user_id = ?`)
    .get(userId) as { mp: number | null };
  const position = (maxPos?.mp ?? -1) + 1;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO ghost_tabs (user_id, tab_id, label, position) VALUES (?, ?, ?, ?)`
    ).run(userId, tabId, label, position);
    db.prepare(
      `INSERT OR REPLACE INTO ghost_tab_state (user_id, active_tab_id, counter) VALUES (?, ?, ?)`
    ).run(userId, tabId, counter);
  })();
}

export function closeGhostTab(
  userId: string,
  tabId: string,
  newDefault?: { id: string; label: string; counter: number }
): void {
  const db = getDb();

  const tabs = db
    .prepare(`SELECT * FROM ghost_tabs WHERE user_id = ? ORDER BY position ASC`)
    .all(userId) as GhostTabRow[];

  const stateRow = db
    .prepare(`SELECT * FROM ghost_tab_state WHERE user_id = ?`)
    .get(userId) as GhostTabStateRow | undefined;

  const remaining = tabs.filter((t) => t.tab_id !== tabId);

  if (remaining.length === 0) {
    // Reset to default using client-provided details (or generate fallback)
    const def = newDefault ?? { id: generateTabId(), label: "Thread 1", counter: 1 };
    db.transaction(() => {
      db.prepare(`DELETE FROM ghost_tabs WHERE user_id = ?`).run(userId);
      db.prepare(
        `INSERT INTO ghost_tabs (user_id, tab_id, label, position) VALUES (?, ?, ?, ?)`
      ).run(userId, def.id, def.label, 0);
      db.prepare(
        `INSERT OR REPLACE INTO ghost_tab_state (user_id, active_tab_id, counter) VALUES (?, ?, ?)`
      ).run(userId, def.id, def.counter);
    })();
    return;
  }

  // Determine new active tab if the closed one was active
  let newActiveId = stateRow?.active_tab_id ?? remaining[0].tab_id;
  if (newActiveId === tabId) {
    const closedIdx = tabs.findIndex((t) => t.tab_id === tabId);
    const newIdx = Math.min(closedIdx, remaining.length - 1);
    newActiveId = remaining[newIdx].tab_id;
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM ghost_tabs WHERE user_id = ? AND tab_id = ?`).run(userId, tabId);
    db.prepare(
      `UPDATE ghost_tab_state SET active_tab_id = ? WHERE user_id = ?`
    ).run(newActiveId, userId);
  })();
}

export function renameGhostTab(userId: string, tabId: string, label: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE ghost_tabs SET label = ? WHERE user_id = ? AND tab_id = ?`
  ).run(label, userId, tabId);
}

export function setActiveGhostTab(userId: string, tabId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE ghost_tab_state SET active_tab_id = ? WHERE user_id = ?`
  ).run(tabId, userId);
}
