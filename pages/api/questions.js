import localQuestions from '../../data/questions'

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase()
}

function parseAnchors(cell) {
  if (!cell) return null
  const s = String(cell).trim()
  // try JSON array
  try {
    const j = JSON.parse(s)
    if (Array.isArray(j)) return j
  } catch (e) {}
  // try pipe or comma separated
  if (s.includes('|')) return s.split('|').map(x => x.trim())
  if (s.includes(',')) return s.split(',').map(x => x.trim())
  return [s]
}

export default async function handler(req, res) {
  const params = req.query || {}

  // explicit local override via query (source=local or useLocal=1)
  if (params.source === 'local' || params.useLocal === '1' || params.useLocal === 'true') {
    return res.status(200).json({ ok: true, questions: localQuestions })
  }

  // Prefer direct Google Sheets API when configured (public sheet or API key)
  const sheetId = process.env.SHEETS_SPREADSHEET_ID
  const apiKey = process.env.SHEETS_API_KEY
  if (sheetId && apiKey) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/Questions?majorDimension=ROWS&key=${encodeURIComponent(apiKey)}`
      const resp = await fetch(url)
      if (!resp.ok) {
        console.error('Sheets API returned non-OK', resp.status)
        // fallthrough to webhook/local fallback below
      } else {
        const json = await resp.json()
        const rows = Array.isArray(json.values) ? json.values : []
        if (rows.length >= 2) {
          const headers = rows[0].map(normalizeHeader)
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
            // options
            const opts = optionIndices.map(i => get(i)).filter(Boolean)
            if (opts.length) q.options = opts

            // type
            if (typeIndex >= 0 && get(typeIndex)) q.type = get(typeIndex)

            // anchors
            if (anchorsIndex >= 0 && get(anchorsIndex)) q.anchors = parseAnchors(get(anchorsIndex))

            return q
          }).filter(q => q.question && Array.isArray(q.options) && q.options.length)

          if (questions.length) return res.status(200).json({ ok: true, questions })
        }
      }
    } catch (err) {
      console.error('Failed to fetch from Sheets API', err)
      // fallthrough to webhook/local fallback below
    }
  }

  // Next prefer the Apps Script webhook if configured
  const webhook = process.env.SHEETS_WEBHOOK_URL
  if (webhook) {
    try {
      const resp = await fetch(webhook)
      if (resp.ok) {
        const json = await resp.json()
        if (json && Array.isArray(json.questions)) {
          return res.status(200).json({ ok: true, questions: json.questions })
        }
      }
    } catch (err) {
      console.error('Failed to fetch questions from webhook', err)
    }
  }

  // fallback to local static data
  return res.status(200).json({ ok: true, questions: localQuestions })
}
