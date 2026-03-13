const HEROKU_SYNC_URL = 'https://curling-stats-sync-2f2ddd38539a.herokuapp.com/api/sync';
const SYNC_SHARED_SECRET = 'Zx3mPGHqA7kC2V9rT1yN4bW8sD6jL0fQ5uR8pK3vM9hS2cY7gF1nE4tB6wJ0z';
const DEFAULT_MODE = 'live';
const MIN_SYNC_INTERVAL_MS = 5000;
const DIRTY_ROW_BACKGROUND = '#fff2cc';
const SYNC_PAUSED_KEY = 'sync-paused';

const SHEET_TO_COLLECTION = {
  Standings: 'standings',
  Matches: 'matches',
  Games: 'games'
};

function onOpen() {
  const syncToggleLabel = isSyncPaused_() ? 'Resume Sync' : 'Pause Sync';

  SpreadsheetApp.getUi()
    .createMenu('Webflow Sync')
    .addItem('Sync Standings', 'syncStandings')
    .addItem('Sync Matches', 'syncMatches')
    .addItem('Sync Games', 'syncGames')
    .addItem('Sync Changed Rows (Current Tab)', 'syncChangedRows')
    .addSeparator()
    .addItem('Sync All Score Tabs', 'syncAllTabs')
    .addSeparator()
    .addItem(syncToggleLabel, 'toggleSync')
    .addToUi();
}

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

function syncStandings() {
  if (!assertSyncEnabled_()) {
    return;
  }

  syncSheetByName_('Standings');
}

function syncMatches() {
  if (!assertSyncEnabled_()) {
    return;
  }

  syncSheetByName_('Matches');
}

function syncGames() {
  if (!assertSyncEnabled_()) {
    return;
  }

  syncSheetByName_('Games');
}

function syncAllTabs() {
  if (!assertSyncEnabled_()) {
    return;
  }

  ['Standings', 'Matches', 'Games'].forEach((sheetName) => {
    syncSheetByName_(sheetName);
  });
}

function syncChangedRows() {
  if (!assertSyncEnabled_()) {
    return;
  }

  const sheet = SpreadsheetApp.getActiveSheet();
  const sheetName = sheet.getName();
  const collectionKey = SHEET_TO_COLLECTION[sheetName];

  if (!collectionKey) {
    throw new Error(`Current sheet is not configured for sync: ${sheetName}`);
  }

  const dirtyRows = getDirtyRows_(sheetName);

  if (!dirtyRows.length) {
    console.log(`Sync skipped: no dirty rows for "${sheetName}"`);
    return;
  }

  syncDirtyRows_(sheet, collectionKey, dirtyRows);
}

function toggleSync() {
  const properties = PropertiesService.getScriptProperties();
  const paused = isSyncPaused_();

  if (paused) {
    properties.deleteProperty(SYNC_PAUSED_KEY);
    SpreadsheetApp.getUi().alert('Webflow sync is now active. Reload the spreadsheet to refresh the menu label.');
    return;
  }

  properties.setProperty(SYNC_PAUSED_KEY, 'true');
  SpreadsheetApp.getUi().alert('Webflow sync is now paused. Reload the spreadsheet to refresh the menu label.');
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

  markDirtyRow_(sheetName, editedRow);
  highlightDirtyRow_(sheet, editedRow);

  if (isSyncPaused_()) {
    console.log(`Sync skipped: paused for "${sheetName}" row ${editedRow}`);
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
    const result = parseSyncResponse_(body);

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

    writeBackRowSyncResult_(sheet, editedRow, result);
    recordSync_(sheetName, editedRow);
    clearDirtyRow_(sheetName, editedRow);
    clearDirtyRowHighlight_(sheet, editedRow);
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

function isSyncPaused_() {
  return PropertiesService.getScriptProperties().getProperty(SYNC_PAUSED_KEY) === 'true';
}

function assertSyncEnabled_() {
  if (isSyncPaused_()) {
    SpreadsheetApp.getUi().alert('Webflow sync is currently paused. Resume sync from the Webflow Sync menu to continue.');
    return false;
  }

  return true;
}

function recordSync_(sheetName, rowNumber) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(buildSyncKey_(sheetName, rowNumber), String(Date.now()));
}

function buildSyncKey_(sheetName, rowNumber) {
  return `last-sync-${sheetName}-${rowNumber}`;
}

function buildDirtyKey_(sheetName, rowNumber) {
  return `dirty-row-${sheetName}-${rowNumber}`;
}

function markDirtyRow_(sheetName, rowNumber) {
  PropertiesService.getScriptProperties().setProperty(buildDirtyKey_(sheetName, rowNumber), '1');
}

function clearDirtyRow_(sheetName, rowNumber) {
  PropertiesService.getScriptProperties().deleteProperty(buildDirtyKey_(sheetName, rowNumber));
}

function getDirtyRows_(sheetName) {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const prefix = `dirty-row-${sheetName}-`;

  return Object.keys(properties)
    .filter((key) => key.startsWith(prefix))
    .map((key) => Number(key.slice(prefix.length)))
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1)
    .sort((left, right) => left - right);
}

function syncSheetByName_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const collectionKey = SHEET_TO_COLLECTION[sheetName];

  if (!collectionKey) {
    throw new Error(`Sheet is not configured for sync: ${sheetName}`);
  }

  const csvText = buildCsvFromSheet_(sheet);

  if (!csvText) {
    console.log(`Sync skipped: no data rows found for "${sheetName}"`);
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
  const result = parseSyncResponse_(body);

  console.log(
    JSON.stringify({
      message: 'Manual sync response received',
      sheetName,
      collectionKey,
      status,
      body
    })
  );

  if (status >= 300) {
    throw new Error(`Manual sync failed for ${sheetName} (${status}): ${body}`);
  }

  writeBackSheetSyncResults_(sheet, result);
  console.log(`Manual sync completed for ${sheetName}: ${body}`);
}

function syncDirtyRows_(sheet, collectionKey, rowNumbers) {
  const csvText = buildCsvFromSpecificRows_(sheet, rowNumbers);

  if (!csvText) {
    console.log(`Sync skipped: no dirty row data for "${sheet.getName()}"`);
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
  const result = parseSyncResponse_(body);

  console.log(
    JSON.stringify({
      message: 'Dirty row sync response received',
      sheetName: sheet.getName(),
      collectionKey,
      rowNumbers,
      status,
      body
    })
  );

  if (status >= 300) {
    throw new Error(`Dirty row sync failed for ${sheet.getName()} (${status}): ${body}`);
  }

  writeBackSheetSyncResults_(sheet, result);
  clearDirtyRowsFromResult_(sheet.getName(), rowNumbers, result);
  console.log(`Dirty row sync completed for ${sheet.getName()}: ${body}`);
}

function buildCsvFromEditedRow_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    return '';
  }

  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const rowValues = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];

  if (!rowValues.some((cell) => cell !== '')) {
    return '';
  }

  return [headerRow, rowValues].map((row) => row.map(escapeCsvCell_).join(',')).join('\n');
}

function buildCsvFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (!lastRow || !lastColumn) {
    return '';
  }

  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

  if (lastRow <= 1) {
    return '';
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const dataRows = rows.filter((row) => row.some((cell) => cell !== ''));

  if (dataRows.length === 0) {
    return '';
  }

  return [headerRow, ...dataRows].map((row) => row.map(escapeCsvCell_).join(',')).join('\n');
}

function buildCsvFromSpecificRows_(sheet, rowNumbers) {
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn || !rowNumbers.length) {
    return '';
  }

  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const dataRows = rowNumbers
    .map((rowNumber) => sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0])
    .filter((row) => row.some((cell) => cell !== ''));

  if (!dataRows.length) {
    return '';
  }

  return [headerRow, ...dataRows].map((row) => row.map(escapeCsvCell_).join(',')).join('\n');
}

function parseSyncResponse_(body) {
  return JSON.parse(body);
}

function writeBackRowSyncResult_(sheet, rowNumber, result) {
  const item = result && result.items && result.items[0];

  if (!item) {
    return;
  }

  writeBackItemToRow_(sheet, rowNumber, item);
}

function writeBackSheetSyncResults_(sheet, result) {
  const items = (result && result.items) || [];

  if (!items.length) {
    return;
  }

  const slugColumn = getColumnIndexByHeader_(sheet, 'Slug');

  if (!slugColumn) {
    return;
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  const slugValues = sheet.getRange(2, slugColumn, lastRow - 1, 1).getDisplayValues();
  const rowBySlug = new Map();

  slugValues.forEach((entry, index) => {
    const slug = String(entry[0] || '').trim();

    if (slug) {
      rowBySlug.set(slug, index + 2);
    }
  });

  items.forEach((item) => {
    const matchValue = String(item.matchValue || '').trim();
    const slug = String(item.slug || '').trim();
    const rowNumber = (matchValue && rowBySlug.get(matchValue)) || (slug && rowBySlug.get(slug)) || null;

    if (rowNumber) {
      writeBackItemToRow_(sheet, rowNumber, item);
    }
  });
}

function clearDirtyRowsFromResult_(sheetName, candidateRows, result) {
  const items = (result && result.items) || [];

  if (!candidateRows.length || !items.length) {
    return;
  }

  const clearedRows = new Set();
  const rowLookup = new Map();
  items.forEach((item) => {
    const rowIndex = Number(item.rowIndex || 0);
    if (rowIndex >= 2) {
      const originalRowNumber = candidateRows[rowIndex - 2];
      if (originalRowNumber) {
        rowLookup.set(originalRowNumber, true);
      }
    }
  });

  candidateRows.forEach((rowNumber) => {
    if (rowLookup.get(rowNumber) && !clearedRows.has(rowNumber)) {
      clearDirtyRow_(sheetName, rowNumber);
      const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
      if (sheet) {
        clearDirtyRowHighlight_(sheet, rowNumber);
      }
      clearedRows.add(rowNumber);
    }
  });
}

function highlightDirtyRow_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn || rowNumber < 2) {
    return;
  }

  sheet.getRange(rowNumber, 1, 1, lastColumn).setBackground(DIRTY_ROW_BACKGROUND);
}

function clearDirtyRowHighlight_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn || rowNumber < 2) {
    return;
  }

  sheet.getRange(rowNumber, 1, 1, lastColumn).setBackground(null);
}

function writeBackItemToRow_(sheet, rowNumber, item) {
  const headerMap = getHeaderMap_(sheet);

  setCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Collection ID', item.collectionId || '');
  setCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Locale ID', item.cmsLocaleId || '');
  setCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Item ID', item.itemId || '');
  setCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Archived', toSheetBoolean_(item.isArchived));
  setCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Draft', toSheetBoolean_(item.isDraft));
  setDateCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Created On', item.createdOn);
  setDateCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Updated On', item.updatedOn);
  setDateCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Published On', item.publishedOn);

  if (item.slug) {
    setCellIfHeaderExists_(sheet, rowNumber, headerMap, 'Slug', item.slug);
  }
}

function getHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn) {
    return new Map();
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headerMap = new Map();

  headers.forEach((header, index) => {
    const normalizedHeader = String(header || '').trim();

    if (normalizedHeader) {
      headerMap.set(normalizedHeader, index + 1);
    }
  });

  return headerMap;
}

function getColumnIndexByHeader_(sheet, header) {
  return getHeaderMap_(sheet).get(header) || null;
}

function setCellIfHeaderExists_(sheet, rowNumber, headerMap, header, value) {
  const columnIndex = headerMap.get(header);

  if (!columnIndex) {
    return;
  }

  sheet.getRange(rowNumber, columnIndex).setValue(value);
}

function setDateCellIfHeaderExists_(sheet, rowNumber, headerMap, header, isoValue) {
  const columnIndex = headerMap.get(header);

  if (!columnIndex) {
    return;
  }

  const range = sheet.getRange(rowNumber, columnIndex);

  if (!isoValue) {
    range.setValue('');
    return;
  }

  const dateValue = new Date(isoValue);

  if (isNaN(dateValue.getTime())) {
    range.setValue(isoValue);
    return;
  }

  range.setValue(dateValue);
  range.setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function toSheetBoolean_(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return '';
}

function escapeCsvCell_(value) {
  const stringValue = formatCellForCsv_(value);

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
}

function formatCellForCsv_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : value.toISOString();
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  return String(value);
}
