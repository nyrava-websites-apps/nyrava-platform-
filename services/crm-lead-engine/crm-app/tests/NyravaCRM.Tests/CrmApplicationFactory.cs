using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NyravaCRM;

namespace NyravaCRM.Tests;

public sealed class CrmApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseDirectory = Path.Combine(Path.GetTempPath(), $"NyravaCrmTest-{Guid.NewGuid():N}");
    private string DatabasePath => Path.Combine(_databaseDirectory, "crm.db");

    public bool DemoMode { get; set; }
    public bool TeamInvitationsEnabled { get; set; } = true;
    public bool BootstrapAdminEnabled { get; set; }
    public bool SeedExistingAdmin { get; set; }
    public bool SeedLegacySubscriptionAccounts { get; set; }
    public string BootstrapAdminEmail { get; set; } = "configured-admin@example.test";
    public string? BootstrapRealtorEmail { get; set; }
    public string BootstrapAdminPassword { get; } = NewCredential();
    public string ExistingAdminPassword { get; } = NewCredential();
    public string LegacyAdminEmail { get; } = "legacy-admin@example.test";
    public string LegacyAdminPassword { get; } = NewCredential();
    public string LegacyRealtorEmail { get; } = "legacy-pro@example.test";
    public string LegacyRealtorPassword { get; } = NewCredential();
    public string DemoOwnerEmail { get; } = "demo-owner@example.test";
    public string DemoEmployeeEmail { get; } = "demo-employee@example.test";
    public string DemoAdminEmail { get; } = "demo-admin@example.test";
    public string InviteeEmail { get; } = "invited-member@example.test";
    public string InviteePassword { get; } = NewCredential();
    public string DemoOwnerPassword { get; } = NewCredential();
    public string DemoEmployeePassword { get; } = NewCredential();
    public string DemoAdminPassword { get; } = NewCredential();
    public string DemoInviteCode { get; } = NewCredential()[..24];

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(_databaseDirectory);
        var contentRoot = Environment.GetEnvironmentVariable("NYRAVA_CRM_TEST_CONTENT_ROOT")
            ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        builder.UseContentRoot(contentRoot);
        builder.ConfigureLogging(logging => logging.ClearProviders());
        builder.ConfigureServices(services => services.AddDataProtection().UseEphemeralDataProtectionProvider());
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        // Minimal hosting reads host configuration while Program.cs is building
        // WebApplication. Inject these values before the app starts so tests
        // never touch the developer's default database or mode settings.
        builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["Database:Provider"] = "Sqlite",
                ["ConnectionStrings:Crm"] = $"Data Source={DatabasePath};Mode=ReadWriteCreate;Cache=Private",
                ["CRM_DEMO_MODE"] = DemoMode ? "true" : "false",
                ["Crm:TeamInvitationsEnabled"] = TeamInvitationsEnabled ? "true" : "false",
                ["Crm:BootstrapAdminEmail"] = BootstrapAdminEnabled ? BootstrapAdminEmail : null,
                ["Crm:BootstrapAdminPassword"] = BootstrapAdminEnabled ? BootstrapAdminPassword : null,
                ["Crm:BootstrapRealtorEmail"] = BootstrapRealtorEmail,
                ["Crm:DemoOwnerEmail"] = DemoOwnerEmail,
                ["Crm:DemoEmployeeEmail"] = DemoEmployeeEmail,
                ["Crm:DemoAdminEmail"] = DemoAdminEmail,
                ["Crm:DemoOwnerPassword"] = DemoOwnerPassword,
                ["Crm:DemoEmployeePassword"] = DemoEmployeePassword,
                ["Crm:DemoAdminPassword"] = DemoAdminPassword,
                ["Crm:DemoInviteCode"] = DemoInviteCode
            }));
        if (SeedExistingAdmin) SeedAdminRecord();
        if (SeedLegacySubscriptionAccounts) SeedLegacyAccounts();
        return base.CreateHost(builder);
    }

    private void SeedAdminRecord()
    {
        using var connection = new SqliteConnection($"Data Source={DatabasePath};Mode=ReadWriteCreate;Cache=Private");
        connection.Open();
        var options = new DbContextOptionsBuilder<CrmDb>().UseSqlite(connection).Options;
        using var db = new CrmDb(options);
        db.Database.EnsureCreated();
        var admin = new CrmUser
        {
            Email = BootstrapAdminEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(ExistingAdminPassword),
            Role = "Admin",
            Country = "US",
            PostalCode = "78701",
            SubscriptionStatus = "Active"
        };
        db.Users.Add(admin);
        db.SaveChanges();
        admin.WorkspaceId = admin.Id;
        db.SaveChanges();
    }

    private void SeedLegacyAccounts()
    {
        using var connection = new SqliteConnection($"Data Source={DatabasePath};Mode=ReadWriteCreate;Cache=Private");
        connection.Open();
        var options = new DbContextOptionsBuilder<CrmDb>().UseSqlite(connection).Options;
        using var db = new CrmDb(options);
        db.Database.EnsureCreated();

        var admin = new CrmUser
        {
            Email = LegacyAdminEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(LegacyAdminPassword),
            Role = "Admin",
            SubscriptionStatus = "PaymentPending",
            SubscriptionPlan = "Platform Admin"
        };
        var realtor = new CrmUser
        {
            Email = LegacyRealtorEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(LegacyRealtorPassword),
            Role = "Owner",
            SubscriptionStatus = "Active",
            SubscriptionPlan = "Realtor PRO",
            SubscribedZipCodes = "78701"
        };
        db.Users.AddRange(admin, realtor);
        db.SaveChanges();
        admin.WorkspaceId = admin.Id;
        realtor.WorkspaceId = realtor.Id;
        db.Memberships.Add(new CrmMembership { OwnerUserId = realtor.Id, UserId = realtor.Id, Role = "Owner", Active = true });
        db.Contacts.Add(new CrmContact
        {
            UserId = realtor.Id,
            AssignedToUserId = realtor.Id,
            Name = "Legacy Historical Contact",
            Email = "contact@example.test",
            PropertyZipCode = "78701",
            Stage = "Won",
            UpdatedAt = DateTimeOffset.UtcNow
        });
        db.IntegrationKeys.Add(new CrmIntegrationKey
        {
            OwnerUserId = realtor.Id,
            Name = "Legacy Realtor Integration",
            TokenHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(Guid.NewGuid().ToString("N")))),
            TokenPrefix = "nr_test",
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.SaveChanges();

        // Model the live pre-release schema: legacy users have an Active plan,
        // but no payment-verification columns. Startup must add nullable fields
        // without rewriting these accounts or moving their CRM records.
        db.Database.ExecuteSqlRaw("ALTER TABLE Users DROP COLUMN SubscriptionEntitlementVerifiedAt");
        db.Database.ExecuteSqlRaw("ALTER TABLE Users DROP COLUMN SubscriptionCurrentPeriodEnd");
        db.Database.ExecuteSqlRaw("ALTER TABLE Users DROP COLUMN SubscriptionNonBillingAccessGrantedAt");
        db.Database.ExecuteSqlRaw("ALTER TABLE Users DROP COLUMN SubscriptionNonBillingAccessGrantedByUserId");
        db.Database.ExecuteSqlRaw("ALTER TABLE Users DROP COLUMN SubscriptionNonBillingAccessReason");
        db.Database.ExecuteSqlRaw("DROP TABLE SubscriptionAuditEvents");
    }

    private static string NewCredential() => Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try
        {
            if (Directory.Exists(_databaseDirectory)) Directory.Delete(_databaseDirectory, recursive: true);
        }
        catch (IOException)
        {
            // Windows SQLite pool release retry
            try
            {
                System.Threading.Thread.Sleep(50);
                if (Directory.Exists(_databaseDirectory)) Directory.Delete(_databaseDirectory, recursive: true);
            }
            catch { }
        }
    }
}
