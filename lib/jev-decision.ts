/**
 * Jev Decision Layer (TypeSafe AI's "System One" model — `typesafe/jev-1.13`)
 *
 * Fast (~70–500ms), cheap ($0.042/M input tokens, free output) typed decision model
 * used exclusively for bounded classification, compatibility filtering, candidate selection,
 * scoring, and ranking.
 *
 * EXPLICIT RULE: Jev is NEVER used for prose generation (scripts, captions, descriptions).
 */

export interface JevDecisionResponse<T> {
  result: T;
  latencyMs: number;
  model: string;
}

async function callJev<T>(systemPrompt: string, userPrompt: string, parseFallback: () => T): Promise<JevDecisionResponse<T>> {
  const startTime = Date.now();
  const modelId = "typesafe/jev-1.13";
  const openRouterKey = process.env.JEV_API_KEY || process.env.OPENROUTER_API_KEY;

  let url = "https://openrouter.ai/api/v1/chat/completions";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (openRouterKey) {
    headers["Authorization"] = `Bearer ${openRouterKey}`;
  } else if (process.env.FAL_KEY) {
    // Fallback via fal OpenRouter proxy
    url = "https://fal.run/openrouter/router/openai/v1/chat/completions";
    headers["Authorization"] = `Key ${process.env.FAL_KEY}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.warn(`[Jev] OpenRouter call failed status ${res.status}, using fallback logic`);
      return { result: parseFallback(), latencyMs: Date.now() - startTime, model: modelId };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    // Clean potential markdown tags
    const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as T;

    return {
      result: parsed,
      latencyMs: Date.now() - startTime,
      model: modelId,
    };
  } catch (err) {
    console.error("[Jev] Decision error, using fallback logic:", err);
    return { result: parseFallback(), latencyMs: Date.now() - startTime, model: modelId };
  }
}

/* ============================================================================
 * 1. Footage Classification (single long take vs. multi-clip mix vs. photo)
 * ============================================================================ */
export interface FootageClassification {
  choice: "single_long_take" | "multi_clip_mix" | "photo_only";
  confidence: number;
}

export async function classifyFootage(
  files: { name: string; type: "video" | "image"; durationSec?: number }[]
): Promise<FootageClassification> {
  const fileSummary = files.map((f, i) => `File ${i + 1}: ${f.name} (${f.type}, ~${f.durationSec || 0}s)`).join(", ");
  const videoFiles = files.filter((f) => f.type === "video");

  const system = `You are Jev, a typed decision model. Classify footage into one of: "single_long_take", "multi_clip_mix", "photo_only". Output strictly a JSON object: {"choice": "...", "confidence": 0.95}`;
  const user = `Footage list: [${fileSummary}]. Number of videos: ${videoFiles.length}.`;

  const fallback = (): FootageClassification => {
    if (files.every((f) => f.type === "image")) return { choice: "photo_only", confidence: 1.0 };
    if (videoFiles.length === 1 && (videoFiles[0].durationSec || 0) > 30) return { choice: "single_long_take", confidence: 0.9 };
    return { choice: "multi_clip_mix", confidence: 0.85 };
  };

  const response = await callJev<FootageClassification>(system, user, fallback);
  return response.result;
}

/* ============================================================================
 * 2. Template-to-Footage Compatibility Filtering
 * ============================================================================ */
export interface TemplateMatchResult {
  templateId: string;
  isCompatible: boolean;
  score: number; // 0.0 to 1.0
}

export async function filterTemplateCompatibility(
  template: { id: string; name: string; tone: string; tags: string[] },
  footageShape: { videoCount: number; imageCount: number; isTalkingHead: boolean; totalDurationSec: number }
): Promise<TemplateMatchResult> {
  const system = `You are Jev, a typed decision model. Determine if a template fits the uploaded footage shape. Output strictly JSON: {"templateId": "${template.id}", "isCompatible": true/false, "score": 0.85}`;
  const user = `Template: ${template.name} (tone: ${template.tone}, tags: ${template.tags.join(",")}). Footage shape: ${footageShape.videoCount} videos, ${footageShape.imageCount} images, talking-head: ${footageShape.isTalkingHead}, total duration: ${footageShape.totalDurationSec}s.`;

  const fallback = (): TemplateMatchResult => ({
    templateId: template.id,
    isCompatible: true,
    score: 0.8,
  });

  const response = await callJev<TemplateMatchResult>(system, user, fallback);
  return response.result;
}

/* ============================================================================
 * 3. B-Roll Candidate Selection
 * ============================================================================ */
export interface BrollCandidateChoice {
  selectedId: string;
  confidence: number;
}

export async function selectBrollCandidate(
  sceneText: string,
  candidates: { id: string; query: string; caption: string }[]
): Promise<BrollCandidateChoice> {
  if (candidates.length === 0) return { selectedId: "", confidence: 0.0 };
  if (candidates.length === 1) return { selectedId: candidates[0].id, confidence: 1.0 };

  const candStr = candidates.map((c) => `ID: "${c.id}" (query: "${c.query}", scene: "${c.caption}")`).join("\n");
  const system = `You are Jev, a typed decision model. Pick the best matching B-roll candidate ID for a video scene. Output strictly JSON: {"selectedId": "id_string", "confidence": 0.9}`;
  const user = `Scene text: "${sceneText}"\nCandidates:\n${candStr}`;

  const fallback = (): BrollCandidateChoice => ({
    selectedId: candidates[0].id,
    confidence: 0.7,
  });

  const response = await callJev<BrollCandidateChoice>(system, user, fallback);
  return response.result;
}

/* ============================================================================
 * 4. Trending-Audio Match Confirmation
 * ============================================================================ */
export interface AudioMatchChoice {
  selectedTrackId: string;
  confidence: number;
}

export async function confirmTrendingAudioMatch(
  profile: { mood: string; targetBpm: number },
  tracks: { id: string; title: string; genre: string; bpm: number }[]
): Promise<AudioMatchChoice> {
  if (tracks.length === 0) return { selectedTrackId: "", confidence: 0.0 };
  if (tracks.length === 1) return { selectedTrackId: tracks[0].id, confidence: 1.0 };

  const trackStr = tracks.map((t) => `ID: "${t.id}" (${t.title}, ${t.genre}, ${t.bpm} BPM)`).join("\n");
  const system = `You are Jev, a typed decision model. Select the best audio track match for the mood & BPM profile. Output strictly JSON: {"selectedTrackId": "id_string", "confidence": 0.95}`;
  const user = `Target profile: mood="${profile.mood}", target BPM=${profile.targetBpm}\nCandidate tracks:\n${trackStr}`;

  const fallback = (): AudioMatchChoice => ({
    selectedTrackId: tracks[0].id,
    confidence: 0.8,
  });

  const response = await callJev<AudioMatchChoice>(system, user, fallback);
  return response.result;
}

/* ============================================================================
 * 5. Filler-Segment Keep/Cut Scoring
 * ============================================================================ */
export interface FillerSegmentScore {
  segmentId: string;
  cutScore: number; // 0.0 (definitely keep) to 1.0 (definitely cut)
  shouldCut: boolean;
}

export async function scoreFillerSegment(
  segment: { id: string; transcript: string; durationSec: number; silenceRatio: number }
): Promise<FillerSegmentScore> {
  const system = `You are Jev, a typed decision model. Score whether a speech segment is a filler word, stutter, or dead air that should be cut. Output strictly JSON: {"segmentId": "${segment.id}", "cutScore": 0.85, "shouldCut": true}`;
  const user = `Segment "${segment.transcript}" (duration: ${segment.durationSec}s, silence ratio: ${segment.silenceRatio}).`;

  const fallback = (): FillerSegmentScore => {
    const isFiller = /\b(um|uh|uhh|umm|hmm|er|err|like|you know)\b/i.test(segment.transcript);
    return {
      segmentId: segment.id,
      cutScore: isFiller ? 0.9 : 0.1,
      shouldCut: isFiller,
    };
  };

  const response = await callJev<FillerSegmentScore>(system, user, fallback);
  return response.result;
}

/* ============================================================================
 * 6. Template Suggestion Ranking (Content Coach)
 * ============================================================================ */
export interface TemplateRankingResult {
  rankedTemplateIds: string[];
}

export async function rankTemplateSuggestions(
  scriptShape: { topic: string; tone: string; targetDurationSec: number },
  templates: { id: string; name: string; tagline: string; tone: string }[]
): Promise<TemplateRankingResult> {
  const tmplStr = templates.map((t) => `ID: "${t.id}" (${t.name}, tagline: "${t.tagline}", tone: ${t.tone})`).join("\n");
  const system = `You are Jev, a typed decision model. Rank candidate templates for a script. Output strictly JSON: {"rankedTemplateIds": ["id1", "id2", ...]}`;
  const user = `Script shape: topic="${scriptShape.topic}", tone="${scriptShape.tone}", duration=${scriptShape.targetDurationSec}s.\nTemplates:\n${tmplStr}`;

  const fallback = (): TemplateRankingResult => ({
    rankedTemplateIds: templates.map((t) => t.id),
  });

  const response = await callJev<TemplateRankingResult>(system, user, fallback);
  return response.result;
}
