import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'relay-offline.db';
const MAX_MESSAGES_PER_CONVERSATION = 200;

export type CachedMessage = {
  _id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  replyTo?: {
    _id: string;
    senderId: string;
    receiverId: string;
    text?: string;
    image?: string;
    createdAt: string;
  } | null;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS cached_messages (
          account_id TEXT NOT NULL,
          peer_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          payload TEXT NOT NULL,
          PRIMARY KEY (account_id, peer_id, message_id)
        );
        CREATE INDEX IF NOT EXISTS cached_messages_conversation_time
          ON cached_messages (account_id, peer_id, created_at);
      `);

      return database;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function readCachedMessages(
  accountId: string,
  peerId: string,
): Promise<CachedMessage[]> {
  if (!accountId || !peerId) return [];

  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ payload: string }>(
      `SELECT payload
       FROM cached_messages
       WHERE account_id = ? AND peer_id = ?
       ORDER BY created_at DESC, message_id DESC
       LIMIT ?`,
      accountId,
      peerId,
      MAX_MESSAGES_PER_CONVERSATION,
    );

    return rows
      .reverse()
      .flatMap((row) => {
        try {
          const message: unknown = JSON.parse(row.payload);
          if (
            typeof message === 'object' &&
            message !== null &&
            typeof (message as CachedMessage)._id === 'string'
          ) {
            return [message as CachedMessage];
          }
        } catch {
          // Ignore a malformed cache row; the server remains authoritative.
        }
        return [];
      });
  } catch {
    // Local storage must never prevent opening a conversation.
    return [];
  }
}

export async function writeCachedMessages(
  accountId: string,
  peerId: string,
  messages: CachedMessage[],
): Promise<void> {
  if (!accountId || !peerId || messages.length === 0) return;

  try {
    const database = await getDatabase();

    await database.withTransactionAsync(async () => {
      for (const message of messages) {
        if (
          !message ||
          typeof message._id !== 'string' ||
          !message._id ||
          typeof message.createdAt !== 'string'
        ) {
          continue;
        }

        await database.runAsync(
          `INSERT INTO cached_messages
             (account_id, peer_id, message_id, created_at, payload)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(account_id, peer_id, message_id)
           DO UPDATE SET
             created_at = excluded.created_at,
             payload = excluded.payload`,
          accountId,
          peerId,
          message._id,
          message.createdAt,
          JSON.stringify(message),
        );
      }

      await database.runAsync(
        `DELETE FROM cached_messages
         WHERE account_id = ? AND peer_id = ?
           AND message_id NOT IN (
             SELECT message_id
             FROM cached_messages
             WHERE account_id = ? AND peer_id = ?
             ORDER BY created_at DESC, message_id DESC
             LIMIT ?
           )`,
        accountId,
        peerId,
        accountId,
        peerId,
        MAX_MESSAGES_PER_CONVERSATION,
      );

      // Bound total on-device history across all conversations and accounts.
      await database.runAsync(
        `DELETE FROM cached_messages
         WHERE rowid NOT IN (
           SELECT rowid
           FROM cached_messages
           ORDER BY created_at DESC, message_id DESC
           LIMIT 5000
         )`,
      );
    });
  } catch {
    // Cache writes are best-effort; do not interrupt messaging.
  }
}
