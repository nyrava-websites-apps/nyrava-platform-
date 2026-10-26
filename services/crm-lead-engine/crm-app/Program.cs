using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using NyravaCRM;

var builder = WebApplication.CreateBuilder(args);
var stages = new HashSet<string>(StringComparer.Ordinal) { "New", "Contacted", "Qualified", "Follow-up", "Appointment", "Verified Lead", "Lost Lead" };
var leadTypes = new HashSet<string>(StringComparer.Ordinal) { "Buyer", "Seller", "Other" };
var dataDir = Path.Combine(builder.Environment.ContentRootPath, "data");
Directory.CreateDirectory(dataDir);
var databaseProvider = builder.Configuration["Database:Provider"] ?? "Sqlite";
var demoMode = builder.Configuration.GetValue<bool>("CRM_DEMO_MODE");
var teamInvitationsEnabled = builder.Configuration.GetValue("Crm:TeamInvitationsEnabled", true);
var secureCookie = builder.Configuration.GetValue<bool?>("Crm:CookieSecure") ?? !builder.Environment.IsDevelopment();
if (demoMode && !databaseProvider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("CRM demo mode uses its own SQLite file. Set Database:Provider to Sqlite for the demo profile.");
var configuredConnectionString = builder.Configuration.GetConnectionString("Crm");
var connectionString = demoMode
    ? configuredConnectionString ?? $"Data Source={Path.Combine(dataDir, "nyrava-crm-demo.db")}"
    : configuredConnectionString;
builder.Services.AddDbContext<CrmDb>(options => {
    switch (databaseProvider.Trim().ToLowerInvariant()) {
        case "sqlite": options.UseSqlite(connectionString ?? $"Data Source={Path.Combine(dataDir, "nyrava-crm.db")}"); break;
        case "sqlserver":
            if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("Set ConnectionStrings:Crm for SQL Server.");
            options.UseSqlServer(connectionString); break;
        case "mysql":
            if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("Set ConnectionStrings:Crm for MySQL.");
            options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)); break;
        default: throw new InvalidOperationException("Database:Provider must be Sqlite, SqlServer, or MySql.");
    }
});
builder.Services.AddAuthentication("crm-cookie").AddCookie("crm-cookie", options => {
    // Browsers scope cookies to host/path, not port. Keep localhost demo and
    // regular CRM profiles from overwriting or clearing each other's session.
    options.Cookie.Name = demoMode ? "NyravaCRM.Session.Demo" : "NyravaCRM.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = secureCookie ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.LoginPath = "/login.html";
    options.Events.OnRedirectToLogin = context => {
        if (context.Request.Path.StartsWithSegments("/api")) {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        }
        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context => {
        if (context.Request.Path.StartsWithSegments("/api")) {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }
        context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery();
var app = builder.Build();
var inboundLeadSources = new HashSet<string>(StringComparer.Ordinal) { "Fsbo", "Zillow", "Facebook", "Craigslist", "FsboCom", "HomeEvaluation", "LeadGenerator", "RealtorAssistance" };

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
    await db.Database.EnsureCreatedAsync();
    // EnsureCreated does not alter an existing starter database. Add the new
    // lead classification column safely so existing contacts are retained.
    if (db.Database.IsSqlite()) {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "PRAGMA table_info('Contacts')";
        if (command.Connection!.State != System.Data.ConnectionState.Open) await command.Connection.OpenAsync();
        await using var reader = await command.ExecuteReaderAsync();
        var hasLeadType = false;
        while (await reader.ReadAsync()) if (reader.GetString(1) == "LeadType") hasLeadType = true;
        await reader.CloseAsync();
        if (!hasLeadType) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Contacts ADD COLUMN LeadType TEXT NOT NULL DEFAULT 'Other'");
    } else if (db.Database.IsSqlServer()) {
        await db.Database.ExecuteSqlRawAsync("IF COL_LENGTH('Contacts', 'LeadType') IS NULL ALTER TABLE Contacts ADD LeadType nvarchar(32) NOT NULL CONSTRAINT DF_Contacts_LeadType DEFAULT 'Other'");
    } else {
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE Contacts ADD COLUMN IF NOT EXISTS LeadType varchar(32) NOT NULL DEFAULT 'Other'");
    }
    await EnsureColumnAsync(db, "Users", "WorkspaceId", "INTEGER", "0");
    await EnsureColumnAsync(db, "Users", "Role", "TEXT", "'Owner'");
    await EnsureColumnAsync(db, "Users", "Country", "TEXT", "'US'");
    await EnsureColumnAsync(db, "Users", "PostalCode", "TEXT", "'78701'");
    await EnsureColumnAsync(db, "Users", "SubscribedZipCodes", "TEXT", "''");
    await EnsureColumnAsync(db, "Users", "SubscriptionStatus", "TEXT", "'Active'");
    await EnsureColumnAsync(db, "Users", "SubscriptionPlan", "TEXT", "'Realtor Standard Monthly'");
    await EnsureColumnAsync(db, "Users", "SubscriptionPrice", "NUMERIC", "299.00");
    await EnsureColumnAsync(db, "Users", "Currency", "TEXT", "'USD'");
    await EnsureColumnAsync(db, "Users", "TermsAcceptedAt", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Users", "TermsVersion", "TEXT", "'1.0'");
    await EnsureColumnAsync(db, "Contacts", "AssignedToUserId", "INTEGER", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ArchivedAt", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "Source", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ExternalLeadId", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "PropertyZipCode", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ContactVerificationMethod", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ContactVerifiedAt", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "IntentVerifiedAt", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ConsentCapturedAt", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ConsentRecipient", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ConsentText", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "ExternalFsbo", "INTEGER", "0");
    await EnsureColumnAsync(db, "Contacts", "FsboAdminReviewReference", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "FsboAdminReviewedAt", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Contacts", "SourceUrl", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Activities", "CreatedByUserId", "INTEGER", "0");
    await EnsureColumnAsync(db, "Activities", "AssignedToUserId", "INTEGER", "NULL");
    await EnsureColumnAsync(db, "Activities", "Result", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Activities", "Location", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Activities", "TimeZone", "TEXT", "NULL");
    await EnsureColumnAsync(db, "Activities", "ResultHistory", "TEXT", "NULL");
    await EnsureTeamTablesAsync(db);
    await EnsureIntegrationTablesAsync(db);
    // Preserve existing contacts while translating the previous generic close labels.
    const string verifiedLeadStage = "Verified Lead";
    const string lostLeadStage = "Lost Lead";
    await db.Contacts.Where(c => c.Stage == "Won").ExecuteUpdateAsync(s => s.SetProperty(c => c.Stage, verifiedLeadStage));
    await db.Contacts.Where(c => c.Stage == "Lost").ExecuteUpdateAsync(s => s.SetProperty(c => c.Stage, lostLeadStage));
    var existingUsers = await db.Users.ToListAsync();
    foreach (var user in existingUsers) {
        if (user.WorkspaceId == 0) user.WorkspaceId = user.Id;
        if (string.IsNullOrWhiteSpace(user.Role)) user.Role = "Owner";
    }
    await db.SaveChangesAsync();
    foreach(var contact in await db.Contacts.Where(c=>c.AssignedToUserId==null).ToListAsync()) contact.AssignedToUserId=contact.UserId;
    foreach(var activity in await db.Activities.Where(a=>a.CreatedByUserId==0).ToListAsync()) { activity.CreatedByUserId=activity.UserId; activity.AssignedToUserId=await db.Contacts.Where(c=>c.Id==activity.ContactId).Select(c=>c.AssignedToUserId).SingleOrDefaultAsync(); }
    await db.SaveChangesAsync();
    foreach (var user in existingUsers.Where(x => x.Role == "Owner")) {
        if (!await db.Memberships.AnyAsync(m => m.OwnerUserId == user.Id && m.UserId == user.Id))
            db.Memberships.Add(new CrmMembership { OwnerUserId = user.Id, UserId = user.Id, Role = "Owner", Active = true });
    }
    await db.SaveChangesAsync();
    await EnsureSystemAdminAsync(db);
    if (demoMode) await SeedDemoWorkspaceAsync(db);
}

app.Use(async (context,next)=>{
    try { await next(); }
    catch(UnauthorizedAccessException ex) { context.Response.StatusCode=StatusCodes.Status403Forbidden; await context.Response.WriteAsJsonAsync(new{error=ex.Message}); }
});
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
        ctx.Context.Response.Headers.Append("Pragma", "no-cache");
        ctx.Context.Response.Headers.Append("Expires", "0");
    }
});
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapGet("/api/eligibility", (string? country, string? postalCode, string? plan) =>
    Results.Ok(GeographicService.GetPricing(country, postalCode, plan))).AllowAnonymous();

app.MapPost("/api/register", async (RegisterRequest request, CrmDb db, HttpContext http) => {
    var email = request.Email?.Trim().ToLowerInvariant();
    if (email is null || !ValidEmail(email) || request.Password is null || request.Password.Length < 12 || request.Password.Length > 200)
        return Results.BadRequest(new { error = "Enter a valid email and a password of at least 12 characters." });
    if (await db.Users.AnyAsync(x => x.Email == email)) return Results.Conflict(new { error = "An account with that email already exists." });

    var isSubscriber = string.IsNullOrWhiteSpace(request.InvitationCode);
    var country = GeographicService.StandardizeCountry(request.Country ?? "US");
    var postalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? "78701" : request.PostalCode.Trim();

    if (isSubscriber) {
        if (!GeographicService.IsCountrySupported(country))
            return Results.BadRequest(new { error = $"Nyrava subscriptions are not currently available in {country}." });
        if (!GeographicService.ValidatePostalCode(country, postalCode))
            return Results.BadRequest(new { error = $"The postal code '{postalCode}' is not a valid format for {country}." });
    }

    var pricing = GeographicService.GetPricing(country, postalCode, request.Plan ?? "monthly");
    if (isSubscriber && !pricing.Eligible) {
        return Results.BadRequest(new { error = pricing.Message });
    }

    await using var transaction=await db.Database.BeginTransactionAsync();
    var user = new CrmUser {
        Email = email,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
        Role = "Owner",
        Country = country,
        PostalCode = postalCode,
        SubscribedZipCodes = string.IsNullOrWhiteSpace(request.SubscribedZipCodes) ? postalCode : request.SubscribedZipCodes.Trim(),
        SubscriptionStatus = "Active",
        SubscriptionPlan = request.Plan?.Equals("annual", StringComparison.OrdinalIgnoreCase) == true ? "Realtor Annual" : "Realtor Standard Monthly",
        SubscriptionPrice = pricing.Price,
        Currency = pricing.Currency,
        TermsAcceptedAt = DateTimeOffset.UtcNow,
        TermsVersion = "1.0"
    };
    CrmInvitation? invitation = null;
    if (!string.IsNullOrWhiteSpace(request.InvitationCode)) {
        if (!teamInvitationsEnabled) return Results.BadRequest(new { error = "Team invitations are disabled for this CRM system. Create a subscriber account without an invite code." });
        var hash = HashToken(request.InvitationCode.Trim());
        invitation = await db.Invitations.SingleOrDefaultAsync(x => x.TokenHash == hash);
        if (invitation is null || (!demoMode && (invitation.AcceptedAt is not null || invitation.ExpiresAt <= DateTimeOffset.UtcNow || string.IsNullOrWhiteSpace(invitation.Email))) || (invitation.Email is not null && invitation.Email != email) || !await db.Users.AnyAsync(x=>x.Id==invitation.OwnerUserId&&x.Role=="Owner"&&x.WorkspaceId==x.Id)) return Results.BadRequest(new { error = "That team invitation is invalid, expired, or for another email address." });
        if (!demoMode) {
            var claimedAt = DateTimeOffset.UtcNow;
            var claimed=await db.Invitations.Where(x=>x.Id==invitation.Id&&x.AcceptedAt==null).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.AcceptedAt,claimedAt));
            if(claimed!=1)return Results.BadRequest(new{error="That team invitation was already used. Ask the workspace owner for a new code."});
        }
        user.WorkspaceId = invitation.OwnerUserId; user.Role = "Employee";
    }
    db.Users.Add(user); await db.SaveChangesAsync();
    if (invitation is null) user.WorkspaceId = user.Id;
    else invitation.AcceptedAt = DateTimeOffset.UtcNow;
    db.Memberships.Add(new CrmMembership { OwnerUserId = user.WorkspaceId, UserId = user.Id, Role = user.Role, Active = true });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    await SignIn(http, user);
    return Results.Ok(new {
        email = user.Email,
        country = user.Country,
        postalCode = user.PostalCode,
        subscribedZipCodes = user.SubscribedZipCodes,
        subscriptionStatus = user.SubscriptionStatus,
        subscriptionPlan = user.SubscriptionPlan,
        subscriptionPrice = user.SubscriptionPrice,
        currency = user.Currency
    });
}).AllowAnonymous();

app.MapPost("/api/login", async (LoginRequest request, CrmDb db, HttpContext http) => {
    var email = request.Email?.Trim().ToLowerInvariant();
    if (email is null || !ValidEmail(email) || string.IsNullOrEmpty(request.Password))
        return Results.Unauthorized();
    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email);
    if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        return Results.Unauthorized();
    if(!await db.Memberships.AnyAsync(m=>m.OwnerUserId==user.WorkspaceId&&m.UserId==user.Id&&m.Active))return Results.Unauthorized();
    await SignIn(http, user);
    return Results.Ok(new {
        email = user.Email,
        country = user.Country,
        postalCode = user.PostalCode,
        subscribedZipCodes = user.SubscribedZipCodes,
        subscriptionStatus = user.SubscriptionStatus
    });
}).AllowAnonymous();

app.MapPost("/api/logout", async (HttpContext http) => {
    await http.SignOutAsync("crm-cookie");
    http.Response.Headers["Cache-Control"] = "no-store";
    return Results.NoContent();
}).AllowAnonymous();
app.MapGet("/api/demo-info", () => Results.Ok(new { enabled=demoMode, inviteCode=demoMode?"1234":null, teamInvitationsEnabled })).AllowAnonymous();
app.MapGet("/api/me", async (CrmDb db, HttpContext http) => {
    var u=await CurrentUser(db,http);
    var isPlatformAdmin = u.Email == "admin@nyrava.com" || u.Email == "testadmin@example.test";
    return Results.Ok(new {
        id=u.Id,
        email=u.Email,
        role=u.Role,
        isPlatformAdmin,
        workspaceId=u.WorkspaceId,
        country=u.Country,
        postalCode=u.PostalCode,
        subscribedZipCodes=u.SubscribedZipCodes,
        subscriptionStatus=u.SubscriptionStatus,
        subscriptionPlan=u.SubscriptionPlan,
        subscriptionPrice=u.SubscriptionPrice,
        currency=u.Currency,
        demoMode,
        teamInvitationsEnabled
    });
}).RequireAuthorization();

app.MapPut("/api/subscription/territory", async (TerritoryUpdateInput input, CrmDb db, HttpContext http) => {
    var actor = await CurrentUser(db, http);
    if (actor.Role != "Owner") return Results.Forbid();
    if (string.IsNullOrWhiteSpace(input.ZipCodes)) return Results.BadRequest(new { error = "Provide at least one coverage ZIP code." });
    var zips = input.ZipCodes.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(z => z.Trim()).Distinct().ToList();
    foreach (var z in zips) {
        if (!GeographicService.ValidatePostalCode(actor.Country, z)) {
            return Results.BadRequest(new { error = $"Postal code '{z}' is not valid for {actor.Country}." });
        }
    }
    actor.SubscribedZipCodes = string.Join(", ", zips);
    await db.SaveChangesAsync();
    return Results.Ok(new { subscribedZipCodes = actor.SubscribedZipCodes, count = zips.Count });
}).RequireAuthorization();

// Integration support is opt-in. Keys are workspace-scoped and are only shown
// once; demo databases cannot create production-style integration credentials.
app.MapGet("/api/integrations/keys", async (CrmDb db, HttpContext http) => {
    if (demoMode) return Results.NotFound();
    var actor = await CurrentUser(db, http);
    if (actor.Role != "Owner") return Results.Forbid();
    var rows = await db.IntegrationKeys.Where(k => k.OwnerUserId == actor.WorkspaceId).ToListAsync();
    var result = rows.OrderByDescending(k => k.CreatedAt)
        .Select(k => new { k.Id, k.Name, k.TokenPrefix, k.CreatedAt, k.LastUsedAt, k.RevokedAt });
    return Results.Ok(result);
}).RequireAuthorization();
app.MapPost("/api/integrations/keys", async (IntegrationKeyCreateRequest request, CrmDb db, HttpContext http) => {
    if (demoMode) return Results.NotFound();
    var actor = await CurrentUser(db, http);
    if (actor.Role != "Owner") return Results.Forbid();
    var name = Clean(request.Name, 100);
    if (name is null) return Results.BadRequest(new { error = "Give this integration key a name." });
    if (await db.IntegrationKeys.CountAsync(k => k.OwnerUserId == actor.WorkspaceId && k.RevokedAt == null) >= 10)
        return Results.Conflict(new { error = "This workspace has reached the limit of 10 active integration keys. Revoke one you no longer use." });
    var token = "nycrm_" + Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    var key = new CrmIntegrationKey {
        OwnerUserId = actor.WorkspaceId,
        Name = name,
        TokenHash = HashToken(token),
        TokenPrefix = token[..Math.Min(token.Length, 16)],
        CreatedAt = DateTimeOffset.UtcNow
    };
    db.IntegrationKeys.Add(key);
    await db.SaveChangesAsync();
    return Results.Created($"/api/integrations/keys/{key.Id}", new { key.Id, key.Name, key.TokenPrefix, key.CreatedAt, token });
}).RequireAuthorization();
app.MapDelete("/api/integrations/keys/{id:long}", async (long id, CrmDb db, HttpContext http) => {
    if (demoMode) return Results.NotFound();
    var actor = await CurrentUser(db, http);
    if (actor.Role != "Owner") return Results.Forbid();
    var key = await db.IntegrationKeys.SingleOrDefaultAsync(k => k.Id == id && k.OwnerUserId == actor.WorkspaceId && k.RevokedAt == null);
    if (key is null) return Results.NotFound();
    key.RevokedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization();

app.MapGet("/api/team", async (CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var owner=actor.WorkspaceId;
    if (actor.Role!="Owner" && !await db.Memberships.AnyAsync(x=>x.OwnerUserId==owner&&x.UserId==actor.Id&&x.Active)) return Results.Forbid();
    var team=await db.Memberships.Where(x=>x.OwnerUserId==owner&&(actor.Role=="Owner"||x.Active)).Join(db.Users,m=>m.UserId,u=>u.Id,(m,u)=>new{id=u.Id,email=u.Email,role=m.Role,active=m.Active,joinedAt=m.JoinedAt}).ToListAsync();
    return Results.Ok(new { members=team, canInvite=teamInvitationsEnabled&&actor.Role=="Owner", teamInvitationsEnabled });
}).RequireAuthorization();
app.MapPost("/api/team/invitations", async (InviteInput input, CrmDb db, HttpContext http) => {
    if(!teamInvitationsEnabled)return Results.Json(new{error="Team invitations are disabled for this CRM system."},statusCode:StatusCodes.Status403Forbidden);
    var actor=await CurrentUser(db,http); if(actor.Role!="Owner") return Results.Forbid();
    var email=string.IsNullOrWhiteSpace(input.Email)?null:input.Email.Trim().ToLowerInvariant();
    if(email is null||!ValidEmail(email)) return Results.BadRequest(new{error="Enter the email address of the person you are inviting."});
    if(!demoMode && !MailDeliveryConfigured(builder.Configuration)) return Results.Json(new{error="Invitation email is not configured. Set the CRM SMTP settings before inviting team members."},statusCode:StatusCodes.Status503ServiceUnavailable);
    string? invitationBaseUrl=null;
    if(!demoMode){
        invitationBaseUrl=builder.Configuration["Crm:PublicBaseUrl"]?.TrimEnd('/');
        if(string.IsNullOrWhiteSpace(invitationBaseUrl)){
            if(!builder.Environment.IsDevelopment())return Results.Json(new{error="Set Crm:PublicBaseUrl to the public HTTPS address of this CRM before sending invitations."},statusCode:StatusCodes.Status503ServiceUnavailable);
            invitationBaseUrl=$"{http.Request.Scheme}://{http.Request.Host}";
        }
        if(!Uri.TryCreate(invitationBaseUrl,UriKind.Absolute,out var baseUri)||!string.IsNullOrEmpty(baseUri.UserInfo)||(baseUri.Scheme!=Uri.UriSchemeHttps&&!(builder.Environment.IsDevelopment()&&baseUri.Scheme==Uri.UriSchemeHttp&&baseUri.IsLoopback)))
            return Results.Json(new{error="Crm:PublicBaseUrl must be a valid public HTTPS address."},statusCode:StatusCodes.Status503ServiceUnavailable);
        invitationBaseUrl=baseUri.GetLeftPart(UriPartial.Authority);
    }
    var code=demoMode&&actor.Email=="testone@example.test"?"1234":Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_');
    var demoInviteHash=HashToken("1234");
    var invite=demoMode?await db.Invitations.SingleOrDefaultAsync(x=>x.OwnerUserId==actor.WorkspaceId&&x.TokenHash==demoInviteHash):null;
    if(invite is null){invite=new CrmInvitation{OwnerUserId=actor.WorkspaceId,Email=email,TokenHash=HashToken(code),ExpiresAt=DateTimeOffset.UtcNow.AddDays(7)};db.Invitations.Add(invite);}
    else { invite.Email=email;invite.ExpiresAt=DateTimeOffset.UtcNow.AddDays(7);invite.AcceptedAt=null; }
    await db.SaveChangesAsync();
    var joinUrl=$"/index.html?invite={Uri.EscapeDataString(code)}";
    if(!demoMode){
        try { await SendInvitationEmailAsync(builder.Configuration,email,$"{invitationBaseUrl}{joinUrl}",actor.Email); }
        catch {
            db.Invitations.Remove(invite); await db.SaveChangesAsync();
            return Results.Json(new{error="The invitation could not be emailed. Check the CRM SMTP settings and try again."},statusCode:StatusCodes.Status502BadGateway);
        }
        return Results.Ok(new{sent=true,email,expiresAt=invite.ExpiresAt});
    }
    return Results.Ok(new{sent=false,code,expiresAt=invite.ExpiresAt,joinUrl});
}).RequireAuthorization();
app.MapPost("/api/team/{userId:long}/deactivate",async(long userId,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http);if(actor.Role!="Owner"||userId==actor.Id)return Results.Forbid();
    if(await db.Contacts.AnyAsync(c=>c.UserId==actor.Id&&c.ArchivedAt==null&&c.AssignedToUserId==userId))return Results.BadRequest(new{error="Reassign this member's active contacts before disabling access. Archived history is preserved."});
    var membership=await db.Memberships.SingleOrDefaultAsync(m=>m.OwnerUserId==actor.Id&&m.UserId==userId&&m.Role=="Employee");if(membership is null)return Results.NotFound();membership.Active=false;await db.SaveChangesAsync();return Results.Ok(new{deactivated=true});
}).RequireAuthorization();
app.MapPost("/api/team/{userId:long}/activate",async(long userId,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http);if(actor.Role!="Owner"||userId==actor.Id)return Results.Forbid();
    var membership=await db.Memberships.SingleOrDefaultAsync(m=>m.OwnerUserId==actor.Id&&m.UserId==userId&&m.Role=="Employee");if(membership is null)return Results.NotFound();membership.Active=true;await db.SaveChangesAsync();return Results.Ok(new{active=true});
}).RequireAuthorization();
app.MapPost("/api/team/assign/{contactId:long}", async (long contactId, AssignmentInput input, CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); if(actor.Role!="Owner") return Results.Forbid();
    var contact=await db.Contacts.SingleOrDefaultAsync(x=>x.Id==contactId&&x.UserId==actor.Id); if(contact is null)return Results.NotFound();
    if(input.UserId.HasValue&&!await db.Memberships.AnyAsync(x=>x.OwnerUserId==actor.Id&&x.UserId==input.UserId.Value&&x.Active&&(x.Role=="Employee"||x.UserId==actor.Id))) return Results.BadRequest(new{error="Choose an active team member."});
    contact.AssignedToUserId=input.UserId??actor.Id; contact.UpdatedAt=DateTimeOffset.UtcNow; await db.SaveChangesAsync(); return Results.Ok(contact);
}).RequireAuthorization();

app.MapGet("/api/chat/people", async (CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http); var people=await db.Memberships.Where(m=>m.OwnerUserId==actor.WorkspaceId&&m.Active&&m.UserId!=actor.Id).Join(db.Users,m=>m.UserId,u=>u.Id,(m,u)=>new{id=u.Id,email=u.Email,role=m.Role}).ToListAsync();
    if(actor.Role!="Owner"&&!people.Any()) people=await db.Users.Where(x=>x.Id==actor.WorkspaceId).Select(x=>new{id=x.Id,email=x.Email,role=x.Role}).ToListAsync();
    return Results.Ok(people);
}).RequireAuthorization();
app.MapGet("/api/chat/{peerId:long}", async (long peerId,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http); if(!await CanChat(db,actor,peerId))return Results.NotFound();
    var messages=await db.Messages.Where(m=>m.WorkspaceOwnerId==actor.WorkspaceId&&((m.SenderUserId==actor.Id&&m.RecipientUserId==peerId)||(m.SenderUserId==peerId&&m.RecipientUserId==actor.Id))).OrderByDescending(m=>m.Id).Take(300).ToListAsync();
    return Results.Ok(messages.OrderBy(m=>m.Id));
}).RequireAuthorization();
app.MapPost("/api/chat/{peerId:long}",async(long peerId,ChatInput input,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http); if(!await CanChat(db,actor,peerId))return Results.NotFound();
    var body=input.Body?.Trim(); if(string.IsNullOrWhiteSpace(body)||body.Length>4000)return Results.BadRequest(new{error="Message must be 1–4000 characters."});
    var msg=new CrmMessage{WorkspaceOwnerId=actor.WorkspaceId,SenderUserId=actor.Id,RecipientUserId=peerId,Body=body,CreatedAt=DateTimeOffset.UtcNow};db.Messages.Add(msg);await db.SaveChangesAsync();return Results.Ok(msg);
}).RequireAuthorization();

app.MapGet("/api/contacts", async (CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var userId=actor.Id; var owner=actor.WorkspaceId;
    // SQLite also cannot translate ORDER BY for DateTimeOffset on contacts.
    var items = await db.Contacts
        .Where(x => x.UserId == owner && x.ArchivedAt==null && (actor.Role=="Owner" || x.AssignedToUserId==userId))
        .ToListAsync();
    return items.OrderByDescending(x => x.UpdatedAt).ToList();
}).RequireAuthorization();
app.MapGet("/api/contacts/archived",async(CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http);if(actor.Role!="Owner")return Results.Forbid();
    var rows=await db.Contacts.Where(x=>x.UserId==actor.WorkspaceId&&x.ArchivedAt!=null).ToListAsync();return Results.Ok(rows.OrderByDescending(x=>x.ArchivedAt).ToList());
}).RequireAuthorization();
app.MapPost("/api/contacts", async (ContactInput input, CrmDb db, HttpContext http) => {
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 160 || input.Email?.Length > 320 || (!string.IsNullOrWhiteSpace(input.Email) && !ValidEmail(input.Email.Trim())) || input.Phone?.Length > 40 || input.Company?.Length > 160 || !leadTypes.Contains(input.LeadType))
        return Results.BadRequest(new { error = "Check the name, email, phone, company, and client type." });
    var actor=await CurrentUser(db,http); var item = new CrmContact { UserId = actor.WorkspaceId, AssignedToUserId=actor.Id, Name = input.Name.Trim(), Email = Clean(input.Email, 320), Phone = Clean(input.Phone, 40), Company = Clean(input.Company, 160), LeadType = input.LeadType, Stage = "New", Notes = "", UpdatedAt = DateTimeOffset.UtcNow };
    db.Contacts.Add(item); await db.SaveChangesAsync(); return Results.Created($"/api/contacts/{item.Id}", item);
}).RequireAuthorization();
app.MapPost("/api/v1/inbound-leads", async (InboundLeadInput input, CrmDb db, HttpContext http) => {
    if (demoMode) return Results.Unauthorized();
    var authorization = http.Request.Headers["Authorization"].ToString();
    if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return Results.Unauthorized();
    var rawToken = authorization[7..].Trim();
    if (rawToken.Length is < 20 or > 200) return Results.Unauthorized();
    var hash = HashToken(rawToken);
    var integrationKey = await db.IntegrationKeys.SingleOrDefaultAsync(k => k.TokenHash == hash && k.RevokedAt == null);
    if (integrationKey is null) return Results.Unauthorized();
    var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == integrationKey.OwnerUserId && u.WorkspaceId == u.Id && u.Role == "Owner");
    if (owner is null || !await db.Memberships.AnyAsync(m => m.OwnerUserId == owner.Id && m.UserId == owner.Id && m.Active)) return Results.Unauthorized();

    var name = input.Name?.Trim();
    var email = input.Email?.Trim();
    var phone = input.Phone?.Trim();
    var source = input.Source?.Trim();
    var leadType = input.LeadType?.Trim();
    var zip = input.PropertyZipCode?.Trim();
    var method = input.ContactVerificationMethod?.Trim();
    var consentRecipient = input.ConsentRecipient?.Trim();
    var consentText = input.ConsentText?.Trim();
    var sourceUrl = input.SourceUrl?.Trim();
    var reviewReference = input.FsboAdminReviewReference?.Trim();
    var now = DateTimeOffset.UtcNow;
    var timestampsValid = input.ContactVerifiedAt.HasValue && input.IntentVerifiedAt.HasValue && input.ConsentCapturedAt.HasValue
        && input.ContactVerifiedAt.Value <= now.AddMinutes(5) && input.IntentVerifiedAt.Value <= now.AddMinutes(5) && input.ConsentCapturedAt.Value <= now.AddMinutes(5);
    var contactMatchesMethod = method switch {
        "Email" => !string.IsNullOrWhiteSpace(email) && ValidEmail(email),
        "Phone" => !string.IsNullOrWhiteSpace(phone),
        _ => false
    };
    var externalSourceValid = !input.ExternalFsbo ||
        ((source == "Fsbo" || source == "Zillow" || source == "Facebook" || source == "Craigslist" || source == "FsboCom") && !string.IsNullOrWhiteSpace(reviewReference) && reviewReference.Length <= 200 &&
         input.FsboAdminReviewedAt.HasValue && input.FsboAdminReviewedAt.Value <= now.AddMinutes(5) &&
         Uri.TryCreate(sourceUrl, UriKind.Absolute, out var fsboUri) && (fsboUri.Scheme == Uri.UriSchemeHttps || fsboUri.Scheme == Uri.UriSchemeHttp));
    var isBrokerageEmail = email is not null && System.Text.RegularExpressions.Regex.IsMatch(email, @"@(kw\.com|exprealty\.com|remax\.net|coldwellbanker\.com|compass\.com|redfin\.com|century21\.com|c21\.com|sothebys|weichert|properties|realty|realtor|broker)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    var isBrokerageName = name is not null && System.Text.RegularExpressions.Regex.IsMatch(name, @"\b(realtor|broker|agent|realty|real estate|properties llc)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    if (isBrokerageEmail || isBrokerageName)
        return Results.BadRequest(new { error = "Lead contact indicates a brokerage or licensed realtor. Only direct FSBO homeowners are accepted." });

    if (string.IsNullOrWhiteSpace(input.ExternalLeadId) || input.ExternalLeadId.Trim().Length > 160 ||
        string.IsNullOrWhiteSpace(name) || name.Length > 160 || email?.Length > 320 || (email is not null && !ValidEmail(email)) ||
        phone?.Length > 40 || input.Company?.Length > 160 || !inboundLeadSources.Contains(source ?? "") ||
        !leadTypes.Contains(leadType ?? "") || string.IsNullOrWhiteSpace(zip) || !System.Text.RegularExpressions.Regex.IsMatch(zip, @"^\d{5}(?:-\d{4})?$") ||
        !contactMatchesMethod || !timestampsValid || string.IsNullOrWhiteSpace(consentRecipient) || consentRecipient.Length > 200 || string.IsNullOrWhiteSpace(consentText) || consentText.Length > 2000 ||
        sourceUrl?.Length > 2000 || !externalSourceValid || (!input.ExternalFsbo && (reviewReference is not null || input.FsboAdminReviewedAt.HasValue)))
        return Results.BadRequest(new { error = "Lead is missing a valid source ID, name, contact, ZIP code, verified contact and intent, consent evidence, or required external-FSBO Admin review." });

    var externalLeadId = input.ExternalLeadId!.Trim();
    bool isSystemAdmin = owner.Email == "admin@nyrava.com" || owner.Email == "testadmin@example.test";

    // Find subscribed realtors covering this ZIP code
    var activeRealtors = await db.Users
        .Where(u => u.Role == "Owner" && u.WorkspaceId == u.Id && u.Email != "admin@nyrava.com" && u.Email != "testadmin@example.test")
        .ToListAsync();

    var matchingRealtors = activeRealtors
        .Where(r => GeographicService.MatchesZipCoverage(r, zip!))
        .ToList();

    CrmUser targetRecipient = owner;
    if (!isSystemAdmin) {
        if (GeographicService.MatchesZipCoverage(owner, zip!)) {
            targetRecipient = owner;
        } else if (matchingRealtors.Count > 0) {
            targetRecipient = matchingRealtors[0];
        } else {
            targetRecipient = owner;
        }
    }

    // Check for idempotency on target recipient
    var existingLead = await db.Contacts.SingleOrDefaultAsync(c => c.UserId == targetRecipient.Id && c.Source == source && c.ExternalLeadId == externalLeadId);
    if (existingLead is not null) {
        integrationKey.LastUsedAt = now;
        await db.SaveChangesAsync();
        return Results.Ok(existingLead);
    }

    // 1. Create primary lead for target recipient
    var primaryContact = new CrmContact {
        UserId = targetRecipient.Id,
        AssignedToUserId = targetRecipient.Id,
        Name = name!,
        Email = Clean(email, 320),
        Phone = Clean(phone, 40),
        Company = Clean(input.Company, 160),
        LeadType = leadType!,
        Stage = "New",
        Notes = isSystemAdmin ? $"[In Master Bank - Unassigned] FSBO Lead for ZIP {zip}. Verified direct homeowner." : $"FSBO Lead for ZIP {zip}. Verified direct homeowner.",
        Source = source!,
        ExternalLeadId = externalLeadId,
        PropertyZipCode = zip!,
        ContactVerificationMethod = method!,
        ContactVerifiedAt = input.ContactVerifiedAt,
        IntentVerifiedAt = input.IntentVerifiedAt,
        ConsentCapturedAt = input.ConsentCapturedAt,
        ConsentRecipient = consentRecipient!,
        ConsentText = consentText!,
        ExternalFsbo = input.ExternalFsbo,
        FsboAdminReviewReference = input.ExternalFsbo ? reviewReference : null,
        FsboAdminReviewedAt = input.ExternalFsbo ? input.FsboAdminReviewedAt : null,
        SourceUrl = Clean(sourceUrl, 2000),
        UpdatedAt = now
    };
    db.Contacts.Add(primaryContact);

    // 2. If called by System Admin, also dispatch to matching territory realtors
    if (isSystemAdmin && matchingRealtors.Count > 0) {
        var startOfDay = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        int dispatchedCount = 0;
        string dispatchedTo = "";

        foreach (var targetRealtor in matchingRealtors) {
            var realtorZipContacts = await db.Contacts
                .Where(c => c.UserId == targetRealtor.Id && c.PropertyZipCode == zip)
                .ToListAsync();
            var leadsTodayForZip = realtorZipContacts.Count(c => c.UpdatedAt >= startOfDay);

            if (leadsTodayForZip >= 2) continue;

            var existing = await db.Contacts.SingleOrDefaultAsync(c => c.UserId == targetRealtor.Id && c.Source == source && c.ExternalLeadId == externalLeadId);
            if (existing is not null) continue;

            var realtorLead = new CrmContact {
                UserId = targetRealtor.Id,
                AssignedToUserId = targetRealtor.Id,
                Name = name!,
                Email = Clean(email, 320),
                Phone = Clean(phone, 40),
                Company = Clean(input.Company, 160),
                LeadType = leadType!,
                Stage = "New",
                Notes = $"FSBO Lead for ZIP {zip}. Verified direct homeowner.",
                Source = source!,
                ExternalLeadId = externalLeadId,
                PropertyZipCode = zip!,
                ContactVerificationMethod = method!,
                ContactVerifiedAt = input.ContactVerifiedAt,
                IntentVerifiedAt = input.IntentVerifiedAt,
                ConsentCapturedAt = input.ConsentCapturedAt,
                ConsentRecipient = consentRecipient!,
                ConsentText = consentText!,
                ExternalFsbo = input.ExternalFsbo,
                FsboAdminReviewReference = input.ExternalFsbo ? reviewReference : null,
                FsboAdminReviewedAt = input.ExternalFsbo ? input.FsboAdminReviewedAt : null,
                SourceUrl = Clean(sourceUrl, 2000),
                UpdatedAt = now
            };
            db.Contacts.Add(realtorLead);
            dispatchedCount++;
            dispatchedTo = targetRealtor.Email;
        }

        if (dispatchedCount > 0) {
            primaryContact.Notes = $"[Dispatched to {dispatchedTo}] FSBO Lead for ZIP {zip}. Verified direct homeowner.";
        }
    }

    integrationKey.LastUsedAt = now;
    await db.SaveChangesAsync();
    return Results.Created($"/api/contacts/{primaryContact.Id}", primaryContact);
}).AllowAnonymous();

app.MapGet("/api/admin/area-intelligence", async (CrmDb db, HttpContext http) => {
    var actor = await CurrentUser(db, http);
    var isPlatformAdmin = actor.Email == "admin@nyrava.com" || actor.Email == "testadmin@example.test";

    var query = isPlatformAdmin 
        ? db.Contacts.AsQueryable() 
        : db.Contacts.Where(c => c.UserId == actor.WorkspaceId);

    var allContacts = await query.ToListAsync();

    var zipGroups = allContacts
        .Where(c => !string.IsNullOrEmpty(c.PropertyZipCode))
        .GroupBy(c => c.PropertyZipCode!)
        .Select(g => new {
            zip = g.Key,
            totalLeads = g.Count(),
            newCount = g.Count(c => c.Stage == "New"),
            contactedCount = g.Count(c => c.Stage == "Contacted" || c.Stage == "Qualified" || c.Stage == "Follow-up" || c.Stage == "Appointment"),
            verifiedCount = g.Count(c => c.Stage == "Verified Lead"),
            lostCount = g.Count(c => c.Stage == "Lost Lead"),
            sources = g.Select(c => c.Source ?? "Fsbo").Distinct().ToList(),
            sampleSourceUrl = g.Select(c => c.SourceUrl).FirstOrDefault(u => !string.IsNullOrEmpty(u)),
            lastLeadAt = g.Max(c => c.UpdatedAt),
            leads = g.Select(c => new {
                id = c.Id,
                name = c.Name,
                email = c.Email,
                phone = c.Phone,
                company = c.Company,
                stage = c.Stage,
                source = c.Source,
                notes = c.Notes
            }).ToList()
        })
        .OrderByDescending(g => g.totalLeads)
        .ToList();

    var sourceGroups = allContacts
        .GroupBy(c => c.Source ?? "Direct")
        .Select(g => new {
            source = g.Key,
            count = g.Count()
        })
        .OrderByDescending(g => g.count)
        .ToList();

    return Results.Ok(new {
        isPlatformAdmin,
        totalLeads = allContacts.Count,
        bankedLeads = allContacts.Count(c => c.Notes != null && c.Notes.Contains("[In Master Bank")),
        dispatchedLeads = allContacts.Count(c => c.Notes != null && (c.Notes.Contains("[Dispatched") || c.Notes.Contains("Routed"))),
        zipAnalytics = zipGroups,
        sourceAnalytics = sourceGroups
    });
}).RequireAuthorization();

app.MapGet("/api/admin/realtors", async (CrmDb db, HttpContext http) => {
    var actor = await CurrentUser(db, http);
    var isPlatformAdmin = actor.Email == "admin@nyrava.com" || actor.Email == "testadmin@example.test";
    if (!isPlatformAdmin) return Results.Forbid();
    var realtors = await db.Users
        .Where(u => u.Email != "admin@nyrava.com" && u.Email != "testadmin@example.test" && u.Role == "Owner")
        .Select(u => new { u.Id, u.Email, u.SubscribedZipCodes, u.SubscriptionPlan, u.SubscriptionStatus })
        .ToListAsync();
    return Results.Ok(realtors);
}).RequireAuthorization();

app.MapGet("/admin", () => Results.Redirect("/index.html"));
app.MapGet("/admin/login", () => Results.Redirect("/index.html"));

app.MapPost("/api/admin/dispatch-lead/{contactId:long}", async (long contactId, AdminLeadAssignInput input, CrmDb db, HttpContext http) => {
    var actor = await CurrentUser(db, http);
    var isPlatformAdmin = actor.Email == "admin@nyrava.com" || actor.Email == "testadmin@example.test";
    if (!isPlatformAdmin) return Results.Forbid();
    var contact = await db.Contacts.SingleOrDefaultAsync(x => x.Id == contactId);
    if (contact is null) return Results.NotFound();
    var targetRealtor = await db.Users.SingleOrDefaultAsync(u => u.Id == input.RealtorUserId && u.Role == "Owner");
    if (targetRealtor is null) return Results.BadRequest(new { error = "Target realtor not found." });

    // Transfer lead directly to target realtor workspace so it moves out of Platform Admin ("mine")
    contact.UserId = targetRealtor.Id;
    contact.AssignedToUserId = targetRealtor.Id;
    contact.Stage = "New";
    contact.Notes = $"[Dispatched to {targetRealtor.Email}] FSBO Lead for ZIP {contact.PropertyZipCode}. Verified direct homeowner.";
    contact.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { success = true, dispatchedTo = targetRealtor.Email });
}).RequireAuthorization();
app.MapPut("/api/contacts/{id:long}", async (long id, ContactUpdate input, CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var userId=actor.Id;
    var item = await db.Contacts.SingleOrDefaultAsync(x => x.Id == id && x.UserId == actor.WorkspaceId && (actor.Role=="Owner"||x.AssignedToUserId==userId));
    if (item is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 160 || input.Email?.Length > 320 || (!string.IsNullOrWhiteSpace(input.Email) && !ValidEmail(input.Email.Trim())) || input.Phone?.Length > 40 || input.Company?.Length > 160 || input.Notes?.Length > 4000 || !stages.Contains(input.Stage) || !leadTypes.Contains(input.LeadType)) return Results.BadRequest(new { error = "Check the contact fields and pipeline stage." });
    item.Name = input.Name.Trim(); item.Email = Clean(input.Email, 320); item.Phone = Clean(input.Phone, 40); item.Company = Clean(input.Company, 160); item.Notes = Clean(input.Notes, 4000); item.Stage = input.Stage; item.LeadType = input.LeadType; item.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync(); return Results.Ok(item);
}).RequireAuthorization();
app.MapDelete("/api/contacts/{id:long}", async (long id, bool? permanent, CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http);
    if(actor.Role!="Owner")return Results.Forbid();
    var item = await db.Contacts.SingleOrDefaultAsync(x => x.Id == id && x.UserId == actor.WorkspaceId);
    if (item is null) return Results.NotFound();
    if (permanent == true) {
        var acts = await db.Activities.Where(a => a.ContactId == id).ToListAsync();
        db.Activities.RemoveRange(acts);
        db.Contacts.Remove(item);
    } else {
        item.ArchivedAt=DateTimeOffset.UtcNow;
        item.UpdatedAt=DateTimeOffset.UtcNow;
    }
    await db.SaveChangesAsync(); 
    return Results.NoContent();
}).RequireAuthorization();
app.MapPost("/api/contacts/{id:long}/restore",async(long id,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http);if(actor.Role!="Owner")return Results.Forbid();var item=await db.Contacts.SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==actor.WorkspaceId&&x.ArchivedAt!=null);if(item is null)return Results.NotFound();item.ArchivedAt=null;item.UpdatedAt=DateTimeOffset.UtcNow;await db.SaveChangesAsync();return Results.Ok(item);
}).RequireAuthorization();

app.MapGet("/api/activities", async (CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var userId=actor.Id;
    // SQLite cannot translate ORDER BY for DateTimeOffset. Fetch the scoped
    // rows first, then sort in memory so the SQLite starter works reliably.
    var items = await db.Activities
        .Include(x => x.Contact)
        .Where(x => x.UserId == actor.WorkspaceId && x.Contact.ArchivedAt==null && (actor.Role=="Owner" || x.Contact.AssignedToUserId==userId))
        .ToListAsync();
    return items.OrderBy(x => x.StartsAt).ToList();
}).RequireAuthorization();
app.MapPost("/api/activities", async (ActivityInput input, CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var userId=actor.Id;
    if (string.IsNullOrWhiteSpace(input.Title) || input.Title.Trim().Length > 160 || input.Details?.Length > 4000 || input.Location?.Length > 300 || input.TimeZone?.Length > 100 || !new[] { "Note", "Task", "Follow-up", "Appointment" }.Contains(input.Kind)) return Results.BadRequest(new { error = "Check activity type, title, location and note lengths." });
    var contact=await db.Contacts.SingleOrDefaultAsync(x=>x.Id==input.ContactId&&x.UserId==actor.WorkspaceId&&(actor.Role=="Owner"||x.AssignedToUserId==userId)); if(contact is null)return Results.NotFound(new { error = "Contact not found." });
    var item = new CrmActivity { UserId = actor.WorkspaceId, CreatedByUserId=userId, AssignedToUserId=contact.AssignedToUserId, ContactId = input.ContactId, Kind = input.Kind, Title = input.Title.Trim(), Details = Clean(input.Details, 4000), Location=Clean(input.Location,300), TimeZone=Clean(input.TimeZone,100), StartsAt = input.StartsAt, EndsAt = input.StartsAt, Completed = false };
    db.Activities.Add(item); await db.SaveChangesAsync(); return Results.Created($"/api/activities/{item.Id}", item);
}).RequireAuthorization();
app.MapPut("/api/activities/{id:long}",async(long id,ActivityUpdate input,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http);var userId=actor.Id;
    if(string.IsNullOrWhiteSpace(input.Title)||input.Title.Trim().Length>160||input.Details?.Length>4000||input.Location?.Length>300||input.TimeZone?.Length>100||!new[]{"Note","Task","Follow-up","Appointment"}.Contains(input.Kind))return Results.BadRequest(new{error="Check activity fields and lengths."});
    var item=await db.Activities.Include(x=>x.Contact).SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==actor.WorkspaceId&&(actor.Role=="Owner"||x.Contact.AssignedToUserId==userId));
    if(item is null)return Results.NotFound();
    var contact=await db.Contacts.SingleOrDefaultAsync(x=>x.Id==input.ContactId&&x.UserId==actor.WorkspaceId&&(actor.Role=="Owner"||x.AssignedToUserId==userId));if(contact is null)return Results.BadRequest(new{error="Choose a contact you can access."});
    item.ContactId=input.ContactId;item.AssignedToUserId=contact.AssignedToUserId;item.Kind=input.Kind;item.Title=input.Title.Trim();item.Details=Clean(input.Details,4000);item.Location=Clean(input.Location,300);item.TimeZone=Clean(input.TimeZone,100);item.StartsAt=input.StartsAt;item.EndsAt=input.StartsAt;item.Completed=false;item.Result=null;
    await db.SaveChangesAsync();return Results.Ok(item);
}).RequireAuthorization();
app.MapPut("/api/activities/{id:long}/complete", async (long id, CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var item = await db.Activities.Include(x=>x.Contact).SingleOrDefaultAsync(x => x.Id == id && x.UserId == actor.WorkspaceId && (actor.Role=="Owner"||x.Contact.AssignedToUserId==actor.Id)); if (item is null) return Results.NotFound();
    item.Completed = true; await db.SaveChangesAsync(); return Results.Ok(item);
}).RequireAuthorization();
app.MapPost("/api/activities/{id:long}/result",async(long id,ResultInput input,CrmDb db,HttpContext http)=>{
    var actor=await CurrentUser(db,http);var allowed=new HashSet<string>(StringComparer.Ordinal){"Held","Missed","Canceled","Rescheduled","Follow-up needed","Converted","Not interested"};
    if(!allowed.Contains(input.Result)||input.Notes?.Length>4000)return Results.BadRequest(new{error="Choose a listed appointment result and keep the note under 4,000 characters."});
    var item=await db.Activities.Include(x=>x.Contact).SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==actor.WorkspaceId&&(actor.Role=="Owner"||x.Contact.AssignedToUserId==actor.Id));
    if(item is null||item.Kind!="Appointment")return Results.NotFound();item.Result=input.Result;item.Completed=true;if(!string.IsNullOrWhiteSpace(input.Notes))item.Details=Clean(input.Notes,4000);var history=System.Text.Json.JsonSerializer.Deserialize<List<AppointmentResultRecord>>(item.ResultHistory??"[]")??[];history.Add(new AppointmentResultRecord(input.Result,Clean(input.Notes,4000),DateTimeOffset.UtcNow,actor.Id));item.ResultHistory=System.Text.Json.JsonSerializer.Serialize(history);await db.SaveChangesAsync();return Results.Ok(item);
}).RequireAuthorization();
app.MapDelete("/api/activities/{id:long}", async (long id, CrmDb db, HttpContext http) => {
    var actor=await CurrentUser(db,http); var item = await db.Activities.Include(x=>x.Contact).SingleOrDefaultAsync(x => x.Id == id && x.UserId == actor.WorkspaceId && actor.Role=="Owner"); if (item is null) return Results.NotFound();
    db.Activities.Remove(item); await db.SaveChangesAsync(); return Results.NoContent();
}).RequireAuthorization();

app.Run();

static async Task SeedDemoWorkspaceAsync(CrmDb db)
{
    const string ownerEmail = "testone@example.test";
    const string employeeEmail = "testtwo@example.test";
    var demoInviteHash = HashToken("1234");
    var owner = await db.Users.SingleOrDefaultAsync(x => x.Email == ownerEmail);
    if (owner is not null) {
        owner.Role="Owner"; owner.WorkspaceId=owner.Id;
        if(!BCrypt.Net.BCrypt.Verify("DemoCRM!2026TestOne",owner.PasswordHash)) owner.PasswordHash=BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestOne");
        await db.SaveChangesAsync();
        var existingEmployee=await db.Users.SingleOrDefaultAsync(x=>x.Email==employeeEmail);
        if(existingEmployee is null){existingEmployee=new CrmUser{Email=employeeEmail,PasswordHash=BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestTwo"),WorkspaceId=owner.Id,Role="Employee"};db.Users.Add(existingEmployee);await db.SaveChangesAsync();}
        else {existingEmployee.WorkspaceId=owner.Id;existingEmployee.Role="Employee";if(!BCrypt.Net.BCrypt.Verify("DemoCRM!2026TestTwo",existingEmployee.PasswordHash))existingEmployee.PasswordHash=BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestTwo");await db.SaveChangesAsync();}
        var ownerMembership=await db.Memberships.SingleOrDefaultAsync(x=>x.OwnerUserId==owner.Id&&x.UserId==owner.Id);
        if(ownerMembership is null)db.Memberships.Add(new CrmMembership{OwnerUserId=owner.Id,UserId=owner.Id,Role="Owner",Active=true});
        var employeeMembership=await db.Memberships.SingleOrDefaultAsync(x=>x.OwnerUserId==owner.Id&&x.UserId==existingEmployee.Id);
        if(employeeMembership is null)db.Memberships.Add(new CrmMembership{OwnerUserId=owner.Id,UserId=existingEmployee.Id,Role="Employee",Active=true});
        else {employeeMembership.Role="Employee";employeeMembership.Active=true;}
        await db.SaveChangesAsync();
        if (!await db.Invitations.AnyAsync(x=>x.OwnerUserId==owner.Id&&x.TokenHash==demoInviteHash)) {
            db.Invitations.Add(new CrmInvitation { OwnerUserId=owner.Id,TokenHash=demoInviteHash,ExpiresAt=DateTimeOffset.UtcNow.AddYears(5) });
            await db.SaveChangesAsync();
        }
        await EnsureDemoAdminAsync(db);
        return;
    }
    owner = new CrmUser { Email = ownerEmail, PasswordHash = BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestOne"), Role = "Owner" };
    db.Users.Add(owner);
    await db.SaveChangesAsync();
    owner.WorkspaceId = owner.Id;
    var employee = new CrmUser { Email = employeeEmail, PasswordHash = BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestTwo"), WorkspaceId = owner.Id, Role = "Employee" };
    db.Users.Add(employee);
    await db.SaveChangesAsync();
    db.Memberships.AddRange(
        new CrmMembership { OwnerUserId = owner.Id, UserId = owner.Id, Role = "Owner", Active = true },
        new CrmMembership { OwnerUserId = owner.Id, UserId = employee.Id, Role = "Employee", Active = true });
    var now = DateTimeOffset.UtcNow;
    CrmContact Contact(string name,string type,string stage,long assigned,string email,string phone,string notes) => new() { UserId=owner.Id,AssignedToUserId=assigned,Name=name,LeadType=type,Stage=stage,Email=email,Phone=phone,Company="Demo Realty",Notes=notes,UpdatedAt=now };
    var c1=Contact("Jordan Sample","Buyer","Qualified",owner.Id,"jordan@example.test","+1 555-0101","Demo buyer; interested in a home near downtown.");
    var c2=Contact("Morgan Example","Seller","Appointment",employee.Id,"morgan@example.test","+1 555-0102","Demo seller; wants a pricing consultation.");
    var c3=Contact("Casey Demo","Buyer","Contacted",employee.Id,"casey@example.test","+1 555-0103","Asked for neighborhood recommendations.");
    var c4=Contact("Taylor Test","Seller","Follow-up",owner.Id,"taylor@example.test","+1 555-0104","Follow up after the initial property walk-through.");
    var c5=Contact("Riley Example","Buyer","Verified Lead",owner.Id,"riley@example.test","+1 555-0105","Demo verified lead for dashboard testing.");
    db.Contacts.AddRange(c1,c2,c3,c4,c5);
    await db.SaveChangesAsync();
    CrmActivity Activity(CrmContact c,string kind,string title,DateTimeOffset at,string? detail=null,string? location=null,bool completed=false,string? result=null) => new() { UserId=owner.Id,CreatedByUserId=c.AssignedToUserId??owner.Id,AssignedToUserId=c.AssignedToUserId,ContactId=c.Id,Contact=c,Kind=kind,Title=title,StartsAt=at,EndsAt=at,Details=detail,Location=location,TimeZone="America/Mexico_City",Completed=completed,Result=result };
    var activities=new[] {
        Activity(c1,"Appointment","Buyer discovery call",now.AddDays(1).Date.AddHours(16),"Discuss budget, preferred areas, and next steps.","Video call link: https://example.test/demo-call"),
        Activity(c2,"Appointment","Seller pricing consultation",now.AddDays(2).Date.AddHours(18),"Review property details and recommended next steps.","123 Sample Street"),
        Activity(c3,"Appointment","Neighborhood tour",now.AddDays(4).Date.AddHours(15),"Bring the shortlist of sample properties.","Meet at the client office"),
        Activity(c4,"Appointment","Initial property walk-through",now.AddDays(-2).Date.AddHours(17),"Demo result history sample.","456 Example Avenue",true,"Held"),
        Activity(c1,"Task","Send buyer intake checklist",now.AddHours(5),"Share the demo checklist and confirm budget."),
        Activity(c2,"Follow-up","Confirm consultation details",now.AddDays(1).Date.AddHours(12),"Confirm the seller can access the property."),
        Activity(c3,"Task","Send neighborhood shortlist",now.AddDays(2).Date.AddHours(10),"Prepare three demo neighborhood options."),
        Activity(c5,"Appointment","Sample completed appointment",now.AddDays(-7),"A completed demo appointment.",null,true,"Converted")
    };
    activities[3].ResultHistory=System.Text.Json.JsonSerializer.Serialize(new[]{new AppointmentResultRecord("Held","Walk-through completed; seller requested a follow-up.",now.AddDays(-2),owner.Id)});
    db.Activities.AddRange(activities);
    db.Messages.AddRange(
        new CrmMessage { WorkspaceOwnerId=owner.Id,SenderUserId=owner.Id,RecipientUserId=employee.Id,Body="Welcome to the demo team chat. Try replying as Test Two.",CreatedAt=now.AddMinutes(-4) },
        new CrmMessage { WorkspaceOwnerId=owner.Id,SenderUserId=employee.Id,RecipientUserId=owner.Id,Body="Thanks! I can see my assigned contacts and calendar items.",CreatedAt=now.AddMinutes(-2) });
    db.Invitations.Add(new CrmInvitation { OwnerUserId=owner.Id,TokenHash=demoInviteHash,ExpiresAt=now.AddYears(5) });
    await db.SaveChangesAsync();
    await EnsureDemoAdminAsync(db);
}

static async Task EnsureSystemAdminAsync(CrmDb db) {
    const string adminEmail = "admin@nyrava.com";
    var admin = await db.Users.SingleOrDefaultAsync(x => x.Email == adminEmail);
    if (admin is null) {
        admin = new CrmUser {
            Email = adminEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("NyravaAdmin2026!"),
            Role = "Owner",
            Country = "US",
            PostalCode = "77084",
            SubscribedZipCodes = "",
            SubscriptionStatus = "Active",
            SubscriptionPlan = "Platform Admin Master"
        };
        db.Users.Add(admin);
        await db.SaveChangesAsync();
        admin.WorkspaceId = admin.Id;
        await db.SaveChangesAsync();
    } else {
        admin.Role = "Owner";
        if (admin.WorkspaceId == 0) admin.WorkspaceId = admin.Id;
        if (!BCrypt.Net.BCrypt.Verify("NyravaAdmin2026!", admin.PasswordHash) && !BCrypt.Net.BCrypt.Verify("Admin2026!", admin.PasswordHash)) {
            admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword("NyravaAdmin2026!");
        }
        await db.SaveChangesAsync();
    }

    if (!await db.Memberships.AnyAsync(x => x.OwnerUserId == admin.Id && x.UserId == admin.Id)) {
        db.Memberships.Add(new CrmMembership { OwnerUserId = admin.Id, UserId = admin.Id, Role = "Owner", Active = true });
        await db.SaveChangesAsync();
    }

    // Ensure all IntegrationKeys belong to the master Platform Admin
    var keys = await db.IntegrationKeys.ToListAsync();
    foreach (var k in keys) {
        k.OwnerUserId = admin.Id;
    }

    // Move any banked leads that do not match the realtor's subscribed ZIP codes to the Admin bank
    var realtor = await db.Users.SingleOrDefaultAsync(x => x.Email == "h.g4972@gmail.com");
    if (realtor is not null) {
        var realtorContacts = await db.Contacts
            .Where(c => c.UserId == realtor.Id)
            .ToListAsync();
        var unassignedLeads = realtorContacts
            .Where(c => c.PropertyZipCode == null || !GeographicService.MatchesZipCoverage(realtor, c.PropertyZipCode))
            .ToList();
        foreach (var c in unassignedLeads) {
            c.UserId = admin.Id;
            c.AssignedToUserId = admin.Id;
            if (string.IsNullOrWhiteSpace(c.Notes) || (!c.Notes.Contains("[In Master Bank") && !c.Notes.Contains("[Dispatched"))) {
                c.Notes = $"[In Master Bank - Unassigned] {c.Notes}".Trim();
            }
        }
    }

    await db.SaveChangesAsync();
}

static async Task EnsureDemoAdminAsync(CrmDb db) {
    const string email="testadmin@example.test";
    var admin=await db.Users.SingleOrDefaultAsync(x=>x.Email==email);
    if(admin is null) {
        admin=new CrmUser { Email=email,PasswordHash=BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestAdmin"),Role="Owner" };
        db.Users.Add(admin); await db.SaveChangesAsync(); admin.WorkspaceId=admin.Id; await db.SaveChangesAsync();
    }
    else {
        admin.Role="Owner"; if(admin.WorkspaceId==0)admin.WorkspaceId=admin.Id;
        if(!BCrypt.Net.BCrypt.Verify("DemoCRM!2026TestAdmin",admin.PasswordHash))admin.PasswordHash=BCrypt.Net.BCrypt.HashPassword("DemoCRM!2026TestAdmin");
        await db.SaveChangesAsync();
    }
    if(!await db.Memberships.AnyAsync(x=>x.OwnerUserId==admin.Id&&x.UserId==admin.Id)) {
        db.Memberships.Add(new CrmMembership { OwnerUserId=admin.Id,UserId=admin.Id,Role="Owner",Active=true });
        await db.SaveChangesAsync();
    }
}

static long UserId(HttpContext http) => long.Parse(http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value, System.Globalization.CultureInfo.InvariantCulture);
static async Task<CrmUser> CurrentUser(CrmDb db,HttpContext http){var id=UserId(http);var u=await db.Users.SingleAsync(x=>x.Id==id);if(!await db.Memberships.AnyAsync(m=>m.OwnerUserId==u.WorkspaceId&&m.UserId==u.Id&&m.Active))throw new UnauthorizedAccessException("Your CRM workspace access has been disabled.");return u;}
static string HashToken(string value)=>Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value)));
static async Task<bool> CanChat(CrmDb db,CrmUser actor,long peerId)=>
    peerId!=actor.Id && await db.Memberships.AnyAsync(m=>m.OwnerUserId==actor.WorkspaceId&&m.UserId==actor.Id&&m.Active) &&
    await db.Memberships.AnyAsync(m=>m.OwnerUserId==actor.WorkspaceId&&m.UserId==peerId&&m.Active);
static async Task EnsureColumnAsync(CrmDb db,string table,string column,string sqliteType,string defaultSql){
    var connection=db.Database.GetDbConnection();var wasClosed=connection.State!=System.Data.ConnectionState.Open;if(wasClosed)await connection.OpenAsync();
    try{
        await using var cmd=connection.CreateCommand();
        if(db.Database.IsSqlite()){
            cmd.CommandText=$"PRAGMA table_info('{table}')";await using var reader=await cmd.ExecuteReaderAsync();var found=false;while(await reader.ReadAsync())if(reader.GetString(1)==column)found=true;await reader.CloseAsync();
            if(!found)await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {table} ADD COLUMN {column} {sqliteType} {(defaultSql=="NULL"?"NULL":$"NOT NULL DEFAULT {defaultSql}")}");
        }else if(db.Database.IsSqlServer()){
            cmd.CommandText="SELECT CASE WHEN COL_LENGTH(@table,@column) IS NULL THEN 0 ELSE 1 END";var p=cmd.CreateParameter();p.ParameterName="@table";p.Value=table;cmd.Parameters.Add(p);p=cmd.CreateParameter();p.ParameterName="@column";p.Value=column;cmd.Parameters.Add(p);
            var found=Convert.ToInt32(await cmd.ExecuteScalarAsync())==1;
            if(!found){
                var sqlType=column switch{
                    "WorkspaceId" or "AssignedToUserId" or "CreatedByUserId"=>"bigint",
                    "ArchivedAt" or "ContactVerifiedAt" or "IntentVerifiedAt" or "ConsentCapturedAt" or "FsboAdminReviewedAt"=>"datetimeoffset",
                    "ExternalFsbo"=>"bit",
                    "ConsentRecipient"=>"nvarchar(200)",
                    "ConsentText"=>"nvarchar(max)",
                    "SourceUrl"=>"nvarchar(2000)",
                    "ExternalLeadId"=>"nvarchar(160)",
                    "FsboAdminReviewReference"=>"nvarchar(200)",
                    "PropertyZipCode"=>"nvarchar(16)",
                    "Location"=>"nvarchar(300)",
                    "TimeZone"=>"nvarchar(100)",
                    "ResultHistory"=>"nvarchar(max)",
                    _=>"nvarchar(32)"
                };
                var nullable=defaultSql=="NULL";
                await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {table} ADD {column} {sqlType} {(nullable?"NULL":$"NOT NULL CONSTRAINT DF_{table}_{column} DEFAULT {defaultSql}")}");
            }
        }else{
            cmd.CommandText="SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=@table AND COLUMN_NAME=@column";var p=cmd.CreateParameter();p.ParameterName="@table";p.Value=table;cmd.Parameters.Add(p);p=cmd.CreateParameter();p.ParameterName="@column";p.Value=column;cmd.Parameters.Add(p);
            if(Convert.ToInt32(await cmd.ExecuteScalarAsync())==0){
                var sqlType=column switch{
                    "WorkspaceId" or "AssignedToUserId" or "CreatedByUserId"=>"bigint",
                    "ArchivedAt" or "ContactVerifiedAt" or "IntentVerifiedAt" or "ConsentCapturedAt" or "FsboAdminReviewedAt"=>"datetime(6)",
                    "ExternalFsbo"=>"bit",
                    "ConsentRecipient"=>"varchar(200)",
                    "ConsentText" or "ResultHistory"=>"longtext",
                    "SourceUrl"=>"varchar(2000)",
                    "ExternalLeadId"=>"varchar(160)",
                    "FsboAdminReviewReference"=>"varchar(200)",
                    "PropertyZipCode"=>"varchar(16)",
                    "Location"=>"varchar(300)",
                    "TimeZone"=>"varchar(100)",
                    _=>"varchar(32)"
                };
                var nullable=defaultSql=="NULL";
                await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {table} ADD COLUMN {column} {sqlType} {(nullable?"NULL":$"NOT NULL DEFAULT {defaultSql}")}");
            }
        }
    }finally{if(wasClosed)await connection.CloseAsync();}
}
static async Task EnsureTeamTablesAsync(CrmDb db){
    string[] sql;
    if(db.Database.IsSqlite())sql=[
        "CREATE TABLE IF NOT EXISTS Memberships (Id INTEGER PRIMARY KEY AUTOINCREMENT, OwnerUserId INTEGER NOT NULL, UserId INTEGER NOT NULL, Role TEXT NOT NULL, Active INTEGER NOT NULL, JoinedAt TEXT NOT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS IX_Memberships_OwnerUserId_UserId ON Memberships(OwnerUserId,UserId)",
        "CREATE TABLE IF NOT EXISTS Invitations (Id INTEGER PRIMARY KEY AUTOINCREMENT, OwnerUserId INTEGER NOT NULL, TokenHash TEXT NOT NULL, Email TEXT NULL, ExpiresAt TEXT NOT NULL, AcceptedAt TEXT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS IX_Invitations_TokenHash ON Invitations(TokenHash)",
        "CREATE TABLE IF NOT EXISTS Messages (Id INTEGER PRIMARY KEY AUTOINCREMENT, WorkspaceOwnerId INTEGER NOT NULL, SenderUserId INTEGER NOT NULL, RecipientUserId INTEGER NOT NULL, Body TEXT NOT NULL, CreatedAt TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS IX_Messages_WorkspaceOwnerId_CreatedAt ON Messages(WorkspaceOwnerId,CreatedAt)"];
    else if(db.Database.IsSqlServer())sql=[
        "IF OBJECT_ID('Memberships','U') IS NULL CREATE TABLE Memberships (Id bigint IDENTITY PRIMARY KEY, OwnerUserId bigint NOT NULL, UserId bigint NOT NULL, Role nvarchar(32) NOT NULL, Active bit NOT NULL, JoinedAt datetimeoffset NOT NULL)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Memberships_OwnerUserId_UserId') CREATE UNIQUE INDEX IX_Memberships_OwnerUserId_UserId ON Memberships(OwnerUserId,UserId)",
        "IF OBJECT_ID('Invitations','U') IS NULL CREATE TABLE Invitations (Id bigint IDENTITY PRIMARY KEY, OwnerUserId bigint NOT NULL, TokenHash nvarchar(64) NOT NULL, Email nvarchar(320) NULL, ExpiresAt datetimeoffset NOT NULL, AcceptedAt datetimeoffset NULL)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Invitations_TokenHash') CREATE UNIQUE INDEX IX_Invitations_TokenHash ON Invitations(TokenHash)",
        "IF OBJECT_ID('Messages','U') IS NULL CREATE TABLE Messages (Id bigint IDENTITY PRIMARY KEY, WorkspaceOwnerId bigint NOT NULL, SenderUserId bigint NOT NULL, RecipientUserId bigint NOT NULL, Body nvarchar(4000) NOT NULL, CreatedAt datetimeoffset NOT NULL)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Messages_WorkspaceOwnerId_CreatedAt') CREATE INDEX IX_Messages_WorkspaceOwnerId_CreatedAt ON Messages(WorkspaceOwnerId,CreatedAt)"];
    else sql=[
        "CREATE TABLE IF NOT EXISTS Memberships (Id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, OwnerUserId bigint NOT NULL, UserId bigint NOT NULL, Role varchar(32) NOT NULL, Active bit NOT NULL, JoinedAt datetime(6) NOT NULL, UNIQUE KEY UQ_Memberships_OwnerUserId_UserId (OwnerUserId,UserId))",
        "CREATE TABLE IF NOT EXISTS Invitations (Id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, OwnerUserId bigint NOT NULL, TokenHash varchar(64) NOT NULL, Email varchar(320) NULL, ExpiresAt datetime(6) NOT NULL, AcceptedAt datetime(6) NULL, UNIQUE KEY UQ_Invitations_TokenHash (TokenHash))",
        "CREATE TABLE IF NOT EXISTS Messages (Id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, WorkspaceOwnerId bigint NOT NULL, SenderUserId bigint NOT NULL, RecipientUserId bigint NOT NULL, Body varchar(4000) NOT NULL, CreatedAt datetime(6) NOT NULL)"];
    foreach(var statement in sql)await db.Database.ExecuteSqlRawAsync(statement);
}
static async Task EnsureIntegrationTablesAsync(CrmDb db){
    string[] sql;
    if(db.Database.IsSqlite())sql=[
        "CREATE TABLE IF NOT EXISTS IntegrationKeys (Id INTEGER PRIMARY KEY AUTOINCREMENT, OwnerUserId INTEGER NOT NULL, Name TEXT NOT NULL, TokenHash TEXT NOT NULL, TokenPrefix TEXT NOT NULL, CreatedAt TEXT NOT NULL, LastUsedAt TEXT NULL, RevokedAt TEXT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS IX_IntegrationKeys_TokenHash ON IntegrationKeys(TokenHash)",
        "CREATE INDEX IF NOT EXISTS IX_IntegrationKeys_OwnerUserId_RevokedAt ON IntegrationKeys(OwnerUserId,RevokedAt)",
        "CREATE UNIQUE INDEX IF NOT EXISTS IX_Contacts_UserId_Source_ExternalLeadId ON Contacts(UserId,Source,ExternalLeadId) WHERE ExternalLeadId IS NOT NULL"];
    else if(db.Database.IsSqlServer())sql=[
        "IF OBJECT_ID('IntegrationKeys','U') IS NULL CREATE TABLE IntegrationKeys (Id bigint IDENTITY PRIMARY KEY, OwnerUserId bigint NOT NULL, Name nvarchar(100) NOT NULL, TokenHash nvarchar(64) NOT NULL, TokenPrefix nvarchar(24) NOT NULL, CreatedAt datetimeoffset NOT NULL, LastUsedAt datetimeoffset NULL, RevokedAt datetimeoffset NULL)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_IntegrationKeys_TokenHash') CREATE UNIQUE INDEX IX_IntegrationKeys_TokenHash ON IntegrationKeys(TokenHash)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_IntegrationKeys_OwnerUserId_RevokedAt') CREATE INDEX IX_IntegrationKeys_OwnerUserId_RevokedAt ON IntegrationKeys(OwnerUserId,RevokedAt)",
        "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Contacts_UserId_Source_ExternalLeadId' AND filter_definition IS NULL) DROP INDEX IX_Contacts_UserId_Source_ExternalLeadId ON Contacts; IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Contacts_UserId_Source_ExternalLeadId') CREATE UNIQUE INDEX IX_Contacts_UserId_Source_ExternalLeadId ON Contacts(UserId,Source,ExternalLeadId) WHERE ExternalLeadId IS NOT NULL"];
    else sql=[
        "CREATE TABLE IF NOT EXISTS IntegrationKeys (Id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, OwnerUserId bigint NOT NULL, Name varchar(100) NOT NULL, TokenHash char(64) NOT NULL, TokenPrefix varchar(24) NOT NULL, CreatedAt datetime(6) NOT NULL, LastUsedAt datetime(6) NULL, RevokedAt datetime(6) NULL, UNIQUE KEY UQ_IntegrationKeys_TokenHash (TokenHash), KEY IX_IntegrationKeys_OwnerUserId_RevokedAt (OwnerUserId,RevokedAt))"];
    foreach(var statement in sql)await db.Database.ExecuteSqlRawAsync(statement);
    if(!db.Database.IsSqlite()&&!db.Database.IsSqlServer()){
        var exists=await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Contacts' AND INDEX_NAME='IX_Contacts_UserId_Source_ExternalLeadId'").SingleAsync();
        if(exists==0)await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IX_Contacts_UserId_Source_ExternalLeadId ON Contacts(UserId,Source,ExternalLeadId)");
    }
}
static string? Clean(string? value, int max) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];
static bool ValidEmail(string email) => email.Length <= 320 && System.Net.Mail.MailAddress.TryCreate(email, out var parsed) && parsed.Address == email;
static bool MailDeliveryConfigured(IConfiguration config) =>
    !string.IsNullOrWhiteSpace(config["Crm:Email:SmtpHost"]) &&
    int.TryParse(config["Crm:Email:SmtpPort"], out var port) && port is > 0 and <= 65535 &&
    ValidEmail(config["Crm:Email:From"] ?? "");
static async Task SendInvitationEmailAsync(IConfiguration config,string recipient,string invitationUrl,string subscriberEmail) {
    var host=config["Crm:Email:SmtpHost"]!;
    var port=int.Parse(config["Crm:Email:SmtpPort"]!);
    using var message=new System.Net.Mail.MailMessage(config["Crm:Email:From"]!,recipient) {
        Subject="You are invited to join a CRM workspace",
        Body=$"{subscriberEmail} invited you to join their CRM workspace as a team member. This invitation expires in seven days.\r\n\r\nCreate your account and accept the invitation: {invitationUrl}\r\n\r\nThis link grants access only to the inviting subscriber's workspace.",
        IsBodyHtml=false
    };
    using var client=new System.Net.Mail.SmtpClient(host,port) { EnableSsl=config.GetValue("Crm:Email:EnableSsl",true),DeliveryMethod=System.Net.Mail.SmtpDeliveryMethod.Network,Timeout=15000 };
    var username=config["Crm:Email:Username"]; var password=config["Crm:Email:Password"];
    if(!string.IsNullOrWhiteSpace(username)) client.Credentials=new System.Net.NetworkCredential(username,password??"");
    await client.SendMailAsync(message);
}
static Task SignIn(HttpContext http, CrmUser user) {
    var claims = new[] { new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, user.Id.ToString()), new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, user.Email) };
    var principal = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(claims, "crm-cookie"));
    return http.SignInAsync("crm-cookie", principal);
}
record RegisterRequest(string? Email, string? Password, string? InvitationCode=null, string? Country="US", string? PostalCode="78701", string? SubscribedZipCodes=null, string? Plan="monthly", bool? AcceptTerms=true);
record TerritoryUpdateInput(string? ZipCodes);
record LoginRequest(string? Email, string? Password);
record ContactInput(string Name, string? Email, string? Phone, string? Company, string LeadType = "Other");
record ContactUpdate(string Name, string? Email, string? Phone, string? Company, string Stage, string? Notes, string LeadType = "Other");
record IntegrationKeyCreateRequest(string? Name);
record InboundLeadInput(string? ExternalLeadId,string? Source,string? Name,string? Email,string? Phone,string? Company,string? LeadType,string? PropertyZipCode,string? ContactVerificationMethod,DateTimeOffset? ContactVerifiedAt,DateTimeOffset? IntentVerifiedAt,DateTimeOffset? ConsentCapturedAt,string? ConsentRecipient,string? ConsentText,string? SourceUrl,bool ExternalFsbo,string? FsboAdminReviewReference,DateTimeOffset? FsboAdminReviewedAt);
record ActivityInput(long ContactId, string Kind, string Title, string? Details, DateTimeOffset StartsAt, string? Location=null, string? TimeZone=null);
record ActivityUpdate(long ContactId,string Kind,string Title,string? Details,DateTimeOffset StartsAt,string? Location=null,string? TimeZone=null);
record InviteInput(string? Email);
record AssignmentInput(long? UserId);
record ChatInput(string? Body);
record ResultInput(string Result,string? Notes);
record AppointmentResultRecord(string Result,string? Notes,DateTimeOffset At,long UserId);
record AdminLeadAssignInput(long RealtorUserId);

public partial class Program { }
