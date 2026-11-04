---
name: tlg-prealert
description: Read air pre-alert emails (RALERT / PRE-ALERT / 预报) in the air@ Gmail and check or enter them in the TLG ORD Shipment Tracker. Check mode is read-only ("check prealert emails only", "只查预报邮件", "只查最近 7 天的预报邮件"). Entry mode adds rows and fixes existing ones ("把预报录到 2026. JUN 大贸 空运", "录入预报", "one-shot", "一次性跑完"). Also single sheet requests ("查 695-60488912", "357行 件数 140", "删 358行").
allowed-tools: mcp__Gmail__search_threads, mcp__Gmail__get_thread, mcp__Gmail__get_message, mcp__Google_Drive__search_files, mcp__Google_Drive__download_file_content, mcp__Google_Drive__read_file_content, mcp__Google_Drive__get_file_metadata, mcp__claude_ai_Gmail__search_threads, mcp__claude_ai_Gmail__get_thread, mcp__claude_ai_Gmail__get_message, mcp__claude_ai_Google_Drive__search_files, mcp__claude_ai_Google_Drive__download_file_content, mcp__claude_ai_Google_Drive__read_file_content, mcp__claude_ai_Google_Drive__get_file_metadata, Bash(python3:*), Bash(pip install:*), Bash(pip3 install:*), Bash(pdftotext:*)
---

# TLG pre-alert → tracker

All replies to the user are in Simplified Chinese. Keep MAWB numbers, sheet headers, file names and email addresses as written. Never paste raw API output. Never show a key.

**If anything is uncertain, ask the user. Never guess.** This covers every step: whether an email is a pre-alert, which MAWB a follow-up belongs to, whether a follow-up changes data, the client name, any must-have value. Ask all open questions together, in one message.

## Modes

| Mode | Trigger | Writes |
|---|---|---|
| Check | "check prealert emails only", "只查预报邮件", "只查/检查预报" | No sheet writes. Saves and reads the attachments of every original pre-alert email in the window, to check them. |
| Entry | "录入", "把预报录到 <tab>", "add pre-alerts to the sheet" | Saves attachments; after the user approves the list, appends rows and makes the changes to existing rows. |
| One-shot | "one-shot", "一次性", "一次性跑完" | Same as Entry, without stopping for approval. Only uncertain items are asked. |
| Loop | `/tlg-prealert:prealert-loop` (add `微信` for WeChat mode) | One round of One-shot on emails not processed yet. See Loop mode. |

| Sheet request | "查 695-60488912", "HZC 有几票", "357行 件数 140", "删 358行", "加一行 ..." | One request on the tab, no email reading. Same rules as wechat-confirm Requests (`../wechat-confirm/SKILL.md`), answered in the conversation. |

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
- Window for the opening sentence: `python3 -c "from zoneinfo import ZoneInfo; from datetime import datetime,timedelta; n=datetime.now(ZoneInfo('America/Chicago')); print((n-timedelta(days=N)).strftime('%m/%d %H:%M'), n.strftime('%m/%d %H:%M'))"` (N = days; `pip install tzdata` if the zone is missing).
- Mailbox: the `authuser` in any Gmail `viewUrl`. If it is not `mailbox` in `config.json`, tell the user and ask before going on (the Attachment API reads `mailbox`, so message ids would not match).
- Gmail `search_threads` for the window, following `reference/gmail-search.md` (time slices; the connector does not page, and `after:<seconds>` returns nothing). Keep a thread when the subject contains RALERT, PRE-ALERT, PREALERT or 预报, or the body has a MAWB (`\d{3}-?\d{8}`). Ignore everything else (system notices, security alerts, Drive shares).
- One shipment = one MAWB. An email with two MAWBs is two shipments. Copies of the same email (forwarded twice, same body) count once.

## Step 2: follow-ups

For each MAWB:
- Search Gmail for the MAWB with no date limit (`"695-60488912" OR "69560488912"`; 50 results → split as in `reference/gmail-search.md`) and `get_thread` every hit, so replies and separate follow-up emails are included.
- **First email** = the earliest message for this MAWB. Its received date (in `timezone`) is column `Data`, as `MM/DD`.
- **Only follow-ups inside the window count.** A change in a follow-up received before the window (e.g. `98 → 96 PCS` on 09/29 when the user asked for the last day) is assumed already handled: don't act on it, don't report it as a change. For a MAWB already in the sheet, use only messages inside the window. For a MAWB not in the sheet yet, build the row from all its messages (nothing has been entered, so the latest data wins).
- **Latest data wins**: pieces, weight, ETA, flight, notes come from the newest message that states them.
- Note what each follow-up inside the window changed: pieces, weight, ETA/flight, MAWB replacement, cancellation, special handling.
- **Change keywords.** Scan the subject and snippet (the sender's new text, not the quoted older mail) of every message inside the window, except the first email's body, for: SHORT, PART B (any PART), 更新, 重量, cancel / 取消, 短件 / 少件, 多件, 破损 / damage, and similar wording (拦截, 改为, 以最新为准, revised, updated). Record the keyword and the sentence it is in, e.g. `10/04「提单总件数更新为：208件」`.

## Step 3: is it in the sheet?

- One `lookup` call: `tab` = the chosen tab, `keys` = every MAWB. Don't call `listTabs`.
- Only if the result has `skippedTabs` (tab name wrong, or no MAWB column): call `listTabs` once, show the tab names, and ask the user to pick.

## Step 4: changes to existing rows

For a MAWB already in the sheet, check the messages inside the window. A follow-up that changes nothing (收到, received, DO, 3461, ISC receipt, customs released) needs nothing.

| What the email says | Action | Certain when |
|---|---|---|
| New pieces, weight or destination (SHORT, 短件, 多件, 更新, 重量 ...) | edit `PCs` / `实重Weight (KG)` / `Location` | one final value is stated, e.g. `提单总件数更新为：208件`, or `SHORT 4件` with the row's PCs known |
| New ETA or flight | `appendLine` on `Cargo notes`: `MM/DD ETA HH:MM <short note>` (e.g. `11/08 ETA 20:45 partB137`). Never overwrite. | the new date is clear (earliest rule applies) |
| MAWB replaced | edit `MAWB` | the new MAWB is stated and not in the tab |
| Whole shipment cancelled | delete the row | never certain: always ask |
| `lookup` found the MAWB in 2+ rows | delete the later row (higher number) | all 7 must-have values of the rows are equal; else ask which |

Certain → an action (made in Entry / One-shot / Loop, listed in Check). Not certain (no clear final value, sources disagree, a keyword without a number, `PART B` when it's unclear whether to add or replace) → ❓. A change to any other column, or to `客人(client)` / `Data`, is never an action: ⚠️ notice only.

Read the row first (`readRows` `match: {"MAWB": ...}`) so the edit carries the `old` value. Quote the keyword sentence and the email (sender + date) for every action and question.

For a MAWB not in the sheet, a keyword or change is not an action: put the keyword sentence in the list's `最新 follow-up` column. The latest data wins.

## Step 5: check the attachments

Subjects and bodies are sometimes wrong, so check every original pre-alert email (first email of a MAWB) in the window, in every mode:
- `saveAttachments` for each of these messages that has attachments. Don't save follow-up attachments; only when a follow-up leaves a must-have value unclear, look at its attachment file names, and save and read them if the names don't settle it. Files land in the shared folder; `already there` is fine.
- Read them with Drive `read_file_content` (file id from the response). If it returns empty (new files take a minute to index), wait and retry once, or `download_file_content` and parse locally (`pdftotext`; `pip install openpyxl` for xlsx). File names count too, e.g. `更新--297-29870-208件.pdf`.
- Compare the must-have values (PCs, weight, ETA, MAWB, destination) in the subject, body and attachments.
- If they disagree (e.g. subject 222PCS, AWB 208), say so and let the user decide (❓). Don't pick one yourself.
- Exception, ETA: when the dates in one pre-alert differ (subject, body, attachments, flight times), use the earliest. Don't ask. E.g. the email says ETA 10/05 and the AWB flight departs 10/06: use 10/05. For a MAWB already in the sheet, a disagreement inside the window is a ❓ (Step 4).
- If they agree, use the value and name the file it came from when it matters.

## Opening sentence

Every report starts with one sentence saying what was checked (template in `reference/report-zh.md`). Counts are messages received in the window; skip messages `mailbox` sent itself (label `SENT`).
- 一共: all messages in the window (see `reference/gmail-search.md` for threads with more than 5 messages).
- 预报相关: messages that belong to a kept MAWB.
- 原始邮件: the first email of a MAWB, when it falls in the window. Follow-up: every other 预报相关 message.
- If Step 2 found related messages before the window, add how many.
- The tab from Step 0 and `spreadsheetName` from `config.json`.
- Entry / One-shot: also how many rows were added and how many shipments wait on ❓.

## Check mode: stop here

Report with `reference/report-zh.md` (check sections only). End with the entry command for the same tab, e.g. `要录入请说：/tlg-prealert:prealert-to-sheet "2026. JUN 大贸 空运"`.

## Entry mode

1. Use the tab from Step 0.
2. Candidates = shipments not in the sheet, plus the Step 4 actions. ❓ items wait for an answer; ⚠️ notices are only reported.
3. **Entry**: show the candidate list and the actions (report format) and wait for the user to confirm. **One-shot**: don't wait.
4. For each confirmed shipment:
   - Save and read the attachments of messages Step 5 did not cover (e.g. an original before the window), the same way.
   - Build the row with `reference/columns.md`: only the 7 must-have fields. Don't guess. A 计费重 value you find goes in the report, never in the row. Never fill or ask about last mile.
5. **Must-have check.** Every new row needs all of: `Data`, `MAWB`, `客人(client)`, `Location`, `实重Weight (KG)`, `Cargo notes` (with the ETA), `PCs` (other tabs: the matching headers in `reference/columns.md`). If any is missing or you are not sure of it, ask the user before writing that row (❓ in the report: MAWB, field, values found, which email). Not sure means: sources disagree, a follow-up changed it without a clear final value, a keyword (SHORT, PART B, 短件, 多件, 拦截 ...) leaves the count or weight unclear, or the client name is not certain. Step 5 has already checked the attachments. Ask in both Entry and One-shot mode.
6. `getHeaders` for the tab. Map each field to the tab's actual header text (headers differ between tabs). Send all rows that passed the must-have check in one `appendRows` call. Rows waiting on ❓ answers go in a second `appendRows` call after the user answers.
7. Step 4 actions: one `updateCells` call for all edits; `deleteRows` one row per call, bottom row first. A result `skipped` with `current` means the cell changed since it was read: don't retry, ask (❓ with the current value). Run deletes after the appends and edits, since they shift the rows below.
8. Loop WeChat mode: `S log` every write (see wechat-confirm).
9. Report: added rows (row number), changed and deleted rows (old → new), ❓ questions, other values found but not written, skipped (reason), ⚠️.

## Hard rules

- Never call `deleteAttachments`. The helper refuses it. `deleteRows`: one row per call, with its MAWB.
- Existing rows: change only `PCs`, `实重Weight (KG)`, `Location`, `MAWB` (with `old`) and add lines to `Cargo notes`, and only when certain (Step 4). Never another column, never to empty.
- New rows: only the 7 must-have fields. Never write a row with one of them empty or guessed. `Cargo notes` (ETA) is never skipped.
- Write only to a spreadsheet the Sheet API allows; never to the original tracker.
- Check mode never writes, edits or deletes, even if asked mid-run; tell the user to run Entry mode. It does save attachments (Step 5).
- Never fill or ask about last mile.

## Loop mode

`/tlg-prealert:prealert-loop` runs one round and stops. How often it runs is set outside the skill (e.g. `/loop 30m /tlg-prealert:prealert-loop 微信`). `S` = `python3 <skills folder>/wechat-confirm/scripts/wechat_state.py`.

Two ways to ask:
- **Terminal (default)**: every question (❓ shipments, questions about the run) is asked in the conversation, as in One-shot. Works in the web app too.
- **WeChat** (argument `微信`, or the user says "微信全程操作模式"): never stop to ask in the conversation. ❓ shipments and questions about the run go to WeChat through the wechat-confirm skill; while one waits for a reply, skip that part and finish the rest. If the wechat tools are missing, stop and say so; don't fall back to Terminal.

Steps:
1. Tab = `loopTab` in `config.json`. Don't ask.
2. WeChat: run the wechat-confirm Execute step for `confirmed` / `corrected` items not done yet, including run items (below). WeChat requests themselves are handled when they arrive, not here.
3. Window: `S last-run` gives `hours` since the last run (rounded up, plus 1). Search `newer_than:<hours>h` as in `reference/gmail-search.md`, then keep the message ids `S unseen` returns. These messages are the window. None → stop: no report, no WeChat message. No last run yet → First run (below).
4. Steps 1-6 as One-shot, on those messages: certain rows and Step 4 actions are written now. Terminal: ask ❓ in the conversation. WeChat: hand ❓ items, the changes made and ⚠️ notices to the wechat-confirm Send step; a ❓ item is written only after a reply.
5. After the rows are written: `S seen <every message id from step 3>`, then `S last-run --set`. Short report (`reference/report-zh.md`).

### First run

1. `readRows` with `lastN: 1` on the tab: the last row's MAWB and `Data`. Assume every pre-alert up to that MAWB's first email is already entered.
2. Find that first email in Gmail. Count the pre-alert related messages received after it (`reference/gmail-search.md`) and note the range (`MM/DD HH:MM` to now).
3. Ask once: `表格最后一行是 <MAWB>（<Data>），我假定它之前的预报都录过了。从 <start> 到现在共有 <n> 封预报相关邮件（<k> 票），要一次性 one-shot 录入吗？`
   - Terminal: ask in the conversation. Yes → run steps 4-5 on that range. No → `S last-run --set`; start from now.
   - WeChat: `S last-run --set` now (later rounds go on from now), and send the question as a run item: `S add '[{"mawb": "run:backfill", "content": "<the question>", "row": {"action": "backfill", "from": <epoch of start>, "to": <now>}}]'`. When someone replies 确认, wechat-confirm runs One-shot on that range right away (messages `S unseen` returns), then `S set <id> done`. Step 2 of a round also picks up a `confirmed` run item that was not done yet.
