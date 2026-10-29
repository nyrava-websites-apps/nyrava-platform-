using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace NyravaCRM;

// Enforce access at the API boundary, including team members' owning workspace.
public sealed class WorkspaceAccessMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext http, CrmDb db)
    {
        var path = http.Request.Path.Value ?? "";
        var endpoint = http.GetEndpoint();
        if (!path.StartsWith("/api/") || http.User.Identity?.IsAuthenticated != true ||
            endpoint?.Metadata.GetMetadata<Microsoft.AspNetCore.Authorization.IAllowAnonymous>() is not null ||
            path is "/api/me" or "/api/auth/me" or "/api/logout" or "/api/auth/logout" ||
            path.StartsWith("/api/billing/") || path.StartsWith("/api/account/") || path.StartsWith("/api/auth/"))
        { await next(http); return; }
        if (!long.TryParse(http.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
        { http.Response.StatusCode = 401; return; }
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id);
        if (user?.Role == "Admin") { await next(http); return; }
        if (user is null || !await db.Memberships.AnyAsync(m => m.UserId == id && m.OwnerUserId == user.WorkspaceId && m.Active))
        { http.Response.StatusCode = 403; return; }
        var owner = user.Role == "Owner" ? user : await db.Users.SingleOrDefaultAsync(u => u.Id == user.WorkspaceId && u.Role == "Owner");
        if (owner is null || !GeographicService.IsLeadDeliveryPermitted(owner))
        {
            http.Response.StatusCode = 402;
            await http.Response.WriteAsJsonAsync(new { error = "A paid subscription or administrator-approved exemption is required for this workspace.", billingRequired = true });
            return;
        }
        await next(http);
    }
}
