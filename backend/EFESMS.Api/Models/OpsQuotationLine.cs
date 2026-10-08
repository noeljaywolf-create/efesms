using System;

namespace EFESMS.Api.Models;

public class OpsQuotationLine
{
    public int Id { get; set; }
    public int QuotationId { get; set; }
    public OpsQuotation? Quotation { get; set; }
    public string Description { get; set; } = "";
    public double Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public int SortOrder { get; set; }
}
