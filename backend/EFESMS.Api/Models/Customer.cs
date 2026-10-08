using EFESMS.Api.Models;

#nullable disable

namespace EFESMS.Api.Models;

public enum CustomerType
{
    Commercial,
    Industrial,
    Institutional,
    Residential,
    Government
}

public enum CustomerStatus
{
    Prospect,
    Active,
    Inactive,
    Blacklisted
}

public enum CustomerPriority
{
    Low,
    Normal,
    High,
    Critical
}

public enum PreferredContactMethod
{
    Email,
    Phone,
    WhatsApp,
    SMS
}

public enum ServiceReminderStatus
{
    None,
    UpToDate,
    DueSoon,
    Due,
    Overdue
}

public class Customer
{
    public int Id { get; set; }
    public string CustomerId { get; set; } = string.Empty; // e.g. CUS-000124
    public string Name { get; set; } = string.Empty;
    public string? AlternativeName { get; set; }
    public string? LegalName { get; set; }
    public CustomerType CustomerType { get; set; } = CustomerType.Commercial;
    public string? VatNumber { get; set; }
    public string? TinNumber { get; set; }
    public string? RegistrationNumber { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string? WhatsApp { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public CustomerStatus Status { get; set; } = CustomerStatus.Prospect;
    public CustomerPriority Priority { get; set; } = CustomerPriority.Normal;
    public string? Category { get; set; }
    public string? AccountManager { get; set; }
    public DateTime? CustomerSince { get; set; }
    public int? ServiceFrequencyMonths { get; set; }
    public DateTime? LastServiceDate { get; set; }
    public DateTime? NextServiceDate { get; set; }
    public PreferredContactMethod PreferredContact { get; set; } = PreferredContactMethod.Phone;
    public string? SpecialRequirements { get; set; }
    public string? BillingAddress { get; set; }
    public string? PaymentTerms { get; set; }
    public string? CreditInfo { get; set; }
    public string? ContractRef { get; set; }
    public DateTime? ContractStartDate { get; set; }
    public DateTime? ContractEndDate { get; set; }
    public decimal? ContractValue { get; set; }
    public string ContractStatus { get; set; } = "None";
    public string? Notes { get; set; }
    public int? AccountManagerUserId { get; set; }
    public string? MergedIntoCustomerId { get; set; }
    public DateTime? MergedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<CustomerContact> Contacts { get; set; } = new();
    public List<CustomerSite> Sites { get; set; } = new();
    public List<CustomerNote> NotesList { get; set; } = new();
    public List<ServiceRecord> Services { get; set; } = new();
    public List<CustomerCommunication> Communications { get; set; } = new();
    public List<CustomerDocument> Documents { get; set; } = new();
    public List<CustomerActivity> Activities { get; set; } = new();
}