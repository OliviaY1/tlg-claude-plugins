/**
 * Gmail Attachments API (Google Apps Script, standalone project, deployed once for the company
 * by the shared mailbox account that receives all pre-alerts).
 *
 * Claude's Gmail connector can read emails but cannot download attachments. This small,
 * private web API lists an email's attachments and saves them straight into Drive, so the
 * files never pass through Claude. It has no schedule and only reads mail.
 *
 * Every call is a POST with JSON and must carry the secret key.
 * "folder" is optional everywhere. It is a path of folder names from My Drive
 * ("email_attachments_for_claude/RALERT-695-60488912"), and its first part may instead be
 * a folder ID or link, which is how a folder shared by a coworker is reached
 * ("1AbC...xyz/RALERT-695-60488912"). Missing folders are created.
 * Without "folder", files go to <SETTINGS.attachmentsFolder>/<subject without Fwd:/Re:>.
 *
 *   {"key": "...", "action": "listAttachments", "messageId": "19f4d1e8f0a3bd67"}
 *     -> {"subject", "from", "date", "folder" (the default folder name),
 *         "attachments": [{"name", "mimeType", "size"}]}
 *   {"key": "...", "action": "saveAttachments", "messageId": "...", "names": ["optional"], "folder": "optional"}
 *     -> {"folder": {"name", "id", "url"},
 *         "files": [{"name", "id", "url", "status": "saved" | "already there"}]}
 *     Saves the named attachments, or all of them when "names" is left out. A file whose
 *     name is already in the folder is skipped.
 *   {"key": "...", "action": "deleteAttachments", "messageId": "...", "names": ["optional"], "folder": "optional"}
 *     -> {"folder": {"name", "id", "url"}, "files": [{"name", "status": "deleted" | "not there"}]}
 *     Moves this email's saved attachments (the named ones, or all) from the folder to the
 *     Drive trash, where they can be restored for 30 days. Other files are never touched.
 *
 * Sharing: the script runs as the deploying account, so it reads that account's Gmail and every
 * file it saves is owned by that account, whoever called it. Put the shared folder's ID in
 * SETTINGS.attachmentsFolder (the deploying account must be an editor of it) and share that
 * folder, plus the key file, with the group that uses the plugin. Anyone holding the key can
 * save or trash attachments for any email; trashed files sit in the deploying account's trash.
 *
 * One-time setup (once, signed in to the shared mailbox account):
 *   1. script.google.com > New project. Paste this file and click Save.
 *      Edit SETTINGS below if you want other folders (a shared folder: paste its ID).
 *   2. Choose `setup` in the function menu, click Run, allow the permissions.
 *   3. Deploy > New deployment > type "Web app", Execute as "Me", Who has access "Anyone",
 *      Deploy. Copy the Web app URL (it ends in /exec) into SETTINGS.webAppUrl, Save, and
 *      run `setup` again. Google only tells the script its /dev test link, which Claude
 *      cannot call, so the link has to be pasted in once.
 *   After changing the code: Deploy > Manage deployments > edit > Version "New version".
 */

const SETTINGS = {
  // The deployment's Web app URL, ending in /exec (Deploy > Manage deployments).
  webAppUrl: '',
  // Where `setup` saves the web app link and key (folder name in My Drive, or a folder ID).
  assetsFolder: '1niXn7QSz51h_KNWvQAAazY1KZU7kApGe', // assests_for_googlesheet_automation (owner air@)
  // Default parent for saved attachments (folder name in My Drive, or a shared folder's ID).
  attachmentsFolder: '1tRwh12d_Z0ouV8nNH_Ebhxsno7CCm5D6', // email_attachments_for_claude (shared, owner air@)
};
const KEY_FILE = 'gmail_attachments_api_key (do not share)';

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KEY')) props.setProperty('KEY', Utilities.getUuid() + Utilities.getUuid());
  writeAsset(KEY_FILE, JSON.stringify({
    url: webAppUrl(SETTINGS.webAppUrl),
    key: props.getProperty('KEY'),
    account: Session.getActiveUser().getEmail(),
  }), SETTINGS.assetsFolder);
}

function webAppUrl(pasted) {
  const url = String(pasted || '').trim();
  if (!url) return '(paste the Web app URL ending in /exec into the script, then run setup again)';
  if (!/\/exec$/.test(url)) {
    throw new Error('Paste the Web app URL ending in /exec (Deploy > Manage deployments) into the web app URL setting, then run setup again.');
  }
  return url;
}

function doPost(e) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  try {
    const req = JSON.parse(e.postData.contents);
    if (!req.key || req.key !== PropertiesService.getScriptProperties().getProperty('KEY')) {
      return out({ ok: false, error: 'Bad key.' });
    }
    if (!req.messageId) throw new Error('Request needs "messageId".');
    const msg = GmailApp.getMessageById(req.messageId);

    if (req.action === 'listAttachments') return out({ ok: true, ...listAttachments(msg) });
    if (req.action === 'saveAttachments') return out({ ok: true, ...saveAttachments(msg, req.names, req.folder) });
    if (req.action === 'deleteAttachments') return out({ ok: true, ...deleteAttachments(msg, req.names, req.folder) });
    return out({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return out({ ok: false, error: err.message });
  }
}

// ---------- actions ----------

function listAttachments(msg) {
  return {
    subject: msg.getSubject(),
    from: msg.getFrom(),
    date: msg.getDate().toISOString(),
    folder: SETTINGS.attachmentsFolder + '/' + emailFolderName(msg),
    attachments: attachmentsOf(msg).map(f => ({ name: f.getName(), mimeType: f.getContentType(), size: f.getSize() })),
  };
}

function saveAttachments(msg, names, folderPath) {
  const folder = targetFolder(msg, folderPath);
  const files = pickAttachments(msg, names).map(blob => {
    const existing = folder.getFilesByName(blob.getName());
    const found = existing.hasNext();
    const file = found ? existing.next() : folder.createFile(blob.copyBlob());
    return { name: file.getName(), id: file.getId(), url: file.getUrl(), status: found ? 'already there' : 'saved' };
  });
  return { folder: folderInfo(folder), files: files };
}

function deleteAttachments(msg, names, folderPath) {
  const folder = targetFolder(msg, folderPath);
  const files = pickAttachments(msg, names).map(blob => {
    const existing = folder.getFilesByName(blob.getName());
    let deleted = false;
    while (existing.hasNext()) { existing.next().setTrashed(true); deleted = true; }
    return { name: blob.getName(), status: deleted ? 'deleted' : 'not there' };
  });
  return { folder: folderInfo(folder), files: files };
}

// ---------- helpers ----------

function writeAsset(name, text, folderSpec) {
  const folder = openPath(folderSpec || SETTINGS.assetsFolder);
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return folder.createFile(name, text, MimeType.PLAIN_TEXT);
  const file = files.next();
  if (file.getMimeType() === MimeType.GOOGLE_DOCS) DocumentApp.openById(file.getId()).getBody().setText(text);
  else file.setContent(text);
}

function attachmentsOf(msg) {
  return msg.getAttachments({ includeInlineImages: false });
}

// The named attachments (all when no names are given); an unknown name is an error.
function pickAttachments(msg, names) {
  const all = attachmentsOf(msg);
  if (!names || !names.length) return all;
  return names.map(name => {
    const blob = all.find(f => f.getName() === name);
    if (!blob) throw new Error('No attachment named "' + name + '" in this email.');
    return blob;
  });
}

// Same for every worker's copy of the email, so a shared folder holds each email once.
function emailFolderName(msg) {
  return msg.getSubject().replace(/^\s*((fwd?|fw|re|转发|回复)\s*[:：]\s*)+/i, '').replace(/[\/\\]/g, '-').trim()
    || ('(no subject) ' + msg.getId());
}

function targetFolder(msg, folderPath) {
  return openPath(folderPath || SETTINGS.attachmentsFolder + '/' + emailFolderName(msg));
}

// "a/b/c" from My Drive, or "<folder ID or link>/b/c". Creates missing folders.
function openPath(path) {
  // A pasted link becomes its ID: ".../drive/folders/<ID>?usp=sharing" -> "<ID>".
  const parts = String(path).replace(/^.*\/folders\/([-\w]+)[^\/]*/, '$1')
    .split('/').map(p => p.trim()).filter(p => p);
  let folder = DriveApp.getRootFolder();
  if (parts.length && /^[-\w]{25,}$/.test(parts[0])) {
    try { folder = DriveApp.getFolderById(parts[0]); parts.shift(); } catch (e) { /* a long folder name, not an ID */ }
  }
  parts.forEach(name => {
    const it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
  });
  return folder;
}

function folderInfo(folder) {
  return { name: folder.getName(), id: folder.getId(), url: folder.getUrl() };
}
