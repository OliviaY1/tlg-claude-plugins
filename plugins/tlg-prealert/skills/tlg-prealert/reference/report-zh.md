# Report template (Chinese)

Use these sections in this order. Drop a section that has nothing in it. Tables, not paragraphs. No intro, no closing summary.

```
## ⚠️ 需要人工处理
| MAWB | 表格位置 | 问题 | 邮件里的最新值 | 依据（发件人，日期） |
|---|---|---|---|---|
| 695-60488912 | 2026. JUN 大贸 空运 第357行 | 7/12 follow-up 改了件数 | PCs 144 → 140 | doc02@hzc-express.com，07/12 |

## 预报邮件（最近 N 天，共 X 票）
| MAWB | 客人 | 件数 | 首封日期 | 最新 follow-up | 表格里 |
|---|---|---|---|---|---|
| 933-34752045 | CNUSA | 159 | 07/07 | 07/10 报关行回复 | 第345行 |
| 180-20716581 | 厦门洪赞成 | 88 | 10/03 | 无 | 没有 |
```

Entry / one-shot mode adds:

```
## 已录入（<tab>）
| 行 | MAWB | 填写的列 |
|---|---|---|
| 385 | 180-20716581 | Data, MAWB, 客人(client), Location, 实重, PCs, Cargo notes, last mile |

## 未录入
| MAWB | 原因 |
|---|---|
| 933-34752045 | 表格里已有（第345行） |
| 695-60488912 | ⚠️ 见上 |

## 附件
保存到：<folder link>（新存 X 个，已存在 Y 个）
```

Rules:
- One line per shipment. Say a fact once.
- Dates `MM/DD`. Row numbers as `第N行`.
- Empty cell in the row = value not found; list missing fields under 未录入 only if the row was not written.
