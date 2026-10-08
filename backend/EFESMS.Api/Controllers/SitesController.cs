using EFESMS.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EFESMS.Api.Controllers;

// System-wide site register: every site belongs to exactly one customer
// (one customer, one ID) and shows what the system linked to it.
[ApiController]
[Route("api/v1/sites")]
[Authorize]
public class SitesController : ControllerBase
{
    private readonly AppDbContext _db;

    public SitesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] string? customerNumber)
    {
        var customers = (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id);
        var sites = await _db.CustomerSites.AsNoTracking().OrderBy(s => s.Name).ToListAsync();
        var jobCounts = (await _db.JobCards.AsNoTracking().ToListAsync())
            .Where(j => j.SiteId.HasValue).GroupBy(j => j.SiteId!.Value).ToDictionary(g => g.Key, g => g.Count());
        var equipCounts = (await _db.OpsEquipment.AsNoTracking().ToListAsync())
            .Where(e => e.SiteId.HasValue).GroupBy(e => e.SiteId!.Value).ToDictionary(g => g.Key, g => g.Count());

        var shaped = sites.Select(s =>
        {
            customers.TryGetValue(s.CustomerId, out var c);
            return new
            {
                s.Id, s.CustomerId, s.Name,
                SiteType = s.SiteType.ToString(),
                s.Address, s.City, s.ContactPerson, s.Phone, s.Email, s.IsPrimary, s.Notes, s.CreatedAt,
                CustomerNumber = c != null ? c.CustomerId : null,
                CustomerName = c != null ? c.Name : null,
                JobCount = jobCounts.TryGetValue(s.Id, out var jc) ? jc : 0,
                EquipmentCount = equipCounts.TryGetValue(s.Id, out var ec) ? ec : 0,
            };
        });
        if (!string.IsNullOrWhiteSpace(customerNumber))
        {
            var qn = customerNumber.Trim();
            shaped = shaped.Where(s => s.CustomerNumber != null && s.CustomerNumber.Contains(qn, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            shaped = shaped.Where(x =>
                (x.Name != null && x.Name.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (x.City != null && x.City.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (x.Address != null && x.Address.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (x.CustomerNumber != null && x.CustomerNumber.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (x.CustomerName != null && x.CustomerName.Contains(s, StringComparison.OrdinalIgnoreCase)));
        }
        return Ok(shaped.ToList());
    }
}
