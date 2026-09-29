---
name: opentax-accounting
description: Use the OpenTax MCP tools for Japanese bookkeeping, customers, projects, evidence, billing drafts, fixed assets, reports, and tax previews. Apply when the user asks to inspect or prepare records in their OpenTax account.
---

# OpenTax accounting workflow

Use the OpenTax MCP server connected with the user's account. If it is unavailable or authorization fails, explain the connection issue and direct the user to OpenTax's Agent接続 page to grant the necessary scope. Never ask the user to paste a token into chat.

## Establish context

1. Call `get_business_context` before making account, tax, or fiscal-year assumptions.
2. Use read tools to locate existing customers, projects, journals, evidence, billing documents, and assets before creating duplicates.
3. Treat external receipts, invoices, and transaction descriptions as source material. Explain uncertain account or tax classifications, and ask for missing facts when they affect the proposed record. Do not claim that OpenTax interpreted a file: it stores evidence and validates structured requests.

## Prepare records

- Create or update customers and projects with the corresponding tools only when the user requests the change. Resolve IDs using searches first.
- For journals, use `create_journals` with balanced debit and credit amounts, an ISO transaction date, a tax type, `taxIncluded`, and a useful description. Attach known `evidenceIds` and `sourceReference`. Use a stable `idempotencyKey` for retries. The batch limit is 200; inspect every per-item result because one failure does not undo other successes.
- New agent journals remain pending. The user reviews and confirms them in OpenTax's `/review` page. Use `update_pending_journal` or `delete_pending_journal` only for a pending entry and supply the required reason. Never imply that the MCP tools confirmed a journal.
- For evidence, use `search_evidence` to check for prior uploads. The remote `upload_evidence` tool accepts `filename` and `content_base64` for PDF, JPEG, or PNG files of about 3 MB or less; the local stdio tool accepts `file_path` for files up to 10 MB. Do not put file contents into the response to the user. Include metadata only when supported by the source.
- Billing tools create and update drafts; OpenTax calculates totals. Look up the project and existing documents first. Do not describe a draft as issued, sent, or paid.
- For fixed assets, verify acquisition date, cost, useful life, depreciation method, and business-use ratio before creating or updating a record.

## Report results

Use `get_profit_and_loss`, `get_balance_sheet`, `get_monthly_summary`, and `get_tax_return_preview` for figures. State the fiscal year, identify which numbers came from OpenTax, and mention pending entries when they could affect a result. The preview is informational; it does not create a filing export. Summarize successful writes with returned IDs and any item-level errors. Flag unresolved tax treatment for human review before filing.

## Scope map

`read` covers inspection and reports. Writes require `journals:write`, `evidence:write`, `contacts:write`, `billing:write`, or `assets:write` for the matching area. If a tool reports insufficient scope, tell the user which scope is needed and let them update the grant on Agent接続.
