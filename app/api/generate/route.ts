import { NextRequest } from "next/server";
import { fal } from "@fal-ai/client";
import { TONE_OPTIONS, type ToneStyle } from "@/lib/pipeline";

// Configure fal with server-side credentials
fal.config({
  credentials: process.env.FAL_KEY!,
});

/* Simple in-memory cache: hash(imageUrl + hook + tone) → result */
const cache = new Map<string, string>();

function hashInput(imageUrl: string, hookText: string, tone: string): string {
  return `${imageUrl}|${hookText}|${tone}`;
}

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { imageUrl, hookText, tone, existingVideoUrl, existingVoiceoverUrl, existingMusicUrl } = body as {
    imageUrl: string;
    hookText: string;
    tone: ToneStyle;
    existingVideoUrl?: string;
    existingVoiceoverUrl?: string;
    existingMusicUrl?: string;
  };

  if (!imageUrl || !hookText) {
    return new Response(JSON.stringify({ error: "Missing imageUrl or hookText" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cacheKey = hashInput(imageUrl, hookText, tone);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Check cache
        const cached = cache.get(cacheKey);
        if (cached) {
          const cachedResult = JSON.parse(cached);
          sendEvent(controller, encoder, "cached", cachedResult);
          controller.close();
          return;
        }

        const toneConfig = TONE_OPTIONS.find((t) => t.value === tone) || TONE_OPTIONS[0];

        // ==============================
        // Step 1: Image → Video (parallel)
        // ==============================
        const step1Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 1,
          name: "Image → Video",
          modelId: "fal-ai/kling-video/v2.1/standard/image-to-video",
          status: "running",
          startedAt: step1Start,
          inputSummary: `Image + prompt: "${hookText.slice(0, 50)}..."`,
        });

        // ==============================
        // Step 2: TTS Voiceover (parallel)
        // ==============================
        const step2Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 2,
          name: "Voiceover",
          modelId: "fal-ai/elevenlabs/tts/eleven-v3",
          status: "running",
          startedAt: step2Start,
          inputSummary: `Text: "${hookText.slice(0, 80)}"`,
        });

        // ==============================
        // Step 3: Music (parallel)
        // ==============================
        const step3Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 3,
          name: "Music",
          modelId: "fal-ai/minimax-music/v2",
          status: "running",
          startedAt: step3Start,
          inputSummary: `Style: ${toneConfig.label}`,
        });

        // Fire all 3 steps in parallel, using existing output if present
        const [videoResult, ttsResult, musicResult] = await Promise.allSettled([
          // Step 1: Image to Video
          existingVideoUrl
            ? Promise.resolve().then(() => {
                sendEvent(controller, encoder, "step", {
                  step: 1,
                  name: "Image → Video",
                  modelId: "fal-ai/kling-video/v2.1/standard/image-to-video",
                  status: "completed",
                  startedAt: step1Start,
                  completedAt: Date.now(),
                  durationMs: 0,
                  costUsd: 0,
                  resultUrl: existingVideoUrl,
                  inputSummary: "Skipped (Using cached video)",
                });
                return { data: { video: { url: existingVideoUrl } } };
              })
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (fal.subscribe as any)("fal-ai/kling-video/v2.1/standard/image-to-video", {
                input: {
                  prompt: `Cinematic slow motion, ${hookText}. Smooth camera movement, high quality, professional lighting.`,
                  image_url: imageUrl,
                  duration: "5",
                  aspect_ratio: "9:16",
                },
                logs: true,
              })
              .then((result: { data: Record<string, Record<string, string>> }) => {
                const duration = Date.now() - step1Start;
                sendEvent(controller, encoder, "step", {
                  step: 1,
                  name: "Image → Video",
                  modelId: "fal-ai/kling-video/v2.1/standard/image-to-video",
                  status: "completed",
                  startedAt: step1Start,
                  completedAt: Date.now(),
                  durationMs: duration,
                  costUsd: 0.28,
                  resultUrl: (result.data as Record<string, Record<string, string>>)?.video?.url,
                });
                return result;
              })
              .catch((err: Error) => {
                sendEvent(controller, encoder, "step", {
                  step: 1,
                  name: "Image → Video",
                  modelId: "fal-ai/kling-video/v2.1/standard/image-to-video",
                  status: "failed",
                  startedAt: step1Start,
                  completedAt: Date.now(),
                  durationMs: Date.now() - step1Start,
                  error: err.message || "Video generation failed",
                });
                throw err;
              }),

          // Step 2: TTS
          existingVoiceoverUrl
            ? Promise.resolve().then(() => {
                sendEvent(controller, encoder, "step", {
                  step: 2,
                  name: "Voiceover",
                  modelId: "fal-ai/elevenlabs/tts/eleven-v3",
                  status: "completed",
                  startedAt: step2Start,
                  completedAt: Date.now(),
                  durationMs: 0,
                  costUsd: 0,
                  resultUrl: existingVoiceoverUrl,
                  inputSummary: "Skipped (Using cached voiceover)",
                });
                return { data: { audio: { url: existingVoiceoverUrl } } };
              })
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (fal.subscribe as any)("fal-ai/elevenlabs/tts/eleven-v3", {
                input: {
                  text: hookText,
                  voice: "Aria",
                  stability: 0.5,
                  similarity_boost: 0.75,
                  speed: 1,
                },
                logs: true,
              })
              .then((result: { data: Record<string, Record<string, string>> }) => {
                const duration = Date.now() - step2Start;
                const charCount = hookText.length;
                const cost = (charCount / 1000) * 0.1;
                sendEvent(controller, encoder, "step", {
                  step: 2,
                  name: "Voiceover",
                  modelId: "fal-ai/elevenlabs/tts/eleven-v3",
                  status: "completed",
                  startedAt: step2Start,
                  completedAt: Date.now(),
                  durationMs: duration,
                  costUsd: Math.max(cost, 0.01),
                  resultUrl: result.data?.audio?.url,
                });
                return result;
              })
              .catch((err: Error) => {
                sendEvent(controller, encoder, "step", {
                  step: 2,
                  name: "Voiceover",
                  modelId: "fal-ai/elevenlabs/tts/eleven-v3",
                  status: "failed",
                  startedAt: step2Start,
                  completedAt: Date.now(),
                  durationMs: Date.now() - step2Start,
                  error: err.message || "TTS failed",
                });
                throw err;
              }),

          // Step 3: Music
          existingMusicUrl
            ? Promise.resolve().then(() => {
                sendEvent(controller, encoder, "step", {
                  step: 3,
                  name: "Music",
                  modelId: "cassetteai/music-generator",
                  status: "completed",
                  startedAt: step3Start,
                  completedAt: Date.now(),
                  durationMs: 0,
                  costUsd: 0,
                  resultUrl: existingMusicUrl,
                  inputSummary: "Skipped (Using cached music)",
                });
                return { data: { audio_file: { url: existingMusicUrl } } };
              })
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (fal.subscribe as any)("cassetteai/music-generator", {
                input: {
                  prompt: toneConfig.musicPrompt,
                  duration: 30,
                },
                logs: true,
              })
              .then((result: { data: Record<string, any> }) => {
                const duration = Date.now() - step3Start;
                sendEvent(controller, encoder, "step", {
                  step: 3,
                  name: "Music",
                  modelId: "cassetteai/music-generator",
                  status: "completed",
                  startedAt: step3Start,
                  completedAt: Date.now(),
                  durationMs: duration,
                  costUsd: 0.02,
                  resultUrl: result.data?.audio_file?.url || result.data?.audio?.url,
                });
                return result;
              })
              .catch((err: Error) => {
                sendEvent(controller, encoder, "step", {
                  step: 3,
                  name: "Music",
                  modelId: "cassetteai/music-generator",
                  status: "failed",
                  startedAt: step3Start,
                  completedAt: Date.now(),
                  durationMs: Date.now() - step3Start,
                  error: err.message || "Music generation failed",
                });
                throw err;
              }),
        ]);

        // Check which steps succeeded
        const videoOk = videoResult.status === "fulfilled";
        const ttsOk = ttsResult.status === "fulfilled";
        const musicOk = musicResult.status === "fulfilled";

        const videoUrl = videoOk
          ? (videoResult.value.data as Record<string, Record<string, string>>)?.video?.url
          : null;
        const voiceoverUrl = ttsOk
          ? (ttsResult.value.data as Record<string, Record<string, string>>)?.audio?.url
          : null;
        const musicUrl = musicOk
          ? (musicResult.value.data as any)?.audio_file?.url || (musicResult.value.data as any)?.audio?.url
          : null;

        // If video failed, we can't compose
        if (!videoOk || !videoUrl) {
          sendEvent(controller, encoder, "pipeline_error", {
            message: "Video generation failed — cannot compose final reel.",
            failedSteps: [1],
          });
          controller.close();
          return;
        }

        // ==============================
        // Step 4: Composition
        // ==============================
        const step4Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 4,
          name: "Compose",
          modelId: "fal-ai/ffmpeg-api/merge-audio-video",
          status: "running",
          startedAt: step4Start,
          inputSummary: `Merging ${[videoOk && "video", ttsOk && "voiceover", musicOk && "music"].filter(Boolean).join(" + ")}`,
        });

        try {
          // Build audio inputs for merge
          const audioUrls: string[] = [];
          if (voiceoverUrl) audioUrls.push(voiceoverUrl);
          if (musicUrl) audioUrls.push(musicUrl);

          let finalUrl = videoUrl; // Default to just video if no audio

          if (audioUrls.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const composeResult = await (fal.subscribe as any)(
              "fal-ai/ffmpeg-api/merge-audio-video",
              {
                input: {
                  video_url: videoUrl,
                  audio_url: voiceoverUrl || musicUrl,
                },
                logs: true,
              }
            );

            finalUrl =
              (composeResult as { data: Record<string, Record<string, string>> })?.data?.video?.url ||
              videoUrl;
          }

          const step4Duration = Date.now() - step4Start;
          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Compose",
            modelId: "fal-ai/ffmpeg-api/merge-audio-video",
            status: "completed",
            startedAt: step4Start,
            completedAt: Date.now(),
            durationMs: step4Duration,
            costUsd: 0.01,
            resultUrl: finalUrl,
          });

          // Send final result
          const pipelineResult = {
            videoUrl,
            voiceoverUrl,
            musicUrl,
            finalUrl,
          };

          sendEvent(controller, encoder, "complete", pipelineResult);

          // Cache the result
          cache.set(cacheKey, JSON.stringify(pipelineResult));
        } catch (err) {
          const error = err as Error;
          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Compose",
            modelId: "fal-ai/ffmpeg-api/merge-audio-video",
            status: "failed",
            startedAt: step4Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step4Start,
            error: error.message || "Composition failed",
          });

          // Still provide video-only result
          sendEvent(controller, encoder, "complete", {
            videoUrl,
            voiceoverUrl,
            musicUrl,
            finalUrl: videoUrl,
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
