using Microsoft.EntityFrameworkCore;
using System.Text.Json;
namespace NyravaCRM.SalesPartners;
public static class PartnerSchema
{
    public static async Task InstallAsync(SalesPartnerDb db)
    {
        // Additive, versioned schema installation; no CRM table is dropped or recreated.
        using var resource=typeof(PartnerSchema).Assembly.GetManifestResourceStream("NyravaCRM.SalesPartners.Migrations.001.sql")
            ?? throw new InvalidOperationException("Reviewed Sales Partner migration resource is missing.");
        using var reader=new StreamReader(resource);var script=await reader.ReadToEndAsync();
        await using var tx=await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync(script);
        using(var second=typeof(PartnerSchema).Assembly.GetManifestResourceStream("NyravaCRM.SalesPartners.Migrations.002.sql")!)
        using(var secondReader=new StreamReader(second))await db.Database.ExecuteSqlRawAsync(await secondReader.ReadToEndAsync());
        using(var third=typeof(PartnerSchema).Assembly.GetManifestResourceStream("NyravaCRM.SalesPartners.Migrations.003.sql")!)
        using(var thirdReader=new StreamReader(third))await db.Database.ExecuteSqlRawAsync(await thirdReader.ReadToEndAsync());
        using(var fourth=typeof(PartnerSchema).Assembly.GetManifestResourceStream("NyravaCRM.SalesPartners.Migrations.004.sql")!)
        using(var fourthReader=new StreamReader(fourth))await db.Database.ExecuteSqlRawAsync(await fourthReader.ReadToEndAsync());
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS SalesSchemaVersions (Version INTEGER PRIMARY KEY, AppliedAt TEXT NOT NULL)");
        await db.Database.ExecuteSqlRawAsync("INSERT OR IGNORE INTO SalesSchemaVersions(Version,AppliedAt) VALUES(1,CURRENT_TIMESTAMP)");
        await db.Database.ExecuteSqlRawAsync("INSERT OR IGNORE INTO SalesSchemaVersions(Version,AppliedAt) VALUES(2,CURRENT_TIMESTAMP)");
        await db.Database.ExecuteSqlRawAsync("INSERT OR IGNORE INTO SalesSchemaVersions(Version,AppliedAt) VALUES(3,CURRENT_TIMESTAMP)");
        await db.Database.ExecuteSqlRawAsync("INSERT OR IGNORE INTO SalesSchemaVersions(Version,AppliedAt) VALUES(4,CURRENT_TIMESTAMP)");
        if(!await db.Set<PartnerCommissionPlan>().AnyAsync())
        {
            var plan=new PartnerCommissionPlan{Name="Nyrava default compensation"};db.Add(plan);await db.SaveChangesAsync();
            var version=new PartnerCommissionVersion{Id=1,PlanId=plan.Id,Version=1,EffectiveFrom=DateTimeOffset.UnixEpoch,RulesJson=JsonSerializer.Serialize(new CompensationVersion(1,DateTimeOffset.UnixEpoch))};db.Add(version);await db.SaveChangesAsync();
        }
        await tx.CommitAsync();
    }
}
