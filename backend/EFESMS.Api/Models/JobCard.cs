using System;
using System.Collections.Generic;

namespace EFESMS.Api.Models;

public enum JobCardStatus
{
    Draft = 1,
    Assigned = 2,
    Scheduled = 3,
    InProgress = 4,
    Completed = 5,
    Closed = 6,
    Cancelled = 7
}

public enum JobCardPriority
{
    Low = 1,
    Normal = 2,
    High = 3,
    Urgent = 4
}

public class JobCard
{
    public int Id { get; set; }
    public string JobNumber { get; set; } = "";
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int? SiteId { get; set; }
    public CustomerSite? Site { get; set; }
    public int? EquipmentId { get; set; }
    public OpsEquipment? Equipment { get; set; }
    public string? AgentType { get; set; }
    public double? AgentAmountKg { get; set; }
    public int UnitCount { get; set; } = 1;
    public string JobType { get; set; } = "Service";
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public JobCardStatus Status { get; set; } = JobCardStatus.Draft;
    public JobCardPriority Priority { get; set; } = JobCardPriority.Normal;
    public int? AssignedTechnicianId { get; set; }
    public Technician? Technician { get; set; }
    public DateTime? PlannedStart { get; set; }
    public DateTime? PlannedEnd { get; set; }
    public DateTime? CompletedAt { get; set; }
    public double? EstimatedHours { get; set; }
    public string RequiredSkills { get; set; } = "";
    public string RequiredCertifications { get; set; } = "";
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public decimal? QuotedAmount { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Address { get; set; }
    public string? Email { get; set; }
    public DateTime? NextServiceDate { get; set; }
    public bool WorksDoneSatisfactorily { get; set; }

    /// <summary>
    /// Individual work lines on this job card. Additive: when this list is empty the
    /// single-unit fields above (EquipmentId / JobType / AgentType / UnitCount) keep
    /// their original meaning and are used exactly as before.
    /// </summary>
    public List<JobCardTask> Tasks { get; set; } = new();
}