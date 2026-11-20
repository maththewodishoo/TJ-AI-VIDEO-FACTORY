import { Captions, Clapperboard, FileText, Film, History as HistoryIcon, Image, Mic, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, PageHeader, Segmented, Stat } from "../components/ui";
import { clearHistory, listHistory } from "../lib/db";
import { relativeTime } from "../lib/format";
import type { HistoryEntry, HistoryKind } from "../lib/types";

const KIND_META: Record<HistoryKind, { label: string; icon: ReactNode; tone: "blue" | "violet" | "green" | "amber" | "neutral" }> = {
  script: { label: "Script", icon: <FileText className="h-3.5 w-3.5" />, tone: "violet" },
  scene: { label: "Scene", icon: <Clapperboard className="h-3.5 w-3.5" />, tone: "blue" },
  video: { label: "Batch", icon: <Film className="h-3.5 w-3.5" />, tone: "blue" },
  tts: { label: "Voice", icon: <Mic className="h-3.5 w-3.5" />, tone: "amber" },
  export: { label: "Export", icon: <Captions className="h-3.5 w-3.5" />, tone: "green" },
  image: { label: "Image", icon: <Image className="h-3.5 w-3.5" />, tone: "neutral" },
};

export default function GenerationHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<"all" | HistoryKind>("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setEntries(await listHistory(200));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.kind === filter)),
    [entries, filter],
  );

  const failed = entries.filter((entry) => entry.status === "failed").length;

  return (
    <div>
      <PageHeader
        eyebrow="Generation History"
        title="Every request, on the record"
        description="Submits, completions, failures, voice passes and exports — recorded locally so you can see what actually happened."
        actions={
          <>
            <Badge tone={failed ? "rose" : "green"}>{failed} failures</Badge>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                if (!window.confirm("Clear the entire generation history? Projects and clips are not affected.")) return;
                await clearHistory();
                await load();
              }}
            >
              Clear history
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Entries" value={entries.length} hint="capped at 300" />
        <Stat label="Failures" value={failed} hint="with reasons" />
        <Stat label="Exports" value={entries.filter((entry) => entry.kind === "export" && entry.status === "ok").length} hint="MP4s" />
        <Stat label="Voice passes" value={entries.filter((entry) => entry.kind === "tts").length} hint="TTS" />
      </div>

      <Card
        title="Timeline"
        subtitle={loading ? "Loading…" : `${filtered.length} events`}
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "scene", label: "Scenes" },
              { value: "export", label: "Exports" },
              { value: "script", label: "Scripts" },
              { value: "tts", label: "Voice" },
            ]}
          />
        }
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <HistoryIcon className="mx-auto h-6 w-6 text-slate-600" />
            <p className="mt-2 text-[12.5px] text-slate-400">Nothing recorded yet. Generate something.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/6">
            {filtered.map((entry) => {
              const meta = KIND_META[entry.kind] || KIND_META.scene;
              return (
                <li key={entry.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300">
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12.5px] font-medium text-slate-100">{entry.title}</p>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {entry.status === "failed" && <Badge tone="rose">failed</Badge>}
                      {entry.status === "info" && <Badge tone="neutral">info</Badge>}
                    </div>
                    {entry.detail && <p className="mt-0.5 break-words text-[11px] leading-relaxed text-slate-500">{entry.detail}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      {entry.projectName ? `${entry.projectName} · ` : ""}
                      {relativeTime(entry.at)}
                      {entry.durationMs ? ` · ${(entry.durationMs / 1000).toFixed(1)}s` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
