using System.Globalization;
using System.IO.Compression;
using System.Security.Claims;
using System.Data;
using System.Text;
using System.Text.RegularExpressions;
using EFESMS.Api.Data;
using EFESMS.Api.Models;
using FireOpsAI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UglyToad.PdfPig;
using FO = FireOpsAI.Models;

namespace EFESMS.Api.Controllers;

[ApiController]
[Route("api/v1/operations")]
[Authorize]
public class OperationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AIOperationsEngine _engine;
    private readonly IWebHostEnvironment _env;

    public OperationsController(AppDbContext db, AIOperationsEngine engine, IWebHostEnvironment env)
    {
        _db = db;
        _engine = engine;
        _env = env;
    }

    private string CurrentUser => User.Identity?.Name ?? "unknown";
    private string CurrentRole => User.FindFirst(ClaimTypes.Role)?.Value ?? "";
    private string CurrentDept => User.FindFirst("department")?.Value ?? "";
    private bool IsAdmin => CurrentRole.Equals("admin", StringComparison.OrdinalIgnoreCase) ||
                            CurrentRole.Equals("administrator", StringComparison.OrdinalIgnoreCase);
    private bool CanOpsWrite => IsAdmin ||
        CurrentRole.Equals("management", StringComparison.OrdinalIgnoreCase) ||
        CurrentRole.Equals("technician", StringComparison.OrdinalIgnoreCase) ||
        CurrentRole.Equals("contracts manager", StringComparison.OrdinalIgnoreCase) ||
        CurrentRole.Equals("stores man", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Technical", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Operations", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Administration", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Contracts", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Stores", StringComparison.OrdinalIgnoreCase);
    private bool CanManageStores => IsAdmin ||
        CurrentRole.Equals("management", StringComparison.OrdinalIgnoreCase) ||
        CurrentRole.Equals("stores man", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Administration", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Management", StringComparison.OrdinalIgnoreCase) ||
        CurrentDept.Equals("Stores", StringComparison.OrdinalIgnoreCase);

    private IActionResult Denied() =>
        StatusCode(403, new { error = "FORBIDDEN", message = "Your role cannot change operations data. Ask an administrator." });

    // Canonical customer resolution: the visible CUS-###### is the one ID.
    // Explicit int id wins (backward compat), else the number is resolved.
    // Unknown references hard-reject — never silently create — so one
    // customer keeps exactly one ID and filings can't land on ghosts.
    // Returns null only when BOTH are blank (caller runs reuse-or-autocreate).
    private async Task<Customer?> FindCustomerByRefAsync(int? id, string? number)
    {
        if (id.HasValue)
        {
            var byId = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id.Value);
            if (byId is null) throw new CustomerResolutionException($"Customer ID {id.Value} does not exist.");
            return byId;
        }
        var key = number?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(key)) return null;
        var byNumber = await _db.Customers.FirstOrDefaultAsync(c => c.CustomerId.ToUpper() == key);
        if (byNumber is null) throw new CustomerResolutionException(
            $"Customer {number!.Trim()} does not exist. Check the ID or leave it blank to auto-generate.");
        return byNumber;
    }

    private sealed class CustomerResolutionException(string message) : Exception(message);

    // Technician resolution: explicit int ID wins; otherwise resolve by name
    // (exact match first, then a unique contains-match). Unknown references
    // hard-reject so jobs can't land on ghost technicians.
    // Returns null only when BOTH are blank.
    private async Task<Technician?> FindTechnicianByRefAsync(int? id, string? name)
    {
        if (id.HasValue)
        {
            var byId = await _db.Technicians.FirstOrDefaultAsync(t => t.Id == id.Value);
            if (byId is null) throw new CustomerResolutionException($"Technician ID {id.Value} does not exist.");
            return byId;
        }
        var n = name?.Trim();
        if (string.IsNullOrWhiteSpace(n)) return null;
        var exact = await _db.Technicians.FirstOrDefaultAsync(t => t.Name.ToLower() == n.ToLower());
        if (exact != null) return exact;
        var like = await _db.Technicians.Where(t => t.Name.ToLower().Contains(n.ToLower())).ToListAsync();
        if (like.Count == 1) return like[0];
        if (like.Count > 1) throw new CustomerResolutionException(
            $"Multiple technicians match '{n.Trim()}'. Use the technician ID instead.");
        throw new CustomerResolutionException($"Technician '{n.Trim()}' does not exist. Check the name or use the technician ID.");
    }

    // One customer, one ID: before auto-generating a customer, reuse the
    // existing record when the phone or name already identifies one.
    private async Task<Customer?> FindExistingCustomerAsync(string? phone, string? name)
    {
        var p = phone?.Trim();
        if (!string.IsNullOrWhiteSpace(p) && p != "0000000000")
        {
            var byPhone = await _db.Customers.FirstOrDefaultAsync(c => c.Phone == p || c.WhatsApp == p);
            if (byPhone != null) return byPhone;
        }
        var n = name?.Trim();
        if (!string.IsNullOrWhiteSpace(n) && !n.StartsWith("Walk-in", StringComparison.OrdinalIgnoreCase))
            return await _db.Customers.FirstOrDefaultAsync(c => c.Name.ToLower() == n.ToLower());
        return null;
    }

    // Business defaults from Settings (same store the Settings page writes).
    private async Task<string?> GetSettingAsync(string key) =>
        (await _db.AppSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == key))?.Value;

    private async Task<decimal> GetSettingDecimalAsync(string key, decimal fallback)
    {
        var raw = await GetSettingAsync(key);
        return decimal.TryParse(raw, out var v) ? v : fallback;
    }

    private async Task<int> GetSettingIntAsync(string key, int fallback)
    {
        var raw = await GetSettingAsync(key);
        return int.TryParse(raw, out var v) ? v : fallback;
    }

    private async Task<bool> GetSettingBoolAsync(string key, bool fallback)
    {
        var raw = await GetSettingAsync(key);
        if (raw == "1") return true;
        if (raw == "0") return false;
        return bool.TryParse(raw, out var v) ? v : fallback;
    }

    // Notification controls from Settings → engine reminder generation.
    private async Task<FireOpsAI.Contracts.ReminderOptions> LoadReminderOptionsAsync() =>
        new()
        {
            Enabled = await GetSettingBoolAsync("notificationsEnabled", true),
            LeadDays = await GetSettingIntAsync("reminderDays", 14),
            NotifyService = await GetSettingBoolAsync("notifyService", true),
            NotifyInspection = await GetSettingBoolAsync("notifyInspection", true),
            NotifyCertification = await GetSettingBoolAsync("notifyCertification", true),
            NotifyInventory = await GetSettingBoolAsync("notifyInventory", true),
            NotifyInvoice = await GetSettingBoolAsync("notifyInvoice", true),
        };

    public record TechIn(string? Name, string? Email, string? Phone, string? Trade, string? Vehicle, int? MaxConcurrentJobs,
        bool? Available, double? Latitude, double? Longitude, string? Skills, string? Certifications, DateTime? CertificationExpiry, decimal? HourlyRate);

     public record JobTaskIn(string? TaskType, string? EquipmentIds, int? InventoryItemId, int? StoreItemId, double? Quantity,
        string? AgentType, string? UnitType, double? AgentAmountKg, decimal? UnitPrice, bool? IsCompleted, string? Notes);

     public record JobIn(string? JobNumber, int? CustomerId, string? CustomerNumber, int? SiteId, int? EquipmentId, string? JobType, string? Title,
         string? Description, string? Status, string? Priority, int? AssignedTechnicianId, string? TechnicianName, DateTime? PlannedStart, DateTime? PlannedEnd,
         double? EstimatedHours, string? RequiredSkills, string? RequiredCertifications, decimal? QuotedAmount, string? Notes,
         string? CustomerName, string? CustomerPhone, string? CustomerEmail, string? Address, string? Email,
         DateTime? NextServiceDate, bool? WorksDoneSatisfactorily, string? AgentType, double? AgentAmountKg, int? UnitCount,
         List<JobTaskIn>? Tasks = null);

    public record EquipmentIn(string? EquipmentNumber, int? CustomerId, int? SiteId, string? Name, string? Category, string? Model,
        string? Make, string? SerialNumber, string? AgentType, DateTime? ManufactureDate, DateTime? InstallationDate,
        DateTime? LastInspectionDate, DateTime? LastServiceDate, DateTime? NextServiceDue, int? ConditionRating,
        int? LifeSpanMonths, int? ServiceIntervalMonths, string? Status, double? Latitude, double? Longitude);

    public record InventoryIn(string? Name, string? Category, int? CurrentStock, int? ReorderLevel, decimal? UnitCost,
        string? Unit, int? LeadTimeDays, string? MonthlyUsage);

    public record WorkRecordIn(int? JobId, int? EquipmentId, int? TechnicianId, int? CustomerId, int? SiteId, DateTime? Date,
        string? Type, decimal? Cost, string? Notes);

    public record CertificationIn(int? TechnicianId, string? Name, DateTime? ExpiryDate);

    public record InvoiceIn(string? InvoiceNumber, int? CustomerId, decimal? Amount, DateTime? IssueDate, DateTime? DueDate,
        DateTime? PaidDate, string? Status);

    public record QuotationLineIn(string? Description, double? Quantity, decimal? UnitPrice);

    public record QuotationIn(int? CustomerId, string? CustomerNumber, int? SiteId, string? Title, DateTime? QuoteDate, DateTime? ExpiryDate,
        decimal? DiscountPercent, decimal? TaxPercent, string? Terms, string? Notes,
        string? CustomerName, string? CustomerPhone, string? CustomerEmail,
        string? CustomerAddress, string? CustomerVat, string? CustomerTin, string? CustomerContact,
        string? Currency, string? CompanyVatNo, string? CompanyTinNo,
        string? BankName, string? BankBranch, string? BankAccountName, string? BankAccountNumber, string? BankAccountNumberZwg,
        string? DocumentRef, string? PaymentTerms, string? ValidityText,
        List<QuotationLineIn>? Lines);

    public record AssignIn(int? TechnicianId, string? TechnicianName);

    public record AutoAssignIn(bool? OnlyUnassigned);

    public record VoiceIn(string? Text);

    public record AnalyzeRequest(bool? Schedule, bool? Route, bool? Predict, bool? DetectAnomalies, bool? Forecast, bool? Risk,
        bool? Reminders, bool? Cluster);

    // ---------- technicians ----------

    [HttpGet("technicians")]
    public async Task<IActionResult> GetTechnicians() =>
        Ok(await _db.Technicians.AsNoTracking().OrderBy(t => t.Name)
            .Select(t => new
            {
                t.Id, t.Name, t.Email, t.Phone, t.Trade, t.Vehicle, t.MaxConcurrentJobs, t.Available, t.Latitude, t.Longitude,
                t.Skills, t.Certifications, t.CertificationExpiry, t.HourlyRate,
            })
            .ToListAsync());

    [HttpPost("technicians")]
    public async Task<IActionResult> CreateTechnician([FromBody] TechIn dto)
    {
        if (!CanOpsWrite) return Denied();
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { message = "Technician name is required." });
        if (string.IsNullOrWhiteSpace(dto.Skills)) return BadRequest(new { message = "Skills are required. A technician cannot be added without skills." });
        if (string.IsNullOrWhiteSpace(dto.Certifications)) return BadRequest(new { message = "Certifications are required. A technician cannot be added without a certificate." });
        var t = new Technician
        {
            Name = dto.Name!.Trim(),
            Email = dto.Email, Phone = dto.Phone,
            Trade = dto.Trade ?? "Fire Technician",
            Vehicle = dto.Vehicle,
            MaxConcurrentJobs = dto.MaxConcurrentJobs ?? 4,
            Available = dto.Available ?? true,
            Latitude = dto.Latitude, Longitude = dto.Longitude,
            Skills = dto.Skills ?? "", Certifications = dto.Certifications ?? "",
            CertificationExpiry = dto.CertificationExpiry,
            HourlyRate = dto.HourlyRate ?? 0,
        };
        _db.Technicians.Add(t);
        await _db.SaveChangesAsync();
        await SyncTechnicianCertsAsync(t);
        return Ok(t);
    }

    [HttpPut("technicians/{id:int}")]
    public async Task<IActionResult> UpdateTechnician(int id, [FromBody] TechIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var t = await _db.Technicians.FindAsync(id);
        if (t is null) return NotFound();
        if (dto.Name != null) t.Name = dto.Name;
        if (dto.Email != null) t.Email = dto.Email;
        if (dto.Phone != null) t.Phone = dto.Phone;
        if (dto.Trade != null) t.Trade = dto.Trade;
        if (dto.Vehicle != null) t.Vehicle = dto.Vehicle;
        if (dto.MaxConcurrentJobs != null) t.MaxConcurrentJobs = dto.MaxConcurrentJobs.Value;
        if (dto.Available != null) t.Available = dto.Available.Value;
        if (dto.Latitude != null) t.Latitude = dto.Latitude;
        if (dto.Longitude != null) t.Longitude = dto.Longitude;
        if (dto.Skills != null && string.IsNullOrWhiteSpace(dto.Skills)) return BadRequest(new { message = "Skills cannot be cleared. A technician must keep skills." });
        if (dto.Certifications != null && string.IsNullOrWhiteSpace(dto.Certifications)) return BadRequest(new { message = "Certifications cannot be cleared. A technician must keep a certificate." });
        if (dto.Skills != null) t.Skills = dto.Skills;
        if (dto.Certifications != null) t.Certifications = dto.Certifications;
        if (dto.CertificationExpiry != null) t.CertificationExpiry = dto.CertificationExpiry;
        if (dto.HourlyRate != null) t.HourlyRate = dto.HourlyRate.Value;
        await _db.SaveChangesAsync();
        await SyncTechnicianCertsAsync(t);
        return Ok(t);
    }

    // Certificates page auto-fills from the Technicians register: every
    // certificate named on a technician ensures a matching OpsCertification
    // row (technician-owned rows are never deleted here, manual extras stay).
    private async Task SyncTechnicianCertsAsync(Technician t)
    {
        var names = (t.Certifications ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (names.Count == 0) return;
        var expiry = t.CertificationExpiry ?? DateTime.UtcNow.AddYears(1);
        var existing = await _db.OpsCertifications.Where(c => c.TechnicianId == t.Id).ToListAsync();
        foreach (var n in names)
        {
            var row = existing.FirstOrDefault(c => c.Name.Equals(n, StringComparison.OrdinalIgnoreCase));
            if (row is null)
                _db.OpsCertifications.Add(new OpsCertification { TechnicianId = t.Id, Name = n, ExpiryDate = expiry });
            else if (t.CertificationExpiry.HasValue)
                row.ExpiryDate = expiry;
        }
        await _db.SaveChangesAsync();
    }

    [HttpDelete("technicians/{id:int}")]
    public async Task<IActionResult> DeleteTechnician(int id)
    {
        if (!IsAdmin) return Denied();
        var t = await _db.Technicians.FindAsync(id);
        if (t is null) return NotFound();
        _db.Technicians.Remove(t);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------- job cards ----------

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs([FromQuery] string? search, [FromQuery] string? customerNumber)
    {
        var techs = (await _db.Technicians.AsNoTracking().ToListAsync()).ToDictionary(t => t.Id, t => t.Name);
        var customers = (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id);
        var equipment = (await _db.OpsEquipment.AsNoTracking().ToListAsync()).ToDictionary(e => e.Id);
        var sites = (await _db.CustomerSites.AsNoTracking().ToListAsync()).ToDictionary(s => s.Id);
        var quoteByJob = (await _db.OpsQuotations.AsNoTracking().Where(q => q.ConvertedJobId != null).ToListAsync())
            .GroupBy(q => q.ConvertedJobId!.Value).ToDictionary(g => g.Key, g => g.First());
        var jobs = await _db.JobCards.AsNoTracking().OrderBy(j => j.PlannedStart).ToListAsync();
        // Task lines are additive: only loaded for the jobs that have any, so
        // the common no-tasks case costs nothing extra.
        var tasksByJob = (await _db.JobCardTasks.AsNoTracking().ToListAsync())
            .GroupBy(t => t.JobCardId).ToDictionary(g => g.Key, g => g.OrderBy(t => t.SortOrder).ThenBy(t => t.Id).Select(ShapeTaskRow).ToList());
         var shaped = jobs.Select(j => new
         {
             j.Id, j.JobNumber, j.CustomerId, j.SiteId, j.EquipmentId, j.JobType, j.Title, j.Description,
             Status = j.Status.ToString(), Priority = j.Priority.ToString(),
             TechnicianId = j.AssignedTechnicianId,
             AssignedTechnicianId = j.AssignedTechnicianId,
             TechnicianName = j.AssignedTechnicianId != null && techs.ContainsKey(j.AssignedTechnicianId.Value) ? techs[j.AssignedTechnicianId.Value] : null,
             AssignedTechnicianName = j.AssignedTechnicianId != null && techs.ContainsKey(j.AssignedTechnicianId.Value) ? techs[j.AssignedTechnicianId.Value] : null,
             CustomerNumber = j.CustomerId != null && customers.TryGetValue(j.CustomerId.Value, out var c) ? c.CustomerId : null,
             CustomerName = j.CustomerId != null && customers.TryGetValue(j.CustomerId.Value, out var c2) ? c2.Name : null,
             CustomerPhone = j.CustomerId != null && customers.TryGetValue(j.CustomerId.Value, out var c3) ? c3.Phone : null,
             CustomerWhatsApp = j.CustomerId != null && customers.TryGetValue(j.CustomerId.Value, out var c4) ? c4.WhatsApp : null,
             CustomerEmail = j.CustomerId != null && customers.TryGetValue(j.CustomerId.Value, out var c5) ? c5.Email : null,
             EquipmentNumber = j.EquipmentId != null && equipment.TryGetValue(j.EquipmentId.Value, out var e) ? e.EquipmentNumber : null,
             EquipmentName = j.EquipmentId != null && equipment.TryGetValue(j.EquipmentId.Value, out var e2) ? e2.Name : null,
              SiteName = j.SiteId != null && sites.TryGetValue(j.SiteId.Value, out var s) ? s.Name : null,
              SourceQuotationId = quoteByJob.TryGetValue(j.Id, out var sq) ? sq.Id : (int?)null,
              SourceQuotationNumber = quoteByJob.TryGetValue(j.Id, out var sq2) ? sq2.QuotationNumber : null,
              j.PlannedStart, j.PlannedEnd, j.CompletedAt,
              DateEnded = j.CompletedAt ?? j.PlannedEnd,
              j.EstimatedHours, j.RequiredSkills, j.RequiredCertifications,
              j.QuotedAmount, j.Notes, j.CreatedAt,
              j.Address, j.Email, j.NextServiceDate, j.WorksDoneSatisfactorily,
               j.AgentType, j.AgentAmountKg, j.UnitCount,
               Tasks = tasksByJob.TryGetValue(j.Id, out var jt) ? jt : new List<object>(),
          });
        if (!string.IsNullOrWhiteSpace(customerNumber))
        {
            var q = customerNumber.Trim();
            shaped = shaped.Where(j => j.CustomerNumber != null && j.CustomerNumber.Contains(q, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim();
            shaped = shaped.Where(j =>
                (j.JobNumber != null && j.JobNumber.Contains(q, StringComparison.OrdinalIgnoreCase)) ||
                (j.Title != null && j.Title.Contains(q, StringComparison.OrdinalIgnoreCase)) ||
                (j.CustomerNumber != null && j.CustomerNumber.Contains(q, StringComparison.OrdinalIgnoreCase)) ||
                (j.CustomerName != null && j.CustomerName.Contains(q, StringComparison.OrdinalIgnoreCase)));
        }
        return Ok(shaped.ToList());
    }

    [HttpPost("jobs")]
    public async Task<IActionResult> CreateJob([FromBody] JobIn dto)
    {
        if (!CanOpsWrite) return Denied();
        if (string.IsNullOrWhiteSpace(dto.Title)) return BadRequest(new { message = "Job title is required." });
        if (dto.Title.Trim().Length > 255) return BadRequest(new { message = "Job title must be 255 characters or fewer." });
        if (dto.EstimatedHours is <= 0) return BadRequest(new { message = "Estimated hours must be greater than zero." });
        if (dto.PlannedEnd.HasValue && dto.PlannedStart.HasValue && dto.PlannedEnd < dto.PlannedStart)
            return BadRequest(new { message = "Planned end must be after planned start." });
        if (!string.IsNullOrWhiteSpace(dto.JobType) && !new[] { "Inspection", "Service", "Refill", "Maintenance", "Installation" }
            .Contains(dto.JobType, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "Job type is invalid." });
        if (!string.IsNullOrWhiteSpace(dto.Priority) && !Enum.TryParse<JobCardPriority>(dto.Priority, true, out _))
            return BadRequest(new { message = "Priority is invalid." });

        if (dto.SiteId.HasValue && !await _db.CustomerSites.AnyAsync(s => s.Id == dto.SiteId.Value))
            return BadRequest(new { message = $"Site ID {dto.SiteId.Value} does not exist." });
        if (dto.EquipmentId.HasValue && !await _db.OpsEquipment.AnyAsync(e => e.Id == dto.EquipmentId.Value))
            return BadRequest(new { message = $"Equipment ID {dto.EquipmentId.Value} does not exist." });
        // Resolve the technician up front by ID or by name — unknown references hard-reject.
        Technician? explicitTechnician = null;
        if (dto.AssignedTechnicianId.HasValue || !string.IsNullOrWhiteSpace(dto.TechnicianName))
        {
            try { explicitTechnician = await FindTechnicianByRefAsync(dto.AssignedTechnicianId, dto.TechnicianName); }
            catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // Resolve the one customer ID up front — unknown references hard-reject.
        Customer? explicitCustomer = null;
        if (dto.CustomerId.HasValue || !string.IsNullOrWhiteSpace(dto.CustomerNumber))
        {
            try { explicitCustomer = await FindCustomerByRefAsync(dto.CustomerId, dto.CustomerNumber); }
            catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        }
        // Customer identity is created only in Customers. A job must always
        // reference that permanent row so its history cannot split or duplicate.
        if (explicitCustomer is null)
            return BadRequest(new { message = "Select an existing customer ID before creating a job. Create the customer in Customers first." });
        if (dto.NextServiceDate is null && explicitCustomer.NextServiceDate is null)
            return BadRequest(new { message = "Next service date is required. Set it on the job or the customer's service schedule." });

        try
        {
            // Job creation spans the customer, card, stock, asset, and work
            // registers; commit them together so a failed task line leaves no
            // partially-created business record behind.
            await using var transaction = await _db.Database.BeginTransactionAsync();
            // If Refill and agent not given but equipment selected, use that equipment's agent type
            string? resolvedAgentType = dto.AgentType;
            double? resolvedAgentAmount = dto.AgentAmountKg;
            if (string.IsNullOrWhiteSpace(resolvedAgentType) && dto.EquipmentId.HasValue)
            {
                var eqForAgent = await _db.OpsEquipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == dto.EquipmentId.Value);
                if (eqForAgent != null && !string.IsNullOrWhiteSpace(eqForAgent.AgentType))
                    resolvedAgentType = eqForAgent.AgentType;
            }
            if (resolvedAgentAmount == null && !string.IsNullOrWhiteSpace(resolvedAgentType))
            {
                var m = System.Text.RegularExpressions.Regex.Match(resolvedAgentType, @"(\d+(?:\.\d+)?)\s*(kg|l|litre)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (m.Success && double.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var v)) resolvedAgentAmount = v;
            }
            var number = dto.JobNumber;
                var n = await NextSequenceValue("JobNumberSequence");
                number = $"JOB-{n:D6}";
            // The job sequence gives every card its own key; the selected
            // customer row supplies its one permanent customer identity.
            var customerId = explicitCustomer.Id;
            if (dto.UnitCount.HasValue && dto.UnitCount <= 0) return BadRequest(new { message = "Number of units must be at least 1." });
            if (dto.UnitCount.HasValue && dto.UnitCount > 1000) return BadRequest(new { message = "Number of units must be 1000 or fewer." });
            // Validate before persisting anything so a rejected line never
            // leaves a half-created job card behind.
            if (dto.Tasks is { Count: > 0 })
            {
                var (preError, _) = await ValidateJobTasksAsync(customerId, ParseStatus(dto.Status), dto.Tasks);
                if (preError != null) return BadRequest(new { message = preError });
            }
             var job = new JobCard
             {
                 JobNumber = number,
                 CustomerId = customerId, SiteId = dto.SiteId, EquipmentId = dto.EquipmentId,
                 AgentType = resolvedAgentType, AgentAmountKg = resolvedAgentAmount,
                 UnitCount = dto.UnitCount ?? 1,
                 JobType = dto.JobType ?? "Service",
                 Title = dto.Title!.Trim(),
                 Description = dto.Description,
                 Status = ParseStatus(dto.Status),
                 Priority = ParsePriority(dto.Priority),
                 AssignedTechnicianId = explicitTechnician?.Id,
                 PlannedStart = dto.PlannedStart, PlannedEnd = dto.PlannedEnd,
                 EstimatedHours = dto.EstimatedHours,
                 RequiredSkills = dto.RequiredSkills ?? "", RequiredCertifications = dto.RequiredCertifications ?? "",
                 QuotedAmount = dto.QuotedAmount, Notes = dto.Notes,
                 Address = explicitCustomer.BillingAddress ?? dto.Address,
                 Email = explicitCustomer.Email ?? dto.Email,
                 NextServiceDate = dto.NextServiceDate ?? explicitCustomer?.NextServiceDate,
                 WorksDoneSatisfactorily = dto.WorksDoneSatisfactorily ?? false,
             };
_db.JobCards.Add(job);
             await _db.SaveChangesAsync();
            List<JobCardTask> createdTasks = new();
            if (dto.Tasks is { Count: > 0 })
            {
                var (taskError, taskResult) = await SyncJobTasksAsync(job, dto.Tasks);
                if (taskError != null) return BadRequest(new { message = taskError });
                createdTasks = taskResult ?? new();
            }
             else
             {
                // No task lines: the original single-unit path, unchanged.
                await EnsureJobWorkRecordAsync(job, resolvedAgentType, resolvedAgentAmount);
            }
            if (job.Status is JobCardStatus.Completed or JobCardStatus.Closed) await SyncJobTasksCompletionAsync(job, job.CompletedAt ?? DateTime.UtcNow);
            await SyncCustomerServiceSummaryAsync(job);
            var linked = explicitCustomer;
            var linkedTech = job.AssignedTechnicianId.HasValue
                ? await _db.Technicians.AsNoTracking().FirstOrDefaultAsync(t => t.Id == job.AssignedTechnicianId.Value)
                : null;
            var linkedEq = job.EquipmentId.HasValue
                ? await _db.OpsEquipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == job.EquipmentId.Value)
                : null;
            var linkedSite = job.SiteId.HasValue
                ? await _db.CustomerSites.AsNoTracking().FirstOrDefaultAsync(s => s.Id == job.SiteId.Value)
                : null;
            await transaction.CommitAsync();
             return Ok(new
             {
                 job.Id, job.JobNumber, job.CustomerId, job.SiteId, job.EquipmentId, job.AgentType, job.AgentAmountKg, job.UnitCount, job.JobType, job.Title, job.Description,
                 Status = job.Status.ToString(), Priority = job.Priority.ToString(),
                 TechnicianId = job.AssignedTechnicianId,
                 AssignedTechnicianId = job.AssignedTechnicianId,
                 TechnicianName = linkedTech != null ? linkedTech.Name : null,
                 AssignedTechnicianName = linkedTech != null ? linkedTech.Name : null,
                 CustomerNumber = linked != null ? linked.CustomerId : null,
                 CustomerName = linked != null ? linked.Name : null,
                 CustomerPhone = linked?.Phone,
                 CustomerWhatsApp = linked?.WhatsApp,
                 CustomerEmail = linked?.Email,
                 EquipmentNumber = linkedEq != null ? linkedEq.EquipmentNumber : null,
                 EquipmentName = linkedEq != null ? linkedEq.Name : null,
                 AgentTypeName = linkedEq != null ? linkedEq.AgentType : job.AgentType,
                 SiteName = linkedSite != null ? linkedSite.Name : null,
                 job.PlannedStart, job.PlannedEnd, job.CompletedAt,
                 DateEnded = job.CompletedAt ?? job.PlannedEnd,
                 job.EstimatedHours, job.RequiredSkills, job.RequiredCertifications,
                 job.QuotedAmount, job.Notes, job.CreatedAt,
                 job.Address, job.Email, job.NextServiceDate, job.WorksDoneSatisfactorily,
                 Tasks = createdTasks.Select(ShapeTaskRow),
             });
         }
        catch (DbUpdateException ex)
        {
            var detail = ex.InnerException?.Message ?? ex.Message;
            return BadRequest(new { message = "The job could not be saved because the data conflicts with the database.", detail });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "The job could not be saved.", detail = ex.Message });
        }
    }

    [HttpPut("jobs/{id:int}")]
    public async Task<IActionResult> UpdateJob(int id, [FromBody] JobIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var job = await _db.JobCards.FindAsync(id);
        if (job is null) return NotFound();
        if (dto.NextServiceDate is null && job.NextServiceDate is null)
            return BadRequest(new { message = "Next service date is required before saving this job card." });
        // Task sync may touch stock and several registers. Keep this edit
        // atomic so a late validation or save failure cannot split those writes.
        await using var transaction = await _db.Database.BeginTransactionAsync();
        // Validate the task lines up front so a rejected edit changes nothing.
        if (dto.Tasks is { Count: > 0 })
        {
            // Prefer the customer the edit is moving the job to, when given by id.
            var prospectiveCustomer = dto.CustomerId ?? job.CustomerId;
            var (preError, _) = await ValidateJobTasksAsync(prospectiveCustomer, ParseStatus(dto.Status ?? job.Status.ToString()), dto.Tasks, job);
            if (preError != null) return BadRequest(new { message = preError });
        }
        if (dto.JobNumber != null) job.JobNumber = dto.JobNumber;
        if (dto.CustomerId != null || !string.IsNullOrWhiteSpace(dto.CustomerNumber))
        {
            try { job.CustomerId = (await FindCustomerByRefAsync(dto.CustomerId, dto.CustomerNumber))?.Id; }
            catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        }
        if (dto.SiteId != null) job.SiteId = dto.SiteId;
        if (dto.EquipmentId != null)
        {
            job.EquipmentId = dto.EquipmentId;
            // Auto-fill agent from selected equipment when not explicitly given
            if (dto.AgentType == null && dto.EquipmentId.HasValue)
            {
                var eqForAgent2 = await _db.OpsEquipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == dto.EquipmentId.Value);
                if (eqForAgent2 != null && !string.IsNullOrWhiteSpace(eqForAgent2.AgentType))
                    job.AgentType = eqForAgent2.AgentType;
            }
        }
        if (dto.JobType != null) job.JobType = dto.JobType;
        if (dto.Title != null) job.Title = dto.Title;
        if (dto.Description != null) job.Description = dto.Description;
        if (dto.Status != null) job.Status = ParseStatus(dto.Status);
        if (dto.Priority != null) job.Priority = ParsePriority(dto.Priority);
        if (dto.AssignedTechnicianId != null || !string.IsNullOrWhiteSpace(dto.TechnicianName))
        {
            try { job.AssignedTechnicianId = (await FindTechnicianByRefAsync(dto.AssignedTechnicianId, dto.TechnicianName))?.Id; }
            catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        }
        if (dto.PlannedStart != null) job.PlannedStart = dto.PlannedStart;
        if (dto.PlannedEnd != null) job.PlannedEnd = dto.PlannedEnd;
        if (dto.EstimatedHours != null) job.EstimatedHours = dto.EstimatedHours;
        if (dto.RequiredSkills != null) job.RequiredSkills = dto.RequiredSkills;
        if (dto.RequiredCertifications != null) job.RequiredCertifications = dto.RequiredCertifications;
        if (dto.Address != null) job.Address = dto.Address;
        if (dto.Email != null) job.Email = dto.Email;
        if (dto.NextServiceDate != null) job.NextServiceDate = dto.NextServiceDate;
        if (dto.WorksDoneSatisfactorily != null) job.WorksDoneSatisfactorily = dto.WorksDoneSatisfactorily.Value;
        if (dto.AgentType != null) job.AgentType = dto.AgentType;
        if (dto.AgentAmountKg != null) job.AgentAmountKg = dto.AgentAmountKg;
        if (dto.UnitCount.HasValue) {
            if (dto.UnitCount <= 0) return BadRequest(new { message = "Number of units must be at least 1." });
            if (dto.UnitCount > 1000) return BadRequest(new { message = "Number of units must be 1000 or fewer." });
            job.UnitCount = dto.UnitCount.Value;
        }
        if (dto.QuotedAmount != null) job.QuotedAmount = dto.QuotedAmount;
        if (dto.Notes != null) job.Notes = dto.Notes;
        if ((job.Status is JobCardStatus.Completed or JobCardStatus.Closed) && job.CompletedAt == null) job.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        if (dto.Tasks is { Count: > 0 })
        {
            var (taskError, _) = await SyncJobTasksAsync(job, dto.Tasks);
            if (taskError != null) return BadRequest(new { message = taskError });
        }
        else
        {
            // No task lines supplied: the original single-unit path, unchanged.
            await EnsureJobWorkRecordAsync(job, dto.AgentType, dto.AgentAmountKg);
        }
        if (job.Status is JobCardStatus.Completed or JobCardStatus.Closed)
        {
            await SyncJobCompletionAsync(job);
            await SyncJobTasksCompletionAsync(job, job.CompletedAt ?? DateTime.UtcNow);
        }
        await SyncCustomerServiceSummaryAsync(job);
        await transaction.CommitAsync();
        return Ok(await ShapeJobAsync(job.Id));
    }

    [HttpPost("jobs/{id:int}/assign")]
    public async Task<IActionResult> AssignJob(int id, [FromBody] AssignIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var job = await _db.JobCards.FindAsync(id);
        if (job is null) return NotFound();
        if (dto.TechnicianId == null && string.IsNullOrWhiteSpace(dto.TechnicianName))
            return BadRequest(new { message = "TechnicianId or TechnicianName is required." });
        Technician? tech;
        try { tech = await FindTechnicianByRefAsync(dto.TechnicianId, dto.TechnicianName); }
        catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        job.AssignedTechnicianId = tech!.Id;
        if (job.Status == JobCardStatus.Draft) job.Status = JobCardStatus.Assigned;
        await _db.SaveChangesAsync();
        return Ok(await ShapeJobAsync(job.Id));
    }

    // Skill-based auto-assign: runs the scheduling engine against each job's
    // RequiredSkills/RequiredCertifications and each technician's Skills/
    // Certifications, then persists the top match (Draft → Assigned).
    [HttpPost("jobs/auto-assign")]
    public async Task<IActionResult> AutoAssignJobs([FromBody] AutoAssignIn? dto)
    {
        if (!CanOpsWrite) return Denied();
        var input = await BuildInputAsync(DateTime.UtcNow);
        if (input.Technicians.Count == 0)
            return BadRequest(new { message = "No technicians registered — add technicians with skills first." });
        if (!input.Technicians.Any(t => t.Available))
            return BadRequest(new { message = "No available technicians — mark at least one technician Available before auto-assign." });
        var output = _engine.AnalyzePartial(
            input,
            schedule: true, route: false, predict: false,
            detectAnomalies: false, forecast: false, risk: false,
            reminders: false, cluster: false);
        var onlyUnassigned = dto?.OnlyUnassigned ?? true;
        int applied = 0;
        int skippedAssigned = 0;
        var results = new List<object>();
        foreach (var a in output.Assignments)
        {
            var job = await _db.JobCards.FindAsync(a.JobId);
            if (job is null) continue;
            if (job.Status is JobCardStatus.Completed or JobCardStatus.Closed or JobCardStatus.Cancelled) continue;
            if (onlyUnassigned && job.AssignedTechnicianId != null) { skippedAssigned++; continue; }
            job.AssignedTechnicianId = a.TechnicianId;
            if (job.Status == JobCardStatus.Draft) job.Status = JobCardStatus.Assigned;
            applied++;
            results.Add(new
            {
                job.Id, job.JobNumber,
                a.TechnicianId, a.TechnicianName, a.Score,
                a.SkillMatch, a.CertificationScore, a.Reasons,
            });
        }
        await _db.SaveChangesAsync();
        return Ok(new
        {
            algorithm = output.ML.ScheduleAlgorithm,
            applied,
            onlyUnassigned,
            skippedAssigned,
            suggested = output.Assignments.Count,
            assignments = results,
        });
    }

    [HttpGet("jobs/{id:int}")]
    public async Task<IActionResult> GetJob(int id)
    {
        if (!await _db.JobCards.AnyAsync(x => x.Id == id)) return NotFound();
        return Ok(await ShapeJobAsync(id));
    }

    // Job type drives the work registers: selecting Refill / Maintenance /
    // Installation / Inspection / Service on a job auto-records the matching
    // entry (linked by JobId) so the Refill, Maintenance, Inspection and
    // Services pages stay in sync with the job cards. Idempotent per job+type — updates existing record when job is edited.
    private async Task EnsureJobWorkRecordAsync(JobCard job, string? agentType = null, double? agentAmountKg = null)
    {
        var type = (job.JobType ?? "").Trim();
        var when = job.PlannedStart ?? DateTime.UtcNow;
        var note = $"Auto-recorded from job {job.JobNumber} — {job.Title}";
        var cost = job.QuotedAmount ?? 0;
        // Parse amount from agent string like "2.5kg DCP" or "9L Water" when not explicitly given
        double? parsedKg = agentAmountKg;
        if (parsedKg == null && !string.IsNullOrWhiteSpace(agentType))
        {
            var m = System.Text.RegularExpressions.Regex.Match(agentType, @"(\d+(?:\.\d+)?)\s*(kg|l|litre)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (m.Success && double.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var v)) parsedKg = v;
        }
        if (type.Equals("Refill", StringComparison.OrdinalIgnoreCase))
        {
            var existing = await _db.OpsRefills.FirstOrDefaultAsync(x => x.JobId == job.Id);
            if (existing == null)
            {
                var eqAgent = job.EquipmentId.HasValue
                    ? (await _db.OpsEquipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == job.EquipmentId.Value))?.AgentType
                    : null;
                var eqKg = job.EquipmentId.HasValue
                    ? (await _db.OpsEquipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == job.EquipmentId.Value))?.AgentType
                    : null;
                _db.OpsRefills.Add(new OpsRefill
                {
                    JobId = job.Id, EquipmentId = job.EquipmentId, TechnicianId = job.AssignedTechnicianId,
                    CustomerId = job.CustomerId, SiteId = job.SiteId, RefillDate = when,
                    AgentType = agentType ?? eqAgent ?? job.AgentType ?? "ABC Dry Powder", AgentAmountKg = parsedKg ?? job.AgentAmountKg ?? 0, Cost = cost, Notes = note,
                });
            }
            else
            {
                // Keep refill in sync when job equipment/agent changes
                existing.EquipmentId = job.EquipmentId;
                existing.TechnicianId = job.AssignedTechnicianId;
                existing.CustomerId = job.CustomerId;
                existing.SiteId = job.SiteId;
                if (!string.IsNullOrWhiteSpace(agentType ?? job.AgentType)) existing.AgentType = agentType ?? job.AgentType!;
                if (parsedKg != null || job.AgentAmountKg != null) existing.AgentAmountKg = parsedKg ?? job.AgentAmountKg ?? existing.AgentAmountKg;
                if (cost != 0) existing.Cost = cost;
            }
        }
        else if (type.Equals("Inspection", StringComparison.OrdinalIgnoreCase))
        {
            if (!await _db.OpsInspections.AnyAsync(x => x.JobId == job.Id))
                _db.OpsInspections.Add(new OpsInspection
                {
                    JobId = job.Id, EquipmentId = job.EquipmentId, TechnicianId = job.AssignedTechnicianId,
                    CustomerId = job.CustomerId, SiteId = job.SiteId, InspectionDate = when,
                    Result = "Scheduled", Cost = cost, Findings = note,
                });
        }
        else if (type.Equals("Maintenance", StringComparison.OrdinalIgnoreCase)
            || type.Equals("Installation", StringComparison.OrdinalIgnoreCase)
            || type.Equals("Service", StringComparison.OrdinalIgnoreCase))
        {
            if (!await _db.OpsMaintenance.AnyAsync(x => x.JobId == job.Id))
                _db.OpsMaintenance.Add(new OpsMaintenance
                {
                    JobId = job.Id, EquipmentId = job.EquipmentId, TechnicianId = job.AssignedTechnicianId,
                    CustomerId = job.CustomerId, SiteId = job.SiteId, WorkDate = when,
                    WorkType = type.Length > 0 ? char.ToUpper(type[0]) + type[1..].ToLower() : "Service",
                    Cost = cost, Findings = note,
                });
        }
        await _db.SaveChangesAsync();
    }

    // When a job completes, stamp the linked work records with the completion
    // date and roll the equipment service dates forward so the asset register
    // stays current without manual edits.
    private async Task SyncJobCompletionAsync(JobCard job)
    {
        if (job.CompletedAt == null) return;
        var done = job.CompletedAt.Value;
        var refills = await _db.OpsRefills.Where(x => x.JobId == job.Id).ToListAsync();
        foreach (var r in refills) r.RefillDate = done;
        var inspections = await _db.OpsInspections.Where(x => x.JobId == job.Id).ToListAsync();
        foreach (var i in inspections) i.InspectionDate = done;
        var works = await _db.OpsMaintenance.Where(x => x.JobId == job.Id).ToListAsync();
        foreach (var w in works) w.WorkDate = done;
        if (job.EquipmentId.HasValue)
        {
            var eq = await _db.OpsEquipment.FindAsync(job.EquipmentId.Value);
            if (eq != null)
            {
                var type = (job.JobType ?? "").Trim();
                if (type.Equals("Inspection", StringComparison.OrdinalIgnoreCase))
                    eq.LastInspectionDate = done;
                else
                    eq.LastServiceDate = done;
                eq.NextServiceDue = done.AddMonths(ServiceIntervalFor(eq));
            }
        }
        await _db.SaveChangesAsync();
    }

    // ---------- job card task lines (additive) ----------

    // Parses the comma-separated EquipmentIds on a task line into a distinct,
    // ascending list of ints. Anything unparseable is ignored rather than
    // throwing, so one bad value never blocks saving the whole job.
    private static List<int> ParseEquipmentIds(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return new();
        var ids = new List<int>();
        foreach (var raw in csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (int.TryParse(raw, out var id) && id > 0 && !ids.Contains(id))
                ids.Add(id);
        return ids;
    }

    // Resolves the display name/agent for a task so register rows and newly
    // created equipment records carry readable values.
    private static string? NormalizeAgentType(string? agentType, string? unitType = null)
    {
        var value = (unitType ?? agentType ?? "").Trim();
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (value.Equals("DCP", StringComparison.OrdinalIgnoreCase) || value.Contains("dry powder", StringComparison.OrdinalIgnoreCase)) return "DCP";
        if (value.Contains("CO2", StringComparison.OrdinalIgnoreCase)) return "CO2";
        if (value.Contains("foam", StringComparison.OrdinalIgnoreCase)) return "Foam";
        if (value.Contains("water", StringComparison.OrdinalIgnoreCase)) return "Water";
        if (value.Contains("wet chemical", StringComparison.OrdinalIgnoreCase)) return "Wet Chemical";
        if (value.Contains("clean agent", StringComparison.OrdinalIgnoreCase) || value.Contains("FM200", StringComparison.OrdinalIgnoreCase)
            || value.Contains("Novec", StringComparison.OrdinalIgnoreCase) || value.Contains("FE-36", StringComparison.OrdinalIgnoreCase)) return "Clean Agent";
        if (value.Contains("Class D", StringComparison.OrdinalIgnoreCase)) return "Class D Metal";
        return value;
    }

    private static string? EquipmentUnitType(OpsEquipment? equipment)
    {
        if (equipment == null) return null;
        var combined = $"{equipment.AgentType} {equipment.Name}";
        // Keep the capacity and agent together as a concise unit model (e.g. 2.5kg DCP).
        var match = System.Text.RegularExpressions.Regex.Match(combined,
            @"\d+(?:\.\d+)?\s*(?:kg|l)\s*(?:DCP|CO2|ABC|BC|DC|water(?:\s+spray|\s+mist)?|foam(?:\s+AFFF|\s+AR(?:\s*\([^)]*\))?|\s+FP(?:\s*\([^)]*\))?)?)?",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return match.Success ? System.Text.RegularExpressions.Regex.Replace(match.Value.Trim(), @"\s+", " ") : equipment.AgentType ?? equipment.Name;
    }

    private static int ServiceIntervalFor(OpsEquipment equipment) =>
        equipment.Category.Contains("extinguisher", StringComparison.OrdinalIgnoreCase)
        || equipment.Name.Contains("extinguisher", StringComparison.OrdinalIgnoreCase)
            ? 6
            : Math.Max(equipment.ServiceIntervalMonths, 1);

    private static (string? Agent, double? Kg) TaskAgent(string? agentType, string? unitType, double? agentKg)
    {
        var kg = agentKg;
        if (kg == null && !string.IsNullOrWhiteSpace(unitType ?? agentType))
        {
            var m = System.Text.RegularExpressions.Regex.Match(unitType ?? agentType!, @"(\d+(?:\.\d+)?)\s*(kg|l|litre)",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (m.Success && double.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var v)) kg = v;
        }
        return (NormalizeAgentType(agentType, unitType), kg);
    }

    private static string RegisterNote(JobCard job, string? taskNotes)
    {
        var baseNote = $"Auto-recorded from job {job.JobNumber} — {job.Title}";
        return string.IsNullOrWhiteSpace(taskNotes) ? baseNote : $"{baseNote} — {taskNotes.Trim()}";
    }

    // Validates task lines without writing anything, so a bad line can be
// rejected before the job it belongs to is ever saved.
    private async Task<(string? Error, Dictionary<int, OpsEquipment> Equipment)> ValidateJobTasksAsync(
        int? customerId, JobCardStatus status, List<JobTaskIn>? incoming, JobCard? existing = null)
    {
        var equipmentById = new Dictionary<int, OpsEquipment>();
        if (incoming == null || incoming.Count == 0) return (null, equipmentById);

        if (incoming.Any(t => (t.TaskType ?? "").Trim().Equals(JobTaskTypes.StoreSupply, StringComparison.OrdinalIgnoreCase)) && !CanManageStores)
            return ("Your role cannot issue installation materials from Stores.", equipmentById);

        if (status is JobCardStatus.Completed or JobCardStatus.Closed
            && incoming.Any(t => (t.TaskType ?? "").Trim() is JobTaskTypes.Supply or JobTaskTypes.StoreSupply))
            return ("Stock cannot be issued once a job is completed or closed.", equipmentById);

        // Once stock has left either ledger, require that exact line to remain on the job.
        // This prevents editing/deleting a line from silently consuming stock twice.
        if (existing != null)
        {
            var applied = await _db.JobCardTasks.AsNoTracking()
                .Where(t => t.JobCardId == existing.Id && t.AppliedAt != null
                    && (t.TaskType == JobTaskTypes.Supply || t.TaskType == JobTaskTypes.StoreSupply))
                .ToListAsync();
            var requestedKeys = incoming.Where(t => t.TaskType == JobTaskTypes.Supply || t.TaskType == JobTaskTypes.StoreSupply)
                .Select(t => $"{t.TaskType}|{(t.TaskType == JobTaskTypes.StoreSupply ? t.StoreItemId : t.InventoryItemId)}|{t.Quantity ?? 1}")
                .ToList();
            foreach (var priorLine in applied)
            {
                var itemId = priorLine.TaskType == JobTaskTypes.StoreSupply ? priorLine.StoreItemId : priorLine.InventoryItemId;
                var key = $"{priorLine.TaskType}|{itemId}|{priorLine.Quantity}";
                var index = requestedKeys.IndexOf(key);
                if (index < 0) return ("An issued stock line cannot be removed or changed. Keep it on this job and record any return or correction in its stock section.", equipmentById);
                requestedKeys.RemoveAt(index);
            }
        }

        var wanted = new List<int>();
        foreach (var t in incoming)
        {
            if (!JobTaskTypes.IsValid(t.TaskType))
                return ($"Task type '{(t.TaskType ?? "").Trim()}' is invalid.", equipmentById);
            var qty = t.Quantity ?? 1;
            if (qty <= 0) return ("Task quantity must be greater than zero.", equipmentById);
            if (qty > 1000) return ("Task quantity must be 1000 or fewer.", equipmentById);
            wanted.AddRange(ParseEquipmentIds(t.EquipmentIds));
        }

        if (wanted.Count > 0)
        {
            var found = await _db.OpsEquipment.Where(e => wanted.Contains(e.Id)).ToListAsync();
            var missing = wanted.Except(found.Select(e => e.Id)).ToList();
            if (missing.Count > 0)
                return ($"Equipment ID {missing.First()} does not exist.", equipmentById);
            // Units on a task must belong to the job's customer so a job can
            // never record work against somebody else's extinguisher.
            if (customerId.HasValue)
            {
                var foreign = found.FirstOrDefault(e => e.CustomerId.HasValue && e.CustomerId.Value != customerId.Value);
                if (foreign != null)
                    return ($"Equipment {foreign.EquipmentNumber} does not belong to this customer.", equipmentById);
            }
            equipmentById = found.ToDictionary(e => e.Id);
        }

        // Require a real type before recording bulk work. This prevents a refill/service quantity from silently being mislabeled as ABC when the user meant CO2, DCP, foam, or another agent.
        foreach (var t in incoming.Where(t => !new[] { JobTaskTypes.Supply, JobTaskTypes.StoreSupply, JobTaskTypes.Assessment }.Contains((t.TaskType ?? "").Trim(), StringComparer.OrdinalIgnoreCase)))
        {
            var ids = ParseEquipmentIds(t.EquipmentIds);
            var hasAgentAndUnit = !string.IsNullOrWhiteSpace(t.AgentType) && !string.IsNullOrWhiteSpace(t.UnitType);
            var typeMissing = ids.Count == 0
                ? !hasAgentAndUnit
                : ids.Any(id => string.IsNullOrWhiteSpace(equipmentById.GetValueOrDefault(id)?.AgentType)) && !hasAgentAndUnit;
            if (typeMissing)
                return ($"The {t.TaskType} work line needs both an agent type and unit type. Enter both for bulk quantities or register the unit details on each selected unit.", equipmentById);
        }

        // Supply lines already issued on an earlier save don't consume stock
        // again, so only genuinely new lines are checked here.
        var reusable = existing == null ? new HashSet<string>()
            : (await _db.JobCardTasks.Where(x => x.JobCardId == existing.Id && (x.TaskType == JobTaskTypes.Supply || x.TaskType == JobTaskTypes.StoreSupply) && x.AppliedAt != null).ToListAsync())
                .Select(p => $"{(p.TaskType == JobTaskTypes.StoreSupply ? p.StoreItemId : p.InventoryItemId)}|{p.Quantity}").ToHashSet();
        var demand = new Dictionary<int, double>();
        foreach (var t in incoming.Where(t => (t.TaskType ?? "").Trim() == JobTaskTypes.Supply))
        {
            if (t.InventoryItemId is not int itemId)
                return ("A Supply line needs a stock item.", equipmentById);
            var qty = t.Quantity ?? 1;
            if (reusable.Contains($"{itemId}|{qty}")) continue;
            var item = await _db.InventoryItems.FindAsync(itemId);
            if (item == null) return ($"Inventory item ID {itemId} does not exist.", equipmentById);
            var alreadyOut = demand.TryGetValue(itemId, out var soFar) ? soFar : 0;
            if (item.CurrentStock - (alreadyOut + qty) < 0)
                return ($"Only {item.CurrentStock} in stock for {item.Name}.", equipmentById);
            demand[itemId] = alreadyOut + qty;
        }
        var reusableStore = existing == null ? new HashSet<string>()
            : (await _db.JobCardTasks.Where(x => x.JobCardId == existing.Id && x.TaskType == JobTaskTypes.StoreSupply && x.AppliedAt != null).ToListAsync())
                .Select(p => $"{p.StoreItemId}|{p.Quantity}").ToHashSet();
        var storeDemand = new Dictionary<int, int>();
        foreach (var t in incoming.Where(t => (t.TaskType ?? "").Trim() == JobTaskTypes.StoreSupply))
        {
            if (t.StoreItemId is not int itemId) return ("A Store supply line needs a Store item.", equipmentById);
            var qty = (int)(t.Quantity ?? 1);
            if (qty != t.Quantity) return ("Store issue quantity must be a whole number.", equipmentById);
            if (reusableStore.Contains($"{itemId}|{qty}")) continue;
            var item = await _db.StoreItems.FindAsync(itemId);
            if (item == null || item.Name.Contains("extinguisher", StringComparison.OrdinalIgnoreCase) || item.Category.Contains("extinguisher", StringComparison.OrdinalIgnoreCase))
                return ($"Store item ID {itemId} is unavailable in the installation-material Stores catalog.", equipmentById);
            var alreadyOut = storeDemand.GetValueOrDefault(itemId);
            if (item.CurrentStock - alreadyOut - qty < 0) return ($"Only {item.CurrentStock} {item.Unit} in Stores for {item.Name}.", equipmentById);
            storeDemand[itemId] = alreadyOut + qty;
        }
        return (null, equipmentById);
    }

    // Replaces the job's task lines and rebuilds every register row they own.
    // Only ever deletes register rows tagged with a JobTaskId, so rows staff
    // created by hand (JobTaskId null) are never touched.
    private async Task<(string? Error, List<JobCardTask>? Tasks)> SyncJobTasksAsync(JobCard job, List<JobTaskIn>? incoming)
    {
        if (incoming == null || incoming.Count == 0)
            return (null, new List<JobCardTask>());

        var (validationError, equipmentById) = await ValidateJobTasksAsync(job.CustomerId, job.Status, incoming, job);
        if (validationError != null) return (validationError, null);

        // A Supply line is one-shot. Any already-applied Supply line from a
        // previous save is carried forward untouched, so re-saving a job can
        // never deduct stock twice or register the same units again.
        var prior = await _db.JobCardTasks.Where(x => x.JobCardId == job.Id).ToListAsync();
        var priorAppliedSupply = prior.Where(p => (p.TaskType == JobTaskTypes.Supply || p.TaskType == JobTaskTypes.StoreSupply) && p.AppliedAt != null).ToList();
        var reusableSupply = new Dictionary<string, JobCardTask>();
        foreach (var p in priorAppliedSupply)
            reusableSupply[$"{(p.TaskType == JobTaskTypes.StoreSupply ? p.StoreItemId : p.InventoryItemId)}|{p.Quantity}"] = p;

        var carryOver = new List<JobCardTask>();
        var freshSupply = new List<(JobTaskIn In, JobCardTask Task)>();

        // ---- persist the task lines ----
        var now = DateTime.UtcNow;
        var saved = new List<JobCardTask>();
        var order = 0;
        var keepIds = new List<int>();
        foreach (var t in incoming)
        {
            var type = t.TaskType!.Trim();
            var equipmentIds = ParseEquipmentIds(t.EquipmentIds);
            // When work is tied to individual assets, the selected asset count
            // is authoritative. This prevents a line from claiming one unit
            // while writing several (or vice versa) to the operation registers.
            var qty = equipmentIds.Count > 0 ? equipmentIds.Count : t.Quantity ?? 1;
            // Preserve the extinguishers' agent details on the task when all
            // selected units share one type. Per-unit refill rows still fall
            // back to each asset below when a task contains mixed types.
            var selectedAgentTypes = equipmentIds
                .Select(id => equipmentById.GetValueOrDefault(id)?.AgentType?.Trim())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var inferredAgentType = selectedAgentTypes.Count == 1 ? NormalizeAgentType(selectedAgentTypes[0]) : null;
            var inferredUnitType = equipmentIds.Count == 0 ? null : EquipmentUnitType(equipmentById.GetValueOrDefault(equipmentIds[0]));
            if (equipmentIds.Count > 1)
            {
                var selectedUnitTypes = equipmentIds.Select(id => EquipmentUnitType(equipmentById.GetValueOrDefault(id))).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                if (selectedUnitTypes.Count != 1) inferredUnitType = null;
            }
            var (agent, kg) = TaskAgent(t.AgentType ?? inferredAgentType, t.UnitType ?? inferredUnitType, t.AgentAmountKg);
            var eqCsv = equipmentIds.Count > 0 ? string.Join(",", equipmentIds) : null;

            var stockItemKey = type == JobTaskTypes.StoreSupply ? $"{t.StoreItemId}|{qty}" : $"{t.InventoryItemId}|{qty}";
            if ((type == JobTaskTypes.Supply || type == JobTaskTypes.StoreSupply)
                && reusableSupply.TryGetValue(stockItemKey, out var already))
            {
                // Identical Supply line already issued: keep the original row
                // (and its equipment + movement) exactly as it is.
                already.SortOrder = order++;
                if (t.Notes != null) already.Notes = t.Notes;
                if (t.UnitPrice.HasValue) already.UnitPrice = t.UnitPrice;
                carryOver.Add(already);
                keepIds.Add(already.Id);
                saved.Add(already);
                continue;
            }

            var task = new JobCardTask
            {
                JobCardId = job.Id,
                TaskType = type,
                EquipmentIds = eqCsv,
                InventoryItemId = type == JobTaskTypes.Supply ? t.InventoryItemId : null,
                StoreItemId = type == JobTaskTypes.StoreSupply ? t.StoreItemId : null,
                StoreItemName = type == JobTaskTypes.StoreSupply && t.StoreItemId.HasValue
                    ? (await _db.StoreItems.AsNoTracking().Where(i => i.Id == t.StoreItemId.Value).Select(i => i.Name).FirstOrDefaultAsync()) : null,
                Quantity = qty,
                AgentType = agent,
                UnitType = t.UnitType ?? inferredUnitType,
                AgentAmountKg = kg,
                UnitPrice = t.UnitPrice,
                IsCompleted = t.IsCompleted ?? false,
                Notes = t.Notes,
                SortOrder = order++,
                CreatedAt = now,
            };
            _db.JobCardTasks.Add(task);
            saved.Add(task);
            if (type == JobTaskTypes.Supply || type == JobTaskTypes.StoreSupply) freshSupply.Add((t, task));
        }

        // Anything not carried forward is replaced. Register rows belonging to
        // the old generation are removed first; rows staff created by hand
        // (JobTaskId null) are never touched.
        var replaced = prior.Where(p => !keepIds.Contains(p.Id)).ToList();
        var replacedIds = replaced.Select(x => x.Id).ToList();
        if (replacedIds.Count > 0)
        {
            foreach (var r in await _db.OpsRefills.Where(x => x.JobTaskId != null && replacedIds.Contains(x.JobTaskId.Value)).ToListAsync())
                _db.OpsRefills.Remove(r);
            foreach (var r in await _db.OpsInspections.Where(x => x.JobTaskId != null && replacedIds.Contains(x.JobTaskId.Value)).ToListAsync())
                _db.OpsInspections.Remove(r);
            foreach (var r in await _db.OpsMaintenance.Where(x => x.JobTaskId != null && replacedIds.Contains(x.JobTaskId.Value)).ToListAsync())
                _db.OpsMaintenance.Remove(r);
        }
        _db.JobCardTasks.RemoveRange(replaced);
        await _db.SaveChangesAsync();

        // ---- stock headroom for genuinely new Supply lines ----
        var demand = new Dictionary<int, double>();
        foreach (var (t, _) in freshSupply)
        {
            if (t.TaskType == JobTaskTypes.StoreSupply) continue; // Store stock is checked against its own catalog below.
            if (t.InventoryItemId is not int itemId)
                return ("A Supply line needs a stock item.", null);
            var item = await _db.InventoryItems.FindAsync(itemId);
            if (item == null) return ($"Inventory item ID {itemId} does not exist.", null);
            var qty = t.Quantity ?? 1;
            var alreadyOut = demand.TryGetValue(itemId, out var soFar) ? soFar : 0;
            if (item.CurrentStock - (alreadyOut + qty) < 0)
                return ($"Only {item.CurrentStock} in stock for {item.Name}.", null);
            demand[itemId] = alreadyOut + qty;
        }

        // ---- fan out into the work registers ----
        var when = job.PlannedStart ?? now;
        var newEquipmentPending = new List<OpsEquipment>();
        var newInstallsPending = new List<OpsMaintenance>();
        foreach (var task in saved)
        {
            // A carried-forward Supply line was issued on an earlier save;
            // its units and stock movement must not be produced again.
            if ((task.TaskType == JobTaskTypes.Supply || task.TaskType == JobTaskTypes.StoreSupply) && task.AppliedAt != null) continue;
            var ids = ParseEquipmentIds(task.EquipmentIds);
            var cost = task.UnitPrice ?? job.QuotedAmount ?? 0;
            var note = RegisterNote(job, task.Notes);

            // Tracked units get one row each; bulk work stays one row with its task quantity.
            var rowCount = ids.Count > 0 ? ids.Count : 1;

            for (var i = 0; i < rowCount; i++)
            {
                var equipmentId = ids.Count > 0 ? ids[i] : (int?)null;
                if (task.TaskType == JobTaskTypes.Refill)
                {
                    var agent = task.AgentType
                        ?? NormalizeAgentType(equipmentId.HasValue ? equipmentById.GetValueOrDefault(equipmentId.Value)?.AgentType : null)
                        ?? string.Empty;
                    var kg = task.AgentAmountKg
                        ?? (equipmentId.HasValue ? TaskAgent(null, EquipmentUnitType(equipmentById.GetValueOrDefault(equipmentId.Value)), null).Kg : null)
                        ?? 0;
                    _db.OpsRefills.Add(new OpsRefill
                    {
                        JobId = job.Id, JobTaskId = task.Id, EquipmentId = equipmentId,
                        TechnicianId = job.AssignedTechnicianId, CustomerId = job.CustomerId, SiteId = job.SiteId,
                        RefillDate = when, AgentType = agent, AgentAmountKg = kg, Quantity = ids.Count > 0 ? 1 : (int)Math.Ceiling(task.Quantity),
                        Cost = ids.Count > 1 && rowCount > 1 ? cost / rowCount : cost, Notes = note,
                    });
                }
                else if (task.TaskType == JobTaskTypes.Inspection || task.TaskType == JobTaskTypes.Assessment)
                {
                    _db.OpsInspections.Add(new OpsInspection
                    {
                        JobId = job.Id, JobTaskId = task.Id, EquipmentId = equipmentId,
                        TechnicianId = job.AssignedTechnicianId, CustomerId = job.CustomerId, SiteId = job.SiteId,
                        InspectionDate = when, Result = task.IsCompleted ? "Pass" : "Scheduled", Quantity = ids.Count > 0 ? 1 : (int)Math.Ceiling(task.Quantity),
                        Cost = cost, Findings = note,
                    });
                }
                else if (task.TaskType is JobTaskTypes.Service or JobTaskTypes.Maintenance or JobTaskTypes.Installation)
                {
                    _db.OpsMaintenance.Add(new OpsMaintenance
                    {
                        JobId = job.Id, JobTaskId = task.Id, EquipmentId = equipmentId,
                        TechnicianId = job.AssignedTechnicianId, CustomerId = job.CustomerId, SiteId = job.SiteId,
                        WorkDate = when, WorkType = char.ToUpper(task.TaskType[0]) + task.TaskType[1..].ToLower(),
                        Quantity = ids.Count > 0 ? 1 : (int)Math.Ceiling(task.Quantity),
                        Cost = cost, Findings = note,
                    });
                }
            }

            if (task.TaskType == JobTaskTypes.StoreSupply)
            {
                var item = await _db.StoreItems.FindAsync(task.StoreItemId!.Value);
                if (item == null || item.CurrentStock < (int)task.Quantity)
                    return ($"Insufficient Stores stock for {item?.Name ?? "selected item"}.", null);
                item.CurrentStock -= (int)task.Quantity;
                var customer = job.CustomerId.HasValue ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == job.CustomerId.Value) : null;
                _db.StoreMovements.Add(new StoreMovement
                {
                    StoreItemId = item.Id, ItemName = item.Name, ItemCategory = item.Category, ItemUnit = item.Unit,
                    Type = "out", Qty = (int)task.Quantity, CustomerId = job.CustomerId, CustomerName = customer?.Name,
                    JobId = job.Id, JobNumber = job.JobNumber, Reference = task.Notes,
                    Notes = RegisterNote(job, task.Notes), UnitCost = item.UnitCost,
                    TotalCost = item.UnitCost * (decimal)task.Quantity, MovedBy = CurrentUser,
                    MovedAt = now, BalanceAfter = item.CurrentStock,
                });
                task.AppliedAt = now;
            }
            else if (task.TaskType == JobTaskTypes.Supply)
            {
                var item = await _db.InventoryItems.FindAsync(task.InventoryItemId!.Value);
                var qty = task.Quantity;
                item!.CurrentStock -= (int)qty;
                var customer = job.CustomerId.HasValue
                    ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == job.CustomerId.Value)
                    : null;
                _db.StockMovements.Add(new StockMovement
                {
                    InventoryItemId = item.Id, Type = "out", Source = "job", Qty = (decimal)qty,
                    CustomerId = job.CustomerId, CustomerName = customer?.Name,
                    JobId = job.Id, JobNumber = job.JobNumber,
                    Reference = task.Notes, Notes = $"{job.JobNumber} — supply",
                    MovedBy = CurrentUser, MovedAt = now, BalanceAfter = item.CurrentStock,
                });

                // A supplied unit is a real asset from this moment on, so it is
                // registered against the customer with a service interval set.
                var agent = task.UnitType ?? task.AgentType ?? item.Name;
                for (var i = 0; i < (int)qty; i++)
                {
                    var n = await NextSequenceValue("EquipmentNumberSequence");
                    var newEquipment = new OpsEquipment
                    {
                        EquipmentNumber = $"EQ-{n:D6}",
                        CustomerId = job.CustomerId,
                        SiteId = job.SiteId,
                        Name = item.Name,
                        Category = item.Category,
                        AgentType = agent,
                        ManufactureDate = now,
                        InstallationDate = task.IsCompleted ? (job.CompletedAt ?? now) : (DateTime?)null,
                        LastServiceDate = task.IsCompleted ? (job.CompletedAt ?? now) : (DateTime?)null,
                        NextServiceDue = task.IsCompleted ? (job.CompletedAt ?? now).AddMonths(6) : (DateTime?)null,
                        ConditionRating = 10,
                        LifeSpanMonths = 120,
                        ServiceIntervalMonths = 6,
                        Status = "In Service",
                        CreatedAt = now,
                    };
                    _db.OpsEquipment.Add(newEquipment);
                    newEquipmentPending.Add(newEquipment);

                    var installRow = new OpsMaintenance
                    {
                        JobId = job.Id, JobTaskId = task.Id, EquipmentId = null,
                        TechnicianId = job.AssignedTechnicianId, CustomerId = job.CustomerId, SiteId = job.SiteId,
                        WorkDate = when, WorkType = "Installation", Cost = cost,
                        Findings = $"{RegisterNote(job, task.Notes)} — supplied from stock {item.Name}",
                    };
                    _db.OpsMaintenance.Add(installRow);
                    newInstallsPending.Add(installRow);
                }
                // Stamp the line so this exact issue never runs again.
                task.AppliedAt = now;
            }
        }
        await _db.SaveChangesAsync();

        // New equipment only receives its identity key on save, so the Installation
        // rows created for supplied units are bound to the real assets once the keys
        // exist. Only supply-created rows are bound — a bulk Installation line with no
        // tracked unit must keep EquipmentId null.
        for (var i = 0; i < newInstallsPending.Count && i < newEquipmentPending.Count; i++)
            newInstallsPending[i].EquipmentId = newEquipmentPending[i].Id;
        if (newInstallsPending.Count > 0)
            await _db.SaveChangesAsync();

        // ---- legacy single-unit fields become a summary of the tasks ----
        ApplyTaskSummaryToJob(job, saved);
        await _db.SaveChangesAsync();
        return (null, saved);
    }

    // Keeps the original JobCard fields meaningful when task lines exist, so
    // every existing screen and report that reads them keeps working.
    private static void ApplyTaskSummaryToJob(JobCard job, List<JobCardTask> tasks)
    {
        var work = tasks.Where(t => t.TaskType != JobTaskTypes.Supply && t.TaskType != JobTaskTypes.StoreSupply).ToList();
        var totalUnits = (int)Math.Ceiling(tasks.Sum(t => t.Quantity));
        job.UnitCount = Math.Max(1, totalUnits);

        var primary = work.FirstOrDefault();
        if (primary != null && !string.IsNullOrWhiteSpace(primary.TaskType))
            job.JobType = primary.TaskType;
        else if (tasks.Count > 0)
            job.JobType = JobTaskTypes.Supply;

        var withAgent = work.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t.AgentType));
        if (withAgent != null) { job.AgentType = withAgent.AgentType; job.AgentAmountKg = withAgent.AgentAmountKg; }

        if (!job.EquipmentId.HasValue)
        {
            var ids = tasks.SelectMany(t => ParseEquipmentIds(t.EquipmentIds)).Distinct().ToList();
            if (ids.Count > 0) job.EquipmentId = ids[0];
        }

        if (tasks.Any(t => (t.TaskType == JobTaskTypes.Supply || t.TaskType == JobTaskTypes.StoreSupply) && t.UnitPrice.HasValue))
            job.QuotedAmount = tasks.Where(t => t.TaskType == JobTaskTypes.Supply || t.TaskType == JobTaskTypes.StoreSupply)
                                    .Sum(t => (t.UnitPrice ?? 0) * (decimal)t.Quantity);
    }

    // When a job completes, stamps the work register dates and rolls the
    // service dates of every unit named on a task line.
    private async Task SyncJobTasksCompletionAsync(JobCard job, DateTime done)
    {
        var tasks = await _db.JobCardTasks.Where(t => t.JobCardId == job.Id).ToListAsync();
        foreach (var t in tasks)
        {
            var ids = ParseEquipmentIds(t.EquipmentIds);
            if (ids.Count == 0) continue;
            var units = await _db.OpsEquipment.Where(e => ids.Contains(e.Id)).ToListAsync();
            foreach (var eq in units)
            {
                if (t.TaskType == JobTaskTypes.Inspection || t.TaskType == JobTaskTypes.Assessment)
                {
                    eq.LastInspectionDate = done;
                    eq.NextServiceDue = done.AddMonths(ServiceIntervalFor(eq));
                }
                else
                {
                    eq.LastServiceDate = done;
                    eq.NextServiceDue = done.AddMonths(ServiceIntervalFor(eq));
                }
            }
        }
        await _db.SaveChangesAsync();
    }

    private static object ShapeTaskRow(JobCardTask t) => new
    {
        t.Id, t.JobCardId, t.TaskType, t.EquipmentIds, t.InventoryItemId, t.StoreItemId, t.StoreItemName, t.Quantity,
        t.AgentType, t.UnitType, t.AgentAmountKg, t.UnitPrice, t.IsCompleted, t.Notes, t.SortOrder,
        EquipmentIdList = ParseEquipmentIds(t.EquipmentIds),
        LineValue = t.UnitPrice.HasValue ? t.UnitPrice.Value * (decimal)t.Quantity : (decimal?)null,
    };

    private async Task<List<object>> ShapeJobTasksAsync(int jobId) =>
        (await _db.JobCardTasks.AsNoTracking().Where(t => t.JobCardId == jobId)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Id).ToListAsync()).Select(ShapeTaskRow).ToList();

    private async Task<object> ShapeJobAsync(int jobId)    {
        var j = await _db.JobCards.AsNoTracking().FirstAsync(x => x.Id == jobId);
        var techName = j.AssignedTechnicianId.HasValue
            ? (await _db.Technicians.AsNoTracking().FirstOrDefaultAsync(t => t.Id == j.AssignedTechnicianId.Value))?.Name
            : null;
        var cust = j.CustomerId.HasValue
            ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == j.CustomerId.Value)
            : null;
        var eq = j.EquipmentId.HasValue
            ? await _db.OpsEquipment.AsNoTracking().FirstOrDefaultAsync(e => e.Id == j.EquipmentId.Value)
            : null;
        var site = j.SiteId.HasValue
            ? await _db.CustomerSites.AsNoTracking().FirstOrDefaultAsync(s => s.Id == j.SiteId.Value)
            : null;
        var srcQuote = await _db.OpsQuotations.AsNoTracking().FirstOrDefaultAsync(q => q.ConvertedJobId == j.Id);
        return new
        {
            j.Id, j.JobNumber, j.CustomerId, j.SiteId, j.EquipmentId, j.AgentType, j.AgentAmountKg, j.UnitCount, j.JobType, j.Title, j.Description,
            Status = j.Status.ToString(), Priority = j.Priority.ToString(),
            TechnicianId = j.AssignedTechnicianId,
            AssignedTechnicianId = j.AssignedTechnicianId,
            TechnicianName = techName,
            AssignedTechnicianName = techName,
            CustomerNumber = cust != null ? cust.CustomerId : null,
            CustomerName = cust != null ? cust.Name : null,
            CustomerPhone = cust?.Phone,
            CustomerWhatsApp = cust?.WhatsApp,
            CustomerEmail = cust?.Email,
            EquipmentNumber = eq != null ? eq.EquipmentNumber : null,
            EquipmentName = eq != null ? eq.Name : null,
            AgentTypeName = eq != null ? eq.AgentType : j.AgentType,
            SiteName = site != null ? site.Name : null,
            SourceQuotationId = srcQuote != null ? srcQuote.Id : (int?)null,
            SourceQuotationNumber = srcQuote != null ? srcQuote.QuotationNumber : null,
            j.PlannedStart, j.PlannedEnd, j.CompletedAt,
            DateEnded = j.CompletedAt ?? j.PlannedEnd,
            j.EstimatedHours, j.RequiredSkills, j.RequiredCertifications,
            j.QuotedAmount, j.Notes, j.CreatedAt,
            j.Address, j.Email, j.NextServiceDate, j.WorksDoneSatisfactorily,
            Tasks = await ShapeJobTasksAsync(jobId),
        };
    }

    [HttpDelete("jobs/{id:int}")]
    public async Task<IActionResult> DeleteJob(int id)
    {
        if (!IsAdmin) return Denied();
        var job = await _db.JobCards.FindAsync(id);
        if (job is null) return NotFound();
        var jobNumber = job.JobNumber;
        var jobTitle = job.Title;
        var customerId = job.CustomerId;
        var deletedBy = CurrentUser;
        var deletedAt = DateTime.UtcNow;
        // Permanent accountability: who deleted which job card and when.
        if (customerId.HasValue)
            _db.CustomerActivities.Add(new CustomerActivity
            {
                CustomerId = customerId.Value,
                Action = "Job card deleted",
                Details = $"{jobNumber} — {jobTitle} deleted by {deletedBy} at {deletedAt:yyyy-MM-dd HH:mm} UTC",
                Actor = deletedBy,
                CreatedAt = deletedAt,
            });
        _db.JobCards.Remove(job);
        await _db.SaveChangesAsync();
        return Ok(new { jobNumber, deletedBy, deletedAt });
    }

    // ---------- equipment ----------

    [HttpGet("equipment")]
    public async Task<IActionResult> GetEquipment()
    {
        var customers = (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id);
        var sites = (await _db.CustomerSites.AsNoTracking().ToListAsync()).ToDictionary(s => s.Id);
        var list = await _db.OpsEquipment.AsNoTracking().OrderBy(e => e.EquipmentNumber).ToListAsync();
        return Ok(list.Select(e => new
        {
            e.Id, e.EquipmentNumber, e.CustomerId, e.SiteId, e.Name, e.Category, e.Model, e.Make, e.SerialNumber,
            e.AgentType, e.ManufactureDate, e.InstallationDate, e.LastInspectionDate, e.LastServiceDate, e.NextServiceDue,
            e.ConditionRating, e.LifeSpanMonths, e.ServiceIntervalMonths, e.Status, e.Latitude, e.Longitude, e.CreatedAt,
            CustomerNumber = e.CustomerId.HasValue && customers.TryGetValue(e.CustomerId.Value, out var c) ? c.CustomerId : null,
            CustomerName = e.CustomerId.HasValue && customers.TryGetValue(e.CustomerId.Value, out var c2) ? c2.Name : null,
            SiteName = e.SiteId.HasValue && sites.TryGetValue(e.SiteId.Value, out var s) ? s.Name : null,
        }));
    }

    [HttpPost("equipment")]
    public async Task<IActionResult> CreateEquipment([FromBody] EquipmentIn dto)
    {
        if (!CanOpsWrite) return Denied();
        if (string.IsNullOrWhiteSpace(dto.Name) && string.IsNullOrWhiteSpace(dto.EquipmentNumber))
            return BadRequest(new { message = "Equipment name is required." });
        var equipmentNumber = dto.EquipmentNumber;
        var generatedNumber = 0L;
        if (string.IsNullOrWhiteSpace(equipmentNumber))
        {
                generatedNumber = await NextSequenceValue("EquipmentNumberSequence");
            equipmentNumber = $"EQ-{generatedNumber:D6}";
        }
        var category = dto.Category ?? "Extinguisher";
        var isExtinguisher = category.Contains("extinguisher", StringComparison.OrdinalIgnoreCase)
            || (dto.Name ?? "").Contains("extinguisher", StringComparison.OrdinalIgnoreCase);
        var serviceIntervalMonths = dto.ServiceIntervalMonths ?? (isExtinguisher ? 6 : 12);
        var serviceAnchor = dto.LastServiceDate ?? dto.LastInspectionDate ?? dto.InstallationDate ?? DateTime.UtcNow;
        var nextServiceDue = dto.NextServiceDue ?? (isExtinguisher ? serviceAnchor.AddMonths(6) : null);
        var e = new OpsEquipment
        {
            EquipmentNumber = equipmentNumber,
            CustomerId = dto.CustomerId, SiteId = dto.SiteId,
            Name = dto.Name ?? equipmentNumber!,
            Category = category,
            Model = dto.Model ?? "", Make = dto.Make ?? "",
            SerialNumber = dto.SerialNumber, AgentType = dto.AgentType,
            ManufactureDate = dto.ManufactureDate, InstallationDate = dto.InstallationDate,
            LastInspectionDate = dto.LastInspectionDate, LastServiceDate = dto.LastServiceDate, NextServiceDue = nextServiceDue,
            ConditionRating = dto.ConditionRating ?? 10,
            LifeSpanMonths = dto.LifeSpanMonths ?? 120,
            ServiceIntervalMonths = serviceIntervalMonths,
            Status = dto.Status ?? "In Service",
            Latitude = dto.Latitude, Longitude = dto.Longitude,
        };
        _db.OpsEquipment.Add(e);
        await _db.SaveChangesAsync();
        return Ok(e);
    }

    [HttpPut("equipment/{id:int}")]
    public async Task<IActionResult> UpdateEquipment(int id, [FromBody] EquipmentIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var e = await _db.OpsEquipment.FindAsync(id);
        if (e is null) return NotFound();
        if (dto.EquipmentNumber != null) e.EquipmentNumber = dto.EquipmentNumber;
        if (dto.CustomerId != null) e.CustomerId = dto.CustomerId;
        if (dto.SiteId != null) e.SiteId = dto.SiteId;
        if (dto.Name != null) e.Name = dto.Name;
        if (dto.Category != null) e.Category = dto.Category;
        if (dto.Model != null) e.Model = dto.Model;
        if (dto.Make != null) e.Make = dto.Make;
        if (dto.SerialNumber != null) e.SerialNumber = dto.SerialNumber;
        if (dto.AgentType != null) e.AgentType = dto.AgentType;
        if (dto.ManufactureDate != null) e.ManufactureDate = dto.ManufactureDate;
        if (dto.InstallationDate != null) e.InstallationDate = dto.InstallationDate;
        if (dto.LastInspectionDate != null) e.LastInspectionDate = dto.LastInspectionDate;
        if (dto.LastServiceDate != null) e.LastServiceDate = dto.LastServiceDate;
        if (dto.NextServiceDue != null) e.NextServiceDue = dto.NextServiceDue;
        if (dto.ConditionRating != null) e.ConditionRating = dto.ConditionRating.Value;
        if (dto.LifeSpanMonths != null) e.LifeSpanMonths = dto.LifeSpanMonths.Value;
        if (dto.ServiceIntervalMonths != null) e.ServiceIntervalMonths = dto.ServiceIntervalMonths.Value;
        if (dto.Status != null) e.Status = dto.Status;
        if (dto.Latitude != null) e.Latitude = dto.Latitude;
        if (dto.Longitude != null) e.Longitude = dto.Longitude;
        await _db.SaveChangesAsync();
        return Ok(e);
    }

    [HttpDelete("equipment/{id:int}")]
    public async Task<IActionResult> DeleteEquipment(int id)
    {
        if (!IsAdmin) return Denied();
        var e = await _db.OpsEquipment.FindAsync(id);
        if (e is null) return NotFound();
        _db.OpsEquipment.Remove(e);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------- inventory ----------

    [HttpGet("inventory")]
    public async Task<IActionResult> GetInventory() =>
        Ok(await _db.InventoryItems.AsNoTracking().OrderBy(i => i.Name)
            .Select(i => new { i.Id, i.Name, i.Category, i.CurrentStock, i.ReorderLevel, i.UnitCost, i.Unit, i.LeadTimeDays, i.MonthlyUsage })
            .ToListAsync());

    [HttpPost("inventory")]
    public async Task<IActionResult> CreateInventoryItem([FromBody] InventoryIn dto)
    {
        if (!CanOpsWrite) return Denied();
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { message = "Item name is required." });
        var item = new InventoryItem
        {
            Name = dto.Name!.Trim(),
            Category = dto.Category ?? "",
            CurrentStock = dto.CurrentStock ?? 0,
            ReorderLevel = dto.ReorderLevel ?? 0,
            UnitCost = dto.UnitCost ?? 0,
            Unit = dto.Unit,
            LeadTimeDays = dto.LeadTimeDays ?? 7,
            MonthlyUsage = dto.MonthlyUsage ?? "",
        };
        _db.InventoryItems.Add(item);
        await _db.SaveChangesAsync();
        return Ok(item);
    }

    [HttpPut("inventory/{id:int}")]
    public async Task<IActionResult> UpdateInventoryItem(int id, [FromBody] InventoryIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var item = await _db.InventoryItems.FindAsync(id);
        if (item is null) return NotFound();
        if (dto.Name != null) item.Name = dto.Name;
        if (dto.Category != null) item.Category = dto.Category;
        if (dto.CurrentStock != null) item.CurrentStock = dto.CurrentStock.Value;
        if (dto.ReorderLevel != null) item.ReorderLevel = dto.ReorderLevel.Value;
        if (dto.UnitCost != null) item.UnitCost = dto.UnitCost.Value;
        if (dto.Unit != null) item.Unit = dto.Unit;
        if (dto.LeadTimeDays != null) item.LeadTimeDays = dto.LeadTimeDays.Value;
        if (dto.MonthlyUsage != null) item.MonthlyUsage = dto.MonthlyUsage;
        await _db.SaveChangesAsync();
        return Ok(item);
    }

    [HttpPost("inventory/{id:int}/adjust")]
    public async Task<IActionResult> AdjustStock(int id, [FromBody] AdjustIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var item = await _db.InventoryItems.FindAsync(id);
        if (item is null) return NotFound();
        item.CurrentStock = Math.Max(0, item.CurrentStock + (dto.Change ?? 0));
        await _db.SaveChangesAsync();
        return Ok(new { item.Id, item.CurrentStock });
    }

    // Admin-only: remove a stock item entirely (movements go with it).
    // Recorded on the response so the deleter is always accountable.
    [HttpDelete("inventory/{id:int}")]
    public async Task<IActionResult> DeleteInventoryItem(int id)
    {
        if (!IsAdmin) return Denied();
        var item = await _db.InventoryItems.FindAsync(id);
        if (item is null) return NotFound();
        var name = item.Name;
        var deletedBy = CurrentUser;
        var deletedAt = DateTime.UtcNow;
        var moves = await _db.StockMovements.Where(m => m.InventoryItemId == id).ToListAsync();
        _db.StockMovements.RemoveRange(moves);
        _db.InventoryItems.Remove(item);
        await _db.SaveChangesAsync();
        return Ok(new { id, name, deletedBy, deletedAt });
    }

    // Store catalog is separate from Inventory because this store holds installation equipment and materials.
    [HttpGet("store-items")]
    public async Task<IActionResult> GetStoreItems()
    {
        return Ok(await _db.StoreItems.AsNoTracking()
            .Where(x => !x.Name.ToLower().Contains("extinguisher") && !x.Category.ToLower().Contains("extinguisher"))
            .OrderBy(x => x.Category).ThenBy(x => x.Name)
            .Select(x => new { x.Id, x.Name, x.Category, x.Unit, x.CurrentStock, x.UnitCost })
            .ToListAsync());
    }

    // Store receives and issues affect StoreItems only; extinguisher Inventory remains independent.
    [HttpGet("store-ledger")]
    public async Task<IActionResult> GetStoreLedger()
    {
        return Ok(await _db.StoreMovements.AsNoTracking()
            .OrderByDescending(m => m.MovedAt).ThenByDescending(m => m.Id)
            .Select(m => new
            {
                m.Id, m.StoreItemId, m.ItemName, m.ItemCategory, m.ItemUnit,
                m.Type, Source = "store", m.Qty, m.CustomerId, m.CustomerName, m.JobId, m.JobNumber,
                m.Reference, m.Supplier, m.ReceiptNumber, m.UnitCost, m.TotalCost,
                m.Notes, m.MovedBy, m.MovedAt, m.BalanceAfter,
                HasDocument = m.DocumentPath != null, m.DocumentName, m.DocumentSizeBytes,
            })
            .ToListAsync());
    }

    [HttpPost("store-ledger")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> CreateStoreMovement([FromForm] StoreMovementIn dto)
    {
        if (!CanManageStores) return Denied();
        var type = (dto.Type ?? "").Trim().ToLowerInvariant();
        if (type is not ("receipt" or "issue"))
            return BadRequest(new { message = "Choose Receipt or Issue." });
        if (dto.Qty <= 0 || dto.Qty != decimal.Truncate(dto.Qty))
            return BadRequest(new { message = "Quantity must be a positive whole number." });
        if (dto.UnitCost < 0) return BadRequest(new { message = "Unit cost cannot be negative." });
        var isReceipt = type == "receipt";
        if (!dto.StoreItemId.HasValue && !isReceipt)
            return BadRequest(new { message = "Select an existing Store item to issue." });
        if (!dto.StoreItemId.HasValue && (string.IsNullOrWhiteSpace(dto.ItemName)
            || string.IsNullOrWhiteSpace(dto.ItemCategory) || string.IsNullOrWhiteSpace(dto.ItemUnit)))
            return BadRequest(new { message = "For a new receipt item, enter its name, category, and unit." });
        if (!string.IsNullOrWhiteSpace(dto.ItemName) && dto.ItemName.Length > 255)
            return BadRequest(new { message = "Item name must be 255 characters or fewer." });
        if (!string.IsNullOrWhiteSpace(dto.ItemCategory) && dto.ItemCategory.Length > 100)
            return BadRequest(new { message = "Item category must be 100 characters or fewer." });
        if (!string.IsNullOrWhiteSpace(dto.ItemUnit) && dto.ItemUnit.Length > 50)
            return BadRequest(new { message = "Item unit must be 50 characters or fewer." });
        if (!dto.StoreItemId.HasValue && ((dto.ItemName ?? "").Contains("extinguisher", StringComparison.OrdinalIgnoreCase)
            || (dto.ItemCategory ?? "").Contains("extinguisher", StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new { message = "Extinguishers are managed in Inventory and cannot be added to Stores." });

        JobCard? job = null;
        if (dto.JobId.HasValue)
        {
            job = await _db.JobCards.FindAsync(dto.JobId.Value);
            if (job is null) return BadRequest(new { message = "The linked job could not be found." });
        }
        var customerId = dto.CustomerId ?? job?.CustomerId;
        if (dto.CustomerId.HasValue && job?.CustomerId.HasValue == true && dto.CustomerId != job.CustomerId)
            return BadRequest(new { message = "The selected customer does not match the linked job." });
        Customer? customer = customerId.HasValue
            ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId.Value)
            : null;
        if (customerId.HasValue && customer is null)
            return BadRequest(new { message = "The selected customer could not be found." });

        var file = dto.Document;
        var safeFileName = (string?)null;
        var privatePath = (string?)null;
        var contentType = (string?)null;
        if (file is { Length: > 0 })
        {
            if (file.Length > 8 * 1024 * 1024)
                return BadRequest(new { message = "Receipt files must be 8 MB or smaller." });
            contentType = await GetReceiptContentTypeAsync(file);
            if (contentType is null)
                return BadRequest(new { message = "Upload a valid PDF, JPG, PNG, or WebP receipt." });
            safeFileName = Path.GetFileName(file.FileName);
            privatePath = $"{Guid.NewGuid():N}{Path.GetExtension(safeFileName).ToLowerInvariant()}";
        }

        var qty = (int)dto.Qty;
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        StoreItem? item;
        if (dto.StoreItemId.HasValue)
        {
            item = await _db.StoreItems.FirstOrDefaultAsync(x => x.Id == dto.StoreItemId.Value);
            if (item is null) return BadRequest(new { message = "The selected Store item no longer exists." });
            if (item.Name.Contains("extinguisher", StringComparison.OrdinalIgnoreCase)
                || item.Category.Contains("extinguisher", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Extinguishers are managed in Inventory and cannot be received or issued from Stores." });
            if (!isReceipt && qty > item.CurrentStock)
                return BadRequest(new { message = $"Only {item.CurrentStock} {item.Unit} are in Stores." });
        }
        else
        {
            var itemName = dto.ItemName!.Trim();
            var category = dto.ItemCategory!.Trim();
            var unit = dto.ItemUnit!.Trim();
            var duplicate = await _db.StoreItems.AnyAsync(x => x.Name.ToLower() == itemName.ToLower()
                && x.Category.ToLower() == category.ToLower() && x.Unit.ToLower() == unit.ToLower());
            if (duplicate)
                return BadRequest(new { message = "This Store item already exists. Select it from the item list instead of creating a duplicate." });
            item = new StoreItem { Name = itemName, Category = category, Unit = unit };
            _db.StoreItems.Add(item);
        }
        if (isReceipt && dto.UnitCost > 0) item.UnitCost = dto.UnitCost;
        item.CurrentStock += isReceipt ? qty : -qty;
        try
        {
            await _db.SaveChangesAsync(); // Assigns a new Store item ID inside the stock transaction.
            if (file is { Length: > 0 } && privatePath is not null)
            {
                var directory = Path.Combine(_env.ContentRootPath, "PrivateStoreDocuments");
                Directory.CreateDirectory(directory);
                await using var output = System.IO.File.Create(Path.Combine(directory, privatePath));
                await file.CopyToAsync(output);
            }
        }
        catch
        {
            if (privatePath is not null)
            {
                var savedFile = Path.Combine(_env.ContentRootPath, "PrivateStoreDocuments", privatePath);
                if (System.IO.File.Exists(savedFile)) System.IO.File.Delete(savedFile);
            }
            await transaction.RollbackAsync();
            throw;
        }
        // Store movements live in their own ledger and never write Inventory stock.
        var storeMovement = new StoreMovement
        {
            StoreItemId = item.Id,
            ItemName = item.Name,
            ItemCategory = item.Category,
            ItemUnit = item.Unit,
            Type = isReceipt ? "in" : "out",
            Qty = qty,
            CustomerId = customer?.Id,
            CustomerName = customer?.Name,
            JobId = job?.Id,
            JobNumber = job?.JobNumber,
            Reference = dto.Reference?.Trim(),
            Supplier = isReceipt ? dto.Supplier?.Trim() : null,
            ReceiptNumber = isReceipt ? dto.ReceiptNumber?.Trim() : null,
            UnitCost = isReceipt ? dto.UnitCost : null,
            TotalCost = isReceipt ? dto.UnitCost * qty : null,
            Notes = dto.Notes?.Trim(),
            MovedBy = CurrentUser,
            MovedAt = dto.MovedAt.HasValue ? DateTime.SpecifyKind(dto.MovedAt.Value.Date, DateTimeKind.Utc) : DateTime.UtcNow,
            BalanceAfter = item.CurrentStock,
            DocumentName = safeFileName,
            DocumentPath = privatePath,
            DocumentContentType = contentType,
            DocumentSizeBytes = file is { Length: > 0 } ? file.Length : null,
        };
        _db.StoreMovements.Add(storeMovement);
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            if (privatePath is not null)
            {
                var savedFile = Path.Combine(_env.ContentRootPath, "PrivateStoreDocuments", privatePath);
                if (System.IO.File.Exists(savedFile)) System.IO.File.Delete(savedFile);
            }
            throw;
        }
        return Ok(new { storeMovement.Id, storeMovement.StoreItemId, storeMovement.Type, storeMovement.Qty, storeMovement.BalanceAfter, storeMovement.MovedAt });
    }

    [HttpGet("store-ledger/{id:int}/document")]
    public async Task<IActionResult> DownloadStoreDocument(int id)
    {
        var movement = await _db.StoreMovements.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id);
        if (movement?.DocumentPath is null || movement.DocumentName is null) return NotFound();
        var directory = Path.GetFullPath(Path.Combine(_env.ContentRootPath, "PrivateStoreDocuments"));
        var fullPath = Path.GetFullPath(Path.Combine(directory, Path.GetFileName(movement.DocumentPath)));
        if (!fullPath.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || !System.IO.File.Exists(fullPath)) return NotFound();
        return PhysicalFile(fullPath, movement.DocumentContentType ?? "application/octet-stream", movement.DocumentName);
    }

    private static async Task<string?> GetReceiptContentTypeAsync(IFormFile file)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var expected = extension switch
        {
            ".pdf" => "application/pdf",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => null,
        };
        if (expected is null) return null;
        var signature = new byte[Math.Min((int)file.Length, 12)];
        await using var input = file.OpenReadStream();
        var read = await input.ReadAsync(signature, 0, signature.Length);
        var valid = expected switch
        {
            "application/pdf" => read >= 5 && signature.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            "image/jpeg" => read >= 3 && signature[0] == 0xff && signature[1] == 0xd8 && signature[2] == 0xff,
            "image/png" => read >= 8 && signature.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/webp" => read >= 12 && signature.AsSpan(0, 4).SequenceEqual("RIFF"u8) && signature.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            _ => false,
        };
        return valid ? expected : null;
    }

    public sealed class StoreMovementIn
    {
        public string? Type { get; set; }
        public int? StoreItemId { get; set; }
        public string? ItemName { get; set; }
        public string? ItemCategory { get; set; }
        public string? ItemUnit { get; set; }
        public decimal Qty { get; set; }
        public decimal UnitCost { get; set; }
        public string? Supplier { get; set; }
        public string? ReceiptNumber { get; set; }
        public string? Reference { get; set; }
        public int? CustomerId { get; set; }
        public int? JobId { get; set; }
        public DateTime? MovedAt { get; set; }
        public string? Notes { get; set; }
        public IFormFile? Document { get; set; }
    }

    [HttpGet("inventory/movements")]
    public async Task<IActionResult> GetAllStockMovements([FromQuery] int? itemId)
    {
        var q = _db.StockMovements.AsNoTracking().AsQueryable();
        if (itemId.HasValue) q = q.Where(m => m.InventoryItemId == itemId.Value);
        return Ok(await q.OrderByDescending(m => m.MovedAt).ThenByDescending(m => m.Id)
            .Select(m => new
            {
                m.Id, m.InventoryItemId, m.Type, m.Source, m.Qty,
                m.CustomerId, m.CustomerName, m.JobId, m.JobNumber,
                m.Reference, m.Notes, m.MovedBy, m.MovedAt, m.BalanceAfter,
            })
            .ToListAsync());
    }

    [HttpGet("inventory/{id:int}/movements")]
    public async Task<IActionResult> GetStockMovements(int id)
    {
        if (!await _db.InventoryItems.AnyAsync(i => i.Id == id)) return NotFound();
        return Ok(await _db.StockMovements.AsNoTracking()
            .Where(m => m.InventoryItemId == id)
            .OrderByDescending(m => m.MovedAt).ThenByDescending(m => m.Id)
            .Select(m => new
            {
                m.Id, m.InventoryItemId, m.Type, m.Source, m.Qty,
                m.CustomerId, m.CustomerName, m.JobId, m.JobNumber,
                m.Reference, m.Notes, m.MovedBy, m.MovedAt, m.BalanceAfter,
            })
            .ToListAsync());
    }


    [HttpPost("inventory/{id:int}/receive")]
    public async Task<IActionResult> ReceiveStock(int id, [FromBody] StockMovementIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var item = await _db.InventoryItems.FindAsync(id);
        if (item is null) return NotFound();
        var qty = dto.Qty ?? 0;
        if (qty <= 0) return BadRequest(new { message = "Quantity must be greater than zero." });
        JobCard? job = null;
        if (dto.JobId.HasValue)
        {
            job = await _db.JobCards.FindAsync(dto.JobId.Value);
            if (job is null) return BadRequest(new { message = $"Job ID {dto.JobId.Value} does not exist." });
        }
        Customer? customer = null;
        var customerId = dto.CustomerId ?? job?.CustomerId;
        if (customerId.HasValue)
            customer = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId.Value);
        item.CurrentStock += (int)qty;
        _db.StockMovements.Add(new StockMovement
        {
            InventoryItemId = id, Type = "in", Source = "manual", Qty = qty,
            CustomerId = customerId, CustomerName = customer?.Name, JobId = dto.JobId,
            JobNumber = job?.JobNumber, Reference = dto.Reference, Notes = dto.Notes,
            MovedBy = CurrentUser, MovedAt = DateTime.UtcNow, BalanceAfter = item.CurrentStock,
        });
        await _db.SaveChangesAsync();
        return Ok(new { item.Id, item.CurrentStock });
    }

    [HttpPost("inventory/{id:int}/issue")]
    public async Task<IActionResult> IssueStock(int id, [FromBody] StockMovementIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var item = await _db.InventoryItems.FindAsync(id);
        if (item is null) return NotFound();
        var qty = dto.Qty ?? 0;
        if (qty <= 0) return BadRequest(new { message = "Quantity must be greater than zero." });
        if (qty > item.CurrentStock) return BadRequest(new { message = $"Only {item.CurrentStock} in stock." });
        JobCard? job = null;
        if (dto.JobId.HasValue)
        {
            job = await _db.JobCards.FindAsync(dto.JobId.Value);
            if (job is null) return BadRequest(new { message = $"Job ID {dto.JobId.Value} does not exist." });
        }
        Customer? customer = null;
        var customerId = dto.CustomerId ?? job?.CustomerId;
        if (customerId.HasValue)
            customer = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId.Value);
        item.CurrentStock -= (int)qty;
        _db.StockMovements.Add(new StockMovement
        {
            InventoryItemId = id, Type = "out", Source = dto.JobId != null ? "job" : "manual", Qty = qty,
            CustomerId = customerId, CustomerName = customer?.Name, JobId = dto.JobId,
            JobNumber = job?.JobNumber, Reference = dto.Reference, Notes = dto.Notes,
            MovedBy = CurrentUser, MovedAt = DateTime.UtcNow, BalanceAfter = item.CurrentStock,
        });
        if (job != null)
        {
            var line = $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm}] Used {(int)qty}x {item.Name} from stock (balance {item.CurrentStock})";
            if (!string.IsNullOrWhiteSpace(dto.Reference)) line += $" — ref {dto.Reference!.Trim()}";
            if (!string.IsNullOrWhiteSpace(dto.Notes)) line += $" — {dto.Notes!.Trim()}";
            job.Notes = string.IsNullOrWhiteSpace(job.Notes) ? line : $"{job.Notes}\n{line}";
        }
        await _db.SaveChangesAsync();
        return Ok(new { item.Id, item.CurrentStock });
    }

    public record StockMovementIn(decimal? Qty, int? CustomerId, int? JobId, string? Reference, string? Notes);
    public record AdjustIn(int? Change);

    // ---------- work records ----------

    // Shared lookups so every work register carries readable names
    // (customer, equipment, technician, job) for the Services page.
    private async Task<(Dictionary<int, string> Techs, Dictionary<int, Customer> Customers,
        Dictionary<int, OpsEquipment> Equipment, Dictionary<int, string> JobNumbers)> WorkLookupsAsync() =>
    (
        (await _db.Technicians.AsNoTracking().ToListAsync()).ToDictionary(t => t.Id, t => t.Name),
        (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id),
        (await _db.OpsEquipment.AsNoTracking().ToListAsync()).ToDictionary(e => e.Id),
        (await _db.JobCards.AsNoTracking().ToListAsync()).ToDictionary(j => j.Id, j => j.JobNumber)
    );

    [HttpGet("inspections")]
    public async Task<IActionResult> GetInspections()
    {
        var (techs, customers, equipment, jobNumbers) = await WorkLookupsAsync();
        var taskById = await _db.JobCardTasks.AsNoTracking().ToDictionaryAsync(task => task.Id);
        return Ok((await _db.OpsInspections.AsNoTracking().OrderByDescending(x => x.InspectionDate).ToListAsync())
            .Select(x =>
            {
                var task = x.JobTaskId.HasValue ? taskById.GetValueOrDefault(x.JobTaskId.Value) : null;
                return new
                {
                    x.Id, x.JobId, x.JobTaskId, x.EquipmentId, x.TechnicianId, x.CustomerId, x.SiteId, x.InspectionDate, x.Result, x.Cost, x.Findings, x.NextInspectionDue,
                    AgentType = task?.AgentType, UnitType = task?.UnitType,
                    TaskQuantity = x.EquipmentId.HasValue ? 1 : task?.Quantity,
                    Date = x.InspectionDate,
                    Status = x.Result,
                    CustomerName = x.CustomerId.HasValue && customers.TryGetValue(x.CustomerId.Value, out var c) ? c.Name : null,
                    CustomerNumber = x.CustomerId.HasValue && customers.TryGetValue(x.CustomerId.Value, out var c2) ? c2.CustomerId : null,
                    EquipmentName = x.EquipmentId.HasValue && equipment.TryGetValue(x.EquipmentId.Value, out var e) ? e.Name : null,
                    EquipmentNumber = x.EquipmentId.HasValue && equipment.TryGetValue(x.EquipmentId.Value, out var e2) ? e2.EquipmentNumber : null,
                    TechnicianName = x.TechnicianId.HasValue && techs.TryGetValue(x.TechnicianId.Value, out var t) ? t : null,
                    JobNumber = x.JobId.HasValue && jobNumbers.TryGetValue(x.JobId.Value, out var jn) ? jn : null,
                };
            }));
    }

    [HttpPost("inspections")]
    public async Task<IActionResult> CreateInspection([FromBody] WorkRecordIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = new OpsInspection
        {
            JobId = dto.JobId, EquipmentId = dto.EquipmentId, TechnicianId = dto.TechnicianId, CustomerId = dto.CustomerId, SiteId = dto.SiteId,
            InspectionDate = dto.Date ?? DateTime.UtcNow,
            Result = dto.Type ?? "Pass",
            Cost = dto.Cost ?? 0,
            Findings = dto.Notes,
        };
        _db.OpsInspections.Add(x);
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpPut("inspections/{id:int}")]
    public async Task<IActionResult> UpdateInspection(int id, [FromBody] WorkRecordIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = await _db.OpsInspections.FindAsync(id);
        if (x is null) return NotFound();
        if (dto.JobId != null) x.JobId = dto.JobId;
        if (dto.EquipmentId != null) x.EquipmentId = dto.EquipmentId;
        if (dto.TechnicianId != null) x.TechnicianId = dto.TechnicianId;
        if (dto.CustomerId != null) x.CustomerId = dto.CustomerId;
        if (dto.SiteId != null) x.SiteId = dto.SiteId;
        if (dto.Date != null) x.InspectionDate = dto.Date.Value;
        if (dto.Type != null) x.Result = dto.Type;
        if (dto.Cost != null) x.Cost = dto.Cost.Value;
        if (dto.Notes != null) x.Findings = dto.Notes;
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpDelete("inspections/{id:int}")]
    public async Task<IActionResult> DeleteInspection(int id)
    {
        if (!IsAdmin) return Denied();
        var x = await _db.OpsInspections.FindAsync(id);
        if (x is null) return NotFound();
        _db.OpsInspections.Remove(x);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("refills")]
    public async Task<IActionResult> GetRefills()
    {
        var (techs, customers, equipment, jobNumbers) = await WorkLookupsAsync();
        var taskById = await _db.JobCardTasks.AsNoTracking().ToDictionaryAsync(task => task.Id);
        return Ok((await _db.OpsRefills.AsNoTracking().OrderByDescending(x => x.RefillDate).ToListAsync())
            .Select(x =>
            {
                var task = x.JobTaskId.HasValue ? taskById.GetValueOrDefault(x.JobTaskId.Value) : null;
                return new
                {
                    x.Id, x.JobId, x.JobTaskId, x.EquipmentId, x.TechnicianId, x.CustomerId, x.SiteId, x.RefillDate, x.AgentType, x.AgentAmountKg, x.Cost, x.Notes,
                    UnitType = task?.UnitType, TaskQuantity = x.EquipmentId.HasValue ? 1 : task?.Quantity,
                    Date = x.RefillDate,
                    Status = "Completed",
                    CustomerName = x.CustomerId.HasValue && customers.TryGetValue(x.CustomerId.Value, out var c) ? c.Name : null,
                    CustomerNumber = x.CustomerId.HasValue && customers.TryGetValue(x.CustomerId.Value, out var c2) ? c2.CustomerId : null,
                    EquipmentName = x.EquipmentId.HasValue && equipment.TryGetValue(x.EquipmentId.Value, out var e) ? e.Name : null,
                    EquipmentNumber = x.EquipmentId.HasValue && equipment.TryGetValue(x.EquipmentId.Value, out var e2) ? e2.EquipmentNumber : null,
                    TechnicianName = x.TechnicianId.HasValue && techs.TryGetValue(x.TechnicianId.Value, out var t) ? t : null,
                    JobNumber = x.JobId.HasValue && jobNumbers.TryGetValue(x.JobId.Value, out var jn) ? jn : null,
                };
            }));
    }

    [HttpPost("refills")]
    public async Task<IActionResult> CreateRefill([FromBody] RefillIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = new OpsRefill
        {
            JobId = dto.JobId, EquipmentId = dto.EquipmentId, TechnicianId = dto.TechnicianId, CustomerId = dto.CustomerId, SiteId = dto.SiteId,
            RefillDate = dto.Date ?? DateTime.UtcNow,
            AgentType = dto.AgentType ?? "ABC Dry Powder",
            AgentAmountKg = dto.AgentAmountKg ?? 0,
            Cost = dto.Cost ?? 0,
            Notes = dto.Notes,
        };
        _db.OpsRefills.Add(x);
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpPut("refills/{id:int}")]
    public async Task<IActionResult> UpdateRefill(int id, [FromBody] RefillIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = await _db.OpsRefills.FindAsync(id);
        if (x is null) return NotFound();
        if (dto.JobId != null) x.JobId = dto.JobId;
        if (dto.EquipmentId != null) x.EquipmentId = dto.EquipmentId;
        if (dto.TechnicianId != null) x.TechnicianId = dto.TechnicianId;
        if (dto.CustomerId != null) x.CustomerId = dto.CustomerId;
        if (dto.SiteId != null) x.SiteId = dto.SiteId;
        if (dto.Date != null) x.RefillDate = dto.Date.Value;
        if (dto.AgentType != null) x.AgentType = dto.AgentType;
        if (dto.AgentAmountKg != null) x.AgentAmountKg = dto.AgentAmountKg.Value;
        if (dto.Cost != null) x.Cost = dto.Cost.Value;
        if (dto.Notes != null) x.Notes = dto.Notes;
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpDelete("refills/{id:int}")]
    public async Task<IActionResult> DeleteRefill(int id)
    {
        if (!IsAdmin) return Denied();
        var x = await _db.OpsRefills.FindAsync(id);
        if (x is null) return NotFound();
        _db.OpsRefills.Remove(x);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    public record RefillIn(int? JobId, int? EquipmentId, int? TechnicianId, int? CustomerId, int? SiteId, DateTime? Date,
        string? AgentType, double? AgentAmountKg, decimal? Cost, string? Notes);

    [HttpGet("maintenance")]
    public async Task<IActionResult> GetMaintenance()
    {
        var (techs, customers, equipment, jobNumbers) = await WorkLookupsAsync();
        var taskById = await _db.JobCardTasks.AsNoTracking().ToDictionaryAsync(task => task.Id);
        return Ok((await _db.OpsMaintenance.AsNoTracking().OrderByDescending(x => x.WorkDate).ToListAsync())
            .Select(x =>
            {
                var task = x.JobTaskId.HasValue ? taskById.GetValueOrDefault(x.JobTaskId.Value) : null;
                return new
                {
                    x.Id, x.JobId, x.JobTaskId, x.EquipmentId, x.TechnicianId, x.CustomerId, x.SiteId, x.WorkDate, x.WorkType, x.Cost, x.Findings,
                    AgentType = task?.AgentType, UnitType = task?.UnitType,
                    TaskQuantity = x.EquipmentId.HasValue ? 1 : task?.Quantity,
                    Date = x.WorkDate,
                    Status = "Completed",
                    CustomerName = x.CustomerId.HasValue && customers.TryGetValue(x.CustomerId.Value, out var c) ? c.Name : null,
                    CustomerNumber = x.CustomerId.HasValue && customers.TryGetValue(x.CustomerId.Value, out var c2) ? c2.CustomerId : null,
                    EquipmentName = x.EquipmentId.HasValue && equipment.TryGetValue(x.EquipmentId.Value, out var e) ? e.Name : null,
                    EquipmentNumber = x.EquipmentId.HasValue && equipment.TryGetValue(x.EquipmentId.Value, out var e2) ? e2.EquipmentNumber : null,
                    TechnicianName = x.TechnicianId.HasValue && techs.TryGetValue(x.TechnicianId.Value, out var t) ? t : null,
                    JobNumber = x.JobId.HasValue && jobNumbers.TryGetValue(x.JobId.Value, out var jn) ? jn : null,
                };
            }));
    }

    [HttpPost("maintenance")]
    public async Task<IActionResult> CreateMaintenance([FromBody] MaintenanceIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = new OpsMaintenance
        {
            JobId = dto.JobId, EquipmentId = dto.EquipmentId, TechnicianId = dto.TechnicianId, CustomerId = dto.CustomerId, SiteId = dto.SiteId,
            WorkDate = dto.Date ?? DateTime.UtcNow,
            WorkType = dto.Type ?? "Repair",
            Cost = dto.Cost ?? 0,
            Findings = dto.Notes,
        };
        _db.OpsMaintenance.Add(x);
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpPut("maintenance/{id:int}")]
    public async Task<IActionResult> UpdateMaintenance(int id, [FromBody] MaintenanceIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = await _db.OpsMaintenance.FindAsync(id);
        if (x is null) return NotFound();
        if (dto.JobId != null) x.JobId = dto.JobId;
        if (dto.EquipmentId != null) x.EquipmentId = dto.EquipmentId;
        if (dto.TechnicianId != null) x.TechnicianId = dto.TechnicianId;
        if (dto.CustomerId != null) x.CustomerId = dto.CustomerId;
        if (dto.SiteId != null) x.SiteId = dto.SiteId;
        if (dto.Date != null) x.WorkDate = dto.Date.Value;
        if (dto.Type != null) x.WorkType = dto.Type;
        if (dto.Cost != null) x.Cost = dto.Cost.Value;
        if (dto.Notes != null) x.Findings = dto.Notes;
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpDelete("maintenance/{id:int}")]
    public async Task<IActionResult> DeleteMaintenance(int id)
    {
        if (!IsAdmin) return Denied();
        var x = await _db.OpsMaintenance.FindAsync(id);
        if (x is null) return NotFound();
        _db.OpsMaintenance.Remove(x);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    public record MaintenanceIn(int? JobId, int? EquipmentId, int? TechnicianId, int? CustomerId, int? SiteId, DateTime? Date,
        string? Type, decimal? Cost, string? Notes);

    [HttpGet("certifications")]
    public async Task<IActionResult> GetCertifications()
    {
        var techs = (await _db.Technicians.AsNoTracking().ToListAsync()).ToDictionary(t => t.Id, t => t.Name);
        return Ok((await _db.OpsCertifications.AsNoTracking().OrderBy(x => x.ExpiryDate).ToListAsync())
            .Select(x => new
            {
                x.Id, x.TechnicianId, x.Name, x.ExpiryDate,
                TechnicianName = x.TechnicianId.HasValue && techs.TryGetValue(x.TechnicianId.Value, out var t) ? t : null,
            }));
    }

    [HttpPost("certifications")]
    public async Task<IActionResult> CreateCertification([FromBody] CertificationIn dto)
    {
        if (!CanOpsWrite) return Denied();
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { message = "Certification name is required." });
        var x = new OpsCertification
        {
            TechnicianId = dto.TechnicianId,
            Name = dto.Name!.Trim(),
            ExpiryDate = dto.ExpiryDate ?? DateTime.UtcNow.AddYears(1),
        };
        _db.OpsCertifications.Add(x);
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpPut("certifications/{id:int}")]
    public async Task<IActionResult> UpdateCertification(int id, [FromBody] CertificationIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var x = await _db.OpsCertifications.FindAsync(id);
        if (x is null) return NotFound();
        if (dto.TechnicianId != null) x.TechnicianId = dto.TechnicianId;
        if (dto.Name != null) x.Name = dto.Name;
        if (dto.ExpiryDate != null) x.ExpiryDate = dto.ExpiryDate.Value;
        await _db.SaveChangesAsync();
        return Ok(x);
    }

    [HttpDelete("certifications/{id:int}")]
    public async Task<IActionResult> DeleteCertification(int id)
    {
        if (!IsAdmin) return Denied();
        var x = await _db.OpsCertifications.FindAsync(id);
        if (x is null) return NotFound();
        _db.OpsCertifications.Remove(x);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("invoices")]
    public async Task<IActionResult> GetInvoices()
    {
        var customers = (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id);
        var list = await _db.OpsInvoices.AsNoTracking().OrderBy(i => i.IssueDate).ToListAsync();
        return Ok(list.Select(i => new
        {
            i.Id, i.InvoiceNumber, i.CustomerId, i.Amount, i.IssueDate, i.DueDate, i.PaidDate, i.Status,
            CustomerNumber = i.CustomerId.HasValue && customers.TryGetValue(i.CustomerId.Value, out var c) ? c.CustomerId : null,
            CustomerName = i.CustomerId.HasValue && customers.TryGetValue(i.CustomerId.Value, out var c2) ? c2.Name : null,
        }));
    }

    [HttpPost("invoices")]
    public async Task<IActionResult> CreateInvoice([FromBody] InvoiceIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var invoiceNumber = dto.InvoiceNumber;
        if (string.IsNullOrWhiteSpace(invoiceNumber))
        {
                var n = await NextSequenceValue("InvoiceNumberSequence");
            invoiceNumber = $"INV-{n:D6}";
        }
        var inv = new OpsInvoice
        {
            InvoiceNumber = invoiceNumber,
            CustomerId = dto.CustomerId,
            Amount = dto.Amount ?? 0,
            IssueDate = dto.IssueDate ?? DateTime.UtcNow,
            DueDate = dto.DueDate,
            PaidDate = dto.PaidDate,
            Status = dto.Status ?? "Unpaid",
        };
        _db.OpsInvoices.Add(inv);
        await _db.SaveChangesAsync();
        return Ok(inv);
    }

    [HttpPut("invoices/{id:int}")]
    public async Task<IActionResult> UpdateInvoice(int id, [FromBody] InvoiceIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var inv = await _db.OpsInvoices.FindAsync(id);
        if (inv is null) return NotFound();
        if (dto.InvoiceNumber != null) inv.InvoiceNumber = dto.InvoiceNumber;
        if (dto.CustomerId != null) inv.CustomerId = dto.CustomerId;
        if (dto.Amount != null) inv.Amount = dto.Amount.Value;
        if (dto.IssueDate != null) inv.IssueDate = dto.IssueDate.Value;
        if (dto.DueDate != null) inv.DueDate = dto.DueDate;
        if (dto.PaidDate != null) inv.PaidDate = dto.PaidDate;
        if (dto.Status != null) inv.Status = dto.Status;
        await _db.SaveChangesAsync();
        return Ok(inv);
    }

    [HttpDelete("invoices/{id:int}")]
    public async Task<IActionResult> DeleteInvoice(int id)
    {
        if (!IsAdmin) return Denied();
        var inv = await _db.OpsInvoices.FindAsync(id);
        if (inv is null) return NotFound();
        _db.OpsInvoices.Remove(inv);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------- quotations (SRS §20) ----------

    private static readonly string[] QuotationStatuses = { "Draft", "Sent", "Accepted", "Rejected", "Expired" };

    private static (decimal Subtotal, decimal Discount, decimal Tax, decimal Total) QuoteTotals(
        IEnumerable<OpsQuotationLine> lines, decimal discountPercent, decimal taxPercent)
    {
        var subtotal = lines.Sum(l => (decimal)l.Quantity * l.UnitPrice);
        var discount = subtotal * discountPercent / 100;
        var taxable = subtotal - discount;
        var tax = taxable * taxPercent / 100;
        return (subtotal, discount, tax, taxable + tax);
    }

    private static string QuoteDisplayStatus(OpsQuotation q)
    {
        if ((q.Status == "Draft" || q.Status == "Sent") && q.ExpiryDate.Date < DateTime.UtcNow.Date)
            return "Expired";
        return q.Status;
    }

    [HttpGet("quotations")]
    public async Task<IActionResult> GetQuotations([FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? customerNumber)
    {
        var customers = (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id);
        var jobsById = (await _db.JobCards.AsNoTracking().ToListAsync()).ToDictionary(j => j.Id);
        var quotes = await _db.OpsQuotations.AsNoTracking().Include(q => q.Lines).OrderByDescending(q => q.QuoteDate).ToListAsync();
        var shaped = quotes.Select(q =>
        {
            var t = QuoteTotals(q.Lines, q.DiscountPercent, q.TaxPercent);
            customers.TryGetValue(q.CustomerId ?? -1, out var c);
            jobsById.TryGetValue(q.ConvertedJobId ?? -1, out var cj);
            return new
            {
                q.Id, q.QuotationNumber, q.CustomerId, q.SiteId, q.Title,
                q.QuoteDate, q.ExpiryDate, q.DiscountPercent, q.TaxPercent, q.Terms,
                Status = QuoteDisplayStatus(q),
                q.ConvertedJobId, ConvertedJobNumber = cj != null ? cj.JobNumber : null, q.Notes, q.CreatedAt,
                q.CustomerAddress, q.CustomerVat, q.CustomerTin, q.CustomerContact, q.CustomerEmailSnapshot,
                q.Currency, q.CompanyVatNo, q.CompanyTinNo, q.BankName, q.BankBranch, q.BankAccountName, q.BankAccountNumber, q.BankAccountNumberZwg,
                q.DocumentRef, q.PaymentTerms, q.ValidityText,
                CustomerNumber = c != null ? c.CustomerId : null,
                CustomerName = c != null ? c.Name : null,
                LineCount = q.Lines.Count,
                Subtotal = t.Subtotal, Discount = t.Discount, Tax = t.Tax, Total = t.Total,
            };
        });
        if (!string.IsNullOrWhiteSpace(status))
            shaped = shaped.Where(q => q.Status.Equals(status.Trim(), StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(customerNumber))
        {
            var qn = customerNumber.Trim();
            shaped = shaped.Where(q => q.CustomerNumber != null && q.CustomerNumber.Contains(qn, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            shaped = shaped.Where(q =>
                (q.QuotationNumber != null && q.QuotationNumber.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (q.Title != null && q.Title.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (q.CustomerNumber != null && q.CustomerNumber.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (q.CustomerName != null && q.CustomerName.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (q.CustomerAddress != null && q.CustomerAddress.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (q.DocumentRef != null && q.DocumentRef.Contains(s, StringComparison.OrdinalIgnoreCase)));
        }
        return Ok(shaped.ToList());
    }

    [HttpGet("quotations/{id:int}")]
    public async Task<IActionResult> GetQuotation(int id)
    {
        var q = await _db.OpsQuotations.Include(x => x.Lines).Include(x => x.Files).FirstOrDefaultAsync(x => x.Id == id);
        if (q is null) return NotFound();
        var customer = q.CustomerId.HasValue ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == q.CustomerId.Value) : null;
        var convertedJob = q.ConvertedJobId.HasValue ? await _db.JobCards.AsNoTracking().FirstOrDefaultAsync(j => j.Id == q.ConvertedJobId.Value) : null;
        var t = QuoteTotals(q.Lines, q.DiscountPercent, q.TaxPercent);
        return Ok(new
        {
            q.Id, q.QuotationNumber, q.CustomerId, q.SiteId, q.Title,
            q.QuoteDate, q.ExpiryDate, q.DiscountPercent, q.TaxPercent, q.Terms,
            Status = QuoteDisplayStatus(q),
            q.ConvertedJobId, ConvertedJobNumber = convertedJob != null ? convertedJob.JobNumber : null, q.Notes, q.CreatedAt,
            q.CustomerAddress, q.CustomerVat, q.CustomerTin, q.CustomerContact, q.CustomerEmailSnapshot,
            q.Currency, q.CompanyVatNo, q.CompanyTinNo, q.BankName, q.BankBranch, q.BankAccountName, q.BankAccountNumber, q.BankAccountNumberZwg,
            q.DocumentRef, q.PaymentTerms, q.ValidityText,
            CustomerNumber = customer != null ? customer.CustomerId : null,
            CustomerName = customer != null ? customer.Name : null,
            Lines = q.Lines.OrderBy(l => l.SortOrder).Select(l => new
            {
                l.Id, l.Description, l.Quantity, l.UnitPrice,
                LineTotal = (decimal)l.Quantity * l.UnitPrice,
            }),
            Files = q.Files.OrderByDescending(f => f.UploadedAt).Select(f => new
            {
                f.Id, f.Name, f.FilePath, f.SizeBytes, f.UploadedAt, f.UploadedBy,
            }),
            Subtotal = t.Subtotal, Discount = t.Discount, Tax = t.Tax, Total = t.Total,
        });
    }

    [HttpPost("quotations")]
    public async Task<IActionResult> CreateQuotation([FromBody] QuotationIn dto)
    {
        if (!CanOpsWrite) return Denied();
        if (string.IsNullOrWhiteSpace(dto.Title)) return BadRequest(new { message = "Quotation title is required." });
        if (dto.Lines == null || dto.Lines.Count == 0) return BadRequest(new { message = "At least one line item is required." });
        foreach (var l in dto.Lines)
        {
            if (string.IsNullOrWhiteSpace(l.Description)) return BadRequest(new { message = "Every line item needs a description." });
            if ((l.Quantity ?? 0) <= 0) return BadRequest(new { message = "Line quantities must be greater than zero." });
            if ((l.UnitPrice ?? 0) < 0) return BadRequest(new { message = "Line prices cannot be negative." });
        }
        if ((dto.DiscountPercent ?? 0) < 0 || (dto.DiscountPercent ?? 0) > 100)
            return BadRequest(new { message = "Discount must be between 0 and 100 percent." });
        if ((dto.TaxPercent ?? 15.5m) < 0 || (dto.TaxPercent ?? 15.5m) > 100)
            return BadRequest(new { message = "Tax must be between 0 and 100 percent." });
        if (dto.ExpiryDate.HasValue && dto.QuoteDate.HasValue && dto.ExpiryDate < dto.QuoteDate)
            return BadRequest(new { message = "Expiry date must be after the quote date." });

        var customerId = dto.CustomerId;
        if (dto.CustomerId.HasValue || !string.IsNullOrWhiteSpace(dto.CustomerNumber))
        {
            try { customerId = (await FindCustomerByRefAsync(dto.CustomerId, dto.CustomerNumber))?.Id; }
            catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        }
        if (dto.SiteId.HasValue && !await _db.CustomerSites.AnyAsync(s => s.Id == dto.SiteId.Value))
            return BadRequest(new { message = $"Site ID {dto.SiteId.Value} does not exist." });

        try
        {
            // Same walk-in rule as jobs: blank customer auto-generates a customer ID.
            // One customer, one ID: reuse the existing record when recognised.
            if (!customerId.HasValue)
            {
                var known = await FindExistingCustomerAsync(dto.CustomerPhone, dto.CustomerName);
                if (known != null)
                {
                    customerId = known.Id;
                }
                else
                {
                    var cn = await _db.Database.SqlQueryRaw<long>("SELECT nextval('\"CustomerNumberSequence\"') AS \"Value\"").SingleAsync();
                    var auto = new Customer
                    {
                        CustomerId = $"CUS-{cn:D6}",
                        Name = string.IsNullOrWhiteSpace(dto.CustomerName) ? $"Walk-in — {dto.Title!.Trim()}" : dto.CustomerName!.Trim(),
                        Phone = string.IsNullOrWhiteSpace(dto.CustomerPhone) ? "0000000000" : dto.CustomerPhone!.Trim(),
                        Email = string.IsNullOrWhiteSpace(dto.CustomerEmail) ? null : dto.CustomerEmail!.Trim(),
                        BillingAddress = dto.CustomerAddress?.Trim(),
                        VatNumber = dto.CustomerVat?.Trim(),
                        TinNumber = dto.CustomerTin?.Trim(),
                        Status = CustomerStatus.Prospect,
                        Priority = CustomerPriority.Normal,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                    };
                    _db.Customers.Add(auto);
                    await _db.SaveChangesAsync();
                    customerId = auto.Id;
                }
            }
            var n = await NextSequenceValue("QuotationNumberSequence");
            var quoteDate = dto.QuoteDate ?? DateTime.UtcNow;
            // Business defaults come from Settings so the system stays consistent.
            var settingsTax = await GetSettingDecimalAsync("taxPercent", 15.5m);
            var expiryDays = await GetSettingIntAsync("quoteExpiryDays", 30);
            var settingsTerms = await GetSettingAsync("quotationTerms");
            var q = new OpsQuotation
            {
                QuotationNumber = $"QUO-{n:D6}",
                CustomerId = customerId,
                SiteId = dto.SiteId,
                Title = dto.Title!.Trim(),
                QuoteDate = quoteDate,
                ExpiryDate = dto.ExpiryDate ?? quoteDate.AddDays(expiryDays),
                DiscountPercent = dto.DiscountPercent ?? 0,
                TaxPercent = dto.TaxPercent ?? settingsTax,
                Terms = string.IsNullOrWhiteSpace(dto.Terms) ? settingsTerms : dto.Terms,
                Status = "Draft",
                Notes = dto.Notes,
                CustomerAddress = dto.CustomerAddress?.Trim(),
                CustomerVat = dto.CustomerVat?.Trim(),
                CustomerTin = dto.CustomerTin?.Trim(),
                CustomerContact = dto.CustomerContact?.Trim(),
                CustomerEmailSnapshot = dto.CustomerEmail?.Trim(),
                Currency = dto.Currency?.Trim(),
                CompanyVatNo = dto.CompanyVatNo?.Trim(),
                CompanyTinNo = dto.CompanyTinNo?.Trim(),
                BankName = dto.BankName?.Trim(),
                BankBranch = dto.BankBranch?.Trim(),
                BankAccountName = dto.BankAccountName?.Trim(),
                BankAccountNumber = dto.BankAccountNumber?.Trim(),
                BankAccountNumberZwg = dto.BankAccountNumberZwg?.Trim(),
                DocumentRef = dto.DocumentRef?.Trim(),
                PaymentTerms = dto.PaymentTerms?.Trim(),
                ValidityText = dto.ValidityText?.Trim(),
            };
            var order = 0;
            foreach (var l in dto.Lines)
            {
                q.Lines.Add(new OpsQuotationLine
                {
                    Description = l.Description!.Trim(),
                    Quantity = l.Quantity!.Value,
                    UnitPrice = l.UnitPrice!.Value,
                    SortOrder = order++,
                });
            }
            _db.OpsQuotations.Add(q);
            await _db.SaveChangesAsync();
            var linked = q.CustomerId.HasValue
                ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == q.CustomerId.Value)
                : null;
            return Ok(new
            {
                q.Id, q.QuotationNumber, q.Status,
                CustomerNumber = linked != null ? linked.CustomerId : null,
                CustomerName = linked != null ? linked.Name : null,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "The quotation could not be saved.", detail = ex.Message, inner = ex.InnerException?.Message });
        }
    }

    [HttpPut("quotations/{id:int}")]
    public async Task<IActionResult> UpdateQuotation(int id, [FromBody] QuotationIn dto)
    {
        if (!CanOpsWrite) return Denied();
        var q = await _db.OpsQuotations.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
        if (q is null) return NotFound();
        if (q.Status != "Draft") return Conflict(new { message = "Only Draft quotations can be edited." });
        if (dto.Title != null) q.Title = dto.Title;
        if (dto.SiteId != null) q.SiteId = dto.SiteId;
        if (dto.QuoteDate != null) q.QuoteDate = dto.QuoteDate.Value;
        if (dto.ExpiryDate != null) q.ExpiryDate = dto.ExpiryDate.Value;
        if (dto.DiscountPercent != null) q.DiscountPercent = dto.DiscountPercent.Value;
        if (dto.TaxPercent != null) q.TaxPercent = dto.TaxPercent.Value;
        if (dto.Terms != null) q.Terms = dto.Terms;
        if (dto.Notes != null) q.Notes = dto.Notes;
        if (dto.CustomerAddress != null) q.CustomerAddress = dto.CustomerAddress;
        if (dto.CustomerVat != null) q.CustomerVat = dto.CustomerVat;
        if (dto.CustomerTin != null) q.CustomerTin = dto.CustomerTin;
        if (dto.CustomerContact != null) q.CustomerContact = dto.CustomerContact;
        if (dto.CustomerEmail != null) q.CustomerEmailSnapshot = dto.CustomerEmail;
        if (dto.Currency != null) q.Currency = dto.Currency;
        if (dto.CompanyVatNo != null) q.CompanyVatNo = dto.CompanyVatNo;
        if (dto.CompanyTinNo != null) q.CompanyTinNo = dto.CompanyTinNo;
        if (dto.BankName != null) q.BankName = dto.BankName;
        if (dto.BankBranch != null) q.BankBranch = dto.BankBranch;
        if (dto.BankAccountName != null) q.BankAccountName = dto.BankAccountName;
        if (dto.BankAccountNumber != null) q.BankAccountNumber = dto.BankAccountNumber;
        if (dto.BankAccountNumberZwg != null) q.BankAccountNumberZwg = dto.BankAccountNumberZwg;
        if (dto.DocumentRef != null) q.DocumentRef = dto.DocumentRef;
        if (dto.PaymentTerms != null) q.PaymentTerms = dto.PaymentTerms;
        if (dto.ValidityText != null) q.ValidityText = dto.ValidityText;
        if (dto.CustomerId != null || !string.IsNullOrWhiteSpace(dto.CustomerNumber))
        {
            try { q.CustomerId = (await FindCustomerByRefAsync(dto.CustomerId, dto.CustomerNumber))?.Id; }
            catch (CustomerResolutionException ex) { return BadRequest(new { message = ex.Message }); }
        }
        if (dto.Lines != null)
        {
            if (dto.Lines.Count == 0) return BadRequest(new { message = "At least one line item is required." });
            foreach (var l in dto.Lines)
            {
                if (string.IsNullOrWhiteSpace(l.Description)) return BadRequest(new { message = "Every line item needs a description." });
                if ((l.Quantity ?? 0) <= 0) return BadRequest(new { message = "Line quantities must be greater than zero." });
                if ((l.UnitPrice ?? 0) < 0) return BadRequest(new { message = "Line prices cannot be negative." });
            }
            _db.OpsQuotationLines.RemoveRange(q.Lines);
            var order = 0;
            foreach (var l in dto.Lines)
            {
                _db.OpsQuotationLines.Add(new OpsQuotationLine
                {
                    QuotationId = q.Id,
                    Description = l.Description!.Trim(),
                    Quantity = l.Quantity!.Value,
                    UnitPrice = l.UnitPrice!.Value,
                    SortOrder = order++,
                });
            }
        }
        await _db.SaveChangesAsync();
        return Ok(new { q.Id, q.QuotationNumber, q.Status });
    }

    // ---------- quotation files: upload / download / delete / auto-extract ----------

    public record QuoteLineExtract(string? Description, double? Quantity, decimal? UnitPrice, decimal? Amount);

    public record QuoteExtractOut(
        string? QuoteNumber, string? QuoteDate, string? ExpiryDate,
        decimal? Subtotal, decimal? DiscountPercent, decimal? DiscountAmount, decimal? TaxPercent, decimal? TaxAmount, decimal? Total,
        string? VatNumber, string? TinNumber, string? Title, string? CustomerName,
        int? MatchedCustomerId, string? MatchedCustomerNumber, int? MatchScore, string? Preview,
        string? DocumentCustomerName, string? Phone, string? Email, string? Address,
        List<QuoteLineExtract>? Lines, bool IsConfidentMatch,
        string? CompanyName, string? Attention, string? Project, string? Currency,
        string? PaymentTerms, string? DocumentRef,
        string? CustomerAddress, string? CustomerVat, string? CustomerTin, string? CustomerContact,
        string? CompanyVatNo, string? CompanyTinNo, string? BankName, string? BankBranch, string? BankAccountName,
        string? BankAccountNumber, string? BankAccountNumberZwg, string? ValidityText,
        Dictionary<string, string>? Fields,
        int? StoredFileId);

    private static object MapQFile(OpsQuotationFile f) =>
        new { f.Id, f.QuotationId, f.Name, f.FilePath, f.SizeBytes, f.UploadedAt, f.UploadedBy };

    private static async Task<string> ExtractDocumentTextAsync(byte[] bytes, string fileName)
    {
        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        if (ext is ".txt" or ".csv" or ".log")
            return Encoding.UTF8.GetString(bytes);
        if (ext is ".docx")
        {
            using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
            var entry = zip.Entries.FirstOrDefault(e => e.FullName.Replace('\\', '/') == "word/document.xml");
            if (entry is null) return "";
            using var sr = new StreamReader(entry.Open());
            var xml = await sr.ReadToEndAsync();
            var sb = new StringBuilder(xml.Length);
            sb.Append(Regex.Replace(xml, "<w:tab[^>]*/>", "\t"));
            sb = new StringBuilder(Regex.Replace(sb.ToString(), "<w:br[^>]*/>", "\n"));
            sb = new StringBuilder(Regex.Replace(sb.ToString(), "</w:p>", "\n"));
            var text = Regex.Replace(sb.ToString(), "<[^>]+>", "");
            text = System.Net.WebUtility.HtmlDecode(text);
            return Regex.Replace(text, "[ \t]+\n", "\n").Replace("\r", "").Trim();
        }
        try { System.IO.File.WriteAllText(System.IO.Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.Desktop), "debug_ext.txt"), $"ext={ext} fileName={fileName} bytes={bytes.Length}"); } catch {}
        if (ext is ".pdf")
        {
            // Use simple text extraction (p.Text) which is already in reading order and handles tables correctly for most PDFs
            try {
                using (var doc = PdfDocument.Open(new MemoryStream(bytes)))
                {
                    var sText = string.Join("\n", doc.GetPages().Select(p => p.Text));
                    if (!string.IsNullOrWhiteSpace(sText) && sText.Length > 50)
                    {
                        return sText;
                    }
                }
            } catch {}
            // Fallback: Rebuild visual lines: group words by Y band, sort by X.
            var words = new List<(double X, double Y, string Text)>();
            using (var doc = PdfDocument.Open(new MemoryStream(bytes)))
            {
                foreach (var page in doc.GetPages())
                {
                    foreach (var w in page.GetWords())
                    {
                        var bb = w.BoundingBox;
                        words.Add((bb.Left, bb.Bottom, w.Text));
                    }
                    words.Add((-1, -999999, "\n"));
                }
            }
            var lines = new List<List<(double X, string Text)>>();
            var current = new List<(double X, string Text)>();
            double? bandY = null;
            foreach (var (x, y, t) in words.OrderByDescending(w => w.Y).ThenBy(w => w.X))
            {
                if (t == "\n")
                {
                    if (current.Count > 0) { lines.Add(current); current = new(); bandY = null; }
                    continue;
                }
                if (bandY is null || Math.Abs(y - bandY.Value) < 3.0)
                {
                    bandY ??= y;
                    current.Add((x, t));
                }
                else
                {
                    if (current.Count > 0) lines.Add(current);
                    current = new List<(double, string)> { (x, t) };
                    bandY = y;
                }
            }
            if (current.Count > 0) lines.Add(current);
            var sb = new StringBuilder();
            foreach (var line in lines)
            {
                var sorted = line.OrderBy(w => w.X).ToList();
                var subLines = new List<List<(double X, string Text)>>();
                var cur = new List<(double X, string Text)>();
                double? lastX = null;
                foreach (var w in sorted)
                {
                    if (lastX != null && w.X - lastX.Value > 120)
                    {
                        if (cur.Count > 0) subLines.Add(cur);
                        cur = new List<(double X, string Text)>();
                    }
                    cur.Add(w);
                    lastX = w.X + w.Text.Length * 4;
                }
                if (cur.Count > 0) subLines.Add(cur);
                foreach (var sl in subLines)
                    sb.AppendLine(string.Join(" ", sl.Select(w => w.Text)));
            }
            return sb.ToString();
        }
        if (bytes.Length <= 5 * 1024 * 1024 && !bytes.Take(1024).Any(b => b == 0))
            return Encoding.UTF8.GetString(bytes);
        return "";
    }

    private static bool TryParseDate(string s, out DateTime date)
    {
        date = default;
        string[] formats = { "dd/MM/yyyy", "dd-MM-yyyy", "dd.MM.yyyy", "d/M/yyyy", "d-M-yyyy", "yyyy-MM-dd", "yyyy/MM/dd", "dd MMM yyyy", "d MMM yyyy", "MMM d, yyyy", "MMMM d, yyyy" };
        foreach (var f in formats)
            if (DateTime.TryParseExact(s.Trim(), f, CultureInfo.InvariantCulture, DateTimeStyles.None, out date)) return true;
        return DateTime.TryParse(s.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out date)
            || DateTime.TryParse(s.Trim(), out date);
    }

    private static string NormName(string s) =>
        Regex.Replace((s ?? "").ToLowerInvariant(), @"[^a-z0-9\s]", " ").Replace("  ", " ").Trim();

    private static List<string> NameTokens(string s) =>
        NormName(s).Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length >= 3 && t is not ("the" or "and" or "for" or "with" or "pty" or "ltd" or "limited" or "co" or "inc"))
            .Distinct().ToList();

    private static int NameMatchScore(string? customerName, string? haystack)
    {
        var nameTokens = NameTokens(customerName ?? "");
        if (nameTokens.Count == 0) return 0;
        var hay = NormName(haystack ?? "");
        if (hay.Length == 0) return 0;
        var hayTokens = new HashSet<string>(hay.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        var matched = nameTokens.Count(t => hayTokens.Contains(t));
        var norm = NormName(customerName);
        if (norm.Length >= 5 && hay.Contains(norm)) return 100;
        if (matched < 2 && nameTokens.Count >= 2) return 0;
        if (matched == 0) return 0;
        return (int)Math.Round(100.0 * matched / nameTokens.Count);
    }

    private static bool LooksLikeHeaderOrFooter(string line)
    {
        return Regex.IsMatch(line,
            @"^(?:description|item|qty|quantity|unit|price|amount|subtotal|sub\s*total|total|vat|tax|discount|page|invoice|quotation|quote|date|expiry|expires|prepared|customer|client|bill\s*to|ship\s*to|sold\s*to|terms|payment|bank|reference|ref|tel|phone|email|address|vat\s*no|tin|attention|subject|re\s*:|project|currency|our\s*ref|your\s*ref|kind\s*attn|from|to|cc|subject)\b",
            RegexOptions.IgnoreCase)
            || Regex.IsMatch(line, @"^(?:no\.?|#)\s*$", RegexOptions.IgnoreCase)
            || Regex.IsMatch(line, @"^(?:qty|quantity|unit\s*price|unit\s*rate|rate|amount|line\s*total|total\s*amount|price\s*each)\s*$", RegexOptions.IgnoreCase);
    }

    private static bool TryParseMoney(string raw, out decimal value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var s = Regex.Replace(raw.Trim(), @"(?:US\$|USD|ZWL|ZW\$|N\$|\$)", "", RegexOptions.IgnoreCase).Trim();
        s = s.Replace(" ", "");
        // Keep trailing R as ZAR prefix only when standalone R precedes digits already stripped above.
        s = Regex.Replace(s, @"^R(?=\d)", "");
        if (Regex.IsMatch(s, @"^\d{1,3}(?:\.\d{3})+,\d{1,2}$"))
            s = s.Replace(".", "").Replace(",", ".");
        else
            s = s.Replace(",", "");
        return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out value);
    }

    private static List<QuoteLineExtract> ExtractQuoteLines(string text)
    {
        var results = new List<QuoteLineExtract>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var raw in text.Replace("\r\n", "\n").Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length < 5 || line.Length > 300) continue;
            if (LooksLikeHeaderOrFooter(line)) continue;

            QuoteLineExtract? hit = null;

            // 1) desc | qty | unit | amount
            var m = Regex.Match(line,
                @"^(?<d>[A-Za-z][^0-9|]{2,120}?)\s*\|\s*(?<q>\d{1,4}(?:\.\d{1,2})?)\s*\|\s*(?<p>\d[\d\s,]*(?:\.\d{1,2})?)\s*(?:\|\s*(?<a>\d[\d\s,]*(?:\.\d{1,2})?)\s*)?\|?\s*$");
            if (m.Success)
                hit = BuildLine(m.Groups["d"].Value, m.Groups["q"].Value, m.Groups["p"].Value, m.Groups["a"].Success ? m.Groups["a"].Value : null);

            // 2) desc  qty  unit  amount   (tabs or 2+ spaces between columns; desc may contain digits e.g. "9kg")
            if (hit is null)
            {
                m = Regex.Match(line,
                    @"^(?<d>[A-Za-z].{2,140}?)(?:\t+|\s{2,})(?<q>\d{1,5}(?:\.\d{1,2})?)(?:\t+|\s{2,})(?<p>\d+(?:,\d{3})*(?:\.\d{1,2})?)(?:(?:\t+|\s{2,})(?<a>\d+(?:,\d{3})*(?:\.\d{1,2})?))?\s*$");
                if (m.Success)
                    hit = BuildLine(m.Groups["d"].Value, m.Groups["q"].Value, m.Groups["p"].Value, m.Groups["a"].Success ? m.Groups["a"].Value : null);
            }

            // 3) desc  qty x unit  [amount]
            if (hit is null)
            {
                m = Regex.Match(line,
                    @"^(?<d>[A-Za-z][^0-9]{2,120}?)\s+(?<q>\d{1,4}(?:\.\d{1,2})?)\s*[x@]\s*(?<p>\d[\d\s,]*(?:\.\d{1,2})?)(?:\s+(?<a>\d[\d\s,]*(?:\.\d{1,2})?))?\s*$");
                if (m.Success)
                    hit = BuildLine(m.Groups["d"].Value, m.Groups["q"].Value, m.Groups["p"].Value, m.Groups["a"].Success ? m.Groups["a"].Value : null);
            }

            // 4) desc  amount only  (single money figure at end, qty defaults 1)
            if (hit is null)
            {
                m = Regex.Match(line,
                    @"^(?<d>[A-Za-z][A-Za-z0-9 ,./'&()\-]{4,140}?)\s{2,}(?<a>(?:US\$|USD|\$)\s*\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*$");
                if (m.Success)
                {
                    var desc = m.Groups["d"].Value.Trim().TrimEnd('-', ':');
                    // Skip if the "description" still looks like a totals/labels block.
                    if (desc.Length >= 4
                        && !Regex.IsMatch(desc, @"^(?:total|subtotal|sub\s*total|vat|tax|discount|balance|deposit|paid|expiry|expires?|valid|date|grand)", RegexOptions.IgnoreCase)
                        && !Regex.IsMatch(desc, @"\s{2,}\d+\s{2,}\d+$"))
                        hit = BuildLine(desc, "1", null, m.Groups["a"].Value);
                }
            }

            // 5) qty x desc @ price
            if (hit is null)
            {
                m = Regex.Match(line,
                    @"^(?<q>\d{1,4})\s*[x@]\s*(?<d>[A-Za-z][^@]{3,120}?)\s*@\s*(?<p>\d[\d\s,]*(?:\.\d{1,2})?)\s*$");
                if (m.Success)
                    hit = BuildLine(m.Groups["d"].Value, m.Groups["q"].Value, m.Groups["p"].Value, null);
            }

            if (hit is null) continue;
            var key = hit.Description + "|" + hit.Quantity + "|" + hit.UnitPrice;
            if (!seen.Add(key)) continue;
            results.Add(hit);
            if (results.Count >= 50) break;
        }
        return results;
    }

    private static QuoteLineExtract? BuildLine(string descRaw, string? qtyRaw, string? priceRaw, string? amountRaw)
    {
        var desc = Regex.Replace(descRaw.Trim(), @"\s{2,}", " ").Trim().TrimEnd('-', ':', '|', ',', ';');
        desc = Regex.Replace(desc, @"^\d+[\.)]\s*", "");
        if (desc.Length < 3 || desc.Length > 200) return null;
        if (Regex.IsMatch(desc, @"^(?:total|subtotal|sub\s*total|vat|tax|discount|grand\s*total|amount\s*due|balance|invoice\s*total|quote\s*total)$", RegexOptions.IgnoreCase))
            return null;

        double qty = 1;
        if (!string.IsNullOrWhiteSpace(qtyRaw))
        {
            if (!double.TryParse(qtyRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out qty) || qty <= 0 || qty > 100000)
                qty = 1;
        }

        decimal? unit = null;
        if (!string.IsNullOrWhiteSpace(priceRaw) && TryParseMoney(priceRaw, out var p) && p >= 0 && p <= 10_000_000)
            unit = p;

        decimal? amount = null;
        if (!string.IsNullOrWhiteSpace(amountRaw) && TryParseMoney(amountRaw, out var a) && a >= 0 && a <= 50_000_000)
            amount = a;

        if (unit is null && amount is null) return null;
        if (unit is null && amount.HasValue)
            unit = qty > 0 ? Math.Round(amount.Value / (decimal)qty, 2) : amount;
        if (amount is null && unit.HasValue)
            amount = Math.Round(unit.Value * (decimal)qty, 2);

        return new QuoteLineExtract(desc, qty, unit, amount);
    }

    private static string CleanLabelValue(string v)
    {
        var s = Regex.Replace(v.Trim(), @"\s{2,}", " ");
        s = s.Trim().TrimEnd('.', ';', ',');
        return s;
    }

    private async Task<QuoteExtractOut> ExtractQuoteFromFileAsync(byte[] bytes, string fileName, int? storedFileId = null)
    {
        var empty = new QuoteExtractOut(
            null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, false,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, storedFileId);
        var text = await ExtractDocumentTextAsync(bytes, fileName);
        try { System.IO.File.WriteAllText(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "last_extract.txt"), text ?? ""); } catch {}
        if (string.IsNullOrWhiteSpace(text)) return empty with { StoredFileId = storedFileId };
        text = text.Replace("\uFEFF", "").Trim();

        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n').Select(l => l.Trim()).ToList();
        var nonEmpty = lines.Where(l => l.Length > 0).ToList();

        string? Grab(string pattern, int group = 1)
        {
            var m = Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            return m.Success && m.Groups[group].Success ? CleanLabelValue(m.Groups[group].Value) : null;
        }

        var fieldPatterns = new (string Key, string Pattern)[]
        {
            // Quote number: supports 26/00720 slash form from the sample PDF as well as QUO- style
            ("quoteNumber", @"(?i)\bquote\s*#\s*([0-9]{1,4}/[0-9]{2,10})\b"),
            ("quoteNumber", @"(?i)\b(?:quotation|quote|quo)\s*(?:no\.?|number|#|ref(?:erence)?)?\s*[:\-#]?\s*([0-9]{1,4}/[0-9]{2,10})\b"),
            ("quoteNumber", @"(?i)\b(?:quotation|quote|quo)\s*(?:no\.?|number|#|ref(?:erence)?)\s*[:\-#]\s*([A-Za-z0-9][A-Za-z0-9\-/]{2,30})"),
            ("quoteNumber", @"(?i)\b(?:quotation|quote)\s*[:\-#]\s*([A-Za-z]{2,8}-[A-Za-z0-9\-]{2,20})"),
            ("documentRef", @"(?i)\b(?:our\s*ref|your\s*ref|ref(?:erence)?|doc(?:ument)?\s*(?:no|ref))\s*[:\-#]\s*([A-Za-z0-9][A-Za-z0-9\-/]{1,30})"),
            ("date", @"(?i)\b(?:date|quoted?\s*on|issued(?:\s*on)?|document\s*date)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{1,2},?\s+\d{4})"),
            ("expiryDate", @"(?i)\b(?:expiry|expires?|valid\s*(?:until|to|through|till)|offer\s*valid|quote\s*valid|validity)\s*(?:date)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4})"),
            // Customer name: value must start with letter (not company address 21566...) — captures until next label
            ("customer", @"(?i)customer\s*name\s*[:\t]*\s*([A-Za-z][^\n]{2,80}?)(?=\s{2,}customer\s+(?:address|vat|tin|contact|email)|\s*\n|$)"),
            ("customer", @"(?i)\b(?:prepared\s+for|quoted?\s+to|bill\s*to|sold\s+to|ship\s+to|client|customer|customer\s*name|for\s+the\s+account\s+of)\s*[:\-]\s*([^\n]{3,100})"),
            ("customer", @"(?i)^(?:to)\s*:\s*([A-Za-z][^\n]{3,100})$"),
            ("customerAddress", @"(?i)customer\s+address\s*[:\t]*\s*([A-Za-z0-9][^\n]{2,120}?)(?=\s{2,}customer\s+(?:vat|tin|contact|email)|\s*\n|$)"),
            ("customerVat", @"(?i)customer\s+vat\s*[:\t]*\s*([A-Za-z0-9][A-Za-z0-9\-/]{4,20})"),
            ("customerTin", @"(?i)customer\s+tin\s*[:\t]*\s*([A-Za-z0-9][A-Za-z0-9\-/]{4,20})"),
            ("customerContact", @"(?i)customer\s+contact\s*[:\t]*\s*([^\n]{2,80}?)(?=\s{2,}customer\s+email|\s*\n|$)"),
            ("customerEmail", @"(?i)customer\s+email\s*[:\t]*\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"),
            ("attention", @"(?i)\b(?:attention|attn|kind\s*attn|contact\s+person|for\s+the\s+attention\s+of)\s*(?:of)?\s*[:\-]\s*([^\n]{3,80})"),
            ("subject", @"(?i)\b(?:subject|re)\s*[:\-]\s*([^\n]{4,160})"),
            ("title", @"(?i)\b(?:quotation\s+(?:for|on|to\s+do|regarding)|quote\s+for|scope\s+of\s+works?|project\s*(?:name|title)?)\s*[:\-]?\s*([^\n]{4,160})"),
            ("project", @"(?i)\b(?:project|site\s*name|job\s*title|works?\s+at)\s*(?:name|title|no)?\s*[:\-]\s*([^\n]{3,120})"),
            ("companyPhone", @"(?i)\b(?:phone)\s*[:\-]?\s*(\+?[0-9][0-9\s\-()]{6,20})"),
            ("companyEmail", @"(?i)\b(?:e-?mail)\s*[:\-]?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"),
            ("companyAddress", @"(?i)\b\d{3,5}\s+[^\n]{5,80}(?:road|street|avenue|area|industrial|drive)[^\n]{0,40}"),
            // Supplier/company VAT/TIN — only when NOT prefixed by Customer (customer VAT is separate)
            ("companyVatNo", @"(?i)(?<!customer\s)vat\s*no\.?\s*[:\-]?\s*(\d{8,12})\b"),
            ("companyTinNo", @"(?i)(?<!customer\s)tin\s*no\.?\s*[:\-]?\s*(\d{8,12})\b"),
            ("vatNumber", @"(?i)(?<!customer\s)vat\s*(?:no\.?|number|#|reg|registration)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-/]{4,20})"),
            ("tinNumber", @"(?i)(?<!customer\s)tin\s*(?:no\.?|number|#)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-/]{4,20})"),
            // Bank details — kept separate so account numbers never bleed into VAT
            ("bankName", @"(?i)\bbank\s*[:\-]\s*([A-Za-z][A-Za-z0-9 .&()\-]{1,40})"),
            ("bankBranch", @"(?i)\bbranch\s*[:\-]\s*([A-Za-z][A-Za-z0-9 .&()\-]{1,40})"),
            ("bankAccountName", @"(?i)\baccount\s*name\s*[:\-]\s*([A-Za-z][^\n]{1,80})"),
            ("bankAccountNumber", @"(?i)\baccount\s*number\s*[:\-]?\s*(\d{10,16})\b"),
            ("currency", @"(?i)\b(?:currency|prices?\s+in|amounts?\s+in)\s*[:\-]?\s*(USD|US\$|ZW\$|ZWL|EUR|GBP|Rand|ZAR)\b"),
            ("paymentTerms", @"(?i)\bwe\s+require\s+([^\n]{5,150})"),
            ("paymentTerms", @"(?i)\b(?:payment\s*(?:terms|method|policy)|terms\s+of\s+payment|bank\s+details|banking\s+details)\s*[:\-]\s*([^\n]{5,200})"),
            ("validityText", @"(?i)\bquotation\s+is\s+valid\s+for\s+([^\n]{3,60})"),
            ("validityText", @"(?i)\bvalid\s*(?:for|until|to)\s+([^\n]{3,60})"),
            ("subtotal", @"(?i)subtotal\s+usd\s*(\d[\d\s,]*(?:\.\d{1,2})?)"),
            ("discountPercent", @"(?i)\b(?:discount|less\s+discount)\b[^%\d]{0,20}(\d{1,2}(?:\.\d{1,2})?)\s*%"),
            ("discountAmount", @"(?i)\b(?:discount|less\s+discount)\b[^\d]{0,12}(?:US\$|USD|\$|ZW\$)?\s*(\d[\d\s,]*(?:\.\d{1,2})?)"),
            ("taxPercent", @"(?i)\bvat\s*(?:@|at)?\s*[^%\d]{0,16}(\d{1,2}(?:\.\d{1,2})?)\s*%"),
            ("taxAmount", @"(?i)vat\s+total\s+usd\s*(\d[\d\s,]*(?:\.\d{1,2})?)"),
            ("total", @"(?i)\bgrand\s+total\b[^\d]{0,20}(?:US\$|USD|\$|ZW\$)?\s*(\d[\d\s,]*(?:\.\d{1,2})?)"),
            ("total", @"(?i)(?<!vat\s)total\s+usd\b[^\d]{0,8}(\d[\d\s,]*(?:\.\d{1,2})?)"),
            ("total", @"(?i)(?<!vat\s)(?<!subtotal\s)total\b[^\d]{0,20}USD\s*(\d[\d\s,]*(?:\.\d{1,2})?)"),
        };

        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, pattern) in fieldPatterns)
        {
            if (fields.ContainsKey(key)) continue;
            var v = Grab(pattern);
            if (!string.IsNullOrWhiteSpace(v) && v.Length <= 220)
                fields[key] = v;
        }

        if (!fields.ContainsKey("total"))
        {
            var matches = Regex.Matches(text, @"(?:us\$|usd|\$)\s*(\d[\d\s,]*(?:\.\d{1,2})?)", RegexOptions.IgnoreCase);
            if (matches.Count > 0 && TryParseMoney(matches[^1].Groups[1].Value, out var lastUsd))
                fields["total"] = lastUsd.ToString(CultureInfo.InvariantCulture);
        }
        // Currency fallback: totals explicitly say USD/ZWG in the sample (Subtotal USD 1,070.30)
        if (!fields.ContainsKey("currency"))
        {
            var cm = Regex.Match(text, @"\b(USD|US\$|ZW\$|ZWL|ZWG)\b", RegexOptions.IgnoreCase);
            if (cm.Success) fields["currency"] = cm.Groups[1].Value.ToUpperInvariant().Replace("US$", "USD").Replace("ZW$", "ZWG");
        }
        // Second bank account number (ZWG) appears on next line after first — collect all account numbers
        if (fields.ContainsKey("bankAccountNumber"))
        {
            var allAcc = Regex.Matches(text, @"(?i)\baccount\s*number\s*[:\-]?\s*(\d{10,16})|\b(\d{13})\s*\(?\s*(?:USD|ZWG)\s*\)?", RegexOptions.IgnoreCase);
            var nums = allAcc.SelectMany(m => m.Groups.Cast<Group>().Skip(1).Where(g => g.Success && g.Value.Length >= 10).Select(g => g.Value)).Distinct().ToList();
            // Fallback: grab all 13-digit bank numbers near Bank section
            if (nums.Count == 0)
            {
                nums = Regex.Matches(text, @"\b\d{13}\b").Select(m => m.Value).ToList();
                // filter out VAT-like 9-digit numbers
                nums = nums.Where(n => n.Length == 13).ToList();
            }
            if (nums.Count >= 1 && !fields.ContainsKey("bankAccountNumber"))
                fields["bankAccountNumber"] = nums[0];
            if (nums.Count == 1 && nums[0].Length == 13 && !fields.ContainsKey("bankAccountNumber"))
                fields["bankAccountNumber"] = nums[0];
            if (nums.Count >= 2)
            {
                if (!fields.ContainsKey("bankAccountNumber")) fields["bankAccountNumber"] = nums[0];
                if (!fields.ContainsKey("bankAccountNumberZwg")) fields["bankAccountNumberZwg"] = nums[1];
                // Also expose ZWG separately if 9140002298820 appears
                if (nums.Count >= 2 && !fields.ContainsKey("bankAccountNumberZwg"))
                    fields["bankAccountNumberZwg"] = nums[1];
            }
            // If we have two distinct 9140... numbers, ensure ZWG key
            var bankNums = Regex.Matches(text, @"\b914\d{10}\b").Select(m => m.Value).Distinct().ToList();
            if (bankNums.Count >= 1 && string.IsNullOrWhiteSpace(Get("bankAccountNumber")))
                fields["bankAccountNumber"] = bankNums[0];
            if (bankNums.Count >= 2 && string.IsNullOrWhiteSpace(Get("bankAccountNumberZwg")))
                fields["bankAccountNumberZwg"] = bankNums[1];
        }
        else
        {
            // No bankAccountNumber from pattern — try direct 13-digit bank numbers in Bank section
            var bankNums = Regex.Matches(text, @"\b914\d{10}\b").Select(m => m.Value).Distinct().ToList();
            if (bankNums.Count >= 1) fields["bankAccountNumber"] = bankNums[0];
            if (bankNums.Count >= 2) fields["bankAccountNumberZwg"] = bankNums[1];
        }

        // Clean up blank customer fields that captured next label as value (e.g. "Customer" when blank)
        foreach(var kk in new[]{"customerVat","customerTin","customerContact","customerAddress"})
        {
            if(fields.TryGetValue(kk, out var vv) && Regex.IsMatch(vv.Trim(), @"(?i)^customer(\s|$)"))
                fields.Remove(kk);
        }
        if(fields.TryGetValue("customerContact", out var cc2) && Regex.IsMatch(cc2.Trim(), @"(?i)^(customer\s*email|total|subtotal|description|quantity|vat\s*total|tin\s*no|phone|email)$"))
            fields.Remove("customerContact");

        decimal? ToDec(string key) => fields.TryGetValue(key, out var raw) && TryParseMoney(raw, out var d) ? d : null;
        string? Get(string key) => fields.TryGetValue(key, out var v) ? v : null;

        var quoteNumber = Get("quoteNumber")
            ?? Grab(@"(?:quotation|quote)\s*(?:no\.?|number|#|ref(?:erence)?)?\s*[:\-#]?\s*([A-Za-z]{2,8}-[A-Za-z0-9\-]{2,20})")
            ?? Grab(@"\b(QUO-[A-Za-z0-9-]+)\b")
            ?? Grab(@"\b(\d{1,4}/\d{2,10})\b");

        string? quoteDate = null, expiryDate = null;
        if (Get("date") is { } qdRaw && TryParseDate(qdRaw, out var qd)) quoteDate = qd.ToString("yyyy-MM-dd");
        if (Get("expiryDate") is { } exRaw && TryParseDate(exRaw, out var ed)) expiryDate = ed.ToString("yyyy-MM-dd");
        if (quoteDate is null)
        {
            var firstDate = Regex.Match(text, @"\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4})\b", RegexOptions.IgnoreCase);
            if (firstDate.Success && TryParseDate(firstDate.Groups[1].Value, out var fd)) quoteDate = fd.ToString("yyyy-MM-dd");
        }
        // Derive expiry from "valid for 7 Days" if not explicitly dated
        if (expiryDate is null && quoteDate != null)
        {
            var vm = Regex.Match(text, @"(?i)valid\s+for\s+(\d+)\s*days?");
            if (vm.Success && int.TryParse(vm.Groups[1].Value, out var days) && TryParseDate(quoteDate, out var qd2))
                expiryDate = qd2.AddDays(days).ToString("yyyy-MM-dd");
            else if (Get("validityText") is { } vt)
            {
                var m2 = Regex.Match(vt, @"(\d+)");
                if (m2.Success && int.TryParse(m2.Groups[1].Value, out var d2) && TryParseDate(quoteDate, out var qd3))
                    expiryDate = qd3.AddDays(d2).ToString("yyyy-MM-dd");
            }
        }

        var subtotal = ToDec("subtotal");
        var discountPct = ToDec("discountPercent");
        var discountAmt = ToDec("discountAmount");
        var taxPct = ToDec("taxPercent");
        var taxAmt = ToDec("taxAmount");
        var total = ToDec("total");
        // Guard: a 13-digit bank account must never be mistaken for a tax amount — real VAT Total is 165.90 not 914...
        if (taxAmt != null && fields.ContainsKey("bankAccountNumber"))
        {
            var rawTax = Get("taxAmount") ?? "";
            if (fields.ContainsKey("bankAccountNumber") && rawTax.Contains(fields["bankAccountNumber"]))
            { fields.Remove("taxAmount"); taxAmt = null; }
            if (fields.ContainsKey("bankAccountNumberZwg") && rawTax.Contains(fields["bankAccountNumberZwg"]))
            { fields.Remove("taxAmount"); taxAmt = null; }
        }
        if (taxPct is null && taxAmt is not null && subtotal is > 0 && discountPct is null)
            taxPct = Math.Round(100m * taxAmt.Value / subtotal.Value, 2);
        if (taxPct is null && taxAmt is null)
            taxPct = 15.5m;
        // Robust totals: bottom USD amounts are Total/Subtotal/VAT when labels are separate
        var bottomUsd = Regex.Matches(text, @"USD\s*(\d[\d\s,]*\.\d{1,2})", RegexOptions.IgnoreCase)
            .Select(m => TryParseMoney(m.Groups[1].Value, out var v) ? v : (decimal?)null)
            .Where(v => v.HasValue).Select(v => v!.Value).ToList();
        try { System.IO.File.WriteAllText(System.IO.Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.Desktop), "bottomUsd.txt"), $"count {bottomUsd.Count} vals {string.Join(",", bottomUsd)} hasUSD {text.Contains("USD")} sub {subtotal} tax {taxAmt} tot {total}"); } catch {}
        if (bottomUsd.Count >= 3)
        {
            bottomUsd.Sort();
            var vatFromBottom = bottomUsd[0];
            var subFromBottom = bottomUsd[1];
            var totFromBottom = bottomUsd[2];
            subtotal = subFromBottom; fields["subtotal"] = subFromBottom.ToString(CultureInfo.InvariantCulture);
            taxAmt = vatFromBottom; fields["taxAmount"] = vatFromBottom.ToString(CultureInfo.InvariantCulture);
            total = totFromBottom; fields["total"] = totFromBottom.ToString(CultureInfo.InvariantCulture);
        }
        else if (total != null && subtotal != null && total <= subtotal)
        {
            var allUsd = bottomUsd;
            if (allUsd.Count > 0)
            {
                var max = allUsd.Max();
                if (max > subtotal) { total = max; fields["total"] = max.ToString(CultureInfo.InvariantCulture); }
            }
        }

        string? companyName = null;
        // Generic company detection: look for header lines with company suffixes or all-caps names in first 15 lines
        foreach (var l in nonEmpty.Take(15))
        {
            if (l.Length is < 4 or > 90) continue;
            if (Regex.IsMatch(l, @"^(?:date|ref|quotation|quote|invoice|tel|phone|email|vat|tin|customer|address|bill|p\.?o\.?|http|www\.|page)", RegexOptions.IgnoreCase)) continue;
            if (Regex.IsMatch(l, @"(?i)bill\s*to|customer|client|ship\s*to")) continue;
            if (Get("customer") is { } c && NormName(l).Contains(NormName(c))) continue;
            if (Get("title") is { } tval && NormName(l) == NormName(tval)) continue;
            if (Regex.IsMatch(l, @"\d{5,}") && Regex.IsMatch(l, @"street|road|avenue|drive|p\.o|box", RegexOptions.IgnoreCase)) continue;
            var isCompanyLike = Regex.IsMatch(l, @"(?i)\b(pvt|ltd|inc|trading|enterprise|company|corporation|group)\b");
            if (isCompanyLike)
            {
                companyName = Regex.Replace(l, @"\s{2,}", " ").Trim();
                // If next line also looks like company continuation (e.g. EXTREME FIRE DESIGN INC), append it
                var idx = nonEmpty.IndexOf(l);
                if (idx >= 0 && idx + 1 < nonEmpty.Count)
                {
                    var nxt = nonEmpty[idx + 1];
                    if (nxt.Length is >= 4 and <= 90 && Regex.IsMatch(nxt, @"(?i)extreme|fire|design|inc|ltd") && !Regex.IsMatch(nxt, @"^(?:date|vat|tin|phone|email)", RegexOptions.IgnoreCase))
                        companyName = (companyName + " " + nxt).Trim();
                }
                break;
            }
        }

        var phone = Get("customerContact");
        var email = Get("customerEmail");
        var address = Get("customerAddress");
        var companyPhoneVal = Get("companyPhone");
        var companyEmailVal = Get("companyEmail");
        var docCustomer = Get("customer");
        if (!string.IsNullOrWhiteSpace(docCustomer) && Regex.IsMatch(docCustomer, @"(?i)damofalls|industrial|ruwa|21566|email:|phone:"))
            docCustomer = null;
        // Robust customer table: value is to the right of label at similar Y — coordinate path removed (words out of scope), fallback below handles it
        if (string.IsNullOrWhiteSpace(docCustomer))
        {
            var idx = nonEmpty.FindIndex(l => Regex.IsMatch(l, @"(?i)customer\s*name"));
            if (idx >= 0)
            {
                var line = nonEmpty[idx];
                var mSame = Regex.Match(line, @"(?i)customer\s*name\s*[:\|\t]*\s*(.+)");
                if (mSame.Success)
                {
                    var cand = CleanLabelValue(mSame.Groups[1].Value);
                    if (cand.Length >= 3 && !Regex.IsMatch(cand, @"(?i)^customer\s*(address|vat|tin|contact|email)"))
                        docCustomer = cand;
                }
                if (string.IsNullOrWhiteSpace(docCustomer) && idx + 1 < nonEmpty.Count)
                {
                    var nxt = nonEmpty[idx + 1].Trim();
                    if (nxt.Length >= 3 && !Regex.IsMatch(nxt, @"(?i)^customer\s*(address|vat|tin|contact|email|name)") && !Regex.IsMatch(nxt, @"^(?:date|vat|tin|phone|email|address|quotation|quote|21566)\b", RegexOptions.IgnoreCase))
                        docCustomer = CleanLabelValue(nxt);
                }
                if (string.IsNullOrWhiteSpace(docCustomer) && idx > 0)
                {
                    var prev = nonEmpty[idx - 1].Trim();
                    if (prev.Length >= 3 && !Regex.IsMatch(prev, @"(?i)^customer\s*|^(?:date|vat|tin|phone|email|address|quotation|quote|salvis|extreme)\b", RegexOptions.IgnoreCase) && !Regex.IsMatch(prev, @"^\d{4,}.*(?:road|area)"))
                        docCustomer = CleanLabelValue(prev);
                }
            }
            if (string.IsNullOrWhiteSpace(docCustomer))
            {
                var addrIdx = nonEmpty.FindIndex(l => Regex.IsMatch(l, @"(?i)customer\s*address"));
                if (addrIdx > 0)
                {
                    var prev = nonEmpty[addrIdx - 1].Trim();
                    if (prev.Length >= 3 && !Regex.IsMatch(prev, @"(?i)customer\s*name|quotation|quote|date|vat|tin|phone|email") && !Regex.IsMatch(prev, @"^\d"))
                        docCustomer = CleanLabelValue(prev);
                }
            }
        }
        string? title = Get("subject") ?? Get("title") ?? Get("project");
        if (title != null && (Regex.IsMatch(title, @"(?i)^[A-Z0-9\s\.\&\-]+(P\/T|LTD|INC|PVT|TRADING).{0,30}$") || Regex.IsMatch(title, @"\b\d{4,}\b.*(?:road|street|avenue|area|industrial|box|phone|email)", RegexOptions.IgnoreCase)))
            title = null;
        if (title is null)
        {
            var qIdx = nonEmpty.FindIndex(l => Regex.IsMatch(l, @"^(?:quotation|quote|proforma|offer)\b", RegexOptions.IgnoreCase));
            if (qIdx >= 0 && qIdx + 1 < nonEmpty.Count)
            {
                var next = nonEmpty[qIdx + 1];
                if (next.Length is >= 4 and <= 160 && Regex.IsMatch(next, "[A-Za-z]{4,}")
                    && !Regex.IsMatch(next, @"^(?:date|expiry|expires?|valid|ref|page|no\.?|#|to|from|prepared|bill|discount|subtotal|sub\s*total|vat|tax|grand|total)", RegexOptions.IgnoreCase)
                    && !Regex.IsMatch(next, @"\b\d{4,}\b") && !Regex.IsMatch(next, @"(?i)phone|email|@|road|street|avenue|area|industrial"))
                    title = next;
            }
        }
        if (title is null)
        {
            title = nonEmpty.FirstOrDefault(l =>
                l.Length is >= 6 and <= 160
                && Regex.IsMatch(l, "[A-Za-z]{4,}")
                && !Regex.IsMatch(l, @"\b\d{4,}\b.*(?:road|street|avenue|area|industrial|phone|email|@)", RegexOptions.IgnoreCase)
                && !Regex.IsMatch(l, @"^(?:date|expiry|expires?|valid|ref|page|tel|fax|email|vat|total|subtotal|quantity|description|quotation|quote|invoice|prepared|customer|bill\s*to|phone|address|attention|currency|payment|discount|grand|tax|tin|project)", RegexOptions.IgnoreCase)
                && (string.IsNullOrWhiteSpace(docCustomer) || !NormName(l).Contains(NormName(docCustomer))) );
        }
        if (title != null) title = Regex.Replace(title, @"\s{2,}", " ").Trim();

        var custAddress = Get("customerAddress") ?? Get("companyAddress");
        // Generic fallback: any "Address:" line is likely customer if Customer Address label was missing (e.g. Bill To format)
        if (string.IsNullOrWhiteSpace(custAddress))
            custAddress = Grab(@"(?i)\baddress\s*[:\-]\s*([^\n]{5,120})");
        if (string.IsNullOrWhiteSpace(custAddress))
        {
            var aIdx = nonEmpty.FindIndex(l => Regex.IsMatch(l, @"(?i)customer\s*address"));
            if (aIdx >= 0 && aIdx + 1 < nonEmpty.Count)
            {
                var nxt = nonEmpty[aIdx + 1].Trim();
                if (nxt.Length >= 3 && !Regex.IsMatch(nxt, @"(?i)customer\s*(vat|tin|contact|email|name)") )
                    custAddress = CleanLabelValue(nxt);
                // Address may be split across two lines in the table
                if (aIdx + 2 < nonEmpty.Count)
                {
                    var nxt2 = nonEmpty[aIdx + 2].Trim();
                    if (nxt2.Length >= 3 && !Regex.IsMatch(nxt2, @"(?i)^customer\s*(vat|tin|contact|email|name)") && !Regex.IsMatch(nxt2, @"^(?:vat|tin|phone|email|total|subtotal)\b", RegexOptions.IgnoreCase))
                        custAddress = (custAddress + " " + nxt2).Trim();
                }
            }
        }
        var custVat = Get("customerVat");
        var custTin = Get("customerTin");
        var custContact = Get("customerContact");
        var companyVatNo = Get("companyVatNo");
        var companyTinNo = Get("companyTinNo");
        // Never treat a bank account number as VAT: if vat looks like 13-digit account, discard it
        if (companyVatNo != null && Regex.IsMatch(companyVatNo, @"^\d{13}$") && Regex.IsMatch(companyVatNo, @"^914"))
            companyVatNo = null;
        var bankName = Get("bankName");
        var bankBranch = Get("bankBranch");
        var bankAccountName = Get("bankAccountName");
        var bankAccountNumber = Get("bankAccountNumber");
        var bankAccountNumberZwg = Get("bankAccountNumberZwg");
        var validityText = Get("validityText");
        // If validityText not captured via pattern, try "Our Quotation is valid for 7 Days"
        if (string.IsNullOrWhiteSpace(validityText))
        {
            var vm = Regex.Match(text, @"(?i)quotation\s+is\s+valid\s+for\s+([^\n]{3,40})");
            if (vm.Success) validityText = CleanLabelValue(vm.Groups[1].Value);
        }

        var linesOut = ExtractQuoteLines(text);
        if (linesOut.Count == 0)
        {
            var amount = subtotal ?? total;
            if (amount is > 0)
                linesOut.Add(new QuoteLineExtract(title ?? "As per quoted document", 1, amount.Value, amount.Value));
        }

        var matchHay = !string.IsNullOrWhiteSpace(docCustomer) ? docCustomer! : (title ?? "");
        int? matchedId = null; string? matchedNumber = null; string? matchedName = null; int? matchScore = null;
        if (!string.IsNullOrWhiteSpace(docCustomer) || !string.IsNullOrWhiteSpace(title))
        {
            var companies = await _db.Customers.AsNoTracking()
                .Where(c => !string.IsNullOrWhiteSpace(c.Name) && !c.Name.StartsWith("Walk-in"))
                .Select(c => new { c.Id, c.CustomerId, c.Name })
                .ToListAsync();
            var best = companies
                .Select(c => new { c.Id, c.CustomerId, c.Name, Score = NameMatchScore(c.Name, matchHay) })
                .Where(x => x.Score >= 70)
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Name.Length)
                .FirstOrDefault();
            if (best != null)
            {
                matchedId = best.Id;
                matchedNumber = best.CustomerId;
                matchedName = best.Name;
                matchScore = best.Score;
            }
        }

        var preview = Regex.Replace(text, @"\s+", " ").Trim();
        if (preview.Length > 800) preview = preview[..800] + "…";

        return new QuoteExtractOut(
            quoteNumber, quoteDate, expiryDate,
            subtotal, discountPct, discountAmt, taxPct, taxAmt, total,
            companyVatNo, companyTinNo, title,
            matchedName ?? docCustomer,
            matchedId, matchedNumber, matchScore,
            preview,
            docCustomer, phone, email, custAddress,
            linesOut,
            matchedId != null,
            companyName, Get("attention"), Get("project"), Get("currency"),
            Get("paymentTerms"), Get("documentRef") ?? Get("quoteNumber"),
            custAddress, custVat, custTin, custContact,
            companyVatNo, companyTinNo, bankName, bankBranch, bankAccountName,
            bankAccountNumber, bankAccountNumberZwg, validityText,
            fields,
            storedFileId);
    }

    private async Task<OpsQuotationFile> SaveInboxFileAsync(IFormFile file, string? uploadedBy)
    {
        var dir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "uploads", "quotations", "inbox");
        Directory.CreateDirectory(dir);
        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext)) ext = ".bin";
        var fileName = $"{Guid.NewGuid():N}{ext}";
        var full = Path.Combine(dir, fileName);
        await using (var stream = System.IO.File.Create(full))
        {
            await file.CopyToAsync(stream);
        }
        var f = new OpsQuotationFile
        {
            QuotationId = null,
            Name = string.IsNullOrWhiteSpace(file.FileName) ? "Document" : Path.GetFileName(file.FileName),
            FilePath = $"/uploads/quotations/inbox/{fileName}",
            SizeBytes = file.Length,
            UploadedBy = string.IsNullOrWhiteSpace(uploadedBy) ? CurrentUser : uploadedBy,
        };
        _db.OpsQuotationFiles.Add(f);
        await _db.SaveChangesAsync();
        return f;
    }

    private async Task AttachInboxFileToQuoteAsync(OpsQuotationFile f, OpsQuotation q)
    {
        if (!string.IsNullOrEmpty(f.FilePath))
        {
            var oldFull = Path.Combine(_env.ContentRootPath, "wwwroot", f.FilePath.TrimStart('/'));
            var dir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "uploads", "quotations", q.QuotationNumber);
            Directory.CreateDirectory(dir);
            var ext = Path.GetExtension(oldFull);
            if (string.IsNullOrEmpty(ext)) ext = ".bin";
            var newFileName = $"{Guid.NewGuid():N}{ext}";
            var newFull = Path.Combine(dir, newFileName);
            if (System.IO.File.Exists(oldFull))
            {
                System.IO.File.Move(oldFull, newFull, overwrite: true);
                f.FilePath = $"/uploads/quotations/{q.QuotationNumber}/{newFileName}";
            }
        }
        f.QuotationId = q.Id;
        f.UploadedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    // Keep the customer profile's service history in step with completed job
    // work. That history is a separate register from Inspections / Refills /
    // Maintenance, so task fan-out alone does not populate its equipment and
    // quantity totals. A stable job marker makes edits idempotent without a
    // schema migration or duplicate customer service rows.
    private async Task SyncCustomerServiceSummaryAsync(JobCard job)
    {
        if (!job.CustomerId.HasValue) return;
        var marker = $"[EFESMS job:{job.Id}]";
        var service = await _db.ServiceRecords.FirstOrDefaultAsync(s => s.Notes != null && s.Notes.Contains(marker));
        var isComplete = job.Status is JobCardStatus.Completed or JobCardStatus.Closed;
        if (!isComplete && service == null) return;

        if (service == null)
        {
            service = new ServiceRecord { CustomerId = job.CustomerId.Value };
            _db.ServiceRecords.Add(service);
        }
        var tasks = await _db.JobCardTasks.AsNoTracking().Where(t => t.JobCardId == job.Id).ToListAsync();
        var countedTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { JobTaskTypes.Service, JobTaskTypes.Refill, JobTaskTypes.Inspection, JobTaskTypes.Assessment, JobTaskTypes.Maintenance };
        static int QuantityFor(JobCardTask t)
        {
            var tracked = ParseEquipmentIds(t.EquipmentIds).Count;
            return tracked > 0 ? tracked : (int)Math.Ceiling(t.Quantity);
        }

        var workTasks = tasks.Where(t => countedTypes.Contains(t.TaskType)).ToList();
        var legacyWorkType = tasks.Count == 0 && countedTypes.Contains(job.JobType);
        var equipmentServiced = legacyWorkType
            ? Math.Max(1, job.UnitCount)
            : workTasks.Sum(QuantityFor);
        var equipmentAdded = tasks.Where(t => t.TaskType == JobTaskTypes.Supply).Sum(QuantityFor);
        var inventoryIds = tasks.Where(t => t.TaskType == JobTaskTypes.Supply && t.InventoryItemId.HasValue)
            .Select(t => t.InventoryItemId!.Value).Distinct().ToList();
        var inventoryNames = inventoryIds.Count == 0
            ? new Dictionary<int, string>()
            : await _db.InventoryItems.AsNoTracking().Where(i => inventoryIds.Contains(i.Id))
                .ToDictionaryAsync(i => i.Id, i => i.Name);
        var materials = tasks.Select(t =>
        {
            var quantity = QuantityFor(t);
            var itemName = t.TaskType == JobTaskTypes.StoreSupply ? t.StoreItemName : t.TaskType == JobTaskTypes.Supply && t.InventoryItemId.HasValue
                && inventoryNames.TryGetValue(t.InventoryItemId.Value, out var name) ? name : null;
            var detail = string.Join(" / ", new[] { t.AgentType, t.UnitType, itemName }
                .Where(part => !string.IsNullOrWhiteSpace(part)).Distinct(StringComparer.OrdinalIgnoreCase));
            return $"{t.TaskType}: {quantity} × {(string.IsNullOrWhiteSpace(detail) ? "unit(s)" : detail)}";
        }).ToList();
        if (legacyWorkType)
            materials.Add($"{job.JobType}: {equipmentServiced} × {job.AgentType ?? "unit(s)"}");

        service.SiteId = job.SiteId;
        service.CustomerId = job.CustomerId.Value;
        service.ServiceDate = job.CompletedAt ?? job.PlannedStart ?? DateTime.UtcNow;
        service.Status = job.Status switch
        {
            JobCardStatus.Completed or JobCardStatus.Closed => ServiceStatus.Completed,
            JobCardStatus.InProgress => ServiceStatus.InProgress,
            JobCardStatus.Cancelled => ServiceStatus.Cancelled,
            _ => ServiceStatus.Scheduled,
        };
        service.UnitsServiced = equipmentServiced;
        service.EquipmentServiced = equipmentServiced;
        service.EquipmentAdded = equipmentAdded;
        service.MaterialsUsed = materials.Count == 0 ? null : TrimTo(string.Join("; ", materials), 2000);
        service.DefectsFound = tasks.Where(t => countedTypes.Contains(t.TaskType) && !string.IsNullOrWhiteSpace(t.Notes))
            .Select(t => t.Notes!.Trim()).Distinct().ToList() is { Count: > 0 } findings
                ? TrimTo(string.Join("; ", findings), 2000) : null;
        service.Recommendations = string.IsNullOrWhiteSpace(job.Notes) ? null : TrimTo(job.Notes, 2000);
        service.Technician = job.AssignedTechnicianId.HasValue
            ? await _db.Technicians.AsNoTracking().Where(t => t.Id == job.AssignedTechnicianId.Value).Select(t => t.Name).FirstOrDefaultAsync()
            : null;
        service.Notes = $"{marker} Auto-recorded from {job.JobNumber} — {job.Title}";
        if (isComplete)
        {
            var customer = await _db.Customers.FindAsync(job.CustomerId.Value);
            if (customer != null)
            {
                customer.LastServiceDate = service.ServiceDate;
                customer.ServiceFrequencyMonths ??= 6;
                // The job's required date is the reminder source of truth; the six-month cycle is its safe fallback.
                customer.NextServiceDate = job.NextServiceDate ?? service.ServiceDate.AddMonths(customer.ServiceFrequencyMonths.Value);
            }
        }
        await _db.SaveChangesAsync();
    }

    private static string? TrimTo(string? value, int maxLength) =>
        string.IsNullOrEmpty(value) || value.Length <= maxLength ? value : value[..maxLength];

    // POST quotations/extract — standalone auto-fill for the New-quotation form.
    // ALWAYS persists the upload to the inbox so nothing is lost if the form is abandoned.
    [HttpPost("quotations/extract")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> ExtractQuotationUpload([FromForm] IFormFile File)
    {
        if (!CanOpsWrite) return Denied();
        if (File is null || File.Length == 0) return BadRequest(new { message = "No file received." });
        if (File.Length > 20 * 1024 * 1024) return BadRequest(new { message = "File too large — 20 MB max." });
        using var ms = new MemoryStream();
        await File.CopyToAsync(ms);
        var bytes = ms.ToArray();
        OpsQuotationFile? stored = null;
        try
        {
            stored = await SaveInboxFileAsync(File, Request.Headers["X-Uploaded-By"].FirstOrDefault());
        }
        catch
        {
            // Extraction must not block if disk write fails.
        }
        return Ok(await ExtractQuoteFromFileAsync(bytes, File.FileName ?? "", stored?.Id));
    }

    // Attach a previously inbox-stored extract file to an existing quotation (no second copy upload).
    [HttpPost("quotations/{id:int}/files/attach-inbox")]
    public async Task<IActionResult> AttachInboxQuotationFile(int id, [FromBody] AttachInboxIn body)
    {
        if (!CanOpsWrite) return Denied();
        var q = await _db.OpsQuotations.FirstOrDefaultAsync(x => x.Id == id);
        if (q is null) return NotFound();
        var inbox = await _db.OpsQuotationFiles.FirstOrDefaultAsync(x => x.Id == body.InboxFileId && x.QuotationId == null);
        if (inbox is null) return NotFound(new { message = "Inbox file not found — upload the document again." });
        await AttachInboxFileToQuoteAsync(inbox, q);
        return Ok(MapQFile(inbox));
    }

    [HttpPost("quotations/{id:int}/files")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadQuotationFile(int id, [FromForm] IFormFile File, [FromForm] string? Name, [FromForm] string? UploadedBy, [FromQuery] int? attachInboxId = null)
    {
        if (!CanOpsWrite) return Denied();
        var q = await _db.OpsQuotations.FirstOrDefaultAsync(x => x.Id == id);
        if (q is null) return NotFound();

        if (attachInboxId.HasValue)
        {
            var inbox = await _db.OpsQuotationFiles.FirstOrDefaultAsync(x => x.Id == attachInboxId.Value && x.QuotationId == null);
            if (inbox is null) return NotFound(new { message = "Inbox file not found — upload the document again." });
            await AttachInboxFileToQuoteAsync(inbox, q);
            return Ok(MapQFile(inbox));
        }

        if (File is null || File.Length == 0) return BadRequest(new { message = "No file received." });
        if (File.Length > 20 * 1024 * 1024) return BadRequest(new { message = "File too large — 20 MB max." });

        var dir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "uploads", "quotations", q.QuotationNumber);
        Directory.CreateDirectory(dir);
        var ext = Path.GetExtension(File.FileName);
        var fileName = $"{Guid.NewGuid():N}{ext}";
        var full = Path.Combine(dir, fileName);
        await using (var stream = System.IO.File.Create(full))
        {
            await File.CopyToAsync(stream);
        }
        var f = new OpsQuotationFile
        {
            QuotationId = id,
            Name = string.IsNullOrWhiteSpace(Name) ? (File.FileName ?? "Document") : Name.Trim(),
            FilePath = $"/uploads/quotations/{q.QuotationNumber}/{fileName}",
            SizeBytes = File.Length,
            UploadedBy = string.IsNullOrWhiteSpace(UploadedBy) ? CurrentUser : UploadedBy,
        };
        _db.OpsQuotationFiles.Add(f);
        await _db.SaveChangesAsync();
        return Ok(MapQFile(f));
    }

    public record AttachInboxIn(int InboxFileId);

    // List all inbox (not-yet-attached) uploads so none are lost.
    [HttpGet("quotations/inbox")]
    public async Task<IActionResult> GetQuotationInbox()
    {
        if (!CanOpsWrite) return Denied();
        var files = await _db.OpsQuotationFiles.AsNoTracking()
            .Where(f => f.QuotationId == null)
            .OrderByDescending(f => f.UploadedAt)
            .Take(200)
            .ToListAsync();
        return Ok(files.Select(MapQFile));
    }

    [HttpGet("quotations/{id:int}/files")]
    public async Task<IActionResult> GetQuotationFiles(int id)
    {
        var files = await _db.OpsQuotationFiles.AsNoTracking()
            .Where(f => f.QuotationId == id)
            .OrderByDescending(f => f.UploadedAt)
            .ToListAsync();
        return Ok(files.Select(MapQFile));
    }

    [HttpGet("quotations/{id:int}/files/{fileId:int}/download")]
    public async Task<IActionResult> DownloadQuotationFile(int id, int fileId, [FromQuery] bool inline = false)
    {
        var f = await _db.OpsQuotationFiles.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == fileId && x.QuotationId == id);
        if (f is null || string.IsNullOrEmpty(f.FilePath)) return NotFound();
        var full = Path.Combine(_env.ContentRootPath, "wwwroot", f.FilePath.TrimStart('/'));
        if (!System.IO.File.Exists(full)) return NotFound();
        var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
        if (!provider.TryGetContentType(full, out var contentType)) contentType = "application/octet-stream";
        var ext = Path.GetExtension(full);
        var name = string.IsNullOrWhiteSpace(f.Name) ? Path.GetFileName(full) : f.Name.Trim();
        if (!string.IsNullOrEmpty(ext) && !name.EndsWith(ext, StringComparison.OrdinalIgnoreCase)) name += ext;
        Response.Headers.ContentDisposition = inline
            ? $"inline; filename*=UTF-8''{Uri.EscapeDataString(name)}"
            : $"attachment; filename*=UTF-8''{Uri.EscapeDataString(name)}";
        var stream = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read);
        return File(stream, contentType, enableRangeProcessing: true);
    }

    [HttpDelete("quotations/{id:int}/files/{fileId:int}")]
    public async Task<IActionResult> DeleteQuotationFile(int id, int fileId)
    {
        if (!CanOpsWrite) return Denied();
        var f = await _db.OpsQuotationFiles.FirstOrDefaultAsync(x => x.Id == fileId && x.QuotationId == id);
        if (f is null) return NotFound();
        if (!string.IsNullOrEmpty(f.FilePath))
        {
            var full = Path.Combine(_env.ContentRootPath, "wwwroot", f.FilePath.TrimStart('/'));
            if (System.IO.File.Exists(full)) System.IO.File.Delete(full);
        }
        _db.OpsQuotationFiles.Remove(f);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("quotations/{id:int}/files/{fileId:int}/extract")]
    public async Task<IActionResult> ExtractQuotationStoredFile(int id, int fileId)
    {
        if (!CanOpsWrite) return Denied();
        var f = await _db.OpsQuotationFiles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == fileId && x.QuotationId == id);
        if (f is null || string.IsNullOrEmpty(f.FilePath)) return NotFound();
        var full = Path.Combine(_env.ContentRootPath, "wwwroot", f.FilePath.TrimStart('/'));
        if (!System.IO.File.Exists(full)) return BadRequest(new { message = "The stored file is missing on disk." });
        var bytes = await System.IO.File.ReadAllBytesAsync(full);
        return Ok(await ExtractQuoteFromFileAsync(bytes, f.FilePath, f.Id));
    }

    [HttpPost("quotations/{id:int}/send")]
    public async Task<IActionResult> SendQuotation(int id)
    {
        if (!CanOpsWrite) return Denied();
        var q = await _db.OpsQuotations.FindAsync(id);
        if (q is null) return NotFound();
        if (q.Status != "Draft") return Conflict(new { message = "Only Draft quotations can be sent." });
        if (q.ExpiryDate.Date < DateTime.UtcNow.Date) return BadRequest(new { message = "The expiry date has passed. Extend it before sending." });
        q.Status = "Sent";
        await _db.SaveChangesAsync();
        return Ok(new { q.Id, q.QuotationNumber, q.Status });
    }

    [HttpPost("quotations/{id:int}/reject")]
    public async Task<IActionResult> RejectQuotation(int id)
    {
        if (!CanOpsWrite) return Denied();
        var q = await _db.OpsQuotations.FindAsync(id);
        if (q is null) return NotFound();
        if (q.Status != "Draft" && q.Status != "Sent") return Conflict(new { message = "Only Draft or Sent quotations can be rejected." });
        q.Status = "Rejected";
        await _db.SaveChangesAsync();
        return Ok(new { q.Id, q.QuotationNumber, q.Status });
    }

    [HttpPost("quotations/{id:int}/accept")]
    public async Task<IActionResult> AcceptQuotation(int id)
    {
        if (!CanOpsWrite) return Denied();
        var q = await _db.OpsQuotations.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
        if (q is null) return NotFound();
        if (q.Status != "Draft" && q.Status != "Sent") return Conflict(new { message = "Only Draft or Sent quotations can be accepted." });
        if (q.ExpiryDate.Date < DateTime.UtcNow.Date) return BadRequest(new { message = "The quotation has expired." });
        var t = QuoteTotals(q.Lines, q.DiscountPercent, q.TaxPercent);
        var jn = await NextSequenceValue("JobNumberSequence");
        var quoteCustomer = q.CustomerId.HasValue
            ? await _db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == q.CustomerId.Value)
            : null;
        var job = new JobCard
        {
            JobNumber = $"JOB-{jn:D6}",
            CustomerId = q.CustomerId,
            SiteId = q.SiteId,
            JobType = "Service",
            Title = q.Title,
            Description = string.Join("\n", q.Lines.OrderBy(l => l.SortOrder).Select(l => $"- {l.Description} x{l.Quantity} @ {l.UnitPrice}")),
            Status = JobCardStatus.Draft,
            Priority = JobCardPriority.Normal,
            RequiredSkills = "",
            RequiredCertifications = "",
            QuotedAmount = t.Total,
            Notes = $"Converted from quotation {q.QuotationNumber}",
            Address = quoteCustomer?.BillingAddress,
            Email = quoteCustomer?.Email,
            NextServiceDate = quoteCustomer?.NextServiceDate,
            WorksDoneSatisfactorily = false,
        };
        _db.JobCards.Add(job);
        await _db.SaveChangesAsync();
        await EnsureJobWorkRecordAsync(job);
        q.Status = "Accepted";
        q.ConvertedJobId = job.Id;
        await _db.SaveChangesAsync();
        return Ok(new { q.Id, q.QuotationNumber, q.Status, jobId = job.Id, jobNumber = job.JobNumber });
    }

    [HttpDelete("quotations/{id:int}")]
    public async Task<IActionResult> DeleteQuotation(int id)
    {
        if (!IsAdmin) return Denied();
        var q = await _db.OpsQuotations.FindAsync(id);
        if (q is null) return NotFound();
        _db.OpsQuotations.Remove(q);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------- AI engine ----------

    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var jobs = await _db.JobCards.AsNoTracking().ToListAsync();
        return Ok(new
        {
            openJobs = jobs.Count(j => j.Status is JobCardStatus.Draft or JobCardStatus.Assigned or JobCardStatus.Scheduled or JobCardStatus.InProgress),
            highPriorityOpen = jobs.Count(j => j.Priority == JobCardPriority.Urgent && j.Status is JobCardStatus.Draft or JobCardStatus.Assigned or JobCardStatus.Scheduled),
            technicians = await _db.Technicians.CountAsync(),
            equipment = await _db.OpsEquipment.CountAsync(),
            inventoryLow = await _db.InventoryItems.CountAsync(i => i.CurrentStock <= i.ReorderLevel),
            overdueInvoices = await _db.OpsInvoices.CountAsync(i => i.Status == "Overdue"),
        });
    }

    [HttpPost("analyze")]
    public async Task<IActionResult> Analyze([FromBody] AnalyzeRequest? req)
    {
        var input = await BuildInputAsync(DateTime.UtcNow);
        var flags = req ?? new AnalyzeRequest(null, null, null, null, null, null, null, null);
        var output = _engine.AnalyzePartial(
            input,
            schedule: flags.Schedule ?? true,
            route: flags.Route ?? true,
            predict: flags.Predict ?? true,
            detectAnomalies: flags.DetectAnomalies ?? true,
            forecast: flags.Forecast ?? true,
            risk: flags.Risk ?? true,
            reminders: flags.Reminders ?? true,
            cluster: flags.Cluster ?? true);
        return Ok(output);
    }

    [HttpPost("analyze/full")]
    public async Task<IActionResult> AnalyzeFull()
    {
        var input = await BuildInputAsync(DateTime.UtcNow);
        return Ok(_engine.Analyze(input));
    }

    [HttpPost("voice")]
    public async Task<IActionResult> Voice([FromBody] VoiceIn? dto)
    {
        var input = await BuildInputAsync(DateTime.UtcNow);
        var output = _engine.Analyze(input);
        return Ok(FireOpsAI.Engine.VoiceCommandEngine.Process(dto?.Text ?? "", input, output));
    }

    private async Task<FireOpsAI.Contracts.EngineInput> BuildInputAsync(DateTime now)
    {
        var technicians = await _db.Technicians.AsNoTracking().ToListAsync();
        var jobs = await _db.JobCards.AsNoTracking().ToListAsync();
        var equipment = await _db.OpsEquipment.AsNoTracking().ToListAsync();
        var sites = await _db.CustomerSites.AsNoTracking().ToListAsync();
        var inventory = await _db.InventoryItems.AsNoTracking().ToListAsync();
        var inspections = await _db.OpsInspections.AsNoTracking().ToListAsync();
        var services = await _db.ServiceRecords.AsNoTracking().ToListAsync();
        var refills = await _db.OpsRefills.AsNoTracking().ToListAsync();
        var maintenance = await _db.OpsMaintenance.AsNoTracking().ToListAsync();
        var certifications = await _db.OpsCertifications.AsNoTracking().ToListAsync();
        var customers = (await _db.Customers.AsNoTracking().ToListAsync()).ToDictionary(c => c.Id);
        var invoices = await _db.OpsInvoices.AsNoTracking().ToListAsync();

        // Positions come from the site/equipment records; fall back to Harare CBD when unknown.
        var siteById = sites.ToDictionary(s => s.Id, s => s);

        return new FireOpsAI.Contracts.EngineInput
        {
            Technicians = technicians.Select(t => new FO.Technician
            {
                Id = t.Id, Name = t.Name, Email = t.Email, Phone = t.Phone, Trade = t.Trade, Vehicle = t.Vehicle,
                MaxConcurrentJobs = t.MaxConcurrentJobs, Available = t.Available, Latitude = t.Latitude, Longitude = t.Longitude,
                Skills = Split(t.Skills), Certifications = Split(t.Certifications), CertificationExpiry = t.CertificationExpiry,
                HourlyRate = t.HourlyRate, CurrentJobIds = jobs.Where(j => j.AssignedTechnicianId == t.Id).Select(j => j.Id).ToList(),
            }).ToList(),
            Jobs = jobs.Select(j => new FO.JobCard
            {
                Id = j.Id, SiteId = j.SiteId, CustomerId = j.CustomerId, EquipmentId = j.EquipmentId, Number = j.JobNumber,
                JobType = j.JobType, Title = j.Title, Description = j.Description,
                Status = (FO.JobStatus)(int)j.Status, Priority = (FO.Priority)(int)j.Priority,
                AssignedTechnicianId = j.AssignedTechnicianId, PlannedStart = j.PlannedStart, PlannedEnd = j.PlannedEnd,
                CompletedAt = j.CompletedAt, EstimatedHours = j.EstimatedHours,
                RequiredSkills = Split(j.RequiredSkills), RequiredCertifications = Split(j.RequiredCertifications),
                Latitude = j.Latitude ?? (j.SiteId != null && siteById.TryGetValue(j.SiteId.Value, out var s) ? 0 : null),
                Longitude = j.Longitude ?? (j.SiteId != null && siteById.TryGetValue(j.SiteId.Value, out var s2) ? 0 : null),
                NextServiceDate = j.NextServiceDate, CustomerName = j.CustomerId.HasValue && customers.TryGetValue(j.CustomerId.Value, out var c2) ? c2.Name : null,
                QuotedAmount = j.QuotedAmount, Notes = j.Notes,
            }).ToList(),
            Equipment = equipment.Select(x => new FO.Equipment
            {
                Id = x.Id, SiteId = x.SiteId, EquipmentNumber = x.EquipmentNumber, Name = x.Name, Category = x.Category,
                Model = x.Model, Make = x.Make, SerialNumber = x.SerialNumber, AgentType = x.AgentType,
                ManufactureDate = x.ManufactureDate, InstallationDate = x.InstallationDate,
                LastInspectionDate = x.LastInspectionDate, LastServiceDate = x.LastServiceDate, NextServiceDue = x.NextServiceDue,
                ConditionRating = x.ConditionRating, LifeSpanMonths = x.LifeSpanMonths, ServiceIntervalMonths = x.ServiceIntervalMonths,
                Status = x.Status, Latitude = x.Latitude, Longitude = x.Longitude,
            }).ToList(),
            Sites = sites.Select(s => new FO.Site
            {
                Id = s.Id, CustomerId = s.CustomerId, Name = s.Name, Address = s.Address, City = s.City,
                Province = null, BuildingType = s.SiteType.ToString(), Latitude = null, Longitude = null, Status = "Active",
            }).ToList(),
            Inventory = inventory.Select(i => new FO.InventoryItem
            {
                Id = i.Id, Name = i.Name, Category = i.Category, CurrentStock = i.CurrentStock, ReorderLevel = i.ReorderLevel,
                UnitCost = i.UnitCost, Unit = i.Unit, LeadTimeDays = i.LeadTimeDays, MonthlyUsage = ParseUsage(i.MonthlyUsage),
            }).ToList(),
            Inspections = inspections.Select(x => new FO.Inspection
            {
                Id = x.Id, JobId = x.JobId, EquipmentId = x.EquipmentId, TechnicianId = x.TechnicianId,
                InspectionDate = x.InspectionDate, Result = x.Result, Cost = x.Cost, Findings = x.Findings, NextInspectionDue = x.NextInspectionDue,
            }).ToList(),
            Services = services.Select(x => new FO.Service
            {
                Id = x.Id, JobId = null, EquipmentId = null, TechnicianId = null, ServiceDate = x.ServiceDate,
                Category = x.Status.ToString(), Cost = 0, Notes = x.Notes,
            }).ToList(),
            Refills = refills.Select(x => new FO.Refill
            {
                Id = x.Id, JobId = x.JobId, EquipmentId = x.EquipmentId, TechnicianId = x.TechnicianId,
                RefillDate = x.RefillDate, AgentType = x.AgentType, AgentAmountKg = x.AgentAmountKg, Cost = x.Cost, Notes = x.Notes,
            }).ToList(),
            Maintenance = maintenance.Select(x => new FO.Maintenance
            {
                Id = x.Id, JobId = x.JobId, EquipmentId = x.EquipmentId, TechnicianId = x.TechnicianId,
                WorkDate = x.WorkDate, WorkType = x.WorkType, Cost = x.Cost, Findings = x.Findings,
            }).ToList(),
            Certifications = certifications.Select(x => new FO.Certification
            {
                TechnicianId = x.TechnicianId ?? 0, Name = x.Name, ExpiryDate = x.ExpiryDate,
            }).ToList(),
            Invoices = invoices.Select(x => new FO.Invoice
            {
                Id = x.Id, CustomerId = x.CustomerId, Amount = x.Amount, IssueDate = x.IssueDate,
                DueDate = x.DueDate, PaidDate = x.PaidDate, Status = x.Status,
            }).ToList(),
            ReminderOptions = await LoadReminderOptionsAsync(),
        };
    }

    private static IReadOnlyList<string> Split(string value) =>
        string.IsNullOrWhiteSpace(value)
            ? Array.Empty<string>()
            : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static IDictionary<string, int> ParseUsage(string monthlyUsage)
    {
        var dict = new Dictionary<string, int>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(monthlyUsage)) return dict;
        foreach (var part in monthlyUsage.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = part.Split(':');
            if (kv.Length == 2 && int.TryParse(kv[1], out var qty)) dict[kv[0].Trim()] = qty;
        }
        return dict;
    }

    private static JobCardStatus ParseStatus(string? s) =>
        Enum.TryParse<JobCardStatus>(s, true, out var st) ? st : JobCardStatus.Draft;

    private static JobCardPriority ParsePriority(string? s) =>
        Enum.TryParse<JobCardPriority>(s, true, out var p) ? p : JobCardPriority.Normal;

    private async Task<long> NextSequenceValue(string sequenceName)
    {
        // SQL identifiers cannot be parameters. Map approved names to literal
        // statements so user input can never become part of the SQL text.
        var sql = sequenceName switch
        {
            "JobNumberSequence" => "SELECT nextval('\"JobNumberSequence\"') AS \"Value\"",
            "EquipmentNumberSequence" => "SELECT nextval('\"EquipmentNumberSequence\"') AS \"Value\"",
            "InvoiceNumberSequence" => "SELECT nextval('\"InvoiceNumberSequence\"') AS \"Value\"",
            "QuotationNumberSequence" => "SELECT nextval('\"QuotationNumberSequence\"') AS \"Value\"",
            _ => throw new ArgumentException("Invalid sequence name.", nameof(sequenceName)),
        };

        return await _db.Database.SqlQueryRaw<long>(sql).SingleAsync();
    }
}


