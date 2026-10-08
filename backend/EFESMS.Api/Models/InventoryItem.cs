using System;

namespace EFESMS.Api.Models;

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
    public string MonthlyUsage { get; set; } = "";
    public string? CustomerName { get; set; }
    public decimal? LastReceivedQty { get; set; }
    public DateTime? LastReceivedDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}