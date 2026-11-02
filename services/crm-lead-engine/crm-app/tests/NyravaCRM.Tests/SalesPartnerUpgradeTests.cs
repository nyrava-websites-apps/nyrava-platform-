using System.ComponentModel.DataAnnotations;
using NyravaCRM.SalesPartners;
using Xunit;
namespace NyravaCRM.Tests;
public sealed class SalesPartnerUpgradeTests
{
    private static readonly CompensationVersion Rules=new(1,DateTimeOffset.UnixEpoch);
    private static readonly PaidBillingPeriod Period=new("sub_1",new DateTimeOffset(2026,2,1,0,0,0,TimeSpan.Zero),new DateTimeOffset(2026,3,1,0,0,0,TimeSpan.Zero),"BASIC","USD",true,8900);
    [Fact] public void Half_paid_upgrade_adds_two_fifty_to_five_dollars()
    {Assert.Equal(250,PaidUpgradeResidual.Additional(Rules,Period,Period.Start.AddDays(14),Period.End,"BASIC","PRO",true,3000,500));}
    [Fact] public void Uses_actual_twenty_eight_day_period()
    {Assert.Equal(375,PaidUpgradeResidual.Additional(Rules,Period,Period.Start.AddDays(7),Period.End,"BASIC","PRO",true,4500,500));}
    [Fact] public void Failed_payment_and_downgrade_do_not_generate_extra_residual()
    {
        Assert.Equal(0,PaidUpgradeResidual.Additional(Rules,Period,Period.Start,Period.End,"BASIC","PRO",false,6000,500));
        Assert.Equal(0,PaidUpgradeResidual.Additional(Rules,Period,Period.Start,Period.End,"PRO","BASIC",true,6000,500));
    }
    [Fact] public void Period_total_cannot_exceed_ten_dollars()
    {Assert.Equal(100,PaidUpgradeResidual.Additional(Rules,Period,Period.Start,Period.End,"BASIC","PRO",true,6000,900));}
    [Fact] public void Administrator_can_version_proration_and_cap_rules()
    {
        Assert.Equal(0,PaidUpgradeResidual.Additional(Rules with{PaidUpgradeProrationEnabled=false},Period,Period.Start,Period.End,"BASIC","PRO",true,6000,500));
        Assert.Equal(200,PaidUpgradeResidual.Additional(Rules with{PeriodResidualCap=700},Period,Period.Start,Period.End,"BASIC","PRO",true,6000,500));
    }
    [Fact] public void Requires_a_paid_interval_inside_the_billing_period()
    {Assert.Throws<ValidationException>(()=>PaidUpgradeResidual.Additional(Rules,Period,Period.Start.AddDays(-1),Period.End,"BASIC","PRO",true,6000,500));}
    [Fact] public void Already_credited_paid_time_cannot_earn_another_upgrade_residual()
    {Assert.Equal(0,PaidUpgradeResidual.Additional(Rules,Period,Period.Start.AddDays(14),Period.End,"BASIC","PRO",true,3000,750,TimeSpan.FromDays(14).Ticks));}
    [Fact] public void Retry_key_is_stable_for_the_same_invoice_line()
    {Assert.Equal(PaidUpgradeResidual.InvoiceLineKey(Period,"il_1"),PaidUpgradeResidual.InvoiceLineKey(Period with{Plan="PRO"},"il_1"));}
}
