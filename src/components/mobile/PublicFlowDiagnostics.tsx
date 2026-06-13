"use client"

import { useMemo } from "react"

export type PublicFlowDebugInfo = {
  route: string
  stage: string
  orderId?: string
  requestUrl?: string
  status?: number
  statusText?: string
  responseBody?: string
  errorMessage?: string
  errorName?: string
  stack?: string
  search?: string
  userAgent?: string
  timestamp: string
}

type Props = {
  debug: PublicFlowDebugInfo | null
  title?: string
}

export function buildPublicFlowDebugInfo(
  input: Omit<PublicFlowDebugInfo, "search" | "userAgent" | "timestamp">
): PublicFlowDebugInfo {
  return {
    ...input,
    search: typeof window !== "undefined" ? window.location.search || "" : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
  }
}

export async function readFailedResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") || ""

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json()
      return JSON.stringify(payload)
    }

    const text = await response.text()
    return text || ""
  } catch {
    return ""
  }
}

export function PublicFlowDiagnostics({ debug, title = "Debug details" }: Props) {
  const formatted = useMemo(() => {
    if (!debug) return ""
    return JSON.stringify(debug, null, 2)
  }, [debug])

  if (!debug) return null

  return (
    <details
      style={{
        marginTop: 16,
        textAlign: "left",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: "12px 14px",
      }}
      open
    >
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#f5f7fb" }}>
        {title}
      </summary>
      <pre
        style={{
          margin: "12px 0 0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: 11,
          lineHeight: 1.6,
          color: "rgba(255,255,255,0.78)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {formatted}
      </pre>
    </details>
  )
}
