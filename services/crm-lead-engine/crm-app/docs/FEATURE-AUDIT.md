# Nyrava CRM Feature Audit

**Audit date:** 2026-10-24  
**Scope:** Standalone `NyravaCRM` repository: ASP.NET Core API, browser UI, database model/startup, installer scripts, and customer documentation.  
**Audit status:** The prior source review, Release build, and 7 SQLite integration tests passed in GitHub Actions. Optional inbound integration code and tests have since been added locally; the current changes have not yet been built or tested because the .NET SDK is unavailable in this workspace. A live interactive browser review is also pending.

## Feature review

| Feature | What the source provides | Audit result and remaining verification |
|---|---|---|
| Subscriber signup and sign-in | Free Subscriber registration, email normalization, BCrypt password hashes, cookie session, logout, and current-user lookup. | Verified missing fields, invalid credentials, duplicate signup, logout, and unauthenticated API access in the passing integration suite. |
| Contact records | Create/edit, buyer/seller/other type, search, archive, restore, and contact notes. | Verified server-side field validation, lifecycle operations, and workspace isolation in the passing integration suite. |
| Optional inbound lead delivery | Subscriber can create/revoke workspace-scoped bearer keys. `/api/v1/inbound-leads` accepts four source types, verification and consent evidence, ZIP, and stable source IDs; creates new contacts assigned to the Subscriber. External FSBO requires a source URL and Admin review reference/time. | Code and seven integration test cases added locally. **Not yet compiled or run.** CRM does not run the upstream Admin review queue or decide ZIP/territory/eligibility; the connected lead system must do that before delivery. |
| Pipeline | Seven stages from New through Verified Lead/Lost Lead; stage selection on a contact and a board grouped by stage. | This is a browser-rendered view over contacts, not a separate persistence feature. Existing Won/Lost stage values are migrated at startup. Requires an interactive browser check. |
| Notes and activity history | Contact-linked notes, tasks, follow-ups, and appointments. | Fixed the missing Add Note action and API rejection of note edits. Note creation and activity history pass integration checks. |
| Calendar and appointment outcomes | Month, week, day, and agenda views; start time, location/link, filters, completion, outcome choices, and result history. Appointment end time is optional and stored as its start time. | Fixed result history becoming inaccessible after completion and prefilled the latest outcome when reopening it. Appointment scheduling and outcome history pass API tests. Browser calendar navigation, timezone display, and mobile layout remain untested. |
| Overview, reminders, and performance | Counts and summaries derived from the current user's visible workspace data. Reminders are in-app only. | Source-reviewed. These are summaries, not forecasting or external notifications. Needs a live data check. |
| Team members | Subscriber invites by email; invitations are email-bound, hashed, expire after seven days, and are single-use in normal mode. Subscriber assigns contacts and can disable/reactivate members. | Passing tests cover demo access, role restrictions, assignment, chat access, invitation acceptance constraints, and invitation-off behavior. Normal SMTP delivery still needs real provider testing. There is no permanent member deletion. |
| Team invitation setting | `Crm:TeamInvitationsEnabled` enables/disables invitations for the installation. | **Gap:** there is no Subscriber-facing per-workspace setting in the UI. Turning this off currently affects every workspace on that installation. |
| Team chat | Private one-to-one text messages between active members of the same workspace; browser polls every five seconds. API limits each returned conversation page to the newest 300 messages. | Added message and workspace access coverage. No real-time push, file attachments, or unread notifications. Needs live browser verification. |
| Database | SQLite default, SQL Server, and MySQL provider configuration; startup creates tables and applies known compatibility columns. | Test factory now uses a separate temporary database, including demo tests. Only SQLite is covered by the authored integration tests. SQL Server 2022 and MySQL startup/query compatibility remain unverified. Startup initialization is not a migration framework; test upgrades against a backup. |
| Demo accounts and records | Separate demo SQLite profile with clearly fictional sample workspaces, contacts, activities, and chat. | Source-reviewed. The fixed demo credentials and `1234` invite code are for local evaluation only; never expose demo mode publicly. |
| Installation and integration | PowerShell installer/runner, HTTP JSON API, optional Subscriber-scoped lead delivery, and setup/integration/database documentation. | Scripts and docs reviewed. No actual Windows PowerShell, Visual Studio, publish, or external backend run was possible here. OAuth, webhooks, and cross-origin browser access are not provided. |
| Licensing and payment | Proposed one-time license terms and manual checkout/delivery instructions. | **Not implemented in the app:** no checkout, payment verification, license issuance, or activation enforcement. This is documented in the product files. |
| Video, voice, SMS, AI, and external calendars | Not included in this standalone CRM package. | These require separate integrations; a meeting URL can be stored as an appointment location, but the app does not host a call. |

## Security and production readiness

- API session failures now return `401` or `403` instead of redirecting API clients to a login page.
- Session cookies are HTTP-only and SameSite Strict. Secure cookies default on outside Development; local HTTP launch profiles explicitly disable Secure for localhost only.
- Invitation tokens are stored as SHA-256 hashes, and workspace/member checks are enforced in API handlers.
- Optional integration keys are stored as SHA-256 hashes, shown once, revocable, and scoped to the Subscriber workspace that issued them.
- Production invitation links require an explicitly configured HTTPS `Crm:PublicBaseUrl`; the server will not build a production link from an untrusted request host.
- Contact email and field lengths are validated server-side; dynamic UI text is HTML-escaped before insertion.
- **Before public deployment:** add/verify login and signup rate limiting, password recovery and email verification policy, reverse-proxy/HTTPS configuration, secret handling, database backup restoration, and a security review. No penetration test has been run.

## Checks completed in this workspace

- `node --check wwwroot/app.js` — passed.
- `appsettings.json` and `Properties/launchSettings.json` — valid JSON.
- `wwwroot/index.html` — parsed by Python's HTML parser.
- `git diff --check` — passed.

## Checks still required

The .NET SDK, PowerShell, Visual Studio, and a browser are not installed in this workspace, and this clone has no Git remote configured. Therefore the following have **not** been run here:

1. Interactive subscriber/team-member use in a browser, including responsive mobile checks.
2. SQL Server 2022 and MySQL database-provider smoke tests.
3. SMTP invitation delivery using a real provider.
4. Published installer/runner test on Windows and an HTTPS deployment test.

GitHub Actions completed the .NET 8 Release build and all 7 SQLite integration tests successfully on the audit branch. The remaining checks require your local Windows/browser environment or configured external services.
