using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace NyravaCRM.Tests;

public sealed class WorkbenchTests : IClassFixture<CrmApplicationFactory>
{
    readonly CrmApplicationFactory factory;
    public WorkbenchTests(CrmApplicationFactory factory) => this.factory = factory;
    async Task<HttpClient> Owner()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var generatedTestPassword = $"Nyrava-{Guid.NewGuid():N}!Aa1";
        var email = $"audit-{Guid.NewGuid():N}@example.test";
        (await client.PostAsJsonAsync("/api/register", new { email, password = generatedTestPassword })).EnsureSuccessStatusCode();
        await factory.GrantAuthorizedTestAccessAsync(email);
        return client;
    }
    [Fact]
    public async Task Existing_database_contact_opens_with_actual_name_and_complete_arrays()
    {
        using var owner = await Owner();
        var created = await owner.PostAsJsonAsync("/api/contacts", new { name = "Recorded Name", leadType = "Buyer" });
        var contact = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = contact.GetProperty("id").GetInt64();
        var list = await owner.GetAsync("/api/workbench/workspace");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var workspace = await list.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Recorded Name", workspace.GetProperty("contacts")[0].GetProperty("fullName").GetString());
        var detail = await owner.GetFromJsonAsync<JsonElement>($"/api/workbench/contacts/manual/{id}");
        Assert.Equal("Recorded Name", detail.GetProperty("contact").GetProperty("fullName").GetString());
        foreach (var key in new[] { "notes", "tasks", "appointments", "communications" }) Assert.Equal(JsonValueKind.Array, detail.GetProperty(key).ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync("/api/workbench/contacts/platform/99999999")).StatusCode);
        using var other = await Owner();
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/workbench/contacts/manual/{id}")).StatusCode);
        using var anonymous = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/workbench/workspace")).StatusCode);
    }
    [Fact]
    public async Task Workbench_lifecycle_persists_and_archive_retains_history()
    {
        using var owner = await Owner();
        var created = await owner.PostAsJsonAsync("/api/workbench/contacts", new { fullName = "Isolated Workflow", email = "lead@example.test", leadType = "BUYER", zipCode = "78701", propertyAddress = "Test property", budgetMax = 350000, statement = "Isolated test only" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();
        var url = $"/api/workbench/contacts/manual/{id}";
        (await owner.PostAsJsonAsync(url + "/action", new { action = "note", text = "Persistent conversation" })).EnsureSuccessStatusCode();
        var start = DateTimeOffset.UtcNow.AddDays(1);
        (await owner.PostAsJsonAsync(url + "/action", new { action = "task", text = "Follow up", startsAt = start })).EnsureSuccessStatusCode();
        (await owner.PostAsJsonAsync(url + "/action", new { action = "appointment", text = "Consultation", startsAt = start, endsAt = start.AddMinutes(45) })).EnsureSuccessStatusCode();
        (await owner.PostAsJsonAsync(url + "/action", new { action = "status", text = "CLOSED" })).EnsureSuccessStatusCode();
        var detail = await owner.GetFromJsonAsync<JsonElement>(url);
        Assert.Contains(detail.GetProperty("notes").EnumerateArray(), x => x.GetProperty("details").GetString() == "Persistent conversation");
        Assert.Single(detail.GetProperty("tasks").EnumerateArray());
        Assert.Single(detail.GetProperty("appointments").EnumerateArray());
        Assert.Equal("CLOSED", detail.GetProperty("contact").GetProperty("crmStatus").GetString());
        Assert.Equal(350000, detail.GetProperty("contact").GetProperty("budgetMax").GetInt32());
        var appointment = detail.GetProperty("appointments")[0];
        Assert.Equal(TimeSpan.FromMinutes(45), appointment.GetProperty("endsAt").GetDateTimeOffset() - appointment.GetProperty("startsAt").GetDateTimeOffset());
        var taskId = detail.GetProperty("tasks")[0].GetProperty("id").GetString();
        (await owner.PostAsJsonAsync(url + "/action", new { action = "completeTask", recordId = taskId })).EnsureSuccessStatusCode();
        var today = await owner.GetFromJsonAsync<JsonElement>("/api/workbench/today");
        Assert.Equal(0, today.GetProperty("openTasks").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync(url + "/action", new { action = "archive" })).StatusCode);
        (await owner.PostAsJsonAsync(url + "/action", new { action = "archive", confirmed = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(url)).StatusCode);
        var history = await owner.GetFromJsonAsync<JsonElement[]>("/api/contacts/archived");
        Assert.Contains(history!, x => x.GetProperty("id").GetInt64().ToString() == id);
    }
    [Fact]
    public async Task Employee_access_follows_assignment_and_active_membership()
    {
        using var owner = await Owner(); using var employee = await Owner(); using var other = await Owner();
        var ownerMe = await owner.GetFromJsonAsync<JsonElement>("/api/me");
        var employeeMe = await employee.GetFromJsonAsync<JsonElement>("/api/me");
        var ownerId = ownerMe.GetProperty("id").GetInt64(); var employeeId = employeeMe.GetProperty("id").GetInt64();
        using(var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>(); var u = await db.Users.SingleAsync(u => u.Id == employeeId);
            u.Role = "Employee"; u.WorkspaceId = ownerId;
            db.Memberships.Add(new CrmMembership { OwnerUserId = ownerId, UserId = employeeId, Active = true });
            await db.SaveChangesAsync();
        }
        var created = await owner.PostAsJsonAsync("/api/contacts", new { name = "Assigned real record", leadType = "Buyer" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt64();
        var detail = $"/api/workbench/contacts/manual/{id}";
        Assert.Equal(HttpStatusCode.NotFound, (await employee.GetAsync(detail)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsJsonAsync($"/api/workbench/contacts/{id}/assign", new { staffId = employeeId.ToString() })).StatusCode);
        (await owner.PostAsJsonAsync($"/api/workbench/contacts/{id}/assign", new { staffId = employeeId.ToString() })).EnsureSuccessStatusCode();
        (await employee.GetAsync(detail)).EnsureSuccessStatusCode();
        (await employee.PostAsJsonAsync(detail+"/action", new { action = "note", text = "Employee saved note" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.PostAsJsonAsync(detail+"/action", new { action = "archive", confirmed = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(detail+"/action", new { action = "status", text = "CLOSED" })).StatusCode);
        (await owner.PostAsJsonAsync($"/api/workbench/contacts/{id}/assign", new { staffId = (string?)null })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await employee.GetAsync(detail)).StatusCode);
        using(var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<CrmDb>(); var membership = await db.Memberships.SingleAsync(m => m.OwnerUserId == ownerId && m.UserId == employeeId); membership.Active = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/workbench/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/workbench/workspace?staffId="+employeeId)).StatusCode);
    }
}
