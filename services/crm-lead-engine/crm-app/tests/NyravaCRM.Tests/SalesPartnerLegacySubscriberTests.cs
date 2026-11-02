using System.Net.Http.Json;using System.Text.Json;using Xunit;
namespace NyravaCRM.Tests;
public sealed class SalesPartnerLegacySubscriberTests
{
 [Fact] public async Task Existing_subscriber_support_assignment_never_invents_original_sale_or_commission()
 {
  await using var f=new CrmApplicationFactory{SalesPartnersEnabled=true,BootstrapAdminEnabled=true};using var admin=f.CreateClient();using var contractor=f.CreateClient();using var buyer=f.CreateClient();
  async Task<JsonElement> Post(HttpClient c,string path,object body){var r=await c.PostAsJsonAsync(path,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  await Post(admin,"/api/login",new{email=f.BootstrapAdminEmail,password=f.BootstrapAdminPassword});
  var invited=await Post(admin,"/api/sales-partners/representatives",new{name="Legacy Support Partner",email="legacy-support-partner@example.test"});var repId=invited.GetProperty("representative").GetProperty("id").GetInt64();
  var token=new Uri(invited.GetProperty("invitationUrl").GetString()!).Query.Split("invite=")[1];await Post(contractor,"/api/sales-partners/accept-invitation",new{token,password="Legacy-Support-Isolated-2026!"});
  var signup=await Post(buyer,"/api/register",new{email="preexisting-house-account@example.test",password="House-Subscriber-2026!"});var id=signup.GetProperty("user").GetProperty("id").GetInt64();
  var relation=await Post(admin,"/api/sales-partners/relationships/existing",new{subscriberUserId=id,supportRepresentativeId=repId,residualRepresentativeId=repId,reason="Explicit legacy account support assignment; original salesperson unknown"});
  Assert.Equal(JsonValueKind.Null,relation.GetProperty("acquiringRepresentativeId").ValueKind);
  Assert.Equal(JsonValueKind.Null,relation.GetProperty("acquiredAt").ValueKind);
  Assert.Equal(repId,relation.GetProperty("supportRepresentativeId").GetInt64());
  var report=await admin.GetFromJsonAsync<JsonElement>("/api/sales-partners/accounting");Assert.Equal(0,report.GetProperty("earnedMinor").GetInt64());
 }
}
