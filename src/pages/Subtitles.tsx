import { Captions, Clipboard, Download, Film, Info } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, PageHeader, Stat, Toggle, useToast } from "../components/ui";
import { NoProject } from "../components/shared";
import { downloadBlob, formatTime, safeFilename } from "../lib/format";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import { buildCues, srtTimestamp, toSrt } from "../lib/subtitles";

export default function Subtitles() {
  const project = useActiveProject();
  const { toast } = useToast();

  const cues = useMemo(() => (project ? buildCues(project.scenes) : []), [project]);
  const srt = useMemo(() => toSrt(cues), [cues]);
  const totalDuration = project?.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) || 0;

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="Subtitle Studio" title="Captions, timed to the cut" description="Generated from the narration script, exportable as SRT and burnable into the MP4." />
        <NoProject what="caption your film" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Subtitle Studio"
        title="Captions that follow the voice"
        description="Timing is derived from each scene's runtime and narration length, so captions stay in sync with the edit."
        actions={
          <>
            <Badge tone="blue">{cues.length} cues</Badge>
            <Button
              variant="secondary"
              icon={<Clipboard className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(srt);
                toast("SRT copied to clipboard.", "success");
              }}
            >
              Copy SRT
            </Button>
            <Button
              icon={<Download className="h-4 w-4" />}
              onClick={() => downloadBlob(new Blob([srt], { type: "application/x-subrip" }), `${safeFilename(project.name)}.srt`)}
            >
              Export .srt
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Cues" value={cues.length} hint="2-line captions" />
        <Stat label="Runtime" value={formatTime(totalDuration)} hint={`${project.scenes.length} scenes`} />
        <Stat label="Burn-in" value={project.subtitles.burnedIn ? "On" : "Off"} hint="Applied on export" />
        <Stat label="Format" value="SRT" hint="UTF-8, comma timings" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className="space-y-4">
          <Card title="Burn-in" subtitle="Captions are drawn into the video with FFmpeg during assembly.">
            <Toggle
              checked={project.subtitles.burnedIn}
              onChange={(value) => void mutateProject(project.id, (draft) => { draft.subtitles.burnedIn = value; })}
              label="Burn subtitles into the exported MP4"
              description="A clean SRT is always generated separately. Burning in cannot be undone after export."
            />
            <div className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-slate-400">
              <p className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                Captions sit at 91% height with a translucent box, safe for phone screens and the 9:16 crop.
              </p>
              <p className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                Font size scales with output height (720p ≈ 33px). Two lines maximum, ~84 characters per cue.
              </p>
              <p className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                Editing narration in the Story Writer changes these cues on the next run.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/editor" className="btn-primary btn-sm">
                <Film className="h-3.5 w-3.5" /> Export with captions
              </Link>
              <Link to="/story" className="btn-secondary btn-sm">
                Edit narration
              </Link>
            </div>
          </Card>

          <Card title="Preview" subtitle="How a cue looks on a dark frame.">
            <div className="relative flex aspect-[9/16] max-h-[340px] items-end justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_40%_30%,#1a2440,#05070f)] p-4">
              <p className="whitespace-pre-line rounded-lg bg-black/60 px-3 py-2 text-center text-[13px] font-semibold leading-snug text-white">
                {cues[0]?.text || "Add narration to see a caption preview."}
              </p>
              <span className="absolute left-3 top-3 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                {cues[0] ? `${srtTimestamp(cues[0].start)} → ${srtTimestamp(cues[0].end)}` : "--"}
              </span>
            </div>
          </Card>
        </div>

        <Card title="Cue list" subtitle="Read-only timing map. Edit the spoken text in the Story Writer.">
          {cues.length === 0 ? (
            <p className="text-[12.5px] text-slate-400">No narration text yet — captions are generated from it.</p>
          ) : (
            <div className="max-h-[540px] space-y-1.5 overflow-y-auto pr-1 scroll-thin">
              {cues.map((cue, index) => (
                <div key={index} className="flex gap-3 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
                  <span className="w-12 shrink-0 font-mono text-[10px] text-slate-500">{cue.start.toFixed(1)}s</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-slate-200">{cue.text}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      scene {cue.sceneIndex + 1} · {Math.max(0.1, cue.end - cue.start).toFixed(1)}s ·{" "}
                      {cue.text.split(/\s+/).length} words
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <Captions className="h-3 w-3" /> {srt.split("\n").length} SRT lines ready
          </p>
        </Card>
      </div>
    </div>
  );
}
