"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  V1_STEP_DEFINITIONS,
  type Segment,
  type EditPlan,
  type BrollPlacement,
  type V1StepEvent,
  type BrandKit,
  DEFAULT_BRAND_KIT,
  type UploadedFile,
} from "@/lib/v1-pipeline";
import { TEMPLATE_CATALOG } from "@/lib/pipeline";
import {
  BrandBar,
  TemplateCatalog,
  SpeedControl,
  HookInput,
  GenerateButton,
  PipelineStepper,
  FinalResult,
  TracePanel,
  ErrorBanner,
} from "@/components/studio-ui";
import { TimelineEditor } from "@/components/timeline-editor";
import {
  IconMic,
  IconMusic,
  IconScissors,
  IconScan,
  IconScript,
  IconLayers,
  IconCheck,
  IconX,
  IconPlus,
  IconImage,
} from "@/components/icons";

/* ======== Types ======== */
interface StepState extends V1StepEvent {
  elapsedMs: number;
}

/* ======== Main Component ======== */
export default function V1Studio() {
  /* -- Auth gate -- */
  const [passcode, setPasscode] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("reeltrix_studio_authorized") === "true")
      setIsAuthorized(true);
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.trim() === "reeltrix2026") {
      localStorage.setItem("reeltrix_studio_authorized", "true");
      setIsAuthorized(true);
    } else setAuthError(true);
  };

  /* -- Upload state (unified) -- */
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* -- Pipeline state -- */
  const [hookText, setHookText] = useState("");
  const [tone, setTone] = useState("cinematic");
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const [finalResult, setFinalResult] = useState<Record<string, unknown> | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  /* -- Segment review state -- */
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showSegmentReview, setShowSegmentReview] = useState(false);
  const [editPlan, setEditPlan] = useState<EditPlan | null>(null);
  const [brollPlacements, setBrollPlacements] = useState<BrollPlacement[]>([]);

  /* -- Brand Kit -- */
  const [brandKit, setBrandKit] = useState<BrandKit>(DEFAULT_BRAND_KIT);

  /* -- Timer -- */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isGenerating) {
      timerRef.current = setInterval(() => {
        setSteps((prev) => {
          const updated = { ...prev };
          for (const key of Object.keys(updated)) {
            const step = updated[Number(key)];
            if (step.status === "running" && step.startedAt) {
              updated[Number(key)] = { ...step, elapsedMs: Date.now() - step.startedAt };
            }
          }
          return updated;
        });
      }, 100);
    } else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isGenerating]);

  /* -- File handling (unified) -- */
  const handleFilesSelect = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    if (uploadedFiles.length + newFiles.length > 10) {
      alert("Maximum 10 files allowed.");
      return;
    }

    setIsUploading(true);
    try {
      for (const file of newFiles) {
        const isVideo = file.type.startsWith("video/") || file.type === "image/gif";
        const isImage = file.type.startsWith("image/") && file.type !== "image/gif";

        if (!isVideo && !isImage) {
          alert(`Unsupported file type: ${file.name}`);
          continue;
        }

        const endpoint = isVideo ? "/api/upload-video" : "/api/upload";
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(endpoint, { method: "POST", body: formData });
        const data = await res.json();

        if (data.url) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              url: data.url,
              type: isVideo ? "video" : "image",
              name: file.name,
              thumbnailUrl: isImage ? URL.createObjectURL(file) : undefined,
            },
          ]);
        } else {
          alert(`Upload failed for ${file.name}: ${data.error || "Unknown error"}`);
        }
      }
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }, [uploadedFiles]);

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /* -- Segment toggle & trim adjustment -- */
  const toggleSegment = (segId: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, isKept: !s.isKept, isFiller: !s.isKept ? false : s.isFiller } : s))
    );
  };

  const updateSegmentTrim = (segId: string, newStart: number, newEnd: number) => {
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== segId) return s;
        const validStart = Math.max(0, Math.min(newStart, s.endSec - 0.2));
        const validEnd = Math.max(validStart + 0.2, newEnd);
        return { ...s, startSec: parseFloat(validStart.toFixed(2)), endSec: parseFloat(validEnd.toFixed(2)) };
      })
    );
  };

  /* -- Generate -- */
  const handleGenerate = async (resumeSegments?: Segment[]) => {
    if (uploadedFiles.length === 0) return;

    setIsGenerating(true);
    setFinalResult(null);
    setPipelineError(null);
    setShowSegmentReview(false);
    if (!resumeSegments) setSteps({});

    // Initialize steps
    const initialSteps: Record<number, StepState> = {};
    V1_STEP_DEFINITIONS.forEach((def) => {
      initialSteps[def.step] = {
        step: def.step,
        name: def.name,
        modelId: def.modelId,
        status: "queued",
        elapsedMs: 0,
      };
    });
    if (!resumeSegments) setSteps(initialSteps);

    try {
      const payload: Record<string, unknown> = {
        fileUrls: uploadedFiles,
        hookText: hookText.trim(),
        tone,
        videoSpeed,
        brandKit,
      };

      if (resumeSegments) {
        payload.existingSegments = resumeSegments;
      }

      const response = await fetch("/api/generate-v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to start pipeline");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSE(eventType, data);
            } catch { /* skip malformed */ }
            eventType = "";
          }
        }
      }
    } catch (err) {
      setPipelineError((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSSE = (type: string, data: Record<string, unknown>) => {
    switch (type) {
      case "step": {
        const s = data as unknown as StepState;
        setSteps((prev) => ({
          ...prev,
          [s.step]: { ...prev[s.step], ...s, elapsedMs: s.durationMs || prev[s.step]?.elapsedMs || 0 },
        }));

        // Capture segments from step 1
        if (s.step === 1 && s.status === "completed" && (data as Record<string, unknown>).segments) {
          setSegments((data as Record<string, unknown>).segments as Segment[]);
        }
        // Capture edit plan from step 2
        if (s.step === 2 && s.status === "completed" && (data as Record<string, unknown>).editPlan) {
          setEditPlan((data as Record<string, unknown>).editPlan as EditPlan);
        }
        // Capture b-roll from step 3
        if (s.step === 3 && s.status === "completed" && (data as Record<string, unknown>).brollPlacements) {
          setBrollPlacements((data as Record<string, unknown>).brollPlacements as BrollPlacement[]);
        }
        break;
      }
      case "preflight": {
        // Show segment review UI
        const segs = (data as Record<string, unknown>).segments as Segment[];
        if (segs && segs.length > 0) {
          setSegments(segs);
          setShowSegmentReview(true);
        }
        break;
      }
      case "complete":
        setFinalResult(data);
        break;
      case "pipeline_error":
        setPipelineError(data.message as string);
        break;
    }
  };

  /* -- Computed -- */
  const totalCost = Object.values(steps).reduce((sum, s) => sum + (s.costUsd || 0), 0);
  const totalTime = Object.values(steps).reduce(
    (sum, s) => sum + (s.status === "running" ? s.elapsedMs : s.durationMs || 0), 0
  );
  const hasSteps = Object.keys(steps).length > 0;
  const canGenerate = uploadedFiles.length > 0 && !isGenerating && !isUploading;
  const fillerCount = segments.filter((s) => s.isFiller).length;
  const keptCount = segments.filter((s) => s.isKept).length;
  const stepIcons = [IconMic, IconScissors, IconScan, IconMusic, IconLayers];

  /* ======== Auth Gate ======== */
  if (!isAuthorized) {
    return (
      <div className="auth-gate" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#070708", padding: "24px" }}>
        <div style={{ maxWidth: "400px", width: "100%", backgroundColor: "#111113", border: "1px solid #27272A", borderRadius: "16px", padding: "32px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 55%, #22d3ee 100%)", color: "white", fontWeight: "bold", fontSize: "20px", marginBottom: "24px", boxShadow: "0 0 16px rgba(139,92,246,0.35)" }}>RT</div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "24px", fontWeight: 600, color: "#FAFAFA", marginBottom: "8px" }}>Reeltrix Engine v1</h2>
          <p style={{ fontSize: "14px", color: "#A1A1AA", marginBottom: "24px" }}>Enter access key to load the editing engine</p>
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input type="password" placeholder="••••••••" value={passcode} onChange={(e) => setPasscode(e.target.value)}
              style={{ width: "100%", height: "44px", backgroundColor: "#070708", border: authError ? "1px solid #F87171" : "1px solid #27272A", borderRadius: "8px", padding: "0 16px", color: "#FAFAFA", textAlign: "center", fontSize: "16px", letterSpacing: "4px", outline: "none" }} />
            {authError && <p style={{ color: "#F87171", fontSize: "12px" }}>Incorrect access key</p>}
            <button type="submit" className="generate-btn">Access Engine</button>
          </form>
        </div>
      </div>
    );
  }

  /* ======== Main Studio ======== */
  return (
    <div className="app">
      <BrandBar />
      <div className="app-shell">
        {/* ── Config rail ── */}
        <aside className="rail">
          {/* Unified Upload */}
          <section className="rail-section">
            <div className="rail-head">
              <span className="rail-label">Upload footage</span>
              <span className="rail-note">{uploadedFiles.length} file(s)</span>
            </div>
            <div
              className={`upload-zone ${isUploading ? "" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFilesSelect(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <span className="spinner" style={{ width: 22, height: 22 }} />
                  <p className="upload-text">Uploading&hellip;</p>
                </>
              ) : (
                <>
                  <span className="upload-icon"><IconPlus size={26} /></span>
                  <p className="upload-text"><strong>Drop videos or photos</strong>&nbsp;or click to browse</p>
                  <p className="upload-hint">MP4, MOV, WebM, JPEG, PNG · Max 50MB each · Up to 10 files</p>
                </>
              )}
              <input ref={fileInputRef} type="file" multiple accept="video/mp4,video/quicktime,video/webm,video/x-m4v,image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={(e) => { handleFilesSelect(e.target.files); e.target.value = ""; }} />
            </div>

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <div className="clip-grid" style={{ marginTop: "8px" }}>
                {uploadedFiles.map((f, i) => (
                  <div className="clip-card" key={i}>
                    {f.type === "video" ? (
                      <video src={f.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <img src={f.thumbnailUrl || f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                    <span className="clip-index">{f.type === "video" ? "🎬" : "📷"} {i + 1}</span>
                    <button type="button" className="icon-btn clip-remove" onClick={() => removeFile(i)}><IconX size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Template/Tone */}
          <TemplateCatalog
            templates={TEMPLATE_CATALOG}
            selected={tone}
            disabled={isGenerating}
            onSelect={(t) => setTone(t)}
          />

          {/* Speed control */}
          <SpeedControl
            value={videoSpeed}
            onChange={setVideoSpeed}
            disabled={isGenerating}
          />

          {/* Hook text */}
          <HookInput value={hookText} onChange={setHookText} maxLength={500} />

          {/* Generate */}
          <GenerateButton
            label={isGenerating ? "Processing…" : isUploading ? "Uploading…" : "Process & Generate"}
            loading={isGenerating}
            disabled={!canGenerate}
            onClick={() => handleGenerate()}
          />

          {pipelineError && <ErrorBanner message={pipelineError} />}
        </aside>

        {/* ── Stage area ── */}
        <main className="stage">
          {/* Pipeline Stepper */}
          {hasSteps && (
            <PipelineStepper
              steps={steps}
              definitions={V1_STEP_DEFINITIONS}
              icons={stepIcons}
              totalCost={totalCost}
              totalTime={totalTime}
            />
          )}

          {/* Segment Review & InShot Timeline Studio */}
          {showSegmentReview && segments.length > 0 && (
            <TimelineEditor
              segments={segments}
              videoUrls={uploadedFiles.map((f) => f.url)}
              onUpdateSegmentTrim={updateSegmentTrim}
              onToggleSegment={toggleSegment}
              onContinue={() => {
                setShowSegmentReview(false);
                handleGenerate(segments);
              }}
              keptCount={keptCount}
              fillerCount={fillerCount}
            />
          )}

          {/* Edit Plan Display */}
          {editPlan && !showSegmentReview && (
            <section className="edit-plan-card fade-in">
              <div className="edit-plan-header">
                <h3><IconScript size={16} /> Edit Plan</h3>
                <span className="rail-note">~{editPlan.totalDurationSec.toFixed(0)}s total</span>
              </div>
              <div className="edit-plan-segments">
                {editPlan.orderedSegmentIds.map((id, i) => {
                  const seg = segments.find((s) => s.id === id);
                  return (
                    <div key={id} className="edit-plan-seg">
                      <span className="edit-plan-num">{i + 1}</span>
                      <span className="edit-plan-text">{seg?.transcript || id}</span>
                    </div>
                  );
                })}
              </div>
              {brollPlacements.length > 0 && (
                <div className="broll-list">
                  <h4 style={{ fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "6px" }}>B-Roll Insertions</h4>
                  {brollPlacements.map((b, i) => (
                    <div key={i} className="broll-item">
                      <span>🎬 "{b.query}"</span>
                      <span className="rail-note">{b.durationSec}s</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Final Result */}
          {finalResult && (finalResult as Record<string, string>).finalUrl && (
            <div className="fade-in">
              <FinalResult
                result={finalResult as { finalUrl?: string; partial?: boolean }}
                onCopy={() => {
                  navigator.clipboard.writeText((finalResult as Record<string, string>).finalUrl || "");
                  alert("Link copied!");
                }}
              />
            </div>
          )}

          {/* Trace Panel */}
          {hasSteps && (
            <TracePanel
              open={traceOpen}
              onToggle={() => setTraceOpen((v) => !v)}
              steps={steps}
              definitions={V1_STEP_DEFINITIONS}
              callCount={Object.values(steps).filter((s) => s.status !== "idle").length}
            />
          )}
        </main>
      </div>
    </div>
  );
}
