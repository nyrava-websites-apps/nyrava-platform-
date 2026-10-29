namespace NyravaCRM;

public sealed record BillingState(string State, bool CheckoutEnabled, string? Error);

public static class BillingStateMapper
{
    public static BillingState FromSubscription(
        string? status,
        DateTimeOffset? entitlementVerifiedAt,
        DateTimeOffset? currentPeriodEnd,
        DateTimeOffset now)
    {
        var value = status?.Trim();
        if (string.Equals(value, "Active", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "FreeOrTrial", StringComparison.OrdinalIgnoreCase))
        {
            if (entitlementVerifiedAt is null)
                return new("SETUP_PENDING", false, "Your subscription is being verified. Please contact support before making another payment.");
            if (currentPeriodEnd is not null && currentPeriodEnd <= now)
                return new("EXPIRED", true, null);
            return new("ACTIVE", false, null);
        }

        if (string.Equals(value, "Canceled", StringComparison.OrdinalIgnoreCase))
        {
            if (entitlementVerifiedAt is null)
                return new("SETUP_PENDING", false, "Your subscription is being verified. Please contact support before making another payment.");
            return currentPeriodEnd is not null && currentPeriodEnd > now
                ? new("ENDING", false, null)
                : new("EXPIRED", true, null);
        }

        if (string.Equals(value, "Expired", StringComparison.OrdinalIgnoreCase))
            return new("EXPIRED", true, null);
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
