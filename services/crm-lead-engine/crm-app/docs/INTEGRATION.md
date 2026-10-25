# Integrating another project with the CRM

The CRM exposes a JSON HTTP API under `/api`. The included web app uses an HTTP-only session cookie. Optional lead delivery uses a Subscriber-created, workspace-scoped bearer key with the versioned `POST /api/v1/inbound-leads` endpoint. The integration can be left unused; ordinary CRM signup, contacts, pipeline, and team features do not depend on it. Do not put integration secrets in browser JavaScript or mobile app code.

A separate product or marketing page can send its **Log in** button to the CRM base URL and its **Create account** button to the CRM base URL with `?signup=1`. The CRM's own frontend then submits credentials to its backend and establishes the CRM session. For example, if the CRM is hosted at `https://crm.example.com`, link to `https://crm.example.com/` and `https://crm.example.com/?signup=1`. The website must never connect directly to the CRM database. If login must remain inside another site's pages, that requires a separately designed same-origin proxy or identity integration; the lead-delivery key is not a user login.

## Connection pattern

1. Install and run the CRM at a stable HTTPS URL, such as `https://crm.example.com`.
2. Sign in as the Subscriber who should receive the leads and open **Lead integrations**.
3. Create a key for the connected product. The full key is shown once. Store it in that product's server-side secret manager and revoke it in CRM if it is exposed or no longer needed.
4. Send approved leads from the connected product's backend to `POST /api/v1/inbound-leads` over HTTPS with `Authorization: Bearer <integration-key>`.

The CRM hashes integration keys at rest and scopes each key to the Subscriber workspace that created it. The inbound request cannot choose a workspace. Team Members cannot create keys, and the local demo mode does not issue or accept integration keys. The regular login and team invitation flows continue to work without integration setup.

The login cookie uses `HttpOnly` and `SameSite=Strict`; JavaScript cannot read it. A direct browser app hosted on another origin cannot call the session API because CORS is not enabled. Lead delivery is server-to-server; never expose the integration key or CRM database to a browser.

## C# backend example

This example logs in and reads contacts while retaining the session cookie in memory for the lifetime of `HttpClient`:

```csharp
using System.Net;
using System.Net.Http.Json;

var cookies = new CookieContainer();
var handler = new HttpClientHandler { CookieContainer = cookies, UseCookies = true };
using var crm = new HttpClient(handler)
{
    BaseAddress = new Uri("https://crm.example.com/")
};

var login = await crm.PostAsJsonAsync("api/login", new
{
    email = Environment.GetEnvironmentVariable("CRM_INTEGRATION_EMAIL"),
    password = Environment.GetEnvironmentVariable("CRM_INTEGRATION_PASSWORD")
});
login.EnsureSuccessStatusCode();

var contacts = await crm.GetFromJsonAsync<List<ContactDto>>("api/contacts");

public sealed record ContactDto(
    long Id,
    long UserId,
    string Name,
    string? Email,
    string? Phone,
    string? Company,
    string LeadType,
    long? AssignedToUserId,
    string Stage,
    string? Notes);
```

Keep the `HttpClient` and cookie jar server-side and reuse them. For a multi-user host, create a separate authenticated CRM client/cookie jar per integration identity; do not share one subscriber's session between customers. Handle `401` as an expired or invalid session and sign in again. Handle `403` as a permission denial. The CRM API currently has no token refresh endpoint.

## API reference

All request and response bodies are JSON except `204 No Content`. Successful registration/login sets a session cookie. Protected endpoints require that cookie.

| Method | Path | Access and behavior |
|---|---|---|
| `POST` | `/api/register` | Public. Creates a free Subscriber workspace if no invite code is supplied; a valid invite code creates an invited Team Member instead. |
| `POST` | `/api/login` | Public. Starts a session. Body: `{email,password}`. |
| `POST` | `/api/logout` | Clears the session cookie; safe to call even if the session has expired. |
| `GET` | `/api/demo-info` | Public demo/configuration flags; returns the demo invitation code only while demo mode is enabled. |
| `GET` | `/api/me` | Signed-in user's identity, role, workspace, and demo/config flags. |
| `GET` | `/api/contacts` | Active contacts visible to the current user. |
| `POST` | `/api/contacts` | Creates a manual contact in the signed-in user's workspace. Integration fields are optional and are not needed for standalone CRM use. |
| `GET` | `/api/integrations/keys` | Subscriber only, outside demo mode. Lists key names, prefixes, and timestamps; never returns secrets. |
| `POST` | `/api/integrations/keys` | Subscriber only, outside demo mode. Body: `{name}`. Returns a new secret once. |
| `DELETE` | `/api/integrations/keys/{id}` | Subscriber only. Revokes that Subscriber's key immediately. |
| `POST` | `/api/v1/inbound-leads` | Bearer key only. Accepts a verified, consented, routed lead into the workspace that owns the key. |
| `PUT` | `/api/contacts/{id}` | Updates a visible contact. |
| `DELETE` | `/api/contacts/{id}` | Subscriber only; archives the contact (returns `204`). |
| `GET` | `/api/contacts/archived` | Subscriber only. Lists archived contacts. |
| `POST` | `/api/contacts/{id}/restore` | Subscriber only. Restores an archived contact. |
| `GET` | `/api/activities` | Lists visible tasks, follow-ups, appointments, and notes. |
| `POST` | `/api/activities` | Creates activity. Body includes `contactId`, `kind`, `title`, `startsAt`; optional `details`, `location`, `timeZone`. |
| `PUT` | `/api/activities/{id}` | Updates task, follow-up, or appointment. |
| `PUT` | `/api/activities/{id}/complete` | Marks a visible activity complete. |
| `POST` | `/api/activities/{id}/result` | Records an appointment result and history. |
| `DELETE` | `/api/activities/{id}` | Subscriber only; permanently deletes the activity. |
| `GET` | `/api/team` | Lists workspace members and whether the current user can invite. |
| `POST` | `/api/team/invitations` | Subscriber only. Body: `{email}`; emails a one-use invitation. Requires SMTP configuration. |
| `POST` | `/api/team/{userId}/deactivate` | Subscriber only. Disables member access if active contacts have been reassigned. |
| `POST` | `/api/team/{userId}/activate` | Subscriber only. Re-enables a Team Member. |
| `POST` | `/api/team/assign/{contactId}` | Subscriber only. Body: `{userId}` assigns an active Team Member; `null` assigns it to the Subscriber. |
| `GET` | `/api/chat/people` | Lists available chat recipients in the workspace. |
| `GET` | `/api/chat/{peerId}` | Reads the current user's one-to-one conversation with an active workspace member. |
| `POST` | `/api/chat/{peerId}` | Sends a chat message. Body: `{body}`. |

## Create a contact example

After login, send:

```http
POST /api/contacts
Content-Type: application/json

{"name":"Jordan Sample","email":"jordan@example.com","phone":"+1 555 0100","company":"Example Realty","leadType":"Buyer"}
```

The server sets the workspace, initial pipeline stage, and assignment from the authenticated identity. Do not send a workspace owner ID from the integrating client to choose a tenant; the server does not trust a caller-supplied workspace selector.

## Deliver an approved lead

The integration service must already have applied the receiving subscriber's ZIP/territory, eligibility, deduplication, and ownership rules. It must send only leads approved for delivery. The CRM records the lead as `New`, assigns it to the Subscriber, and the Subscriber can then assign it to an active Team Member using `/api/team/assign/{contactId}`.

```http
POST /api/v1/inbound-leads
Authorization: Bearer nycrm_<secret>
Content-Type: application/json

{
  "externalLeadId": "home-evaluation-1842",
  "source": "HomeEvaluation",
  "name": "Jordan Sample",
  "email": "jordan@example.com",
  "phone": null,
  "company": null,
  "leadType": "Seller",
  "propertyZipCode": "85201",
  "contactVerificationMethod": "Email",
  "contactVerifiedAt": "2026-10-24T15:20:00Z",
  "intentVerifiedAt": "2026-10-24T15:21:00Z",
  "consentCapturedAt": "2026-10-24T15:22:00Z",
  "consentRecipient": "Realtor Jordan Lee, Example Realty",
  "consentText": "I authorize the named local Realtor to contact me about selling this property.",
  "sourceUrl": null,
  "externalFsbo": false,
  "fsboAdminReviewReference": null,
  "fsboAdminReviewedAt": null
}
```

Allowed `source` values are `Fsbo`, `HomeEvaluation`, `LeadGenerator`, and `RealtorAssistance`; `leadType` is `Buyer`, `Seller`, or `Other`. A confirmed email or phone is required and must match `contactVerificationMethod`. The request must include ZIP, contact and intent verification timestamps, and the authorized recipient, actual consent text, and consent timestamp. The CRM records these assertions from the authenticated integration; it does not perform the verification itself or decide territory eligibility.

For an FSBO lead discovered on an external site, set `externalFsbo` to `true` and include a source URL, an Admin review reference, and the review timestamp. The CRM rejects the lead without those fields. Admin review remains in the connected lead system; this CRM endpoint is not an Admin review queue and must only be called after approval. A repeated `(source, externalLeadId)` in the same Subscriber workspace returns the original contact rather than creating a duplicate. Successful first delivery returns `201`; an idempotent retry returns `200`.

## Current integration boundaries

- Browser authentication is session-cookie based. Optional inbound lead delivery uses revocable Subscriber-scoped bearer keys; there is no OAuth client-credentials flow.
- There are no webhooks, event callbacks, or guaranteed event delivery. Poll the authorized read endpoints if you need synchronization.
- No cross-origin browser CORS policy is enabled.
- API routes are not yet version-prefixed. Coordinate upgrades and test clients against a staging CRM before upgrading production.
- No public direct-database integration is supported. Use the API to retain workspace/member access checks.
