export default function OptionCard({ label, selected = false, onClick = () => {}, disabled = false }) {
  return (
    <button
      className={`option-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={selected}
      disabled={disabled}
    >
      <span>{label}</span>
      <span className="chev">›</span>
    </button>
  )
}
