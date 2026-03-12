const HEROKU_SYNC_URL = 'https://your-app.herokuapp.com/api/sync';
const SYNC_SHARED_SECRET = Zx3mPGHqA7kC2V9rT1yN4bW8sD6jL0fQ5uR8pK3vM9hS2cY7gF1nE4tB6wJ0z;
const DEFAULT_MODE = 'staged';
const MIN_SYNC_INTERVAL_MS = 5000;

const SHEET_TO_COLLECTION = {
  standings: 'standings',
  matches: 'matches',
  games: 'games'
};

function installSyncTrigger() {
  const spreadsheet = SpreadsheetApp.getActive();
  const existingTriggers = ScriptApp.getProjectTriggers();

  existingTriggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'handleSheetEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('handleSheetEdit').forSpreadsheet(spreadsheet).onEdit().create();
}

function handleSheetEdit(event) {
  if (!event || !event.range) {
    return;
  }

  const sheet = event.range.getSheet();
  const sheetName = sheet.getName();
  const collectionKey = SHEET_TO_COLLECTION[sheetName];
  const editedRow = event.range.getRow();

  if (!collectionKey) {
    return;
  }

  if (editedRow === 1) {
    return;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    return;
  }

  try {
    if (shouldSkipSync_(sheetName)) {
      return;
    }

    const csvText = buildCsvFromEditedRow_(sheet, editedRow);

    if (!csvText) {
      return;
    }

    const response = UrlFetchApp.fetch(HEROKU_SYNC_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-sync-secret': SYNC_SHARED_SECRET
      },
      payload: JSON.stringify({
        collectionKey,
        csvText,
        mode: DEFAULT_MODE,
        dryRun: false
      }),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status >= 300) {
      throw new Error(`Sync failed (${status}): ${body}`);
    }

    recordSync_(sheetName);
    console.log(`Synced ${sheetName}: ${body}`);
  } finally {
    lock.releaseLock();
  }
}

function shouldSkipSync_(sheetName) {
  const properties = PropertiesService.getScriptProperties();
  const key = `last-sync-${sheetName}`;
  const lastSync = Number(properties.getProperty(key) || '0');

  return Date.now() - lastSync < MIN_SYNC_INTERVAL_MS;
}

function recordSync_(sheetName) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(`last-sync-${sheetName}`, String(Date.now()));
}

function buildCsvFromEditedRow_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    return '';
  }

  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const rowValues = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];

  if (!rowValues.some((cell) => cell !== '')) {
    return '';
  }

  return [headerRow, rowValues].map((row) => row.map(escapeCsvCell_).join(',')).join('\n');
}

function escapeCsvCell_(value) {
  const stringValue = String(value ?? '');

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
}
