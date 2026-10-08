using System;

namespace EFESMS.Api.Models;

public class OpsRefill
{
    public int Id { get; set; }
    public int? JobId { get; set; }
    public int? JobTaskId { get; set; }
    public int? EquipmentId { get; set; }
    public int? TechnicianId { get; set; }
    public int? CustomerId { get; set; }
    public int? SiteId { get; set; }
    public DateTime RefillDate { get; set; }
    public string AgentType { get; set; } = "";
    public double AgentAmountKg { get; set; }
    public int Quantity { get; set; } = 1;
    public decimal Cost { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
