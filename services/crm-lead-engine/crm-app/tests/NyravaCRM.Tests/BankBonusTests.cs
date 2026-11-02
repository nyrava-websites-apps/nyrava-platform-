using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class BankBonusTests
{
    [Fact]
    public async Task Only_fresh_verified_recipient_authorized_bank_lead_delivers_and_retry_is_idempotent()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<CrmDb>().UseSqlite(connection).Options;
        await using var db = new CrmDb(options);
        await db.Database.EnsureCreatedAsync();

        var now = DateTimeOffset.UtcNow;
        db.Users.AddRange(
            new CrmUser { Id = 1, WorkspaceId = 1, Role = "Admin", Email = "admin@example.test" },
            new CrmUser { Id = 2, WorkspaceId = 2, Role = "Owner", Email = "agent@example.test",
                SubscriptionStatus = "Active", SubscriptionEntitlementVerifiedAt = now,
                SubscriptionCurrentPeriodEnd = now.AddMonths(1), SubscribedZipCodes = "75204" });
        db.Contacts.AddRange(
            Candidate(1, now.AddDays(-4), "agent@example.test", "75204"),
            Candidate(2, now.AddDays(-31), "agent@example.test", "75204"),
            Candidate(3, null, "agent@example.test", "75204"),
            Candidate(4, now.AddDays(-4), "someone-else@example.test", "75204"),
            Candidate(5, now.AddDays(-4), "agent@example.test", "85003"));
        await db.SaveChangesAsync();

        Assert.Equal(1, await BankDispatchService.DeliverEligibleBankBonus(db, 2));
        Assert.Equal(0, await BankDispatchService.DeliverEligibleBankBonus(db, 2));
        Assert.Equal(1, await db.Contacts.CountAsync(c => c.UserId == 2 && c.Source == "Nyrava Verified"));
        Assert.Equal(1, await db.Contacts.CountAsync(c => c.UserId == 2 && c.Notes != null && c.Notes.Contains("[Bank Bonus]")));
    }

    [Fact]
    public async Task Unpaid_owner_never_receives_bank_leads()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<CrmDb>().UseSqlite(connection).Options;
        await using var db = new CrmDb(options);
        await db.Database.EnsureCreatedAsync();
        db.Users.AddRange(
            new CrmUser { Id=1, WorkspaceId=1, Role="Admin", Email="admin@example.test" },
            new CrmUser { Id=2, WorkspaceId=2, Role="Owner", Email="agent@example.test",
                SubscriptionStatus="PaymentPending", SubscribedZipCodes="75204" });
        db.Contacts.Add(Candidate(1, DateTimeOffset.UtcNow.AddDays(-1), "agent@example.test", "75204"));
        await db.SaveChangesAsync();
        Assert.Equal(0, await BankDispatchService.DeliverEligibleBankBonus(db, 2));
    }

    private static CrmContact Candidate(int id, DateTimeOffset? discovered, string recipient, string zip)
    {
        var now=DateTimeOffset.UtcNow;
        return new CrmContact {
            Id=id, UserId=1, Name="Example Homeowner", Phone="2145550101",
            Source="Fsbo", ExternalLeadId="fsbo-"+id, Stage="New", LeadType="Seller",
            PropertyZipCode=zip, SourceUrl="https://example.test/listing/"+id,
            DiscoveredAt=discovered, UpdatedAt=now,
            ContactVerificationMethod="Phone", ContactVerifiedAt=now.AddHours(-2),
            IntentVerifiedAt=now.AddHours(-2), ConsentCapturedAt=now.AddHours(-2),
            ConsentText="Homeowner explicitly authorized this specific agent to contact them.",
            ConsentRecipient=recipient, ExternalFsbo=true,
            FsboAdminReviewReference="review-"+id, FsboAdminReviewedAt=now.AddHours(-1)
        };
    }
}
