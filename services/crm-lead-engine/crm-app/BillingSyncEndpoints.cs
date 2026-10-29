using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

public static class BillingSyncEndpoints
{
    public static void MapBillingSync(this WebApplication app)
    {
        app.MapGet("/api/billing/identity", async (HttpContext http, CrmDb db) => {
            if (!long.TryParse(http.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return Results.Unauthorized();
            var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id);
            if (user is null) return Results.Unauthorized();
            if (user.Role != "Admin" && !await db.Memberships.AnyAsync(m => m.UserId == id && m.OwnerUserId == user.WorkspaceId && m.Active)) return Results.Forbid();
            var owner = user.Role is "Owner" or "Admin" ? user : await db.Users.SingleOrDefaultAsync(u => u.Id == user.WorkspaceId && u.Role == "Owner");
            if (owner is null) return Results.Forbid();
            return Results.Ok(new { user.Id, user.Email, user.Role, ownerId = owner.Id, exempt = user.Role == "Admin" || owner.SubscriptionNonBillingAccessGrantedAt != null,
                canAccess = user.Role == "Admin" || GeographicService.IsLeadDeliveryPermitted(owner), owner.StripeCustomerId, owner.StripeSubscriptionId });
        }).RequireAuthorization();

        app.MapPost("/api/internal/billing/sync", async (HttpContext http, CrmDb db, IConfiguration config) => {
            var secret = config["Crm:BillingSyncSecret"];
            if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32) return Results.StatusCode(503);
            var stamp = http.Request.Headers["X-Nyrava-Timestamp"].ToString();
            if (!long.TryParse(stamp, out var timestamp) || Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - timestamp) > 300) return Results.Unauthorized();
            using var reader = new StreamReader(http.Request.Body);
            var raw = await reader.ReadToEndAsync();
            if (raw.Length > 32000) return Results.BadRequest();
            var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(stamp + "." + raw));
            byte[] signature;
            try { signature = Convert.FromHexString(http.Request.Headers["X-Nyrava-Signature"].ToString()); }
            catch (FormatException) { return Results.Unauthorized(); }
            if (!CryptographicOperations.FixedTimeEquals(expected, signature)) return Results.Unauthorized();
            BillingSyncInput? input;
            try { input = JsonSerializer.Deserialize<BillingSyncInput>(raw, new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
            catch (JsonException) { return Results.BadRequest(); }
            if (input is null || input.OwnerId <= 0 || string.IsNullOrWhiteSpace(input.EventId) || input.EventId.Length > 180 || !(input.SubscriptionId?.StartsWith("sub_") == true) || !(input.CustomerId?.StartsWith("cus_") == true) ||
                input.Status is not ("Active" or "PastDue" or "Canceled" or "Expired" or "PaymentPending") || input.Plan is not ("BASIC" or "PRO") || input.ObservedAt > DateTimeOffset.UtcNow.AddMinutes(5)) return Results.BadRequest();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == input.OwnerId && u.Role == "Owner" && u.WorkspaceId == u.Id);
            if (owner is null) return Results.NotFound();
            if (await db.SubscriptionAuditEvents.AnyAsync(e => e.Action == "SyncStripe" && e.EvidenceReference == input.EventId)) return Results.Ok(new { duplicate = true });
            if (owner.StripeCustomerId is not null && owner.StripeCustomerId != input.CustomerId) return Results.Conflict(new { error = "Billing customer mismatch." });
            if (owner.StripeSubscriptionId is not null && owner.StripeSubscriptionId != input.SubscriptionId && GeographicService.IsLeadDeliveryPermitted(owner)) return Results.Conflict(new { error = "An existing subscription is still entitled. Reconcile before replacing it." });
            if (owner.StripeSyncedAt is not null && owner.StripeSyncedAt > input.ObservedAt) return Results.Ok(new { stale = true });
            var previous = owner.SubscriptionStatus;
            owner.StripeCustomerId = input.CustomerId;
            owner.StripeSubscriptionId = input.SubscriptionId;
            owner.StripeSyncedAt = input.ObservedAt;
            owner.SubscriptionStatus = input.Status;
            owner.SubscriptionCurrentPeriodEnd = input.CurrentPeriodEnd;
            owner.SubscriptionPlan = input.Plan == "PRO" ? "Realtor Pro Subscription" : "Realtor Basic Subscription";
            // Only the trusted gateway's paid-invoice reconciliation grants paid access.
            if (input.Paid && (input.Status is "Active" or "Canceled") && input.CurrentPeriodEnd > DateTimeOffset.UtcNow)
                owner.SubscriptionEntitlementVerifiedAt = DateTimeOffset.UtcNow;
            db.SubscriptionAuditEvents.Add(new CrmSubscriptionAuditEvent { ActorUserId = owner.Id, TargetUserId = owner.Id, Action = "SyncStripe", Reason = "Signed gateway reconciliation of Stripe subscription and paid invoice.", EvidenceReference = input.EventId, PreviousStatus = previous, NewStatus = input.Status, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(new { synchronized = true });
        }).AllowAnonymous();
    }
}
public sealed record BillingSyncInput(long OwnerId, string EventId, string SubscriptionId, string CustomerId, string Status, string Plan, bool Paid, DateTimeOffset? CurrentPeriodEnd, DateTimeOffset ObservedAt);
