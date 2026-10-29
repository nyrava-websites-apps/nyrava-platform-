using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class BootstrapSecurityTests
{
    [Fact]
    public async Task Configured_bootstrap_admin_can_sign_in()
    {
        using var factory = new CrmApplicationFactory { BootstrapAdminEnabled = true };
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = factory.BootstrapAdminEmail,
            password = factory.BootstrapAdminPassword
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Startup_preserves_an_existing_admin_password()
    {
        using var factory = new CrmApplicationFactory
        {
            BootstrapAdminEnabled = true,
            SeedExistingAdmin = true
        };
        using var client = factory.CreateClient();

        var existingPasswordLogin = await client.PostAsJsonAsync("/api/login", new
        {
            email = factory.BootstrapAdminEmail,
            password = factory.ExistingAdminPassword
        });
        var configuredPasswordLogin = await client.PostAsJsonAsync("/api/login", new
        {
            email = factory.BootstrapAdminEmail,
            password = factory.BootstrapAdminPassword
        });

        Assert.Equal(HttpStatusCode.OK, existingPasswordLogin.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, configuredPasswordLogin.StatusCode);
    }
}
