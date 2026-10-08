using System;

namespace EFESMS.Api.Models;

public class OpsEquipment
{
    public int Id { get; set; }
    public string EquipmentNumber { get; set; } = "";
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int? SiteId { get; set; }
    public CustomerSite? Site { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string Model { get; set; } = "";
    public string Make { get; set; } = "";
    public string? SerialNumber { get; set; }
    public string? AgentType { get; set; }
    public DateTime? ManufactureDate { get; set; }
    public DateTime? InstallationDate { get; set; }
    public DateTime? LastInspectionDate { get; set; }
    public DateTime? LastServiceDate { get; set; }
    public DateTime? NextServiceDue { get; set; }
    public int ConditionRating { get; set; } = 10;
    public int LifeSpanMonths { get; set; } = 120;
    public int ServiceIntervalMonths { get; set; } = 6;
    public string Status { get; set; } = "In Service";
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
