using System.ComponentModel.DataAnnotations;

namespace NyravaCRM.SalesPartners;

// All money is stored in integer minor units. Billing facts are supplied only by
// the validated Stripe adapter; browser-supplied prices are never accounting facts.
public sealed record CompensationVersion(long Id, DateTimeOffset EffectiveFrom,
    int FirstThreshold = 10, int SecondThreshold = 15,
    long FirstRate = 5000, long SecondRate = 7500, long FinalRate = 10000,
    long BasicResidual = 500, long ProResidual = 1000, string Currency = "USD",
    bool PaidUpgradeProrationEnabled = true, long PeriodResidualCap = 1000)
{
    public void Validate()
    {
        if (Id <= 0 || FirstThreshold < 1 || SecondThreshold < FirstThreshold ||
            new[] { FirstRate, SecondRate, FinalRate, BasicResidual, ProResidual, PeriodResidualCap }.Any(x => x < 0) ||
            Currency.Length != 3 || Currency != Currency.ToUpperInvariant())
            throw new ValidationException("Invalid versioned compensation plan.");
    }
    public long Upfront(int qualifyingOrdinal)
    {
        Validate();
        if (qualifyingOrdinal < 1) throw new ValidationException("A sale ordinal must be positive.");
        return qualifyingOrdinal <= FirstThreshold ? FirstRate : qualifyingOrdinal <= SecondThreshold ? SecondRate : FinalRate;
    }
    public long Residual(string plan)
    {
        Validate();
        return plan switch { "BASIC" => BasicResidual, "PRO" => ProResidual, _ => throw new ValidationException("Unknown subscription plan.") };
    }
}

public static class PartnerReferences
{
    public static string Representative(long id) => Format("REP", id);
    public static string Subscriber(long id) => Format("SUB", id);
    public static string Relationship(long id) => Format("REL", id);
    private static string Format(string kind, long id) => id > 0 ? $"NYR-{kind}-{id:D6}" : throw new ValidationException("Immutable key must be positive.");
}

public enum PayoutState { Draft, Review, Approved, Processing, Paid, Failed }
public static class PayoutWorkflow
{
    public static PayoutState Transition(PayoutState current, PayoutState next, bool administrator,
        string? confirmationReference = null)
    {
        if (!administrator) throw new UnauthorizedAccessException("Only authorized accounting administrators may change payout state.");
        var valid = (current, next) switch {
            (PayoutState.Draft, PayoutState.Review) => true,
            (PayoutState.Review, PayoutState.Draft or PayoutState.Approved) => true,
            (PayoutState.Approved, PayoutState.Processing) => true,
            (PayoutState.Processing, PayoutState.Paid or PayoutState.Failed) => true,
            (PayoutState.Failed, PayoutState.Review) => true,
            _ => false
        };
        if (!valid) throw new ValidationException("Invalid payout transition.");
        if (next == PayoutState.Paid && string.IsNullOrWhiteSpace(confirmationReference))
            throw new ValidationException("A verified payment confirmation is required; approval is not payment.");
        return next;
    }
}

public sealed record PaidBillingPeriod(string SubscriptionId, DateTimeOffset Start, DateTimeOffset End,
    string Plan, string Currency, bool Paid, long CashReceivedMinor);
public static class CommissionEligibility
{
    public static long Residual(PaidBillingPeriod period, CompensationVersion version, bool representativeActive)
    {
        version.Validate();
        if (string.IsNullOrWhiteSpace(period.SubscriptionId) || period.End <= period.Start)
            throw new ValidationException("A subscription and valid billing period are required.");
        if (period.Currency != version.Currency) throw new ValidationException("Currency conversion requires an explicit accounting policy.");
        if (!period.Paid || period.CashReceivedMinor <= 0 || !representativeActive) return 0;
        return Math.Min(version.Residual(period.Plan),version.PeriodResidualCap);
    }
    // Plan and invoice are deliberately absent: upgrades, duplicate invoices and
    // webhook redelivery cannot create another residual for the same paid period.
    public static string ResidualKey(PaidBillingPeriod period) =>
        $"residual:{period.SubscriptionId}:{period.Start.ToUnixTimeSeconds()}:{period.End.ToUnixTimeSeconds()}";
    public static string AcquisitionKey(long existingSubscriberId) => existingSubscriberId > 0
        ? $"acquisition:{existingSubscriberId}" : throw new ValidationException("Existing subscriber ID required.");
}


public static class PaidUpgradeResidual
{
    // Inputs must come from a validated paid invoice line, not from a browser.
    // Use actual provider period boundaries; never assume a 30-day month.
    public static long Additional(CompensationVersion version, PaidBillingPeriod period,
        DateTimeOffset paidUpgradeStart, DateTimeOffset paidUpgradeEnd,
        string previousPlan, string upgradedPlan, bool invoicePaid,
        long paidUpgradeMinor, long alreadyEarnedMinor, long alreadyCreditedOverlapTicks=0)
    {
        version.Validate();
        if(period.End<=period.Start || paidUpgradeStart<period.Start || paidUpgradeEnd>period.End ||
           paidUpgradeEnd<=paidUpgradeStart || alreadyEarnedMinor<0 || paidUpgradeMinor<0 || alreadyCreditedOverlapTicks<0 || alreadyCreditedOverlapTicks>(paidUpgradeEnd-paidUpgradeStart).Ticks)
            throw new ValidationException("Invalid paid upgrade period or ledger balance.");
        if(period.Currency!=version.Currency)throw new ValidationException("Currency mismatch.");
        var difference=version.Residual(upgradedPlan)-version.Residual(previousPlan);
        if(!version.PaidUpgradeProrationEnabled || !invoicePaid || paidUpgradeMinor==0 || difference<=0)return 0;
        var fraction=(decimal)((paidUpgradeEnd-paidUpgradeStart).Ticks-alreadyCreditedOverlapTicks)/(period.End-period.Start).Ticks;
        var additional=checked((long)decimal.Round(difference*fraction,0,MidpointRounding.AwayFromZero));
        return Math.Max(0,Math.Min(additional,version.PeriodResidualCap-alreadyEarnedMinor));
    }
    public static string InvoiceLineKey(PaidBillingPeriod period,string invoiceLineId)
    {
        if(string.IsNullOrWhiteSpace(invoiceLineId))throw new ValidationException("Provider invoice line ID required.");
        return CommissionEligibility.ResidualKey(period)+":upgrade:"+invoiceLineId;
    }
}
