# Source access review

Checked for the desktop source release on 21 October 2026. Treat these as research notes, not legal advice or perpetual permissions. Recheck the official policy and live API before each source connector update.

| Source | Evidence checked | Online app decision |
|---|---|---|
| Trellistate | [API docs](https://trellistate.com/docs), [agents.txt](https://trellistate.com/agents.txt), and [API manifest](https://trellistate.com/.well-known/trellistate.json). Earlier bounded check successfully read public API robots, search, and detail paths. | Only live source enabled. Search yields active listings that do not necessarily identify owner/author. Prior check: 8 residential records, 0 contact-qualified FSBO opportunities. |
| Bluesky | [API directory](https://bsky.network/docs/api-directory/), [developer guidelines](https://bsky.network/docs/developer-guidelines/), [rate limits](https://bsky.network/docs/rate-limits/). Previous direct public search returned HTTP 403. | No working live connection; do not call its fixture parser a connector. |
| Zillow | [Terms](https://www.zillow.com/corporate/terms-of-use/). Local legacy owner-phone parser exists; automated use is not authorized by fixture success. | No online collection. |
| Facebook / Meta | [Page Public Content Access](https://developers.facebook.com/docs/features-reference/page-public-content-access/) and Meta's automated collection restrictions. Prior documentation read was limited by HTTP 429 and terms route required login. | Required access, permission, and fields not established; no connector. |
| Instagram | [Hashtag search documentation](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search/). Required approval and fields for the intended general use were not validated. | No connector. |
| LinkedIn | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api). Post reads require restricted member/product access or role-limited organization permissions. | No approved broad public seller search established; no connector. |
| Craigslist | [Terms](https://www.craigslist.org/about/terms.of.use/en) restrict automated software interactions and collection without separate authorization. | Excluded absent appropriate written access. |
| ForSaleByOwner.com | [Terms](https://www.forsalebyowner.com/real-estate-help/support/about-us/terms-and-conditions/terms-conditions) say automated scraping/copying requires permission. | No permission, no connector. |
| FSBO.com | Public site and available terms did not establish an authorized usable collection API/feed. | No connector. |
| User-provided JSON | Import schema validates URLs, evidence, geography, contact attribution, freshness, and campaign rules. No network fetch from arbitrary URLs. | Enabled only when the user has permission to use the source records. |

See the archived desktop results in the original project outputs for primary reference URLs and its actual two-page measurement. The online application performs manual bounded runs and reports each real outcome. It does not fabricate records, infer consent, bypass logins or anti-bot controls, or promise every ZIP/owner. Paid sources are excluded by instruction.

