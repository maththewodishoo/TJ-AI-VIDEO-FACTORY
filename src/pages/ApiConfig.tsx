import { CheckCircle2, Eye, EyeOff, KeyRound, Plug, Server, ShieldAlert, Sparkles, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Segmented, useToast } from "../components/ui";
import { InlineNote } from "../components/shared";
import { errorMessage, probeBackend, testConnection, useBackend } from "../lib/api";
import { maskKey, setSettings, useSettings } from "../lib/settings";

const BASES = [
  { value: "https://apihub.agnes-ai.com", label: "International · apihub.agnes-ai.com" },
  { value: "https://api.agnes-ai.cn", label: "Mainland · api.agnes-ai.cn" },
  { value: "https://apihub.agnes-ai.cn", label: "Mainland backup · apihub.agnes-ai.cn" },
];

export default function ApiConfig() {
  const settings = useSettings();
  const backend = useBackend();
  const { toast } = useToast();
  const [showAgnes, setShowAgnes] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showTts, setShowTts] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; models?: string[]; source?: string } | null>(null);
  const [backendTest, setBackendTest] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);

  const health = backend.health;
  const serverKey = Boolean(health?.hasServerKey);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      await probeBackend(true);
      const outcome = await testConnection();
      setResult(outcome);
      toast("Connection verified.", "success");
      await probeBackend(true);
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
      toast(errorMessage(err), "error");
    } finally {
      setTesting(false);
    }
  }

  async function checkBackend() {
    setWarming(true);
    try {
      const state = await probeBackend(true);
      setBackendTest(
        state.mode === "proxy"
          ? `Backend reachable at ${settings.backendUrl || "this origin"}. Server key: ${state.health?.hasServerKey ? "configured" : "not set"}.`
          : state.reason || "No backend detected — browser key mode.",
      );
    } finally {
      setWarming(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="API Configuration"
        title="Keys, providers and connections"
        description="One key is enough: Agnes AI powers text, video and images. A server backend keeps it off the client entirely."
        actions={
          <>
            <Badge tone={backend.mode === "proxy" ? "green" : "amber"}>{backend.mode === "proxy" ? "Server proxy" : "Direct mode"}</Badge>
            <Button onClick={test} loading={testing} icon={<Wifi className="h-4 w-4" />}>
              Test connection
            </Button>
          </>
        }
      />

      {result && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed ${
            result.ok ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100" : "border-rose-400/25 bg-rose-500/[0.08] text-rose-100"
          }`}
        >
          <p className="flex items-center gap-2 font-medium">
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            {result.message}
          </p>
          {result.models && result.models.length > 0 && (
            <p className="mt-1.5 text-[11px] opacity-80">
              Models: {result.models.slice(0, 10).join(", ")}
              {result.models.length > 10 ? ` +${result.models.length - 10} more` : ""}
            </p>
          )}
          {result.source && <p className="mt-1 text-[11px] opacity-70">Key source: {result.source}</p>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <Card
            title="Agnes AI"
            subtitle="Free key from platform.agnes-ai.com. 16 requests/minute, no card."
            actions={
              <a href="https://platform.agnes-ai.com/" target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                Get a free key
              </a>
            }
          >
            <div className="space-y-3">
              <Field
                label="API key"
                hint={
                  serverKey
                    ? "A server key is configured, so this field is optional. A key entered here overrides it for this browser only."
                    : "Stored in this browser's localStorage. Not bundled, not committed, only sent to your configured backend or Agnes."
                }
              >
                <div className="relative">
                  <input
                    className="input pr-11"
                    type={showAgnes ? "text" : "password"}
                    value={settings.agnesKey}
                    onChange={(event) => setSettings({ agnesKey: event.target.value })}
                    placeholder={serverKey ? "Server key active" : "sk-…"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAgnes((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-white/10"
                    aria-label={showAgnes ? "Hide key" : "Show key"}
                  >
                    {showAgnes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <Field label="API domain" hint="Match the domain to the key's region — a mismatch returns 401.">
                <select className="select" value={settings.agnesBase} onChange={(event) => setSettings({ agnesBase: event.target.value })}>
                  {BASES.map((base) => (
                    <option key={base.value} value={base.value}>
                      {base.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={test} loading={testing} icon={<Plug className="h-4 w-4" />}>
                  Verify key
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSettings({ agnesKey: "" });
                    setResult(null);
                    toast("Browser key removed.", "info");
                  }}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  Remove key
                </Button>
                {settings.agnesKey && <Badge tone="neutral">{maskKey(settings.agnesKey)}</Badge>}
              </div>

              <InlineNote>
                Documented protocol in use: <span className="kbd">POST /v1/videos</span>,{" "}
                <span className="kbd">GET /v1/videos/&#123;id&#125;</span>,{" "}
                <span className="kbd">POST /v1/chat/completions</span>. Video model{" "}
                <span className="kbd">agnes-video-2.5-flash</span>, text{" "}
                <span className="kbd">agnes-3.0-flash</span>.
              </InlineNote>
            </div>
          </Card>

          <Card title="Story model" subtitle="Used for the script, storyboard and character refinement.">
            <Segmented
              className="w-full"
              value={settings.textProvider}
              onChange={(value) => setSettings({ textProvider: value })}
              options={[
                { value: "agnes", label: "Agnes (free)" },
                { value: "custom", label: "Custom OpenAI-compatible" },
              ]}
            />
            <div className="mt-3 space-y-3">
              {settings.textProvider === "custom" ? (
                <>
                  <Field label="Base URL" hint="Must expose /chat/completions, e.g. https://api.deepseek.com/v1">
                    <input className="input" value={settings.textBaseUrl} onChange={(event) => setSettings({ textBaseUrl: event.target.value })} placeholder="https://api.example.com/v1" />
                  </Field>
                  <Field label="Text API key">
                    <div className="relative">
                      <input
                        className="input pr-11"
                        type={showText ? "text" : "password"}
                        value={settings.textApiKey}
                        onChange={(event) => setSettings({ textApiKey: event.target.value })}
                        autoComplete="off"
                      />
                      <button type="button" onClick={() => setShowText((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-white/10" aria-label="Toggle key visibility">
                        {showText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                </>
              ) : (
                <Field label="Model override" hint="Leave empty for agnes-3.0-flash.">
                  <input className="input" value={settings.textModel} onChange={(event) => setSettings({ textModel: event.target.value })} placeholder="agnes-3.0-flash" />
                </Field>
              )}
            </div>
          </Card>

          <Card title="Narration provider" subtitle="Free by default. Hosted TTS unlocks male/female voices.">
            <Segmented
              className="w-full"
              value={settings.ttsMode}
              onChange={(value) => setSettings({ ttsMode: value })}
              options={[
                { value: "free", label: "Free Google TTS" },
                { value: "hosted", label: "Hosted /v1/audio/speech" },
              ]}
            />
            {settings.ttsMode === "hosted" && (
              <div className="mt-3 space-y-3">
                <Field label="Base URL" hint="Include /v1, e.g. https://api.openai.com/v1">
                  <input className="input" value={settings.ttsBaseUrl} onChange={(event) => setSettings({ ttsBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
                </Field>
                <Field label="API key">
                  <div className="relative">
                    <input
                      className="input pr-11"
                      type={showTts ? "text" : "password"}
                      value={settings.ttsApiKey}
                      onChange={(event) => setSettings({ ttsApiKey: event.target.value })}
                      autoComplete="off"
                    />
                    <button type="button" onClick={() => setShowTts((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-white/10" aria-label="Toggle key visibility">
                      {showTts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Model">
                  <input className="input" value={settings.ttsModel} onChange={(event) => setSettings({ ttsModel: event.target.value })} placeholder="tts-1" />
                </Field>
              </div>
            )}
            <InlineNote>
              Free narration is proxied by the server; the public Google endpoint blocks browser CORS. Without a backend,
              narration is preview-only via the browser's system voice.
            </InlineNote>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Server backend"
            subtitle="Optional, recommended: keeps keys server-side and unlocks narration."
            actions={<Server className="h-4 w-4 text-slate-500" />}
          >
            <div className="space-y-3">
              <div className="rounded-xl border border-white/8 bg-ink-950/60 p-3 text-[11.5px] leading-relaxed text-slate-400">
                <p className="flex items-center justify-between">
                  <span>Mode</span>
                  <span className="font-medium text-slate-200">{backend.mode === "direct" ? "Direct (browser key)" : backend.mode === "proxy" ? "Proxy backend" : "Unknown"}</span>
                </p>
                {backend.reason && <p className="mt-1 text-[10.5px] text-slate-500">{backend.reason}</p>}
                {health && (
                  <dl className="mt-2 space-y-1 border-t border-white/8 pt-2 text-[10.5px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Protocol</dt>
                      <dd className="text-right text-slate-300">{health.protocol}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Server key</dt>
                      <dd className="text-slate-300">{health.hasServerKey ? "configured" : "not set"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Server TTS</dt>
                      <dd className="text-slate-300">{health.hasServerTts ? "configured" : "free proxy"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Local quota</dt>
                      <dd className="text-slate-300">
                        {health.rate.remaining}/{health.rate.perMinute} per min
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              <Field
                label="Backend URL"
                hint="Leave empty to use this origin's /api (dev server or same-domain Worker). Point it at your deployed Worker for static hosting."
              >
                <input
                  className="input"
                  value={settings.backendUrl}
                  onChange={(event) => setSettings({ backendUrl: event.target.value })}
                  placeholder="https://tj-factory-api.yourname.workers.dev"
                  inputMode="url"
                />
              </Field>
              <Field label="Access token" hint="Must match APP_ACCESS_TOKEN on the Worker. Stops strangers spending your quota.">
                <input
                  className="input"
                  type="password"
                  value={settings.appToken}
                  onChange={(event) => setSettings({ appToken: event.target.value })}
                  autoComplete="off"
                  placeholder="optional shared secret"
                />
              </Field>
              <Button variant="secondary" onClick={checkBackend} loading={warming} icon={<Server className="h-4 w-4" />}>
                Check backend
              </Button>
              {backendTest && <p className="text-[11px] leading-relaxed text-slate-400">{backendTest}</p>}

              <div className="rounded-xl border border-white/8 bg-ink-950/60 p-3">
                <p className="text-[11px] font-semibold text-slate-200">Deploy the included Worker</p>
                <pre className="mt-1.5 overflow-x-auto text-[10px] leading-relaxed text-slate-400 scroll-thin">
{`bunx wrangler secret put AGNES_API_KEY
bunx wrangler secret put APP_ACCESS_TOKEN
bunx wrangler deploy`}
                </pre>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
                  Then paste the Worker URL above. The Worker exposes only /api/*; it never returns a key to the client.
                </p>
              </div>
            </div>
          </Card>

          <Card title="Security model" subtitle="What is stored where.">
            <ul className="space-y-2 text-[11.5px] leading-relaxed text-slate-400">
              <li className="flex gap-2">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-blue" />
                Browser keys live in localStorage on this device and are sent only to your backend or the provider.
              </li>
              <li className="flex gap-2">
                <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-violet" />
                Server keys live in Worker secrets / environment variables. They are never returned by the API.
              </li>
              <li className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                Nothing is bundled into the app or committed to the repository. <span className="kbd">.gitignore</span>{" "}
                excludes all env files.
              </li>
            </ul>
            <Button
              variant="danger"
              className="mt-3 w-full"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                if (!window.confirm("Remove every key and token stored in this browser?")) return;
                setSettings({ agnesKey: "", textApiKey: "", ttsApiKey: "", appToken: "" });
                setResult(null);
                toast("All browser-stored credentials removed.", "info");
              }}
            >
              Remove all browser keys
            </Button>
          </Card>

          <Card title="Free-tier reality check" subtitle="No provider here is unlimited.">
            <ul className="space-y-2 text-[11.5px] leading-relaxed text-slate-400">
              <li>• Agnes: 16 requests/minute shared by chat, submit and polling. Long queues happen.</li>
              <li>• Google TTS: ~200 characters per request, throttled; the server chunks text and spaces requests.</li>
              <li>• FFmpeg.wasm: free, but CPU-bound in your browser. No server render farm.</li>
              <li>• Storage: IndexedDB quota varies by device; export to MP4 to keep a master copy.</li>
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
              <Sparkles className="h-3 w-3" /> The app shows these limits instead of pretending generation is instant.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
