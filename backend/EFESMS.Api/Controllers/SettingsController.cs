using System.Security.Claims;
using EFESMS.Api.Data;
using EFESMS.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EFESMS.Api.Controllers;

// System preferences and business defaults. The frontend Settings page
// reads/writes here; operational modules (e.g. quotations VAT + validity)
// consume these values so the system stays consistent.
[ApiController]
[Route("api/v1/settings")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SettingsController(AppDbContext db)
    {
        _db = db;
    }

    private string CurrentRole => User.FindFirst(ClaimTypes.Role)?.Value ?? "";
    private string CurrentDept => User.FindFirst("department")?.Value ?? "";
    // Mirrors the nav gate (admin + management); everyone authenticated may read.
    private bool CanWriteSettings => CurrentRole.Equals("admin", StringComparison.OrdinalIgnoreCase) ||
        CurrentRole.Equals("administrator", StringComparison.OrdinalIgnoreCase) ||
        CurrentRole.Equals("management", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Administration", StringComparison.OrdinalIgnoreCase);

    public static readonly Dictionary<string, string> Defaults = new()
    {
        ["companyName"] = "Extreme Fire Equipment & Services",
        ["taxNumber"] = "VAT 123456789",
        ["defaultCurrency"] = "USD",
        ["reminderDays"] = "14",
        ["supportEmail"] = "support@extremefire.co.zw",
        ["supportPhone"] = "+263 24 2488270",
        ["maintenanceMode"] = "false",
        ["taxPercent"] = "15",
        ["quoteExpiryDays"] = "30",
        ["quotationTerms"] = "",
        ["notificationsEnabled"] = "true",
        ["notifyService"] = "true",
        ["notifyInspection"] = "true",
        ["notifyCertification"] = "true",
        ["notifyInventory"] = "true",
        ["notifyInvoice"] = "true",
    };

    private static readonly HashSet<string> AllowedCurrencies = new(StringComparer.OrdinalIgnoreCase) { "USD", "ZWL", "EUR", "GBP" };

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var stored = await _db.AppSettings.AsNoTracking().ToListAsync();
        var result = new Dictionary<string, object>();
        foreach (var kv in Defaults)
            result[kv.Key] = kv.Key is "reminderDays" or "quoteExpiryDays" ? int.Parse(kv.Value)
                : kv.Key is "taxPercent" ? decimal.Parse(kv.Value)
                : kv.Key is "maintenanceMode" or "notificationsEnabled" or "notifyService" or "notifyInspection" or "notifyCertification" or "notifyInventory" or "notifyInvoice" ? bool.Parse(kv.Value)
                : (object)kv.Value;
        foreach (var s in stored)
        {
            if (!Defaults.ContainsKey(s.Key)) continue;
            result[s.Key] = s.Key is "reminderDays" or "quoteExpiryDays" ? ParseInt(s.Value, (int)result[s.Key])
                : s.Key is "taxPercent" ? ParseDecimal(s.Value, (decimal)result[s.Key])
                : s.Key is "maintenanceMode" or "notificationsEnabled" or "notifyService" or "notifyInspection" or "notifyCertification" or "notifyInventory" or "notifyInvoice" ? ParseBool(s.Value, (bool)result[s.Key])
                : (object)s.Value;
        }
        return Ok(result);
    }

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] Dictionary<string, object?> dto)
    {
        if (!CanWriteSettings)
            return StatusCode(403, new { error = "FORBIDDEN", message = "Only admin or management can change settings." });
        if (dto is null) return BadRequest(new { message = "Settings body is required." });

        foreach (var kv in dto)
        {
            if (!Defaults.ContainsKey(kv.Key)) continue; // ignore unknown keys
            var raw = kv.Value?.ToString()?.Trim() ?? "";
            switch (kv.Key)
            {
                case "reminderDays":
                case "quoteExpiryDays":
                    if (!int.TryParse(raw, out var days) || days < 0 || days > 365)
                        return BadRequest(new { message = $"{kv.Key} must be a whole number between 0 and 365." });
                    if (kv.Key == "quoteExpiryDays" && days < 1)
                        return BadRequest(new { message = "quoteExpiryDays must be at least 1." });
                    await Upsert(kv.Key, days.ToString());
                    break;
                case "taxPercent":
                    if (!decimal.TryParse(raw, out var tax) || tax < 0 || tax > 100)
                        return BadRequest(new { message = "taxPercent must be between 0 and 100." });
                    await Upsert(kv.Key, tax.ToString());
                    break;
                case "maintenanceMode":
                case "notificationsEnabled":
                case "notifyService":
                case "notifyInspection":
                case "notifyCertification":
                case "notifyInventory":
                case "notifyInvoice":
                    if (!bool.TryParse(raw, out var mm) && raw != "0" && raw != "1")
                        return BadRequest(new { message = $"{kv.Key} must be true or false." });
                    await Upsert(kv.Key, (raw == "1" || bool.TryParse(raw, out var b) && b).ToString().ToLower());
                    break;
                case "defaultCurrency":
                    if (!AllowedCurrencies.Contains(raw))
                        return BadRequest(new { message = "defaultCurrency must be USD, ZWL, EUR or GBP." });
                    await Upsert(kv.Key, raw.ToUpper());
                    break;
                case "supportEmail":
                    if (!string.IsNullOrWhiteSpace(raw) && !raw.Contains('@'))
                        return BadRequest(new { message = "supportEmail must be a valid email address." });
                    await Upsert(kv.Key, raw);
                    break;
                case "companyName":
                    if (string.IsNullOrWhiteSpace(raw))
                        return BadRequest(new { message = "companyName is required." });
                    await Upsert(kv.Key, raw);
                    break;
                default:
                    await Upsert(kv.Key, raw);
                    break;
            }
        }
        await _db.SaveChangesAsync();
        return Ok(new { message = "Settings saved." });
    }

    private async Task Upsert(string key, string value)
    {
        var existing = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (existing is null)
            _db.AppSettings.Add(new AppSetting { Key = key, Value = value, UpdatedAt = DateTime.UtcNow });
        else
        {
            existing.Value = value;
            existing.UpdatedAt = DateTime.UtcNow;
        }
    }

    private static int ParseInt(string raw, int fallback) => int.TryParse(raw, out var v) ? v : fallback;
    private static decimal ParseDecimal(string raw, decimal fallback) => decimal.TryParse(raw, out var v) ? v : fallback;
    private static bool ParseBool(string raw, bool fallback) =>
        raw == "1" || (bool.TryParse(raw, out var v) ? v : fallback);
}
