import { AudioLines, Download, Music2, Play, Trash2, Upload, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Segmented, Toggle, useToast } from "../components/ui";
import { NoProject } from "../components/shared";
import { renderAmbientMusic, renderSfx } from "../lib/audio";
import { putBlob } from "../lib/db";
import { downloadBlob, formatBytes, formatTime, safeFilename } from "../lib/format";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import type { MusicMode, SfxPreset } from "../lib/types";

const PRESETS: { id: SfxPreset; label: string; description: string }[] = [
  { id: "whoosh", label: "Whoosh", description: "Transition sweep" },
  { id: "impact", label: "Impact", description: "Low hit with crack" },
  { id: "riser", label: "Riser", description: "Building tension" },
  { id: "heartbeat", label: "Heartbeat", description: "Two slow thumps" },
  { id: "rain", label: "Rain", description: "Steady ambience" },
  { id: "sparkle", label: "Sparkle", description: "Reveal chime" },
  { id: "drone", label: "Drone", description: "Low ominous bed" },
];

const MOODS = [
  { value: "cinematic", label: "Cinematic" },
  { value: "tense", label: "Tense" },
  { value: "warm", label: "Warm" },
  { value: "uplifting", label: "Uplifting" },
] as const;

export default function SoundEffects() {
  const project = useActiveProject();
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function play(blob: Blob, label: string) {
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(blob);
    setPreview(url);
    setPreviewLabel(label);
  }

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="Sound Effects Studio" title="Sound design without samples" description="Every effect and music bed is synthesised locally — zero licensing, zero API." />
        <NoProject what="add sound" />
      </div>
    );
  }

  const total = project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Sound Effects Studio"
        title="Synthesised sound, generated in your browser"
        description="Effects and ambient beds are built with a small DSP engine, so they are free, offline and safe to publish."
        actions={
          <>
            <Badge tone="violet">{PRESETS.length} effects</Badge>
            <Badge tone="blue">{formatTime(total)} timeline</Badge>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card title="Effect library" subtitle="Preview or download a 1.8s WAV. Assign presets per scene below.">
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => (
                <div key={preset.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12.5px] font-semibold text-white">{preset.label}</p>
                      <p className="text-[10.5px] text-slate-500">{preset.description}</p>
                    </div>
                    <AudioLines className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Play className="h-3 w-3" />}
                      onClick={() => play(renderSfx(preset.id), preset.label)}
                    >
                      Play
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Download className="h-3 w-3" />}
                      onClick={() => downloadBlob(renderSfx(preset.id), `${preset.id}.wav`)}
                    >
                      WAV
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Scene assignment" subtitle="Used by the automatic SFX bed during assembly.">
            <Toggle
              checked={project.sfx.enabled}
              onChange={(value) => void mutateProject(project.id, (draft) => { draft.sfx.enabled = value; })}
              label="Mix a sound-effect bed into the export"
              description="One effect is placed at the start of each scene, at the volume below."
            />
            <Field label={`SFX volume · ${Math.round(project.sfx.volume * 100)}%`} className="mt-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={project.sfx.volume}
                onChange={(event) =>
                  void mutateProject(project.id, (draft) => {
                    draft.sfx.volume = Number(event.target.value);
                  })
                }
                className="w-full accent-[#3fa9ff]"
              />
            </Field>
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1 scroll-thin">
              {project.scenes.map((scene) => (
                <div key={scene.id} className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-2.5 py-2">
                  <span className="w-7 shrink-0 text-[10px] text-slate-500">#{scene.index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-300">{scene.title}</span>
                  <select
                    className="select w-28 py-1 text-[11px]"
                    value={scene.sfxPreset || ""}
                    onChange={(event) =>
                      void mutateProject(project.id, (draft) => {
                        const target = draft.scenes.find((item) => item.id === scene.id);
                        if (target) target.sfxPreset = (event.target.value || undefined) as SfxPreset | undefined;
                      })
                    }
                  >
                    <option value="">Auto</option>
                    {PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Music bed" subtitle="Generate an ambient score sized to your runtime, or upload a track you own.">
            <Segmented
              className="w-full"
              value={project.music.mode}
              onChange={(value) =>
                void mutateProject(project.id, (draft) => {
                  draft.music.mode = value as MusicMode;
                })
              }
              options={[
                { value: "none", label: "None" },
                { value: "ambient", label: "Generated" },
                { value: "upload", label: "Upload" },
              ]}
            />

            {project.music.mode === "ambient" && (
              <div className="mt-3 space-y-3">
                <div>
                  <span className="label">Mood</span>
                  <Segmented
                    className="w-full"
                    value={project.music.mood}
                    onChange={(value) =>
                      void mutateProject(project.id, (draft) => {
                        draft.music.mood = value;
                      })
                    }
                    options={MOODS.map((mood) => ({ value: mood.value, label: mood.label }))}
                  />
                </div>
                <Button
                  variant="secondary"
                  icon={<Play className="h-4 w-4" />}
                  onClick={() => play(renderAmbientMusic(8, project.music.mood), `${project.music.mood} preview`)}
                >
                  Preview 8 seconds
                </Button>
                <Button
                  variant="ghost"
                  icon={<Download className="h-3.5 w-3.5" />}
                  onClick={() =>
                    downloadBlob(
                      renderAmbientMusic(Math.min(30, Math.max(8, total)), project.music.mood),
                      `${safeFilename(project.name)}-bed.wav`,
                    )
                  }
                >
                  Download a {Math.min(30, Math.max(8, total))}s bed
                </Button>
              </div>
            )}

            {project.music.mode === "upload" && (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-dashed border-white/15 bg-ink-950/50 p-4 text-center">
                  <Music2 className="mx-auto h-5 w-5 text-slate-500" />
                  <p className="mt-1.5 text-[12px] text-slate-300">
                    {project.music.name || (project.music.blobId ? "Track stored" : "No track uploaded")}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">MP3, M4A or WAV · looped and trimmed to the cut</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<Upload className="h-4 w-4" />}>
                    Choose audio
                  </Button>
                  {project.music.blobId && (
                    <Button
                      variant="danger"
                      onClick={() =>
                        void mutateProject(project.id, (draft) => {
                          draft.music.blobId = undefined;
                          draft.music.name = undefined;
                          draft.music.mode = "none";
                        })
                      }
                      icon={<Trash2 className="h-4 w-4" />}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > 40 * 1024 * 1024) {
                      toast("That audio file is larger than 40 MB.", "error");
                      return;
                    }
                    const blobId = await putBlob(file, file.name);
                    await mutateProject(project.id, (draft) => {
                      draft.music.blobId = blobId;
                      draft.music.name = `${file.name} · ${formatBytes(file.size)}`;
                      draft.music.mode = "upload";
                    });
                    toast("Music track stored locally.", "success");
                  }}
                />
              </div>
            )}

            {project.music.mode !== "none" && (
              <Field label={`Music volume · ${Math.round(project.music.volume * 100)}%`} className="mt-3">
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.02}
                  value={project.music.volume}
                  onChange={(event) =>
                    void mutateProject(project.id, (draft) => {
                      draft.music.volume = Number(event.target.value);
                    })
                  }
                  className="w-full accent-[#3fa9ff]"
                />
              </Field>
            )}

            <p className="mt-3 rounded-lg border border-white/8 bg-ink-950/50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
              Generated music is a synthesised pad, not a licensed commercial track. Upload your own music if you need a
              specific song — and make sure you have the rights.
            </p>
          </Card>

          {preview && (
            <Card title={previewLabel || "Preview"} actions={<Volume2 className="h-4 w-4 text-slate-500" />}>
              <audio controls autoPlay src={preview} className="w-full">
                <track kind="captions" />
              </audio>
            </Card>
          )}

          <Card title="How assembly mixes sound" subtitle="Three layers, each with its own gain.">
            <div className="space-y-2 text-[11.5px] leading-relaxed text-slate-400">
              {[
                ["Narration", "100% · per-scene, padded to scene length"],
                ["SFX bed", "60% of the selected gain · one hit per scene"],
                ["Music", `${Math.round(project.music.volume * 100)}% · looped to the total runtime`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">{label}</span>
                  <span className="text-right text-[11px] text-slate-500">{value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-slate-500">
              The mix is rendered by FFmpeg.wasm in the browser during export. Long timelines on a phone will be slower —
              export 30–60s versions on mobile, longer cuts on desktop.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
