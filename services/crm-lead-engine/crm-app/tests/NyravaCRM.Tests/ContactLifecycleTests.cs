using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class ContactLifecycleTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public ContactLifecycleTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Subscriber_can_create_update_archive_restore_and_isolate_contacts_by_workspace()
    {
        using var owner = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var ownerEmail = $"owner-{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsJsonAsync("/api/register", new { email = ownerEmail, password = "AuditCRM!2026Pass" })).StatusCode);

        var malformedContact = await owner.PostAsJsonAsync("/api/contacts", new
        {
            name = "Invalid Contact", email = "not-an-email", phone = (string?)null,
            company = new string('x', 161), leadType = "Buyer"
        });
        Assert.Equal(HttpStatusCode.BadRequest, malformedContact.StatusCode);

        var created = await owner.PostAsJsonAsync("/api/contacts", new
        {
            name = "Jordan Contact",
            email = "jordan@example.test",
            phone = "+1 555 0100",
            company = "Example Realty",
            leadType = "Buyer"
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var contactJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var contactId = contactJson.RootElement.GetProperty("id").GetInt64();

        var updated = await owner.PutAsJsonAsync($"/api/contacts/{contactId}", new
        {
            name = "Jordan Updated",
            email = "jordan@example.test",
            phone = "+1 555 0100",
            company = "Example Realty",
            stage = "Verified Lead",
            notes = "Requested a follow-up.",
            leadType = "Buyer"
        });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Contains("Verified Lead", await updated.Content.ReadAsStringAsync());

        var markedLost = await owner.PutAsJsonAsync($"/api/contacts/{contactId}", new
        {
            name = "Jordan Updated",
            email = "jordan@example.test",
            phone = "+1 555 0100",
            company = "Example Realty",
            stage = "Lost Lead",
            notes = "Closed without conversion.",
            leadType = "Buyer"
        });
        Assert.Equal(HttpStatusCode.OK, markedLost.StatusCode);

        var noteCreated = await owner.PostAsJsonAsync("/api/activities", new
        {
            contactId,
            kind = "Note",
            title = "Initial note",
            details = "Capture the first conversation.",
            startsAt = DateTimeOffset.UtcNow
        });
        Assert.Equal(HttpStatusCode.Created, noteCreated.StatusCode);
        using var noteJson = JsonDocument.Parse(await noteCreated.Content.ReadAsStringAsync());
        var noteId = noteJson.RootElement.GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync($"/api/activities/{noteId}", new
        {
            contactId,
            kind = "Note",
            title = "Updated note",
            details = "Capture the updated conversation.",
            startsAt = DateTimeOffset.UtcNow
        })).StatusCode);

        using var otherWorkspace = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var otherEmail = $"other-{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.OK, (await otherWorkspace.PostAsJsonAsync("/api/register", new { email = otherEmail, password = "AuditCRM!2026Pass" })).StatusCode);
        var otherContacts = await otherWorkspace.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(otherContacts);
        Assert.Empty(otherContacts);
        Assert.Equal(HttpStatusCode.NotFound, (await otherWorkspace.PutAsJsonAsync($"/api/contacts/{contactId}", new
        {
            name = "Unauthorized edit", email = (string?)null, phone = (string?)null,
            company = (string?)null, stage = "New", notes = (string?)null, leadType = "Other"
        })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/contacts/{contactId}")).StatusCode);
        var active = await owner.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(active);
        Assert.Empty(active);
        var archived = await owner.GetFromJsonAsync<JsonElement[]>("/api/contacts/archived");
        Assert.NotNull(archived);
        Assert.Single(archived);
        Assert.Equal("Jordan Updated", archived[0].GetProperty("name").GetString());

        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/contacts/{contactId}/restore", content: null)).StatusCode);
        var restored = await owner.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(restored);
        Assert.Single(restored);
        Assert.Equal("Lost Lead", restored[0].GetProperty("stage").GetString());
        var history = await owner.GetFromJsonAsync<JsonElement[]>("/api/activities");
        Assert.NotNull(history);
        Assert.Contains(history, item => item.GetProperty("id").GetInt64() == noteId && item.GetProperty("title").GetString() == "Updated note");
    }
}
