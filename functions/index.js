const functions = require('firebase-functions')
const express = require('express')
const next = require('next')
const axios = require('axios')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

exports.nextServer = functions.https.onRequest((req, res) => {
  return app.prepare().then(() => handle(req, res))
})

// Simple proxy to forward submissions to the Google Apps Script webhook server-side
exports.submitProxy = functions.https.onRequest(async (req, res) => {
  // Basic CORS
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).send('')
  }

  if (req.method !== 'POST') {
    return res.status(405).send({ ok: false, error: 'Method not allowed' })
  }

  const webhook = process.env.SHEETS_WEBHOOK_URL || process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL
  if (!webhook) {
    return res.status(500).json({ ok: false, error: 'SHEETS_WEBHOOK_URL not configured on server' })
  }

  try {
    const resp = await axios.post(webhook, req.body, { headers: { 'Content-Type': 'application/json' }, responseType: 'text' })
    const text = resp.data
    try {
      const j = JSON.parse(text)
      return res.status(resp.status >= 200 && resp.status < 300 ? 200 : 502).json(j)
    } catch (e) {
      return res.status(resp.status >= 200 && resp.status < 300 ? 200 : 502).send(text)
    }
  } catch (err) {
    console.error('submitProxy error', err)
    return res.status(502).json({ ok: false, error: err.message || 'Proxy error' })
  }
})
