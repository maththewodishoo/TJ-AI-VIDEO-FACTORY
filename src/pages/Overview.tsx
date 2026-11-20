import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Clock,
  Film,
  FolderOpen,
  Gauge,
  Keyboard,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, Segmented, Stat } from "../components/ui";
import { ConfigNotice, ProjectMeta, useKeyReady } from "../components/shared";
import { backendLabel, useBackend } from "../lib/api";
import { storageEstimate } from "../lib/db";
import { formatBytes, relativeTime } from "../lib/format";
import { scenePlan } from "../lib/plan";
import { createProject, setActiveProject, useProjectState } from "../lib/projectStore";
import { useSettings } from "../lib/settings";
import { ASPECT_RATIOS, DURATIONS, GENRES, type AspectRatio } from "../lib/types";

const STEPS = [
  {
    icon: <Keyboard className="h-4 w-4" />,
    title: "One prompt",
    copy: "Describe the film you want. Genre, runtime and framing are up to you.",
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    title: "Story + cast",
    copy: "A model writes the script, narration and locked character continuity.",
  },
  {
    icon: <Clapperboard className="h-4 w-4" />,
    title: "Real AI clips",
    copy: "Agnes AI renders every scene, then the app downloads and verifies each clip.",
  },
  {
    icon: <Film className="h-4 w-4" />,
    title: "Edited MP4",
    copy: "FFmpeg joins scenes, adds voice, captions, sfx and music, then exports.",
  },
];

export default function Overview() {
  const navigate = useNavigate();
  const state = useProjectState();
  const settings = useSettings();
  const backend = useBackend();
  const keyReady = useKeyReady();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState<string>("Mystery");
  const [duration, setDuration] = useState<number>(60);
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [creating, setCreating] = useState(false);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, [state.projects.length]);

  const plan = scenePlan(duration, settings.sceneDuration);
  const exports = state.projects.filter((project) => project.export.status === "ready").length;
  const clips = state.projects.reduce(
    (sum, project) => sum + project.scenes.filter((scene) => scene.status === "ready").length,
    0,
  );

  async function start(event?: FormEvent) {
    event?.preventDefault();
    if (!prompt.trim()) return;
    setCreating(true);
    try {
      const project = await createProject({
        name: prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Untitled production",
        prompt: prompt.trim(),
        genre,
        aspectRatio: aspect,
        durationSec: duration,
        sceneDuration: settings.sceneDuration,
        subtitles: settings.subtitlesDefault,
      });
      navigate(`/generator?autostart=${project.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <ConfigNotice />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/40 px-5 py-8 shadow-card backdrop-blur-xl sm:px-8 sm:py-11">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-neon-blue/20 blur-[90px] animate-aurora" />
          <div className="absolute -right-16 top-10 h-64 w-64 rounded-full bg-neon-violet/25 blur-[90px] animate-aurora [animation-delay:-6s]" />
          <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-cyan-400/10 blur-[80px]" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="blue">
                <Zap className="h-3 w-3" /> AI video production studio
              </Badge>
              <Badge tone="green">
                <ShieldCheck className="h-3 w-3" /> Zero mandatory cost
              </Badge>
            </div>
            <h1 className="font-display text-[2.05rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
              ONE PROMPT.
              <br />
              <span className="text-gradient">COMPLETE VIDEO.</span>
            </h1>
            <p className="mt-3 font-display text-[12.5px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Zero mandatory cost
            </p>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-slate-300/90">
              TJ AI VIDEO FACTORY turns a single idea into a scripted, cast, fully generated and edited MP4 — story,
              scenes, narration, subtitles, sound and final render, all in one run.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link to="/generator" className="btn-primary">
                <Wand2 className="h-4 w-4" /> Open the generator
              </Link>
              <Link to="/projects" className="btn-secondary">
                <FolderOpen className="h-4 w-4" /> Projects library
              </Link>
              <span className="chip">
                <Gauge className="h-3 w-3" /> {backendLabel(backend)}
              </span>
            </div>

            <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-white/8 pt-5">
              {[
                { label: "Scenes per run", value: `${plan.length}` },
                { label: "Final runtime", value: `${duration}s` },
                { label: "Provider quota", value: "16/min" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{item.label}</dt>
                  <dd className="mt-1 font-display text-lg font-semibold text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Launch pad */}
          <form
            onSubmit={start}
            className="glass-sheen relative rounded-2xl border border-white/12 bg-ink-850/70 p-4 shadow-glow sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-[13px] font-semibold text-white">Fast start</p>
              <span className="chip border-neon-blue/25 bg-neon-blue/10 text-[10px] text-sky-200">
                <Sparkles className="h-3 w-3" /> auto pipeline
              </span>
            </div>

            <label className="block">
              <span className="label">Your idea</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="textarea min-h-[104px] text-[13.5px]"
                placeholder="A lighthouse keeper on a remote island starts receiving letters from a ship that sank forty years ago…"
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Genre</span>
                <select value={genre} onChange={(event) => setGenre(event.target.value)} className="select py-2.5 text-[13px]">
                  {GENRES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="label">Framing</span>
                <Segmented
                  className="w-full"
                  value={aspect}
                  onChange={setAspect}
                  options={ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
                />
              </div>
            </div>

            <div className="mt-3">
              <span className="label">Runtime</span>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    className={
                      value === duration
                        ? "rounded-lg border border-neon-blue/40 bg-neon-blue/15 px-3 py-1.5 text-[12px] font-semibold text-white"
                        : "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-slate-400 hover:text-white"
                    }
                  >
                    {value}s
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {plan.length} scenes × ~{settings.sceneDuration}s (4–12s per clip, variable durations supported)
              </p>
            </div>

            <Button type="submit" className="mt-4 w-full" loading={creating} icon={<Wand2 className="h-4 w-4" />}>
              GENERATE COMPLETE VIDEO
            </Button>
            <p className="mt-2 text-center text-[10.5px] leading-relaxed text-slate-500">
              {keyReady
                ? "Uses your free Agnes quota (16 requests/min). Rendering takes several minutes per scene."
                : "Add a free Agnes key first — the generator opens with setup instructions."}
            </p>
          </form>
        </div>
      </section>

      {/* Pipeline */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">The factory line</h2>
            <p className="muted mt-1">Twelve automated stages, one button. Everything is inspectable and editable.</p>
          </div>
          <Link to="/settings" className="hidden text-[12px] text-neon-blue hover:text-white sm:inline">
            How it works →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="glass glass-hover p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-neon-blue">
                  {step.icon}
                </span>
                <span className="font-mono text-[10px] text-slate-600">0${index + 1}</span>
              </div>
              <h3 className="text-[13px] font-semibold text-white">{step.title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{step.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projects" value={state.projects.length} icon={<Layers className="h-4 w-4" />} hint="Stored in IndexedDB" />
        <Stat label="Clips ready" value={clips} icon={<Clapperboard className="h-4 w-4" />} hint="Downloaded & verified" />
        <Stat label="Exports" value={exports} icon={<Film className="h-4 w-4" />} hint="Finished MP4s" />
        <Stat
          label="Local storage"
          value={formatBytes(storage.usage)}
          icon={<Clock className="h-4 w-4" />}
          hint={storage.quota ? `of ${formatBytes(storage.quota)} available` : "browser quota"}
        />
      </section>

      {/* Recent projects */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">Recent productions</h2>
          <Link to="/projects" className="text-[12px] text-neon-blue hover:text-white">
            All projects →
          </Link>
        </div>
        {state.projects.length === 0 ? (
          <div className="glass p-6 text-center">
            <p className="text-[13px] text-slate-300">Nothing produced yet.</p>
            <p className="mt-1 text-[12px] text-slate-500">
              Enter an idea above. Your first film can be 15 seconds and costs nothing but a free API key.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.projects.slice(0, 3).map((project) => (
              <Link
                key={project.id}
                to="/scenes"
                onClick={() => setActiveProject(project.id)}
                className="glass glass-hover group p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-[13px] font-semibold text-white">{project.name}</h3>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-neon-blue" />
                </div>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-slate-400">{project.prompt}</p>
                <div className="mt-3">
                  <ProjectMeta project={project} />
                </div>
                <p className="mt-3 flex items-center justify-between text-[10.5px] text-slate-500">
                  <span>{relativeTime(project.updatedAt)}</span>
                  {project.export.status === "ready" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> export ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Play className="h-3 w-3" /> {project.scenes.filter((s) => s.status === "ready").length} clips
                    </span>
                  )}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Card
        title="Free-by-default, honest by design"
        subtitle="No card, no subscription, no hidden paid switch. Quotas and unavailable features are always visible."
      >
        <ul className="grid gap-3 text-[12.5px] leading-relaxed text-slate-300 sm:grid-cols-2">
          {[
            "Agnes AI free tier: 16 requests/minute shared across script, scenes and status polling.",
            "One 5s scene ≈ one submit + several polls. A 60s film is 12 scenes — expect a real wait, not a fake spinner.",
            "Free narration is proxied Google Translate TTS: one voice per language, rate limited, no gender choice.",
            "Video assembly happens in your browser with FFmpeg.wasm. iPhone Safari works, but shorter films are safer.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
