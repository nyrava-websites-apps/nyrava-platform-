using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace NyravaCRM;

public record AuthTokensResult(string AccessToken, string RefreshToken, int ExpiresIn, string TokenType = "Bearer");
public record MfaSetupResult(string Secret, string ProvisioningUri, string ManualEntryKey);

public static class IdentityService
{
    private static readonly ConcurrentDictionary<string, (long UserId, string Email, DateTimeOffset ExpiresAt)> RefreshTokens = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<long, string> UserMfaSecrets = new();

    private static string GetJwtSecret(IConfiguration config) =>
        config["Crm:Jwt:Secret"] ?? Environment.GetEnvironmentVariable("JWT_SECRET") ?? "NyravaHome_Production_JwtSigningKey_Secure_2026_Minimum32Bytes!";

    public static AuthTokensResult GenerateTokens(CrmUser user, IConfiguration config)
    {
        var secret = GetJwtSecret(config);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(ClaimTypes.Role, user.Role),
            new("workspace_id", user.WorkspaceId.ToString()),
            new("subscription_status", user.SubscriptionStatus),
            new("subscription_plan", user.SubscriptionPlan)
        };

        // RBAC Permissions Mapping
        var permissions = GetRbacPermissions(user.Role);
        foreach (var p in permissions)
        {
            claims.Add(new Claim("perm", p));
        }

        var expiresAt = DateTime.UtcNow.AddHours(2);
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresAt,
            Issuer = "https://crm.nyrava.com",
            Audience = "nyrava-platform",
            SigningCredentials = credentials
        };

        var handler = new JwtSecurityTokenHandler();
        var token = handler.CreateToken(tokenDescriptor);
        var accessToken = handler.WriteToken(token);

        // Refresh token (30 days)
        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        RefreshTokens[refreshToken] = (user.Id, user.Email, DateTimeOffset.UtcNow.AddDays(30));

        return new AuthTokensResult(
            AccessToken: accessToken,
            RefreshToken: refreshToken,
            ExpiresIn: 7200
        );
    }

    public static string[] GetRbacPermissions(string role) => role switch
    {
        "Admin" => ["*"],
        "Owner" => ["contacts:*", "team:*", "activities:*", "billing:*", "leads:receive", "chat:*", "meet:*"],
        "Employee" => ["contacts:read", "contacts:update", "activities:*", "chat:*", "meet:*"],
        "Realtor" => ["contacts:*", "activities:*", "valuation:private", "meet:*", "chat:*"],
        _ => ["contacts:read"]
    };

    public static ClaimsPrincipal? ValidateJwtToken(string tokenString, IConfiguration config)
    {
        try
        {
            var secret = GetJwtSecret(config);
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(tokenString, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ValidateIssuer = true,
                ValidIssuer = "https://crm.nyrava.com",
                ValidateAudience = true,
                ValidAudience = "nyrava-platform",
                ClockSkew = TimeSpan.FromMinutes(5)
            }, out _);
            return principal;
        }
        catch
        {
            return null;
        }
    }

    public static bool TryValidateRefreshToken(string refreshToken, out long userId, out string email)
    {
        userId = 0;
        email = "";
        if (RefreshTokens.TryGetValue(refreshToken, out var entry))
        {
            if (DateTimeOffset.UtcNow <= entry.ExpiresAt)
            {
                userId = entry.UserId;
                email = entry.Email;
                return true;
            }
            RefreshTokens.TryRemove(refreshToken, out _);
        }
        return false;
    }

    public static void RevokeRefreshToken(string refreshToken) => RefreshTokens.TryRemove(refreshToken, out _);

    // --- MFA / TOTP ENGINE ---

    public static MfaSetupResult SetupMfa(CrmUser user)
    {
        var secretBytes = RandomNumberGenerator.GetBytes(20);
        var base32Secret = ToBase32(secretBytes);
        UserMfaSecrets[user.Id] = base32Secret;

        var issuer = "NyravaHome";
        var uri = $"otpauth://totp/{issuer}:{Uri.EscapeDataString(user.Email)}?secret={base32Secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";
        return new MfaSetupResult(base32Secret, uri, base32Secret);
    }

    public static bool VerifyMfaCode(long userId, string code)
    {
        if (string.IsNullOrWhiteSpace(code) || !UserMfaSecrets.TryGetValue(userId, out var secret))
            return false;

        code = code.Trim();
        var secretBytes = FromBase32(secret);
        var currentStep = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30;

        // Allow 1 step drift window (+/- 30s)
        for (long drift = -1; drift <= 1; drift++)
        {
            if (ComputeTotp(secretBytes, currentStep + drift) == code)
                return true;
        }
        return false;
    }

    private static string ComputeTotp(byte[] secret, long timeStep)
    {
        var timeBytes = BitConverter.GetBytes(IPAddress.HostToNetworkOrder(timeStep));
        using var hmac = new HMACSHA1(secret);
        var hash = hmac.ComputeHash(timeBytes);
        var offset = hash[^1] & 0x0F;
        var binaryCode = ((hash[offset] & 0x7F) << 24)
                       | ((hash[offset + 1] & 0xFF) << 16)
                       | ((hash[offset + 2] & 0xFF) << 8)
                       | (hash[offset + 3] & 0xFF);
        var otp = binaryCode % 1000000;
        return otp.ToString("D6");
    }

    private static string ToBase32(byte[] bytes)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var result = new StringBuilder();
        int buffer = 0, bitsLeft = 0;
        foreach (var b in bytes)
        {
            buffer = (buffer << 8) | b;
            bitsLeft += 8;
            while (bitsLeft >= 5)
            {
                bitsLeft -= 5;
                result.Append(alphabet[(buffer >> bitsLeft) & 0x1F]);
            }
        }
        if (bitsLeft > 0)
        {
            result.Append(alphabet[(buffer << (5 - bitsLeft)) & 0x1F]);
        }
        return result.ToString();
    }

    private static byte[] FromBase32(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        input = input.Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "");
        var output = new List<byte>();
        int buffer = 0, bitsLeft = 0;
        foreach (var c in input)
        {
            var val = alphabet.IndexOf(c);
            if (val < 0) continue;
            buffer = (buffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8)
            {
                bitsLeft -= 8;
                output.Add((byte)((buffer >> bitsLeft) & 0xFF));
            }
        }
        return output.ToArray();
    }
}
