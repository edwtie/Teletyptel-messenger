using System.Text;
using System.Xml.Linq;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public sealed class XmppStreamWriter
{
    private readonly Stream _stream;
    private readonly Encoding _encoding;

    public XmppStreamWriter(Stream stream, Encoding? encoding = null)
    {
        _stream = stream ?? throw new ArgumentNullException(nameof(stream));
        _encoding = encoding ?? new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
    }

    public Task WriteOpenStreamAsync(
        XmppConnectionSettings settings,
        XmppStreamOptions options,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(options);

        var xml = XmppStreamHeader.CreateClientOpenStream(
            settings.Account.DomainPart,
            options.PreferredLanguage,
            settings.Account);
        return WriteRawAsync(xml, cancellationToken);
    }

    public Task WriteCloseStreamAsync(CancellationToken cancellationToken = default)
    {
        return WriteRawAsync(XmppStreamHeader.CloseStream, cancellationToken);
    }

    public Task WriteElementAsync(XElement element, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(element);
        return WriteRawAsync(element.ToString(SaveOptions.DisableFormatting), cancellationToken);
    }

    public async Task WriteRawAsync(string xml, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(xml);

        var bytes = _encoding.GetBytes(xml);
        await _stream.WriteAsync(bytes, cancellationToken).ConfigureAwait(false);
        await _stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}
