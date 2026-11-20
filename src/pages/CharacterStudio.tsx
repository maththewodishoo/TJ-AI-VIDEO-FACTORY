import { Image, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, useToast } from "../components/ui";
import { ConfigNotice, NoProject, useBlobUrl } from "../components/shared";
import { newId, putBlob } from "../lib/db";
import { continuityOf } from "../lib/prompts";
import { createCharacterImage, regenerateCharacter } from "../lib/pipeline";
import { mutateProject, useActiveProject } from "../lib/projectStore";
import type { Character } from "../lib/types";

export default function CharacterStudio() {
  const project = useActiveProject();
  const { toast } = useToast();

  if (!project) {
    return (
      <div>
        <PageHeader
          eyebrow="Character Studio"
          title="Lock the cast before you roll"
          description="Consistent faces, hair and clothing across every scene."
        />
        <NoProject what="build a cast" />
      </div>
    );
  }

  async function addCharacter() {
    if (!project) return;
    const character: Character = {
      id: newId(),
      name: "New character",
      age: "30s",
      appearance: "describe build, skin tone, distinguishing features",
      clothing: "one fixed outfit used in every scene",
      hair: "fixed hairstyle and colour",
      face: "fixed facial features",
      personality: "determined, observant",
      voice: "warm, natural",
      continuity: "",
    };
    character.continuity = continuityOf({ ...character, continuity: "" });
    await mutateProject(project.id, (draft) => {
      draft.characters.push(character);
    });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Character Studio"
        title="One face. Every scene."
        description="Each character's descriptor is injected verbatim into every scene prompt that features them, which is what keeps clothing and faces from drifting."
        actions={
          <>
            <Badge tone="violet">{project.characters.length} characters</Badge>
            <Button onClick={addCharacter} icon={<Plus className="h-4 w-4" />}>
              Add character
            </Button>
          </>
        }
      />

      <ConfigNotice />

      {project.characters.length === 0 ? (
        <div className="glass p-8 text-center">
          <UserRound className="mx-auto h-6 w-6 text-neon-blue" />
          <h2 className="mt-3 font-display text-base font-semibold text-white">No cast yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            Write a script first — characters are extracted automatically — or add one by hand and reference it in your
            scene prompts.
          </p>
          <Button className="mt-5" onClick={addCharacter} icon={<Plus className="h-4 w-4" />}>
            Add the first character
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {project.characters.map((character) => (
            <CharacterCard key={character.id} character={character} projectId={project.id} onToast={toast} />
          ))}
        </div>
      )}

      <Card className="mt-4" title="How continuity works" subtitle="Practical limits, stated plainly.">
        <ul className="space-y-2 text-[12px] leading-relaxed text-slate-400">
          <li>
            • The locked descriptor is appended to every scene prompt that lists the character, so the model receives the
            same age, hair, clothing and facial details each time. It improves consistency; it cannot guarantee a perfect
            biometric match on a free video model.
          </li>
          <li>
            • Reference portraits use the free image model. Provider-side image tasks can return no direct URL; in that
            case upload a reference image instead.
          </li>
          <li>
            • For the strongest consistency, generate a portrait, upload it, then use Image → Video for key shots.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function CharacterCard({
  character,
  projectId,
  onToast,
}: {
  character: Character;
  projectId: string;
  onToast: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [draft, setDraft] = useState(character);
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const referenceUrl = useBlobUrl(character.referenceBlobId);

  const dirty = JSON.stringify(draft) !== JSON.stringify(character);

  async function save() {
    setSaving(true);
    try {
      const continuity = continuityOf({ ...draft, continuity: "" });
      await mutateProject(projectId, (project) => {
        const target = project.characters.find((item) => item.id === character.id);
        if (target) Object.assign(target, { ...draft, continuity });
      });
      setDraft({ ...draft, continuity });
      onToast("Character saved — new scenes will use this description.", "success");
    } finally {
      setSaving(false);
    }
  }

  async function refine() {
    setRefining(true);
    try {
      await regenerateCharacter(projectId, character.id);
      onToast("Character refined by the text model.", "success");
    } catch (err) {
      onToast((err as Error).message, "error");
    } finally {
      setRefining(false);
    }
  }

  async function makePortrait() {
    setPortrait(true);
    try {
      await createCharacterImage(projectId, character.id);
      onToast("Reference portrait generated.", "success");
    } catch (err) {
      onToast((err as Error).message, "error");
    } finally {
      setPortrait(false);
    }
  }

  async function upload(file: File) {
    const blobId = await putBlob(file, `${character.name} upload`);
    await mutateProject(projectId, (project) => {
      const target = project.characters.find((item) => item.id === character.id);
      if (target) target.referenceBlobId = blobId;
    });
    onToast("Reference image attached.", "success");
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {character.name}
          {character.referenceBlobId && <Badge tone="green">reference</Badge>}
        </span>
      }
      subtitle={character.continuity || "Continuity descriptor generated from the fields below."}
      actions={
        <Button size="sm" variant={dirty ? "primary" : "ghost"} onClick={save} loading={saving} disabled={!dirty} icon={<Save className="h-3.5 w-3.5" />}>
          Save
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[132px_1fr]">
        <div>
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-ink-950">
            {referenceUrl ? (
              <img src={referenceUrl} alt={`${character.name} reference`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <UserRound className="mx-auto h-6 w-6 text-slate-600" />
                  <p className="mt-1 px-2 text-[10px] text-slate-500">No reference portrait</p>
                </div>
              </div>
            )}
            {portrait && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" onClick={makePortrait} disabled={portrait} icon={<Image className="h-3 w-3" />}>
              AI
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} icon={<Upload className="h-3 w-3" />}>
              Upload
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </div>

        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <input className="input py-2 text-[12.5px]" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Age range">
              <input className="input py-2 text-[12.5px]" value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} />
            </Field>
          </div>
          <Field label="Physical appearance">
            <textarea className="input min-h-[52px] py-2 text-[12.5px]" value={draft.appearance} onChange={(event) => setDraft({ ...draft, appearance: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Clothing">
              <textarea className="input min-h-[48px] py-2 text-[12.5px]" value={draft.clothing} onChange={(event) => setDraft({ ...draft, clothing: event.target.value })} />
            </Field>
            <Field label="Hair">
              <textarea className="input min-h-[48px] py-2 text-[12.5px]" value={draft.hair} onChange={(event) => setDraft({ ...draft, hair: event.target.value })} />
            </Field>
          </div>
          <Field label="Facial features">
            <input className="input py-2 text-[12.5px]" value={draft.face} onChange={(event) => setDraft({ ...draft, face: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Personality">
              <input className="input py-2 text-[12.5px]" value={draft.personality} onChange={(event) => setDraft({ ...draft, personality: event.target.value })} />
            </Field>
            <Field label="Voice">
              <input className="input py-2 text-[12.5px]" value={draft.voice} onChange={(event) => setDraft({ ...draft, voice: event.target.value })} />
            </Field>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={refine} loading={refining} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Refine with AI
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const continuity = continuityOf({ ...draft, continuity: "" });
            setDraft({ ...draft, continuity });
            void navigator.clipboard.writeText(continuity);
          }}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Copy descriptor
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="ml-auto"
          onClick={async () => {
            if (!window.confirm(`Remove ${character.name} from this project?`)) return;
            await mutateProject(projectId, (project) => {
              project.characters = project.characters.filter((item) => item.id !== character.id);
              project.scenes.forEach((scene) => {
                scene.characterIds = scene.characterIds.filter((id) => id !== character.id);
              });
            });
            onToast("Character removed.", "info");
          }}
          icon={<Trash2 className="h-3.5 w-3.5" />}
        >
          Remove
        </Button>
      </div>
      <p className="mt-2.5 rounded-lg border border-white/8 bg-ink-950/50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-400">Prompt injection:</span> {continuityOf(draft)}
      </p>
    </Card>
  );
}
