# API calls

Both APIs are Apps Script web apps deployed by air@. Call them only with `scripts/tlg_api.py`:

```bash
H=<this skill folder>/scripts/tlg_api.py
python3 $H sheet /tmp/tlg/sheet_key.json listTabs --read-only
python3 $H sheet /tmp/tlg/sheet_key.json lookup '{"tab": "2026. JUN 大贸 空运", "keys": ["695-60488912", "933-34752045"]}' --read-only
python3 $H attachments /tmp/tlg/attachments_key.json listAttachments '{"messageId": "19f4d1e8f0a3bd67"}'
```

`spreadsheet` can be left out: the Sheet API allows one spreadsheet.

## Sheet API

| Action | Params | Returns |
|---|---|---|
| listTabs | – | `tabs: [{name, rows, columns}]` |
| getHeaders | `tab` | `headers: [{column, name}]` |
| lookup | `tab`, `keys: [MAWB…]` (all MAWBs in one call) | `results: [{key, found: [{tab, row}]}]`; `found` empty = not in the tab. A wrong tab name comes back in `skippedTabs`, not as an error. |
| readRows | `tab`, `match: {"MAWB": "…"}`, `row: 357` or `lastN`; optional `columns: ["MAWB", …]` | `rows: [{row, values}]` |
| appendRows | `tab`, `rows: [{"<header>": value, …}]` | `results: [{key, addedRow} \| {key, skipped}]` |
| updateCells | `tab`, `updates: [{row, MAWB, column, old, value}` or `{row, MAWB, column, appendLine}]` | `results: [{row, column, updated, old, value} \| {row, column, skipped, current}]` |
| deleteRows | `tab`, `rows: [{row, MAWB}]` (exactly one) | `results: [{row, deleted, values} \| {row, skipped}]` |

- Columns are matched by header text (case and whitespace ignored). Use the exact header from `getHeaders`.
- Matching ignores spaces and dashes in MAWB.
- appendRows skips a MAWB already in the tab and stops (error) rather than overwrite a filled cell.
- updateCells: only `PCs`, `实重Weight (KG)`, `Cargo notes`, `Location`, `MAWB` (and other tabs' spellings). The row's MAWB must match and the cell must still hold `old` (`""` for an empty cell), else `skipped` with `current`. `Cargo notes` takes only `appendLine`. No empty values.
- deleteRows: one row, its MAWB must match. `values` = the deleted row, keep it (`S log`) so it can be restored.
- Write actions are refused with `--read-only`. deleteAttachments is always refused.

## Attachment API

| Action | Params | Returns |
|---|---|---|
| listAttachments | `messageId` | `subject, from, date, folder, attachments: [{name, mimeType, size}]` |
| saveAttachments | `messageId`, optional `names` | `folder: {name, id, url}`, `files: [{name, id, url, status}]` |

`messageId` is the Gmail message id from the Gmail connector (air@ mailbox). Files go to `email_attachments_for_claude/<subject without Fwd:/Re:>`. A file already there is not saved again.

## Errors

| Error | Meaning |
|---|---|
| `Bad key.` | Key file is stale. Re-download it. If still bad, air@ must re-run `setup`. |
| `Tab not found` | Call `listTabs` once and ask the user to pick. |
| `No header "X"` | Re-check `getHeaders`; use the tab's header text. |
| Network / egress error | Code execution network access must allow `script.google.com` and `script.googleusercontent.com`. Tell the user (Settings > Capabilities). |
| Not JSON | Wrong /exec link or deployment not "Anyone". Tell the user to contact the admin (air@). |
