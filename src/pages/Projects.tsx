import { ArrowRight, Download, FolderOpen, LayoutList, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Field, Modal, PageHeader, Progress, Stat, useToast } from "../components/ui";
import { ProjectMeta } from "../components/shared";
import { storageEstimate, getBlob } from "../lib/db";
import { downloadBlob, formatBytes, formatTime, relativeTime, safeFilename } from "../lib/format";
import {
  createProject,
  deleteProject,
  renameProject,
  setActiveProject,
  useProjectState,
} from "../lib/projectStore";
import { useSettings } from "../lib/settings";
import { ASPECT_RATIOS, DURATIONS, GENRES, type AspectRatio } from "../lib/types";

export default function Projects() {
  const state = useProjectState();
  const settings = useSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState<string>("Mystery");
  const [duration, setDuration] = useState<number>(30);
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, [state.projects.length]);

  const filtered = state.projects.filter((project) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${project.name} ${project.prompt} ${project.genre}`.toLowerCase().includes(needle);
  });

  async function create() {
    const project = await createProject({
      name: name.trim() || prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Untitled production",
      prompt: prompt.trim(),
      genre,
      durationSec: duration,
      aspectRatio: aspect,
      sceneDuration: settings.sceneDuration,
      subtitles: settings.subtitlesDefault,
    });
    setOpen(false);
    setName("");
    setPrompt("");
    toast("Project created. Start it in the generator.", "success");
    setActiveProject(project.id);
    navigate(project.prompt ? "/generator" : "/projects");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Projects Library"
        title="Everything stays on your device"
        description="Projects, prompts, storyboards and clips live in IndexedDB. Export an MP4 to keep a permanent copy."
        actions={
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            New project
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Projects" value={state.projects.length} hint="local only" />
        <Stat label="Exports" value={state.projects.filter((project) => project.export.status === "ready").length} hint="MP4 ready" />
        <Stat label="Clips" value={state.projects.reduce((sum, project) => sum + project.scenes.filter((scene) => scene.status === "ready").length, 0)} hint="downloaded" />
        <Stat label="Storage" value={formatBytes(storage.usage)} hint={storage.quota ? `of ${formatBytes(storage.quota)}` : "quota unknown"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects…"
            className="input pl-9"
          />
        </div>
        <Badge tone="blue">{filtered.length} shown</Badge>
      </div>

      {filtered.length === 0 ? (
        <div className="glass p-10 text-center">
          <FolderOpen className="mx-auto h-6 w-6 text-neon-blue" />
          <h2 className="mt-3 font-display text-base font-semibold text-white">
            {state.projects.length ? "No matches" : "No projects yet"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            {state.projects.length
              ? "Try a different search."
              : "Create one from a prompt — the generator turns it into a scripted, narrated film."}
          </p>
          <Button className="mt-5" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            New project
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => {
            const ready = project.scenes.filter((scene) => scene.status === "ready").length;
            const isActive = project.id === state.activeId;
            return (
              <Card key={project.id} className={isActive ? "border-neon-blue/30" : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-[14px] font-semibold text-white">{project.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-400">
                      {project.prompt || "No prompt yet."}
                    </p>
                  </div>
                  {isActive && <Badge tone="blue">active</Badge>}
                </div>

                <div className="mt-3">
                  <ProjectMeta project={project} />
                </div>

                <Progress
                  className="mt-3"
                  value={project.scenes.length ? (ready / project.scenes.length) * 100 : 0}
                  label={`${ready}/${project.scenes.length || 0} clips · ${formatTime(project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0))}`}
                />

                <p className="mt-2 text-[10.5px] text-slate-500">
                  Updated {relativeTime(project.updatedAt)}
                  {project.export.status === "ready" && project.export.bytes
                    ? ` · export ${formatBytes(project.export.bytes)}`
                    : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => {
                      setActiveProject(project.id);
                      navigate("/scenes");
                    }}
                    icon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setActiveProject(project.id);
                      navigate("/storyboard");
                    }}
                    icon={<LayoutList className="h-3.5 w-3.5" />}
                  >
                    Board
                  </Button>
                  {project.export.status === "ready" && project.export.blobId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Download className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        const blob = await getBlob(project.export.blobId);
                        if (blob) downloadBlob(blob, `${safeFilename(project.name)}.mp4`);
                        else toast("Export file is missing from storage.", "error");
                      }}
                    >
                      MP4
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const next = window.prompt("Project name", project.name);
                      if (next && next.trim()) await renameProject(project.id, next);
                    }}
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    aria-label="Rename project"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-300"
                    onClick={async () => {
                      if (!window.confirm(`Delete “${project.name}” and all of its clips? This cannot be undone.`)) return;
                      await deleteProject(project.id);
                      toast("Project deleted.", "info");
                    }}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    aria-label="Delete project"
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} icon={<Plus className="h-4 w-4" />}>
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Project name" hint="Optional — a name is derived from the prompt.">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Lighthouse Letters" />
          </Field>
          <Field label="Prompt" hint="You can also leave this blank and write it later.">
            <textarea className="textarea min-h-[90px]" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A lighthouse keeper receives letters from a ship that sank forty years ago…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Genre">
              <select className="select" value={genre} onChange={(event) => setGenre(event.target.value)}>
                {GENRES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Framing">
              <select className="select" value={aspect} onChange={(event) => setAspect(event.target.value as AspectRatio)}>
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Runtime">
            <select className="select" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              {DURATIONS.map((value) => (
                <option key={value} value={value}>
                  {value} seconds
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
