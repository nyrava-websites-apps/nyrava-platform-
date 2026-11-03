# Sales Partner Center — review and deployment readiness

Review date: November 2, 2026
Branch: `feature/sales-partner-center`
Base: synchronization branch / PR #7. Main remains unmerged.

## Result

A working isolated implementation is available with real screens, authenticated HTTP routes, persisted database records, versioned migrations, billing-event ingestion, commission accounting, support and manual payout workflows. This is a review build, not permission to deploy. Production has not been changed.

## Implemented workflows

| Area | Behavior |
|---|---|
| Administration | Invite contractors; activate by one-use expiring invitation; suspend access; manage contact availability; record signed-agreement evidence; inspect customers, tickets, accounting, reports and audit history. |
| Contractor workspace | Existing platform sign-in; own prospects and pipeline; prospect/customer appointments; customer relationships; support conversations; commission balances and payout statements. Scope checks prevent contractor access to admin operations or another representative's support queue. |
| Permanent tracking | References use immutable primary keys: NYR-REP, NYR-SUB and NYR-REL. Signup referral records survive checkout through the existing owner identity. Original acquisition, current servicing and future residual ownership are separate. |
| Existing subscribers | Admin explicitly assigns support and future residual ownership. Unknown original attribution and dates remain unknown. No historical salesperson, license payment or upfront commission is invented. Historical coverage is labelled unknown until real records are supplied. |
| Existing Stripe integration | Existing checkout, subscription sync, webhook signature verifier, credentials and customer/subscription identifiers are reused. The extension appends signed financial facts; no replacement Stripe system, new payment processor, or automatic money transfer is introduced. |
| Billing lifecycle | Paid license, monthly invoices, paid upgrade proration, failures, subscription changes/cancellation, renewals, refunds and disputes. Invoice/payment/balance movement keys prevent duplicate cash entries; provider event receipts preserve processing history. Refund/dispute exceptions create review records. Unknown or ambiguous financial data fails closed. |
| Compensation | Default cumulative sale tiers $50/$75/$100 at 1–10/11–15/16+; Basic $5, Pro $10. Prospective, immutable admin versions control rates, thresholds, paid-upgrade proration and period caps. |
| Upgrade residuals | Use actual paid invoice-line intervals within the original billing period. Overlapping credited intervals cannot earn twice. Default total cap is $10 per billing period; the halfway example produces $5 + $2.50. Failed/unpaid intervals earn no additional residual. |
| Ownership changes | Support transfers move open tickets and customer responsibilities. Future residual ownership requires separate approval, reason and effective date. It applies to billing periods starting on/after that date; already earned commissions are preserved. |
| Support | Persisted tickets and in-app conversations, escalation, due dates, resolution, email through the existing SMTP/outbox service, phone-call requests and links to the existing video meeting service. |
| Manual weekly payroll | Friday default; admin-adjustable payday/cutoff/time zone. Automatic generation creates drafts only. Draft → Review → Approved → Processing → Paid/Failed. External payment confirmation requires an admin and unique reference. Approval does not mean money was sent. |
| Accounting | Recorded cash receipts/refunds/dispute movements, invoices, upfront/residual/adjustment costs, paid commissions, liabilities, contractor credits, cohort and salesperson reports, known active-subscription MRR and downloadable statements. Unknown fees, unknown MRR and incomplete historical coverage are labelled explicitly. |
| History protection | Database foreign keys reuse existing CRM users; unique indexes enforce event/commission/payout keys. Database triggers and application guards protect financial facts, original attribution and confirmed payouts from rewrite/deletion. Corrections append ledger entries. |

## Verification evidence

- Full .NET integration/regression suite: 77 passed, zero failed.
- Full Node suite: 35 passed, zero failed.
- API lifecycle test covers invitation, activation, referral signup, the existing signed billing synchronization, financial ingestion, duplicate simultaneous events, tier/residual/proration calculations, support, reassignment, suspension and manually confirmed payout.
- Migration test preserves existing CRM users, rejects direct historical SQL mutation/deletion, and verifies repeat installation.
- Browser test operates actual admin, contractor and Realtor screens: invitation, activation, login, compensation version publication, prospect persistence, referred signup, signed test payments, support resolution, weekly approval/processing/confirmation and a fully settled customer commission balance.
- Local Docker builds cover CRM, portal, meetings and home evaluation. Build contexts exclude credentials, database files, outboxes, backups, node_modules and generated binaries.
- Screenshots and test logs accompany the chat outputs. Demo balances are produced by synthetic transactions stored in the isolated database, not hardcoded screen values.

## Safe review environment

`ops/run-sales-partner-demo.py` creates a fresh local database and isolated copy of the build. It removes live Stripe/SMTP/Redis settings from its child environment. It writes generated test credentials to `.local-sales-demo/access.json` (git-ignored) and serves the portal on localhost:13000, CRM on localhost:15180 and, when dependencies are installed, the existing meeting service on localhost:15000.

`ops/docker-compose.sales-partner-review.yml` is a standalone alternative with separate volumes/project and loopback-only ports. It does not reuse the production Compose network or volumes. Never run the production Compose file for this demonstration.

Feature switches: `SalesPartners__Enabled=true` in the CRM and `SALES_PARTNERS_ENABLED=true` in the portal. Both default off. The database migration currently targets SQLite, the inspected production provider. Other database providers are rejected when this feature is enabled rather than silently using an incompatible schema.

## Production release gates

1. Review the code, migrations, accounting policies and manual-payment workflow; resolve the Phase 1 baseline/approval dependency. Do not merge/deploy automatically.
2. Verify a current recoverable production backup before an approved rollout. No production databases, customer accounts, deployment settings or containers were modified for this implementation.
3. Validate the existing Stripe annual/Basic/Pro price IDs and subscription billing schedule in test mode. Extend the **existing** webhook's enabled event selection for the supported refund/dispute events; do not create a replacement billing flow. Retain its current signature verification and sync secret configuration.
4. Perform merchant-account test-mode acceptance using actual test credentials and the configured API version. Local tests use signed synthetic events and a stub of Stripe's external API; no real card charges, bank payments or live Stripe settings were exercised.
5. Confirm production SMTP delivery and a two-person camera/audio call. Local email tests use the existing outbox fallback, and video tests do not claim hardware validation. Phone functionality is a routed call request, not an invented telephony provider.
6. Explicitly map legacy support/residual ownership and reconcile historical records. Unknown original acquisition details and historical balances are never guessed or backfilled as fabricated payments.
7. Review Friday cutoff/time zone, external payment evidence policy, compensation versions, refund/fraud correction approvals and any unknown transaction fees. Manual confirmation records an administrator's attestation of an external payment; it is not a bank API settlement check.

Production rollout is held for this review and these environment-specific acceptance checks. No production deployment or automatic contractor transfer has occurred.

## Stripe documentation checked

Provider event types and dispute balance movement handling were checked against Stripe's API event reference and dispute documentation:
- https://docs.stripe.com/api/events/retrieve
- https://docs.stripe.com/api/disputes/object
- https://support.stripe.com/questions/dispute-fees-faq
