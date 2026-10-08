namespace EFESMS.Api.Models;

public enum ServiceStatus
{
    Scheduled,
    Completed,
    InProgress,
    Cancelled
}

public class ServiceRecord
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int? SiteId { get; set; }
    public CustomerSite? Site { get; set; }
    public DateTime ServiceDate { get; set; }
    public ServiceStatus Status { get; set; } = ServiceStatus.Scheduled;
    public int UnitsServiced { get; set; }
    public int StickersUsed { get; set; }
    public string? MaterialsUsed { get; set; }
    public int EquipmentServiced { get; set; }
    public int EquipmentReplaced { get; set; }
    public int EquipmentAdded { get; set; }
    public int EquipmentRemoved { get; set; }
    public string? DefectsFound { get; set; }
    public string? Recommendations { get; set; }
    public DateTime? ReportSentDate { get; set; }
    public string? CertificateNo { get; set; }
    public string? Technician { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}