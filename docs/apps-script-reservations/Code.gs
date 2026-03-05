/**
 * Reservations API
 *
 * Required sheets:
 * - Items: item_name | total_qty | created_at | updated_at
 * - Loans: id | class_name | item_name | date | period_start | period_end | status | returned_at | created_at
 */

const SHEET_ITEMS = 'Items';
const SHEET_LOANS = 'Loans';
const CLASS_OPTIONS = ['3-1', '3-2', '3-3', '3-4', '3-5'];
const PERIOD_MIN = 1;
const PERIOD_MAX = 6;

function doGet() {
  return jsonResponse({ success: true, message: 'Reservations API is running' });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = String(body.action || '').trim();

    if (!action) {
      throw new Error('action is required');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);

    switch (action) {
      case 'getInitData':
        return jsonResponse({ success: true, data: getInitData(ss) });

      case 'getOpenLoans':
        return jsonResponse({ success: true, data: getOpenLoans(ss) });

      case 'createLoan': {
        const created = createLoan(ss, body);
        return jsonResponse({ success: true, data: created });
      }

      case 'returnLoan': {
        const returned = returnLoan(ss, body.id);
        return jsonResponse({ success: true, data: returned });
      }

      default:
        throw new Error('Unsupported action: ' + action);
    }
  } catch (err) {
    return jsonResponse({
      success: false,
      message: err && err.message ? err.message : String(err),
    });
  }
}

function parseBody(e) {
  const fromParams = e && e.parameter ? e.parameter : {};
  if (fromParams && Object.keys(fromParams).length > 0) {
    return fromParams;
  }

  if (e && e.postData && e.postData.contents) {
    const text = String(e.postData.contents || '').trim();
    if (!text) {
      return {};
    }

    return JSON.parse(text);
  }

  return {};
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function ensureSheets(ss) {
  getOrCreateSheet(ss, SHEET_ITEMS, ['item_name', 'total_qty', 'created_at', 'updated_at']);
  getOrCreateSheet(ss, SHEET_LOANS, [
    'id',
    'class_name',
    'item_name',
    'date',
    'period_start',
    'period_end',
    'status',
    'returned_at',
    'created_at',
  ]);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some((h, i) => current[i] !== h);
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return prefix + '_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeDateKey(value, tz) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
  }

  return '';
}

function parsePeriod(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < PERIOD_MIN || n > PERIOD_MAX) {
    throw new Error(label + ' must be between 1 and 6');
  }
  return n;
}

function getInitData(ss) {
  const items = getItems(ss);
  const openLoans = getOpenLoans(ss);
  const topItems = getTopItems(ss, 10);

  return {
    items: items,
    topItems: topItems,
    openLoans: openLoans,
  };
}

function getItems(ss) {
  const sheet = ss.getSheetByName(SHEET_ITEMS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  return values
    .filter((row) => String(row[0]).trim())
    .map((row) => ({
      itemName: String(row[0]).trim(),
      totalQty: Number(row[1]) || 1,
      createdAt: String(row[2] || ''),
      updatedAt: String(row[3] || ''),
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function getOpenLoans(ss) {
  const all = getAllLoans(ss);
  return all.filter((loan) => loan.status === 'reserved');
}

function getAllLoans(ss) {
  const sheet = ss.getSheetByName(SHEET_LOANS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Seoul';
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const rows = values
    .filter((row) => String(row[0]).trim())
    .map((row) => ({
      id: String(row[0]).trim(),
      className: String(row[1]).trim(),
      itemName: String(row[2]).trim(),
      date: normalizeDateKey(row[3], tz),
      periodStart: Number(row[4]) || 0,
      periodEnd: Number(row[5]) || 0,
      status: String(row[6]).trim() === 'returned' ? 'returned' : 'reserved',
      returnedAt: String(row[7] || ''),
      createdAt: String(row[8] || ''),
    }))
    .filter((row) => row.id && row.itemName && row.date);

  return rows.sort(function (a, b) {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) {
      return byDate;
    }

    const byStart = Number(a.periodStart) - Number(b.periodStart);
    if (byStart !== 0) {
      return byStart;
    }

    return String(a.itemName).localeCompare(String(b.itemName));
  });
}

function getTopItems(ss, limit) {
  const loans = getAllLoans(ss);
  const counts = {};
  const latest = {};

  loans.forEach(function (loan) {
    const name = String(loan.itemName || '').trim();
    if (!name) {
      return;
    }

    counts[name] = (counts[name] || 0) + 1;
    latest[name] = String(loan.createdAt || '');
  });

  return Object.keys(counts)
    .sort(function (a, b) {
      const byCount = counts[b] - counts[a];
      if (byCount !== 0) {
        return byCount;
      }
      return String(latest[b]).localeCompare(String(latest[a]));
    })
    .slice(0, limit);
}

function ensureItemExists(ss, itemName) {
  const normalized = String(itemName || '').trim();
  if (!normalized) {
    throw new Error('itemName is required');
  }

  const sheet = ss.getSheetByName(SHEET_ITEMS);
  const lastRow = sheet.getLastRow();
  const now = nowIso();

  if (lastRow >= 2) {
    const names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === normalized) {
        sheet.getRange(i + 2, 4).setValue(now);
        return;
      }
    }
  }

  sheet.appendRow([normalized, 1, now, now]);
}

function createLoan(ss, input) {
  const className = String(input.className || '').trim();
  const itemName = String(input.itemName || '').trim();
  const date = String(input.date || '').trim();
  const periodStart = parsePeriod(input.periodStart, 'periodStart');
  const periodEnd = parsePeriod(input.periodEnd, 'periodEnd');

  if (!CLASS_OPTIONS.includes(className)) {
    throw new Error('className must be one of 3-1~3-5');
  }

  if (!itemName) {
    throw new Error('itemName is required');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must be YYYY-MM-DD');
  }

  if (periodStart > periodEnd) {
    throw new Error('periodStart must be <= periodEnd');
  }

  ensureItemExists(ss, itemName);

  const created = {
    id: createId('loan'),
    className: className,
    itemName: itemName,
    date: date,
    periodStart: periodStart,
    periodEnd: periodEnd,
    status: 'reserved',
    returnedAt: '',
    createdAt: nowIso(),
  };

  const sheet = ss.getSheetByName(SHEET_LOANS);
  sheet.appendRow([
    created.id,
    created.className,
    created.itemName,
    created.date,
    created.periodStart,
    created.periodEnd,
    created.status,
    created.returnedAt,
    created.createdAt,
  ]);

  return created;
}

function returnLoan(ss, id) {
  const targetId = String(id || '').trim();
  if (!targetId) {
    throw new Error('id is required');
  }

  const sheet = ss.getSheetByName(SHEET_LOANS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('loan not found');
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === targetId) {
      const returnedAt = nowIso();
      sheet.getRange(i + 2, 7).setValue('returned');
      sheet.getRange(i + 2, 8).setValue(returnedAt);

      return {
        id: String(rows[i][0]).trim(),
        className: String(rows[i][1]).trim(),
        itemName: String(rows[i][2]).trim(),
        date: String(rows[i][3]).trim(),
        periodStart: Number(rows[i][4]) || 0,
        periodEnd: Number(rows[i][5]) || 0,
        status: 'returned',
        returnedAt: returnedAt,
        createdAt: String(rows[i][8] || ''),
      };
    }
  }

  throw new Error('loan not found');
}
