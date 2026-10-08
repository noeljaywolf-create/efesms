using System;

namespace EFESMS.Api.Models;

public class Technician
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string Trade { get; set; } = "Fire Technician";
    public string? Vehicle { get; set; }
    public int MaxConcurrentJobs { get; set; } = 4;
    public bool Available { get; set; } = true;
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string Skills { get; set; } = "";
    public string Certifications { get; set; } = "";
    public DateTime? CertificationExpiry { get; set; }
    public decimal HourlyRate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}