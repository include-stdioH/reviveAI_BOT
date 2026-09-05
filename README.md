# reviveAI_BOT
# REVIVE — Razorpay Revenue Recovery AI Agent

Hinglish conversational revenue-recovery agent built on n8n. One unified workflow
covers seven recovery motions and always returns a single structured JSON object
per turn (rendered back to the user via Telegram, logged to Google Sheets, and
routed to Slack for human escalation).

## Workflows

| File | n8n Workflow | Purpose |
|------|--------------|---------|
| `revive-recovery.workflow.ts` | REVIVE — Revenue Recovery Agent (`9zh8aMQH2mIdfb7z`) | Main agent: Telegram trigger → AI Agent (Claude Sonnet) → parse → guards → Telegram reply + audit log + Slack escalation |
| `cleanup-read-audit.workflow.ts` | Cleanup — Delete Test Row (`LM39HTLh0RKk4eBy`) | One-off maintenance helper for the `audit_log` sheet |

## The 7 recovery workflows

PAYMENT_DEGRADATION · CHECKOUT_DROPOFF · FAILED_SUBSCRIPTION · B2B_RECEIVABLES ·
MANDATE_RETRY · HINGLISH_VOICE_RECOVERY · PROMISE_TO_PAY

## Architecture

- **Trigger:** Telegram Trigger (per-user session memory keyed on chat id)
- **Brain:** AI Agent node (REVIVE) — Claude Sonnet via n8n Gateway credits,
  buffer-window memory, Structured Output Parser enforcing the response schema
- **Tools (Razorpay REST, HTTP Request Tool, shared Basic Auth):**
  `check_payment_failures`, `check_order_status`, `check_subscription_status`,
  `check_invoice_status`, `check_mandate_status`, `create_payment_link`
- **Parse Agent Output** (Code node): normalizes the JSON, flattens audit fields
  to top-level columns, HTML-escapes the user message for safe Telegram delivery
- **Guards:** Stop-Contact Guard (halts on opt-out) → Not Stopped fan-out to
  Telegram Reply + Audit Log + Escalation Guard → Slack post on escalation

## Credentials required

- Telegram Bot API
- Anthropic (or n8n Gateway credits)
- Razorpay REST API — HTTP Basic Auth (key_id / key_secret), base `https://api.razorpay.com/v1`
- Google Sheets OAuth2 (audit log spreadsheet)
- Slack OAuth2 — Bot Token Scope `chat:write` required (reinstall app after adding)

## Notes

- The Razorpay tools log a non-fatal n8n framework notice
  (`supplyData method but no execute method`) on the HTTP Request Tool wrapper;
  the agent handles it gracefully and never fabricates data.
- Files are n8n SDK TypeScript sources. IDs/credential references are
  environment-specific; re-point them when importing into another instance.
