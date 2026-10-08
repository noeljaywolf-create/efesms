namespace EFESMS.Api.Models;

public enum SiteType
{
    HeadOffice,
    Warehouse,
    Factory,
    Branch,
    Other
}

public class CustomerSite
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Name { get; set; } = string.Empty;
    public SiteType SiteType { get; set; } = SiteType.Other;
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? ContactPerson { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsPrimary { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}