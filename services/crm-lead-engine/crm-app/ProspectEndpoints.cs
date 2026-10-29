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
            var existing = await db.Contacts.SingleOrDefaultAsync(c => c.UserId == owner.Id && c.Source == "Fsbo Prospect" && c.ExternalLeadId == input.ExternalId);
            if (existing is not null) return Results.Ok(new { id = existing.Id, existing = true });
            var item = new CrmContact {
                UserId = owner.Id, AssignedToUserId = owner.Id, Name = input.Title[..Math.Min(160, input.Title.Length)],
                Phone = input.Phone, Email = input.Email, PropertyZipCode = input.ZipCode, LeadType = "Seller", Stage = "Review",
                Source = "Fsbo Prospect", ExternalLeadId = input.ExternalId, SourceUrl = input.SourceUrl, ExternalFsbo = true,
                Notes = "UNVERIFIED LISTING — contact name, ZIP, intent and recipient permission require review. " + (input.DoNotContact ? "DO NOT CONTACT: listing rejects agent outreach. " : "") + input.Title,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.Contacts.Add(item);
            key.LastUsedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Created($"/api/contacts/{item.Id}", new { id = item.Id, reviewRequired = true });
        }).AllowAnonymous();
    }
}
public sealed record ProspectInput(string ExternalId, string Title, string? Phone, string? Email, string? ZipCode, string SourceUrl, bool DoNotContact);
