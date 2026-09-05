# PRD: Reeltrix — Editing Engine v1

**Status:** Draft for review
**Scope:** v1 only (editing engine). Template/b-roll library, GTM/ads, and creator-brand marketplace are explicitly out of scope — see §9.

---

## 1. Problem Statement

Brands and social media managers post short-form video constantly, and every post pays the same tax: someone has to sit down with the raw footage — talking-head takes full of "um," restarts, dead air, half-finished sentences — and manually cut it into something postable. That work either goes to an in-house editor, an agency, or a stack of editing plugins, and none of those scale cleanly with posting volume. The cost isn't just money; it's the lag between "we shot this" and "this is live," which kills a lot of content that would have worked if it went out same-day.

The founder felt this personally trying to post a "building in public" video: the barrier wasn't ideas or willingness to post, it was the edit. That's the proof point — the same friction shows up at brand scale, multiplied across every account a social media manager runs.

**One-line pitch:** Upload the raw take — mistakes, filler words, false starts and all — and get back a polished, on-brand, publishable reel, without a human editor in the loop.

---

## 2. Target User & Buyer (v1)

- **Buyer/user:** Social media managers and brand marketing teams who currently either edit in-house or pay an agency/editor per video.
- **Not v1:** individual solo creators, and not a self-serve consumer top-up product — v1 should assume the user is managing content for a brand (or multiple brand accounts), not just themselves.
- **Why this matters for scope:** brands care about *consistency* (same visual identity across every post) and *volume* (many videos, not one), not just "make this one video good." That pulls two requirements into v1 that a pure consumer tool wouldn't need: brand presets and repeatable multi-video throughput.

---

## 3. Core User Flow (v1)

1. User selects (or creates) a **brand profile** — visual identity preset: colors, font, logo placement, caption style, tone. (The existing 5 brand templates in `lib/pipeline.ts` — Signature, UGC, Showcase, High-Energy, Calm Story — are the seed for this; extend to support a custom/uploaded brand kit later.)
2. User uploads **one or more raw clips**: a single long talking-head take, or a mix of talking-head + event/b-roll footage.
3. Pipeline auto-detects and removes filler (ums, ahs, dead air, false starts, redundant retakes) and finds the usable, well-spoken segments.
4. Pipeline auto-cuts, orders, and stitches the usable segments into a coherent edit, applying the brand profile (captions, color/style treatment, pacing).
5. Live pipeline tracker shows progress per stage (as already built for the fal pipeline), with progressive preview of each asset as it completes.
6. User reviews the output against the source: a **before/after or trace view** showing what was cut and why (builds trust that the automation didn't cut something important — critical for a brand user who can't visually re-check every raw take).
7. User approves, or nudges specific cuts/segments and regenerates just that part (not the whole pipeline) — cheap re-runs matter for a brand user iterating on tone.
8. Final reel exports at 9:16, ready to post.

---

## 4. Feature Scope — v1 Must-Haves

| Feature | Status | Notes |
|---|---|---|
| Filler-word / dead-air detection ("ums and ahs detector") | **New framing, existing foundation** | The Python agent already does Whisper transcription + silence detection + active-segment extraction. This needs to become an explicit, user-facing capability rather than an internal step. |
| Auto-cut to usable segments | **New framing, existing foundation** | Editorial planning via LLM already exists for multi-clip mode; extend it to single long-take talking video, not just multi-clip stitching. |
| Captions | **Built** | Already in pipeline. |
| B-roll insertion via video understanding | **Partially built** | Florence-2 captioning exists; needs a matching/insertion layer that decides *where* and *which* b-roll to place — this is the "video understanding model to pick out and insert correct b-rolls" from your list, and it's the single biggest net-new model-behavior piece in v1. |
| Multi-clip stitching (event + talking mix) | **Built** | Multi-clip mode already does this. |
| Brand profile / consistency preset | **Partially built** | 5 templates exist; needs to become a first-class, savable "brand kit" a user reuses across every upload, not a per-generation dropdown. |
| Review/trace view (what got cut, why) | **New** | Not currently exposed; important specifically because the buyer is a brand, not a casual user posting their own life. |
| Targeted re-run (fix one segment without re-running everything) | **Partially built** | Stage caching/resume already exists at the pipeline-step level; needs to extend to segment-level within a step. |

## 5. Explicitly Out of Scope for v1

Deferred, not abandoned — these are real ideas, just separate products/phases:

- Trending Instagram template library, meme sound library, region-specific asset packs (documented separately in `reel-studio-viral-templates.md` — good foundation, wrong phase)
- Talking-head / generic video generation from scratch (no source footage)
- GTM experiments, ad-boosting rulebook, UGC ads
- Google Trends for the creator economy
- Creator–brand marketplace/matching
- Multi-tenant workspace/team permissions beyond a single brand profile (add once there's more than one real customer)

If any of these get pulled forward, they get their own PRD — don't let them creep back into this one.

---

## 6. Architecture Notes (mapping to existing repo)

v1 is mostly an extension and re-framing of what's already in `agent/` (`transcriber.py`, `planner.py`, `composer.py`, `renderer.py`) and the multi-clip Next.js route, not a rebuild:

- Filler/dead-air detection → expose the existing silence-detection + transcription output as a first-class "cleanup" stage with its own UI step in the pipeline tracker.
- B-roll auto-insertion → new stage between "edit plan" and "stitch": given the editorial plan + Florence-2 scene captions, an LLM call decides b-roll placement (this is net-new logic, not net-new infra).
- Brand kit → promote `lib/pipeline.ts`'s template catalog from a generation-time dropdown to a persisted, reusable entity tied to a user/brand.
- Trace/review view → surface the existing per-step execution data (already captured for cost/latency in the fal PRD) as a content-level "what changed" view instead of just an infra debug panel.

---

## 7. Optionally-Editable Output

The auto-generated draft is the default path, but a brand user needs to be able to correct it rather than accept-or-discard. Model this as a **segment-level editor** (reorder/trim/swap the pipeline's own scenes, captions, and b-roll blocks), not a frame-accurate NLE like InShot's full surface — that's more building than a "fix the auto-cut" tool needs.

**Layout:** InShot-style split screen — 9:16 video preview pinned on one side, a segment timeline (thumbnail + duration + trim handles) with a contextual tool panel on the other. Selecting a segment in the timeline highlights it in the preview.

**v1 editable primitives:**
- Reorder segments (drag)
- Trim in/out per segment (against the raw uploaded clip, not the composited render — so this reflects instantly with no re-render)
- Remove a segment / restore one the auto-cut dropped
- Swap or remove a b-roll insertion
- Edit caption text and re-time it
- Adjust music/voice volume balance

Explicitly out of v1: new stickers/effects, color grading, multi-track layering — that's InShot's full feature set, not what's needed to fix an auto-generated draft.

**Preview approach:** re-render on Apply, reusing the existing fal ffmpeg compose step and the stage-caching/targeted-re-run capability already planned in §4 — not a live frame-accurate scrub preview. Trim/reorder are shown against the raw clip so they're accurate without a re-render; b-roll swap and caption/volume changes require an Apply + re-render to see the true result. A true live-composition preview (e.g. a Remotion-based renderer) is worth revisiting once the template-DNA/style system exists, since both features would want the same structured-composition renderer — but it's not a v1 requirement on its own.

**Two edit entry points, not a fully re-enterable pipeline:**
1. **Pre-flight** — right after cut/segment detection, before the AI-heavy steps (b-roll matching, caption generation) run. User can drop/reorder proposed segments before the pipeline spends compute on ones they'd cut anyway — a cost checkpoint, not a polish step.
2. **Fine-tune** — after the full draft, inside the review/trace view from §3. This is where b-roll swap, caption styling, and volume balance actually happen, since judging them needs the finished context.

---

## 8. Success Metrics (v1)

- Time from raw upload to publishable output (target: materially faster than manual editing — define a number once first real runs exist).
- % of auto-cuts a user accepts without manual correction (proxy for automation quality; track over time as the real product KPI).
- Number of videos processed per brand profile per week (usage/retention signal for a volume-driven buyer).

---

## 9. Pricing (deferred)

Not decided yet — revisit after v1 is working and you have real usage data. Options on the table for later: pay-as-you-go credits, a Claude-plugin/one-time-harness model, and conversion-based/as-a-service pricing. Given the v1 buyer is a brand/SMM (volume-driven, not one-off), usage-based or seat-based pricing is likely a better fit than a casual consumer credit top-up — worth weighing once there's usage data to price against.

---

## 10. Upload Flow & Template Selection (resolved)

Single-take and multi-clip are **unified into one upload flow** — no explicit "mode" toggle in the UI, since a large, growing template library makes "mode" and "template" the same decision if left separate. Approach:

1. One universal upload zone accepts any combination of clips/photos, no mode selection.
2. Backend classifies what was uploaded (single long talking-head take vs. multiple shorter clips) — the same video-understanding model already planned for b-roll matching can double as this classifier.
3. The template/style gallery then **filters to templates that fit the uploaded footage shape**, rather than either hiding the choice entirely or forcing the user to pick a template before uploading. Each template declares its footage requirements (e.g. "1 hook take + optional b-roll" vs. "3–8 event clips").

This keeps the "just upload it" simplicity of the original pitch while making the template library — the intended point of differentiation — a visible, correctable step rather than invisible plumbing.

## 11. Brand Kit (resolved — non-restrictive)

Brand kit must never be a gate. Concretely:

- **Default is no brand kit.** The full pipeline works with zero brand setup, using a template's own default styling.
- **Brand kit is an override layer**, not a separate mode — a saved kit (colors, font, logo, caption style) can apply on top of *any* template, so brand kit and template choice are orthogonal, not one of a fixed set of "brand templates."
- **Quick/ad hoc overrides** (drop in a logo + a color once) are supported alongside fully persisted, reusable brand kits, so a first-time or occasional user isn't forced through kit setup to get one video out.

## 12. Open Questions

- What's the acceptable false-cut rate before a brand user stops trusting the automation? (Affects how much the review/trace view needs to do.)
- What footage-requirements spec should each template declare (slot count, min/max clip length, talking-head vs. b-roll-only), and who authors it as the template library grows — you, or eventually template creators/curators?