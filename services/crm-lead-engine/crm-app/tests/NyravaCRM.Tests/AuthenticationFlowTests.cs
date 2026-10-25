using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class AuthenticationFlowTests : IClassFixture<CrmApplicationFactory>
{
    private readonly HttpClient _client;

    public AuthenticationFlowTests(CrmApplicationFactory factory)
    {
        _client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    [Fact]
    public async Task Subscriber_can_register_sign_in_sign_out_and_sign_in_again()
    {
        var email = $"audit-{Guid.NewGuid():N}@example.test";
        const string password = "AuditCRM!2026Pass";

        var register = await _client.PostAsJsonAsync("/api/register", new { email, password });
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);

        var me = await _client.GetFromJsonAsync<IdentityResponse>("/api/me");
        Assert.NotNull(me);
        Assert.Equal(email, me.Email);
        Assert.Equal("Owner", me.Role);
        Assert.Equal(me.Id, me.WorkspaceId);

        var duplicate = await _client.PostAsJsonAsync("/api/register", new { email, password });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        var logout = await _client.PostAsync("/api/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var afterLogout = await _client.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogout.StatusCode);

        var wrongPassword = await _client.PostAsJsonAsync("/api/login", new { email, password = "IncorrectPass!2026" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);

        var login = await _client.PostAsJsonAsync("/api/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Registration_and_login_reject_missing_or_invalid_credentials_without_server_errors()
    {
        var missingRegistration = await _client.PostAsJsonAsync("/api/register", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missingRegistration.StatusCode);

        var malformedRegistration = await _client.PostAsJsonAsync("/api/register", new { email = "not-an-email", password = "AuditCRM!2026Pass" });
        Assert.Equal(HttpStatusCode.BadRequest, malformedRegistration.StatusCode);

        var shortPassword = await _client.PostAsJsonAsync("/api/register", new { email = $"short-{Guid.NewGuid():N}@example.test", password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, shortPassword.StatusCode);

        var missingLogin = await _client.PostAsJsonAsync("/api/login", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, missingLogin.StatusCode);

        var unauthorizedApi = await _client.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorizedApi.StatusCode);
    }
}

public sealed record IdentityResponse(long Id, string Email, string Role, long WorkspaceId);
