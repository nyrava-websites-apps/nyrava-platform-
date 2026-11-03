using Microsoft.EntityFrameworkCore;using Microsoft.Extensions.DependencyInjection;using System.Net.Http.Json;using System.Text.Json;using NyravaCRM.SalesPartners;using Xunit;
namespace NyravaCRM.Tests;
public sealed class SalesPartnerMigrationTests
{
 [Fact] public async Task Versioned_schema_reuses_CRM_users_and_enforces_append_only_SQL()
 {
  await using var factory=new CrmApplicationFactory{SalesPartnersEnabled=true};using var client=factory.CreateClient();var response=await client.PostAsJsonAsync("/api/register",new{email="migration-subscriber@example.test",password="Migration-Isolated-2026!"});response.EnsureSuccessStatusCode();var result=await response.Content.ReadFromJsonAsync<JsonElement>();var userId=result.GetProperty("user").GetProperty("id").GetInt64();
  using var scope=factory.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<SalesPartnerDb>();
  var fact=new PartnerBillingEvent{ProviderEventId="evt_migration",SubscriberUserId=userId,ReceivedMinor=34900};db.Add(fact);await db.SaveChangesAsync();
  await Assert.ThrowsAnyAsync<Exception>(()=>db.Database.ExecuteSqlInterpolatedAsync($"UPDATE SalesPartnerBillingEvent SET ReceivedMinor=0 WHERE Id={fact.Id}"));
  await Assert.ThrowsAnyAsync<Exception>(()=>db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM Users WHERE Id={userId}"));
  await PartnerSchema.InstallAsync(db); // Migration reapplication preserves records.
  Assert.Equal(34900,(await db.BillingEvents.AsNoTracking().SingleAsync(x=>x.Id==fact.Id)).ReceivedMinor);
 }
}
