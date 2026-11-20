import { useSyncExternalStore } from "react";
import * as db from "./db";
import { getSettings } from "./settings";
import type { AspectRatio, Genre, Project } from "./types";

const ACTIVE_KEY = "tj-video-factory.active-project";

export interface ProjectSnapshot {
  projects: Project[];
  activeId: string | null;
  ready: boolean;
}

let snapshot: ProjectSnapshot = { projects: [], activeId: null, ready: false };
const listeners = new Set<() => void>();
const writeQueues = new Map<string, Promise<unknown>>();

function publish(next: Partial<ProjectSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeProjects(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProjectSnapshot(): ProjectSnapshot {
  return snapshot;
}

export function useProjectState(): ProjectSnapshot {
  return useSyncExternalStore(subscribeProjects, getProjectSnapshot, getProjectSnapshot);
}

export function useActiveProject(): Project | undefined {
  const state = useProjectState();
  return state.projects.find((project) => project.id === state.activeId);
}

export function getProject(id: string | null | undefined): Project | undefined {
  if (!id) return undefined;
  return snapshot.projects.find((project) => project.id === id);
}

export async function initProjects(): Promise<void> {
  try {
    const projects = await db.listProjects();
    const stored = localStorage.getItem(ACTIVE_KEY);
    const activeId = stored && projects.some((p) => p.id === stored) ? stored : projects[0]?.id ?? null;
    publish({ projects, activeId, ready: true });
  } catch (err) {
    console.error("Could not open the local project library", err);
    publish({ ready: true });
  }
}

export function setActiveProject(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
  publish({ activeId: id });
}

export function newProject(input: {
  name?: string;
  prompt?: string;
  genre?: Genre | string;
  style?: string;
  language?: string;
  aspectRatio?: AspectRatio;
  durationSec?: number;
  sceneDuration?: number;
  subtitles?: boolean;
}): Project {
  const now = Date.now();
  return {
    id: db.newId(),
    name: input.name?.trim() || "Untitled production",
    createdAt: now,
    updatedAt: now,
    prompt: input.prompt || "",
    genre: input.genre || "Mystery",
    style: input.style || "cinematic photoreal",
    language: input.language || "English",
    aspectRatio: input.aspectRatio || "9:16",
    durationSec: input.durationSec || 60,
    sceneDuration: input.sceneDuration || getSettings().sceneDuration || 5,
    characters: [],
    scenes: [],
    narration: { voice: "en", lang: "en", hosted: false, rate: 1, sceneAudio: {} },
    music: { mode: "none", volume: getSettings().musicVolume, mood: "cinematic" },
    sfx: { enabled: false, volume: 0.35 },
    subtitles: { burnedIn: input.subtitles ?? true },
    generation: { stage: "idle" },
    export: { status: "idle", progress: 0 },
  };
}

export async function createProject(input: Parameters<typeof newProject>[0]): Promise<Project> {
  const project = newProject(input);
  await db.putProject(project);
  publish({ projects: [project, ...snapshot.projects], activeId: project.id });
  setActiveProject(project.id);
  return project;
}

/**
 * Serialised per-project writes: the generation engine and the UI can both
 * mutate the same project without clobbering each other.
 */
export async function mutateProject(
  id: string,
  updater: (project: Project) => Project | void,
): Promise<Project | undefined> {
  const previous = writeQueues.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const existing = snapshot.projects.find((p) => p.id === id) ?? (await db.getProject(id));
    if (!existing) return undefined;
    const draft = structuredClone(existing) as Project;
    const result = updater(draft) ?? draft;
    result.updatedAt = Date.now();
    await db.putProject(result);
    const projects = snapshot.projects.some((p) => p.id === id)
      ? snapshot.projects.map((p) => (p.id === id ? result : p))
      : [result, ...snapshot.projects];
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    publish({ projects });
    return result;
  });
  writeQueues.set(id, next);
  return next;
}

export async function refreshProjects(): Promise<void> {
  const projects = await db.listProjects();
  const activeId = projects.some((p) => p.id === snapshot.activeId) ? snapshot.activeId : (projects[0]?.id ?? null);
  publish({ projects, activeId });
}

export async function deleteProject(id: string): Promise<void> {
  await db.removeProject(id);
  const projects = snapshot.projects.filter((p) => p.id !== id);
  const activeId = snapshot.activeId === id ? (projects[0]?.id ?? null) : snapshot.activeId;
  publish({ projects, activeId });
  setActiveProject(activeId);
}

export async function renameProject(id: string, name: string): Promise<void> {
  await mutateProject(id, (project) => {
    project.name = name.trim() || project.name;
  });
}

export function projectStats(project: Project) {
  const ready = project.scenes.filter((s) => s.status === "ready").length;
  const failed = project.scenes.filter((s) => s.status === "failed").length;
  const inFlight = project.scenes.filter((s) =>
    ["queued", "submitting", "generating", "downloading"].includes(s.status),
  ).length;
  const duration = project.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  return { ready, failed, inFlight, total: project.scenes.length, duration };
}
