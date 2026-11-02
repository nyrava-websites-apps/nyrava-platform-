# Production synchronization review — November 2, 2026

## Scope and baseline
Production HEAD: `5a5ac3eba18f20017958771f4c01f4b11dae6cbe`.
Freshly fetched GitHub main: `207937e6f8523854380692f00db2e7500cb578a8` (27 commits ahead).
Branch: `sync/production-20261101`, based on GitHub main, preserving its commit history.
Production application files, configuration, containers, accounts and databases were not intentionally modified. Server writes were limited to backup and inspection artifacts under /root. No deployment or main merge performed.

## Reconciliation
Already shared by production and main: gateway billing integration, authorization, admin billing UI, team UI, meeting CSS and personal reminders.
Imported production-only dashboard markup, CRM UI adjustment, original discovery dates, bank bonus delivery/reconciliation, prospect review and exclusion endpoints, expanded collector territories, explicit owner/ZIP requirements and spelled phone parsing.
CrmDb.cs and Program.cs were reconciled by retaining GitHub's launch/access controls and importing production's additive bank/discovery implementations. BillingSyncEndpoints retains payment synchronization and invokes delivery only after commit. Collector changes preserve current public-contact policy and stricter live qualification rules.
Retained main-only ops scripts, workflow, ignore rules and history. Production test fixtures were incorporated; collector expectations and gateway billing-identity fixture were corrected to reflect the actual production contracts. No application policy was weakened to pass tests.
The live Caddy difference redirects a separate Elemed domain; it is excluded from this Nyrava application branch and remains in private backups. Temporary *-check modules, .new files, backups, prospects, environment files, databases, outboxes and customer records are excluded. The standalone Trellistate source adapter and its tests are preserved.

## Actual runtime evidence
The running web portal, meetings and evaluation artifacts compared against corresponding source files showed no text-content differences after newline normalization. The CRM container has no modified DLL in docker diff, but its running NyravaCRM.dll SHA256 `c0196e0fbdfadba8c4232d6ac991c5ffce111471754f144dcdd940fa27b3ab58` differs from all saved server bin/obj DLLs. Rebuilding independently is not proof of binary equivalence. Running CRM image and artifacts were preserved privately; exact behavioral equivalence is still an open verification item.

## Private backups
Existing source snapshot preserved. New backup directory: `/root/nyrava-phase1-20261102-012938`.
Includes application archive, container/deployment metadata, Docker images, runtime data-protection keys, mounted and all platform named volumes, SQLite online backups (integrity_check passed), PostgreSQL SQL/custom exports, volume mapping and SHA256 manifest. Archive listings and PostgreSQL archive table of contents verified. Live copies of non-SQLite volumes are not a demonstrated coordinated point-in-time recovery; full restore/recovery validation remains outstanding. Private backup material is not committed.

## Build and test evidence
- .NET Release build and integration suite: 48 passed, 0 failed.
- Node collector/gateway/billing suite: 26 passed, 0 failed.
- Local Docker builds: CRM, web portal, meetings, home evaluation all succeeded.
- Isolated browser checks: Realtor and admin login 200; authenticated workbench dashboard and identity 200. Local homepage, Realtor dashboard, CRM and admin screenshots captured with fictional demo records. Development-only localhost cookie configuration was used; no production authentication changes.
- Existing EF1002 SQL interpolation warnings remain in schema helpers.
- Public production homepage and unauthenticated dashboard/admin access screenshots captured. These do not prove authenticated production behavior.
- Automated suites cover auth, permissions, contacts/tasks/appointments, team/invitations, territory routing, billing state, Stripe fail-closed checks, lead qualification and bank-bonus idempotency.

## Remaining acceptance limitations
No real customer account mutations, live Stripe charges, production email sends or production database writes were used for verification. Full authenticated production screenshots, end-to-end live payment/email/video/phone integration and coordinated backup restore proof remain unverified. Historical home.nyrava repository relationship has not yet been audited. Keep this PR in draft pending these acceptance items; do not interpret passing tests as approval to deploy or as proof that GitHub and the running CRM binary are identical. Phase 2 is not started.

## Files changed relative to main
```
M	.gitignore
M	services/crm-lead-engine/collector-policy.mjs
M	services/crm-lead-engine/crm-app/BillingSyncEndpoints.cs
M	services/crm-lead-engine/crm-app/CrmDb.cs
M	services/crm-lead-engine/crm-app/Program.cs
M	services/crm-lead-engine/crm-app/ProspectEndpoints.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/ActivityLifecycleTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/ContactLifecycleTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/CrmApplicationFactory.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/GeographicSubscriptionAndRoutingTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/InboundLeadIntegrationTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/InvitationAcceptanceTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/LegacySubscriptionMigrationTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/TeamAndChatTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/TeamInvitationConfigurationTests.cs
M	services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/WorkbenchTests.cs
M	services/crm-lead-engine/crm-app/wwwroot/app.js
M	services/crm-lead-engine/run.mjs
M	services/crm-lead-engine/tests/collector-policy.test.mjs
M	services/web-portal/public/dashboard-home.html
M	services/web-portal/tests/gateway-workflow.test.mjs
services/crm-lead-engine/crm-app/BankDeliveryReconciler.cs
services/crm-lead-engine/crm-app/BankDispatchService.cs
services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests/BankBonusTests.cs
services/crm-lead-engine/tests/trellistate-source.test.mjs
services/crm-lead-engine/trellistate-source.mjs
```
