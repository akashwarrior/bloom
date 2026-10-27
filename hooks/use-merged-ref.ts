import * as React from "react"

function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") {
    const cleanup = ref(node)
    return typeof cleanup === "function" ? cleanup : () => ref(null)
  }
  if (ref) {
    ref.current = node
    return () => {
      ref.current = null
    }
  }
  return undefined
}

function useMergedRef<T>(...refs: Array<React.Ref<T> | undefined>) {
  const refsRef = React.useRef(refs)
  React.useEffect(() => {
    refsRef.current = refs
  })
  return React.useCallback((node: T | null) => {
    const cleanups = refsRef.current.map((ref) => assignRef(ref, node))
    return () => {
      for (const cleanup of cleanups) {
        cleanup?.()
      }
    }
  }, [])
}

export { useMergedRef }
