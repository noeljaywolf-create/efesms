using EFESMS.Api.Data;
using EFESMS.Api.Models;
using EFESMS.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Mail;
using System.Net.Http.Json;

namespace EFESMS.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly TokenService _tokens;

    public AuthController(AppDbContext db, TokenService tokens)
    {
        _db = db;
        _tokens = tokens;
    }

    public record LoginRequest(string Username, string Password);

    public record RegisterRequest(string Username, string Email, string Password, string DisplayName, string? Role);

    public record ForgotPasswordRequest(string Username);

    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

    public record GoogleSignInRequest(string IdToken);

    private static readonly HttpClient GoogleHttp = new() { Timeout = TimeSpan.FromSeconds(8) };

    private static string DepartmentForRole(string role) => role switch
    {
        "admin" => "Administration",
        "contracts manager" => "Contracts",
        "stores man" => "Stores",
        _ => "Technical",
    };

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { message = "Username, email and password are required." });

        var username = req.Username.Trim().ToLowerInvariant();
        var email = req.Email.Trim().ToLowerInvariant();

        if (username.Length < 3)
            return BadRequest(new { message = "Username must be at least 3 characters." });
        if (username.Length > 100 || email.Length > 255)
            return BadRequest(new { message = "Username or email is too long." });
        try { _ = new MailAddress(email); }
        catch (FormatException) { return BadRequest(new { message = "Enter a valid email address." }); }
        if (req.Password.Length < 12 || System.Text.Encoding.UTF8.GetByteCount(req.Password) > 72)
            return BadRequest(new { message = "Password must be at least 12 characters and no more than 72 UTF-8 bytes." });

        // Serialize first-account creation so simultaneous requests cannot both become admins.
        await using var registrationTransaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var exists = await _db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower() || u.Email.ToLower() == email);
        if (exists)
            return Conflict(new { message = "A user with this username or email already exists." });

        // Public registration never trusts a requested role. The initial setup
        // account is the only public admin; later accounts await admin approval.
        var firstAccount = !await _db.Users.AnyAsync();
        var role = firstAccount ? "admin" : "technician";

        var user = new User
        {
            Username = username,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? username : req.DisplayName.Trim(),
            Role = role,
            Department = DepartmentForRole(role),
            IsActive = firstAccount,
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
        }
        catch (Exception ex) when (ex is DbUpdateException or Npgsql.NpgsqlException)
        {
            return Conflict(new { message = "The account could not be created; check whether the username or email is already in use." });
        }
        await registrationTransaction.CommitAsync();

        // Pending users receive no usable token until an administrator approves them.
        if (!user.IsActive)
            return Accepted(new
            {
                pendingApproval = true,
                user = new { user.Id, user.Username, user.Email, user.DisplayName, user.Role, user.Department }
            });

        var token = _tokens.CreateToken(user);
        return Ok(new
        {
            token,
            pendingApproval = !user.IsActive,
            user = new
            {
                user.Id,
                user.Username,
                user.Email,
                user.DisplayName,
                user.Role,
                user.Department
            }
        });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Username and password are required." });

        User? user;
        try
        {
            user = await _db.Users
                .FirstOrDefaultAsync(u =>
                    u.Username.ToLower() == req.Username.Trim().ToLower() ||
                    u.Email.ToLower() == req.Username.Trim().ToLower());
        }
        catch
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Authentication service is unavailable." });
        }

        if (user is null)
        {
            return Unauthorized(new { message = "Invalid username or password." });
        }
        else if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid username or password." });
        }
        else if (user.IsActive == false)
        {
            return Unauthorized(new { message = "Invalid username or password." });
        }

        var token = _tokens.CreateToken(user);
        return Ok(new
        {
            token,
            user = new
            {
                user.Id,
                user.Username,
                user.Email,
                user.DisplayName,
                user.Role,
                user.Department
            }
        });
    }

    // Do not change credentials or return a password from a public endpoint.
    // An administrator must verify identity and handle recovery out of band.
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        return Ok(new { message = "If the account exists, ask your system administrator to verify your identity and issue a secure password reset." });
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 12 || System.Text.Encoding.UTF8.GetByteCount(req.NewPassword) > 72)
            return BadRequest(new { message = "New password must be at least 12 characters and no more than 72 UTF-8 bytes." });
        var username = User.Identity?.Name;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user is null) return Unauthorized(new { message = "Account not found." });
        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword ?? "", user.PasswordHash))
            return BadRequest(new { message = "Current password is incorrect." });
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.AuthVersion++;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Password changed. Sign in again on other devices.", token = _tokens.CreateToken(user) });
    }

    // Google sign-in (enterprise): verifies the ID token with Google, enforces
    // the workspace client ID + optional allowed email domains, then links to
    // the existing account or provisions a technician account for approved
    // domains. Configure Google:ClientId and Google:AllowedDomains.
    [HttpPost("google")]
    [AllowAnonymous]
    public async Task<IActionResult> GoogleSignIn([FromBody] GoogleSignInRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.IdToken))
            return BadRequest(new { message = "Google sign-in token is required." });
        var clientId = _db.AppSettings.AsNoTracking()
            .FirstOrDefault(s => s.Key == "googleClientId")?.Value
            ?? Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID") ?? "";
        HttpResponseMessage gr;
        try
        {
            gr = await GoogleHttp.GetAsync(
                "https://oauth2.googleapis.com/tokeninfo?id_token=" + Uri.EscapeDataString(req.IdToken.Trim()));
        }
        catch
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Google verification is unavailable." });
        }
        if (!gr.IsSuccessStatusCode)
            return Unauthorized(new { message = "Google sign-in failed verification." });
        GoogleTokenInfo? info;
        try
        {
            info = await gr.Content.ReadFromJsonAsync<GoogleTokenInfo>();
        }
        catch
        {
            return Unauthorized(new { message = "Google sign-in failed verification." });
        }
        if (info is null || string.IsNullOrWhiteSpace(info.Email) || info.EmailVerified != "true")
            return Unauthorized(new { message = "Google account is not verified." });
        if (!string.IsNullOrWhiteSpace(clientId) && info.Aud != clientId)
            return Unauthorized(new { message = "Google sign-in was issued for a different app." });
        var email = info.Email.Trim().ToLower();
        var domain = email.Contains('@') ? email.Split('@').Last() : "";
        var allowedRaw = _db.AppSettings.AsNoTracking()
            .FirstOrDefault(s => s.Key == "googleAllowedDomains")?.Value
            ?? Environment.GetEnvironmentVariable("GOOGLE_ALLOWED_DOMAINS") ?? "";
        var allowed = allowedRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(d => d.ToLowerInvariant()).ToHashSet();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
        if (user is null)
        {
            if (allowed.Count == 0 || !allowed.Contains(domain))
                return Unauthorized(new { message = "No account uses this Google email. Ask an administrator to create one." });
            var baseName = email.Split('@')[0].Replace('.', ' ');
            var username = baseName;
            var n = 1;
            while (await _db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower()))
                username = $"{baseName}{++n}";
            user = new User
            {
                Username = username,
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
                DisplayName = info.Name ?? baseName,
                Role = "technician",
                Department = DepartmentForRole("technician"),
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
        }
        else if (user.IsActive == false)
        {
            return Unauthorized(new { message = "Account is disabled." });
        }
        var token = _tokens.CreateToken(user);
        return Ok(new
        {
            token,
            user = new
            {
                user.Id,
                user.Username,
                user.Email,
                user.DisplayName,
                user.Role,
                user.Department
            }
        });
    }

    private sealed record GoogleTokenInfo(
        [property: System.Text.Json.Serialization.JsonPropertyName("aud")] string? Aud,
        [property: System.Text.Json.Serialization.JsonPropertyName("email")] string? Email,
        [property: System.Text.Json.Serialization.JsonPropertyName("email_verified")] string? EmailVerified,
        [property: System.Text.Json.Serialization.JsonPropertyName("name")] string? Name);
}
