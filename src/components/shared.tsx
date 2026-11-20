import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Film,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  ServerCog,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getBlob } from "../lib/db";
import { formatTime, STATUS_META } from "../lib/format";
import { getProject } from "../lib/projectStore";
import { useBackend } from "../lib/api";
import { useSettings } from "../lib/settings";
import type { Project, Scene } from "../lib/types";
import { Badge, Button, cn } from "./ui";

/* ── Blob URLs ────────────────────────────────────────────────────────────── */

export function useBlobUrl(blobId?: string): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    if (!blobId) {
      setUrl(undefined);
      return;
    }
    void getBlob(blobId).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);

  return url;
}

/* ── Status helpers ───────────────────────────────────────────────────────── */

export function useKeyReady(): boolean {
  const backend = useBackend();
  const settings = useSettings();
  return Boolean(settings.agnesKey.trim() || backend.health?.hasServerKey);
}

export function ConfigNotice({ compact = false }: { compact?: boolean }) {
  const keyReady = useKeyReady();
  const backend = useBackend();
  if (keyReady) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3",
        !compact && "mb-5",
      )}
    >
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-amber-100">No Agnes AI key configured</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-amber-200/70">
          {backend.mode === "direct"
            ? "This build has no server backend, so generation uses a key stored in your browser."
            : "Add a free key at platform.agnes-ai.com. You can keep it in your browser, or set AGNES_API_KEY on the server."}
        </p>
      </div>
      <Link to="/api" className="btn-secondary btn-sm shrink-0 border-amber-300/30 bg-amber-300/10 text-amber-100">
        Configure
      </Link>
    </div>
  );
}

export function TtsBackendNotice() {
  const backend = useBackend();
  if (backend.mode !== "direct") return null;
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-4 py-3">
      <ServerCog className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-sky-100">Narration needs the server backend</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-sky-200/70">
          Free AI narration is proxied because the public TTS endpoint blocks browser requests. Deploy the included
          Cloudflare Worker (or run <span className="kbd">bun dev</span>) and set its URL in API Configuration. Video
          generation itself works without it.
        </p>
      </div>
      <Link to="/api" className="btn-secondary btn-sm shrink-0 border-sky-300/30 bg-sky-300/10 text-sky-100">
        Backend setup
      </Link>
    </div>
  );
}

export function NoProject({ what = "continue" }: { what?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neon-blue">
        <Film className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold text-white">No active project</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">
        Start with one prompt to {what}. Everything is stored locally in this browser.
      </p>
      <Link to="/generator" className="btn-primary mt-5">
        <Wand2 className="h-4 w-4" /> Create a project
      </Link>
    </div>
  );
}

/* ── Scene card ───────────────────────────────────────────────────────────── */

export function SceneCard({
  project,
  scene,
  onGenerate,
  onDelete,
  onMove,
  onSave,
  onPreview,
  busy,
  compact = false,
}: {
  project: Project;
  scene: Scene;
  onGenerate: () => void;
  onDelete?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onSave?: (patch: Partial<Scene>) => void;
  onPreview: (scene: Scene) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const status = STATUS_META[scene.status];
  const videoUrl = useBlobUrl(scene.videoBlobId);
  const [editing, setEditing] = useState(false);
  const [visualPrompt, setVisualPrompt] = useState(scene.visualPrompt);
  const [narration, setNarration] = useState(scene.narration);

  useEffect(() => {
    setVisualPrompt(scene.visualPrompt);
    setNarration(scene.narration);
  }, [scene.visualPrompt, scene.narration]);

  const inFlight = busy || ["queued", "submitting", "generating", "downloading"].includes(scene.status);
  const cast = project.characters.filter((character) => scene.characterIds.includes(character.id));

  return (
    <article className="glass overflow-hidden">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink-950">
        {videoUrl ? (
          <video
            src={videoUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              // Nudge iOS into showing the first frame instead of a black box.
              try {
                event.currentTarget.currentTime = 0.1;
              } catch {
                /* ignore */
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(63,169,255,.18),transparent_60%),radial-gradient(circle_at_75%_80%,rgba(160,107,255,.18),transparent_60%)]">
            <div className="text-center">
              <p className="font-display text-2xl font-bold text-white/25">{String(scene.index + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/30">{scene.durationSec}s scene</p>
            </div>
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur", status.className)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot, inFlight && "animate-pulse")} />
            {status.label}
          </span>
          <span className="chip border-white/15 bg-black/40 text-[10px] text-slate-200 backdrop-blur">
            {scene.durationSec}s
          </span>
        </div>

        {videoUrl && (
          <button
            onClick={() => onPreview(scene)}
            className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition hover:opacity-100 focus:opacity-100"
            aria-label={`Preview scene ${scene.index + 1}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <Play className="h-5 w-5 text-white" />
            </span>
          </button>
        )}

        {inFlight && (
          <div className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 backdrop-blur">
            <div className="flex items-center justify-between text-[10px] text-slate-200">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {scene.status === "queued" ? "Waiting for a slot" : scene.status === "downloading" ? "Downloading clip" : "Rendering"}
              </span>
              <span>{Math.round(scene.progress)}%</span>
            </div>
            <div className="mt-1.5 progress-track h-1">
              <div className="progress-bar" style={{ width: `${Math.max(4, Math.min(100, scene.progress))}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-white">
              {scene.index + 1}. {scene.title || "Untitled scene"}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {scene.cameraAngle || "eye level"} · {scene.cameraMove || "static"} · {project.aspectRatio}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onMove && (
              <>
                <button
                  onClick={() => onMove(-1)}
                  disabled={scene.index === 0}
                  className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                  aria-label="Move scene up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onMove(1)}
                  disabled={scene.index === project.scenes.length - 1}
                  className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                  aria-label="Move scene down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {onSave && (
              <button
                onClick={() => setEditing((value) => !value)}
                className={cn("rounded p-1.5 hover:bg-white/10", editing ? "text-neon-blue" : "text-slate-400 hover:text-white")}
                aria-label="Edit scene prompts"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                aria-label="Delete scene"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!compact && cast.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {cast.map((character) => (
              <span key={character.id} className="chip py-0.5 text-[10px]">
                {character.name}
              </span>
            ))}
          </div>
        )}

        {editing ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="label">Visual prompt</span>
              <textarea
                value={visualPrompt}
                onChange={(event) => setVisualPrompt(event.target.value)}
                className="input min-h-[92px] text-[12px] leading-relaxed"
              />
            </label>
            <label className="block">
              <span className="label">Narration</span>
              <textarea
                value={narration}
                onChange={(event) => setNarration(event.target.value)}
                className="input min-h-[70px] text-[12px] leading-relaxed"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSave?.({ visualPrompt, narration });
                  setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-slate-400">{scene.visualPrompt}</p>
        )}

        {scene.error && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-rose-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0">{scene.error}</span>
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {scene.status === "ready" ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => onPreview(scene)} icon={<Play className="h-3.5 w-3.5" />}>
                Preview
              </Button>
              <Button size="sm" variant="ghost" onClick={onGenerate} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                Regenerate
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={onGenerate}
              loading={inFlight}
              icon={inFlight ? undefined : <Wand2 className="h-3.5 w-3.5" />}
              className="flex-1"
            >
              {scene.status === "failed" ? "Retry scene" : inFlight ? "Generating…" : "Generate scene"}
            </Button>
          )}
          {scene.status === "ready" && scene.videoBlobId && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> clip saved
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── Media modals ─────────────────────────────────────────────────────────── */

export function VideoModal({
  open,
  onClose,
  url,
  title,
  downloadName,
}: {
  open: boolean;
  onClose: () => void;
  url?: string;
  title: string;
  downloadName?: string;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-md", !open && "hidden")}
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="truncate font-display text-sm font-semibold text-white">{title}</h3>
          <div className="flex items-center gap-2">
            {url && downloadName && (
              <a href={url} download={downloadName} className="btn-secondary btn-sm">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            )}
            <button onClick={onClose} className="btn-ghost btn-sm">
              Close
            </button>
          </div>
        </div>
        {url ? (
          <video src={url} controls autoPlay playsInline className="max-h-[75dvh] w-full rounded-xl bg-black shadow-card" />
        ) : (
          <div className="flex h-48 items-center justify-center rounded-xl border border-white/10 text-sm text-slate-400">
            Loading media…
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectMeta({ project }: { project: Project }) {
  const ready = project.scenes.filter((scene) => scene.status === "ready").length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="violet">
        {project.genre} · {project.aspectRatio}
      </Badge>
      <Badge>
        {project.scenes.length} scenes · {formatTime(project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0))}
      </Badge>
      <Badge tone={ready === project.scenes.length && ready > 0 ? "green" : "blue"}>
        {ready}/{project.scenes.length || 0} clips
      </Badge>
    </div>
  );
}

export function projectById(id?: string): Project | undefined {
  return getProject(id);
}

export function InlineNote({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <p
      className={cn(
        "rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed",
        tone === "warn"
          ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-200/80"
          : "border-white/10 bg-white/[0.03] text-slate-400",
      )}
    >
      {children}
    </p>
  );
}
