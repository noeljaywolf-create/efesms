namespace EFESMS.Api.Models;

public class CustomerActivity
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? Actor { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}