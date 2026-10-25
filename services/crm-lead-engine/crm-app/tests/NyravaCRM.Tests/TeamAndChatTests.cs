using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class TeamAndChatTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public TeamAndChatTests(CrmApplicationFactory factory)
    {
        factory.DemoMode = true;
        _factory = factory;
    }

    [Fact]
    public async Task Subscriber_can_invite_and_manage_members_while_team_access_stays_scoped()
    {
        using var subscriber = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var employee = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var invited = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var demoInfo = await subscriber.GetFromJsonAsync<JsonElement>("/api/demo-info");
        Assert.True(demoInfo.GetProperty("enabled").GetBoolean());
        var subscriberLogin = await subscriber.PostAsJsonAsync("/api/login", new { email = "testone@example.test", password = "DemoCRM!2026TestOne" });
        Assert.True(subscriberLogin.StatusCode == HttpStatusCode.OK, await subscriberLogin.Content.ReadAsStringAsync());
        var employeeLogin = await employee.PostAsJsonAsync("/api/login", new { email = "testtwo@example.test", password = "DemoCRM!2026TestTwo" });
        Assert.True(employeeLogin.StatusCode == HttpStatusCode.OK, await employeeLogin.Content.ReadAsStringAsync());

        var owner = await subscriber.GetFromJsonAsync<JsonElement>("/api/me");
        var member = await employee.GetFromJsonAsync<JsonElement>("/api/me");
        var ownerId = owner.GetProperty("id").GetInt64();
        var memberId = member.GetProperty("id").GetInt64();
        Assert.Equal("Owner", owner.GetProperty("role").GetString());
        Assert.Equal("Employee", member.GetProperty("role").GetString());
        Assert.Equal(ownerId, member.GetProperty("workspaceId").GetInt64());

        var assignedContacts = await employee.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(assignedContacts);
        Assert.NotEmpty(assignedContacts);
        Assert.All(assignedContacts, contact => Assert.Equal(memberId, contact.GetProperty("assignedToUserId").GetInt64()));
        var subscriberContacts = await subscriber.GetFromJsonAsync<JsonElement[]>("/api/contacts");
        Assert.NotNull(subscriberContacts);
        Assert.True(subscriberContacts.Length > assignedContacts.Length);

        var deniedInvite = await employee.PostAsJsonAsync("/api/team/invitations", new { email = "blocked@example.test" });
        Assert.Equal(HttpStatusCode.Forbidden, deniedInvite.StatusCode);

        var ownerContacts = subscriberContacts.Where(contact => contact.GetProperty("assignedToUserId").GetInt64() == ownerId).ToArray();
        Assert.NotEmpty(ownerContacts);
        var subscriberContact = ownerContacts[0];
        var forbiddenEdit = await employee.PutAsJsonAsync($"/api/contacts/{subscriberContact.GetProperty("id").GetInt64()}", new
        {
            name = "Forbidden edit", email = (string?)null, phone = (string?)null,
            company = (string?)null, stage = "New", notes = (string?)null, leadType = "Other"
        });
        Assert.Equal(HttpStatusCode.NotFound, forbiddenEdit.StatusCode);

        var invitation = await subscriber.PostAsJsonAsync("/api/team/invitations", new { email = "new-member@example.test" });
        Assert.Equal(HttpStatusCode.OK, invitation.StatusCode);
        using var invitationJson = JsonDocument.Parse(await invitation.Content.ReadAsStringAsync());
        Assert.Equal("1234", invitationJson.RootElement.GetProperty("code").GetString());
        Assert.StartsWith("/index.html?invite=", invitationJson.RootElement.GetProperty("joinUrl").GetString());

        var wrongEmail = await invited.PostAsJsonAsync("/api/register", new
        {
            email = "wrong-member@example.test", password = "AuditCRM!2026Pass", invitationCode = "1234"
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongEmail.StatusCode);
        var accepted = await invited.PostAsJsonAsync("/api/register", new
        {
            email = "new-member@example.test", password = "AuditCRM!2026Pass", invitationCode = "1234"
        });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var newMember = await invited.GetFromJsonAsync<JsonElement>("/api/me");
        Assert.Equal("Employee", newMember.GetProperty("role").GetString());
        Assert.Equal(ownerId, newMember.GetProperty("workspaceId").GetInt64());

        var message = await employee.PostAsJsonAsync($"/api/chat/{ownerId}", new { body = "Audit team chat message" });
        Assert.Equal(HttpStatusCode.OK, message.StatusCode);
        var conversation = await subscriber.GetFromJsonAsync<JsonElement[]>($"/api/chat/{memberId}");
        Assert.NotNull(conversation);
        Assert.Contains(conversation, row => row.GetProperty("body").GetString() == "Audit team chat message");

        foreach (var contact in assignedContacts)
        {
            var id = contact.GetProperty("id").GetInt64();
            var reassigned = await subscriber.PostAsJsonAsync($"/api/team/assign/{id}", new { userId = (long?)null });
            Assert.Equal(HttpStatusCode.OK, reassigned.StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await subscriber.PostAsync($"/api/team/{memberId}/deactivate", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await subscriber.PostAsync($"/api/team/{memberId}/activate", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync("/api/me")).StatusCode);
    }
}
