using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

public static class TestWorkspaceExemption
{
    // Opt-in provisioning of one existing test account. Email alone never grants access.
    public static async Task ProvisionAsync(CrmDb db, IConfiguration config)
    {
        var email = config["Crm:TestRealtorEmail"]?.Trim();
        var id = config.GetValue<long?>("Crm:TestRealtorUserId");
        if (string.IsNullOrWhiteSpace(email) || id is null) return;
        var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == id && u.Role == "Owner" && u.WorkspaceId == u.Id);
        if (owner is null || !string.Equals(owner.Email, email, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Configured test Realtor ID and email do not match an existing Owner account.");
        if (owner.SubscriptionNonBillingAccessGrantedAt is not null || await db.SubscriptionAuditEvents.AnyAsync(e => e.TargetUserId == owner.Id && e.Action == "GrantTestAccess")) return;
        var admin = await db.Users.Where(u => u.Role == "Admin").OrderBy(u => u.Id).FirstOrDefaultAsync();
        if (admin is null) throw new InvalidOperationException("An existing platform administrator is required to record the test exemption.");
        var now = DateTimeOffset.UtcNow;
        owner.SubscriptionNonBillingAccessGrantedAt = now;
        owner.SubscriptionNonBillingAccessGrantedByUserId = admin.Id;
        owner.SubscriptionNonBillingAccessReason = "Operator-authorized test Realtor workspace exemption.";
        db.SubscriptionAuditEvents.Add(new CrmSubscriptionAuditEvent { ActorUserId = admin.Id, TargetUserId = owner.Id, Action = "GrantTestAccess", Reason = owner.SubscriptionNonBillingAccessReason, EvidenceReference = "Operator deployment configuration: exact existing account ID and email", PreviousStatus = owner.SubscriptionStatus, NewStatus = owner.SubscriptionStatus, CreatedAt = now });
        await db.SaveChangesAsync();
    }
}
