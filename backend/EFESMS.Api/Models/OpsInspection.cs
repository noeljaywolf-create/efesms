using System;

namespace EFESMS.Api.Models;

public class OpsInspection
{
    public int Id { get; set; }
    public int? JobId { get; set; }
    public int? JobTaskId { get; set; }
    public int? EquipmentId { get; set; }
    public int? TechnicianId { get; set; }
    public int? CustomerId { get; set; }
    public int? SiteId { get; set; }
    public DateTime InspectionDate { get; set; }
    public string Result { get; set; } = "Pass";
    public int Quantity { get; set; } = 1;
    public decimal Cost { get; set; }
    public string? Findings { get; set; }
    public DateTime? NextInspectionDue { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
