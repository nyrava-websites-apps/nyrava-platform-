using System.Text.RegularExpressions;

namespace NyravaCRM;

public static class GeographicService
{
    private static readonly HashSet<string> ValidStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Active", "FreeOrTrial", "PaymentPending", "PastDue", "Canceled", "Expired", "Suspended"
    };

    public static string StandardizeCountry(string? country)
    {
        if (string.IsNullOrWhiteSpace(country)) return "US";
        var c = country.Trim().ToUpperInvariant();
        return c switch
        {
            "USA" or "UNITED STATES" or "U.S." or "U.S.A." => "US",
            "CANADA" or "CAN" => "CA",
            "MEXICO" or "MEX" or "MÉXICO" => "MX",
            _ => c
        };
    }

    public static bool IsCountrySupported(string? country)
    {
        var std = StandardizeCountry(country);
        return std is "US" or "CA" or "MX";
    }

    public static bool ValidatePostalCode(string? country, string? postalCode)
    {
        if (string.IsNullOrWhiteSpace(postalCode)) return false;
        var p = postalCode.Trim();
        var stdCountry = StandardizeCountry(country);

        return stdCountry switch
        {
            "US" => Regex.IsMatch(p, @"^\d{5}(?:-\d{4})?$"),
            "CA" => Regex.IsMatch(p, @"^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$"),
            "MX" => Regex.IsMatch(p, @"^\d{5}$"),
            _ => false
        };
    }

    public static PricingQuote GetPricing(string? country, string? postalCode, string? plan = "monthly")
    {
        var stdCountry = StandardizeCountry(country);
        if (!IsCountrySupported(stdCountry))
        {
            return new PricingQuote(
                Eligible: false,
                Message: $"Nyrava subscriptions are not currently available in {stdCountry}. Contact Nyrava for market expansion.",
                Price: 0m,
                Currency: "USD",
                BillingFrequency: "Monthly",
                EstimatedTax: 0m,
                AutoRenews: false
            );
        }

        if (!string.IsNullOrWhiteSpace(postalCode) && !ValidatePostalCode(stdCountry, postalCode))
        {
            return new PricingQuote(
                Eligible: false,
                Message: $"Invalid postal code format for {stdCountry}.",
                Price: 0m,
                Currency: "USD",
                BillingFrequency: "Monthly",
                EstimatedTax: 0m,
                AutoRenews: false
            );
        }

        // Standardized Nyrava Intelligence Pricing Rules ($299 / month)
        var isAnnual = plan?.Equals("annual", StringComparison.OrdinalIgnoreCase) == true;
        var price = isAnnual ? 2990.00m : 299.00m;
        var frequency = isAnnual ? "Annual" : "Monthly";

        return new PricingQuote(
            Eligible: true,
            Message: "Region eligible for Nyrava Realtor Lead CRM.",
            Price: price,
            Currency: "USD",
            BillingFrequency: frequency,
            EstimatedTax: 0m,
            AutoRenews: true
        );
    }

    public static bool IsLeadDeliveryPermitted(CrmUser realtor, DateTimeOffset? now = null)
    {
        return IsLeadDeliveryPermitted(
            realtor.SubscriptionStatus,
            realtor.SubscriptionEntitlementVerifiedAt,
            realtor.SubscriptionCurrentPeriodEnd,
            now);
    }

    public static bool IsLeadDeliveryPermitted(
        string? status,
        DateTimeOffset? entitlementVerifiedAt,
        DateTimeOffset? currentPeriodEnd,
        DateTimeOffset? now = null)
    {
        var entitlementVerified = entitlementVerifiedAt is not null;
        var periodOpen = currentPeriodEnd is null || currentPeriodEnd > (now ?? DateTimeOffset.UtcNow);
        return entitlementVerified && periodOpen &&
            (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(status, "FreeOrTrial", StringComparison.OrdinalIgnoreCase));
    }

    public static bool MatchesZipCoverage(CrmUser realtor, string propertyZipCode)
    {
        if (!IsLeadDeliveryPermitted(realtor)) return false;

        return HasSubscribedZip(realtor.SubscribedZipCodes, propertyZipCode);
    }

    public static bool HasSubscribedZip(string? subscribedZipCodes, string propertyZipCode)
    {
        if (string.IsNullOrWhiteSpace(subscribedZipCodes) || string.IsNullOrWhiteSpace(propertyZipCode)) return false;

        var cleanTargetZip = propertyZipCode.Trim();
        if (cleanTargetZip.Length > 5) cleanTargetZip = cleanTargetZip[..5];

        // Mailing ZIP does not independently grant lead territory coverage.
        // Only explicitly subscribed ZIP codes receive leads.
        var zipTokens = subscribedZipCodes
            .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(z => z.Trim().Length > 5 ? z.Trim()[..5] : z.Trim());

        return zipTokens.Any(z => string.Equals(z, cleanTargetZip, StringComparison.OrdinalIgnoreCase));
    }
}

public sealed record PricingQuote(
    bool Eligible,
    string Message,
    decimal Price,
    string Currency,
    string BillingFrequency,
    decimal EstimatedTax,
    bool AutoRenews
);
