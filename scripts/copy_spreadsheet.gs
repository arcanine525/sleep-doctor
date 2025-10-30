/**
 * Utility to copy a single named sheet from one spreadsheet to another.
 * Fill in ORIGIN_SHEET_ID, DEST_SHEET_ID, and SHEET_NAME before running copySpreadsheetContents.
 */
const ORIGIN_SHEET_ID = 'origin_sheet_id';
const DEST_SHEET_ID = 'dest_sheet_id';
const SHEET_NAME = 'sheet_to_copy';

function copySpreadsheetContents() {
  if (!ORIGIN_SHEET_ID || !DEST_SHEET_ID || !SHEET_NAME) {
    throw new Error('Set ORIGIN_SHEET_ID, DEST_SHEET_ID, and SHEET_NAME before running copySpreadsheetContents');
  }

  const sourceSpreadsheet = SpreadsheetApp.openById(ORIGIN_SHEET_ID);
  const destinationSpreadsheet = SpreadsheetApp.openById(DEST_SHEET_ID);
  const originSheet = sourceSpreadsheet.getSheetByName(SHEET_NAME);

  if (!originSheet) {
    throw new Error('Sheet named "' + SHEET_NAME + '" not found in origin spreadsheet');
  }

  let placeholder = null;
  const destSheet = destinationSpreadsheet.getSheetByName(SHEET_NAME);
  if (destSheet) {
    if (destinationSpreadsheet.getSheets().length === 1) {
      placeholder = destinationSpreadsheet.insertSheet('PLACEHOLDER_' + Date.now());
    }
    destinationSpreadsheet.deleteSheet(destSheet);
  }

  const copiedSheet = originSheet.copyTo(destinationSpreadsheet);
  copiedSheet.setName(SHEET_NAME);
  if (originSheet.isSheetHidden()) {
    copiedSheet.hideSheet();
  }

  if (placeholder) {
    destinationSpreadsheet.deleteSheet(placeholder);
  }

  return { ok: true, sheetsCopied: 1 };
}
