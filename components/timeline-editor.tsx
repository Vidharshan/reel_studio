"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { Segment, BrollPlacement } from "@/lib/v1-pipeline";
import {
  IconScissors,
  IconCheck,
  IconX,
  IconMusic,
  IconImage,
  IconScript,
  IconPlay,
  IconPause,
  IconTrash,
  IconCopy,
  IconRotateCcw,
  IconArrowLeft,
  IconArrowRight,
  IconZoomIn,
  IconZoomOut,
  IconVolume,
  IconClock,
  IconPlus,
} from "@/components/icons";

export interface MultiTrackTimelineProps {
  segments: Segment[];
  videoUrls: string[];
  brollPlacements?: BrollPlacement[];
  onUpdateSegmentTrim?: (id: string, startSec: number, endSec: number) => void;
  onToggleSegment?: (id: string) => void;
  onSplitSegment?: (id: string, splitSec: number) => void;
  onDeleteSegment?: (id: string) => void;
  onDuplicateSegment?: (id: string) => void;
  onReorderSegments?: (newSegments: Segment[]) => void;
  onUpdateSegments?: (newSegments: Segment[]) => void;
  onContinue: () => void;
  onClose?: () => void;
  keptCount?: number;
  fillerCount?: number;
}

// Format seconds to mm:ss.f
function formatTimecode(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
}

export function TimelineEditor({
  segments: initialSegments,
  videoUrls,
  brollPlacements = [],
  onUpdateSegmentTrim,
  onToggleSegment,
  onSplitSegment,
  onDeleteSegment,
  onDuplicateSegment,
  onReorderSegments,
  onUpdateSegments,
  onContinue,
  onClose,
  keptCount: propKeptCount,
  fillerCount: propFillerCount,
}: MultiTrackTimelineProps) {
  // Local state for interactive editing
  const [segments, setSegments] = useState<Segment[]>(initialSegments);

  // Synchronize when initialSegments change from outside
  useEffect(() => {
    setSegments(initialSegments);
  }, [initialSegments]);

  const updateSegmentsState = useCallback(
    (newSegs: Segment[]) => {
      setSegments(newSegs);
      if (onUpdateSegments) {
        onUpdateSegments(newSegs);
      }
    },
    [onUpdateSegments]
  );

  // Selected clip
  const [selectedSegId, setSelectedSegId] = useState<string>(
    initialSegments.find((s) => s.isKept)?.id || initialSegments[0]?.id || ""
  );

  // Global Timeline Time (in seconds, 0 to totalDurationSec)
  const [globalTime, setGlobalTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [timelineZoom, setTimelineZoom] = useState<number>(1.2); // 0.6x to 3.5x scale
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [previewVolume, setPreviewVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Dragging states
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [draggingHandle, setDraggingHandle] = useState<{
    segId: string;
    type: "start" | "end";
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const playheadRafRef = useRef<number | null>(null);
  const lastWallTimeRef = useRef<number>(0);

  // Calculated Segment Timeline Layout (Sequential Kept Segments)
  // Kept segments form the actual linear export sequence
  const keptSegments = useMemo(() => segments.filter((s) => s.isKept), [segments]);
  const activeSegmentsList = keptSegments.length > 0 ? keptSegments : segments;

  const segmentLayouts = useMemo(() => {
    let offset = 0;
    return activeSegmentsList.map((seg, idx) => {
      const speed = seg.speed || 1.0;
      const rawDuration = Math.max(0.1, seg.endSec - seg.startSec);
      const effectiveDuration = rawDuration / speed;
      const start = offset;
      const end = offset + effectiveDuration;
      offset = end;
      return {
        seg,
        index: idx,
        timelineStart: start,
        timelineEnd: end,
        duration: effectiveDuration,
        rawDuration,
        speed,
      };
    });
  }, [activeSegmentsList]);

  const totalDurationSec = useMemo(() => {
    if (segmentLayouts.length === 0) return 1;
    const last = segmentLayouts[segmentLayouts.length - 1];
    return Math.max(0.1, last.timelineEnd);
  }, [segmentLayouts]);

  // Map Global Time to Current Segment & Clip Timestamp
  const currentMapping = useMemo(() => {
    if (segmentLayouts.length === 0) {
      return {
        layout: null,
        clipSourceTime: 0,
        sourceClipIndex: 0,
        videoUrl: videoUrls[0] || "",
        caption: "",
        activeBroll: null as BrollPlacement | null,
      };
    }

    // Clamp global time
    const t = Math.max(0, Math.min(globalTime, totalDurationSec));

    // Find segment containing global time
    let match = segmentLayouts.find((l) => t >= l.timelineStart && t < l.timelineEnd);
    if (!match) {
      match = t >= totalDurationSec ? segmentLayouts[segmentLayouts.length - 1] : segmentLayouts[0];
    }

    const relTimeInSeg = (t - match.timelineStart) * match.speed;
    const clipSourceTime = match.seg.startSec + relTimeInSeg;
    const sourceClipIndex = match.seg.sourceClipIndex;
    const videoUrl = videoUrls[sourceClipIndex] || videoUrls[0] || "";

    // Check if B-roll overlay is active around this timeline time
    const activeBroll = brollPlacements.find((b) => b.afterSegmentId === match.seg.id) || null;

    return {
      layout: match,
      clipSourceTime,
      sourceClipIndex,
      videoUrl,
      caption: match.seg.transcript,
      activeBroll,
    };
  }, [segmentLayouts, globalTime, totalDurationSec, videoUrls, brollPlacements]);

  // Selected Segment
  const selectedSeg = useMemo(
    () => segments.find((s) => s.id === selectedSegId) || segments[0],
    [segments, selectedSegId]
  );
  const selectedLayout = useMemo(
    () => segmentLayouts.find((l) => l.seg.id === selectedSeg?.id),
    [segmentLayouts, selectedSeg]
  );

  // Sync Video Element when Global Time or Source Video Changes
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    // Set muted / volume
    vid.muted = isMuted;
    vid.volume = previewVolume;

    // Change video source if changed
    if (currentMapping.videoUrl && vid.src !== currentMapping.videoUrl) {
      const wasPlaying = isPlaying;
      vid.src = currentMapping.videoUrl;
      vid.load();
      vid.currentTime = currentMapping.clipSourceTime;
      if (wasPlaying) {
        vid.play().catch(() => {});
      }
      return;
    }

    // Synchronize video timestamp if drifted significantly
    if (!isPlaying) {
      if (Math.abs(vid.currentTime - currentMapping.clipSourceTime) > 0.05) {
        vid.currentTime = currentMapping.clipSourceTime;
      }
    } else {
      if (Math.abs(vid.currentTime - currentMapping.clipSourceTime) > 0.25) {
        vid.currentTime = currentMapping.clipSourceTime;
      }
    }
  }, [currentMapping, isPlaying, isMuted, previewVolume]);

  // Continuous Sequence Playback Engine
  useEffect(() => {
    if (!isPlaying) {
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = null;
      }
      videoRef.current?.pause();
      return;
    }

    lastWallTimeRef.current = performance.now();
    videoRef.current?.play().catch(() => {});

    const updateLoop = (now: number) => {
      const deltaSec = (now - lastWallTimeRef.current) / 1000;
      lastWallTimeRef.current = now;

      setGlobalTime((prev) => {
        const nextTime = prev + deltaSec;
        if (nextTime >= totalDurationSec) {
          // Reached end of timeline sequence
          setIsPlaying(false);
          return 0; // reset to beginning
        }
        return nextTime;
      });

      playheadRafRef.current = requestAnimationFrame(updateLoop);
    };

    playheadRafRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = null;
      }
    };
  }, [isPlaying, totalDurationSec]);

  // Handle Play/Pause toggle
  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Seek to Global Timeline Time
  const seekGlobalTime = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(timeSec, totalDurationSec));
      setGlobalTime(clamped);

      // Auto-select clip at this playhead
      const targetLayout = segmentLayouts.find(
        (l) => clamped >= l.timelineStart && clamped < l.timelineEnd
      );
      if (targetLayout) {
        setSelectedSegId(targetLayout.seg.id);
      }
    },
    [totalDurationSec, segmentLayouts]
  );

  // Nudge playhead by delta seconds (e.g. -0.1s or +0.1s)
  const nudgeTime = useCallback(
    (deltaSec: number) => {
      seekGlobalTime(globalTime + deltaSec);
    },
    [globalTime, seekGlobalTime]
  );

  // Jump to clip
  const selectClipAndSeek = useCallback(
    (segId: string) => {
      setSelectedSegId(segId);
      const layout = segmentLayouts.find((l) => l.seg.id === segId);
      if (layout) {
        setGlobalTime(layout.timelineStart);
      } else {
        const seg = segments.find((s) => s.id === segId);
        if (seg && videoRef.current) {
          videoRef.current.currentTime = seg.startSec;
        }
      }
    },
    [segmentLayouts, segments]
  );

  // --------------------------------------------------------------------------
  // INSHOT SIGNATURE ACTIONS
  // --------------------------------------------------------------------------

  // 1. SPLIT (Dividir): Cut the selected clip at the current playhead position
  const handleSplitClip = useCallback(() => {
    if (!selectedSeg) return;

    // Check if playhead is within selected segment
    const layout = segmentLayouts.find((l) => l.seg.id === selectedSeg.id);
    let splitPointSec = selectedSeg.startSec + (selectedSeg.endSec - selectedSeg.startSec) / 2;

    if (layout && globalTime >= layout.timelineStart && globalTime <= layout.timelineEnd) {
      const relTime = (globalTime - layout.timelineStart) * layout.speed;
      splitPointSec = selectedSeg.startSec + relTime;
    }

    // Minimum clip duration is 0.2s
    if (splitPointSec <= selectedSeg.startSec + 0.2 || splitPointSec >= selectedSeg.endSec - 0.2) {
      alert("Position the playhead inside the clip (at least 0.2s from ends) to split.");
      return;
    }

    const segIndex = segments.findIndex((s) => s.id === selectedSeg.id);
    if (segIndex === -1) return;

    const round2 = (num: number) => parseFloat(num.toFixed(2));
    const splitTime = round2(splitPointSec);

    // Split transcript words proportionally
    const words = selectedSeg.transcript.split(" ");
    const ratio = (splitTime - selectedSeg.startSec) / (selectedSeg.endSec - selectedSeg.startSec);
    const splitWordIdx = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
    const textPart1 = words.slice(0, splitWordIdx).join(" ") || selectedSeg.transcript;
    const textPart2 = words.slice(splitWordIdx).join(" ") || "...";

    const segA: Segment = {
      ...selectedSeg,
      id: `seg_${Date.now()}_a`,
      endSec: splitTime,
      transcript: textPart1,
    };

    const segB: Segment = {
      ...selectedSeg,
      id: `seg_${Date.now()}_b`,
      startSec: splitTime,
      transcript: textPart2,
    };

    const updated = [...segments];
    updated.splice(segIndex, 1, segA, segB);
    updateSegmentsState(updated);
    setSelectedSegId(segB.id);

    if (onSplitSegment) {
      onSplitSegment(selectedSeg.id, splitTime);
    }
  }, [selectedSeg, segmentLayouts, globalTime, segments, updateSegmentsState, onSplitSegment]);

  // 2. TOGGLE KEEP / DISCARD (Cut out filler)
  const handleToggleSegment = useCallback(
    (segId: string) => {
      const updated = segments.map((s) =>
        s.id === segId ? { ...s, isKept: !s.isKept, isFiller: !s.isKept ? false : s.isFiller } : s
      );
      updateSegmentsState(updated);
      if (onToggleSegment) {
        onToggleSegment(segId);
      }
    },
    [segments, updateSegmentsState, onToggleSegment]
  );

  // 3. DELETE CLIP
  const handleDeleteClip = useCallback(
    (segId: string) => {
      if (segments.length <= 1) {
        alert("Cannot delete the only clip in the timeline.");
        return;
      }
      const updated = segments.filter((s) => s.id !== segId);
      updateSegmentsState(updated);
      setSelectedSegId(updated[0]?.id || "");
      if (onDeleteSegment) {
        onDeleteSegment(segId);
      }
    },
    [segments, updateSegmentsState, onDeleteSegment]
  );

  // 4. DUPLICATE CLIP
  const handleDuplicateClip = useCallback(
    (segId: string) => {
      const idx = segments.findIndex((s) => s.id === segId);
      if (idx === -1) return;
      const target = segments[idx];
      const clone: Segment = {
        ...target,
        id: `seg_${Date.now()}_dup`,
      };
      const updated = [...segments];
      updated.splice(idx + 1, 0, clone);
      updateSegmentsState(updated);
      setSelectedSegId(clone.id);
      if (onDuplicateSegment) {
        onDuplicateSegment(segId);
      }
    },
    [segments, updateSegmentsState, onDuplicateSegment]
  );

  // 5. REORDER (Move Left / Move Right)
  const handleMoveClip = useCallback(
    (segId: string, direction: "left" | "right") => {
      const idx = segments.findIndex((s) => s.id === segId);
      if (idx === -1) return;
      const targetIdx = direction === "left" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= segments.length) return;

      const updated = [...segments];
      const [removed] = updated.splice(idx, 1);
      updated.splice(targetIdx, 0, removed);
      updateSegmentsState(updated);
      if (onReorderSegments) {
        onReorderSegments(updated);
      }
    },
    [segments, updateSegmentsState, onReorderSegments]
  );

  // 6. SPEED CHANGE
  const handleSetSpeed = useCallback(
    (segId: string, speed: number) => {
      const updated = segments.map((s) => (s.id === segId ? { ...s, speed } : s));
      updateSegmentsState(updated);
    },
    [segments, updateSegmentsState]
  );

  // 7. DIRECT TRIM UPDATE (from Slider or Drag Handle)
  const handleTrimUpdate = useCallback(
    (segId: string, newStartSec: number, newEndSec: number) => {
      const validStart = parseFloat(Math.max(0, newStartSec).toFixed(2));
      const validEnd = parseFloat(Math.max(validStart + 0.2, newEndSec).toFixed(2));

      const updated = segments.map((s) =>
        s.id === segId ? { ...s, startSec: validStart, endSec: validEnd } : s
      );
      updateSegmentsState(updated);
      if (onUpdateSegmentTrim) {
        onUpdateSegmentTrim(segId, validStart, validEnd);
      }
    },
    [segments, updateSegmentsState, onUpdateSegmentTrim]
  );

  // 8. RESET TRIM TO DEFAULT (0 to 10s or detected)
  const handleResetTrim = useCallback(
    (segId: string) => {
      const seg = segments.find((s) => s.id === segId);
      if (!seg) return;
      handleTrimUpdate(segId, 0, Math.max(1.0, seg.endSec));
    },
    [segments, handleTrimUpdate]
  );

  // --------------------------------------------------------------------------
  // INTERACTIVE IN-TRACK DRAG HANDLES
  // --------------------------------------------------------------------------
  const startDragHandle = (
    e: React.MouseEvent,
    segId: string,
    type: "start" | "end",
    curStart: number,
    curEnd: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingHandle({
      segId,
      type,
      startX: e.clientX,
      initialStart: curStart,
      initialEnd: curEnd,
    });
  };

  useEffect(() => {
    if (!draggingHandle) return;

    const pxPerSec = 60 * timelineZoom;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaPx = e.clientX - draggingHandle.startX;
      const deltaSec = deltaPx / pxPerSec;

      if (draggingHandle.type === "start") {
        const newStart = Math.max(
          0,
          Math.min(draggingHandle.initialEnd - 0.2, draggingHandle.initialStart + deltaSec)
        );
        handleTrimUpdate(draggingHandle.segId, newStart, draggingHandle.initialEnd);
        // Live preview starting frame
        if (videoRef.current) {
          videoRef.current.currentTime = newStart;
        }
      } else {
        const newEnd = Math.max(draggingHandle.initialStart + 0.2, draggingHandle.initialEnd + deltaSec);
        handleTrimUpdate(draggingHandle.segId, draggingHandle.initialStart, newEnd);
        // Live preview ending frame
        if (videoRef.current) {
          videoRef.current.currentTime = newEnd;
        }
      }
    };

    const handleMouseUp = () => {
      setDraggingHandle(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingHandle, timelineZoom, handleTrimUpdate]);

  // --------------------------------------------------------------------------
  // TIMELINE RULER SCRUBBING
  // --------------------------------------------------------------------------
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + (timelineScrollRef.current?.scrollLeft || 0);
    const pxPerSec = 60 * timelineZoom;
    const timeAtX = clickX / pxPerSec;
    seekGlobalTime(timeAtX);
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = timelineScrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const clickX = clientX - rect.left + container.scrollLeft;
      const pxPerSec = 60 * timelineZoom;
      seekGlobalTime(clickX / pxPerSec);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbing, timelineZoom, seekGlobalTime]);

  // Keyboard Shortcuts (Space to play/pause, S to split, Arrow keys to nudge)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === "KeyS") {
        e.preventDefault();
        handleSplitClip();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        nudgeTime(e.shiftKey ? -0.5 : -0.1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        nudgeTime(e.shiftKey ? 0.5 : 0.1);
      } else if (e.code === "Delete" || e.code === "Backspace") {
        if (selectedSegId) {
          e.preventDefault();
          handleToggleSegment(selectedSegId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayPause, handleSplitClip, nudgeTime, selectedSegId, handleToggleSegment]);

  // Visual Timeline Width
  const pxPerSec = 60 * timelineZoom;
  const timelineContentWidth = Math.max(800, totalDurationSec * pxPerSec + 200);

  // Ruler tick interval based on zoom
  const tickIntervalSec = timelineZoom > 2 ? 0.5 : timelineZoom > 1.2 ? 1 : 2;
  const numTicks = Math.ceil(totalDurationSec / tickIntervalSec) + 2;

  const keptCount = propKeptCount !== undefined ? propKeptCount : segments.filter((s) => s.isKept).length;
  const fillerCount = propFillerCount !== undefined ? propFillerCount : segments.filter((s) => !s.isKept).length;

  return (
    <div
      style={{
        backgroundColor: "#0B0B0F",
        border: "1px solid #23232A",
        borderRadius: "16px",
        overflow: "hidden",
        marginTop: "16px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
        color: "#F4F4F5",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* ──────────────────────────────────────────────────────────────────────────
          TOP HEADER BAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          backgroundColor: "#111117",
          borderBottom: "1px solid #1E1E26",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFF",
              fontWeight: "bold",
            }}
          >
            <IconScissors size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#FFFFFF" }}>
                InShot Video Studio
              </h3>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  backgroundColor: "#00E67620",
                  color: "#00E676",
                  border: "1px solid #00E67640",
                  borderRadius: "4px",
                  padding: "1px 6px",
                }}
              >
                PRO NLE
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "#8E8E9F", margin: 0 }}>
              {keptCount} kept clips · {fillerCount} cut/filler · {totalDurationSec.toFixed(1)}s reel duration
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: "transparent",
                border: "1px solid #2D2D38",
                color: "#A1A1B2",
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          )}

          <button
            type="button"
            onClick={onContinue}
            style={{
              background: "linear-gradient(135deg, #00E676 0%, #059669 100%)",
              color: "#000",
              fontWeight: 700,
              fontSize: "13px",
              padding: "8px 22px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 14px rgba(0,230,118,0.35)",
            }}
          >
            Render {keptCount} Clips ➔
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN STAGE: VIDEO PREVIEW PLAYER + TIME DISPLAY
          ────────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 20px 10px 20px",
          backgroundColor: "#09090C",
        }}
      >
        {/* Video Canvas Container (InShot 9:16 vertical reel preview) */}
        <div
          style={{
            position: "relative",
            width: aspectRatio === "9:16" ? "240px" : aspectRatio === "16:9" ? "380px" : "280px",
            height: aspectRatio === "9:16" ? "380px" : aspectRatio === "16:9" ? "220px" : "280px",
            backgroundColor: "#000",
            borderRadius: "14px",
            overflow: "hidden",
            border: "1px solid #272733",
            boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
        >
          {/* Main Video */}
          <video
            ref={videoRef}
            src={currentMapping.videoUrl}
            playsInline
            muted={isMuted}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />

          {/* InShot PIP B-Roll Overlay (when playhead is over a B-roll insertion point) */}
          {currentMapping.activeBroll && (
            <div
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                width: "90px",
                height: "120px",
                borderRadius: "8px",
                overflow: "hidden",
                border: "2px solid #8B5CF6",
                boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
                backgroundColor: "#181822",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 4,
              }}
            >
              {currentMapping.activeBroll.url ? (
                <video
                  src={currentMapping.activeBroll.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ textAlign: "center", padding: "6px" }}>
                  <IconImage size={18} />
                  <span style={{ fontSize: "9px", color: "#C4B5FD", fontWeight: 700, display: "block" }}>
                    B-ROLL PiP
                  </span>
                </div>
              )}
              <span
                style={{
                  position: "absolute",
                  bottom: "3px",
                  fontSize: "8px",
                  backgroundColor: "rgba(0,0,0,0.7)",
                  color: "#FFF",
                  padding: "1px 4px",
                  borderRadius: "3px",
                }}
              >
                PiP
              </span>
            </div>
          )}

          {/* Animated Viral Caption Overlay */}
          {currentMapping.caption && (
            <div
              style={{
                position: "absolute",
                bottom: "28px",
                left: "12px",
                right: "12px",
                textAlign: "center",
                pointerEvents: "none",
                zIndex: 3,
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(4px)",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 800,
                    color: "#FFE600",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                  }}
                >
                  {currentMapping.caption}
                </span>
              </div>
            </div>
          )}

          {/* Quick Play/Pause Center Indicator on Click */}
          <div
            onClick={togglePlayPause}
            style={{
              position: "absolute",
              inset: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isPlaying ? "transparent" : "rgba(0,0,0,0.35)",
              transition: "background 0.2s",
              zIndex: 2,
            }}
          >
            {!isPlaying && (
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(0, 230, 118, 0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#00",
                  boxShadow: "0 0 20px rgba(0,230,118,0.5)",
                }}
              >
                <IconPlay size={24} />
              </div>
            )}
          </div>
        </div>

        {/* Video Player Bottom Controls & Timecode Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: "720px",
            marginTop: "12px",
          }}
        >
          {/* Timecode */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "14px",
                fontWeight: 700,
                color: "#00E676",
                backgroundColor: "#13131A",
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #23232F",
              }}
            >
              {formatTimecode(globalTime)}
            </span>
            <span style={{ fontSize: "12px", color: "#717182" }}>
              / {formatTimecode(totalDurationSec)}
            </span>
            {selectedLayout && (
              <span
                style={{
                  fontSize: "11px",
                  color: "#C4C4D4",
                  backgroundColor: "#1E1E28",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                Clip #{selectedLayout.index + 1} ({selectedLayout.duration.toFixed(1)}s)
              </span>
            )}
          </div>

          {/* Frame Step & Play Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => nudgeTime(-0.1)}
              title="Step Back 0.1s (ArrowLeft)"
              style={{
                backgroundColor: "#16161F",
                border: "1px solid #2A2A38",
                color: "#E4E4E7",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ⏪ -0.1s
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              title="Play/Pause (Space)"
              style={{
                backgroundColor: isPlaying ? "#EF4444" : "#00E676",
                color: isPlaying ? "#FFF" : "#000",
                border: "none",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                boxShadow: isPlaying ? "0 0 10px rgba(239,68,68,0.4)" : "0 0 10px rgba(0,230,118,0.4)",
              }}
            >
              {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
            </button>

            <button
              type="button"
              onClick={() => nudgeTime(0.1)}
              title="Step Forward 0.1s (ArrowRight)"
              style={{
                backgroundColor: "#16161F",
                border: "1px solid #2A2A38",
                color: "#E4E4E7",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              +0.1s ⏩
            </button>
          </div>

          {/* Aspect Ratio & Volume */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              title={isMuted ? "Unmute" : "Mute"}
              style={{
                backgroundColor: isMuted ? "#272733" : "#16161F",
                border: "1px solid #2A2A38",
                color: isMuted ? "#EF4444" : "#A1A1B2",
                padding: "6px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              <IconVolume size={15} />
            </button>

            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as "9:16" | "16:9" | "1:1")}
              style={{
                backgroundColor: "#16161F",
                border: "1px solid #2A2A38",
                color: "#E4E4E7",
                fontSize: "11px",
                borderRadius: "6px",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              <option value="9:16">9:16 Reel</option>
              <option value="16:9">16:9 Wide</option>
              <option value="1:1">1:1 Square</option>
            </select>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          INSHOT TOOLBAR (The Core Feature Bar)
          ✂️ Split, 🗑️ Delete, ⏱️ Speed, 📋 Duplicate, ⬅️ Left, ➡️ Right, 🔄 Reset
          ────────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 20px",
          backgroundColor: "#13131A",
          borderTop: "1px solid #1E1E26",
          borderBottom: "1px solid #1E1E26",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {/* Left Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {/* Split (Cut) Button - InShot's #1 Tool */}
          <button
            type="button"
            onClick={handleSplitClip}
            title="Split selected clip at current playhead needle (Shortcut: S)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#20182E",
              color: "#C084FC",
              border: "1px solid #8B5CF680",
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconScissors size={14} /> Split (Cut)
          </button>

          {/* Delete / Cut Out */}
          {selectedSeg && (
            <button
              type="button"
              onClick={() => handleToggleSegment(selectedSeg.id)}
              title={selectedSeg.isKept ? "Cut this clip from reel" : "Restore clip to reel"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                backgroundColor: selectedSeg.isKept ? "#2A1515" : "#10261A",
                color: selectedSeg.isKept ? "#F87171" : "#4ADE80",
                border: selectedSeg.isKept ? "1px solid #EF444440" : "1px solid #22C55E40",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {selectedSeg.isKept ? (
                <>
                  <IconTrash size={13} /> Cut Clip
                </>
              ) : (
                <>
                  <IconCheck size={13} /> Keep Clip
                </>
              )}
            </button>
          )}

          {/* Speed Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "11px", color: "#8E8E9F", fontWeight: 600, marginLeft: "4px" }}>
              Speed:
            </span>
            {[0.75, 1.0, 1.1, 1.25, 1.5].map((spd) => {
              const isCurr = (selectedSeg?.speed || 1.0) === spd;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => selectedSeg && handleSetSpeed(selectedSeg.id, spd)}
                  style={{
                    backgroundColor: isCurr ? "#00E676" : "#1A1A24",
                    color: isCurr ? "#000" : "#A1A1B2",
                    border: isCurr ? "1px solid #00E676" : "1px solid #2A2A38",
                    padding: "3px 7px",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: isCurr ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {spd}x
                </button>
              );
            })}
          </div>

          {/* Duplicate Clip */}
          {selectedSeg && (
            <button
              type="button"
              onClick={() => handleDuplicateClip(selectedSeg.id)}
              title="Duplicate selected clip"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                backgroundColor: "#1A1A24",
                border: "1px solid #2A2A38",
                color: "#E4E4E7",
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              <IconCopy size={13} /> Dup
            </button>
          )}

          {/* Reorder Left / Right */}
          {selectedSeg && (
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <button
                type="button"
                onClick={() => handleMoveClip(selectedSeg.id, "left")}
                title="Move clip earlier"
                style={{
                  backgroundColor: "#1A1A24",
                  border: "1px solid #2A2A38",
                  color: "#E4E4E7",
                  padding: "6px 8px",
                  borderRadius: "6px 0 0 6px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                <IconArrowLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleMoveClip(selectedSeg.id, "right")}
                title="Move clip later"
                style={{
                  backgroundColor: "#1A1A24",
                  border: "1px solid #2A2A38",
                  color: "#E4E4E7",
                  padding: "6px 8px",
                  borderRadius: "0 6px 6px 0",
                  borderLeft: "none",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                <IconArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Reset Trim */}
          {selectedSeg && (
            <button
              type="button"
              onClick={() => handleResetTrim(selectedSeg.id)}
              title="Reset start/end trim to original"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                backgroundColor: "#1A1A24",
                border: "1px solid #2A2A38",
                color: "#A1A1B2",
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              <IconRotateCcw size={12} /> Reset
            </button>
          )}
        </div>

        {/* Right Zoom Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", color: "#8E8E9F" }}>Zoom:</span>
          <button
            type="button"
            onClick={() => setTimelineZoom((z) => Math.max(0.6, z - 0.3))}
            style={{
              backgroundColor: "#1A1A24",
              border: "1px solid #2A2A38",
              color: "#E4E4E7",
              padding: "4px 8px",
              borderRadius: "5px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            -
          </button>
          <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#00E676", minWidth: "28px", textAlign: "center" }}>
            {timelineZoom.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={() => setTimelineZoom((z) => Math.min(3.5, z + 0.3))}
            style={{
              backgroundColor: "#1A1A24",
              border: "1px solid #2A2A38",
              color: "#E4E4E7",
              padding: "4px 8px",
              borderRadius: "5px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          INSHOT MULTI-TRACK TIMELINE CANVAS
          ────────────────────────────────────────────────────────────────────────── */}
      <div
        ref={timelineScrollRef}
        style={{
          position: "relative",
          backgroundColor: "#0F0F14",
          overflowX: "auto",
          overflowY: "hidden",
          userSelect: "none",
          minHeight: "240px",
          cursor: isScrubbing ? "ew-resize" : "default",
        }}
        onMouseDown={handleTimelineMouseDown}
      >
        <div
          style={{
            position: "relative",
            width: `${timelineContentWidth}px`,
            padding: "0 24px 20px 24px",
            boxSizing: "border-box",
          }}
        >
          {/* 1. Time Ruler Bar with Ticks */}
          <div
            style={{
              position: "relative",
              height: "28px",
              borderBottom: "1px solid #23232E",
              marginBottom: "10px",
              pointerEvents: "none",
            }}
          >
            {Array.from({ length: numTicks }).map((_, i) => {
              const tickSec = i * tickIntervalSec;
              const tickX = tickSec * pxPerSec;
              const isMajor = tickSec % (tickIntervalSec * 2) === 0;

              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${tickX}px`,
                    top: 0,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      fontFamily: "monospace",
                      color: isMajor ? "#9494A8" : "#525260",
                      transform: "translateX(-50%)",
                      marginBottom: "4px",
                    }}
                  >
                    {tickSec.toFixed(1)}s
                  </span>
                  <div
                    style={{
                      width: "1px",
                      height: isMajor ? "8px" : "4px",
                      backgroundColor: isMajor ? "#525260" : "#2E2E3C",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* 2. Draggable Vertical Playhead Needle */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${24 + globalTime * pxPerSec}px`,
              width: "2px",
              backgroundColor: "#FFFFFF",
              boxShadow: "0 0 8px rgba(255,255,255,0.8)",
              zIndex: 20,
              pointerEvents: "none",
              transition: isScrubbing ? "none" : "left 0.05s linear",
            }}
          >
            {/* Top Indicator Triangle / Badge */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "8px solid #FFFFFF",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "#FFFFFF",
                color: "#000",
                fontSize: "9px",
                fontWeight: 800,
                padding: "1px 4px",
                borderRadius: "3px",
                whiteSpace: "nowrap",
                fontFamily: "monospace",
              }}
            >
              {globalTime.toFixed(1)}s
            </div>
          </div>

          {/* 3. Multi-Track Stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* ── TRACK 1: PIP / B-Roll Overlays ── */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: "80px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#A78BFA",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  flexShrink: 0,
                }}
              >
                <IconImage size={12} /> PIP / B-ROLL
              </div>

              <div
                style={{
                  position: "relative",
                  height: "28px",
                  width: `${totalDurationSec * pxPerSec}px`,
                  backgroundColor: "#12121A",
                  borderRadius: "6px",
                  border: "1px solid #232332",
                }}
              >
                {segmentLayouts.map((l) => {
                  const broll = brollPlacements.find((b) => b.afterSegmentId === l.seg.id);
                  if (!broll) return null;
                  const brollStartPx = l.timelineStart * pxPerSec;
                  const brollWidthPx = Math.max(40, (broll.durationSec || 2.5) * pxPerSec);

                  return (
                    <div
                      key={`broll_${l.seg.id}`}
                      style={{
                        position: "absolute",
                        left: `${brollStartPx}px`,
                        width: `${brollWidthPx}px`,
                        height: "100%",
                        backgroundColor: "#6D28D9",
                        borderRadius: "5px",
                        border: "1px solid #A78BFA",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 8px",
                        overflow: "hidden",
                        boxShadow: "0 2px 6px rgba(109,40,217,0.4)",
                      }}
                      title={`B-Roll: ${broll.query}`}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "#FFF",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        🎬 {broll.query}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── TRACK 2: Main Video (Speech Clips) — The Core InShot Track ── */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: "80px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#00E676",
                  display: "center",
                  alignItems: "center",
                  gap: "4px",
                  flexShrink: 0,
                }}
              >
                <IconScissors size={12} /> VIDEO
              </div>

              <div
                style={{
                  position: "relative",
                  height: "64px",
                  width: `${totalDurationSec * pxPerSec}px`,
                  backgroundColor: "#0B0B10",
                  borderRadius: "8px",
                  border: "1px solid #232330",
                  display: "flex",
                }}
              >
                {segmentLayouts.map((layout) => {
                  const seg = layout.seg;
                  const isSelected = seg.id === selectedSeg?.id;
                  const clipWidthPx = layout.duration * pxPerSec;

                  return (
                    <div
                      key={seg.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectClipAndSeek(seg.id);
                      }}
                      style={{
                        position: "relative",
                        width: `${clipWidthPx}px`,
                        height: "100%",
                        backgroundColor: !seg.isKept
                          ? "rgba(239, 68, 68, 0.15)"
                          : isSelected
                          ? "#103E2B"
                          : "#10281E",
                        borderRadius: "6px",
                        border: isSelected ? "2px solid #00E676" : "1px solid rgba(0, 230, 118, 0.2)",
                        boxSizing: "border-box",
                        cursor: "pointer",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "6px",
                        boxShadow: isSelected ? "0 0 12px rgba(0,230,118,0.3)" : "none",
                        opacity: seg.isKept ? 1 : 0.45,
                        transition: draggingHandle ? "none" : "border 0.15s ease",
                      }}
                    >
                      {/* Selected Clip InShot Left Trim Handle */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) =>
                            startDragHandle(e, seg.id, "start", seg.startSec, seg.endSec)
                          }
                          title="Drag to trim clip start"
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: "12px",
                            backgroundColor: "#00E676",
                            cursor: "ew-resize",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 10,
                          }}
                        >
                          <div style={{ width: "2px", height: "16px", backgroundColor: "#000" }} />
                        </div>
                      )}

                      {/* Selected Clip InShot Right Trim Handle */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) =>
                            startDragHandle(e, seg.id, "end", seg.startSec, seg.endSec)
                          }
                          title="Drag to trim clip end"
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: "12px",
                            backgroundColor: "#00E676",
                            cursor: "ew-resize",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 10,
                          }}
                        >
                          <div style={{ width: "2px", height: "16px", backgroundColor: "#000" }} />
                        </div>
                      )}

                      {/* Clip Header: Badge & Duration */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingLeft: isSelected ? "10px" : "2px",
                          paddingRight: isSelected ? "10px" : "2px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 800,
                            color: !seg.isKept ? "#F87171" : isSelected ? "#00E676" : "#A7F3D0",
                          }}
                        >
                          #{layout.index + 1}
                        </span>

                        <span
                          style={{
                            fontSize: "9px",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color: "#E4E4E7",
                            backgroundColor: "rgba(0,0,0,0.5)",
                            padding: "1px 4px",
                            borderRadius: "3px",
                          }}
                        >
                          {layout.duration.toFixed(1)}s
                        </span>
                      </div>

                      {/* Speech Transcript Preview inside clip block */}
                      <div
                        style={{
                          fontSize: "10px",
                          color: !seg.isKept ? "#F87171" : "#D1D5DB",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          paddingLeft: isSelected ? "10px" : "2px",
                          paddingRight: isSelected ? "10px" : "2px",
                        }}
                      >
                        "{seg.transcript}"
                      </div>

                      {/* Audio waveform strip simulator */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1px",
                          height: "8px",
                          opacity: 0.6,
                          paddingLeft: isSelected ? "10px" : "2px",
                          paddingRight: isSelected ? "10px" : "2px",
                        }}
                      >
                        {Array.from({ length: Math.min(30, Math.floor(clipWidthPx / 4)) }).map(
                          (_, bIdx) => (
                            <div
                              key={bIdx}
                              style={{
                                flex: 1,
                                height: `${Math.max(2, (Math.sin(bIdx * 1.5) + 1) * 3.5)}px`,
                                backgroundColor: isSelected ? "#00E676" : "#059669",
                                borderRadius: "1px",
                              }}
                            />
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── TRACK 3: Captions Track ── */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: "80px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#38BDF8",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  flexShrink: 0,
                }}
              >
                <IconScript size={12} /> TEXT
              </div>

              <div
                style={{
                  position: "relative",
                  height: "24px",
                  width: `${totalDurationSec * pxPerSec}px`,
                  backgroundColor: "#0B111A",
                  borderRadius: "6px",
                  border: "1px solid #1E293B",
                  display: "flex",
                }}
              >
                {segmentLayouts.map((l) => (
                  <div
                    key={`text_${l.seg.id}`}
                    style={{
                      width: `${l.duration * pxPerSec}px`,
                      height: "100%",
                      backgroundColor: l.seg.isKept ? "#1E293B" : "transparent",
                      borderRight: "1px solid rgba(255,255,255,0.1)",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 6px",
                      overflow: "hidden",
                    }}
                  >
                    {l.seg.isKept && (
                      <span
                        style={{
                          fontSize: "9px",
                          color: "#38BDF8",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        💬 {l.seg.transcript}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── TRACK 4: Audio / Music Track ── */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: "80px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#F59E0B",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  flexShrink: 0,
                }}
              >
                <IconMusic size={12} /> AUDIO
              </div>

              <div
                style={{
                  position: "relative",
                  height: "22px",
                  width: `${totalDurationSec * pxPerSec}px`,
                  backgroundColor: "#161208",
                  borderRadius: "6px",
                  border: "1px solid #332711",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 8px",
                }}
              >
                <span style={{ fontSize: "9px", color: "#FBBF24", fontWeight: 600 }}>
                  🎵 Synchronized Voice Audio Track (44.1kHz stereo)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          BOTTOM ACTIVE CLIP INSPECTOR
          ────────────────────────────────────────────────────────────────────────── */}
      {selectedSeg && (
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "#111116",
            borderTop: "1px solid #1E1E26",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  color: selectedSeg.isKept ? "#00E676" : "#F87171",
                }}
              >
                Selected: Clip #{segments.findIndex((s) => s.id === selectedSeg.id) + 1}
              </span>

              {selectedSeg.isFiller && (
                <span
                  style={{
                    fontSize: "10px",
                    backgroundColor: "rgba(239,68,68,0.2)",
                    color: "#F87171",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontWeight: 600,
                  }}
                >
                  Detected Filler ({selectedSeg.cutReason || "dead air / um"})
                </span>
              )}

              <span style={{ fontSize: "12px", color: "#8E8E9F" }}>
                Raw Source: {selectedSeg.startSec.toFixed(2)}s ➔ {selectedSeg.endSec.toFixed(2)}s (
                {(selectedSeg.endSec - selectedSeg.startSec).toFixed(1)}s)
              </span>
            </div>

            {/* Quick Trim Presets */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => handleTrimUpdate(selectedSeg.id, selectedSeg.startSec + 0.1, selectedSeg.endSec)}
                style={{
                  backgroundColor: "#1A1A24",
                  border: "1px solid #2A2A38",
                  color: "#E4E4E7",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                Trim Head +0.1s
              </button>
              <button
                type="button"
                onClick={() => handleTrimUpdate(selectedSeg.id, selectedSeg.startSec, Math.max(selectedSeg.startSec + 0.2, selectedSeg.endSec - 0.1))}
                style={{
                  backgroundColor: "#1A1A24",
                  border: "1px solid #2A2A38",
                  color: "#E4E4E7",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                Trim Tail -0.1s
              </button>
            </div>
          </div>

          {/* Transcript display */}
          <div
            style={{
              fontSize: "13px",
              color: selectedSeg.isKept ? "#E4E4E7" : "#71717A",
              backgroundColor: "#0A0A0E",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #1F1F2A",
              marginBottom: "14px",
              lineHeight: 1.4,
            }}
          >
            "{selectedSeg.transcript}"
          </div>

          {/* Direct Fine-Tune Sliders */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              backgroundColor: "#07070A",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #1E1E26",
            }}
          >
            {/* Start Fine Slider */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#8E8E9F", minWidth: "40px" }}>
                START
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, selectedSeg.endSec - 0.2)}
                step={0.05}
                value={selectedSeg.startSec}
                onChange={(e) =>
                  handleTrimUpdate(selectedSeg.id, parseFloat(e.target.value), selectedSeg.endSec)
                }
                style={{ flex: 1, accentColor: "#00E676", cursor: "pointer" }}
              />
              <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#00E676", minWidth: "40px" }}>
                {selectedSeg.startSec.toFixed(2)}s
              </span>
            </div>

            {/* End Fine Slider */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#8E8E9F", minWidth: "40px" }}>
                END
              </span>
              <input
                type="range"
                min={selectedSeg.startSec + 0.2}
                max={Math.max(selectedSeg.startSec + 0.5, selectedSeg.endSec + 10)}
                step={0.05}
                value={selectedSeg.endSec}
                onChange={(e) =>
                  handleTrimUpdate(selectedSeg.id, selectedSeg.startSec, parseFloat(e.target.value))
                }
                style={{ flex: 1, accentColor: "#00E676", cursor: "pointer" }}
              />
              <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#00E676", minWidth: "40px" }}>
                {selectedSeg.endSec.toFixed(2)}s
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
