using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace NyravaCRM.Tests;

public sealed class CrmApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseDirectory = Path.Combine(Path.GetTempPath(), $"NyravaCrmTest-{Guid.NewGuid():N}");
    private string DatabasePath => Path.Combine(_databaseDirectory, "crm.db");

    public bool DemoMode { get; set; }
    public bool TeamInvitationsEnabled { get; set; } = true;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(_databaseDirectory);
        var contentRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        builder.UseContentRoot(contentRoot);
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
                ["Crm:TeamInvitationsEnabled"] = TeamInvitationsEnabled ? "true" : "false"
            }));
        return base.CreateHost(builder);
    }

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
