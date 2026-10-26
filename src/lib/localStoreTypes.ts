import type { StorePillar } from "./pillars.ts";

export type { StorePillar } from "./pillars.ts";

export interface StoredRecord<T> {
  id: string;
  userId: string;
  pillar: StorePillar;
  schemaVersion: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  data: T;
  blobIds: string[];
}

export interface BlobDescriptor {
  id: string;
  userId: string;
  pillar: StorePillar;
  recordId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  contentHashSha256: string;
  createdAt: string;
}

export type RecoveryKind = "invalid-schema" | "hash-mismatch" | "unindexed";
export type RecoveryHashStatus = "valid" | "mismatch" | "missing" | "not-checked";

export interface RecoveryEntry {
  entryId: string;
  pillar: StorePillar;
  recordId: string | null;
  versionId: string;
  path: string;
  kind: RecoveryKind;
  byteSize: number;
  hashStatus: RecoveryHashStatus;
  contentHashSha256: string | null;
  exportState: "not-exported" | "exported";
}

export interface Reservation {
  reservationId: string;
  userId: string;
  pillar: StorePillar;
  bytes: number;
  createdAt: string;
  expiresAt: string;
}

export interface LocalStore {
  readonly userId: string;
  read<T>(pillar: StorePillar, id: string): Promise<StoredRecord<T> | null>;
  write<T>(pillar: StorePillar, record: Omit<StoredRecord<T>, "userId" | "pillar">): Promise<StoredRecord<T>>;
  remove(pillar: StorePillar, id: string): Promise<void>;
  list<T>(pillar: StorePillar): Promise<Array<StoredRecord<T>>>;
  exportBlob(pillar: StorePillar, id: string): Promise<Blob>;
  exportRaw(versionId: string): Promise<Blob>;
  clearAfterRecovery(versionId: string): Promise<void>;
  getRecoveryEntries(pillar: StorePillar): Promise<RecoveryEntry[]>;
  getUsage(pillar: StorePillar): Promise<{ usedBytes: number; limitBytes: number }>;
  reserveBytes(pillar: StorePillar, bytes: number): Promise<{ reservationId: string; usedBytes: number; remainingBytes: number }>;
  releaseBytes(pillar: StorePillar, reservationId: string): Promise<void>;
  blobs: BlobStore;
}

export interface BlobStore {
  put(pillar: StorePillar, recordId: string, descriptor: Omit<BlobDescriptor, "userId" | "pillar">, blob: Blob): Promise<BlobDescriptor>;
  get(pillar: StorePillar, blobId: string): Promise<Blob | null>;
  replace(pillar: StorePillar, blobId: string, blob: Blob): Promise<BlobDescriptor>;
  remove(pillar: StorePillar, blobId: string): Promise<void>;
}

export type SaveFailureReason = "unsupported" | "quota" | "io";
export type LocalWriteResult =
  | { status: "saved"; record: StoredRecord<unknown> }
  | { status: "partial"; metadataCommitted: true; committedBlobIds: string[]; failedBlob: { recordId: string; filename: string; reason: SaveFailureReason } }
  | { status: "failed"; reason: SaveFailureReason };
