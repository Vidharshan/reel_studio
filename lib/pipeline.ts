/* ========================================
   Pipeline Types & Constants
   ======================================== */

export type StepStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ToneStyle = "cinematic" | "ugc" | "product_demo" | "energetic" | "calm";
export type PipelineMode = "single" | "multiclip";

export interface StepEvent {
  step: number;
  name: string;
  modelId: string;
  status: StepStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  costUsd?: number;
  resultUrl?: string;
  error?: string;
  inputSummary?: string;
}

export interface PipelineInput {
  imageUrl: string;
  hookText: string;
  tone: ToneStyle;
}

export interface MultiClipInput {
  videoUrls: string[];
  hookText: string;
  tone: ToneStyle;
}

export interface PipelineResult {
  videoUrl?: string;
  voiceoverUrl?: string;
  musicUrl?: string;
  finalUrl?: string;
  totalCostUsd?: number;
  totalDurationMs?: number;
  partial?: boolean;
}

export const STEP_DEFINITIONS = [
  {
    step: 1,
    name: "Image → Video",
    modelId: "fal-ai/kling-video/v2.1/standard/image-to-video",
    icon: "🎬",
    description: "Generating motion from your photo",
  },
  {
    step: 2,
    name: "Voiceover",
    modelId: "fal-ai/elevenlabs/tts/eleven-v3",
    icon: "🎙️",
    description: "Recording AI voiceover",
  },
  {
    step: 3,
    name: "Music",
    modelId: "cassetteai/music-generator",
    icon: "🎵",
    description: "Composing background music",
  },
  {
    step: 4,
    name: "Compose",
    modelId: "fal-ai/ffmpeg-api/merge-audio-video",
    icon: "🎞️",
    description: "Stitching final reel",
  },
] as const;

export const MULTICLIP_STEP_DEFINITIONS = [
  {
    step: 1,
    name: "Pre-process & Caption",
    modelId: "fal-ai/florence-2-large/more-detailed-caption",
    icon: "👁️",
    description: "Analyzing raw footage and extracting frames",
  },
  {
    step: 2,
    name: "Edit Plan",
    modelId: "google/gemini-2.5-flash",
    icon: "📝",
    description: "Structuring narrative and writing voiceover",
  },
  {
    step: 3,
    name: "Music",
    modelId: "cassetteai/music-generator",
    icon: "🎵",
    description: "Composing background music",
  },
  {
    step: 4,
    name: "Stitch & Compose",
    modelId: "fal-ai/ffmpeg-api/compose",
    icon: "🎞️",
    description: "Trimming and multi-track stitching",
  },
] as const;

export const TONE_OPTIONS: { value: ToneStyle; label: string; musicPrompt: string }[] = [
  {
    value: "cinematic",
    label: "🎬 Cinematic",
    musicPrompt: "Epic cinematic orchestral background music, dramatic and inspiring, 90 bpm, no lyrics",
  },
  {
    value: "ugc",
    label: "📱 UGC / Casual",
    musicPrompt: "Upbeat casual lo-fi hip hop background music, chill and trendy, 85 bpm, no lyrics",
  },
  {
    value: "product_demo",
    label: "💼 Product Demo",
    musicPrompt: "Clean modern corporate background music, professional and sleek, 110 bpm, no lyrics",
  },
  {
    value: "energetic",
    label: "⚡ Energetic",
    musicPrompt: "High energy electronic dance music, exciting and powerful, 128 bpm, no lyrics",
  },
  {
    value: "calm",
    label: "🌿 Calm / Mindful",
    musicPrompt: "Gentle ambient piano with soft strings, peaceful and contemplative, 70 bpm, no lyrics",
  },
];

/* Estimated costs per step for display (actual cost comes from response) */
export const ESTIMATED_COSTS: Record<number, number> = {
  1: 0.28,
  2: 0.01,
  3: 0.02,
  4: 0.01,
};

export const MULTICLIP_ESTIMATED_COSTS: Record<number, number> = {
  1: 0.03, // Captioning (Florence-2)
  2: 0.01, // LLM Edit Plan
  3: 0.02, // CassetteAI Music
  4: 0.02, // FFmpeg Compose
};
