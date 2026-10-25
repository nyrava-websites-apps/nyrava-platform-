# Nyrava Lead Engine

Private, ChatGPT-sign-in web app for finding and organizing U.S. FSBO signals. Rules can be adapted for other products, and useful discoveries are retained in a separate owner-scoped research library for future campaigns.

**Current source result:** Trellistate's free public API is the only automated source enabled in this release. Earlier bounded real checks read 8 residential records and produced **0 contact-qualified FSBO prospects**; the records went into research. The app has not demonstrated nationwide listing coverage or dependable contact volume. It never invents sample leads, and automated outreach is off.

## What it does

- Keeps campaigns separate, with an FSBO preset and editable custom product rules, intent phrases, exclusions, contact requirements, freshness windows, and optional five-digit U.S. ZIP codes. Blank ZIP selection means nationwide targeting only; it does not claim nationwide source coverage.
- Collects from one bounded page of Trellistate at a time. Results can be resumed. Requests are paced, capped, cached by a one-hour completed-run interval, and limited to 20 reserved requests per owner per UTC day. The source run requires up to seven requests and stops when published source instructions or access errors prevent the check.
- Stores every permitted discovery independently in the private `research_records` D1 table. The research archive is separate from active prospect qualification, is owner-scoped, persists across campaigns and rule edits, and is available for later requalification. Missing contacts, uncertain ownership, expired publication dates, and source-retired records stay visible in the research queue. Records are kept for future use until you remove them; platform retention and backups are controlled by the hosting provider.
- Separates explicit FSBO from possible seller-intent posts, requires an attributable owner/author contact for the prospect list, preserves source URLs, excerpts, property/ZIP, timestamps, evidence, and match reasons, deduplicates the library by source URL, and reports new versus refreshed items.
- Exports CSV for spreadsheet/CRM import and JSON with nested evidence. Imports accept up to 100 permitted records at a time and reapply campaign rules. A generic web URL is not JSON; use a valid JSON file or approved feed/data format.
- Marks published contact details **unverified** and contact permission **not established**. The app has no automated messaging and no direct CRM write integration.

## Start and configure

The hosted Site is private and uses Sites-managed Sign in with ChatGPT. No separate password, external OAuth app, API key, or CRM token is needed. Each account's campaigns, run history, quotas, and research records are isolated by the Site's stable authenticated user ID.

1. Open the private app and sign in with ChatGPT.
2. Create the FSBO campaign. Leave ZIPs blank to target U.S. locations broadly or enter ZIPs such as `00501, 78701` (leading zeroes are retained).
3. Use **Check public listings** and **Continue source search** for the bounded source pages. Collection is manual, not a promise of full-source traversal or complete U.S. coverage.
4. Review the prospects and the persistent research library separately. Open each source and assess its evidence yourself.
5. Export CSV for a platform's own import wizard, or JSON when source evidence and nested records are needed. Do not infer consent from a public contact.

To adapt the product, create another campaign and define the match phrases, exclusions, and contact rule. Campaign rules customize qualification; they do not grant new source access. The single live connector is FSBO-specific. Other-product data must come from permitted imports until a source has passed its access and live-data review.

## Sources and limitations

| Source | Status in this app |
|---|---|
| Trellistate public API | Connector enabled for bounded public active residential listings; earlier live checks returned 8 records and 0 contact-qualified FSBOs. Listings do not necessarily identify their owner. Recheck [source docs](https://trellistate.com/docs) and current access on each use. |
| Bluesky | Previous bounded public search returned HTTP 403. No live connector. |
| Zillow | Existing local parser work does not authorize automated access. No online connector. |
| Facebook/Meta, Instagram, LinkedIn | General seller-post access and suitable API permissions have not been established. No connectors. |
| Craigslist, FSBO.com, ForSaleByOwner.com | Applicable terms/access do not establish permitted automated collection for this use. No connectors. |
| JSON import | Enabled for records whose source you have permission to use. The app does not fetch arbitrary URLs. |

Sources can change their terms, APIs, fields, and availability. A public URL, robots allowance, published contact, or successful parser does not prove that automated use is allowed, the listing is accurate, ownership is established, or a person consented to contact. This app is intentionally not marketed as a complete or “perfect” nationwide lead feed.

## Architecture and development

- **Web UI:** React, Next-compatible Vinext, TypeScript, responsive workspace.
- **Authentication and hosting:** Sites-managed private audience and ChatGPT sign-in.
- **Persistence:** Cloudflare D1. Campaign data uses per-user ownership checks; `research_records` is a distinct source-level archive shared across that owner's campaigns.
- **Collector:** Fixed Trellistate hostname, HTTPS-only, no redirects, two-megabyte response cap, paced requests, bounded result count, robots path matching, per-user request budget, resumable cursor, single active collection lease, and no arbitrary remote URL fetching.
- **Extensibility:** Add a source only after confirming provider terms, documented API/feed access, published fields, rate limits, and a real bounded source check. Keep source adapters behind explicit host/path allowlists. Use `lib/leads.ts` for shared campaign qualification and evidence handling. Keep credentials in Sites runtime secrets only when a provider actually requires an approved credential.
- **Integration:** CSV and JSON are the supported portable interface today. They do not transmit data to another app. Direct CRM APIs, webhooks, scheduled jobs, and outreach need their own authorization, secret handling, user-selected target, and tests before activation.

### Local setup

**Visual Studio:** Install the **.NET 8 SDK** and **Node.js 22.13 or newer**. Download and extract the project ZIP, open `NyravaLeadEngine.sln` with **File → Open → Project or Solution**, and press **F5**. The solution's C# launcher installs web dependencies on its first run, starts the app, and opens the local sign-in page in your browser.

**Terminal:** Requirements are Node.js `>=22.13.0`, npm, and Git. Install dependencies with `npm run install:ci`. For a local browser preview, run `npm run dev`, then visit `http://localhost:5173/signin-with-chatgpt?return_to=/`; the starter's local sign-in is a development-only identity simulator. Production uses the managed sign-in boundary.

Run the tests with `node --test tests/*.test.mjs`. Run type checking with `node node_modules/typescript/bin/tsc --noEmit`. The normal `npm run build` command runs the framework build; Sites packaging uses its `scripts/build-site.mjs` helper. For local D1 migrations, use the Vinext starter's local D1 workflow and commit every generated schema migration. Hosted Sites applies migrations before deploying.

The tracked `.openai/hosting.json` contains the Sites project identity and D1 binding, not credentials. Keep `.env*`, `.dev.vars*`, `.wrangler/`, `.sites-runtime/`, collected records, exports, backups, and runtime credentials out of Git. Test with synthetic records only.

## License and third-party notices

This repository retains its existing `LICENSE.txt`. The project is proprietary and limited to internal Nyrava use under those terms; redistribution, external hosting, resale, and rights beyond the existing grant require written permission from Nyrava. The README does not replace or broaden the license. Review `LICENSE.txt` before copying or deploying. Third-party packages remain subject to their own licenses; see their package metadata and included upstream notices under `vendor/` and `scripts/`.

The public ZIP reference used by the earlier desktop prototype was GeoNames, licensed CC BY 4.0; it is a geography aid, not a lead dataset and not included as a cloud source. Attribution and its applicable dataset license must accompany any redistribution of that data.

## Current validation

- Local tests cover FSBO/contact evidence, conservative filtering, campaign customization, cross-user isolation, cross-source deduplication, persistent research retention and requalification, suppression, expired/stale records, source path restrictions, and ZIP rules.
- Fixture tests do not establish live source coverage. A previous bounded Trellistate check found zero qualified FSBO contacts.
- Read [SOURCES.md](docs/SOURCES.md) for the source review, [TEST-RESULTS.md](docs/TEST-RESULTS.md) for dated validation, and [LICENSE.txt](LICENSE.txt) for the controlling license.
