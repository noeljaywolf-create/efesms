namespace EFESMS.Api.Models;

public class CustomerContact
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Role { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string? Email { get; set; }
    public bool IsPrimary { get; set; }
    public bool EmailConsent { get; set; } = true;
    public bool PhoneConsent { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}