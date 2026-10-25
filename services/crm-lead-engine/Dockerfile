FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY crm-app/NyravaCRM.csproj ./crm-app/
RUN dotnet restore ./crm-app/NyravaCRM.csproj
COPY crm-app/ ./crm-app/
WORKDIR /src/crm-app
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:5180
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 5180
ENTRYPOINT ["dotnet", "NyravaCRM.dll"]
