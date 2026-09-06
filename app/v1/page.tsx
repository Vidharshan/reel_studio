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

  /* -- Draft Persistence state -- */
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<{ id: string; name: string; updatedAt: string; data: Record<string, unknown> }[]>([]);

  // Load saved drafts on mount
  useEffect(() => {
    try {
      const savedList = localStorage.getItem("reeltrix_v1_saved_projects");
      if (savedList) setSavedDrafts(JSON.parse(savedList));

      const activeDraft = localStorage.getItem("reeltrix_v1_active_draft");
      if (activeDraft) {
        const parsed = JSON.parse(activeDraft);
        if (parsed.uploadedFiles?.length > 0 || parsed.segments?.length > 0) {
          setRestoredNotice(`Found auto-saved draft from ${new Date(parsed.updatedAt || Date.now()).toLocaleTimeString()}`);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-save active state to localStorage whenever changed
  useEffect(() => {
    if (uploadedFiles.length === 0 && segments.length === 0 && !hookText) return;

    try {
      const draftData = {
        updatedAt: new Date().toISOString(),
        uploadedFiles,
        hookText,
        tone,
        videoSpeed,
        segments,
        showSegmentReview,
        editPlan,
        brollPlacements,
        finalResult,
      };
      localStorage.setItem("reeltrix_v1_active_draft", JSON.stringify(draftData));
    } catch { /* ignore quota errors */ }
  }, [uploadedFiles, hookText, tone, videoSpeed, segments, showSegmentReview, editPlan, brollPlacements, finalResult]);

  const loadDraftData = (data: Record<string, unknown>) => {
    if (data.uploadedFiles) setUploadedFiles(data.uploadedFiles as UploadedFile[]);
    if (data.hookText) setHookText(data.hookText as string);
    if (data.tone) setTone(data.tone as string);
    if (data.videoSpeed) setVideoSpeed(data.videoSpeed as number);
    if (data.segments) setSegments(data.segments as Segment[]);
    if (typeof data.showSegmentReview === "boolean") setShowSegmentReview(data.showSegmentReview);
    if (data.editPlan) setEditPlan(data.editPlan as EditPlan);
    if (data.brollPlacements) setBrollPlacements(data.brollPlacements as BrollPlacement[]);
    if (data.finalResult) setFinalResult(data.finalResult as Record<string, unknown>);
    setHasRestoredDraft(true);
    setRestoredNotice(null);
  };

  const handleResumeDraft = () => {
    try {
      const activeDraft = localStorage.getItem("reeltrix_v1_active_draft");
      if (activeDraft) loadDraftData(JSON.parse(activeDraft));
    } catch { /* ignore */ }
  };

  const handleClearDraft = () => {
    localStorage.removeItem("reeltrix_v1_active_draft");
    setUploadedFiles([]);
    setSegments([]);
    setShowSegmentReview(false);
    setEditPlan(null);
    setBrollPlacements([]);
    setFinalResult(null);
    setHookText("");
    setRestoredNotice(null);
    setHasRestoredDraft(false);
  };

  const handleSaveNamedProject = () => {
    const projName = prompt("Enter a name for this project draft:", `Reel Project ${new Date().toLocaleDateString()}`);
    if (!projName) return;

    const newProj = {
      id: `proj_${Date.now()}`,
      name: projName,
      updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      data: {
        uploadedFiles,
        hookText,
        tone,
        videoSpeed,
        segments,
        showSegmentReview,
        editPlan,
        brollPlacements,
        finalResult,
      },
    };

    const updatedList = [newProj, ...savedDrafts.slice(0, 9)];
    setSavedDrafts(updatedList);
    localStorage.setItem("reeltrix_v1_saved_projects", JSON.stringify(updatedList));
    alert(`Project "${projName}" saved to drafts!`);
  };

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

      {/* Auto-Save & Restoration Banner */}
      {restoredNotice && (
        <div style={{ backgroundColor: "#1E1B4B", borderBottom: "1px solid #4338CA", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "#C7D2FE", fontWeight: 500 }}>
            💾 <strong>Auto-Saved Draft Detected:</strong> {restoredNotice}
          </span>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" onClick={handleResumeDraft} className="btn btn-primary" style={{ padding: "4px 14px", fontSize: "12px" }}>
              Resume Draft ➔
            </button>
            <button type="button" onClick={handleClearDraft} style={{ background: "none", border: "1px solid #6366F1", color: "#A5B4FC", padding: "4px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* Saved Projects Toolbar */}
      <div style={{ backgroundColor: "#0D0D10", borderBottom: "1px solid #1F1F23", padding: "8px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "#A1A1AA", fontWeight: 600 }}>PROJECT DRAFTS:</span>
          {savedDrafts.length > 0 ? (
            <select
              onChange={(e) => {
                const proj = savedDrafts.find((p) => p.id === e.target.value);
                if (proj) loadDraftData(proj.data);
              }}
              style={{ backgroundColor: "#18181B", border: "1px solid #27272A", color: "#FAFAFA", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", outline: "none" }}
            >
              <option value="">-- Load Saved Project ({savedDrafts.length}) --</option>
              {savedDrafts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.updatedAt})
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: "12px", color: "#71717A" }}>No saved projects yet</span>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={handleSaveNamedProject}
            disabled={uploadedFiles.length === 0}
            style={{ backgroundColor: "#18181B", border: "1px solid #27272A", color: "#00E676", padding: "4px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
          >
            💾 Save Current Draft
          </button>
          {(uploadedFiles.length > 0 || segments.length > 0) && (
            <button
              type="button"
              onClick={handleClearDraft}
              style={{ backgroundColor: "transparent", border: "none", color: "#F87171", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
            >
              Clear &amp; Reset
            </button>
          )}
        </div>
      </div>

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
                  <p className="upload-hint">MP4, MOV, WebM, JPEG, PNG · No size limit · Unlimited uploads</p>
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
              brollPlacements={brollPlacements}
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
