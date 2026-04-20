"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"

const AUTH_STEPS = [
  { id: "front", label: "Front", instruction: "Take a clear photo of the front of the shoe.", tip: "Make sure the entire front is visible and well-lit." },
  { id: "back", label: "Back", instruction: "Take a clear photo of the back/heel of the shoe.", tip: "Show the heel tab and any branding clearly." },
  { id: "medial", label: "Medial Side", instruction: "Take a photo of the inside (medial) side.", tip: "Capture the full profile from the inner side." },
  { id: "lateral", label: "Lateral Side", instruction: "Take a photo of the outside (lateral) side.", tip: "Capture the full profile from the outer side." },
  { id: "sole", label: "Sole", instruction: "Take a clear photo of the bottom sole.", tip: "Show the entire sole pattern and any wear." },
  { id: "size-tag", label: "Size Tag", instruction: "Take a close-up of the size tag inside the shoe.", tip: "Make sure the text is legible." },
  { id: "challenge-code", label: "With Challenge Code", instruction: "Place the challenge code next to the shoe and photograph both.", tip: "Write the code on paper and place it beside the shoe." },
  { id: "packed-shipment", label: "Packed Shipment", instruction: "Show the shoes packed in the box with the printed CheckCheck certificate visible inside.", tip: "The printed certificate must be inside the shipment box." },
]

type PageState = "loading" | "verify" | "ready" | "capturing" | "review" | "certificate" | "submitting" | "done" | "error"

const BG = "#0a0a0f"
const TEXT = "#f5f7fb"
const DIM = "rgba(255,255,255,0.45)"
const ACCENT = "#5f8fff"
const GREEN = "#34d399"
const RED = "#f87171"

const pageBase: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: BG,
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: TEXT,
  margin: 0,
  padding: 0,
  WebkitTextSizeAdjust: "100%",
}

export default function MobileAuthPage() {
  const params = useParams()
  const orderId = params.orderId as string

  const [pageState, setPageState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<any>(null)

  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, Blob>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")

  const [certificateUrl, setCertificateUrl] = useState<string | null>(null)
  const [certificateUploading, setCertificateUploading] = useState(false)
  const certInputRef = useRef<HTMLInputElement>(null)

  const [uploadProgress, setUploadProgress] = useState(0)

  const currentStep = AUTH_STEPS[currentStepIndex]
  const totalSteps = AUTH_STEPS.length
  const completedCount = Object.keys(capturedPhotos).length

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/orders/" + orderId + "/public-info")
        if (cancelled) return
        const data = await res.json()
        if (!res.ok || !data.id) { setError("Order not found. Please check the link and try again."); setPageState("error"); return }
        if (data.status !== "paid") { setError("This order is not awaiting authentication."); setPageState("error"); return }
        setOrder(data)
        setPageState("verify")
      } catch { if (!cancelled) { setError("Could not load order. Check your connection and try again."); setPageState("error") } }
    }
    load()
    return () => { cancelled = true }
  }, [orderId])

  const handleVerifyCode = async () => {
    if (!codeInput.trim()) { setCodeError("Please enter the challenge code."); return }
    setVerifying(true)
    setCodeError(null)
    try {
      const res = await fetch("/api/orders/" + orderId + "/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeCode: codeInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setCodeError(data.error || "Invalid challenge code."); return }
      setPageState("ready")
    } catch { setCodeError("Something went wrong. Please try again.") } finally { setVerifying(false) }
  }

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setCameraReady(true) }
      }
    } catch { setError("Could not access camera. Please allow camera permissions.") }
  }, [facingMode])

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    if (pageState === "capturing") { startCamera() } else { stopCamera() }
    return () => { stopCamera() }
  }, [pageState, startCamera, stopCamera])

  useEffect(() => { if (pageState === "capturing") startCamera() }, [facingMode, pageState, startCamera])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !currentStep) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const previewUrl = URL.createObjectURL(blob)
      setCapturedPhotos(prev => ({ ...prev, [currentStep.id]: blob }))
      setPhotoUrls(prev => {
        if (prev[currentStep.id]) URL.revokeObjectURL(prev[currentStep.id])
        return { ...prev, [currentStep.id]: previewUrl }
      })
      setPageState("review")
    }, "image/jpeg", 0.92)
  }

  const retakePhoto = () => {
    if (currentStep) {
      setCapturedPhotos(prev => { const n = { ...prev }; delete n[currentStep.id]; return n })
      if (photoUrls[currentStep.id]) URL.revokeObjectURL(photoUrls[currentStep.id])
      setPhotoUrls(prev => { const n = { ...prev }; delete n[currentStep.id]; return n })
    }
    setPageState("capturing")
  }

  const acceptPhoto = () => {
    if (currentStepIndex < totalSteps - 1) { setCurrentStepIndex(prev => prev + 1); setPageState("capturing") }
    else { stopCamera(); setPageState("certificate") }
  }

  const uploadFile = async (file: Blob, fileName: string): Promise<string> => {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("challengeCode", codeInput.trim())
    fd.append("fileName", fileName)
    const res = await fetch("/api/orders/" + orderId + "/upload-photo", { method: "POST", body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Upload failed")
    return data.url
  }

  const handleCertificateUpload = async (file: File) => {
    if (!order) return
    setCertificateUploading(true)
    try {
      const ext = file.name.split(".").pop() || "jpg"
      const url = await uploadFile(file, "checkcheck-certificate." + ext)
      setCertificateUrl(url)
    } catch (err: any) { setError(err.message || "Failed to upload certificate.") } finally { setCertificateUploading(false) }
  }

  const handleSubmit = async () => {
    if (!order || completedCount < totalSteps || !certificateUrl) return
    setPageState("submitting")
    setUploadProgress(0)
    try {
      const urls: string[] = []
      for (let i = 0; i < AUTH_STEPS.length; i++) {
        const step = AUTH_STEPS[i]
        const blob = capturedPhotos[step.id]
        if (!blob) { setError("Missing photo for " + step.label); setPageState("certificate"); return }
        const url = await uploadFile(blob, step.id + ".jpg")
        urls.push(url)
        setUploadProgress(Math.round(((i + 1) / totalSteps) * 100))
      }
      const res = await fetch("/api/orders/" + order.id + "/auth-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authPhotos: urls, checkcheckCertificateUrl: certificateUrl, challengeCode: codeInput.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Submit failed") }
      setPageState("done")
    } catch (err: any) { setError(err.message || "Failed to submit authentication."); setPageState("certificate") }
  }

  useEffect(() => {
    return () => { Object.values(photoUrls).forEach(u => URL.revokeObjectURL(u)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // LOADING
  if (pageState === "loading") {
    return (
      <div style={{ ...pageBase, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: DIM, fontSize: 16 }}>Loading...</p>
      </div>
    )
  }

  // ERROR
  if (pageState === "error") {
    return (
      <div style={{ ...pageBase, padding: "80px 24px 32px" }}>
        <div style={{ textAlign: "center", maxWidth: 320, margin: "0 auto" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: RED }}>{"!"}</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    )
  }

  // VERIFY
  if (pageState === "verify") {
    const listing = order?.listing
    return (
      <div style={{ ...pageBase, padding: "60px 24px 32px" }}>
        <div style={{ maxWidth: 340, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(95,143,255,0.1)", border: "1px solid rgba(95,143,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 20, color: ACCENT }}>{"*"}</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>Relay Authentication</h1>
            {listing && <p style={{ fontSize: 14, color: DIM, margin: 0 }}>{listing.brand} {listing.model}</p>}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 10, textAlign: "center" }}>Enter Challenge Code</label>
            <input
              type="text"
              inputMode="text"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(null) }}
              placeholder="ABC123"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{ display: "block", width: "100%", textAlign: "center", fontSize: 26, fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: "0.25em", padding: "16px", borderRadius: 14, border: "2px solid rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.1)", color: "#ffffff", outline: "none", WebkitAppearance: "none" as any, boxSizing: "border-box" as any }}
              onKeyDown={e => { if (e.key === "Enter") handleVerifyCode() }}
            />
          </div>
          {codeError && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
              <p style={{ fontSize: 14, color: RED, margin: 0 }}>{codeError}</p>
            </div>
          )}
          <button
            onClick={handleVerifyCode}
            disabled={verifying || !codeInput.trim()}
            style={{ display: "block", width: "100%", padding: "16px", borderRadius: 14, border: "none", backgroundColor: verifying || !codeInput.trim() ? "rgba(255,255,255,0.15)" : "#ffffff", color: verifying || !codeInput.trim() ? "rgba(255,255,255,0.4)" : "#000000", fontSize: 16, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", textAlign: "center" as any, WebkitAppearance: "none" as any, cursor: verifying || !codeInput.trim() ? "default" : "pointer" }}
          >
            {verifying ? "Verifying..." : "Continue"}
          </button>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>Find the code on the order page on your computer.</p>
        </div>
      </div>
    )
  }

  // DONE
  if (pageState === "done") {
    return (
      <div style={{ ...pageBase, padding: "80px 24px 32px" }}>
        <div style={{ textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, color: GREEN }}>{"✓"}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Authentication Submitted!</h1>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>Your photos have been uploaded successfully. You can now return to your computer to generate the shipping label.</p>
        </div>
      </div>
    )
  }

  // READY
  if (pageState === "ready") {
    const listing = order?.listing
    return (
      <div style={{ ...pageBase, padding: "40px 20px 32px", overflowY: "auto" }}>
        <div style={{ maxWidth: 360, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(95,143,255,0.1)", border: "1px solid rgba(95,143,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24, color: ACCENT }}>{"⛨"}</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 6px" }}>Authenticate Item</h1>
            <p style={{ fontSize: 14, color: DIM, margin: 0 }}>{listing ? listing.brand + " " + listing.model : "Order #" + orderId.slice(0, 8).toUpperCase()}</p>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 14px" }}>{"You'll take " + totalSteps + " photos:"}</h2>
            {AUTH_STEPS.map((step, i) => (
              <div key={step.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: i < totalSteps - 1 ? 10 : 0 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "rgba(95,143,255,0.1)", color: ACCENT, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>{step.label}</span>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fcd34d", margin: "0 0 8px" }}>Before you start</p>
            <p style={{ fontSize: 12, color: "rgba(252,211,77,0.6)", lineHeight: 1.7, margin: 0 }}>All photos are taken live with your camera. Have the challenge code written on paper nearby. Print your CheckCheck certificate for the shipment photo.</p>
          </div>
          <button
            onClick={() => { setCurrentStepIndex(0); setPageState("capturing") }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 16, borderRadius: 16, border: "none", backgroundColor: "#ffffff", color: "#000000", fontSize: 16, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", cursor: "pointer", WebkitAppearance: "none" as any }}
          >
            Start Taking Photos
          </button>
        </div>
      </div>
    )
  }

  // CAPTURING
  if (pageState === "capturing") {
    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "#000000", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ backgroundColor: "rgba(0,0,0,0.8)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
          <button
            onClick={() => { stopCamera(); if (currentStepIndex === 0 && completedCount === 0) setPageState("ready"); else setPageState("certificate") }}
            style={{ background: "none", border: "none", padding: 8, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18 }}
          >{"✕"}</button>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0 }}>{"Step " + (currentStepIndex + 1) + " of " + totalSteps}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>{currentStep?.label}</p>
          </div>
          <div style={{ width: 36 }}>{" "}</div>
        </div>
        <div style={{ height: 3, backgroundColor: "rgba(255,255,255,0.1)" }}>
          <div style={{ height: "100%", backgroundColor: ACCENT, width: ((currentStepIndex / totalSteps) * 100) + "%", transition: "width 0.3s" }}>{" "}</div>
        </div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {!cameraReady && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <p style={{ color: ACCENT, fontSize: 14 }}>Starting camera...</p>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.5), transparent)", paddingTop: 60, paddingBottom: 24, paddingLeft: 16, paddingRight: 16 }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", textAlign: "center", margin: "0 0 4px" }}>{currentStep?.instruction}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", margin: 0 }}>{currentStep?.tip}</p>
          </div>
        </div>
        <div style={{ backgroundColor: "#000", padding: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
          <button onClick={() => setFacingMode(p => p === "environment" ? "user" : "environment")} style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"↻"}</button>
          <button onClick={capturePhoto} disabled={!cameraReady} style={{ width: 72, height: 72, borderRadius: "50%", border: "4px solid white", backgroundColor: "transparent", cursor: cameraReady ? "pointer" : "default", opacity: cameraReady ? 1 : 0.3, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "#fff" }}>{" "}</div>
          </button>
          <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{completedCount + "/" + totalSteps}</span>
          </div>
        </div>
      </div>
    )
  }

  // REVIEW
  if (pageState === "review" && currentStep) {
    const previewUrl = photoUrls[currentStep.id]
    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "#000", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ backgroundColor: "rgba(0,0,0,0.8)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
          <div style={{ width: 36 }}>{" "}</div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0 }}>{"Step " + (currentStepIndex + 1) + " of " + totalSteps}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>{currentStep.label}</p>
          </div>
          <div style={{ width: 36 }}>{" "}</div>
        </div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {previewUrl && <img src={previewUrl} alt={currentStep.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
        </div>
        <div style={{ backgroundColor: "#000", padding: "20px 24px", display: "flex", gap: 12 }}>
          <button onClick={retakePhoto} style={{ flex: 1, padding: "14px", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>Retake</button>
          <button onClick={acceptPhoto} style={{ flex: 1, padding: "14px", borderRadius: 12, backgroundColor: ACCENT, border: "none", color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>{currentStepIndex < totalSteps - 1 ? "Next" : "Done"}</button>
        </div>
      </div>
    )
  }

  // CERTIFICATE + SUBMIT
  if (pageState === "certificate" || pageState === "submitting") {
    const allPhotosTaken = completedCount >= totalSteps
    return (
      <div style={{ ...pageBase, padding: "32px 20px 40px", overflowY: "auto" }}>
        <div style={{ maxWidth: 360, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22, color: GREEN }}>{"✓"}</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: "0 0 6px" }}>{"Review & Submit"}</h1>
            <p style={{ fontSize: 14, color: DIM, margin: 0 }}>{allPhotosTaken ? "All photos captured!" : completedCount + "/" + totalSteps + " photos taken"}</p>
          </div>
          {error && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ fontSize: 13, color: RED, margin: 0, flex: 1 }}>{error}</p>
              <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 16, padding: 4 }}>{"✕"}</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {AUTH_STEPS.map((step, i) => {
              const url = photoUrls[step.id]
              const taken = !!capturedPhotos[step.id]
              return (
                <button
                  key={step.id}
                  onClick={() => { if (taken && pageState !== "submitting") { setCurrentStepIndex(i); setPageState("capturing") } }}
                  style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: taken ? "2px solid rgba(52,211,153,0.5)" : "2px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", position: "relative", cursor: taken ? "pointer" : "default", padding: 0 }}
                >
                  {url ? (
                    <img src={url} alt={step.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 16 }}>{"o"}</div>
                  )}
                  {taken && (
                    <div style={{ position: "absolute", top: 3, right: 3, width: 14, height: 14, borderRadius: "50%", backgroundColor: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff" }}>{"✓"}</div>
                  )}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.7)", padding: "2px 4px", textAlign: "center" }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>{step.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {!allPhotosTaken && (
            <button
              onClick={() => { const idx = AUTH_STEPS.findIndex(s => !capturedPhotos[s.id]); if (idx >= 0) { setCurrentStepIndex(idx); setPageState("capturing") } }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: TEXT, fontSize: 14, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer", marginBottom: 20 }}
            >
              {"Continue Taking Photos (" + completedCount + "/" + totalSteps + ")"}
            </button>
          )}
          {allPhotosTaken && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 6px" }}>CheckCheck Certificate</h2>
              <p style={{ fontSize: 12, color: DIM, margin: "0 0 12px", lineHeight: 1.5 }}>Upload your CheckCheck certificate. The printed copy must be inside the shipment box.</p>
              <input ref={certInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCertificateUpload(f) }} />
              <button
                onClick={() => certInputRef.current?.click()}
                disabled={certificateUploading || pageState === "submitting"}
                style={{ width: "100%", border: certificateUrl ? "2px dashed rgba(52,211,153,0.3)" : "2px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: certificateUploading ? "default" : "pointer", backgroundColor: certificateUrl ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)", fontFamily: "system-ui, sans-serif" }}
              >
                {certificateUploading ? (
                  <p style={{ fontSize: 14, color: ACCENT, margin: 0 }}>Uploading...</p>
                ) : certificateUrl ? (
                  <p style={{ fontSize: 14, color: GREEN, margin: 0 }}>Certificate Uploaded</p>
                ) : (
                  <div>
                    <p style={{ fontSize: 14, color: TEXT, margin: "0 0 4px" }}>Upload CheckCheck Certificate</p>
                    <p style={{ fontSize: 12, color: DIM, margin: 0 }}>PDF or image</p>
                  </div>
                )}
              </button>
            </div>
          )}
          {allPhotosTaken && (
            <button
              onClick={handleSubmit}
              disabled={!certificateUrl || pageState === "submitting"}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 16, borderRadius: 16, border: "none", backgroundColor: (!certificateUrl || pageState === "submitting") ? "rgba(95,143,255,0.3)" : ACCENT, color: "#ffffff", fontSize: 16, fontWeight: 600, fontFamily: "system-ui, sans-serif", cursor: (!certificateUrl || pageState === "submitting") ? "default" : "pointer", WebkitAppearance: "none" as any }}
            >
              {pageState === "submitting" ? "Uploading... " + uploadProgress + "%" : "Submit Authentication"}
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
