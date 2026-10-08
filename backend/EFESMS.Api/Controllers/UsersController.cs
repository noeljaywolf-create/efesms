using EFESMS.Api.Data;
using EFESMS.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EFESMS.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/users")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db)
    {
        _db = db;
    }

    /// GET /api/v1/users — accounts + technicians (used by Admin > Users)
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        // The UI hides this register from non-admins, so enforce the same
        // boundary here before returning account and technician contact data.
        if (!IsAdmin) return StatusCode(403, new { message = "Admins only." });

        var accounts = await _db.Users
            .AsNoTracking()
            .OrderBy(u => u.DisplayName)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.Email,
                u.DisplayName,
                u.Role,
                u.Department,
                u.IsActive,
                u.CreatedAt,
            })
            .ToListAsync();

        var technicians = await _db.Technicians
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Email,
                t.Phone,
                t.Trade,
                t.Vehicle,
                t.Available,
                t.MaxConcurrentJobs,
                t.HourlyRate,
                AssignedJobs = _db.JobCards.Count(j => j.AssignedTechnicianId == t.Id && j.Status != JobCardStatus.Completed),
            })
            .ToListAsync();

        return Ok(new { accounts, technicians });
    }

    public record UpdateUserRequest(string? Role, bool? IsActive);
    public record ResetPasswordResult(string TemporaryPassword, string Message);

    private bool IsAdmin => User.IsInRole("admin") || User.IsInRole("administrator") ||
        (User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "")
            .Equals("admin", StringComparison.OrdinalIgnoreCase) ||
        (User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "")
            .Equals("administrator", StringComparison.OrdinalIgnoreCase);

    /// PUT /api/v1/users/{id} — admin verifies accounts (activate/deactivate, role).
    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest req)
    {
        if (!IsAdmin) return StatusCode(403, new { message = "Admins only." });
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();
        if (req.Role != null)
        {
            var role = req.Role.Trim().ToLowerInvariant();
            if (!new[] { "technician", "admin", "contracts manager", "stores man" }.Contains(role))
                return BadRequest(new { message = "Invalid role." });
            if (user.IsActive && user.Role.Equals("admin", StringComparison.OrdinalIgnoreCase)
                && (!role.Equals("admin", StringComparison.OrdinalIgnoreCase) || req.IsActive == false)
                && !await _db.Users.AnyAsync(u => u.Id != user.Id && u.IsActive && u.Role.ToLower() == "admin"))
                return BadRequest(new { message = "The last active administrator cannot be demoted or deactivated." });
            user.Role = role;
            user.Department = role switch
            {
                "admin" => "Administration",
                "contracts manager" => "Contracts",
                "stores man" => "Stores",
                _ => "Technical",
            };
        }
        else if (req.IsActive == false && user.IsActive && user.Role.Equals("admin", StringComparison.OrdinalIgnoreCase)
            && !await _db.Users.AnyAsync(u => u.Id != user.Id && u.IsActive && u.Role.ToLower() == "admin"))
            return BadRequest(new { message = "The last active administrator cannot be deactivated." });
        if (req.IsActive.HasValue) user.IsActive = req.IsActive.Value;
        await _db.SaveChangesAsync();
        return Ok(new { user.Id, user.Username, user.Email, user.DisplayName, user.Role, user.Department, user.IsActive });
    }

    /// POST /api/v1/users/{id}/reset-password — admin-assisted recovery; never available to public callers.
    [HttpPost("{id:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id)
    {
        if (!IsAdmin) return StatusCode(403, new { message = "Admins only." });
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
        var temporaryPassword = new string(Enumerable.Range(0, 18)
            .Select(_ => alphabet[System.Security.Cryptography.RandomNumberGenerator.GetInt32(alphabet.Length)])
            .ToArray());
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(temporaryPassword);
        user.AuthVersion++;
        await _db.SaveChangesAsync();

        // The one-time credential is returned only to the authenticated admin over the protected API.
        return Ok(new ResetPasswordResult(temporaryPassword, "Give this temporary password directly to the verified user and ask them to change it after signing in."));
    }

    /// DELETE /api/v1/users/{id} — admin removes an account (never self, never the last admin).
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        if (!IsAdmin) return StatusCode(403, new { message = "Admins only." });
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();
        if (user.Username == User.Identity?.Name)
            return BadRequest(new { message = "You cannot delete your own account." });
        if (user.Role.Equals("admin", StringComparison.OrdinalIgnoreCase) &&
            !await _db.Users.AnyAsync(u => u.Id != id && u.Role.ToLower() == "admin" && u.IsActive))
            return BadRequest(new { message = "You cannot delete the last active admin." });
        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return Ok(new { id, username = user.Username });
    }

    public record UpdateMeRequest(string? DisplayName, string? Email);

    /// PUT /api/v1/users/me — a signed-in user edits their own profile info.
    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateMeRequest req)
    {
        var username = User.Identity?.Name;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user is null) return Unauthorized(new { message = "Account not found." });
        if (req.DisplayName != null)
        {
            if (string.IsNullOrWhiteSpace(req.DisplayName)) return BadRequest(new { message = "Display name cannot be empty." });
            user.DisplayName = req.DisplayName.Trim();
        }
        if (req.Email != null)
        {
            var email = req.Email.Trim().ToLower();
            if (!email.Contains('@')) return BadRequest(new { message = "Email address is invalid." });
            if (await _db.Users.AnyAsync(u => u.Id != user.Id && u.Email.ToLower() == email))
                return Conflict(new { message = "Another account already uses this email." });
            user.Email = email;
        }
        await _db.SaveChangesAsync();
        return Ok(new { user.Id, user.Username, user.Email, user.DisplayName, user.Role, user.Department });
    }
}
