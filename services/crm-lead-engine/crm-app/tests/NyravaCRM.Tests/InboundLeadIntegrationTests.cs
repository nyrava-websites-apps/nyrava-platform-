using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class InboundLeadIntegrationTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public InboundLeadIntegrationTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Subscriber_can_optionally_create_and_revoke_workspace_scoped_integration_key()
    {
        using var subscriber = await CreateSubscriberAsync();
        var issued = await subscriber.PostAsJsonAsync("/api/integrations/keys", new { name = "Nyrava Home" });
        Assert.Equal(HttpStatusCode.Created, issued.StatusCode);
        using var issuedJson = JsonDocument.Parse(await issued.Content.ReadAsStringAsync());
        var keyId = issuedJson.RootElement.GetProperty("id").GetInt64();
        var token = issuedJson.RootElement.GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));

        var listed = await subscriber.GetFromJsonAsync<JsonElement[]>("/api/integrations/keys");
        Assert.NotNull(listed);
        Assert.Single(listed);
        Assert.False(listed[0].TryGetProperty("token", out _));

        Assert.Equal(HttpStatusCode.NoContent,
            (await subscriber.DeleteAsync($"/api/integrations/keys/{keyId}")).StatusCode);
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/inbound-leads", QualifiedLead())).StatusCode);
    }

    [Fact]
    public async Task Inbound_lead_requires_credential_and_qualification_evidence()
    {
        using var anonymous = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/v1/inbound-leads", QualifiedLead())).StatusCode);

        using var subscriber = await CreateSubscriberAsync();
        using var client = await CreateIntegrationClientAsync(subscriber);
        var invalid = QualifiedLead() with { ContactVerifiedAt = null };
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/inbound-leads", invalid)).StatusCode);
    }

    [Theory]
    [InlineData("Fsbo")]
    [InlineData("HomeEvaluation")]
    [InlineData("LeadGenerator")]
    [InlineData("RealtorAssistance")]
    public async Task Inbound_endpoint_accepts_each_configured_lead_source(string source)
    {
        using var subscriber = await CreateSubscriberAsync();
        using var integration = await CreateIntegrationClientAsync(subscriber);
        var response = await integration.PostAsJsonAsync("/api/v1/inbound-leads", QualifiedLead() with { Source = source });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task External_fsbo_requires_admin_review_and_approved_leads_are_idempotent_and_workspace_scoped()
    {
        using var subscriber = await CreateSubscriberAsync();
        using var integration = await CreateIntegrationClientAsync(subscriber);
        var externalFsbo = QualifiedLead() with { Source = "Fsbo", ExternalFsbo = true };
        Assert.Equal(HttpStatusCode.BadRequest,
            (await integration.PostAsJsonAsync("/api/v1/inbound-leads", externalFsbo)).StatusCode);

        externalFsbo = externalFsbo with {
            SourceUrl = "https://owner-listing.example.test/4521",
            FsboAdminReviewReference = "review-4521",
            FsboAdminReviewedAt = DateTimeOffset.UtcNow
        };
        using var otherSubscriber = await CreateSubscriberAsync();
        var otherIdentity = await otherSubscriber.GetFromJsonAsync<JsonElement>("/api/me");
        var payloadWithUntrustedWorkspace = JsonSerializer.SerializeToNode(externalFsbo)!.AsObject();
        payloadWithUntrustedWorkspace["workspaceId"] = otherIdentity.GetProperty("workspaceId").GetInt64();
        var first = await integration.PostAsJsonAsync("/api/v1/inbound-leads", payloadWithUntrustedWorkspace);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        using var firstJson = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
        var contactId = firstJson.RootElement.GetProperty("id").GetInt64();
        Assert.Equal("Fsbo", firstJson.RootElement.GetProperty("source").GetString());
        Assert.Equal("85201", firstJson.RootElement.GetProperty("propertyZipCode").GetString());
        Assert.Equal("review-4521", firstJson.RootElement.GetProperty("fsboAdminReviewReference").GetString());

        var retry = await integration.PostAsJsonAsync("/api/v1/inbound-leads", externalFsbo);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        using var retryJson = JsonDocument.Parse(await retry.Content.ReadAsStringAsync());
        Assert.Equal(contactId, retryJson.RootElement.GetProperty("id").GetInt64());

        var contacts = await subscriber.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(contacts);
        Assert.Single(contacts);
        Assert.Equal("New", contacts[0].GetProperty("stage").GetString());
        var otherContacts = await otherSubscriber.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(otherContacts);
        Assert.Empty(otherContacts);
    }

    private async Task<HttpClient> CreateSubscriberAsync()
    {
        var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var email = $"inbound-{Guid.NewGuid():N}@example.test";
        var result = await client.PostAsJsonAsync("/api/register", new { email, password = "AuditCRM!2026Pass" });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return client;
    }

    private async Task<HttpClient> CreateIntegrationClientAsync(HttpClient subscriber)
    {
        var issued = await subscriber.PostAsJsonAsync("/api/integrations/keys", new { name = "Test lead source" });
        Assert.Equal(HttpStatusCode.Created, issued.StatusCode);
        using var json = JsonDocument.Parse(await issued.Content.ReadAsStringAsync());
        var token = json.RootElement.GetProperty("token").GetString();
        var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static InboundLeadRequest QualifiedLead() => new(
        ExternalLeadId: $"source-{Guid.NewGuid():N}",
        Source: "HomeEvaluation",
        Name: "Jordan Sample",
        Email: "jordan@example.test",
        Phone: null,
        Company: null,
        LeadType: "Seller",
        PropertyZipCode: "85201",
        ContactVerificationMethod: "Email",
        ContactVerifiedAt: DateTimeOffset.UtcNow,
        IntentVerifiedAt: DateTimeOffset.UtcNow,
        ConsentCapturedAt: DateTimeOffset.UtcNow,
        ConsentRecipient: "Realtor Jordan Lee, Example Realty",
        ConsentText: "I authorize the named local Realtor to contact me about selling this property.",
        SourceUrl: null,
        ExternalFsbo: false,
        FsboAdminReviewReference: null,
        FsboAdminReviewedAt: null);
}

internal sealed record InboundLeadRequest(
    string ExternalLeadId,
    string Source,
    string Name,
    string? Email,
    string? Phone,
    string? Company,
    string LeadType,
    string PropertyZipCode,
    string ContactVerificationMethod,
    DateTimeOffset? ContactVerifiedAt,
    DateTimeOffset? IntentVerifiedAt,
    DateTimeOffset? ConsentCapturedAt,
    string? ConsentRecipient,
    string? ConsentText,
    string? SourceUrl,
    bool ExternalFsbo,
    string? FsboAdminReviewReference,
    DateTimeOffset? FsboAdminReviewedAt);
