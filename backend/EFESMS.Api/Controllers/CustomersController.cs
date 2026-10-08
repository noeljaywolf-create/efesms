using EFESMS.Api.Data;
using EFESMS.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EFESMS.Api.Controllers;

[ApiController]
[Route("api/v1/customers")]
[Authorize]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private static readonly DateTime Today = DateTime.UtcNow.Date;

    public CustomersController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // ---------- DTOs ----------

    public record ContactIn(string Name, string? Role, string Phone, string? Email, bool IsPrimary, bool EmailConsent = true, bool PhoneConsent = true);
    public record SiteIn(string Name, string SiteType, string? Address, string? City, string? ContactPerson, string? Phone, string? Email, bool IsPrimary, string? Notes);
    public record NoteIn(string Content, string? CreatedBy, bool Pinned = false);
    public record ServiceIn(DateTime ServiceDate, string Status, int UnitsServiced, int StickersUsed, string? MaterialsUsed, int EquipmentServiced, int EquipmentReplaced, int EquipmentAdded, int EquipmentRemoved, string? DefectsFound, string? Recommendations, DateTime? ReportSentDate, string? CertificateNo, string? Technician, int? SiteId, string? Notes);
    public record CommIn(string Channel, string Direction, string? Subject, string? Message, DateTime? SentAt, bool CustomerResponded, string? ResponseNotes, DateTime? FollowUpDate, string? ContactName, string? CreatedBy);
    public record DocIn(string Name, string DocType, string? Notes, string? UploadedBy);
    public record ReviewRequestIn(string? Reason);
    public record MergeIn(int MasterId, int DuplicateId, string? Reason);

    public interface ICustomerDuplicateInput
    {
        string Name { get; }
        string? AlternativeName { get; }
        string? LegalName { get; }
        string? Phone { get; }
        string? WhatsApp { get; }
        string? Email { get; }
        string? VatNumber { get; }
        string? TinNumber { get; }
        string? ContactPerson { get; }
        string? SiteAddress { get; }
    }

    public record DuplicateCheckIn(
        string? Name,
        string? Phone,
        string? WhatsApp,
        string? Email,
        string? LegalName,
        string? AlternativeName,
        string? VatNumber,
        string? TinNumber,
        string? ContactPerson,
        string? SiteAddress) : ICustomerDuplicateInput
    {
        string ICustomerDuplicateInput.Name => Name ?? "";
        string? ICustomerDuplicateInput.Phone => Phone;
        string? ICustomerDuplicateInput.WhatsApp => WhatsApp;
        string? ICustomerDuplicateInput.Email => Email;
        string? ICustomerDuplicateInput.LegalName => LegalName;
        string? ICustomerDuplicateInput.AlternativeName => AlternativeName;
        string? ICustomerDuplicateInput.VatNumber => VatNumber;
        string? ICustomerDuplicateInput.TinNumber => TinNumber;
        string? ICustomerDuplicateInput.ContactPerson => ContactPerson;
        string? ICustomerDuplicateInput.SiteAddress => SiteAddress;
    }

    public record CustomerIn(
        string Name,
        string? AlternativeName,
        string? LegalName,
        string CustomerType,
        string? VatNumber,
        string? TinNumber,
        string? RegistrationNumber,
        string Phone,
        string? WhatsApp,
        string? Email,
        string? Website,
        string Status,
        string Priority,
        string? Category,
        string? AccountManager,
        DateTime? CustomerSince,
        int? ServiceFrequencyMonths,
        DateTime? LastServiceDate,
        DateTime? NextServiceDate,
        string PreferredContact,
        string? SpecialRequirements,
        string? BillingAddress,
        string? PaymentTerms,
        string? CreditInfo,
        string? ContractRef,
        DateTime? ContractStartDate,
        DateTime? ContractEndDate,
        decimal? ContractValue,
        string? ContractStatus,
        string? Notes,
        DateTime? BaseUpdatedAt = null,
        string? Reason = null,
        List<string>? Changed = null,
        List<ContactIn>? Contacts = null,
        List<SiteIn>? Sites = null) : ICustomerDuplicateInput
    {
        string? ICustomerDuplicateInput.ContactPerson => Contacts?.FirstOrDefault()?.Name;
        string? ICustomerDuplicateInput.SiteAddress => Sites?.FirstOrDefault()?.Address;
    }

    public record ContactOut(int Id, string Name, string? Role, string Phone, string? Email, bool IsPrimary, bool EmailConsent, bool PhoneConsent);
    public record SiteOut(int Id, string Name, string SiteType, string? Address, string? City, string? ContactPerson, string? Phone, string? Email, bool IsPrimary, string? Notes);
    public record NoteOut(int Id, string Content, string? CreatedBy, bool Pinned, DateTime CreatedAt);
    public record ServiceOut(int Id, DateTime ServiceDate, string Status, int UnitsServiced, int StickersUsed, string? MaterialsUsed, int EquipmentServiced, int EquipmentReplaced, int EquipmentAdded, int EquipmentRemoved, string? DefectsFound, string? Recommendations, DateTime? ReportSentDate, string? CertificateNo, string? Technician, int? SiteId, string? Notes);
    public record CommOut(int Id, string Channel, string Direction, string? Subject, string? Message, DateTime SentAt, bool CustomerResponded, string? ResponseNotes, DateTime? FollowUpDate, string? ContactName, string? CreatedBy);
    public record DocOut(int Id, string Name, string DocType, string? FilePath, long? SizeBytes, string? Notes, DateTime UploadedAt, string? UploadedBy);
    public record ActivityOut(int Id, string Action, string? Details, string? Actor, DateTime CreatedAt);
    public record FieldAuditOut(int Id, string Field, string? Before, string? After, string UserName, string Role, string Department, DateTime CreatedAt, string? Reason);
    public record CompanyMatchOut(int CustomerId, string CompanyName, int Score);
    public record ExtractedFields(string CompanyName, string? InvoiceNo, string? Amount, string? Date, string? VatNo, List<CompanyMatchOut> Matches);
    public record DocExtractOut(int Id, string Name, string? TextSample, string? FoundInvoiceNo, string? FoundAmount, string? FoundDate, string? FoundVatNo, string? SuggestedSupplier, int? MatchedCustomerId, string? MatchedCustomerName, string? MatchedJobNumber, int Confidence);
    public record PatchDocumentIn(string? Name, string? DocType, string? Notes, int? MatchedCustomerId, string? MatchedJobNumber);

    public record TimelineEvent(DateTime Date, string Type, string Title, string? Details, int? RefId);

    public record CompletionSection(string Key, string Label, bool Done, string Owner);
    public record CustomerCompletion(int Percent, List<CompletionSection> Sections);

    public record CustomerOut(
        int Id,
        string CustomerId,
        string Name,
        string? AlternativeName,
        string? LegalName,
        string CustomerType,
        string? VatNumber,
        string? TinNumber,
        string? RegistrationNumber,
        string Phone,
        string? WhatsApp,
        string? Email,
        string? Website,
        string Status,
        string Priority,
        string? Category,
        string? AccountManager,
        DateTime? CustomerSince,
        int? ServiceFrequencyMonths,
        DateTime? LastServiceDate,
        DateTime? NextServiceDate,
        string PreferredContact,
        string? SpecialRequirements,
        string? BillingAddress,
        string? PaymentTerms,
        string? CreditInfo,
        string? ContractRef,
        DateTime? ContractStartDate,
        DateTime? ContractEndDate,
        decimal? ContractValue,
        string ContractStatus,
        string? Notes,
        string? MergedIntoCustomerId,
        DateTime? MergedAt,
        string ServiceStatus,
        CustomerCompletion Completion,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        List<ContactOut> Contacts);

    public record ProfileOut(
        CustomerOut Customer,
        List<SiteOut> Sites,
        List<NoteOut> NotesList,
        List<ServiceOut> Services,
        List<CommOut> Communications,
        List<DocOut> Documents,
        List<FieldAuditOut> FieldAudits,
        List<ActivityOut> Activities);

    // ---------- helpers ----------

    private static CustomerType ParseType(string? s) =>
        Enum.TryParse<CustomerType>(s, true, out var t) ? t : CustomerType.Commercial;

    private static CustomerStatus ParseStatus(string? s) =>
        Enum.TryParse<CustomerStatus>(s, true, out var t) ? t : CustomerStatus.Prospect;

    private static CustomerPriority ParsePriority(string? s) =>
        Enum.TryParse<CustomerPriority>(s, true, out var t) ? t : CustomerPriority.Normal;

    private static PreferredContactMethod ParsePreferred(string? s) =>
        Enum.TryParse<PreferredContactMethod>(s, true, out var t) ? t : PreferredContactMethod.Phone;

    private static ServiceStatus ParseServiceStatus(string? s) =>
        Enum.TryParse<ServiceStatus>(s, true, out var t) ? t : ServiceStatus.Scheduled;

    private static ServiceReminderStatus ReminderStatus(Customer c)
    {
        if (c.NextServiceDate is null) return ServiceReminderStatus.None;
        var days = (c.NextServiceDate.Value.Date - Today).Days;
        if (days < 0) return ServiceReminderStatus.Overdue;
        if (days <= 7) return ServiceReminderStatus.Due;
        if (days <= 30) return ServiceReminderStatus.DueSoon;
        return ServiceReminderStatus.UpToDate;
    }

    private static ContactOut MapContact(CustomerContact x) =>
        new(x.Id, x.Name, x.Role, x.Phone, x.Email, x.IsPrimary, x.EmailConsent, x.PhoneConsent);

    private static SiteOut MapSite(CustomerSite s) =>
        new(s.Id, s.Name, s.SiteType.ToString(), s.Address, s.City, s.ContactPerson, s.Phone, s.Email, s.IsPrimary, s.Notes);

    private string CurrentUser => User.Identity?.Name ?? "unknown";
    private string CurrentRole => User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "";
    private string CurrentDept => User.FindFirst("department")?.Value ?? "";
    private bool IsAdmin => CurrentRole.Equals("admin", StringComparison.OrdinalIgnoreCase) ||
                            CurrentRole.Equals("administrator", StringComparison.OrdinalIgnoreCase);
    // Any admin (admin or administrator) may delete — uniform across all pages
    private bool CanDeleteCustomer => IsAdmin;
    private bool CanWriteCustomer => IsAdmin || CurrentDept is "Administration" or "Accounts" or "Contracts" or "Technical" or "Stores" or "Operations";

    private IActionResult CustomerWriteDenied() =>
        StatusCode(403, new { error = "FORBIDDEN", message = "Your department is not allowed to change customer records." });

    // Role-based field access â€” admins have FULL access; each department owns its section.
    private static readonly HashSet<string> AccountsFields = new(StringComparer.Ordinal)
        { "vatNumber", "tinNumber", "registrationNumber", "paymentTerms", "creditInfo" };
    private static readonly HashSet<string> ContractsFields = new(StringComparer.Ordinal)
        { "contractRef", "contractStartDate", "contractEndDate", "contractValue", "contractStatus" };

    private bool CanWriteField(string f) =>
        AccountsFields.Contains(f) ? IsAdmin || CurrentDept == "Accounts" :
        ContractsFields.Contains(f) ? IsAdmin || CurrentDept == "Contracts" :
        true;

    private bool CanReadField(string f) => CanWriteField(f);

    /// Applies role-based masking so the information a user receives depends on their role.
    private CustomerOut ApplyMask(CustomerOut dto)
    {
        if (IsAdmin) return dto;
        if (CurrentDept != "Accounts")
        {
            foreach (var (f, v) in new (string F, object? V)[]
            {
                ("vatNumber", dto.VatNumber), ("tinNumber", dto.TinNumber), ("registrationNumber", dto.RegistrationNumber),
                ("paymentTerms", dto.PaymentTerms), ("creditInfo", dto.CreditInfo),
            })
            {
                if (v is null) continue;
                dto = f switch
                {
                    "vatNumber" => dto with { VatNumber = null },
                    "tinNumber" => dto with { TinNumber = null },
                    "registrationNumber" => dto with { RegistrationNumber = null },
                    "paymentTerms" => dto with { PaymentTerms = null },
                    _ => dto with { CreditInfo = null }
                };
            }
        }
        if (CurrentDept != "Contracts")
        {
            if (dto.ContractRef != null) dto = dto with { ContractRef = null };
            if (dto.ContractStartDate != null) dto = dto with { ContractStartDate = null };
            if (dto.ContractEndDate != null) dto = dto with { ContractEndDate = null };
            if (dto.ContractValue != null) dto = dto with { ContractValue = null };
        }
        return dto;
    }

    private static CustomerCompletion ComputeCompletion(Customer c) =>
        new(
            Math.Clamp((int)Math.Round(100.0 * Sections(c).Count(s => s.Done) / Math.Max(1, Sections(c).Count)), 0, 100),
            Sections(c));

    private static List<CompletionSection> Sections(Customer c)
    {
        var l = new List<CompletionSection>();
        l.Add(new CompletionSection("basic", "Basic Information", !string.IsNullOrWhiteSpace(c.Name) && !string.IsNullOrWhiteSpace(c.Phone), "Administration"));
        l.Add(new CompletionSection("contacts", "Contact Information", c.Contacts.Count > 0, "All departments"));
        l.Add(new CompletionSection("sites", "Site Information", c.Sites.Count > 0, "Technical"));
        l.Add(new CompletionSection("technical", "Technical Information", !string.IsNullOrWhiteSpace(c.SpecialRequirements) || c.Services.Count > 0, "Technical"));
        l.Add(new CompletionSection("accounts", "Accounts Information", !string.IsNullOrWhiteSpace(c.VatNumber) || !string.IsNullOrWhiteSpace(c.TinNumber) || !string.IsNullOrWhiteSpace(c.PaymentTerms) || !string.IsNullOrWhiteSpace(c.CreditInfo) || !string.IsNullOrWhiteSpace(c.BillingAddress), "Accounts"));
        l.Add(new CompletionSection("contracts", "Contract Information", !string.IsNullOrWhiteSpace(c.ContractRef) || c.ContractStartDate != null || c.ContractEndDate != null || c.ContractValue != null, "Contracts"));
        l.Add(new CompletionSection("administration", "Administrative Information", !string.IsNullOrWhiteSpace(c.AccountManager) || !string.IsNullOrWhiteSpace(c.Category) || c.CustomerSince != null, "Administration"));
        return l;
    }

    private static CustomerOut Map(Customer c) => new(
        c.Id,
        c.CustomerId,
        c.Name,
        c.AlternativeName,
        c.LegalName,
        c.CustomerType.ToString(),
        c.VatNumber,
        c.TinNumber,
        c.RegistrationNumber,
        c.Phone,
        c.WhatsApp,
        c.Email,
        c.Website,
        c.Status.ToString(),
        c.Priority.ToString(),
        c.Category,
        c.AccountManager,
        c.CustomerSince,
        c.ServiceFrequencyMonths,
        c.LastServiceDate,
        c.NextServiceDate,
        c.PreferredContact.ToString(),
        c.SpecialRequirements,
        c.BillingAddress,
        c.PaymentTerms,
        c.CreditInfo,
        c.ContractRef,
        c.ContractStartDate,
        c.ContractEndDate,
        c.ContractValue,
        c.ContractStatus,
        c.Notes,
        c.MergedIntoCustomerId,
        c.MergedAt,
        ReminderStatus(c).ToString(),
        ComputeCompletion(c),
        c.CreatedAt,
        c.UpdatedAt,
        c.Contacts.Select(MapContact).ToList());

    private async Task<string> NextCustomerIdAsync()
    {
        var n = await _db.Database.SqlQueryRaw<long>("SELECT nextval('\"CustomerNumberSequence\"') AS \"Value\"").SingleAsync();
        return $"CUS-{n:D6}";
    }

    private CustomerActivity Log(Customer c, string action, string? details = null, string? actor = null)
    {
        var a = new CustomerActivity { Action = action, Details = details, Actor = actor ?? CurrentUser, CreatedAt = DateTime.UtcNow };
        c.Activities.Add(a);
        return a;
    }

    private FieldAudit Audit(Customer c, string field, string? before, string? after)
    {
        var a = new FieldAudit
        {
            CustomerId = c.Id,
            Field = field,
            Before = before,
            After = after,
            UserName = CurrentUser,
            Role = CurrentRole,
            Department = CurrentDept,
            CreatedAt = DateTime.UtcNow,
            Reason = null
        };
        _db.FieldAudits.Add(a);
        return a;
    }

    private static SiteOut MapSiteOut(CustomerSite s) => MapSite(s);
    private static NoteOut MapNote(CustomerNote n) => new(n.Id, n.Content, n.CreatedBy, n.Pinned, n.CreatedAt);
    private static ServiceOut MapService(ServiceRecord s) =>
        new(s.Id, s.ServiceDate, s.Status.ToString(), s.UnitsServiced, s.StickersUsed, s.MaterialsUsed, s.EquipmentServiced, s.EquipmentReplaced, s.EquipmentAdded, s.EquipmentRemoved, s.DefectsFound, s.Recommendations, s.ReportSentDate, s.CertificateNo, s.Technician, s.SiteId, s.Notes);
    private static CommOut MapComm(CustomerCommunication x) =>
        new(x.Id, x.Channel.ToString(), x.Direction.ToString(), x.Subject, x.Message, x.SentAt, x.CustomerResponded, x.ResponseNotes, x.FollowUpDate, x.ContactName, x.CreatedBy);
    private static DocOut MapDoc(CustomerDocument d) =>
        new(d.Id, d.Name, d.DocType.ToString(), d.FilePath, d.SizeBytes, d.Notes, d.UploadedAt, d.UploadedBy);
    private static ActivityOut MapActivity(CustomerActivity a) =>
        new(a.Id, a.Action, a.Details, a.Actor, a.CreatedAt);
    private static FieldAuditOut MapAudit(FieldAudit a) =>
        new(a.Id, a.Field, a.Before, a.After, a.UserName, a.Role, a.Department, a.CreatedAt, a.Reason);

    // ---------- list ----------

    // GET /api/v1/customers?search=&status=&type=&service=&priority=&newOnly=&q=
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] string? service,
        [FromQuery] string? priority)
    {
        var q = _db.Customers.AsNoTracking().AsSplitQuery()
            .Include(c => c.Contacts)
            .Include(c => c.Sites)
            .Include(c => c.Services)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(c =>
                c.Name.ToLower().Contains(s) ||
                c.CustomerId.ToLower().Contains(s) ||
                (c.LegalName != null && c.LegalName.ToLower().Contains(s)) ||
                (c.Email != null && c.Email.ToLower().Contains(s)) ||
                (c.WhatsApp != null && c.WhatsApp.ToLower().Contains(s)) ||
                c.Phone.ToLower().Contains(s) ||
                c.Sites.Any(site => site.Name.ToLower().Contains(s) || (site.City != null && site.City.ToLower().Contains(s))));
        }
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(c => c.Status == ParseStatus(status));
        if (!string.IsNullOrWhiteSpace(type)) q = q.Where(c => c.CustomerType == ParseType(type));
        if (!string.IsNullOrWhiteSpace(priority)) q = q.Where(c => c.Priority == ParsePriority(priority));
        if (!string.IsNullOrWhiteSpace(service))
        {
            var now = DateTime.UtcNow.Date;
            var kind = service.Trim();
            q = kind.ToLower() switch
            {
                "overdue" => q.Where(c => c.NextServiceDate != null && c.NextServiceDate < now),
                "due" => q.Where(c => c.NextServiceDate != null && c.NextServiceDate >= now && c.NextServiceDate <= now.AddDays(7)),
                "duesoon" => q.Where(c => c.NextServiceDate != null && c.NextServiceDate > now.AddDays(7) && c.NextServiceDate <= now.AddDays(30)),
                "uptodate" => q.Where(c => c.NextServiceDate != null && c.NextServiceDate > now.AddDays(30)),
                "noservice" => q.Where(c => c.NextServiceDate == null),
                _ => q
            };
        }

        var customers = await q.OrderBy(c => c.Name).ToListAsync();
        return Ok(customers.Select(c => ApplyMask(Map(c))));
    }

    // ---------- profile ----------

    // GET /api/v1/customers/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var customer = await _db.Customers
            .AsNoTracking()
            .Include(c => c.Contacts)
            .Include(c => c.Sites)
            .Include(c => c.NotesList)
            .Include(c => c.Services).ThenInclude(s => s.Site)
            .Include(c => c.Communications)
            .Include(c => c.Documents)
            .Include(c => c.Activities)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (customer is null) return NotFound();
        var audits = await _db.FieldAudits.AsNoTracking()
            .Where(a => a.CustomerId == id)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();
        var auditDtos = audits.Select(MapAudit).Select(a =>
        {
            if (!CanReadField(a.Field)) return a with { Before = "â€¢â€¢â€¢â€¢â€¢â€¢", After = "â€¢â€¢â€¢â€¢â€¢â€¢" };
            return a;
        }).ToList();
        return Ok(new ProfileOut(
            ApplyMask(Map(customer)),
            customer.Sites.Select(MapSiteOut).OrderByDescending(s => s.IsPrimary).ToList(),
            customer.NotesList.OrderByDescending(n => n.Pinned).ThenByDescending(n => n.CreatedAt).ToList().Select(MapNote).ToList(),
            customer.Services.OrderByDescending(s => s.ServiceDate).Select(MapService).ToList(),
            customer.Communications.OrderByDescending(x => x.SentAt).Select(MapComm).ToList(),
            customer.Documents.OrderByDescending(d => d.UploadedAt).Select(MapDoc).ToList(),
            auditDtos,
            customer.Activities.OrderByDescending(a => a.CreatedAt).Select(MapActivity).ToList()));
    }

    // GET /api/v1/customers/{id}/timeline
    [HttpGet("{id:int}/timeline")]
    public async Task<IActionResult> Timeline(int id)
    {
        var customer = await _db.Customers.AsNoTracking()
            .Include(c => c.Services)
            .Include(c => c.Communications)
            .Include(c => c.Activities)
            .Include(c => c.Documents)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();

        var events = new List<TimelineEvent>();
        foreach (var s in customer.Services)
            events.Add(new TimelineEvent(s.ServiceDate, "service", $"Service {s.Status.ToString().ToLower()}", s.UnitsServiced > 0 ? $"{s.UnitsServiced} unit(s), {s.StickersUsed} stickers used" : s.Notes, s.Id));
        foreach (var s in customer.Services.Where(x => x.ReportSentDate != null))
            events.Add(new TimelineEvent(s.ReportSentDate!.Value, "report", "Service report sent", s.CertificateNo != null ? $"Certificate #{s.CertificateNo}" : null, s.Id));
        foreach (var c in customer.Communications)
            events.Add(new TimelineEvent(c.SentAt, "communication", $"{c.Direction} {c.Channel}", $"{c.Subject}" + (c.CustomerResponded ? " Â· responded" : ""), c.Id));
        foreach (var d in customer.Documents)
            events.Add(new TimelineEvent(d.UploadedAt, "document", $"Document: {d.Name}", d.DocType.ToString(), d.Id));
        foreach (var a in customer.Activities)
            events.Add(new TimelineEvent(a.CreatedAt, "activity", a.Action, a.Details, a.Id));

        var ordered = events.OrderByDescending(e => e.Date).ToList();
        return Ok(ordered.Select(e => new { e.Date, e.Type, e.Title, e.Details, e.RefId }));
    }

    // ---------- create / update ----------

    private void ApplyContacts(Customer c, List<ContactIn> list)
    {
        if (c.Contacts.Count > 0) _db.CustomerContacts.RemoveRange(c.Contacts);
        c.Contacts.Clear();
        var primary = list.FirstOrDefault(x => x.IsPrimary) ?? list[0];
        foreach (var x in list)
            c.Contacts.Add(new CustomerContact
            {
                Name = x.Name.Trim(),
                Role = x.Role,
                Phone = x.Phone.Trim(),
                Email = x.Email,
                IsPrimary = x == primary,
                EmailConsent = x.EmailConsent,
                PhoneConsent = x.PhoneConsent,
            });
    }

    private void ApplySites(Customer c, List<SiteIn> list)
    {
        if (c.Sites.Count > 0) _db.CustomerSites.RemoveRange(c.Sites);
        c.Sites.Clear();
        var primary = list.FirstOrDefault(x => x.IsPrimary) ?? list[0];
        foreach (var s in list)
            c.Sites.Add(new CustomerSite
            {
                Name = s.Name.Trim(),
                SiteType = Enum.TryParse<SiteType>(s.SiteType, true, out var st) ? st : SiteType.Other,
                Address = s.Address,
                City = s.City,
                ContactPerson = s.ContactPerson,
                Phone = s.Phone,
                Email = s.Email,
                IsPrimary = s == primary,
                Notes = s.Notes,
            });
    }

    private static readonly string[] ScalarFields =
    {
        "name", "legalName", "alternativeName", "customerType", "vatNumber", "tinNumber", "registrationNumber",
        "phone", "whatsapp", "email", "website", "status", "priority", "category", "accountManager",
        "customerSince", "serviceFrequencyMonths", "preferredContact", "specialRequirements", "billingAddress",
        "paymentTerms", "creditInfo", "contractRef", "contractStartDate", "contractEndDate", "contractValue", "contractStatus"
    };

    private void ApplyScalar(Customer c, CustomerIn dto, string field)
    {
        switch (field)
        {
            case "name": c.Name = dto.Name.Trim(); break;
            case "legalName": c.LegalName = dto.LegalName; break;
            case "alternativeName": c.AlternativeName = dto.AlternativeName; break;
            case "customerType": c.CustomerType = ParseType(dto.CustomerType); break;
            case "vatNumber": c.VatNumber = dto.VatNumber; break;
            case "tinNumber": c.TinNumber = dto.TinNumber; break;
            case "registrationNumber": c.RegistrationNumber = dto.RegistrationNumber; break;
            case "phone": c.Phone = dto.Phone.Trim(); break;
            case "whatsapp": c.WhatsApp = dto.WhatsApp; break;
            case "email": c.Email = dto.Email; break;
            case "website": c.Website = dto.Website; break;
            case "status": c.Status = ParseStatus(dto.Status); break;
            case "priority": c.Priority = ParsePriority(dto.Priority); break;
            case "category": c.Category = dto.Category; break;
            case "accountManager": c.AccountManager = dto.AccountManager; break;
            case "customerSince": c.CustomerSince = dto.CustomerSince; break;
            case "serviceFrequencyMonths": c.ServiceFrequencyMonths = dto.ServiceFrequencyMonths; break;
            case "preferredContact": c.PreferredContact = ParsePreferred(dto.PreferredContact); break;
            case "specialRequirements": c.SpecialRequirements = dto.SpecialRequirements; break;
            case "billingAddress": c.BillingAddress = dto.BillingAddress; break;
            case "paymentTerms": c.PaymentTerms = dto.PaymentTerms; break;
            case "creditInfo": c.CreditInfo = dto.CreditInfo; break;
            case "contractRef": c.ContractRef = dto.ContractRef; break;
            case "contractStartDate": c.ContractStartDate = dto.ContractStartDate; break;
            case "contractEndDate": c.ContractEndDate = dto.ContractEndDate; break;
            case "contractValue": c.ContractValue = dto.ContractValue; break;
            case "contractStatus": c.ContractStatus = dto.ContractStatus ?? c.ContractStatus; break;
        }
    }

    private string? FieldValue(Customer c, string field) => field switch
    {
        "name" => c.Name,
        "legalName" => c.LegalName,
        "alternativeName" => c.AlternativeName,
        "customerType" => c.CustomerType.ToString(),
        "vatNumber" => c.VatNumber,
        "tinNumber" => c.TinNumber,
        "registrationNumber" => c.RegistrationNumber,
        "phone" => c.Phone,
        "whatsapp" => c.WhatsApp,
        "email" => c.Email,
        "website" => c.Website,
        "status" => c.Status.ToString(),
        "priority" => c.Priority.ToString(),
        "category" => c.Category,
        "accountManager" => c.AccountManager,
        "customerSince" => c.CustomerSince?.ToString("yyyy-MM-dd"),
        "serviceFrequencyMonths" => c.ServiceFrequencyMonths?.ToString(),
        "preferredContact" => c.PreferredContact.ToString(),
        "specialRequirements" => c.SpecialRequirements,
        "billingAddress" => c.BillingAddress,
        "paymentTerms" => c.PaymentTerms,
        "creditInfo" => c.CreditInfo,
        "contractRef" => c.ContractRef,
        "contractStartDate" => c.ContractStartDate?.ToString("yyyy-MM-dd"),
        "contractEndDate" => c.ContractEndDate?.ToString("yyyy-MM-dd"),
        "contractValue" => c.ContractValue?.ToString(),
        "contractStatus" => c.ContractStatus,
        _ => ""
    };

    private async Task<bool> ConflictWithOtherEdits(Customer c, DateTime? baseUpdatedAt, IEnumerable<string> fields)
    {
        if (baseUpdatedAt is null) return false;
        if (c.UpdatedAt <= baseUpdatedAt.Value.AddSeconds(1)) return false;
        var fld = fields.ToList();
        if (fld.Count == 0) return false;
        return await _db.FieldAudits.AnyAsync(a => a.CustomerId == c.Id && fld.Contains(a.Field) && a.CreatedAt > baseUpdatedAt.Value.AddSeconds(-2));
    }

    private async Task<List<DuplicateMatch>> FindDuplicatesAsync(ICustomerDuplicateInput dto)
    {
        var all = await _db.Customers.AsNoTracking()
            .Include(x => x.Contacts)
            .Include(x => x.Sites)
            .Where(x => x.MergedIntoCustomerId == null)
            .ToListAsync();
        var matches = new List<DuplicateMatch>();
        foreach (var c in all)
        {
            var s = DuplicateFinder.Score(c, dto);
            if (s is null) continue;
            matches.Add(new DuplicateMatch(c.Id, c.CustomerId, c.Name, s.Score, s.Reasons));
        }
        return matches.OrderByDescending(m => m.Score).Take(5).ToList();
    }

    // POST /api/v1/customers
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Phone))
            return BadRequest(new { message = "Customer name and phone are required." });

        var matches = await FindDuplicatesAsync(dto);
        var strong = matches.FirstOrDefault(m => m.Score >= 50);
        if (strong is not null)
        {
            var overrideAllowed = IsAdmin && Request.Headers.ContainsKey("X-Override-Duplicate") && Request.Headers["X-Override-Duplicate"] == "1";
            if (!overrideAllowed)
                return Conflict(new { error = "DUPLICATE", message = "Possible existing customer found.", candidates = matches });
        }

        var customer = new Customer
        {
            CustomerId = await NextCustomerIdAsync(),
            Name = dto.Name.Trim(),
            AlternativeName = dto.AlternativeName,
            LegalName = dto.LegalName,
            CustomerType = ParseType(dto.CustomerType),
            VatNumber = dto.VatNumber,
            TinNumber = dto.TinNumber,
            RegistrationNumber = dto.RegistrationNumber,
            Phone = dto.Phone.Trim(),
            WhatsApp = dto.WhatsApp,
            Email = dto.Email,
            Website = dto.Website,
            Status = ParseStatus(dto.Status),
            Priority = ParsePriority(dto.Priority),
            Category = dto.Category,
            AccountManager = dto.AccountManager,
            CustomerSince = dto.CustomerSince,
            ServiceFrequencyMonths = dto.ServiceFrequencyMonths,
            LastServiceDate = dto.LastServiceDate,
            NextServiceDate = dto.NextServiceDate,
            PreferredContact = ParsePreferred(dto.PreferredContact),
            SpecialRequirements = dto.SpecialRequirements,
            BillingAddress = dto.BillingAddress,
            PaymentTerms = dto.PaymentTerms,
            CreditInfo = dto.CreditInfo,
            ContractRef = dto.ContractRef,
            ContractStartDate = dto.ContractStartDate,
            ContractEndDate = dto.ContractEndDate,
            ContractValue = dto.ContractValue,
            ContractStatus = dto.ContractStatus ?? "None",
            Notes = dto.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        if (dto.Contacts is { Count: > 0 }) ApplyContacts(customer, dto.Contacts);
        if (dto.Sites is { Count: > 0 }) ApplySites(customer, dto.Sites);

        if (strong is not null)
        {
            Log(customer, "Duplicate override applied", $"Created despite {strong.Score:0}% match with {strong.CustomerId} {strong.Name}{(string.IsNullOrWhiteSpace(dto.Reason) ? "" : " Â· " + dto.Reason)}");
        }
        else
        {
            Log(customer, "Customer created", $"Registered as {customer.CustomerId}");
        }

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        if (strong is not null)
        {
            _db.FieldAudits.Add(new FieldAudit
            {
                CustomerId = customer.Id,
                Field = "duplicate.override",
                Before = $"match with {strong.CustomerId} ({strong.Score:0}%)",
                After = "created",
                UserName = CurrentUser,
                Role = CurrentRole,
                Department = CurrentDept,
                Reason = dto.Reason,
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();
        }
        var created = await _db.Customers.Where(c => c.Id == customer.Id).Include(c => c.Contacts).Include(c => c.Sites).FirstAsync();
        return CreatedAtAction(nameof(Get), new { id = customer.Id }, ApplyMask(Map(created)));
    }

    // PUT /api/v1/customers/{id}
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] CustomerIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers
            .Include(c => c.Contacts)
            .Include(c => c.Sites)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(customer.MergedIntoCustomerId))
            return Conflict(new { error = "MERGED", message = $"This record was merged into {customer.MergedIntoCustomerId}. Edit the master record instead." });

        // Field-level optimistic concurrency: only author this user's changed fields.
        var changed = dto.Changed is { Count: > 0 } ? dto.Changed : ScalarFields.ToList();
        if (dto.Changed is { Count: > 0 } && dto.Changed.Contains("contacts")) changed.Add("contacts");
        if (dto.Changed is { Count: > 0 } && dto.Changed.Contains("sites")) changed.Add("sites");

        // Role-based write protection: an accounts clerk may not overwrite contract fields, etc.
        var denied = changed
            .Where(f => f != "contacts" && f != "sites" && !CanWriteField(f))
            .Distinct()
            .ToList();
        if (denied.Count > 0)
            return StatusCode(403, new
            {
                error = "FORBIDDEN",
                fields = denied,
                message = "These fields belong to another department and can only be changed by that department or an administrator."
            });

        var conflictFields = changed.Where(f => f != "contacts" && f != "sites").ToList();
        if (await ConflictWithOtherEdits(customer, dto.BaseUpdatedAt, conflictFields))
        {
            var latest = await _db.Customers.AsNoTracking().Include(c => c.Contacts).Include(c => c.Sites).FirstAsync(c => c.Id == id);
            return Conflict(new { error = "CONFLICT", message = "This information was updated by another user. Please review the latest value before saving your change.", latest = ApplyMask(Map(latest)) });
        }

        var audits = new List<(string Field, string? Before, string? After)>();
        foreach (var f in changed.Where(f => f != "contacts" && f != "sites"))
        {
            var before = FieldValue(customer, f);
            ApplyScalar(customer, dto, f);
            var after = FieldValue(customer, f);
            if (before != after) audits.Add((f, before, after));
        }

        if (dto.Changed is null && dto.Contacts is not null) ApplyContacts(customer, dto.Contacts);
        else if (dto.Changed is { } c2 && c2.Contains("contacts") && dto.Contacts is not null) ApplyContacts(customer, dto.Contacts);
        if (dto.Changed is null && dto.Sites is { Count: > 0 }) ApplySites(customer, dto.Sites);
        else if (dto.Changed is { } s2 && s2.Contains("sites") && dto.Sites is { Count: > 0 }) ApplySites(customer, dto.Sites);

        customer.UpdatedAt = DateTime.UtcNow;

        foreach (var (field, before, after) in audits)
        {
            var a = Audit(customer, field, before, after);
            a.Reason = dto.Reason;
        }
        if (audits.Count > 0 || dto.Changed?.Contains("contacts") == true || dto.Changed?.Contains("sites") == true)
            Log(customer, "Customer information updated", $"{audits.Count} field(s) changed by {CurrentUser} ({CurrentDept})");

        await _db.SaveChangesAsync();
        var updated = await _db.Customers.Where(c => c.Id == customer.Id).Include(c => c.Contacts).Include(c => c.Sites).FirstAsync();
        return Ok(ApplyMask(Map(updated)));
    }

    // POST /api/v1/customers/check-duplicates  (intelligent pre-create search â€” lightweight payload)
    [HttpPost("check-duplicates")]
    public async Task<IActionResult> CheckDuplicates([FromBody] DuplicateCheckIn dto)
    {
        var matches = await FindDuplicatesAsync(dto);
        return Ok(matches);
    }

    // POST /api/v1/customers/{id}/review-requests  (non-admin asks an administrator to review)
    [HttpPost("{id:int}/review-requests")]
    public async Task<IActionResult> RequestReview(int id, [FromBody] ReviewRequestIn dto)
    {
        var customer = await _db.Customers.Include(c => c.Activities).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();
        if (IsAdmin) return BadRequest(new { message = "Review requests are for non-admin users." });
        var note = $"Duplicate review requested by {CurrentUser} ({CurrentDept}){(string.IsNullOrWhiteSpace(dto.Reason) ? "" : " â€” " + dto.Reason)}";
        Log(customer, "DUPLICATE-REVIEW-REQUEST", note);
        _db.FieldAudits.Add(new FieldAudit
        {
            CustomerId = customer.Id,
            Field = "duplicate.review-request",
            Before = null,
            After = note,
            UserName = CurrentUser,
            Role = CurrentRole,
            Department = CurrentDept,
            Reason = dto.Reason,
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Review request logged for an administrator." });
    }

    // POST /api/v1/customers/merge
    [HttpPost("merge")]
    public async Task<IActionResult> Merge([FromBody] MergeIn dto)
    {
        if (!IsAdmin) return Unauthorized(new { message = "Only administrators can merge customer records." });
        if (dto.MasterId == dto.DuplicateId) return BadRequest(new { message = "Master and duplicate must be different records." });

        var master = await _db.Customers
            .Include(c => c.Contacts)
            .Include(c => c.Sites)
            .Include(c => c.NotesList)
            .Include(c => c.Services)
            .Include(c => c.Communications)
            .Include(c => c.Documents)
            .Include(c => c.Activities)
            .FirstOrDefaultAsync(c => c.Id == dto.MasterId);
        var dup = await _db.Customers
            .Include(c => c.Contacts)
            .Include(c => c.Sites)
            .Include(c => c.NotesList)
            .Include(c => c.Services)
            .Include(c => c.Communications)
            .Include(c => c.Documents)
            .Include(c => c.Activities)
            .FirstOrDefaultAsync(c => c.Id == dto.DuplicateId);
        if (master is null || dup is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(master.MergedIntoCustomerId) || !string.IsNullOrWhiteSpace(dup.MergedIntoCustomerId))
            return Conflict(new { message = "You cannot merge an already-retired record." });

        var conflicts = new List<string>();

        // Non-conflicting scalar merge: master keeps its value when set, otherwise adopt from duplicate.
        string? MergeScalar(string? target, string? source, string label)
        {
            if (source is null) return target;
            if (target is null) return source;
            if (!string.Equals(target, source, StringComparison.Ordinal)) conflicts.Add($"{label}: master \"{target}\" vs duplicate \"{source}\"");
            return target;
        }
        master.AlternativeName = MergeScalar(master.AlternativeName, dup.AlternativeName, "Alternative name");
        master.LegalName = MergeScalar(master.LegalName, dup.LegalName, "Legal name");
        master.VatNumber = MergeScalar(master.VatNumber, dup.VatNumber, "VAT number");
        master.TinNumber = MergeScalar(master.TinNumber, dup.TinNumber, "TIN");
        master.RegistrationNumber = MergeScalar(master.RegistrationNumber, dup.RegistrationNumber, "Registration number");
        if (string.IsNullOrWhiteSpace(master.Phone) && !string.IsNullOrWhiteSpace(dup.Phone)) master.Phone = dup.Phone;
        if (string.IsNullOrWhiteSpace(master.WhatsApp) && !string.IsNullOrWhiteSpace(dup.WhatsApp)) master.WhatsApp = dup.WhatsApp;
        if (string.IsNullOrWhiteSpace(master.Email) && !string.IsNullOrWhiteSpace(dup.Email)) master.Email = dup.Email;
        if (string.IsNullOrWhiteSpace(master.Website) && !string.IsNullOrWhiteSpace(dup.Website)) master.Website = dup.Website;
        if (string.IsNullOrWhiteSpace(master.SpecialRequirements) && !string.IsNullOrWhiteSpace(dup.SpecialRequirements)) master.SpecialRequirements = dup.SpecialRequirements;
        else if (master.SpecialRequirements != dup.SpecialRequirements && !string.IsNullOrWhiteSpace(dup.SpecialRequirements)) conflicts.Add($"Special requirements: master \"{master.SpecialRequirements}\" vs duplicate \"{dup.SpecialRequirements}\"");
        master.BillingAddress = MergeScalar(master.BillingAddress, dup.BillingAddress, "Billing address");
        master.PaymentTerms = MergeScalar(master.PaymentTerms, dup.PaymentTerms, "Payment terms");
        master.CreditInfo = MergeScalar(master.CreditInfo, dup.CreditInfo, "Credit information");
        master.ContractRef = MergeScalar(master.ContractRef, dup.ContractRef, "Contract reference");
        if (master.ContractStartDate is null && dup.ContractStartDate != null) master.ContractStartDate = dup.ContractStartDate;
        if (master.ContractEndDate is null && dup.ContractEndDate != null) master.ContractEndDate = dup.ContractEndDate;
        if (master.ContractValue is null && dup.ContractValue != null) master.ContractValue = dup.ContractValue;
        if (string.IsNullOrWhiteSpace(master.AccountManager) && !string.IsNullOrWhiteSpace(dup.AccountManager)) master.AccountManager = dup.AccountManager;
        if (string.IsNullOrWhiteSpace(master.Category) && !string.IsNullOrWhiteSpace(dup.Category)) master.Category = dup.Category;
        if (master.CustomerSince is null && dup.CustomerSince != null) master.CustomerSince = dup.CustomerSince;
        if (master.ServiceFrequencyMonths is null && dup.ServiceFrequencyMonths != null) master.ServiceFrequencyMonths = dup.ServiceFrequencyMonths;
        if (master.NextServiceDate is null && dup.NextServiceDate != null) { master.NextServiceDate = dup.NextServiceDate; master.LastServiceDate = dup.LastServiceDate; }
        if (!string.IsNullOrWhiteSpace(master.Notes) && !string.IsNullOrWhiteSpace(dup.Notes) && master.Notes != dup.Notes)
            master.Notes += "\n--- merged from " + dup.CustomerId + " ---\n" + dup.Notes;
        else if (string.IsNullOrWhiteSpace(master.Notes)) master.Notes = dup.Notes;

        // Collections: move everything from the duplicate onto the master.
        foreach (var k in dup.Contacts)
            if (!master.Contacts.Any(x => DuplicateFinder.NormalizePhone(x.Phone) == DuplicateFinder.NormalizePhone(k.Phone))) master.Contacts.Add(k);
        foreach (var s in dup.Sites)
            if (!master.Sites.Any(x => string.Equals(x.Name, s.Name, StringComparison.OrdinalIgnoreCase) && string.Equals(x.Address, s.Address, StringComparison.OrdinalIgnoreCase))) master.Sites.Add(s);
        foreach (var n in dup.NotesList) { n.CustomerId = master.Id; master.NotesList.Add(n); }
        foreach (var s in dup.Services) { s.CustomerId = master.Id; master.Services.Add(s); }
        foreach (var c in dup.Communications) { c.CustomerId = master.Id; master.Communications.Add(c); }
        foreach (var d in dup.Documents) { d.CustomerId = master.Id; master.Documents.Add(d); }

        // Move audit history too.
        var dupAudits = await _db.FieldAudits.Where(a => a.CustomerId == dup.Id).ToListAsync();
        foreach (var a in dupAudits) a.CustomerId = master.Id;

        // Retire the duplicate (never delete history; the ID is never reused).
        dup.MergedIntoCustomerId = master.CustomerId;
        dup.MergedAt = DateTime.UtcNow;
        dup.Status = CustomerStatus.Inactive;
        dup.UpdatedAt = DateTime.UtcNow;

        Log(master, "Customer merged", $"A duplicate record {dup.CustomerId} ({dup.Name}) was merged into {master.CustomerId}. Conflicts: {(conflicts.Count == 0 ? "none" : string.Join(" | ", conflicts))}");
        Log(dup, "Customer retired", $"Merged into {master.CustomerId} â€” this record is closed; references now point to the master.");

        master.ContractStatus = master.ContractStatus == "None" ? dup.ContractStatus : master.ContractStatus;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            message = conflicts.Count == 0 ? "Records merged. No conflicting values were found." : "Records merged, but values need human review.",
            conflicts,
            master = master.CustomerId
        });
    }

    // DELETE /api/v1/customers/{id}  (admin only â€” the register is never casually deleted)
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (!CanDeleteCustomer) return StatusCode(403, new { error = "FORBIDDEN", message = "Only an admin can delete customers." });
        var customer = await _db.Customers.FindAsync(id);
        if (customer is null) return NotFound();
        _db.Customers.Remove(customer);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Everything filed under one customer ID: its job cards…
    [HttpGet("{id:int}/jobs")]
    [Authorize]
    public async Task<IActionResult> Jobs(int id)
    {
        if (!await _db.Customers.AnyAsync(c => c.Id == id)) return NotFound();
        var jobs = await _db.JobCards.AsNoTracking()
            .Where(j => j.CustomerId == id).OrderByDescending(j => j.CreatedAt).ToListAsync();
        return Ok(jobs.Select(j => new
        {
            j.Id, j.JobNumber, j.Title, j.JobType,
            Status = j.Status.ToString(), Priority = j.Priority.ToString(),
            j.PlannedStart, j.QuotedAmount, j.CreatedAt,
        }));
    }

    // …and its quotations (with computed totals).
    [HttpGet("{id:int}/quotations")]
    [Authorize]
    public async Task<IActionResult> Quotations(int id)
    {
        if (!await _db.Customers.AnyAsync(c => c.Id == id)) return NotFound();
        var quotes = await _db.OpsQuotations.AsNoTracking()
            .Include(q => q.Lines)
            .Where(q => q.CustomerId == id).OrderByDescending(q => q.QuoteDate).ToListAsync();
        return Ok(quotes.Select(q =>
        {
            var subtotal = q.Lines.Sum(l => (decimal)l.Quantity * l.UnitPrice);
            var discount = subtotal * q.DiscountPercent / 100;
            var taxable = subtotal - discount;
            return new
            {
                q.Id, q.QuotationNumber, q.Title, q.Status,
                q.QuoteDate, q.ExpiryDate, q.ConvertedJobId,
                Subtotal = subtotal, Total = taxable + taxable * q.TaxPercent / 100,
            };
        }));
    }

    // ---------- nested resources ----------

    // POST /api/v1/customers/{id}/sites
    [HttpPost("{id:int}/sites")]
    public async Task<IActionResult> AddSite(int id, [FromBody] SiteIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers.Include(c => c.Sites).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();
        var site = new CustomerSite
        {
            Name = dto.Name.Trim(),
            SiteType = Enum.TryParse<SiteType>(dto.SiteType, true, out var st) ? st : SiteType.Other,
            Address = dto.Address,
            City = dto.City,
            ContactPerson = dto.ContactPerson,
            Phone = dto.Phone,
            Email = dto.Email,
            IsPrimary = dto.IsPrimary,
            Notes = dto.Notes,
        };
        customer.Sites.Add(site);
        if (dto.IsPrimary)
            foreach (var s in customer.Sites.Where(s => s.Id != site.Id)) s.IsPrimary = false;
        Log(customer, "Site added", site.Name);
        await _db.SaveChangesAsync();
        return Ok(MapSiteOut(site));
    }

    [HttpPut("{id:int}/sites/{siteId:int}")]
    public async Task<IActionResult> UpdateSite(int id, int siteId, [FromBody] SiteIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var site = await _db.CustomerSites.FirstOrDefaultAsync(s => s.Id == siteId && s.CustomerId == id);
        if (site is null) return NotFound();
        site.Name = dto.Name.Trim();
        site.SiteType = Enum.TryParse<SiteType>(dto.SiteType, true, out var st) ? st : SiteType.Other;
        site.Address = dto.Address;
        site.City = dto.City;
        site.ContactPerson = dto.ContactPerson;
        site.Phone = dto.Phone;
        site.Email = dto.Email;
        site.IsPrimary = dto.IsPrimary;
        site.Notes = dto.Notes;
        await _db.SaveChangesAsync();
        return Ok(MapSiteOut(site));
    }

    [HttpDelete("{id:int}/sites/{siteId:int}")]
    public async Task<IActionResult> DeleteSite(int id, int siteId)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var site = await _db.CustomerSites.FirstOrDefaultAsync(s => s.Id == siteId && s.CustomerId == id);
        if (site is null) return NotFound();
        _db.CustomerSites.Remove(site);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST /api/v1/customers/{id}/notes
    [HttpPost("{id:int}/notes")]
    public async Task<IActionResult> AddNote(int id, [FromBody] NoteIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers.Include(c => c.NotesList).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();
        var note = new CustomerNote { Content = dto.Content.Trim(), CreatedBy = dto.CreatedBy, Pinned = dto.Pinned };
        customer.NotesList.Add(note);
        Log(customer, "Note added", note.Content.Length > 60 ? note.Content[..60] + "â€¦" : note.Content);
        await _db.SaveChangesAsync();
        return Ok(MapNote(note));
    }

    [HttpDelete("{id:int}/notes/{noteId:int}")]
    public async Task<IActionResult> DeleteNote(int id, int noteId)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var note = await _db.CustomerNotes.FirstOrDefaultAsync(n => n.Id == noteId && n.CustomerId == id);
        if (note is null) return NotFound();
        _db.CustomerNotes.Remove(note);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST /api/v1/customers/{id}/services
    [HttpPost("{id:int}/services")]
    public async Task<IActionResult> AddService(int id, [FromBody] ServiceIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers.Include(c => c.Services).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();
        var svc = new ServiceRecord
        {
            ServiceDate = dto.ServiceDate,
            Status = ParseServiceStatus(dto.Status),
            UnitsServiced = dto.UnitsServiced,
            StickersUsed = dto.StickersUsed,
            MaterialsUsed = dto.MaterialsUsed,
            EquipmentServiced = dto.EquipmentServiced,
            EquipmentReplaced = dto.EquipmentReplaced,
            EquipmentAdded = dto.EquipmentAdded,
            EquipmentRemoved = dto.EquipmentRemoved,
            DefectsFound = dto.DefectsFound,
            Recommendations = dto.Recommendations,
            ReportSentDate = dto.ReportSentDate,
            CertificateNo = dto.CertificateNo,
            Technician = dto.Technician,
            SiteId = dto.SiteId,
            Notes = dto.Notes,
        };
        customer.Services.Add(svc);

        // roll customer's service schedule forward
        if (svc.Status == ServiceStatus.Completed || svc.Status == ServiceStatus.InProgress)
        {
            customer.LastServiceDate = svc.ServiceDate;
            var freq = customer.ServiceFrequencyMonths ?? 6;
            customer.NextServiceDate = svc.ServiceDate.AddMonths(freq);
        }
        Log(customer, "Service added", $"{svc.ServiceDate:yyyy-MM-dd} Â· {dto.Status}");
        await _db.SaveChangesAsync();
        return Ok(MapService(svc));
    }

    [HttpDelete("{id:int}/services/{serviceId:int}")]
    public async Task<IActionResult> DeleteService(int id, int serviceId)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var svc = await _db.ServiceRecords.FirstOrDefaultAsync(s => s.Id == serviceId && s.CustomerId == id);
        if (svc is null) return NotFound();
        _db.ServiceRecords.Remove(svc);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST /api/v1/customers/{id}/communications
    [HttpPost("{id:int}/communications")]
    public async Task<IActionResult> AddCommunication(int id, [FromBody] CommIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers.Include(c => c.Communications).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();
        var comm = new CustomerCommunication
        {
            Channel = Enum.TryParse<CommunicationChannel>(dto.Channel, true, out var ch) ? ch : CommunicationChannel.WhatsApp,
            Direction = Enum.TryParse<CommunicationDirection>(dto.Direction, true, out var dir) ? dir : CommunicationDirection.Outgoing,
            Subject = dto.Subject,
            Message = dto.Message,
            SentAt = dto.SentAt ?? DateTime.UtcNow,
            CustomerResponded = dto.CustomerResponded,
            ResponseNotes = dto.ResponseNotes,
            FollowUpDate = dto.FollowUpDate,
            ContactName = dto.ContactName,
            CreatedBy = dto.CreatedBy,
        };
        customer.Communications.Add(comm);
        Log(customer, $"{comm.Direction} {comm.Channel}", comm.Subject ?? comm.Message);
        await _db.SaveChangesAsync();
        return Ok(MapComm(comm));
    }

    [HttpPut("{id:int}/communications/{commId:int}")]
    public async Task<IActionResult> UpdateCommunication(int id, int commId, [FromBody] CommIn dto)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var comm = await _db.CustomerCommunications.FirstOrDefaultAsync(x => x.Id == commId && x.CustomerId == id);
        if (comm is null) return NotFound();
        comm.CustomerResponded = dto.CustomerResponded;
        comm.ResponseNotes = dto.ResponseNotes;
        comm.FollowUpDate = dto.FollowUpDate;
        comm.Message = dto.Message;
        comm.Subject = dto.Subject;
        await _db.SaveChangesAsync();
        return Ok(MapComm(comm));
    }

    // POST /api/v1/customers/{id}/documents  (metadata or file upload)
    [HttpPost("{id:int}/documents")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> AddDocument(int id, [FromForm] IFormFile? File, [FromForm] string Name, [FromForm] string DocType, [FromForm] string? Notes, [FromForm] string? UploadedBy)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers.Include(c => c.Documents).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();

        string? path = null;
        long? size = null;
        if (File is { Length: > 0 })
        {
            var dir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "uploads", customer.CustomerId);
            Directory.CreateDirectory(dir);
            var ext = Path.GetExtension(File.FileName);
            var fileName = $"{Guid.NewGuid():N}{ext}";
            var full = Path.Combine(dir, fileName);
            await using var stream = System.IO.File.Create(full);
            await File.CopyToAsync(stream);
            path = $"/uploads/{customer.CustomerId}/{fileName}";
            size = File.Length;
        }

        var doc = new CustomerDocument
        {
            Name = string.IsNullOrWhiteSpace(Name) ? (File?.FileName ?? "Document") : Name.Trim(),
            DocType = Enum.TryParse<DocumentType>(DocType, true, out var dt) ? dt : DocumentType.Other,
            FilePath = path,
            SizeBytes = size,
            Notes = Notes,
            UploadedBy = UploadedBy,
        };
        customer.Documents.Add(doc);
        Log(customer, "Document uploaded", doc.Name);
        await _db.SaveChangesAsync();
        return Ok(MapDoc(doc));
    }

    // POST /api/v1/customers/{id}/documents/extract â€” best-effort field + company auto-match (no persistence)
    [HttpPost("{id:int}/documents/extract")]
    public async Task<IActionResult> ExtractDocument(int id, [FromForm] string? Name, [FromForm] string? DocType, [FromForm] string? Notes)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return NotFound();

        var hay = $"{Name ?? ""} {Notes ?? ""} {DocType ?? ""}";
        var inv = System.Text.RegularExpressions.Regex.Match(hay, @"(?i)(?:invoice\s*(?:no\.?|#|number)?\s*[:#]?\s*)([A-Z0-9\-]{4,24})");
        var amt = System.Text.RegularExpressions.Regex.Match(hay, @"(?i)(?:US\$|\$|USD|ZW\$|R)\s?([\d,]+(?:\.\d{2})?)");
        var dt_ = System.Text.RegularExpressions.Regex.Match(hay, @"(?i)\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b");
        var vat = System.Text.RegularExpressions.Regex.Match(hay, @"(?i)vat\s*(?:no\.?|#)?\s*[:#]?\s*([A-Z0-9\-]{6,16})");

        var companies = await _db.Customers.Where(c => c.Id != id && !string.IsNullOrWhiteSpace(c.Name)).Select(c => new { c.Id, c.Name }).ToListAsync();
        var tokens = System.Text.RegularExpressions.Regex.Matches(hay.ToLowerInvariant(), @"[a-z]{4,}").Select(m => m.Value).Distinct().ToList();
        var matches = companies
            .Select(c => new { c.Id, c.Name, score = tokens.Count(t => c.Name!.ToLowerInvariant().Contains(t)) })
            .Where(x => x.score > 0)
            .OrderByDescending(x => x.score)
            .Take(4)
            .Select(x => new CompanyMatchOut(x.Id, x.Name!, x.score))
            .ToList();

        var f = new ExtractedFields(customer.Name ?? customer.CustomerId, inv.Success ? inv.Groups[1].Value : null, amt.Success ? amt.Groups[1].Value : null, dt_.Success ? dt_.Groups[1].Value : null, vat.Success ? vat.Groups[1].Value : null, matches);
        return Ok(f);
    }

    // PATCH /api/v1/customers/{id}/documents/{docId} â€” persist a confirmed auto-match (notes only)
    [HttpPatch("{id:int}/documents/{docId:int}")]
    public async Task<IActionResult> PatchDocument(int id, int docId, [FromBody] PatchDocumentIn req)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var doc = await _db.CustomerDocuments.FirstOrDefaultAsync(d => d.Id == docId && d.CustomerId == id);
        if (doc is null) return NotFound();
        doc.Notes = req.Notes ?? doc.Notes;
        await _db.SaveChangesAsync();
        Log(await _db.Customers.FindAsync(id), "Document matched", doc.Name);
        return Ok(MapDoc(doc));
    }

    // GET /api/v1/customers/{id}/documents/{docId}/download?inline=true
    // Streams the stored file with auth (static /uploads bypasses auth and
    // isn't proxied by nginx/vite — this endpoint is the supported path).
    [HttpGet("{id:int}/documents/{docId:int}/download")]
    public async Task<IActionResult> DownloadDocument(int id, int docId, [FromQuery] bool inline = false)
    {
        var doc = await _db.CustomerDocuments.FirstOrDefaultAsync(d => d.Id == docId && d.CustomerId == id);
        if (doc is null || string.IsNullOrEmpty(doc.FilePath)) return NotFound();
        var full = Path.Combine(_env.ContentRootPath, "wwwroot", doc.FilePath.TrimStart('/'));
        if (!System.IO.File.Exists(full)) return NotFound();

        var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
        if (!provider.TryGetContentType(full, out var contentType)) contentType = "application/octet-stream";

        var ext = Path.GetExtension(full);
        var name = string.IsNullOrWhiteSpace(doc.Name) ? Path.GetFileName(full) : doc.Name.Trim();
        if (!string.IsNullOrEmpty(ext) && !name.EndsWith(ext, StringComparison.OrdinalIgnoreCase)) name += ext;
        Response.Headers.ContentDisposition = inline
            ? $"inline; filename*=UTF-8''{Uri.EscapeDataString(name)}"
            : $"attachment; filename*=UTF-8''{Uri.EscapeDataString(name)}";
        var stream = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read);
        return File(stream, contentType, enableRangeProcessing: true);
    }

    [HttpDelete("{id:int}/documents/{docId:int}")]
    public async Task<IActionResult> DeleteDocument(int id, int docId)
    {
        if (!CanWriteCustomer) return CustomerWriteDenied();
        var doc = await _db.CustomerDocuments.FirstOrDefaultAsync(d => d.Id == docId && d.CustomerId == id);
        if (doc is null) return NotFound();
        if (!string.IsNullOrEmpty(doc.FilePath))
        {
            var full = Path.Combine(_env.ContentRootPath, "wwwroot", doc.FilePath.TrimStart('/'));
            if (System.IO.File.Exists(full)) System.IO.File.Delete(full);
        }
        _db.CustomerDocuments.Remove(doc);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
