/**
 * Motion Media revenue sheet.
 *
 * Paste this into the Google Sheet under Extensions → Apps Script.
 *
 *  - GoHighLevel sends a POST here every time an opportunity is marked Won,
 *    and the job is added as a new row on the "Revenue" tab.
 *  - The spend tracker sends a GET here to read those rows.
 *
 * Both require the secret key, so nobody else can read or add rows even if
 * they find the URL. Run setup() once to create the tab and the key.
 */

const SHEET_NAME = 'Revenue';
const HEADERS = ['Date', 'Client', 'Customer', 'Amount', 'Source', 'Ad Account ID', 'Opportunity ID'];

/** Run once from the Apps Script editor. Sets up the Revenue tab and prints your API key in the log. */
function setup() {
  const sheet = getSheet_();
  // Formatting: bold, frozen header row; dates as dates; amounts as dollars.
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('D:D').setNumberFormat('$#,##0.00');
  sheet.getRange('F:G').setNumberFormat('@'); // keep long IDs as text so Sheets doesn't round them
  sheet.getRange(1, 1, 1, HEADERS.length).setNumberFormat('@');
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('API_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('API_KEY', key);
  }
  Logger.log('Your API key: ' + key);
}

/** GoHighLevel → sheet. Adds one row per won opportunity, skipping repeats of the same opportunity. */
function doPost(e) {
  if (!authorized_(e)) return json_({ ok: false, error: 'unauthorized' });

  let body = {};
  try {
    body = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid JSON' });
  }
  // GHL's Webhook action nests the fields you add under customData; accept either shape.
  const d = Object.assign({}, body, body.customData || {});

  const amount = parseAmount_(d.amount);
  if (!(amount > 0)) return json_({ ok: false, error: 'missing or zero amount' });

  const client = String(d.client || d.location_name || '').trim();
  if (!client) return json_({ ok: false, error: 'missing client' });

  const oppId = String(d.opportunity_id || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    if (oppId && sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, 7, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
      if (ids.indexOf(oppId) !== -1) return json_({ ok: true, duplicate: true });
    }
    sheet.appendRow([
      new Date(),
      client,
      String(d.customer || d.full_name || '').trim(),
      amount,
      String(d.source || '').trim(),
      String(d.ad_account || '').replace(/^act_/, '').trim(),
      oppId,
    ]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

/** Sheet → spend tracker. Returns every row as JSON. */
function doGet(e) {
  if (!authorized_(e)) return json_({ error: 'unauthorized' });
  const sheet = getSheet_();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const values = sheet.getDataRange().getValues().slice(1);
  const rows = values
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      date: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).slice(0, 10),
      client: String(r[1]),
      customer: String(r[2] || ''),
      amount: parseAmount_(r[3]),
      source: String(r[4] || ''),
      adAccount: String(r[5] || ''),
      id: String(r[6] || ''),
    }));
  return json_({ rows: rows });
}

function authorized_(e) {
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  return Boolean(key && e && e.parameter && e.parameter.key === key);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // A sheet created from a file upload names its first tab something like "Untitled" or "Sheet1".
    // If that first tab is empty or already has these headers, adopt it instead of adding a second tab.
    const first = ss.getSheets()[0];
    const firstRow = first.getLastRow() > 0
      ? first.getRange(1, 1, 1, HEADERS.length).getValues()[0].map(String)
      : [];
    const adoptable = first.getLastRow() === 0 || (first.getLastRow() === 1 && firstRow.join('|') === HEADERS.join('|'));
    if (adoptable) {
      first.setName(SHEET_NAME);
      sheet = first;
    } else {
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('D:D').setNumberFormat('$#,##0.00');
  }
  return sheet;
}

function parseAmount_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
