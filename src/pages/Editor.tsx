import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, PageHeader, Progress, Segmented, Stat, Toggle, useToast } from "../components/ui";
import { InlineNote, NoProject, useBlobUrl } from "../components/shared";
import { getBlob } from "../lib/db";
import { downloadBlob, formatBytes, formatTime, safeFilename } from "../lib/format";
import { DIMENSIONS, assembleProject } from "../lib/ffmpeg";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import { buildCues, toSrt } from "../lib/subtitles";
import type { Scene, AspectRatio } from "../lib/types";
import { ASPECT_RATIOS } from "../lib/types";

export default function Editor() {
  const project = useActiveProject();
  const { toast } = useToast();
  const [assembling, setAssembling] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>(project?.aspectRatio || "9:16");
  const [burn, setBurn] = useState(project?.subtitles.burnedIn ?? true);
  const [narration, setNarration] = useState(true);
  const [music, setMusic] = useState((project?.music.mode || "none") !== "none");
  const [sfx, setSfx] = useState(project?.sfx.enabled ?? false);
  const exportUrl = useBlobUrl(project?.export.blobId);
  const projectId = project?.id;

  // Switching projects remounts nothing, so refresh the render options that are local UI state.
  useEffect(() => {
    if (!project) return;
    setAspect(project.aspectRatio);
    setBurn(project.subtitles.burnedIn ?? true);
    setNarration(true);
    setMusic((project.music.mode || "none") !== "none");
    setSfx(project.sfx.enabled ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="Video Editor" title="Assemble and export" description="Normalise, join, mix narration, captions and music into one MP4." />
        <NoProject what="edit and export" />
      </div>
    );
  }

  const ready = project.scenes.filter((scene) => scene.status === "ready" && scene.videoBlobId);
  const missing = project.scenes.length - ready.length;
  const duration = project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  const voiced = Object.keys(project.narration.sceneAudio).length;
  const dims = DIMENSIONS[aspect];
  const staleExport =
    project.export.status === "ready" &&
    project.export.at !== undefined &&
    project.scenes.some((scene) => (scene.generatedAt || 0) > (project.export.at || 0));

  async function assemble() {
    if (!project) return;
    if (missing > 0) {
      toast(`Generate the ${missing} missing scene${missing > 1 ? "s" : ""} first.`, "error");
      return;
    }
    setAssembling(true);
    try {
      await assembleProject(project.id, {
        aspectRatio: aspect,
        burnSubtitles: burn,
        withNarration: narration,
        withMusic: music,
        withSfx: sfx,
      });
      toast("MP4 exported. Preview and download it below.", "success");
    } catch (err) {
      toast((err as Error).message || "Export failed.", "error");
    } finally {
      setAssembling(false);
    }
  }

  async function downloadAllClips() {
    if (!project) return;
    for (const scene of ready) {
      const blob = await getBlob(scene.videoBlobId);
      if (blob) {
        downloadBlob(blob, `${safeFilename(project.name)}-scene-${scene.index + 1}.mp4`);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    toast(`Queued ${ready.length} clip downloads.`, "success");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Video Editor"
        title="Timeline, mix and final render"
        description="One FFmpeg pass normalises every clip, joins them, adds the voice tracks, captions and beds, then writes an MP4 you can download."
        actions={
          <>
            <Badge tone={project.export.status === "ready" ? "green" : "neutral"}>{project.export.status}</Badge>
            <Button onClick={assemble} loading={assembling} icon={<Wand2 className="h-4 w-4" />}>
              {project.export.status === "ready" ? "Re-export" : "Assemble MP4"}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Scenes ready" value={`${ready.length}/${project.scenes.length}`} hint={missing ? `${missing} missing` : "complete"} />
        <Stat label="Runtime" value={formatTime(duration)} hint={`${project.scenes.length} scenes`} />
        <Stat label="Voice tracks" value={`${voiced}/${project.scenes.length}`} hint={narration ? "mixed in" : "skipped"} />
        <Stat label="Output" value={`${dims.width}×${dims.height}`} hint={`${aspect} · H.264`} />
      </div>

      {staleExport && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-3 text-[12px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Clips changed after this export. Re-export to include the new takes.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card
            title="Timeline"
            subtitle="Order follows the storyboard. Reorder scenes in the Storyboard view."
            actions={
              <Link to="/storyboard" className="btn-ghost btn-sm text-neon-blue">
                Edit order
              </Link>
            }
          >
            {project.scenes.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No scenes yet.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2 scroll-thin">
                {project.scenes.map((scene) => (
                  <TimelineCard key={scene.id} scene={scene} />
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip">
                <Clapperboard className="h-3 w-3" /> {project.aspectRatio} project
              </span>
              <span className="chip">{project.style}</span>
              <Button size="sm" variant="secondary" disabled={!ready.length} onClick={downloadAllClips} icon={<Download className="h-3.5 w-3.5" />}>
                Download clips
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!project.scenes.length}
                onClick={() =>
                  downloadBlob(
                    new Blob([toSrt(buildCues(project.scenes))], { type: "application/x-subrip" }),
                    `${safeFilename(project.name)}.srt`,
                  )
                }
                icon={<Download className="h-3.5 w-3.5" />}
              >
                SRT
              </Button>
            </div>
          </Card>

          <Card title="Export result" subtitle={`${dims.width}×${dims.height} · H.264 MP4 · AAC audio`}>
            {project.export.status === "ready" && exportUrl ? (
              <div className="space-y-3">
                <video src={exportUrl} controls playsInline className="w-full rounded-xl bg-black" />
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={exportUrl}
                    download={`${safeFilename(project.name)}-${project.export.width || dims.width}x${project.export.height || dims.height}.mp4`}
                    className="btn-primary"
                  >
                    <Download className="h-4 w-4" /> Download MP4
                  </a>
                  <Badge tone="green">{formatBytes(project.export.bytes || 0)}</Badge>
                  <Badge>{project.export.durationSec || duration}s</Badge>
                  {project.export.withNarration && <Badge tone="blue">narration</Badge>}
                  {project.export.withSubtitles && <Badge tone="violet">captions burned</Badge>}
                </div>
              </div>
            ) : project.export.status === "rendering" ? (
              <div className="space-y-3 py-6 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-neon-blue" />
                <p className="text-[12.5px] text-slate-300">{project.export.message || "Rendering…"}</p>
                <Progress value={project.export.progress} className="mx-auto max-w-sm" />
                <p className="text-[11px] text-slate-500">
                  Keep this tab open. The first run downloads the ~32 MB FFmpeg core.
                </p>
              </div>
            ) : project.export.status === "failed" ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-[12px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {project.export.error}
                </p>
                {project.export.log && (
                  <pre className="max-h-40 overflow-auto rounded-lg border border-white/8 bg-ink-950/70 p-2.5 font-mono text-[10px] leading-relaxed text-slate-400 scroll-thin">
                    {project.export.log.slice(-18).join("\n")}
                  </pre>
                )}
              </div>
            ) : (
              <div className="py-6 text-center">
                <Film className="mx-auto h-6 w-6 text-slate-600" />
                <p className="mt-2 text-[12.5px] text-slate-400">
                  {missing ? `Generate ${missing} more scene${missing > 1 ? "s" : ""} to unlock export.` : "Everything is ready. Assemble the MP4."}
                </p>
                <Button className="mt-4" onClick={assemble} disabled={missing > 0 || assembling} icon={<Wand2 className="h-4 w-4" />}>
                  Assemble MP4
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Export settings" subtitle="These do not alter your project, only this render.">
            <div className="space-y-3">
              <div>
                <span className="label">Output framing</span>
                <Segmented
                  className="w-full"
                  value={aspect}
                  onChange={(value) => {
                    setAspect(value);
                    void mutateProject(project.id, (draft) => {
                      draft.aspectRatio = value;
                    });
                  }}
                  options={ASPECT_RATIOS.map((ratio) => ({
                    value: ratio,
                    label: `${ratio}`,
                  }))}
                />
                <p className="mt-1.5 text-[10.5px] text-slate-500">
                  {dims.width}×{dims.height} · scenes are letterboxed and centre-cropped as needed
                </p>
              </div>

              <Toggle checked={burn} onChange={setBurn} label="Burn in subtitles" description="Adds readable captions during encoding." />
              <Toggle
                checked={narration}
                onChange={setNarration}
                label="Mix narration"
                description={voiced ? `${voiced} voice tracks available.` : "No voice tracks yet — the export will be silent apart from music/sfx."}
              />
              <Toggle
                checked={music}
                onChange={setMusic}
                label="Mix music bed"
                description={project.music.mode === "none" ? "No music selected in the Sound Effects Studio." : `Mode: ${project.music.mode}`}
              />
              <Toggle
                checked={sfx}
                onChange={setSfx}
                label="Mix sound-effect bed"
                description={project.sfx.enabled ? "Per-scene effects enabled." : "Enable it in the Sound Effects Studio."}
              />

              <Button className="w-full" onClick={assemble} loading={assembling} disabled={missing > 0} icon={<Film className="h-4 w-4" />}>
                {missing > 0 ? `${missing} scene${missing > 1 ? "s" : ""} missing` : "ASSEMBLE MP4"}
              </Button>

              {missing > 0 && (
                <Link to="/scenes" className="btn-secondary btn-sm w-full justify-center">
                  <RefreshCw className="h-3.5 w-3.5" /> Finish the missing scenes
                </Link>
              )}
            </div>
          </Card>

          <Card title="Render checklist" subtitle="What this export will contain.">
            <ul className="space-y-2 text-[11.5px] leading-relaxed">
              {[
                { ok: ready.length === project.scenes.length && ready.length > 0, label: `${ready.length}/${project.scenes.length} verified clips` },
                { ok: narration ? voiced > 0 : true, label: narration ? `${voiced} narration tracks` : "Narration skipped" },
                { ok: burn && Boolean(project.narration.generatedAt !== undefined), label: burn ? "Subtitle burn-in" : "Clean video" },
                { ok: music ? project.music.mode !== "none" : true, label: music ? "Music bed" : "No music" },
                { ok: sfx ? project.sfx.enabled : true, label: sfx ? "SFX bed" : "No SFX" },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  {item.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Info className="h-3.5 w-3.5 text-slate-500" />}
                  <span className={item.ok ? "text-slate-200" : "text-slate-500"}>{item.label}</span>
                </li>
              ))}
            </ul>
            <InlineNote tone="warn">
              <span className="font-medium">iPhone note:</span> FFmpeg.wasm runs in Safari, but memory is tight. 15–60s
              cuts assemble reliably; for 90–120s use a desktop browser or export in two halves.
            </InlineNote>
          </Card>

          {project.export.log && project.export.log.length > 0 && (
            <Card title="Assembly log" subtitle="Last lines from FFmpeg." actions={<Layers className="h-4 w-4 text-slate-500" />}>
              <pre className="max-h-52 overflow-auto rounded-lg border border-white/8 bg-ink-950/70 p-2.5 font-mono text-[10px] leading-relaxed text-slate-400 scroll-thin">
                {project.export.log.slice(-24).join("\n")}
              </pre>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineCard({ scene }: { scene: Scene }) {
  const url = useBlobUrl(scene.videoBlobId);
  return (
    <div className="w-28 shrink-0">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-ink-950">
        {url ? (
          <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-slate-600">no clip</div>
        )}
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] text-slate-200">
          {scene.durationSec}s
        </span>
      </div>
      <p className="mt-1 truncate text-[10.5px] text-slate-400">
        {scene.index + 1}. {scene.title}
      </p>
    </div>
  );
}
