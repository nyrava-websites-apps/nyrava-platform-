namespace NyravaCRM;

public sealed record BillingState(string State, bool CheckoutEnabled, string? Error);

public static class BillingStateMapper
{
    public static BillingState ForPlatformAdmin() => new("EXEMPT", false, null);

    public static BillingState FromSubscription(
        string? status,
        DateTimeOffset? entitlementVerifiedAt,
        DateTimeOffset? currentPeriodEnd,
        DateTimeOffset now,
        bool nonBillingAccessAuthorized = false)
    {
        if (nonBillingAccessAuthorized)
            return new("AUTHORIZED_ACCESS", false, null);

        var value = status?.Trim();
        if (string.Equals(value, "Active", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "FreeOrTrial", StringComparison.OrdinalIgnoreCase))
        {
            if (entitlementVerifiedAt is null)
                return new("LEGACY_REVIEW", false, "Your existing workspace is available while subscription records are reviewed. Do not pay again during this review.");
            if (currentPeriodEnd is not null && currentPeriodEnd <= now)
                return new("EXPIRED", true, null);
            return new("ACTIVE", false, null);
        }

        if (string.Equals(value, "Canceled", StringComparison.OrdinalIgnoreCase))
        {
            if (entitlementVerifiedAt is null)
                return new("LEGACY_REVIEW", false, "Your existing workspace is available while subscription records are reviewed. Do not pay again during this review.");
            return currentPeriodEnd is not null && currentPeriodEnd > now
                ? new("ENDING", false, null)
                : new("EXPIRED", true, null);
        }

        if (string.Equals(value, "Expired", StringComparison.OrdinalIgnoreCase))
            return entitlementVerifiedAt is null
                ? new("LEGACY_REVIEW", false, "Your existing workspace is available while subscription records are reviewed. Do not pay again during this review.")
                : new("EXPIRED", true, null);
        if (string.Equals(value, "PastDue", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "Suspended", StringComparison.OrdinalIgnoreCase))
            return new("PAYMENT_REQUIRED", false, "Payment needs attention. Update your payment method to restore your subscription.");
        if (string.Equals(value, "PaymentPending", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "Pending", StringComparison.OrdinalIgnoreCase))
            return new("PENDING", true, null);
        if (string.IsNullOrWhiteSpace(value) ||
            string.Equals(value, "Inactive", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "NotEnrolled", StringComparison.OrdinalIgnoreCase))
            return new("NOT_ENROLLED", true, null);

        return new("SETUP_PENDING", false, "Your subscription status could not be verified. Please contact support before making another payment.");
    }
}
