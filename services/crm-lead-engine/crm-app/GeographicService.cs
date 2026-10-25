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

    public static bool IsLeadDeliveryPermitted(string status)
    {
        // Only active or trial subscribers receive real-time homeowner leads
        return status.Equals("Active", StringComparison.OrdinalIgnoreCase) ||
               status.Equals("FreeOrTrial", StringComparison.OrdinalIgnoreCase);
    }

    public static bool MatchesZipCoverage(CrmUser realtor, string propertyZipCode)
    {
        if (!IsLeadDeliveryPermitted(realtor.SubscriptionStatus)) return false;

        var cleanTargetZip = propertyZipCode.Trim();
        if (cleanTargetZip.Length > 5) cleanTargetZip = cleanTargetZip[..5];

        // 1. Check primary registered postal code
        var primaryZip = realtor.PostalCode?.Trim() ?? "";
        if (primaryZip.Length > 5) primaryZip = primaryZip[..5];
        if (string.Equals(primaryZip, cleanTargetZip, StringComparison.OrdinalIgnoreCase)) return true;

        // 2. Check comma-separated subscribed ZIP codes
        if (!string.IsNullOrWhiteSpace(realtor.SubscribedZipCodes))
        {
            var zipTokens = realtor.SubscribedZipCodes
                .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(z => z.Trim().Length > 5 ? z.Trim()[..5] : z.Trim());

            if (zipTokens.Any(z => string.Equals(z, cleanTargetZip, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
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
