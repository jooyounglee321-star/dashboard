const DIM = {
  position: 'fixed', inset: 0, zIndex: 9500,
  background: 'rgba(15,23,42,0.50)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '1rem',
}
const BOX = {
  background: '#FFFFFF',
  borderRadius: 16,
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
  overflow: 'hidden',
}

export default function ConfirmModal({
  open, message, onConfirm, onCancel,
  confirmLabel, cancelLabel,
  variant = 'danger',
  lang = 'ko',
}) {
  if (!open) return null
  const cLabel = confirmLabel || (lang === 'ko' ? '확인' : 'Confirm')
  const xLabel = cancelLabel  || (lang === 'ko' ? '취소' : 'Cancel')
  const btnClass = variant === 'primary'
    ? 'btn btn-primary btn-sm'
    : 'btn btn-red btn-sm'
  return (
    <div style={DIM} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={BOX}>
        <div style={{ padding: '1.5rem 1.5rem 1.1rem' }}>
          <p style={{ fontSize: '0.9rem', color: '#1E293B', lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 }}>
            {message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', padding: '0 1.5rem 1.3rem' }}>
          <button className="btn btn-gray btn-sm" onClick={onCancel}>{xLabel}</button>
          <button className={btnClass} onClick={onConfirm}>{cLabel}</button>
        </div>
      </div>
    </div>
  )
}
