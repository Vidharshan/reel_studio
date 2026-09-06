"use client";

import React, { useState, useRef } from "react";
import type { Segment, BrollPlacement } from "@/lib/v1-pipeline";
import { IconScissors, IconCheck, IconX, IconMusic, IconImage, IconScript } from "@/components/icons";

interface MultiTrackTimelineProps {
  segments: Segment[];
  videoUrls: string[];
  brollPlacements?: BrollPlacement[];
  onUpdateSegmentTrim: (id: string, startSec: number, endSec: number) => void;
  onToggleSegment: (id: string) => void;
  onContinue: () => void;
  keptCount: number;
  fillerCount: number;
}

export function TimelineEditor({
  segments,
  videoUrls,
  brollPlacements = [],
  onUpdateSegmentTrim,
  onToggleSegment,
  onContinue,
  keptCount,
  fillerCount,
}: MultiTrackTimelineProps) {
  const [selectedSegId, setSelectedSegId] = useState<string>(segments[0]?.id || "");
  const [currentTime, setCurrentTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedSeg = segments.find((s) => s.id === selectedSegId) || segments[0];
  const totalDurationSec = segments.reduce((sum, s) => sum + Math.max(0.1, s.endSec - s.startSec), 0) || 1;

  const currentVideoUrl = selectedSeg
    ? videoUrls[selectedSeg.sourceClipIndex] || videoUrls[0]
    : videoUrls[0];

  const handleSeek = (timeSec: number) => {
    setCurrentTime(timeSec);
    if (videoRef.current) {
      videoRef.current.currentTime = timeSec;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#0B0B0E",
        border: "1px solid #27272A",
        borderRadius: "16px",
        padding: "20px",
        marginTop: "16px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header & Main Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          borderBottom: "1px solid #1F1F23",
          paddingBottom: "12px",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#FAFAFA",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <IconScissors size={18} /> InShot Multi-Track NLE Editor
          </h3>
          <p style={{ fontSize: "12px", color: "#A1A1AA", margin: "4px 0 0 0" }}>
            {keptCount} kept clips · {fillerCount} filler cuts · Drag timeline sliders to trim clips in real-time
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onContinue}
          style={{ padding: "8px 20px", fontSize: "13px", fontWeight: 600 }}
        >
          Render {keptCount} Clips ➔
        </button>
      </div>

      {/* Video Preview Player */}
      {currentVideoUrl && (
        <div
          style={{
            position: "relative",
            width: "100%",
            maxHeight: "220px",
            backgroundColor: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            border: "1px solid #27272A",
          }}
        >
          <video
            ref={videoRef}
            src={currentVideoUrl}
            controls
            playsInline
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            style={{ maxHeight: "220px", width: "auto" }}
          />
        </div>
      )}

      {/* InShot Multi-Track Timeline Canvas */}
      <div
        style={{
          backgroundColor: "#111115",
          border: "1px solid #1F1F23",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#71717A", marginBottom: "10px" }}>
          <span style={{ fontWeight: 600, color: "#A1A1AA" }}>MULTI-LAYER TRACK TIMELINE</span>
          <span style={{ fontFamily: "monospace", color: "#00E676" }}>
            {currentTime.toFixed(1)}s / ~{totalDurationSec.toFixed(1)}s Total
          </span>
        </div>

        {/* Stacked Tracks Container */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* TRACK 1: Main Video (Speech Clips) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600, width: "70px", display: "flex", alignItems: "center", gap: "4px" }}>
              <IconScissors size={12} /> VIDEO
            </span>
            <div style={{ flex: 1, display: "flex", height: "32px", backgroundColor: "#070708", borderRadius: "6px", overflow: "hidden", border: "1px solid #27272A", gap: "2px", padding: "2px" }}>
              {segments.map((seg, idx) => {
                const segLen = Math.max(0.2, seg.endSec - seg.startSec);
                const isSelected = seg.id === selectedSeg?.id;

                return (
                  <div
                    key={seg.id}
                    onClick={() => {
                      setSelectedSegId(seg.id);
                      handleSeek(seg.startSec);
                    }}
                    style={{
                      flex: segLen,
                      backgroundColor: !seg.isKept ? "#2A1515" : isSelected ? "#00E676" : "#059669",
                      borderRadius: "4px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                      opacity: seg.isKept ? 1 : 0.4,
                      border: isSelected ? "2px solid #FFF" : "none",
                      transition: "all 0.15s ease",
                    }}
                    title={`Clip #${idx + 1}: ${seg.startSec.toFixed(1)}s - ${seg.endSec.toFixed(1)}s`}
                  >
                    <span style={{ fontSize: "10px", fontWeight: 700, color: !seg.isKept ? "#F87171" : isSelected ? "#000" : "#FFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      #{idx + 1} ({segLen.toFixed(1)}s)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 2: B-Roll Overlays (Bottom PiP) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600, width: "70px", display: "flex", alignItems: "center", gap: "4px" }}>
              <IconImage size={12} /> B-ROLL
            </span>
            <div style={{ flex: 1, display: "flex", height: "26px", backgroundColor: "#070708", borderRadius: "6px", overflow: "hidden", border: "1px solid #27272A", gap: "2px", padding: "2px" }}>
              {segments.map((seg) => {
                const segLen = Math.max(0.2, seg.endSec - seg.startSec);
                const broll = brollPlacements.find((b) => b.afterSegmentId === seg.id);

                return (
                  <div
                    key={seg.id}
                    style={{
                      flex: segLen,
                      backgroundColor: broll ? "#8B5CF6" : "transparent",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                      border: broll ? "1px dashed rgba(255,255,255,0.4)" : "none",
                    }}
                    title={broll ? `B-Roll: ${broll.query} (Bottom Inset)` : "No B-Roll"}
                  >
                    {broll && (
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "#FFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        🎬 {broll.query} (Bottom Overlay)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 3: Captions / Subtitles Track */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600, width: "70px", display: "flex", alignItems: "center", gap: "4px" }}>
              <IconScript size={12} /> TEXT
            </span>
            <div style={{ flex: 1, display: "flex", height: "24px", backgroundColor: "#070708", borderRadius: "6px", overflow: "hidden", border: "1px solid #27272A", gap: "2px", padding: "2px" }}>
              {segments.map((seg) => {
                const segLen = Math.max(0.2, seg.endSec - seg.startSec);
                return (
                  <div
                    key={seg.id}
                    style={{
                      flex: segLen,
                      backgroundColor: seg.isKept ? "#1E293B" : "transparent",
                      borderRadius: "3px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                    }}
                  >
                    {seg.isKept && (
                      <span style={{ fontSize: "9px", color: "#38BDF8", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        💬 {seg.transcript.slice(0, 18)}...
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 4: Audio Track */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600, width: "70px", display: "flex", alignItems: "center", gap: "4px" }}>
              <IconMusic size={12} /> AUDIO
            </span>
            <div style={{ flex: 1, display: "flex", height: "22px", backgroundColor: "#070708", borderRadius: "6px", overflow: "hidden", border: "1px solid #27272A", gap: "2px", padding: "2px" }}>
              <div style={{ flex: 1, backgroundColor: "rgba(34, 197, 94, 0.18)", borderRadius: "3px", display: "flex", alignItems: "center", padding: "0 8px" }}>
                <span style={{ fontSize: "9px", color: "#22C55E", fontWeight: 600 }}>🎙️ Main Speaker Voice + 🎵 Background Music Mix</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Clip Trim Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "360px", overflowY: "auto" }}>
        {segments.map((seg, idx) => {
          const isSelected = seg.id === selectedSeg?.id;
          const duration = (seg.endSec - seg.startSec).toFixed(1);

          return (
            <div
              key={seg.id}
              onClick={() => setSelectedSegId(seg.id)}
              style={{
                backgroundColor: isSelected ? "#18181D" : "#0D0D10",
                border: isSelected ? "1px solid #00E676" : "1px solid #27272A",
                borderRadius: "10px",
                padding: "12px",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSegment(seg.id);
                    }}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: seg.isKept ? "#00E676" : "#27272A",
                      color: seg.isKept ? "#000" : "#A1A1AA",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {seg.isKept ? <IconCheck size={14} /> : <IconX size={14} />}
                  </button>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: seg.isKept ? "#FAFAFA" : "#71717A" }}>
                    Clip #{idx + 1}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeek(seg.startSec);
                    }}
                    style={{
                      backgroundColor: "#1F1F23",
                      border: "1px solid #3F3F46",
                      color: "#FAFAFA",
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    ▶ Play
                  </button>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#00E676", fontWeight: 600 }}>
                    {duration}s
                  </span>
                </div>
              </div>

              <p style={{ fontSize: "13px", color: seg.isKept ? "#D4D4D8" : "#71717A", margin: "0 0 10px 0" }}>
                "{seg.transcript}"
              </p>

              {/* Slider Trimmers */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: "#070708", padding: "8px 12px", borderRadius: "8px", border: "1px solid #1F1F23" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600 }}>START</span>
                  <input
                    type="range"
                    min={0}
                    max={seg.endSec - 0.2}
                    step={0.1}
                    value={seg.startSec}
                    onChange={(e) => onUpdateSegmentTrim(seg.id, parseFloat(e.target.value), seg.endSec)}
                    style={{ flex: 1, accentColor: "#00E676", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#FAFAFA" }}>{seg.startSec.toFixed(1)}s</span>
                </div>

                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600 }}>END</span>
                  <input
                    type="range"
                    min={seg.startSec + 0.2}
                    max={seg.endSec + 10}
                    step={0.1}
                    value={seg.endSec}
                    onChange={(e) => onUpdateSegmentTrim(seg.id, seg.startSec, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "#00E676", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#FAFAFA" }}>{seg.endSec.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
