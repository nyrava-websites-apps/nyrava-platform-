using Microsoft.EntityFrameworkCore;
using System.Text.Json;
namespace NyravaCRM.SalesPartners;
public static partial class PartnerEndpoints
{
    private static void MapCommunications(RouteGroupBuilder group)
    {
        group.MapPost("/relationships/{id:long}/residual-owner",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();var relation=await db.Relationships.FindAsync(id);if(relation is null)return Results.NotFound();
            var repId=Number(input,"representativeId");var reason=Text(input,"reason");
            if(reason.Length<3||!DateTimeOffset.TryParse(Text(input,"effectiveAt",100),out var effective)||effective<DateTimeOffset.UtcNow||!await db.Representatives.AnyAsync(x=>x.Id==repId&&x.Active))return Results.BadRequest(new{error="Active representative, future effective date and reason are required."});
            db.Add(new SubscriberOwnershipChange{RelationshipId=id,PreviousRepresentativeId=relation.ResidualRepresentativeId,NewRepresentativeId=repId,ChangesResidualOwnership=true,ApprovedByUserId=Actor(h),EffectiveAt=effective,Reason=reason});
            Audit(db,h,"Relationship",id,"FutureResidualOwnershipApproved",new{repId,effective,reason});await db.SaveChangesAsync();return Results.Ok(new{scheduled=true});
        });
        group.MapPost("/adjustments",async(JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();var original=await db.Ledger.FindAsync(Number(input,"commissionId"));if(original is null)return Results.NotFound();
            var amount=Number(input,"amountMinor");var reason=Text(input,"reason");var requestId=Text(input,"requestId",100);if(amount==0||reason.Length<5||requestId.Length<8)return Results.BadRequest();
            var key="adjustment:"+requestId;if(await db.Ledger.AnyAsync(x=>x.IdempotencyKey==key))return Results.Ok(new{duplicate=true});
            await using var tx=await db.Database.BeginTransactionAsync();
            db.Add(new PartnerAdjustment{CommissionEntryId=original.Id,AmountMinor=amount,Reason=reason,AuthorizedByUserId=Actor(h),CreatedAt=DateTimeOffset.UtcNow});
            db.Add(new CommissionEntry{IdempotencyKey=key,RelationshipId=original.RelationshipId,RepresentativeId=original.RepresentativeId,BillingEventId=original.BillingEventId,CompensationVersionId=original.CompensationVersionId,Kind="AuthorizedAdjustment",AmountMinor=amount,Currency=original.Currency,EarnedAt=DateTimeOffset.UtcNow});
            Audit(db,h,"CommissionEntry",original.Id,"AdjustmentApproved",new{amount,reason,requestId});await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(new{saved=true});
        });
        group.MapGet("/relationships/{id:long}/history",async(long id,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var relation=await db.Relationships.FindAsync(id);if(relation is null)return Results.NotFound();var rep=await Rep(h,db);var admin=await Admin(h,crm);
            if(!admin&&Actor(h)!=relation.SubscriberUserId&&rep?.Id!=relation.AcquiringRepresentativeId&&rep?.Id!=relation.SupportRepresentativeId)return Results.Forbid();
            var billing=await db.BillingEvents.Where(x=>x.SubscriberUserId==relation.SubscriberUserId).OrderBy(x=>x.Id).ToListAsync();
            var ledger=await db.Ledger.Where(x=>x.RelationshipId==id).ToListAsync();var entryIds=ledger.Select(x=>x.Id).ToArray();
            var payoutItems=await db.Set<PartnerPayoutItem>().Where(x=>entryIds.Contains(x.CommissionEntryId)).ToListAsync();
            return Results.Ok(new{relationship=relation,billing,ledger,payoutItems,ownership=await db.Set<SubscriberOwnershipChange>().Where(x=>x.RelationshipId==id).ToListAsync(),tickets=(admin||rep?.Id==relation.SupportRepresentativeId||Actor(h)==relation.SubscriberUserId)?await db.Tickets.Where(x=>x.RelationshipId==id).ToListAsync():new List<PartnerSupportTicket>(),recordedCashMinor=billing.Where(x=>x.ProviderEventId.EndsWith(":cash")).Sum(x=>x.ReceivedMinor),lifetimeCashMinor=relation.AcquiredAt==null?(long?)null:billing.Where(x=>x.ProviderEventId.EndsWith(":cash")).Sum(x=>x.ReceivedMinor),lifetimeCommissionMinor=ledger.Sum(x=>x.AmountMinor)});
        });
        group.MapPost("/prospects/{id:long}",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var prospect=await db.Set<PartnerProspect>().FindAsync(id);if(prospect is null)return Results.NotFound();var rep=await Rep(h,db);if(!await Admin(h,crm)&&rep?.Id!=prospect.RepresentativeId)return Results.Forbid();
            var stage=Text(input,"stage",40);if(stage is not "New" and not "Contacted" and not "Qualified" and not "Appointment" and not "Won" and not "Lost")return Results.BadRequest();
            prospect.Stage=stage;prospect.Notes=Text(input,"notes",10000);await db.SaveChangesAsync();return Results.Ok(prospect);
        });
        group.MapGet("/reports",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();
            var relationships=await db.Relationships.ToListAsync();var billing=await db.BillingEvents.ToListAsync();var ledger=await db.Ledger.ToListAsync();var snapshots=await db.Set<PartnerSubscriptionSnapshot>().ToListAsync();
            var cash=billing.Where(x=>x.ProviderEventId.EndsWith(":cash")).ToList();
            var cohorts=relationships.GroupBy(x=>new{month=x.AcquiredAt?.ToString("yyyy-MM")??"Not recorded",plan=x.OriginalPlan}).Select(g=>{
                var ids=g.Select(x=>x.SubscriberUserId).ToHashSet();var relationIds=g.Select(x=>x.Id).ToHashSet();var receipts=cash.Where(x=>ids.Contains(x.SubscriberUserId)).ToList();
                return new{g.Key.month,g.Key.plan,subscribers=g.Count(),cashMinor=receipts.Sum(x=>x.ReceivedMinor),commissionMinor=ledger.Where(x=>relationIds.Contains(x.RelationshipId)).Sum(x=>x.AmountMinor),knownFeesMinor=receipts.Sum(x=>x.KnownFeeMinor??0),unknownFeeEvents=receipts.Count(x=>x.KnownFeeMinor==null)};
            }).ToList();
            var representatives=await db.Representatives.ToListAsync();
            var byRepresentative=representatives.Select(rep=>{
                var acquired=relationships.Where(x=>x.AcquiringRepresentativeId==rep.Id).ToList();var ids=acquired.Select(x=>x.SubscriberUserId).ToHashSet();var earned=ledger.Where(x=>x.RepresentativeId==rep.Id).ToList();
                return new{representativeId=rep.Id,customers=acquired.Count,cashMinor=cash.Where(x=>ids.Contains(x.SubscriberUserId)).Sum(x=>x.ReceivedMinor),upfrontMinor=earned.Where(x=>x.Kind=="Upfront").Sum(x=>x.AmountMinor),residualMinor=earned.Where(x=>x.Kind.StartsWith("Residual")).Sum(x=>x.AmountMinor),commissionMinor=earned.Sum(x=>x.AmountMinor)};
            }).ToList();
            var attributedIds=relationships.Where(x=>x.AcquiringRepresentativeId!=null).Select(x=>x.SubscriberUserId).ToHashSet();var unattributedCashMinor=cash.Where(x=>!attributedIds.Contains(x.SubscriberUserId)).Sum(x=>x.ReceivedMinor);
            var active=snapshots.Where(x=>x.Status=="active").ToList();return Results.Ok(new{cohorts,byRepresentative,unattributedCashMinor,activeSubscriptions=active.Count,canceledSubscriptions=snapshots.Count(x=>x.Status=="canceled"),monthlyRecurringMinor=active.Sum(x=>x.MonthlyRecurringMinor??0),unknownRecurringSubscriptions=active.Count(x=>x.MonthlyRecurringMinor==null),unobservedSubscribers=relationships.Count(x=>!snapshots.Any(s=>s.SubscriberUserId==x.SubscriberUserId)),currency="USD"});
        });
        group.MapPost("/representatives/{id:long}/profile",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var rep=await db.Representatives.FindAsync(id);if(rep is null)return Results.NotFound();if(!await Admin(h,crm)&&!(rep.UserId==Actor(h)&&rep.Active))return Results.Forbid();
            var email=Text(input,"supportEmail",320);if(email!=""&&!System.Net.Mail.MailAddress.TryCreate(email,out _))return Results.BadRequest();
            rep.Availability=Text(input,"availability",500);rep.AuthorizedContactJson=JsonSerializer.Serialize(new{email,phone=Text(input,"supportPhone",80)});Audit(db,h,"Representative",id,"ContactProfileUpdated",new{rep.Availability});await db.SaveChangesAsync();return Results.Ok(rep);
        });
        group.MapPost("/representatives/{id:long}/agreement",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();if(!await db.Representatives.AnyAsync(x=>x.Id==id))return Results.NotFound();var version=Text(input,"version",100);var evidence=Text(input,"evidence",1000);
            if(version.Length==0||evidence.Length<5||!DateTimeOffset.TryParse(Text(input,"acceptedAt",100),out var accepted)||accepted>DateTimeOffset.UtcNow)return Results.BadRequest();
            db.Add(new RepresentativeAgreement{RepresentativeId=id,Version=version,EvidenceReference=evidence,AcceptedAt=accepted});Audit(db,h,"Representative",id,"SignedAgreementRecorded",new{version,evidence,accepted});await db.SaveChangesAsync();return Results.Ok(new{recorded=true});
        });
        group.MapGet("/prospect-appointments",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);if(!admin&&rep==null)return Results.Forbid();return Results.Ok(await db.Set<PartnerProspectAppointment>().Where(x=>admin||x.RepresentativeId==rep!.Id).ToListAsync());
        });
        group.MapPost("/prospects/{id:long}/appointment",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db,IConfiguration config)=>{
            var prospect=await db.Set<PartnerProspect>().FindAsync(id);if(prospect is null)return Results.NotFound();var rep=await Rep(h,db);if(!await Admin(h,crm)&&rep?.Id!=prospect.RepresentativeId)return Results.Forbid();
            if(!DateTimeOffset.TryParse(Text(input,"startsAt",100),out var starts)||starts<=DateTimeOffset.UtcNow)return Results.BadRequest();var subject=Text(input,"subject",200);if(subject.Length==0)return Results.BadRequest();
            var appointment=new PartnerProspectAppointment{ProspectId=id,RepresentativeId=prospect.RepresentativeId,Subject=subject,StartsAt=starts,MeetingUrl=(config["SalesPartners:MeetingBaseUrl"]??"https://meet.nyrava.com").TrimEnd('/')+"/room/nyr-"+Guid.NewGuid().ToString("N")};db.Add(appointment);await db.SaveChangesAsync();return Results.Ok(appointment);
        });
        group.MapGet("/audit",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();return Results.Ok(await db.Set<PartnerAuditEvent>().OrderByDescending(x=>x.Id).Take(1000).ToListAsync());
        });
        group.MapPost("/tickets/{id:long}/escalate",async(long id,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await CanAccessTicket(id,h,crm,db))return Results.Forbid();var ticket=await db.Tickets.SingleAsync(x=>x.Id==id);if(ticket.Status=="Resolved")return Results.Conflict(new{error="Resolved tickets cannot be escalated."});
            ticket.Status="Escalated";Audit(db,h,"SupportTicket",id,"Escalated",new{ticket.AssignedRepresentativeId});await db.SaveChangesAsync();return Results.Ok(ticket);
        });
        group.MapGet("/subscribers",async(HttpContext h,CrmDb crm)=>{
            if(!await Admin(h,crm))return Results.Forbid();return Results.Ok(await crm.Users.Where(x=>x.Role=="Owner").Select(x=>new{x.Id,x.Email,x.SubscriptionPlan,x.SubscriptionStatus}).ToListAsync());
        });
        group.MapPost("/relationships/existing",async(JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();var userId=Number(input,"subscriberUserId");var supportId=Number(input,"supportRepresentativeId");var residualId=Number(input,"residualRepresentativeId");var reason=Text(input,"reason");
            var user=await crm.Users.SingleOrDefaultAsync(x=>x.Id==userId&&x.Role=="Owner");if(user is null||reason.Length<5)return Results.BadRequest();
            if(await db.Relationships.AnyAsync(x=>x.SubscriberUserId==userId))return Results.Conflict(new{error="Subscriber already has a permanent relationship."});
            if(!await db.Representatives.AnyAsync(x=>x.Id==supportId&&x.Active)||!await db.Representatives.AnyAsync(x=>x.Id==residualId&&x.Active))return Results.BadRequest(new{error="Active support and future residual recipients are required."});
            var relationship=new SubscriberRelationship{SubscriberUserId=userId,SupportRepresentativeId=supportId,ResidualRepresentativeId=residualId,OriginalPlan=user.SubscriptionPlan,ResidualEligibleFrom=DateTimeOffset.UtcNow};
            db.Add(relationship);await db.SaveChangesAsync();Audit(db,h,"Relationship",relationship.Id,"ExistingSubscriberSupportAssigned",new{reason,supportId,residualId,originalAttribution="Not recorded; no acquisition commission created",relationship.ResidualEligibleFrom});await db.SaveChangesAsync();return Results.Ok(relationship);
        });
        group.MapPost("/representatives/{id:long}/invite",async(long id,HttpContext h,CrmDb crm,SalesPartnerDb db,IConfiguration config)=>{
            if(!await Admin(h,crm))return Results.Forbid();var representative=await db.Representatives.FindAsync(id);if(representative is null)return Results.NotFound();
            if(representative.Status!="Invited")return Results.Conflict(new{error="Accepted accounts should use the existing password-reset flow."});
            var user=await crm.Users.SingleAsync(x=>x.Id==representative.UserId);var token=Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
            await using var tx=await db.Database.BeginTransactionAsync();foreach(var pending in await db.Set<PartnerInvitation>().Where(x=>x.RepresentativeId==id&&x.AcceptedAt==null).ToListAsync())pending.ExpiresAt=DateTimeOffset.UtcNow;
            db.Add(new PartnerInvitation{RepresentativeId=id,TokenHash=Hash(token),ExpiresAt=DateTimeOffset.UtcNow.AddDays(7)});Audit(db,h,"Representative",id,"InvitationReissued",new{user.Email});await db.SaveChangesAsync();await tx.CommitAsync();
            var url=(config["Crm:PublicBaseUrl"]??"https://home.nyrava.com").TrimEnd('/')+"/sales-partners?invite="+token;
            var delivery=await EmailService.SendInvitationEmailAsync(config,user.Email,url,"Nyrava Sales Partner Center");return Results.Ok(new{invitationUrl=url,sent=delivery.SentViaSmtp,emailStatus=delivery.Status});
        });
        group.MapGet("/activities",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);var subscriber=db.Relationships.Where(x=>x.SubscriberUserId==Actor(h)).Select(x=>x.Id);
            return Results.Ok(await db.Set<PartnerActivity>().Where(x=>admin||(rep!=null&&x.RepresentativeId==rep.Id)||subscriber.Contains(x.RelationshipId)).ToListAsync());
        });
        group.MapPost("/activities",async(JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db,IConfiguration config)=>{
            var relation=await db.Relationships.FindAsync(Number(input,"relationshipId"));if(relation is null)return Results.NotFound();
            var rep=await Rep(h,db);if(!await Admin(h,crm)&&rep?.Id!=relation.SupportRepresentativeId&&relation.SubscriberUserId!=Actor(h))return Results.Forbid();
            if(!DateTimeOffset.TryParse(Text(input,"startsAt",100),out var starts)||starts<DateTimeOffset.UtcNow)return Results.BadRequest(new{error="Choose a future appointment time."});
            var kind=Text(input,"kind",30);if(kind is not "Video" and not "Phone" and not "Appointment")return Results.BadRequest();
            var subject=Text(input,"subject",200);if(subject.Length==0)return Results.BadRequest();
            var activity=new PartnerActivity{RelationshipId=relation.Id,RepresentativeId=relation.SupportRepresentativeId,Kind=kind,Subject=subject,StartsAt=starts,EffectiveAt=DateTimeOffset.UtcNow,
                DeliveryReference=kind=="Video"?(config["SalesPartners:MeetingBaseUrl"]??"https://meet.nyrava.com").TrimEnd('/')+"/room/nyr-"+Guid.NewGuid().ToString("N"):""};
            db.Add(activity);await db.SaveChangesAsync();return Results.Ok(activity);
        });
        group.MapPost("/tickets/{id:long}/email",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db,IConfiguration config)=>{
            if(!await CanAccessTicket(id,h,crm,db))return Results.Forbid();var ticket=await db.Tickets.SingleAsync(x=>x.Id==id);var relation=await db.Relationships.SingleAsync(x=>x.Id==ticket.RelationshipId);
            var representative=await db.Representatives.SingleAsync(x=>x.Id==ticket.AssignedRepresentativeId);var actor=Actor(h);
            var targetId=actor==relation.SubscriberUserId?representative.UserId:relation.SubscriberUserId;
            var recipient=await crm.Users.SingleAsync(x=>x.Id==targetId);var body=Text(input,"body",10000);if(body.Length==0)return Results.BadRequest();
            var result=await EmailService.SendPartnerSupportAsync(config,recipient.Email,ticket.Subject,body);
            db.Add(new PartnerTicketMessage{TicketId=id,AuthorUserId=actor,Body=body,CreatedAt=DateTimeOffset.UtcNow});
            Audit(db,h,"SupportTicket",id,"EmailAttempt",new{sent=result.SentViaSmtp,queued=result.SavedToOutbox});await db.SaveChangesAsync();
            return Results.Ok(new{sent=result.SentViaSmtp,queued=result.SavedToOutbox,status=result.Status});
        });
    }
}
