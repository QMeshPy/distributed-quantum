import { memo, useEffect, useRef, useState } from "react"
import VisualizerEntryPoint from "@qctrl/visualizer"

interface BlochSphereProps {
  /** Bloch vector [x, y, z] in range -1 to 1 */
  vector: [number, number, number]
  /** Optional label (e.g. qubit name) */
  label?: string
  /** Size in pixels */
  size?: number
  className?: string
}

/**
 * Renders a 3D Bloch sphere showing a single-qubit state.
 * The sphere's surface represents pure states; the indicator shows
 * the qubit's Bloch vector (x, y, z) on the sphere.
 */
export const BlochSphere = memo(function BlochSphere({
  vector,
  label,
  size = 240,
  className,
}: BlochSphereProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const vectorKey = vector.join(",")
  const activeError = error?.key === vectorKey ? error.message : null

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let isActive = true

    el.innerHTML = ""

    const [x, y, z] = vector
    const visualizationData = {
      data: {
        segmentIndexes: [0],
        vectors: [[x, y, z]],
      },
    }

    try {
      const viz = new VisualizerEntryPoint({
        wrapper: el,
        visualizationData,
        instantGates: true,
        progress: 1,
        useExternalProgress: true,
      })

      return () => {
        isActive = false
        viz.cleanup()
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to render Bloch sphere"

      queueMicrotask(() => {
        if (!isActive) {
          return
        }

        setError({
          key: vectorKey,
          message,
        })
      })

      return () => {
        isActive = false
      }
    }
  }, [vector, vectorKey])

  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 text-sm font-medium text-foreground/80">{label}</div>
      ) : null}
      {activeError ? (
        <div
          className="flex items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-sm text-muted-foreground dark:border-white/8 dark:bg-black/15"
          style={{ width: size, height: size, minWidth: size, minHeight: size }}
        >
          {activeError}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="rounded-2xl border border-white/50 bg-white/70 dark:border-white/8 dark:bg-black/15"
          style={{ width: size, height: size, minWidth: size, minHeight: size }}
        />
      )}
    </div>
  )
})
