using FireOpsAI.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace FireOpsAI.WebApi;

/// <summary>
/// Sample controller exposing the AI engine. Copy this pattern into your own
/// project: inject AIOperationsEngine via constructor DI and map your own
/// entities into EngineInput.
/// </summary>
[ApiController]
[Route("api/ai")]
public class AIOpsController : ControllerBase
{
    private readonly AIOperationsEngine _engine;

    public AIOpsController(AIOperationsEngine engine)
    {
        _engine = engine;
    }

    [HttpGet("health")]
    public ActionResult<object> Health()
    {
        return Ok(new
        {
            status = "operational",
            engine = "FireOpsAI",
            version = "3.0",
            timestamp = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Full analysis. Body shape = EngineInput:
    /// { technicians: [...], jobs: [...], equipment: [...], sites: [...],
    ///   inventory: [...], inspections, services, refills, maintenance,
    ///   certifications, invoices }
    /// </summary>
    [HttpPost("analyze")]
    public ActionResult<EngineOutput> Analyze([FromBody] EngineInput input)
    {
        if (input == null) return BadRequest("Payload must be an EngineInput object.");
        var output = _engine.Analyze(input);
        return Ok(output);
    }

    /// <summary>Full analysis with explicit busyness control (partial execution).</summary>
    [HttpPost("analyze-partial")]
    public ActionResult<EngineOutput> AnalyzePartial([FromBody] PartialRequest request)
    {
        if (request?.Input == null) return BadRequest("Payload must contain an Input object.");
        var output = _engine.AnalyzePartial(
            request.Input,
            schedule: request.Schedule,
            route: request.Route,
            predict: request.Predict,
            detectAnomalies: request.DetectAnomalies,
            forecast: request.Forecast,
            risk: request.Risk,
            reminders: request.Reminders,
            cluster: request.Cluster);
        return Ok(output);
    }
}

public class PartialRequest
{
    public EngineInput Input { get; set; } = new();
    public bool Schedule { get; set; } = true;
    public bool Route { get; set; } = true;
    public bool Predict { get; set; } = true;
    public bool DetectAnomalies { get; set; } = true;
    public bool Forecast { get; set; } = true;
    public bool Risk { get; set; } = true;
    public bool Reminders { get; set; } = true;
    public bool Cluster { get; set; } = true;
}