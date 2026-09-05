# REVIVE — Setup Guide

Step-by-step guide to import and run the REVIVE Revenue Recovery Agent in your
own n8n instance.

---

## 1. Prerequisites

- An n8n instance (cloud or self-hosted) with the LangChain/AI nodes available.
- A Telegram bot (create one via [@BotFather](https://t.me/BotFather)).
- A Razorpay account with API keys (Dashboard → Settings → API Keys).
- A Google account with a spreadsheet for the audit log.
- A Slack workspace + app for human escalation.
- An Anthropic API key **or** n8n Gateway credits (the workflow ships pointed at
  Gateway credits using Claude Sonnet).

---

## 2. Import the workflows

These are n8n **SDK TypeScript** sources, not JSON exports. Import them using the
n8n workflow SDK / build tooling, or recreate the nodes from the source as
reference. The main file is `revive-recovery.workflow.ts`.

After import, the node IDs and credential references in the file are
**environment-specific** — you must re-point every credential and resource
selector to your own (see below).

---

## 3. Credentials to configure

| Node(s) | Credential type | What you need |
|---------|----------------|---------------|
| Telegram Trigger, Telegram Reply | Telegram API | Bot token from BotFather |
| Anthropic Chat Model | Anthropic API / Gateway credits | API key, or use Gateway credits |
| 6 Razorpay tools | HTTP Basic Auth | Razorpay `key_id` (user) + `key_secret` (password) |
| Audit Log, Audit Log (Stopped) | Google Sheets OAuth2 | Google account with access to the sheet |
| Escalate to Human | Slack OAuth2 | Slack app bot token |

### Razorpay tools
All six HTTP Request tools share one Basic Auth credential and hit base URL
`https://api.razorpay.com/v1`. Set the credential username to your `key_id` and
password to your `key_secret`.

Tools: `check_payment_failures`, `check_order_status`,
`check_subscription_status`, `check_invoice_status`, `check_mandate_status`,
`create_payment_link`.

### Google Sheets (audit log)
- Point `documentId` to your own spreadsheet.
- Point `sheetName` to your audit tab (the shipped file uses a tab named
  `audit_log`). Headers are auto-created on first write via
  `autoMapInputData`, so you can start with an empty tab.

### Slack escalation — IMPORTANT scope step
The Slack app's **bot token** must have the `chat:write` Bot Token Scope:
1. Go to <https://api.slack.com/apps> → your app.
2. **OAuth & Permissions** → **Scopes** → **Bot Token Scopes** → add `chat:write`.
3. Scroll up → **Reinstall to Workspace** (the scope does nothing until reinstall).
4. Set the escalation node's channel to your target channel.

---

## 4. How it runs

Telegram Trigger
→ REVIVE (AI Agent: Claude Sonnet + memory + 6 Razorpay tools + output parser)
→ Parse Agent Output (Code: normalize JSON, flatten audit fields, HTML-escape reply)
→ Stop-Contact Guard
├─ true → Audit Log (Stopped) [user opted out; log only]
└─ false → Not Stopped
├─ Telegram Reply [send Hinglish user_message]
├─ Audit Log [append flattened row]
└─ Escalation Guard
└─ true → Escalate to Human (Slack)


The agent always returns a single JSON object. `user_message` is sent to the
user; the remaining fields drive logging, routing, and stop/escalation decisions.

---

## 5. The 7 recovery workflows

| Workflow | Trigger | Bounded intervention |
|----------|---------|----------------------|
| PAYMENT_DEGRADATION | failure-rate spike on a route/method | route switch / alternate PSP / smart retry |
| CHECKOUT_DROPOFF | cart abandoned before payment | reminder + saved-cart link (max 2 nudges) |
| FAILED_SUBSCRIPTION | recurring charge failed | retry backoff (day 1/3/5) + update link |
| B2B_RECEIVABLES | overdue invoice | tiered chaser (reminder → firm → escalate) |
| MANDATE_RETRY | e-mandate/NACH/UPI Autopay failed | retry next valid cycle, max 3, then re-register |
| HINGLISH_VOICE_RECOVERY | live voice/chat session | conversational resolution + live link/retry |
| PROMISE_TO_PAY | committed future payment date | log date, schedule follow-up |

Hard stopping rules, compliant escalation triggers, and a mandatory audit trail
are enforced by the agent's system prompt.

---

## 6. Testing

1. Configure all credentials and activate the workflow.
2. Message your Telegram bot with a scenario, e.g.
   `Mera subscription charge fail ho gaya, sub_ABC123` (FAILED_SUBSCRIPTION) or
   `Bhai mera UPI payment fail ho raha hai, order_9xz` (CHECKOUT_DROPOFF).
3. Expect: a Hinglish reply in Telegram, a new row in the audit sheet, and — if
   the case escalates — a Slack post in your channel.

---

## 7. Known non-fatal note

The Razorpay HTTP Request tools may log
`The node "@n8n/n8n-nodes-langchain.toolHttpRequest" has a "supplyData" method
but no "execute" method.` This is an n8n framework wrapper notice, not an auth
failure — the agent handles it gracefully and never fabricates data. If your
Razorpay keys are valid the tool calls still return live data.
cleanup-read-audit.workflow.ts
import {
  workflow,
  node,
  trigger,
  newCredential,
} from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Start' },
});

const deleteTestRow = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Delete Test Row',
    parameters: {
      resource: 'sheet',
      operation: 'delete',
      documentId: { __rl: true, mode: 'list', value: '15GQ9lqhThV_K_me86N0lYefDhETL-a2cn_XJVtktuIk', cachedResultName: 'razorpay' },
      sheetName: { __rl: true, mode: 'list', value: '243634607', cachedResultName: 'audit_log' },
      toDelete: 'rows',
      startIndex: 8,
      numberToDelete: 1,
    },
    credentials: {
      googleSheetsOAuth2Api: newCredential('Google Sheets account', 'MhXToMVb1X0s07z9'),
    },
  },
});

export default workflow('cleanup-read-audit', 'Cleanup — Delete Test Row')
  .add(manual)
  .to(deleteTestRow);
