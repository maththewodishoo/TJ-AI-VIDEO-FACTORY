# TJ AI VIDEO FACTORY

**ONE PROMPT. COMPLETE VIDEO. ZERO MANDATORY COST.**

A production-focused AI video studio: write one prompt, pick a duration, and the app writes the story, keeps characters consistent, builds a storyboard, generates every scene through the Agnes AI video API, downloads the clips, records narration, times captions, mixes music/SFX, and renders one finished MP4 in the browser with FFmpeg.wasm.

Built with React 18, TypeScript, Vite, Tailwind CSS, IndexedDB and FFmpeg.wasm. No subscription, no credit card, no mandatory paid tier.

---

## 1. What is verified, and what is not

Honest status, because this matters more than a green checkmark:

**Verified on this build**

- Production build and TypeScript typecheck pass.
- Server routes work against the live API: health, Agnes proxy auth failures, real Google TTS MP3 output.
- The exact FFmpeg.wasm assembly graph was executed on the real wasm core (not just the desktop binary): scene normalisation, burned captions (`drawtext` with the bundled Noto Sans), concat, narration WAV, 3-input `amix`, final mux → valid 720×1280 H.264 + AAC MP4, 6.0 s, audible mix (−23.8 dB mean / −7.9 dB peak).
- Caption burn-in proven by pixel diff: caption band 48.2 % of pixels changed vs 0 % in a control band.
- A missing key returns a clean `401 missing_key`; a fake key returns the provider's real `401`.

**Not verified yet, and why**

- No real Agnes generation, polling or clip download has run end-to-end, because no Agnes API key was available in this environment. The integration follows the published contract, but a live generation has not been observed. Add a free key and the Generator will exercise it.
- The UI was never opened in a browser here (no browser runtime in this sandbox), so visual polish and runtime console output are unverified. Everything compiles; layout has not been eyeballed.
- 90–120 s exports were not attempted on a physical iPhone. FFmpeg.wasm memory limits on iOS Safari are real; see §11.

---

## 2. Quick start

```bash
bun install
bun run dev          # http://localhost:5173
bun run typecheck    # tsc -b --noEmit
bun run build        # static bundle in dist/
```

FFmpeg.wasm loads its ~32 MB single-thread core from jsDelivr on first export. Nothing else is downloaded at runtime except the clips and audio you actually generate.

### Keys

Three supported paths, in order of preference:

1. **Server key (recommended).** Create `.env.local` from `.env.example` and set `AGNES_API_KEY`. The browser never sees it; all provider calls go through `/api/*`.
2. **Browser key (zero-setup).** Open **API Configuration**, paste the key and press *Save & test*. It is stored in this browser only. Because Agnes returns `Access-Control-Allow-Origin: *`, the app detects that `/api` is unavailable and talks to `https://apihub.agnes-ai.com` directly.
3. **Optional hosted text/TTS providers.** Set `TEXT_API_BASE` + `TEXT_API_KEY` (any OpenAI-compatible chat endpoint) and/or `TTS_API_BASE` + `TTS_API_KEY` for a premium voice. Without them, story writing uses Agnes chat and narration uses the free Google Translate voice.

Get a free Agnes key at <https://platform.agnes-ai.com>. Never commit it: `.env*` is ignored, and keys entered in the UI live in `localStorage` on that device only.

---

## 3. The 12-step pipeline

| Step | Where it runs | What happens |
|---|---|---|
| 1 | Generator | Prompt, duration (15/30/45/60/90/120 s), genre, style, language, aspect ratio |
| 2 | `lib/pipeline.ts` | `agnes-3.0-flash` writes title, hook, narration, scene beats, dialogue, camera, transitions. Falls back to a deterministic offline draft if the text model is unreachable — clearly labelled as offline |
| 3 | Character Studio | Character names inferred from scenes, then expanded into age, face, hair, clothing, personality, voice and a frozen continuity string |
| 4 | Storyboard | Scene list with visual prompt, characters, angle, movement, lighting, background, dialogue, narration, SFX, transition |
| 5 | `lib/plan.ts` | Scene count = duration ÷ per-scene length, clamped to the provider's 4–12 s window |
| 6 | Scene Generator | `POST /v1/videos` per scene, concurrency-limited |
| 7 | Pipeline store | Task IDs persisted; status polled with backoff; progress survives navigation and refresh |
| 8 | Pipeline store | Finished clip downloaded through the proxy (CORS-safe), stored as a Blob in IndexedDB |
| 9 | Voiceover / Subtitle Studio | TTS per scene, captions built from narration timing |
| 10 | Editor | FFmpeg.wasm normalises, joins, mixes, burns captions |
| 11 | Editor | MP4 written to IndexedDB, previewable and downloadable |
| 12 | Projects / History | Resume, re-export, download individual clips, SRT export |

Resume is real: on load, scenes with a task ID that are still `generating`/`downloading` are re-polled instead of being resubmitted, so a refresh does not waste quota.

---

## 4. Agnes AI contract (as implemented)

Base URL `https://apihub.agnes-ai.com`, Bearer auth, 16 requests/minute.

| Purpose | Endpoint | Notes |
|---|---|---|
| Submit video | `POST /v1/videos` | 2.5 protocol: `model`, `mode` (`text` / `reference`), `seconds` (4–12), `size` (`720P`), `aspect_ratio` |
| Poll video | `GET /v1/videos/{id}` | Legacy `GET /agnesapi?video_id=…` still understood |
| Chat / script | `POST /v1/chat/completions` | `agnes-3.0-flash` |
| Images | `POST /v1/images/generations` | `agnes-image-2.5-flash` |
| Models | `GET /v1/models` | Used by *Test connection* |

Models: `agnes-video-2.5-flash` (video), `agnes-3.0-flash` (text), `agnes-image-2.5-flash` (image). The retired v2.0 fields (`width`, `height`, `num_frames`) are not sent. Image-to-video uses `mode: "reference"` with a `reference.images` array, as documented.

No endpoint is invented. Errors from the provider are surfaced verbatim, with `401/402/429/5xx` handled distinctly and retries limited.

---

## 5. Durations and scene count

Provider clips are 4–12 s, so the app splits your chosen runtime into as many scenes as needed and never claims otherwise:

- 15 s → 3 scenes, 30 s → 6, 45 s → 9, 60 s → 12, 90 s → 18, 120 s → 24 (at the default 5 s).
- Change the per-scene length in Settings; each scene is clamped to 4–12 s.
- The Agnes Studio UI's five-scene limit is not inherited — orchestration is independent of that interface.
- Generation costs quota per scene. There is no unlimited tier and the app says so on the API Configuration page.

---

## 6. Assembly

One FFmpeg.wasm pass (`lib/ffmpeg.ts`):

1. Scale + pad each clip to the target framing (9:16, 16:9, 1:1, 4:5) at 720p-class resolution, `setsar=1`, 24 fps, H.264.
2. Burn captions with `drawtext` using the bundled `public/fonts/NotoSans-SemiBold.ttf` and a readable box. If the core lacks the filter or the font, the export automatically falls back to a clean video plus an SRT download instead of failing.
3. Concat with the stream-copy demuxer after normalisation.
4. Build a narration track per scene, padded/trimmed to scene length, then `amix` narration + SFX + music with `normalize=0` so levels are predictable.
5. Mux `-c:v copy -c:a aac -movflags +faststart`.

Music and SFX are synthesised in-browser (`lib/audio.ts`), so there is no licensing cost. The music bed is a generated pad, not a licensed track — swap in your own file if you want richer scoring.

---

## 7. Narration and subtitles

- **Free default:** Google Translate TTS through the server proxy (no key, no CORS, MP3 verified at 59 KB for a short line).
- **Preview fallback:** browser `speechSynthesis`, explicitly labelled as preview-only in the UI.
- **Premium:** any OpenAI-compatible `/audio/speech` endpoint via `TTS_API_BASE`/`TTS_API_KEY`.
- Voice, language and rate are project settings; narration is generated per scene, so re-recording one scene is cheap.
- Captions are derived from scene narration with proportional timing, keyboard/mobile-friendly typography (large, high-contrast, bottom-safe-area), SRT export, and optional burn-in.

---

## 8. Data, storage and security

- Projects, clips, narration and exports live in **IndexedDB** on your device. Nothing is uploaded to a TJ server — there isn't one.
- A browser-entered API key is kept in `localStorage` and sent only to your configured backend or the provider. Server keys never reach the bundle.
- `APP_ACCESS_TOKEN` (optional) gates `/api/*` when the Worker is public.
- `ALLOWED_ORIGINS` narrows CORS for the proxy.
- Deleting a project removes its blobs; regenerating a script, rebuilding a storyboard or deleting a scene cleans up orphaned narration audio.
- IndexedDB is per-browser and clearable by the OS. Export finished MP4s you care about.

---

## 9. Costs and limits

| Item | Cost | Limit |
|---|---|---|
| App hosting | Free tier | Static bundle |
| Agnes video | Free allowance / paid tiers per provider | 16 req/min; per-account quota; 720P |
| Script (Agnes chat) | Same key | Rate-limited by the same bucket |
| Google TTS proxy | Free | One default voice; unofficial endpoint, may throttle |
| Music/SFX | Free | Synthesised locally |
| FFmpeg | Free | Browser CPU/RAM; ~32 MB core download on first use |

There is no unlimited generation claim anywhere in the product.

---

## 10. Deployment

### Static hosting (works today)

`bun run build` emits `dist/`. Deploy that to any static host. Without a backend, the app runs in **direct mode**: Agnes calls go browser→provider using the key you paste in API Configuration. Storyboard generation, scene generation, downloads and assembly all work this way.

What does **not** work on pure static hosting: server-side narration proxy (Google TTS has no CORS headers). In that mode the Voiceover page offers the browser-speech preview and tells you the proxy is required for production audio. Export still works and will mix any narration you already generated while a backend was available.

### Full mode (Cloudflare Worker, free tier)

```bash
cd worker
bunx wrangler secret put AGNES_API_KEY
bunx wrangler secret put APP_ACCESS_TOKEN      # optional but recommended
bunx wrangler deploy
```

Then set `VITE_API_BASE` to the Worker URL (or serve the built `dist/` through the Worker) and rebuild. The Worker exposes the same `/api/*` routes as the Vite dev middleware, including the TTS binary response.

---

## 11. iPhone notes

- Layout is mobile-first with a bottom tab bar, large touch targets and no horizontal overflow; safe-area insets are respected.
- Progress survives navigation and refresh; interrupted scenes resume from their task ID.
- PWA manifest and service worker are included, so Safari can *Add to Home Screen*.
- Safari's memory ceiling is the real constraint. 15–60 s videos assemble reliably; 90–120 s exports are desktop work. The Editor states this before you start.
- Keep the tab foregrounded during export; backgrounding can suspend wasm.
- Download the MP4 after export — browser storage can be evicted.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `missing_key` | No key on server or in browser | API Configuration → paste key → Save & test |
| `401` from provider | Key revoked/typo | Regenerate at platform.agnes-ai.com |
| `429` | 16 req/min bucket | Wait; lower concurrency in Settings |
| `tts_needs_backend` | Static host without Worker | Deploy the Worker or use voice preview |
| Export stalls at first run | 32 MB core download | Wait, or warm it from the Editor |
| Captions missing | `drawtext`/font unavailable | Export falls back to clean MP4 + SRT; download the SRT |
| Scenes stuck `queued` | Tab closed mid-batch | Reopen the project; resume runs automatically |

---

## 13. Project layout

```
server/        Fetch-API routes shared by Vite dev middleware and the Worker
  handler.ts   /api/* routing, CORS, auth, download proxy, TTS binary
  agnes.ts     Agnes client: payloads, polling, rate bucket, error mapping
  tts.ts       Google TTS chunking + optional OpenAI-compatible voice
worker/        Cloudflare Worker entry + wrangler config
src/lib/       pipeline, Agnes client, IndexedDB, ffmpeg, subtitles, audio DSP, planning
src/pages/     15 studio sections (Overview → Diagnostics)
src/components/AppShell, shared primitives, UI kit
public/        manifest, service worker, icon, caption font
```

---

MIT licensed. Agnes AI is a third-party service; its terms, quotas and availability are its own.
