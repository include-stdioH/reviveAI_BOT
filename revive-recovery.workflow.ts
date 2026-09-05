import {
  workflow,
  node,
  trigger,
  placeholder,
  newCredential,
  ifElse,
  tool,
  languageModel,
  memory,
  outputParser,
  expr,
  nodeJson,
} from '@n8n/workflow-sdk';

// ============================================================
// TRIGGER
// ============================================================
const telegramTrigger = trigger({
  type: 'n8n-nodes-base.telegramTrigger',
  version: 1.5,
  config: {
    name: 'Telegram Trigger',
    parameters: {
      updates: ['message'],
    },
    credentials: {
      telegramApi: newCredential('Telegram account', 'cwpkALHMvccWpGeb'),
    },
  },
});

// ============================================================
// AGENT SUB-NODES
// ============================================================
const anthropicModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.6,
  config: {
    name: 'Anthropic Chat Model',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'claude-sonnet-5', cachedResultName: 'Claude Sonnet 5' },
      options: { promptCaching: '1h' },
    },
    credentials: {
      anthropicApi: newCredential('Gateway credits', '__AI_GATEWAY_MANAGED__'),
    },
  },
});

const reviveMemory = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  version: 1.4,
  config: {
    name: 'Session Memory',
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: nodeJson(telegramTrigger, 'message.chat.id'),
      contextWindowLength: 20,
    },
  },
});

// Structured Output Parser — validates the agent's JSON output shape
const reviveOutputParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'REVIVE Output Parser',
    parameters: {
      schemaType: 'manual',
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          workflow: { type: 'string' },
          root_cause: { type: ['string', 'null'] },
          intervention: { type: 'string' },
          retry_count: { type: 'number' },
          stop_contact: { type: 'boolean' },
          requires_human_escalation: { type: 'boolean' },
          escalation_reason: { type: ['string', 'null'] },
          amount_at_risk: { type: 'number' },
          amount_recovered: { type: 'number' },
          recovery_status: { type: 'string' },
          promise_to_pay_date: { type: ['string', 'null'] },
          audit_log: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              event_id: { type: 'string' },
              user_id: { type: 'string' },
              action_taken: { type: 'string' },
              reason: { type: 'string' },
              next_step: { type: 'string' },
            },
            required: ['timestamp', 'event_id', 'user_id', 'action_taken', 'reason', 'next_step'],
          },
          user_message: { type: 'string' },
        },
        required: [
          'workflow',
          'intervention',
          'retry_count',
          'stop_contact',
          'requires_human_escalation',
          'amount_at_risk',
          'amount_recovered',
          'recovery_status',
          'audit_log',
          'user_message',
        ],
      }),
    },
  },
});

// ============================================================
// RAZORPAY HTTP TOOLS (Basic Auth: key_id / key_secret)
// ============================================================
const toolPaymentFailures = tool({
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  version: 1.1,
  config: {
    name: 'check_payment_failures',
    parameters: {
      toolDescription:
        'Use this to fetch failed payment details including error_code, error_description, and error_source, to diagnose root cause of a payment failure or degradation trend.',
      method: 'GET',
      url: 'https://api.razorpay.com/v1/{path}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      optimizeResponse: true,
      responseType: 'json',
      placeholderDefinitions: {
        values: [
          {
            name: 'path',
            description:
              "Payments API path with query. For a failure/degradation trend use 'payments?status=failed&from=<unix_from>&to=<unix_to>'. For a specific payment use 'payments/<payment_id>'.",
            type: 'string',
          },
        ],
      },
    },
    credentials: { httpBasicAuth: newCredential('Razorpay API') },
  },
});

const toolOrderStatus = tool({
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  version: 1.1,
  config: {
    name: 'check_order_status',
    parameters: {
      toolDescription:
        'Use this to check if an order was paid, attempted, or abandoned, to decide whether checkout drop-off recovery is still needed or already resolved.',
      method: 'GET',
      url: 'https://api.razorpay.com/v1/orders/{order_path}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      optimizeResponse: true,
      responseType: 'json',
      placeholderDefinitions: {
        values: [
          {
            name: 'order_path',
            description:
              "For order details use '<order_id>'. For the order's payments use '<order_id>/payments'.",
            type: 'string',
          },
        ],
      },
    },
    credentials: { httpBasicAuth: newCredential('Razorpay API') },
  },
});

const toolSubscriptionStatus = tool({
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  version: 1.1,
  config: {
    name: 'check_subscription_status',
    parameters: {
      toolDescription:
        'Use this to check subscription status (active, halted, pending), and its invoice/charge history, to decide on retry timing for a failed subscription charge.',
      method: 'GET',
      url: 'https://api.razorpay.com/v1/subscriptions/{subscription_path}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      optimizeResponse: true,
      responseType: 'json',
      placeholderDefinitions: {
        values: [
          {
            name: 'subscription_path',
            description:
              "For subscription details use '<subscription_id>'. For its invoices use '<subscription_id>/invoices'.",
            type: 'string',
          },
        ],
      },
    },
    credentials: { httpBasicAuth: newCredential('Razorpay API') },
  },
});

const toolInvoiceStatus = tool({
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  version: 1.1,
  config: {
    name: 'check_invoice_status',
    parameters: {
      toolDescription:
        "Use this to check a B2B invoice's payment status, due date, and amount due, to decide chaser tier (reminder, firm notice, escalation) for overdue receivables.",
      method: 'GET',
      url: 'https://api.razorpay.com/v1/{invoice_path}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      optimizeResponse: true,
      responseType: 'json',
      placeholderDefinitions: {
        values: [
          {
            name: 'invoice_path',
            description:
              "For a single invoice use 'invoices/<invoice_id>'. To list issued/overdue invoices use 'invoices?status=issued'.",
            type: 'string',
          },
        ],
      },
    },
    credentials: { httpBasicAuth: newCredential('Razorpay API') },
  },
});

const toolMandateStatus = tool({
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  version: 1.1,
  config: {
    name: 'check_mandate_status',
    parameters: {
      toolDescription:
        'Use this to check e-mandate/token status (confirmed, rejected, expired) and recurring charge history, to decide whether to retry on next cycle or ask for mandate re-registration.',
      method: 'GET',
      url: 'https://api.razorpay.com/v1/{mandate_path}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      optimizeResponse: true,
      responseType: 'json',
      placeholderDefinitions: {
        values: [
          {
            name: 'mandate_path',
            description:
              "For customer e-mandate/token status use 'customers/<customer_id>/tokens'. For a mandate-linked recurring charge use 'payments/<payment_id>'.",
            type: 'string',
          },
        ],
      },
    },
    credentials: { httpBasicAuth: newCredential('Razorpay API') },
  },
});

const toolCreatePaymentLink = tool({
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  version: 1.1,
  config: {
    name: 'create_payment_link',
    parameters: {
      toolDescription:
        'Use this to generate a fresh payment link to send to the customer when a bounded retry or manual payment collection is the chosen recovery action. Never call this if stop_contact is true for the user.',
      method: 'POST',
      url: 'https://api.razorpay.com/v1/payment_links',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        '{\n  "amount": {amount},\n  "currency": "{currency}",\n  "description": "{description}",\n  "reference_id": "{reference_id}",\n  "customer": { "contact": "{contact}", "email": "{email}" },\n  "notify": { "sms": true, "email": true },\n  "reminder_enable": true\n}',
      optimizeResponse: true,
      responseType: 'json',
      placeholderDefinitions: {
        values: [
          { name: 'amount', description: 'Amount in the smallest currency sub-unit (e.g. paise for INR).', type: 'number' },
          { name: 'currency', description: "Three-letter currency code, e.g. 'INR'.", type: 'string' },
          { name: 'description', description: 'Short description shown to the customer on the payment link.', type: 'string' },
          {
            name: 'reference_id',
            description: 'Reference linking back to the original failed payment / subscription / invoice.',
            type: 'string',
          },
          { name: 'contact', description: "Customer phone number in E.164 format, e.g. '+919000090000'.", type: 'string' },
          { name: 'email', description: 'Customer email address.', type: 'string' },
        ],
      },
    },
    credentials: { httpBasicAuth: newCredential('Razorpay API') },
  },
});

// ============================================================
// AI AGENT — REVIVE
// ============================================================
const reviveSystemMessage = `You are REVIVE, Razorpay's Revenue Recovery AI Agent. You run ONE unified workflow that covers seven recovery motions. You are not a chatbot that just diagnoses — you must always move toward a bounded action, log it, and report money recovered.

You speak to users in HINGLISH (Roman-script Hindi-English mix), warm but professional, like a helpful Razorpay ops teammate. Opening line for any new session:
"Namaste! Main REVIVE hoon, aapka Revenue Recovery AI Agent. Bataiye, kaunsa issue dekhna hai — payment failure, checkout drop-off, subscription, ya receivables?"

You ALWAYS return a single JSON object (schema below). No prose outside JSON. n8n will render the "user_message" field as the Telegram reply and use the other fields for logging, routing, and stopping decisions.

============================================================
STEP 1 — CLASSIFY THE EVENT (which of the 7 workflows applies)
============================================================
Read the incoming event/payload and classify into exactly one primary workflow (a secondary can apply if related):

1. PAYMENT_DEGRADATION      — failure-rate spike on a payment method/route
2. CHECKOUT_DROPOFF         — cart/checkout abandoned before payment
3. FAILED_SUBSCRIPTION      — recurring/subscription charge failed
4. B2B_RECEIVABLES          — overdue B2B invoice/receivable
5. MANDATE_RETRY            — e-mandate/NACH/UPI Autopay mandate failed
6. HINGLISH_VOICE_RECOVERY  — user is on a live/simulated voice/chat session requiring conversational recovery
7. PROMISE_TO_PAY           — user has committed to a future payment date and needs tracking/follow-up

============================================================
STEP 2 — ROOT CAUSE (for PAYMENT_DEGRADATION / MANDATE_RETRY / FAILED_SUBSCRIPTION)
============================================================
Diagnose using only evidence in the payload. Common root causes to check for:
- Issuer/bank decline codes (insufficient funds, risk block, expired card)
- Gateway/route degradation (specific PSP or bank acquiring issue)
- Mandate/NACH registration failure vs. execution-day failure
- Card expiry / token deactivation (e-mandate/tokenisation lapse)
- Customer-side: balance, limit, 3DS/OTP failure, app/network issue
Never guess a root cause not supported by the data — say "insufficient data, recommend manual review" instead of fabricating.

============================================================
STEP 3 — SELECT INTERVENTION (bounded action, matched to workflow)
============================================================
PAYMENT_DEGRADATION  → route switch / retry via alternate PSP / smart retry timing
CHECKOUT_DROPOFF     → reminder message + saved-cart payment link (max 2 nudges)
FAILED_SUBSCRIPTION  → retry with backoff (day 1/3/5) + payment method update link
B2B_RECEIVABLES      → tiered chaser (reminder → firm notice → escalation)
MANDATE_RETRY        → re-attempt on next valid cycle date, max 3 retries, then re-registration ask
HINGLISH_VOICE_RECOVERY → conversational resolution in current session, offer link/retry live
PROMISE_TO_PAY       → log commitment date, schedule follow-up, no further action till date lapses

============================================================
STEP 4 — STOPPING RULES (hard limits — never exceed)
============================================================
- Max 3 automated retries per payment/mandate failure, spaced per gateway cooldown (never retry within 4 hours of prior attempt).
- Max 2 nudges for checkout drop-off within 48 hours; then stop.
- Max 3 chaser touches for B2B receivables within a 30-day cycle before mandatory human escalation.
- If customer explicitly declines / opts out / says "stop" or "don't contact" → immediately set stop_contact = true and end all automation for that user/invoice.
- If a Promise-to-Pay date has lapsed by >3 days with no payment → escalate to human collections, do not keep auto-nudging.
- Never attempt more than what regulation allows for the payment instrument (e.g., NACH/e-mandate retry limits per NPCI rules).

============================================================
STEP 5 — COMPLIANT ESCALATION
============================================================
Escalate to a human agent (set requires_human_escalation = true) when:
- Stopping rule limit reached
- Amount at risk > configurable threshold (flag amount, let ops set cutoff)
- Customer disputes the charge or requests legal/regulatory contact
- Repeated failure suggests fraud or compliance risk (e.g. mismatched KYC, disputed mandate)
- Vulnerable-customer signals (financial distress mentioned) — de-escalate tone, do not pressure, hand to human support with a flag, not a chaser.
Never use threatening, coercive, or misleading language. All B2B chaser language must stay factual (amount, due date, invoice ref) — no legal threats without human sign-off.

============================================================
STEP 6 — MONEY RECOVERED TRACKING
============================================================
For every event processed, output:
- amount_at_risk (original amount flagged)
- amount_recovered (0 if not yet resolved; full/partial if payment succeeded as a direct/attributable result of this action)
- recovery_status: "recovered" | "partial" | "pending" | "failed" | "escalated" | "stopped"
This lets n8n aggregate a BATCH SUMMARY (sum amount_recovered vs amount_at_risk across all events in a run) for reporting.

============================================================
STEP 7 — AUDIT TRAIL
============================================================
Every response must include a complete audit_log entry — this is non-negotiable, even for "no action taken" cases. It must be sufficient to reconstruct: what happened, why, what was decided, and what's next.

============================================================
OUTPUT SCHEMA — return ONLY this JSON, nothing else
============================================================
{
  "workflow": "PAYMENT_DEGRADATION | CHECKOUT_DROPOFF | FAILED_SUBSCRIPTION | B2B_RECEIVABLES | MANDATE_RETRY | HINGLISH_VOICE_RECOVERY | PROMISE_TO_PAY",
  "root_cause": "string or null",
  "intervention": "string — exact bounded action taken",
  "retry_count": 0,
  "stop_contact": false,
  "requires_human_escalation": false,
  "escalation_reason": "string or null",
  "amount_at_risk": 0,
  "amount_recovered": 0,
  "recovery_status": "recovered | partial | pending | failed | escalated | stopped",
  "promise_to_pay_date": "YYYY-MM-DD or null",
  "audit_log": {
    "timestamp": "ISO8601",
    "event_id": "string",
    "user_id": "string",
    "action_taken": "string",
    "reason": "string",
    "next_step": "string"
  },
  "user_message": "Hinglish reply to send back via Telegram"
}`;

const reviveAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'REVIVE',
    parameters: {
      promptType: 'define',
      text: expr('{{ $json.message.text }}'),
      hasOutputParser: true,
      options: {
        systemMessage: reviveSystemMessage,
      },
    },
    subnodes: {
      model: anthropicModel,
      memory: reviveMemory,
      outputParser: reviveOutputParser,
      tools: [
        toolPaymentFailures,
        toolOrderStatus,
        toolSubscriptionStatus,
        toolInvoiceStatus,
        toolMandateStatus,
        toolCreatePaymentLink,
      ],
    },
  },
});

// ============================================================
// PARSE AGENT OUTPUT (Code node w/ fallback)
// ============================================================
const parseAgentOutput = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Agent Output',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `// Safely obtain the REVIVE JSON object, whether it arrives as a parsed
// object (Structured Output Parser) or still as a raw string.
let raw = $json.output !== undefined ? $json.output : $json;
let parsed;
try {
  if (typeof raw === 'string') {
    parsed = JSON.parse(raw);
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  } else {
    throw new Error('No parseable agent output');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.user_message === undefined) {
    throw new Error('Parsed output missing required fields');
  }
} catch (err) {
  parsed = {
    workflow: 'HINGLISH_VOICE_RECOVERY',
    root_cause: 'insufficient data, recommend manual review',
    intervention: 'none — output parse failure',
    retry_count: 0,
    stop_contact: false,
    requires_human_escalation: false,
    escalation_reason: null,
    amount_at_risk: 0,
    amount_recovered: 0,
    recovery_status: 'failed',
    promise_to_pay_date: null,
    audit_log: {
      timestamp: new Date().toISOString(),
      event_id: 'parse_error',
      user_id: 'unknown',
      action_taken: 'none',
      reason: 'Failed to parse agent output: ' + (err && err.message ? err.message : 'unknown'),
      next_step: 'retry / manual review',
    },
    user_message: 'Maaf kijiye, kuch technical issue aaya. Dobara try karein.',
  };
}

// Normalise required fields so downstream nodes never crash.
if (parsed.stop_contact === undefined) parsed.stop_contact = false;
if (parsed.requires_human_escalation === undefined) parsed.requires_human_escalation = false;
if (parsed.recovery_status === undefined) parsed.recovery_status = 'pending';
if (!parsed.audit_log || typeof parsed.audit_log !== 'object') {
  parsed.audit_log = {
    timestamp: new Date().toISOString(),
    event_id: 'unknown',
    user_id: 'unknown',
    action_taken: parsed.intervention || 'none',
    reason: 'audit_log missing from agent output',
    next_step: 'manual review',
  };
}
// Escape HTML-significant chars so Telegram HTML parse_mode never rejects the
// reply, regardless of what the model produced (e.g. <, >, & in the message).
const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Emit a FLAT row: every audit column at top level so the Google Sheets node can
// auto-map and create any missing headers. Downstream nodes (Telegram, Slack,
// guards) read these same top-level fields.
const al = parsed.audit_log || {};
const row = {
  timestamp: al.timestamp || new Date().toISOString(),
  event_id: al.event_id || 'unknown',
  user_id: al.user_id || 'unknown',
  workflow: parsed.workflow || '',
  root_cause: parsed.root_cause == null ? '' : parsed.root_cause,
  intervention: parsed.intervention || '',
  retry_count: parsed.retry_count == null ? 0 : parsed.retry_count,
  stop_contact: parsed.stop_contact === true,
  requires_human_escalation: parsed.requires_human_escalation === true,
  escalation_reason: parsed.escalation_reason == null ? '' : parsed.escalation_reason,
  amount_at_risk: parsed.amount_at_risk == null ? 0 : parsed.amount_at_risk,
  amount_recovered: parsed.amount_recovered == null ? 0 : parsed.amount_recovered,
  recovery_status: parsed.recovery_status || 'pending',
  promise_to_pay_date: parsed.promise_to_pay_date == null ? '' : parsed.promise_to_pay_date,
  action_taken: al.action_taken || '',
  reason: al.reason || '',
  next_step: al.next_step || '',
  user_message: parsed.user_message || '',
  telegram_message: esc(parsed.user_message),
};

return { json: row };`,
    },
  },
});

// Passthrough so the not-stopped branch can fan out cleanly
const notStopped = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Not Stopped' },
});

// ============================================================
// STOP-CONTACT GUARD (IF stop_contact === true)
// ============================================================
const stopContactGuard = ifElse({
  version: 2.3,
  config: {
    name: 'Stop-Contact Guard',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: 'stop-contact',
            leftValue: expr('{{ $json.stop_contact }}'),
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
      },
    },
  },
});

// ============================================================
// ESCALATION GUARD (IF requires_human_escalation === true)
// ============================================================
const escalationGuard = ifElse({
  version: 2.3,
  config: {
    name: 'Escalation Guard',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: 'needs-escalation',
            leftValue: expr('{{ $json.requires_human_escalation }}'),
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
      },
    },
  },
});

// ============================================================
// DELIVERY & AUDIT NODES
// ============================================================
const telegramReply = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram Reply',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $(\'Telegram Trigger\').item.json.message.chat.id }}'),
      text: expr('{{ $json.telegram_message }}'),
      additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
    },
    credentials: {
      telegramApi: newCredential('Telegram account', 'cwpkALHMvccWpGeb'),
    },
  },
});

const slackEscalation = node({
  type: 'n8n-nodes-base.slack',
  version: 2.7,
  config: {
    name: 'Escalate to Human',
    parameters: {
      resource: 'message',
      operation: 'post',
      select: 'channel',
      channelId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Select escalation channel' },
      messageType: 'text',
      text: expr(
        '🚨 *REVIVE escalation*\\nWorkflow: {{ $json.workflow }}\\nUser: {{ $json.user_id }}\\nAmount at risk: {{ $json.amount_at_risk }}\\nReason: {{ $json.escalation_reason }}\\nRecovery status: {{ $json.recovery_status }}',
      ),
      otherOptions: { includeLinkToWorkflow: false },
    },
    credentials: {
      slackApi: newCredential('Slack account'),
    },
  },
});

const auditColumns = {
  mappingMode: 'autoMapInputData',
  value: {},
  matchingColumns: [],
  schema: [
    { id: 'timestamp', displayName: 'timestamp', required: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'event_id', displayName: 'event_id', required: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'user_id', displayName: 'user_id', required: false, display: true, type: 'string', canBeUsedToMatch: true },
    { id: 'workflow', displayName: 'workflow', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'root_cause', displayName: 'root_cause', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'intervention', displayName: 'intervention', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'retry_count', displayName: 'retry_count', required: false, display: true, type: 'number', canBeUsedToMatch: false },
    { id: 'stop_contact', displayName: 'stop_contact', required: false, display: true, type: 'boolean', canBeUsedToMatch: false },
    { id: 'requires_human_escalation', displayName: 'requires_human_escalation', required: false, display: true, type: 'boolean', canBeUsedToMatch: false },
    { id: 'escalation_reason', displayName: 'escalation_reason', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'amount_at_risk', displayName: 'amount_at_risk', required: false, display: true, type: 'number', canBeUsedToMatch: false },
    { id: 'amount_recovered', displayName: 'amount_recovered', required: false, display: true, type: 'number', canBeUsedToMatch: false },
    { id: 'recovery_status', displayName: 'recovery_status', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'promise_to_pay_date', displayName: 'promise_to_pay_date', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'action_taken', displayName: 'action_taken', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'reason', displayName: 'reason', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'next_step', displayName: 'next_step', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'user_message', displayName: 'user_message', required: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'telegram_message', displayName: 'telegram_message', required: false, display: true, type: 'string', canBeUsedToMatch: false },
  ],
};

const auditLogNormal = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Audit Log',
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '15GQ9lqhThV_K_me86N0lYefDhETL-a2cn_XJVtktuIk', cachedResultName: 'razorpay' },
      sheetName: { __rl: true, mode: 'list', value: '243634607', cachedResultName: 'audit_log' },
      columns: auditColumns,
      options: { handlingExtraData: 'insertInNewColumn' },
    },
    credentials: {
      googleSheetsOAuth2Api: newCredential('Google Sheets account'),
    },
  },
});

const auditLogStopped = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Audit Log (Stopped)',
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '15GQ9lqhThV_K_me86N0lYefDhETL-a2cn_XJVtktuIk', cachedResultName: 'razorpay' },
      sheetName: { __rl: true, mode: 'list', value: '243634607', cachedResultName: 'audit_log' },
      columns: auditColumns,
      options: { handlingExtraData: 'insertInNewColumn' },
    },
    credentials: {
      googleSheetsOAuth2Api: newCredential('Google Sheets account'),
    },
  },
});

// ============================================================
// WIRE THE WORKFLOW
// ============================================================
export default workflow('revive-recovery', 'REVIVE — Revenue Recovery Agent')
  .add(telegramTrigger)
  .to(reviveAgent)
  .to(parseAgentOutput)
  .to(stopContactGuard.onTrue(auditLogStopped).onFalse(notStopped))
  .add(notStopped)
  .to(telegramReply)
  .add(notStopped)
  .to(auditLogNormal)
  .add(notStopped)
  .to(escalationGuard.onTrue(slackEscalation))
  .group('Output Processing', [parseAgentOutput, stopContactGuard, notStopped, escalationGuard], {
    description: 'Validates and safely parses the REVIVE JSON, then guards on stop_contact and escalation flags.',
  })
  .group('Delivery & Audit', [telegramReply, slackEscalation, auditLogNormal, auditLogStopped], {
    description: 'Sends the Hinglish reply to Telegram, escalates to a human when flagged, and logs every event for audit and money-recovered reporting.',
  });
