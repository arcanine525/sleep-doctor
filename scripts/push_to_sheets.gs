// Push data2.json to Google Sheets, one sheet per prefix (like export_csv.py)
// Usage:
// 1. Upload data2.json to a publicly-accessible URL (or host it in Firebase/Cloud Storage / provide as raw content in the script).
// 2. Set JSON_URL below to the raw URL of data2.json.
// 3. Open the Google Sheet you want to push data into, then in Extensions > Apps Script paste this file and run `pushDataToSheet`.
// 4. Optionally create a time-driven trigger to keep the sheet updated.

// Provide one or more URLs that return the survey JSON (same shape as data2.json).
// The script will fetch all URLs and merge their `rows` arrays. If a record has
// an `A` cell with a value (record id), that id is used to deduplicate across
// the sources; otherwise the full row JSON is used as the dedupe key.
const JSON_URLS = [
  'https://script.google.com/macros/s/AKfycbwwq0I0FPzht5ghueR6AmzUCHabgo6rH5shmMMoY0rE-synlXjclS49Ht_y6a5W3QbF/exec',
  // 'https://example.com/data2.json'
];
const COLUMN_TRANSFORMS = {
  'BE5': function(value) { return (value != null) ? 5 - value : null; },
  'DH4': function(value) { return (value != null) ? 5 - value : null; },
  'KT4': function(value) { return (value != null) ? 5 - value : null; },
  'PV4': function(value) { return (value != null) ? 5 - value : null; },
  'BL5': function(value) { return (value != null) ? 5 - value : null; },
  'OR5': function(value) { return (value != null) ? 5 - value : null; },
  'YE5': function(value) { return (value != null) ? 5 - value : null; },
  'TQ5': function(value) { return (value != null) ? 5 - value : null; }
};

function fetchJson() {
  // Fetch all URLs and merge rows. Deduplicate by record id (A.value) when present.
  const merged = [];
  const seen = new Set();
  JSON_URLS.forEach(function(url) {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      throw new Error('Failed to fetch JSON from ' + url + ': ' + resp.getResponseCode());
    }
    const payload = JSON.parse(resp.getContentText());
    const rows = payload.rows || [];
    rows.forEach(function(row) {
      // dedupe key: prefer explicit record id if present, otherwise stringify row
      const idKey = (row && row.A && row.A.value) ? String(row.A.value) : JSON.stringify(row);
      if (!seen.has(idKey)) {
        seen.add(idKey);
        merged.push(row);
      }
    });
  });
  return { rows: merged };
}

function slugify(text) {
  if (!text) return 'COLUMN';
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const cleaned = normalized.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return cleaned || 'COLUMN';
}

function parseNumeric(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const t = String(value).trim();
  if (t === '') return null;
  const v = Number(t);
  return isNaN(v) ? null : v;
}

function applyTransform(column, numericValue) {
  const fn = COLUMN_TRANSFORMS[column];
  if (!fn) return numericValue;
  try {
    return fn(numericValue);
  } catch (e) {
    return numericValue;
  }
}

function determineLevel(avg) {
  if (avg == null) return '';
  if (avg >= 4) return 'Cao';
  if (avg >= 2) return 'Trung bình';
  return 'Thấp';
}

function pushDataToSheet() {
  const payload = fetchJson();
  const rows = payload.rows || [];
  if (!rows.length) throw new Error('No rows in JSON');

  // collect headers and grouped data
  // Match exactly two letters (Unicode-aware) followed by one digit anywhere in the header.
  // Exclude underscore so the two-character prefix contains only letters.
  // Example: "[Pu1: ...]" -> group1="Pu", group2="1"
  const PREFIX_RE = /([^\d\W_]{2})(\d)/u;
  const groups = {}; // prefix -> { headers: {col->label}, data: rowIndex->{col:value} }

  rows.forEach(function(row, idx) {
    const rowIndex = idx + 1;
    Object.keys(row).forEach(function(k) {
      const cell = row[k];
      if (!cell || typeof cell !== 'object') return;
      const header = (cell.header || '').toString().trim();
      if (!header) return;
      const value = (cell.value == null) ? '' : cell.value;
      const m = header.match(PREFIX_RE);
      let prefix, columnCode;
      if (m) {
        prefix = m[1].toUpperCase();
        columnCode = prefix + m[2];
      } else {
        prefix = 'MISC';
        columnCode = slugify(header);
      }
      groups[prefix] = groups[prefix] || { headers: {}, data: {} };
      groups[prefix].headers[columnCode] = header;
      groups[prefix].data[rowIndex] = groups[prefix].data[rowIndex] || {};
      groups[prefix].data[rowIndex][columnCode] = value;
    });
  });

  // records metadata
  const records = rows.map(function(row, i) {
    const id = (row.A && row.A.value) ? row.A.value : String(i + 1);
    return {
      id: id,
      gender: (row.C && row.C.value) ? row.C.value : '',
      grade: (row.D && row.D.value) ? row.D.value : '',
      school: (row.E && row.E.value) ? row.E.value : ''
    };
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(groups).forEach(function(prefix) {
    const entry = groups[prefix];
    // sort columns
    const cols = Object.keys(entry.headers).sort(function(a,b){
      const ma = a.match(PREFIX_RE); const mb = b.match(PREFIX_RE);
      const na = ma ? Number(ma[2]) : Infinity; const nb = mb ? Number(mb[2]) : Infinity;
      return na - nb || a.localeCompare(b);
    });

    // header row for numeric sheet
    const transformCols = Object.keys(COLUMN_TRANSFORMS);
    const outputSequence = [];
    cols.forEach(function(c){
      if (transformCols.indexOf(c) !== -1) outputSequence.push({name: c + '_raw', base: c, type: 'raw'});
      outputSequence.push({name: c, base: c, type: 'value'});
    });

    const sheetName = prefix;
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    else sheet.clear();

    const headerRow = ['id','gender','grade','school'].concat(outputSequence.map(function(e){return e.name}),'sum','average','level');
    const outputRows = [headerRow];

    for (let r = 0; r < records.length; r++) {
      const rec = records[r];
      const rowIdx = r + 1;
      const rowData = entry.data[rowIdx] || {};
      const perCol = {};
      let rowSum = 0; let ncount = 0;
      cols.forEach(function(col) {
        const raw = rowData[col] == null ? '' : rowData[col];
        const numeric = parseNumeric(raw);
        const transformed = (numeric == null) ? null : applyTransform(col, numeric);
        const display = (transformed != null) ? transformed : raw;
        perCol[col] = {raw: raw, display: display, numeric: (transformed != null ? transformed : parseNumeric(display))};
        if (perCol[col].numeric != null) { rowSum += perCol[col].numeric; ncount++; }
      });
      const processed = outputSequence.map(function(e){
        const c = perCol[e.base] || {raw: '', display: ''};
        return (e.type === 'raw') ? (c.raw === null ? '' : c.raw) : (c.display === null ? '' : c.display);
      });
      const avg = (ncount>0) ? (rowSum / ncount) : null;
      outputRows.push([rec.id, rec.gender, rec.grade, rec.school].concat(processed, [ncount>0?rowSum:'', ncount>0?avg:'', determineLevel(avg)]));
    }

    // write numeric sheet — append if sheet already has data, otherwise write header + rows
    if (sheet.getLastRow() === 0) {
      // empty sheet: write header + all rows
      sheet.getRange(1, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
    } else {
      // sheet has existing data: append rows (skip header row in outputRows)
      const rowsToAppend = outputRows.slice(1);
      if (rowsToAppend.length) {
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
      }
    }

    // write text sheet
    const textSheetName = prefix + '_text';
    let textSheet = ss.getSheetByName(textSheetName);
    if (!textSheet) textSheet = ss.insertSheet(textSheetName);
    else textSheet.clear();

    const textHeader = ['id','gender','grade','school'].concat(outputSequence.filter(function(e){return e.type!=='raw'}).map(function(e){return e.name}),'level');
    const textRows = [textHeader];

    const mapping = {'1':'Rất không đồng ý','2':'Không đồng ý','3':'Phân vân / Bình thường','4':'Đồng ý','5':'Rất đồng ý'};

    for (let r = 0; r < records.length; r++) {
      const rec = records[r];
      const rowIdx = r + 1;
      const rowData = entry.data[rowIdx] || {};
      const perCol = {};
      let rowSum = 0; let ncount = 0;
      cols.forEach(function(col) {
        const raw = rowData[col] == null ? '' : rowData[col];
        const numeric = parseNumeric(raw);
        const transformed = (numeric == null) ? null : applyTransform(col, numeric);
        const display = (transformed != null) ? transformed : raw;
        perCol[col] = {raw: raw, display: display, numeric: (transformed != null ? transformed : parseNumeric(display))};
        if (perCol[col].numeric != null) { rowSum += perCol[col].numeric; ncount++; }
      });
      const rowCells = outputSequence.filter(function(e){return e.type!=='raw'}).map(function(e){
        const c = perCol[e.base] || {raw:'', display:''};
        const formatted = (c.raw == null) ? '' : String(c.raw);
        return mapping[formatted] || formatted;
      });
      const avg = (ncount>0) ? (rowSum / ncount) : null;
      textRows.push([rec.id, rec.gender, rec.grade, rec.school].concat(rowCells, [determineLevel(avg)]));
    }

    // write text sheet — append if sheet already has data, otherwise write header + rows
    if (textSheet.getLastRow() === 0) {
      textSheet.getRange(1, 1, textRows.length, textRows[0].length).setValues(textRows);
    } else {
      const textToAppend = textRows.slice(1);
      if (textToAppend.length) {
        const startRow = textSheet.getLastRow() + 1;
        textSheet.getRange(startRow, 1, textToAppend.length, textToAppend[0].length).setValues(textToAppend);
      }
    }
  });

  // optionally update metadata sheet
  let meta = ss.getSheetByName('_column_labels');
  const metaObj = {};
  Object.keys(groups).forEach(function(p){ metaObj[p] = groups[p].headers; });
  if (!meta) meta = ss.insertSheet('_column_labels'); else meta.clear();
  meta.getRange(1,1,1,1).setValue(JSON.stringify(metaObj));

  // Update last_update_at sheet with timestamp, sources and merged row count
  try {
    const now = new Date().toISOString();
    const lastSheetName = 'last_update_at';
    let lastSheet = ss.getSheetByName(lastSheetName);
    if (!lastSheet) lastSheet = ss.insertSheet(lastSheetName);
    else lastSheet.clear();
    lastSheet.getRange(1,1).setValue('last_update_at');
    lastSheet.getRange(1,2).setValue(now);
    lastSheet.getRange(2,1).setValue('sources');
    lastSheet.getRange(2,2).setValue(JSON_URLS.join(', '));
    lastSheet.getRange(3,1).setValue('merged_rows');
    lastSheet.getRange(3,2).setValue(rows.length);
  } catch (e) {
    // Best-effort: do not fail the whole run if last_update_at write fails
    console.warn('Failed to write last_update_at sheet: ' + e.message);
  }
}
