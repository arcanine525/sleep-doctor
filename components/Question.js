import { useState, useEffect } from 'react'
import OptionCard from './OptionCard'

export default function Question({ number, total, category, question, options = [], type = 'choice', anchors = [], selectedIndex = null, onSelect = () => {}, onBack = () => {}, canGoBack = false, disabled = false }) {
  // For scale questions we keep a local slider state until the user taps Continue
  const [scaleValue, setScaleValue] = useState((selectedIndex != null && type === 'scale') ? (selectedIndex + 1) : 3)

  // keep local state in sync if selectedIndex changes from parent
  useEffect(() => {
    if (selectedIndex != null && type === 'scale') {
      setScaleValue(selectedIndex + 1)
    }
  }, [selectedIndex, type])

  const maxIndex = (options && options.length) ? options.length - 1 : 4
  const percent = ((Number(scaleValue) - 1) / Math.max(1, maxIndex)) * 100

  function handleContinue() {
    if (disabled) return
    // pass 0-based index to the handler, consistent with option cards
    const idx = Number(scaleValue) - 1
    onSelect(idx)
  }

  return (
    <section className="question-root">
      <header className="progress-row">
        <button
          className={`back ${canGoBack ? 'back-clickable' : ''}`}
          aria-label="Go back to previous question"
          onClick={canGoBack ? onBack : undefined}
          disabled={!canGoBack}
        >
          ‹
        </button>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(number / total) * 100}%` }} />
        </div>
        <div className="count">{number}/{total}</div>
      </header>

      <div className="question-center">
        <div className="category">{category}</div>
        <h1 className="q">{question}</h1>

        {type === 'scale' ? (
          <div className="scale-root" style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
              <div style={{ textAlign: 'center', color: '#00875a' }}>
                <div style={{ fontSize: 32 }}>😊</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>{anchors && anchors[0] ? anchors[0] : 'Low'}</div>
              </div>

              <div style={{ width: 520 }}>
                <div style={{ position: 'relative', padding: '24px 0' }}>
                  <input
                    aria-label="Scale 1 to 5"
                    aria-valuemin={1}
                    aria-valuemax={5}
                    aria-valuenow={scaleValue}
                    aria-valuetext={`${anchors && anchors[0] ? anchors[0] : 'Low'} — ${scaleValue} — ${anchors && anchors[1] ? anchors[1] : 'High'}`}
                    role="slider"
                    type="range"
                    min={1}
                    max={5}
                    value={scaleValue}
                    onChange={e => setScaleValue(Number(e.target.value))}
                    disabled={disabled}
                    style={{ width: '100%' }}
                  />
                  {/* filled track */}
                  <div className="scale-filled" style={{ width: `${percent}%` }} />

                  <div style={{ position: 'absolute', left: `${percent}%`, transform: 'translateX(-50%)', top: -18 }}>
                    <div className="scale-bubble">{scaleValue}</div>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'center', color: '#b91c1c' }}>
                <div style={{ fontSize: 32 }}>🔴</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>{anchors && anchors[1] ? anchors[1] : 'High'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button className="continue-btn" onClick={handleContinue} disabled={disabled}>
                CONTINUE →
              </button>
            </div>
          </div>
        ) : (
          <div className="options">
            {options.map((opt, i) => (
              <OptionCard key={i} label={opt} selected={selectedIndex === i} onClick={() => onSelect(i)} disabled={disabled} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
