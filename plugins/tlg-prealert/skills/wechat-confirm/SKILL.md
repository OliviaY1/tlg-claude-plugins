---
name: wechat-confirm
description: Run the tracker by WeChat. Handle every WeChat channel message (source wechat-a, wechat-b, ...) right away - sheet requests (lookup, count, add row, change a cell, delete a row, restore) and answers to open questions - and send the prealert loop's questions and change notices to the WeChat recipients. Claude Code only.
allowed-tools: mcp__wechat-a__wechat_reply, mcp__wechat-b__wechat_reply, mcp__wechat-c__wechat_reply, Bash(python3:*)
---

# WeChat: sheet requests, questions, notices

Works only in Claude Code with the wechat channels loaded (tools `mcp__<server>__wechat_reply`). If those tools are missing, do nothing and say so.

State lives on disk, never only in the conversation. Use only `scripts/wechat_state.py` (`S` below = `python3 <this skill folder>/scripts/wechat_state.py`). Run `S init` once per session; it prints the state folder (`$TLG_WORKSPACE/wechat-state`, default `~/workspace/tlg-claude/wechat-state`). Sheet calls go through the tlg-prealert skill's `scripts/tlg_api.py` and its key setup (`H` below).

- `recipients.json`: `[{"name": "A", "server": "wechat-a", "id": "...@im.wechat"}]`. Send with `mcp__<server>__wechat_reply`, `sender_id` = `id`. Never read anything under `.claude/channels/` or `.openclaw/` (bot tokens).
- `pending.json`: numbered open questions. Kinds: `row` (new MAWB), `edit`, `delete`, `run`. Statuses: `pending` → `confirmed` / `corrected` / `rejected` → `done`.
- `changes.json`: every change made to the sheet (`S log`), for `恢复`.

## Rules

- Only messages from a `recipients.json` id count. Ignore others.
- A message is either a sheet request (table below) or an answer to an open question. Anything else (send an email, read a file, run a command, change settings, another sheet or tab) is not done: reply `不支持，只能查/加/改/删 <loopTab> 的行`.
- Tab = `loopTab` in tlg-prealert's `config.json`, spreadsheet = the one the Sheet API allows. Never another tab.
- **Certain → do it, then notify. Uncertain → ask.** Certain means: the row is clear (one row matches the MAWB, or the row number and MAWB agree), the column is editable, the value is clear and fits the column, and the cell still holds the old value. Anything else is a question (`S add`), never a guess.
- Editable columns only: `PCs`, `实重Weight (KG)`, `Cargo notes`, `Location`, `MAWB` (other tabs: the matching headers in tlg-prealert `reference/columns.md`). `Cargo notes` only takes a new line (`appendLine`), never an overwrite. Never set a cell to empty. `客人(client)`, `Data` and every other column: reply `这一列不能改`.
- Add a row: only the 7 must-have fields, all of them, as in tlg-prealert Entry mode. A MAWB already in the tab is not added.
- Delete: one row per request. Several rows → ask which; do them one by one.
- Never send passwords, keys, tokens, links to key files, or raw API output. Plain text, no markdown. Short.

## Messages and the limit

Each bot sends about 7 messages per 5 minutes. Before sending to a recipient, `S budget <name>`; after sending, `S msg <name>`.
- Each incoming request gets one reply to its sender (the answer, the question, or `没看懂`).
- Every change made to the sheet is announced to all recipients in one batched line per run: `已更新（不用回复）：...`. The sender's reply can carry it, so the sender gets one message, not two.
- A loop run sends at most one summary per recipient.
- `left` is 1 or 0: send only the reply to the sender; keep the notices and add them to the next message to that recipient (next request or next loop summary).

## Requests (a WeChat message arrives)

Handle it now. Don't wait for the next loop round.

| Request | Examples | Do |
|---|---|---|
| Look up | `查 695-60488912`, `357行` | `readRows` `match: {"MAWB": ...}` (or `row: 357`). Reply row number + the 7 must-have values. |
| Count / list | `HZC 有几票`, `11/03 录了哪些`, `CNUSA 这周的` | `readRows` `lastN: 3000`, `columns: ["MAWB", "客人(client)", "Data", "PCs"]` (only what the question needs). Match the client by its sheet name (`客人(client)`; HZC = 厦门洪赞成, see columns.md). Reply the count and up to 20 MAWBs with row numbers (`另有 N 票未列出`). |
| Add | `加一行 784-86281904 CNUSA 141件 1520kg ORD 11/06 ETA` | `lookup` first. Missing or unclear must-have → ask. Else `appendRows`. |
| Change | `357行 件数 140`, `695-60488912 件数 140`, `695-60488912 ETA 11/06 08:20` | Find the row (`readRows` match MAWB). Then `updateCells` with `old` = the value just read. ETA / notes → `appendLine` on `Cargo notes`, e.g. `11/06 ETA 08:20`. |
| Delete | `删 358行`, `删重复的 695-60488912` | Read the row(s). One clear row → `deleteRows` `[{"row", "MAWB"}]`. Duplicates of one MAWB: all 7 must-have values equal → delete the higher row number; else ask which. |
| Restore | `恢复 12` | `S changes 12`. A delete → `appendRows` its `values` (only the 7 must-have fields; row number changes). An edit → `updateCells` back to `old` (Cargo notes: tell them to remove the line by hand). |
| Answer | `3 确认`, `3 不要`, `3 件数 141` | See Answers. |

Several requests in one message are fine; handle them in order and reply once.

After every write: `S log` (by = recipient name, source = `wechat`, action, row, MAWB, old → new, or the whole row for add/delete), then the notice.

A skipped API result (`skipped` with `current`) means the sheet changed since it was read: don't retry with the new value. Ask the sender: `第357行 件数现在是 142，不是 144。还要改成 140 吗？回复 "8 确认" 或 "8 不要"` (`S add` an `edit` item with the new `old`).

Reply / notice examples:
```
695-60488912 在第357行：10/01，厦门洪赞成，ORD，2798kg，144件，Cargo notes「10/07 ETA 16:30」
厦门洪赞成 共 23 票：第301行 695-60488912，第305行 ...（另有 3 票未列出）
已更新（不用回复）：第357行 695-60488912 件数 144→140（B 要求）
已更新（不用回复）：新加第412行 784-86281904（CNUSA，141件）；删除第358行 695-60488912（重复，内容和第357行一样）
```

## Questions from the loop (Send, end of a loop run)

Input from tlg-prealert: ❓ items (new MAWBs with an uncertain must-have value, uncertain edits or deletes found in the emails), changes the run already made, and ⚠️ notices.

1. `S add '<json list>'`: one item per question. `kind` = `row` / `edit` / `delete`; `content` = one line in the template below; `row` = the proposal (7 values / the updateCells updates / the deleteRows row); `fields` = the uncertain ones. The result says `new`, `updated` (a new follow-up changed it) or `unchanged`.
2. Send now: `new` and `updated` items, this run's `已更新` lines and the ⚠️ notices. Skip `unchanged`.
3. Reminders: `S due` (pending, last sent 24h+ ago, nothing new). One short line, not the full items.
4. Merge everything into one message per recipient, send it to every recipient, then `S sent <ids>` (`--reminder` for reminder-only ids).
5. Nothing to send → send nothing.

```
预报（11/04 10:30）
已更新（不用回复）：
- 第357行 695-60488912 件数 144→140（11/04「SHORT 4件」）
- 第402行 933-35199371 Cargo notes 加一行「11/05 ETA 08:20」
- 新加第412行 180-20716581（厦门洪赞成，88件）

待确认：
3. 784-86281904 CNUSA-环洋：件数？标题 141，更新主单 137。建议 137
7. 297-29870000 第380行：11/04 邮件说整票取消。要删这一行吗？

回复：编号 + 确认 / 不要 / 正确的值，如 "3 确认"、"7 不要"、"3 件数 141"
```

Reminder: `提醒：3、7 还在等确认，详见之前的消息。回复 "3 确认" 即可。`

An `updated` item is resent in full, marked `（有新跟进）`.

## Answers

1. Parse `<id(s)> 确认|不要|<field> <value>`. Several lines or ids are fine (`3 5 确认`).
   - 确认 → `S set <id> confirmed --by <name>`.
   - 不要 → `S set <id> rejected --by <name>`.
   - A value for one of the item's fields → `S set <id> corrected --by <name> --value '{"PCs": 141}'`.
   - Unknown id, an item already `done`/`rejected`, an unclear value → reply to that sender only, one line, change nothing: `没看懂，请回复：编号 + 确认 / 不要 / 正确的值，如 "3 确认"`, or `3 已由 A 处理`.
2. Execute confirmed and corrected items now (below).

## Execute

For each `confirmed` / `corrected` item:
- `row`: `lookup` the MAWB. Already in the tab → don't write; `done`. Else build the row from `row` with `value` applied; a must-have still missing → ask the one who replied, keep the status. `appendRows`.
- `edit`: `updateCells` with the item's updates (`value` applied). A skip with `current` → ask again as above.
- `delete`: `deleteRows` with the item's row and MAWB.
- `run` (mawb starts with `run:`): only 确认 / 不要. `run:backfill` → tlg-prealert One-shot on its `from`–`to` range (Loop mode, First run).

Then `S log` the change, `S set <id> done`, and send every recipient one batched line: `已处理：3 784-86281904 已录入第412行（件数 137，A 确认）` / `已处理：7 已删除第380行 297-29870000（B 确认）` / `已处理：5 不录入（B）`.

`rejected` items: send the `已处理` line, then `S set <id> done`.
