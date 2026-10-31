using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

// Reconciles eligible, authorized 30-day bank bonuses after transient failures and restarts.
// The dispatcher itself enforces paid status, the precise ZIP, consent and idempotency.
public sealed class BankDeliveryReconciler(IServiceScopeFactory scopes, ILogger<BankDeliveryReconciler> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial delay allows schema startup and endpoints to initialize.
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<CrmDb>();
                    var ids = await db.Users.Where(u => u.Role == "Owner" &&
                        u.SubscribedZipCodes != null && u.SubscribedZipCodes != "")
                        .Select(u => u.Id).ToListAsync(stoppingToken);
                    foreach (var id in ids)
                    {
                        if (stoppingToken.IsCancellationRequested) break;
                        try { await BankDispatchService.DeliverEligibleBankBonus(db, id, stoppingToken); }
                        catch (Exception ex) { logger.LogError(ex, "Reconciliation failed for owner {OwnerId}; retry next cycle", id); }
                    }
                }
                catch (Exception ex) { logger.LogError(ex, "Bank bonus reconciliation cycle failed"); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
