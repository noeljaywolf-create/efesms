using System;

namespace EFESMS.Api.Models;

/// <summary>
/// A single line of work on a job card. One customer visit can need many lines:
/// e.g. refill 3x 9kg DCP, service 3x 2.5kg CO2, supply 5 new from stock.
/// TaskType is one of JobTaskTypes below.
/// </summary>
public class JobCardTask
{
    public int Id { get; set; }
    public int JobCardId { get; set; }
    public JobCard? JobCard { get; set; }

    /// <summary>Refill | Service | Inspection | Maintenance | Installation | Supply</summary>
    public string TaskType { get; set; } = "Service";

    /// <summary>
    /// Comma-separated OpsEquipment Ids this line covers, e.g. "12,15,19".
    /// Empty means the work is a bulk quantity against no individually tracked unit.
    /// </summary>
    public string? EquipmentIds { get; set; }

    /// <summary>Stock item issued to the customer. Supply tasks only.</summary>
    public int? InventoryItemId { get; set; }
    /// <summary>Store catalog material issued on this job; separate from extinguisher Inventory.</summary>
    public int? StoreItemId { get; set; }
    /// <summary>Catalog name snapshot makes the printed job card readable if the catalog changes.</summary>
    public string? StoreItemName { get; set; }


    /// <summary>Number of units handled by this line. Defaults to 1.</summary>
    public double Quantity { get; set; } = 1;

    /// <summary>Per-task agent, e.g. "9kg ABC Dry Powder". Capacity is parsed from here.</summary>
    public string? AgentType { get; set; }
    /// <summary>Capacity-specific extinguisher model, e.g. "2.5kg DCP".</summary>
    public string? UnitType { get; set; }
    public double? AgentAmountKg { get; set; }

    /// <summary>Unit price for Supply tasks so the job card carries a supply value.</summary>
    public decimal? UnitPrice { get; set; }

    public bool IsCompleted { get; set; }
    public string? Notes { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Set the moment a stock issue actually ran. Stock lines are one-shot: once stamped they are never re-issued, so re-saving a job can
    /// never double-deduct stock or duplicate the units it registered.
    /// </summary>
    public DateTime? AppliedAt { get; set; }
}

public static class JobTaskTypes
{
    public const string Inspection = "Inspection";
    public const string Service = "Service";
    public const string Refill = "Refill";
    public const string Maintenance = "Maintenance";
    public const string Installation = "Installation";
    public const string Supply = "Supply";
    public const string StoreSupply = "Store supply";
    public const string Assessment = "Assessment";

    public static readonly string[] All =
    {
        Inspection, Assessment, Service, Refill, Maintenance, Installation, Supply, StoreSupply
    };

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && Array.IndexOf(All, value.Trim()) >= 0;
}
