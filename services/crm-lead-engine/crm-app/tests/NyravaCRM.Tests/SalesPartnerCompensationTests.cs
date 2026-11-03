using System.ComponentModel.DataAnnotations;
using NyravaCRM.SalesPartners;
using Xunit;
namespace NyravaCRM.Tests;
public sealed class SalesPartnerCompensationTests
{
    private static readonly CompensationVersion Version = new(1, DateTimeOffset.UnixEpoch);
    [Theory]
    [InlineData(1,5000)] [InlineData(10,5000)] [InlineData(11,7500)]
    [InlineData(15,7500)] [InlineData(16,10000)] [InlineData(100,10000)]
    public void Tiers_are_cumulative_and_not_retroactive(int ordinal, long expected) => Assert.Equal(expected, Version.Upfront(ordinal));
    [Fact]
    public void Fifteen_sales_total_eight_hundred_seventy_five_dollars() =>
        Assert.Equal(87500, Enumerable.Range(1,15).Sum(Version.Upfront));
    [Theory]
    [InlineData("BASIC",500)] [InlineData("PRO",1000)]
    public void Paid_period_uses_actual_plan(string plan,long expected) => Assert.Equal(expected,CommissionEligibility.Residual(Period(plan),Version,true));
    [Fact]
    public void Failed_unpaid_and_inactive_periods_earn_nothing()
    {
        Assert.Equal(0,CommissionEligibility.Residual(Period("BASIC") with {Paid=false},Version,true));
        Assert.Equal(0,CommissionEligibility.Residual(Period("PRO") with {CashReceivedMinor=0},Version,true));
        Assert.Equal(0,CommissionEligibility.Residual(Period("PRO"),Version,false));
    }
    [Fact]
    public void Upgrade_cannot_change_period_idempotency_key() =>
        Assert.Equal(CommissionEligibility.ResidualKey(Period("BASIC")),CommissionEligibility.ResidualKey(Period("PRO")));
    [Fact]
    public void Subscriber_acquisition_key_does_not_depend_on_checkout_or_renewal() => Assert.Equal("acquisition:42",CommissionEligibility.AcquisitionKey(42));
    [Fact]
    public void References_preserve_existing_immutable_ids()
    {
        Assert.Equal("NYR-REP-000001",PartnerReferences.Representative(1));
        Assert.Equal("NYR-SUB-000042",PartnerReferences.Subscriber(42));
        Assert.Equal("NYR-REL-1000000",PartnerReferences.Relationship(1000000));
        Assert.Throws<ValidationException>(()=>PartnerReferences.Subscriber(0));
    }
    [Fact]
    public void Approval_does_not_mark_a_payout_paid()
    {
        Assert.Equal(PayoutState.Approved,PayoutWorkflow.Transition(PayoutState.Review,PayoutState.Approved,true));
        Assert.Throws<ValidationException>(()=>PayoutWorkflow.Transition(PayoutState.Approved,PayoutState.Paid,true,"ref"));
        Assert.Throws<ValidationException>(()=>PayoutWorkflow.Transition(PayoutState.Processing,PayoutState.Paid,true));
        Assert.Equal(PayoutState.Paid,PayoutWorkflow.Transition(PayoutState.Processing,PayoutState.Paid,true,"confirmed-1"));
        Assert.Throws<ValidationException>(()=>PayoutWorkflow.Transition(PayoutState.Paid,PayoutState.Paid,true,"confirmed-1"));
    }
    [Fact]
    public void Contractors_cannot_approve_their_own_payments() =>
        Assert.Throws<UnauthorizedAccessException>(()=>PayoutWorkflow.Transition(PayoutState.Review,PayoutState.Approved,false));
    [Fact]
    public void Invalid_compensation_versions_and_currency_mismatch_are_rejected()
    {
        Assert.Throws<ValidationException>(()=>(Version with {BasicResidual=-1}).Validate());
        Assert.Throws<ValidationException>(()=>Version.Upfront(0));
        Assert.Throws<ValidationException>(()=>Version.Residual("UNKNOWN"));
        Assert.Throws<ValidationException>(()=>CommissionEligibility.Residual(Period("BASIC") with {Currency="MXN"},Version,true));
    }
    private static PaidBillingPeriod Period(string plan) => new("sub_test",DateTimeOffset.UnixEpoch,DateTimeOffset.UnixEpoch.AddMonths(1),plan,"USD",true,8900);
}

