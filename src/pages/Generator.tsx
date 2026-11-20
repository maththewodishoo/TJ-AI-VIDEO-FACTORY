import {
  AlertTriangle,
  ArrowRight,
  Captions,
  Clapperboard,
  Film,
  Gauge,
  Layers,
  Mic,
  PenLine,
  Sparkles,
  Square,
  Users,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Field, PageHeader, Progress, Segmented, Toggle, useToast } from "../components/ui";
import { ConfigNotice, InlineNote } from "../components/shared";
import { backendLabel, useBackend } from "../lib/api";
import { formatTime } from "../lib/format";
import { scenePlan } from "../lib/plan";
import { cancelGeneration, generateScene, generateScenes, generateScript, useEngine } from "../lib/pipeline";
import { createProject, mutateProject, useActiveProject } from "../lib/projectStore";
import { useSettings } from "../lib/settings";
import { ASPECT_RATIOS, DURATIONS, GENRES, type AspectRatio, type Project } from "../lib/types";

const STYLES = [
  "cinematic photoreal",
  "documentary realism",
  "moody film noir",
  "anime illustration",
  "stylised 3D animation",
  "vintage 16mm film",
  "hyperreal product commercial",
  "painterly fantasy",
];

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Hindi",
  "Arabic",
  "Japanese",
  "Korean",
  "Chinese",
  "Russian",
  "Turkish",
  "Indonesian",
  "Vietnamese",
  "Italian",
];

const IDEAS: { genre: string; prompt: string }[] = [
  {
    genre: "Horror",
    prompt: "A night-shift nurse realises every patient in ward six has the same face — hers.",
  },
  {
    genre: "Mystery",
    prompt: "A lighthouse keeper starts receiving letters from a ship that sank forty years ago.",
  },
  {
    genre: "Documentary",
    prompt: "The last analogue film lab in the country races to save a century of home movies.",
  },
  {
    genre: "Science fiction",
    prompt: "A colony ship wakes one passenger too early, and the ship refuses to say why.",
  },
  {
    genre: "Motivation",
    prompt: "A runner who lost a leg returns to the same hill every dawn for one year.",
  },
  {
    genre: "Cinematic advertisement",
    prompt: "A minimalist coffee brand, shot like a luxury car campaign in the rain.",
  },
];

interface FormState {
  prompt: string;
  genre: string;
  style: string;
  language: string;
  aspectRatio: AspectRatio;
  durationSec: number;
  sceneDuration: number;
  subtitles: boolean;
}

function formFrom(project: Project | undefined, sceneDuration: number, subtitles: boolean): FormState {
  return {
    prompt: project?.prompt || "",
    genre: String(project?.genre || "Mystery"),
    style: project?.style || "cinematic photoreal",
    language: project?.language || "English",
    aspectRatio: project?.aspectRatio || "9:16",
    durationSec: project?.durationSec || 60,
    sceneDuration: project?.sceneDuration || sceneDuration,
    subtitles: project?.subtitles.burnedIn ?? subtitles,
  };
}

export default function Generator() {
  const active = useActiveProject();
  const settings = useSettings();
  const backend = useBackend();
  const engine = useEngine();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<FormState>(() => formFrom(active, settings.sceneDuration, settings.subtitlesDefault));
  const [starting, setStarting] = useState(false);
  const runRef = useRef<(mode: "full" | "script") => Promise<void>>(async () => undefined);
  const autoStarted = useRef(false);

  useEffect(() => {
    setForm(formFrom(active, settings.sceneDuration, settings.subtitlesDefault));
  }, [active?.id, settings.sceneDuration, settings.subtitlesDefault]);

  const plan = scenePlan(form.durationSec, form.sceneDuration);
  const estimateMinutes = Math.round(plan.length * 1.6);
  const activeScenes = active?.scenes.length ?? 0;
  const ready = active?.scenes.filter((scene) => scene.status === "ready").length ?? 0;

  async function run(mode: "full" | "script") {
    if (!form.prompt.trim()) {
      toast("Describe your video idea first.", "error");
      return;
    }
    setStarting(true);
    try {
      let id = active?.id;
      if (!id) {
        const created = await createProject({
          name: form.prompt.trim().split(/\s+/).slice(0, 6).join(" "),
          prompt: form.prompt.trim(),
          genre: form.genre,
          style: form.style,
          language: form.language,
          aspectRatio: form.aspectRatio,
          durationSec: form.durationSec,
          sceneDuration: form.sceneDuration,
          subtitles: form.subtitles,
        });
        id = created.id;
      } else {
        await mutateProject(id, (draft) => {
          draft.prompt = form.prompt.trim();
          draft.genre = form.genre;
          draft.style = form.style;
          draft.language = form.language;
          draft.aspectRatio = form.aspectRatio;
          draft.durationSec = form.durationSec;
          draft.sceneDuration = form.sceneDuration;
          draft.subtitles = { burnedIn: form.subtitles };
        });
      }

      const withScript = await generateScript(id);
      if (mode === "full" && withScript) {
        await generateScenes(id);
        toast("Scene batch finished. Check the Scene Generator for results.", "success");
      } else {
        toast("Script and storyboard ready.", "success");
      }
    } catch (err) {
      toast((err as Error).message || "Generation failed.", "error");
    } finally {
      setStarting(false);
    }
  }

  runRef.current = run;

  useEffect(() => {
    const autostart = params.get("autostart");
    if (autostart && !autoStarted.current) {
      autoStarted.current = true;
      setParams({}, { replace: true });
      void runRef.current("full");
    }
  }, [params, setParams]);

  const needsNewStoryboard =
    activeScenes > 0 &&
    (active?.durationSec !== form.durationSec ||
      active?.sceneDuration !== form.sceneDuration ||
      active?.aspectRatio !== form.aspectRatio);

  return (
    <div>
      <PageHeader
        eyebrow="AI Video Generator"
        title="One prompt in. Finished film out."
        description="The factory writes the story, casts the characters, boards the scenes, renders every clip, narrates, captions and exports. You can stop and edit at any stage."
        actions={
          <>
            <Badge tone="blue">
              <Gauge className="h-3 w-3" /> {backendLabel(backend)}
            </Badge>
            <Badge tone="violet">
              <Clapperboard className="h-3 w-3" /> {plan.length} scenes
            </Badge>
          </>
        }
      />

      <ConfigNotice />

      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-4">
          <Card title="Production brief" subtitle="The prompt is the whole brief. Everything else is a creative constraint.">
            <div className="space-y-3.5">
              <Field label="Idea / prompt" hint="Be specific about subject, mood and where it happens. One sentence is enough.">
                <textarea
                  value={form.prompt}
                  onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                  className="textarea min-h-[120px]"
                  placeholder="A detective investigates a small town where no one dreams anymore…"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Genre">
                  <select value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })} className="select">
                    {GENRES.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Visual style">
                  <select value={form.style} onChange={(event) => setForm({ ...form, style: event.target.value })} className="select">
                    {STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Narration / script language">
                  <select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} className="select">
                    {LANGUAGES.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Framing">
                  <Segmented
                    className="w-full"
                    value={form.aspectRatio}
                    onChange={(value) => setForm({ ...form, aspectRatio: value })}
                    options={ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
                  />
                </Field>
              </div>

              <div>
                <span className="label">Runtime</span>
                <div className="flex flex-wrap gap-1.5">
                  {DURATIONS.map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setForm({ ...form, durationSec: duration })}
                      className={
                        duration === form.durationSec
                          ? "rounded-lg border border-neon-blue/45 bg-neon-blue/15 px-3.5 py-2 text-[12.5px] font-semibold text-white"
                          : "rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12.5px] text-slate-400 hover:text-white"
                      }
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Seconds per scene (provider supports 4–12s)</span>
                <Segmented
                  value={form.sceneDuration}
                  onChange={(value) => setForm({ ...form, sceneDuration: value })}
                  options={[4, 5, 6, 8, 10, 12].map((value) => ({ value, label: `${value}s` }))}
                />
              </div>

              <Toggle
                checked={form.subtitles}
                onChange={(value) => setForm({ ...form, subtitles: value })}
                label="Burn subtitles into the exported video"
                description="Captions come from the narration script. You can still export a clean version later."
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (activeScenes > 0 && form.prompt !== active?.prompt) {
                      const ok = window.confirm(
                        "This project already has scenes. Generating again replaces the script and storyboard (downloaded clips stay in storage until overwritten). Continue?",
                      );
                      if (!ok) return;
                    }
                    void run("full");
                  }}
                  loading={starting || engine.busy}
                  icon={<Wand2 className="h-4 w-4" />}
                >
                  {engine.busy ? "Working…" : "GENERATE COMPLETE VIDEO"}
                </Button>
                <Button variant="secondary" onClick={() => void run("script")} disabled={starting || engine.busy} icon={<PenLine className="h-4 w-4" />}>
                  Script only
                </Button>
                {engine.busy && (
                  <Button variant="danger" onClick={cancelGeneration} icon={<Square className="h-3.5 w-3.5" />}>
                    Stop
                  </Button>
                )}
              </div>

              {needsNewStoryboard && (
                <InlineNote tone="warn">
                  The active project was built with different durations or framing. Generating will rebuild the
                  storyboard to match the new settings.
                </InlineNote>
              )}
            </div>
          </Card>

          <Card title="Try an idea" subtitle="Six prompts that exercise the pipeline. Tap to load one.">
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea.prompt}
                  onClick={() => setForm({ ...form, prompt: idea.prompt, genre: idea.genre })}
                  className="group max-w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[11.5px] leading-relaxed text-slate-300 transition hover:border-neon-blue/30 hover:bg-neon-blue/[0.06] hover:text-white"
                >
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-neon-violet/80">
                    {idea.genre}
                  </span>
                  {idea.prompt}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Render plan" subtitle="Calculated from your runtime and scene length.">
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-ink-950/60 p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Scenes</p>
                    <p className="font-display text-3xl font-bold text-white">{plan.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Each</p>
                    <p className="font-display text-lg font-semibold text-slate-200">
                      {Math.min(...plan)}–{Math.max(...plan)}s
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {plan.slice(0, 24).map((duration, index) => (
                    <span
                      key={index}
                      className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
                    >
                      {duration}
                    </span>
                  ))}
                </div>
              </div>

              <dl className="space-y-2 text-[12px]">
                {[
                  ["Total runtime", formatTime(plan.reduce((sum, value) => sum + value, 0))],
                  ["Narration budget", `${Math.round(form.durationSec * 2.4)} words`],
                  ["Est. wall time", `${estimateMinutes}–${estimateMinutes * 2} min`],
                  ["Provider requests", `${plan.length} submits + polling`],
                  ["Cost", "€0 with the free tier"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-medium text-slate-200">{value}</dd>
                  </div>
                ))}
              </dl>

              <InlineNote>
                Agnes allows 16 requests/minute. The queue paces itself and backs off on 429 instead of hammering the
                provider. Longer films take longer — that is real generation time, not a fake progress bar.
              </InlineNote>
            </div>
          </Card>

          {active && (
            <Card
              title="Active project"
              subtitle={active.name}
              actions={
                <Link to="/scenes" className="btn-ghost btn-sm text-neon-blue">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <div className="space-y-2.5">
                <Progress
                  value={activeScenes ? (ready / activeScenes) * 100 : 0}
                  label={`${ready}/${activeScenes || plan.length} clips ready`}
                />
                <ul className="space-y-1.5 text-[12px]">
                  <StageRow
                    icon={<PenLine className="h-3.5 w-3.5" />}
                    label="Script & storyboard"
                    done={Boolean(active.script)}
                    detail={active.script ? `${active.script.scenes.length} scenes · ${active.script.source === "ai" ? "AI written" : "offline draft"}` : "pending"}
                    to="/story"
                  />
                  <StageRow
                    icon={<Users className="h-3.5 w-3.5" />}
                    label="Characters"
                    done={active.characters.length > 0}
                    detail={`${active.characters.length} locked`}
                    to="/characters"
                  />
                  <StageRow
                    icon={<Clapperboard className="h-3.5 w-3.5" />}
                    label="Clips"
                    done={ready === activeScenes && activeScenes > 0}
                    detail={`${ready}/${activeScenes} ready`}
                    to="/scenes"
                  />
                  <StageRow
                    icon={<Mic className="h-3.5 w-3.5" />}
                    label="Narration"
                    done={Object.keys(active.narration.sceneAudio).length > 0}
                    detail={`${Object.keys(active.narration.sceneAudio).length} voiced`}
                    to="/voiceover"
                  />
                  <StageRow
                    icon={<Captions className="h-3.5 w-3.5" />}
                    label="Subtitles"
                    done={active.subtitles.burnedIn}
                    detail={active.subtitles.burnedIn ? "burn-in on" : "off"}
                    to="/subtitles"
                  />
                  <StageRow
                    icon={<Film className="h-3.5 w-3.5" />}
                    label="Final MP4"
                    done={active.export.status === "ready"}
                    detail={active.export.status === "ready" ? `${active.export.width}×${active.export.height}` : active.export.status}
                    to="/editor"
                  />
                </ul>
                {active.scenes.some((scene) => scene.status === "failed") && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Some scenes failed. Open the Scene Generator to retry them individually — yesterday's successes
                      are kept.
                    </span>
                  </div>
                )}
                {active.scenes.some((scene) => scene.status === "ready") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const scene = active.scenes.find((item) => item.status !== "ready");
                      if (scene) void generateScene(active.id, scene.id);
                      else toast("All scenes are ready. Retry from the Scene Generator if you want new takes.", "info");
                    }}
                    icon={<Layers className="h-3.5 w-3.5" />}
                  >
                    Generate the next pending scene
                  </Button>
                )}
              </div>
            </Card>
          )}

          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <p className="flex items-center gap-2 text-[11.5px] font-medium text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-neon-violet" /> What “zero mandatory cost” means here
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              You need exactly one free Agnes AI key. Script, video, images and narration all run on free tiers. The
              optional hosted TTS or custom LLM providers are advanced settings and never required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageRow({
  icon,
  label,
  done,
  detail,
  to,
}: {
  icon: ReactNode;
  label: string;
  done: boolean;
  detail: string;
  to: string;
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-white/[0.04]">
        <span className={done ? "text-emerald-300" : "text-slate-500"}>{icon}</span>
        <span className="flex-1 text-slate-300">{label}</span>
        <span className="text-[10.5px] text-slate-500">{detail}</span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-400" : "bg-slate-600"}`}
          aria-hidden
        />
      </Link>
    </li>
  );
}
