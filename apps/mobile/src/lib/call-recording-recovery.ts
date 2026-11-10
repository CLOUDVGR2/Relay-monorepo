import * as SQLite from 'expo-sqlite';
import type { NativeRecordingResult } from './call-audio-recorder';

const DATABASE_NAME = 'relay-offline.db';

export type RecordingRecoveryStatus =
  | 'CAPTURE_PENDING'
  | 'RECORDED'
  | 'UPLOADED';

export type RecordingRecoveryRecord = {
  accountId: string;
  callId: string;
  uploadId: string;
  status: RecordingRecoveryStatus;
  recording: NativeRecordingResult | null;
  updatedAt: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

      await database.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS call_recording_recovery (
          account_id TEXT NOT NULL,
          call_id TEXT NOT NULL,
          upload_id TEXT NOT NULL,
          status TEXT NOT NULL,
          recording_payload TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (account_id, call_id)
        );

        CREATE INDEX IF NOT EXISTS call_recording_recovery_account_status
          ON call_recording_recovery (account_id, status);
      `);

      return database;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function saveRecordingIntent(
  accountId: string,
  callId: string,
  uploadId: string,
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO call_recording_recovery
       (account_id, call_id, upload_id, status, recording_payload, updated_at)
     VALUES (?, ?, ?, 'CAPTURE_PENDING', NULL, ?)
     ON CONFLICT(account_id, call_id)
     DO UPDATE SET
       upload_id = excluded.upload_id,
       status = 'CAPTURE_PENDING',
       recording_payload = NULL,
       updated_at = excluded.updated_at`,
    accountId,
    callId,
    uploadId,
    now,
  );
}

export async function saveRecordedAudio(
  accountId: string,
  callId: string,
  recording: NativeRecordingResult,
): Promise<void> {
  const database = await getDatabase();

  const result = await database.runAsync(
    `UPDATE call_recording_recovery
     SET status = 'RECORDED',
         recording_payload = ?,
         updated_at = ?
     WHERE account_id = ? AND call_id = ?`,
    JSON.stringify(recording),
    new Date().toISOString(),
    accountId,
    callId,
  );

  if (result.changes !== 1) {
    throw new Error('Recording recovery intent was not found.');
  }
}

export async function markRecordingUploaded(
  accountId: string,
  callId: string,
): Promise<void> {
  const database = await getDatabase();

  const result = await database.runAsync(
    `UPDATE call_recording_recovery
     SET status = 'UPLOADED',
         updated_at = ?
     WHERE account_id = ? AND call_id = ?`,
    new Date().toISOString(),
    accountId,
    callId,
  );

  if (result.changes !== 1) {
    throw new Error('Recording recovery record was not found.');
  }
}

export async function readRecordingRecovery(
  accountId: string,
  callId: string,
): Promise<RecordingRecoveryRecord | null> {
  if (!accountId || !callId) return null;

  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    upload_id: string;
    status: RecordingRecoveryStatus;
    recording_payload: string | null;
    updated_at: string;
  }>(
    `SELECT upload_id, status, recording_payload, updated_at
     FROM call_recording_recovery
     WHERE account_id = ? AND call_id = ?`,
    accountId,
    callId,
  );

  if (!row) return null;

  let recording: NativeRecordingResult | null = null;

  if (row.recording_payload) {
    try {
      recording = JSON.parse(row.recording_payload) as NativeRecordingResult;
    } catch {
      throw new Error('Saved recording recovery metadata is invalid.');
    }
  }

  return {
    accountId,
    callId,
    uploadId: row.upload_id,
    status: row.status,
    recording,
    updatedAt: row.updated_at,
  };
}

export async function listRecordingRecoveries(
  accountId: string,
): Promise<RecordingRecoveryRecord[]> {
  if (!accountId) return [];

  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    call_id: string;
    upload_id: string;
    status: RecordingRecoveryStatus;
    recording_payload: string | null;
    updated_at: string;
  }>(
    `SELECT call_id, upload_id, status, recording_payload, updated_at
     FROM call_recording_recovery
     WHERE account_id = ?
     ORDER BY updated_at ASC`,
    accountId,
  );

  return rows.map((row) => {
    let recording: NativeRecordingResult | null = null;

    if (row.recording_payload) {
      recording = JSON.parse(row.recording_payload) as NativeRecordingResult;
    }

    return {
      accountId,
      callId: row.call_id,
      uploadId: row.upload_id,
      status: row.status,
      recording,
      updatedAt: row.updated_at,
    };
  });
}

export async function deleteRecordingRecovery(
  accountId: string,
  callId: string,
): Promise<void> {
  const database = await getDatabase();

  await database.runAsync(
    `DELETE FROM call_recording_recovery
     WHERE account_id = ? AND call_id = ?`,
    accountId,
    callId,
  );
}
