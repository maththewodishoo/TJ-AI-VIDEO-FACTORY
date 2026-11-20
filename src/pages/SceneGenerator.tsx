import { Clapperboard, Gauge, Play, RotateCcw, Square, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, PageHeader, Progress, Segmented, Stat, useToast } from "../components/ui";
import { ConfigNotice, NoProject, SceneCard, VideoModal, useBlobUrl } from "../components/shared";
import { formatTime, sceneProgress } from "../lib/format";
import { cancelGeneration, generateScene, generateScenes, useEngine } from "../lib/pipeline";
import { updateScene } from "../lib/pipeline";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import { useSettings } from "../lib/settings";
import type { Scene } from "../lib/types";

type Filter = "all" | "ready" | "pending" | "failed";

export default function SceneGenerator() {
  const project = useActiveProject();
  const engine = useEngine();
  const settings = useSettings();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [preview, setPreview] = useState<Scene | null>(null);
  const [starting, setStarting] = useState(false);

  const scenes = project?.scenes ?? [];
  const filtered = useMemo(() => {
    if (filter === "ready") return scenes.filter((scene) => scene.status === "ready");
    if (filter === "failed") return scenes.filter((scene) => scene.status === "failed");
    if (filter === "pending") return scenes.filter((scene) => scene.status !== "ready");
    return scenes;
  }, [scenes, filter]);

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="Scene Generator" title="Render the clips" description="Queue, monitor and retry every scene." />
        <NoProject what="render scenes" />
      </div>
    );
  }

  const ready = scenes.filter((scene) => scene.status === "ready").length;
  const failed = scenes.filter((scene) => scene.status === "failed").length;
  const pending = scenes.filter((scene) => !["ready", "failed"].includes(scene.status)).length;
  const progress = sceneProgress(scenes);

  async function startAll() {
    if (!project) return;
    setStarting(true);
    try {
      await generateScenes(project.id);
      toast("Scene batch finished.", "success");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Scene Generator"
        title="Real clips, one task at a time"
        description="The provider confirms each render before it is downloaded. Nothing is marked ready on a guess."
        actions={
          <>
            <Badge tone={engine.busy ? "amber" : "green"}>
              {engine.busy ? "Running" : "Idle"} · {settings.concurrency}× concurrency
            </Badge>
            {engine.busy ? (
              <Button variant="danger" onClick={cancelGeneration} icon={<Square className="h-3.5 w-3.5" />}>
                Stop
              </Button>
            ) : (
              <Button onClick={startAll} loading={starting} icon={<Wand2 className="h-4 w-4" />}>
                Generate all scenes
              </Button>
            )}
          </>
        }
      />

      <ConfigNotice />
      {engine.message && <p className="mb-4 text-[12px] text-slate-400">{engine.message}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Ready" value={`${ready}/${scenes.length}`} hint="Verified clips" />
        <Stat label="Pending" value={pending} hint="Queued or running" />
        <Stat label="Failed" value={failed} hint="Retry individually" />
        <Stat label="Runtime" value={formatTime(scenes.reduce((sum, scene) => sum + scene.durationSec, 0))} hint={`${project.aspectRatio} output`} />
      </div>

      <Card
        title="Batch progress"
        subtitle="Progress is persisted locally. Navigating away or refreshing does not lose task ids."
        actions={
          <>
            {failed > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => {
                  const ids = scenes.filter((scene) => scene.status === "failed").map((scene) => scene.id);
                  void generateScenes(project.id, ids);
                }}
              >
                Retry {failed} failed
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={() => {
                const ids = scenes.filter((scene) => scene.status === "draft" || scene.status === "queued").map((scene) => scene.id);
                if (!ids.length) {
                  toast("No unrendered scenes left.", "info");
                  return;
                }
                void generateScenes(project.id, ids);
              }}
            >
              Render pending
            </Button>
          </>
        }
      >
        <Progress value={progress} label={`${progress}% of clips downloaded`} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="chip">
            <Gauge className="h-3 w-3" /> provider quota 16 req/min
          </span>
          <span className="chip">poll interval {settings.pollIntervalSec}s</span>
          <Link to="/settings" className="text-neon-blue hover:text-white">
            Tune in Settings →
          </Link>
        </div>
        {engine.log.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-white">Engine log ({engine.log.length})</summary>
            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-white/8 bg-ink-950/70 p-2.5 font-mono text-[10px] leading-relaxed text-slate-400 scroll-thin">
              {engine.log.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </details>
        )}
      </Card>

      {scenes.length === 0 ? (
        <div className="mt-4 glass p-8 text-center">
          <Clapperboard className="mx-auto h-6 w-6 text-neon-blue" />
          <h2 className="mt-3 font-display text-base font-semibold text-white">No scenes to render</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-slate-400">Create a storyboard first, then come back.</p>
          <Link to="/storyboard" className="btn-primary mt-5">
            Open storyboard
          </Link>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All ${scenes.length}` },
                { value: "ready", label: `Ready ${ready}` },
                { value: "pending", label: `Pending ${pending}` },
                { value: "failed", label: `Failed ${failed}` },
              ]}
            />
            <span className="hidden text-[11px] text-slate-500 sm:block">
              {project.aspectRatio} · {project.sceneDuration}s target
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-8 text-center text-[12.5px] text-slate-400">
              Nothing in this filter.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((scene) => (
                <SceneCard
                  key={scene.id}
                  project={project}
                  scene={scene}
                  compact
                  busy={engine.activeScenes.includes(scene.id)}
                  onPreview={setPreview}
                  onGenerate={() => void generateScene(project.id, scene.id)}
                  onSave={(patch) => void updateScene(project.id, scene.id, patch)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void mutateProject(project.id, (draft) => {
              draft.scenes = draft.scenes.map((scene) =>
                scene.status === "failed" ? { ...scene, status: "draft", error: undefined, progress: 0 } : scene,
              );
            })
          }
        >
          Clear failed states
        </Button>
        <Link to="/editor" className="btn-secondary btn-sm">
          Go to editor →
        </Link>
      </div>

      <PreviewModal scene={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PreviewModal({ scene, onClose }: { scene: Scene | null; onClose: () => void }) {
  const url = useBlobUrl(scene?.videoBlobId);
  return (
    <VideoModal
      open={Boolean(scene && url)}
      onClose={onClose}
      url={url}
      title={scene ? `Scene ${scene.index + 1} — ${scene.title}` : ""}
      downloadName={scene ? `scene-${scene.index + 1}.mp4` : undefined}
    />
  );
}
