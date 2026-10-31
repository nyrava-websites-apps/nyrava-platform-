using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

// Only genuinely verified/authorized bank records may be dispatched.
// Runs after a successful ZIP update or trusted billing synchronization.
public static class BankDispatchService
{
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public static async Task<int> DeliverEligibleBankBonus(CrmDb db, long realtorId, CancellationToken token = default)
    {
        await Gate.WaitAsync(token);
        try
        {
            var now = DateTimeOffset.UtcNow;
            var realtor = await db.Users.SingleOrDefaultAsync(u => u.Id == realtorId && u.Role == "Owner", token);
            if (realtor is null || !GeographicService.IsLeadDeliveryPermitted(realtor, now)) return 0;
            var activeZips = (realtor.SubscribedZipCodes ?? "").Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (activeZips.Length == 0) return 0;

            // An original discovery timestamp is mandatory. Historical records remain null
            // until independently proven; edits cannot reset the 30-day age.
            var cutoff = now.AddDays(-30);
            var bank = await db.Contacts.Where(c =>
                c.ExternalLeadId != null && c.Source != "Nyrava Verified" &&
                db.Users.Any(u => u.Id == c.UserId && u.Role == "Admin") &&
                c.ArchivedAt == null && c.DeliveredAt == null &&
                c.ConsentCapturedAt != null && c.ContactVerifiedAt != null &&
                c.IntentVerifiedAt != null && (!c.ExternalFsbo || c.FsboAdminReviewedAt != null) &&
                c.PropertyZipCode != null && c.DiscoveredAt != null && c.DiscoveredAt > cutoff && c.DiscoveredAt <= now &&
                (c.Stage == "New" || c.Stage == "Queued")).OrderBy(c => c.DiscoveredAt).ToListAsync(token);

            var delivered = 0;
            foreach (var lead in bank)
            {
                if (!GeographicService.HasSubscribedZip(realtor.SubscribedZipCodes, lead.PropertyZipCode!)) continue;
                if (!string.Equals(lead.ConsentRecipient, realtor.Email, StringComparison.OrdinalIgnoreCase)) continue;
                if (string.IsNullOrWhiteSpace(lead.Name) ||
                    string.IsNullOrWhiteSpace(lead.Phone) && string.IsNullOrWhiteSpace(lead.Email) ||
                    lead.Name.StartsWith("Owner:", StringComparison.OrdinalIgnoreCase) ||
                    lead.Name.Equals("FSBO Homeowner", StringComparison.OrdinalIgnoreCase)) continue;
                if (string.IsNullOrWhiteSpace(lead.ConsentText) ||
                    (lead.ExternalFsbo && (string.IsNullOrWhiteSpace(lead.FsboAdminReviewReference) || lead.FsboAdminReviewedAt is null)) ||
                    lead.ContactVerifiedAt > now || lead.IntentVerifiedAt > now ||
                    lead.ConsentCapturedAt > now || lead.FsboAdminReviewedAt > now) continue;
                if (lead.Notes?.Contains("Do Not Contact", StringComparison.OrdinalIgnoreCase) == true ||
                    lead.Notes?.Contains("DO NOT CONTACT", StringComparison.OrdinalIgnoreCase) == true ||
                    lead.Stage == "Excluded" || lead.Stage == "Review" || lead.Stage == "Banked") continue;

                var externalId = $"bonus-{realtor.Id}-{lead.Id}";
                if (await db.Contacts.AnyAsync(c => c.UserId == realtor.Id && c.Source == "Nyrava Verified" && c.ExternalLeadId == externalId, token)) continue;

                db.Contacts.Add(new CrmContact {
                    UserId = realtor.Id, AssignedToUserId = realtor.Id,
                    Name = lead.Name, Email = lead.Email, Phone = lead.Phone,
                    LeadType = lead.LeadType, Company = lead.Company,
                    Source = "Nyrava Verified", Stage = "New",
                    ExternalLeadId = externalId, PropertyZipCode = lead.PropertyZipCode,
                    Notes = "[Bank Bonus] Verified bank lead delivered on subscription/ZIP activation.",
                    DeliveredAt = now, DiscoveredAt = lead.DiscoveredAt, UpdatedAt = now,
                    ContactVerificationMethod = lead.ContactVerificationMethod,
                    ContactVerifiedAt = lead.ContactVerifiedAt, IntentVerifiedAt = lead.IntentVerifiedAt,
                    ConsentCapturedAt = lead.ConsentCapturedAt, ConsentRecipient = lead.ConsentRecipient,
                    ConsentText = lead.ConsentText, ExternalFsbo = lead.ExternalFsbo,
                    FsboAdminReviewReference = lead.FsboAdminReviewReference,
                    FsboAdminReviewedAt = lead.FsboAdminReviewedAt, SourceUrl = lead.SourceUrl
                });
                // Save per item for duplicate suppression in later attempts.
                await db.SaveChangesAsync(token);
                delivered++;
            }
            return delivered;
        }
        finally { Gate.Release(); }
    }
}
