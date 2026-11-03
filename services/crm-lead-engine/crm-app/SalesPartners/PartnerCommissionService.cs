using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
namespace NyravaCRM.SalesPartners;

// Called only after the existing billing adapter verifies provider signatures and
// resolves the subscriber from trusted Stripe metadata. No public HTTP endpoint.
public sealed class PartnerCommissionService(SalesPartnerDb db)
{
    public async Task<CommissionEntry?> RecordAcquisitionAsync(PartnerBillingEvent payment,long representativeId,
        long compensationVersionId,DateTimeOffset registeredAt,CancellationToken token=default)
    {
        if(payment.Kind!="AnnualLicensePaid" || payment.ReceivedMinor<=0 || string.IsNullOrWhiteSpace(payment.PaymentId) || string.IsNullOrWhiteSpace(payment.InvoiceId))
            throw new ValidationException("A confirmed qualifying annual license payment is required.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,token);
        var key=CommissionEligibility.AcquisitionKey(payment.SubscriberUserId);
        if(await db.Ledger.AnyAsync(x=>x.IdempotencyKey==key,token)||await db.Relationships.AnyAsync(x=>x.SubscriberUserId==payment.SubscriberUserId,token))return null;
        var rep=await db.Representatives.SingleAsync(x=>x.Id==representativeId,token);
        var representativeEligible=rep.Active&&rep.Status=="Active";
        var version=await db.Set<PartnerCommissionVersion>().SingleAsync(x=>x.Id==compensationVersionId,token);
        var rules=JsonSerializer.Deserialize<CompensationVersion>(version.RulesJson) ?? throw new ValidationException("Compensation rules missing.");
        if(rules.Id!=version.Id || version.EffectiveFrom>payment.EffectiveAt)throw new ValidationException("Compensation version is not effective.");
        rules.Validate();if(payment.Currency!=rules.Currency)throw new ValidationException("Currency mismatch.");
        rules.Residual(payment.Plan); // Reject unknown plans before any ledger writes.
        var ordinal=await db.Ledger.CountAsync(x=>x.RepresentativeId==representativeId && x.Kind=="Upfront",token)+1;
        db.BillingEvents.Add(payment);await db.SaveChangesAsync(token);
        var relationship=new SubscriberRelationship{SubscriberUserId=payment.SubscriberUserId,AcquiringRepresentativeId=representativeId,
            SupportRepresentativeId=representativeId,ResidualRepresentativeId=representativeId,AcquisitionBillingEventId=payment.Id,
            OriginalCompensationVersionId=version.Id,OriginalPlan=payment.Plan,RegisteredAt=registeredAt,AcquiredAt=payment.EffectiveAt,ResidualEligibleFrom=payment.EffectiveAt};
        db.Relationships.Add(relationship);await db.SaveChangesAsync(token);
        if(!representativeEligible)
        {
            db.Add(new PartnerAuditEvent{ActorUserId=0,EntityType="Relationship",EntityId=relationship.Id,Action="InactiveRepresentativeAcquisitionReview",EvidenceJson=JsonSerializer.Serialize(new{representativeId,subscriberId=payment.SubscriberUserId}),CreatedAt=DateTimeOffset.UtcNow});
            await db.SaveChangesAsync(token);await tx.CommitAsync(token);return null;
        }
        var entry=new CommissionEntry{IdempotencyKey=key,RelationshipId=relationship.Id,RepresentativeId=representativeId,
            BillingEventId=payment.Id,CompensationVersionId=version.Id,Kind="Upfront",AmountMinor=rules.Upfront(ordinal),
            Currency=payment.Currency,EarnedAt=payment.EffectiveAt,QualifyingSaleOrdinal=ordinal};
        db.Ledger.Add(entry);await db.SaveChangesAsync(token);await tx.CommitAsync(token);return entry;
    }
    public async Task<CommissionEntry?> RecordResidualAsync(PartnerBillingEvent payment,long compensationVersionId,CancellationToken token=default)
    {
        if(payment.Kind!="MonthlyPaymentPaid" || payment.PeriodStart is null || payment.PeriodEnd is null ||
           string.IsNullOrWhiteSpace(payment.InvoiceId) || string.IsNullOrWhiteSpace(payment.PaymentId))
            throw new ValidationException("Confirmed monthly invoice and billing period required.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,token);
        var relationship=await db.Relationships.SingleAsync(x=>x.SubscriberUserId==payment.SubscriberUserId,token);
        if(payment.PeriodStart<relationship.ResidualEligibleFrom)return null;
        var changes=await db.Set<SubscriberOwnershipChange>().Where(x=>x.RelationshipId==relationship.Id&&x.ChangesResidualOwnership).ToListAsync(token);
        var residualOwner=changes.Where(x=>x.EffectiveAt<=payment.PeriodStart).OrderByDescending(x=>x.EffectiveAt).FirstOrDefault()?.NewRepresentativeId ?? relationship.ResidualRepresentativeId;
        var rep=await db.Representatives.SingleAsync(x=>x.Id==residualOwner,token);
        var version=await db.Set<PartnerCommissionVersion>().SingleAsync(x=>x.Id==compensationVersionId,token);
        var rules=JsonSerializer.Deserialize<CompensationVersion>(version.RulesJson) ?? throw new ValidationException("Rules missing.");
        if(rules.Id!=version.Id || version.EffectiveFrom>payment.PeriodStart)throw new ValidationException("Compensation version is not effective for the period.");
        var period=new PaidBillingPeriod(payment.SubscriptionId,payment.PeriodStart.Value,payment.PeriodEnd.Value,payment.Plan,payment.Currency,true,payment.ReceivedMinor);
        var key=CommissionEligibility.ResidualKey(period);
        if(await db.Ledger.AnyAsync(x=>x.IdempotencyKey==key,token))return null;
        var amount=CommissionEligibility.Residual(period,rules,rep.Active);
        db.BillingEvents.Add(payment);await db.SaveChangesAsync(token);
        if(amount==0){await tx.CommitAsync(token);return null;}
        var entry=new CommissionEntry{IdempotencyKey=key,RelationshipId=relationship.Id,RepresentativeId=rep.Id,BillingEventId=payment.Id,
            CompensationVersionId=version.Id,Kind="Residual",AmountMinor=amount,Currency=payment.Currency,EarnedAt=payment.EffectiveAt};
        db.Ledger.Add(entry);await db.SaveChangesAsync(token);await tx.CommitAsync(token);return entry;
    }
    public async Task<CommissionEntry?> RecordPaidUpgradeAsync(PartnerBillingEvent payment,
        PaidBillingPeriod originalPeriod,string invoiceLineId,DateTimeOffset paidStart,DateTimeOffset paidEnd,
        string previousPlan,CancellationToken token=default)
    {
        if(payment.Kind!="UpgradeProrationPaid" || payment.ReceivedMinor<=0 ||
            string.IsNullOrWhiteSpace(payment.PaymentId) || string.IsNullOrWhiteSpace(payment.InvoiceId) ||
            payment.SubscriptionId!=originalPeriod.SubscriptionId || payment.Currency!=originalPeriod.Currency)
            throw new ValidationException("A confirmed paid upgrade invoice line is required.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,token);
        var key=PaidUpgradeResidual.InvoiceLineKey(originalPeriod,invoiceLineId);
        if(await db.Ledger.AnyAsync(x=>x.IdempotencyKey==key,token))return null;
        var relationship=await db.Relationships.SingleAsync(x=>x.SubscriberUserId==payment.SubscriberUserId,token);
        if(originalPeriod.Start<relationship.ResidualEligibleFrom)return null;
        var periodKey=CommissionEligibility.ResidualKey(originalPeriod);
        var entries=await db.Ledger.Where(x=>x.RelationshipId==relationship.Id &&
            (x.IdempotencyKey==periodKey || x.IdempotencyKey.StartsWith(periodKey+":upgrade:"))).ToListAsync(token);
        var original=entries.SingleOrDefault(x=>x.IdempotencyKey==periodKey)
            ?? throw new ValidationException("Original paid-period residual must be reconciled first.");
        var version=await db.Set<PartnerCommissionVersion>().SingleAsync(x=>x.Id==original.CompensationVersionId,token);
        var rules=JsonSerializer.Deserialize<CompensationVersion>(version.RulesJson) ?? throw new ValidationException("Rules missing.");
        var rep=await db.Representatives.SingleAsync(x=>x.Id==original.RepresentativeId,token);
        var creditedEventIds=entries.Where(x=>x.Kind=="ResidualUpgrade").Select(x=>x.BillingEventId).ToArray();
        var credited=await db.BillingEvents.Where(x=>creditedEventIds.Contains(x.Id)).ToListAsync(token);
        var intervals=credited.Where(x=>x.PeriodStart!=null&&x.PeriodEnd!=null)
            .Select(x=>(Start:x.PeriodStart!.Value>paidStart?x.PeriodStart.Value:paidStart,End:x.PeriodEnd!.Value<paidEnd?x.PeriodEnd.Value:paidEnd))
            .Where(x=>x.End>x.Start).OrderBy(x=>x.Start).ToList();
        long covered=0;DateTimeOffset? cursor=null;
        foreach(var interval in intervals)
        {
            var begin=cursor!=null&&cursor.Value>interval.Start?cursor.Value:interval.Start;
            if(interval.End>begin)covered+=(interval.End-begin).Ticks;
            if(cursor==null||interval.End>cursor.Value)cursor=interval.End;
        }
        var amount=rep.Active ? PaidUpgradeResidual.Additional(rules,originalPeriod,paidStart,paidEnd,
            previousPlan,payment.Plan,true,payment.ReceivedMinor,entries.Sum(x=>x.AmountMinor),covered) : 0;
        db.BillingEvents.Add(payment);await db.SaveChangesAsync(token);
        if(amount==0){await tx.CommitAsync(token);return null;}
        var entry=new CommissionEntry{IdempotencyKey=key,RelationshipId=relationship.Id,RepresentativeId=original.RepresentativeId,
            BillingEventId=payment.Id,CompensationVersionId=version.Id,Kind="ResidualUpgrade",AmountMinor=amount,
            Currency=payment.Currency,EarnedAt=payment.EffectiveAt};
        db.Ledger.Add(entry);await db.SaveChangesAsync(token);await tx.CommitAsync(token);return entry;
    }

}
