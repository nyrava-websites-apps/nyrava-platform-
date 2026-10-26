using System;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace NyravaCRM;

public record EmailDispatchResult(bool Success, bool SentViaSmtp, bool SavedToOutbox, string Status, string? OutboxPath = null, string? Error = null);

public static class EmailService
{
    private static readonly string OutboxDir = Path.Combine(AppContext.BaseDirectory, "data", "email-outbox");

    static EmailService()
    {
        try { Directory.CreateDirectory(OutboxDir); } catch { }
    }

    public static (string Host, int Port, string? User, string? Pass, string From, bool Ssl) GetConfig(IConfiguration config)
    {
        var host = config["Crm:Email:SmtpHost"]
            ?? Environment.GetEnvironmentVariable("SMTP_HOST")
            ?? "smtp.zoho.com";
        var portStr = config["Crm:Email:SmtpPort"]
            ?? Environment.GetEnvironmentVariable("SMTP_PORT")
            ?? "587";
        _ = int.TryParse(portStr, out var port);
        if (port <= 0 || port > 65535) port = 587;

        var user = config["Crm:Email:Username"]
            ?? Environment.GetEnvironmentVariable("SMTP_USER")
            ?? "notifications@nyrava.com";
        var pass = config["Crm:Email:Password"]
            ?? Environment.GetEnvironmentVariable("SMTP_PASS");

        var from = config["Crm:Email:From"]
            ?? Environment.GetEnvironmentVariable("EMAIL_FROM")
            ?? "Nyrava Home <notifications@nyrava.com>";

        var sslStr = config["Crm:Email:EnableSsl"]
            ?? Environment.GetEnvironmentVariable("SMTP_SSL")
            ?? "true";
        var ssl = !sslStr.Equals("false", StringComparison.OrdinalIgnoreCase);

        return (host, port, user, pass, from, ssl);
    }

    public static async Task<EmailDispatchResult> DispatchAsync(IConfiguration config, string recipient, string subject, string htmlContent, string emailType)
    {
        var (host, port, user, pass, from, ssl) = GetConfig(config);
        var timestamp = DateTimeOffset.UtcNow;
        var safeRecipient = recipient.Replace("@", "_at_").Replace(".", "_");
        var baseFilename = $"{timestamp:yyyyMMdd_HHmmss}_{emailType}_{safeRecipient}";
        var outboxHtmlPath = Path.Combine(OutboxDir, $"{baseFilename}.html");
        var outboxMetaPath = Path.Combine(OutboxDir, $"{baseFilename}.json");

        // Always save to outbox file
        try
        {
            await File.WriteAllTextAsync(outboxHtmlPath, htmlContent);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EmailService] Failed to write outbox HTML: {ex.Message}");
        }

        bool sentSmtp = false;
        string status;
        string? error = null;

        // Attempt SMTP delivery if password or non-demo credentials exist
        if (!string.IsNullOrWhiteSpace(pass) && !pass.Contains("placeholder") && !pass.Contains("your-"))
        {
            try
            {
                using var message = new MailMessage
                {
                    From = new MailAddress(from),
                    Subject = subject,
                    Body = htmlContent,
                    IsBodyHtml = true
                };
                message.To.Add(recipient);

                using var client = new SmtpClient(host, port)
                {
                    EnableSsl = ssl,
                    DeliveryMethod = SmtpDeliveryMethod.Network,
                    Timeout = 12000
                };
                if (!string.IsNullOrWhiteSpace(user))
                {
                    client.Credentials = new NetworkCredential(user, pass);
                }

                await client.SendMailAsync(message);
                sentSmtp = true;
                status = $"Delivered via Zoho SMTP ({host}:{port})";
                Console.WriteLine($"[EmailService] SUCCESS: Sent '{subject}' to {recipient} via {host}:{port}");
            }
            catch (Exception ex)
            {
                error = ex.Message;
                status = $"SMTP Delivery Failed: {ex.Message}";
                Console.WriteLine($"[EmailService] ERROR: Failed sending '{subject}' to {recipient}: {ex.Message}");
            }
        }
        else
        {
            status = "Recorded in Outbox (Awaiting live SMTP credentials)";
            Console.WriteLine($"[EmailService] OUTBOX: Recorded '{subject}' to {recipient} ({outboxHtmlPath})");
        }

        // Write metadata
        try
        {
            var meta = new
            {
                Recipient = recipient,
                Subject = subject,
                Type = emailType,
                Timestamp = timestamp,
                SentViaSmtp = sentSmtp,
                Status = status,
                Error = error,
                OutboxHtml = outboxHtmlPath
            };
            await File.WriteAllTextAsync(outboxMetaPath, JsonSerializer.Serialize(meta, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }

        return new EmailDispatchResult(
            Success: sentSmtp || error == null,
            SentViaSmtp: sentSmtp,
            SavedToOutbox: true,
            Status: status,
            OutboxPath: outboxHtmlPath,
            Error: error
        );
    }

    public static string BuildBrandedLayout(string title, string preheader, string bodyHtml, string? ctaText = null, string? ctaUrl = null)
    {
        var buttonHtml = (!string.IsNullOrWhiteSpace(ctaText) && !string.IsNullOrWhiteSpace(ctaUrl))
            ? $@"<div style=""margin: 28px 0; text-align: center;"">
                  <a href=""{ctaUrl}"" style=""display: inline-block; background: #0066ff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em; box-shadow: 0 4px 14px rgba(0,102,255,0.3);"">{ctaText}</a>
                </div>"
            : "";

        return $@"<!doctype html>
<html>
<head>
  <meta charset=""utf-8"">
  <title>{title}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 24px 12px; line-height: 1.6; }}
    .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }}
    .header {{ background: #041533; padding: 26px 32px; border-bottom: 2px solid #0066ff; text-align: left; }}
    .logo {{ font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; margin: 0; }}
    .logo span {{ color: #38bdf8; font-weight: 400; }}
    .subtitle {{ color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-top: 4px; }}
    .content {{ padding: 32px; font-size: 14px; color: #334155; }}
    .content h2 {{ color: #0f172a; font-size: 18px; margin-top: 0; margin-bottom: 16px; font-weight: 700; }}
    .content p {{ margin: 0 0 16px; }}
    .card {{ background: #f8fafc; border-left: 4px solid #0066ff; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 13px; }}
    .footer {{ background: #f8fafc; padding: 20px 32px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }}
    .footer a {{ color: #0066ff; text-decoration: none; }}
  </style>
</head>
<body>
  <div class=""container"">
    <div class=""header"">
      <div class=""logo"">nyrava <span>home</span></div>
      <div class=""subtitle"">{preheader}</div>
    </div>
    <div class=""content"">
      <h2>{title}</h2>
      {bodyHtml}
      {buttonHtml}
    </div>
    <div class=""footer"">
      &copy; {DateTime.UtcNow.Year} Nyrava Home. All rights reserved.<br>
      Automated System Notification · Real Estate Workspace Intelligence<br>
      <a href=""https://home.nyrava.com"">home.nyrava.com</a>
    </div>
  </div>
</body>
</html>";
    }

    // --- 12 SYSTEM EMAIL TRIGGERS ---

    // 1. Subscriber Verification
    public static Task<EmailDispatchResult> SendSubscriberVerificationEmailAsync(IConfiguration config, string email, string verifyUrl)
    {
        var html = BuildBrandedLayout(
            title: "Verify Your Nyrava Home Account",
            preheader: "Account Verification",
            bodyHtml: $@"<p>Thank you for subscribing to Nyrava Home. Please confirm your email address to activate your Realtor Pro workspace and start receiving direct verified leads.</p>
                         <p>This verification link will remain active for 24 hours.</p>",
            ctaText: "Verify Email & Activate Workspace",
            ctaUrl: verifyUrl
        );
        return DispatchAsync(config, email, "Verify Your Nyrava Home Account", html, "01_subscriber_verification");
    }

    // 2. Welcome & Account Activation
    public static Task<EmailDispatchResult> SendWelcomeEmailAsync(IConfiguration config, string email, string? name, string workspaceUrl)
    {
        var html = BuildBrandedLayout(
            title: $"Welcome to Nyrava Home, {name ?? "Partner"}!",
            preheader: "Workspace Ready",
            bodyHtml: $@"<p>Your subscription is active and your private territory coverage is configured.</p>
                         <div class=""card"">
                           <strong>What you have unlocked:</strong>
                           <ul style=""margin: 8px 0 0; padding-left: 18px;"">
                             <li>Automatic Inbound Lead Routing in your designated ZIPs</li>
                             <li>Nyrava Team Meet — 1-click video consultations</li>
                             <li>Master Bank direct dispatches and automated property valuation</li>
                             <li>Unlimited Team Member seats</li>
                           </ul>
                         </div>
                         <p>Click below to sign in and access your live dashboard.</p>",
            ctaText: "Launch Nyrava Workspace",
            ctaUrl: workspaceUrl
        );
        return DispatchAsync(config, email, "Welcome to Nyrava Home — Your Workspace is Live", html, "02_welcome_activation");
    }

    // 3. Forgot-Password & Password Reset
    public static Task<EmailDispatchResult> SendPasswordResetEmailAsync(IConfiguration config, string email, string resetUrl)
    {
        var html = BuildBrandedLayout(
            title: "Reset Your Nyrava Home Password",
            preheader: "Security Notification",
            bodyHtml: $@"<p>We received a request to reset the password for your Nyrava Home account (<strong>{email}</strong>).</p>
                         <p>Click the button below to choose a new secure password. This link expires in 60 minutes.</p>
                         <div class=""card"">If you did not request this change, please ignore this email. Your account remains completely secure.</div>",
            ctaText: "Reset My Password",
            ctaUrl: resetUrl
        );
        return DispatchAsync(config, email, "Nyrava Home — Password Reset Request", html, "03_password_reset");
    }

    // 4. Password-Changed Security Alert
    public static Task<EmailDispatchResult> SendPasswordChangedAlertAsync(IConfiguration config, string email)
    {
        var html = BuildBrandedLayout(
            title: "Security Notice: Password Updated",
            preheader: "Account Security",
            bodyHtml: $@"<p>The password for your Nyrava Home account was successfully changed on {DateTimeOffset.UtcNow:MMMM dd, yyyy 'at' HH:mm UTC}.</p>
                         <p>If you made this change, no further action is required.</p>
                         <div class=""card"" style=""border-left-color: #ef4444;""><strong>Did not make this change?</strong> Immediately contact support@nyrava.com or your workspace owner to secure your account.</div>"
        );
        return DispatchAsync(config, email, "Security Alert: Nyrava Home Password Changed", html, "04_password_changed_alert");
    }

    // 5. Employee Team Invitation
    public static Task<EmailDispatchResult> SendInvitationEmailAsync(IConfiguration config, string recipient, string invitationUrl, string subscriberEmail)
    {
        var html = BuildBrandedLayout(
            title: "You Are Invited to Join a Workspace",
            preheader: "Team Invitation",
            bodyHtml: $@"<p><strong>{subscriberEmail}</strong> has invited you to join their Nyrava Home workspace as an authorized team member.</p>
                         <div class=""card"">
                           <strong>Teammate Benefits:</strong>
                           <ul style=""margin: 8px 0 0; padding-left: 18px;"">
                             <li>Receive assigned homeowner buyer and seller leads</li>
                             <li>Conduct video consultations via Nyrava Team Meet</li>
                             <li>Collaborate with real-time internal team chat</li>
                           </ul>
                         </div>
                         <p>This invitation is valid for 7 days. Create your account or sign in to accept:</p>",
            ctaText: "Accept Invitation & Join Team",
            ctaUrl: invitationUrl
        );
        return DispatchAsync(config, recipient, $"Invitation to join {subscriberEmail}'s Nyrava Workspace", html, "05_team_invitation");
    }

    // 6. Team Invitation Acceptance
    public static Task<EmailDispatchResult> SendInvitationAcceptedNotificationAsync(IConfiguration config, string ownerEmail, string memberEmail)
    {
        var html = BuildBrandedLayout(
            title: "Team Invitation Accepted",
            preheader: "Team Growth",
            bodyHtml: $@"<p>Great news! <strong>{memberEmail}</strong> has accepted your invitation and joined your Nyrava workspace.</p>
                         <p>You can now assign inbound leads and schedule team consultations with them.</p>"
        );
        return DispatchAsync(config, ownerEmail, $"Team Update: {memberEmail} joined your workspace", html, "06_invitation_accepted");
    }

    // 7. New Qualified Lead Notification
    public static Task<EmailDispatchResult> SendNewLeadNotificationAsync(IConfiguration config, string recipientEmail, string leadName, string leadType, string zipCode, string? phone)
    {
        var html = BuildBrandedLayout(
            title: "New Qualified Lead Dispatched",
            preheader: "Fresh Lead Inflow",
            bodyHtml: $@"<p>A new verified real estate lead has entered your Nyrava Home workspace!</p>
                         <div class=""card"">
                           <p style=""margin: 0 0 6px;""><strong>Name:</strong> {leadName}</p>
                           <p style=""margin: 0 0 6px;""><strong>Type:</strong> <span style=""background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-weight:600;"">{leadType}</span></p>
                           <p style=""margin: 0 0 6px;""><strong>Territory / ZIP:</strong> {zipCode}</p>
                           <p style=""margin: 0;""><strong>Contact:</strong> {phone ?? "Available in workspace"}</p>
                         </div>
                         <p>Act quickly to contact the lead while intent is highest.</p>",
            ctaText: "View Lead in Workspace",
            ctaUrl: "https://home.nyrava.com"
        );
        return DispatchAsync(config, recipientEmail, $"New Lead Alert: {leadType} in {zipCode} ({leadName})", html, "07_new_lead_notification");
    }

    // 8. Lead Assigned Notification
    public static Task<EmailDispatchResult> SendLeadAssignedNotificationAsync(IConfiguration config, string employeeEmail, string leadName, string leadType, string assignedByName)
    {
        var html = BuildBrandedLayout(
            title: "Lead Assigned to You",
            preheader: "Lead Assignment",
            bodyHtml: $@"<p><strong>{assignedByName}</strong> has assigned a lead to you in Nyrava Home:</p>
                         <div class=""card"">
                           <p style=""margin: 0 0 6px;""><strong>Lead Name:</strong> {leadName}</p>
                           <p style=""margin: 0;""><strong>Lead Type:</strong> {leadType}</p>
                         </div>
                         <p>Open your workspace to review history, notes, and initiate outreach.</p>",
            ctaText: "Review Assigned Lead",
            ctaUrl: "https://home.nyrava.com"
        );
        return DispatchAsync(config, employeeEmail, $"Lead Assigned: {leadName} ({leadType})", html, "08_lead_assigned");
    }

    // 9. Appointment & Reminder Email
    public static Task<EmailDispatchResult> SendAppointmentReminderEmailAsync(IConfiguration config, string recipientEmail, string appointmentTitle, DateTimeOffset startsAt, string? meetUrl)
    {
        var html = BuildBrandedLayout(
            title: "Appointment Scheduled",
            preheader: "Consultation Reminder",
            bodyHtml: $@"<p>You have an upcoming consultation scheduled in Nyrava Home:</p>
                         <div class=""card"">
                           <p style=""margin: 0 0 6px;""><strong>Event:</strong> {appointmentTitle}</p>
                           <p style=""margin: 0;""><strong>Scheduled For:</strong> {startsAt:f} UTC</p>
                         </div>
                         {(string.IsNullOrWhiteSpace(meetUrl) ? "" : $"<p><strong>Meeting Room:</strong> <a href=\"{meetUrl}\">{meetUrl}</a></p>")}",
            ctaText: string.IsNullOrWhiteSpace(meetUrl) ? "View in Calendar" : "Join Consultation",
            ctaUrl: meetUrl ?? "https://home.nyrava.com"
        );
        return DispatchAsync(config, recipientEmail, $"Reminder: {appointmentTitle} at {startsAt:t}", html, "09_appointment_reminder");
    }

    // 10. Subscription & Payment Receipt
    public static Task<EmailDispatchResult> SendSubscriptionReceiptEmailAsync(IConfiguration config, string recipientEmail, string plan, decimal amount)
    {
        var html = BuildBrandedLayout(
            title: "Payment Receipt — Subscription Active",
            preheader: "Billing Confirmation",
            bodyHtml: $@"<p>Thank you for your payment. Your Nyrava Home subscription has renewed successfully.</p>
                         <div class=""card"">
                           <p style=""margin: 0 0 6px;""><strong>Plan:</strong> {plan}</p>
                           <p style=""margin: 0 0 6px;""><strong>Amount:</strong> ${amount:F2} USD</p>
                           <p style=""margin: 0;""><strong>Status:</strong> Paid / Active</p>
                         </div>
                         <p>Your ZIP code coverage and daily lead generation remain uninterrupted.</p>"
        );
        return DispatchAsync(config, recipientEmail, $"Nyrava Home Receipt: {plan} (${amount:F2})", html, "10_subscription_receipt");
    }

    // 11. Failed Payment Alert
    public static Task<EmailDispatchResult> SendPaymentFailedAlertAsync(IConfiguration config, string recipientEmail, string plan)
    {
        var html = BuildBrandedLayout(
            title: "Payment Action Required",
            preheader: "Billing Notice",
            bodyHtml: $@"<p>We were unable to process the scheduled renewal for your <strong>{plan}</strong> subscription.</p>
                         <div class=""card"" style=""border-left-color: #ef4444;"">
                           <p style=""margin: 0;"">To prevent interruption to your lead distribution and workspace access, please update your payment method.</p>
                         </div>",
            ctaText: "Update Payment Method",
            ctaUrl: "https://home.nyrava.com"
        );
        return DispatchAsync(config, recipientEmail, "Action Required: Nyrava Home Payment Renewal Failed", html, "11_payment_failed_alert");
    }

    // 12. Customer Support Inquiry
    public static Task<EmailDispatchResult> SendCustomerSupportInquiryAsync(IConfiguration config, string fromEmail, string subject, string message)
    {
        var html = BuildBrandedLayout(
            title: "Customer Support Inquiry Received",
            preheader: "Concierge Support",
            bodyHtml: $@"<p><strong>From:</strong> {fromEmail}</p>
                         <p><strong>Subject:</strong> {subject}</p>
                         <div class=""card""><p style=""margin: 0;"">{message}</p></div>
                         <p>Our concierge support team reviews all requests within 2 business hours.</p>"
        );
        return DispatchAsync(config, "support@nyrava.com", $"[Nyrava Support] {subject} (from {fromEmail})", html, "12_customer_support");
    }
}
