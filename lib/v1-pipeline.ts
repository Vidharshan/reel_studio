/* ========================================
   v1 Pipeline — Editing Engine
   Unified upload, auto-classify, auto-cut,
   b-roll insertion, brand kit overlay.
   ======================================== */

export type V1StepStatus = "idle" | "queued" | "running" | "completed" | "failed";

export interface V1StepEvent {
  step: number;
  name: string;
  modelId: string;
  status: V1StepStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  costUsd?: number;
  resultUrl?: string;
  error?: string;
  inputSummary?: string;
  // v1-specific data payloads
  segments?: Segment[];
  editPlan?: EditPlan;
  brollPlacements?: BrollPlacement[];
}

/* ---- Segments (what auto-cut produces) ---- */
export interface Segment {
  id: string;
  sourceClipIndex: number;
  startSec: number;
  endSec: number;
  transcript: string;
  isFiller: boolean;     // true = detected as filler/um/repeat
  isKept: boolean;       // user can toggle in pre-flight
  cutReason?: string;    // "silence" | "filler_word" | "false_start" | "repeat" | null
  caption?: string;      // Florence-2 scene description
  speed?: number;        // InShot playback speed multiplier (e.g. 1.0, 1.25, 1.5)
}

/* ---- Edit Plan (LLM-generated) ---- */
export interface EditPlan {
  orderedSegmentIds: string[];
  voiceover?: string;
  captionBlocks: CaptionBlock[];
  brollSuggestions: BrollSuggestion[];
  totalDurationSec: number;
}

export interface CaptionBlock {
  segmentId: string;
  text: string;
  startSec: number;
  endSec: number;
  highlightWords?: string[];
}

export interface BrollSuggestion {
  afterSegmentId: string;
  query: string;
  durationSec: number;
  reason: string;
}

export interface BrollPlacement {
  afterSegmentId: string;
  url: string;
  query: string;
  durationSec: number;
}

/* ---- Brand Kit ---- */
export interface BrandKit {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    captionBg: string;
  };
  font: string;
  logoUrl?: string;
  logoPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  captionStyle: "bold-center" | "typewriter" | "karaoke" | "minimal";
  tone: string; // maps to music prompt
}

export const DEFAULT_BRAND_KIT: BrandKit = {
  id: "default",
  name: "Default",
  colors: {
    primary: "#FFFFFF",
    secondary: "#000000",
    accent: "#8b5cf6",
    captionBg: "rgba(0,0,0,0.6)",
  },
  font: "Montserrat",
  logoPosition: "top-right",
  captionStyle: "bold-center",
  tone: "cinematic",
};

/* ---- Upload classification ---- */
export type UploadType = "single_take" | "multi_clip" | "photo_only";

export interface ClassifiedUpload {
  type: UploadType;
  files: UploadedFile[];
  totalDurationSec: number;
}

export interface UploadedFile {
  url: string;
  type: "video" | "image";
  name: string;
  durationSec?: number;
  thumbnailUrl?: string;
}

/* ---- v1 Step definitions ---- */
export const V1_STEP_DEFINITIONS = [
  {
    step: 1,
    name: "Transcribe & Detect",
    modelId: "fal-ai/whisper",
    icon: "🎙️",
    description: "Transcribing speech, detecting filler words and dead air",
  },
  {
    step: 2,
    name: "Auto-Cut",
    modelId: "gemini-2.5-flash",
    icon: "✂️",
    description: "Segmenting usable takes, removing filler and repeats",
  },
  {
    step: 3,
    name: "B-Roll Match",
    modelId: "fal-ai/florence-2-large",
    icon: "🎬",
    description: "Finding and placing relevant b-roll footage",
  },
  {
    step: 4,
    name: "Trim & Stitch",
    modelId: "local/ffmpeg",
    icon: "🔗",
    description: "Trimming and stitching segments locally (free)",
  },
  {
    step: 5,
    name: "Compose",
    modelId: "cassetteai + local/ffmpeg",
    icon: "🎵",
    description: "Adding background music and final mix",
  },
] as const;

export const V1_ESTIMATED_COSTS: Record<number, number> = {
  1: 0.01,  // Whisper transcription
  2: 0.002, // LLM planning
  3: 0.03,  // Florence-2 + b-roll search
  4: 0.03,  // TTS + music
  5: 0.02,  // FFmpeg compose
};
