using DnsClient;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppDirectTls
{
    public const string DirectTlsService = "_xmpps-client._tcp";
    public const string StartTlsService = "_xmpp-client._tcp";
    public const string XmppClientAlpnProtocol = "xmpp-client";

    public static string CreateDirectTlsSrvName(string domain)
    {
        return CreateSrvName(DirectTlsService, domain);
    }

    public static string CreateStartTlsSrvName(string domain)
    {
        return CreateSrvName(StartTlsService, domain);
    }

    public static XmppClientConnectionEndpoint CreateFallbackStartTlsEndpoint(string domain)
    {
        var normalizedDomain = NormalizeDomain(domain);
        return new XmppClientConnectionEndpoint(
            Host: normalizedDomain,
            Port: XmppConnectionSettings.ClientPort,
            DirectTls: false,
            Priority: 0,
            Weight: 0,
            Service: StartTlsService);
    }

    public static XmppClientConnectionEndpoint CreateExplicitDirectTlsEndpoint(
        string domain,
        string? host = null,
        int port = XmppConnectionSettings.DirectTlsClientPort)
    {
        var normalizedDomain = NormalizeDomain(domain);
        return new XmppClientConnectionEndpoint(
            Host: string.IsNullOrWhiteSpace(host) ? normalizedDomain : NormalizeTarget(host),
            Port: port,
            DirectTls: true,
            Priority: 0,
            Weight: 0,
            Service: DirectTlsService);
    }

    public static async Task<IReadOnlyList<XmppClientConnectionEndpoint>> DiscoverClientEndpointsAsync(
        string domain,
        IXmppSrvResolver? resolver = null,
        bool includeStartTlsFallback = true,
        bool preferDirectTls = true,
        CancellationToken cancellationToken = default)
    {
        resolver ??= new XmppDnsSrvResolver();
        var directTlsTask = resolver.QuerySrvAsync(CreateDirectTlsSrvName(domain), cancellationToken);
        var startTlsTask = resolver.QuerySrvAsync(CreateStartTlsSrvName(domain), cancellationToken);
        await Task.WhenAll(directTlsTask, startTlsTask).ConfigureAwait(false);

        var endpoints = CreateClientEndpoints(
            directTlsTask.Result,
            startTlsTask.Result,
            includeStartTlsFallback ? NormalizeDomain(domain) : null,
            preferDirectTls);
        return endpoints;
    }

    public static IReadOnlyList<XmppClientConnectionEndpoint> CreateClientEndpoints(
        IEnumerable<XmppSrvRecord> directTlsRecords,
        IEnumerable<XmppSrvRecord> startTlsRecords,
        string? fallbackDomain = null,
        bool preferDirectTls = true)
    {
        ArgumentNullException.ThrowIfNull(directTlsRecords);
        ArgumentNullException.ThrowIfNull(startTlsRecords);

        var endpoints = directTlsRecords
            .Where(record => !record.IsServiceUnavailableMarker)
            .Select(record => CreateEndpoint(record, directTls: true))
            .Concat(startTlsRecords
                .Where(record => !record.IsServiceUnavailableMarker)
                .Select(record => CreateEndpoint(record, directTls: false)))
            .ToList();

        if (!endpoints.Any() && !string.IsNullOrWhiteSpace(fallbackDomain))
        {
            endpoints.Add(CreateFallbackStartTlsEndpoint(fallbackDomain));
        }

        return endpoints
            .OrderBy(endpoint => endpoint.Priority)
            .ThenBy(endpoint => preferDirectTls ? (endpoint.DirectTls ? 0 : 1) : 0)
            .ThenByDescending(endpoint => endpoint.Weight)
            .ThenBy(endpoint => endpoint.Host, StringComparer.Ordinal)
            .ThenBy(endpoint => endpoint.Port)
            .ToArray();
    }

    private static XmppClientConnectionEndpoint CreateEndpoint(XmppSrvRecord record, bool directTls)
    {
        return new XmppClientConnectionEndpoint(
            Host: NormalizeTarget(record.Target),
            Port: record.Port,
            DirectTls: directTls,
            Priority: record.Priority,
            Weight: record.Weight,
            Service: directTls ? DirectTlsService : StartTlsService);
    }

    private static string CreateSrvName(string service, string domain)
    {
        return $"{service}.{NormalizeDomain(domain)}";
    }

    private static string NormalizeDomain(string domain)
    {
        return XmppAddress.Parse(domain).DomainPart;
    }

    private static string NormalizeTarget(string target)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(target);
        return target.Trim().TrimEnd('.').ToLowerInvariant();
    }
}

public interface IXmppSrvResolver
{
    Task<IReadOnlyList<XmppSrvRecord>> QuerySrvAsync(
        string srvName,
        CancellationToken cancellationToken = default);
}

public sealed class XmppDnsSrvResolver : IXmppSrvResolver
{
    private readonly ILookupClient _lookupClient;

    public XmppDnsSrvResolver(ILookupClient? lookupClient = null)
    {
        _lookupClient = lookupClient ?? new LookupClient();
    }

    public async Task<IReadOnlyList<XmppSrvRecord>> QuerySrvAsync(
        string srvName,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(srvName);

        var result = await _lookupClient
            .QueryAsync(srvName, QueryType.SRV, QueryClass.IN, cancellationToken)
            .ConfigureAwait(false);
        return result.Answers
            .SrvRecords()
            .Select(record => new XmppSrvRecord(
                Service: srvName,
                Target: record.Target.Value,
                Port: record.Port,
                Priority: record.Priority,
                Weight: record.Weight))
            .ToArray();
    }
}

public sealed record XmppSrvRecord(
    string Service,
    string Target,
    int Port,
    int Priority,
    int Weight)
{
    public bool IsServiceUnavailableMarker => Target.Trim() == ".";
}

public sealed record XmppClientConnectionEndpoint(
    string Host,
    int Port,
    bool DirectTls,
    int Priority,
    int Weight,
    string Service);
