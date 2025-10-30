/**
 * Web GET API for a Google Sheet: returns rows as JSON objects using the header row as keys.
 * Query parameters (GET):
 *  - sheetId (optional): spreadsheet id; if omitted, uses active spreadsheet
 *  - sheetName (optional): name of the sheet/tab; if omitted, uses active sheet
 *  - headerRow (optional): 1-based index of header row (defaults to 1)
 *
 * Example URL when deployed as Web App:
 *  https://script.google.com/macros/s/PROJECT_ID/exec?sheetId=1AbC...&sheetName=Sheet1
 */

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const sheetId = params.sheetId || '';
    const sheetName = params.sheetName || '';
    const headerRow = params.headerRow ? parseInt(params.headerRow, 10) : 1;

    const ss = sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return jsonResponse({ ok: false, error: 'Unable to open spreadsheet' }, 400);

    const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
    if (!sheet) return jsonResponse({ ok: false, error: 'Sheet not found' }, 404);

    const values = sheet.getDataRange().getValues();
    if (!values || values.length <= headerRow - 1) return jsonResponse({ ok: true, rows: [] });

    // Read header row
    const rawHeaders = values[headerRow - 1].map(h => String(h || '').trim());

    const rows = [];
    for (let r = headerRow; r < values.length; r++) {
      const rowArr = values[r];
      const obj = {};
      for (let c = 0; c < rawHeaders.length; c++) {
        const colLetter = colToLetter(c);
        const header = rawHeaders[c] || '';
        const cellValue = rowArr[c] !== undefined ? rowArr[c] : '';
        obj[colLetter] = { header: header, value: cellValue };
      }
      // Skip completely empty rows (all values empty)
      const allEmpty = Object.values(obj).every(v => v && (v.value === '' || v.value === null));
      if (!allEmpty) rows.push(obj);
    }

    return jsonResponse({ ok: true, rows: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doOptions(e) {
  // CORS preflight handler
  const output = ContentService.createTextOutput(JSON.stringify({ ok: true }));
  output.setMimeType(ContentService.MimeType.JSON);
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

function jsonResponse(obj, status) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  // Basic CORS header; replace '*' with your domain for production
  try {
    output.setHeader('Access-Control-Allow-Origin', '*');
  } catch (e) {
    // setHeader sometimes throws in certain environments; ignore safely
    Logger.log('setHeader failed: ' + e.message);
  }
  return output;
}

/**
 * Convert 0-based column index to column letter (0 -> A, 25 -> Z, 26 -> AA)
 */
function colToLetter(index) {
  let n = index;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}
