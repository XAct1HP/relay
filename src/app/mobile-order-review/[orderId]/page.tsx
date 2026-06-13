"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"

type PageState = "loading" | "verify" | "ready" | "capturing" | "review" | "submitting" | "done" | "error"

type CaptureStep = {
  id: "buyerTagPhoto" | "buyerPairPhoto"
  label: string
  instruction: string
  tip: string
  fileName: string
}

type PublicBuyerOrder = {
  id: string
  status: string
  relayTagRequired: boolean
  legacyAuthFlow: boolean
  expectedRelayTagValue?: string | null
  listing?: {
    brand?: string
    model?: string
  } | null
}

const CAPTURE_STEPS: CaptureStep[] = [
  {
    id: "buyerTagPhoto",
    label: "Tag Attached To Shoes",
    instruction: "Show the Relay tag attached through both shoes.",
    tip: "Keep the tag serial visible and fill the frame with the pair.",
    fileName: "buyer-tag-live.jpg",
  },
  {
    id: "buyerPairPhoto",
    label: "Pair Photo",
    instruction: "Take a clear photo of the delivered pair.",
    tip: "Show the full pair in good lighting.",
    fileName: "buyer-pair-live.jpg",
  },
]

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
}

export default function MobileOrderReviewPage() {
  const params = useParams()
  const orderId = params.orderId as string

  const [pageState, setPageState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<PublicBuyerOrder | null>(null)
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [scannedValue, setScannedValue] = useState("")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, Blob>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoUrlsRef = useRef<Record<string, string>>({})

  const currentStep = CAPTURE_STEPS[currentStepIndex]
  const allPhotosCaptured = CAPTURE_STEPS.every((step) => Boolean(capturedPhotos[step.id]))

  useEffect(() => {
    if (!orderId) return

    let cancelled = false

    async function load() {
      try {
        const response = await fetch(`/api/orders/${orderId}/buyer-review-public-info`)
        const data = await response.json()

        if (cancelled) return

        if (!response.ok || !data?.id) {
          setError(data?.error || "Order not found.")
          setPageState("error")
          return
        }

        if (!data.relayTagRequired || data.legacyAuthFlow) {
          setError("This order does not require buyer Relay verification.")
          setPageState("error")
          return
        }

        if (!["delivered", "review_window", "disputed"].includes(data.status)) {
          setError("Buyer verification is only available after delivery.")
          setPageState("error")
          return
        }

        setOrder(data)
        setPageState("verify")
      } catch {
        if (!cancelled) {
          setError("Could not load the buyer verification page. Please try again.")
          setPageState("error")
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [orderId])

  const handleVerifyCode = async () => {
    if (!codeInput.trim()) {
      setCodeError("Please enter the challenge code.")
      return
    }

    setVerifying(true)
    setCodeError(null)

    try {
      const response = await fetch(`/api/orders/${orderId}/buyer-review-verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeCode: codeInput.trim() }),
      })
      const data = await response.json()

      if (!response.ok) {
        setCodeError(data.error || "Incorrect challenge code.")
        return
      }

      setPageState("ready")
    } catch {
      setCodeError("Something went wrong. Please try again.")
    } finally {
      setVerifying(false)
    }
  }

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setCameraReady(true)
        }
      }
    } catch {
      setError("Could not access camera. Please allow camera permissions.")
      setPageState("error")
    }
  }, [facingMode])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    if (pageState === "capturing") {
      void startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [pageState, startCamera, stopCamera])

  useEffect(() => {
    if (pageState === "capturing") {
      void startCamera()
    }
  }, [facingMode, pageState, startCamera])

  useEffect(() => {
    photoUrlsRef.current = photoUrls
  }, [photoUrls])

  useEffect(() => {
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !currentStep) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const previewUrl = URL.createObjectURL(blob)
      setCapturedPhotos((prev) => ({ ...prev, [currentStep.id]: blob }))
      setPhotoUrls((prev) => {
        if (prev[currentStep.id]) {
          URL.revokeObjectURL(prev[currentStep.id])
        }
        return { ...prev, [currentStep.id]: previewUrl }
      })
      setPageState("review")
    }, "image/jpeg", 0.92)
  }

  const retakeCurrentPhoto = () => {
    if (!currentStep) return

    setCapturedPhotos((prev) => {
      const next = { ...prev }
      delete next[currentStep.id]
      return next
    })
    setPhotoUrls((prev) => {
      if (prev[currentStep.id]) {
        URL.revokeObjectURL(prev[currentStep.id])
      }
      const next = { ...prev }
      delete next[currentStep.id]
      return next
    })
    setPageState("capturing")
  }

  const acceptCurrentPhoto = () => {
    if (currentStepIndex < CAPTURE_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
      setPageState("capturing")
      return
    }

    stopCamera()
    setPageState("ready")
  }

  const uploadCapture = async (file: Blob, fileName: string) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("challengeCode", codeInput.trim())
    formData.append("fileName", fileName)

    const response = await fetch(`/api/orders/${orderId}/upload-photo`, {
      method: "POST",
      body: formData,
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.error || "Failed to upload buyer custody evidence")
    }

    return payload.storageRef || payload.url
  }

  const handleSubmit = async () => {
    if (!order) return

    if (!scannedValue.trim()) {
      setError("Enter the Relay tag serial or barcode before submitting.")
      return
    }

    if (!allPhotosCaptured) {
      setError("Capture both required live photos before submitting.")
      return
    }

    setPageState("submitting")
    setUploadProgress(0)
    setError(null)

    try {
      const buyerTagPhotoUrl = await uploadCapture(capturedPhotos.buyerTagPhoto, "buyer-tag-live.jpg")
      setUploadProgress(50)

      const buyerPairPhotoUrl = await uploadCapture(capturedPhotos.buyerPairPhoto, "buyer-pair-live.jpg")
      setUploadProgress(90)

      const response = await fetch(`/api/orders/${orderId}/buyer-tag-scan-public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeCode: codeInput.trim(),
          scannedValue: scannedValue.trim(),
          buyerTagPhotoUrl,
          buyerPairPhotoUrl,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save buyer verification")
      }

      setUploadProgress(100)
      setPageState("done")
    } catch (submitError: any) {
      setError(submitError.message || "Failed to submit buyer verification.")
      setPageState("ready")
    }
  }

  if (pageState === "loading") {
    return (
      <div style={{ ...pageBase, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: DIM, fontSize: 16 }}>Loading...</p>
      </div>
    )
  }

  if (pageState === "error") {
    return (
      <div style={{ ...pageBase, padding: "72px 24px 32px" }}>
        <div style={{ maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.22)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: RED, fontSize: 24 }}>!</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Cannot start buyer verification</h1>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (pageState === "verify") {
    const listing = order?.listing
    return (
      <div style={{ ...pageBase, padding: "60px 24px 32px" }}>
        <div style={{ maxWidth: 340, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(95,143,255,0.1)", border: "1px solid rgba(95,143,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 20, color: ACCENT }}>{"*"}</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>Buyer Relay Verification</h1>
            {listing && <p style={{ fontSize: 14, color: DIM, margin: 0 }}>{listing.brand} {listing.model}</p>}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 10, textAlign: "center" }}>Enter Challenge Code</label>
            <input
              type="text"
              inputMode="text"
              value={codeInput}
              onChange={(event) => { setCodeInput(event.target.value.toUpperCase()); setCodeError(null) }}
              placeholder="ABC123"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{ display: "block", width: "100%", textAlign: "center", fontSize: 26, fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: "0.25em", padding: "16px", borderRadius: 14, border: "2px solid rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.1)", color: "#ffffff", outline: "none", WebkitAppearance: "none", boxSizing: "border-box" }}
              onKeyDown={(event) => { if (event.key === "Enter") void handleVerifyCode() }}
            />
          </div>
          {codeError && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
              <p style={{ fontSize: 14, color: RED, margin: 0 }}>{codeError}</p>
            </div>
          )}
          <button
            onClick={() => void handleVerifyCode()}
            disabled={verifying || !codeInput.trim()}
            style={{ display: "block", width: "100%", padding: "16px", borderRadius: 14, border: "none", backgroundColor: verifying || !codeInput.trim() ? "rgba(255,255,255,0.15)" : "#ffffff", color: verifying || !codeInput.trim() ? "rgba(255,255,255,0.4)" : "#000000", fontSize: 16, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", textAlign: "center", WebkitAppearance: "none", cursor: verifying || !codeInput.trim() ? "default" : "pointer" }}
          >
            {verifying ? "Verifying..." : "Continue"}
          </button>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>
            Find the code on the order page on your computer.
          </p>
        </div>
      </div>
    )
  }

  if (pageState === "capturing") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10, backgroundColor: "#000000", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ backgroundColor: "rgba(0,0,0,0.8)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => {
              stopCamera()
              setPageState("ready")
            }}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer", padding: 8 }}
          >
            x
          </button>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0 }}>
              Step {currentStepIndex + 1} of {CAPTURE_STEPS.length}
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>{currentStep.label}</p>
          </div>
          <div style={{ width: 36 }} />
        </div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {!cameraReady && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <p style={{ color: ACCENT, fontSize: 14 }}>Starting camera...</p>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.45), transparent)", padding: "72px 16px 24px" }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.92)", textAlign: "center", margin: "0 0 4px" }}>{currentStep.instruction}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", margin: 0 }}>{currentStep.tip}</p>
          </div>
        </div>
        <div style={{ backgroundColor: "#000", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
          <button onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))} style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>
            o
          </button>
          <button onClick={capturePhoto} disabled={!cameraReady} style={{ width: 72, height: 72, borderRadius: "50%", border: "4px solid white", backgroundColor: "transparent", cursor: cameraReady ? "pointer" : "default", opacity: cameraReady ? 1 : 0.35, padding: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "#fff", margin: "0 auto" }} />
          </button>
          <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
            {Object.keys(capturedPhotos).length}/{CAPTURE_STEPS.length}
          </div>
        </div>
      </div>
    )
  }

  if (pageState === "review") {
    const previewUrl = photoUrls[currentStep.id]
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10, backgroundColor: "#000", display: "flex", flexDirection: "column" }}>
        <div style={{ backgroundColor: "rgba(0,0,0,0.8)", padding: "12px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0 }}>
            Step {currentStepIndex + 1} of {CAPTURE_STEPS.length}
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>{currentStep.label}</p>
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          {previewUrl && <img src={previewUrl} alt={currentStep.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
        </div>
        <div style={{ backgroundColor: "#000", padding: "20px 24px", display: "flex", gap: 12 }}>
          <button onClick={retakeCurrentPhoto} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 15, fontWeight: 500 }}>
            Retake
          </button>
          <button onClick={acceptCurrentPhoto} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: ACCENT, border: "none", color: "#fff", fontSize: 15, fontWeight: 600 }}>
            {currentStepIndex < CAPTURE_STEPS.length - 1 ? "Next Photo" : "Use These Photos"}
          </button>
        </div>
      </div>
    )
  }

  if (pageState === "done") {
    return (
      <div style={{ ...pageBase, padding: "72px 24px 32px" }}>
        <div style={{ maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.22)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: GREEN, fontSize: 28 }}>ok</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Buyer verification saved</h1>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>
            Your live Relay tag verification is now attached to this order. Return to your computer and refresh the order page if it is still open there.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...pageBase, padding: "36px 20px 40px" }}>
      <div style={{ maxWidth: 380, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(95,143,255,0.1)", border: "1px solid rgba(95,143,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: ACCENT, fontSize: 24 }}>*</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Buyer Relay Verification</h1>
          <p style={{ fontSize: 14, color: DIM, margin: 0 }}>
            {order?.listing ? `${order.listing.brand} ${order.listing.model}` : `Order ${orderId.slice(0, 8).toUpperCase()}`}
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: RED, margin: 0 }}>{error}</p>
          </div>
        )}

        <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 8px" }}>Live camera required</p>
          <p style={{ fontSize: 12, color: DIM, lineHeight: 1.7, margin: 0 }}>
            Buyer tag verification must be captured live on your phone after you enter the challenge code from your desktop order page.
          </p>
        </div>

        <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Relay tag serial or barcode</label>
          <input
            type="text"
            value={scannedValue}
            onChange={(event) => setScannedValue(event.target.value.toUpperCase())}
            placeholder="Enter the Relay tag serial or barcode"
            style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: TEXT, outline: "none", boxSizing: "border-box" }}
          />
          {order?.expectedRelayTagValue && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "10px 0 0" }}>
              Expected tag: <span style={{ color: ACCENT, fontFamily: "ui-monospace, monospace" }}>{order.expectedRelayTagValue}</span>
            </p>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
          {CAPTURE_STEPS.map((step, index) => {
            const previewUrl = photoUrls[step.id] || ""
            const complete = Boolean(capturedPhotos[step.id]) || Boolean(previewUrl)
            return (
              <button
                key={step.id}
                onClick={() => {
                  setCurrentStepIndex(index)
                  setPageState("capturing")
                }}
                style={{ borderRadius: 14, border: complete ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(255,255,255,0.12)", backgroundColor: complete ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)", padding: 12, textAlign: "left", cursor: "pointer" }}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt={step.label} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />
                ) : (
                  <div style={{ width: "100%", height: 140, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
                    Capture live
                  </div>
                )}
                <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, margin: "0 0 4px" }}>{step.label}</p>
                <p style={{ fontSize: 11, color: complete ? GREEN : DIM, margin: 0 }}>{complete ? "Ready" : "Tap to capture"}</p>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={pageState === "submitting" || !scannedValue.trim() || !allPhotosCaptured}
          style={{ width: "100%", padding: 16, borderRadius: 16, border: "none", backgroundColor: pageState === "submitting" || !scannedValue.trim() || !allPhotosCaptured ? "rgba(95,143,255,0.3)" : ACCENT, color: "#fff", fontSize: 16, fontWeight: 600, cursor: pageState === "submitting" ? "default" : "pointer" }}
        >
          {pageState === "submitting" ? `Uploading... ${uploadProgress}%` : "Submit Buyer Verification"}
        </button>
      </div>
    </div>
  )
}
