namespace EFESMS.Api.Models;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "admin";
    public string Department { get; set; } = "Administration";
    public bool IsActive { get; set; } = true;
    // Incremented on credential changes so previously issued JWTs are revoked immediately.
    public int AuthVersion { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
