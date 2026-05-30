using System.Net.Sockets;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppSocks5BytestreamSocket
{
    private const byte Version = 0x05;
    private const byte NoAuthenticationRequired = 0x00;
    private const byte ConnectCommand = 0x01;
    private const byte Reserved = 0x00;
    private const byte DomainNameAddressType = 0x03;
    private const byte Succeeded = 0x00;

    public static async Task<XmppSocks5BytestreamConnection> ConnectAsync(
        XmppSocks5StreamHost streamHost,
        string destinationAddress,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(streamHost);
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationAddress);
        ValidateStreamHost(streamHost);

        if (timeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout), "SOCKS5 connect timeout must be positive.");
        }

        var destinationAddressBytes = Encoding.ASCII.GetBytes(destinationAddress);
        if (destinationAddressBytes.Length > byte.MaxValue)
        {
            throw new ArgumentOutOfRangeException(nameof(destinationAddress), "SOCKS5 domain-form destination address must fit in one length byte.");
        }

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);

        var tcpClient = new TcpClient();
        try
        {
            await tcpClient.ConnectAsync(streamHost.Host, streamHost.Port!.Value, timeoutSource.Token)
                .ConfigureAwait(false);

            var stream = tcpClient.GetStream();
            await WriteGreetingAsync(stream, timeoutSource.Token).ConfigureAwait(false);
            await ReadGreetingResponseAsync(stream, timeoutSource.Token).ConfigureAwait(false);
            await WriteConnectRequestAsync(stream, destinationAddressBytes, timeoutSource.Token).ConfigureAwait(false);
            await ReadConnectResponseAsync(stream, timeoutSource.Token).ConfigureAwait(false);

            return new XmppSocks5BytestreamConnection(tcpClient, streamHost, stream);
        }
        catch
        {
            tcpClient.Dispose();
            throw;
        }
    }

    public static async Task<XmppSocks5BytestreamConnection> ConnectFirstAsync(
        IEnumerable<XmppSocks5StreamHost> streamHosts,
        string destinationAddress,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(streamHosts);
        var errors = new List<Exception>();
        foreach (var streamHost in streamHosts)
        {
            try
            {
                return await ConnectAsync(streamHost, destinationAddress, timeout, cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is SocketException or IOException or OperationCanceledException or XmppSocks5BytestreamException)
            {
                errors.Add(ex);
            }
        }

        throw new AggregateException("No SOCKS5 bytestream streamhost could be opened.", errors);
    }

    public static Task<XmppSocks5BytestreamConnection> ConnectFirstAsync(
        IEnumerable<XmppSocks5StreamHost> streamHosts,
        string streamId,
        XmppAddress requester,
        XmppAddress target,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        return ConnectFirstAsync(
            streamHosts,
            XmppSocks5Bytestreams.ComputeDestinationAddress(streamId, requester, target),
            timeout,
            cancellationToken);
    }

    private static void ValidateStreamHost(XmppSocks5StreamHost streamHost)
    {
        if (string.IsNullOrWhiteSpace(streamHost.Host))
        {
            throw new ArgumentException("SOCKS5 streamhost must include a host.", nameof(streamHost));
        }

        if (streamHost.Port is null or < 1 or > 65535)
        {
            throw new ArgumentOutOfRangeException(nameof(streamHost), "SOCKS5 streamhost must include a TCP port between 1 and 65535.");
        }
    }

    private static async Task WriteGreetingAsync(Stream stream, CancellationToken cancellationToken)
    {
        var greeting = new byte[] { Version, 0x01, NoAuthenticationRequired };
        await stream.WriteAsync(greeting, cancellationToken).ConfigureAwait(false);
        await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task ReadGreetingResponseAsync(Stream stream, CancellationToken cancellationToken)
    {
        var response = await ReadExactAsync(stream, 2, cancellationToken).ConfigureAwait(false);
        if (response[0] != Version || response[1] != NoAuthenticationRequired)
        {
            throw new XmppSocks5BytestreamException($"SOCKS5 streamhost rejected no-authentication mode with method 0x{response[1]:X2}.");
        }
    }

    private static async Task WriteConnectRequestAsync(
        Stream stream,
        byte[] destinationAddressBytes,
        CancellationToken cancellationToken)
    {
        var request = new byte[7 + destinationAddressBytes.Length];
        request[0] = Version;
        request[1] = ConnectCommand;
        request[2] = Reserved;
        request[3] = DomainNameAddressType;
        request[4] = (byte)destinationAddressBytes.Length;
        destinationAddressBytes.CopyTo(request, 5);

        // XEP-0065 uses a SOCKS5 domain-form destination address and DST.PORT 0.
        request[^2] = 0x00;
        request[^1] = 0x00;

        await stream.WriteAsync(request, cancellationToken).ConfigureAwait(false);
        await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task ReadConnectResponseAsync(Stream stream, CancellationToken cancellationToken)
    {
        var header = await ReadExactAsync(stream, 4, cancellationToken).ConfigureAwait(false);
        if (header[0] != Version)
        {
            throw new XmppSocks5BytestreamException($"SOCKS5 streamhost returned unsupported version 0x{header[0]:X2}.");
        }

        if (header[1] != Succeeded)
        {
            throw new XmppSocks5BytestreamException($"SOCKS5 streamhost connect request failed with reply 0x{header[1]:X2}.");
        }

        var addressLength = header[3] switch
        {
            0x01 => 4,
            0x03 => (await ReadExactAsync(stream, 1, cancellationToken).ConfigureAwait(false))[0],
            0x04 => 16,
            _ => throw new XmppSocks5BytestreamException($"SOCKS5 streamhost returned unsupported address type 0x{header[3]:X2}.")
        };

        await ReadExactAsync(stream, addressLength + 2, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<byte[]> ReadExactAsync(
        Stream stream,
        int count,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset, count - offset), cancellationToken)
                .ConfigureAwait(false);
            if (read == 0)
            {
                throw new EndOfStreamException("SOCKS5 streamhost closed the connection unexpectedly.");
            }

            offset += read;
        }

        return buffer;
    }
}

public sealed class XmppSocks5BytestreamConnection : IAsyncDisposable, IDisposable
{
    internal XmppSocks5BytestreamConnection(
        TcpClient tcpClient,
        XmppSocks5StreamHost streamHost,
        Stream stream)
    {
        _tcpClient = tcpClient;
        StreamHost = streamHost;
        Stream = stream;
    }

    private readonly TcpClient _tcpClient;

    public XmppSocks5StreamHost StreamHost { get; }

    public Stream Stream { get; }

    public void Dispose()
    {
        Stream.Dispose();
        _tcpClient.Dispose();
    }

    public async ValueTask DisposeAsync()
    {
        await Stream.DisposeAsync().ConfigureAwait(false);
        _tcpClient.Dispose();
    }
}

public sealed class XmppSocks5BytestreamException : Exception
{
    public XmppSocks5BytestreamException(string message)
        : base(message)
    {
    }
}
