using Xunit;

namespace NyravaCRM.Tests;

public sealed class BillingStateMapperTests
{
    [Fact]
    public void Unverified_legacy_active_status_does_not_grant_active_billing_state()
    {
        var state = BillingStateMapper.FromSubscription("Active", null, null, DateTimeOffset.UtcNow);

        Assert.Equal("SETUP_PENDING", state.State);
        Assert.False(state.CheckoutEnabled);
        Assert.Contains("before making another payment", state.Error);
    }

    [Theory]
    [InlineData("PastDue", "PAYMENT_REQUIRED")]
    [InlineData("Suspended", "PAYMENT_REQUIRED")]
    [InlineData("Expired", "EXPIRED")]
    [InlineData("PaymentPending", "PENDING")]
    [InlineData("NotEnrolled", "NOT_ENROLLED")]
    public void Nonactive_subscription_states_map_without_granting_entitlement(string status, string expected)
    {
        var state = BillingStateMapper.FromSubscription(status, null, null, DateTimeOffset.UtcNow);

        Assert.Equal(expected, state.State);
    }

    [Fact]
    public void Unverified_canceled_subscription_waits_for_reconciliation()
    {
        var state = BillingStateMapper.FromSubscription("Canceled", null, null, DateTimeOffset.UtcNow);

        Assert.Equal("SETUP_PENDING", state.State);
        Assert.False(state.CheckoutEnabled);
    }

    [Fact]
    public void Verified_cancellation_preserves_access_only_until_the_recorded_period_end()
    {
        var now = DateTimeOffset.UtcNow;
        var state = BillingStateMapper.FromSubscription("Canceled", now.AddDays(-20), now.AddDays(10), now);

        Assert.Equal("ENDING", state.State);
        Assert.False(state.CheckoutEnabled);
    }

    [Fact]
    public void Verified_cancellation_becomes_expired_after_the_recorded_period_end()
    {
        var now = DateTimeOffset.UtcNow;
        var state = BillingStateMapper.FromSubscription("Canceled", now.AddDays(-40), now.AddDays(-1), now);

        Assert.Equal("EXPIRED", state.State);
        Assert.True(state.CheckoutEnabled);
    }
}
