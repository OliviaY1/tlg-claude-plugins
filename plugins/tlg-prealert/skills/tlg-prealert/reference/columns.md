# Building a row

Write exactly these 7 fields, all required. If one is missing or uncertain, ask the user before writing the row (see SKILL.md step 5). `Cargo notes` always has the ETA. Never write any other column; people fill the rest.

| Field | Header in 2026 air tabs | Other tabs' header | Value |
|---|---|---|---|
| date | `Data` | `Date`, blank header in A/B | Received date of the **first** email for this MAWB, `MM/DD`, in `timezone` |
| MAWB | `MAWB` | | `123-12345678` |
| client | `客人(client)` | `Client`, `客户` | The forwarding agent who sent the pre-alert, not the AWB shipper. Sources: 预报 `客户` column, agent code in subject, signature company. e.g. HZC → 厦门洪赞成, CN-USA Express → CNUSA |
| location | `Location` | | Destination airport (end of route), e.g. `ORD` |
| weight | `实重Weight (KG)` | `Weight (KG)` | Gross weight. 预报 `总重量` > MAWB pdf gross weight > packing list G.W. Never net weight. |
| notes | `Cargo notes` | | `MM/DD ETA` (预报 `预计到达`, else email body), plus short special handling from the email, e.g. `1箱（8件）需要拆箱贴标后交运` |
| pieces | `PCs` | `Total Box Qty` | Total pieces. Subject `144PCS`, 预报 `总件数`, AWB |

Source priority: newest follow-up > `普货空运预报.xlsx` > MAWB/HAWB pdf > invoice / packing list > subject and body.

When sources disagree on one of these fields, ask the user (❓). Never skip the shipment because of it.

## Report only, never written

If the emails or files show these values, list them in the report (`其他信息（未填写）`) so a person can fill them in:

| Header | Value |
|---|---|
| `计费重 chargeable weight (KG)` | MAWB/HAWB pdf chargeable weight |
| `last mile 尾程运输 方式` (other tabs: `尾程运输 方式`, `渠道 Last Mile Info`) | 预报 `尾程运输方式` as written (e.g. `UPS144`), else from the body ("144件为UPS" → `UPS144`) |

Example (RALERT-695-60488912-HZC-144PCS-XMN-TPE-ORD-2026.7.7):
- Written: `Data 07/08 · MAWB 695-60488912 · 客人(client) 厦门洪赞成 · Location ORD · 实重 2798 · Cargo notes 07/08 ETA · PCs 144`
- Report only: `计费重 2798 · last mile UPS144`
