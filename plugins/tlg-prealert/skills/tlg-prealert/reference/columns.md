# Building a row

Write only these fields. Must (✓) fields are required: if one is missing or uncertain, ask the user before writing the row (see SKILL.md step 5). `Cargo notes` always has the ETA. Everything else (released?, warehouse check, PMC, Status, Pallets, ISC, 关税, 清关费, costs, 账单, column A status) is filled later by people.

| Field | Must | Header in 2026 air tabs | Other tabs' header | Value |
|---|---|---|---|---|
| date | ✓ | `Data` | `Date`, blank header in A/B | Received date of the **first** email for this MAWB, `MM/DD`, in `timezone` |
| MAWB | ✓ | `MAWB` | | `123-12345678` |
| client | ✓ | `客人(client)` | `Client`, `客户` | The forwarding agent who sent the pre-alert, not the AWB shipper. Sources: 预报 `客户` column, agent code in subject, signature company. e.g. HZC → 厦门洪赞成, CN-USA Express → CNUSA |
| location | ✓ | `Location` | | Destination airport (end of route), e.g. `ORD` |
| weight | ✓ | `实重Weight (KG)` | `Weight (KG)` | Gross weight. 预报 `总重量` > MAWB pdf gross weight > packing list G.W. Never net weight. |
| chargeable | | `计费重 chargeable weight (KG)` | | MAWB/HAWB pdf chargeable weight. Empty if no AWB. |
| notes | ✓ | `Cargo notes` | | `MM/DD ETA` (预报 `预计到达`, else email body), plus short special handling from the email, e.g. `1箱（8件）需要拆箱贴标后交运` |
| pieces | ✓ | `PCs` | `Total Box Qty` | Total pieces. Subject `144PCS`, 预报 `总件数`, AWB |
| last mile | | `last mile 尾程运输 方式` | `尾程运输 方式`, `渠道 Last Mile Info` | 预报 `尾程运输方式` as written (e.g. `UPS144`). Else from body ("144件为UPS" → `UPS144`). Else empty. |

Source priority: newest follow-up > `普货空运预报.xlsx` > MAWB/HAWB pdf > invoice / packing list > subject and body.

When sources disagree on a must field, ask the user (❓). On an optional field, leave it empty and say so in the report.

Example (RALERT-695-60488912-HZC-144PCS-XMN-TPE-ORD-2026.7.7):
`Data 07/08 · MAWB 695-60488912 · 客人(client) 厦门洪赞成 · Location ORD · 实重 2798 · 计费重 2798 · Cargo notes 07/08 ETA · PCs 144 · last mile UPS144`
