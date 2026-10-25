# Installation and deployment

## What is included

The installer is the `NyravaCRM` ASP.NET Core 8 project. On first startup, it creates the CRM schema in the configured, empty database. SQLite is the zero-configuration default. SQL Server 2022 and MySQL are selectable providers. Do not manually run a second schema script against the same database.

The demo profile uses a separate SQLite database and adds sample CRM records and three demo accounts. Do not expose the demo profile on a public server.

## Requirements

- .NET 8 SDK for building and running from source, or the .NET 8 ASP.NET Core runtime for a published deployment.
- A writable `data` directory beside the application when using SQLite.
- For SQL Server or MySQL, an empty, dedicated database and a database user with permission to create and alter tables and indexes during startup.

## One-command Windows install

In PowerShell, change directory to the extracted `NyravaCRM` folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./Install-NyravaCRM.ps1
```

The script checks for the .NET 8 SDK, restores dependencies, publishes the application to `publish`, and offers to start it. The matching `Start-NyravaCRM.ps1` script selects SQLite, SQL Server, or MySQL and starts the published app. Run `./Start-NyravaCRM.ps1 -Demo` for the separate fictional demo workspace. The installer never writes database or SMTP credentials into the project files.

## Run locally in Visual Studio

1. Extract the product package.
2. Open `NyravaCRM.csproj` in Visual Studio Community.
3. Select **Nyrava CRM App** for a clean account and database, or **Nyrava CRM Demo (Subscriber, Admin, Team Member)** to evaluate the seeded demo.
4. Select **Build → Rebuild Solution**.
5. Press **Ctrl+F5**.

The regular profile opens at `http://localhost:5180`. The demo profile opens at `http://localhost:5181`.

## Run from PowerShell

Open PowerShell in the extracted `NyravaCRM` project directory:

```powershell
dotnet restore
dotnet run --launch-profile "Nyrava CRM App"
```

To run the local demo instead:

```powershell
dotnet run --launch-profile "Nyrava CRM Demo (Subscriber, Admin, Team Member)"
```

To produce a deployable build:

```powershell
dotnet publish .\NyravaCRM.csproj -c Release -o .\publish
```

Deploy the contents of `publish`. Configure database, URL, and SMTP settings as environment variables or through the host's secret manager. Do not deploy with `CRM_DEMO_MODE=true`.

## Database providers

### SQLite (default)

No database server or credentials are needed. The regular profile stores data in `data/nyrava-crm.db`. The demo profile stores data in `data/nyrava-crm-demo.db`.

### SQL Server 2022

Create an empty database, for example `NyravaCrm`, and give the application database user permission to create tables, alter tables, and create indexes. Then configure:

```powershell
$env:Database__Provider = 'SqlServer'
$env:ConnectionStrings__Crm = 'Server=localhost;Database=NyravaCrm;Trusted_Connection=True;TrustServerCertificate=True'
dotnet run --launch-profile "Nyrava CRM App"
```

For a hosted SQL Server, use the provider's secure connection settings and store credentials in user secrets or the hosting platform's secret manager. Do not commit a real password.

### MySQL

Create a dedicated empty database and application user. Example database setup (replace the account and password locally):

```sql
CREATE DATABASE nyrava_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'nyrava_crm_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_PRIVATE_PASSWORD';
GRANT ALL PRIVILEGES ON nyrava_crm.* TO 'nyrava_crm_app'@'localhost';
```

Configure the application:

```powershell
$env:Database__Provider = 'MySql'
$env:ConnectionStrings__Crm = 'Server=localhost;Database=nyrava_crm;User=nyrava_crm_app;Password=REPLACE_WITH_A_PRIVATE_PASSWORD'
dotnet run --launch-profile "Nyrava CRM App"
```

## Team invitation email

Subscriber registration is open and free. A person joins a Subscriber's workspace only through an invitation sent to their email. Configure an SMTP account before enabling invitations on a public installation:

```powershell
$env:Crm__Email__SmtpHost = 'smtp.example.com'
$env:Crm__Email__SmtpPort = '587'
$env:Crm__Email__From = 'crm@example.com'
$env:Crm__Email__Username = 'smtp-user'
$env:Crm__Email__Password = 'SMTP_PASSWORD'
$env:Crm__Email__EnableSsl = 'true'
$env:Crm__PublicBaseUrl = 'https://crm.example.com'
```

If SMTP is not configured, invitation delivery returns an error; invitations are not silently reported as sent. Set `Crm__TeamInvitationsEnabled=false` to turn invitations off while leaving free Subscriber signup available. Keep SMTP credentials out of source control.

Set `Crm__PublicBaseUrl` to the public `https://` CRM origin for production email links. Production refuses to send invitations if this setting is missing or not HTTPS, so an untrusted request `Host` header cannot control invitation links. The development launch profile may use its local request origin. Production session cookies are Secure by default; do not set `Crm__CookieSecure=false` on an internet-facing deployment. The local PowerShell runner and Visual Studio launch profiles disable Secure only for localhost HTTP testing.

## Database initialization and upgrades

The application creates the core tables on the first run and adds its membership, invitation, message, and optional integration-key tables plus indexes. It also adds nullable lead-source and qualification-evidence columns to existing contact tables. Use a new, empty database dedicated to this CRM. The startup initializer includes compatibility additions for known older CRM databases; `EnsureCreated` is not a general-purpose schema migration system. Before upgrading an installation, stop the application, take a verified database backup, review release notes, and test the upgrade on a copy. Do not point a new installation at a database containing unrelated tables.

## Backups

- SQLite: stop the app before copying the `.db` file, or use a SQLite-consistent backup tool. Keep the database and its backup outside the source-control repository.
- SQL Server/MySQL: use the database server's native backup procedure and test restoration before relying on backups.
- Protect backups: CRM records include contact details, notes, appointments, team membership, and private chat messages.

## Demo credentials

See [README.md](../README.md#demo-logins-three-ready-to-use-accounts). Demo credentials and the reusable demo invitation code are for local evaluation only. Never deploy demo mode publicly.
