using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class TerritoryCapacityTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;
    public TerritoryCapacityTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Anonymous_visitors_can_check_ZIP_capacity_before_signup()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var zip = RandomZip();

        var response = await client.GetAsync($"/api/territories/check/{zip}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(zip, json.RootElement.GetProperty("zip").GetString());
        Assert.Equal(2, json.RootElement.GetProperty("maxSlots").GetInt32());
        Assert.Equal(0, json.RootElement.GetProperty("occupied").GetInt32());
        Assert.Equal(2, json.RootElement.GetProperty("availableSlots").GetInt32());
    }

    [Fact]
    public async Task Capacity_remains_available_after_unpaid_registration()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var zip = RandomZip();
        var email = $"zip-capacity-{Guid.NewGuid():N}@example.test";
        var registration = await client.PostAsJsonAsync("/api/register", new {
            email,
            password = "BillingTest!2026Pass",
            country = "US",
            postalCode = zip,
            subscribedZipCodes = zip
        });
        Assert.Equal(HttpStatusCode.OK, registration.StatusCode);

        var unpaid = await GetCapacity(client, zip);
        Assert.Equal(0, unpaid.Occupied);
        Assert.Equal(2, unpaid.AvailableSlots);

    }

    [Theory]
    [InlineData("abcde")]
    [InlineData("1234")]
    [InlineData("123456")]
    public async Task ZIP_capacity_rejects_invalid_public_input(string zip)
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.GetAsync($"/api/territories/check/{zip}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static string RandomZip() => (10000 + RandomNumberGenerator.GetInt32(0, 80000)).ToString(System.Globalization.CultureInfo.InvariantCulture);

    private static async Task<CapacityResponse> GetCapacity(HttpClient client, string zip)
    {
        var response = await client.GetFromJsonAsync<JsonElement>($"/api/territories/check/{zip}");
        return new CapacityResponse(
            response.GetProperty("occupied").GetInt32(),
            response.GetProperty("availableSlots").GetInt32());
    }

    private sealed record CapacityResponse(int Occupied, int AvailableSlots);
}
