using EFESMS.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EFESMS.Api.Controllers;

[ApiController]
[Route("api/v1")]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;

    public HealthController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<IActionResult> Health()
    {
        var dbOk = false;
        try
        {
            await _db.Database.CanConnectAsync();
            dbOk = true;
        }
        catch
        {
            dbOk = false;
        }

        return Ok(new
        {
            status = "ok",
            service = "EFESMS.Api",
            version = "1.0.0",
            utc = DateTime.UtcNow,
            database = dbOk ? "connected" : "unavailable"
        });
    }

    [HttpGet("auth/me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var username = User.Identity?.Name;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        return Ok(new
        {
            user?.Id,
            user?.Username,
            user?.Email,
            user?.DisplayName,
            user?.Role
        });
    }
}
