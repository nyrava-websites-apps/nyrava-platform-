using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class TeamInvitationConfigurationTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public TeamInvitationConfigurationTests(CrmApplicationFactory factory)
    {
        factory.TeamInvitationsEnabled = false;
        _factory = factory;
    }

    [Fact]
    public async Task Installation_can_disable_team_invitations_without_disabling_subscriber_signup()
    {
        using var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var email = $"no-invites-{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/register", new { email, password = "AuditCRM!2026Pass" })).StatusCode);
        await _factory.GrantAuthorizedTestAccessAsync(email);

        var team = await client.GetFromJsonAsync<TeamResponse>("/api/team");
        Assert.NotNull(team);
        Assert.False(team.TeamInvitationsEnabled);
        Assert.False(team.CanInvite);

        var invite = await client.PostAsJsonAsync("/api/team/invitations", new { email = "teammate@example.test" });
        Assert.Equal(HttpStatusCode.Forbidden, invite.StatusCode);
    }

    private sealed record TeamResponse(bool CanInvite, bool TeamInvitationsEnabled);
}
