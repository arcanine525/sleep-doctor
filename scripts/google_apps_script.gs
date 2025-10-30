/**
 * Google Apps Script to accept a POST of { answers: [...] } and append to a Google Sheet
 *
 * Usage:
 * - Create a new Google Apps Script bound to a spreadsheet or standalone
 * - Replace SHEET_NAME with your sheet's name
 * - Deploy as Web App (Execute as: Me, Who has access: Anyone with the link)
 * - Use the deployed URL as SHEETS_WEBHOOK_URL in your app
 */

// If your script is NOT container-bound to a spreadsheet, set SHEET_ID to the target spreadsheet id
const SHEET_ID = ''; // e.g. '1abc...' — leave empty if the script is bound to the spreadsheet
const SHEET_NAME = 'Submissions'; // change to your sheet tab name
const QUESTIONS_SHEET = 'Questions'; // optional questions sheet

function doPost(e) {
  try {
    let body = null;
    try {
      if (e && e.postData && e.postData.contents) {
        body = JSON.parse(e.postData.contents);
      } else if (e && e.parameter && Object.keys(e.parameter).length) {
        body = e.parameter;
      }
    } catch (pe) {
      body = null;
    }

    if (!body) throw new Error('Missing or invalid JSON body');
    const answers = body.answers || [];

    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Unable to open spreadsheet. Set SHEET_ID or bind script to a spreadsheet.');
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Ensure header row exists
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['user_id', 'email', 'question', 'answer', 'timestamp', 'receivedAt']);
    }

    answers.forEach(a => {
      sheet.appendRow([
        a.user_id || '',
        a.email || '',
        a.question || '',
        a.answer || '',
        a.timestamp || '',
        new Date().toISOString(),
      ]);
    });

    return withCors(
      ContentService.createTextOutput(JSON.stringify({ ok: true, count: answers.length }))
        .setMimeType(ContentService.MimeType.JSON)
    );
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return withCors(
      ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON)
    );
  }
}

function doGet(e) {
  try {
    const type = e && e.parameter && e.parameter.type ? String(e.parameter.type).toLowerCase() : '';

    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();

    if (type === 'submissions') {
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error('Submissions sheet not found');

      const values = sheet.getDataRange().getValues();
      if (!values || values.length <= 1) {
        return withCors(
          ContentService.createTextOutput(JSON.stringify({ ok: true, submissions: [] }))
            .setMimeType(ContentService.MimeType.JSON)
        );
      }

      const headers = values[0].map(h => String(h).trim());
      const rows = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => (obj[h] = row[i]));
        return obj;
      });

      return withCors(
        ContentService.createTextOutput(JSON.stringify({ ok: true, submissions: rows }))
          .setMimeType(ContentService.MimeType.JSON)
      );
    }

    // Otherwise, serve questions
    const sheet = ss.getSheetByName(QUESTIONS_SHEET);
    if (!sheet) throw new Error('Questions sheet not found');

    const values = sheet.getDataRange().getValues();
    if (!values || values.length <= 1) {
      return withCors(
        ContentService.createTextOutput(JSON.stringify({ ok: true, questions: [] }))
          .setMimeType(ContentService.MimeType.JSON)
      );
    }

    const headers = values[0].map(h => String(h).trim().toLowerCase());
    const questionRows = values.slice(1);

    const questions = questionRows.map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));

      const options = headers
        .map((h, i) => (h.startsWith('option') && row[i] ? String(row[i]) : null))
        .filter(Boolean);

      return {
        id: obj.id ? Number(obj.id) : idx + 1,
        category: obj.category || '',
        question: obj.question || '',
        options,
      };
    });

    return withCors(
      ContentService.createTextOutput(JSON.stringify({ ok: true, questions }))
        .setMimeType(ContentService.MimeType.JSON)
    );
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return withCors(
      ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON)
    );
  }
}

// Handle CORS preflight (very important for browsers)
function doOptions(e) {
  return withCors(
    ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)
  );
}

// Add CORS headers safely
function withCors(textOutput) {
  try {
    // ⭐ Change "*" to your frontend domain for better security
    textOutput.setHeader('Access-Control-Allow-Origin', '*');
    textOutput.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    textOutput.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    textOutput.setHeader('Access-Control-Max-Age', '3600');
  } catch (e) {
    Logger.log('withCors setHeader failed: ' + e.message);
  }
  return textOutput;
}
