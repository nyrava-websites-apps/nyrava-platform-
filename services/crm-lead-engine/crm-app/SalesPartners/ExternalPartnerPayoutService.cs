using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
namespace NyravaCRM.SalesPartners;

public sealed class ExternalPartnerPayoutService(SalesPartnerDb db)
{
    public async Task ConfirmAsync(long batchId,long administratorUserId,string paymentReference,
        DateTimeOffset actuallyPaidAt,bool authorizedAccountingAdmin,CancellationToken token=default)
    {
        if(!authorizedAccountingAdmin || administratorUserId<=0)throw new UnauthorizedAccessException();
        paymentReference=paymentReference.Trim();
        if(paymentReference.Length<3 || paymentReference.Length>200 || actuallyPaidAt>DateTimeOffset.UtcNow)
            throw new ValidationException("A valid external payment reference and actual payment date are required.");
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,token);
        var batch=await db.PayoutBatches.SingleAsync(x=>x.Id==batchId,token);
        if(batch.State==PayoutState.Paid)
        {
            if(batch.ProviderConfirmation==paymentReference)return;
            throw new ValidationException("Paid batch cannot be overwritten.");
        }
        if(await db.PayoutBatches.AnyAsync(x=>x.ProviderConfirmation==paymentReference,token))
            throw new ValidationException("Payment reference already used.");
        batch.State=PayoutWorkflow.Transition(batch.State,PayoutState.Paid,true,paymentReference);
        batch.ProviderConfirmation=paymentReference;batch.ConfirmedAt=actuallyPaidAt;
        db.Add(new PartnerAuditEvent{ActorUserId=administratorUserId,EntityType="PayoutBatch",EntityId=batchId,
            Action="ExternalPaymentConfirmed",EvidenceJson=System.Text.Json.JsonSerializer.Serialize(new{paymentReference,actuallyPaidAt}),CreatedAt=DateTimeOffset.UtcNow});
        await db.SaveChangesAsync(token);await tx.CommitAsync(token);
    }
}
