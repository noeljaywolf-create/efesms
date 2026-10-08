namespace FireOpsAI.Models;

public class Inspection
{
    public int Id { get; set; }
    public int? JobId { get; set; }
    public int? EquipmentId { get; set; }
    public int? TechnicianId { get; set; }
    public DateTime InspectionDate { get; set; }
    public string Result { get; set; } = "Pass"; // Pass | Fail | Conditional
    public decimal Cost { get; set; }
    public string? Findings { get; set; }
    public DateTime? NextInspectionDue { get; set; }
}

public class Service
{
    public int Id { get; set; }
    public int? JobId { get; set; }
    public int? EquipmentId { get; set; }
    public int? TechnicianId { get; set; }
    public DateTime ServiceDate { get; set; }
    public string Category { get; set; } = "";
    public decimal Cost { get; set; }
    public string? Notes { get; set; }
}

public class Refill
{
    public int Id { get; set; }
    public int? JobId { get; set; }
    public int? EquipmentId { get; set; }
    public int? TechnicianId { get; set; }
    public DateTime RefillDate { get; set; }
    public string AgentType { get; set; } = "";
    public double AgentAmountKg { get; set; }
    public decimal Cost { get; set; }
    public string? Notes { get; set; }
}

public class Maintenance
{
    public int Id { get; set; }
    public int? JobId { get; set; }
    public int? EquipmentId { get; set; }
    public int? TechnicianId { get; set; }
    public DateTime WorkDate { get; set; }
    public string WorkType { get; set; } = ""; // Repair | Replace | Overhaul | Install
    public decimal Cost { get; set; }
    public string? Findings { get; set; }
}

public class Certification
{
    public int TechnicianId { get; set; }
    public string Name { get; set; } = "";
    public DateTime ExpiryDate { get; set; }
}

public class Invoice
{
    public int Id { get; set; }
    public int? CustomerId { get; set; }
    public decimal Amount { get; set; }
    public DateTime IssueDate { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? PaidDate { get; set; }
    public string Status { get; set; } = "Unpaid";
}

public class AuditEvent
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string? EntityType { get; set; }
    public string? Action { get; set; }
    public decimal? Value { get; set; }
    public string? Detail { get; set; }
}