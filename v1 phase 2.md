# PRD: Reeltrix Phase 2 — Content Intelligence Layer

**Status:** Draft, standalone from the v1 Editing Engine PRD (`reeltrix-prd-v1.md`). This phase assumes v1 (editing engine, brand/SMM users) is shipped and working; nothing here is a v1 blocker.

**Scope of this document:** the trending template library, trending audio matching, b-roll/meme repository, the "Recreate This" application layer, and the Content Coach (script/shot-list) layer — with concrete sourcing research, vendor/API detail, ingestion mechanics, and refresh cadence for each.
`
---

## 1. Why This Phase Exists

v1 turns a brand's own raw footage into a polished, on-brand edit. Phase 2 answers a different question: *what should we even be posting, in what style, with what audio, and what should we tell the user to go film?* This is the part of the product that turns Reeltrix from "an editor" into "a content strategist that also edits" — it's where the durable competitive moat lives, because the editing mechanics are catchable but a well-curated, constantly-refreshed trend library compounds over time.

---

## 2. Non-Negotiable Legal & Compliance Framework

This section governs every sourcing decision below — read it first, because it rules out the naive version of almost every sub-system.

**Instagram's own Terms of Use state:** *"You must not crawl, scrape, or otherwise cache any content from Instagram"* without permission. This is not ambiguous and not a gray area — it rules out building a scraper against Instagram for video files, engagement metrics, or trending-audio lists, regardless of technique.

**Instagram's oEmbed API is the one sanctioned exception, and it changed recently:**
- As of **June 15, 2026**, Meta made the oEmbed endpoints **tokenless** — no App Review, no access token required. `GET https://graph.facebook.com/v25.0/instagram_oembed?url={content-url}` returns embed HTML directly.
- It supports photo, video, Reel, and Feed posts.
- **Critical restriction:** Meta's terms state the returned content/metadata may only be used "to provide a front-end view of the page, post, or video" — extracting, analyzing, or persisting it for any other purpose (including deriving structural/analytic data from it) is explicitly prohibited.
- Other limits: private/inactive/age-restricted accounts aren't supported, accounts can disable embeds, Stories aren't supported.
- **Implication for this PRD:** oEmbed is how we *display* a real trending reel to the user ("here's the trend"). It is never how we *learn what the trend's structure is* — that has to come from a human watching the (legally embeddable, publicly viewable) content and logging it, exactly as your own `reel-studio-viral-templates.md` already assumed ("steal the pattern, not the asset").

**Applying the same standard everywhere else in this document:** no sub-system below stores or re-serves someone else's copyrighted media file. Every library stores *our own licensed or owned assets*, tagged with *metadata describing a publicly observable pattern*.

---

## 3. Sub-System A: Trending Template/Style Library

### 3.1 What's actually stored
Not video files. A structured record per trending style: hook type and timing, cut rhythm/pacing, shot count and average shot length, caption behavior (timing, style, color-highlight usage), on-screen text patterns, overall duration, and a link to the original post (via oEmbed) for visual reference — never a downloaded copy.

### 3.2 Sourcing research

| Source | What it gives us | Access method | Constraint |
|---|---|---|---|
| **Instagram, direct observation** | The actual trends specific to Instagram Reels — most directly relevant source | Human curator browses Explore/Reels tab, logs pattern manually; oEmbed used only to display the reference post in our tool | No API for "what's trending" exists; discovery is manual, structure-logging is manual |
| **TikTok Creative Center** (`ads.tiktok.com/business/creativecenter`) | An *official, free, public, no-login-required* dashboard covering trending hashtags, trending songs (with 7/30/120-day growth graphs), and a **Creative Insights** module that directly surfaces "average video length, common hook types, popular music genres, and text overlay frequency" across top-performing ads — i.e. pre-aggregated structural pattern data | Manual browsing by a curator (this is a public dashboard, not an API — no official public API exists for it) | Cross-platform signal, not Instagram-native — trends correlate heavily between the two platforms but aren't identical; treat as a *leading indicator*, not a direct Instagram feed. Also: third-party scrapers exist for this dashboard (e.g. browser-automation tools that intercept its internal API calls) — **do not use these**; they violate TikTok's terms the same way an Instagram scraper would violate Meta's, and "official-looking data via an unofficial method" doesn't fix the underlying compliance problem. |
| **Manual competitive/creator monitoring** | Real examples of brands/creators in the target niche already executing well | Curator follows a working list of accounts/hashtags relevant to client brands, checked on a schedule | Time-intensive; this is the highest-effort, highest-relevance source |

### 3.3 Ingestion workflow
1. Curator opens an internal "trend logging" tool (a lightweight admin page, part of the Reeltrix codebase, not a public feature).
2. Pastes the public Instagram Reel or TikTok URL.
3. Tool calls the oEmbed endpoint to render the reel inline for reference (Instagram) or the curator opens TikTok Creative Center in a separate tab (no embeddable API for TikTok content itself, only its aggregated dashboards).
4. Curator fills a structured form: hook type (question/bold-statement/visual-surprise/etc.), pacing (cuts per 10s), caption style, audio mood tag, category (talking-head/event/product/UGC-style), and a free-text note.
5. Record saves to the template library with a source link and a "logged on" timestamp.
6. A lightweight scoring pass (view count bracket, self-reported "how strong is this pattern" 1–5 from the curator) determines whether it's promoted into the user-facing gallery immediately or held for a second reviewer.

### 3.4 Refresh cadence
- **Daily:** a curator does a short (15–30 min) pass through Instagram Explore/Reels and TikTok Creative Center's "Rising" views, logging anything new.
- **Weekly:** a deeper review pass — re-check which logged templates are still performing, retire stale ones (a trend past its lifecycle actively hurts a brand posting it, since audiences read stale trends as out-of-touch), and reorganize the gallery by current relevance.
- **Monthly:** category-level audit — are there content categories (e.g. a specific industry vertical) that are under-covered in the library.

### 3.5 Team/ops requirement
This is a genuine, recurring content-ops job, not a one-time build — see §11.

---

## 4. Sub-System B: Trending Audio Library

### 4.1 What's actually stored
An **audio profile**, not an audio file: BPM, mood/genre tags, energy curve description, and a link to a **licensed track** that matches that profile — plus (separately, ephemeral, never persisted) whatever mechanism was used to find that match.

### 4.2 Sourcing research

**Discovering what's trending (signal, not the asset):**
- **TikTok Creative Center → Songs → Rising tab.** Official, free, public dashboard ranking audio by 7/30/120-day growth, filterable by region and category — the single most data-rich free trend signal available, per the platform's own design intent, and it's the same tool advertisers already use for this purpose. Note: this dashboard's feature set changes periodically (it was reported mid-2026 as temporarily without trending-audio data during a rebuild) — treat it as the primary but not sole source, and re-verify availability each time this is implemented, not just at spec time.
- **Manual in-app observation** of Instagram's own "trending audio" shelf (visible to any user browsing Reels) — no API, purely an observational signal a curator logs, same discipline as §3.

**Actually sourcing a usable, licensed track (this is the part that's technically excellent and legally clean):**
- **Epidemic Sound Partner Content API.** This is a real, documented, developer-facing API (`developers.epidemicsound.com`) built almost exactly for this use case:
  - `GET /v0/tracks` — browse/filter by mood, genre, and **BPM range** (`bpmMin`/`bpmMax`).
  - `GET /v0/tracks/search` — semantic text search (e.g. "high energy track for a workout").
  - **Search by reference audio clip** — upload a short audio sample and get back tracks that sound similar. This is the direct mechanism for "match this trending sound's vibe" without ever storing or redistributing the trending sound itself: the reference clip is used transiently as a similarity-search input, not persisted or served back to users.
  - **Search by video frame** — upload a frame and get tracks matching the visual mood, useful as a secondary matching signal from the user's own footage.
  - A sound-effects library is included separately.
  - **Access model:** a free developer tier exists for prototyping against the full catalog; a paid commercial tier is required to go live. Authentication is bearer-token based, server-side only.
- **Alternatives to evaluate at commercial-negotiation time** (not yet researched to the same depth): Artlist, Soundstripe, Musicbed — comparable licensed-catalog-with-API models; worth an RFP-style comparison against Epidemic Sound on catalog size, mood/BPM metadata quality, and API terms before committing.

### 4.3 Data flow (concrete)
1. Curator or automated job logs "Sound X is trending on TikTok, mood: high-energy, upbeat pop, ~128 BPM" (from the Creative Center Rising tab).
2. That description becomes the query into Epidemic Sound's `/v0/tracks` (BPM range 120–135, mood=energetic, genre=pop) or, if a short reference clip of the trend is available for transient similarity search, the reference-audio endpoint.
3. The best-matching licensed track's ID and metadata get stored in our audio library, tagged with the trend it corresponds to and the date matched.
4. Nothing about the original trending track — file, waveform, or extracted audio — is stored anywhere in our system.

### 4.4 Refresh cadence
- **Daily:** automated or curator check of the Creative Center Rising tab for new fast-climbing audio.
- **Within 24–48 hours of a new trend being logged:** matching pass against Epidemic Sound to find and store the licensed equivalent — audio trends have a short shelf life (industry reporting puts most sounds peaking 5–14 days after breakout), so matching latency directly affects usefulness.
- **Weekly:** prune matched tracks tied to trends that have peaked/died, to keep the "trending now" shelf actually current.

---

## 5. Sub-System C: B-Roll and Meme Format Repository

### 5.1 B-roll
- **Primary source: Pexels API** — already integrated in the existing pipeline (`PEXELS_API_KEY` is already a configured env var). Confirmed terms: free to use, attribution optional (but appreciated), content may be modified, default rate limit **200 requests/hour and 20,000/month** (higher limits available on request with a demonstrated legitimate use case), and Pexels explicitly prohibits reselling unmodified content or replicating Pexels' own core product. This is fully compatible with using their footage as raw b-roll material inside a composited, edited output.
- **Tier-2 sources to evaluate for scale/quality gaps** once Pexels' catalog depth becomes limiting for a specific niche: Storyblocks, Artgrid, Videvo — paid stock-footage libraries with broader/more premium catalogs. Not yet researched to API-detail depth; worth a proper vendor evaluation (licensing terms, API availability, cost per seat/request) before committing, rather than assuming feature parity with Pexels.

### 5.2 Meme formats
- **Imgflip API** — a real, documented, free-tier API purpose-built for meme *templates* (blank image macros), not copyrighted finished memes:
  - `GET /get_memes` — free, no auth required for read access, returns the ~100 most-captioned blank templates (e.g. "One Does Not Simply"), refreshed by Imgflip based on real usage.
  - `caption_image` — programmatically adds text to a template (requires an Imgflip account).
  - Free tier has no hard rate limit but can be throttled if abused; a **Premium tier ($9.99/mo base + per-request costs)** unlocks searching the full 1M+ template catalog, GIF captioning, watermark-free output, and AI-assisted captioning.
  - **Why this is the compliant version of "meme repository":** these are blank, reusable *formats* — the meme-ness is in the structure (image + caption pattern), not in someone's specific finished, copyrighted post. This is the same "pattern not asset" principle as §3, applied to memes specifically.

### 5.3 Refresh cadence
- B-roll: pulled on-demand per generation (already the case in the existing pipeline) — no separate ingestion cadence needed, since Pexels' catalog is queried live.
- Meme templates: weekly pull of `get_memes` to keep the internal "currently popular formats" list current, since Imgflip's own ranking already reflects recent usage.

---

## 6. Sub-System D: "Recreate This" Application Layer

Ties §3, §4, and §5 together. When a user selects a trending style from the gallery:
1. The system reads that style's stored structural pattern (from §3: hook type, pacing, caption behavior, footage requirements).
2. It reads the style's matched audio profile (from §4) and pulls the current licensed track.
3. It applies the existing editing-engine pipeline (v1 PRD) to the user's own uploaded footage, using the pattern as the editorial plan input instead of (or blended with) the standard auto-cut logic.
4. B-roll or meme-format slots called for by the pattern are filled from §5's repository, matched by the same video-understanding/caption-matching mechanism already planned for v1.
5. Output is the user's own footage, cut and paced like the trend, scored with a legally licensed audio match — never a derivative of the original creator's actual clip.

This reuses the template-first upload flow and footage-requirements-per-template mechanism already specified in the v1 PRD (§10), rather than introducing a second, parallel system.

---

## 7. Sub-System E: Content Coach (Script + Shot List)

**Inputs:** either (a) a chosen trending style's structural pattern, or (b) a free-text brand/topic/product description — user picks which order, per the earlier decision.

**Output:** a shot list (what to film — e.g. "5-second direct-to-camera hook, 10-second product-in-use clip, 3-second reaction cutaway") and an actual script for any spoken parts, generated by an LLM call that takes the structural pattern (beat count, timing, hook style) as a scaffold and the brand/topic as content.

**Two flow orderings, both supported:**
- **Template-first:** pattern → script/shot list built to fit that pattern's beats exactly.
- **Topic-first:** topic → script/shot list generated independently of any specific pattern → system then suggests templates from §3 whose structure best fits the generated script's natural shape (e.g. a script with one long explanatory section suggests a talking-head-style pattern; a script with several short beats suggests a fast-cut multi-clip pattern).

This is a pure LLM/prompt-design problem, not a sourcing problem — no external data dependency beyond what §3–§5 already provide as scaffolding input.

---

## 8. Consolidated Data Model (what actually lives in the database)

| Entity | Key fields | Never stored |
|---|---|---|
| Template/Style record | pattern description (hook/pacing/caption/footage-requirements), source link, category tags, curator score, logged date, status (active/retired) | The source video file |
| Audio profile record | BPM, mood/genre tags, matched licensed track ID (Epidemic Sound), trend source description, matched date, expiry/prune date | The trending audio file itself |
| B-roll reference | Pexels asset ID/URL, tags, last-used date | A locally stored copy beyond normal caching for performance (subject to Pexels' terms) |
| Meme format record | Imgflip template ID, name, box_count, popularity rank, last-refreshed date | Captioned/finished meme images belonging to other creators |

---

## 9. Ingestion Pipeline Architecture

- **Curator dashboard** (internal-only admin tool): trend-logging form (§3.3), audio-matching review queue (shows a logged trend + Epidemic Sound's top candidate matches for human confirmation before it goes live), and a template-health view (flags templates unused/unreviewed past a threshold).
- **Scheduled jobs:** a daily job pings the Epidemic Sound API to re-validate that previously matched tracks are still licensable/available; a weekly job pulls fresh Imgflip `get_memes` data; no scheduled job touches Instagram or TikTok directly — those stay human-curated by design, per §2.
- **No autonomous scraping component anywhere in this architecture** — this is a deliberate, permanent constraint, not a v1-stage limitation to relax later.

---

## 10. Team & Operational Requirements

This phase is **operationally**, not just technically, non-trivial: a human curator function is load-bearing for §3 and part of §4, on an ongoing daily/weekly cadence (§3.4, §4.4). This doesn't disappear once the software ships — it's a standing content-ops role (in-house or contracted), and its output quality directly determines whether "Recreate This" feels current or stale. Sizing this (one part-time curator vs. a small rotating team) is a real staffing decision, not an engineering one — flagged as an open question in §12.

---

## 11. Refresh Cadence Summary

| Source | Cadence | Owner |
|---|---|---|
| Instagram trend logging | Daily light pass, weekly deep review | Human curator |
| TikTok Creative Center (hashtags/format insights) | Daily light pass | Human curator |
| TikTok Creative Center (Rising audio) | Daily | Human curator / semi-automated check |
| Epidemic Sound track matching | Within 24–48h of a new audio trend logged | Automated match + human confirmation |
| Pexels b-roll | Live, per-generation | Automated (existing) |
| Imgflip meme templates | Weekly pull | Automated |
| Template/audio pruning (stale trends) | Weekly | Human curator |
| Category coverage audit | Monthly | Human curator / product |

---

## 12. Vendor/API Summary

| Vendor | Purpose | Access model | Cost signal |
|---|---|---|---|
| Meta oEmbed | Embed real trending Instagram content for display | Tokenless as of June 2026, public | Free |
| TikTok Creative Center | Trend/audio/format discovery (manual browse) | Public dashboard, no official API | Free |
| Epidemic Sound Partner Content API | Licensed audio matched to trend profiles | Bearer-token API, free dev tier | Paid tier required to go live — commercial terms to be negotiated |
| Pexels API | Licensed b-roll footage | API key, free | Free at default limits; higher limits negotiable |
| Imgflip API | Meme format templates | Free tier (`get_memes`) / paid Premium | Free for basics; $9.99/mo+ for full search/no-watermark |
| Storyblocks / Artgrid / Videvo (tier-2 b-roll, not yet deep-researched) | Premium footage catalog depth | TBD | TBD — needs vendor evaluation |

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Curator can't keep pace with trend velocity as library scope grows | Treat curator headcount as a scaling variable tied to library growth, not a fixed one-person job (see §10) |
| TikTok Creative Center changes/removes features Reeltrix depends on (already happened once with its audio trends module in 2026) | Don't hard-depend on any single dashboard's exact feature set; keep the curator workflow source-agnostic enough to swap in a different trend-tracking source |
| Licensed audio catalog doesn't have a good match for a given trend | Curator confirmation step (§9) catches weak matches before they go live rather than auto-publishing an automated match |
| Legal exposure from any future temptation to "just download the reel, it's faster" | This document's constraint (§2) is treated as permanent architecture, not a v1-stage limitation — any future proposal to store third-party media directly should be rejected on sight, not re-litigated per feature |

---

## 14. Build Phases Within Phase 2

1. **2a — Licensed asset infrastructure.** Epidemic Sound and Imgflip integrations, since these are pure API work with no curation dependency and directly extend the already-integrated Pexels pattern.
2. **2b — Curator tooling + template library.** The internal trend-logging dashboard and the first real batch of curated templates — this is the piece that can't be automated away, so it's worth starting the operational process early even while 2a is in progress.
3. **2c — Recreate This.** Wiring the template library + audio matches + b-roll into the existing v1 editing pipeline as an alternate editorial-plan input.
4. **2d — Content Coach.** Pure LLM/prompt work, lowest infrastructure dependency, can be built in parallel with 2b/2c once the pattern data model (§8) is finalized.

---

## 15. Open Questions

- Curator staffing model: in-house hire, contractor, or a rotating responsibility among existing team members — and at what template-library size does that need to change?
- Which licensed-audio vendor wins the Epidemic Sound vs. Artlist vs. Soundstripe comparison, once evaluated on catalog depth and commercial terms rather than API design alone?
- What's the retirement/staleness threshold for a template or audio match before it's automatically flagged for curator review (a fixed day count, a performance-based signal once the "Recreate This" feature has usage data, or both)?
- Should the curator tool eventually support multiple curators with review/approval roles (a "logged" vs. "verified" state), or stay single-operator until volume demands otherwise?