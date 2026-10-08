using System.Text.Json.Serialization;
using FireOpsAI;
using FireOpsAI.WebApi;

var builder = WebApplication.CreateBuilder(args);

// ---- Register the AI engine into DI ----
builder.Services.AddSingleton<AIOperationsEngine>();

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.MapControllers();
app.Run();