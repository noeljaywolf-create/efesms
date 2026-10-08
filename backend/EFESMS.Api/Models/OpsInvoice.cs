using System;

namespace EFESMS.Api.Models;

public class OpsInvoice
{
    public int Id { get; set; }
    public string InvoiceNumber { get; set; } = "";
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public decimal Amount { get; set; }
    public DateTime IssueDate { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? PaidDate { get; set; }
    public string Status { get; set; } = "Unpaid";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}