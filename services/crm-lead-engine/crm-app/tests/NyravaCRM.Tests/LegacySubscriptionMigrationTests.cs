using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NyravaCRM;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class LegacySubscriptionMigrationTests
{
    [Fact]
    public async Task Legacy_admin_and_pro_realtor_keep_access_and_records_until_an_audited_decision()
    {
        using var factory = new CrmApplicationFactory
        {
            SeedLegacySubscriptionAccounts = true
        };
        factory.BootstrapRealtorEmail = factory.LegacyRealtorEmail;

        using var admin = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var realtor = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var adminLogin = await admin.PostAsJsonAsync("/api/login", new { email = factory.LegacyAdminEmail, password = factory.LegacyAdminPassword });
        Assert.Equal(HttpStatusCode.OK, adminLogin.StatusCode);
        using var adminLoginBody = JsonDocument.Parse(await adminLogin.Content.ReadAsStringAsync());
        Assert.Equal("Admin", adminLoginBody.RootElement.GetProperty("role").GetString());
        var adminId = adminLoginBody.RootElement.GetProperty("user").GetProperty("id").GetInt64();

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            db.Memberships.RemoveRange(await db.Memberships.Where(membership => membership.UserId == adminId).ToListAsync());
            await db.SaveChangesAsync();
        }

        var adminBilling = await admin.GetFromJsonAsync<JsonElement>("/api/billing/session");
        Assert.Equal("SuperAdmin", adminBilling.GetProperty("role").GetString());
        Assert.Equal("EXEMPT", adminBilling.GetProperty("billing").GetProperty("state").GetString());
        Assert.False(adminBilling.GetProperty("billing").GetProperty("checkoutEnabled").GetBoolean());

        var realtorLogin = await realtor.PostAsJsonAsync("/api/login", new { email = factory.LegacyRealtorEmail, password = factory.LegacyRealtorPassword });
        Assert.Equal(HttpStatusCode.OK, realtorLogin.StatusCode);
        using var realtorLoginBody = JsonDocument.Parse(await realtorLogin.Content.ReadAsStringAsync());
        var realtorId = realtorLoginBody.RootElement.GetProperty("user").GetProperty("id").GetInt64();
        Assert.Equal("Active", realtorLoginBody.RootElement.GetProperty("subscriptionStatus").GetString());

        // Legacy "Active" without verified entitlement must not silently bypass billing.
        Assert.Equal(HttpStatusCode.PaymentRequired, (await realtor.GetAsync("/api/contacts")).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            var realtorRecord = await db.Users.SingleAsync(user => user.Id == realtorId);
            Assert.Equal("Realtor PRO", realtorRecord.SubscriptionPlan);
            Assert.Null(realtorRecord.SubscriptionEntitlementVerifiedAt);
            Assert.Equal(realtorId, await db.Contacts.Where(contact => contact.Name == "Legacy Historical Contact").Select(contact => contact.UserId).SingleAsync());
            Assert.Equal(realtorId, await db.IntegrationKeys.Select(key => key.OwnerUserId).SingleAsync());
        }

        var realtorBilling = await realtor.GetFromJsonAsync<JsonElement>("/api/billing/session");
        Assert.Equal("LEGACY_REVIEW", realtorBilling.GetProperty("billing").GetProperty("state").GetString());
        Assert.False(realtorBilling.GetProperty("billing").GetProperty("checkoutEnabled").GetBoolean());

        var nonAdminDecision = await realtor.PostAsJsonAsync($"/api/admin/subscriptions/{realtorId}/review", new
        {
            action = "grant-nonbilling-access",
            reason = "Test-only authorization",
            evidenceReference = "test-approval-1"
        });
        Assert.Equal(HttpStatusCode.Forbidden, nonAdminDecision.StatusCode);

        var grant = await admin.PostAsJsonAsync($"/api/admin/subscriptions/{realtorId}/review", new
        {
            action = "grant-nonbilling-access",
            reason = "Retain existing workspace while historical billing records are reviewed.",
            evidenceReference = "support-case-legacy-1"
        });
        Assert.Equal(HttpStatusCode.OK, grant.StatusCode);

        realtorBilling = await realtor.GetFromJsonAsync<JsonElement>("/api/billing/session");
        Assert.Equal("AUTHORIZED_ACCESS", realtorBilling.GetProperty("billing").GetProperty("state").GetString());
        var historicalContacts = await realtor.GetFromJsonAsync<List<CrmContact>>("/api/contacts");
        var historicalContact = Assert.Single(historicalContacts!, contact => contact.Name == "Legacy Historical Contact");
        Assert.Equal("Won", historicalContact.Stage);
        Assert.False(realtorBilling.GetProperty("billing").GetProperty("checkoutEnabled").GetBoolean());
        var territories = await realtor.GetFromJsonAsync<JsonElement>("/api/v1/active-territories");
        Assert.DoesNotContain(territories.GetProperty("activeZips").EnumerateArray(), zip => zip.GetString() == "78701");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            var realtorRecord = await db.Users.SingleAsync(user => user.Id == realtorId);
            Assert.Equal("Active", realtorRecord.SubscriptionStatus);
            Assert.Null(realtorRecord.SubscriptionEntitlementVerifiedAt);
            var grantedAt = await ReadLegacyGrantColumn(db, "SubscriptionNonBillingAccessGrantedAt", realtorId);
            var grantedBy = await ReadLegacyGrantColumn(db, "SubscriptionNonBillingAccessGrantedByUserId", realtorId);
            Assert.NotNull(grantedAt);
            Assert.Equal(adminId.ToString(), Convert.ToString(grantedBy, System.Globalization.CultureInfo.InvariantCulture));
        }

        var audit = await admin.GetFromJsonAsync<JsonElement>($"/api/admin/subscriptions/{realtorId}/audit");
        Assert.Equal(1, audit.GetArrayLength());
        Assert.Equal("GrantNonBillingAccess", audit[0].GetProperty("action").GetString());
        Assert.Equal(adminId, audit[0].GetProperty("actorUserId").GetInt64());
        Assert.Equal("support-case-legacy-1", audit[0].GetProperty("evidenceReference").GetString());

        var verify = await admin.PostAsJsonAsync($"/api/admin/subscriptions/{realtorId}/review", new
        {
            action = "verify-billing",
            reason = "Legacy subscription evidence was reviewed and confirmed.",
            evidenceReference = "redacted-receipt-reference"
        });
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            var realtorRecord = await db.Users.SingleAsync(user => user.Id == realtorId);
            Assert.Equal("Active", realtorRecord.SubscriptionStatus);
            Assert.NotNull(realtorRecord.SubscriptionEntitlementVerifiedAt);
        }

        var verifiedTerritories = await realtor.GetFromJsonAsync<JsonElement>("/api/v1/active-territories");
        Assert.Contains(verifiedTerritories.GetProperty("activeZips").EnumerateArray(), zip => zip.GetString() == "78701");
        var completeAudit = await admin.GetFromJsonAsync<JsonElement>($"/api/admin/subscriptions/{realtorId}/audit");
        Assert.Equal(2, completeAudit.GetArrayLength());
        Assert.Equal("VerifyBilling", completeAudit[0].GetProperty("action").GetString());
        Assert.Equal("GrantNonBillingAccess", completeAudit[1].GetProperty("action").GetString());
    }

    private static async Task<object?> ReadLegacyGrantColumn(CrmDb db, string column, long userId)
    {
        var connection = db.Database.GetDbConnection();
        var wasClosed = connection.State != System.Data.ConnectionState.Open;
        if (wasClosed) await connection.OpenAsync();
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = $"SELECT {column} FROM Users WHERE Id = @id";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "@id";
            parameter.Value = userId;
            command.Parameters.Add(parameter);
            var value = await command.ExecuteScalarAsync();
            return value is DBNull ? null : value;
        }
        finally
        {
            if (wasClosed) await connection.CloseAsync();
        }
    }
}
