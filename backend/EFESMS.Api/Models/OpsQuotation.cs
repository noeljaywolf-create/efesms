using System;

namespace EFESMS.Api.Models;

public class OpsQuotation
{
    public int Id { get; set; }
    public string QuotationNumber { get; set; } = "";
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int? SiteId { get; set; }
    public CustomerSite? Site { get; set; }
    public string Title { get; set; } = "";
    public DateTime QuoteDate { get; set; } = DateTime.UtcNow;
    public DateTime ExpiryDate { get; set; } = DateTime.UtcNow.AddDays(30);
    public decimal DiscountPercent { get; set; }
    public decimal TaxPercent { get; set; } = 15.5m;
    public string? Terms { get; set; }
    public string Status { get; set; } = "Draft";
    public int? ConvertedJobId { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    // Snapshot of customer/document data so the quotation keeps all data even if customer not in system or later changed.
    public string? CustomerAddress { get; set; }
    public string? CustomerVat { get; set; }
    public string? CustomerTin { get; set; }
    public string? CustomerContact { get; set; }
    public string? CustomerEmailSnapshot { get; set; }
    public string? Currency { get; set; }
    public string? CompanyVatNo { get; set; }
    public string? CompanyTinNo { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public string? BankAccountName { get; set; }
    public string? BankAccountNumber { get; set; }
    public string? BankAccountNumberZwg { get; set; }
    public string? DocumentRef { get; set; }
    public string? PaymentTerms { get; set; }
    public string? ValidityText { get; set; }
    public List<OpsQuotationLine> Lines { get; set; } = new();
    public List<OpsQuotationFile> Files { get; set; } = new();
}
