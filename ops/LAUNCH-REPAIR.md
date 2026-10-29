# Nyrava Home launch repair

This branch is prepared for review and launch configuration. It has no production deployment trigger. Do not replace the production database, stored Stripe settings, or the entire service directories with the uploaded source snapshot.

## What changes

- Preserve the production portal admin authorization guard for both `/api/admin/*` and `/api/ops/*`.
- Platform administrators remain billing-exempt. A single operator-configured existing Realtor test account can receive an audited nonbilling exemption, matched by BOTH its database ID and email. No paid verification is fabricated. Revoked exemptions are not automatically re-granted on restart.
- Ordinary subscriber API access requires verified, current paid entitlement. Team members inherit their owning Realtor's access and continue seeing only explicitly assigned contacts in that workspace.
- ZIP occupancy, adding ZIPs and active territory discovery use the same eligibility rule, including authorized nonbilling access. Exemption does not bypass the two-account ZIP capacity rule.
- New scraped listings retain their real source URL and any actual visible contact. Unknown owner names, phone numbers and ZIPs are never generated. The collector saves discoveries locally before attempting intake. An admin-owned integration token can send them to the central bank as `Fsbo Prospect` / `Review`, with no verification or consent assertions. They do not enter subscriber distribution until reviewed.
- Standard daily delivery limit is two across all ZIPs. Delivery copies retain source evidence; recipient email must match recorded permission. Four-per-day exceptions are not automatically granted. A process-local gate prevents overlapping intake within the current single CRM instance. Multiple replicas would need a database-level delivery lock.
- No existing leads are deleted, reclassified, or redistributed by startup. The previously archived test leads remain archived.

## Fill in later

The protected `/admin-stripe.html` page accepts blank placeholders for secret/restricted key, publishable key, webhook signing secret, and annual / Basic / Pro price IDs. Existing saved secrets are retained when secret inputs are left blank. Do not publish real settings or keys to GitHub.

Webhook endpoint: `https://home.nyrava.com/api/billing/stripe/webhook`

Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.

Checkout stays disabled by default. The Basic and Pro checkout parameter templates are intentionally empty. Populate them with the COMPLETE existing Stripe billing arrangement before enabling checkout; price IDs alone do not describe an annual license plus a deferred monthly service. The code never guesses an annual charge, creates prices, or creates a second subscription for an already entitled account. The template permits Stripe `line_items[n][price]`, `line_items[n][quantity]` and subscription `trial_period_days`, `billing_cycle_anchor`, `proration_behavior`; price tokens `{{ANNUAL_PRICE_ID}}`, `{{BASIC_PRICE_ID}}`, `{{PRO_PRICE_ID}}` resolve against saved settings. Unsupported schedule structures must be integrated and tested before accepting payment. A single-price syntax example is NOT a complete annual-plus-monthly setup.

Set `Crm__BillingSyncSecret` to the same securely generated value on portal and CRM. The gateway verifies Stripe webhook signatures, retrieves the authoritative subscription and latest invoice, then signs its CRM reconciliation request. The CRM rejects mismatched signatures, duplicate events, stale observations, customer changes, and conflicting active subscriptions. A Stripe `active` label without a paid invoice does not grant paid access. Metadata must include `nyrava_owner_id` and `nyrava_plan`; newly created checkout sessions add these automatically. Legacy subscriptions need explicit identity reconciliation, not an automatic guess by email.

Use `ops/launch.env.example` as a list of private configuration fields. Existing Docker Compose may require explicit environment mappings; saving an env file alone does not inject every variable into containers. Do not replace the existing `.env` or Compose file. The test account ID/email must be entered in private server configuration, not in public source.

## Source prospect review

`services/crm-lead-engine/prospects.jsonl` is a durable local discovery spool; its real contents contain personal data and must remain untracked and private. Discovery retries are idempotent. If the integration key is not owned by a platform administrator, admin-bank intake returns 403 and the local spool is retained for repair.

Actual review records may be placed by an authorized operator in `reviewed-leads.jsonl`. Each record must include a real ownerName, contact, zipCode, externalId, sourceUrl and a `verification` object: method (`Phone` or `Email`), recipientEmail, consentText, reviewReference, contactVerifiedAt, intentVerifiedAt, consentCapturedAt, adminReviewedAt. The collector preserves those actual evidence timestamps; it never creates them. Do-not-contact prospects are not submitted for distribution. Review records require real evidence; editing a JSON file is not itself verification.

No promise of new qualified lead volume is made: real contact information and permission must actually be obtained. Unsupported ZIP-to-source mappings are logged instead of silently searching Houston. The test ZIP 75034 maps to Dallas-area search; a search ZIP is never asserted to be the property's ZIP.

## Validation and deployment

Local checks: Node syntax and the new Node policy tests. .NET SDK and network package installation are unavailable in the editing environment, so GitHub Actions runs the C# build and selected access/security regressions. The older suite contains assumptions that unpaid workspaces remain usable; those fixtures require migration before the full legacy suite is an appropriate release gate. Do not deploy until the new C# checks pass and a staging run verifies existing billing and lead intake flows.

At launch: back up the SQLite database using SQLite's online backup API, save changed production source files and Compose configuration, record container health, then deploy only the changed CRM and portal services. The collector is a separate `nyrava-lead-daemon` container, with a bind-mounted source directory. Restart it only after the new intake endpoint is healthy; existing source lists and discovery spools must remain. Keep unrelated Meet, layout, account, credential, and storage changes intact. Verify unauthenticated admin 401, non-admin admin 403, admin exemption, test exemption, unpaid owner 402, team assignment isolation, active ZIP 75034, source-spool preservation, and honest delivery counts. Do not restore an old database over newly arriving leads as a routine code rollback.
