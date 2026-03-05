/**
 * Events API for Home Dashboard
 *
 * Spreadsheet tabs required:
 * - events_major
 *   headers: id | title | createdAt
 * - events_schedule
 *   headers: id | date | title | color | createdAt
 */

const SHEET_MAJOR = 'events_major';
const SHEET_SCHEDULE = 'events_schedule';
const COLOR_OPTIONS = ['blue', 'yellow', 'green'];

function doGet(e) {
  try {
    const body = parseBody(e);
    const action = String(body.action || '').trim();

    if (!action || action === 'health') {
      return jsonResponse({ success: true, message: 'Events API is running' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);

    if (action === 'getAll') {
      return jsonResponse({ success: true, data: getAllData(ss) });
    }

    throw new Error('Unsupported GET action: ' + action);
  } catch (err) {
    return jsonResponse({ success: false, message: err && err.message ? err.message : String(err) });
  }
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
      case 'getAll':
        return jsonResponse({ success: true, data: getAllData(ss) });

      case 'addMajorEvent':
        return jsonResponse({ success: true, data: addMajorEvent(ss, body.title) });

      case 'updateMajorEvent':
        return jsonResponse({ success: true, data: updateMajorEvent(ss, body.id, body.title) });

      case 'removeMajorEvent':
        removeMajorEvent(ss, body.id);
        return jsonResponse({ success: true });

      case 'addScheduleEvent':
        return jsonResponse({ success: true, data: addScheduleEvent(ss, body.date, body.title, body.color) });

      case 'updateScheduleEvent':
        return jsonResponse({ success: true, data: updateScheduleEvent(ss, body.id, body.date, body.title, body.color) });

      case 'removeScheduleEvent':
        removeScheduleEvent(ss, body.id);
        return jsonResponse({ success: true });

      default:
        throw new Error('Unsupported action: ' + action);
    }
  } catch (err) {
    return jsonResponse({ success: false, message: err && err.message ? err.message : String(err) });
  }
}

function parseBody(e) {
  const fromParams = e && e.parameter ? e.parameter : {};
  if (fromParams && Object.keys(fromParams).length > 0) {
    return fromParams;
  }

  if (e && e.postData && e.postData.contents) {
    const contents = String(e.postData.contents || '').trim();
    if (!contents) {
      return {};
    }
    return JSON.parse(contents);
  }

  return {};
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function ensureSheets(ss) {
  getOrCreateSheet(ss, SHEET_MAJOR, ['id', 'title', 'createdAt']);
  getOrCreateSheet(ss, SHEET_SCHEDULE, ['id', 'date', 'title', 'color', 'createdAt']);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const currentHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some((h, i) => currentHeader[i] !== h);
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function generateId(prefix) {
  return prefix + '_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeDateValue(value, tz) {
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

function normalizeColor(value) {
  const color = String(value || '').trim();
  if (COLOR_OPTIONS.indexOf(color) >= 0) {
    return color;
  }
  return 'blue';
}

function getAllData(ss) {
  const major = readMajorRows(ss.getSheetByName(SHEET_MAJOR));
  const schedule = readScheduleRows(ss.getSheetByName(SHEET_SCHEDULE), ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Seoul');

  major.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  schedule.sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    return byDate !== 0 ? byDate : String(a.title).localeCompare(String(b.title));
  });

  return {
    majorEvents: major,
    scheduleEvents: schedule,
  };
}

function readMajorRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  return values
    .filter((row) => String(row[0]).trim())
    .map((row) => ({
      id: String(row[0]).trim(),
      title: String(row[1]).trim(),
      createdAt: String(row[2] || ''),
    }));
}

function readScheduleRows(sheet, tz) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const width = Math.max(sheet.getLastColumn(), 5);
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  return values
    .filter((row) => String(row[0]).trim())
    .map((row) => ({
      id: String(row[0]).trim(),
      date: normalizeDateValue(row[1], tz),
      title: String(row[2]).trim(),
      color: normalizeColor(row[3]),
      createdAt: String(row[4] || ''),
    }))
    .filter((row) => row.id && row.date && row.title);
}

function addMajorEvent(ss, title) {
  const trimmed = String(title || '').trim();
  if (!trimmed) {
    throw new Error('title is required');
  }

  const sheet = ss.getSheetByName(SHEET_MAJOR);
  const created = {
    id: generateId('major'),
    title: trimmed,
    createdAt: nowIso(),
  };

  sheet.appendRow([created.id, created.title, created.createdAt]);
  return created;
}

function updateMajorEvent(ss, id, title) {
  const targetId = String(id || '').trim();
  const trimmedTitle = String(title || '').trim();

  if (!targetId) {
    throw new Error('id is required');
  }
  if (!trimmedTitle) {
    throw new Error('title is required');
  }

  const sheet = ss.getSheetByName(SHEET_MAJOR);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('major event not found');
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === targetId) {
      sheet.getRange(i + 2, 2).setValue(trimmedTitle);
      return {
        id: targetId,
        title: trimmedTitle,
        createdAt: String(rows[i][2] || ''),
      };
    }
  }

  throw new Error('major event not found');
}

function addScheduleEvent(ss, date, title, color) {
  const trimmedDate = String(date || '').trim();
  const trimmedTitle = String(title || '').trim();
  const normalizedColor = normalizeColor(color);

  if (!trimmedDate || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    throw new Error('date must be YYYY-MM-DD');
  }
  if (!trimmedTitle) {
    throw new Error('title is required');
  }

  const sheet = ss.getSheetByName(SHEET_SCHEDULE);
  const created = {
    id: generateId('schedule'),
    date: trimmedDate,
    title: trimmedTitle,
    color: normalizedColor,
    createdAt: nowIso(),
  };

  sheet.appendRow([created.id, created.date, created.title, created.color, created.createdAt]);
  return created;
}

function updateScheduleEvent(ss, id, date, title, color) {
  const targetId = String(id || '').trim();
  const trimmedDate = String(date || '').trim();
  const trimmedTitle = String(title || '').trim();
  const normalizedColor = normalizeColor(color);

  if (!targetId) {
    throw new Error('id is required');
  }
  if (!trimmedDate || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    throw new Error('date must be YYYY-MM-DD');
  }
  if (!trimmedTitle) {
    throw new Error('title is required');
  }

  const sheet = ss.getSheetByName(SHEET_SCHEDULE);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('schedule event not found');
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === targetId) {
      sheet.getRange(i + 2, 2, 1, 3).setValues([[trimmedDate, trimmedTitle, normalizedColor]]);
      return {
        id: targetId,
        date: trimmedDate,
        title: trimmedTitle,
        color: normalizedColor,
        createdAt: String(rows[i][4] || ''),
      };
    }
  }

  throw new Error('schedule event not found');
}

function removeMajorEvent(ss, id) {
  deleteById(ss.getSheetByName(SHEET_MAJOR), String(id || '').trim());
}

function removeScheduleEvent(ss, id) {
  deleteById(ss.getSheetByName(SHEET_SCHEDULE), String(id || '').trim());
}

function deleteById(sheet, id) {
  if (!id) {
    throw new Error('id is required');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]).trim() === id) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}
