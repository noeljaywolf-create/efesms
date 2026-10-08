using System;

namespace EFESMS.Api.Models;

public class OpsCertification
{
    public int Id { get; set; }
    public int? TechnicianId { get; set; }
    public string Name { get; set; } = "";
    public DateTime ExpiryDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}