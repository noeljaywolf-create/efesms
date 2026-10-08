namespace FireOpsAI.Models;

public enum JobStatus
{
    Draft = 1,
    Assigned = 2,
    Scheduled = 3,
    InProgress = 4,
    Completed = 5,
    Closed = 6,
    Cancelled = 7
}

public enum Priority
{
    Low = 1,
    Normal = 2,
    High = 3,
    Urgent = 4
}

public class JobCard
{
    public int Id { get; set; }
    public int? SiteId { get; set; }
    public int? CustomerId { get; set; }
    public int? EquipmentId { get; set; }
    public string? Number { get; set; }
    public string JobType { get; set; } = "Service"; // Inspection | Service | Refill | Maintenance | Installation
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Draft;
    public Priority Priority { get; set; } = Priority.Normal;
    public int? AssignedTechnicianId { get; set; }
    public DateTime? PlannedStart { get; set; }
    public DateTime? PlannedEnd { get; set; }
    public DateTime? CompletedAt { get; set; }
    public double? EstimatedHours { get; set; }
    public IReadOnlyList<string> RequiredSkills { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> RequiredCertifications { get; set; } = Array.Empty<string>();
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public decimal? QuotedAmount { get; set; }
    public string? Notes { get; set; }
    public DateTime? NextServiceDate { get; set; }
    public string? CustomerName { get; set; }
}

public class Technician
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string Trade { get; set; } = "Fire Technician";
    public string? Vehicle { get; set; }
    public int MaxConcurrentJobs { get; set; } = 4;
    public bool Available { get; set; } = true;
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public IReadOnlyList<string> Skills { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> Certifications { get; set; } = Array.Empty<string>();
    public DateTime? CertificationExpiry { get; set; }
    public decimal HourlyRate { get; set; }
    public IReadOnlyList<int> CurrentJobIds { get; set; } = Array.Empty<int>();
}

public class Equipment
{
    public int Id { get; set; }
    public int? SiteId { get; set; }
    public string? EquipmentNumber { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = ""; // Extinguisher | Hose Reel | Sprinkler | Alarm | Detection | Hydrant | ...
    public string Model { get; set; } = "";
    public string Make { get; set; } = "";
    public string? SerialNumber { get; set; }
    public string? AgentType { get; set; }
    public DateTime? ManufactureDate { get; set; }
    public DateTime? InstallationDate { get; set; }
    public DateTime? LastInspectionDate { get; set; }
    public DateTime? LastServiceDate { get; set; }
    public DateTime? NextServiceDue { get; set; }
    public int ConditionRating { get; set; } = 10; // 1..10
    public int LifeSpanMonths { get; set; } = 120;
    public int ServiceIntervalMonths { get; set; } = 6;
    public string Status { get; set; } = "In Service";
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}

public class Site
{
    public int Id { get; set; }
    public int? CustomerId { get; set; }
    public string Name { get; set; } = "";
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? BuildingType { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string Status { get; set; } = "Active";
}

public class InventoryItem
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public int CurrentStock { get; set; }
    public int ReorderLevel { get; set; }
    public decimal UnitCost { get; set; }
    public string? Unit { get; set; }
    public int LeadTimeDays { get; set; } = 7;
    public IDictionary<string, int> MonthlyUsage { get; set; } = new Dictionary<string, int>();
}
