FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
ENV DOTNET_NOLOGO=1
ENV DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
ENV DOTNET_GCHeapHardLimit=400000000
COPY backend/EFESMS.Api/*.csproj ./backend/EFESMS.Api/
WORKDIR /src/backend/EFESMS.Api
RUN dotnet restore --disable-build-servers -m:1
COPY backend/EFESMS.Api/ ./
RUN dotnet publish -c Release -o /app/publish --no-restore --disable-build-servers -m:1

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec dotnet EFESMS.Api.dll --urls http://+:${PORT:-8080}"]
