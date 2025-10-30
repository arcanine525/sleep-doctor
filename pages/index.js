import { useEffect, useState } from 'react'
import fallbackQuestions from '../data/questions'
import Question from '../components/Question'
import Summary from '../components/Summary'

const STORAGE_KEY = 'sleep_doctor_answers_v1'
const USER_KEY = 'sleep_doctor_user_id_v1'

function genUuid() {
  // simple RFC4122 v4 UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function Home() {
  const [questions, setQuestions] = useState(fallbackQuestions)
  const [loading, setLoading] = useState(false)
  const [fetchStatus, setFetchStatus] = useState({ status: 'idle', error: null })
  const [started, setStarted] = useState(false)

  // decide data source once (env + optional query param)
  function shouldUseApi() {
    let useApi = true
    try {
      if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_USE_API !== undefined) {
        useApi = String(process.env.NEXT_PUBLIC_USE_API) === 'true'
      }
    } catch (e) {}

    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('source') === 'local') useApi = false
        if (params.get('source') === 'api') useApi = true
      }
    } catch (e) {}

    return useApi
  }

  async function loadQuestions() {
    const useApi = shouldUseApi()
    setLoading(true)
    if (!useApi) {
      setQuestions(fallbackQuestions)
      setFetchStatus({ status: 'idle', error: null })
      setLoading(false)
      return
    }

    try {
      setFetchStatus({ status: 'loading', error: null })
      // prefer the Apps Script webhook if provided in client env
      const webhook = typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL : undefined
      if (webhook) {
        const resp = await fetch(webhook)
        if (!resp.ok) throw new Error(`Webhook HTTP ${resp.status}`)
        const j = await resp.json()
        if (j && Array.isArray(j.questions) && j.questions.length) {
          setQuestions(j.questions)
          setFetchStatus({ status: 'idle', error: null })
          setLoading(false)
          return
        }
      }

      // fallback to public Sheets API if configured for client
      const sheetId = typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_SHEETS_SPREADSHEET_ID : undefined
      const apiKey = typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_SHEETS_API_KEY : undefined
      if (sheetId && apiKey) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/Questions?majorDimension=ROWS&key=${encodeURIComponent(apiKey)}`
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`Sheets API HTTP ${resp.status}`)
        const json = await resp.json()
        const rows = Array.isArray(json.values) ? json.values : []
        if (rows.length >= 2) {
          const headers = rows[0].map(h => String(h || '').trim().toLowerCase())
          const optionIndices = headers.map((h, i) => ({ h, i })).filter(x => x.h.startsWith('option')).map(x => x.i)
          const idIndex = headers.indexOf('id')
          const categoryIndex = headers.indexOf('category')
          const questionIndex = headers.indexOf('question')
          const typeIndex = headers.indexOf('type')
          const anchorsIndex = headers.indexOf('anchors')

          const questions = rows.slice(1).map((row, rowIdx) => {
            const get = i => (typeof row[i] !== 'undefined' ? String(row[i]).trim() : '')
            const q = {
              id: idIndex >= 0 && get(idIndex) ? parseInt(get(idIndex), 10) || (rowIdx + 1) : (rowIdx + 1),
              category: categoryIndex >= 0 ? get(categoryIndex) : undefined,
              question: questionIndex >= 0 ? get(questionIndex) : get(optionIndices[0]) || ''
            }
            const opts = optionIndices.map(i => get(i)).filter(Boolean)
            if (opts.length) q.options = opts
            if (typeIndex >= 0 && get(typeIndex)) q.type = get(typeIndex)
            if (anchorsIndex >= 0 && get(anchorsIndex)) {
              const s = get(anchorsIndex)
              try {
                const parsed = JSON.parse(s)
                if (Array.isArray(parsed)) q.anchors = parsed
                else q.anchors = [s]
              } catch (e) {
                if (s.includes('|')) q.anchors = s.split('|').map(x => x.trim())
                else if (s.includes(',')) q.anchors = s.split(',').map(x => x.trim())
                else q.anchors = [s]
              }
            }
            return q
          }).filter(q => q.question && Array.isArray(q.options) && q.options.length)

          if (questions.length) {
            setQuestions(questions)
            setFetchStatus({ status: 'idle', error: null })
            setLoading(false)
            return
          }
        }
      }

      // final fallback to local
      setQuestions(fallbackQuestions)
      setFetchStatus({ status: 'idle', error: null })
    } catch (err) {
      setFetchStatus({ status: 'error', error: err.message || 'Failed to fetch' })
    } finally {
      setLoading(false)
    }
  }
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState(() => {
    try {
      if (typeof window === 'undefined') return {}
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    } catch (e) {}
  }, [answers])

  const current = questions[index]

  const [userId, setUserId] = useState(() => {
    try {
      if (typeof window === 'undefined') return null
      let id = localStorage.getItem(USER_KEY)
      if (!id) {
        id = genUuid()
        localStorage.setItem(USER_KEY, id)
      }
      return id
    } catch (e) {
      return null
    }
  })

  const [animating, setAnimating] = useState(false)
  const [advanceClass, setAdvanceClass] = useState('')

  function handleSelect(optionIndex) {
    const ts = new Date().toISOString()
    // save answer with timestamp
    const payload = { questionId: current.id, optionIndex, answeredAt: ts }
    setAnswers(prev => ({ ...prev, [current.id]: { index: optionIndex, answeredAt: ts } }))

    // do not POST per-answer anymore; we'll batch submit at the end

    // start brief animation / delay before advancing
    setAnimating(true)
    setAdvanceClass('advance')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })

    setTimeout(() => {
      setAnimating(false)
      setAdvanceClass('')
      setIndex(i => i + 1)
    }, 300)
  }

  // when we reach the summary (index === questions.length), batch submit all answers
  useEffect(() => {
    // submission is now handled by the Summary component when the user provides an email
  }, [index, questions, answers, userId])

  const retry = () => {
    // call loadQuestions in-place
    loadQuestions()
  }

  // Landing / Home screen before quiz starts
  if (!started) {
    return (
      <main className="page-root">
        <div className="landing-root">
          <div className="landing-left">
            <h1>We Are Here To Help You Sleep.</h1>
            <p>Tell us about your sleep by taking this brief quiz. Based on your answers, we will determine your Sleep Doctor Chronotype Score™ and create a personalized profile that includes sleep improvement recommendations.</p>
            <div style={{ marginTop: 24 }}>
              <button className="continue-btn" onClick={() => { try { localStorage.removeItem(STORAGE_KEY) } catch (e){}; setAnswers({}); setIndex(0); setStarted(true); loadQuestions() }}>Get Started →</button>
            </div>
          </div>
          <div className="landing-right">
            <div className="landing-hero" aria-hidden />
          </div>
        </div>
      </main>
    )
  }

  if (loading) return (
    <main className="page-root">
      <div style={{ padding: 40, textAlign: 'center' }}>
        {fetchStatus.status === 'loading' && (
          <>
            <div style={{ marginBottom: 12 }}>Loading questions...</div>
            <div className="spinner" style={{ width: 28, height: 28, display: 'inline-block' }} aria-hidden />
          </>
        )}
        {fetchStatus.status === 'error' && (
          <>
            <div style={{ marginBottom: 12, color: '#b91c1c' }}>Failed to load questions: {fetchStatus.error}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={retry}>Retry</button>
              <button onClick={() => { try { localStorage.removeItem(STORAGE_KEY) } catch (e){}; setAnswers({}); setIndex(0); setQuestions(fallbackQuestions); setFetchStatus({ status: 'idle', error: null }); setLoading(false) }}>Use local</button>
            </div>
          </>
        )}
      </div>
    </main>
  )

  return (
    <main className="page-root">
      {index < questions.length ? (
        <>
          <Question
            number={current.id}
            total={questions.length}
            category={current.category}
            question={current.question}
            type={current.type}
            anchors={current.anchors}
            options={current.options}
            selectedIndex={answers[current.id]?.index ?? null}
            onSelect={handleSelect}
            onBack={() => {
              // allow user to go back one question and edit
              setAnimating(false)
              setAdvanceClass('')
              setIndex(i => Math.max(0, i - 1))
            }}
            canGoBack={index > 0}
            disabled={animating}
            className={advanceClass}
          />
        </>
      ) : (
        <Summary answers={answers} questions={questions} userId={userId} onReset={() => { setAnswers({}); setIndex(0); setAdvanceClass(''); setAnimating(false); localStorage.removeItem('sleep_doctor_answers_v1') }} />
      )}
    </main>
  )
}
