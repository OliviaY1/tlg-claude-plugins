/**
 * Sheet API (Google Apps Script, standalone project in the work account).
 *
 * A small, private web API Claude calls to read, add and delete rows in Google Sheets.
 * It works on any spreadsheet the account can edit, but only on those listed in
 * SETTINGS.allowedSheets. It runs only when called: no schedule, no Gmail, no attachments.
 *
 * Every call is a POST with JSON and must carry the secret key. "spreadsheet" is the sheet's
 * link or ID; it may be left out when allowedSheets has exactly one entry.
 *   {"key", "action": "listTabs",    "spreadsheet"}
 *     -> {"spreadsheet": {"id", "name", "url"}, "tabs": [{"name", "rows", "columns"}]}
 *   {"key", "action": "getHeaders",  "spreadsheet", "tab", "headerRow": 1}
 *     -> {"headers": [{"column": "C", "name": "MAWB"}, ...]}
 *   {"key", "action": "readRows",    "spreadsheet", "tab", "match": {"MAWB": "695-60488912"}}
 *   {"key", "action": "readRows",    "spreadsheet", "tab", "lastN": 20}
 *     -> {"headers": [...], "rows": [{"row": 357, "values": {"MAWB": "...", ...}}]}
 *   {"key", "action": "lookup",      "spreadsheet", "tab" or "tabs": [...], "keys": ["695-60488912", ...]}
 *     -> {"results": [{"key": "695-60488912", "found": [{"tab": "...", "row": 357}]}, {"key": "...", "found": []}]}
 *   {"key", "action": "appendRows",  "spreadsheet", "tab", "rows": [{"MAWB": "695-60488912", "PCs": 144}]}
 *     -> {"results": [{"key": "...", "addedRow": 385} | {"key": "...", "skipped": "already in the tab"}]}
 *   {"key", "action": "deleteRows",  "spreadsheet", "tab", "rows": [{"row": 385, "MAWB": "695-60488912"}]}
 *     -> {"results": [{"row": 385, "deleted": true} | {"row": 385, "skipped": "..."}]}
 *
 * Optional on every tab action: "headerRow" (default 1) and "keyColumn" (default
 * SETTINGS.keyColumn, "MAWB"), the column that identifies a row.
 *
 * Columns are named by their header text (matched after trimming and collapsing spaces and
 * line breaks, ignoring case), so tabs with different column orders all work. Use a column
 * letter only where the header is blank or repeated.
 *
 * lookup is read-only and reads only the key column (MAWB), for checking which shipments are
 * already in the sheet. It accepts several tabs; a tab without the key column is reported in
 * "skippedTabs" instead of failing the call.
 *
 * Safety rules:
 *   - Only spreadsheets in SETTINGS.allowedSheets can be opened.
 *   - appendRows writes below the last row that has a value in the key column, never
 *     overwrites a filled cell, and skips a row whose key is already in the tab.
 *   - deleteRows deletes a row only if every value sent with it (other than "row") still
 *     matches that row, and at least one value must be sent.
 *
 * One-time setup (signed in to the work account):
 *   1. script.google.com > New project. Paste this file. In Project Settings tick
 *      "Show appsscript.json" and paste sheet-api.appsscript.json. Fill in SETTINGS, Save.
 *   2. Choose `setup` in the function menu, click Run, allow the permissions.
 *   3. Deploy > New deployment > type "Web app", Execute as "Me", Who has access "Anyone",
 *      Deploy. Copy the Web app URL (it ends in /exec) into SETTINGS.webAppUrl, Save, and
 *      run `setup` again. Google only tells the script its /dev test link, which Claude
 *      cannot call, so the link has to be pasted in once.
 *   After changing the code or SETTINGS: Deploy > Manage deployments > edit > Version "New version".
 */

const SETTINGS = {
  // The deployment's Web app URL, ending in /exec (Deploy > Manage deployments).
  webAppUrl: '',
  // Spreadsheets this API may open (links or IDs). Nothing else can be read or changed.
  allowedSheets: [
    '1jHcrcp9pi_VGmbHER3wDuPCWbuaQNLBQ7F4hE3NI-IM', // [claude testing] Copy of TLG ORD Shipment Tracker (owner air@)
  ],
  // Default column that identifies a row (duplicate check on add, safety check on delete).
  keyColumn: 'MAWB',
  // Where `setup` saves the web app link and key (folder name in My Drive, or a folder ID).
  assetsFolder: '1niXn7QSz51h_KNWvQAAazY1KZU7kApGe', // assests_for_googlesheet_automation (owner air@)
};
const KEY_FILE = 'sheet_api_key (do not share)';

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KEY')) props.setProperty('KEY', Utilities.getUuid() + Utilities.getUuid());
  writeAsset(KEY_FILE, JSON.stringify({
    url: webAppUrl(SETTINGS.webAppUrl),
    key: props.getProperty('KEY'),
    account: Session.getActiveUser().getEmail(),
    allowedSheets: SETTINGS.allowedSheets.map(sheetId),
  }), SETTINGS.assetsFolder);
}

function doPost(e) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  try {
    const req = JSON.parse(e.postData.contents);
    if (!req.key || req.key !== PropertiesService.getScriptProperties().getProperty('KEY')) {
      return out({ ok: false, error: 'Bad key.' });
    }
    const ss = openSpreadsheet(req.spreadsheet);
    if (req.action === 'listTabs') return out({ ok: true, ...listTabs(ss) });
    if (req.action === 'lookup') return out({ ok: true, ...lookup(ss, req) });
    const tab = openTab(ss, req);
    if (req.action === 'getHeaders') return out({ ok: true, ...getHeaders(tab) });
    if (req.action === 'readRows') return out({ ok: true, ...readRows(tab, req) });
    if (req.action === 'appendRows') return out({ ok: true, results: appendRows(tab, req) });
    if (req.action === 'deleteRows') return out({ ok: true, results: deleteRows(tab, req) });
    return out({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return out({ ok: false, error: err.message });
  }
}

// ---------- actions ----------

function listTabs(ss) {
  return {
    spreadsheet: { id: ss.getId(), name: ss.getName(), url: ss.getUrl() },
    tabs: ss.getSheets().map(s => ({ name: s.getName(), rows: s.getLastRow(), columns: s.getLastColumn() })),
  };
}

function getHeaders(t) {
  return { headerRow: t.headerRow, headers: t.labels.map((name, i) => ({ column: columnLetter(i + 1), name: name })) };
}

// Rows matching every field in req.match, or the last req.lastN filled rows (default 20).
function readRows(t, req) {
  const values = t.sheet.getDataRange().getDisplayValues();
  let rows = values.slice(t.headerRow).map((r, i) => ({ row: t.headerRow + 1 + i, cells: r }))
    .filter(r => r.cells.some(c => c !== ''));
  if (req.match) {
    const tests = Object.keys(req.match).map(name => [t.col(name) - 1, normalize(req.match[name])]);
    rows = rows.filter(r => tests.every(([c, v]) => normalize(r.cells[c]) === v));
  } else {
    rows = rows.slice(-(req.lastN || 20));
  }
  return {
    headers: t.labels,
    rows: rows.map(r => {
      const obj = {};
      t.labels.forEach((l, i) => { if (r.cells[i] !== undefined && r.cells[i] !== '') obj[l] = r.cells[i]; });
      return { row: r.row, values: obj };
    }),
  };
}

// Which rows of which tabs hold each key. Reads only the key column of each tab.
function lookup(ss, req) {
  if (!req.keys || !req.keys.length) throw new Error('Request needs "keys".');
  const tabs = req.tabs || (req.tab ? [req.tab] : []);
  if (!tabs.length) throw new Error('Request needs "tab" or "tabs".');
  const found = req.keys.map(() => []);
  const skippedTabs = [];
  tabs.forEach(name => {
    let t, keyCol;
    try {
      t = openTab(ss, { tab: name, headerRow: req.headerRow });
      keyCol = t.col(req.keyColumn || SETTINGS.keyColumn);
    } catch (err) {
      skippedTabs.push({ tab: name, reason: err.message });
      return;
    }
    const last = t.sheet.getLastRow();
    if (last <= t.headerRow) return;
    const cells = t.sheet.getRange(t.headerRow + 1, keyCol, last - t.headerRow, 1).getDisplayValues();
    const wanted = req.keys.map(normalize);
    cells.forEach((r, i) => {
      const v = normalize(r[0]);
      if (!v) return;
      wanted.forEach((k, j) => { if (k && v === k) found[j].push({ tab: name, row: t.headerRow + 1 + i }); });
    });
  });
  const result = { results: req.keys.map((k, j) => ({ key: k, found: found[j] })) };
  if (skippedTabs.length) result.skippedTabs = skippedTabs;
  return result;
}

function appendRows(t, req) {
  if (!req.rows || !req.rows.length) throw new Error('Request needs "rows".');
  const keyCol = t.col(req.keyColumn || SETTINGS.keyColumn);
  const keys = t.sheet.getRange(1, keyCol, Math.max(t.sheet.getLastRow(), 1), 1)
    .getDisplayValues().map(r => normalize(r[0]));
  let next = keys.length - [...keys].reverse().findIndex(v => v !== '') + 1;
  if (next > keys.length + 1 || next <= t.headerRow) next = t.headerRow + 1;

  return req.rows.map(row => {
    const cols = {};
    Object.keys(row).forEach(name => { cols[name] = t.col(name); });
    const keyName = Object.keys(row).find(name => cols[name] === keyCol);
    const key = keyName ? normalize(row[keyName]) : '';
    if (key && keys.indexOf(key) >= 0) return { key: row[keyName], skipped: 'already in the tab' };
    Object.keys(row).forEach(name => {
      if (t.sheet.getRange(next, cols[name]).getDisplayValue() !== '') {
        throw new Error('Row ' + next + ', column "' + name + '" is not empty; nothing overwritten.');
      }
    });
    Object.keys(row).forEach(name => t.sheet.getRange(next, cols[name]).setValue(row[name]));
    keys.push(key);
    return { key: keyName ? row[keyName] : null, addedRow: next++ };
  });
}

function deleteRows(t, req) {
  if (!req.rows || !req.rows.length) throw new Error('Request needs "rows".');
  // Delete from the bottom up so earlier deletions don't shift later row numbers.
  return req.rows.slice().sort((a, b) => b.row - a.row).map(r => {
    const checks = Object.keys(r).filter(name => name !== 'row');
    if (!r.row || r.row <= t.headerRow || !checks.length) {
      return { row: r.row, skipped: 'needs a row number below the header and at least one value to check, such as its MAWB' };
    }
    for (const name of checks) {
      const actual = t.sheet.getRange(r.row, t.col(name)).getDisplayValue();
      if (normalize(actual) !== normalize(r[name])) {
        return { row: r.row, skipped: name + ' in that row is "' + actual + '", not "' + r[name] + '"' };
      }
    }
    t.sheet.deleteRow(r.row);
    return { row: r.row, deleted: true };
  });
}

// ---------- helpers ----------

function openSpreadsheet(ref) {
  const allowed = SETTINGS.allowedSheets.map(sheetId);
  if (!allowed.length) throw new Error('No spreadsheets are allowed yet; add one to SETTINGS.allowedSheets.');
  const id = ref ? sheetId(ref) : allowed.length === 1 ? allowed[0] : '';
  if (!id) throw new Error('Request needs "spreadsheet" (link or ID).');
  if (allowed.indexOf(id) < 0) throw new Error('Spreadsheet ' + id + ' is not in the allowed list.');
  return SpreadsheetApp.openById(id);
}

// ".../spreadsheets/d/<ID>/edit#gid=0" or a bare ID -> "<ID>".
function sheetId(ref) {
  const m = String(ref).match(/\/d\/([-\w]{25,})/);
  return (m ? m[1] : String(ref)).trim();
}

function openTab(ss, req) {
  if (!req.tab) throw new Error('Request needs "tab".');
  const sheet = ss.getSheetByName(req.tab);
  if (!sheet) throw new Error('Tab not found: ' + req.tab);
  const headerRow = req.headerRow || 1;
  const headers = sheet.getRange(headerRow, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  // Blank headers become their column letter; repeated headers get the letter added.
  const clean = headers.map(h => String(h).replace(/\s+/g, ' ').trim());
  const labels = clean.map((h, i) => !h ? columnLetter(i + 1)
    : clean.filter(x => headerKey(x) === headerKey(h)).length > 1 ? h + ' (' + columnLetter(i + 1) + ')' : h);
  return { sheet: sheet, headerRow: headerRow, labels: labels, col: name => resolveColumn(headers, name) };
}

// A header name, or a column letter: "C", or a label like "Note (AA)" from readRows.
function resolveColumn(headers, name) {
  const wanted = headerKey(name);
  const hits = [];
  headers.forEach((h, i) => { if (headerKey(h) === wanted) hits.push(i + 1); });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error('Header "' + name + '" appears ' + hits.length + ' times; use the column letter.');
  const letter = String(name).match(/^([A-Z]{1,2})$|\(([A-Z]{1,2})\)$/);
  if (letter) return columnIndex(letter[1] || letter[2]);
  throw new Error('No header "' + name + '" in this tab.');
}

function headerKey(h) {
  return String(h || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function columnIndex(letters) {
  return letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function columnLetter(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function normalize(v) {
  return String(v == null ? '' : v).replace(/[\s-]/g, '');
}

function webAppUrl(pasted) {
  const url = String(pasted || '').trim();
  if (!url) return '(paste the Web app URL ending in /exec into the script, then run setup again)';
  if (!/\/exec$/.test(url)) {
    throw new Error('Paste the Web app URL ending in /exec (Deploy > Manage deployments) into SETTINGS.webAppUrl, then run setup again.');
  }
  return url;
}

function writeAsset(name, text, folderSpec) {
  const folder = openFolder(folderSpec || SETTINGS.assetsFolder);
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return folder.createFile(name, text, MimeType.PLAIN_TEXT);
  const file = files.next();
  if (file.getMimeType() === MimeType.GOOGLE_DOCS) DocumentApp.openById(file.getId()).getBody().setText(text);
  else file.setContent(text);
}

// A folder ID, or a folder name in My Drive (created if missing).
function openFolder(spec) {
  if (/^[-\w]{25,}$/.test(spec)) {
    try { return DriveApp.getFolderById(spec); } catch (e) { /* a long folder name, not an ID */ }
  }
  const it = DriveApp.getRootFolder().getFoldersByName(spec);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(spec);
}
