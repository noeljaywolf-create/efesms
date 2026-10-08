namespace EFESMS.Api.Models;

public enum CommunicationChannel
{
    WhatsApp,
    Email,
    SMS,
    PhoneCall,
    Reminder
}

public enum CommunicationDirection
{
    Outgoing,
    Incoming
}

public class CustomerCommunication
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public CommunicationChannel Channel { get; set; } = CommunicationChannel.WhatsApp;
    public CommunicationDirection Direction { get; set; } = CommunicationDirection.Outgoing;
    public string? Subject { get; set; }
    public string? Message { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public bool CustomerResponded { get; set; }
    public string? ResponseNotes { get; set; }
    public DateTime? FollowUpDate { get; set; }
    public string? ContactName { get; set; }
    public string? CreatedBy { get; set; }
}