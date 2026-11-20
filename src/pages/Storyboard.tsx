import { ArrowRight, Clapperboard, LayoutList, RefreshCw, Wand2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, ErrorNote, PageHeader, useToast } from "../components/ui";
import { ConfigNotice, NoProject, SceneCard, VideoModal, useBlobUrl } from "../components/shared";
import { formatTime } from "../lib/format";
import { deleteScene, generateScene, moveScene, rebuildStoryboard, updateScene, useEngine } from "../lib/pipeline";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import type { Scene } from "../lib/types";

export default function Storyboard() {
  const project = useActiveProject();
  const engine = useEngine();
  const { toast } = useToast();
  const [preview, setPreview] = useState<Scene | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  if (!project) {
    return (
      <div>
        <PageHeader eyebrow="Storyboard Generator" title="Scene-by-scene plan" description="Every shot, prompt, camera and camera move — editable." />
        <NoProject what="board your scenes" />
      </div>
    );
  }

  const total = project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

  async function rebuild() {
    if (!project) return;
    const ok = window.confirm(
      "Rebuild the storyboard from the current script? Ready clips are kept where the scene order still matches; edited prompts are replaced by the script prompts.",
    );
    if (!ok) return;
    setRebuilding(true);
    try {
      await rebuildStoryboard(project.id);
      toast("Storyboard rebuilt from the script.", "success");
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Storyboard Generator"
        title="The shot list"
        description="Reorder, rewrite, retry. Each card is one real generation request with a locked character descriptor."
        actions={
          <>
            <Badge tone="blue">
              {project.scenes.length} scenes · {formatTime(total)}
            </Badge>
            <Button variant="secondary" onClick={rebuild} loading={rebuilding} disabled={!project.script} icon={<RefreshCw className="h-4 w-4" />}>
              Rebuild from script
            </Button>
            <Link to="/scenes" className="btn-primary">
              Render scenes <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
      />

      <ConfigNotice />

      {!project.script && (
        <div className="mb-4">
          <ErrorNote message="No script yet. Write one in the Story Writer — or add scenes by hand below." />
          <div className="mt-3 flex gap-2">
            <Link to="/story" className="btn-secondary btn-sm">
              Open Story Writer
            </Link>
            <Button
              size="sm"
              variant="secondary"
              icon={<Wand2 className="h-3.5 w-3.5" />}
              onClick={() =>
                void mutateProject(project.id, (draft) => {
                  const index = draft.scenes.length;
                  draft.scenes.push({
                    id: `${Date.now()}-${index}`,
                    index,
                    title: `Scene ${index + 1}`,
                    durationSec: Math.max(4, Math.min(12, draft.sceneDuration)),
                    visualPrompt: draft.prompt,
                    cameraAngle: "eye level",
                    cameraMove: "slow push-in",
                    lighting: "cinematic natural light",
                    background: "",
                    dialogue: "",
                    narration: "",
                    sfx: "",
                    transition: "cut",
                    characterIds: draft.characters.slice(0, 1).map((character) => character.id),
                    status: "draft",
                    progress: 0,
                    attempts: 0,
                  });
                })
              }
            >
              Add blank scene
            </Button>
          </div>
        </div>
      )}

      {project.scenes.length === 0 ? (
        <div className="glass p-8 text-center">
          <LayoutList className="mx-auto h-6 w-6 text-neon-blue" />
          <h2 className="mt-3 font-display text-base font-semibold text-white">No scenes yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            Generate a script and the storyboard is built automatically to fit {formatTime(project.durationSec)}.
          </p>
          <Link to="/generator" className="btn-primary mt-5">
            <Clapperboard className="h-4 w-4" /> Open generator
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {project.scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              project={project}
              scene={scene}
              busy={engine.activeScenes.includes(scene.id)}
              onPreview={(item) => setPreview(item)}
              onGenerate={() => {
                void generateScene(project.id, scene.id);
                toast(`Scene ${scene.index + 1} queued.`, "info");
              }}
              onDelete={() => {
                if (!window.confirm(`Delete scene ${scene.index + 1}? Its downloaded clip is removed too.`)) return;
                void deleteScene(project.id, scene.id);
              }}
              onMove={(direction) => void moveScene(project.id, scene.id, direction)}
              onSave={(patch) => {
                void updateScene(project.id, scene.id, patch);
                toast("Scene prompt saved.", "success");
              }}
            />
          ))}
        </div>
      )}

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
