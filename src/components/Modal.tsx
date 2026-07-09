import { type ReactNode, useEffect, useRef } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose?: () => void
  labelledBy?: string
  className?: string
}

export function Modal({ title, children, onClose, labelledBy = 'modal-title', className = '' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`stone-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-rivet modal-rivet--one" />
        <div className="modal-rivet modal-rivet--two" />
        <h2 id={labelledBy}>{title}</h2>
        {onClose && (
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
