# Reel Studio — Phase 2: Multi-Clip AI Auto-Editor
**Product roadmap extension (not part of the 3-hour hackathon build)**

---

## 1. Vision

Extend Reel Studio from "one photo → one reel" into a full rough-cut editor: user uploads multiple raw video clips, the system decides what's usable, what order tells the best story, cuts each clip to length, and syncs the whole edit to the beat of a generated or selected music track — producing a ready-to-post reel with zero manual editing.

This is the natural evolution of the pipeline: same delivery format (finished 9:16 reel), much richer input (a real shoot's worth of raw footage instead of a single image).

---

## 2. What fal Actually Provides vs. What Needs to Be Built

This is the most important distinction for scoping the build. fal is a **generative media API** — it doesn't host classical signal-processing or CV models, because beat detection, shake detection, and duplicate-clip detection aren't generative tasks. Those need to run as separate, non-fal logic.

| Capability | Source | Notes |
|---|---|---|
| Detect beat/inflection points in a song | `librosa` (Python, local/serverless) | `beat_track()` / onset detection, runs in milliseconds |
| Detect shaky vs. smooth footage | OpenCV optical flow variance | High frame-to-frame flow variance = shaky |
| Detect redundant/duplicate clips | `imagehash` (perceptual hashing) or CLIP embeddings + cosine similarity | Catches near-duplicate takes |
| Detect shot/scene boundaries within a clip | `PySceneDetect` | Content-aware cut detection |
| Score clip usability (blur, exposure) | Laplacian variance (blur) + histogram check (exposure) | No model needed, pure CV |
| Caption each clip's content semantically | **fal vision/captioning model** | Feeds the editorial decision layer |
| Decide what to keep, in what order, how long | **LLM** (not fal — any reasoning-capable model) | Takes captions + quality scores + user's goal as input |
| Generate/select background music | **fal music generation model** | Same as Phase 1 |
| Final cut, trim, stitch, crossfade | **fal FFmpeg composition endpoints** | Same as Phase 1 |

Net: 3 fal endpoints are still in the chain (captioning, music, composition), but the "intelligence" of the auto-edit — quality scoring, redundancy removal, beat alignment — lives outside fal, in your own preprocessing layer.

---

## 3. Full Pipeline (Phase 2 target architecture)

1. **Ingest** — user uploads N raw clips (and optionally a target duration / vibe)
2. **Local preprocessing per clip** (not fal):
   - Sample frames at intervals
   - Score blur (Laplacian variance), exposure (histogram), shake (optical flow variance)
   - Compute perceptual hash / embedding per clip to flag near-duplicates against each other
   - Detect internal shot boundaries if a clip contains multiple scenes (PySceneDetect)
3. **Semantic captioning** (fal vision model) — one caption + tag set per clip/shot: what's happening, who/what is in frame, mood
4. **Editorial decision layer** (LLM) — given captions + quality scores + duplicate flags + user's hook/goal:
   - Selects the surviving clips
   - Orders them into a narrative sequence
   - Assigns a target duration per clip
5. **Music track** (fal music generation, or user-supplied track)
6. **Beat/tempo analysis** (`librosa`, local) — extract beat timestamps or BPM from the chosen track
7. **Cut-point computation** (local logic) — snap each clip's assigned duration to the nearest beat boundary from step 6
8. **Composition** (fal FFmpeg endpoints) — trim each clip at computed in/out points, apply crossfades, sync to music, render final 9:16 file
9. **Captions/text overlay** (fal or FFmpeg subtitle burn-in, TBD based on what the composition endpoint actually accepts)

---

## 4. Why This Is Out of Scope for a 3-Hour Build

- Frame-level CV scoring (blur/shake/duplicate detection) needs tuning per footage type to avoid false positives — not something you can trust untested on a judge's live upload.
- True beat-alignment (snapping cuts to actual beat timestamps, not just matching average tempo) is easy to get subtly wrong and looks obviously janky when it's off by even a frame or two.
- The editorial LLM layer needs prompt iteration to produce genuinely good ordering decisions — first-pass results are usually mediocre.
- This is realistically a multi-day build to get looking polished, not a 3-hour one.

---

## 5. Simplified MVP (if you want a stretch-goal demo of this concept in the same hackathon)

If there's time left after Phase 1 (single-photo reel) is working, a stripped-down version can still tell the story convincingly without the hard parts:

- **Skip:** shake/blur/duplicate scoring, true beat-detection, internal scene detection
- **Keep:**
  1. Caption each uploaded clip via fal vision model
  2. LLM picks top N clips and an order, based on captions + user's stated hook only
  3. Generate music track via fal, extract just its BPM (not full beat timestamps — one `librosa.beat.tempo()` call)
  4. Cut each selected clip to a fixed duration derived from BPM (e.g. one bar length per clip) — not frame-accurate beat alignment, just consistent rhythmic pacing
  5. Stitch via fal FFmpeg composition

This is buildable in an extra 45–60 minutes on top of Phase 1, and gives a genuine "look, it's not just one photo — it understood multiple clips and picked the good ones" demo moment, without betting the live demo on CV tuning that's likely to misfire on unfamiliar footage.

---

## 6. Why This Is a Strong Roadmap Story for Judges

Pitching this as "here's what we'd build next" does two things:
- Shows you understand the actual boundary between what fal provides (generation) and what a real product needs on top (reasoning + signal processing) — this reads as technical maturity, not hand-waving.
- Positions Reel Studio as a genuine product trajectory rather than a one-off demo, which is exactly the kind of story fal likes to feature (a team that built something on fal that could become a real company, not just a hackathon toy).
