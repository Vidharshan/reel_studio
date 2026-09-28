import { NextRequest } from "next/server";
import { fal } from "@fal-ai/client";
import fs from "fs";
import path from "path";
import { TONE_OPTIONS } from "@/lib/pipeline";
import type {
  Segment,
  EditPlan,
  BrollPlacement,
  BrandKit,
} from "@/lib/v1-pipeline";
import {
  trimVideo,
  mergeVideos,
  overlayBrolls,
  mergeAudioWithVideo,
  burnCaptions,
  cleanup,
  fileToBlob,
  type CaptionEntry,
  type BrollOverlay,
} from "@/lib/ffmpeg-local";
import {
  classifyFootage,
  filterTemplateCompatibility,
  selectBrollCandidate,
  confirmTrendingAudioMatch,
  scoreFillerSegment,
  rankTemplateSuggestions,
} from "@/lib/jev-decision";

fal.config({ credentials: process.env.FAL_KEY! });

/**
 * Resolves local tusd upload URLs (http://localhost:1080/files/...) to public fal storage URLs
 * so fal.ai cloud inference models never fail with 422 Unprocessable Entity non-routable errors!
 */
async function ensurePublicFalUrl(url: string): Promise<string> {
  if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0")) {
    const fileId = url.split("/").pop();
    if (fileId) {
      const localPath = path.join(process.cwd(), "uploads", fileId);
      if (fs.existsSync(localPath)) {
        console.log(`[reeltrix] Resolving local upload (${localPath}) to fal storage for cloud model...`);
        const blob = fileToBlob(localPath);
        return await fal.storage.upload(blob);
      }
    }
  }
  return url;
}

/* ---- SSE helpers ---- */
function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: string,
  data: Record<string, unknown>
) {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

let idCounter = 0;
function segId(): string {
  return `seg_${Date.now()}_${++idCounter}`;
}

/* ---- Filler-word detection patterns ---- */
const FILLER_PATTERNS =
  /\b(um|uh|uhh|umm|hmm|hmm+|er|err|erm|like|you know|i mean|basically|so+|right|okay so)\b/i;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    fileUrls,
    hookText,
    tone = "cinematic",
    videoSpeed = 1.0,
    brandKit,
    // Resume support
    existingSegments,
    existingEditPlan,
    existingVoiceoverUrl,
    existingMusicUrl,
  } = body as {
    fileUrls: { url: string; type: "video" | "image"; name: string }[];
    hookText: string;
    tone?: string;
    videoSpeed?: number;
    brandKit?: BrandKit;
    existingSegments?: Segment[];
    existingEditPlan?: EditPlan;
    existingVoiceoverUrl?: string;
    existingMusicUrl?: string;
  };

  if (!fileUrls || fileUrls.length === 0) {
    return new Response(JSON.stringify({ error: "No files uploaded" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const toneConfig =
    TONE_OPTIONS.find((t) => t.value === tone) || TONE_OPTIONS[0];
  const videoFiles = fileUrls.filter((f) => f.type === "video");
  const imageFiles = fileUrls.filter((f) => f.type === "image");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Jev Decision 1: Classify uploaded footage
        const classified = await classifyFootage(fileUrls);
        console.log(`[reeltrix] Jev Footage Classification: ${classified.choice} (confidence: ${classified.confidence})`);

        // ============================================================
        // STEP 1: Transcribe & Detect Filler
        // ============================================================
        const step1Start = Date.now();
        let segments: Segment[] = [];

        if (existingSegments && existingSegments.length > 0) {
          segments = existingSegments;
          sendEvent(controller, encoder, "step", {
            step: 1,
            name: "Transcribe & Detect",
            modelId: "fal-ai/whisper",
            status: "completed",
            startedAt: step1Start,
            completedAt: Date.now(),
            durationMs: 0,
            costUsd: 0,
            segments,
            inputSummary: "Skipped (cached transcription)",
          });
        } else if (videoFiles.length > 0) {
          sendEvent(controller, encoder, "step", {
            step: 1,
            name: "Transcribe & Detect",
            modelId: "fal-ai/whisper",
            status: "running",
            startedAt: step1Start,
            inputSummary: `Transcribing ${videoFiles.length} video(s)...`,
          });

          // Transcribe each video file via fal Whisper
          for (let i = 0; i < videoFiles.length; i++) {
            const file = videoFiles[i];

            sendEvent(controller, encoder, "step", {
              step: 1,
              name: "Transcribe & Detect",
              modelId: "fal-ai/whisper",
              status: "running",
              startedAt: step1Start,
              inputSummary: `Transcribing clip ${i + 1}/${videoFiles.length}: ${file.name}`,
            });

            try {
              const publicAudioUrl = await ensurePublicFalUrl(file.url);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const whisperResult = await (fal.subscribe as any)(
                "fal-ai/whisper",
                {
                  input: {
                    audio_url: publicAudioUrl,
                    task: "transcribe",
                    chunk_level: "word",
                    version: "3",
                  },
                  logs: true,
                }
              );

              const chunks =
                whisperResult.data?.chunks ||
                whisperResult.data?.prediction?.chunks ||
                [];

              // Build segments from word-level timestamps with filler detection
              let currentSegStart = 0;
              let currentWords: string[] = [];
              let lastEnd = 0;
              const SILENCE_THRESHOLD = 0.4; // 400ms gap = silence

              for (const chunk of chunks) {
                const text = (chunk.text || "").trim();
                const timestamp = chunk.timestamp || [0, 0];
                const start =
                  typeof timestamp[0] === "number" ? timestamp[0] : 0;
                const end =
                  typeof timestamp[1] === "number" ? timestamp[1] : start + 0.5;

                if (!text) continue;

                // Check for silence gap
                if (
                  currentWords.length > 0 &&
                  start - lastEnd > SILENCE_THRESHOLD
                ) {
                  // Close current segment
                  const fullText = currentWords.join(" ");
                  const isFiller = FILLER_PATTERNS.test(fullText);
                  segments.push({
                    id: segId(),
                    sourceClipIndex: i,
                    startSec: currentSegStart,
                    endSec: lastEnd,
                    transcript: fullText,
                    isFiller,
                    isKept: !isFiller,
                    cutReason: isFiller ? "filler_word" : undefined,
                  });
                  currentWords = [];
                  currentSegStart = start;
                }

                if (currentWords.length === 0) {
                  currentSegStart = start;
                }
                currentWords.push(text);
                lastEnd = end;
              }

              // Close final segment
              if (currentWords.length > 0) {
                const fullText = currentWords.join(" ");
                const isFiller = FILLER_PATTERNS.test(fullText);
                segments.push({
                  id: segId(),
                  sourceClipIndex: i,
                  startSec: currentSegStart,
                  endSec: lastEnd,
                  transcript: fullText,
                  isFiller,
                  isKept: !isFiller,
                  cutReason: isFiller ? "filler_word" : undefined,
                });
              }

              // If no word-level chunks, create one big segment per clip
              if (
                chunks.length === 0 &&
                whisperResult.data?.text
              ) {
                segments.push({
                  id: segId(),
                  sourceClipIndex: i,
                  startSec: 0,
                  endSec: 30,
                  transcript: whisperResult.data.text,
                  isFiller: false,
                  isKept: true,
                });
              }
            } catch (err) {
              console.error(
                `Whisper transcription failed for clip ${i}:`,
                err
              );
              // Create a placeholder segment so pipeline doesn't break
              segments.push({
                id: segId(),
                sourceClipIndex: i,
                startSec: 0,
                endSec: 30,
                transcript: "[transcription unavailable]",
                isFiller: false,
                isKept: true,
              });
            }
          }

          // Jev Decision 5: Score filler segments using Jev
          for (const seg of segments) {
            if (seg.isFiller) continue;
            const duration = seg.endSec - seg.startSec;
            const jevScore = await scoreFillerSegment({
              id: seg.id,
              transcript: seg.transcript,
              durationSec: duration,
              silenceRatio: 0.1,
            });
            if (jevScore.shouldCut || jevScore.cutScore > 0.7) {
              seg.isFiller = true;
              seg.isKept = false;
              seg.cutReason = "filler_word";
            }
          }

          // Detect silence-only segments & repeated takes
          const seen = new Map<string, string>();
          for (const seg of segments) {
            const normalized = seg.transcript
              .toLowerCase()
              .replace(/[^\w\s]/g, "")
              .trim();
            if (normalized.length < 5) continue;

            if (seen.has(normalized)) {
              // This is a repeat — mark the first one as kept, this one as filler
              seg.isFiller = true;
              seg.isKept = false;
              seg.cutReason = "repeat";
            } else {
              seen.set(normalized, seg.id);
            }
          }

          const fillerCount = segments.filter((s) => s.isFiller).length;
          const keptCount = segments.filter((s) => s.isKept).length;

          sendEvent(controller, encoder, "step", {
            step: 1,
            name: "Transcribe & Detect",
            modelId: "fal-ai/whisper",
            status: "completed",
            startedAt: step1Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step1Start,
            costUsd: videoFiles.length * 0.005,
            segments,
            inputSummary: `Found ${segments.length} segments. ${fillerCount} filler, ${keptCount} usable.`,
          });
        } else {
          // Image-only upload — no transcription needed
          sendEvent(controller, encoder, "step", {
            step: 1,
            name: "Transcribe & Detect",
            modelId: "fal-ai/whisper",
            status: "completed",
            startedAt: step1Start,
            completedAt: Date.now(),
            durationMs: 0,
            costUsd: 0,
            segments: [],
            inputSummary: "Image-only upload — no transcription needed",
          });
        }

        // Emit pre-flight checkpoint — client can pause here to let user review segments
        sendEvent(controller, encoder, "preflight", {
          segments,
          message:
            "Segment detection complete. Review cuts before proceeding.",
        });

        // ============================================================
        // STEP 2: Auto-Cut / Edit Plan (LLM)
        // ============================================================
        const step2Start = Date.now();
        let editPlan: EditPlan;

        if (existingEditPlan) {
          editPlan = existingEditPlan;
          sendEvent(controller, encoder, "step", {
            step: 2,
            name: "Auto-Cut",
            modelId: "gemini-2.5-flash",
            status: "completed",
            startedAt: step2Start,
            completedAt: Date.now(),
            durationMs: 0,
            costUsd: 0,
            editPlan,
            inputSummary: "Skipped (cached edit plan)",
          });
        } else {
          sendEvent(controller, encoder, "step", {
            step: 2,
            name: "Auto-Cut",
            modelId: "gemini-2.5-flash",
            status: "running",
            startedAt: step2Start,
            inputSummary: "Building editorial structure from usable segments...",
          });

          const keptSegments = segments.filter((s) => s.isKept);
          const transcriptSummary = keptSegments
            .map(
              (s, i) =>
                `[${i}] id="${s.id}" (${s.startSec.toFixed(1)}s-${s.endSec.toFixed(1)}s): "${s.transcript}"`
            )
            .join("\n");

          const planPrompt = `You are an expert short-form video editor for brands.

Here are the usable segments from a raw talking-head video (filler/silence already removed):
${transcriptSummary}

The user's hook/script goal: "${hookText || "Create an engaging reel"}"
Style/tone: ${toneConfig.label}

Tasks:
1. Order these segments into the most engaging sequence for a 9:16 reel (hook → body → CTA structure).
2. Write caption text for each segment (2-4 words per caption screen, with highlight words).
3. Suggest 1-3 b-roll insertions: identify points where a visual cutaway would boost engagement.
   For each, provide a stock video search query and duration.
4. Calculate total duration.

Return STRICTLY a raw JSON object, no markdown, no backticks:
{
  "orderedSegmentIds": ["seg_id1", "seg_id2", ...],
  "captionBlocks": [
    {"segmentId": "seg_id1", "text": "Two to four words", "startSec": 0.0, "endSec": 1.5, "highlightWords": ["word"]}
  ],
  "brollSuggestions": [
    {"afterSegmentId": "seg_id1", "query": "stock footage search term", "durationSec": 2.0, "reason": "why this b-roll fits"}
  ],
  "totalDurationSec": 15.0
}`;

          // Default fallback plan
          editPlan = {
            orderedSegmentIds: keptSegments.map((s) => s.id),
            captionBlocks: keptSegments.map((s, i) => ({
              segmentId: s.id,
              text: s.transcript.split(" ").slice(0, 4).join(" "),
              startSec: i * 3,
              endSec: i * 3 + 3,
              highlightWords: [s.transcript.split(" ")[0]],
            })),
            brollSuggestions: [],
            totalDurationSec: keptSegments.reduce(
              (sum, s) => sum + (s.endSec - s.startSec),
              0
            ),
          };

          try {
            const llmResponse = await fetch(
              "https://fal.run/openrouter/router/openai/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Key ${process.env.FAL_KEY}`,
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: [
                    {
                      role: "system",
                      content:
                        "You are a professional video editor. Output only raw JSON, no markdown.",
                    },
                    { role: "user", content: planPrompt },
                  ],
                  temperature: 0.3,
                }),
              }
            );

            if (llmResponse.ok) {
              const llmData = await llmResponse.json();
              const rawText =
                llmData.choices?.[0]?.message?.content?.trim() || "";
              const cleanedJson = rawText
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
              const parsed = JSON.parse(cleanedJson);
              editPlan = {
                orderedSegmentIds:
                  parsed.orderedSegmentIds || editPlan.orderedSegmentIds,
                captionBlocks:
                  parsed.captionBlocks || editPlan.captionBlocks,
                brollSuggestions:
                  parsed.brollSuggestions || editPlan.brollSuggestions,
                totalDurationSec:
                  parsed.totalDurationSec || editPlan.totalDurationSec,
              };
            }
          } catch (err) {
            console.error("LLM Edit Plan failed, using fallback:", err);
          }

          sendEvent(controller, encoder, "step", {
            step: 2,
            name: "Auto-Cut",
            modelId: "gemini-2.5-flash",
            status: "completed",
            startedAt: step2Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step2Start,
            costUsd: 0.002,
            editPlan,
            inputSummary: `Ordered ${editPlan.orderedSegmentIds.length} segments, ${editPlan.brollSuggestions.length} b-roll suggestions, ~${editPlan.totalDurationSec.toFixed(0)}s total`,
          });
        }

        // ============================================================
        // STEP 3: B-Roll Matching
        // ============================================================
        const step3Start = Date.now();
        const brollPlacements: BrollPlacement[] = [];

        if (
          editPlan.brollSuggestions &&
          editPlan.brollSuggestions.length > 0
        ) {
          sendEvent(controller, encoder, "step", {
            step: 3,
            name: "B-Roll Match",
            modelId: "fal-ai/florence-2-large",
            status: "running",
            startedAt: step3Start,
            inputSummary: `Searching ${editPlan.brollSuggestions.length} b-roll clips...`,
          });

          // Search Pexels for each b-roll suggestion
          for (const suggestion of editPlan.brollSuggestions) {
            try {
              const pexelsKey = process.env.PEXELS_API_KEY;
              if (!pexelsKey) {
                console.warn("No PEXELS_API_KEY, skipping b-roll search");
                continue;
              }

              const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(suggestion.query)}&per_page=3&orientation=portrait`;
              const pexelsRes = await fetch(searchUrl, {
                headers: { Authorization: pexelsKey },
              });

              if (pexelsRes.ok) {
                const pexelsData = await pexelsRes.json();
                const videos = pexelsData.videos || [];
                if (videos.length > 0) {
                  // Format candidates for Jev decision model
                  const candidates = videos.map((v: { id: number; url: string; video_files: { width: number; link: string }[] }, idx: number) => ({
                    id: String(v.id || idx),
                    query: suggestion.query,
                    caption: `Vertical stock video clip ${idx + 1} for ${suggestion.query}`,
                    link: (v.video_files?.find((vf) => vf.width && vf.width <= 1080) || v.video_files?.[0])?.link,
                  })).filter((c: { link?: string }) => c.link);

                  // Jev Decision 3: Pick the best B-roll candidate
                  const jevChoice = await selectBrollCandidate(suggestion.reason || suggestion.query, candidates);
                  const chosen = candidates.find((c: { id: string }) => c.id === jevChoice.selectedId) || candidates[0];

                  if (chosen?.link) {
                    brollPlacements.push({
                      afterSegmentId: suggestion.afterSegmentId,
                      url: chosen.link,
                      query: suggestion.query,
                      durationSec: suggestion.durationSec,
                    });
                  }
                }
              }
            } catch (err) {
              console.error(
                `B-roll search failed for "${suggestion.query}":`,
                err
              );
            }
          }

          sendEvent(controller, encoder, "step", {
            step: 3,
            name: "B-Roll Match",
            modelId: "fal-ai/florence-2-large",
            status: "completed",
            startedAt: step3Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step3Start,
            costUsd: 0.005,
            brollPlacements,
            inputSummary: `Found ${brollPlacements.length}/${editPlan.brollSuggestions.length} b-roll clips`,
          });
        } else {
          sendEvent(controller, encoder, "step", {
            step: 3,
            name: "B-Roll Match",
            modelId: "fal-ai/florence-2-large",
            status: "completed",
            startedAt: step3Start,
            completedAt: Date.now(),
            durationMs: 0,
            costUsd: 0,
            brollPlacements: [],
            inputSummary: "No b-roll suggestions from edit plan",
          });
        }

        // ============================================================
        // STEP 4: Trim & Stitch — LOCAL FFMPEG (free, no API cost)
        // ============================================================
        const step4Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 4,
          name: "Trim & Stitch",
          modelId: "local/ffmpeg",
          status: "running",
          startedAt: step4Start,
          inputSummary: "Trimming kept segments locally via FFmpeg...",
        });

        const keptSegments = segments.filter((s) => s.isKept);
        const orderedSegs = editPlan.orderedSegmentIds
          .map((id) => keptSegments.find((s) => s.id === id))
          .filter(Boolean) as Segment[];
        const segsToRender =
          orderedSegs.length > 0 ? orderedSegs : keptSegments;

        // 1. Trim each kept talking-head segment
        const trimmedFilePaths: string[] = [];
        const brollOverlaysToApply: BrollOverlay[] = [];
        let timelineCursor = 0;

        for (let i = 0; i < segsToRender.length; i++) {
          const seg = segsToRender[i];
          const clipUrl = videoFiles[seg.sourceClipIndex]?.url;
          if (!clipUrl) continue;

          const rawDuration = seg.endSec - seg.startSec;
          const effectiveSpeed = seg.speed || videoSpeed || 1.0;
          const effectiveDuration = rawDuration / effectiveSpeed;

          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Trim & Stitch",
            modelId: "local/ffmpeg",
            status: "running",
            startedAt: step4Start,
            inputSummary: `Trimming segment ${i + 1}/${segsToRender.length}: ${seg.startSec.toFixed(1)}s–${seg.endSec.toFixed(1)}s (${effectiveSpeed}x speed)`,
          });

          try {
            const trimmedPath = await trimVideo(clipUrl, seg.startSec, seg.endSec, effectiveSpeed);
            trimmedFilePaths.push(trimmedPath);

            // If a B-roll is placed after this segment, queue it as a PiP overlay!
            const broll = brollPlacements.find(
              (b) => b.afterSegmentId === seg.id
            );
            if (broll?.url) {
              brollOverlaysToApply.push({
                brollUrl: broll.url,
                startSec: Math.max(0, timelineCursor + effectiveDuration - Math.min(1.5, effectiveDuration / 2)),
                durationSec: Math.min(broll.durationSec || 3, effectiveDuration),
              });
            }

            timelineCursor += effectiveDuration;
          } catch (trimErr) {
            console.error(`Trim failed for segment ${i}:`, trimErr);
          }
        }

        // For image-only uploads, still use fal for AI video generation
        if (trimmedFilePaths.length === 0 && imageFiles.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imgVideoResult = await (fal.subscribe as any)(
            "fal-ai/kling-video/v2.1/standard/image-to-video",
            {
              input: {
                prompt: `Cinematic slow motion, ${hookText}. Smooth camera movement.`,
                image_url: imageFiles[0].url,
                duration: "5",
                aspect_ratio: "9:16",
              },
              logs: true,
            }
          );
          const imgVideoUrl =
            (imgVideoResult as { data: Record<string, Record<string, string>> })
              ?.data?.video?.url;
          if (imgVideoUrl) {
            const imgPath = await trimVideo(imgVideoUrl, 0, 5);
            trimmedFilePaths.push(imgPath);
          }
        }

        if (trimmedFilePaths.length === 0) {
          throw new Error("No trimmed clips available for stitching");
        }

        // 2. Stitch all talking-head clips into the continuous main timeline
        sendEvent(controller, encoder, "step", {
          step: 4,
          name: "Trim & Stitch",
          modelId: "local/ffmpeg",
          status: "running",
          startedAt: step4Start,
          inputSummary: `Merging ${trimmedFilePaths.length} talking-head segments...`,
        });

        const rawStitchedPath = await mergeVideos(trimmedFilePaths);

        // 3. Apply B-roll embeds on top of main talking head video
        let stitchedPath = rawStitchedPath;
        if (brollOverlaysToApply.length > 0) {
          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Trim & Stitch",
            modelId: "local/ffmpeg",
            status: "running",
            startedAt: step4Start,
            inputSummary: `Embedding ${brollOverlaysToApply.length} B-roll overlays on top of video...`,
          });
          stitchedPath = await overlayBrolls(rawStitchedPath, brollOverlaysToApply);
        }

        // Clean up intermediate segment clips
        for (const p of trimmedFilePaths) {
          if (p !== stitchedPath && p !== rawStitchedPath) cleanup(p);
        }

        sendEvent(controller, encoder, "step", {
          step: 4,
          name: "Trim & Stitch",
          modelId: "local/ffmpeg",
          status: "completed",
          startedAt: step4Start,
          completedAt: Date.now(),
          durationMs: Date.now() - step4Start,
          costUsd: 0,
          inputSummary: `Stitched ${segsToRender.length} segments with ${brollOverlaysToApply.length} PiP B-rolls overlayed`,
        });

        // ---- Burn captions into the stitched video ----
        // Build caption entries with timestamps relative to stitched output
        const captionEntries: CaptionEntry[] = [];
        let captionCursor = 0;

        for (const seg of segsToRender) {
          const segDuration = (seg.endSec - seg.startSec) / videoSpeed;

          // Use LLM-generated caption if available, otherwise use transcript
          const captionBlock = editPlan.captionBlocks?.find(
            (c) => c.segmentId === seg.id
          );

          // Split transcript into short caption chunks (3-5 words each)
          const words = seg.transcript.split(/\s+/);
          const chunkSize = 4;
          for (let w = 0; w < words.length; w += chunkSize) {
            const chunk = words.slice(w, w + chunkSize).join(" ");
            const chunkFraction = w / Math.max(words.length, 1);
            const chunkStart = captionCursor + chunkFraction * segDuration;
            const nextFraction = Math.min((w + chunkSize) / Math.max(words.length, 1), 1);
            const chunkEnd = captionCursor + nextFraction * segDuration;

            captionEntries.push({
              text: chunk,
              startSec: chunkStart,
              endSec: chunkEnd,
              highlightWords: captionBlock?.highlightWords,
            });
          }

          captionCursor += segDuration;
        }

        // Burn captions into stitched video
        let captionedPath = stitchedPath;
        if (captionEntries.length > 0) {
          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Trim & Stitch",
            modelId: "local/ffmpeg",
            status: "running",
            startedAt: step4Start,
            inputSummary: `Burning ${captionEntries.length} captions into video...`,
          });

          try {
            captionedPath = await burnCaptions(stitchedPath, captionEntries);
            // Clean the un-captioned stitched file
            if (captionedPath !== stitchedPath) cleanup(stitchedPath);
          } catch (capErr) {
            console.error("Caption burn failed, continuing without:", capErr);
            captionedPath = stitchedPath;
          }
        }

        // Upload the captioned result to fal storage
        const captionedBlob = fileToBlob(captionedPath);
        const stitchedUrl = await fal.storage.upload(captionedBlob);

        // ============================================================
        // STEP 5: Add Background Music — local FFmpeg mix
        // ============================================================
        const step5Start = Date.now();
        let finalUrl = stitchedUrl;
        let musicUrl: string | null = null;

        sendEvent(controller, encoder, "step", {
          step: 5,
          name: "Compose",
          modelId: "cassetteai + local/ffmpeg",
          status: "running",
          startedAt: step5Start,
          inputSummary: "Generating background music & mixing locally...",
        });

        try {
          // Generate background music (this is AI — still needs fal)
          if (!existingMusicUrl) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const musicResult = await (fal.subscribe as any)(
                "cassetteai/music-generator",
                {
                  input: {
                    prompt: toneConfig.musicPrompt,
                    duration: 30,
                  },
                  logs: true,
                }
              );
              musicUrl =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (musicResult as any).data?.audio_file?.url ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (musicResult as any).data?.audio?.url;
            } catch (musicErr) {
              console.error("Music generation failed:", musicErr);
            }
          } else {
            musicUrl = existingMusicUrl;
          }

          // Mix music into the captioned video locally
          if (musicUrl) {
            sendEvent(controller, encoder, "step", {
              step: 5,
              name: "Compose",
              modelId: "local/ffmpeg",
              status: "running",
              startedAt: step5Start,
              inputSummary: "Mixing background music at 15% volume...",
            });

            try {
              const mixedPath = await mergeAudioWithVideo(
                captionedPath,
                musicUrl,
                0.15
              );
              const mixedBlob = fileToBlob(mixedPath);
              finalUrl = await fal.storage.upload(mixedBlob);
              cleanup(mixedPath);
            } catch (mixErr) {
              console.error("Audio mix failed, using video without music:", mixErr);
            }
          }

          // Clean up captioned temp file
          cleanup(captionedPath);

          sendEvent(controller, encoder, "step", {
            step: 5,
            name: "Compose",
            modelId: "local/ffmpeg",
            status: "completed",
            startedAt: step5Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step5Start,
            costUsd: musicUrl ? 0.02 : 0,
            resultUrl: finalUrl,
            inputSummary: musicUrl
              ? "Original voice + background music (mixed locally)"
              : "Original voice only (no music)",
          });

          sendEvent(controller, encoder, "complete", {
            finalUrl,
            musicUrl,
            segments,
            editPlan,
            brollPlacements,
            trimmedClipCount: trimmedFilePaths.length,
          });
        } catch (err) {
          const error = err as Error;
          cleanup(stitchedPath);
          sendEvent(controller, encoder, "step", {
            step: 5,
            name: "Compose",
            modelId: "local/ffmpeg",
            status: "failed",
            startedAt: step5Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step5Start,
            error: error.message || "Composition failed",
          });

          sendEvent(controller, encoder, "complete", {
            finalUrl: stitchedUrl,
            musicUrl,
            segments,
            editPlan,
            brollPlacements,
            partial: true,
          });
        }
      } catch (err) {
        const error = err as Error;
        sendEvent(controller, encoder, "pipeline_error", {
          message: error.message || "Pipeline failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
