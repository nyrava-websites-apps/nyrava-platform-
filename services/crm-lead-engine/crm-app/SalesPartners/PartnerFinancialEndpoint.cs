using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace NyravaCRM.SalesPartners;
public sealed record PartnerFinancialEnvelope(long OwnerId,string EventId,string Kind,string CustomerId,string SubscriptionId,
    string InvoiceId,string PaymentId,string Currency,long InvoicedMinor,long ReceivedMinor,DateTimeOffset EffectiveAt,PartnerInvoiceLine[] Lines,string? SourceEventHash=null,string? SubscriptionStatus=null,string? SubscriptionPlan=null,long? MonthlyRecurringMinor=null,DateTimeOffset? ObservedAt=null,long? KnownFeeMinor=null);
public sealed record PartnerInvoiceLine(string Id,string Kind,string Plan,long PaidMinor,DateTimeOffset Start,DateTimeOffset End,
    DateTimeOffset? OriginalStart=null,DateTimeOffset? OriginalEnd=null);
public static class PartnerFinancialEndpoint
{
    private static readonly SemaphoreSlim EventGate=new(1,1);
    private sealed class ReleaseGate:IDisposable {public void Dispose()=>EventGate.Release();}
    private static async Task<IDisposable> Acquire(){await EventGate.WaitAsync();return new ReleaseGate();}
    public static void MapPartnerFinancialEvents(this WebApplication app)
    {
        app.MapPost("/api/internal/sales-partners/billing",async(HttpContext http,SalesPartnerDb db,CrmDb crm,IConfiguration config,PartnerCommissionService service)=>{
            var secret=config["Crm:BillingSyncSecret"];if(secret is null||secret.Length<32)return Results.StatusCode(503);
            var stamp=http.Request.Headers["X-Nyrava-Timestamp"].ToString();
            if(!long.TryParse(stamp,out var timestamp)||Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds()-timestamp)>300)return Results.Unauthorized();
            using var reader=new StreamReader(http.Request.Body);var raw=await reader.ReadToEndAsync();if(raw.Length>200000)return Results.BadRequest();
            var expected=HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret),Encoding.UTF8.GetBytes(stamp+"."+raw));byte[] provided;
            try{provided=Convert.FromHexString(http.Request.Headers["X-Nyrava-Signature"].ToString());}catch{return Results.Unauthorized();}
            if(!CryptographicOperations.FixedTimeEquals(expected,provided))return Results.Unauthorized();
            PartnerFinancialEnvelope? input;try{input=JsonSerializer.Deserialize<PartnerFinancialEnvelope>(raw,new JsonSerializerOptions{PropertyNameCaseInsensitive=true});}catch{return Results.BadRequest();}
            if(input is null||input.EventId.Length==0||input.Currency!="USD"||input.Lines.Length>100)return Results.BadRequest();
            using var eventLease=await Acquire();
            var owner=await crm.Users.SingleOrDefaultAsync(x=>x.Id==input.OwnerId&&x.Role=="Owner");if(owner is null)return Results.BadRequest();
            if(owner.StripeCustomerId!=null&&owner.StripeCustomerId!=input.CustomerId)return Results.Conflict(new{error="Stripe customer mismatch."});
            var hash=input.SourceEventHash??Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
            if(hash.Length!=64)return Results.BadRequest();
            var seen=await db.Set<PartnerWebhookReceipt>().SingleOrDefaultAsync(x=>x.EventId==input.EventId);
            if(seen!=null)return seen.PayloadHash==hash?Results.Ok(new{duplicate=true}):Results.Conflict(new{error="Provider event payload mismatch."});
            var rootId=((input.Kind=="CashRefund"||input.Kind.StartsWith("CashDispute"))?input.PaymentId:input.Kind=="CashReceipt"?input.InvoiceId:input.EventId)+":cash";
            if(await db.BillingEvents.AnyAsync(x=>x.ProviderEventId==rootId))
            {
                db.Add(new PartnerWebhookReceipt{EventId=input.EventId,PayloadHash=hash,EffectiveAt=input.EffectiveAt,ReceivedAt=DateTimeOffset.UtcNow});await db.SaveChangesAsync();
                return Results.Ok(new{duplicatePayment=true});
            }
            var versions=await db.Set<PartnerCommissionVersion>().ToListAsync();var version=versions.Where(x=>x.EffectiveFrom<=input.EffectiveAt).OrderByDescending(x=>x.EffectiveFrom).FirstOrDefault();
            if(version is null)return Results.Conflict(new{error="No compensation version effective for event."});
            var hadRelationship=await db.Relationships.AnyAsync(x=>x.SubscriberUserId==owner.Id);
            foreach(var line in input.Lines)
            {
                var payment=new PartnerBillingEvent{ProviderEventId=input.EventId+":"+line.Id,SubscriberUserId=owner.Id,Kind=line.Kind,
                    InvoiceId=input.InvoiceId,PaymentId=input.PaymentId,SubscriptionId=input.SubscriptionId,Plan=line.Plan,Currency=input.Currency,
                    ReceivedMinor=line.PaidMinor,InvoicedMinor=0,EffectiveAt=input.EffectiveAt,ReceivedAt=DateTimeOffset.UtcNow,PeriodStart=line.Start,PeriodEnd=line.End};
                if(await db.BillingEvents.AnyAsync(x=>x.ProviderEventId==payment.ProviderEventId))continue;
                if(line.Kind=="AnnualLicensePaid")
                {
                    var referral=await db.Set<RepresentativeReferral>().SingleOrDefaultAsync(x=>x.SubscriberUserId==owner.Id);
                    if(referral!=null)await service.RecordAcquisitionAsync(payment,referral.RepresentativeId,version.Id,referral.RegisteredAt);
                }
                else if(line.Kind=="MonthlyPaymentPaid" && (hadRelationship || !input.Lines.Any(x=>x.Kind=="AnnualLicensePaid")) && await db.Relationships.AnyAsync(x=>x.SubscriberUserId==owner.Id))
                    await service.RecordResidualAsync(payment,versions.Where(x=>x.EffectiveFrom<=line.Start).OrderByDescending(x=>x.EffectiveFrom).First().Id);
                else if(line.Kind=="UpgradeProrationPaid" && line.OriginalStart!=null && line.OriginalEnd!=null && await db.Relationships.AnyAsync(x=>x.SubscriberUserId==owner.Id))
                    await service.RecordPaidUpgradeAsync(payment,new PaidBillingPeriod(input.SubscriptionId,line.OriginalStart.Value,line.OriginalEnd.Value,"BASIC",input.Currency,true,input.ReceivedMinor),line.Id,line.Start,line.End,"BASIC");
                if(!await db.BillingEvents.AnyAsync(x=>x.ProviderEventId==payment.ProviderEventId)){db.Add(payment);await db.SaveChangesAsync();}
            }
            db.BillingEvents.Add(new PartnerBillingEvent{ProviderEventId=rootId,SubscriberUserId=owner.Id,Kind=input.Kind,
                InvoiceId=input.InvoiceId,PaymentId=input.PaymentId,SubscriptionId=input.SubscriptionId,Currency=input.Currency,
                InvoicedMinor=input.InvoicedMinor,ReceivedMinor=input.ReceivedMinor,KnownFeeMinor=input.KnownFeeMinor,EffectiveAt=input.EffectiveAt,ReceivedAt=DateTimeOffset.UtcNow});
            if(input.Kind=="CashRefund"||input.Kind.StartsWith("Dispute:")||input.Kind.StartsWith("CashDispute"))
            {
                db.Add(new PartnerAuditEvent{ActorUserId=0,EntityType="BillingEvent",EntityId=0,Action="BillingExceptionReviewRequired",CreatedAt=DateTimeOffset.UtcNow,EvidenceJson=JsonSerializer.Serialize(new{input.EventId,input.InvoiceId,input.Kind})});
                var relation=await db.Relationships.SingleOrDefaultAsync(x=>x.SubscriberUserId==owner.Id);
                if(relation!=null){var ticket=new PartnerSupportTicket{RelationshipId=relation.Id,AssignedRepresentativeId=relation.SupportRepresentativeId,Subject="Billing review: "+input.Kind,Channel="InApp",CreatedAt=DateTimeOffset.UtcNow,DueAt=DateTimeOffset.UtcNow.AddDays(1)};db.Add(ticket);await db.SaveChangesAsync();db.Add(new PartnerTicketMessage{TicketId=ticket.Id,AuthorUserId=0,Body="Review provider event "+input.EventId+" for invoice "+input.InvoiceId+". Commission corrections require explicit administrator approval.",CreatedAt=DateTimeOffset.UtcNow});}
            }
            if(input.SubscriptionStatus!=null && input.ObservedAt!=null)
            {
                var snapshot=await db.Set<PartnerSubscriptionSnapshot>().SingleOrDefaultAsync(x=>x.SubscriptionId==input.SubscriptionId);
                if(snapshot==null){snapshot=new PartnerSubscriptionSnapshot{SubscriberUserId=owner.Id,SubscriptionId=input.SubscriptionId};db.Add(snapshot);}
                if(snapshot.ObservedAt<=input.ObservedAt){snapshot.Plan=input.SubscriptionPlan??"";snapshot.Status=input.SubscriptionStatus;snapshot.MonthlyRecurringMinor=input.MonthlyRecurringMinor;snapshot.Currency=input.Currency;snapshot.ObservedAt=input.ObservedAt.Value;}
            }
            db.Add(new PartnerWebhookReceipt{EventId=input.EventId,PayloadHash=hash,EffectiveAt=input.EffectiveAt,ReceivedAt=DateTimeOffset.UtcNow});
            await db.SaveChangesAsync();return Results.Ok(new{recorded=true});
        }).AllowAnonymous();
    }
}
