using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NyravaCRM;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class InvitationAcceptanceTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public InvitationAcceptanceTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Normal_invitation_is_email_bound_expiring_and_single_use()
    {
        using var subscriber = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var invited = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var ownerEmail = $"invite-owner-{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.OK, (await subscriber.PostAsJsonAsync("/api/register", new { email = ownerEmail, password = "AuditCRM!2026Pass" })).StatusCode);
        var identity = await subscriber.GetFromJsonAsync<JsonElement>("/api/me");
        var ownerId = identity.GetProperty("id").GetInt64();

        var missingSmtp = await subscriber.PostAsJsonAsync("/api/team/invitations", new { email = $"smtp-{Guid.NewGuid():N}@example.test" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, missingSmtp.StatusCode);

        var targetEmail = $"invite-target-{Guid.NewGuid():N}@example.test";
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
            db.Invitations.Add(new CrmInvitation
            {
                OwnerUserId = ownerId,
                Email = targetEmail,
                TokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(7)
            });
            db.Invitations.Add(new CrmInvitation
            {
                OwnerUserId = ownerId,
                Email = $"expired-{Guid.NewGuid():N}@example.test",
                TokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("expired-token"))),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1)
            });
            await db.SaveChangesAsync();
        }

        var wrongEmail = await invited.PostAsJsonAsync("/api/register", new
        {
            email = $"wrong-{Guid.NewGuid():N}@example.test", password = "AuditCRM!2026Pass", invitationCode = token
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongEmail.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await invited.GetAsync("/api/me")).StatusCode);

        var accepted = await invited.PostAsJsonAsync("/api/register", new
        {
            email = targetEmail, password = "AuditCRM!2026Pass", invitationCode = token
        });
        Assert.True(accepted.StatusCode == HttpStatusCode.OK, await accepted.Content.ReadAsStringAsync());
        var member = await invited.GetFromJsonAsync<JsonElement>("/api/me");
        Assert.Equal("Employee", member.GetProperty("role").GetString());
        Assert.Equal(ownerId, member.GetProperty("workspaceId").GetInt64());

        var reused = await subscriber.PostAsJsonAsync("/api/register", new
        {
            email = $"reuse-{Guid.NewGuid():N}@example.test", password = "AuditCRM!2026Pass", invitationCode = token
        });
        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);

        var expired = await subscriber.PostAsJsonAsync("/api/register", new
        {
            email = $"expired-{Guid.NewGuid():N}@example.test", password = "AuditCRM!2026Pass", invitationCode = "expired-token"
        });
        Assert.Equal(HttpStatusCode.BadRequest, expired.StatusCode);
    }
}
