# Purchasing Nyrava CRM

## Current status

This private GitHub repository is for maintaining the source code. It is not a storefront and does not accept payments. No checkout, order record, license issuance, or automated delivery is connected yet. Buyers should not be added as GitHub collaborators; collaborators can access the source.

## Proposed price

- **USD $199** for each of the first 10 paid business licenses.
- **USD $299** per business after the first 10 paid licenses.
- Hosting, hands-on installation, data migration, and custom integrations are separate services.

The purchase is intended to be a one-time fee for a perpetual right to use the purchased version in that business. It does not allow resale, sublicensing, redistribution, or offering the CRM itself to unrelated businesses. See [Licensing and purchase model](LICENSING.md). Final customer terms still need legal review and customer acceptance.

## Recommended first-sales flow

1. Publish a public product page with the CRM description, features, requirements, demo information, price, license summary, and support boundaries. Do not expose the private repository.
2. Create a **one-time** Stripe Payment Link for the current offer and place its URL on the product page. Stripe describes Payment Links as shareable hosted checkout URLs and supports one-time payments. For the first ten purchases, track paid orders and switch the price to USD $299 after number ten.
3. Confirm successful payment in Stripe before issuing access or a download.
4. Send the customer the final accepted license terms and a versioned install package through a private download link. Do not send repository collaborator access.
5. Keep an order record containing the purchaser's legal business name, contact, payment reference, license version, and delivery date.

This is a manual fulfillment process. Later, a verified Stripe checkout webhook can trigger license issuance and secure package delivery, but that automation has not been built.

## Why not sell through this GitHub repository?

A normal GitHub repository has no product checkout or payment button. GitHub Marketplace accepts approved GitHub Apps and has its own listing and billing requirements; it is not a turnkey store for distributing this self-hosted CRM source package. Keep this repository private and use an external checkout for sales.
