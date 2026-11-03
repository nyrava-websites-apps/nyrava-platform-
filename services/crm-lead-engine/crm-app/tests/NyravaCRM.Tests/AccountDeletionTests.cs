using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
namespace NyravaCRM.Tests;
public class AccountDeletionTests
{
 [Fact]
 public async Task Admin_deletes_unused_account_and_stale_session_cannot_return()
 {
  await using var factory=new CrmApplicationFactory{SalesPartnersEnabled=true,BootstrapAdminEnabled=true};
  using var admin=factory.CreateClient();using var owner=factory.CreateClient();using var other=factory.CreateClient();
  (await admin.PostAsJsonAsync("/api/login",new{email=factory.BootstrapAdminEmail,password=factory.BootstrapAdminPassword})).EnsureSuccessStatusCode();
  var email="delete-isolated@example.test";var password="Isolated-Deletion-2026!";
  var registered=await owner.PostAsJsonAsync("/api/register",new{email,password});registered.EnsureSuccessStatusCode();var id=(await registered.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("user").GetProperty("id").GetInt64();
  (await other.PostAsJsonAsync("/api/register",new{email="preserved-isolated@example.test",password})).EnsureSuccessStatusCode();
  Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync($"/api/admin/accounts/{id}/deletion")).StatusCode);
  var review=await admin.GetFromJsonAsync<JsonElement>($"/api/admin/accounts/{id}/deletion");Assert.True(review.GetProperty("canDelete").GetBoolean());
  async Task<HttpResponseMessage> Delete(string confirmedEmail)=>await admin.SendAsync(new HttpRequestMessage(HttpMethod.Delete,$"/api/admin/accounts/{id}"){Content=JsonContent.Create(new{confirmed=true,confirmedEmail})});
  Assert.Equal(HttpStatusCode.BadRequest,(await Delete("wrong@example.test")).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await owner.GetAsync("/api/auth/me")).StatusCode);
  var deleted=await Delete(email);Assert.True(deleted.IsSuccessStatusCode,await deleted.Content.ReadAsStringAsync());Assert.True((await deleted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("deleted").GetBoolean());
  Assert.Equal(HttpStatusCode.Unauthorized,(await owner.GetAsync("/api/auth/me")).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await admin.GetAsync($"/api/admin/accounts/{id}/deletion")).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await other.GetAsync("/api/auth/me")).StatusCode);
  Assert.Equal(HttpStatusCode.Unauthorized,(await owner.PostAsJsonAsync("/api/login",new{email,password})).StatusCode);
  var me=await admin.GetFromJsonAsync<JsonElement>("/api/auth/me");var adminReview=await admin.GetFromJsonAsync<JsonElement>($"/api/admin/accounts/{me.GetProperty("id").GetInt64()}/deletion");Assert.False(adminReview.GetProperty("canDelete").GetBoolean());
 }
}
