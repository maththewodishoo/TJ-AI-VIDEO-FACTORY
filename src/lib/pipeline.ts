import { useSyncExternalStore } from "react";
import { ApiError, chat, downloadMedia, errorMessage, getVideoStatus, submitVideo, synthesizeSpeech, generateImage } from "./api";
import * as db from "./db";
import { offlineCharacters, offlineScript } from "./localStory";
import { getProject, mutateProject, projectStats } from "./projectStore";
import { pollIntervalMs, scenePlan } from "./plan";
import {
  SCRIPT_SYSTEM,
  buildScenePrompt,
  characterPrompt,
  continuityOf,
  parseJsonLoose,
  scriptUserPrompt,
  str,
  strArray,
} from "./prompts";
import { getSettings } from "./settings";
import type { Character, HistoryKind, Project, Scene, Script, ScriptScene } from "./types";

const MAX_POLL_MS = 20 * 60 * 1000;
const MAX_POLL_ERRORS = 6;

export interface EngineSnapshot {
  busy: boolean;
  projectId?: string;
  stage: "idle" | "script" | "scenes" | "assembly";
  message: string;
  activeScenes: string[];
  log: string[];
}

let engine: EngineSnapshot = { busy: false, stage: "idle", message: "", activeScenes: [], log: [] };
const listeners = new Set<() => void>();
const inFlight = new Set<string>();
let abortRequested = false;

function patch(next: Partial<EngineSnapshot>) {
  engine = { ...engine, ...next };
  listeners.forEach((listener) => listener());
}

function logLine(message: string) {
  const log = [`${new Date().toLocaleTimeString()} · ${message}`, ...engine.log].slice(0, 40);
  patch({ log });
}

export function subscribeEngine(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEngine(): EngineSnapshot {
  return useSyncExternalStore(subscribeEngine, () => engine, () => engine);
}

export function cancelGeneration(): void {
  abortRequested = true;
  patch({ message: "Stopping after the current request…" });
}

export function clearLog(): void {
  patch({ log: [] });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function record(
  project: Project | undefined,
  kind: HistoryKind,
  title: string,
  status: "ok" | "failed" | "info",
  detail?: string,
  durationMs?: number,
) {
  if (!project) return;
  await db.addHistory({
    projectId: project.id,
    projectName: project.name,
    kind,
    title,
    detail,
    status,
    durationMs,
  });
}

/* ── Script / storyboard ──────────────────────────────────────────────────── */

function normalizeCharacter(raw: Record<string, unknown>, index: number): Character {
  const character: Character = {
    id: `char-${index + 1}`,
    name: str(raw.name, `Character ${index + 1}`),
    age: str(raw.age, "30s"),
    appearance: str(raw.appearance),
    clothing: str(raw.clothing),
    hair: str(raw.hair),
    face: str(raw.face),
    personality: str(raw.personality),
    voice: str(raw.voice, "warm, natural"),
    continuity: "",
  };
  character.continuity = [
    character.name,
    character.age && `${character.age}`,
    character.face,
    character.hair,
    character.clothing,
    character.appearance,
  ]
    .filter(Boolean)
    .join(", ");
  return character;
}

function normalizeScript(
  raw: Record<string, unknown>,
  project: Project,
  durations: number[],
  source: "ai" | "offline",
  model?: string,
): Script {
  const rawCharacters = Array.isArray(raw.characters) ? (raw.characters as Record<string, unknown>[]) : [];
  const characters = rawCharacters.slice(0, 6).map(normalizeCharacter);
  const nameToId = new Map(characters.map((c) => [c.name.toLowerCase(), c.id]));

  const rawScenes = Array.isArray(raw.scenes) ? (raw.scenes as Record<string, unknown>[]) : [];
  const scenes: ScriptScene[] = durations.map((duration, index) => {
    const item = rawScenes[index] || {};
    const names = strArray(item.characterNames);
    return {
      title: str(item.title, `Scene ${index + 1}`),
      durationSec: duration,
      visualPrompt: str(item.visualPrompt, `${project.style} shot of ${project.prompt}`).slice(0, 900),
      cameraAngle: str(item.cameraAngle, "eye level"),
      cameraMove: str(item.cameraMove, "slow push-in"),
      lighting: str(item.lighting, "cinematic natural light"),
      background: str(item.background),
      dialogue: str(item.dialogue),
      narration: str(item.narration),
      sfx: str(item.sfx),
      transition: str(item.transition, "cut"),
      characterNames: names.length ? names : characters.slice(0, 1).map((c) => c.name),
    };
  });

  // Attach character ids for continuity (kept on the script for rebuilding scenes).
  const script: Script = {
    title: str(raw.title, project.prompt.slice(0, 60) || "Untitled"),
    logline: str(raw.logline, project.prompt),
    hook: str(raw.hook, scenes[0]?.narration || ""),
    genre: str(raw.genre, project.genre),
    scenes,
    ending: str(raw.ending),
    cta: str(raw.cta),
    fullNarration: scenes.map((s) => s.narration).filter(Boolean).join(" ").trim(),
    source,
    model,
    createdAt: Date.now(),
  };

  // Store the name->id link on the project through scene characterIds later.
  void nameToId;
  return script;
}

function scenesFromScript(project: Project, script: Script): Scene[] {
  return script.scenes.map((item, index) => {
    const ids = item.characterNames
      .map((name) => project.characters.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id)
      .filter((value): value is string => Boolean(value));
    return {
      id: db.newId(),
      index,
      title: item.title || `Scene ${index + 1}`,
      durationSec: item.durationSec,
      visualPrompt: item.visualPrompt,
      cameraAngle: item.cameraAngle,
      cameraMove: item.cameraMove,
      lighting: item.lighting,
      background: item.background,
      dialogue: item.dialogue,
      narration: item.narration,
      sfx: item.sfx,
      transition: item.transition,
      characterIds: ids.length ? ids : project.characters.slice(0, 1).map((c) => c.id),
      status: "draft",
      progress: 0,
      attempts: 0,
    };
  });
}

export async function generateScript(projectId: string): Promise<Project | undefined> {
  const project = getProject(projectId);
  if (!project) return undefined;
  abortRequested = false;
  patch({ busy: true, projectId, stage: "script", message: "Writing story and scene plan…" });
  const started = Date.now();

  const durations = scenePlan(project.durationSec, project.sceneDuration);
  let script: Script;
  let warning: string | undefined;

  try {
    const result = await chat(
      [
        { role: "system", content: SCRIPT_SYSTEM },
        {
          role: "user",
          content: scriptUserPrompt({
            prompt: project.prompt,
            genre: project.genre,
            style: project.style,
            language: project.language,
            durationSec: project.durationSec,
            sceneDurations: durations,
            aspectRatio: project.aspectRatio,
          }),
        },
      ],
      { temperature: 0.8, maxTokens: 6000 },
    );
    const parsed = parseJsonLoose(result.text);
    script = normalizeScript(parsed, project, durations, "ai", result.model);
    if (!script.scenes.some((scene) => scene.narration.trim())) {
      throw new Error("The model returned scenes without narration.");
    }
    logLine(`Script written by ${result.model}.`);
  } catch (err) {
    warning = errorMessage(err);
    script = offlineScript({
      prompt: project.prompt,
      genre: project.genre,
      style: project.style,
      durationSec: project.durationSec,
      sceneDuration: project.sceneDuration,
      aspectRatio: project.aspectRatio,
      language: project.language,
    });
    script.scenes = script.scenes.map((scene, index) => ({ ...scene, durationSec: durations[index] ?? scene.durationSec }));
    logLine(`Offline draft used: ${warning}`);
  }

  const staleNarration = Object.values(project.narration.sceneAudio);
  const result = await mutateProject(projectId, (draft) => {
    const previousCharacters = new Map(draft.characters.map((c) => [c.name.toLowerCase(), c]));
    const characters =
      script.source === "ai" ? inferCharacters(script, project) : previousOrOffline(draft, project);
    draft.script = script;
    draft.characters = characters.map((character) => {
      const previous = previousCharacters.get(character.name.toLowerCase());
      return previous
        ? { ...character, referenceUrl: previous.referenceUrl, referenceBlobId: previous.referenceBlobId, id: previous.id }
        : character;
    });
    draft.scenes = scenesFromScript(draft, script);
    draft.narration = { ...draft.narration, sceneAudio: {}, generatedAt: undefined, errors: undefined };
    draft.generation = {
      stage: "idle",
      message: warning ? `Offline draft (${warning})` : `Story ready · ${script.scenes.length} scenes`,
      startedAt: started,
      error: warning,
    };
    draft.export = { status: "idle", progress: 0 };
  });

  // The narration map is keyed by scene id, and a new script mints new ids.
  await Promise.all(staleNarration.map((id) => db.deleteBlob(id)));

  await record(result, "script", script.title, script.source === "ai" ? "ok" : "info", `${script.scenes.length} scenes`, Date.now() - started);
  patch({ busy: false, stage: "idle", message: script.source === "ai" ? "Script ready." : "Offline draft ready — add an AI key for a real script.", activeScenes: [] });
  return result;
}

function previousOrOffline(draft: Project, project: Project): Character[] {
  if (draft.characters.length) return draft.characters;
  return offlineCharacters(project.prompt, String(project.genre));
}

export async function rebuildStoryboard(projectId: string): Promise<void> {
  const before = getProject(projectId);
  const staleNarration = before ? Object.values(before.narration.sceneAudio) : [];
  await mutateProject(projectId, (draft) => {
    if (!draft.script) return;
    const existing = new Map(draft.scenes.map((scene, index) => [index, scene]));
    draft.scenes = scenesFromScript(draft, draft.script).map((scene, index) => {
      const previous = existing.get(index);
      if (previous?.status === "ready" && previous.videoBlobId) {
        return {
          ...scene,
          status: "ready" as const,
          progress: 100,
          videoBlobId: previous.videoBlobId,
          taskId: previous.taskId,
          generatedAt: previous.generatedAt,
          attempts: previous.attempts,
        };
      }
      return scene;
    });
    draft.narration = { ...draft.narration, sceneAudio: {}, generatedAt: undefined, errors: undefined };
  });
  await Promise.all(staleNarration.map((id) => db.deleteBlob(id)));
}

function inferCharacters(script: Script, project: Project): Character[] {
  const names = new Set<string>();
  script.scenes.forEach((scene) => scene.characterNames.forEach((name) => names.add(name)));
  const list = Array.from(names);
  return list.map((name, index) => {
    const existing = project.characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const character: Character = {
      id: `char-${index + 1}`,
      name,
      age: "30s",
      appearance: "consistent, recognisable features",
      clothing: "a single fixed outfit for the whole film",
      hair: "consistent hairstyle",
      face: "consistent facial features",
      personality: "determined",
      voice: "natural, warm",
      continuity: `${name} — exact same face, hair and clothing in every scene`,
    };
    return character;
  });
}

export async function regenerateCharacter(projectId: string, characterId: string): Promise<void> {
  const project = getProject(projectId);
  const character = project?.characters.find((c) => c.id === characterId);
  if (!project || !character) return;
  const { system, user } = characterPrompt(character, String(project.genre));
  const result = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.5, maxTokens: 900 },
  );
  const raw = parseJsonLoose(result.text);
  await mutateProject(projectId, (draft) => {
    const target = draft.characters.find((c) => c.id === characterId);
    if (!target) return;
    target.name = str(raw.name, target.name);
    target.age = str(raw.age, target.age);
    target.appearance = str(raw.appearance, target.appearance);
    target.clothing = str(raw.clothing, target.clothing);
    target.hair = str(raw.hair, target.hair);
    target.face = str(raw.face, target.face);
    target.personality = str(raw.personality, target.personality);
    target.voice = str(raw.voice, target.voice);
    target.continuity = continuityOf({ ...target, continuity: "" });
  });
}

export async function createCharacterImage(projectId: string, characterId: string): Promise<string | undefined> {
  const project = getProject(projectId);
  const character = project?.characters.find((c) => c.id === characterId);
  if (!project || !character) return undefined;
  const prompt = `Character reference portrait, neutral studio lighting, plain dark background, head and shoulders, looking at camera. ${character.continuity}. Photoreal, consistent identity, no text.`;
  const result = await generateImage(prompt);
  if (!result.url) throw new ApiError(result.note || "The image provider returned no image URL.", 502, "no_image");
  const blob = await downloadMedia(result.url).catch(async () => {
    const res = await fetch(result.url!);
    return res.blob();
  });
  const blobId = await db.putBlob(blob, `${character.name} reference`);
  await mutateProject(projectId, (draft) => {
    const target = draft.characters.find((c) => c.id === characterId);
    if (target) {
      target.referenceBlobId = blobId;
      target.referenceUrl = result.url;
    }
  });
  return result.url;
}

/* ── Scene generation ────────────────────────────────────────────────────── */

export async function updateScene(projectId: string, sceneId: string, patchScene: Partial<Scene>): Promise<void> {
  await mutateProject(projectId, (draft) => {
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (scene) Object.assign(scene, patchScene);
  });
}

export async function deleteScene(projectId: string, sceneId: string): Promise<void> {
  const project = getProject(projectId);
  const scene = project?.scenes.find((s) => s.id === sceneId);
  const narrationBlobId = project?.narration.sceneAudio[sceneId];
  if (scene?.videoBlobId) await db.deleteBlob(scene.videoBlobId);
  if (narrationBlobId) await db.deleteBlob(narrationBlobId);
  await mutateProject(projectId, (draft) => {
    draft.scenes = draft.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, index) => ({ ...s, index }));
    delete draft.narration.sceneAudio[sceneId];
  });
}

export async function moveScene(projectId: string, sceneId: string, direction: -1 | 1): Promise<void> {
  await mutateProject(projectId, (draft) => {
    const index = draft.scenes.findIndex((s) => s.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.scenes.length) return;
    const [moved] = draft.scenes.splice(index, 1);
    draft.scenes.splice(target, 0, moved);
    draft.scenes = draft.scenes.map((scene, i) => ({ ...scene, index: i }));
  });
}

function scenePromptFor(project: Project, scene: Scene): string {
  return buildScenePrompt(scene, project.characters, project.style, project.aspectRatio, scene.durationSec);
}

export async function generateScene(
  projectId: string,
  sceneId: string,
  options: { resume?: boolean } = {},
): Promise<void> {
  if (inFlight.has(sceneId)) return;
  const project = getProject(projectId);
  const scene = project?.scenes.find((s) => s.id === sceneId);
  if (!project || !scene) return;

  inFlight.add(sceneId);
  patch({ activeScenes: [...inFlight] });
  const startedAt = Date.now();
  const settings = getSettings();

  try {
    let taskId = options.resume ? scene.taskId : undefined;

    if (!taskId) {
      await mutateProject(projectId, (draft) => {
        const target = draft.scenes.find((s) => s.id === sceneId);
        if (!target) return;
        target.status = "submitting";
        target.progress = 0;
        target.error = undefined;
        target.attempts += 1;
        target.startedAt = Date.now();
      });

      const prompt = scenePromptFor(project, scene);
      const submitted = await submitVideo({
        prompt,
        seconds: scene.durationSec,
        aspectRatio: project.aspectRatio,
      });
      taskId = submitted.videoId;
      await mutateProject(projectId, (draft) => {
        const target = draft.scenes.find((s) => s.id === sceneId);
        if (!target) return;
        target.taskId = taskId;
        target.status = "generating";
        target.startedAt = Date.now();
      });
      logLine(`Scene ${scene.index + 1} submitted as task ${taskId.slice(0, 10)}…`);
      await record(project, "scene", `Scene ${scene.index + 1} submitted`, "info", taskId);
    } else {
      await mutateProject(projectId, (draft) => {
        const target = draft.scenes.find((s) => s.id === sceneId);
        if (!target) return;
        target.status = "generating";
        target.error = undefined;
      });
      logLine(`Resuming scene ${scene.index + 1} (${taskId.slice(0, 10)}…).`);
    }

    let consecutiveErrors = 0;
    for (let attempt = 0; ; attempt++) {
      if (abortRequested) {
        await mutateProject(projectId, (draft) => {
          const target = draft.scenes.find((s) => s.id === sceneId);
          if (target && target.status !== "ready") target.status = "queued";
        });
        return;
      }
      if (Date.now() - startedAt > MAX_POLL_MS) {
        throw new ApiError("The provider did not finish within 20 minutes. Retry the scene.", 504, "poll_timeout");
      }

      await sleep(Math.min(pollIntervalMs(attempt, settings.pollIntervalSec), 45_000));

      let status;
      try {
        status = await getVideoStatus(taskId);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        const retryAfter = err instanceof ApiError ? err.retryAfter : undefined;
        if (consecutiveErrors >= MAX_POLL_ERRORS) throw err;
        logLine(`Scene ${scene.index + 1} poll hiccup (${consecutiveErrors}/${MAX_POLL_ERRORS}).`);
        await sleep((retryAfter ? retryAfter * 1000 : 5000) + 1000);
        continue;
      }

      if (status.status === "failed") {
        throw new ApiError(status.error || "The provider reported a failed generation.", 502, "generation_failed");
      }

      if (status.status === "completed") {
        if (!status.videoUrl) throw new ApiError("Task completed without a video URL.", 502, "no_video_url");
        await mutateProject(projectId, (draft) => {
          const target = draft.scenes.find((s) => s.id === sceneId);
          if (target) {
            target.status = "downloading";
            target.progress = 100;
            target.sourceUrl = status.videoUrl;
          }
        });
        logLine(`Scene ${scene.index + 1} completed — downloading clip.`);
        const blob = await downloadMedia(status.videoUrl);
        const blobId = await db.putBlob(blob, `Scene ${scene.index + 1} clip`);
        const previousBlob = scene.videoBlobId;
        await mutateProject(projectId, (draft) => {
          const target = draft.scenes.find((s) => s.id === sceneId);
          if (!target) return;
          target.status = "ready";
          target.videoBlobId = blobId;
          target.progress = 100;
          target.generatedAt = Date.now();
          target.error = undefined;
        });
        if (previousBlob && previousBlob !== blobId) await db.deleteBlob(previousBlob);
        await record(project, "scene", `Scene ${scene.index + 1} ready`, "ok", undefined, Date.now() - startedAt);
        return;
      }

      await mutateProject(projectId, (draft) => {
        const target = draft.scenes.find((s) => s.id === sceneId);
        if (target) {
          target.status = "generating";
          target.progress = Math.max(target.progress, status.progress);
        }
      });
    }
  } catch (err) {
    const message = errorMessage(err);
    await mutateProject(projectId, (draft) => {
      const target = draft.scenes.find((s) => s.id === sceneId);
      if (!target) return;
      target.status = "failed";
      target.error = message;
    });
    logLine(`Scene ${scene.index + 1} failed: ${message}`);
    await record(project, "scene", `Scene ${scene.index + 1} failed`, "failed", message, Date.now() - startedAt);
  } finally {
    inFlight.delete(sceneId);
    patch({ activeScenes: [...inFlight] });
  }
}

export async function generateScenes(projectId: string, sceneIds?: string[]): Promise<void> {
  const project = getProject(projectId);
  if (!project) return;
  if (!project.scenes.length) {
    patch({ message: "Write the storyboard first." });
    return;
  }

  abortRequested = false;
  const settings = getSettings();
  const ids = (sceneIds?.length ? sceneIds : project.scenes.map((s) => s.id)).filter((id) => !inFlight.has(id));
  const pending = ids.filter((id) => {
    const scene = project.scenes.find((s) => s.id === id);
    return (
      scene &&
      !["ready", "submitting", "generating", "downloading"].includes(scene.status)
    );
  });
  if (!pending.length) {
    patch({ message: "Nothing to generate — those scenes are already running or ready." });
    return;
  }

  await mutateProject(projectId, (draft) => {
    draft.scenes = draft.scenes.map((scene) =>
      pending.includes(scene.id) ? { ...scene, status: "queued", error: undefined, progress: 0 } : scene,
    );
    draft.generation = { stage: "scenes", message: "Generating scenes…", startedAt: Date.now() };
  });

  patch({ busy: true, projectId, stage: "scenes", message: `Queued ${pending.length} scene${pending.length > 1 ? "s" : ""}.` });
  logLine(`Queue started with ${pending.length} scene(s), concurrency ${Math.max(1, Math.min(3, settings.concurrency))}.`);

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(3, settings.concurrency, pending.length)) }, async () => {
    while (cursor < pending.length && !abortRequested) {
      const id = pending[cursor++];
      await generateScene(projectId, id);
    }
  });
  await Promise.all(workers);

  const latest = getProject(projectId);
  const stats = latest ? projectStats(latest) : { ready: 0, failed: 0, total: 0 };
  const message = abortRequested
    ? "Generation stopped. Queued scenes can be resumed."
    : stats.failed
      ? `${stats.ready}/${stats.total} scenes ready · ${stats.failed} failed — retry the failed ones.`
      : `${stats.ready}/${stats.total} scenes ready.`;

  await mutateProject(projectId, (draft) => {
    draft.generation = { stage: "idle", message };
  });
  patch({ busy: false, stage: "idle", message, activeScenes: [] });
  if (latest) await record(latest, "video", "Scene batch finished", stats.failed ? "failed" : "ok", message);
}

/* ── Narration ───────────────────────────────────────────────────────────── */

export async function generateNarration(projectId: string, sceneIds?: string[]): Promise<void> {
  const project = getProject(projectId);
  if (!project) return;
  const settings = getSettings();
  const targets = project.scenes.filter(
    (scene) => (sceneIds ? sceneIds.includes(scene.id) : true) && (scene.narration.trim() || scene.dialogue.trim()),
  );
  if (!targets.length) {
    patch({ message: "No narration text yet — write the script first." });
    return;
  }

  patch({ busy: true, projectId, stage: "script", message: "Recording narration…" });
  let done = 0;
  const errors: Record<string, string> = {};

  for (const scene of targets) {
    if (abortRequested) break;
    const text = (scene.narration || scene.dialogue).trim();
    try {
      const blob = await synthesizeSpeech(text, { hosted: settings.ttsMode === "hosted" });
      const blobId = await db.putBlob(blob, `Narration scene ${scene.index + 1}`);
      await mutateProject(projectId, (draft) => {
        const previous = draft.narration.sceneAudio[scene.id];
        draft.narration.sceneAudio[scene.id] = blobId;
        if (previous && previous !== blobId) void db.deleteBlob(previous);
      });
      done += 1;
      patch({ message: `Narrated ${done}/${targets.length} scenes…` });
    } catch (err) {
      errors[scene.id] = errorMessage(err);
      if (err instanceof ApiError && err.code === "tts_needs_backend") {
        // No point retrying every scene against a missing backend.
        targets.slice(targets.indexOf(scene)).forEach((s) => {
          errors[s.id] = err.message;
        });
        break;
      }
    }
    await sleep(350);
  }

  await mutateProject(projectId, (draft) => {
    draft.narration.generatedAt = done ? Date.now() : draft.narration.generatedAt;
    draft.narration.provider = settings.ttsMode === "hosted" ? "hosted" : "google";
    draft.narration.voice = settings.ttsVoice;
    draft.narration.lang = settings.ttsLang;
    draft.narration.rate = settings.voiceRate;
    draft.narration.errors = Object.keys(errors).length ? errors : undefined;
  });

  const message = done
    ? `Narration ready for ${done}/${targets.length} scenes.`
    : `Narration failed: ${Object.values(errors)[0] || "unknown error"}`;
  patch({ busy: false, stage: "idle", message, activeScenes: [] });
  await record(project, "tts", "Narration generated", done ? "ok" : "failed", message);
}

/* ── Resume after refresh ────────────────────────────────────────────────── */

let resumeStarted = false;

export async function resumePending(force = false): Promise<void> {
  if (resumeStarted && !force) return;
  resumeStarted = true;
  const state = await db.listProjects();
  for (const project of state) {
    const running = project.scenes.filter(
      (scene) => scene.taskId && ["generating", "downloading", "submitting"].includes(scene.status),
    );
    const queued = project.scenes.filter((scene) => scene.status === "queued");
    if (!running.length && !queued.length) continue;

    if (running.length) {
      logLine(`Resuming ${running.length} in-flight scene(s) in “${project.name}”.`);
      patch({ busy: true, projectId: project.id, stage: "scenes", message: "Resuming interrupted generation…" });
      for (const scene of running) {
        await generateScene(project.id, scene.id, { resume: true });
      }
      const latest = getProject(project.id);
      const stats = latest ? projectStats(latest) : { ready: 0, failed: 0, total: 0, inFlight: 0 };
      patch({ busy: false, stage: "idle", message: `${stats.ready}/${stats.total} scenes ready after resume.`, activeScenes: [] });
    }

    if (queued.length && !engine.busy) {
      void generateScenes(project.id, queued.map((scene) => scene.id));
    }
  }
}
