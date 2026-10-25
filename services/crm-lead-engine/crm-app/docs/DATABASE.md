# Database schema reference

The application creates these seven tables on first startup. Physical types vary by provider; the fields and meanings below are the application's schema. The clean-install database is generated from `CrmDb` and the provider-specific startup initializer. No database credentials or demo records are required for a regular installation.

| Table | Purpose |
|---|---|
| `Users` | Subscriber and Team Member sign-in identities and workspace assignment. Passwords are stored as BCrypt hashes. |
| `Contacts` | Leads and contacts owned by a workspace, including assignment, pipeline stage, and soft-archive timestamp. |
| `Activities` | Tasks, follow-ups, appointments, notes, and appointment outcomes linked to contacts. |
| `Memberships` | Associates a Subscriber workspace owner with its users and active/disabled membership state. |
| `Invitations` | Stores the inviting workspace, invited email, SHA-256 token hash, expiration, and acceptance time. Raw invitation tokens are not stored. |
| `Messages` | Private one-to-one team chat messages scoped to a workspace. |
| `IntegrationKeys` | Optional inbound lead credentials, scoped to a Subscriber workspace. Only token hashes are stored. |

## Columns

### `Users`

`Id` (primary key), `Email` (unique, normalized to lowercase by registration), `PasswordHash`, `WorkspaceId`, `Role`. A subscriber is stored as `Owner`; an invited team user is stored as `Employee`. The UI presents these as **Subscriber** and **Team Member**.

### `Contacts`

`Id` (primary key), `UserId` (workspace owner), `Name`, nullable `Email`, nullable `Phone`, nullable `Company`, `LeadType`, nullable `AssignedToUserId`, `Stage`, nullable `Notes`, optional source and external lead ID, optional property ZIP, contact/intent verification timestamps, consent recipient/text/timestamp, external-FSBO flag and Admin review reference/time, optional source URL, nullable `ArchivedAt`, `UpdatedAt`. Existing manually created contacts may leave all integration metadata empty.

### `Activities`

`Id` (primary key), `UserId` (workspace owner), `CreatedByUserId`, nullable `AssignedToUserId`, `ContactId` (foreign key to `Contacts.Id`, delete cascades), `Kind`, `Title`, nullable `Details`, `StartsAt`, `EndsAt` (set to the start time; the UI does not require an appointment end time), nullable `Result`, nullable `Location`, nullable `TimeZone`, nullable `ResultHistory` (JSON text), `Completed`.

### `Memberships`

`Id` (primary key), `OwnerUserId`, `UserId`, `Role`, `Active`, `JoinedAt`. Unique index: (`OwnerUserId`, `UserId`). A Team Member's `WorkspaceId` and membership owner both point to the inviting Subscriber.

### `Invitations`

`Id` (primary key), `OwnerUserId`, `TokenHash` (unique), nullable `Email` (required and bound to the account for normal invitations), `ExpiresAt`, nullable `AcceptedAt`.

### `Messages`

`Id` (primary key), `WorkspaceOwnerId`, `SenderUserId`, `RecipientUserId`, `Body`, `CreatedAt`. Index: (`WorkspaceOwnerId`, `CreatedAt`).

### `IntegrationKeys`

`Id` (primary key), `OwnerUserId` (Subscriber/workspace owner), `Name`, unique `TokenHash` (SHA-256), `TokenPrefix`, `CreatedAt`, nullable `LastUsedAt`, nullable `RevokedAt`. The raw bearer key is returned only at creation and is never stored or listed.

## Indexes and relationships

- Unique `Users.Email`.
- Unique `Memberships(OwnerUserId, UserId)`.
- Unique `Invitations.TokenHash`.
- `Contacts(UserId, Name)`.
- Unique `Contacts(UserId, Source, ExternalLeadId)` when `ExternalLeadId` is present, for idempotent delivery.
- Unique `IntegrationKeys.TokenHash`; `IntegrationKeys(OwnerUserId, RevokedAt)`.
- `Activities(UserId, StartsAt)`.
- `Activities.ContactId` references `Contacts.Id`; deleting a contact row cascades to its activities. The application archives contacts instead of deleting them during normal use.
- `Messages(WorkspaceOwnerId, CreatedAt)`.

## Workspace isolation

Every authenticated request resolves the signed-in user's `WorkspaceId` on the server. Subscriber reads are scoped to that workspace. Team Member contact and activity reads are further restricted to records assigned to that member. Do not query these tables from an external project using a broad database credential; use the authenticated CRM API so its workspace rules are applied.

## Demo database

The demo profile uses `data/nyrava-crm-demo.db`, separate from the regular SQLite database. It inserts clearly fictional contacts, appointments, tasks, messages, and test users. Do not copy demo records into a production customer database.
