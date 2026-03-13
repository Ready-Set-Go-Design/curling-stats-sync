const HEROKU_SYNC_URL = 'https://curling-stats-sync-2f2ddd38539a.herokuapp.com/api/sync';
const SYNC_SHARED_SECRET = 'Zx3mPGHqA7kC2V9rT1yN4bW8sD6jL0fQ5uR8pK3vM9hS2cY7gF1nE4tB6wJ0z';
const DEFAULT_MODE = 'live';
const MIN_SYNC_INTERVAL_MS = 5000;
const DIRTY_ROW_BACKGROUND = '#fff2cc';

const SHEET_TO_COLLECTION = {
  Standings: 'standings',
  Matches: 'matches',
  Games: 'games'
};

function onOpen() {
  buildSyncMenu_();
}

function buildSyncMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('Webflow Sync')
    .addItem('Sync Standings', 'syncStandings')
    .addItem('Refresh Standings from Webflow', 'refreshStandingsFromWebflow')
    .addItem('Sync Matches', 'syncMatches')
    .addItem('Refresh Matches from Webflow', 'refreshMatchesFromWebflow')
    .addItem('Sync Games', 'syncGames')
    .addItem('Refresh Games from Webflow', 'refreshGamesFromWebflow')
    .addItem('Sync Changed Rows (Current Tab)', 'syncChangedRows')
    .addSeparator()
    .addItem('Sync All Score Tabs', 'syncAllTabs')
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
  syncSheetByName_('Standings');
}

function syncMatches() {
  syncSheetByName_('Matches');
}

function syncGames() {
  syncSheetByName_('Games');
}

function refreshStandingsFromWebflow() {
  refreshSheetFromWebflow_('Standings');
}

function refreshMatchesFromWebflow() {
  refreshSheetFromWebflow_('Matches');
}

function refreshGamesFromWebflow() {
  refreshSheetFromWebflow_('Games');
}

function syncAllTabs() {
  ['Standings', 'Matches', 'Games'].forEach((sheetName) => {
    syncSheetByName_(sheetName);
  });
}

function syncChangedRows() {
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

function handleSheetEdit(event) {
  if (!event || !event.range) {
    console.log('Dirty-row tracking skipped: missing event or range');
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
    console.log(`Dirty-row tracking skipped: unmapped sheet "${sheetName}"`);
    return;
  }

  if (editedRow === 1) {
    console.log('Dirty-row tracking skipped: header row edited');
    return;
  }

  markDirtyRow_(sheetName, editedRow);
  highlightDirtyRow_(sheet, editedRow);
  console.log(`Dirty row marked for "${sheetName}" row ${editedRow}`);
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

function refreshSheetFromWebflow_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const collectionKey = SHEET_TO_COLLECTION[sheetName];

  if (!collectionKey) {
    throw new Error(`Sheet is not configured for sync: ${sheetName}`);
  }

  const response = UrlFetchApp.fetch(`${HEROKU_SYNC_URL}/pull`, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-sync-secret': SYNC_SHARED_SECRET
    },
    payload: JSON.stringify({
      collectionKey
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  console.log(
    JSON.stringify({
      message: 'Webflow pull response received',
      sheetName,
      collectionKey,
      status,
      body
    })
  );

  if (status >= 300) {
    throw new Error(`Webflow pull failed for ${sheetName} (${status}): ${body}`);
  }

  const result = parseSyncResponse_(body);
  writePulledRowsToSheet_(sheet, result);
  console.log(`Webflow pull completed for ${sheetName}: ${body}`);
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

function writePulledRowsToSheet_(sheet, result) {
  const headers = (result && result.headers) || [];
  const rows = (result && result.rows) || [];

  if (!headers.length) {
    throw new Error('Pull result did not include headers.');
  }

  const values = [headers].concat(
    rows.map((row) =>
      headers.map((header) => normalizePulledCellValue_(header, row[header]))
    )
  );

  sheet.clearContents();
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  applyDateFormatsToHeaders_(sheet, headers);
  rebuildDirtyHighlights_(sheet);
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

function normalizePulledCellValue_(header, value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (['Created On', 'Updated On', 'Published On', 'Date'].includes(header)) {
    const dateValue = new Date(value);
    return isNaN(dateValue.getTime()) ? value : dateValue;
  }

  if (value === 'TRUE') {
    return true;
  }

  if (value === 'FALSE') {
    return false;
  }

  return value;
}

function applyDateFormatsToHeaders_(sheet, headers) {
  ['Date', 'Created On', 'Updated On', 'Published On'].forEach((header) => {
    const columnIndex = headers.indexOf(header);

    if (columnIndex !== -1 && sheet.getLastRow() >= 2) {
      sheet.getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1).setNumberFormat('m/d/yyyy h:mm:ss');
    }
  });
}

function rebuildDirtyHighlights_(sheet) {
  const dirtyRows = getDirtyRows_(sheet.getName());
  dirtyRows.forEach((rowNumber) => {
    highlightDirtyRow_(sheet, rowNumber);
  });
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
