import { Download, ImagePlus, Loader2, Plus, Upload, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Field, PageHeader, Progress, Segmented, useToast } from "../components/ui";
import { ConfigNotice, InlineNote, useBlobUrl, useKeyReady } from "../components/shared";
import { errorMessage, getVideoStatus, downloadMedia, submitVideo } from "../lib/api";
import { newId, putBlob } from "../lib/db";
import { downloadBlob, formatBytes, safeFilename } from "../lib/format";
import { useActiveProject, mutateProject } from "../lib/projectStore";
import { ASPECT_RATIOS, type AspectRatio, type Scene } from "../lib/types";

async function imageToDataUrl(file: File, max = 1024): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

  try {
    const image = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return dataUrl;
  }
}

export default function ImageToVideo() {
  const project = useActiveProject();
  const keyReady = useKeyReady();
  const { toast } = useToast();
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [prompt, setPrompt] = useState("Slow cinematic push-in, subject holds steady, subtle natural motion, shallow depth of field.");
  const [seconds, setSeconds] = useState(5);
  const [aspect, setAspect] = useState<AspectRatio>(project?.aspectRatio || "9:16");
  const [status, setStatus] = useState<"idle" | "submitting" | "polling" | "downloading" | "ready" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [clip, setClip] = useState<{ blob: Blob; blobId: string; sourceUrl: string } | null>(null);
  const cancelled = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useBlobUrl(clip?.blobId);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  async function generate() {
    if (!image) {
      toast("Choose a source image first.", "error");
      return;
    }
    if (!keyReady) {
      toast("Add your free Agnes key in API Configuration.", "error");
      return;
    }
    cancelled.current = false;
    setStatus("submitting");
    setProgress(2);
    setMessage("Submitting the reference image…");
    setClip(null);
    try {
      const submitted = await submitVideo({ prompt, seconds, aspectRatio: aspect, images: [image] });
      setTaskId(submitted.videoId);
      setStatus("polling");
      setMessage("Rendering — the provider confirms completion before we download.");

      const startedAt = Date.now();
      let errors = 0;
      for (let attempt = 0; ; attempt++) {
        if (cancelled.current) return;
        if (Date.now() - startedAt > 20 * 60 * 1000) throw new Error("The provider did not finish within 20 minutes. Try again later.");
        await new Promise((resolve) => setTimeout(resolve, Math.min(10_000 + attempt * 2_000, 30_000)));
        let result;
        try {
          result = await getVideoStatus(submitted.videoId);
          errors = 0;
        } catch (err) {
          errors += 1;
          if (errors > 5) throw err;
          continue;
        }
        if (result.status === "failed") throw new Error(result.error || "The provider reported a failure.");
        if (result.status === "completed") {
          if (!result.videoUrl) throw new Error("Task completed without a video URL.");
          setStatus("downloading");
          setProgress(96);
          setMessage("Downloading the finished clip…");
          const blob = await downloadMedia(result.videoUrl);
          const blobId = await putBlob(blob, `Image-to-video ${imageName || "clip"}`);
          setClip({ blob, blobId, sourceUrl: result.videoUrl });
          setProgress(100);
          setStatus("ready");
          setMessage(`Clip ready · ${formatBytes(blob.size)}`);
          toast("Image-to-video clip ready.", "success");
          return;
        }
        setProgress((current) => Math.min(94, Math.max(current + 2, result!.progress)));
        setMessage(result.status === "pending" ? "Queued at the provider…" : `Rendering… ${result.progress}%`);
      }
    } catch (err) {
      setStatus("failed");
      setMessage(errorMessage(err));
      toast(errorMessage(err), "error");
    }
  }

  async function addToProject() {
    if (!clip || !project) return;
    const scene: Scene = {
      id: newId(),
      index: project.scenes.length,
      title: `Image shot ${project.scenes.length + 1}`,
      durationSec: seconds,
      visualPrompt: prompt,
      cameraAngle: "locked from reference",
      cameraMove: "subtle motion",
      lighting: "as in reference",
      background: "",
      dialogue: "",
      narration: "",
      sfx: "",
      transition: "cut",
      characterIds: [],
      status: "ready",
      progress: 100,
      attempts: 1,
      videoBlobId: clip.blobId,
      sourceUrl: clip.sourceUrl,
      generatedAt: Date.now(),
    };
    await mutateProject(project.id, (draft) => {
      draft.scenes.push(scene);
    });
    toast("Added to the active project's storyboard.", "success");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Image to Video"
        title="Animate a still"
        description="Uses the provider's reference mode: the image anchors the subject and the prompt describes motion."
        actions={<Badge tone="violet">agnes-video-2.5 · reference</Badge>}
      />

      <ConfigNotice />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card title="Source" subtitle="Images are resized locally to 1024px and sent as a data URL.">
          <div className="space-y-3">
            <div
              className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-ink-950/60"
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && fileRef.current?.click()}
            >
              {image ? (
                <>
                  <img src={image} alt="Source frame" className="max-h-[300px] w-full object-contain" />
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setImage(null);
                      setImageName("");
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="p-6 text-center">
                  <ImagePlus className="mx-auto h-7 w-7 text-slate-500" />
                  <p className="mt-2 text-[12.5px] font-medium text-slate-300">Tap to choose a reference image</p>
                  <p className="mt-1 text-[11px] text-slate-500">JPG, PNG or HEIC · stays on your device until submitted</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const dataUrl = await imageToDataUrl(file);
                  setImage(dataUrl);
                  setImageName(file.name);
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              }}
            />
            <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} icon={<Upload className="h-4 w-4" />}>
              {image ? "Replace image" : "Upload image"}
            </Button>

            <Field label="Motion prompt" hint="Describe motion and camera, not the subject's fixed appearance.">
              <textarea className="textarea min-h-[86px]" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="label">Framing</span>
                <Segmented className="w-full" value={aspect} onChange={setAspect} options={ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))} />
              </div>
              <div>
                <span className="label">Clip length</span>
                <Segmented
                  className="w-full"
                  value={seconds}
                  onChange={setSeconds}
                  options={[4, 5, 6, 8, 10, 12].map((value) => ({ value, label: `${value}s` }))}
                />
              </div>
            </div>

            <Button className="w-full" onClick={generate} loading={status === "submitting" || status === "polling" || status === "downloading"} icon={<Wand2 className="h-4 w-4" />}>
              Generate clip
            </Button>
            <InlineNote>
              Reference mode is the documented image-to-video path on the current 2.5 protocol. The free tier remains
              16 requests/minute, and a clip can take several minutes.
            </InlineNote>
          </div>
        </Card>

        <Card
          title="Result"
          subtitle={taskId ? `Task ${taskId}` : "Nothing rendered yet"}
          actions={
            clip && (
              <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadBlob(clip.blob, `${safeFilename(imageName || "image-to-video")}.mp4`)}>
                Download
              </Button>
            )
          }
        >
          <div className="space-y-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-ink-950">
              {previewUrl ? (
                <video src={previewUrl} controls loop playsInline className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  {status === "failed" ? (
                    <p className="max-w-xs px-4 text-center text-[12px] text-rose-300">{message}</p>
                  ) : (
                    <div className="text-center">
                      {status === "idle" ? (
                        <ImagePlus className="mx-auto h-6 w-6 text-slate-600" />
                      ) : (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-neon-blue" />
                      )}
                      <p className="mt-2 px-6 text-center text-[11.5px] text-slate-500">
                        {status === "idle" ? "Your clip will appear here." : message}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {status !== "idle" && status !== "failed" && <Progress value={progress} label={message} />}
            {status === "failed" && <InlineNote tone="warn">{message}</InlineNote>}

            {clip && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">{formatBytes(clip.blob.size)}</Badge>
                <Badge tone="blue">{aspect}</Badge>
                <Badge>{seconds}s</Badge>
                {project ? (
                  <Button size="sm" variant="secondary" onClick={addToProject} icon={<Plus className="h-3.5 w-3.5" />}>
                    Add to “{project.name}”
                  </Button>
                ) : (
                  <Link to="/generator" className="btn-secondary btn-sm">
                    Create a project to keep this
                  </Link>
                )}
              </div>
            )}

            <InlineNote>
              The clip is stored in IndexedDB, so it survives a refresh. Adding it to a project places it at the end of
              the storyboard, ready for the editor.
            </InlineNote>
          </div>
        </Card>
      </div>
    </div>
  );
}
