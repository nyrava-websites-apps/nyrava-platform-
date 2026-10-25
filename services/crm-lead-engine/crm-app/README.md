# Nyrava CRM App

**A self-hosted customer relationship management app for leads, contacts, follow-ups, appointments, and small teams.**

Nyrava CRM is a standalone ASP.NET Core application with its own database and sign-in flow. It can run by itself or connect to another product through its HTTP API. It does not depend on the Nyrava Home website or its production services.

> **License:** Proposed one-time price: **USD $199 for the first 10 buyers, then $299 per business**. No resale or redistribution. The owner and a specifically designated partner may use it free for their own projects. See [LICENSE](LICENSE), [licensing](docs/LICENSING.md), and [purchasing](docs/PURCHASING.md). Final customer terms still need to be issued and accepted.

## At a glance

| | |
|---|---|
| Runtime | .NET 8 / ASP.NET Core |
| Databases | SQLite, Microsoft SQL Server 2022, MySQL |
| Local URL | `http://localhost:5180` |
| Default storage | `data/nyrava-crm.db` |
| Product license | Proprietary; one-time USD $199 launch / $299 standard, no resale |

## What it does

- Manage leads and contacts with buyer/seller classification, pipeline stages, notes, activity history, assignment, and archiving.
- Schedule tasks, follow-ups, and appointments in month, week, day, and agenda views. Appointments use a start time; no end time is required.
- Record appointment outcomes and review performance summaries and in-app reminders.
- Create Subscriber workspaces and invite Team Members by email. Invitations are one-use, email-bound, and expire after seven days.
- Restrict Team Member access to contacts assigned to them and provide private one-to-one workspace chat.
- Optionally receive verified, consented leads from other applications through a Subscriber-scoped integration key; the CRM remains usable without it.

## Run locally

### Requirements

- .NET 8 SDK
- Windows PowerShell for the included installer, or any terminal with the .NET SDK

### Quick start

In PowerShell, from the extracted project directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./Install-NyravaCRM.ps1
```

The installer restores dependencies, publishes the app, and offers to start it. Open `http://localhost:5180` and create a Subscriber account. SQLite is the default and requires no database server.

To run from source in Visual Studio Community, open `NyravaCRM.csproj`, choose **Nyrava CRM App**, and press **Ctrl+F5**. From a terminal:

```bash
dotnet restore
dotnet run --launch-profile "Nyrava CRM App"
```

See [Installation and deployment](docs/INSTALLATION.md) for Windows and Linux hosting, SQL Server and MySQL configuration, SMTP invitations, backups, and upgrade guidance.

## Try the demo

Visual Studio includes a separate **Nyrava CRM Demo (Subscriber, Admin, Team Member)** launch profile. It uses its own local SQLite database and fictional sample data. Run it only on a trusted local machine; never expose demo mode or its fixed sample credentials on a public server.

| Demo account | Role | Email | Password |
|---|---|---|---|
| Test One | Subscriber / workspace owner | `testone@example.test` | `DemoCRM!2026TestOne` |
| Test Two | Team Member in Test One's workspace | `testtwo@example.test` | `DemoCRM!2026TestTwo` |
| Test Admin | Subscriber / separate workspace owner | `testadmin@example.test` | `DemoCRM!2026TestAdmin` |

In demo mode only, invitation code `1234` simulates a Team Member joining Test One's workspace. Normal installations require an emailed invitation. Demo accounts and sample records are created only when `CRM_DEMO_MODE=true`.

## Product boundaries

The app includes local in-app reminders and text-only team chat. Email is used to deliver Team Member invitations when SMTP is configured. Video meetings, AI assistance, property valuation, SMS, phone calling, and general-purpose email are not included; they require separate integrations.

## Architecture and data

The application is an ASP.NET Core web app with its own signup, login, and team-invitation backend. Its included browser interface calls the same `/api` endpoints available to integrating backends. Subscriber and Team Member identity uses an HTTP-only session cookie; the server derives the workspace and role from the signed-in identity. Optional machine-to-machine lead intake uses revocable Subscriber-scoped bearer keys. OAuth client credentials, webhooks, and cross-origin browser access are not provided.

SQLite is the default database. SQL Server 2022 and MySQL can be selected with configuration. On a clean, dedicated database, startup initializes the schema. This startup initializer is not a general-purpose migration system; back up and test upgrades on a copy before updating a live installation.

Read the [database schema reference](docs/DATABASE.md) and [integration guide/API reference](docs/INTEGRATION.md) before connecting another product. Never expose the database directly to an untrusted client.

See the [architecture overview](docs/ARCHITECTURE.md) for request flow, workspace boundaries, and hosting responsibilities.

## Security

- Do not commit database, SMTP, or integration credentials. Use environment variables or the host's secret manager.
- Configure HTTPS and a trusted reverse proxy before exposing the app to the internet.
- Do not use the demo launch profile in production.
- Back up CRM data securely; it may contain personal contact information, notes, appointments, and private messages.
- Review [SECURITY.md](SECURITY.md) before reporting a vulnerability.

This package is intended for evaluation and controlled deployment. Complete a production security and privacy review for the target environment before handling real customer data.

## Repository guide

| Path | Contents |
|---|---|
| `Program.cs`, `CrmDb.cs` | ASP.NET Core endpoints, authentication, workspace rules, database models, and initialization |
| `wwwroot/` | Browser interface, styling, and client-side API calls |
| `Install-NyravaCRM.ps1`, `Start-NyravaCRM.ps1` | Windows publish/install and run helpers |
| `docs/INSTALLATION.md` | Setup, deployment, providers, email, backup, and upgrade guidance |
| `docs/DATABASE.md` | Database tables, fields, indexes, and workspace boundaries |
| `docs/ARCHITECTURE.md` | Request flow, trust boundaries, and hosting shape |
| `docs/INTEGRATION.md` | HTTP API and backend integration guide |
| `docs/LICENSING.md` | Proposed one-time customer license and free internal-use model |
| `docs/PURCHASING.md` | How buyers pay and receive the installer; checkout is not built yet |
| `docs/FEATURE-AUDIT.md` | Feature-by-feature audit status, fixes, coverage, and remaining verification |
| `tests/NyravaCRM.Tests/` | Automated HTTP integration tests for authentication, contacts, workspace isolation, and activities |
| `.github/workflows/ci.yml` | Automated .NET restore, Release build, and integration tests |

## License and third-party software

Nyrava CRM App is proprietary software; no open-source license is granted for this repository. The intended customer offer is a one-time license for the purchaser's own business and projects, without resale or redistribution. The product owner and a specifically designated partner may use it free for their own projects. See [LICENSE](LICENSE) and [licensing and purchase model](docs/LICENSING.md). The app does not yet verify purchases or enforce license limits. Third-party dependencies remain subject to their respective license terms.
