FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY backend/EFESMS.Api/*.csproj ./backend/EFESMS.Api/
WORKDIR /src/backend/EFESMS.Api
RUN dotnet restore
COPY backend/EFESMS.Api/ ./
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec dotnet EFESMS.Api.dll --urls http://+:${PORT:-8080}"]
