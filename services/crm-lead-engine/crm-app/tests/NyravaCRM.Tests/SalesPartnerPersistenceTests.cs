using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NyravaCRM.SalesPartners;
using Xunit;
namespace NyravaCRM.Tests;
public sealed class SalesPartnerPersistenceTests
{
    [Fact]
    public async Task Billing_event_retries_are_rejected_by_database_unique_constraint()
    {
        await using var c=new SqliteConnection("Data Source=:memory:");await c.OpenAsync();
        var options=new DbContextOptionsBuilder<SalesPartnerDb>().UseSqlite(c).Options;
        await using(var db=new SalesPartnerDb(options))
        {
            await db.Database.EnsureCreatedAsync();
            db.Add(new SalesIdentity{Id=42});await db.SaveChangesAsync();
            db.BillingEvents.Add(new PartnerBillingEvent{ProviderEventId="evt_once",SubscriberUserId=42});
            await db.SaveChangesAsync();
        }
        await using(var db=new SalesPartnerDb(options))
        {
            db.BillingEvents.Add(new PartnerBillingEvent{ProviderEventId="evt_once",SubscriberUserId=42});
            await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());
        }
    }
    [Fact]
    public async Task Original_billing_facts_cannot_be_rewritten_or_deleted()
    {
        await using var c=new SqliteConnection("Data Source=:memory:");await c.OpenAsync();
        await using var db=new SalesPartnerDb(new DbContextOptionsBuilder<SalesPartnerDb>().UseSqlite(c).Options);
        await db.Database.EnsureCreatedAsync();
            db.Add(new SalesIdentity{Id=42});await db.SaveChangesAsync();
        var item=new PartnerBillingEvent{ProviderEventId="evt_immutable",SubscriberUserId=42,ReceivedMinor=34900};db.Add(item);await db.SaveChangesAsync();
        item.ReceivedMinor=0;await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
        db.Entry(item).State=EntityState.Unchanged;db.Remove(item);await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
}
