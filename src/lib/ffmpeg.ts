import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import * as db from "./db";
import { inferSfxPreset, renderAmbientMusic, renderSfxBed } from "./audio";
import { getProject, mutateProject } from "./projectStore";
import { sceneCaptionSegments } from "./subtitles";
import type { AspectRatio, Project, Scene } from "./types";

/**
 * Browser video assembly with FFmpeg.wasm (single-threaded core: no COOP/COEP
 * headers needed, works on iOS Safari). Clips are normalised to one size/fps/
 * codec, concatenated, then muxed with narration, optional sfx and music beds.
 */

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
const moduleLogs: string[] = [];

export const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
  "4:5": { width: 576, height: 720 },
};

export interface AssembleOptions {
  aspectRatio?: AspectRatio;
  burnSubtitles?: boolean;
  withNarration?: boolean;
  withMusic?: boolean;
  withSfx?: boolean;
}

export interface AssembleResult {
  blob: Blob;
  width: number;
  height: number;
  durationSec: number;
  log: string[];
}

function addLog(line: string) {
  moduleLogs.push(line);
  if (moduleLogs.length > 160) moduleLogs.shift();
}

async function loadFFmpeg(onStatus: (message: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    onStatus("Loading the FFmpeg engine (~32 MB, first run only)…");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => addLog(message));
    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();
  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw new Error(
      `Could not load FFmpeg.wasm (${(err as Error).message}). Check the connection and that the browser supports WebAssembly; on iPhone try a shorter video (15–30s).`,
    );
  }
}

async function readFileBytes(ffmpeg: FFmpeg, name: string): Promise<Uint8Array> {
  const data = await ffmpeg.readFile(name);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return data;
}

async function exec(
  ffmpeg: FFmpeg,
  args: string[],
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const handler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on("progress", handler);
  addLog(`> ${args.join(" ")}`);
  try {
    const code = await ffmpeg.exec(args);
    if (code !== 0) throw new Error(`FFmpeg exited with code ${code}.`);
  } finally {
    ffmpeg.off("progress", handler);
  }
}

async function fetchFont(): Promise<Uint8Array | null> {
  try {
    const res = await fetch("/fonts/NotoSans-SemiBold.ttf");
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function buildCaptionFilters(
  scene: Scene,
  sceneIndex: number,
  fontSize: number,
  bottomMargin: number,
): { filters: string[]; files: { name: string; text: string }[] } {
  const segments = sceneCaptionSegments(scene);
  const files: { name: string; text: string }[] = [];
  const filters: string[] = [];
  segments.forEach((segment, cueIndex) => {
    const name = `cap_${sceneIndex}_${cueIndex}.txt`;
    files.push({ name, text: segment.text });
    filters.push(
      `drawtext=fontfile=font.ttf:textfile=${name}:fontcolor=white:fontsize=${fontSize}:line_spacing=8:` +
        `box=1:boxcolor=black@0.55:boxborderw=${Math.round(fontSize * 0.45)}:` +
        `x=(w-text_w)/2:y=h-th-${bottomMargin}:enable='between(t,${segment.start.toFixed(2)},${segment.end.toFixed(2)})'`,
    );
  });
  return { filters, files };
}

function extensionFor(blob: Blob): string {
  if (blob.type.includes("wav")) return "wav";
  if (blob.type.includes("mp4") || blob.type.includes("m4a") || blob.type.includes("aac")) return "m4a";
  return "mp3";
}

export async function assembleProject(
  projectId: string,
  options: AssembleOptions = {},
): Promise<AssembleResult> {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (!project.scenes.length) throw new Error("Generate a storyboard first.");

  const missing = project.scenes.filter((scene) => scene.status !== "ready" || !scene.videoBlobId);
  if (missing.length) {
    throw new Error(
      `${missing.length} scene${missing.length > 1 ? "s are" : " is"} not ready (${missing
        .map((scene) => scene.index + 1)
        .join(", ")}). Generate or retry them before exporting.`,
    );
  }

  const aspect = options.aspectRatio || project.aspectRatio;
  const { width, height } = DIMENSIONS[aspect] || DIMENSIONS["16:9"];
  const burnSubtitles = options.burnSubtitles ?? project.subtitles.burnedIn;
  const withNarration = options.withNarration ?? true;
  const withMusic = options.withMusic ?? project.music.mode !== "none";
  const withSfx = options.withSfx ?? project.sfx.enabled;
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

  moduleLogs.length = 0;

  let lastUpdate = 0;
  const update = (progress: number, message: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastUpdate < 700) return Promise.resolve();
    lastUpdate = now;
    return mutateProject(projectId, (draft) => {
      draft.export = { ...draft.export, status: "rendering", progress: Math.round(progress * 100), message };
    }).then(() => undefined);
  };

  try {
    await update(0.01, "Preparing assembly…", true);
    const ffmpeg = await loadFFmpeg((message) => {
      void update(0.03, message, true);
    });

    const font = burnSubtitles ? await fetchFont() : null;
    if (burnSubtitles && !font) addLog("Caption font unavailable — exporting clean video plus SRT.");
    if (font) await ffmpeg.writeFile("font.ttf", font);

    const totalSteps = project.scenes.length * 2 + 3;
    let step = 0;
    const tick = (detail: string) => {
      step += 1;
      void update(Math.min(0.94, step / totalSteps), detail);
    };

    const fontSize = Math.round(height / 22);
    const bottomMargin = Math.round(height * 0.09);
    const videoFiles: string[] = [];
    const audioFiles: string[] = [];

    /* 1. Normalise clips + build per-scene narration. */
    for (const [index, scene] of project.scenes.entries()) {
      const blob = await db.getBlob(scene.videoBlobId);
      if (!blob) throw new Error(`Clip for scene ${index + 1} is missing from local storage.`);
      const input = `s${index}.mp4`;
      await ffmpeg.writeFile(input, new Uint8Array(await blob.arrayBuffer()));

      const { filters: captionFilters, files } = burnSubtitles
        ? buildCaptionFilters(scene, index, fontSize, bottomMargin)
        : { filters: [], files: [] };
      for (const file of files) await ffmpeg.writeFile(file.name, new TextEncoder().encode(file.text));

      const baseFilters = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x04060f`,
        "setsar=1",
        "fps=24",
        "tpad=stop_mode=clone:stop_duration=2",
        `trim=duration=${scene.durationSec.toFixed(3)}`,
        "setpts=PTS-STARTPTS",
      ];
      const out = `n${index}.mp4`;

      const runNormalise = (withCaptions: boolean) =>
        exec(
          ffmpeg,
          [
            "-y",
            "-i",
            input,
            "-vf",
            [...baseFilters, ...(withCaptions ? captionFilters : [])].join(","),
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "24",
            "-t",
            String(scene.durationSec),
            out,
          ],
          (ratio) => {
            const base = 0.05 + (index / project.scenes.length) * 0.55;
            void update(base + (ratio / project.scenes.length) * 0.55, `Encoding scene ${index + 1}/${project.scenes.length}…`);
          },
        );

      try {
        await runNormalise(true);
      } catch (err) {
        if (!captionFilters.length) throw err;
        addLog(`Burned-in captions failed (${(err as Error).message}); continuing without them.`);
        await runNormalise(false);
      }
      videoFiles.push(out);
      await ffmpeg.deleteFile(input);
      tick(`Scene ${index + 1}/${project.scenes.length} encoded`);

      const narrationName = `n${index}.wav`;
      const narrationBlob = withNarration ? await db.getBlob(project.narration.sceneAudio[scene.id]) : undefined;
      if (narrationBlob) {
        const source = `v${index}.${extensionFor(narrationBlob)}`;
        await ffmpeg.writeFile(source, new Uint8Array(await narrationBlob.arrayBuffer()));
        const tempo = Math.max(0.75, Math.min(1.5, project.narration.rate || 1));
        await exec(ffmpeg, [
          "-y",
          "-i",
          source,
          "-af",
          `atempo=${tempo.toFixed(2)},apad`,
          "-t",
          String(scene.durationSec),
          "-ar",
          "44100",
          "-ac",
          "2",
          "-c:a",
          "pcm_s16le",
          narrationName,
        ]);
        await ffmpeg.deleteFile(source);
      } else {
        await exec(ffmpeg, [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=stereo",
          "-t",
          String(scene.durationSec),
          "-c:a",
          "pcm_s16le",
          narrationName,
        ]);
      }
      audioFiles.push(narrationName);
    }

    /* 2. Join the normalised clips. */
    await update(0.64, "Joining scenes…", true);
    await ffmpeg.writeFile("list.txt", new TextEncoder().encode(videoFiles.map((file) => `file '${file}'`).join("\n")));
    try {
      await exec(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "silent.mp4"]);
    } catch (err) {
      addLog(`Stream-copy concat failed (${(err as Error).message}); re-encoding the join.`);
      await exec(ffmpeg, [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "silent.mp4",
      ]);
    }
    tick("Scenes joined");

    /* 3. Narration track. */
    await ffmpeg.writeFile("alist.txt", new TextEncoder().encode(audioFiles.map((file) => `file '${file}'`).join("\n")));
    await exec(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", "alist.txt", "-c:a", "pcm_s16le", "narration.wav"]);
    tick("Narration assembled");

    /* 4. Optional sfx bed + music bed (both generated locally, no API). */
    const audioInputs: string[] = ["narration.wav"];
    if (withSfx) {
      let cursor = 0;
      const events = project.scenes.map((scene) => {
        const event = {
          at: cursor,
          kind: scene.sfxPreset || inferSfxPreset(scene.sfx || scene.narration),
          gain: project.sfx.volume,
        };
        cursor += scene.durationSec;
        return event;
      });
      const bed = renderSfxBed(events, totalDuration);
      if (bed) {
        await ffmpeg.writeFile("sfx.wav", new Uint8Array(await bed.arrayBuffer()));
        audioInputs.push("sfx.wav");
      }
    }

    if (withMusic) {
      let musicBlob: Blob | null = null;
      if (project.music.mode === "upload" && project.music.blobId) {
        musicBlob = (await db.getBlob(project.music.blobId)) || null;
      } else if (project.music.mode === "ambient") {
        musicBlob = renderAmbientMusic(totalDuration, project.music.mood);
      }
      if (musicBlob) {
        if (project.music.mode === "upload") {
          const source = `music-src.${extensionFor(musicBlob)}`;
          await ffmpeg.writeFile(source, new Uint8Array(await musicBlob.arrayBuffer()));
          await exec(ffmpeg, [
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            source,
            "-t",
            String(totalDuration),
            "-ar",
            "44100",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            "music.wav",
          ]);
        } else {
          await ffmpeg.writeFile("music.wav", new Uint8Array(await musicBlob.arrayBuffer()));
        }
        audioInputs.push("music.wav");
      }
    }

    /* 5. Final mux. */
    await update(0.9, "Mixing audio and video…", true);
    const inputArgs = ["-i", "silent.mp4", ...audioInputs.flatMap((file) => ["-i", file])];
    const baseTail = ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", "-movflags", "+faststart", "final.mp4"];

    if (audioInputs.length === 1) {
      await exec(ffmpeg, ["-y", ...inputArgs, "-map", "0:v:0", "-map", "1:a:0", ...baseTail], (ratio) => {
        void update(0.9 + ratio * 0.08, "Finalising MP4…");
      });
    } else {
      const weights = audioInputs.map((file) => {
        if (file === "narration.wav") return "1.0";
        if (file === "sfx.wav") return "0.6";
        return String(project.music.volume || 0.18);
      });
      const chains = audioInputs.map((_, index) => `[${index + 1}:a]volume=${weights[index]}[a${index}]`).join(";");
      const labels = audioInputs.map((_, index) => `[a${index}]`).join("");
      const complex = `${chains};${labels}amix=inputs=${audioInputs.length}:duration=first:dropout_transition=0:normalize=0[aout]`;
      try {
        await exec(
          ffmpeg,
          ["-y", ...inputArgs, "-filter_complex", complex, "-map", "0:v:0", "-map", "[aout]", ...baseTail],
          (ratio) => {
            void update(0.9 + ratio * 0.08, "Finalising MP4…");
          },
        );
      } catch (err) {
        addLog(`Audio mix failed (${(err as Error).message}); exporting with narration only.`);
        await exec(ffmpeg, ["-y", "-i", "silent.mp4", "-i", "narration.wav", "-map", "0:v:0", "-map", "1:a:0", ...baseTail]);
      }
    }

    const bytes = await readFileBytes(ffmpeg, "final.mp4");
    if (bytes.length < 10_000) throw new Error("The exported file is unexpectedly small — the render likely failed.");
    const output = new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
    const blobId = await db.putBlob(output, `${project.name} export`);
    const previous = project.export.blobId;

    await mutateProject(projectId, (draft) => {
      draft.export = {
        status: "ready",
        progress: 100,
        message: `Exported ${width}×${height} · ${totalDuration}s`,
        blobId,
        at: Date.now(),
        aspect,
        width,
        height,
        bytes: output.size,
        durationSec: totalDuration,
        withNarration,
        withSubtitles: burnSubtitles && Boolean(font),
        error: undefined,
        log: moduleLogs.slice(-40),
      };
    });
    if (previous && previous !== blobId) await db.deleteBlob(previous);

    await db.addHistory({
      projectId,
      projectName: project.name,
      kind: "export",
      title: "MP4 exported",
      detail: `${width}×${height} · ${totalDuration}s · ${(output.size / 1024 / 1024).toFixed(1)} MB`,
      status: "ok",
    });

    const cleanup = [
      ...videoFiles,
      ...audioFiles,
      "list.txt",
      "alist.txt",
      "silent.mp4",
      "narration.wav",
      "final.mp4",
      "music.wav",
      "sfx.wav",
    ];
    for (const file of cleanup) await ffmpeg.deleteFile(file).catch(() => undefined);

    return { blob: output, width, height, durationSec: totalDuration, log: moduleLogs.slice() };
  } catch (err) {
    const message = (err as Error).message || "Assembly failed.";
    addLog(`ASSEMBLY FAILED: ${message}`);
    await mutateProject(projectId, (draft) => {
      draft.export = {
        ...draft.export,
        status: "failed",
        progress: 0,
        error: message,
        message,
        log: moduleLogs.slice(-40),
      };
    });
    await db.addHistory({
      projectId,
      projectName: project.name,
      kind: "export",
      title: "Export failed",
      detail: message,
      status: "failed",
    });
    throw err;
  }
}

export async function warmUpFFmpeg(onStatus: (message: string) => void): Promise<void> {
  await loadFFmpeg(onStatus);
}

export function exportStatus(project: Project): string {
  if (project.export.status === "ready") return "Ready to download";
  if (project.export.status === "rendering") return project.export.message || "Rendering…";
  if (project.export.status === "failed") return project.export.error || "Export failed";
  return "Not exported yet";
}
