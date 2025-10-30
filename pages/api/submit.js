import axios from 'axios'

let submissions = []

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const payload = req.body

    // Accept either a single object or a batch { answers: [...] }
    const receivedAt = new Date().toISOString()

    // helper to persist and optionally forward an array of items
    const persistArray = async arr => {
      arr.forEach(p => submissions.push({ ...p, receivedAt }))

      // Forward to external proxy that will send data to Google Apps Script
        const webhook = 'https://updater-445039499317.europe-west1.run.app/proxy_to_gas'
      if (webhook) {
        try {
          await axios.post(webhook, { answers: arr }, { headers: { 'Content-Type': 'application/json' } })
        } catch (err) {
          console.error('Forward to proxy failed', err)
        }
      }
    }

    if (Array.isArray(payload)) {
      await persistArray(payload)
      return res.status(201).json({ ok: true, received: payload })
    }

    if (payload && Array.isArray(payload.answers)) {
      await persistArray(payload.answers)
      return res.status(201).json({ ok: true, receivedCount: payload.answers.length })
    }

    // single object
    await persistArray([payload])
    return res.status(201).json({ ok: true, received: payload })
  }

  // Allow reading submissions for debug (dev only)
  if (req.method === 'GET') {
    const webhook = process.env.SHEETS_WEBHOOK_URL
    if (webhook) {
      try {
        const url = `${webhook}${webhook.includes('?') ? '&' : '?'}type=submissions`
        try {
          const r = await axios.get(url)
          const j = r.data
          if (j && Array.isArray(j.submissions)) return res.status(200).json({ ok: true, submissions: j.submissions })
        } catch (err) {
          console.error('Failed to fetch submissions from webhook', err)
        }
      } catch (err) {
        console.error('Failed to fetch submissions from webhook', err)
      }
    }

    return res.status(200).json({ count: submissions.length, submissions })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
