using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.ComponentModel.DataAnnotations;
namespace NyravaCRM.SalesPartners;

public static partial class PartnerEndpoints
{
    private static long Actor(HttpContext h)=>long.TryParse(h.User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;
    private static string Hash(string token)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string Text(JsonElement j,string name,int max=2000)
    {var value=j.TryGetProperty(name,out var x)?x.GetString()?.Trim()??"":"";if(value.Length>max)throw new ValidationException(name+" is too long.");return value;}
    private static long Number(JsonElement j,string name)=>j.TryGetProperty(name,out var x)&&x.TryGetInt64(out var n)?n:0;
    private static async Task<bool> Admin(HttpContext h,CrmDb crm)=>await crm.Users.AnyAsync(x=>x.Id==Actor(h)&&x.Role=="Admin");
    private static async Task<SalesRepresentative?> Rep(HttpContext h,SalesPartnerDb db)=>await db.Representatives.SingleOrDefaultAsync(x=>x.UserId==Actor(h)&&x.Active&&x.Status=="Active");
    private static void Audit(SalesPartnerDb db,HttpContext h,string type,long id,string action,object evidence)=>db.Add(new PartnerAuditEvent{ActorUserId=Actor(h),EntityType=type,EntityId=id,Action=action,EvidenceJson=JsonSerializer.Serialize(evidence),CreatedAt=DateTimeOffset.UtcNow});
    public static void MapSalesPartners(this WebApplication app)
    {
        app.MapAccountDeletion();
        var group=app.MapGroup("/api/sales-partners").RequireAuthorization();
        group.AddEndpointFilter(async(context,next)=>{
            try{return await next(context);}
            catch(ValidationException e){return Results.BadRequest(new{error=e.Message});}
            catch(DbUpdateException){return Results.Conflict(new{error="This transaction conflicts with an existing record. Refresh and retry."});}
        });
        group.MapGet("/session",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);
            if(rep==null&&await crm.Users.AnyAsync(x=>x.Id==Actor(h)&&x.Role=="SalesRepresentative"))return Results.StatusCode(403);
            return Results.Ok(new{admin,representative=rep,subscriberReference=PartnerReferences.Subscriber(Actor(h))});
        });
        group.MapGet("/representatives",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();return Results.Ok(await db.Representatives.ToListAsync());
        });
        group.MapPost("/representatives",async(JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db,IConfiguration config)=>{
            if(!await Admin(h,crm))return Results.Forbid();
            var email=Text(input,"email",320).ToLowerInvariant();var name=Text(input,"name",160);
            if(!System.Net.Mail.MailAddress.TryCreate(email,out _)||name.Length<2)return Results.BadRequest(new{error="Name and valid email required."});
            if(await crm.Users.AnyAsync(x=>x.Email==email))return Results.Conflict(new{error="Email already belongs to an account; existing Realtor accounts cannot be converted."});
            crm.Database.SetDbConnection(db.Database.GetDbConnection());
            await using var invitationTransaction=await db.Database.BeginTransactionAsync();
            await crm.Database.UseTransactionAsync(invitationTransaction.GetDbTransaction());
            var user=new CrmUser{Email=email,PasswordHash=BCrypt.Net.BCrypt.HashPassword(Convert.ToHexString(RandomNumberGenerator.GetBytes(32))),Role="SalesRepresentative"};
            crm.Add(user);await crm.SaveChangesAsync();user.WorkspaceId=user.Id;
            crm.Add(new CrmMembership{OwnerUserId=user.Id,UserId=user.Id,Role="SalesRepresentative",Active=true});await crm.SaveChangesAsync();
            var rep=new SalesRepresentative{UserId=user.Id,Name=name,ReferralCode=Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant(),Active=false,Status="Invited"};db.Add(rep);await db.SaveChangesAsync();
            var token=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));db.Add(new PartnerInvitation{RepresentativeId=rep.Id,TokenHash=Hash(token),ExpiresAt=DateTimeOffset.UtcNow.AddDays(7)});
            Audit(db,h,"Representative",rep.Id,"Invited",new{email});await db.SaveChangesAsync();
            await invitationTransaction.CommitAsync();
            var url=(config["Crm:PublicBaseUrl"]??"https://home.nyrava.com").TrimEnd('/')+"/sales-partners?invite="+token;
            var delivery=await EmailService.SendInvitationEmailAsync(config,email,url,"Nyrava Sales Partner Center");
            return Results.Ok(new{representative=rep,reference=PartnerReferences.Representative(rep.Id),invitationUrl=url,emailStatus=delivery.Status,sent=delivery.SentViaSmtp});
        });
        app.MapPost("/api/sales-partners/accept-invitation",async(JsonElement input,CrmDb crm,SalesPartnerDb db)=>{
            var token=Text(input,"token",128);var password=Text(input,"password",200);if(password.Length<12)return Results.BadRequest(new{error="Password must have at least 12 characters."});
            var hash=Hash(token);var invitation=await db.Set<PartnerInvitation>().SingleOrDefaultAsync(x=>x.TokenHash==hash);
            if(invitation is null||invitation.AcceptedAt!=null||invitation.ExpiresAt<=DateTimeOffset.UtcNow)return Results.BadRequest(new{error="Invitation invalid or expired."});
            crm.Database.SetDbConnection(db.Database.GetDbConnection());
            await using var activationTransaction=await db.Database.BeginTransactionAsync();
            await crm.Database.UseTransactionAsync(activationTransaction.GetDbTransaction());
            var acceptedAt=DateTimeOffset.UtcNow;
            var claimed=await db.Set<PartnerInvitation>().Where(x=>x.Id==invitation.Id&&x.AcceptedAt==null).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.AcceptedAt,acceptedAt));
            if(claimed!=1)return Results.Conflict(new{error="Invitation already accepted."});
            var rep=await db.Representatives.SingleAsync(x=>x.Id==invitation.RepresentativeId);var user=await crm.Users.SingleAsync(x=>x.Id==rep.UserId);
            user.PasswordHash=BCrypt.Net.BCrypt.HashPassword(password);await crm.SaveChangesAsync();
            invitation.AcceptedAt=DateTimeOffset.UtcNow;rep.Active=true;rep.Status="Active";await db.SaveChangesAsync();await activationTransaction.CommitAsync();return Results.Ok(new{accepted=true});
        }).AllowAnonymous();
        group.MapPost("/representatives/{id:long}/status",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();var rep=await db.Representatives.FindAsync(id);if(rep is null)return Results.NotFound();
            var status=Text(input,"status",20);if(status is not "Active" and not "Suspended")return Results.BadRequest();
            if(status=="Active"&&!await db.Set<PartnerInvitation>().AnyAsync(x=>x.RepresentativeId==id&&x.AcceptedAt!=null))return Results.BadRequest(new{error="Invitation must first be accepted."});
            rep.Status=status;rep.Active=status=="Active";Audit(db,h,"Representative",id,"StatusChanged",new{status});await db.SaveChangesAsync();return Results.Ok(rep);
        });
        group.MapGet("/relationships",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);var actor=Actor(h);
            var rows=await db.Relationships.Where(x=>admin || (rep!=null&&(x.AcquiringRepresentativeId==rep.Id||x.SupportRepresentativeId==rep.Id||x.ResidualRepresentativeId==rep.Id)) || x.SubscriberUserId==actor).ToListAsync();
            var ids=rows.Select(x=>x.SubscriberUserId).ToArray();var users=await crm.Users.Where(x=>ids.Contains(x.Id)).Select(x=>new{x.Id,x.Email,x.SubscriptionPlan,x.SubscriptionStatus}).ToListAsync();
            var repIds=rows.Select(x=>x.SupportRepresentativeId).ToArray();
            var support=await db.Representatives.Where(x=>repIds.Contains(x.Id)).Select(x=>new{x.Id,x.Name,x.Availability,x.AuthorizedContactJson,x.Active}).ToListAsync();
            return Results.Ok(new{relationships=rows,subscribers=users,support});
        });
        group.MapPost("/relationships/{id:long}/support-owner",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();var relationship=await db.Relationships.FindAsync(id);if(relationship is null)return Results.NotFound();
            var repId=Number(input,"representativeId");if(!await db.Representatives.AnyAsync(x=>x.Id==repId&&x.Active&&x.Status=="Active"))return Results.BadRequest(new{error="Active representative required."});
            var reason=Text(input,"reason");if(reason.Length<3)return Results.BadRequest(new{error="Reason required."});
            await using var tx=await db.Database.BeginTransactionAsync();var previous=relationship.SupportRepresentativeId;relationship.SupportRepresentativeId=repId;
            foreach(var ticket in await db.Tickets.Where(x=>x.RelationshipId==id&&x.Status!="Resolved").ToListAsync())ticket.AssignedRepresentativeId=repId;
            foreach(var activity in await db.Set<PartnerActivity>().Where(x=>x.RelationshipId==id&&!x.Completed).ToListAsync())activity.RepresentativeId=repId;
            db.Add(new SubscriberOwnershipChange{RelationshipId=id,PreviousRepresentativeId=previous,NewRepresentativeId=repId,ApprovedByUserId=Actor(h),EffectiveAt=DateTimeOffset.UtcNow,Reason=reason});
            Audit(db,h,"Relationship",id,"SupportReassigned",new{previous,repId,reason});await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(relationship);
        });
        group.MapGet("/prospects",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);if(!admin&&rep is null)return Results.Forbid();return Results.Ok(await db.Set<PartnerProspect>().Where(x=>admin||x.RepresentativeId==rep!.Id).ToListAsync());
        });
        group.MapPost("/prospects",async(JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var rep=await Rep(h,db);var admin=await Admin(h,crm);if(!admin&&rep is null)return Results.Forbid();var repId=admin?Number(input,"representativeId"):rep!.Id;
            if(!await db.Representatives.AnyAsync(x=>x.Id==repId&&x.Active))return Results.BadRequest();
            var prospect=new PartnerProspect{RepresentativeId=repId,Name=Text(input,"name",160),Email=Text(input,"email",320),Phone=Text(input,"phone",80),Notes=Text(input,"notes"),CreatedAt=DateTimeOffset.UtcNow};
            if(prospect.Name.Length==0)return Results.BadRequest();db.Add(prospect);await db.SaveChangesAsync();return Results.Ok(prospect);
        });
        group.MapGet("/tickets",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);var owned=db.Relationships.Where(x=>x.SubscriberUserId==Actor(h)).Select(x=>x.Id);
            return Results.Ok(await db.Tickets.Where(x=>admin||(rep!=null&&x.AssignedRepresentativeId==rep.Id)||owned.Contains(x.RelationshipId)).ToListAsync());
        });
        group.MapPost("/tickets",async(JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var id=Number(input,"relationshipId");var relationship=await db.Relationships.FindAsync(id);if(relationship is null)return Results.NotFound();
            var admin=await Admin(h,crm);var rep=await Rep(h,db);if(!admin&&relationship.SubscriberUserId!=Actor(h)&&rep?.Id!=relationship.SupportRepresentativeId)return Results.Forbid();
            var subject=Text(input,"subject",200);var body=Text(input,"body",10000);if(subject.Length==0||body.Length==0)return Results.BadRequest();
            var channel=Text(input,"channel",30);if(channel is not "InApp" and not "Email" and not "PhoneRequest" and not "VideoRequest")return Results.BadRequest();
            var ticket=new PartnerSupportTicket{RelationshipId=id,AssignedRepresentativeId=relationship.SupportRepresentativeId,Subject=subject,Channel=channel,CreatedAt=DateTimeOffset.UtcNow,DueAt=DateTimeOffset.UtcNow.AddDays(1)};
            db.Add(ticket);await db.SaveChangesAsync();db.Add(new PartnerTicketMessage{TicketId=ticket.Id,AuthorUserId=Actor(h),Body=body,CreatedAt=DateTimeOffset.UtcNow});await db.SaveChangesAsync();return Results.Ok(ticket);
        });
        group.MapGet("/tickets/{id:long}/messages",async(long id,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await CanAccessTicket(id,h,crm,db))return Results.Forbid();return Results.Ok(await db.Set<PartnerTicketMessage>().Where(x=>x.TicketId==id).OrderBy(x=>x.Id).ToListAsync());
        });
        group.MapPost("/tickets/{id:long}/messages",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await CanAccessTicket(id,h,crm,db))return Results.Forbid();var body=Text(input,"body",10000);if(body.Length==0)return Results.BadRequest();
            db.Add(new PartnerTicketMessage{TicketId=id,AuthorUserId=Actor(h),Body=body,CreatedAt=DateTimeOffset.UtcNow});await db.SaveChangesAsync();return Results.Ok(new{saved=true});
        });
        group.MapPost("/tickets/{id:long}/resolve",async(long id,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var ticket=await db.Tickets.FindAsync(id);if(ticket is null)return Results.NotFound();var rep=await Rep(h,db);
            if(!await Admin(h,crm)&&rep?.Id!=ticket.AssignedRepresentativeId)return Results.Forbid();ticket.Status="Resolved";ticket.ResolvedAt=DateTimeOffset.UtcNow;await db.SaveChangesAsync();return Results.Ok(ticket);
        });
        group.MapGet("/compensation",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();return Results.Ok(await db.Set<PartnerCommissionVersion>().OrderByDescending(x=>x.Id).ToListAsync());
        });
        group.MapPost("/compensation",async(CompensationVersion rules,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();rules.Validate();if(rules.EffectiveFrom<DateTimeOffset.UtcNow.AddMinutes(-1))return Results.BadRequest(new{error="New plans must take effect prospectively."});
            await using var versionTransaction=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var plan=await db.Set<PartnerCommissionPlan>().FirstAsync();var next=await db.Set<PartnerCommissionVersion>().MaxAsync(x=>x.Version)+1;
            var nextId=await db.Set<PartnerCommissionVersion>().MaxAsync(x=>x.Id)+1;
            var version=new PartnerCommissionVersion{Id=nextId,PlanId=plan.Id,Version=next,ApprovedByUserId=Actor(h),EffectiveFrom=rules.EffectiveFrom,RulesJson=JsonSerializer.Serialize(rules with{Id=nextId})};
            db.Add(version);await db.SaveChangesAsync();
            Audit(db,h,"CommissionVersion",version.Id,"Published",rules);await db.SaveChangesAsync();await versionTransaction.CommitAsync();return Results.Ok(new{id=version.Id});
        });
        MapAccounting(group);
        MapCommunications(group);
    }
    private static async Task<bool> CanAccessTicket(long id,HttpContext h,CrmDb crm,SalesPartnerDb db)
    {
        var ticket=await db.Tickets.FindAsync(id);if(ticket is null)return false;if(await Admin(h,crm))return true;
        var rep=await Rep(h,db);if(rep?.Id==ticket.AssignedRepresentativeId)return true;
        return await db.Relationships.AnyAsync(x=>x.Id==ticket.RelationshipId&&x.SubscriberUserId==Actor(h));
    }
    private static void MapAccounting(RouteGroupBuilder group)
    {
        group.MapGet("/accounting",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);if(!admin&&rep is null)return Results.Forbid();
            var entries=await db.Ledger.Where(x=>admin||x.RepresentativeId==rep!.Id).ToListAsync();var ids=entries.Select(x=>x.Id).ToArray();
            var items=await db.Set<PartnerPayoutItem>().Where(x=>ids.Contains(x.CommissionEntryId)).ToListAsync();var batches=await db.PayoutBatches.ToListAsync();
            var paidIds=batches.Where(x=>x.State==PayoutState.Paid).Select(x=>x.Id).ToHashSet();var paid=items.Where(x=>paidIds.Contains(x.BatchId)).Sum(x=>x.AmountMinor);
            var balances=entries.GroupBy(x=>x.RepresentativeId).Select(g=>{
                var entryIds=g.Select(x=>x.Id).ToHashSet();return g.Sum(x=>x.AmountMinor)-items.Where(x=>entryIds.Contains(x.CommissionEntryId)&&paidIds.Contains(x.BatchId)).Sum(x=>x.AmountMinor);
            }).ToList();
            var billing=admin?await db.BillingEvents.ToListAsync():new List<PartnerBillingEvent>();
            return Results.Ok(new{ledger=entries,billing,earnedMinor=entries.Sum(x=>x.AmountMinor),paidMinor=paid,outstandingMinor=balances.Sum(x=>Math.Max(0,x)),contractorCreditMinor=balances.Sum(x=>Math.Max(0,-x)),
                cashReceivedMinor=billing.Where(x=>x.ProviderEventId.EndsWith(":cash")).Sum(x=>x.ReceivedMinor),invoicedMinor=billing.Where(x=>x.ProviderEventId.EndsWith(":cash")&&x.InvoiceId!="").GroupBy(x=>x.InvoiceId).Sum(g=>g.Max(x=>x.InvoicedMinor)),knownFeesMinor=billing.Sum(x=>x.KnownFeeMinor??0),unknownFeeEvents=billing.Count(x=>x.ProviderEventId.EndsWith(":cash")&&x.KnownFeeMinor==null),currency="USD"});
        });
        group.MapGet("/payouts",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);if(!admin&&rep is null)return Results.Forbid();var ledgerIds=db.Ledger.Where(x=>x.RepresentativeId==rep!.Id).Select(x=>x.Id);
            var batches=admin?await db.PayoutBatches.ToListAsync():await db.PayoutBatches.Where(x=>db.Set<PartnerPayoutItem>().Any(i=>i.BatchId==x.Id&&ledgerIds.Contains(i.CommissionEntryId))).ToListAsync();return Results.Ok(batches);
        });
        group.MapPost("/payouts",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();return Results.Ok(await PartnerPayroll.GenerateAsync(db,Actor(h),DateTimeOffset.UtcNow));
        });
        group.MapGet("/payroll-settings",async(HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();return Results.Ok(await PartnerPayroll.SettingsAsync(db));
        });
        group.MapPost("/payroll-settings",async(PartnerPayrollSchedule settings,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();if(settings.Payday<0||settings.Payday>6||settings.CutoffDay<0||settings.CutoffDay>6||settings.CutoffHour<0||settings.CutoffHour>23)return Results.BadRequest();
            try{TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZoneId);}catch{return Results.BadRequest(new{error="Valid time zone required."});}
            settings.Id=0;settings.ApprovedByUserId=Actor(h);settings.CreatedAt=DateTimeOffset.UtcNow;db.Add(settings);Audit(db,h,"PayrollSchedule",0,"SchedulePublished",settings);await db.SaveChangesAsync();return Results.Ok(settings);
        });
        group.MapPost("/payouts/{id:long}/state",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            if(!await Admin(h,crm))return Results.Forbid();var batch=await db.PayoutBatches.FindAsync(id);if(batch is null)return Results.NotFound();
            if(!Enum.TryParse<PayoutState>(Text(input,"state",20),out var next)||next==PayoutState.Paid)return Results.BadRequest(new{error="Use the external payment confirmation workflow to mark Paid."});
            batch.State=PayoutWorkflow.Transition(batch.State,next,true);if(next==PayoutState.Approved){batch.ApproverUserId=Actor(h);batch.ApprovedAt=DateTimeOffset.UtcNow;}
            Audit(db,h,"PayoutBatch",id,"StateChanged",new{next});await db.SaveChangesAsync();return Results.Ok(batch);
        });
        group.MapPost("/payouts/{id:long}/confirm",async(long id,JsonElement input,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);if(!admin)return Results.Forbid();if(!DateTimeOffset.TryParse(Text(input,"paidAt",100),out var paidAt))return Results.BadRequest();
            await new ExternalPartnerPayoutService(db).ConfirmAsync(id,Actor(h),Text(input,"reference",200),paidAt,true);return Results.Ok(new{confirmed=true});
        });
        group.MapGet("/payouts/{id:long}/statement",async(long id,HttpContext h,CrmDb crm,SalesPartnerDb db)=>{
            var admin=await Admin(h,crm);var rep=await Rep(h,db);var lines=await db.Set<PartnerPayoutItem>().Where(x=>x.BatchId==id).Join(db.Ledger,i=>i.CommissionEntryId,e=>e.Id,(i,e)=>new{i,e}).ToListAsync();
            if(!admin&&(rep is null||lines.Any(x=>x.e.RepresentativeId!=rep.Id)))return Results.Forbid();return Results.Ok(new{batch=await db.PayoutBatches.FindAsync(id),lines});
        });
    }
}
