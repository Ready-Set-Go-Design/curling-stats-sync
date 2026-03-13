const HEROKU_SYNC_URL = 'https://curling-stats-sync-2f2ddd38539a.herokuapp.com/api/sync';
const SYNC_SHARED_SECRET = 'Zx3mPGHqA7kC2V9rT1yN4bW8sD6jL0fQ5uR8pK3vM9hS2cY7gF1nE4tB6wJ0z';
const DEFAULT_MODE = 'live';
const MIN_SYNC_INTERVAL_MS = 5000;

const SHEET_TO_COLLECTION = {
  Standings: 'standings',
  Matches: 'matches',
  Games: 'games'
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
    console.log('Sync skipped: missing event or range');
    return;
  }

  const sheet = event.range.getSheet();
  const sheetName = sheet.getName();
  const collectionKey = SHEET_TO_COLLECTION[sheetName];
  const editedRow = event.range.getRow();
  const editedColumn = event.range.getColumn();

  console.log(
    JSON.stringify({
      message: 'Sheet edit detected',
      sheetName,
      collectionKey,
      editedRow,
      editedColumn
    })
  );

  if (!collectionKey) {
    console.log(`Sync skipped: unmapped sheet "${sheetName}"`);
    return;
  }

  if (editedRow === 1) {
    console.log('Sync skipped: header row edited');
    return;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    console.log('Sync skipped: unable to acquire lock');
    return;
  }

  try {
    if (shouldSkipSync_(sheetName, editedRow)) {
      console.log(`Sync skipped: debounce active for "${sheetName}" row ${editedRow}`);
      return;
    }

    const csvText = buildCsvFromEditedRow_(sheet, editedRow);

    if (!csvText) {
      console.log(`Sync skipped: row ${editedRow} is empty`);
      return;
    }

    const csvLines = csvText.split('\n');
    const headers = csvLines[0] ? csvLines[0].split(',') : [];
    const rowPreview = csvLines[1] ?? '';

    console.log(
      JSON.stringify({
        message: 'Prepared CSV payload',
        sheetName,
        collectionKey,
        editedRow,
        headers,
        rowPreview
      })
    );

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

    console.log(
      JSON.stringify({
        message: 'Sync response received',
        sheetName,
        collectionKey,
        editedRow,
        status,
        body
      })
    );

    if (status >= 300) {
      throw new Error(`Sync failed (${status}): ${body}`);
    }

    recordSync_(sheetName, editedRow);
    console.log(`Synced ${sheetName}: ${body}`);
  } finally {
    lock.releaseLock();
  }
}

function shouldSkipSync_(sheetName, rowNumber) {
  const properties = PropertiesService.getScriptProperties();
  const key = buildSyncKey_(sheetName, rowNumber);
  const lastSync = Number(properties.getProperty(key) || '0');

  return Date.now() - lastSync < MIN_SYNC_INTERVAL_MS;
}

function recordSync_(sheetName, rowNumber) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(buildSyncKey_(sheetName, rowNumber), String(Date.now()));
}

function buildSyncKey_(sheetName, rowNumber) {
  return `last-sync-${sheetName}-${rowNumber}`;
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
