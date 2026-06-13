"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"

const AUTH_STEPS: Array<{
  id: string
  label: string
  instruction: string
  tip: string
}> = []

const CUSTODY_UPLOADS = [
  {
    id: "sellerTagPhoto",
    label: "Tag Through Both Shoes",
    description: "Show the Relay security tag attached through both shoes.",
    fileName: "relay-tag.jpg",
  },
  {
    id: "sellerPairPhoto",
    label: "Pair Photo",
    description: "Show the pair clearly before boxing.",
    fileName: "seller-pair.jpg",
  },
  {
    id: "sellerBoxPhoto",
    label: "Pair In Box",
    description: "Show the pair placed inside the shipping box.",
    fileName: "seller-box.jpg",
  },
  {
    id: "sellerSealedPackagePhoto",
    label: "Sealed Package / Label",
    description: "Show the sealed package and shipping label area once packed.",
    fileName: "sealed-package.jpg",
  },
] as const

type CustodyUploadId = typeof CUSTODY_UPLOADS[number]["id"]
type PageState = "loading" | "verify" | "ready" | "capturing" | "review" | "certificate" | "submitting" | "done" | "error"

const BG = "#0a0a0f"
const TEXT = "#f5f7fb"
const DIM = "rgba(255,255,255,0.45)"
const ACCENT = "#5f8fff"
const GREEN = "#34d399"
const RED = "#f87171"
const AMBER = "#fbbf24"

const pageBase: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: BG,
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: TEXT,
  margin: 0,
  padding: 0,
  position: "relative",
  zIndex: 1,
  WebkitTextSizeAdjust: "100%",
}

type PublicOrder = {
  id: string
  status: string
  relayTagRequired?: boolean
  checkcheckRequired?: boolean
  checkcheckReason?: string | null
  checkcheckStatus?: string | null
  randomAuditRequired?: boolean
  highRiskSkuRequired?: boolean
  legacyAuthFlow?: boolean
  sellerTier?: string | null
  listing?: {
    brand?: string
    model?: string
  } | null
}

export default function MobileAuthPage() {
  const params = useParams()
  const orderId = params.orderId as string

  const [pageState, setPageState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<PublicOrder | null>(null)

  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, Blob>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const [relayTagScanValue, setRelayTagScanValue] = useState("")
  const [relayTagBarcodeValue, setRelayTagBarcodeValue] = useState("")
  const [custodyFiles, setCustodyFiles] = useState<Record<CustodyUploadId, File | null>>({
    sellerTagPhoto: null,
    sellerPairPhoto: null,
    sellerBoxPhoto: null,
    sellerSealedPackagePhoto: null,
  })
  const [custodyPreviewUrls, setCustodyPreviewUrls] = useState<Record<CustodyUploadId, string | null>>({
    sellerTagPhoto: null,
    sellerPairPhoto: null,
    sellerBoxPhoto: null,
    sellerSealedPackagePhoto: null,
  })
  const [certificateFile, setCertificateFile] = useState<File | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoUrlsRef = useRef<Record<string, string>>({})
  const custodyPreviewUrlsRef = useRef<Record<CustodyUploadId, string | null>>({
    sellerTagPhoto: null,
    sellerPairPhoto: null,
    sellerBoxPhoto: null,
    sellerSealedPackagePhoto: null,
  })
  const fileInputRefs = useRef<Record<CustodyUploadId, HTMLInputElement | null>>({
    sellerTagPhoto: null,
    sellerPairPhoto: null,
    sellerBoxPhoto: null,
    sellerSealedPackagePhoto: null,
  })
  const certInputRef = useRef<HTMLInputElement>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")

  const [uploadProgress, setUploadProgress] = useState(0)

  const currentStep = AUTH_STEPS[currentStepIndex]
  const totalSteps = AUTH_STEPS.length
  const completedCount = Object.keys(capturedPhotos).length
  const relayTagRequired = Boolean(order?.relayTagRequired)
  const checkcheckRequired = Boolean(order?.checkcheckRequired)
  const allPhotosTaken = totalSteps === 0 || completedCount >= totalSteps
  const allCustodyFilesPresent = !relayTagRequired || CUSTODY_UPLOADS.every((upload) => custodyFiles[upload.id])

  useEffect(() => {
    if (!orderId) return
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/orders/" + orderId + "/public-info")
        if (cancelled) return
        const data = await res.json()
        if (!res.ok || !data.id) {
          setError("Order not found. Please check the link and try again.")
          setPageState("error")
          return
        }
        if (data.status !== "paid" && data.status !== "auth_submitted") {
          setError("This order is not awaiting authentication.")
          setPageState("error")
          return
        }
        setOrder(data)
        setPageState("verify")
      } catch {
        if (!cancelled) {
          setError("Could not load order. Check your connection and try again.")
          setPageState("error")
        }
      }
    }

    load()
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
      const res = await fetch("/api/orders/" + orderId + "/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeCode: codeInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCodeError(data.error || "Invalid challenge code.")
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
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
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

  const retakePhoto = () => {
    if (currentStep) {
      setCapturedPhotos((prev) => {
        const next = { ...prev }
        delete next[currentStep.id]
        return next
      })
      if (photoUrls[currentStep.id]) {
        URL.revokeObjectURL(photoUrls[currentStep.id])
      }
      setPhotoUrls((prev) => {
        const next = { ...prev }
        delete next[currentStep.id]
        return next
      })
    }
    setPageState("capturing")
  }

  const acceptPhoto = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1)
      setPageState("capturing")
      return
    }

    stopCamera()
    setPageState("certificate")
  }

  const setCustodyFile = (id: CustodyUploadId, file: File | null) => {
    setCustodyFiles((prev) => ({ ...prev, [id]: file }))
    setCustodyPreviewUrls((prev) => {
      if (prev[id]) {
        URL.revokeObjectURL(prev[id] as string)
      }
      return {
        ...prev,
        [id]: file ? URL.createObjectURL(file) : null,
      }
    })
  }

  const uploadFile = async (file: Blob, fileName: string): Promise<string> => {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("challengeCode", codeInput.trim())
    fd.append("fileName", fileName)
    const res = await fetch("/api/orders/" + orderId + "/upload-photo", { method: "POST", body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Upload failed")
    return data.storageRef || data.url
  }

  const handleSubmit = async () => {
    if (!order) return

    if (relayTagRequired) {
      if (!relayTagScanValue.trim()) {
        setError("Enter the Relay tag serial before submitting.")
        return
      }

      if (!allCustodyFilesPresent) {
        setError("Upload all required Relay custody photos before submitting.")
        return
      }
    }

    if (checkcheckRequired && !certificateFile) {
      setError("Upload the CheckCheck certificate before submitting.")
      return
    }

    setPageState("submitting")
    setUploadProgress(0)
    setError(null)

    try {
      const uploadedAuthUrls: string[] = []
      const totalUploads =
        AUTH_STEPS.length +
        (relayTagRequired ? CUSTODY_UPLOADS.length : 0) +
        (checkcheckRequired && certificateFile ? 1 : 0)

      let completedUploads = 0

      const bumpProgress = () => {
        completedUploads += 1
        setUploadProgress(Math.round((completedUploads / totalUploads) * 100))
      }

      for (const step of AUTH_STEPS) {
        const blob = capturedPhotos[step.id]
        if (!blob) {
          throw new Error("Missing photo for " + step.label)
        }
        const url = await uploadFile(blob, step.id + ".jpg")
        uploadedAuthUrls.push(url)
        bumpProgress()
      }

      const custodyUrls: Record<CustodyUploadId, string | null> = {
        sellerTagPhoto: null,
        sellerPairPhoto: null,
        sellerBoxPhoto: null,
        sellerSealedPackagePhoto: null,
      }

      if (relayTagRequired) {
        for (const upload of CUSTODY_UPLOADS) {
          const file = custodyFiles[upload.id]
          if (!file) {
            throw new Error("Missing required Relay custody photo: " + upload.label)
          }
          custodyUrls[upload.id] = await uploadFile(file, upload.fileName)
          bumpProgress()
        }
      }

      let certificateUrl: string | null = null
      if (checkcheckRequired && certificateFile) {
        const ext = certificateFile.name.split(".").pop() || "jpg"
        certificateUrl = await uploadFile(certificateFile, "checkcheck-certificate." + ext)
        bumpProgress()
      }

      const res = await fetch("/api/orders/" + order.id + "/auth-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authPhotos: uploadedAuthUrls,
          checkcheckCertificateUrl: certificateUrl,
          challengeCode: codeInput.trim(),
          relayTagScanValue: relayTagRequired ? relayTagScanValue.trim() : null,
          relayTagBarcodeValue: relayTagBarcodeValue.trim() || null,
          sellerTagPhotoUrl: custodyUrls.sellerTagPhoto,
          sellerPairPhotoUrl: custodyUrls.sellerPairPhoto,
          sellerBoxPhotoUrl: custodyUrls.sellerBoxPhoto,
          sellerSealedPackagePhotoUrl: custodyUrls.sellerSealedPackagePhoto,
        }),
      })

      if (!res.ok) {
        const payload = await res.json()
        throw new Error(payload.error || "Submit failed")
      }

      setPageState("done")
    } catch (err: any) {
      setError(err.message || "Failed to submit authentication.")
      setPageState("certificate")
    }
  }

  useEffect(() => {
    photoUrlsRef.current = photoUrls
  }, [photoUrls])

  useEffect(() => {
    custodyPreviewUrlsRef.current = custodyPreviewUrls
  }, [custodyPreviewUrls])

  useEffect(() => {
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      Object.values(custodyPreviewUrlsRef.current).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [])

  if (pageState === "loading") {
    return (
      <div style={{ ...pageBase, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: DIM, fontSize: 16 }}>Loading...</p>
      </div>
    )
  }

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
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>Find the code on the order page on your computer.</p>
        </div>
      </div>
    )
  }

  if (pageState === "done") {
    return (
      <div style={{ ...pageBase, padding: "80px 24px 32px" }}>
        <div style={{ textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28, color: GREEN }}>{"✓"}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Authentication Submitted!</h1>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6 }}>
            Your authentication evidence has been uploaded successfully. Return to your computer to continue. If Relay tag or CheckCheck review is required, shipping label generation will unlock after that review clears.
          </p>
        </div>
      </div>
    )
  }

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
            <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 10px" }}>Seller evidence has been simplified</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, margin: 0 }}>
              Relay no longer requires the older 8-angle photo set here. Submit the Relay tag scan and custody photos below, plus a CheckCheck certificate only when this order requires it.
            </p>
          </div>
          <div style={{ backgroundColor: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fcd34d", margin: "0 0 8px" }}>Before you start</p>
            <p style={{ fontSize: 12, color: "rgba(252,211,77,0.6)", lineHeight: 1.7, margin: 0 }}>
              Have the challenge code written on paper nearby.
              {relayTagRequired ? " Keep an unused Relay security tag ready for scanning and follow-up evidence photos." : ""}
              {checkcheckRequired ? " Keep your CheckCheck certificate ready to upload before submission." : ""}
            </p>
          </div>
          {relayTagRequired && (
            <div style={{ backgroundColor: "rgba(95,143,255,0.05)", border: "1px solid rgba(95,143,255,0.2)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 8px" }}>Relay tag evidence required</p>
              <p style={{ fontSize: 12, color: DIM, lineHeight: 1.7, margin: 0 }}>
                You&apos;ll scan the tag serial, upload four custody photos, and Relay will hold the submission for manual review when needed. Automatic photo verification is not assumed here.
              </p>
            </div>
          )}
          {(order?.sellerTier || order?.checkcheckReason || order?.randomAuditRequired || order?.highRiskSkuRequired || order?.status === "auth_submitted") && (
            <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
              {order?.sellerTier && (
                <p style={{ fontSize: 13, color: TEXT, margin: "0 0 8px" }}>
                  Seller tier: <span style={{ fontWeight: 700 }}>{order.sellerTier.replace("tier_", "Tier ")}</span>
                </p>
              )}
              {checkcheckRequired && order?.checkcheckReason && (
                <p style={{ fontSize: 12, color: DIM, margin: "0 0 8px", lineHeight: 1.6 }}>
                  CheckCheck reason: {order.checkcheckReason}
                </p>
              )}
              {order?.randomAuditRequired && (
                <p style={{ fontSize: 12, color: "#fcd34d", margin: "0 0 8px" }}>
                  This order was selected for a random audit.
                </p>
              )}
              {order?.highRiskSkuRequired && (
                <p style={{ fontSize: 12, color: "#fca5a5", margin: "0 0 8px" }}>
                  This order includes a high-risk SKU that requires additional review.
                </p>
              )}
              {order?.status === "auth_submitted" && (
                <p style={{ fontSize: 12, color: DIM, margin: 0, lineHeight: 1.6 }}>
                  You are updating a previously submitted authentication package. Resubmit the required evidence so admin can review it again.
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => setPageState("certificate")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 16, borderRadius: 16, border: "none", backgroundColor: "#ffffff", color: "#000000", fontSize: 16, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", cursor: "pointer", WebkitAppearance: "none" }}
          >
            Continue to Evidence Uploads
          </button>
        </div>
      </div>
    )
  }

  if (pageState === "capturing") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10, backgroundColor: "#000000", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ backgroundColor: "rgba(0,0,0,0.8)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
          <button
            onClick={() => {
              stopCamera()
              if (currentStepIndex === 0 && completedCount === 0) setPageState("ready")
              else setPageState("certificate")
            }}
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
          <button onClick={() => setFacingMode((prev) => prev === "environment" ? "user" : "environment")} style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"↻"}</button>
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

  if (pageState === "review" && currentStep) {
    const previewUrl = photoUrls[currentStep.id]
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10, backgroundColor: "#000", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" }}>
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

  if (pageState === "certificate" || pageState === "submitting") {
    return (
      <div style={{ ...pageBase, padding: "32px 20px 40px", overflowY: "auto" }}>
        <div style={{ maxWidth: 380, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22, color: GREEN }}>{"✓"}</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: "0 0 6px" }}>Review & Submit</h1>
            <p style={{ fontSize: 14, color: DIM, margin: 0 }}>
              {totalSteps === 0
                ? "Legacy 8-angle photos are no longer required for this flow."
                : allPhotosTaken
                  ? "Authentication photos captured."
                  : completedCount + "/" + totalSteps + " authentication photos taken"}
            </p>
          </div>

          {error && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ fontSize: 13, color: RED, margin: 0, flex: 1 }}>{error}</p>
              <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 16, padding: 4 }}>{"✕"}</button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {AUTH_STEPS.map((step, index) => {
              const url = photoUrls[step.id]
              const taken = !!capturedPhotos[step.id]
              return (
                <button
                  key={step.id}
                  onClick={() => {
                    if (taken && pageState !== "submitting") {
                      setCurrentStepIndex(index)
                      setPageState("capturing")
                    }
                  }}
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
              onClick={() => {
                const nextIndex = AUTH_STEPS.findIndex((step) => !capturedPhotos[step.id])
                if (nextIndex >= 0) {
                  setCurrentStepIndex(nextIndex)
                  setPageState("capturing")
                }
              }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: TEXT, fontSize: 14, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer", marginBottom: 20 }}
            >
              {"Continue Taking Photos (" + completedCount + "/" + totalSteps + ")"}
            </button>
          )}

          {relayTagRequired && (
            <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 6px" }}>Relay Tag Binding</h2>
              <p style={{ fontSize: 12, color: DIM, margin: "0 0 12px", lineHeight: 1.6 }}>
                Enter the serial you scanned first. If a barcode value is printed separately, include it too. Evidence will be stored for manual admin review when required.
              </p>
              <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                <input
                  type="text"
                  value={relayTagScanValue}
                  onChange={(event) => setRelayTagScanValue(event.target.value.toUpperCase())}
                  placeholder="Relay tag serial"
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: TEXT, outline: "none" }}
                />
                <input
                  type="text"
                  value={relayTagBarcodeValue}
                  onChange={(event) => setRelayTagBarcodeValue(event.target.value.toUpperCase())}
                  placeholder="Barcode value (optional)"
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)", color: TEXT, outline: "none" }}
                />
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {CUSTODY_UPLOADS.map((upload) => {
                  const previewUrl = custodyPreviewUrls[upload.id]
                  const file = custodyFiles[upload.id]
                  return (
                    <div key={upload.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, margin: "0 0 4px" }}>{upload.label}</p>
                        <p style={{ fontSize: 12, color: DIM, margin: 0 }}>{upload.description}</p>
                      </div>
                      <input
                        ref={(element) => { fileInputRefs.current[upload.id] = element }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(event) => setCustodyFile(upload.id, event.target.files?.[0] || null)}
                      />
                      {previewUrl ? (
                        <img src={previewUrl} alt={upload.label} style={{ width: "100%", borderRadius: 12, marginBottom: 10, maxHeight: 220, objectFit: "cover" }} />
                      ) : null}
                      <button
                        onClick={() => fileInputRefs.current[upload.id]?.click()}
                        disabled={pageState === "submitting"}
                        style={{ width: "100%", border: file ? "2px solid rgba(52,211,153,0.35)" : "2px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: "14px 16px", backgroundColor: file ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)", color: file ? GREEN : TEXT, cursor: "pointer", fontWeight: 600 }}
                      >
                        {file ? "Replace Photo" : "Upload Photo"}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {checkcheckRequired && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 6px" }}>CheckCheck Certificate</h2>
              <p style={{ fontSize: 12, color: DIM, margin: "0 0 12px", lineHeight: 1.5 }}>Upload the required CheckCheck certificate before submitting authentication.</p>
              <input ref={certInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={(event) => setCertificateFile(event.target.files?.[0] || null)} />
              <button
                onClick={() => certInputRef.current?.click()}
                disabled={pageState === "submitting"}
                style={{ width: "100%", border: certificateFile ? "2px dashed rgba(52,211,153,0.3)" : "2px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", backgroundColor: certificateFile ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)", fontFamily: "system-ui, sans-serif" }}
              >
                {certificateFile ? (
                  <div>
                    <p style={{ fontSize: 14, color: GREEN, margin: "0 0 4px" }}>Certificate Ready</p>
                    <p style={{ fontSize: 12, color: DIM, margin: 0 }}>{certificateFile.name}</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 14, color: TEXT, margin: "0 0 4px" }}>Upload CheckCheck Certificate</p>
                    <p style={{ fontSize: 12, color: DIM, margin: 0 }}>PDF or image</p>
                  </div>
                )}
              </button>
            </div>
          )}

          {(relayTagRequired || checkcheckRequired) && (
            <div style={{ backgroundColor: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 14, padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#fde68a", margin: "0 0 6px" }}>Submission gating</p>
              <p style={{ fontSize: 12, color: "rgba(253,230,138,0.75)", lineHeight: 1.6, margin: 0 }}>
                Shipping labels stay blocked until the required Relay tag evidence is bound and any required CheckCheck or admin review is complete.
              </p>
            </div>
          )}

          <button
            onClick={() => void handleSubmit()}
            disabled={pageState === "submitting" || (relayTagRequired && (!relayTagScanValue.trim() || !allCustodyFilesPresent)) || (checkcheckRequired && !certificateFile)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 16, borderRadius: 16, border: "none", backgroundColor: pageState === "submitting" || (relayTagRequired && (!relayTagScanValue.trim() || !allCustodyFilesPresent)) || (checkcheckRequired && !certificateFile) ? "rgba(95,143,255,0.3)" : ACCENT, color: "#ffffff", fontSize: 16, fontWeight: 600, fontFamily: "system-ui, sans-serif", cursor: pageState === "submitting" ? "default" : "pointer", WebkitAppearance: "none" }}
          >
            {pageState === "submitting" ? "Uploading... " + uploadProgress + "%" : "Submit Authentication"}
          </button>

          {relayTagRequired && (!relayTagScanValue.trim() || !allCustodyFilesPresent) && (
            <p style={{ fontSize: 12, color: AMBER, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
              Relay tag serial and all four custody photos are required for this order.
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
}
