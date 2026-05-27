using Tiedragon.LngPdk;
using Tiedragon.XmppMessenger.Core.Accessibility;
using Tiedragon.XmppMessenger.Core.Messaging;
using Tiedragon.XmppMessenger.Core.Rtt;
using Tiedragon.XmppMessenger.Core.Xmpp;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Xml.Linq;

var tests = new (string Name, Action Test)[]
{
    ("Serialize and parse insert", SerializeAndParseInsert),
    ("Apply new and edit packets", ApplyNewAndEditPackets),
    ("Erase removes text before position", EraseRemovesTextBeforePosition),
    ("Out of sequence edit is ignored", OutOfSequenceEditIsIgnored),
    ("Edit before reset is ignored", EditBeforeResetIsIgnored),
    ("Composer can replace with empty text", ComposerCanReplaceWithEmptyText),
    ("Composer sends one inserted letter", ComposerSendsOneInsertedLetter),
    ("Composer sends one inserted space", ComposerSendsOneInsertedSpace),
    ("Composer sends one erased letter", ComposerSendsOneErasedLetter),
    ("Composer sends middle replacement delta", ComposerSendsMiddleReplacementDelta),
    ("Parser preserves space-only insert", ParserPreservesSpaceOnlyInsert),
    ("JSON envelope roundtrips packet XML", JsonEnvelopeRoundtripsPacketXml),
    ("JSON envelope supports message snapshots", JsonEnvelopeSupportsMessageSnapshots),
    ("Conversation options can disable RTT", ConversationOptionsCanDisableRtt),
    ("Legacy smiley catalog finds known codes", LegacySmileyCatalogFindsKnownCodes),
    ("Legacy smiley tokenizer preserves text and longest matches", LegacySmileyTokenizerPreservesTextAndLongestMatches),
    ("Language catalog reads lng text", LanguageCatalogReadsLngText),
    ("Language catalog loads lngpdk package", LanguageCatalogLoadsLngpdkPackage),
    ("Language package compiler creates lngpdk", LanguagePackageCompilerCreatesLngpdk),
    ("XMPP address parses bare JID", XmppAddressParsesBareJid),
    ("XMPP address parses full JID", XmppAddressParsesFullJid),
    ("XMPP address normalizes IDN domain", XmppAddressNormalizesIdnDomain),
    ("XMPP address rejects invalid JID", XmppAddressRejectsInvalidJid),
    ("XMPP address handles RFC 7622 edge cases", XmppAddressHandlesRfc7622EdgeCases),
    ("XMPP connection defaults require TLS", XmppConnectionDefaultsRequireTls),
    ("XMPP feature set can enable RTT", XmppFeatureSetCanEnableRtt),
    ("XMPP stream header creates client stream", XmppStreamHeaderCreatesClientStream),
    ("XMPP stream features parse STARTTLS and SASL", XmppStreamFeaturesParseStartTlsAndSasl),
    ("XMPP stream features parse bind and session", XmppStreamFeaturesParseBindAndSession),
    ("XMPP stream features parse stream management", XmppStreamFeaturesParseStreamManagement),
    ("XMPP SASL PLAIN creates auth element", XmppSaslPlainCreatesAuthElement),
    ("XMPP SASL selector prefers SCRAM SHA256", XmppSaslSelectorPrefersScramSha256),
    ("XMPP SASL SCRAM SHA1 matches RFC vector", XmppSaslScramSha1MatchesRfcVector),
    ("XMPP resource binding creates bind IQ", XmppResourceBindingCreatesBindIq),
    ("XMPP resource binding parses bound JID", XmppResourceBindingParsesBoundJid),
    ("XMPP negotiation plan follows RFC 6120 order", XmppNegotiationPlanFollowsRfc6120Order),
    ("XMPP negotiation plan blocks missing required TLS", XmppNegotiationPlanBlocksMissingRequiredTls),
    ("XMPP stream reader handles chunked features", XmppStreamReaderHandlesChunkedFeatures),
    ("XMPP stream reader returns multiple stanzas", XmppStreamReaderReturnsMultipleStanzas),
    ("XMPP stream reader handles self closing element", XmppStreamReaderHandlesSelfClosingElement),
    ("XMPP stream reader reports stream close", XmppStreamReaderReportsStreamClose),
    ("XMPP stream writer writes open stream and stanza", XmppStreamWriterWritesOpenStreamAndStanza),
    ("XMPP WebSocket frame serializes open and close", XmppWebSocketFrameSerializesOpenAndClose),
    ("XMPP WebSocket stream sends RFC 7395 open frame", XmppWebSocketStreamSendsRfc7395OpenFrame),
    ("XMPP stream client connects and reads features", XmppStreamClientConnectsAndReadsFeatures),
    ("XMPP stream client returns negotiation decision", XmppStreamClientReturnsNegotiationDecision),
    ("XMPP stream client runs TLS SASL bind commands", XmppStreamClientRunsTlsSaslBindCommands),
    ("XMPP stream client authenticates SCRAM", XmppStreamClientAuthenticatesScram),
    ("XMPP stream client authenticates best mechanism", XmppStreamClientAuthenticatesBestMechanism),
    ("XMPP stream client login performs auth and bind", XmppStreamClientLoginPerformsAuthAndBind),
    ("XMPP stream client requests roster", XmppStreamClientRequestsRoster),
    ("XMPP stream client sets and removes roster items", XmppStreamClientSetsAndRemovesRosterItems),
    ("XMPP stream client requests service discovery", XmppStreamClientRequestsServiceDiscovery),
    ("XMPP stream client enables stream management and tracks acks", XmppStreamClientEnablesStreamManagementAndTracksAcks),
    ("XMPP stream client resumes stream management", XmppStreamClientResumesStreamManagement),
    ("XMPP stream client sends initial presence", XmppStreamClientSendsInitialPresence),
    ("XMPP stream client sends presence subscription", XmppStreamClientSendsPresenceSubscription),
    ("XMPP stream client sends and receives normal chat", XmppStreamClientSendsAndReceivesNormalChat),
    ("XMPP stream client enables message carbons", XmppStreamClientEnablesMessageCarbons),
    ("XMPP incoming stanza classifies message presence IQ", XmppIncomingStanzaClassifiesMessagePresenceIq),
    ("XMPP IQ tracker completes result", XmppIqTrackerCompletesResult),
    ("XMPP IQ tracker reports error", XmppIqTrackerReportsError),
    ("XMPP protocol exception carries kind", XmppProtocolExceptionCarriesKind),
    ("XMPP stream error parses condition and text", XmppStreamErrorParsesConditionAndText),
    ("XMPP stanza error parses condition and type", XmppStanzaErrorParsesConditionAndType),
    ("XMPP real time text message serializes fallback and RTT", XmppRealTimeTextMessageSerializesFallbackAndRtt),
    ("XMPP real time text message parses fallback and RTT", XmppRealTimeTextMessageParsesFallbackAndRtt),
    ("RTT conversation manager tracks per contact state", RttConversationManagerTracksPerContactState),
    ("XMPP incoming stanza exposes real time text", XmppIncomingStanzaExposesRealTimeText),
    ("XMPP chat message serializes stanza", XmppChatMessageSerializesStanza),
    ("XMPP presence serializes away stanza", XmppPresenceSerializesAwayStanza),
    ("XMPP presence serializes subscription stanza", XmppPresenceSerializesSubscriptionStanza),
    ("XMPP roster get serializes IQ", XmppRosterGetSerializesIq),
    ("XMPP roster set serializes item", XmppRosterSetSerializesItem),
    ("XMPP roster remove serializes item", XmppRosterRemoveSerializesItem),
    ("XMPP service discovery serializes info request", XmppServiceDiscoverySerializesInfoRequest),
    ("XMPP service discovery parses info result", XmppServiceDiscoveryParsesInfoResult),
    ("XMPP service discovery checks RTT capability", XmppServiceDiscoveryChecksRttCapability),
    ("XMPP entity capabilities creates deterministic verification", XmppEntityCapabilitiesCreatesDeterministicVerification),
    ("XMPP presence serializes and parses capabilities", XmppPresenceSerializesAndParsesCapabilities),
    ("XMPP alternative connection discovery creates host-meta URI", XmppAlternativeConnectionDiscoveryCreatesHostMetaUri),
    ("XMPP alternative connection discovery parses XML and JSON", XmppAlternativeConnectionDiscoveryParsesXmlAndJson),
    ("XMPP me command preserves protocol body", XmppMeCommandPreservesProtocolBody),
    ("XMPP vCard temp serializes get and set", XmppVCardTempSerializesGetAndSet),
    ("XMPP vCard temp parses result", XmppVCardTempParsesResult),
    ("XMPP push notifications serialize enable and disable", XmppPushNotificationsSerializeEnableAndDisable),
    ("XMPP chat state serializes and parses", XmppChatStateSerializesAndParses),
    ("XMPP delivery receipt request serializes and parses", XmppDeliveryReceiptRequestSerializesAndParses),
    ("XMPP delivery receipt received serializes and parses", XmppDeliveryReceiptReceivedSerializesAndParses),
    ("XMPP message carbons enable serializes IQ", XmppMessageCarbonsEnableSerializesIq),
    ("XMPP message carbons parse forwarded received", XmppMessageCarbonsParseForwardedReceived),
    ("XMPP incoming stanza exposes carbon", XmppIncomingStanzaExposesCarbon),
    ("XMPP message archive query serializes paging", XmppMessageArchiveQuerySerializesPaging),
    ("XMPP message archive parses forwarded result", XmppMessageArchiveParsesForwardedResult),
    ("XMPP message archive parses fin result set", XmppMessageArchiveParsesFinResultSet),
    ("XMPP stream management state tracks counts", XmppStreamManagementStateTracksCounts),
    ("XMPP chat message parses stanza", XmppChatMessageParsesStanza),
    ("XMPP presence parses stanza", XmppPresenceParsesStanza),
    ("XMPP IQ parses roster items", XmppIqParsesRosterItems),
    ("Final body resets state", FinalBodyResetsState),
    ("Unicode positions count code points", UnicodePositionsCountCodePoints),
    ("Accessibility input event carries speaker label", AccessibilityInputEventCarriesSpeakerLabel),
    ("Live caption marks low confidence as uncertain", LiveCaptionMarksLowConfidenceAsUncertain),
    ("Caption bridge keeps local captions local", CaptionBridgeKeepsLocalCaptionsLocal),
    ("Caption bridge publishes RTT edits", CaptionBridgePublishesRttEdits),
    ("Caption bridge publishes final messages only when final", CaptionBridgePublishesFinalMessagesOnlyWhenFinal),
    ("Privacy settings default to no retention", PrivacySettingsDefaultToNoRetention),
    ("Agent marker distinguishes captions", AgentMarkerDistinguishesCaptions)
};

var failed = 0;
foreach (var test in tests)
{
    try
    {
        test.Test();
        Console.WriteLine($"PASS {test.Name}");
    }
    catch (Exception ex)
    {
        failed++;
        Console.WriteLine($"FAIL {test.Name}: {ex.Message}");
    }
}

if (failed != 0)
{
    Environment.ExitCode = 1;
    Console.WriteLine($"{failed} test(s) failed.");
    return;
}

Console.WriteLine("All RTT tests passed.");

static void SerializeAndParseInsert()
{
    var packet = new RttPacket(RttEvent.New, 7, [new RttInsert(0, "Hallo")]);
    var parsed = RttPacket.Parse(packet.ToXml());

    Equal(RttEvent.New, parsed.Event);
    Equal(7, parsed.Sequence);
    var insert = IsType<RttInsert>(parsed.Actions.Single());
    Equal(0, insert.Position);
    Equal("Hallo", insert.Text);
}

static void ApplyNewAndEditPackets()
{
    var state = new RttMessageState();

    True(state.Apply(new RttPacket(RttEvent.New, 1, [new RttInsert(null, "Hel")])));
    True(state.Apply(new RttPacket(RttEvent.Edit, 2, [new RttInsert(null, "lo")])));

    Equal("Hello", state.Text);
    Equal(2, state.LastSequence);
    True(state.IsSynchronized);
}

static void EraseRemovesTextBeforePosition()
{
    var state = new RttMessageState();

    state.Apply(new RttPacket(RttEvent.Reset, 1, [new RttInsert(0, "abcd")]));
    state.Apply(new RttPacket(RttEvent.Edit, 2, [new RttErase(3, 1)]));

    Equal("abd", state.Text);
}

static void OutOfSequenceEditIsIgnored()
{
    var state = new RttMessageState();

    state.Apply(new RttPacket(RttEvent.Reset, 1, [new RttInsert(0, "abc")]));
    False(state.Apply(new RttPacket(RttEvent.Edit, 3, [new RttInsert(null, "x")])));
    False(state.Apply(new RttPacket(RttEvent.Edit, 4, [new RttInsert(null, "y")])));

    Equal("abc", state.Text);
    False(state.IsSynchronized);

    True(state.Apply(new RttPacket(RttEvent.Reset, 5, [new RttInsert(0, "fresh")])));
    Equal("fresh", state.Text);
    True(state.IsSynchronized);
}

static void EditBeforeResetIsIgnored()
{
    var state = new RttMessageState();

    False(state.Apply(new RttPacket(RttEvent.Edit, 1, [new RttInsert(null, "lost")])));

    Equal("", state.Text);
    False(state.IsSynchronized);
}

static void ComposerCanReplaceWithEmptyText()
{
    var composer = new RttComposer();
    var state = new RttMessageState();

    state.Apply(composer.Reset("draft"));
    state.Apply(composer.Replace(""));

    Equal("", state.Text);
}

static void ComposerSendsOneInsertedLetter()
{
    var composer = new RttComposer();
    composer.Reset("");

    var packet = composer.Replace("t");

    var insert = IsType<RttInsert>(packet.Actions.Single());
    Equal(0, insert.Position);
    Equal("t", insert.Text);
    False(packet.Actions.Any(action => action is RttErase));
}

static void ComposerSendsOneInsertedSpace()
{
    var composer = new RttComposer();
    composer.Reset("test");

    var packet = composer.Replace("test ");

    var insert = IsType<RttInsert>(packet.Actions.Single());
    Equal(4, insert.Position);
    Equal(" ", insert.Text);

    var parsed = RttPacket.Parse(packet.ToXml());
    var parsedInsert = IsType<RttInsert>(parsed.Actions.Single());
    Equal(" ", parsedInsert.Text);
}

static void ComposerSendsOneErasedLetter()
{
    var composer = new RttComposer();
    composer.Reset("test");

    var packet = composer.Replace("tes");

    var erase = IsType<RttErase>(packet.Actions.Single());
    Equal(4, erase.Position);
    Equal(1, erase.Count);
}

static void ComposerSendsMiddleReplacementDelta()
{
    var composer = new RttComposer();
    composer.Reset("abc");

    var packet = composer.Replace("axc");

    Equal(2, packet.Actions.Count);
    var erase = IsType<RttErase>(packet.Actions[0]);
    var insert = IsType<RttInsert>(packet.Actions[1]);
    Equal(2, erase.Position);
    Equal(1, erase.Count);
    Equal(1, insert.Position);
    Equal("x", insert.Text);
}

static void ParserPreservesSpaceOnlyInsert()
{
    var packet = RttPacket.Parse("<rtt xmlns=\"urn:xmpp:rtt:0\" seq=\"1\"><t p=\"4\"> </t></rtt>");
    var insert = IsType<RttInsert>(packet.Actions.Single());

    Equal(4, insert.Position);
    Equal(" ", insert.Text);
}

static void JsonEnvelopeRoundtripsPacketXml()
{
    var packet = new RttPacket(RttEvent.Reset, 12, [new RttInsert(0, "Hallo")]);
    var envelope = RttJsonEnvelope.FromPacket(packet, "Hallo");

    True(RttJsonEnvelope.TryParse(envelope.ToJson(), out var parsed));
    Equal("rtt", parsed!.Type);
    Equal("Hallo", parsed.Text);

    var parsedPacket = RttPacket.Parse(parsed.Xml);
    Equal(RttEvent.Reset, parsedPacket.Event);
    Equal(12, parsedPacket.Sequence);
}

static void JsonEnvelopeSupportsMessageSnapshots()
{
    var envelope = RttJsonEnvelope.FromTextMessage("Hallo zonder RTT");

    True(RttJsonEnvelope.TryParse(envelope.ToJson(), out var parsed));
    Equal("message", parsed!.Type);
    Equal("Hallo zonder RTT", parsed.Text);
    Equal("", parsed.Xml);
}

static void ConversationOptionsCanDisableRtt()
{
    var options = ConversationOptions.Default.WithRealTimeText(false);

    False(options.RealTimeTextEnabled);
    True(options.SendMessageSnapshotOnEnter);
}

static void LegacySmileyCatalogFindsKnownCodes()
{
    True(LegacySmileyCatalog.TryFindByCode(":)", out var smile));
    Equal("smile.gif", smile!.FileName);

    True(LegacySmileyCatalog.TryFindByCode("8)7", out var bonk));
    Equal("bonk", bonk!.Name);

    True(LegacySmileyCatalog.TryFindByCode("_/-\\o_", out var worship));
    Equal("worshippy.gif", worship!.FileName);

    False(LegacySmileyCatalog.TryFindByCode(":unknown:", out _));
}

static void LegacySmileyTokenizerPreservesTextAndLongestMatches()
{
    var tokens = LegacySmileyCatalog.Tokenize("Hoi :*) :* :9~ :9 _o_ klaar");

    Equal(11, tokens.Count);
    Equal(LegacySmileyTokenKind.Text, tokens[0].Kind);
    Equal("Hoi ", tokens[0].Text);
    Equal("shiny.gif", tokens[1].Smiley!.FileName);
    Equal(" ", tokens[2].Text);
    Equal("puh.gif", tokens[3].Smiley!.FileName);
    Equal("kwijl.gif", tokens[5].Smiley!.FileName);
    Equal("yummie.gif", tokens[7].Smiley!.FileName);
    Equal("worshippy.gif", tokens[9].Smiley!.FileName);
    Equal(" klaar", tokens[10].Text);
}

static void LanguageCatalogReadsLngText()
{
    var catalog = LanguageCatalog.FromText("""
        # comment
        button.connect=Verbinden
        status.connected=Verbonden
        """);

    Equal("Verbinden", catalog["button.connect"]);
    Equal("Verbonden", catalog["status.connected"]);
    Equal("missing.key", catalog["missing.key"]);
}

static void LanguageCatalogLoadsLngpdkPackage()
{
    var baseDirectory = Path.GetFullPath("samples/Tiedragon.XmppMessenger.WinFormsDemo");

    var catalog = LanguageCatalog.Load("ned", baseDirectory);

    Equal("Verbinden", catalog["button.connect"]);
    True(LanguagePackageReader.ListInstalled(baseDirectory).Any(package =>
        package.Manifest.LanguageCode == "ned" &&
        package.Manifest.SoftwareId == "tiedragon.xmppmessenger"));
}

static void LanguagePackageCompilerCreatesLngpdk()
{
    var tempRoot = Path.Combine(Path.GetTempPath(), "tiedragon-lngpdk-test-" + Guid.NewGuid().ToString("N"));
    var packageRoot = Path.Combine(tempRoot, "LanguagePackages");
    Directory.CreateDirectory(packageRoot);
    try
    {
        var outputPath = Path.Combine(packageRoot, "test-ned.lngpdk");
        var result = LanguagePackageCompiler.CompileFolder("language-packages/ned", outputPath);

        Equal("ned", result.LanguageCode);
        True(File.Exists(outputPath));

        var catalog = LanguageCatalog.Load("ned", tempRoot);
        Equal("Verbinden", catalog["button.connect"]);
    }
    finally
    {
        if (Directory.Exists(tempRoot))
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}

static void XmppAddressParsesBareJid()
{
    var address = XmppAddress.Parse("edward@example.org");

    Equal("edward", address.LocalPart);
    Equal("example.org", address.DomainPart);
    Equal(null, address.ResourcePart);
    Equal("edward@example.org", address.Bare);
    Equal("edward@example.org", address.Full);
    True(address.IsBare);
}

static void XmppAddressParsesFullJid()
{
    var address = XmppAddress.Parse("edward@example.org/desktop");

    Equal("edward@example.org", address.Bare);
    Equal("edward@example.org/desktop", address.Full);
    Equal("desktop", address.ResourcePart);
    False(address.IsBare);
}

static void XmppAddressNormalizesIdnDomain()
{
    var address = XmppAddress.Parse("user@TIEDRAGON.NL");

    Equal("tiedragon.nl", address.DomainPart);
}

static void XmppAddressRejectsInvalidJid()
{
    False(XmppAddress.TryParse("ed ward@example.org", out _));
    False(XmppAddress.TryParse("edward@", out _));
    False(XmppAddress.TryParse("@example.org", out _));
    False(XmppAddress.TryParse("edward@@example.org", out _));
    False(XmppAddress.TryParse("example.org/", out _));
}

static void XmppAddressHandlesRfc7622EdgeCases()
{
    var resourceWithSlash = XmppAddress.Parse("edward@example.org/laptop/with/view");
    Equal("laptop/with/view", resourceWithSlash.ResourcePart);
    Equal("edward@example.org/laptop/with/view", resourceWithSlash.Full);

    var unicodeDomain = XmppAddress.Parse("edward@bücher.example/desktop");
    Equal("xn--bcher-kva.example", unicodeDomain.DomainPart);

    True(XmppAddress.TryParse("example.org", out var domainOnly));
    Equal("example.org", domainOnly!.Bare);
    True(domainOnly.IsBare);

    False(XmppAddress.TryParse("edward@example.org/has space", out _));
    False(XmppAddress.TryParse("edward@example.org/\t", out _));
    False(XmppAddress.TryParse("local/with\nnewline@example.org", out _));
    False(XmppAddress.TryParse("edward@exa mple.org", out _));
}

static void XmppConnectionDefaultsRequireTls()
{
    var settings = XmppConnectionSettings.ForAccount(XmppAddress.Parse("edward@example.org"));

    Equal("example.org", settings.Host);
    Equal(5222, settings.Port);
    True(settings.RequireTls);
}

static void XmppFeatureSetCanEnableRtt()
{
    var features = XmppFeatureSet.Alpha1Default.WithRealTimeText(true);

    True(features.Roster);
    True(features.Presence);
    True(features.StreamManagement);
    True(features.RealTimeText);
}

static void XmppStreamHeaderCreatesClientStream()
{
    var header = XmppStreamHeader.CreateClientOpenStream(
        "example.org",
        "nl",
        XmppAddress.Parse("edward@example.org/desktop"));

    True(header.StartsWith("<stream:stream", StringComparison.Ordinal));
    True(header.Contains("from=\"edward@example.org\"", StringComparison.Ordinal));
    True(header.Contains("to=\"example.org\"", StringComparison.Ordinal));
    True(header.Contains("version=\"1.0\"", StringComparison.Ordinal));
    True(header.Contains("xml:lang=\"nl\"", StringComparison.Ordinal));
    True(header.Contains("xmlns=\"jabber:client\"", StringComparison.Ordinal));
    True(header.Contains("xmlns:stream=\"http://etherx.jabber.org/streams\"", StringComparison.Ordinal));
    True(header.EndsWith('>'));
    Equal("</stream:stream>", XmppStreamHeader.CloseStream);
}

static void XmppStreamFeaturesParseStartTlsAndSasl()
{
    var xml = """
        <stream:features xmlns:stream="http://etherx.jabber.org/streams">
          <starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls">
            <required/>
          </starttls>
          <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
            <mechanism>PLAIN</mechanism>
            <mechanism>SCRAM-SHA-256</mechanism>
          </mechanisms>
        </stream:features>
        """;

    True(XmppStreamFeatureSet.TryParse(xml, out var features));
    True(features.StartTlsOffered);
    True(features.StartTlsRequired);
    True(features.SupportsSaslMechanism("plain"));
    True(features.SupportsSaslMechanism("SCRAM-SHA-256"));
    False(features.ResourceBindingOffered);
}

static void XmppStreamFeaturesParseBindAndSession()
{
    var xml = """
        <stream:features xmlns:stream="http://etherx.jabber.org/streams">
          <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
            <required/>
          </bind>
          <session xmlns="urn:ietf:params:xml:ns:xmpp-session"/>
        </stream:features>
        """;

    True(XmppStreamFeatureSet.TryParse(xml, out var features));
    True(features.ResourceBindingOffered);
    True(features.ResourceBindingRequired);
    True(features.SessionOffered);
    False(features.SessionRequired);
}

static void XmppStreamFeaturesParseStreamManagement()
{
    var xml = """
        <stream:features xmlns:stream="http://etherx.jabber.org/streams">
          <sm xmlns="urn:xmpp:sm:3"/>
        </stream:features>
        """;

    True(XmppStreamFeatureSet.TryParse(xml, out var features));
    True(features.StreamManagementOffered);
}

static void XmppSaslPlainCreatesAuthElement()
{
    var auth = XmppSaslPlain.CreateAuthElement(
        "edward@example.org",
        "edward",
        "secret");

    Equal("auth", auth.Name.LocalName);
    Equal("urn:ietf:params:xml:ns:xmpp-sasl", auth.Name.NamespaceName);
    Equal("PLAIN", auth.Attribute("mechanism")?.Value);
    Equal("ZWR3YXJkQGV4YW1wbGUub3JnAGVkd2FyZABzZWNyZXQ=", auth.Value);
}

static void XmppSaslSelectorPrefersScramSha256()
{
    var features = new XmppStreamFeatureSet(
        StartTlsOffered: true,
        StartTlsRequired: true,
        SaslMechanisms: [XmppSaslPlain.Mechanism, XmppSaslScram.MechanismSha1, XmppSaslScram.MechanismSha256],
        ResourceBindingOffered: false,
        ResourceBindingRequired: false,
        SessionOffered: false,
        SessionRequired: false);

    Equal(XmppSaslScram.MechanismSha256, XmppSaslMechanismSelector.SelectBest(features));
}

static void XmppSaslScramSha1MatchesRfcVector()
{
    var scram = new XmppSaslScram(
        XmppSaslScram.MechanismSha1,
        "user",
        "pencil",
        "fyko+d2lbbFgONRv9qkxdawL");

    Equal("n,,n=user,r=fyko+d2lbbFgONRv9qkxdawL", scram.CreateClientFirstMessage());

    var clientFinal = scram.CreateClientFinalMessage(
        "r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096");

    Equal("c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=", clientFinal);
    True(scram.VerifyServerFinal(Convert.ToBase64String(Encoding.UTF8.GetBytes("v=rmF9pqV8S7suAoZWja4dJRkFsKQ="))));
}

static void XmppResourceBindingCreatesBindIq()
{
    var iq = XmppResourceBinding.CreateBindRequest("bind-1", "desktop").ToXml();
    var bind = iq.Elements().Single();

    Equal("iq", iq.Name.LocalName);
    Equal("set", iq.Attribute("type")?.Value);
    Equal("bind-1", iq.Attribute("id")?.Value);
    Equal("bind", bind.Name.LocalName);
    Equal("urn:ietf:params:xml:ns:xmpp-bind", bind.Name.NamespaceName);
    Equal("desktop", bind.Elements().Single().Value);
}

static void XmppResourceBindingParsesBoundJid()
{
    var xml = """
        <iq xmlns="jabber:client" type="result" id="bind-1">
          <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
            <jid>edward@example.org/desktop</jid>
          </bind>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    True(XmppResourceBinding.TryGetBoundJid(iq!, out var jid));
    Equal("edward@example.org/desktop", jid!.Full);
}

static void XmppNegotiationPlanFollowsRfc6120Order()
{
    var settings = XmppConnectionSettings.ForAccount(XmppAddress.Parse("edward@example.org"));
    var features = new XmppStreamFeatureSet(
        StartTlsOffered: true,
        StartTlsRequired: true,
        SaslMechanisms: [XmppSaslPlain.Mechanism],
        ResourceBindingOffered: true,
        ResourceBindingRequired: true,
        SessionOffered: false,
        SessionRequired: false);

    var plan = new XmppStreamNegotiationPlan(
        TlsActive: false,
        Authenticated: false,
        ResourceBound: false);

    Equal(XmppStreamNegotiationStep.StartTls, plan.GetNextStep(features, settings));
    plan = plan.WithTlsActive();
    Equal(XmppStreamNegotiationStep.Authenticate, plan.GetNextStep(features, settings));
    plan = plan.WithAuthenticated();
    Equal(XmppStreamNegotiationStep.BindResource, plan.GetNextStep(features, settings));
    plan = plan.WithResourceBound();
    Equal(XmppStreamNegotiationStep.Ready, plan.GetNextStep(features, settings));
}

static void XmppNegotiationPlanBlocksMissingRequiredTls()
{
    var settings = XmppConnectionSettings.ForAccount(XmppAddress.Parse("edward@example.org"));
    var features = new XmppStreamFeatureSet(
        StartTlsOffered: false,
        StartTlsRequired: false,
        SaslMechanisms: [XmppSaslPlain.Mechanism],
        ResourceBindingOffered: false,
        ResourceBindingRequired: false,
        SessionOffered: false,
        SessionRequired: false);
    var plan = new XmppStreamNegotiationPlan(
        TlsActive: false,
        Authenticated: false,
        ResourceBound: false);

    try
    {
        plan.GetNextStep(features, settings);
        throw new InvalidOperationException("Expected missing TLS to fail.");
    }
    catch (XmppProtocolException ex)
    {
        Equal(XmppProtocolErrorKind.StartTlsFailure, ex.Kind);
    }
}

static void XmppStreamReaderHandlesChunkedFeatures()
{
    var reader = new XmppStreamReader();

    reader.Append("""
        <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" id="s1" version="1.0">
        <stream:fea
        """);

    var firstNodes = reader.ReadAvailable();
    Equal(1, firstNodes.Count);
    Equal(XmppStreamNodeType.StreamOpened, firstNodes[0].Type);

    reader.Append("""
        tures>
          <starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls>
        </stream:features>
        """);

    var secondNodes = reader.ReadAvailable();
    Equal(1, secondNodes.Count);
    Equal(XmppStreamNodeType.Features, secondNodes[0].Type);
    True(XmppStreamFeatureSet.TryParse(secondNodes[0].Element!, out var features));
    True(features.StartTlsRequired);
}

static void XmppStreamReaderReturnsMultipleStanzas()
{
    var reader = new XmppStreamReader();
    reader.Append("""
        <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
        <message xmlns="jabber:client" type="chat" from="anna@example.org" to="edward@example.org"><body>Hoi</body></message>
        <presence xmlns="jabber:client" from="anna@example.org"><show>away</show></presence>
        """);

    var nodes = reader.ReadAvailable();

    Equal(3, nodes.Count);
    Equal(XmppStreamNodeType.StreamOpened, nodes[0].Type);
    Equal(XmppStreamNodeType.Stanza, nodes[1].Type);
    Equal("message", nodes[1].Element!.Name.LocalName);
    Equal(XmppStreamNodeType.Stanza, nodes[2].Type);
    Equal("presence", nodes[2].Element!.Name.LocalName);
}

static void XmppStreamReaderHandlesSelfClosingElement()
{
    var reader = new XmppStreamReader();
    reader.Append("""
        <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
        <proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>
        """);

    var nodes = reader.ReadAvailable();

    Equal(2, nodes.Count);
    Equal(XmppStreamNodeType.StreamOpened, nodes[0].Type);
    Equal(XmppStreamNodeType.Stanza, nodes[1].Type);
    Equal("proceed", nodes[1].Element!.Name.LocalName);
    Equal("urn:ietf:params:xml:ns:xmpp-tls", nodes[1].Element!.Name.NamespaceName);
}

static void XmppStreamReaderReportsStreamClose()
{
    var reader = new XmppStreamReader();
    reader.Append("""
        <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
        </stream:stream>
        """);

    var nodes = reader.ReadAvailable();

    Equal(2, nodes.Count);
    Equal(XmppStreamNodeType.StreamOpened, nodes[0].Type);
    Equal(XmppStreamNodeType.StreamClosed, nodes[1].Type);
}

static void XmppStreamWriterWritesOpenStreamAndStanza()
{
    using var stream = new MemoryStream();
    var writer = new XmppStreamWriter(stream);
    var settings = XmppConnectionSettings.ForAccount(XmppAddress.Parse("edward@example.org/desktop"));
    var options = new XmppStreamOptions(
        preferredLanguage: "nl",
        resource: "desktop",
        connectTimeout: TimeSpan.FromSeconds(5),
        keepAliveInterval: TimeSpan.FromSeconds(30));

    writer.WriteOpenStreamAsync(settings, options).GetAwaiter().GetResult();
    writer.WriteElementAsync(new XmppChatMessage(
        To: XmppAddress.Parse("anna@example.org"),
        Body: "Hoi").ToXml()).GetAwaiter().GetResult();
    writer.WriteCloseStreamAsync().GetAwaiter().GetResult();

    var xml = System.Text.Encoding.UTF8.GetString(stream.ToArray());

    True(xml.Contains("<stream:stream", StringComparison.Ordinal));
    True(xml.Contains("to=\"example.org\"", StringComparison.Ordinal));
    True(xml.Contains("xml:lang=\"nl\"", StringComparison.Ordinal));
    True(xml.Contains("<message", StringComparison.Ordinal));
    True(xml.Contains("<body>Hoi</body>", StringComparison.Ordinal));
    True(xml.EndsWith("</stream:stream>", StringComparison.Ordinal));
}

static void XmppWebSocketFrameSerializesOpenAndClose()
{
    var open = XmppWebSocketFrame.CreateOpen("example.org", "nl");
    var close = XmppWebSocketFrame.CreateClose();

    Equal("open", open.Name.LocalName);
    Equal(XmppWebSocketFrame.FramingNamespace, open.Name.NamespaceName);
    Equal("example.org", open.Attribute("to")?.Value);
    Equal("1.0", open.Attribute("version")?.Value);
    Equal("nl", open.Attribute(XNamespace.Xml + "lang")?.Value);
    Equal("close", close.Name.LocalName);

    True(XmppWebSocketFrame.TryParseOpen(open.ToString(SaveOptions.DisableFormatting), out var parsed));
    Equal("example.org", parsed!.To);
    Equal("nl", parsed.Language);
}

static void XmppWebSocketStreamSendsRfc7395OpenFrame()
{
    var transport = new FakeWebSocketTransport();
    var stream = new XmppWebSocketStream(transport);

    stream.SendOpenAsync("example.org", "nl").GetAwaiter().GetResult();
    stream.SendElementAsync(new XmppChatMessage(
        XmppAddress.Parse("anna@example.org"),
        "Hoi").ToXml()).GetAwaiter().GetResult();
    stream.SendCloseAsync().GetAwaiter().GetResult();

    Equal(3, transport.Sent.Count);
    True(transport.Sent[0].Contains("<open", StringComparison.Ordinal));
    True(transport.Sent[0].Contains("urn:ietf:params:xml:ns:xmpp-framing", StringComparison.Ordinal));
    True(transport.Sent[1].Contains("<message", StringComparison.Ordinal));
    True(transport.Sent[2].Contains("<close", StringComparison.Ordinal));
}

static void XmppStreamClientConnectsAndReadsFeatures()
{
    RunXmppStreamClientConnectsAndReadsFeaturesAsync(requireTls: false).GetAwaiter().GetResult();
}

static void XmppStreamClientReturnsNegotiationDecision()
{
    RunXmppStreamClientConnectsAndReadsFeaturesAsync(requireTls: true).GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientConnectsAndReadsFeaturesAsync(bool requireTls)
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();

    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var serverSawOpenStream = false;
    var serverSawCloseStream = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];
        var count = await serverStream.ReadAsync(buffer);
        var openStream = Encoding.UTF8.GetString(buffer, 0, count);
        serverSawOpenStream = openStream.Contains("<stream:stream", StringComparison.Ordinal)
            && openStream.Contains("to=\"example.org\"", StringComparison.Ordinal)
            && openStream.Contains("xmlns=\"jabber:client\"", StringComparison.Ordinal);

        var features = """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls">
                <required/>
              </starttls>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
            </stream:features>
            """;

        await serverStream.WriteAsync(Encoding.UTF8.GetBytes(features));
        await serverStream.FlushAsync();

        count = await serverStream.ReadAsync(buffer);
        var closeStream = Encoding.UTF8.GetString(buffer, 0, count);
        serverSawCloseStream = closeStream.Contains("</stream:stream>", StringComparison.Ordinal);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("edward@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: requireTls);
        var options = new XmppStreamOptions(
            preferredLanguage: "nl",
            resource: "desktop",
            connectTimeout: TimeSpan.FromSeconds(5),
            keepAliveInterval: TimeSpan.FromSeconds(30));

        await using var client = new XmppStreamClient(settings, options);
        var result = await client.ConnectAndPlanAsync();
        True(result.Features.SupportsSaslMechanism("PLAIN"));
        Equal(XmppStreamNegotiationStep.StartTls, result.NextStep);
        await client.DisconnectAsync();
        await serverTask;

        True(serverSawOpenStream);
        True(serverSawCloseStream);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientRunsTlsSaslBindCommands()
{
    RunXmppStreamClientRunsTlsSaslBindCommandsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientRunsTlsSaslBindCommandsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawStartTls = false;
    var sawRestartedStream = false;
    var sawAuth = false;
    var sawSaslRestartedStream = false;
    var sawBind = false;
    var tlsUpgradeCount = 0;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
            </stream:features>
            """);

        var startTls = await ReadTextAsync(serverStream, buffer);
        sawStartTls = startTls.Contains("<starttls", StringComparison.Ordinal)
            && startTls.Contains("urn:ietf:params:xml:ns:xmpp-tls", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, "<proceed xmlns=\"urn:ietf:params:xml:ns:xmpp-tls\"/>");

        var restartedStream = await ReadTextAsync(serverStream, buffer);
        sawRestartedStream = restartedStream.Contains("<stream:stream", StringComparison.Ordinal)
            && restartedStream.Contains("to=\"example.org\"", StringComparison.Ordinal);

        var auth = await ReadTextAsync(serverStream, buffer);
        sawAuth = auth.Contains("<auth", StringComparison.Ordinal)
            && auth.Contains("mechanism=\"PLAIN\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, "<success xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"/>");

        var saslRestartedStream = await ReadTextAsync(serverStream, buffer);
        sawSaslRestartedStream = saslRestartedStream.Contains("<stream:stream", StringComparison.Ordinal)
            && saslRestartedStream.Contains("to=\"example.org\"", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <stream:features xmlns:stream="http://etherx.jabber.org/streams">
              <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><required/></bind>
            </stream:features>
            """);

        var bind = await ReadTextAsync(serverStream, buffer);
        sawBind = bind.Contains("<iq", StringComparison.Ordinal)
            && bind.Contains("type=\"set\"", StringComparison.Ordinal)
            && bind.Contains("<bind", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="bind-1">
              <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                <jid>edward@example.org/desktop</jid>
              </bind>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("edward@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: true);
        var options = new XmppStreamOptions(
            preferredLanguage: "nl",
            resource: "desktop",
            connectTimeout: TimeSpan.FromSeconds(5),
            keepAliveInterval: TimeSpan.FromSeconds(30));

        await using var client = new XmppStreamClient(
            settings,
            options,
            new FakeTlsStreamUpgrader(() => tlsUpgradeCount++));
        var result = await client.ConnectAndPlanAsync();
        Equal(XmppStreamNegotiationStep.StartTls, result.NextStep);
        await client.BeginStartTlsAsync();
        await client.AuthenticatePlainAsync("edward", "secret");
        var bindFeatures = await client.ReadFeaturesAsync();
        var jid = await client.BindAfterAuthenticationAsync(bindFeatures, "desktop");
        Equal("edward@example.org/desktop", jid.Full);
        Equal("edward@example.org/desktop", client.BoundJid!.Full);
        await client.DisconnectAsync();
        await serverTask;

        True(sawStartTls);
        True(sawRestartedStream);
        True(sawAuth);
        True(sawSaslRestartedStream);
        True(sawBind);
        Equal(1, tlsUpgradeCount);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientAuthenticatesScram()
{
    RunXmppStreamClientAuthenticatesScramAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientAuthenticatesScramAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawAuth = false;
    var sawResponse = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>SCRAM-SHA-1</mechanism>
              </mechanisms>
            </stream:features>
            """);

        var auth = await ReadTextAsync(serverStream, buffer);
        sawAuth = auth.Contains("<auth", StringComparison.Ordinal)
            && auth.Contains("SCRAM-SHA-1", StringComparison.Ordinal);

        await WriteTextAsync(serverStream,
            "<challenge xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\">"
            + Convert.ToBase64String(Encoding.UTF8.GetBytes("r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096"))
            + "</challenge>");

        var response = await ReadTextAsync(serverStream, buffer);
        sawResponse = response.Contains("<response", StringComparison.Ordinal)
            && response.Contains(Convert.ToBase64String(Encoding.UTF8.GetBytes(
                "c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=")), StringComparison.Ordinal);

        await WriteTextAsync(serverStream,
            "<success xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\">"
            + Convert.ToBase64String(Encoding.UTF8.GetBytes("v=rmF9pqV8S7suAoZWja4dJRkFsKQ="))
            + "</success>");

        var restarted = await ReadTextAsync(serverStream, buffer);
        True(restarted.Contains("<stream:stream", StringComparison.Ordinal));
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        var options = new XmppStreamOptions(
            preferredLanguage: "en",
            resource: "desktop",
            connectTimeout: TimeSpan.FromSeconds(5),
            keepAliveInterval: TimeSpan.FromSeconds(30));

        await using var client = new XmppStreamClient(settings, options);
        await client.ConnectAndPlanAsync();
        await client.AuthenticateScramAsync(
            XmppSaslScram.MechanismSha1,
            "user",
            "pencil",
            "fyko+d2lbbFgONRv9qkxdawL");
        await client.DisconnectAsync();
        await serverTask;

        True(sawAuth);
        True(sawResponse);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientAuthenticatesBestMechanism()
{
    RunXmppStreamClientAuthenticatesBestMechanismAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientAuthenticatesBestMechanismAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawSha256 = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
                <mechanism>SCRAM-SHA-256</mechanism>
              </mechanisms>
            </stream:features>
            """);

        var auth = await ReadTextAsync(serverStream, buffer);
        sawSha256 = auth.Contains("SCRAM-SHA-256", StringComparison.Ordinal);

        await WriteTextAsync(serverStream,
            "<challenge xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\">"
            + Convert.ToBase64String(Encoding.UTF8.GetBytes("r=clientnonce-server,s=c2FsdA==,i=4096"))
            + "</challenge>");

        await ReadTextAsync(serverStream, buffer);

        var verifier = ComputeScramSha256ServerVerifier(
            "user",
            "pencil",
            "clientnonce",
            "r=clientnonce-server,s=c2FsdA==,i=4096");
        await WriteTextAsync(serverStream,
            "<success xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\">"
            + Convert.ToBase64String(Encoding.UTF8.GetBytes("v=" + verifier))
            + "</success>");

        var restarted = await ReadTextAsync(serverStream, buffer);
        True(restarted.Contains("<stream:stream", StringComparison.Ordinal));
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        var result = await client.ConnectAndPlanAsync();
        var mechanism = await client.AuthenticateBestAsync(
            result.Features,
            "user",
            "pencil",
            "clientnonce");
        await client.DisconnectAsync();
        await serverTask;

        Equal(XmppSaslScram.MechanismSha256, mechanism);
        True(sawSha256);
    }
    finally
    {
        listener.Stop();
    }
}

static string ComputeScramSha256ServerVerifier(string username, string password, string nonce, string serverFirst)
{
    var scram = new XmppSaslScram(XmppSaslScram.MechanismSha256, username, password, nonce);
    scram.CreateClientFirstMessage();
    scram.CreateClientFinalMessage(serverFirst);

    var attributes = serverFirst.Split(',').ToDictionary(
        part => part[..part.IndexOf('=')],
        part => part[(part.IndexOf('=') + 1)..]);
    var salt = Convert.FromBase64String(attributes["s"]);
    var iterations = int.Parse(attributes["i"], System.Globalization.CultureInfo.InvariantCulture);
    var saltedPassword = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(
        Encoding.UTF8.GetBytes(password),
        salt,
        iterations,
        System.Security.Cryptography.HashAlgorithmName.SHA256,
        32);
    var serverKey = System.Security.Cryptography.HMACSHA256.HashData(
        saltedPassword,
        Encoding.UTF8.GetBytes("Server Key"));
    var clientFirstBare = $"n={username},r={nonce}";
    var clientFinalWithoutProof = $"c=biws,r={attributes["r"]}";
    var authMessage = $"{clientFirstBare},{serverFirst},{clientFinalWithoutProof}";
    return Convert.ToBase64String(System.Security.Cryptography.HMACSHA256.HashData(
        serverKey,
        Encoding.UTF8.GetBytes(authMessage)));
}

static void XmppStreamClientLoginPerformsAuthAndBind()
{
    RunXmppStreamClientLoginPerformsAuthAndBindAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientLoginPerformsAuthAndBindAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
            </stream:features>
            """);

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, "<success xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"/>");

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:features xmlns:stream="http://etherx.jabber.org/streams">
              <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><required/></bind>
            </stream:features>
            """);

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="bind-1">
              <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                <jid>user@example.org/desktop</jid>
              </bind>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        var options = new XmppStreamOptions(
            preferredLanguage: "en",
            resource: "desktop",
            connectTimeout: TimeSpan.FromSeconds(5),
            keepAliveInterval: TimeSpan.FromSeconds(30));

        await using var client = new XmppStreamClient(settings, options);
        var login = await client.LoginAsync("user", "secret");
        Equal("user@example.org/desktop", client.BoundJid!.Full);
        await client.DisconnectAsync();
        await serverTask;

        Equal("user@example.org/desktop", login.BoundJid.Full);
        Equal(XmppSaslPlain.Mechanism, login.SaslMechanism);
        False(login.TlsActive);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientRequestsRoster()
{
    RunXmppStreamClientRequestsRosterAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientRequestsRosterAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawRosterGet = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var rosterGet = await ReadTextAsync(serverStream, buffer);
        sawRosterGet = rosterGet.Contains("<iq", StringComparison.Ordinal)
            && rosterGet.Contains("type=\"get\"", StringComparison.Ordinal)
            && rosterGet.Contains("jabber:iq:roster", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="roster-1">
              <query xmlns="jabber:iq:roster">
                <item jid="anna@example.org" name="Anna" subscription="both">
                  <group>Friends</group>
                </item>
              </query>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        var roster = await client.RequestRosterAsync(TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawRosterGet);
        Equal(1, roster.Count);
        Equal("anna@example.org", roster[0].Jid.Bare);
        Equal("Anna", roster[0].Name);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientSetsAndRemovesRosterItems()
{
    RunXmppStreamClientSetsAndRemovesRosterItemsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientSetsAndRemovesRosterItemsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawSet = false;
    var sawRemove = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var set = await ReadTextAsync(serverStream, buffer);
        sawSet = set.Contains("type=\"set\"", StringComparison.Ordinal)
            && set.Contains("jid=\"anna@example.org\"", StringComparison.Ordinal)
            && set.Contains("name=\"Anna\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="roster-set-1"/>
            """);

        var remove = await ReadTextAsync(serverStream, buffer);
        sawRemove = remove.Contains("type=\"set\"", StringComparison.Ordinal)
            && remove.Contains("jid=\"anna@example.org\"", StringComparison.Ordinal)
            && remove.Contains("subscription=\"remove\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="roster-remove-1"/>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        await client.SetRosterItemAsync(
            new XmppRosterItem(XmppAddress.Parse("anna@example.org"), "Anna", Groups: ["Friends"]),
            TimeSpan.FromSeconds(5));
        await client.RemoveRosterItemAsync(XmppAddress.Parse("anna@example.org"), TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawSet);
        True(sawRemove);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientRequestsServiceDiscovery()
{
    RunXmppStreamClientRequestsServiceDiscoveryAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientRequestsServiceDiscoveryAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawDiscoGet = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var discoGet = await ReadTextAsync(serverStream, buffer);
        sawDiscoGet = discoGet.Contains("<iq", StringComparison.Ordinal)
            && discoGet.Contains("type=\"get\"", StringComparison.Ordinal)
            && discoGet.Contains("http://jabber.org/protocol/disco#info", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="disco-1">
              <query xmlns="http://jabber.org/protocol/disco#info">
                <identity category="client" type="pc" name="Test Client"/>
                <feature var="urn:xmpp:rtt:0"/>
                <feature var="urn:xmpp:receipts"/>
              </query>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        var info = await client.RequestServiceDiscoveryInfoAsync(
            XmppAddress.Parse("anna@example.org/phone"),
            TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawDiscoGet);
        Equal("client", info.Identities.Single().Category);
        True(info.Supports("urn:xmpp:rtt:0"));
        True(info.Supports("urn:xmpp:receipts"));
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientEnablesStreamManagementAndTracksAcks()
{
    RunXmppStreamClientEnablesStreamManagementAndTracksAcksAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientEnablesStreamManagementAndTracksAcksAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawEnable = false;
    var sawMessage = false;
    var sawClientAck = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <sm xmlns="urn:xmpp:sm:3"/>
            </stream:features>
            """);

        var enable = await ReadTextAsync(serverStream, buffer);
        sawEnable = enable.Contains("<enable", StringComparison.Ordinal)
            && enable.Contains("urn:xmpp:sm:3", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <enabled xmlns="urn:xmpp:sm:3" id="stream-1" resume="true"/>
            """);

        var message = await ReadTextAsync(serverStream, buffer);
        sawMessage = message.Contains("<message", StringComparison.Ordinal)
            && message.Contains("Hoi", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <a xmlns="urn:xmpp:sm:3" h="1"/>
            <r xmlns="urn:xmpp:sm:3"/>
            """);

        var ack = await ReadTextAsync(serverStream, buffer);
        sawClientAck = ack.Contains("<a", StringComparison.Ordinal)
            && ack.Contains("h=\"0\"", StringComparison.Ordinal);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        var features = await client.ConnectAndReadFeaturesAsync();
        True(features.StreamManagementOffered);
        await client.EnableStreamManagementAsync();
        True(client.StreamManagement.Enabled);
        True(client.StreamManagement.ResumeSupported);
        Equal("stream-1", client.StreamManagement.StreamId);

        await client.SendChatMessageAsync(new XmppChatMessage(
            XmppAddress.Parse("anna@example.org/phone"),
            "Hoi"));
        True(await client.ReadStreamManagementAsync());

        Equal((ulong)1, client.StreamManagement.OutboundStanzaCount);
        Equal((ulong)1, client.StreamManagement.LastAcknowledgedOutboundCount);
        Equal((ulong)0, client.StreamManagement.UnacknowledgedOutboundCount);

        await client.DisconnectAsync();
        await serverTask;

        True(sawEnable);
        True(sawMessage);
        True(sawClientAck);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientResumesStreamManagement()
{
    RunXmppStreamClientResumesStreamManagementAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientResumesStreamManagementAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawResume = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <sm xmlns="urn:xmpp:sm:3"/>
            </stream:features>
            """);

        var resume = await ReadTextAsync(serverStream, buffer);
        sawResume = resume.Contains("<resume", StringComparison.Ordinal)
            && resume.Contains("previd=\"stream-1\"", StringComparison.Ordinal)
            && resume.Contains("h=\"2\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <resumed xmlns="urn:xmpp:sm:3" previd="stream-1" h="3"/>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        await client.ResumeStreamManagementAsync("stream-1", 2);

        True(client.StreamManagement.Enabled);
        Equal("stream-1", client.StreamManagement.StreamId);

        await client.DisconnectAsync();
        await serverTask;
        True(sawResume);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientSendsInitialPresence()
{
    RunXmppStreamClientSendsInitialPresenceAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientSendsInitialPresenceAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawPresence = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var presence = await ReadTextAsync(serverStream, buffer);
        sawPresence = presence.Contains("<presence", StringComparison.Ordinal)
            && presence.Contains("<show>away</show>", StringComparison.Ordinal)
            && presence.Contains("<status>Even weg</status>", StringComparison.Ordinal);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        await client.SendInitialPresenceAsync(XmppPresenceShow.Away, "Even weg");
        await client.DisconnectAsync();
        await serverTask;

        True(sawPresence);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientSendsPresenceSubscription()
{
    RunXmppStreamClientSendsPresenceSubscriptionAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientSendsPresenceSubscriptionAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawSubscribe = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var presence = await ReadTextAsync(serverStream, buffer);
        sawSubscribe = presence.Contains("<presence", StringComparison.Ordinal)
            && presence.Contains("to=\"anna@example.org\"", StringComparison.Ordinal)
            && presence.Contains("type=\"subscribe\"", StringComparison.Ordinal);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        await client.SendPresenceSubscriptionAsync(
            XmppAddress.Parse("anna@example.org"),
            XmppPresenceType.Subscribe);
        await client.DisconnectAsync();
        await serverTask;

        True(sawSubscribe);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientSendsAndReceivesNormalChat()
{
    RunXmppStreamClientSendsAndReceivesNormalChatAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientSendsAndReceivesNormalChatAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawOutboundMessage = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var outbound = await ReadTextAsync(serverStream, buffer);
        sawOutboundMessage = outbound.Contains("<message", StringComparison.Ordinal)
            && outbound.Contains("to=\"anna@example.org/phone\"", StringComparison.Ordinal)
            && outbound.Contains("<body>Hoi Anna</body>", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="user@example.org/desktop" id="reply-1">
              <body>Hoi terug</body>
            </message>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        await client.SendChatMessageAsync(new XmppChatMessage(
            XmppAddress.Parse("anna@example.org/phone"),
            "Hoi Anna",
            Id: "msg-1"));
        var reply = await client.ReadNextStanzaAsync();
        await client.DisconnectAsync();
        await serverTask;

        True(sawOutboundMessage);
        True(reply.IsMessage);
        Equal("Hoi terug", reply.Message!.Body);
        Equal("anna@example.org/phone", reply.Message.From!.Full);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientEnablesMessageCarbons()
{
    RunXmppStreamClientEnablesMessageCarbonsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientEnablesMessageCarbonsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawEnable = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features/>
            """);

        var enable = await ReadTextAsync(serverStream, buffer);
        sawEnable = enable.Contains("type=\"set\"", StringComparison.Ordinal)
            && enable.Contains("<enable", StringComparison.Ordinal)
            && enable.Contains("urn:xmpp:carbons:2", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="carbons-enable-1"/>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("user@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();
        await client.EnableMessageCarbonsAsync(TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawEnable);
    }
    finally
    {
        listener.Stop();
    }
}

static async Task<string> ReadTextAsync(Stream stream, byte[] buffer)
{
    var count = await stream.ReadAsync(buffer);
    return Encoding.UTF8.GetString(buffer, 0, count);
}

static async Task WriteTextAsync(Stream stream, string text)
{
    await stream.WriteAsync(Encoding.UTF8.GetBytes(text));
    await stream.FlushAsync();
}

static void XmppIncomingStanzaClassifiesMessagePresenceIq()
{
    var message = XmppIncomingStanza.FromElement(new XmppChatMessage(
        To: XmppAddress.Parse("edward@example.org"),
        Body: "Hoi",
        From: XmppAddress.Parse("anna@example.org")).ToXml());
    True(message.IsMessage);
    Equal("Hoi", message.Message!.Body);

    var presence = XmppIncomingStanza.FromElement(new XmppPresence(
        Show: XmppPresenceShow.Away,
        From: XmppAddress.Parse("anna@example.org")).ToXml());
    True(presence.IsPresence);
    Equal(XmppPresenceShow.Away, presence.Presence!.Show);

    var iq = XmppIncomingStanza.FromElement(XmppIq.RosterGet("r1").ToXml());
    True(iq.IsIq);
    Equal("r1", iq.Iq!.Id);
}

static void XmppIqTrackerCompletesResult()
{
    var tracker = new XmppIqTracker();
    var task = tracker.Track("iq-1");

    True(tracker.TryComplete(new XmppIq(XmppIqType.Result, "iq-1")));

    Equal("iq-1", task.GetAwaiter().GetResult().Id);
}

static void XmppIqTrackerReportsError()
{
    var tracker = new XmppIqTracker();
    var task = tracker.Track("iq-2");

    True(tracker.TryComplete(new XmppIq(XmppIqType.Error, "iq-2")));

    try
    {
        task.GetAwaiter().GetResult();
        throw new InvalidOperationException("Expected IQ error.");
    }
    catch (XmppProtocolException ex)
    {
        Equal(XmppProtocolErrorKind.IqError, ex.Kind);
    }
}

static void XmppProtocolExceptionCarriesKind()
{
    var exception = new XmppProtocolException(
        XmppProtocolErrorKind.AuthenticationFailure,
        "Auth failed");

    Equal(XmppProtocolErrorKind.AuthenticationFailure, exception.Kind);
    Equal("Auth failed", exception.Message);
}

static void XmppStreamErrorParsesConditionAndText()
{
    var xml = """
        <stream:error xmlns:stream="http://etherx.jabber.org/streams">
          <conflict xmlns="urn:ietf:params:xml:ns:xmpp-streams"/>
          <text xmlns="urn:ietf:params:xml:ns:xmpp-streams">Resource already connected</text>
        </stream:error>
        """;

    True(XmppStreamError.TryParse(xml, out var error));
    Equal("conflict", error!.Condition);
    Equal("Resource already connected", error.Text);
}

static void XmppStanzaErrorParsesConditionAndType()
{
    var xml = """
        <message xmlns="jabber:client" type="error" from="anna@example.org/phone" to="user@example.org/desktop">
          <error type="cancel" by="example.org">
            <service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
            <text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">No RTT support</text>
          </error>
        </message>
        """;

    True(XmppStanzaError.TryParse(xml, out var error));
    Equal("service-unavailable", error!.Condition);
    Equal("cancel", error.Type);
    Equal("example.org", error.By);
    Equal("No RTT support", error.Text);
}

static void XmppRealTimeTextMessageSerializesFallbackAndRtt()
{
    var packet = new RttPacket(RttEvent.Reset, 1, [new RttInsert(0, "Hallo")]);
    var message = new XmppRealTimeTextMessage(
        To: XmppAddress.Parse("anna@example.org/phone"),
        Packet: packet,
        BodyFallback: "Hallo",
        From: XmppAddress.Parse("edward@example.org/desktop"),
        Id: "rtt-1").ToXml();

    Equal("message", message.Name.LocalName);
    Equal("chat", message.Attribute("type")?.Value);
    Equal("Hallo", message.Element(XName.Get("body", "jabber:client"))?.Value);
    Equal("rtt", message.Element(XName.Get("rtt", RttPacket.NamespaceName))?.Name.LocalName);
}

static void XmppRealTimeTextMessageParsesFallbackAndRtt()
{
    var xml = """
        <message xmlns="jabber:client" type="chat" from="edward@example.org/desktop" to="anna@example.org/phone" id="rtt-2">
          <body>Hallo</body>
          <rtt xmlns="urn:xmpp:rtt:0" event="reset" seq="3">
            <t p="0">Hallo</t>
          </rtt>
        </message>
        """;

    True(XmppRealTimeTextMessage.TryParse(XElement.Parse(xml), out var message));
    Equal("anna@example.org/phone", message!.To.Full);
    Equal("edward@example.org/desktop", message.From!.Full);
    Equal("Hallo", message.BodyFallback);
    Equal(RttEvent.Reset, message.Packet.Event);
    Equal(3, message.Packet.Sequence);
}

static void RttConversationManagerTracksPerContactState()
{
    var manager = new RttConversationStateManager();
    var message = new XmppRealTimeTextMessage(
        To: XmppAddress.Parse("edward@example.org/desktop"),
        From: XmppAddress.Parse("anna@example.org/phone"),
        Packet: new RttPacket(RttEvent.Reset, 1, [new RttInsert(0, "Hoi")]),
        BodyFallback: "");

    var state = manager.Apply(message);

    Equal("Hoi", state.Text);
    True(manager.TryGetText(XmppAddress.Parse("anna@example.org/tablet"), out var text));
    Equal("Hoi", text);
}

static void XmppIncomingStanzaExposesRealTimeText()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="edward@example.org/desktop" id="rtt-3">
          <rtt xmlns="urn:xmpp:rtt:0" event="reset" seq="9">
            <t p="0">Live</t>
          </rtt>
        </message>
        """);

    var stanza = XmppIncomingStanza.FromElement(xml);

    True(stanza.IsMessage);
    True(stanza.IsRealTimeText);
    Equal("anna@example.org/phone", stanza.RealTimeText!.From!.Full);
    Equal(9, stanza.RealTimeText.Packet.Sequence);
}

static void XmppChatMessageSerializesStanza()
{
    var message = new XmppChatMessage(
        To: XmppAddress.Parse("anna@example.org/phone"),
        Body: "Hallo Anna",
        From: XmppAddress.Parse("edward@example.org/desktop"),
        Id: "m1");

    var xml = message.ToXml();

    Equal("message", xml.Name.LocalName);
    Equal("jabber:client", xml.Name.NamespaceName);
    Equal("anna@example.org/phone", xml.Attribute("to")?.Value);
    Equal("edward@example.org/desktop", xml.Attribute("from")?.Value);
    Equal("chat", xml.Attribute("type")?.Value);
    Equal("m1", xml.Attribute("id")?.Value);
    Equal("Hallo Anna", xml.Element(xml.Name.Namespace + "body")?.Value);
}

static void XmppPresenceSerializesAwayStanza()
{
    var presence = new XmppPresence(
        Show: XmppPresenceShow.Away,
        Status: "Even weg",
        Priority: 5);

    var xml = presence.ToXml();

    Equal("presence", xml.Name.LocalName);
    Equal("away", xml.Element(xml.Name.Namespace + "show")?.Value);
    Equal("Even weg", xml.Element(xml.Name.Namespace + "status")?.Value);
    Equal("5", xml.Element(xml.Name.Namespace + "priority")?.Value);
}

static void XmppPresenceSerializesSubscriptionStanza()
{
    var xml = XmppPresence.Subscribe(XmppAddress.Parse("anna@example.org")).ToXml();

    Equal("presence", xml.Name.LocalName);
    Equal("anna@example.org", xml.Attribute("to")?.Value);
    Equal("subscribe", xml.Attribute("type")?.Value);

    True(XmppPresence.TryParse(xml, out var parsed));
    Equal(XmppPresenceType.Subscribe, parsed!.Type);
    Equal("anna@example.org", parsed.To!.Bare);
}

static void XmppRosterGetSerializesIq()
{
    var iq = XmppIq.RosterGet("roster-1").ToXml();

    Equal("iq", iq.Name.LocalName);
    Equal("get", iq.Attribute("type")?.Value);
    Equal("roster-1", iq.Attribute("id")?.Value);
    Equal("query", iq.Elements().Single().Name.LocalName);
    Equal("jabber:iq:roster", iq.Elements().Single().Name.NamespaceName);
}

static void XmppRosterSetSerializesItem()
{
    var item = new XmppRosterItem(
        Jid: XmppAddress.Parse("anna@example.org"),
        Name: "Anna",
        Subscription: XmppRosterSubscription.Both,
        Groups: ["Friends"]);

    var iq = XmppIq.RosterSet("roster-2", [item]).ToXml();
    var rosterItem = iq.Elements().Single().Elements().Single();

    Equal("set", iq.Attribute("type")?.Value);
    Equal("anna@example.org", rosterItem.Attribute("jid")?.Value);
    Equal("Anna", rosterItem.Attribute("name")?.Value);
    Equal("both", rosterItem.Attribute("subscription")?.Value);
    Equal("Friends", rosterItem.Elements().Single().Value);
}

static void XmppRosterRemoveSerializesItem()
{
    var iq = XmppIq.RosterRemove("roster-remove-1", XmppAddress.Parse("anna@example.org")).ToXml();
    var rosterItem = iq.Elements().Single().Elements().Single();

    Equal("set", iq.Attribute("type")?.Value);
    Equal("roster-remove-1", iq.Attribute("id")?.Value);
    Equal("anna@example.org", rosterItem.Attribute("jid")?.Value);
    Equal("remove", rosterItem.Attribute("subscription")?.Value);
}

static void XmppServiceDiscoverySerializesInfoRequest()
{
    var iq = XmppServiceDiscovery.CreateInfoRequest(
        "disco-1",
        XmppAddress.Parse("example.org"),
        "server-info").ToXml();
    var query = iq.Elements().Single();

    Equal("get", iq.Attribute("type")?.Value);
    Equal("example.org", iq.Attribute("to")?.Value);
    Equal("query", query.Name.LocalName);
    Equal(XmppServiceDiscovery.InfoNamespace, query.Name.NamespaceName);
    Equal("server-info", query.Attribute("node")?.Value);
}

static void XmppServiceDiscoveryParsesInfoResult()
{
    var xml = """
        <iq xmlns="jabber:client" type="result" id="disco-2">
          <query xmlns="http://jabber.org/protocol/disco#info">
            <identity category="server" type="im" name="Example XMPP"/>
            <feature var="urn:xmpp:rtt:0"/>
            <feature var="urn:xmpp:receipts"/>
          </query>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    True(XmppServiceDiscovery.TryParseInfoResult(iq!, out var info));
    Equal("server", info!.Identities.Single().Category);
    Equal("im", info.Identities.Single().Type);
    True(info.Supports("urn:xmpp:rtt:0"));
    True(info.Supports("urn:xmpp:receipts"));
}

static void XmppServiceDiscoveryChecksRttCapability()
{
    var info = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [],
        Features: [RttPacket.NamespaceName]);

    True(XmppServiceDiscovery.SupportsRealTimeText(info));
}

static void XmppEntityCapabilitiesCreatesDeterministicVerification()
{
    var first = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities:
        [
            new XmppServiceIdentity("client", "pc", "Tiedragon Messenger"),
            new XmppServiceIdentity("automation", "ai", "Caption Agent", "nl")
        ],
        Features:
        [
            XmppServiceDiscovery.InfoNamespace,
            RttPacket.NamespaceName,
            XmppEntityCapabilities.NamespaceName
        ]);

    var second = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities:
        [
            new XmppServiceIdentity("automation", "ai", "Caption Agent", "nl"),
            new XmppServiceIdentity("client", "pc", "Tiedragon Messenger")
        ],
        Features:
        [
            RttPacket.NamespaceName,
            XmppEntityCapabilities.NamespaceName,
            XmppServiceDiscovery.InfoNamespace,
            RttPacket.NamespaceName
        ]);

    var verification = XmppEntityCapabilities.CreateVerificationHash(first);

    Equal(verification, XmppEntityCapabilities.CreateVerificationHash(second));
    Equal(
        "automation/ai/nl/Caption Agent<client/pc//Tiedragon Messenger<http://jabber.org/protocol/caps<http://jabber.org/protocol/disco#info<urn:xmpp:rtt:0<",
        XmppEntityCapabilities.CreateVerificationString(first));

    var caps = XmppEntityCapabilities.FromDiscoInfo("https://www.tiedragon.com/xmpp", first);
    Equal("https://www.tiedragon.com/xmpp", caps.Node);
    Equal(verification, caps.Verification);
    Equal("sha-1", caps.HashAlgorithm);
}

static void XmppPresenceSerializesAndParsesCapabilities()
{
    var caps = new XmppEntityCapabilities(
        Node: "https://www.tiedragon.com/xmpp",
        Verification: "abc123");

    var xml = new XmppPresence(Capabilities: caps).ToXml();
    var capsElement = xml.Element(XName.Get("c", XmppEntityCapabilities.NamespaceName));

    True(capsElement is not null);
    Equal("https://www.tiedragon.com/xmpp", capsElement!.Attribute("node")?.Value);
    Equal("sha-1", capsElement.Attribute("hash")?.Value);
    Equal("abc123", capsElement.Attribute("ver")?.Value);

    True(XmppPresence.TryParse(xml, out var parsed));
    Equal("https://www.tiedragon.com/xmpp", parsed!.Capabilities!.Node);
    Equal("abc123", parsed.Capabilities.Verification);
}

static void XmppAlternativeConnectionDiscoveryCreatesHostMetaUri()
{
    Equal(
        "https://example.org/.well-known/host-meta",
        XmppAlternativeConnectionDiscovery.CreateHostMetaUri("example.org").ToString());
    Equal(
        "https://example.org/.well-known/host-meta.json",
        XmppAlternativeConnectionDiscovery.CreateHostMetaUri("example.org", json: true).ToString());
}

static void XmppAlternativeConnectionDiscoveryParsesXmlAndJson()
{
    var xml = """
        <XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
          <Link rel="urn:xmpp:alt-connections:xbosh" href="https://example.org/http-bind"/>
          <Link rel="urn:xmpp:alt-connections:websocket" href="wss://example.org/xmpp-websocket"/>
          <Link rel="ignored" href="https://example.org/nope"/>
        </XRD>
        """;

    var xmlMethods = XmppAlternativeConnectionDiscovery.ParseXmlHostMeta(xml);
    Equal(2, xmlMethods.Count);
    Equal("wss://example.org/xmpp-websocket", XmppAlternativeConnectionDiscovery.WebSocketUris(xmlMethods).Single().ToString());

    var json = """
        {
          "links": [
            { "rel": "urn:xmpp:alt-connections:websocket", "href": "wss://chat.example.net/ws" },
            { "rel": "urn:xmpp:alt-connections:xbosh", "href": "https://chat.example.net/bosh" },
            { "rel": "ignored", "href": "https://chat.example.net/ignored" }
          ]
        }
        """;

    var jsonMethods = XmppAlternativeConnectionDiscovery.ParseJsonHostMeta(json);
    Equal(2, jsonMethods.Count);
    Equal("wss://chat.example.net/ws", XmppAlternativeConnectionDiscovery.WebSocketUris(jsonMethods).Single().ToString());
}

static void XmppMeCommandPreservesProtocolBody()
{
    var command = XmppMeCommand.Create("is testing RTT");
    Equal("/me is testing RTT", command.ToBody());
    Equal("* Edward is testing RTT", command.ToDisplayText("Edward"));

    var message = new XmppChatMessage(
        To: XmppAddress.Parse("anna@example.org"),
        Body: command.ToBody());
    Equal("/me is testing RTT", message.ToXml().Element(XName.Get("body", "jabber:client"))?.Value);

    True(XmppMeCommand.TryParse(message.Body, out var parsed));
    Equal("is testing RTT", parsed!.ActionText);
    False(XmppMeCommand.TryParse("/Me is not exact", out _));
    False(XmppMeCommand.TryParse("/me", out _));
}

static void XmppVCardTempSerializesGetAndSet()
{
    var get = XmppVCardTemp.CreateGetRequest("v1", XmppAddress.Parse("anna@example.org"));
    Equal(XmppIqType.Get, get.Type);
    Equal("anna@example.org", get.To?.Bare);
    Equal("vCard", get.Payload!.Name.LocalName);
    Equal(XmppVCardTemp.NamespaceName, get.Payload.Name.NamespaceName);

    var set = XmppVCardTemp.CreateSetRequest(
        "v2",
        new XmppVCardTemp(
            FullName: "Edward Tie",
            Nickname: "Edward",
            Url: "https://www.tiedragon.com",
            Birthday: "1976-01-01",
            Photo: new XmppVCardPhoto("image/png", "ZmFrZQ==")));

    var vcard = set.Payload!;
    Equal(XmppIqType.Set, set.Type);
    Equal("Edward Tie", vcard.Element(XName.Get("FN", XmppVCardTemp.NamespaceName))?.Value);
    Equal("Edward", vcard.Element(XName.Get("NICKNAME", XmppVCardTemp.NamespaceName))?.Value);
    Equal("image/png", vcard.Element(XName.Get("PHOTO", XmppVCardTemp.NamespaceName))?.Element(XName.Get("TYPE", XmppVCardTemp.NamespaceName))?.Value);
}

static void XmppVCardTempParsesResult()
{
    var xml = """
        <iq xmlns="jabber:client" id="v1" type="result">
          <vCard xmlns="vcard-temp">
            <FN>Anna Example</FN>
            <NICKNAME>Anna</NICKNAME>
            <URL>https://example.org/anna</URL>
            <BDAY>2000-02-03</BDAY>
            <PHOTO>
              <TYPE>image/jpeg</TYPE>
              <BINVAL>YW5uYQ==</BINVAL>
            </PHOTO>
          </vCard>
        </iq>
        """;

    True(XmppIq.TryParse(XElement.Parse(xml), out var iq));
    True(XmppVCardTemp.TryParseResult(iq!, out var vCard));
    Equal("Anna Example", vCard!.FullName);
    Equal("Anna", vCard.Nickname);
    Equal("https://example.org/anna", vCard.Url);
    Equal("2000-02-03", vCard.Birthday);
    Equal("image/jpeg", vCard.Photo!.ContentType);
    Equal("YW5uYQ==", vCard.Photo.Base64Data);
}

static void XmppPushNotificationsSerializeEnableAndDisable()
{
    var service = XmppAddress.Parse("push.example.org");
    var enable = XmppPushNotifications.CreateEnableRequest(
        "push1",
        service,
        "device-node",
        new Dictionary<string, string>
        {
            ["device_id"] = "phone-1",
            ["silent"] = "false"
        });

    var enableElement = enable.Payload!;
    Equal(XmppIqType.Set, enable.Type);
    Equal("enable", enableElement.Name.LocalName);
    Equal(XmppPushNotifications.NamespaceName, enableElement.Name.NamespaceName);
    Equal("push.example.org", enableElement.Attribute("jid")?.Value);
    Equal("device-node", enableElement.Attribute("node")?.Value);

    var form = enableElement.Element(XName.Get("x", XmppPushNotifications.DataFormsNamespace));
    True(form is not null);
    Equal("submit", form!.Attribute("type")?.Value);
    True(form.Elements(XName.Get("field", XmppPushNotifications.DataFormsNamespace))
        .Any(field => (string?)field.Attribute("var") == "FORM_TYPE"
            && field.Element(XName.Get("value", XmppPushNotifications.DataFormsNamespace))?.Value == XmppPushNotifications.NamespaceName));

    var disable = XmppPushNotifications.CreateDisableRequest("push2", service, "device-node");
    Equal("disable", disable.Payload!.Name.LocalName);
    Equal("push.example.org", disable.Payload.Attribute("jid")?.Value);
    Equal("device-node", disable.Payload.Attribute("node")?.Value);
    True(XmppPushNotifications.IsEnableResult(new XmppIq(XmppIqType.Result, "push1"), "push1"));
}

static void XmppChatStateSerializesAndParses()
{
    var xml = XmppChatStateNotifications.CreateMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        XmppChatState.Composing,
        id: "state-1");

    Equal("message", xml.Name.LocalName);
    Equal("state-1", xml.Attribute("id")?.Value);
    Equal("composing", xml.Elements().Single().Name.LocalName);
    Equal(XmppChatStateNotifications.NamespaceName, xml.Elements().Single().Name.NamespaceName);

    True(XmppChatStateNotifications.TryParse(xml, out var state));
    Equal(XmppChatState.Composing, state);
}

static void XmppDeliveryReceiptRequestSerializesAndParses()
{
    var xml = XmppDeliveryReceipt.CreateRequestMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        "msg-1",
        "Hoi");

    Equal("msg-1", xml.Attribute("id")?.Value);
    Equal("request", xml.Element(XName.Get("request", XmppDeliveryReceipt.NamespaceName))?.Name.LocalName);

    True(XmppDeliveryReceipt.TryParse(xml, out var receipt));
    True(receipt!.RequestsReceipt);
    Equal("msg-1", receipt.RequestedId);
    Equal(null, receipt.ReceivedId);
}

static void XmppDeliveryReceiptReceivedSerializesAndParses()
{
    var xml = XmppDeliveryReceipt.CreateReceivedMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        "msg-1",
        "receipt-1");

    Equal("receipt-1", xml.Attribute("id")?.Value);

    True(XmppDeliveryReceipt.TryParse(xml, out var receipt));
    True(receipt!.IsReceipt);
    Equal("msg-1", receipt.ReceivedId);
    Equal(null, receipt.RequestedId);
}

static void XmppMessageCarbonsEnableSerializesIq()
{
    var iq = XmppMessageCarbons.CreateEnableRequest("carbons-1").ToXml();

    Equal("iq", iq.Name.LocalName);
    Equal("set", iq.Attribute("type")?.Value);
    Equal("carbons-1", iq.Attribute("id")?.Value);
    Equal("enable", iq.Elements().Single().Name.LocalName);
    Equal(XmppMessageCarbons.NamespaceName, iq.Elements().Single().Name.NamespaceName);
}

static void XmppMessageCarbonsParseForwardedReceived()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" from="user@example.org">
          <received xmlns="urn:xmpp:carbons:2">
            <forwarded xmlns="urn:xmpp:forward:0">
              <message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="user@example.org/desktop" id="m-carbon">
                <body>Carbon hello</body>
              </message>
            </forwarded>
          </received>
        </message>
        """);

    True(XmppMessageCarbons.TryParse(xml, out var carbon));
    Equal(XmppCarbonDirection.Received, carbon!.Direction);
    Equal("Carbon hello", carbon.ForwardedMessage.Body);
    Equal("anna@example.org/phone", carbon.ForwardedMessage.From!.Full);
}

static void XmppIncomingStanzaExposesCarbon()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" from="user@example.org">
          <sent xmlns="urn:xmpp:carbons:2">
            <forwarded xmlns="urn:xmpp:forward:0">
              <message xmlns="jabber:client" type="chat" from="user@example.org/phone" to="anna@example.org/desktop" id="m-carbon-2">
                <body>Sent from phone</body>
              </message>
            </forwarded>
          </sent>
        </message>
        """);

    var stanza = XmppIncomingStanza.FromElement(xml);

    True(stanza.IsMessage);
    True(stanza.IsCarbon);
    Equal(XmppCarbonDirection.Sent, stanza.Carbon!.Direction);
    Equal("Sent from phone", stanza.Carbon.ForwardedMessage.Body);
}

static void XmppMessageArchiveQuerySerializesPaging()
{
    var iq = XmppMessageArchive.CreateQuery(
        "mam-1",
        new XmppArchiveQueryOptions(
            Start: DateTimeOffset.Parse("2026-05-27T10:00:00Z"),
            With: XmppAddress.Parse("anna@example.org"),
            Max: 20,
            After: "page-1"),
        "q1").ToXml();
    var query = iq.Elements().Single();

    Equal("set", iq.Attribute("type")?.Value);
    Equal("query", query.Name.LocalName);
    Equal(XmppMessageArchive.NamespaceName, query.Name.NamespaceName);
    Equal("q1", query.Attribute("queryid")?.Value);

    var form = query.Element(XName.Get("x", XmppMessageArchive.DataFormsNamespace));
    True(form!.Descendants(XName.Get("value", XmppMessageArchive.DataFormsNamespace)).Any(value => value.Value == "anna@example.org"));

    var set = query.Element(XName.Get("set", XmppMessageArchive.ResultSetManagementNamespace));
    Equal("20", set!.Element(XName.Get("max", XmppMessageArchive.ResultSetManagementNamespace))?.Value);
    Equal("page-1", set.Element(XName.Get("after", XmppMessageArchive.ResultSetManagementNamespace))?.Value);
}

static void XmppMessageArchiveParsesForwardedResult()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" from="archive.example.org">
          <result xmlns="urn:xmpp:mam:2" queryid="q1" id="archive-1">
            <forwarded xmlns="urn:xmpp:forward:0">
              <delay xmlns="urn:xmpp:delay" stamp="2026-05-27T10:15:00Z"/>
              <message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="user@example.org/desktop" id="m-archive">
                <body>Archived hello</body>
              </message>
            </forwarded>
          </result>
        </message>
        """);

    True(XmppMessageArchive.TryParseResult(xml, out var archived));
    Equal("archive-1", archived!.Id);
    Equal("q1", archived.QueryId);
    Equal("Archived hello", archived.Message.Body);
    Equal("anna@example.org/phone", archived.Message.From!.Full);
    Equal(DateTimeOffset.Parse("2026-05-27T10:15:00Z"), archived.DelayStamp);
}

static void XmppMessageArchiveParsesFinResultSet()
{
    var xml = """
        <iq xmlns="jabber:client" type="result" id="mam-1">
          <fin xmlns="urn:xmpp:mam:2" complete="true">
            <set xmlns="http://jabber.org/protocol/rsm">
              <first index="0">archive-1</first>
              <last>archive-20</last>
              <count>50</count>
            </set>
          </fin>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    True(XmppMessageArchive.TryParseFin(iq!, out var resultSet, out var complete));
    True(complete);
    Equal("archive-1", resultSet!.First);
    Equal("archive-20", resultSet.Last);
    Equal(50, resultSet.Count);
    Equal(0, resultSet.FirstIndex);
}

static void XmppStreamManagementStateTracksCounts()
{
    var state = new XmppStreamManagementState();

    state.Enable("stream-1", resumeSupported: true);
    state.CountOutboundStanza();
    state.CountOutboundStanza();
    state.CountInboundStanza();
    state.AcknowledgeOutbound(1);

    True(state.Enabled);
    True(state.ResumeSupported);
    Equal("stream-1", state.StreamId);
    Equal((ulong)2, state.OutboundStanzaCount);
    Equal((ulong)1, state.InboundStanzaCount);
    Equal((ulong)1, state.LastAcknowledgedOutboundCount);
    Equal((ulong)1, state.UnacknowledgedOutboundCount);
}

static void XmppChatMessageParsesStanza()
{
    var xml = """
        <message xmlns="jabber:client" from="anna@example.org/phone" to="edward@example.org/desktop" type="chat" id="m2">
          <body>Hoi Edward</body>
        </message>
        """;

    True(XmppChatMessage.TryParse(xml, out var message));
    Equal("anna@example.org/phone", message!.From?.Full);
    Equal("edward@example.org/desktop", message.To.Full);
    Equal(XmppMessageType.Chat, message.Type);
    Equal("m2", message.Id);
    Equal("Hoi Edward", message.Body);
}

static void XmppPresenceParsesStanza()
{
    var xml = """
        <presence xmlns="jabber:client" from="anna@example.org/phone">
          <show>dnd</show>
          <status>Niet storen</status>
          <priority>3</priority>
        </presence>
        """;

    True(XmppPresence.TryParse(xml, out var presence));
    Equal("anna@example.org/phone", presence!.From?.Full);
    Equal(XmppPresenceShow.DoNotDisturb, presence.Show);
    Equal("Niet storen", presence.Status);
    Equal((sbyte)3, presence.Priority);
}

static void XmppIqParsesRosterItems()
{
    var xml = """
        <iq xmlns="jabber:client" type="result" id="roster-3">
          <query xmlns="jabber:iq:roster">
            <item jid="anna@example.org" name="Anna" subscription="both">
              <group>Friends</group>
            </item>
          </query>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    Equal(XmppIqType.Result, iq!.Type);
    Equal("roster-3", iq.Id);

    var item = iq.GetRosterItems().Single();
    Equal("anna@example.org", item.Jid.Bare);
    Equal("Anna", item.Name);
    Equal(XmppRosterSubscription.Both, item.Subscription);
    Equal("Friends", item.Groups!.Single());
}

static void FinalBodyResetsState()
{
    var state = new RttMessageState();

    state.Apply(new RttPacket(RttEvent.Reset, 1, [new RttInsert(0, "draft")]));
    state.AcceptFinalBody("final");

    Equal("final", state.Text);
    Equal(null, state.LastSequence);
    True(state.IsSynchronized);
}

static void UnicodePositionsCountCodePoints()
{
    var state = new RttMessageState();

    state.Apply(new RttPacket(RttEvent.Reset, 1, [new RttInsert(0, "A😀C")]));
    state.Apply(new RttPacket(RttEvent.Edit, 2, [new RttErase(2, 1)]));

    Equal("AC", state.Text);
}

static void AccessibilityInputEventCarriesSpeakerLabel()
{
    var speaker = new SpeakerLabel("mic-1", "Edward", "speaksee-1", 0.91);
    var input = AccessibilityInputEvent.FromText(
        AccessibilityInputKind.ExternalMicrophoneKit,
        "kit-1",
        "Hallo",
        speaker,
        DateTimeOffset.UnixEpoch);

    Equal(AccessibilityInputKind.ExternalMicrophoneKit, input.Kind);
    Equal("kit-1", input.SourceId);
    Equal("Hallo", input.Text);
    Equal("Edward", input.Speaker!.DisplayName);
    Equal(DateTimeOffset.UnixEpoch, input.Timestamp);
}

static void LiveCaptionMarksLowConfidenceAsUncertain()
{
    var caption = LiveCaptionSegment.Partial("mogelijk woord", confidence: 0.4);

    Equal(CaptionState.Partial, caption.State);
    True(caption.IsUncertain);
    Equal(0.4, caption.Confidence);
}

static void CaptionBridgeKeepsLocalCaptionsLocal()
{
    var bridge = new CaptionToRttBridge(XmppAddress.Parse("anna@example.org/phone"));
    var result = bridge.Publish(LiveCaptionSegment.Partial("lokale tekst"));

    False(result.WasShared);
    Equal(CaptionShareMode.LocalOnly, result.ShareMode);
    Equal(AgentOutputKind.Caption, result.Marker.Kind);
}

static void CaptionBridgePublishesRttEdits()
{
    var bridge = new CaptionToRttBridge(
        XmppAddress.Parse("anna@example.org/phone"),
        CaptionShareMode.RemoteRtt);

    var first = bridge.Publish(LiveCaptionSegment.Partial("Hal"));
    var second = bridge.Publish(LiveCaptionSegment.Final("Hallo"));

    True(first.WasShared);
    Equal(RttEvent.Reset, first.RttMessage!.Packet.Event);
    Equal("Hal", first.Caption.Text);
    Equal(RttEvent.Edit, second.RttMessage!.Packet.Event);
    Equal("Hallo", second.FinalBody);
    Equal("Hallo", second.RttMessage.BodyFallback);
}

static void CaptionBridgePublishesFinalMessagesOnlyWhenFinal()
{
    var bridge = new CaptionToRttBridge(
        XmppAddress.Parse("anna@example.org/phone"),
        CaptionShareMode.RemoteFinalMessage);

    var partial = bridge.Publish(LiveCaptionSegment.Partial("nog bezig"));
    var final = bridge.Publish(LiveCaptionSegment.Final("klaar"));

    False(partial.WasShared);
    True(final.WasShared);
    Equal("klaar", final.FinalBody);
    Equal(null, final.RttMessage);
}

static void PrivacySettingsDefaultToNoRetention()
{
    var privacy = TranscriptPrivacySettings.PrivateDefault;

    False(privacy.AllowCloudProcessing);
    False(privacy.SaveAudio);
    False(privacy.SaveVideo);
    False(privacy.SaveTranscript);
    Equal(null, privacy.Retention);
}

static void AgentMarkerDistinguishesCaptions()
{
    var marker = AgentMessageMarker.Caption("speech-to-text", 0.8);

    Equal(AgentOutputKind.Caption, marker.Kind);
    Equal("speech-to-text", marker.Source);
    Equal(0.8, marker.Confidence);
    False(marker.IsUncertain);
}

static T IsType<T>(object value)
{
    if (value is T typed)
    {
        return typed;
    }

    throw new InvalidOperationException($"Expected {typeof(T).Name}, got {value.GetType().Name}.");
}

static void Equal<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new InvalidOperationException($"Expected '{expected}', got '{actual}'.");
    }
}

static void True(bool value)
{
    if (!value)
    {
        throw new InvalidOperationException("Expected true.");
    }
}

static void False(bool value)
{
    if (value)
    {
        throw new InvalidOperationException("Expected false.");
    }
}

sealed class FakeTlsStreamUpgrader(Action onUpgrade) : IXmppTlsStreamUpgrader
{
    public Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken)
    {
        onUpgrade();
        return Task.FromResult(stream);
    }
}

sealed class FakeWebSocketTransport : IXmppWebSocketTransport
{
    private readonly Queue<string?> _received = new();

    public List<string> Sent { get; } = [];

    public Task ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }

    public Task SendTextAsync(string text, CancellationToken cancellationToken = default)
    {
        Sent.Add(text);
        return Task.CompletedTask;
    }

    public Task<string?> ReceiveTextAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_received.Count == 0 ? null : _received.Dequeue());
    }

    public Task CloseAsync(CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }
}
