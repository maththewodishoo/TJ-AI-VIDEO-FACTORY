import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { HistoryEntry, Project, StoredBlob } from "./types";

interface FactoryDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { "by-updated": number };
  };
  blobs: {
    key: string;
    value: StoredBlob;
  };
  history: {
    key: string;
    value: HistoryEntry;
    indexes: { "by-time": number };
  };
}

const DB_NAME = "tj-ai-video-factory";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FactoryDB>> | null = null;

function db(): Promise<IDBPDatabase<FactoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FactoryDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("projects")) {
          const store = database.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("by-updated", "updatedAt");
        }
        if (!database.objectStoreNames.contains("blobs")) {
          database.createObjectStore("blobs", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("history")) {
          const store = database.createObjectStore("history", { keyPath: "id" });
          store.createIndex("by-time", "at");
        }
      },
    });
  }
  return dbPromise;
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/* ── Projects ─────────────────────────────────────────────────────────────── */

export async function listProjects(): Promise<Project[]> {
  const database = await db();
  const projects = await database.getAllFromIndex("projects", "by-updated");
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get("projects", id);
}

export async function putProject(project: Project): Promise<void> {
  await (await db()).put("projects", project);
}

export async function removeProject(id: string): Promise<void> {
  const database = await db();
  const project = await database.get("projects", id);
  if (project) {
    const blobIds = collectBlobIds(project);
    await Promise.all(blobIds.map((blobId) => database.delete("blobs", blobId)));
  }
  await database.delete("projects", id);
}

function collectBlobIds(project: Project): string[] {
  const ids: string[] = [];
  if (project.export.blobId) ids.push(project.export.blobId);
  if (project.music.blobId) ids.push(project.music.blobId);
  Object.values(project.narration.sceneAudio || {}).forEach((id) => id && ids.push(id));
  project.scenes.forEach((scene) => {
    if (scene.videoBlobId) ids.push(scene.videoBlobId);
  });
  project.characters.forEach((character) => {
    if (character.referenceBlobId) ids.push(character.referenceBlobId);
  });
  return ids;
}

/* ── Blobs ────────────────────────────────────────────────────────────────── */

export async function putBlob(blob: Blob, label: string): Promise<string> {
  const id = newId();
  await (await db()).put("blobs", {
    id,
    blob,
    type: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt: Date.now(),
    label,
  });
  return id;
}

export async function getBlob(id: string | undefined): Promise<Blob | undefined> {
  if (!id) return undefined;
  const record = await (await db()).get("blobs", id);
  return record?.blob;
}

export async function getBlobRecord(id: string | undefined): Promise<StoredBlob | undefined> {
  if (!id) return undefined;
  return (await db()).get("blobs", id);
}

export async function deleteBlob(id: string | undefined): Promise<void> {
  if (!id) return;
  await (await db()).delete("blobs", id);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}

/* ── History ──────────────────────────────────────────────────────────────── */

export async function addHistory(entry: Omit<HistoryEntry, "id" | "at"> & { at?: number }): Promise<void> {
  const database = await db();
  const record: HistoryEntry = { ...entry, id: newId(), at: entry.at ?? Date.now() };
  await database.put("history", record);
  const all = await database.getAllFromIndex("history", "by-time");
  if (all.length > 300) {
    const excess = all.slice(0, all.length - 300);
    await Promise.all(excess.map((item) => database.delete("history", item.id)));
  }
}

export async function listHistory(limit = 100): Promise<HistoryEntry[]> {
  const all = await (await db()).getAllFromIndex("history", "by-time");
  return all.reverse().slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await (await db()).clear("history");
}
