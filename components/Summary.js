import { useState } from 'react'
import axios from 'axios'

export default function Summary({ answers = {}, questions = [], userId = null, onReset = () => {} }) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  function fmt(ts) {
    try {
      return new Date(ts).toLocaleString()
    } catch (e) {
      return ts
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setStatus(null)

    const batch = questions.map(q => {
      const a = answers[q.id]
      return {
        question: q.question,
        answer: a ? q.options[a.index] : null,
        timestamp: a ? a.answeredAt : null,
        user_id: userId,
        email: email || null
      }
    })

    const webhook = typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL : undefined
    if (!webhook) {
      setStatus({ ok: false, msg: 'Submission webhook not configured. You can download your responses instead.' })
      setSubmitting(false)
      return
    }

    // First try the external proxy (avoids CORS and hides webhook)
    try {
      const proxyUrl = 'https://updater-445039499317.europe-west1.run.app/proxy_to_gas'
      const proxyRes = await axios.post(proxyUrl, { answers: batch }, { headers: { 'Content-Type': 'application/json' } })
      if (proxyRes.status >= 200 && proxyRes.status < 300) {
        setStatus({ ok: true, msg: 'Submitted via external proxy. Thank you!' })
        setSubmitted(true)
        setSubmitting(false)
        return
      }
      console.warn('External proxy responded not-OK, will try direct webhook fallback', proxyRes.data)
    } catch (err) {
      console.warn('External proxy request failed, will try direct webhook fallback', err.message || err)
    }

    // Fallback: try direct webhook
    if (!webhook) {
      setStatus({ ok: false, msg: 'No webhook configured and proxy failed.' })
      setSubmitting(false)
      return
    }

    try {
      const res = await axios.post(webhook, { answers: batch }, { headers: { 'Content-Type': 'application/json' } })
      if (res.status >= 200 && res.status < 300) {
        setStatus({ ok: true, msg: 'Submitted directly to webhook. Thank you!' })
        setSubmitted(true)
      } else {
        setStatus({ ok: false, msg: (res.data && res.data.error) ? res.data.error : `Failed (HTTP ${res.status})` })
      }
    } catch (err) {
      setStatus({ ok: false, msg: err.message })
    }

    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="summary">
        <h2>Thank you</h2>
        <p>Your responses have been submitted.</p>
        <div style={{ marginTop: 16 }}>
          <button onClick={onReset}>Restart</button>
        </div>
      </div>
    )
  }

  return (
    <div className="summary">
      <h2>Summary</h2>
      <p>You answered {Object.keys(answers).length} of {questions.length} questions.</p>
      <ul>
        {questions.map(q => {
          const a = answers[q.id]
          let answerText = '—'
          if (a) {
            if (q.type === 'scale') {
              // scale answers store 0-based index; display as 1-5
              const num = String((a.index ?? 0) + 1)
              const left = q.anchors && q.anchors[0] ? q.anchors[0] : ''
              const right = q.anchors && q.anchors[1] ? q.anchors[1] : ''
              answerText = left ? `${left} (${num}) ${right}` : num
            } else {
              answerText = q.options && q.options[a.index] ? q.options[a.index] : '—'
            }
          }

          return (
            <li key={q.id}>
              <strong>{q.question}</strong>
              <div>Answer: {answerText}</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>{a ? `Answered at ${fmt(a.answeredAt)}` : ''}</div>
            </li>
          )
        })}
      </ul>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Your email (optional):
          <input value={email} onChange={e => setEmail(e.target.value)} style={{ marginLeft: 8 }} />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit answers'}</button>
          {submitting && <span className="spinner" aria-hidden style={{ marginLeft: 8 }} />}

          <button onClick={onReset} disabled={submitting}>Restart</button>
        </div>

        {/* If webhook isn't configured, offer a download of the JSON */}
        {(!process.env || !process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL) && (
          <div style={{ marginTop: 8 }}>
            <small>Webhook not configured. You can download your responses and submit them elsewhere.</small>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => {
                const batch = questions.map(q => {
                  const a = answers[q.id]
                  return {
                    question: q.question,
                    answer: a ? (q.type === 'scale' ? String((a.index ?? 0) + 1) : (q.options && q.options[a.index] ? q.options[a.index] : null)) : null,
                    timestamp: a ? a.answeredAt : null,
                    user_id: userId,
                    email: email || null
                  }
                })
                const blob = new Blob([JSON.stringify({ answers: batch }, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'sleep_doctor_responses.json'
                a.click()
                URL.revokeObjectURL(url)
              }}>Download JSON</button>
            </div>
          </div>
        )}

        {status && (
          <div style={{ marginTop: 8, color: status.ok ? 'green' : 'red' }}>{status.msg}</div>
        )}
      </div>
    </div>
  )
}
