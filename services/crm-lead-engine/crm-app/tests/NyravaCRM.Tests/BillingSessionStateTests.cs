using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class BillingSessionStateTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public BillingSessionStateTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task New_subscriber_remains_unpaid_and_can_open_checkout()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var email = $"billing-{Guid.NewGuid():N}@example.test";

        var registration = await client.PostAsJsonAsync("/api/register", new {
            email,
            password = "BillingTest!2026Pass",
            country = "US",
            postalCode = "78701",
            plan = "monthly"
        });

        Assert.Equal(HttpStatusCode.OK, registration.StatusCode);
        using var registrationJson = JsonDocument.Parse(await registration.Content.ReadAsStringAsync());
        Assert.Equal("PaymentPending", registrationJson.RootElement.GetProperty("subscriptionStatus").GetString());

        var session = await client.GetAsync("/api/billing/session");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        using var sessionJson = JsonDocument.Parse(await session.Content.ReadAsStringAsync());
        var billing = sessionJson.RootElement.GetProperty("billing");
        Assert.Equal("PENDING", billing.GetProperty("state").GetString());
        Assert.True(billing.GetProperty("checkoutEnabled").GetBoolean());
        Assert.Equal("RealtorSubscriber", sessionJson.RootElement.GetProperty("role").GetString());
    }

    [Fact]
    public async Task Billing_session_requires_an_authenticated_CRM_account()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.GetAsync("/api/billing/session");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Unpaid_signup_does_not_publish_its_territory_as_available()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var email = $"unpaid-territory-{Guid.NewGuid():N}@example.test";
        var registration = await client.PostAsJsonAsync("/api/register", new {
            email,
            password = "BillingTest!2026Pass",
            country = "US",
            postalCode = "60601",
            subscribedZipCodes = "60601"
        });
        Assert.Equal(HttpStatusCode.OK, registration.StatusCode);

        var territoryResponse = await client.GetAsync("/api/v1/active-territories");
        var territoryBody = await territoryResponse.Content.ReadAsStringAsync();
        Assert.True(territoryResponse.StatusCode == HttpStatusCode.OK, territoryBody);
        using var territories = JsonDocument.Parse(territoryBody);
        Assert.DoesNotContain(territories.RootElement.GetProperty("activeZips").EnumerateArray(),
            zip => zip.GetString() == "60601");
    }
}
