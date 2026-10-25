using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace NyravaCRM.Tests;

public sealed class ActivityLifecycleTests : IClassFixture<CrmApplicationFactory>
{
    private readonly CrmApplicationFactory _factory;

    public ActivityLifecycleTests(CrmApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Appointment_can_be_scheduled_without_an_end_time_and_record_outcome_history()
    {
        using var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var email = $"calendar-{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/register", new { email, password = "AuditCRM!2026Pass" })).StatusCode);

        var contactResponse = await client.PostAsJsonAsync("/api/contacts", new
        {
            name = "Calendar Contact", email = "calendar@example.test", phone = (string?)null,
            company = (string?)null, leadType = "Seller"
        });
        Assert.Equal(HttpStatusCode.Created, contactResponse.StatusCode);
        using var contactJson = JsonDocument.Parse(await contactResponse.Content.ReadAsStringAsync());
        var contactId = contactJson.RootElement.GetProperty("id").GetInt64();

        var startsAt = DateTimeOffset.UtcNow.AddDays(2);
        var appointmentResponse = await client.PostAsJsonAsync("/api/activities", new
        {
            contactId, kind = "Appointment", title = "Seller consultation",
            details = "Review property and next steps.", location = "Video call link",
            timeZone = "UTC", startsAt
        });
        Assert.Equal(HttpStatusCode.Created, appointmentResponse.StatusCode);
        using var appointmentJson = JsonDocument.Parse(await appointmentResponse.Content.ReadAsStringAsync());
        var appointmentId = appointmentJson.RootElement.GetProperty("id").GetInt64();
        Assert.Equal(startsAt, appointmentJson.RootElement.GetProperty("endsAt").GetDateTimeOffset());

        var result = await client.PostAsJsonAsync($"/api/activities/{appointmentId}/result", new
        {
            result = "Held", notes = "Client requested a valuation follow-up."
        });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        using var resultJson = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
        Assert.True(resultJson.RootElement.GetProperty("completed").GetBoolean());
        Assert.Equal("Held", resultJson.RootElement.GetProperty("result").GetString());
        using var history = JsonDocument.Parse(resultJson.RootElement.GetProperty("resultHistory").GetString()!);
        Assert.Single(history.RootElement.EnumerateArray());

        var revisedResult = await client.PostAsJsonAsync($"/api/activities/{appointmentId}/result", new
        {
            result = "Rescheduled", notes = "Client asked to move the meeting."
        });
        Assert.Equal(HttpStatusCode.OK, revisedResult.StatusCode);
        using var revisedJson = JsonDocument.Parse(await revisedResult.Content.ReadAsStringAsync());
        using var revisedHistory = JsonDocument.Parse(revisedJson.RootElement.GetProperty("resultHistory").GetString()!);
        Assert.Equal(2, revisedHistory.RootElement.GetArrayLength());
        Assert.Equal("Rescheduled", revisedJson.RootElement.GetProperty("result").GetString());

        var invalidResult = await client.PostAsJsonAsync($"/api/activities/{appointmentId}/result", new
        {
            result = "Unknown", notes = "Should be rejected"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidResult.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/activities/{appointmentId}")).StatusCode);
    }
}
