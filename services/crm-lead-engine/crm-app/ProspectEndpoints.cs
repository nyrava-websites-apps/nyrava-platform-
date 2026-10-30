using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

public static class ProspectEndpoints
{
    public static void MapProspectIntake(this WebApplication app)
    {
        app.MapPost("/api/v1/prospects", async (ProspectInput input, HttpContext http, CrmDb db) => {
            var auth = http.Request.Headers.Authorization.ToString();
            if (!auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return Results.Unauthorized();
            var token = auth[7..].Trim();
            if (token.Length is < 20 or > 200) return Results.Unauthorized();
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
            var key = await db.IntegrationKeys.SingleOrDefaultAsync(k => k.TokenHash == hash && k.RevokedAt == null);
            if (key is null) return Results.Unauthorized();
            var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == key.OwnerUserId && u.Role == "Admin");
            if (owner is null) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(input.ExternalId) || input.ExternalId.Length > 160 || string.IsNullOrWhiteSpace(input.Title) || input.Title.Length > 1000 ||
                input.Phone?.Length > 40 || input.Email?.Length > 320 ||
                !Uri.TryCreate(input.SourceUrl, UriKind.Absolute, out var url) || url.Scheme != "https" || input.SourceUrl.Length > 2000)
                return Results.BadRequest();
            // Search-result feeds can contain unrelated classifieds even in a real-estate search.
            // Retain those records for audit, but never classify them as property prospects.
            var nonPropertyTitle = System.Text.RegularExpressions.Regex.IsMatch(input.Title,
                @"\\b(tires?|wheels?|rims?|auto parts?|car parts?|truck parts?|boats?|motorcycles?|furniture|appliances?|tools?|lawnmowers?)\\b",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            var existing = await db.Contacts.SingleOrDefaultAsync(c => c.UserId == owner.Id && c.Source == "Fsbo Prospect" && c.ExternalLeadId == input.ExternalId);
            if (existing is not null) return Results.Ok(new { id = existing.Id, existing = true, status = existing.Stage });
            var item = new CrmContact {
                UserId = owner.Id, AssignedToUserId = owner.Id, Name = "Name not provided",
                Phone = input.Phone, Email = input.Email, PropertyZipCode = input.ZipCode, LeadType = "Seller", Stage = nonPropertyTitle ? "Excluded" : "Review",
                Source = "Fsbo Prospect", ExternalLeadId = input.ExternalId, SourceUrl = input.SourceUrl, ExternalFsbo = true,
                Notes = (nonPropertyTitle ? "EXCLUDED — Classified is not a residential property listing. " : "") + "MASTER BANK — Listing title: " + input.Title + ". Source search territory is not a verified property ZIP. Contact verification, seller intent and recipient authorization required before any distribution. " + (input.DoNotContact ? "DO NOT CONTACT: listing rejects agent outreach. " : "") + "Status: " + (string.IsNullOrWhiteSpace(input.Phone) && string.IsNullOrWhiteSpace(input.Email) ? "BONUS CANDIDATE — contact unavailable. " : "CONTACT CANDIDATE — unverified. "),
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.Contacts.Add(item);
            key.LastUsedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Created($"/api/contacts/{item.Id}", new { id = item.Id, reviewRequired = true, status = item.Stage, classification = nonPropertyTitle ? "NonProperty" : (string.IsNullOrWhiteSpace(input.Phone) && string.IsNullOrWhiteSpace(input.Email) ? "BonusCandidate" : "ContactCandidate") });
        }).AllowAnonymous();
    }
}
public sealed record ProspectInput(string ExternalId, string Title, string? Phone, string? Email, string? ZipCode, string SourceUrl, bool DoNotContact);
