/**
 * Local FFmpeg utilities for video trimming, merging, and composition.
 * Uses ffmpeg-static for a bundled binary — zero cloud API cost.
 *
 * FFmpeg reads directly from HTTP URLs (no download step needed).
 * Only the final result gets uploaded to fal storage.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const exec = promisify(execFile);

const FFMPEG_BIN = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

/**
 * Resolve the FFmpeg binary path at runtime.
 * Turbopack rewrites imports/require/process.cwd — so we use multiple
 * strategies that resolve actual filesystem paths.
 */
function getFfmpegPath(): string {
  const candidates: string[] = [];

  // 1. Hardcoded project path (most reliable — can't be mangled)
  candidates.push(path.join("D:", "2026", "reel_studio", "node_modules", "ffmpeg-static", FFMPEG_BIN));

  // 2. Walk up from this file's directory to find node_modules
  try {
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, "node_modules", "ffmpeg-static", FFMPEG_BIN);
      candidates.push(candidate);
      dir = path.dirname(dir);
    }
  } catch { /* __dirname may not exist */ }

  // 3. process.cwd() based
  try {
    candidates.push(path.join(process.cwd(), "node_modules", "ffmpeg-static", FFMPEG_BIN));
  } catch { /* ignore */ }

  // 4. require.resolve to find the package, then derive binary path
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkgPath = require.resolve("ffmpeg-static/package.json");
    candidates.push(path.join(path.dirname(pkgPath), FFMPEG_BIN));
  } catch { /* ignore */ }

  // Return first candidate that exists on disk
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        console.log(`[reeltrix] FFmpeg resolved: ${c}`);
        return c;
      }
    } catch { /* ignore */ }
  }

  // Last resort: hope it's on PATH
  console.warn("[reeltrix] FFmpeg not found in node_modules, falling back to system PATH");
  return "ffmpeg";
}

const resolvedFfmpegPath = getFfmpegPath();

function tmpFile(ext = ".mp4"): string {
  return path.join(
    os.tmpdir(),
    `reeltrix_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
  );
}

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await exec(resolvedFfmpegPath, args, { maxBuffer: 50 * 1024 * 1024 });
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(
      `FFmpeg failed: ${error.stderr?.slice(-500) || error.message || "Unknown error"}`
    );
  }
}

/**
 * Trim a video segment.
 * Re-encodes video & audio with audio resampling (-af aresample=async=1)
 * to guarantee frame-accurate cuts, perfect lip sync, and uniform 44.1kHz stereo audio.
 * This prevents audio dropping out on subsequent concatenated segments.
 */
export async function trimVideo(
  videoUrl: string,
  startSec: number,
  endSec: number
): Promise<string> {
  const outPath = tmpFile();
  const duration = Math.max(0.1, endSec - startSec);

  await runFfmpeg([
    "-y",
    "-ss", startSec.toFixed(3),
    "-i", videoUrl,
    "-t", duration.toFixed(3),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "22",
    "-c:a", "aac",
    "-ar", "44100",
    "-ac", "2",
    "-b:a", "192k",
    "-af", "aresample=async=1",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "+faststart",
    outPath,
  ]);
  return outPath;
}

/**
 * Merge (concatenate) multiple video files into one cohesive timeline.
 * Re-encodes with standardized parameters to ensure seamless audio & video continuity
 * across all segments without audio dropout or lip-sync drift.
 */
export async function mergeVideos(filePaths: string[]): Promise<string> {
  if (filePaths.length === 0) throw new Error("No video files provided to merge");
  if (filePaths.length === 1) return filePaths[0];

  const outPath = tmpFile();
  const listPath = tmpFile(".txt");

  const listContent = filePaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent, "utf-8");

  try {
    await runFfmpeg([
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "21",
      "-c:a", "aac",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "192k",
      "-movflags", "+faststart",
      outPath,
    ]);
  } finally {
    cleanup(listPath);
  }

  return outPath;
}

export interface BrollOverlay {
  brollUrl: string;
  startSec: number;
  durationSec: number;
}

/**
 * Overlay B-roll videos on top of the main talking head video as embedded Picture-in-Picture (PiP).
 * Scales B-roll to an inset overlay (e.g. 560x420) centered on screen with subtle styling,
 * allowing the main speaker video and voice to continue uninterrupted underneath!
 */
export async function overlayBrolls(
  mainVideoPath: string,
  overlays: BrollOverlay[]
): Promise<string> {
  if (overlays.length === 0) return mainVideoPath;

  let currentVideo = mainVideoPath;

  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i];
    const endSec = overlay.startSec + overlay.durationSec;
    const outPath = tmpFile();

    try {
      // Scale B-roll to 540x360 inset overlay positioned nicely in top-center/middle of 9:16 video
      await runFfmpeg([
        "-y",
        "-i", currentVideo,
        "-ss", "0",
        "-t", overlay.durationSec.toFixed(3),
        "-i", overlay.brollUrl,
        "-filter_complex",
        `[1:v]scale=540:360:force_original_aspect_ratio=decrease,pad=540:360:(ow-iw)/2:(oh-ih)/2:color=black[broll];` +
        `[0:v][broll]overlay=x=(main_w-540)/2:y=240:enable='between(t,${overlay.startSec.toFixed(3)},${endSec.toFixed(3)})'[vout]`,
        "-map", "[vout]",
        "-map", "0:a", // Preserve main speaker voice audio 100%!
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "21",
        "-c:a", "copy",
        "-movflags", "+faststart",
        outPath,
      ]);

      if (currentVideo !== mainVideoPath) cleanup(currentVideo);
      currentVideo = outPath;
    } catch (err) {
      console.error(`Failed to apply B-roll overlay ${i}:`, err);
    }
  }

  return currentVideo;
}

/**
 * Merge a background audio track with a video that already has main speaker audio.
 * Mixes the music at lower volume (e.g. 12%) so the original voice stays crisp and dominant.
 */
export async function mergeAudioWithVideo(
  videoPath: string,
  audioUrl: string,
  musicVolume = 0.12
): Promise<string> {
  const outPath = tmpFile();
  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-i", audioUrl,
    "-filter_complex",
    `[1:a]volume=${musicVolume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-ar", "44100",
    "-ac", "2",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  ]);
  return outPath;
}

/* ---- Caption types ---- */
export interface CaptionEntry {
  text: string;
  startSec: number;
  endSec: number;
  highlightWords?: string[];
}

/**
 * Generate an ASS subtitle file from caption entries.
 * Style: modern reel captions — bold, white, centered bottom third,
 * dark outline + shadow for readability over any background.
 */
export function generateASS(captions: CaptionEntry[]): string {
  const fmtTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
  };

  const header = `[Script Info]
Title: Reeltrix Captions
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,180,1
Style: Highlight,Montserrat,56,&H0000E6FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = captions.map((cap) => {
    let text = cap.text.replace(/\n/g, "\\N");

    // Highlight specific words with accent color
    if (cap.highlightWords && cap.highlightWords.length > 0) {
      for (const word of cap.highlightWords) {
        const regex = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
        text = text.replace(regex, `{\\c&H00E6FF&\\b1}$1{\\c&HFFFFFF&\\b1}`);
      }
    }

    return `Dialogue: 0,${fmtTime(cap.startSec)},${fmtTime(cap.endSec)},Default,,0,0,0,,${text}`;
  });

  return header + "\n" + events.join("\n") + "\n";
}

/**
 * Burn ASS captions into a video using FFmpeg's ass filter.
 * Requires re-encoding the video track (captions are rendered into pixels).
 */
export async function burnCaptions(
  videoPath: string,
  captions: CaptionEntry[]
): Promise<string> {
  if (captions.length === 0) return videoPath;

  const assPath = tmpFile(".ass");
  const outPath = tmpFile();

  fs.writeFileSync(assPath, generateASS(captions), "utf-8");

  // Escape the ASS path for FFmpeg filter (Windows backslashes and colons)
  const escapedAssPath = assPath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:");

  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-vf", `ass='${escapedAssPath}'`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-c:a", "copy",
    "-movflags", "+faststart",
    outPath,
  ]);

  cleanup(assPath);
  return outPath;
}

/** Clean up temp files */
export function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch { /* ignore */ }
  }
}

/** Read a local file as a Blob for uploading to fal storage */
export function fileToBlob(filePath: string): Blob {
  const buffer = fs.readFileSync(filePath);
  return new Blob([buffer], { type: "video/mp4" });
}
