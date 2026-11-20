import type { Scene, SceneStatus } from "./types";

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(input: string, fallback = "video"): string {
  const cleaned = input
    .replace(/[^\w\d\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .toLowerCase();
  return cleaned || fallback;
}

export const STATUS_META: Record<SceneStatus, { label: string; className: string; dot: string }> = {
  draft: { label: "Draft", className: "border-white/10 bg-white/5 text-slate-300", dot: "bg-slate-400" },
  queued: { label: "Queued", className: "border-sky-400/25 bg-sky-400/10 text-sky-200", dot: "bg-sky-400" },
  submitting: { label: "Submitting", className: "border-sky-400/25 bg-sky-400/10 text-sky-200", dot: "bg-sky-400" },
  generating: { label: "Generating", className: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-400" },
  downloading: { label: "Downloading", className: "border-sky-400/25 bg-sky-400/10 text-sky-200", dot: "bg-sky-400" },
  ready: { label: "Ready", className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400" },
  failed: { label: "Failed", className: "border-rose-400/25 bg-rose-400/10 text-rose-200", dot: "bg-rose-400" },
};

export function readyScenes(scenes: Scene[]): Scene[] {
  return scenes.filter((scene) => scene.status === "ready" && scene.videoBlobId);
}

export function totalDuration(scenes: Scene[]): number {
  return scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
}

export function sceneProgress(scenes: Scene[]): number {
  if (!scenes.length) return 0;
  const done = scenes.filter((s) => s.status === "ready").length;
  return Math.round((done / scenes.length) * 100);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
