"use client"

import { useEffect } from "react"
import { buildPublicFlowDebugInfo, PublicFlowDiagnostics } from "@/components/mobile/PublicFlowDiagnostics"

export default function MobileAuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("mobile-auth route error", error)
  }, [error])

  const debugInfo = buildPublicFlowDebugInfo({
    route: "mobile-auth",
    stage: "route-error-boundary",
    errorMessage: error.message,
    errorName: error.name,
    stack: error.stack,
    responseBody: error.digest ? `digest=${error.digest}` : undefined,
  })

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#f5f7fb",
        padding: "72px 24px 32px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>
          Seller authentication crashed
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          The public mobile seller authentication page hit an unexpected render error.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 14,
            borderRadius: 14,
            border: "none",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
        <PublicFlowDiagnostics debug={debugInfo} title="Crash details" />
      </div>
    </div>
  )
}
