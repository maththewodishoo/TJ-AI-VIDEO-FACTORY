import { Activity, AlertTriangle, Cpu, Database, RefreshCw, RotateCcw, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Segmented, Stat, Toggle, useToast } from "../components/ui";
import { InlineNote } from "../components/shared";
import { backendLabel, errorMessage, probeBackend, useBackend } from "../lib/api";
import { clearHistory, storageEstimate } from "../lib/db";
import { formatBytes } from "../lib/format";
import { warmUpFFmpeg } from "../lib/ffmpeg";
import { clearLog, resumePending, useEngine } from "../lib/pipeline";
import { deleteProject, useProjectState } from "../lib/projectStore";
import { resetSettings, setSettings, useSettings } from "../lib/settings";

export default function Settings() {
  const settings = useSettings();
  const backend = useBackend();
  const engine = useEngine();
  const state = useProjectState();
  const { toast } = useToast();
  const [ffmpegStatus, setFfmpegStatus] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const wasm = typeof WebAssembly === "object";
  const sharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";

  return (
    <div>
      <PageHeader
        eyebrow="Settings & Diagnostics"
        title="Tune the factory"
        description="Generation pacing, defaults and an honest view of what this browser and backend can actually do."
        actions={
          <Button
            variant="secondary"
            loading={refreshing}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={async () => {
              setRefreshing(true);
              await probeBackend(true);
              setStorage(await storageEstimate());
              setRefreshing(false);
              toast("Status refreshed.", "success");
            }}
          >
            Refresh status
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card title="Generation defaults" subtitle="Applied to new projects and to the scene queue.">
            <div className="space-y-3.5">
              <div>
                <span className="label">Default seconds per scene</span>
                <Segmented
                  value={settings.sceneDuration}
                  onChange={(value) => setSettings({ sceneDuration: value })}
                  options={[4, 5, 6, 8, 10, 12].map((value) => ({ value, label: `${value}s` }))}
                />
                <p className="mt-1 text-[10.5px] text-slate-500">The provider accepts 4–12s per clip.</p>
              </div>
              <div>
                <span className="label">Parallel scene requests</span>
                <Segmented
                  value={settings.concurrency}
                  onChange={(value) => setSettings({ concurrency: value })}
                  options={[1, 2, 3].map((value) => ({ value, label: `${value}×` }))}
                />
                <p className="mt-1 text-[10.5px] text-slate-500">
                  Higher is faster but burns the 16/min quota faster. 2 is a good default.
                </p>
              </div>
              <Field label={`Status poll interval · ${settings.pollIntervalSec}s`} hint="Each poll counts against the provider quota.">
                <input
                  type="range"
                  min={8}
                  max={60}
                  step={1}
                  value={settings.pollIntervalSec}
                  onChange={(event) => setSettings({ pollIntervalSec: Number(event.target.value) })}
                  className="w-full accent-[#3fa9ff]"
                />
              </Field>
              <Toggle
                checked={settings.subtitlesDefault}
                onChange={(value) => setSettings({ subtitlesDefault: value })}
                label="Burn subtitles by default"
                description="New projects start with caption burn-in enabled."
              />
              <Field label={`Narration speed · ${settings.voiceRate.toFixed(2)}×`}>
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
              <Field label={`Default music volume · ${Math.round(settings.musicVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.02}
                  value={settings.musicVolume}
                  onChange={(event) => setSettings({ musicVolume: Number(event.target.value) })}
                  className="w-full accent-[#3fa9ff]"
                />
              </Field>
            </div>
          </Card>

          <Card title="Maintenance" subtitle="Local data and interrupted jobs.">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  void resumePending(true);
                  toast("Scanning for interrupted generations…", "info");
                }}
              >
                Resume interrupted jobs
              </Button>
              <Button
                variant="secondary"
                icon={<Cpu className="h-4 w-4" />}
                loading={warming}
                onClick={async () => {
                  setWarming(true);
                  try {
                    await warmUpFFmpeg(setFfmpegStatus);
                    setFfmpegStatus("FFmpeg core loaded and ready.");
                    toast("FFmpeg is ready.", "success");
                  } catch (err) {
                    setFfmpegStatus(errorMessage(err));
                    toast(errorMessage(err), "error");
                  } finally {
                    setWarming(false);
                  }
                }}
              >
                Test FFmpeg engine
              </Button>
              <Button
                variant="ghost"
                icon={<Database className="h-4 w-4" />}
                onClick={async () => {
                  await clearHistory();
                  clearLog();
                  toast("History and engine log cleared.", "info");
                }}
              >
                Clear history
              </Button>
              <Button
                variant="ghost"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => {
                  resetSettings();
                  toast("Settings reset to defaults.", "info");
                }}
              >
                Reset settings
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={async () => {
                  if (!window.confirm("Delete every project, clip and export stored in this browser?")) return;
                  if (!window.confirm("This is permanent. Really delete all local projects?")) return;
                  for (const project of state.projects) await deleteProject(project.id);
                  await clearHistory();
                  setStorage(await storageEstimate());
                  toast("All local projects deleted.", "info");
                }}
              >
                Delete all projects
              </Button>
            </div>
            {ffmpegStatus && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-white/8 bg-ink-950/60 px-2.5 py-2 text-[11px] text-slate-400">
                <Cpu className="mt-0.5 h-3 w-3 shrink-0" /> {ffmpegStatus}
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Environment" subtitle="What this session actually has." actions={<Activity className="h-4 w-4 text-slate-500" />}>
            <dl className="space-y-1.5 text-[11.5px]">
              {[
                ["Backend", backendLabel(backend)],
                ["Backend mode", backend.mode],
                ["Agnes base", backend.health?.agnesBase || settings.agnesBase],
                ["Protocol", backend.health?.protocol || "agnes-video-2.5"],
                ["Server key", backend.health?.hasServerKey ? "configured" : "not set"],
                ["Browser key", settings.agnesKey ? "stored locally" : "not set"],
                ["WebAssembly", wasm ? "supported" : "missing"],
                ["SharedArrayBuffer", sharedArrayBuffer ? "available (multithread possible)" : "blocked (single-thread core)"],
                ["Projects", String(state.projects.length)],
                ["Engine", engine.busy ? engine.stage : "idle"],
                ["Storage used", storage ? `${formatBytes(storage.usage)}${storage.quota ? ` / ${formatBytes(storage.quota)}` : ""}` : "not measured"],
                ["User agent", navigator.userAgent.slice(0, 80)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-1.5 last:border-0">
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-words text-right text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
            {!storage && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={async () => setStorage(await storageEstimate())}
              >
                Measure storage
              </Button>
            )}
            {backend.reason && <InlineNote>{backend.reason}</InlineNote>}
          </Card>

          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Scene queue" value={engine.activeScenes.length} hint="in flight" icon={<Server className="h-4 w-4" />} />
            <Stat label="Engine log" value={engine.log.length} hint="entries" icon={<Activity className="h-4 w-4" />} />
          </div>

          <Card title="Engine log" subtitle="Latest pipeline events from this session.">
            {engine.log.length === 0 ? (
              <p className="text-[11.5px] text-slate-500">Nothing logged yet.</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/8 bg-ink-950/70 p-2.5 font-mono text-[10px] leading-relaxed text-slate-400 scroll-thin">
                {engine.log.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            )}
          </Card>

          <Card title="PWA & mobile" subtitle="Install it like an app.">
            <div className="space-y-2 text-[11.5px] leading-relaxed text-slate-400">
              <p className="flex items-center gap-2">
                <Badge tone="blue">iOS Safari</Badge> Share → Add to Home Screen.
              </p>
              <p className="flex items-center gap-2">
                <Badge tone="violet">Android</Badge> Menu → Install app.
              </p>
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                Assembly is the heaviest step on phones. Use 15–60s exports on mobile; desktop for 90–120s.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
