namespace EFESMS.Api.Models;

/// <summary>Store-managed installation equipment and materials, kept separate from service inventory.</summary>
public class StoreItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Unit { get; set; } = "unit";
    public int CurrentStock { get; set; }
    public decimal UnitCost { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
