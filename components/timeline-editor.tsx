"use client";

import React, { useState, useRef } from "react";
import type { Segment } from "@/lib/v1-pipeline";
import { IconScissors, IconCheck, IconX, IconPlus } from "@/components/icons";

interface TimelineEditorProps {
  segments: Segment[];
  videoUrls: string[];
  onUpdateSegmentTrim: (id: string, startSec: number, endSec: number) => void;
  onToggleSegment: (id: string) => void;
  onSplitSegment?: (id: string, splitSec: number) => void;
  onContinue: () => void;
  keptCount: number;
  fillerCount: number;
}

export function TimelineEditor({
  segments,
  videoUrls,
  onUpdateSegmentTrim,
  onToggleSegment,
  onSplitSegment,
  onContinue,
  keptCount,
  fillerCount,
}: TimelineEditorProps) {
  const [selectedSegId, setSelectedSegId] = useState<string>(segments[0]?.id || "");
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedSeg = segments.find((s) => s.id === selectedSegId) || segments[0];
  const totalDuration = segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0) || 1;

  // Handle playhead seek
  const handleSeek = (timeSec: number) => {
    setPlayheadSec(timeSec);
    if (videoRef.current) {
      videoRef.current.currentTime = timeSec;
      videoRef.current.play().catch(() => {});
    }
  };

  const currentVideoUrl = selectedSeg
    ? videoUrls[selectedSeg.sourceClipIndex] || videoUrls[0]
    : videoUrls[0];

  return (
    <div
      style={{
        backgroundColor: "#111115",
        border: "1px solid #27272A",
        borderRadius: "16px",
        padding: "20px",
        marginTop: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
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
              fontSize: "15px",
              fontWeight: 600,
              color: "#FAFAFA",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <IconScissors size={16} /> InShot-Style Timeline &amp; Trim Studio
          </h3>
          <p style={{ fontSize: "12px", color: "#A1A1AA", margin: "4px 0 0 0" }}>
            {keptCount} kept clips · {fillerCount} cut fillers · Drag handles or adjust timestamps to trim
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onContinue}
          style={{ padding: "8px 18px", fontSize: "13px" }}
        >
          Render {keptCount} Segments ➔
        </button>
      </div>

      {/* Video Preview Player */}
      {currentVideoUrl && (
        <div
          style={{
            position: "relative",
            width: "100%",
            maxHeight: "240px",
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
            style={{ maxHeight: "240px", width: "auto" }}
          />
        </div>
      )}

      {/* Overall Timeline Scrub Bar */}
      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#71717A",
            marginBottom: "6px",
          }}
        >
          <span>Timeline Assembly</span>
          <span>~{totalDuration.toFixed(1)}s Total Duration</span>
        </div>

        <div
          style={{
            display: "flex",
            height: "36px",
            backgroundColor: "#070708",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid #27272A",
            gap: "2px",
            padding: "2px",
          }}
        >
          {segments.map((seg, idx) => {
            const segLen = Math.max(0.2, seg.endSec - seg.startSec);
            const flexWeight = segLen;
            const isSelected = seg.id === selectedSeg?.id;

            return (
              <div
                key={seg.id}
                onClick={() => {
                  setSelectedSegId(seg.id);
                  handleSeek(seg.startSec);
                }}
                style={{
                  flex: flexWeight,
                  backgroundColor: !seg.isKept
                    ? "#1F191D"
                    : isSelected
                    ? "#00E676"
                    : "#059669",
                  border: isSelected ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  opacity: seg.isKept ? 1 : 0.45,
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
                title={`Seg ${idx + 1}: ${seg.startSec.toFixed(1)}s - ${seg.endSec.toFixed(1)}s`}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: !seg.isKept ? "#F87171" : isSelected ? "#000" : "#FFF",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  #{idx + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Segment Cards List with Visual Trim Handles */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "380px", overflowY: "auto", paddingRight: "4px" }}>
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
                  {seg.isFiller && (
                    <span style={{ fontSize: "10px", backgroundColor: "rgba(239,68,68,0.2)", color: "#F87171", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                      Filler ({seg.cutReason || "detected"})
                    </span>
                  )}
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
                    ▶ Play Clip
                  </button>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#00E676", fontWeight: 600 }}>
                    {duration}s
                  </span>
                </div>
              </div>

              {/* Transcript */}
              <p style={{ fontSize: "13px", color: seg.isKept ? "#D4D4D8" : "#71717A", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                "{seg.transcript}"
              </p>

              {/* Trim Handle Sliders */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: "#070708", padding: "8px 12px", borderRadius: "8px", border: "1px solid #1F1F23" }}>
                {/* Trim Start */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600, minWidth: "36px" }}>START</span>
                  <input
                    type="range"
                    min={0}
                    max={seg.endSec - 0.2}
                    step={0.1}
                    value={seg.startSec}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onUpdateSegmentTrim(seg.id, val, seg.endSec);
                    }}
                    style={{ flex: 1, accentColor: "#00E676", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#FAFAFA", width: "36px", textAlign: "right" }}>
                    {seg.startSec.toFixed(1)}s
                  </span>
                </div>

                {/* Trim End */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#A1A1AA", fontWeight: 600, minWidth: "28px" }}>END</span>
                  <input
                    type="range"
                    min={seg.startSec + 0.2}
                    max={seg.endSec + 10} // allow extending trim
                    step={0.1}
                    value={seg.endSec}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onUpdateSegmentTrim(seg.id, seg.startSec, val);
                    }}
                    style={{ flex: 1, accentColor: "#00E676", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#FAFAFA", width: "36px", textAlign: "right" }}>
                    {seg.endSec.toFixed(1)}s
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
