import { AlertTriangle, ArrowRight, Clipboard, Download, PenLine, RefreshCw, Save, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, PageHeader, useToast } from "../components/ui";
import { ConfigNotice, NoProject } from "../components/shared";
import { downloadBlob, formatTime, safeFilename } from "../lib/format";
import { useEngine, generateScript } from "../lib/pipeline";
import { mutateProject, useActiveProject } from "../lib/projectStore";

export default function StoryWriter() {
  const project = useActiveProject();
  const engine = useEngine();
  const { toast } = useToast();
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    setEdits({});
  }, [project?.script?.createdAt]);

  const script = project?.script;
  const narrationText = useMemo(() => {
    if (!script) return "";
    return script.scenes
      .map((scene, index) => edits[index] ?? scene.narration)
      .filter((line) => line.trim())
      .join(" ");
  }, [script, edits]);

  const words = narrationText.trim() ? narrationText.trim().split(/\s+/).length : 0;
  const runtime = project?.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) || 0;
  const budget = Math.round(runtime * 2.4);

  async function regenerate() {
    if (!project) return;
    const ok =
      !project.scenes.some((scene) => scene.status === "ready") ||
      window.confirm("Regenerating rewrites the script and storyboard. Downloaded clips stay on disk but scenes are rebuilt. Continue?");
    if (!ok) return;
    setRegenerating(true);
    try {
      await generateScript(project.id);
      toast("New script and storyboard written.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setRegenerating(false);
    }
  }

  async function saveScene(index: number) {
    if (!project || !script) return;
    const text = (edits[index] ?? script.scenes[index]?.narration ?? "").trim();
    await mutateProject(project.id, (draft) => {
      if (!draft.script) return;
      draft.script.scenes[index].narration = text;
      if (draft.scenes[index]) draft.scenes[index].narration = text;
      draft.script.fullNarration = draft.script.scenes.map((scene) => scene.narration).filter(Boolean).join(" ");
    });
    setEdits((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    toast(`Scene ${index + 1} narration saved.`, "success");
  }

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="AI Story Writer" title="The script is the blueprint" description="A story engine that plans hooks, characters, scenes and narration to an exact runtime." />
        <NoProject what="write your script" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="AI Story Writer"
        title="Story, hook, narration — scene by scene"
        description="Everything here feeds the storyboard and the narration. Edit freely: your text is used for captions and voiceover."
        actions={
          <>
            {script && (
              <Badge tone={script.source === "ai" ? "green" : "amber"}>
                {script.source === "ai" ? `AI · ${script.model || "model"}` : "Offline draft"}
              </Badge>
            )}
            <Button variant="secondary" onClick={regenerate} loading={regenerating || engine.busy} icon={<RefreshCw className="h-4 w-4" />}>
              Regenerate script
            </Button>
            <Link to="/storyboard" className="btn-primary">
              Storyboard <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
      />

      <ConfigNotice />

      {!script ? (
        <div className="glass p-8 text-center">
          <PenLine className="mx-auto h-6 w-6 text-neon-blue" />
          <h2 className="mt-3 font-display text-base font-semibold text-white">No script yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            Send the idea from the generator, or write the story now with the current brief: {project.scenes.length || 0}{" "}
            scenes planned for {formatTime(project.durationSec)}.
          </p>
          <Button className="mt-5" onClick={regenerate} loading={regenerating} icon={<Sparkles className="h-4 w-4" />}>
            Write the script
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <Card
              title={script.title}
              subtitle={script.logline}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Clipboard className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(narrationText);
                    toast("Narration copied.", "success");
                  }}
                >
                  Copy
                </Button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Hook", script.hook],
                  ["Ending", script.ending],
                  ["Call to action", script.cta],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{value || "—"}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Full narration</h3>
                  <span className="text-[11px] text-slate-500">
                    {words} words · ~{formatTime(words / 2.4)}
                  </span>
                </div>
                <p className="max-h-56 overflow-y-auto rounded-xl border border-white/8 bg-ink-950/60 p-3.5 text-[13px] leading-[1.75] text-slate-300 scroll-thin">
                  {narrationText || "No narration yet."}
                </p>
                {words > budget * 1.25 && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    This is ~{Math.round(words / 2.4)}s of speech for a {formatTime(runtime)} cut. Trim it or the voiceover
                    will be cut off in assembly.
                  </p>
                )}
              </div>
            </Card>

            <Card title="Scene narration" subtitle="Edit the spoken text per scene. Save applies it to captions and voiceover.">
              <div className="space-y-3">
                {script.scenes.map((scene, index) => {
                  const value = edits[index] ?? scene.narration;
                  const dirty = edits[index] !== undefined && edits[index] !== scene.narration;
                  return (
                    <div key={index} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11.5px] font-semibold text-slate-200">
                          {index + 1}. {scene.title || "Scene"}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="chip py-0 text-[10px]">{project.scenes[index]?.durationSec ?? scene.durationSec}s</span>
                          <span className="text-[10px] text-slate-500">{value.trim().split(/\s+/).filter(Boolean).length} words</span>
                          {dirty && (
                            <Button size="sm" variant="secondary" onClick={() => void saveScene(index)} icon={<Save className="h-3 w-3" />}>
                              Save
                            </Button>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={value}
                        onChange={(event) => setEdits((current) => ({ ...current, [index]: event.target.value }))}
                        className="input min-h-[64px] text-[12.5px] leading-relaxed"
                        placeholder="Spoken narration for this scene…"
                      />
                      <p className="mt-1.5 line-clamp-2 text-[10.5px] text-slate-500">Visual: {scene.visualPrompt}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Production frame" subtitle="These values were used for this draft.">
              <dl className="space-y-2 text-[12px]">
                {[
                  ["Genre", String(project.genre)],
                  ["Style", project.style],
                  ["Language", project.language],
                  ["Framing", project.aspectRatio],
                  ["Runtime", formatTime(runtime)],
                  ["Scenes", String(script.scenes.length)],
                  ["Speakable budget", `${budget} words`],
                  ["Actual", `${words} words`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-medium text-slate-200">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-col gap-2">
                <Link to="/characters" className="btn-secondary btn-sm justify-start" >
                  <Users className="h-3.5 w-3.5" /> Character continuity
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  className="justify-start"
                  icon={<Download className="h-3.5 w-3.5" />}
                  onClick={() =>
                    downloadBlob(
                      new Blob(
                        [
                          `${script.title}\n\n${script.logline}\n\nHOOK\n${script.hook}\n\n${script.scenes
                            .map((scene, index) => `SCENE ${index + 1} (${project.scenes[index]?.durationSec ?? scene.durationSec}s)\nVisual: ${scene.visualPrompt}\nNarration: ${scene.narration}\n` )
                            .join("\n")}\nENDING\n${script.ending}\n\n${script.cta}`,
                        ],
                        { type: "text/plain" },
                      ),
                      `${safeFilename(script.title)}-script.txt`,
                    )
                  }
                >
                  Download script (.txt)
                </Button>
              </div>
            </Card>

            {script.source === "offline" && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-amber-100">
                  <AlertTriangle className="h-3.5 w-3.5" /> This is an offline draft
                </p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-200/75">
                  No text model was reachable, so the factory used its built-in story scaffold. Add a free Agnes key (or
                  a custom OpenAI-compatible provider) in API Configuration and regenerate for a genuinely written film.
                </p>
                <Link to="/api" className="btn-secondary btn-sm mt-3 border-amber-300/30 text-amber-100">
                  Configure model
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
