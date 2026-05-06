"use client"

import { useEffect, useRef, useCallback, useState, type WheelEvent } from "react"
import createGlobe from "cobe"

interface AnalyticsMarker {
  id: string
  location: [number, number]
  visitors: number
  trend: number
}

interface GlobeAnalyticsProps {
  markers?: AnalyticsMarker[]
  className?: string
  speed?: number
  onZoomIn?: () => void
}

const defaultMarkers: AnalyticsMarker[] = [
  { id: "vis-1", location: [52.3676, 4.9041], visitors: 847, trend: 12 }, // Amsterdam
  { id: "vis-2", location: [51.9244, 4.4777], visitors: 623, trend: -3 }, // Rotterdam
  { id: "vis-3", location: [40.71, -74.01], visitors: 412, trend: 8 },
  { id: "vis-4", location: [51.51, -0.13], visitors: 385, trend: 5 },
]

export function GlobeAnalytics({
  markers: initialMarkers = defaultMarkers,
  className = "",
  speed = 0.003,
  onZoomIn,
}: GlobeAnalyticsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const isPausedRef = useRef(false)
  const [data, setData] = useState(initialMarkers)

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) =>
        prev.map((m) => ({
          ...m,
          visitors: m.visitors + Math.floor(Math.random() * 11) - 3,
          trend: Math.max(-20, Math.min(20, m.trend + Math.floor(Math.random() * 5) - 2)),
        }))
      )
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const [lastTouchTime, setLastTouchTime] = useState(0)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const now = Date.now()
    if (now - lastTouchTime < 300) {
      if (onZoomIn) onZoomIn()
    }
    setLastTouchTime(now)
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [lastTouchTime, onZoomIn])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [handlePointerUp])

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < -20 && onZoomIn) {
      onZoomIn()
    }
  }, [onZoomIn])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId: number
    let phi = 0

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width, height: width,
        phi: 0, theta: 0.2, dark: 1, diffuse: 1.2,
        mapSamples: 16000, mapBrightness: 6,
        baseColor: [0.15, 0.15, 0.15],
        markerColor: [0.25, 0.64, 0.96],
        glowColor: [0.1, 0.1, 0.15],
        markerElevation: 0,
        markers: initialMarkers.map((m) => ({ location: m.location, size: 0.04, id: m.id })),
        arcs: [], arcColor: [0.25, 0.9, 0.5],
        arcWidth: 0.5, arcHeight: 0.25, opacity: 0.7,
      })
      function animate() {
        if (!isPausedRef.current) phi += speed
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: 0.2 + thetaOffsetRef.current + dragOffset.current.theta,
        })
        animationId = requestAnimationFrame(animate)
      }
      animate()
      setTimeout(() => canvas && (canvas.style.opacity = "1"))
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect()
          init()
        }
      })
      ro.observe(canvas)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (globe) globe.destroy()
    }
  }, [initialMarkers, speed])

  return (
    <div
      className={className}
      style={{
        width: "100%",
        maxWidth: "600px",
        aspectRatio: "1 / 1",
        position: "relative",
        userSelect: "none"
      }}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          display: "block",
          width: "100%", height: "100%", cursor: "grab", opacity: 0,
          transition: "opacity 1.2s ease", borderRadius: "50%", touchAction: "none",
        }}
      />
      <div 
        style={{
          position: "absolute",
          bottom: "48px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          zIndex: 20
        }}
      >
        <div style={{ color: "#9ca3af", fontSize: "14px", pointerEvents: "none", fontWeight: "500", opacity: 0.8 }}>
          Scroll up to enter map
        </div>
        <button 
          onClick={onZoomIn}
          style={{
            padding: "10px 24px",
            backgroundColor: "rgba(30, 30, 30, 0.9)",
            backdropFilter: "blur(12px)",
            color: "white",
            border: "1px solid rgba(51, 51, 51, 0.8)",
            borderRadius: "9999px",
            fontSize: "14px",
            fontWeight: "500",
            pointerEvents: "auto",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)",
            cursor: "pointer",
            transition: "background-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(40, 40, 40, 0.95)"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(30, 30, 30, 0.9)"}
        >
          Enter Map
        </button>
      </div>
    </div>
  )
}