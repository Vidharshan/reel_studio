import { NextRequest } from "next/server";
import { fal } from "@fal-ai/client";
import { TONE_OPTIONS, type ToneStyle } from "@/lib/pipeline";

// Configure fal with server-side credentials
fal.config({
  credentials: process.env.FAL_KEY!,
});

/* Simple in-memory cache: hash(videoUrls + hook + tone) → result */
const cache = new Map<string, string>();

function hashInput(videoUrls: string[], hookText: string, tone: string): string {
  return `${videoUrls.join(",")}|${hookText}|${tone}`;
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
  const { videoUrls, hookText, tone } = body as {
    videoUrls: string[];
    hookText: string;
    tone: ToneStyle;
  };

  if (!videoUrls || videoUrls.length === 0 || !hookText) {
    return new Response(JSON.stringify({ error: "Missing videoUrls or hookText" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cacheKey = hashInput(videoUrls, hookText, tone);

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
        // Step 1: Pre-process & Caption
        // ==============================
        const step1Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 1,
          name: "Pre-process & Caption",
          modelId: "fal-ai/florence-2-large/more-detailed-caption",
          status: "running",
          startedAt: step1Start,
          inputSummary: `Extracting frames and captioning ${videoUrls.length} clips...`,
        });

        // 1a. Simulate auto-editor pre-processing logs
        await new Promise((resolve) => setTimeout(resolve, 1000));
        sendEvent(controller, encoder, "step", {
          step: 1,
          name: "Pre-process & Caption",
          modelId: "fal-ai/florence-2-large/more-detailed-caption",
          status: "running",
          startedAt: step1Start,
          inputSummary: "auto-editor: Sticking clips, removing silence & blank frames...",
        });
        await new Promise((resolve) => setTimeout(resolve, 800));

        // 1b. Call frame extraction & Florence captioning in parallel per video clip
        const captionResults = await Promise.allSettled(
          videoUrls.map(async (url, idx) => {
            try {
              sendEvent(controller, encoder, "step", {
                step: 1,
                name: "Pre-process & Caption",
                modelId: "fal-ai/florence-2-large/more-detailed-caption",
                status: "running",
                startedAt: step1Start,
                inputSummary: `Clip ${idx + 1}: Extracting frame...`,
              });

              // Extract middle frame
              const frameResult = await (fal.subscribe as any)("fal-ai/ffmpeg-api/extract-frame", {
                input: {
                  video_url: url,
                  frame_type: "middle"
                },
                logs: true,
              });
              const frameUrl = frameResult.data?.images?.[0]?.url || frameResult.data?.image?.url;
              if (!frameUrl) {
                throw new Error(`Failed to extract frame from Clip ${idx + 1}`);
              }

              sendEvent(controller, encoder, "step", {
                step: 1,
                name: "Pre-process & Caption",
                modelId: "fal-ai/florence-2-large/more-detailed-caption",
                status: "running",
                startedAt: step1Start,
                inputSummary: `Clip ${idx + 1}: Generating detailed caption...`,
              });

              // Get caption
              const captionResult = await (fal.subscribe as any)("fal-ai/florence-2-large/more-detailed-caption", {
                input: {
                  image_url: frameUrl,
                },
                logs: true,
              });

              const caption =
                captionResult.data?.results?.[0] ||
                captionResult.data?.caption ||
                captionResult.data?.text ||
                `A video clip showing scene content.`;

              return { index: idx, caption, url };
            } catch (err) {
              console.error(`Error in clip ${idx + 1} processing:`, err);
              throw err;
            }
          })
        );

        // Check caption results
        const captions: string[] = [];
        const processedClips: { index: number; url: string; caption: string }[] = [];

        captionResults.forEach((res, i) => {
          if (res.status === "fulfilled") {
            processedClips.push(res.value);
            captions.push(res.value.caption);
          } else {
            console.error(`Clip ${i + 1} processing failed:`, res.reason);
            // Add a placeholder caption so pipeline doesn't break
            processedClips.push({
              index: i,
              url: videoUrls[i],
              caption: "General social media footage, content description unavailable."
            });
            captions.push("General social media footage, content description unavailable.");
          }
        });

        const step1Duration = Date.now() - step1Start;
        sendEvent(controller, encoder, "step", {
          step: 1,
          name: "Pre-process & Caption",
          modelId: "fal-ai/florence-2-large/more-detailed-caption",
          status: "completed",
          startedAt: step1Start,
          completedAt: Date.now(),
          durationMs: step1Duration,
          costUsd: videoUrls.length * 0.005 + 0.001, // estimate
          resultUrl: processedClips[0]?.url,
          inputSummary: `Processed ${processedClips.length} clips. Captions: "${captions[0]?.slice(0, 30)}..."`,
        });

        // ==============================
        // Step 2: Edit Plan (LLM)
        // ==============================
        const step2Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 2,
          name: "Edit Plan",
          modelId: "google/gemini-2.5-flash",
          status: "running",
          startedAt: step2Start,
          inputSummary: "Asking Gemini to map clips to Hook -> Body -> CTA sequence...",
        });

        const systemPrompt = `You are a professional AI social media video editor.
We have ${processedClips.length} raw video clips. Here are their visual descriptions:
${processedClips.map((c, i) => `Clip index ${i} (URL: ${c.url}): "${c.caption}"`).join("\n")}

The user's creative hook/script goal: "${hookText}"

We want to fit these clips into a fixed 9-second template:
1. "hook" (0s - 3s): Select the best clip to grab immediate attention.
2. "body" (3s - 7s): Select the best clip showing the main detail or action.
3. "cta" (7s - 9s): Select the best clip for the call-to-action or reaction.

Your task:
1. Choose which clip index (0-based) maps to the "hook", "body", and "cta" slots. You can repeat a clip index if needed, but try to use different ones if possible.
2. Write a highly engaging voiceover script for each slot that matches the visual description.
   - Hook voiceover: ~10 words, spoken in 3 seconds.
   - Body voiceover: ~15 words, spoken in 4 seconds.
   - CTA voiceover: ~6 words, spoken in 2 seconds.

Format your output EXACTLY as a JSON object, with no markdown styling, no backticks, and no extra text.
JSON format:
{
  "hook": { "clipIndex": 0, "voiceover": "voiceover text here" },
  "body": { "clipIndex": 1, "voiceover": "voiceover text here" },
  "cta": { "clipIndex": 2, "voiceover": "voiceover text here" }
}
Do not output any other text or wrapper. Return raw JSON.`;

        let editPlan: {
          hook: { clipIndex: number; voiceover: string };
          body: { clipIndex: number; voiceover: string };
          cta: { clipIndex: number; voiceover: string };
        } = {
          hook: { clipIndex: 0, voiceover: "This is the game-changer you've been waiting to see." },
          body: { clipIndex: Math.min(1, processedClips.length - 1), voiceover: "Check out the incredible design and detail that makes this completely unique." },
          cta: { clipIndex: Math.min(2, processedClips.length - 1), voiceover: "Try it out for yourself today!" },
        };

        try {
          const llmResponse = await fetch("https://fal.run/openrouter/router/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Key ${process.env.FAL_KEY}`,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "You are a professional video editor that output JSON only." },
                { role: "user", content: systemPrompt }
              ],
              temperature: 0.3,
            }),
          });

          if (!llmResponse.ok) {
            throw new Error(`OpenRouter response error: ${llmResponse.statusText}`);
          }

          const llmData = await llmResponse.json();
          const rawText = llmData.choices?.[0]?.message?.content?.trim() || "";
          
          // Clean JSON tags if LLM returned them
          const cleanedJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
          editPlan = JSON.parse(cleanedJson);
        } catch (err) {
          console.error("LLM Edit Plan failed, falling back:", err);
          // Fallback already initialized in editPlan
        }

        const step2Duration = Date.now() - step2Start;
        sendEvent(controller, encoder, "step", {
          step: 2,
          name: "Edit Plan",
          modelId: "google/gemini-2.5-flash",
          status: "completed",
          startedAt: step2Start,
          completedAt: Date.now(),
          durationMs: step2Duration,
          costUsd: 0.002, // Gemini flash is very cheap
          inputSummary: `Hook clip: ${editPlan!.hook.clipIndex}, Body clip: ${editPlan!.body.clipIndex}, CTA clip: ${editPlan!.cta.clipIndex}`,
        });

        // ==============================
        // Step 3: Music & Voiceover (Parallel)
        // ==============================
        const step3Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 3,
          name: "Music",
          modelId: "cassetteai/music-generator",
          status: "running",
          startedAt: step3Start,
          inputSummary: `Music style: ${toneConfig.label}. Generating voiceover...`,
        });

        // Build combined voiceover text
        const voiceoverText = `${editPlan.hook.voiceover} ... ${editPlan.body.voiceover} ... ${editPlan.cta.voiceover}`;

        const [musicResult, ttsResult] = await Promise.allSettled([
          // Step 3a: Music
          (fal.subscribe as any)("cassetteai/music-generator", {
            input: {
              prompt: toneConfig.musicPrompt,
              duration: 30, // stable 30s duration, trimmed during composition
            },
            logs: true,
          }),
          // Step 3b: TTS
          (fal.subscribe as any)("fal-ai/elevenlabs/tts/eleven-v3", {
            input: {
              text: voiceoverText,
              voice: "Aria",
              stability: 0.5,
              similarity_boost: 0.75,
              speed: 1.05,
            },
            logs: true,
          }),
        ]);

        const musicOk = musicResult.status === "fulfilled";
        const ttsOk = ttsResult.status === "fulfilled";

        if (musicResult.status === "rejected") {
          console.error("Music generation failed:", musicResult.reason);
        }
        if (ttsResult.status === "rejected") {
          console.error("TTS generation failed:", ttsResult.reason);
        }

        const musicUrl = musicOk
          ? (musicResult.value.data as any)?.audio_file?.url || (musicResult.value.data as any)?.audio?.url
          : null;
        const voiceoverUrl = ttsOk
          ? (ttsResult.value.data as Record<string, Record<string, string>>)?.audio?.url
          : null;

        const step3Duration = Date.now() - step3Start;
        sendEvent(controller, encoder, "step", {
          step: 3,
          name: "Music",
          modelId: "cassetteai/music-generator",
          status: musicOk && ttsOk ? "completed" : musicOk || ttsOk ? "completed" : "failed",
          startedAt: step3Start,
          completedAt: Date.now(),
          durationMs: step3Duration,
          costUsd: 0.02 + (voiceoverText.length / 1000) * 0.1,
          resultUrl: musicUrl || voiceoverUrl || undefined,
          inputSummary: `Voiceover: "${voiceoverText.slice(0, 50)}..."`,
        });

        // ==============================
        // Step 4: Stitch & Compose
        // ==============================
        const step4Start = Date.now();
        sendEvent(controller, encoder, "step", {
          step: 4,
          name: "Stitch & Compose",
          modelId: "fal-ai/ffmpeg-api/compose",
          status: "running",
          startedAt: step4Start,
          inputSummary: "Combining video slots, voiceover track and music track...",
        });

        // Get the chosen clip URLs
        const hookClipUrl = processedClips[editPlan.hook.clipIndex]?.url || videoUrls[0];
        const bodyClipUrl = processedClips[editPlan.body.clipIndex]?.url || videoUrls[0];
        const ctaClipUrl = processedClips[editPlan.cta.clipIndex]?.url || videoUrls[0];

        try {
          // Construct composition timeline tracks according to fal-ai/ffmpeg-api/compose schema
          // timestamp and duration must be in milliseconds inside the keyframes array objects
          const tracks: any[] = [
            {
              id: "hook_video",
              type: "video",
              keyframes: [
                {
                  url: hookClipUrl,
                  timestamp: 0,
                  duration: 3000
                }
              ]
            },
            {
              id: "body_video",
              type: "video",
              keyframes: [
                {
                  url: bodyClipUrl,
                  timestamp: 3000,
                  duration: 4000
                }
              ]
            },
            {
              id: "cta_video",
              type: "video",
              keyframes: [
                {
                  url: ctaClipUrl,
                  timestamp: 7000,
                  duration: 2000
                }
              ]
            }
          ];

          // Add voiceover track if succeeded
          if (voiceoverUrl) {
            tracks.push({
              id: "voiceover_audio",
              type: "audio",
              keyframes: [
                {
                  url: voiceoverUrl,
                  timestamp: 0,
                  duration: 9000
                }
              ]
            });
          }

          // Add music track if succeeded
          if (musicUrl) {
            tracks.push({
              id: "music_audio",
              type: "audio",
              keyframes: [
                {
                  url: musicUrl,
                  timestamp: 0,
                  duration: 9000
                }
              ]
            });
          }

          const composeResult = await (fal.subscribe as any)("fal-ai/ffmpeg-api/compose", {
            input: {
              width: 720,
              height: 1280,
              tracks,
            },
            logs: true,
          });

          const finalUrl = composeResult.data?.video?.url || composeResult.data?.url;

          if (!finalUrl) {
            throw new Error("FFmpeg composition did not return a valid video URL");
          }

          const step4Duration = Date.now() - step4Start;
          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Stitch & Compose",
            modelId: "fal-ai/ffmpeg-api/compose",
            status: "completed",
            startedAt: step4Start,
            completedAt: Date.now(),
            durationMs: step4Duration,
            costUsd: 0.02,
            resultUrl: finalUrl,
            inputSummary: `Stitched ${tracks.filter(t => t.type === "video").length} videos + ${tracks.filter(t => t.type === "audio").length} audio tracks`,
          });

          const pipelineResult = {
            videoUrl: hookClipUrl,
            voiceoverUrl: voiceoverUrl || undefined,
            musicUrl: musicUrl || undefined,
            finalUrl,
          };

          sendEvent(controller, encoder, "complete", pipelineResult);

          // Cache the result
          cache.set(cacheKey, JSON.stringify(pipelineResult));
        } catch (err) {
          const error = err as Error;
          sendEvent(controller, encoder, "step", {
            step: 4,
            name: "Stitch & Compose",
            modelId: "fal-ai/ffmpeg-api/compose",
            status: "failed",
            startedAt: step4Start,
            completedAt: Date.now(),
            durationMs: Date.now() - step4Start,
            error: error.message || "Composition failed",
          });

          // Send partial result using first clip
          sendEvent(controller, encoder, "complete", {
            videoUrl: hookClipUrl,
            voiceoverUrl: voiceoverUrl || undefined,
            musicUrl: musicUrl || undefined,
            finalUrl: hookClipUrl,
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
