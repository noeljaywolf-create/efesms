using EFESMS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EFESMS.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerContact> CustomerContacts => Set<CustomerContact>();
    public DbSet<CustomerSite> CustomerSites => Set<CustomerSite>();
    public DbSet<CustomerNote> CustomerNotes => Set<CustomerNote>();
    public DbSet<ServiceRecord> ServiceRecords => Set<ServiceRecord>();
    public DbSet<CustomerCommunication> CustomerCommunications => Set<CustomerCommunication>();
    public DbSet<CustomerDocument> CustomerDocuments => Set<CustomerDocument>();
    public DbSet<CustomerActivity> CustomerActivities => Set<CustomerActivity>();
    public DbSet<FieldAudit> FieldAudits => Set<FieldAudit>();
    public DbSet<Technician> Technicians => Set<Technician>();
    public DbSet<JobCard> JobCards => Set<JobCard>();
    public DbSet<JobCardTask> JobCardTasks => Set<JobCardTask>();
    public DbSet<OpsEquipment> OpsEquipment => Set<OpsEquipment>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<StoreItem> StoreItems => Set<StoreItem>();
    public DbSet<StoreMovement> StoreMovements => Set<StoreMovement>();
    public DbSet<OpsInspection> OpsInspections => Set<OpsInspection>();
    // Additive: JobTaskId on the three work registers ties a row back to a JobCardTasks row.
    public DbSet<OpsRefill> OpsRefills => Set<OpsRefill>();
    public DbSet<OpsMaintenance> OpsMaintenance => Set<OpsMaintenance>();
    public DbSet<OpsCertification> OpsCertifications => Set<OpsCertification>();
    public DbSet<OpsInvoice> OpsInvoices => Set<OpsInvoice>();
    public DbSet<OpsQuotation> OpsQuotations => Set<OpsQuotation>();
    public DbSet<OpsQuotationLine> OpsQuotationLines => Set<OpsQuotationLine>();
    public DbSet<OpsQuotationFile> OpsQuotationFiles => Set<OpsQuotationFile>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.Property(x => x.Username).HasMaxLength(100).IsRequired();
            e.Property(x => x.Email).HasMaxLength(255).IsRequired();
            e.Property(x => x.PasswordHash).HasMaxLength(512).IsRequired();
            e.Property(x => x.DisplayName).HasMaxLength(255).IsRequired();
            e.Property(x => x.Role).HasMaxLength(50).IsRequired();
            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Department).HasMaxLength(100);
        });

        modelBuilder.Entity<Customer>(e =>
        {
            e.Property(x => x.CustomerId).HasMaxLength(16);
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.LegalName).HasMaxLength(255);
            e.Property(x => x.VatNumber).HasMaxLength(20);
            e.Property(x => x.RegistrationNumber).HasMaxLength(50);
            e.Property(x => x.Phone).HasMaxLength(30).IsRequired();
            e.Property(x => x.WhatsApp).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(255);
            e.Property(x => x.Website).HasMaxLength(255);
            e.Property(x => x.Category).HasMaxLength(100);
            e.Property(x => x.AccountManager).HasMaxLength(100);
            e.Property(x => x.SpecialRequirements).HasMaxLength(2000);
            e.Property(x => x.BillingAddress).HasMaxLength(500);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasIndex(x => x.CustomerId).IsUnique();
            e.HasIndex(x => x.Name).IsUnique();
            e.HasIndex(x => x.Email);
            e.Property(x => x.AlternativeName).HasMaxLength(255);
            e.Property(x => x.TinNumber).HasMaxLength(20);
            e.Property(x => x.PaymentTerms).HasMaxLength(255);
            e.Property(x => x.CreditInfo).HasMaxLength(1000);
            e.Property(x => x.ContractRef).HasMaxLength(100);
            e.Property(x => x.ContractStatus).HasMaxLength(30);
            e.Property(x => x.ContractValue).HasPrecision(18, 2);
            e.HasIndex(x => x.VatNumber);
        });

        modelBuilder.Entity<CustomerContact>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.Role).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(30).IsRequired();
            e.Property(x => x.Email).HasMaxLength(255);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Contacts)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerSite>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.Address).HasMaxLength(500);
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.ContactPerson).HasMaxLength(255);
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(255);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Sites)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerNote>(e =>
        {
            e.Property(x => x.Content).HasMaxLength(4000).IsRequired();
            e.Property(x => x.CreatedBy).HasMaxLength(100);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.NotesList)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ServiceRecord>(e =>
        {
            e.Property(x => x.MaterialsUsed).HasMaxLength(2000);
            e.Property(x => x.DefectsFound).HasMaxLength(2000);
            e.Property(x => x.Recommendations).HasMaxLength(2000);
            e.Property(x => x.CertificateNo).HasMaxLength(50);
            e.Property(x => x.Technician).HasMaxLength(100);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Services)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site)
                .WithMany()
                .HasForeignKey(x => x.SiteId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CustomerCommunication>(e =>
        {
            e.Property(x => x.Subject).HasMaxLength(255);
            e.Property(x => x.Message).HasMaxLength(4000);
            e.Property(x => x.ResponseNotes).HasMaxLength(2000);
            e.Property(x => x.ContactName).HasMaxLength(255);
            e.Property(x => x.CreatedBy).HasMaxLength(100);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Communications)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerDocument>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.FilePath).HasMaxLength(512);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.UploadedBy).HasMaxLength(100);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Documents)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerActivity>(e =>
        {
            e.Property(x => x.Action).HasMaxLength(255).IsRequired();
            e.Property(x => x.Details).HasMaxLength(1000);
            e.Property(x => x.Actor).HasMaxLength(100);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Activities)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FieldAudit>(e =>
        {
            e.Property(x => x.Field).HasMaxLength(100).IsRequired();
            e.Property(x => x.Before).HasMaxLength(2000);
            e.Property(x => x.After).HasMaxLength(2000);
            e.Property(x => x.UserName).HasMaxLength(255);
            e.Property(x => x.Role).HasMaxLength(50);
            e.Property(x => x.Department).HasMaxLength(100);
            e.Property(x => x.Reason).HasMaxLength(1000);
            e.HasIndex(x => new { x.CustomerId, x.Field });
            e.HasOne(x => x.Customer)
                .WithMany()
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Technician>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.Email).HasMaxLength(255);
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Trade).HasMaxLength(100).IsRequired();
            e.Property(x => x.Vehicle).HasMaxLength(100);
            e.Property(x => x.Skills).HasMaxLength(2000);
            e.Property(x => x.Certifications).HasMaxLength(2000);
            e.Property(x => x.HourlyRate).HasPrecision(18, 2);
        });

            modelBuilder.Entity<JobCard>(e =>
            {
                e.Property(x => x.JobNumber).HasMaxLength(20).IsRequired();
                e.Property(x => x.JobType).HasMaxLength(50).IsRequired();
                e.Property(x => x.Title).HasMaxLength(255).IsRequired();
                e.Property(x => x.Description).HasMaxLength(2000);
                e.Property(x => x.RequiredSkills).HasMaxLength(2000);
                e.Property(x => x.RequiredCertifications).HasMaxLength(2000);
                e.Property(x => x.Notes).HasMaxLength(2000);
                e.Property(x => x.Address).HasMaxLength(500);
                e.Property(x => x.Email).HasMaxLength(255);
                e.Property(x => x.QuotedAmount).HasPrecision(18, 2);
                e.Property(x => x.AgentType).HasMaxLength(100);
                e.Property(x => x.UnitCount).HasDefaultValue(1).IsRequired();
                e.HasIndex(x => x.JobNumber).IsUnique();
                e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
                e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.SetNull);
                e.HasOne(x => x.Technician).WithMany().HasForeignKey(x => x.AssignedTechnicianId).OnDelete(DeleteBehavior.SetNull);
                e.HasOne(x => x.Equipment).WithMany().HasForeignKey(x => x.EquipmentId).OnDelete(DeleteBehavior.SetNull);
                e.HasMany(x => x.Tasks).WithOne(x => x.JobCard!).HasForeignKey(x => x.JobCardId).OnDelete(DeleteBehavior.Cascade);
            });

        modelBuilder.Entity<JobCardTask>(e =>
        {
            e.Property(x => x.TaskType).HasMaxLength(50).IsRequired();
            e.Property(x => x.EquipmentIds).HasMaxLength(2000);
            e.Property(x => x.AgentType).HasMaxLength(100);
            e.Property(x => x.UnitType).HasMaxLength(120);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.Quantity).HasDefaultValue(1).IsRequired();
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.HasIndex(x => x.JobCardId);
        });

        modelBuilder.Entity<OpsEquipment>(e =>
        {
            e.Property(x => x.EquipmentNumber).HasMaxLength(30).IsRequired();
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100).IsRequired();
            e.Property(x => x.Model).HasMaxLength(100);
            e.Property(x => x.Make).HasMaxLength(100);
            e.Property(x => x.SerialNumber).HasMaxLength(100);
            e.Property(x => x.AgentType).HasMaxLength(100);
            e.Property(x => x.Status).HasMaxLength(50);
            e.HasIndex(x => x.EquipmentNumber);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<InventoryItem>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100).IsRequired();
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.UnitCost).HasPrecision(18, 2);
            e.Property(x => x.MonthlyUsage).HasMaxLength(2000);
        });

        modelBuilder.Entity<StockMovement>(e =>
        {
            e.Property(x => x.Type).HasMaxLength(10).IsRequired();
            e.Property(x => x.Source).HasMaxLength(30).IsRequired();
            e.Property(x => x.Qty).HasPrecision(18, 2);
            e.Property(x => x.CustomerName).HasMaxLength(255);
            e.Property(x => x.JobNumber).HasMaxLength(50);
            e.Property(x => x.Reference).HasMaxLength(255);
            e.Property(x => x.Supplier).HasMaxLength(255);
            e.Property(x => x.ReceiptNumber).HasMaxLength(100);
            e.Property(x => x.UnitCost).HasPrecision(18, 2);
            e.Property(x => x.TotalCost).HasPrecision(18, 2);
            e.Property(x => x.DocumentName).HasMaxLength(255);
            e.Property(x => x.DocumentPath).HasMaxLength(255);
            e.Property(x => x.DocumentContentType).HasMaxLength(100);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.MovedBy).HasMaxLength(100);
            e.HasIndex(x => x.InventoryItemId);
            e.HasOne(x => x.InventoryItem).WithMany().HasForeignKey(x => x.InventoryItemId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StoreItem>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100).IsRequired();
            e.Property(x => x.Unit).HasMaxLength(50).IsRequired();
            e.Property(x => x.UnitCost).HasPrecision(18, 2);
            e.HasIndex(x => new { x.Name, x.Category, x.Unit }).IsUnique();
        });

        modelBuilder.Entity<StoreMovement>(e =>
        {
            e.Property(x => x.ItemName).HasMaxLength(255).IsRequired();
            e.Property(x => x.ItemCategory).HasMaxLength(100).IsRequired();
            e.Property(x => x.ItemUnit).HasMaxLength(50).IsRequired();
            e.Property(x => x.Type).HasMaxLength(10).IsRequired();
            e.Property(x => x.CustomerName).HasMaxLength(255);
            e.Property(x => x.JobNumber).HasMaxLength(50);
            e.Property(x => x.Reference).HasMaxLength(255);
            e.Property(x => x.Supplier).HasMaxLength(255);
            e.Property(x => x.ReceiptNumber).HasMaxLength(100);
            e.Property(x => x.UnitCost).HasPrecision(18, 2);
            e.Property(x => x.TotalCost).HasPrecision(18, 2);
            e.Property(x => x.DocumentName).HasMaxLength(255);
            e.Property(x => x.DocumentPath).HasMaxLength(255);
            e.Property(x => x.DocumentContentType).HasMaxLength(100);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.MovedBy).HasMaxLength(100);
            e.HasIndex(x => new { x.StoreItemId, x.MovedAt });
            e.HasOne(x => x.StoreItem).WithMany().HasForeignKey(x => x.StoreItemId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OpsInspection>(e =>
        {
            e.Property(x => x.Result).HasMaxLength(20).IsRequired();
            e.Property(x => x.Findings).HasMaxLength(2000);
            e.Property(x => x.Cost).HasPrecision(18, 2);
            e.HasIndex(x => x.JobTaskId);
        });

        modelBuilder.Entity<OpsRefill>(e =>
        {
            e.Property(x => x.AgentType).HasMaxLength(100).IsRequired();
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.Cost).HasPrecision(18, 2);
            e.HasIndex(x => x.JobTaskId);
        });

        modelBuilder.Entity<OpsMaintenance>(e =>
        {
            e.Property(x => x.WorkType).HasMaxLength(50).IsRequired();
            e.Property(x => x.Findings).HasMaxLength(2000);
            e.Property(x => x.Cost).HasPrecision(18, 2);
            e.HasIndex(x => x.JobTaskId);
        });

        modelBuilder.Entity<OpsCertification>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.ExpiryDate).IsRequired();
        });

        modelBuilder.Entity<OpsInvoice>(e =>
        {
            e.Property(x => x.InvoiceNumber).HasMaxLength(20).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired();
            e.HasIndex(x => x.InvoiceNumber).IsUnique();
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OpsQuotation>(e =>
        {
            e.Property(x => x.QuotationNumber).HasMaxLength(20).IsRequired();
            e.Property(x => x.Title).HasMaxLength(255).IsRequired();
            e.Property(x => x.Terms).HasMaxLength(2000);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.DiscountPercent).HasPrecision(5, 2);
            e.Property(x => x.TaxPercent).HasPrecision(5, 2);
            e.Property(x => x.Status).HasMaxLength(20).IsRequired();
            e.Property(x => x.CustomerAddress).HasMaxLength(500);
            e.Property(x => x.CustomerVat).HasMaxLength(30);
            e.Property(x => x.CustomerTin).HasMaxLength(30);
            e.Property(x => x.CustomerContact).HasMaxLength(255);
            e.Property(x => x.CustomerEmailSnapshot).HasMaxLength(255);
            e.Property(x => x.Currency).HasMaxLength(10);
            e.Property(x => x.CompanyVatNo).HasMaxLength(30);
            e.Property(x => x.CompanyTinNo).HasMaxLength(30);
            e.Property(x => x.BankName).HasMaxLength(100);
            e.Property(x => x.BankBranch).HasMaxLength(100);
            e.Property(x => x.BankAccountName).HasMaxLength(255);
            e.Property(x => x.BankAccountNumber).HasMaxLength(50);
            e.Property(x => x.BankAccountNumberZwg).HasMaxLength(50);
            e.Property(x => x.DocumentRef).HasMaxLength(50);
            e.Property(x => x.PaymentTerms).HasMaxLength(1000);
            e.Property(x => x.ValidityText).HasMaxLength(255);
            e.HasIndex(x => x.QuotationNumber).IsUnique();
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Lines).WithOne(x => x.Quotation!).HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OpsQuotationLine>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(500).IsRequired();
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
        });

        modelBuilder.Entity<OpsQuotationFile>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(255).IsRequired();
            e.Property(x => x.FilePath).HasMaxLength(500);
            e.Property(x => x.UploadedBy).HasMaxLength(100);
            e.Property(x => x.QuotationId).IsRequired(false);
            e.HasOne(x => x.Quotation).WithMany(x => x.Files).HasForeignKey(x => x.QuotationId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AppSetting>(e =>
        {
            e.Property(x => x.Key).HasMaxLength(100).IsRequired();
            e.Property(x => x.Value).HasMaxLength(2000);
            e.HasIndex(x => x.Key).IsUnique();
        });
    }
}
