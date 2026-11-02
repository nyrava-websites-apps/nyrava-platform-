using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;
using Xunit;
namespace NyravaCRM.Tests;
public sealed class SalesPartnerLifecycleTests
{
    [Fact]
    public async Task Signup_paid_license_residual_support_and_manual_payout_are_integrated()
    {
        await using var factory=new CrmApplicationFactory{SalesPartnersEnabled=true,BootstrapAdminEnabled=true};
        using var admin=factory.CreateClient();using var rep=factory.CreateClient();using var realtor=factory.CreateClient();
        async Task<JsonElement> Post(HttpClient client,string path,object body)
        {var r=await client.PostAsJsonAsync(path,body);Assert.True(r.IsSuccessStatusCode,$"{path}: {r.StatusCode} {await r.Content.ReadAsStringAsync()}");return await r.Content.ReadFromJsonAsync<JsonElement>();}
        await Post(admin,"/api/login",new{email=factory.BootstrapAdminEmail,password=factory.BootstrapAdminPassword});
        var invited=await Post(admin,"/api/sales-partners/representatives",new{name="Isolated Sales Partner",email="rep-lifecycle@example.test"});
        var repId=invited.GetProperty("representative").GetProperty("id").GetInt64();var referral=invited.GetProperty("representative").GetProperty("referralCode").GetString();
        var oldToken=new Uri(invited.GetProperty("invitationUrl").GetString()!).Query.Split("invite=")[1];
        var reissued=await Post(admin,$"/api/sales-partners/representatives/{repId}/invite",new{});
        Assert.Equal(HttpStatusCode.BadRequest,(await rep.PostAsJsonAsync("/api/sales-partners/accept-invitation",new{token=oldToken,password="Isolated-Rep-Password-2026!"})).StatusCode);
        var token=new Uri(reissued.GetProperty("invitationUrl").GetString()!).Query.Split("invite=")[1];
        await Post(rep,"/api/sales-partners/accept-invitation",new{token,password="Isolated-Rep-Password-2026!"});
        await Post(rep,"/api/login",new{email="rep-lifecycle@example.test",password="Isolated-Rep-Password-2026!"});
        var signup=await Post(realtor,"/api/register",new{email="subscriber-lifecycle@example.test",password="Isolated-Realtor-2026!",referralCode=referral});
        var userId=signup.GetProperty("user").GetProperty("id").GetInt64();
        var start=DateTimeOffset.UtcNow.AddDays(-20);var end=start.AddDays(30);
        async Task Financial(string eventId,string kind,long cash,object[] lines)
        {
            if(kind is "CashReceipt" or "PaymentFailed" or "customer.subscription.deleted")
            {
                var status=kind=="PaymentFailed"?"PastDue":kind=="customer.subscription.deleted"?"Expired":"Active";
                var syncBody=JsonSerializer.Serialize(new{ownerId=userId,eventId="sync_"+eventId,subscriptionId="sub_isolated",customerId="cus_isolated",status,plan="BASIC",paid=kind=="CashReceipt",currentPeriodEnd=end,observedAt=DateTimeOffset.UtcNow});
                var syncStamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();using var syncReq=new HttpRequestMessage(HttpMethod.Post,"/api/internal/billing/sync"){Content=new StringContent(syncBody,Encoding.UTF8,"application/json")};
                syncReq.Headers.Add("X-Nyrava-Timestamp",syncStamp);syncReq.Headers.Add("X-Nyrava-Signature",Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(factory.BillingSyncSecret),Encoding.UTF8.GetBytes(syncStamp+"."+syncBody))));
                var syncResponse=await admin.SendAsync(syncReq);Assert.True(syncResponse.IsSuccessStatusCode,await syncResponse.Content.ReadAsStringAsync());
            }
            var body=JsonSerializer.Serialize(new{ownerId=userId,eventId,kind,customerId="cus_isolated",subscriptionId="sub_isolated",invoiceId="in_"+eventId,paymentId="pi_"+eventId,currency="USD",invoicedMinor=cash,receivedMinor=cash,effectiveAt=start,lines});
            var stamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();using var req=new HttpRequestMessage(HttpMethod.Post,"/api/internal/sales-partners/billing"){Content=new StringContent(body,Encoding.UTF8,"application/json")};
            req.Headers.Add("X-Nyrava-Timestamp",stamp);req.Headers.Add("X-Nyrava-Signature",Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(factory.BillingSyncSecret),Encoding.UTF8.GetBytes(stamp+"."+body))));
            var response=await admin.SendAsync(req);Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());
        }
        await Financial("evt_license","CashReceipt",34900,new object[]{new{id="il_license",kind="AnnualLicensePaid",plan="BASIC",paidMinor=34900,start,end}});
        await Financial("evt_license","CashReceipt",34900,new object[]{new{id="il_license",kind="AnnualLicensePaid",plan="BASIC",paidMinor=34900,start,end}});
        await Task.WhenAll(Enumerable.Range(0,4).Select(_=>Financial("evt_license","CashReceipt",34900,new object[]{new{id="il_license",kind="AnnualLicensePaid",plan="BASIC",paidMinor=34900,start,end}})));
        var relationships=await realtor.GetFromJsonAsync<JsonElement>("/api/sales-partners/relationships");var relationship=relationships.GetProperty("relationships")[0];var relId=relationship.GetProperty("id").GetInt64();
        Assert.Equal(repId,relationship.GetProperty("acquiringRepresentativeId").GetInt64());
        var ticket=await Post(realtor,"/api/sales-partners/tickets",new{relationshipId=relId,subject="Subscription assistance",body="Help with my account",channel="InApp"});var ticketId=ticket.GetProperty("id").GetInt64();
        await Post(rep,$"/api/sales-partners/tickets/{ticketId}/messages",new{body="I can help."});await Post(rep,$"/api/sales-partners/tickets/{ticketId}/resolve",new{});
        await Financial("evt_month","CashReceipt",8900,new object[]{new{id="il_month",kind="MonthlyPaymentPaid",plan="BASIC",paidMinor=8900,start,end}});
        await Financial("evt_upgrade","CashReceipt",3000,new object[]{new{id="il_upgrade",kind="UpgradeProrationPaid",plan="PRO",paidMinor=3000,start=start.AddDays(15),end,originalStart=start,originalEnd=end}});
        var accounting=await admin.GetFromJsonAsync<JsonElement>("/api/sales-partners/accounting");Assert.Equal(5750,accounting.GetProperty("earnedMinor").GetInt64());Assert.Equal(46800,accounting.GetProperty("cashReceivedMinor").GetInt64());
        Assert.Equal(HttpStatusCode.Forbidden,(await rep.PostAsJsonAsync("/api/sales-partners/payouts",new{})).StatusCode);
        var batches=await Post(admin,"/api/sales-partners/payouts",new{});var batchId=batches[0].GetProperty("id").GetInt64();
        foreach(var state in new[]{"Review","Approved","Processing"})await Post(admin,$"/api/sales-partners/payouts/{batchId}/state",new{state});
        await Post(admin,$"/api/sales-partners/payouts/{batchId}/confirm",new{reference="external-confirmed-lifecycle",paidAt=DateTimeOffset.UtcNow.AddMinutes(-1)});
        await Post(admin,$"/api/sales-partners/payouts/{batchId}/confirm",new{reference="external-confirmed-lifecycle",paidAt=DateTimeOffset.UtcNow.AddMinutes(-1)});
        accounting=await admin.GetFromJsonAsync<JsonElement>("/api/sales-partners/accounting");Assert.Equal(0,accounting.GetProperty("outstandingMinor").GetInt64());Assert.Equal(5750,accounting.GetProperty("paidMinor").GetInt64());
        Assert.Equal(0,(await Post(admin,"/api/sales-partners/payouts",new{})).GetArrayLength());
        await Financial("evt_failed","PaymentFailed",0,Array.Empty<object>());
        await Financial("evt_cancel","customer.subscription.deleted",0,Array.Empty<object>());
        await Financial("evt_refund","CashRefund",-8900,Array.Empty<object>());
        accounting=await admin.GetFromJsonAsync<JsonElement>("/api/sales-partners/accounting");
        Assert.Equal(37900,accounting.GetProperty("cashReceivedMinor").GetInt64());
        Assert.Equal(5750,accounting.GetProperty("earnedMinor").GetInt64()); // Refund is an explicit admin-review case, never a silent upfront clawback.
        using var replacement=factory.CreateClient();
        var nextInvite=await Post(admin,"/api/sales-partners/representatives",new{name="Replacement Support",email="replacement-support@example.test"});
        var nextId=nextInvite.GetProperty("representative").GetProperty("id").GetInt64();var nextToken=new Uri(nextInvite.GetProperty("invitationUrl").GetString()!).Query.Split("invite=")[1];
        await Post(replacement,"/api/sales-partners/accept-invitation",new{token=nextToken,password="Replacement-Partner-2026!"});
        await Post(replacement,"/api/login",new{email="replacement-support@example.test",password="Replacement-Partner-2026!"});
        await Post(admin,$"/api/sales-partners/relationships/{relId}/support-owner",new{representativeId=nextId,reason="Operator-authorized support transfer"});
        var history=await admin.GetFromJsonAsync<JsonElement>($"/api/sales-partners/relationships/{relId}/history");
        Assert.Equal(repId,history.GetProperty("relationship").GetProperty("acquiringRepresentativeId").GetInt64());
        Assert.Equal(nextId,history.GetProperty("relationship").GetProperty("supportRepresentativeId").GetInt64());
        Assert.Equal(repId,history.GetProperty("relationship").GetProperty("residualRepresentativeId").GetInt64());
        await Post(admin,$"/api/sales-partners/relationships/{relId}/residual-owner",new{representativeId=nextId,effectiveAt=DateTimeOffset.UtcNow.AddDays(1),reason="Approved prospective residual transfer"});
        await Post(admin,$"/api/sales-partners/representatives/{repId}/status",new{status="Suspended"});
        Assert.Equal(HttpStatusCode.Forbidden,(await rep.GetAsync("/api/sales-partners/prospects")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await rep.PostAsJsonAsync("/api/login",new{email="rep-lifecycle@example.test",password="Isolated-Rep-Password-2026!"})).StatusCode);

    }
}
