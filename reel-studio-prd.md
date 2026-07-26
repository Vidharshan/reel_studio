# PRD: Reel Studio in a Box
**fal Generative Buildathon — 3 Hour Build**

---

## 1. Problem Statement

Creative studios and brands burn hours per short-form video: sourcing b-roll, writing/recording voiceover, scoring music, and manually stitching everything in an editor — for content that goes stale in a day. This tool replaces that entire "asset → revision → version → deliver" step with one automated pipeline.

**One-line pitch:** Upload one photo + a one-line hook. Get back a finished, ready-to-post 9:16 reel — motion, voiceover, music, captions — in under 2 minutes.

---

## 2. Success Criteria (mapped to judging rules)

| Requirement | How this PRD satisfies it |
|---|---|
| Real Interface | Full web UI, no notebooks/scripts visible to judge |
| Real Flow | Judge uploads their own photo + types a hook live → gets a downloadable .mp4 |
| Composition | 4–5 chained fal endpoints across image, video, audio, and utility categories |
| Demo-ready | Must handle an arbitrary judge-supplied photo without crashing; graceful fallback on any step failure |
| Metrics & Observability (nice-to-have) | Live cost + latency per pipeline step, full execution trace, shown in UI in real time |
| UX Polish (nice-to-have) | Cached results, skeleton/preview states at every step, no dead-air spinners |

---

## 3. User Flow

1. User lands on single-page app.
2. Uploads a photo (drag-drop or file picker) and types a one-line hook/script (text input, ~1 sentence).
3. Selects optional tone/style (e.g. "UGC / cinematic / product demo") — single dropdown, defaults to sensible value.
4. Clicks **Generate Reel**.
5. UI shows a **live pipeline tracker**: each step lights up as it starts/completes, with live latency + cost ticking per step.
6. As each intermediate asset completes, a **preview appears immediately** (e.g. the generated video clip shows before voiceover finishes) — never a blank screen.
7. Final reel renders in an inline video player with a **Download** button and a **shareable link**.
8. A collapsible **"Execution Trace"** panel shows the full request/response chain for judges to inspect (request payload, model used, duration, cost, status).

---

## 4. Pipeline (Chained fal Endpoints)

| Step | Purpose | Suggested fal model(s) | Input | Output |
|---|---|---|---|---|
| 1. Image-to-Video | Turn the static photo into motion b-roll | `fal-ai/kling-video` or `fal-ai/hailuo` or `fal-ai/pixverse` (pick fastest at build time) | uploaded image + short motion prompt derived from hook | short video clip (4–6s) |
| 2. Voiceover (TTS) | Narrate the hook | ElevenLabs endpoint on fal | hook text | audio file |
| 3. Background Music | Mood/pace bed | fal music-generation endpoint | style tag (from tone dropdown) | audio file |
| 4. Composition/Stitch | Merge video + voiceover + music + captions into final deliverable | fal FFmpeg utility endpoints (video composition, waveform/caption sync) | outputs of steps 1–3 | final .mp4, 9:16 |
| 5. (Stretch) Lipsync avatar | UGC-style talking creator instead of pure b-roll | `sync-3` or `Omnihuman` | face image + voiceover from step 2 | talking-head video, feeds into step 4 instead of step 1 |

Pipeline runs steps 1, 2, 3 **in parallel** (all only depend on the original upload), then step 4 runs once all three resolve. This is both a performance win and a good story for the demo ("we parallelized the chain").

---

## 5. Architecture

- **Frontend:** Single-page React app (Next.js or plain Vite+React — pick whichever the agent can scaffold fastest). Tailwind for styling.
- **Backend/orchestration:** Thin Node/Python API layer that:
  - Receives upload + hook text
  - Fires steps 1–3 in parallel via `fal-ai/client` SDK using `fal.queue.submit` (async queue, not blocking `subscribe`), so the UI can poll/stream status per step
  - On all three resolving, fires step 4
  - Emits step-level events (started / progress / completed / failed) with timestamp + cost to the frontend, either via polling an endpoint or a WebSocket/SSE stream
- **State:** No database needed — in-memory/session state is enough for a 3-hour build. Optionally persist to local JSON if you want a "recent reels" gallery for demo flair.
- **Storage:** fal returns hosted URLs for generated assets — no need to self-host storage.

---

## 6. Nice-to-Have #1: Metrics & Observability

**Goal:** every fal call's cost, latency, and status is visible live, not just logged to console.

Requirements:
- Wrap every fal API call in a thin instrumentation helper that records: `step name, model id, request payload (redacted if large), start time, end time, duration_ms, status (queued/running/success/failed), cost_usd (from fal's response/pricing metadata)`.
- Stream these events to the frontend as they happen (SSE or simple polling every 500ms is fine for a hackathon).
- **UI: live pipeline tracker** — a horizontal step tracker (5 nodes) that shows:
  - Idle → Queued → Running (with elapsed timer ticking) → Done (with final latency + cost) → or Failed (red, with retry button)
- **UI: running total** — a small "Cost so far: $0.0142 · Total time: 34s" readout that updates live as steps complete. This is your single best visual for the judges — make it prominent, not buried.
- **Execution Trace panel** (collapsible, below the main UI): a table or JSON tree of every call made — model, input summary, duration, cost, raw status. This directly satisfies "execution tracing" and doubles as your technical credibility signal to judges.
- Use fal's own request-level analytics/logs (available via the fal dashboard's Platform APIs) as a fallback/cross-check if you want extra polish, but don't depend on it for the live demo — your own instrumentation should be the source of truth so it doesn't fail if dashboard access is slow.

---

## 7. Nice-to-Have #2: UX — Caching & Preview States

**Goal:** the app never feels like it's doing nothing. Every wait has a visual, and repeated inputs don't re-trigger paid calls.

Requirements:
- **Caching:** hash the (image + hook + tone) input combo. If a user re-submits the same input (e.g. re-clicking Generate, or during rehearsal before the demo), serve the cached result instantly instead of re-calling fal. Simple in-memory `Map<hash, result>` is enough — no need for Redis in 3 hours.
- **Skeleton/preview states per step:**
  - Image-to-video step: show a blurred/low-res placeholder of the uploaded photo with a subtle motion shimmer while the video generates, swap to the real clip the instant it's ready.
  - TTS step: show an animated waveform placeholder while generating, swap to a real waveform + play button on completion.
  - Music step: same pattern, generic waveform placeholder.
  - Composition step: show a progress bar (not indeterminate spinner) if fal's endpoint reports progress; otherwise an estimated-time bar based on average of the last few runs.
- **Progressive reveal:** as soon as any individual asset (video clip, voiceover, music) is ready, show it in a small preview card immediately — don't wait for the final stitched video to show anything at all. This is the single biggest perceived-speed win and is cheap to implement.
- **Pre-warm for the demo:** run the full pipeline once yourself before your demo slot with a similar test image so the model containers are warm (cuts cold-start latency significantly for the judge's live run).

---

## 8. Error Handling (critical — judges bring unpredictable input)

- If any step fails (bad image, content policy rejection, timeout): show a clear inline error on that step's node in the tracker, with a **Retry** button scoped to just that step (don't restart the whole pipeline).
- Validate the uploaded image client-side (file type, size limit, min resolution) before firing any paid API call.
- Set a hard timeout per step (e.g. 45s) with a friendly fallback message ("This model is taking longer than usual — retrying with a faster model") rather than an infinite spinner.
- Have one pre-tested fallback model per category (e.g. if primary video model fails, fall back to a second video model) so a single provider hiccup doesn't kill the live demo.

---

## 9. Out of Scope (for the 3-hour version)

- User accounts / auth
- Persistent database / reel history beyond session
- Multi-language localization (mentioned as a future extension, not this build)
- Mobile app — web-responsive is enough, demo will be on a laptop

---

## 10. Build Order (suggested, ~3 hours)

1. **(30 min)** Scaffold frontend shell + upload form + step tracker UI with static/mock states first — get the skeleton visually working before wiring real APIs.
2. **(45 min)** Wire step 1 (image-to-video) end-to-end, including instrumentation wrapper (cost/latency capture) and caching layer. Get this fully working before moving on — it's the visual anchor.
3. **(30 min)** Wire steps 2 + 3 (TTS + music) in parallel with step 1.
4. **(30 min)** Wire step 4 (composition/stitch) once 1–3 resolve.
5. **(20 min)** Build the live metrics readout + execution trace panel using the instrumentation data already being captured.
6. **(15 min)** Add preview/skeleton states, error handling, retry buttons.
7. **(10 min)** Pre-warm run + rehearsal with a test photo before demo slot.

---

## 11. Handoff Notes for Implementation Agent

- Use the `fal-ai/client` npm package (or `fal_client` Python) — do not hand-roll HTTP calls, it already handles the queue/polling pattern.
- Use `fal.queue.submit()` + status polling (not `fal.subscribe()`) for every step so latency can be tracked and streamed to the UI live — this is required for the observability requirement, not optional.
- Confirm exact model IDs and current pricing at build time via `https://fal.ai/models` — the model names above are directional, some may have been superseded.
- Keep the instrumentation wrapper as a single reusable function all four steps call through — this guarantees consistent metrics without duplicated code, and is what will let the execution trace panel "just work" for every step including the stretch goal.
