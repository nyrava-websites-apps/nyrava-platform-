using Microsoft.EntityFrameworkCore;
namespace NyravaCRM.SalesPartners;
public static class PartnerPayroll
{
    public static async Task<PartnerPayrollSchedule> SettingsAsync(SalesPartnerDb db)=>await db.Set<PartnerPayrollSchedule>().OrderByDescending(x=>x.Id).FirstOrDefaultAsync()??new PartnerPayrollSchedule();
    public static async Task<List<PartnerPayoutBatch>> GenerateAsync(SalesPartnerDb db,long actor,DateTimeOffset now)
    {
        var settings=await SettingsAsync(db);var zone=TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZoneId);var local=TimeZoneInfo.ConvertTime(now,zone);
        var cutoff=DateTime.SpecifyKind(local.Date.AddDays(-((7+(int)local.DayOfWeek-settings.CutoffDay)%7)).AddHours(settings.CutoffHour),DateTimeKind.Unspecified);
        if(cutoff>local.DateTime)cutoff=cutoff.AddDays(-7);
        var cutoffAt=new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(cutoff,zone));
        var payday=cutoff.Date.AddDays((7+settings.Payday-(int)cutoff.DayOfWeek)%7).AddHours(settings.CutoffHour);
        var payableAt=new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(payday,zone));
        await using var tx=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var reserved=db.Set<PartnerPayoutItem>().Select(x=>x.CommissionEntryId);var available=await db.Ledger.Where(x=>!reserved.Contains(x.Id)).ToListAsync();var batches=new List<PartnerPayoutBatch>();
        foreach(var group in available.Where(x=>x.EarnedAt<=cutoffAt).GroupBy(x=>new{x.RepresentativeId,x.Currency}))
        {
            if(group.Sum(x=>x.AmountMinor)<=0)continue;
            var batch=new PartnerPayoutBatch{CutoffAt=cutoffAt,PayableAt=payableAt,PayableTimeZoneId=settings.TimeZoneId,Currency=group.Key.Currency,State=PayoutState.Draft,ProviderIdempotencyKey=Guid.NewGuid().ToString("N")};db.Add(batch);await db.SaveChangesAsync();
            foreach(var e in group)db.Add(new PartnerPayoutItem{BatchId=batch.Id,CommissionEntryId=e.Id,AmountMinor=e.AmountMinor});batches.Add(batch);
        }
        if(batches.Count>0)db.Add(new PartnerAuditEvent{ActorUserId=actor,EntityType="PayoutBatch",EntityId=0,Action="WeeklyDraftsGenerated",CreatedAt=now,EvidenceJson=System.Text.Json.JsonSerializer.Serialize(new{cutoffAt,payableAt,count=batches.Count})});
        await db.SaveChangesAsync();await tx.CommitAsync();return batches;
    }
}
public sealed class PartnerPayrollWorker(IServiceScopeFactory scopes,ILogger<PartnerPayrollWorker> logger):BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromMinutes(1));
        try{while(await timer.WaitForNextTickAsync(stoppingToken))
        {
            try{using var scope=scopes.CreateScope();await PartnerPayroll.GenerateAsync(scope.ServiceProvider.GetRequiredService<SalesPartnerDb>(),0,DateTimeOffset.UtcNow);}
            catch(Exception e){logger.LogError(e,"Sales Partner weekly draft generation failed; will retry. No payments were sent.");}
        }}catch(OperationCanceledException)when(stoppingToken.IsCancellationRequested){}
    }
}
