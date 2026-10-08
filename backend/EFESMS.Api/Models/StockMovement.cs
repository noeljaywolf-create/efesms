namespace EFESMS.Api.Models;

public class StockMovement
{
    public int Id { get; set; }
    public int InventoryItemId { get; set; }
    public string Type { get; set; } = "in";          // in | out
    public string Source { get; set; } = "receive";    // receive | issue | job | sale
    public decimal Qty { get; set; }
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
    public decimal BalanceAfter { get; set; }
    public InventoryItem? InventoryItem { get; set; }
}
