import { useEffect, useRef, useState, type RefObject } from 'react'
import { createGlContext, GlStage, loadImages, type GlScene, type GlStageOptions, type GlStatus } from '../lib/stoneGl'

// 컨테이너 안에 WebGL 캔버스를 띄우고 장면의 수명을 관리합니다.
// 마운트마다 새 캔버스를 만들어, StrictMode의 이중 마운트에서도 이미 반납한 컨텍스트를 다시 쓰지 않습니다.
export function useStoneGl<T extends GlScene>(
  hostRef: RefObject<HTMLDivElement | null>,
  sceneKey: string,
  urls: readonly string[],
  create: (images: HTMLImageElement[]) => T,
  options?: GlStageOptions,
) {
  const [status, setStatus] = useState<GlStatus>('loading')
  const sceneRef = useRef<T | null>(null)
  const createRef = useRef(create)
  const urlsRef = useRef(urls)
  const optionsRef = useRef(options)

  useEffect(() => {
    createRef.current = create
    urlsRef.current = urls
    optionsRef.current = options
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = 'sf-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    const gl = createGlContext(canvas)
    if (!gl) {
      setStatus('unsupported')
      return
    }
    let disposed = false
    let stage: GlStage | null = null
    loadImages(urlsRef.current)
      .then((images) => {
        if (disposed) return
        const scene = createRef.current(images)
        host.appendChild(canvas)
        sceneRef.current = scene
        stage = new GlStage(canvas, gl, scene, (next) => {
          if (!disposed) setStatus(next)
        }, optionsRef.current)
        stage.start()
      })
      .catch(() => {
        if (!disposed) setStatus('unsupported')
      })
    return () => {
      disposed = true
      sceneRef.current = null
      if (stage) stage.destroy()
      else gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [hostRef, sceneKey])

  return { status, sceneRef }
}
