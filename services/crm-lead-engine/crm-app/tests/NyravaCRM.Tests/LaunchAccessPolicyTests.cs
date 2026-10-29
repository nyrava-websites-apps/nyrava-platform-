using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class LaunchAccessPolicyTests
{
    [Fact]
    public void Only_verified_paid_or_explicitly_exempt_owners_receive_leads()
    {
        var owner = new CrmUser { Role = "Owner", SubscriptionStatus = "Active" };
        Assert.False(GeographicService.IsLeadDeliveryPermitted(owner));
        owner.SubscriptionNonBillingAccessGrantedAt = DateTimeOffset.UtcNow;
        Assert.True(GeographicService.IsLeadDeliveryPermitted(owner));
        owner.Role = "Employee";
        Assert.False(GeographicService.IsLeadDeliveryPermitted(owner));
        owner.Role = "Owner"; owner.SubscriptionNonBillingAccessGrantedAt = null;
        owner.SubscriptionEntitlementVerifiedAt = DateTimeOffset.UtcNow;
        Assert.True(GeographicService.IsLeadDeliveryPermitted(owner));
        owner.SubscriptionStatus = "FreeOrTrial";
        Assert.False(GeographicService.IsLeadDeliveryPermitted(owner));
        owner.SubscriptionStatus = "Active"; owner.SubscriptionCurrentPeriodEnd = DateTimeOffset.UtcNow.AddDays(-1);
        Assert.False(GeographicService.IsLeadDeliveryPermitted(owner));
    }

    [Fact]
    public async Task Unpaid_owner_can_view_billing_but_cannot_use_crm()
    {
        using var factory = new CrmApplicationFactory();
        using var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/register", new { email = "unpaid-policy@example.test", password = "Test-only-Policy-2026!" });
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/billing/session")).StatusCode);
        Assert.Equal(HttpStatusCode.PaymentRequired, (await client.GetAsync("/api/contacts")).StatusCode);
        Assert.Equal(HttpStatusCode.PaymentRequired, (await client.GetAsync("/api/workbench/dashboard")).StatusCode);
    }

    [Fact]
    public async Task Exempt_owner_can_use_crm_and_its_reserved_zip_is_active()
    {
        using var factory = new CrmApplicationFactory();
        using var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/register", new { email = "exempt-policy@example.test", password = "Test-only-Policy-2026!" });
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            var user = await db.Users.SingleAsync(u => u.Email == "exempt-policy@example.test");
            user.SubscriptionNonBillingAccessGrantedAt = DateTimeOffset.UtcNow;
            user.SubscribedZipCodes = "75034";
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/contacts")).StatusCode);
        var billing = await client.GetFromJsonAsync<JsonElement>("/api/billing/session");
        Assert.Equal("AUTHORIZED_ACCESS", billing.GetProperty("billing").GetProperty("state").GetString());
        var zips = await client.GetFromJsonAsync<JsonElement>("/api/v1/active-territories");
        Assert.Contains(zips.GetProperty("activeZips").EnumerateArray(), z => z.GetString() == "75034");
    }

    [Fact]
    public async Task Admin_is_exempt_without_a_subscription()
    {
        using var factory = new CrmApplicationFactory { BootstrapAdminEnabled = true };
        using var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/login", new { email = factory.BootstrapAdminEmail, password = factory.BootstrapAdminPassword });
        var billing = await client.GetFromJsonAsync<JsonElement>("/api/billing/session");
        Assert.Equal("EXEMPT", billing.GetProperty("billing").GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/contacts")).StatusCode);
    }

    [Fact]
    public async Task Employee_only_sees_assigned_contacts_from_their_own_entitled_realtor()
    {
        using var factory = new CrmApplicationFactory();
        using var ownerClient = factory.CreateClient();
        await ownerClient.PostAsJsonAsync("/api/register", new { email = "team-owner-policy@example.test", password = "Test-only-Policy-2026!" });
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            var owner = await db.Users.SingleAsync(u => u.Email == "team-owner-policy@example.test");
            owner.SubscriptionNonBillingAccessGrantedAt = DateTimeOffset.UtcNow;
            var employee = new CrmUser { Email = "team-member-policy@example.test", PasswordHash = BCrypt.Net.BCrypt.HashPassword("Test-only-Policy-2026!"), Role = "Employee", WorkspaceId = owner.Id };
            var other = new CrmUser { Email = "other-owner-policy@example.test", Role = "Owner" };
            db.Users.AddRange(employee, other); await db.SaveChangesAsync();
            other.WorkspaceId = other.Id;
            db.Memberships.Add(new CrmMembership { UserId = employee.Id, OwnerUserId = owner.Id, Active = true });
            db.Contacts.AddRange(
                new CrmContact { Name = "Assigned in correct workspace", UserId = owner.Id, AssignedToUserId = employee.Id },
                new CrmContact { Name = "Unassigned to employee", UserId = owner.Id, AssignedToUserId = owner.Id },
                new CrmContact { Name = "Cross-workspace assignment must be hidden", UserId = other.Id, AssignedToUserId = employee.Id });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/login", new { email = "team-member-policy@example.test", password = "Test-only-Policy-2026!" })).StatusCode);
        var contacts = await client.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.Single(contacts!);
        Assert.Equal("Assigned in correct workspace", contacts![0].GetProperty("name").GetString());
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            var owner = await db.Users.SingleAsync(u => u.Email == "team-owner-policy@example.test");
            owner.SubscriptionNonBillingAccessGrantedAt = null; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.PaymentRequired, (await client.GetAsync("/api/contacts")).StatusCode);
    }
}
