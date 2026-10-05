---
name: tlg-prealert
description: Read air pre-alert emails (RALERT / PRE-ALERT / 预报) in the air@ Gmail and check or enter them in the TLG ORD Shipment Tracker. Check mode is read-only ("check prealert emails only", "只查预报邮件", "只查最近 7 天的预报邮件"). Entry mode adds rows ("把预报录到 2026. JUN 大贸 空运", "录入预报", "one-shot", "一次性跑完").
allowed-tools: mcp__Gmail__search_threads, mcp__Gmail__get_thread, mcp__Gmail__get_message, mcp__Google_Drive__search_files, mcp__Google_Drive__download_file_content, mcp__Google_Drive__read_file_content, mcp__Google_Drive__get_file_metadata, Bash(python3:*), Bash(pip install:*), Bash(pdftotext:*)
---

# TLG pre-alert → tracker

All replies to the user are in Simplified Chinese. Keep MAWB numbers, sheet headers, file names and email addresses as written. Never paste raw API output. Never show a key.

## Modes

| Mode | Trigger | Writes |
|---|---|---|
| Check | "check prealert emails only", "只查预报邮件", "只查/检查预报" | Nothing. No attachment saving, no sheet writes. |
| Entry | "录入", "把预报录到 <tab>", "add pre-alerts to the sheet" | Saves attachments, appends rows after the user approves the list. |
| One-shot | "one-shot", "一次性", "一次性跑完" | Same as Entry, without stopping for approval. |

If the request is ambiguous, use Check mode.

## Setup per run

1. Read `config.json` (next to this file). These are the only names to use.
2. Get keys only when a step needs one. `search_files` with `title = '<file name>' and parentId = '<keyFolderId>'`. Download it with `download_file_content` (if it is a Google Doc, export as `text/plain`). Strip a leading BOM. Save the JSON (after `mkdir -p /tmp/tlg`) to `/tmp/tlg/sheet_key.json` or `/tmp/tlg/attachments_key.json`.
3. Look for keys only in the folder `keyFolderId`. Download no file other than the two names in `config.json`.
4. Call the APIs only through `scripts/tlg_api.py` (see `reference/api.md`). In Check mode always pass `--read-only`.

## Step 0: the tab

- All pre-alert rows live in one tab. Use that tab for the lookup and for inserting.
- Take it from the request or the command arguments, e.g. `/tlg-prealert:check-prealerts 1 "2026. JUN 大贸 空运"` (number = days, quoted text = tab).
- If no tab was given, ask for it first, before reading any email.

## Step 1: find pre-alerts

- Days: what the user said ("最近 7 天" → 7), else `defaultDays`.
- Gmail `search_threads` with `newer_than:<N>d`. Keep a thread when the subject contains RALERT, PRE-ALERT, PREALERT or 预报, or the body has a MAWB (`\d{3}-?\d{8}`). Ignore everything else (system notices, security alerts, Drive shares).
- One shipment = one MAWB. An email with two MAWBs is two shipments. Copies of the same email (forwarded twice, same body) count once.

## Step 2: follow-ups

For each MAWB:
- Search Gmail for the MAWB with no date limit (`"695-60488912" OR "69560488912"`) and `get_thread` every hit, so replies and separate follow-up emails are included.
- **First email** = the earliest message for this MAWB. Its received date (in `timezone`) is column `Data`, as `MM/DD`.
- **Latest data wins**: pieces, weight, ETA, flight, last mile, notes come from the newest message that states them.
- Note what each follow-up changed: pieces, weight, ETA/flight, MAWB replacement, cancellation, special handling.

## Step 3: is it in the sheet?

- One `lookup` call: `tab` = the chosen tab, `keys` = every MAWB. Don't call `listTabs`.
- Only if the result has `skippedTabs` (tab name wrong, or no MAWB column): call `listTabs` once, show the tab names, and ask the user to pick.

## Step 4: flags (⚠️)

Flag a shipment when any of these hold:
1. The MAWB is in the sheet and a follow-up arrived after the first email (data may have changed since the row was entered).
2. A follow-up asks to replace the MAWB. Report the old MAWB's row and whether the new MAWB is in the sheet.
3. Cancellation, flight change or piece-count change.
4. Sources disagree for this shipment (e.g. two different ETAs, weight differs between 预报 and AWB).
5. `lookup` found the MAWB in more than one row.

Flags go first in the report. Changing existing rows is rare; make each flag say exactly what to check: tab, row, field, value in the email, which email (sender + date).

## Check mode: stop here

Report with `reference/report-zh.md` (check sections only). End with the entry command for the same tab, e.g. `要录入请说：/tlg-prealert:prealert-to-sheet "2026. JUN 大贸 空运"`.

## Entry mode

1. Use the tab from Step 0.
2. Candidates = shipments not in the sheet and not flagged. Flagged and existing ones are never written; list them in the report.
3. **Entry**: show the candidate list (report format) and wait for the user to confirm which to enter. **One-shot**: don't wait.
4. For each confirmed shipment:
   - `saveAttachments` for every message of that MAWB that has attachments. Files land in the shared folder; `already there` is fine.
   - Read the saved files with Drive `read_file_content` (file id from the response). If it returns empty (new files take a minute to index), wait and retry once, or `download_file_content` and parse locally (`pdftotext`; `pip install openpyxl` for xlsx).
   - Build the row with `reference/columns.md`. Leave a cell empty when the value is not found. Don't guess.
5. `getHeaders` for the tab. Map each field to the tab's actual header text (headers differ between tabs). Send all rows in one `appendRows` call.
6. Report: added rows (row number), skipped (reason), flagged.

## Hard rules

- Never call `deleteRows` or `deleteAttachments`. The helper refuses them.
- Never overwrite or edit existing rows. Report instead.
- Write only to a spreadsheet the Sheet API allows; never to the original tracker.
- Check mode never saves attachments or writes rows, even if asked mid-run; tell the user to run Entry mode.
