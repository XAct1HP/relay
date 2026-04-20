"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ChevronRight,
  Shield,
  Loader2,
  X,
  FileText,
  Package,
  Lock,
  Check,
} from "lucide-react"

const AUTH_STEPS = [
  {
    id: "front",
    label: "Front",
    instruction: "Take a clear photo of the front of the shoe.",
    tip: "Make sure the entire front is visible and well-lit.",
  },
  {
    id: "back",
    label: "Back",
    instruction: "Take a clear photo of the back/heel of the shoe.",
    tip: "Show the heel tab and any branding clearly.",
  },
  {
    id: "medial",
    label: "Medial Side",
    instruction: "Take a photo of the inside (medial) side of the shoe.",
    tip: "Capture the full profile from the inner side.",
  },
  {
    id: "lateral",
    label: "Lateral Side",
    instruction: "Take a photo of the outside (lateral) side of the shoe.",
    tip: "Capture the full profile from the outer side.",
  },
  {
    id: "sole",
    label: "Sole",
    instruction: "Take a clear photo of the bottom sole.",
    tip: "Show the entire sole pattern and any wear.",
  },
  {
    id: "size-tag",
    label: "Size Tag",
    instruction: "Take a close-up of the size tag inside the shoe.",
    tip: "Make sure the text is legible — get close and focus.",
  },
  {
    id: "challenge-code",
    label: "With Challenge Code",
    instruction: "Place the challenge code next to the shoe and take a photo showing both.",
    tip: "Write the code on paper and place it beside the shoe so both are clearly visible.",
  },
  {
    id: "packed-shipment",
    label: "Packed Shipment",
    instruction: "Show the shoes packed in the box with the printed CheckCheck certificate visible inside.",
    tip: "The certificate must be printed and placed inside the shipment box alongside the shoes.",
  },
]

type PageState = "loading" | "verify" | "ready" | "capturing" | "review" | "certificate" | "submitting" | "done" | "error"

export default function MobileAuthPage() {
  const params = useParams()
  const orderId = params.orderId as string

  const [pageState, setPageState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<any>(null)

  // Challenge code verification
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Photo capture state
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, Blob>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")

  // Certificate state
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null)
  const [certificateUploading, setCertificateUploading] = useState(false)
  const certInputRef = useRef<HTMLInputElement>(null)

  // Submitting
  const [uploadProgress, setUploadProgress] = useState(0)

  const currentStep = AUTH_STEPS[currentStepIndex]
  const totalSteps = AUTH_STEPS.length
  const completedCount = Object.keys(capturedPhotos).length

  // ── Load order (via public API — no login required) ──
  useEffect(() => {
    async function loadOrder() {
      if (!orderId) return

      try {
        const res = await fetch(`/api/orders/${orderId}/public-info`)
        const data = await res.json()

        if (!res.ok || !data.id) {
          setError("Order not found. Please check the link and try again.")
          setPageState("error")
          return
        }

        if (data.status !== "paid") {
          setError("This order has already been authenticated or is not in the correct state.")
          setPageState("error")
          return
        }

        setOrder(data)
        setPageState("verify")
      } catch (err) {
        setError("Could not load order. Please check your connection and try again.")
        setPageState("error")
      }
    }

    loadOrder()
  }, [orderId])

  // ── Verify challenge code ──
  const handleVerifyCode = async () => {
    if (!codeInput.trim()) {
      setCodeError("Please enter the challenge code.")
      return
    }

    setVerifying(true)
    setCodeError(null)

    try {
      const res = await fetch(`/api/orders/${orderId}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeCode: codeInput.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setCodeError(data.error || "Invalid challenge code.")
        return
      }

      // Code is valid — proceed to ready state
      setPageState("ready")
    } catch (err) {
      setCodeError("Something went wrong. Please try again.")
    } finally {
      setVerifying(false)
    }
  }

  // ── Camera management ──
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
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
    } catch (err) {
      console.error("Camera error:", err)
      setError("Could not access camera. Please allow camera permissions and try again.")
    }
  }, [facingMode])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    if (pageState === "capturing") {
      startCamera()
    } else {
      stopCamera()
    }
    return () => { stopCamera() }
  }, [pageState, startCamera, stopCamera])

  useEffect(() => {
    if (pageState === "capturing") {
      startCamera()
    }
  }, [facingMode, pageState, startCamera])

  // ── Capture photo ──
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !currentStep) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    canvas.toBlob(
      (blob) => {
        if (!blob) return

        const previewUrl = URL.createObjectURL(blob)

        setCapturedPhotos((prev) => ({ ...prev, [currentStep.id]: blob }))
        setPhotoUrls((prev) => {
          if (prev[currentStep.id]) URL.revokeObjectURL(prev[currentStep.id])
          return { ...prev, [currentStep.id]: previewUrl }
        })

        setPageState("review")
      },
      "image/jpeg",
      0.92
    )
  }

  // ── Retake photo ──
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

  // ── Accept photo & move to next ──
  const acceptPhoto = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1)
      setPageState("capturing")
    } else {
      stopCamera()
      setPageState("certificate")
    }
  }

  // ── Helper: upload file via server API (challenge-code auth) ──
  const uploadFile = async (file: Blob, fileName: string): Promise<string> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("challengeCode", codeInput.trim())
    formData.append("fileName", fileName)

    const res = await fetch(`/api/orders/${orderId}/upload-photo`, {
      method: "POST",
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Upload failed")
    return data.url
  }

  // ── Certificate upload ──
  const handleCertificateUpload = async (file: File) => {
    if (!order) return
    setCertificateUploading(true)

    try {
      const ext = file.name.split(".").pop() || "jpg"
      const url = await uploadFile(file, `checkcheck-certificate.${ext}`)
      setCertificateUrl(url)
    } catch (err: any) {
      console.error("Certificate upload failed:", err)
      setError(err.message || "Failed to upload certificate.")
    } finally {
      setCertificateUploading(false)
    }
  }

  // ── Submit all photos ──
  const handleSubmit = async () => {
    if (!order || Object.keys(capturedPhotos).length < totalSteps || !certificateUrl) return

    setPageState("submitting")
    setUploadProgress(0)

    try {
      const urls: string[] = []

      for (let i = 0; i < AUTH_STEPS.length; i++) {
        const step = AUTH_STEPS[i]
        const blob = capturedPhotos[step.id]
        if (!blob) {
          setError(`Missing photo for ${step.label}`)
          setPageState("certificate")
          return
        }

        const url = await uploadFile(blob, `${step.id}.jpg`)
        urls.push(url)
        setUploadProgress(Math.round(((i + 1) / AUTH_STEPS.length) * 100))
      }

      // Submit via challenge-code-authenticated endpoint
      const res = await fetch(`/api/orders/${order.id}/auth-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authPhotos: urls,
          checkcheckCertificateUrl: certificateUrl,
          challengeCode: codeInput.trim(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to submit authentication")
      }

      setPageState("done")
    } catch (err: any) {
      console.error("Submit error:", err)
      setError(err.message || "Failed to submit authentication.")
      setPageState("certificate")
    }
  }

  // ── Cleanup blob URLs on unmount ──
  useEffect(() => {
    return () => {
      Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ════════════════════════════════════
  // RENDER: Loading
  // ════════════════════════════════════
  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#5f8fff] mx-auto mb-4" />
          <p className="text-white/50">Loading...</p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Error
  // ════════════════════════════════════
  if (pageState === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-[#f5f7fb] mb-2">Something went wrong</h1>
          <p className="text-sm text-white/50 mb-6">{error}</p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Challenge Code Verification
  // ════════════════════════════════════
  if (pageState === "verify") {
    const listing = order?.listings
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6">
          {/* Header */}
          <div className="text-center">
            <Lock className="w-10 h-10 text-[#5f8fff] mx-auto mb-3" />
            <h1 className="text-xl font-bold text-[#f5f7fb]">Enter Challenge Code</h1>
            <p className="text-sm text-white/50 mt-2">
              Enter the challenge code shown on your order page to continue.
            </p>
            {listing && (
              <p className="text-xs text-white/30 mt-2">
                {listing.brand} {listing.model}
              </p>
            )}
          </div>

          {/* Code Input */}
          <div className="space-y-3">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase())
                setCodeError(null)
              }}
              placeholder="Enter code..."
              autoFocus
              autoComplete="off"
              className="w-full text-center text-2xl font-mono font-bold tracking-[0.3em] bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-[#f5f7fb] placeholder:text-white/20 focus:outline-none focus:border-[#5f8fff]/50 focus:ring-1 focus:ring-[#5f8fff]/30 transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerifyCode()
              }}
            />

            {codeError && (
              <p className="text-sm text-red-400 text-center">{codeError}</p>
            )}

            <button
              onClick={handleVerifyCode}
              disabled={verifying || !codeInput.trim()}
              className="relay-button-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Continue
                </>
              )}
            </button>
          </div>

          {/* Help text */}
          <p className="text-xs text-white/30 text-center">
            The challenge code is displayed on the order details page on your computer.
          </p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Done / Success
  // ════════════════════════════════════
  if (pageState === "done") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#f5f7fb] mb-2">Authentication Submitted!</h1>
          <p className="text-sm text-white/50 mb-6">
            Your photos have been uploaded. You can now go back to your computer to generate the shipping label.
          </p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Ready (Start screen)
  // ════════════════════════════════════
  if (pageState === "ready") {
    const listing = order?.listings
    return (
      <div className="min-h-screen bg-[#0a0a0f] p-6">
        <div className="max-w-md mx-auto space-y-6">
          {/* Header */}
          <div className="text-center pt-4">
            <Shield className="w-10 h-10 text-[#5f8fff] mx-auto mb-3" />
            <h1 className="text-xl font-bold text-[#f5f7fb]">Authenticate Item</h1>
            <p className="text-sm text-white/50 mt-1">
              {listing ? `${listing.brand} ${listing.model}` : `Order #${orderId.slice(0, 8).toUpperCase()}`}
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[#f5f7fb]">You&apos;ll take {totalSteps} photos:</h2>
            <ol className="text-sm text-white/60 space-y-2">
              {AUTH_STEPS.map((step, i) => (
                <li key={step.id} className="flex gap-2">
                  <span className="text-[#5f8fff] font-mono text-xs mt-0.5">{i + 1}.</span>
                  <span>
                    <span className="text-[#f5f7fb] font-medium">{step.label}</span>
                    {" — "}{step.instruction}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Important notes */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-sm text-amber-300 font-medium mb-1">Important</p>
            <ul className="text-xs text-amber-200/70 space-y-1">
              <li>All photos must be taken live — no uploads allowed.</li>
              <li>The CheckCheck certificate must be printed and placed inside the shipment box.</li>
              <li>Make sure the challenge code is clearly visible when required.</li>
            </ul>
          </div>

          {/* Start button */}
          <button
            onClick={() => {
              setCurrentStepIndex(0)
              setPageState("capturing")
            }}
            className="relay-button-primary w-full py-4 text-base flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            Start Taking Photos
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Capturing (Camera viewfinder)
  // ════════════════════════════════════
  if (pageState === "capturing") {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Top bar */}
        <div className="bg-black/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between z-10">
          <button
            onClick={() => {
              stopCamera()
              if (currentStepIndex === 0 && Object.keys(capturedPhotos).length === 0) {
                setPageState("ready")
              } else {
                setPageState("certificate")
              }
            }}
            className="p-2 -ml-2"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
          <div className="text-center">
            <p className="text-xs text-white/50">Step {currentStepIndex + 1} of {totalSteps}</p>
            <p className="text-sm font-semibold text-white">{currentStep?.label}</p>
          </div>
          <div className="w-9" />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-[#5f8fff] transition-all duration-300"
            style={{ width: `${((currentStepIndex) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Camera viewfinder */}
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <Loader2 className="w-8 h-8 animate-spin text-[#5f8fff]" />
            </div>
          )}

          {/* Instruction overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-16 pb-6 px-4">
            <p className="text-sm text-white/90 text-center mb-1">{currentStep?.instruction}</p>
            <p className="text-xs text-white/50 text-center">{currentStep?.tip}</p>
          </div>
        </div>

        {/* Capture controls */}
        <div className="bg-black px-6 py-6 flex items-center justify-center gap-8">
          <button
            onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
            className="p-3 rounded-full bg-white/10"
          >
            <RotateCcw className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={capturePhoto}
            disabled={!cameraReady}
            className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30"
            style={{ width: 72, height: 72 }}
          >
            <div className="rounded-full bg-white" style={{ width: 56, height: 56 }} />
          </button>

          <div className="p-3 rounded-full bg-white/10 text-center min-w-[44px]">
            <p className="text-xs font-bold text-white">{completedCount}/{totalSteps}</p>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Review (Photo preview)
  // ════════════════════════════════════
  if (pageState === "review" && currentStep) {
    const previewUrl = photoUrls[currentStep.id]

    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="bg-black/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between z-10">
          <div className="w-9" />
          <div className="text-center">
            <p className="text-xs text-white/50">Step {currentStepIndex + 1} of {totalSteps}</p>
            <p className="text-sm font-semibold text-white">{currentStep.label}</p>
          </div>
          <div className="w-9" />
        </div>

        <div className="flex-1 relative overflow-hidden">
          {previewUrl && (
            <img
              src={previewUrl}
              alt={currentStep.label}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}
        </div>

        <div className="bg-black px-6 py-6 flex items-center justify-center gap-4">
          <button
            onClick={retakePhoto}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Retake
          </button>
          <button
            onClick={acceptPhoto}
            className="flex-1 py-3 rounded-xl bg-[#5f8fff] text-white font-medium flex items-center justify-center gap-2"
          >
            {currentStepIndex < totalSteps - 1 ? "Next" : "Done"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RENDER: Certificate upload + final review
  // ════════════════════════════════════
  if (pageState === "certificate" || pageState === "submitting") {
    const allPhotosTaken = Object.keys(capturedPhotos).length >= totalSteps

    return (
      <div className="min-h-screen bg-[#0a0a0f] p-6">
        <div className="max-w-md mx-auto space-y-6">
          {/* Header */}
          <div className="text-center pt-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-[#f5f7fb]">Review & Submit</h1>
            <p className="text-sm text-white/50 mt-1">
              {allPhotosTaken ? "All photos captured!" : `${completedCount}/${totalSteps} photos taken`}
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300 flex-1">{error}</p>
              <button onClick={() => setError(null)}>
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}

          {/* Photo thumbnails grid */}
          <div className="grid grid-cols-4 gap-2">
            {AUTH_STEPS.map((step, i) => {
              const url = photoUrls[step.id]
              const isTaken = !!capturedPhotos[step.id]

              return (
                <button
                  key={step.id}
                  onClick={() => {
                    if (!isTaken || pageState === "submitting") return
                    setCurrentStepIndex(i)
                    setPageState("capturing")
                  }}
                  className={`aspect-square rounded-lg overflow-hidden border-2 transition-all relative ${
                    isTaken
                      ? "border-emerald-500/50"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  {url ? (
                    <img src={url} alt={step.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="w-4 h-4 text-white/30" />
                    </div>
                  )}
                  {isTaken && (
                    <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <p className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white/70 text-center py-0.5 truncate px-1">
                    {step.label}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Continue taking photos if some are missing */}
          {!allPhotosTaken && (
            <button
              onClick={() => {
                const missingIdx = AUTH_STEPS.findIndex((s) => !capturedPhotos[s.id])
                if (missingIdx >= 0) {
                  setCurrentStepIndex(missingIdx)
                  setPageState("capturing")
                }
              }}
              className="relay-button-secondary w-full py-3 flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Continue Taking Photos ({completedCount}/{totalSteps})
            </button>
          )}

          {/* CheckCheck Certificate upload */}
          {allPhotosTaken && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[#f5f7fb] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#5f8fff]" />
                CheckCheck Certificate
              </h2>
              <p className="text-xs text-white/40">
                Upload your CheckCheck certificate. Remember: the printed copy must also be inside the shipment box.
              </p>

              <input
                ref={certInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleCertificateUpload(f)
                }}
              />

              <button
                onClick={() => certInputRef.current?.click()}
                disabled={certificateUploading || pageState === "submitting"}
                className={`w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  certificateUrl
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-white/10 hover:border-white/20 bg-white/5"
                }`}
              >
                {certificateUploading ? (
                  <Loader2 className="w-8 h-8 text-[#7ca6ff] mx-auto animate-spin" />
                ) : certificateUrl ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <p className="text-sm text-emerald-300">Certificate Uploaded</p>
                  </div>
                ) : (
                  <>
                    <FileText className="w-8 h-8 text-[#7ca6ff] mx-auto mb-2" />
                    <p className="text-sm text-[#f5f7fb]">Upload CheckCheck Certificate</p>
                    <p className="text-xs text-white/40 mt-1">PDF or image</p>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Submit button */}
          {allPhotosTaken && (
            <button
              onClick={handleSubmit}
              disabled={!certificateUrl || pageState === "submitting"}
              className="relay-button-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pageState === "submitting" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading... {uploadProgress}%
                </>
              ) : (
                <>
                  <Package className="w-5 h-5" />
                  Submit Authentication
                </>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
