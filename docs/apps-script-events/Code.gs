/**
 * Events API for Home Dashboard
 *
 * Spreadsheet tabs required:
 * - events_major
 *   headers: id | title | createdAt
 * - events_schedule
 *   headers: id | date | title | createdAt
 */

const SHEET_MAJOR = 'events_major';
const SHEET_SCHEDULE = 'events_schedule';

function doGet() {
  return jsonResponse({ success: true, message: 'Events API is running' });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = (body.action || '').trim();

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

      case 'removeMajorEvent':
        removeMajorEvent(ss, body.id);
        return jsonResponse({ success: true });

      case 'addScheduleEvent':
        return jsonResponse({ success: true, data: addScheduleEvent(ss, body.date, body.title) });

      case 'removeScheduleEvent':
        removeScheduleEvent(ss, body.id);
        return jsonResponse({ success: true });

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
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const contents = e.postData.contents;
  return JSON.parse(contents);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSheets(ss) {
  const majorSheet = getOrCreateSheet(ss, SHEET_MAJOR, ['id', 'title', 'createdAt']);
  const scheduleSheet = getOrCreateSheet(ss, SHEET_SCHEDULE, ['id', 'date', 'title', 'createdAt']);

  majorSheet.autoResizeColumns(1, 3);
  scheduleSheet.autoResizeColumns(1, 4);
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

function getAllData(ss) {
  const major = readRows(ss.getSheetByName(SHEET_MAJOR), ['id', 'title', 'createdAt']);
  const schedule = readRows(ss.getSheetByName(SHEET_SCHEDULE), ['id', 'date', 'title', 'createdAt']);

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

function readRows(sheet, keys) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, keys.length).getValues();
  return values
    .filter((row) => row[0])
    .map((row) => {
      const out = {};
      keys.forEach((key, i) => {
        out[key] = row[i];
      });
      return out;
    });
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

function removeMajorEvent(ss, id) {
  const targetId = String(id || '').trim();
  if (!targetId) {
    throw new Error('id is required');
  }

  const sheet = ss.getSheetByName(SHEET_MAJOR);
  deleteById(sheet, targetId, 1);
}

function addScheduleEvent(ss, date, title) {
  const trimmedDate = String(date || '').trim();
  const trimmedTitle = String(title || '').trim();

  if (!trimmedDate) {
    throw new Error('date is required');
  }
  if (!trimmedTitle) {
    throw new Error('title is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    throw new Error('date must be YYYY-MM-DD');
  }

  const sheet = ss.getSheetByName(SHEET_SCHEDULE);
  const created = {
    id: generateId('schedule'),
    date: trimmedDate,
    title: trimmedTitle,
    createdAt: nowIso(),
  };

  sheet.appendRow([created.id, created.date, created.title, created.createdAt]);
  return created;
}

function removeScheduleEvent(ss, id) {
  const targetId = String(id || '').trim();
  if (!targetId) {
    throw new Error('id is required');
  }

  const sheet = ss.getSheetByName(SHEET_SCHEDULE);
  deleteById(sheet, targetId, 1);
}

function deleteById(sheet, id, idCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}
