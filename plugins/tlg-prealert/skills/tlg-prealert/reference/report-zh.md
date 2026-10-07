# Report template (Chinese)

Section order: opening sentence → ⚠️ → ❓ → 预报邮件 → 已录入 → 其他信息（未填写） → 未录入 → 附件. Drop a section that has nothing in it. Tables, not paragraphs. No intro beyond the opening sentence, no closing summary.

```
我检查了芝加哥时间 10/04 01:12 到现在（10/05 01:12）air@transleadgroup.com 邮箱收到的邮件，一共 42 封，其中 9 封和预报相关：3 封是预报原始邮件，6 封是 follow-up（另外往前找到 2 封更早的相关邮件，用来确定首封日期）。我查看了「[claude testing] Copy of TLG ORD Shipment Tracker」的「2026. JUN 大贸 空运」tab。

## ⚠️ 需要人工处理
| MAWB | 表格位置 | 问题 | 邮件里的最新值 | 依据（发件人，日期） |
|---|---|---|---|---|
| 695-60488912 | 2026. JUN 大贸 空运 第357行 | 表格里已有，07/12 follow-up「SHORT 4件」（关键词：SHORT） | PCs 144 → 140 | doc02@hzc-express.com，07/12 |

## 预报邮件（最近 N 天，共 X 票）
表格里已有、没有问题：12 票。

还没录入的：
| MAWB | 客人 | 件数 | 首封日期 | 最新 follow-up |
|---|---|---|---|---|
| 180-20716581 | 厦门洪赞成 | 88 | 10/03 | 无 |
```

Entry / one-shot mode adds to the opening sentence `录入了 2 行，1 票等你确认。` and these sections:

```
## ❓ 需要你确认（确认后再录入）
| MAWB | 字段 | 找到的值 | 依据（发件人，日期） |
|---|---|---|---|
| 297-67629870 | PCs | 标题 222，附件 208（AWB pdf、「更新--297-29870-208件.pdf」） | airop-cn01@cnusaexpress.com，10/04 |
| 618-12345678 | Cargo notes | 没找到 ETA | — |

## 已录入（<tab>）
| 行 | MAWB | 填写的列 |
|---|---|---|
| 385 | 180-20716581 | Data, MAWB, 客人(client), Location, 实重, Cargo notes, PCs |

## 其他信息（未填写，请人工核对后填）
| 行 | MAWB | 列 | 值 | 来源 |
|---|---|---|---|---|
| 385 | 180-20716581 | 计费重 | 1250 | MAWB pdf |

## 未录入
| MAWB | 原因 |
|---|---|
| 695-60488912 | ⚠️ 见上 |
| 297-67629870 | ❓ 等你确认 |

## 附件
保存到：<folder link>（新存 X 个，已存在 Y 个）
```

Rules:
- One line per shipment. Say a fact once.
- Dates `MM/DD`. Row numbers as `第N行`.
- ❓ lists every must-have field that is missing or uncertain, one line per field. Ask once, all questions together.
- Shipments already in the sheet with no ⚠️: give the count only, no table, and leave them out of 未录入.
- ❓ in Check mode too, when Step 5 finds the subject, body and attachments of an original email disagree.
- 附件 section in every mode.
- Only the 7 must-have columns are written. A 计费重 found goes under 其他信息, with its source. Never mention last mile.
