using System.Collections.Generic;

namespace FireOpsAI.Contracts;

public enum VoiceIntent
{
    Help,
    Greeting,
    Thanks,
    Summary,
    EquipmentStatus,
    SiteStatus,
    HighRisk,
    Anomalies,
    Reorders,
    Schedule,
    Unknown
}

public class VoiceReply
{
    public VoiceIntent Intent { get; set; } = VoiceIntent.Unknown;
    public string IntentName { get; set; } = "";
    public string ReplyText { get; set; } = "";
    public double Confidence { get; set; }
    public Dictionary<string, object> Data { get; set; } = new();
}