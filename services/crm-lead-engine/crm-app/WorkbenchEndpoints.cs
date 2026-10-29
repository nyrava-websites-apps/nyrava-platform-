using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

// Compatibility contract for the existing portal. Contacts and activities remain
// authoritative; no gateway-local records or fabricated fallback contacts.
public static class WorkbenchEndpoints
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static readonly HashSet<string> Stages = new(StringComparer.Ordinal) { "NEW", "CONTACTED", "QUALIFIED", "SHOWING", "CONSULTATION", "PREPARING", "LISTED", "OFFER", "UNDER_CONTRACT", "CLOSED", "NURTURE", "LOST", "FOLLOW_UP", "APPOINTMENT", "VERIFIED_LEAD" };
    static CrmUser Actor(HttpContext h) => (CrmUser)h.Items["workbenchActor"]!;
    static bool Manager(CrmUser u) => u.Role is "Owner" or "Admin";
    static string Kind(CrmContact c) => string.IsNullOrEmpty(c.ExternalLeadId) && string.IsNullOrEmpty(c.Source) ? "manual" : "platform";
    static string Stage(string s) => s switch { "Lost Lead" => "LOST", _ => s.Replace('-', '_').Replace(' ', '_').ToUpperInvariant() };
    static IQueryable<CrmContact> Contacts(CrmDb db, CrmUser u) => db.Contacts.Where(c => c.UserId == u.WorkspaceId && c.ArchivedAt == null && (u.Role == "Owner" || u.Role == "Admin" || c.AssignedToUserId == u.Id));
    static IQueryable<CrmActivity> Activities(CrmDb db, CrmUser u) => db.Activities.Where(a => a.UserId == u.WorkspaceId && a.Contact.ArchivedAt == null && (u.Role == "Owner" || u.Role == "Admin" || a.Contact.AssignedToUserId == u.Id));
    static async Task<CrmContact?> Find(CrmDb db, HttpContext h, string kind, long id) => kind is "manual" or "platform" or "crm" ? await Contacts(db, Actor(h)).SingleOrDefaultAsync(c => c.Id == id) : null;
    static async Task<Dictionary<long, WorkbenchContactInput>> Metadata(CrmDb db, CrmUser u)
    {
        var rows = await Activities(db, u).Where(a => a.Kind == "ContactDetails").ToListAsync();
        var result = new Dictionary<long, WorkbenchContactInput>();
        foreach (var a in rows.OrderBy(a => a.Id))
            if (a.Details is not null) try { var value = JsonSerializer.Deserialize<WorkbenchContactInput>(a.Details, Json); if (value is not null) result[a.ContactId] = value; } catch (JsonException) { }
        return result;
    }
    static string? Recorded(CrmContact c, string label) => System.Text.RegularExpressions.Regex.Match(c.Notes ?? "", $@"{System.Text.RegularExpressions.Regex.Escape(label)}:\s*([^|]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase) is { Success: true } m ? m.Groups[1].Value.Trim() : null;
    static object Contact(CrmContact c, WorkbenchContactInput? m = null) => new {
        id = c.Id.ToString(), kind = Kind(c), fullName = c.Name, c.Email, c.Phone,
        leadType = c.LeadType.ToUpperInvariant(), crmStatus = Stage(c.Stage), zipCode = c.PropertyZipCode,
        staffId = c.AssignedToUserId?.ToString(), propertyAddress = m?.PropertyAddress ?? Recorded(c, "Address"),
        budgetMax = m?.BudgetMax ?? (decimal.TryParse(Recorded(c, "Budget/Val"), out var budget) ? budget : (decimal?)null),
        timeframe = m?.Timeframe ?? Recorded(c, "Timeframe"), statement = m?.Statement ?? c.Notes
    };
    static object TaskRow(CrmActivity a) => new { id = a.Id.ToString(), contactId = a.ContactId.ToString(), inquiryId = a.ContactId.ToString(), kind = Kind(a.Contact), a.Title, dueAt = a.StartsAt, at = a.StartsAt, a.Completed };
    static object Appointment(CrmActivity a) => new { id = a.Id.ToString(), contactId = a.ContactId.ToString(), inquiryId = a.ContactId.ToString(), kind = Kind(a.Contact), a.Title, a.StartsAt, a.EndsAt, at = a.StartsAt, a.Location, status = a.Result == "Canceled" ? "CANCELED" : a.Completed ? "COMPLETED" : "SCHEDULED" };
    static CrmActivity Log(CrmContact c, CrmUser u, string kind, string title, string? details, DateTimeOffset? at = null) => new() { ContactId = c.Id, UserId = c.UserId, CreatedByUserId = u.Id, AssignedToUserId = c.AssignedToUserId, Kind = kind, Title = title, Details = details, StartsAt = at ?? DateTimeOffset.UtcNow, EndsAt = at ?? DateTimeOffset.UtcNow };

    public static void MapWorkbench(this WebApplication app)
    {
        var group = app.MapGroup("/api/workbench").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) => {
            var h = context.HttpContext; var db = h.RequestServices.GetRequiredService<CrmDb>();
            if (!long.TryParse(h.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return Results.Unauthorized();
            var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id);
            if (user is null || !await db.Memberships.AnyAsync(m => m.OwnerUserId == user.WorkspaceId && m.UserId == id && m.Active)) return Results.Unauthorized();
            // This CRM has one active workspace per account. Never accept a query
            // parameter as authority to switch subscriber ownership.
            if (h.Request.Query.TryGetValue("staffId", out var staff) && !string.IsNullOrEmpty(staff) && staff != user.Id.ToString()) return Results.Forbid();
            h.Items["workbenchActor"] = user;
            h.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapGet("/workspace", async (CrmDb db, HttpContext h, string? search, string? type, string? stage, int? page) => {
            var u = Actor(h); var metadata = await Metadata(db, u);
            var contacts = await Contacts(db, u).ToListAsync();
            var selected = contacts.Where(c => (string.IsNullOrEmpty(type) || c.LeadType.Equals(type, StringComparison.OrdinalIgnoreCase)) && (string.IsNullOrEmpty(stage) || Stage(c.Stage) == stage) && (string.IsNullOrWhiteSpace(search) || new[] { c.Name, c.Email, c.Phone, c.PropertyZipCode, metadata.GetValueOrDefault(c.Id)?.PropertyAddress }.Any(v => v?.Contains(search, StringComparison.OrdinalIgnoreCase) == true))).OrderByDescending(c => c.UpdatedAt).ThenBy(c => c.Id).ToList();
            var staff = await db.Memberships.Where(m => m.OwnerUserId == u.WorkspaceId && m.UserId != u.WorkspaceId).Join(db.Users, m => m.UserId, x => x.Id, (m, x) => new { id = x.Id.ToString(), userId = x.Id.ToString(), fullName = x.Email, x.Email, m.Active }).ToListAsync();
            return Results.Ok(new { contacts = selected.Skip((Math.Max(1, page ?? 1) - 1) * 50).Take(50).Select(c => Contact(c, metadata.GetValueOrDefault(c.Id))), total = selected.Count, canManage = Manager(u), staff });
        });
        group.MapGet("/dashboard", async (CrmDb db, HttpContext h) => {
            var u = Actor(h); var metadata = await Metadata(db, u);
            var contacts = await Contacts(db, u).ToListAsync();
            var activities = await Activities(db, u).Include(a => a.Contact).ToListAsync();
            var tasks = activities.Where(a => a.Kind is "Task" or "Follow-up").ToList();
            var appointments = activities.Where(a => a.Kind == "Appointment").ToList();
            return Results.Ok(new { leads = contacts.OrderByDescending(c => c.UpdatedAt).Select(c => Contact(c, metadata.GetValueOrDefault(c.Id))), tasks = tasks.Select(TaskRow), appointments = appointments.Select(Appointment), notes = activities.Where(a => a.Kind is "Note" or "History").Select(a => new { id = a.Id.ToString(), inquiryId = a.ContactId.ToString(), text = a.Details }), summary = new { openTasks = tasks.Count(a => !a.Completed), upcomingAppointments = appointments.Count(a => !a.Completed && a.EndsAt >= DateTimeOffset.UtcNow) } });
        });
        group.MapGet("/team", async (CrmDb db, HttpContext h) => {
            var u = Actor(h); if (!Manager(u)) return Results.Forbid();
            var staff = await db.Memberships.Where(m => m.OwnerUserId == u.WorkspaceId && m.UserId != u.WorkspaceId).Join(db.Users, m => m.UserId, x => x.Id, (m, x) => new { id = x.Id.ToString(), userId = x.Id.ToString(), fullName = x.Email, x.Email, m.Active, archived = false }).ToListAsync();
            var contacts = await Contacts(db, u).Where(c => c.AssignedToUserId != null && c.AssignedToUserId != u.WorkspaceId).ToListAsync();
            return Results.Ok(new { staff, assignments = contacts.Select(c => new { inquiryId = c.Id.ToString(), staffId = c.AssignedToUserId!.Value.ToString() }), manualAssignments = Array.Empty<object>() });
        });
        group.MapGet("/memberships", (HttpContext h) => Results.Ok(new[] { new { id = Actor(h).Id.ToString(), businessName = "Assigned business workspace" } }));
        group.MapGet("/contacts/{kind}/{id:long}", async (string kind, long id, CrmDb db, HttpContext h) => {
            var c = await Find(db, h, kind, id); if (c is null) return Results.NotFound();
            var rows = await Activities(db, Actor(h)).Include(a => a.Contact).Where(a => a.ContactId == id).ToListAsync();
            var metadata = await Metadata(db, Actor(h));
            return Results.Ok(new { contact = Contact(c, metadata.GetValueOrDefault(id)), notes = rows.Where(a => a.Kind is "Note" or "History").OrderByDescending(a => a.Id).Select(a => new { id = a.Id.ToString(), a.Details, createdAt = a.StartsAt }), tasks = rows.Where(a => a.Kind is "Task" or "Follow-up").Select(TaskRow), appointments = rows.Where(a => a.Kind == "Appointment").Select(Appointment), communications = Array.Empty<object>() });
        });
        group.MapGet("/today", async (CrmDb db, HttpContext h) => {
            var u = Actor(h); var now = DateTimeOffset.UtcNow;
            var contacts = await Contacts(db, u).ToListAsync();
            var rows = await Activities(db, u).Include(a => a.Contact).ToListAsync();
            var tasks = rows.Where(a => (a.Kind is "Task" or "Follow-up") && !a.Completed).OrderBy(a => a.StartsAt).ToList();
            var appointments = rows.Where(a => a.Kind == "Appointment" && !a.Completed && a.EndsAt >= now).OrderBy(a => a.StartsAt).ToList();
            var fresh = contacts.Where(c => Stage(c.Stage) == "NEW").OrderByDescending(c => c.UpdatedAt).ToList();
            return Results.Ok(new { contactCount = contacts.Count, openTasks = tasks.Count, overdue = tasks.Count(a => a.StartsAt < now), upcoming = appointments.Count, newLeadCount = fresh.Count, newLeads = fresh.Take(10).Select(c => Contact(c)), tasks = tasks.Take(100).Select(TaskRow), appointments = appointments.Take(100).Select(Appointment) });
        });
        group.MapGet("/agenda", async (CrmDb db, HttpContext h, DateTimeOffset start, DateTimeOffset end) => {
            if (end <= start || end - start > TimeSpan.FromDays(366)) return Results.BadRequest(new { error = "Choose a valid agenda interval." });
            var rows = await Activities(db, Actor(h)).Include(a => a.Contact).ToListAsync();
            return Results.Ok(new { tasks = rows.Where(a => (a.Kind is "Task" or "Follow-up") && a.StartsAt >= start && a.StartsAt < end).Select(TaskRow), appointments = rows.Where(a => a.Kind == "Appointment" && a.StartsAt < end && a.EndsAt >= start).Select(Appointment) });
        });
        group.MapPost("/contacts", async (WorkbenchContactInput input, CrmDb db, HttpContext h) => {
            if (Validate(input) is string error) return Results.BadRequest(new { error });
            var u = Actor(h); await using var transaction = await db.Database.BeginTransactionAsync();
            var c = new CrmContact { UserId = u.WorkspaceId, AssignedToUserId = u.Id, Name = input.FullName!.Trim(), Email = input.Email?.Trim(), Phone = input.Phone?.Trim(), LeadType = input.LeadType!.ToUpperInvariant() == "BUYER" ? "Buyer" : "Seller", Stage = "New", PropertyZipCode = input.ZipCode, Notes = input.Statement, UpdatedAt = DateTimeOffset.UtcNow };
            db.Contacts.Add(c); await db.SaveChangesAsync();
            db.Activities.Add(Log(c, u, "ContactDetails", "Contact details", JsonSerializer.Serialize(input, Json)));
            db.Activities.Add(Log(c, u, "History", "Contact created", "Contact created."));
            await db.SaveChangesAsync(); await transaction.CommitAsync();
            return Results.Created($"/api/workbench/contacts/manual/{c.Id}", new { id = c.Id.ToString(), kind = "manual" });
        });
        group.MapPut("/contacts/{id:long}", async (long id, WorkbenchContactInput input, CrmDb db, HttpContext h) => {
            var u = Actor(h); var c = await Contacts(db, u).SingleOrDefaultAsync(c => c.Id == id); if (c is null) return Results.NotFound();
            if (Validate(input) is string error) return Results.BadRequest(new { error });
            c.Name = input.FullName!.Trim(); c.Email = input.Email?.Trim(); c.Phone = input.Phone?.Trim(); c.PropertyZipCode = input.ZipCode; c.LeadType = input.LeadType!.ToUpperInvariant() == "BUYER" ? "Buyer" : "Seller"; c.UpdatedAt = DateTimeOffset.UtcNow;
            db.Activities.Add(Log(c, u, "ContactDetails", "Contact details", JsonSerializer.Serialize(input, Json)));
            db.Activities.Add(Log(c, u, "History", "Contact updated", "Contact details updated."));
            await db.SaveChangesAsync(); return Results.Ok(new { saved = true });
        });
        group.MapPost("/contacts/{id:long}/assign", Assign);
        group.MapPost("/contacts/{kind}/{id:long}/action", async (string kind, long id, WorkbenchAction input, CrmDb db, HttpContext h) => {
            var u = Actor(h); var c = await Find(db, h, kind, id); if (c is null) return Results.NotFound();
            if (input.Text?.Length > 4000 || input.ContactNote?.Length > 4000 || input.Location?.Length > 300 || input.TimeZone?.Length > 100) return Results.BadRequest(new { error = "Keep notes and scheduling fields within their limits." });
            switch (input.Action) {
                case "note":
                    if (string.IsNullOrWhiteSpace(input.Text)) return Results.BadRequest(new { error = "Enter a note." });
                    db.Activities.Add(Log(c, u, "Note", "Conversation note", input.Text.Trim())); break;
                case "status":
                    if (input.Text is null || !Stages.Contains(input.Text)) return Results.BadRequest(new { error = "Choose a listed pipeline stage." });
                    if (input.Text == "CONTACTED" && Kind(c) == "platform" && (input.ContactNote?.Trim().Length ?? 0) < 8) return Results.BadRequest(new { error = "Describe the contact attempt in at least 8 characters." });
                    db.Activities.Add(Log(c, u, "History", "Pipeline updated", $"{Stage(c.Stage)} → {input.Text}. {input.ContactNote}")); c.Stage = input.Text; break;
                case "archive":
                    if (!Manager(u)) return Results.Forbid();
                    if (!input.Confirmed) return Results.BadRequest(new { error = "Confirm archiving this contact." });
                    c.ArchivedAt = DateTimeOffset.UtcNow; db.Activities.Add(Log(c, u, "History", "Contact archived", "Contact archived. Work history retained.")); break;
                case "task": case "appointment":
                    if (string.IsNullOrWhiteSpace(input.Text) || input.Text.Length > 160 || input.StartsAt is null) return Results.BadRequest(new { error = "Enter a title up to 160 characters and a valid date." });
                    var end = input.Action == "appointment" ? input.EndsAt : input.StartsAt;
                    if (input.Action == "appointment" && (end is null || end <= input.StartsAt || end - input.StartsAt > TimeSpan.FromHours(12))) return Results.BadRequest(new { error = "Choose an appointment interval up to 12 hours." });
                    var a = Log(c, u, input.Action == "task" ? "Task" : "Appointment", input.Text.Trim(), null, input.StartsAt); a.EndsAt = end!.Value; a.Location = input.Location; a.TimeZone = input.TimeZone; db.Activities.Add(a); break;
                case "completeTask": case "moveTask": case "moveAppointment": case "cancelAppointment":
                    if (!long.TryParse(input.RecordId, out var recordId)) return Results.BadRequest(new { error = "Choose a saved activity." });
                    var record = await Activities(db, u).SingleOrDefaultAsync(a => a.Id == recordId && a.ContactId == id);
                    var appointment = input.Action.EndsWith("Appointment", StringComparison.Ordinal);
                    if (record is null || (appointment ? record.Kind != "Appointment" : record.Kind is not ("Task" or "Follow-up"))) return Results.NotFound();
                    if (input.Action == "completeTask") record.Completed = true;
                    else if (input.Action == "cancelAppointment") { record.Completed = true; record.Result = "Canceled"; }
                    else {
                        if (input.StartsAt is null || (appointment && (input.EndsAt is null || input.EndsAt <= input.StartsAt || input.EndsAt - input.StartsAt > TimeSpan.FromHours(12)))) return Results.BadRequest(new { error = "Choose a valid schedule." });
                        record.StartsAt = input.StartsAt.Value; record.EndsAt = appointment ? input.EndsAt!.Value : input.StartsAt.Value;
                    }
                    db.Activities.Add(Log(c, u, "History", "Schedule updated", $"{input.Action}: {record.Title}")); break;
                default: return Results.BadRequest(new { error = "Unsupported CRM action." });
            }
            c.UpdatedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(); return Results.Ok(new { saved = true });
        });
    }
    public static async Task<IResult> Assign(long id, WorkbenchAssignment input, CrmDb db, HttpContext h)
    {
        var u = Actor(h); if (!Manager(u)) return Results.Forbid();
        var c = await Contacts(db, u).SingleOrDefaultAsync(c => c.Id == id); if (c is null) return Results.NotFound();
        long? target = null;
        if (!string.IsNullOrEmpty(input.StaffId)) {
            if (!long.TryParse(input.StaffId, out var userId) || !await db.Memberships.AnyAsync(m => m.OwnerUserId == u.WorkspaceId && m.UserId == userId && m.Active)) return Results.BadRequest(new { error = "Choose an active member of your business." });
            target = userId;
        }
        var previous = c.AssignedToUserId; c.AssignedToUserId = target; c.UpdatedAt = DateTimeOffset.UtcNow;
        foreach (var a in await db.Activities.Where(a => a.ContactId == id && a.UserId == u.WorkspaceId && !a.Completed && (a.Kind == "Task" || a.Kind == "Follow-up" || a.Kind == "Appointment")).ToListAsync()) a.AssignedToUserId = target;
        db.Activities.Add(Log(c, u, "History", "Assignment updated", $"Assignment {previous?.ToString() ?? "owner"} → {target?.ToString() ?? "owner"}."));
        await db.SaveChangesAsync(); return Results.Ok(new { saved = true });
    }
    static string? Validate(WorkbenchContactInput p)
    {
        if (string.IsNullOrWhiteSpace(p.FullName) || p.FullName.Trim().Length > 160 || p.Email?.Length > 320 || p.Phone?.Length > 40 || p.Statement?.Length > 4000 || p.PropertyAddress?.Length > 300 || p.Timeframe?.Length > 100 || p.ZipCode?.Length > 16 || p.BudgetMax is < 0 or > 9999999999999999m || p.LeadType?.ToUpperInvariant() is not ("BUYER" or "SELLER")) return "Check the contact fields and lengths.";
        if (!string.IsNullOrWhiteSpace(p.Email) && !System.Net.Mail.MailAddress.TryCreate(p.Email, out _)) return "Enter a valid email address.";
        return null;
    }
}
public sealed record WorkbenchContactInput(string? FullName, string? Email, string? Phone, string? LeadType, string? ZipCode, string? PropertyAddress, decimal? BudgetMax, string? Timeframe, string? Statement);
public sealed record WorkbenchAction(string? Action, string? Text, string? RecordId, DateTimeOffset? StartsAt, DateTimeOffset? EndsAt, string? Location, string? TimeZone, string? ContactNote, bool Confirmed = false);
public sealed record WorkbenchAssignment(string? StaffId);
