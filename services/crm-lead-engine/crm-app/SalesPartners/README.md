# Sales Partner Center

This module adds role-scoped operational screens and accounting to the existing platform. It reuses CRM users/cookie authentication, existing Stripe checkout and signature-verified webhooks, the existing email dispatch service and meeting service.

See `ops/SALES-PARTNER-CENTER-REVIEW.md` for behavior, verification and release gates. The feature defaults off. Production has not been changed.

Review entry point: `/sales-partners`.
Schema migrations: `SalesPartners/Migrations/001.sql` through `004.sql`, additive to the existing SQLite CRM database.
Local demonstration: `python ops/run-sales-partner-demo.py` after building CRM and installing portal/meeting dependencies.
Browser verification: `services/web-portal/tests/sales-partner-browser.cjs`, configured with the local test base URL and generated demo-only credentials.
