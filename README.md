# REVIVE — Razorpay Revenue Recovery AI Agent

REVIVE is a conversational AI revenue-recovery agent built with n8n and designed for Razorpay-based revenue recovery workflows.

The agent identifies revenue-recovery opportunities, determines the appropriate intervention, executes bounded recovery actions, communicates with users through Telegram, records every interaction for auditability, and escalates cases to humans through Slack when required.

REVIVE supports seven revenue-recovery motions through a unified conversational workflow and returns a structured response for every interaction.

## Project Overview

Revenue leakage can occur at multiple stages of the payment lifecycle:

* Payment failures
* Checkout abandonment
* Failed subscriptions
* Overdue B2B invoices
* Mandate failures
* Customer recovery conversations
* Promise-to-pay follow-ups

REVIVE brings these scenarios into a single AI-powered recovery workflow.

The system combines Razorpay payment data, conversational AI, deterministic guardrails, audit logging, and human escalation to create a controlled revenue-recovery process.

## Key Capabilities

* Conversational revenue recovery through Telegram
* Hinglish customer interaction support
* Seven recovery workflows through one unified agent
* Razorpay API integration for payment and billing information
* AI-driven diagnosis and intervention selection
* Payment-link generation for eligible recovery scenarios
* Structured JSON responses from the AI agent
* Automated audit logging through Google Sheets
* Human escalation through Slack
* Opt-out and stop-contact protection
* Per-user conversational session memory
* Bounded recovery actions with explicit workflow guards

## Supported Recovery Workflows

REVIVE currently supports the following seven recovery motions:

| Recovery Motion         | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| Payment Degradation     | Identify and recover revenue affected by payment failures   |
| Checkout Drop-off       | Re-engage customers who abandon checkout                    |
| Failed Subscription     | Recover failed recurring subscription payments              |
| B2B Receivables         | Follow up on overdue business invoices                      |
| Mandate Retry           | Handle failed or unsuccessful payment mandates              |
| Hinglish Voice Recovery | Support conversational recovery using Hinglish interactions |
| Promise-to-Pay          | Track and follow up on customer payment commitments         |

## System Architecture

```text
                         Customer
                            |
                            v
                     Telegram Trigger
                            |
                            v
                 Per-User Session Memory
                            |
                            v
                    REVIVE AI Agent
                   Claude Sonnet / LLM
                            |
                            v
                Structured Output Parser
                            |
                            v
                  Agent Output Processor
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
       Razorpay Tools   Guardrails    Recovery Logic
             |              |              |
             +--------------+--------------+
                            |
                            v
                    Recovery Decision
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
       Telegram Reply   Google Sheets    Slack
                        Audit Log       Escalation
```

## Agent Workflow

The primary workflow follows this sequence:

```text
Telegram Message
       |
       v
Session Context
       |
       v
REVIVE AI Agent
       |
       v
Razorpay Data Retrieval
       |
       v
Diagnosis
       |
       v
Recovery Decision
       |
       v
Structured JSON Response
       |
       +--------------------+
       |                    |
       v                    v
Telegram Response      Audit Logging
                            |
                            v
                    Escalation Evaluation
                            |
                            v
                       Slack Alert
```

The workflow is designed so that the AI agent does not operate as an unrestricted conversational chatbot. Recovery decisions are processed through structured outputs and workflow-level guards before actions and communications are executed.

## AI Agent

The REVIVE AI Agent is powered by Claude Sonnet through the n8n AI Agent infrastructure.

The agent is responsible for:

1. Understanding the customer's recovery request.
2. Identifying the relevant revenue-recovery scenario.
3. Retrieving required payment or billing information.
4. Determining the appropriate recovery action.
5. Producing a structured response.
6. Returning an actionable response to the customer.
7. Recording the interaction for auditability.
8. Escalating cases requiring human intervention.

Structured Output Parsing is used to enforce a consistent response format.

## Razorpay Integration

REVIVE communicates with Razorpay through REST API tools using HTTP Basic Authentication.

The integration currently supports tools for:

```text
check_payment_failures
check_order_status
check_subscription_status
check_invoice_status
check_mandate_status
create_payment_link
```

Razorpay API base URL:

```text
https://api.razorpay.com/v1
```

These tools allow the agent to retrieve relevant payment and billing information before determining an appropriate recovery action.

## Guardrails

Revenue recovery requires controlled automation. REVIVE therefore includes workflow-level safeguards.

### Stop-Contact Guard

If a customer opts out of communication, the workflow stops further recovery communication.

```text
Customer Opt-Out
      |
      v
Stop-Contact Guard
      |
      v
Workflow Halted
```

### Escalation Guard

Cases that require human attention are routed to Slack instead of being handled entirely automatically.

```text
Recovery Decision
      |
      v
Escalation Evaluation
      |
      +---- No ----> Normal Response
      |
      +---- Yes ---> Slack Escalation
```

### Structured Responses

The AI agent output is passed through a Structured Output Parser before downstream processing.

This reduces the possibility of malformed responses being passed directly into customer-facing or audit workflows.

### Auditability

Every processed interaction can be recorded in the configured Google Sheets audit log.

The audit information provides visibility into:

* Customer interaction
* Recovery workflow
* Agent decision
* Recovery action
* Escalation state
* Relevant workflow metadata

## Integrations

REVIVE currently uses the following services:

| Service           | Role                                  |
| ----------------- | ------------------------------------- |
| n8n               | Workflow orchestration                |
| Claude Sonnet     | Conversational AI and decision engine |
| Razorpay REST API | Payment and billing data              |
| Telegram          | Customer interaction                  |
| Google Sheets     | Audit logging                         |
| Slack             | Human escalation                      |

## Required Credentials

The following credentials are required when deploying the workflows:

### Telegram

Telegram Bot API credentials are required for customer communication.

### Anthropic

Anthropic credentials or available n8n Gateway credits are required for Claude-based agent execution.

### Razorpay

Razorpay REST API credentials require:

```text
key_id
key_secret
```

The API uses HTTP Basic Authentication.

### Google Sheets

Google Sheets OAuth2 credentials are required for the audit log.

### Slack

Slack OAuth2 credentials are required for escalation.

The Slack application must have:

```text
chat:write
```

permission enabled.

If the permission is added after installation, the Slack application may need to be reinstalled.

## Repository Structure

```text
reviveAI_BOT/
│
├── revive-recovery.workflow.ts
├── cleanup-read-audit.workflow.ts
├── package.json
├── SETUP.md
├── LICENSE
├── README.md
└── .gitignore
```

### Main Workflow

`revive-recovery.workflow.ts`

Contains the primary REVIVE revenue-recovery workflow.

It connects:

```text
Telegram
    |
AI Agent
    |
Razorpay Tools
    |
Output Parser
    |
Guards
    |
Telegram + Audit Log + Slack
```

### Audit Maintenance Workflow

`cleanup-read-audit.workflow.ts`

Provides a maintenance workflow for the configured `audit_log` Google Sheet.

## Installation and Setup

These files are n8n SDK TypeScript workflow sources.

They are intended to be imported into an n8n instance rather than executed directly as standalone TypeScript applications.

### 1. Clone the Repository

```bash
git clone https://github.com/include-stdioH/reviveAI_BOT.git
cd reviveAI_BOT
```

### 2. Install Dependencies

Install the required project dependencies according to the repository configuration.

```bash
npm install
```

### 3. Configure n8n

Create or access an n8n instance and configure the required credentials:

```text
Telegram Bot API
Anthropic / n8n Gateway
Razorpay REST API
Google Sheets OAuth2
Slack OAuth2
```

### 4. Import the Workflows

Import the workflow sources into n8n:

```text
revive-recovery.workflow.ts
cleanup-read-audit.workflow.ts
```

Reconfigure environment-specific credential references and workflow identifiers after importing.

### 5. Configure Razorpay

Provide:

```text
Razorpay Key ID
Razorpay Key Secret
```

and ensure the configured API credentials have access to the required Razorpay resources.

### 6. Configure the Audit Log

Connect Google Sheets OAuth2 and configure the spreadsheet used for the `audit_log`.

### 7. Configure Slack Escalation

Connect Slack OAuth2 and ensure the application has:

```text
chat:write
```

permission.

### 8. Configure Telegram

Connect the Telegram Bot API and configure the Telegram trigger used by the REVIVE workflow.

## Running REVIVE

Once the credentials and workflow configuration are complete:

1. Activate the REVIVE n8n workflow.
2. Open the configured Telegram bot.
3. Send a recovery-related request.
4. Allow the AI agent to identify the relevant recovery workflow.
5. The agent retrieves required Razorpay information.
6. The recovery decision is generated.
7. The structured response is processed through the workflow guards.
8. The customer receives the Telegram response.
9. The interaction is recorded in the audit log.
10. Cases requiring human intervention are routed to Slack.

## Example Interaction Flow

```text
Customer
   |
   | "My payment failed. Can you help?"
   v
REVIVE
   |
   | Identify payment failure
   v
Razorpay
   |
   | Retrieve payment information
   v
REVIVE AI Agent
   |
   | Diagnose + determine recovery action
   v
Guardrails
   |
   +---- Allowed ------> Customer Response
   |
   +---- Escalation ---> Slack
   |
   v
Google Sheets Audit Log
```

## Data Flow

REVIVE follows a controlled data flow:

```text
Customer Input
      |
      v
Telegram
      |
      v
AI Agent
      |
      v
Razorpay APIs
      |
      v
Recovery Decision
      |
      v
Guardrails
      |
      +------------+-------------+
      |            |             |
      v            v             v
 Telegram      Audit Log      Slack
 Response      Google Sheet   Escalation
```

## Safety and Operational Considerations

REVIVE is designed around bounded automation rather than unrestricted autonomous financial actions.

Important considerations include:

* Recovery actions should remain within the configured workflow boundaries.
* Customer opt-outs must stop further contact.
* Human escalation is available for cases requiring manual review.
* AI output is validated through structured output processing.
* API credentials must be stored securely in n8n.
* Environment-specific credential and workflow references must be reconfigured during deployment.
* Production payment operations should be validated against the appropriate Razorpay environment and permissions before enabling real customer-facing recovery actions.

## Current Implementation Notes

The Razorpay HTTP Request Tool wrapper may produce a non-fatal n8n framework notice related to:

```text
supplyData method but no execute method
```

The current workflow handles this condition without fabricating payment or billing information.

The workflow files contain environment-specific identifiers and credential references. These should be re-pointed when importing the workflows into another n8n instance.

## Technology Stack

```text
Workflow Automation    n8n
AI Model               Claude Sonnet
Payment Platform       Razorpay
Messaging              Telegram
Audit Storage          Google Sheets
Human Escalation       Slack
Workflow Language      TypeScript
API Communication      REST / HTTP
Authentication         OAuth2 / HTTP Basic Auth
```

## Project Goals

REVIVE is designed to demonstrate how an AI agent can move beyond simple conversational responses and operate as a controlled revenue-recovery system.

The core goals are:

* Detect revenue at risk.
* Understand the reason for revenue leakage.
* Select an appropriate intervention.
* Execute bounded recovery actions.
* Communicate naturally with customers.
* Maintain an auditable recovery history.
* Escalate cases when human judgment is required.
* Support multiple revenue-recovery scenarios through one unified agent.

## License

This project is licensed under the MIT License.

See the `LICENSE` file for the complete license text.

## Repository

Source code and workflow definitions:

https://github.com/include-stdioH/reviveAI_BOT

## Project Summary

REVIVE combines conversational AI, payment infrastructure, workflow automation, audit logging, and human escalation into a unified revenue-recovery agent.

Rather than treating payment recovery as a collection of disconnected automation scripts, REVIVE provides a single agent capable of handling multiple recovery scenarios while maintaining structured outputs, workflow-level guardrails, and an auditable execution path.
