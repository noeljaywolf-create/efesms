namespace EFESMS.Api.Models;

public enum DocumentType
{
    ServiceReport,
    Certificate,
    Quotation,
    Invoice,
    Contract,
    Photo,
    InspectionReport,
    Other
}

public class CustomerDocument
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Name { get; set; } = string.Empty;
    public DocumentType DocType { get; set; } = DocumentType.Other;
    public string? FilePath { get; set; }
    public long? SizeBytes { get; set; }
    public string? Notes { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public string? UploadedBy { get; set; }
}