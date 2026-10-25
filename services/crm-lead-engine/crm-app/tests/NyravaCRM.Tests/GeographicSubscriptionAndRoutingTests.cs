using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class GeographicSubscriptionAndRoutingTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public GeographicSubscriptionAndRoutingTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Geographic_eligibility_and_pricing_endpoint_returns_correct_rules()
    {
        using var client = _factory.CreateClient();

        // US standard market
        var usQuote = await client.GetFromJsonAsync<JsonElement>("/api/eligibility?country=US&postalCode=78701&plan=monthly");
        Assert.True(usQuote.GetProperty("eligible").GetBoolean());
        Assert.Equal(299.00m, usQuote.GetProperty("price").GetDecimal());
        Assert.Equal("USD", usQuote.GetProperty("currency").GetString());
        Assert.Equal("Monthly", usQuote.GetProperty("billingFrequency").GetString());

        // US Annual option
        var usAnnual = await client.GetFromJsonAsync<JsonElement>("/api/eligibility?country=US&postalCode=78701&plan=annual");
        Assert.True(usAnnual.GetProperty("eligible").GetBoolean());
        Assert.Equal(2990.00m, usAnnual.GetProperty("price").GetDecimal());
        Assert.Equal("Annual", usAnnual.GetProperty("billingFrequency").GetString());

        // Invalid US postal code format
        var invalidZip = await client.GetFromJsonAsync<JsonElement>("/api/eligibility?country=US&postalCode=ABCDE");
        Assert.False(invalidZip.GetProperty("eligible").GetBoolean());

        // Unsupported country
        var unsupported = await client.GetFromJsonAsync<JsonElement>("/api/eligibility?country=XX&postalCode=12345");
        Assert.False(unsupported.GetProperty("eligible").GetBoolean());
    }

    [Fact]
    public async Task Registration_enforces_postal_code_and_country_eligibility()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // Invalid postal code for US
        var badZipRes = await client.PostAsJsonAsync("/api/register", new {
            email = $"realtor-{Guid.NewGuid():N}@example.test",
            password = "RealtorPassword!2026",
            country = "US",
            postalCode = "invalid-zip"
        });
        Assert.Equal(HttpStatusCode.BadRequest, badZipRes.StatusCode);

        // Valid registration sets Active subscription and territory
        var validEmail = $"realtor-{Guid.NewGuid():N}@example.test";
        var goodRes = await client.PostAsJsonAsync("/api/register", new {
            email = validEmail,
            password = "RealtorPassword!2026",
            country = "US",
            postalCode = "78701",
            subscribedZipCodes = "78701, 78702",
            plan = "monthly"
        });
        Assert.Equal(HttpStatusCode.OK, goodRes.StatusCode);

        var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
        Assert.Equal("US", me.GetProperty("country").GetString());
        Assert.Equal("78701", me.GetProperty("postalCode").GetString());
        Assert.Equal("Active", me.GetProperty("subscriptionStatus").GetString());
        Assert.Equal(299.00m, me.GetProperty("subscriptionPrice").GetDecimal());
    }

    [Fact]
    public async Task Inbound_lead_routes_to_subscribed_realtor_by_zip_code()
    {
        // 1. Create Realtor covering Austin ZIP 78701
        using var austinRealtor = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var austinEmail = $"austin-{Guid.NewGuid():N}@example.test";
        await austinRealtor.PostAsJsonAsync("/api/register", new {
            email = austinEmail,
            password = "AustinRealtor!2026",
            country = "US",
            postalCode = "78701",
            subscribedZipCodes = "78701"
        });

        // 2. Create Realtor covering Tampa ZIP 33629
        using var tampaRealtor = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var tampaEmail = $"tampa-{Guid.NewGuid():N}@example.test";
        await tampaRealtor.PostAsJsonAsync("/api/register", new {
            email = tampaEmail,
            password = "TampaRealtor!2026",
            country = "US",
            postalCode = "33629",
            subscribedZipCodes = "33629"
        });

        // 3. Generate Integration Key on Austin Realtor (representing the lead engine connection)
        var keyRes = await austinRealtor.PostAsJsonAsync("/api/integrations/keys", new { name = "Lead Engine Feed" });
        using var keyJson = JsonDocument.Parse(await keyRes.Content.ReadAsStringAsync());
        var token = keyJson.RootElement.GetProperty("token").GetString()!;

        using var leadEngineClient = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        leadEngineClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // 4. Send Tampa FSBO lead (ZIP 33629)
        var now = DateTimeOffset.UtcNow;
        var tampaLead = new {
            externalLeadId = $"fsbo-tampa-{Guid.NewGuid():N}",
            source = "Fsbo",
            name = "Tampa Homeowner",
            phone = "+18134429182",
            email = "tampaowner@test.org",
            leadType = "Seller",
            propertyZipCode = "33629",
            contactVerificationMethod = "Phone",
            contactVerifiedAt = now,
            intentVerifiedAt = now,
            consentCapturedAt = now,
            consentRecipient = "Subscribed Local Realtor",
            consentText = "Direct FSBO homeowner listing.",
            sourceUrl = "https://socialfeed.net/fsbo/tampa-1",
            externalFsbo = true,
            fsboAdminReviewReference = "QUALIFIED-FSBO",
            fsboAdminReviewedAt = now
        };

        var postRes = await leadEngineClient.PostAsJsonAsync("/api/v1/inbound-leads", tampaLead);
        Assert.Equal(HttpStatusCode.Created, postRes.StatusCode);

        // 5. Verify Tampa Realtor received the lead in their CRM workspace
        var tampaContacts = await tampaRealtor.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(tampaContacts);
        Assert.Contains(tampaContacts, c => c.GetProperty("propertyZipCode").GetString() == "33629");

        // 6. Verify Austin Realtor's workspace was NOT polluted with the Tampa lead
        var austinContacts = await austinRealtor.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(austinContacts);
        Assert.DoesNotContain(austinContacts, c => c.GetProperty("propertyZipCode").GetString() == "33629");
    }
}
