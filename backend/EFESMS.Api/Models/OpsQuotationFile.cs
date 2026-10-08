namespace EFESMS.Api.Models;

public class OpsQuotationFile
{
    public int Id { get; set; }
    /// <summary>Null = inbox upload (extracted before a quotation exists).</summary>
    public int? QuotationId { get; set; }
    public OpsQuotation? Quotation { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? FilePath { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public string? UploadedBy { get; set; }
}
