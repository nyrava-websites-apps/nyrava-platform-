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
                @"\b(tires?|wheels?|rims?|auto parts?|car parts?|truck parts?|boats?|motorcycles?|furniture|appliances?|tools?|lawnmowers?)\b",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            var existing = await db.Contacts.SingleOrDefaultAsync(c => c.UserId == owner.Id && c.Source == "Fsbo Prospect" && c.ExternalLeadId == input.ExternalId);
            if (existing is not null && nonPropertyTitle) {
                if (existing.Stage != "Excluded") {
                    existing.Stage = "Excluded";
                    existing.Notes = "EXCLUDED — Unrelated classified advertisement. " + (existing.Notes ?? "");
                    await db.SaveChangesAsync();
                }
                return Results.Ok(new { id = existing.Id, existing = true, status = existing.Stage });
            }
            // Do not repeatedly request the same public page during every collector cycle.
            var enrichmentDue = existing is null ||
                ((existing.Notes is null || !existing.Notes.Contains("[Source page checked", StringComparison.Ordinal)) &&
                 existing.UpdatedAt < DateTimeOffset.UtcNow.AddHours(-1)) ||
                (existing.Notes is not null && existing.Notes.Contains("[Source page checked", StringComparison.Ordinal) &&
                 existing.UpdatedAt < DateTimeOffset.UtcNow.AddDays(-1));
            // Read only the public individual listing page. Never click Reply, bypass access
            // controls, or infer permission to contact from a published telephone number.
            string? publishedDescription = null;
            string? publishedPhone = null;
            if (!nonPropertyTitle && enrichmentDue &&
                (url.Host.EndsWith(".craigslist.org", StringComparison.OrdinalIgnoreCase) ||
                 url.Host.Equals("craigslist.org", StringComparison.OrdinalIgnoreCase)) &&
                (url.AbsolutePath.EndsWith(".html", StringComparison.OrdinalIgnoreCase) || url.AbsolutePath.StartsWith("/view/d/", StringComparison.OrdinalIgnoreCase)))
            {
                try
                {
                    using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) {
                        Timeout = TimeSpan.FromSeconds(5)
                    };
                    client.DefaultRequestHeaders.UserAgent.ParseAdd("NyravaHome-ProspectReview/1.0");
                    using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                    if (response.IsSuccessStatusCode && response.Content.Headers.ContentLength.GetValueOrDefault() < 512000)
                    {
                        var html = await response.Content.ReadAsStringAsync();
                        if (html.Length < 512000)
                        {
                            var body = System.Text.RegularExpressions.Regex.Match(html,
                                @"<section[^>]*id=.postingbody.[^>]*>(.*?)</section>",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
                            var raw = body.Success ? body.Groups[1].Value : "";
                            raw = System.Text.RegularExpressions.Regex.Replace(raw, "<[^>]+>", " ");
                            raw = System.Net.WebUtility.HtmlDecode(raw);
                            raw = System.Text.RegularExpressions.Regex.Replace(raw, @"\s+", " ").Trim();
                            if (raw.Length > 0) publishedDescription = raw[..Math.Min(raw.Length, 3000)];
                            var phoneMatch = System.Text.RegularExpressions.Regex.Match(raw,
                                @"(?<!\d)(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)");
                            if (phoneMatch.Success) publishedPhone = phoneMatch.Value;
                        }
                    }
                }
                catch (Exception) { /* Source unavailable: keep existing link for manual review. */ }
            }
            if (existing is not null) {
                if (enrichmentDue) {
                    if (!string.IsNullOrWhiteSpace(publishedDescription) && !(existing.Notes ?? "").Contains("PUBLIC LISTING DESCRIPTION")) {
                        existing.Notes = "PUBLIC LISTING DESCRIPTION (unverified): " + publishedDescription + " | " + (existing.Notes ?? "");
                    }
                    if (!string.IsNullOrWhiteSpace(publishedPhone) && string.IsNullOrWhiteSpace(existing.Phone)) {
                        existing.Phone = publishedPhone;
                    }
                    existing.Notes = "[Source page checked " + DateTimeOffset.UtcNow.ToString("yyyy-MM-dd") + "] " + (existing.Notes ?? "");
                    existing.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync();
                }
                return Results.Ok(new { id = existing.Id, existing = true, status = existing.Stage, enriched = !string.IsNullOrWhiteSpace(publishedDescription) });
            }
            var item = new CrmContact {
                UserId = owner.Id, AssignedToUserId = owner.Id, Name = "Name not provided",
                Phone = input.Phone ?? publishedPhone, Email = input.Email, PropertyZipCode = input.ZipCode, LeadType = "Seller", Stage = nonPropertyTitle ? "Excluded" : "Review",
                Source = "Fsbo Prospect", ExternalLeadId = input.ExternalId, SourceUrl = input.SourceUrl, ExternalFsbo = true,
                Notes = (nonPropertyTitle ? "EXCLUDED — Classified is not a residential property listing. " : "") + (publishedDescription is null ? "" : "PUBLIC LISTING DESCRIPTION (unverified): " + publishedDescription + " | ") + (publishedPhone is null ? "" : "PUBLIC PHONE (unverified): " + publishedPhone + " | ") + "MASTER BANK — Listing title: " + input.Title + ". Source search territory is not a verified property ZIP. Contact verification, seller intent and recipient authorization required before any distribution. " + (input.DoNotContact ? "DO NOT CONTACT: listing rejects agent outreach. " : "") + "Status: " + (string.IsNullOrWhiteSpace(input.Phone ?? publishedPhone) && string.IsNullOrWhiteSpace(input.Email) ? "BONUS CANDIDATE — contact unavailable. " : "CONTACT CANDIDATE — unverified. "),
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
