namespace EFESMS.Api.Models;

/// <summary>Receipt and issue audit entry for a StoreItem; it never changes extinguisher Inventory.</summary>
public class StoreMovement
{
    public int Id { get; set; }
    public int StoreItemId { get; set; }
    public StoreItem? StoreItem { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string ItemCategory { get; set; } = string.Empty;
    public string ItemUnit { get; set; } = "unit";
    public string Type { get; set; } = "in";
    public int Qty { get; set; }
    public int? CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public int? JobId { get; set; }
    public string? JobNumber { get; set; }
    public string? Reference { get; set; }
    public string? Supplier { get; set; }
    public string? ReceiptNumber { get; set; }
    public decimal? UnitCost { get; set; }
    public decimal? TotalCost { get; set; }
    public string? DocumentName { get; set; }
    public string? DocumentPath { get; set; }
    public string? DocumentContentType { get; set; }
    public long? DocumentSizeBytes { get; set; }
    public string? Notes { get; set; }
    public string? MovedBy { get; set; }
    public DateTime MovedAt { get; set; } = DateTime.UtcNow;
    public int BalanceAfter { get; set; }
}
