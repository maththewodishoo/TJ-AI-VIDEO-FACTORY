import { Info, Mic, Play, RefreshCw, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Progress, Segmented, useToast } from "../components/ui";
import { ConfigNotice, NoProject, TtsBackendNotice, useBlobUrl } from "../components/shared";
import { ApiError, getVoices, synthesizeSpeech } from "../lib/api";
import { deleteBlob, putBlob } from "../lib/db";
import { generateNarration, useEngine } from "../lib/pipeline";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import { getSettings, setSettings, useSettings } from "../lib/settings";
import type { Scene, VoiceCatalog } from "../lib/types";

export default function Voiceover() {
  const project = useActiveProject();
  const settings = useSettings();
  const engine = useEngine();
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void getVoices()
      .then(setCatalog)
      .catch((err) => setCatalogError(err instanceof Error ? err.message : "Voice catalogue unavailable."));
  }, []);

  const voiced = project ? Object.keys(project.narration.sceneAudio).length : 0;
  const total = project?.scenes.length ?? 0;

  async function previewVoice() {
    setPreviewing(true);
    try {
      const sample =
        project?.scenes.find((scene) => scene.narration.trim())?.narration.slice(0, 220) ||
        "This is the voice that will narrate your film. Every scene is recorded separately, then timed to the cut.";
      const blob = await synthesizeSpeech(sample, { hosted: settings.ttsMode === "hosted" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "tts_needs_backend") {
        browserPreview(project?.scenes[0]);
      } else {
        toast((err as Error).message, "error");
      }
    } finally {
      setPreviewing(false);
    }
  }

  function browserPreview(scene?: Scene) {
    if (!("speechSynthesis" in window)) {
      toast("This browser has no speech synthesis fallback.", "error");
      return;
    }
    const text = scene?.narration || "Preview of the built-in system voice. This cannot be exported into the video.";
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 300));
    utterance.rate = settings.voiceRate;
    window.speechSynthesis.speak(utterance);
    toast("Playing the browser's system voice (preview only).", "info");
  }

  async function generateAll() {
    if (!project) return;
    setGenerating(true);
    try {
      await generateNarration(project.id);
      toast("Narration pass finished.", "success");
    } finally {
      setGenerating(false);
    }
  }

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="AI Voiceover" title="Narration that fits the cut" description="Per-scene voice tracks, timed exactly to each clip." />
        <NoProject what="narrate your film" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="AI Voiceover"
        title="Give the film a voice"
        description="Narration is generated per scene, padded to the exact scene length, then mixed into the final MP4."
        actions={
          <>
            <Badge tone={voiced ? "green" : "neutral"}>
              {voiced}/{total} scenes voiced
            </Badge>
            <Button onClick={generateAll} loading={generating || engine.busy} icon={<Mic className="h-4 w-4" />}>
              Generate narration
            </Button>
          </>
        }
      />

      <ConfigNotice />
      <TtsBackendNotice />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Card title="Voice" subtitle="Free narration is proxied server-side; hosted voices need a key.">
            <div className="space-y-3">
              <Field label="Provider">
                <Segmented
                  className="w-full"
                  value={settings.ttsMode}
                  onChange={(value) => setSettings({ ttsMode: value })}
                  options={[
                    { value: "free", label: "Free (Google TTS)" },
                    { value: "hosted", label: "Hosted (key)" },
                  ]}
                />
              </Field>

              {settings.ttsMode === "free" ? (
                <Field
                  label="Language / voice"
                  hint="The free provider exposes exactly one voice per language. Gender selection is not supported."
                >
                  <select
                    className="select"
                    value={settings.ttsLang}
                    onChange={(event) => {
                      const lang = event.target.value;
                      setSettings({ ttsLang: lang, ttsVoice: lang });
                    }}
                  >
                    {(catalog?.free || [{ id: settings.ttsLang, label: settings.ttsLang, gender: "neutral", provider: "google" }]).map(
                      (voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Voice" hint="Male and female voices depend on your hosted TTS provider.">
                    <select className="select" value={settings.ttsVoice} onChange={(event) => setSettings({ ttsVoice: event.target.value })}>
                      {(catalog?.hosted || []).map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="TTS base URL" hint="OpenAI-compatible /v1 endpoint, e.g. https://api.openai.com/v1">
                    <input className="input" value={settings.ttsBaseUrl} onChange={(event) => setSettings({ ttsBaseUrl: event.target.value })} placeholder="https://…/v1" />
                  </Field>
                  <Field label="TTS API key" hint="Stored in this browser only. Prefer TTS_API_KEY on the server for shared deployments.">
                    <input className="input" type="password" value={settings.ttsApiKey} onChange={(event) => setSettings({ ttsApiKey: event.target.value })} autoComplete="off" />
                  </Field>
                </>
              )}

              <Field label={`Narration speed · ${settings.voiceRate.toFixed(2)}×`} hint="Applied at mixdown with FFmpeg atempo, so the exported audio matches.">
                <input
                  type="range"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={settings.voiceRate}
                  onChange={(event) => setSettings({ voiceRate: Number(event.target.value) })}
                  className="w-full accent-[#3fa9ff]"
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={previewVoice} loading={previewing} icon={<Volume2 className="h-4 w-4" />}>
                  Preview voice
                </Button>
                <Button variant="ghost" onClick={() => browserPreview(project.scenes[0])} icon={<Play className="h-4 w-4" />}>
                  System voice
                </Button>
              </div>

              {previewUrl && (
                <audio controls src={previewUrl} className="w-full">
                  <track kind="captions" />
                </audio>
              )}

              {catalogError && <p className="text-[11px] text-amber-300">{catalogError}</p>}

              <div className="rounded-xl border border-white/8 bg-ink-950/50 p-3">
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-200">
                  <Info className="h-3.5 w-3.5 text-sky-300" /> Free TTS limits
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{catalog?.note || "One voice per language, rate limited, no gender options."}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  The browser's speech synthesis is available as a zero-cost preview, but browsers do not let a page
                  capture that audio, so it cannot be mixed into the export.
                </p>
              </div>
            </div>
          </Card>

          <Progress value={total ? (voiced / total) * 100 : 0} label={`${voiced}/${total} voice tracks generated`} />
        </div>

        <Card title="Scene narration" subtitle="Each track is trimmed or padded to its scene duration during assembly.">
          {project.scenes.length === 0 ? (
            <p className="text-[12.5px] text-slate-400">No scenes yet.</p>
          ) : (
            <div className="space-y-2.5">
              {project.scenes.map((scene) => (
                <SceneNarrationRow
                  key={scene.id}
                  scene={scene}
                  projectId={project.id}
                  blobId={project.narration.sceneAudio[scene.id]}
                />
              ))}
            </div>
          )}
          {project.narration.errors && (
            <div className="mt-3 space-y-1">
              {Object.entries(project.narration.errors).map(([sceneId, message]) => (
                <p key={sceneId} className="text-[11px] text-rose-300">
                  Scene {project.scenes.findIndex((scene) => scene.id === sceneId) + 1}: {message}
                </p>
              ))}
            </div>
          )}
          <Button
            className="mt-4 w-full"
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => {
              void mutateProject(project.id, (draft) => {
                draft.narration.sceneAudio = {};
                draft.narration.errors = undefined;
                draft.narration.generatedAt = undefined;
              });
              toast("Voice tracks cleared. Generate again to rebuild them.", "info");
            }}
          >
            Clear all voice tracks
          </Button>
        </Card>
      </div>
    </div>
  );
}

function SceneNarrationRow({
  scene,
  projectId,
  blobId,
}: {
  scene: Scene;
  projectId: string;
  blobId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const url = useBlobUrl(blobId);

  async function voice() {
    setBusy(true);
    try {
      const blob = await synthesizeSpeech(scene.narration || scene.dialogue);
      const id = await putBlob(blob, `Narration scene ${scene.index + 1}`);
      await mutateProject(projectId, (draft) => {
        const previous = draft.narration.sceneAudio[scene.id];
        draft.narration.sceneAudio[scene.id] = id;
        if (previous && previous !== id) void deleteBlob(previous);
      });
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-semibold text-slate-200">
          {scene.index + 1}. {scene.title || "Scene"} <span className="text-slate-500">· {scene.durationSec}s</span>
        </p>
        <Button size="sm" variant="ghost" loading={busy} onClick={voice} icon={<Mic className="h-3 w-3" />}>
          {url ? "Re-voice" : "Voice"}
        </Button>
      </div>
      <p className="line-clamp-2 text-[11.5px] leading-relaxed text-slate-400">{scene.narration || "No narration text."}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-slate-500">
          {getSettings().ttsLang} · {getSettings().ttsMode}
        </span>
        {url ? (
          <audio controls src={url} className="ml-auto h-8 w-40">
            <track kind="captions" />
          </audio>
        ) : (
          <span className="ml-auto text-[10px] text-slate-600">{busy ? "Recording…" : "no track"}</span>
        )}
      </div>
    </div>
  );
}
