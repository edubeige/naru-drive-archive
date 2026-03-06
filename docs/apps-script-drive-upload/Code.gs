/**
 * Drive Upload API (A-option)
 *
 * Required setup:
 * 1) Set ROOT_FOLDER_ID to your Drive root folder ID for this archive.
 * 2) Deploy as Web App (Execute as: Me, Access: Anyone with link)
 * 3) Use /macros/s/.../exec URL in VITE_MATERIALS_UPLOAD_API_URL
 */

const ROOT_FOLDER_ID = ''; // e.g. '1AbCdEfGhIjKlMnOp'
const PATH_DELIMITER = ' > ';
const MAX_UPLOAD_MB = 20;

function doGet(e) {
  try {
    const body = parseBody(e);
    const action = String(body.action || '').trim();

    if (!action || action === 'health') {
      return jsonResponse({ success: true, message: 'Drive Upload API is running' });
    }

    if (action === 'resolvePath') {
      const folder = resolveFolderByPath_(String(body.targetPath || '').trim());
      return jsonResponse({
        success: true,
        data: {
          folderId: folder.getId(),
          folderName: folder.getName(),
          folderUrl: folder.getUrl(),
        },
      });
    }

    throw new Error('Unsupported GET action: ' + action);
  } catch (err) {
    return jsonResponse({ success: false, message: toErrorMessage_(err) });
  }
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = String(body.action || '').trim();

    if (!action) {
      throw new Error('action is required');
    }

    switch (action) {
      case 'uploadFile':
        return jsonResponse({ success: true, data: uploadFile_(body) });

      case 'health':
        return jsonResponse({ success: true, message: 'ok' });

      default:
        throw new Error('Unsupported action: ' + action);
    }
  } catch (err) {
    return jsonResponse({ success: false, message: toErrorMessage_(err) });
  }
}

function parseBody(e) {
  const fromParams = e && e.parameter ? e.parameter : {};
  if (fromParams && Object.keys(fromParams).length > 0) {
    return fromParams;
  }

  if (e && e.postData && e.postData.contents) {
    const raw = String(e.postData.contents || '').trim();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  return {};
}

function uploadFile_(body) {
  const targetPath = String(body.targetPath || '').trim();
  const fileName = sanitizeFileName_(String(body.fileName || '').trim());
  const mimeType = String(body.mimeType || 'application/octet-stream').trim();
  const fileBase64 = String(body.fileBase64 || '').trim();

  if (!targetPath) {
    throw new Error('targetPath is required');
  }

  if (!fileName) {
    throw new Error('fileName is required');
  }

  if (!fileBase64) {
    throw new Error('fileBase64 is required');
  }

  const bytes = Utilities.base64Decode(fileBase64);
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (bytes.length > maxBytes) {
    throw new Error('File is too large. Max upload size: ' + MAX_UPLOAD_MB + 'MB');
  }

  const folder = resolveFolderByPath_(targetPath);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const createdFile = folder.createFile(blob);

  return {
    id: createdFile.getId(),
    name: createdFile.getName(),
    url: createdFile.getUrl(),
    folderId: folder.getId(),
    folderName: folder.getName(),
    targetPath: targetPath,
    uploadedAt: new Date().toISOString(),
  };
}

function resolveFolderByPath_(targetPath) {
  if (!ROOT_FOLDER_ID) {
    throw new Error('ROOT_FOLDER_ID is empty. Set your root folder ID in Code.gs');
  }

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const segments = targetPath
    .split(PATH_DELIMITER)
    .map(function (x) { return String(x || '').trim(); })
    .filter(function (x) { return !!x; });

  if (!segments.length) {
    return root;
  }

  var current = root;
  var startIndex = 0;

  // if first segment is the same as root folder name, skip it
  if (segments[0] === root.getName()) {
    startIndex = 1;
  }

  for (var i = startIndex; i < segments.length; i++) {
    var name = segments[i];
    var iter = current.getFoldersByName(name);
    if (!iter.hasNext()) {
      throw new Error('Folder not found in path: ' + targetPath + ' (missing: ' + name + ')');
    }
    current = iter.next();
  }

  return current;
}

function sanitizeFileName_(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function toErrorMessage_(err) {
  return err && err.message ? String(err.message) : String(err);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

