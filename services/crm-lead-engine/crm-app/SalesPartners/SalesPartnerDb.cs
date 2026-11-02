using Microsoft.EntityFrameworkCore;
namespace NyravaCRM.SalesPartners;

// A separate context keeps schema installation explicit. It is intentionally not
// registered in production until an reviewed migration is applied.
public sealed class SalesPartnerDb(DbContextOptions<SalesPartnerDb> options) : DbContext(options)
{
    public DbSet<SalesRepresentative> Representatives => Set<SalesRepresentative>();
    public DbSet<SubscriberRelationship> Relationships => Set<SubscriberRelationship>();
    public DbSet<PartnerBillingEvent> BillingEvents => Set<PartnerBillingEvent>();
    public DbSet<CommissionEntry> Ledger => Set<CommissionEntry>();
    public DbSet<PartnerPayoutBatch> PayoutBatches => Set<PartnerPayoutBatch>();
    public DbSet<PartnerSupportTicket> Tickets => Set<PartnerSupportTicket>();
    protected override void OnModelCreating(ModelBuilder m)
    {
        foreach(var type in new[]{typeof(SalesRepresentative),typeof(RepresentativeAgreement),typeof(RepresentativeReferral),typeof(SubscriberRelationship),typeof(SubscriberOwnershipChange),typeof(PartnerBillingEvent),typeof(PartnerCommissionPlan),typeof(PartnerCommissionVersion),typeof(CommissionEntry),typeof(PartnerAdjustment),typeof(PartnerPayoutBatch),typeof(PartnerPayoutItem),typeof(PartnerSupportTicket),typeof(PartnerTicketMessage),typeof(PartnerActivity),typeof(PartnerAuditEvent),typeof(PartnerProspect),typeof(PartnerInvitation),typeof(PartnerPayrollSchedule),typeof(PartnerWebhookReceipt),typeof(PartnerSubscriptionSnapshot),typeof(PartnerProspectAppointment)})
            m.Entity(type).ToTable("Sales"+type.Name);
        m.Entity<SalesIdentity>().ToTable("Users");
        m.Entity<SalesRepresentative>().HasOne<SalesIdentity>().WithMany().HasForeignKey(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<SubscriberRelationship>().HasOne<SalesIdentity>().WithMany().HasForeignKey(x=>x.SubscriberUserId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<RepresentativeReferral>().HasOne<SalesIdentity>().WithMany().HasForeignKey(x=>x.SubscriberUserId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerBillingEvent>().HasOne<SalesIdentity>().WithMany().HasForeignKey(x=>x.SubscriberUserId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerProspectAppointment>().HasOne<PartnerProspect>().WithMany().HasForeignKey(x=>x.ProspectId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerSubscriptionSnapshot>().HasIndex(x=>x.SubscriptionId).IsUnique();
        m.Entity<PartnerSubscriptionSnapshot>().HasOne<SalesIdentity>().WithMany().HasForeignKey(x=>x.SubscriberUserId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerWebhookReceipt>().HasIndex(x=>x.EventId).IsUnique();
        m.Entity<PartnerInvitation>().HasIndex(x=>x.TokenHash).IsUnique();
        m.Entity<PartnerProspect>().HasOne<SalesRepresentative>().WithMany().HasForeignKey(x=>x.RepresentativeId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<SalesRepresentative>().HasIndex(x=>x.UserId).IsUnique();
        m.Entity<SalesRepresentative>().HasIndex(x=>x.ReferralCode).IsUnique();
        m.Entity<SubscriberRelationship>().HasIndex(x=>x.SubscriberUserId).IsUnique();
        m.Entity<SubscriberRelationship>().HasOne<SalesRepresentative>().WithMany().HasForeignKey(x=>x.AcquiringRepresentativeId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<SubscriberRelationship>().HasOne<SalesRepresentative>().WithMany().HasForeignKey(x=>x.SupportRepresentativeId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<RepresentativeAgreement>().HasOne<SalesRepresentative>().WithMany().HasForeignKey(x=>x.RepresentativeId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<RepresentativeReferral>().HasIndex(x=>x.SubscriberUserId).IsUnique();
        m.Entity<RepresentativeReferral>().HasOne<SalesRepresentative>().WithMany().HasForeignKey(x=>x.RepresentativeId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<SubscriberOwnershipChange>().HasOne<SubscriberRelationship>().WithMany().HasForeignKey(x=>x.RelationshipId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerBillingEvent>().HasIndex(x=>x.ProviderEventId).IsUnique();
        m.Entity<PartnerBillingEvent>().HasIndex(x=>new{x.SubscriberUserId,x.EffectiveAt});
        m.Entity<PartnerCommissionVersion>().HasIndex(x=>new{x.PlanId,x.Version}).IsUnique();
        m.Entity<PartnerCommissionVersion>().HasOne<PartnerCommissionPlan>().WithMany().HasForeignKey(x=>x.PlanId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<CommissionEntry>().HasIndex(x=>x.IdempotencyKey).IsUnique();
        m.Entity<CommissionEntry>().HasIndex(x=>new{x.RepresentativeId,x.Kind,x.QualifyingSaleOrdinal}).IsUnique();
        m.Entity<CommissionEntry>().HasOne<SubscriberRelationship>().WithMany().HasForeignKey(x=>x.RelationshipId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<CommissionEntry>().HasOne<SalesRepresentative>().WithMany().HasForeignKey(x=>x.RepresentativeId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<CommissionEntry>().HasOne<PartnerBillingEvent>().WithMany().HasForeignKey(x=>x.BillingEventId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<CommissionEntry>().HasOne<PartnerCommissionVersion>().WithMany().HasForeignKey(x=>x.CompensationVersionId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerPayoutBatch>().HasIndex(x=>x.ProviderConfirmation).IsUnique();
        m.Entity<PartnerPayoutItem>().HasIndex(x=>x.CommissionEntryId).IsUnique();
        m.Entity<PartnerPayoutItem>().HasOne<CommissionEntry>().WithMany().HasForeignKey(x=>x.CommissionEntryId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerPayoutItem>().HasOne<PartnerPayoutBatch>().WithMany().HasForeignKey(x=>x.BatchId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerSupportTicket>().HasOne<SubscriberRelationship>().WithMany().HasForeignKey(x=>x.RelationshipId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerTicketMessage>().HasOne<PartnerSupportTicket>().WithMany().HasForeignKey(x=>x.TicketId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerActivity>().HasOne<SubscriberRelationship>().WithMany().HasForeignKey(x=>x.RelationshipId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerAdjustment>().HasOne<CommissionEntry>().WithMany().HasForeignKey(x=>x.CommissionEntryId).OnDelete(DeleteBehavior.Restrict);
        m.Entity<PartnerAuditEvent>().HasIndex(x=>new{x.EntityType,x.EntityId,x.CreatedAt});
    }
    private void ValidateAppendOnly()
    {
        foreach(var entry in ChangeTracker.Entries())
        {
            if(entry.State is EntityState.Modified or EntityState.Deleted &&
                entry.Entity is PartnerBillingEvent or CommissionEntry or PartnerAdjustment or PartnerAuditEvent or PartnerCommissionVersion)
                throw new InvalidOperationException("Financial facts and compensation versions are append-only; record a correction.");
            if(entry.Entity is SubscriberRelationship)
            {
                if(entry.State==EntityState.Deleted)throw new InvalidOperationException("Subscriber relationships are permanent.");
                if(entry.State==EntityState.Modified && entry.Properties.Any(p=>p.IsModified &&
                    p.Metadata.Name is not "SupportRepresentativeId" and not "ResidualRepresentativeId"))
                    throw new InvalidOperationException("Original acquisition attribution is immutable.");
            }
        }
    }
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    { ValidateAppendOnly();return base.SaveChanges(acceptAllChangesOnSuccess); }
    public override Task<int> SaveChangesAsync(CancellationToken token=default)
    { ValidateAppendOnly();return base.SaveChangesAsync(token); }
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess,CancellationToken token=default)
    { ValidateAppendOnly();return base.SaveChangesAsync(acceptAllChangesOnSuccess,token); }

}
public sealed class SalesRepresentative
{
    public long Id {get;set;} public long UserId {get;set;} public string Name {get;set;}="";
    public string ReferralCode {get;set;}=""; public bool Active {get;set;}=true;
    public string Status {get;set;}="Invited"; public string Availability {get;set;}=""; public string AuthorizedContactJson {get;set;}="{}";
}
public sealed class RepresentativeAgreement
{
    public long Id {get;set;} public long RepresentativeId {get;set;} public string Version {get;set;}="";
    public string EvidenceReference {get;set;}=""; public DateTimeOffset AcceptedAt {get;set;}
}
public sealed class RepresentativeReferral
{
    public long Id {get;set;} public long RepresentativeId {get;set;} public long SubscriberUserId {get;set;}
    public DateTimeOffset RegisteredAt {get;set;} public string ReferralCode {get;set;}="";
}
public sealed class SubscriberRelationship
{
    public long Id {get;set;} public long SubscriberUserId {get;set;}
    public long? AcquiringRepresentativeId {get;set;} public long SupportRepresentativeId {get;set;}
    public long ResidualRepresentativeId {get;set;} public long? AcquisitionBillingEventId {get;set;}
    public long? OriginalCompensationVersionId {get;set;} public string OriginalPlan {get;set;}="";
    public DateTimeOffset? RegisteredAt {get;set;} public DateTimeOffset? AcquiredAt {get;set;}
    public DateTimeOffset ResidualEligibleFrom {get;set;}=DateTimeOffset.UnixEpoch;
}
public sealed class SubscriberOwnershipChange
{
    public long Id {get;set;} public long RelationshipId {get;set;} public long PreviousRepresentativeId {get;set;}
    public long NewRepresentativeId {get;set;} public bool ChangesResidualOwnership {get;set;}
    public long ApprovedByUserId {get;set;} public DateTimeOffset EffectiveAt {get;set;} public string Reason {get;set;}="";
}
public sealed class PartnerBillingEvent
{
    public long Id {get;set;} public string ProviderEventId {get;set;}=""; public long SubscriberUserId {get;set;}
    public string Kind {get;set;}=""; public string InvoiceId {get;set;}=""; public string PaymentId {get;set;}="";
    public string SubscriptionId {get;set;}=""; public string Plan {get;set;}=""; public string Currency {get;set;}="USD";
    public long InvoicedMinor {get;set;} public long ReceivedMinor {get;set;} public long? KnownFeeMinor {get;set;}
    public DateTimeOffset EffectiveAt {get;set;} public DateTimeOffset ReceivedAt {get;set;}
    public DateTimeOffset? PeriodStart {get;set;} public DateTimeOffset? PeriodEnd {get;set;}
}
public sealed class PartnerCommissionPlan {public long Id {get;set;} public string Name {get;set;}="";}
public sealed class PartnerCommissionVersion
{
    public long Id {get;set;} public long PlanId {get;set;} public int Version {get;set;}
    public DateTimeOffset EffectiveFrom {get;set;} public long ApprovedByUserId {get;set;}
    public string RulesJson {get;set;}="";
}
public sealed class CommissionEntry
{
    public long Id {get;set;} public string IdempotencyKey {get;set;}=""; public long RelationshipId {get;set;}
    public long RepresentativeId {get;set;} public long BillingEventId {get;set;} public long CompensationVersionId {get;set;}
    public string Kind {get;set;}=""; public long AmountMinor {get;set;} public string Currency {get;set;}="USD";
    public DateTimeOffset EarnedAt {get;set;} public int? QualifyingSaleOrdinal {get;set;}
}
public sealed class PartnerAdjustment
{
    public long Id {get;set;} public long CommissionEntryId {get;set;} public long AmountMinor {get;set;}
    public string Reason {get;set;}=""; public long AuthorizedByUserId {get;set;} public DateTimeOffset CreatedAt {get;set;}
}
public sealed class PartnerPayoutBatch
{
    public long Id {get;set;} public DateTimeOffset CutoffAt {get;set;} public DateTimeOffset PayableAt {get;set;}
    public string PayableTimeZoneId {get;set;}="UTC";
    public PayoutState State {get;set;} public string Currency {get;set;}="USD"; public long? ApproverUserId {get;set;}
    public DateTimeOffset? ApprovedAt {get;set;} public string? ProviderConfirmation {get;set;}
    public string ProviderIdempotencyKey {get;set;}=""; public DateTimeOffset? ConfirmedAt {get;set;}
}
public sealed class PartnerPayoutItem {public long Id {get;set;} public long BatchId {get;set;} public long CommissionEntryId {get;set;} public long AmountMinor {get;set;}}
public sealed class PartnerSupportTicket
{
    public long Id {get;set;} public long RelationshipId {get;set;} public long AssignedRepresentativeId {get;set;}
    public string Subject {get;set;}=""; public string Status {get;set;}="Open"; public string Channel {get;set;}="InApp";
    public DateTimeOffset CreatedAt {get;set;} public DateTimeOffset? DueAt {get;set;} public DateTimeOffset? ResolvedAt {get;set;}
}
public sealed class PartnerTicketMessage {public long Id {get;set;} public long TicketId {get;set;} public long AuthorUserId {get;set;} public string Body {get;set;}=""; public DateTimeOffset CreatedAt {get;set;}}
public sealed class PartnerActivity {public long Id {get;set;} public long RelationshipId {get;set;} public long RepresentativeId {get;set;} public long? ExistingCrmActivityId {get;set;} public string Kind {get;set;}=""; public string DeliveryReference {get;set;}=""; public string Subject {get;set;}=""; public DateTimeOffset? StartsAt {get;set;} public bool Completed {get;set;} public DateTimeOffset EffectiveAt {get;set;}}
public sealed class PartnerAuditEvent {public long Id {get;set;} public long ActorUserId {get;set;} public string EntityType {get;set;}=""; public long EntityId {get;set;} public string Action {get;set;}=""; public string EvidenceJson {get;set;}=""; public DateTimeOffset CreatedAt {get;set;}}

public sealed class PartnerProspect {public long Id {get;set;} public long RepresentativeId {get;set;} public string Name {get;set;}=""; public string Email {get;set;}=""; public string Phone {get;set;}=""; public string Stage {get;set;}="New"; public string Notes {get;set;}=""; public DateTimeOffset CreatedAt {get;set;}}
public sealed class PartnerInvitation {public long Id {get;set;} public long RepresentativeId {get;set;} public string TokenHash {get;set;}=""; public DateTimeOffset ExpiresAt {get;set;} public DateTimeOffset? AcceptedAt {get;set;}}

public sealed class PartnerPayrollSchedule {public long Id {get;set;} public int Payday {get;set;}=5; public int CutoffDay {get;set;}=5; public int CutoffHour {get;set;} public string TimeZoneId {get;set;}="UTC"; public long ApprovedByUserId {get;set;} public DateTimeOffset CreatedAt {get;set;}}

public sealed class SalesIdentity {public long Id {get;set;}}

public sealed class PartnerWebhookReceipt {public long Id {get;set;} public string EventId {get;set;}=""; public string PayloadHash {get;set;}=""; public DateTimeOffset EffectiveAt {get;set;} public DateTimeOffset ReceivedAt {get;set;}}

public sealed class PartnerSubscriptionSnapshot {public long Id {get;set;} public long SubscriberUserId {get;set;} public string SubscriptionId {get;set;}=""; public string Plan {get;set;}=""; public string Status {get;set;}=""; public string Currency {get;set;}="USD"; public long? MonthlyRecurringMinor {get;set;} public DateTimeOffset ObservedAt {get;set;}}

public sealed class PartnerProspectAppointment {public long Id {get;set;} public long ProspectId {get;set;} public long RepresentativeId {get;set;} public string Subject {get;set;}=""; public DateTimeOffset StartsAt {get;set;} public string MeetingUrl {get;set;}="";}
