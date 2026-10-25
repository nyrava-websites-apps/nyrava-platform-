using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

public sealed class CrmDb(DbContextOptions<CrmDb> options) : DbContext(options)
{
    public DbSet<CrmUser> Users => Set<CrmUser>();
    public DbSet<CrmContact> Contacts => Set<CrmContact>();
    public DbSet<CrmActivity> Activities => Set<CrmActivity>();
    public DbSet<CrmMembership> Memberships => Set<CrmMembership>();
    public DbSet<CrmInvitation> Invitations => Set<CrmInvitation>();
    public DbSet<CrmMessage> Messages => Set<CrmMessage>();
    public DbSet<CrmIntegrationKey> IntegrationKeys => Set<CrmIntegrationKey>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<CrmUser>().Property(x => x.Email).HasMaxLength(320);
        model.Entity<CrmUser>().HasIndex(x => x.Email).IsUnique();
        model.Entity<CrmMembership>().HasIndex(x => new { x.OwnerUserId, x.UserId }).IsUnique();
        model.Entity<CrmInvitation>().Property(x => x.TokenHash).HasMaxLength(64);
        model.Entity<CrmInvitation>().HasIndex(x => x.TokenHash).IsUnique();
        model.Entity<CrmMessage>().HasIndex(x => new { x.WorkspaceOwnerId, x.CreatedAt });
        model.Entity<CrmContact>().Property(x => x.Name).HasMaxLength(160);
        model.Entity<CrmContact>().HasIndex(x => new { x.UserId, x.Name });
        model.Entity<CrmContact>().Property(x => x.Source).HasMaxLength(32);
        model.Entity<CrmContact>().Property(x => x.ExternalLeadId).HasMaxLength(160);
        model.Entity<CrmIntegrationKey>().Property(x => x.Name).HasMaxLength(100);
        model.Entity<CrmIntegrationKey>().Property(x => x.TokenHash).HasMaxLength(64);
        model.Entity<CrmIntegrationKey>().Property(x => x.TokenPrefix).HasMaxLength(24);
        model.Entity<CrmIntegrationKey>().HasIndex(x => x.TokenHash).IsUnique();
        model.Entity<CrmIntegrationKey>().HasIndex(x => new { x.OwnerUserId, x.RevokedAt });
        model.Entity<CrmActivity>().HasOne(x => x.Contact).WithMany().HasForeignKey(x => x.ContactId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<CrmActivity>().HasIndex(x => new { x.UserId, x.StartsAt });
    }
}

public sealed class CrmUser
{
    public long Id { get; set; }
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public long WorkspaceId { get; set; }
    public string Role { get; set; } = "Owner";
    public string Country { get; set; } = "US";
    public string PostalCode { get; set; } = "78701";
    public string SubscribedZipCodes { get; set; } = "";
    public string SubscriptionStatus { get; set; } = "Active";
    public string SubscriptionPlan { get; set; } = "Realtor Standard Monthly";
    public decimal SubscriptionPrice { get; set; } = 299.00m;
    public string Currency { get; set; } = "USD";
    public DateTimeOffset? TermsAcceptedAt { get; set; }
    public string? TermsVersion { get; set; }
}

public sealed class CrmMembership
{
    public long Id { get; set; }
    public long OwnerUserId { get; set; }
    public long UserId { get; set; }
    public string Role { get; set; } = "Employee";
    public bool Active { get; set; } = true;
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CrmInvitation
{
    public long Id { get; set; }
    public long OwnerUserId { get; set; }
    public string TokenHash { get; set; } = "";
    public string? Email { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
}

public sealed class CrmMessage
{
    public long Id { get; set; }
    public long WorkspaceOwnerId { get; set; }
    public long SenderUserId { get; set; }
    public long RecipientUserId { get; set; }
    public string Body { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CrmContact
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Company { get; set; }
    public string LeadType { get; set; } = "Other";
    public long? AssignedToUserId { get; set; }
    public string Stage { get; set; } = "New";
    public string? Notes { get; set; }
    public string? Source { get; set; }
    public string? ExternalLeadId { get; set; }
    public string? PropertyZipCode { get; set; }
    public string? ContactVerificationMethod { get; set; }
    public DateTimeOffset? ContactVerifiedAt { get; set; }
    public DateTimeOffset? IntentVerifiedAt { get; set; }
    public DateTimeOffset? ConsentCapturedAt { get; set; }
    public string? ConsentRecipient { get; set; }
    public string? ConsentText { get; set; }
    public bool ExternalFsbo { get; set; }
    public string? FsboAdminReviewReference { get; set; }
    public DateTimeOffset? FsboAdminReviewedAt { get; set; }
    public string? SourceUrl { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class CrmIntegrationKey
{
    public long Id { get; set; }
    public long OwnerUserId { get; set; }
    public string Name { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public string TokenPrefix { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class CrmActivity
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public long CreatedByUserId { get; set; }
    public long? AssignedToUserId { get; set; }
    public long ContactId { get; set; }
    public CrmContact Contact { get; set; } = null!;
    public string Kind { get; set; } = "Follow-up";
    public string Title { get; set; } = "";
    public string? Details { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public string? Result { get; set; }
    public string? Location { get; set; }
    public string? TimeZone { get; set; }
    public string? ResultHistory { get; set; }
    public bool Completed { get; set; }
}
