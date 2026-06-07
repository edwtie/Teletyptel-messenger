using Tiedragon.LngPdk;
using Tiedragon.XmppMessenger.Core.Accessibility;
using Tiedragon.XmppMessenger.Core.Messaging;
using Tiedragon.XmppMessenger.Core.Rtt;
using Tiedragon.XmppMessenger.Core.Xmpp;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
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
    ("XMPP direct TLS creates SRV endpoints", XmppDirectTlsCreatesSrvEndpoints),
    ("XMPP direct TLS discovery queries SRV records", XmppDirectTlsDiscoveryQueriesSrvRecords),
    ("XMPP direct TLS settings use endpoint", XmppDirectTlsSettingsUseEndpoint),
    ("XMPP feature set can enable RTT", XmppFeatureSetCanEnableRtt),
    ("XMPP stream header creates client stream", XmppStreamHeaderCreatesClientStream),
    ("XMPP stream features parse STARTTLS and SASL", XmppStreamFeaturesParseStartTlsAndSasl),
    ("XMPP stream features parse bind and session", XmppStreamFeaturesParseBindAndSession),
    ("XMPP stream features parse stream management", XmppStreamFeaturesParseStreamManagement),
    ("XMPP stream features parse client state indication", XmppStreamFeaturesParseClientStateIndication),
    ("XMPP SASL PLAIN creates auth element", XmppSaslPlainCreatesAuthElement),
    ("XMPP OAuth client login creates bearer auth element", XmppOAuthClientLoginCreatesBearerAuthElement),
    ("XMPP OAuth client login parses discovery challenge", XmppOAuthClientLoginParsesDiscoveryChallenge),
    ("XMPP SASL selector prefers SCRAM SHA256", XmppSaslSelectorPrefersScramSha256),
    ("XMPP SASL SCRAM SHA1 matches RFC vector", XmppSaslScramSha1MatchesRfcVector),
    ("XMPP resource binding creates bind IQ", XmppResourceBindingCreatesBindIq),
    ("XMPP resource binding parses bound JID", XmppResourceBindingParsesBoundJid),
    ("XMPP negotiation plan follows RFC 6120 order", XmppNegotiationPlanFollowsRfc6120Order),
    ("XMPP negotiation plan blocks missing required TLS", XmppNegotiationPlanBlocksMissingRequiredTls),
    ("XMPP stream reader handles chunked features", XmppStreamReaderHandlesChunkedFeatures),
    ("XMPP stream reader skips XML declaration", XmppStreamReaderSkipsXmlDeclaration),
    ("XMPP stream reader returns multiple stanzas", XmppStreamReaderReturnsMultipleStanzas),
    ("XMPP stream reader handles self closing element", XmppStreamReaderHandlesSelfClosingElement),
    ("XMPP stream reader reports stream close", XmppStreamReaderReportsStreamClose),
    ("XMPP stream writer writes open stream and stanza", XmppStreamWriterWritesOpenStreamAndStanza),
    ("XMPP WebSocket frame serializes open and close", XmppWebSocketFrameSerializesOpenAndClose),
    ("XMPP WebSocket stream sends RFC 7395 open frame", XmppWebSocketStreamSendsRfc7395OpenFrame),
    ("XMPP BOSH serializes session and restart", XmppBoshSerializesSessionAndRestart),
    ("XMPP BOSH parses session and terminate", XmppBoshParsesSessionAndTerminate),
    ("XMPP BOSH client logs in and long polls", XmppBoshClientLogsInAndLongPolls),
    ("XMPP stream client connects and reads features", XmppStreamClientConnectsAndReadsFeatures),
    ("XMPP stream client returns negotiation decision", XmppStreamClientReturnsNegotiationDecision),
    ("XMPP stream client opens direct TLS before stream", XmppStreamClientOpensDirectTlsBeforeStream),
    ("XMPP stream client runs TLS SASL bind commands", XmppStreamClientRunsTlsSaslBindCommands),
    ("XMPP stream client authenticates SCRAM", XmppStreamClientAuthenticatesScram),
    ("XMPP stream client authenticates best mechanism", XmppStreamClientAuthenticatesBestMechanism),
    ("XMPP stream client login performs auth and bind", XmppStreamClientLoginPerformsAuthAndBind),
    ("XMPP stream client requests roster", XmppStreamClientRequestsRoster),
    ("XMPP stream client sets and removes roster items", XmppStreamClientSetsAndRemovesRosterItems),
    ("XMPP stream client handles blocking commands", XmppStreamClientHandlesBlockingCommands),
    ("XMPP stream client requests service discovery", XmppStreamClientRequestsServiceDiscovery),
    ("XMPP stream client requests external services", XmppStreamClientRequestsExternalServices),
    ("XMPP stream client publishes personal events", XmppStreamClientPublishesPersonalEvents),
    ("XMPP stream client handles PubSub announcements", XmppStreamClientHandlesPubSubAnnouncements),
    ("XMPP stream client handles private XML storage", XmppStreamClientHandlesPrivateXmlStorage),
    ("XMPP stream client handles persistent private data", XmppStreamClientHandlesPersistentPrivateData),
    ("XMPP stream client handles user avatar requests", XmppStreamClientHandlesUserAvatarRequests),
    ("XMPP stream client enables stream management and tracks acks", XmppStreamClientEnablesStreamManagementAndTracksAcks),
    ("XMPP stream client resumes stream management", XmppStreamClientResumesStreamManagement),
    ("XMPP stream client sends client state indication", XmppStreamClientSendsClientStateIndication),
    ("XMPP stream client sends initial presence", XmppStreamClientSendsInitialPresence),
    ("XMPP stream client sends presence subscription", XmppStreamClientSendsPresenceSubscription),
    ("XMPP stream client sends and receives normal chat", XmppStreamClientSendsAndReceivesNormalChat),
    ("XMPP stream client preserves multiple stanzas from one read", XmppStreamClientPreservesMultipleStanzasFromOneRead),
    ("XMPP stream client enables message carbons", XmppStreamClientEnablesMessageCarbons),
    ("XMPP incoming stanza classifies message presence IQ", XmppIncomingStanzaClassifiesMessagePresenceIq),
    ("XMPP incoming stanza exposes personal event", XmppIncomingStanzaExposesPersonalEvent),
    ("XMPP IQ tracker completes result", XmppIqTrackerCompletesResult),
    ("XMPP IQ tracker reports error", XmppIqTrackerReportsError),
    ("XMPP protocol exception carries kind", XmppProtocolExceptionCarriesKind),
    ("XMPP stream error parses condition and text", XmppStreamErrorParsesConditionAndText),
    ("XMPP stanza error parses condition and type", XmppStanzaErrorParsesConditionAndType),
    ("XMPP real time text message serializes fallback and RTT", XmppRealTimeTextMessageSerializesFallbackAndRtt),
    ("XMPP real time text message parses fallback and RTT", XmppRealTimeTextMessageParsesFallbackAndRtt),
    ("T.140 codec applies UTF8 text and erasures", T140CodecAppliesUtf8TextAndErasures),
    ("RTP T.140 packetizer serializes packet", RtpT140PacketizerSerializesPacket),
    ("RTP T.140 redundancy payload roundtrips", RtpT140RedundancyPayloadRoundtrips),
    ("RTT conversation manager tracks per contact state", RttConversationManagerTracksPerContactState),
    ("XMPP incoming stanza exposes real time text", XmppIncomingStanzaExposesRealTimeText),
    ("XMPP chat message serializes stanza", XmppChatMessageSerializesStanza),
    ("XMPP message correction serializes and parses", XmppMessageCorrectionSerializesAndParses),
    ("XMPP incoming stanza exposes message correction", XmppIncomingStanzaExposesMessageCorrection),
    ("XMPP message styling serializes unstyled marker", XmppMessageStylingSerializesUnstyledMarker),
    ("XMPP message styling parses inline spans", XmppMessageStylingParsesInlineSpans),
    ("XMPP emoji markup serializes and parses", XmppEmojiMarkupSerializesAndParses),
    ("XMPP incoming stanza exposes custom emoji media", XmppIncomingStanzaExposesCustomEmojiMedia),
    ("XMPP message retraction serializes and parses", XmppMessageRetractionSerializesAndParses),
    ("XMPP incoming stanza exposes message retraction", XmppIncomingStanzaExposesMessageRetraction),
    ("XMPP presence serializes away stanza", XmppPresenceSerializesAwayStanza),
    ("XMPP presence serializes subscription stanza", XmppPresenceSerializesSubscriptionStanza),
    ("XMPP roster get serializes IQ", XmppRosterGetSerializesIq),
    ("XMPP roster set serializes item", XmppRosterSetSerializesItem),
    ("XMPP roster remove serializes item", XmppRosterRemoveSerializesItem),
    ("XMPP service discovery serializes info request", XmppServiceDiscoverySerializesInfoRequest),
    ("XMPP service discovery parses info result", XmppServiceDiscoveryParsesInfoResult),
    ("XMPP service discovery checks RTT capability", XmppServiceDiscoveryChecksRttCapability),
    ("XMPP service discovery checks PEP capability", XmppServiceDiscoveryChecksPepCapability),
    ("XMPP consistent color generation follows XEP-0392", XmppConsistentColorGenerationFollowsXep0392),
    ("XMPP ad hoc command serializes and parses", XmppAdHocCommandSerializesAndParses),
    ("XMPP service administration parses read-only results", XmppServiceAdministrationParsesReadOnlyResults),
    ("XMPP external service discovery serializes and parses services", XmppExternalServiceDiscoverySerializesAndParsesServices),
    ("XMPP external service discovery handles credentials and pushes", XmppExternalServiceDiscoveryHandlesCredentialsAndPushes),
    ("XMPP service contact addresses parse serverinfo form", XmppServiceContactAddressesParseServerInfoForm),
    ("XMPP client access management serializes and parses", XmppClientAccessManagementSerializesAndParses),
    ("XMPP service contact addresses create serverinfo form", XmppServiceContactAddressesCreateServerInfoForm),
    ("XMPP in-band registration serializes requests", XmppInBandRegistrationSerializesRequests),
    ("XMPP in-band registration serializes data form request", XmppInBandRegistrationSerializesDataFormRequest),
    ("XMPP in-band registration parses info result", XmppInBandRegistrationParsesInfoResult),
    ("XMPP stream features parse in-band registration", XmppStreamFeaturesParseInBandRegistration),
    ("XMPP stream client requests registration info", XmppStreamClientRequestsRegistrationInfo),
    ("XMPP entity capabilities creates deterministic verification", XmppEntityCapabilitiesCreatesDeterministicVerification),
    ("XMPP presence serializes and parses capabilities", XmppPresenceSerializesAndParsesCapabilities),
    ("XMPP alternative connection discovery creates host-meta URI", XmppAlternativeConnectionDiscoveryCreatesHostMetaUri),
    ("XMPP alternative connection discovery parses XML and JSON", XmppAlternativeConnectionDiscoveryParsesXmlAndJson),
    ("XMPP me command preserves protocol body", XmppMeCommandPreservesProtocolBody),
    ("XMPP vCard temp serializes get and set", XmppVCardTempSerializesGetAndSet),
    ("XMPP vCard temp parses result", XmppVCardTempParsesResult),
    ("XMPP vCard avatar serializes presence update", XmppVCardAvatarSerializesPresenceUpdate),
    ("XMPP vCard avatar converts legacy photo", XmppVCardAvatarConvertsLegacyPhoto),
    ("XMPP stream client publishes vCard avatar", XmppStreamClientPublishesVCardAvatar),
    ("XMPP user location serializes and parses", XmppUserLocationSerializesAndParses),
    ("XMPP user location detects server support", XmppUserLocationDetectsServerSupport),
    ("XMPP user location handles PEP notifications", XmppUserLocationHandlesPepNotifications),
    ("XMPP stream client handles user location requests", XmppStreamClientHandlesUserLocationRequests),
    ("XMPP emergency location exports PIDF-LO", XmppEmergencyLocationExportsPidfLo),
    ("XMPP Jingle user location serializes and parses", XmppJingleUserLocationSerializesAndParses),
    ("XMPP Jingle user location creates session-info updates", XmppJingleUserLocationCreatesSessionInfoUpdates),
    ("XMPP user avatar serializes data and metadata", XmppUserAvatarSerializesDataAndMetadata),
    ("XMPP user avatar parses data and metadata", XmppUserAvatarParsesDataAndMetadata),
    ("XMPP user avatar handles metadata notifications and disable", XmppUserAvatarHandlesMetadataNotificationsAndDisable),
    ("XMPP personal eventing serializes requests", XmppPersonalEventingSerializesRequests),
    ("XMPP personal eventing parses notifications", XmppPersonalEventingParsesNotifications),
    ("XMPP PubSub serializes subscription requests", XmppPubSubSerializesSubscriptionRequests),
    ("XMPP announcements serialize and parse Atom entries", XmppAnnouncementsSerializeAndParseAtomEntries),
    ("XMPP private XML storage serializes and parses", XmppPrivateXmlStorageSerializesAndParses),
    ("XMPP persistent private data serializes and parses", XmppPersistentPrivateDataSerializesAndParses),
    ("XMPP conference bookmarks serialize and parse", XmppConferenceBookmarksSerializeAndParse),
    ("XMPP conference bookmarks parse notifications", XmppConferenceBookmarksParseNotifications),
    ("XMPP push notifications serialize enable and disable", XmppPushNotificationsSerializeEnableAndDisable),
    ("XMPP chat state serializes and parses", XmppChatStateSerializesAndParses),
    ("XMPP delivery receipt request serializes and parses", XmppDeliveryReceiptRequestSerializesAndParses),
    ("XMPP delivery receipt received serializes and parses", XmppDeliveryReceiptReceivedSerializesAndParses),
    ("XMPP message carbons enable serializes IQ", XmppMessageCarbonsEnableSerializesIq),
    ("XMPP message carbons parse forwarded received", XmppMessageCarbonsParseForwardedReceived),
    ("XMPP blocking command serializes and parses block list", XmppBlockingCommandSerializesAndParsesBlockList),
    ("XMPP blocking command parses pushes", XmppBlockingCommandParsesPushes),
    ("XMPP incoming stanza exposes carbon", XmppIncomingStanzaExposesCarbon),
    ("XMPP message archive query serializes paging", XmppMessageArchiveQuerySerializesPaging),
    ("XMPP message archive parses forwarded result", XmppMessageArchiveParsesForwardedResult),
    ("XMPP message archive parses forwarded MUC result", XmppMessageArchiveParsesForwardedMucResult),
    ("XMPP message archive parses fin result set", XmppMessageArchiveParsesFinResultSet),
    ("XMPP multi-user chat serializes join and group message", XmppMultiUserChatSerializesJoinAndGroupMessage),
    ("XMPP multi-user chat serializes message correction", XmppMultiUserChatSerializesMessageCorrection),
    ("XMPP multi-user chat handles moderated retraction", XmppMultiUserChatHandlesModeratedRetraction),
    ("XMPP multi-user chat discovers rooms and items", XmppMultiUserChatDiscoversRoomsAndItems),
    ("XMPP multi-user chat handles configuration forms", XmppMultiUserChatHandlesConfigurationForms),
    ("XMPP multi-user chat handles admin items", XmppMultiUserChatHandlesAdminItems),
    ("XMPP MUC self-ping serializes and classifies", XmppMucSelfPingSerializesAndClassifies),
    ("XMPP HTTP file upload serializes request and parses slot", XmppHttpFileUploadSerializesRequestAndParsesSlot),
    ("XMPP HTTP file upload only allows loopback HTTP", XmppHttpFileUploadOnlyAllowsLoopbackHttp),
    ("XMPP HTTP file upload discovers max file size", XmppHttpFileUploadDiscoversMaxFileSize),
    ("XMPP HTTP file upload handles purpose and retry details", XmppHttpFileUploadHandlesPurposeAndRetryDetails),
    ("XMPP HTTP file upload executes PUT", XmppHttpFileUploadExecutesPut),
    ("XMPP HTTP file upload creates message attachment", XmppHttpFileUploadCreatesMessageAttachment),
    ("XMPP stateless inline media sharing serializes and parses", XmppStatelessInlineMediaSharingSerializesAndParses),
    ("XMPP stateless inline media sharing creates upload message", XmppStatelessInlineMediaSharingCreatesUploadMessage),
    ("XMPP stateless inline media sharing exposes discovery and hash", XmppStatelessInlineMediaSharingExposesDiscoveryAndHash),
    ("XMPP public channel search serializes and parses", XmppPublicChannelSearchSerializesAndParses),
    ("XMPP stream client handles public channel search", XmppStreamClientHandlesPublicChannelSearch),
    ("XMPP incoming stanza exposes stateless inline media", XmppIncomingStanzaExposesStatelessInlineMedia),
    ("XMPP SOCKS5 bytestreams serializes requests", XmppSocks5BytestreamsSerializesRequests),
    ("XMPP SOCKS5 bytestreams computes destination address", XmppSocks5BytestreamsComputesDestinationAddress),
    ("XMPP SOCKS5 bytestreams opens local streamhost and exchanges bytes", XmppSocks5BytestreamsOpensLocalStreamHostAndExchangesBytes),
    ("XMPP in-band bytestreams serializes open data and close", XmppInBandBytestreamsSerializesOpenDataAndClose),
    ("XMPP Jingle IBB transport serializes fallback offer", XmppJingleIbbTransportSerializesFallbackOffer),
    ("XMPP OMEMO serializes encrypted message and parses devices", XmppOmemoSerializesEncryptedMessageAndParsesDevices),
    ("XMPP OMEMO parses bundle and current wire message", XmppOmemoParsesBundleAndCurrentWireMessage),
    ("XMPP OMEMO encrypts and decrypts payload", XmppOmemoEncryptsAndDecryptsPayload),
    ("XMPP OMEMO trust store tracks fingerprints", XmppOmemoTrustStoreTracksFingerprints),
    ("XMPP OMEMO session store keeps opaque ratchet state", XmppOmemoSessionStoreKeepsOpaqueRatchetState),
    ("XMPP OMEMO local device publishes bundle and consumes prekeys", XmppOmemoLocalDevicePublishesBundleAndConsumesPreKeys),
    ("XMPP OMEMO encrypted local device file protects private keys", XmppOmemoEncryptedLocalDeviceFileProtectsPrivateKeys),
    ("XMPP OMEMO Windows secret vault protects key-store passphrase", XmppOmemoWindowsSecretVaultProtectsKeyStorePassphrase),
    ("XMPP OMEMO Linux Secret Service vault keeps secrets out of arguments", XmppOmemoLinuxSecretServiceVaultKeepsSecretsOutOfArguments),
    ("XMPP OMEMO secret vault factory selects native provider", XmppOmemoSecretVaultFactorySelectsNativeProvider),
    ("XMPP OMEMO requires production Signal Protocol backend", XmppOmemoRequiresProductionSignalProtocolBackend),
    ("XMPP OMEMO X3DH validates keys and derives secret", XmppOmemoX3DhValidatesKeysAndDerivesSecret),
    ("XMPP OMEMO X3DH agreement matches initiator and responder", XmppOmemoX3DhAgreementMatchesInitiatorAndResponder),
    ("XMPP OMEMO X3DH gates signed pre-key verification", XmppOmemoX3DhGatesSignedPreKeyVerification),
    ("XMPP Jingle serializes session initiate and parse", XmppJingleSerializesSessionInitiateAndParse),
    ("XMPP Jingle message initiation serializes call setup", XmppJingleMessageInitiationSerializesCallSetup),
    ("XMPP Jingle message initiation parses call lifecycle", XmppJingleMessageInitiationParsesCallLifecycle),
    ("XMPP Jingle serializes ICE candidates and DTLS fingerprints", XmppJingleSerializesIceCandidatesAndDtlsFingerprints),
    ("XMPP Jingle serializes transport-info candidates", XmppJingleSerializesTransportInfoCandidates),
    ("XMPP Jingle serializes session-info call states", XmppJingleSerializesSessionInfoCallStates),
    ("XMPP Jingle parses existing client interop fixture", XmppJingleParsesExistingClientInteropFixture),
    ("XMPP Jingle file transfer serializes S5B offer", XmppJingleFileTransferSerializesS5bOffer),
    ("XMPP Jingle file transfer parses received and checksum info", XmppJingleFileTransferParsesReceivedAndChecksumInfo),
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
    False(settings.DirectTls);
    Equal("example.org", settings.TlsServerName);
}

static void XmppDirectTlsCreatesSrvEndpoints()
{
    Equal("_xmpps-client._tcp.xn--bcher-kva.example", XmppDirectTls.CreateDirectTlsSrvName("bücher.example"));
    Equal("_xmpp-client._tcp.example.org", XmppDirectTls.CreateStartTlsSrvName("example.org"));

    var direct = new[]
    {
        new XmppSrvRecord(
            XmppDirectTls.DirectTlsService,
            "xmpps2.example.org.",
            Port: 5223,
            Priority: 20,
            Weight: 10),
        new XmppSrvRecord(
            XmppDirectTls.DirectTlsService,
            "xmpps1.example.org.",
            Port: 5223,
            Priority: 10,
            Weight: 0)
    };
    var startTls = new[]
    {
        new XmppSrvRecord(
            XmppDirectTls.StartTlsService,
            "starttls.example.org.",
            Port: 5222,
            Priority: 10,
            Weight: 20)
    };

    var endpoints = XmppDirectTls.CreateClientEndpoints(direct, startTls);

    Equal(3, endpoints.Count);
    True(endpoints[0].DirectTls);
    Equal("xmpps1.example.org", endpoints[0].Host);
    False(endpoints[1].DirectTls);
    Equal("starttls.example.org", endpoints[1].Host);
    True(endpoints[2].DirectTls);
    Equal(20, endpoints[2].Priority);

    endpoints = XmppDirectTls.CreateClientEndpoints(
        [new XmppSrvRecord(XmppDirectTls.DirectTlsService, ".", 0, 0, 0)],
        [],
        fallbackDomain: "example.org");
    Equal(1, endpoints.Count);
    False(endpoints[0].DirectTls);
    Equal("example.org", endpoints[0].Host);
    Equal(XmppConnectionSettings.ClientPort, endpoints[0].Port);
}

static void XmppDirectTlsDiscoveryQueriesSrvRecords()
{
    var resolver = new FakeSrvResolver();
    resolver.Records[XmppDirectTls.CreateDirectTlsSrvName("example.org")] =
    [
        new XmppSrvRecord(
            XmppDirectTls.DirectTlsService,
            "xmpps.example.org.",
            Port: 5223,
            Priority: 0,
            Weight: 0)
    ];

    var endpoints = XmppDirectTls.DiscoverClientEndpointsAsync(
        "example.org",
        resolver,
        includeStartTlsFallback: false).GetAwaiter().GetResult();

    Equal(2, resolver.Queries.Count);
    Equal("_xmpps-client._tcp.example.org", resolver.Queries[0]);
    Equal("_xmpp-client._tcp.example.org", resolver.Queries[1]);
    Equal(1, endpoints.Count);
    True(endpoints[0].DirectTls);
    Equal("xmpps.example.org", endpoints[0].Host);
}

static void XmppDirectTlsSettingsUseEndpoint()
{
    var endpoint = new XmppClientConnectionEndpoint(
        Host: "xmpps.example.org",
        Port: 5223,
        DirectTls: true,
        Priority: 0,
        Weight: 0,
        Service: XmppDirectTls.DirectTlsService);
    var settings = XmppConnectionSettings.FromEndpoint(
        XmppAddress.Parse("edward@example.org/desktop"),
        endpoint);

    Equal("xmpps.example.org", settings.Host);
    Equal(5223, settings.Port);
    True(settings.RequireTls);
    True(settings.DirectTls);
    Equal("example.org", settings.TlsServerName);
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

static void XmppStreamFeaturesParseClientStateIndication()
{
    var xml = """
        <stream:features xmlns:stream="http://etherx.jabber.org/streams">
          <csi xmlns="urn:xmpp:csi:0"/>
        </stream:features>
        """;

    True(XmppStreamFeatureSet.TryParse(xml, out var features));
    True(features.ClientStateIndicationOffered);

    var active = XmppClientStateIndication.CreateActive();
    var inactive = XmppClientStateIndication.CreateInactive();

    Equal("active", active.Name.LocalName);
    Equal(XmppClientStateIndication.NamespaceName, active.Name.NamespaceName);
    Equal("inactive", inactive.Name.LocalName);
    True(XmppClientStateIndication.TryParse(inactive, out var state));
    Equal(XmppClientState.Inactive, state);
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

static void XmppOAuthClientLoginCreatesBearerAuthElement()
{
    var auth = XmppOAuthClientLogin.CreateAuthElement(
        "token-123",
        "romeo@example.net");

    Equal(XName.Get("auth", "urn:ietf:params:xml:ns:xmpp-sasl"), auth.Name);
    Equal(XmppOAuthClientLogin.Mechanism, (string?)auth.Attribute("mechanism"));

    var decoded = XmppOAuthClientLogin.DecodeInitialResponse(auth.Value);
    Equal("n,a=romeo@example.net,\u0001auth=Bearer token-123\u0001\u0001", decoded);
}

static void XmppOAuthClientLoginParsesDiscoveryChallenge()
{
    var json = """
        {
          "status": "invalid_token",
          "scope": "xmpp:client:normal",
          "openid-configuration": "https://example.net/.well-known/oauth-authorization-server"
        }
        """;
    var challenge = new XElement(
        XName.Get("challenge", "urn:ietf:params:xml:ns:xmpp-sasl"),
        Convert.ToBase64String(Encoding.UTF8.GetBytes(json)));

    True(XmppOAuthClientLogin.TryParseBearerError(challenge, out var error));
    Equal("invalid_token", error!.Status);
    Equal(XmppOAuthClientLogin.ScopeClientNormal, error.Scope);
    Equal("https://example.net/.well-known/oauth-authorization-server", error.OpenIdConfiguration?.AbsoluteUri);
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

static void XmppStreamReaderSkipsXmlDeclaration()
{
    var reader = new XmppStreamReader();
    reader.Append("""
        <?xml version='1.0'?>
        <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
        <stream:features/>
        """);

    var nodes = reader.ReadAvailable();

    Equal(2, nodes.Count);
    Equal(XmppStreamNodeType.StreamOpened, nodes[0].Type);
    Equal(XmppStreamNodeType.Features, nodes[1].Type);
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

static void XmppBoshSerializesSessionAndRestart()
{
    var session = XmppBosh.CreateSessionRequest(
        rid: 1001,
        to: "example.org",
        wait: 60,
        hold: 1,
        language: "nl",
        route: "xmpp:example.org:5222",
        secure: true);
    var sessionXml = session.ToString(SaveOptions.DisableFormatting);

    Equal("body", session.Name.LocalName);
    Equal(XmppBosh.NamespaceName, session.Name.NamespaceName);
    Equal("1001", session.Attribute("rid")?.Value);
    Equal("example.org", session.Attribute("to")?.Value);
    Equal(XmppBosh.ContentType, session.Attribute("content")?.Value);
    Equal("1.6", session.Attribute("ver")?.Value);
    Equal("1.0", session.Attribute(XName.Get("version", XmppBosh.XmppNamespaceName))?.Value);
    Equal("nl", session.Attribute(XNamespace.Xml + "lang")?.Value);
    Equal("xmpp:example.org:5222", session.Attribute("route")?.Value);
    Equal("true", session.Attribute("secure")?.Value);
    True(sessionXml.Contains("urn:xmpp:xbosh", StringComparison.Ordinal));

    var auth = XmppSaslPlain.CreateAuthElement("edward@example.org", "edward", "secret");
    var request = XmppBosh.CreateRequest(1002, "sid-1", [auth]);
    Equal("sid-1", request.Attribute("sid")?.Value);
    Equal("auth", request.Elements().Single().Name.LocalName);

    var restart = XmppBosh.CreateRestartRequest(1003, "sid-1", "en");
    Equal("true", restart.Attribute(XName.Get("restart", XmppBosh.XmppNamespaceName))?.Value);
    Equal("en", restart.Attribute(XNamespace.Xml + "lang")?.Value);
}

static void XmppBoshParsesSessionAndTerminate()
{
    var xml = """
        <body xmlns="http://jabber.org/protocol/httpbind"
              xmlns:xmpp="urn:xmpp:xbosh"
              sid="sid-1"
              authid="auth-1"
              from="example.org"
              wait="60"
              hold="1"
              requests="2"
              inactivity="30"
              polling="5"
              secure="true"
              ver="1.6"
              xmpp:version="1.0">
          <stream:features xmlns:stream="http://etherx.jabber.org/streams">
            <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
              <mechanism>PLAIN</mechanism>
            </mechanisms>
          </stream:features>
        </body>
        """;

    True(XmppBosh.TryParseSessionResponse(XElement.Parse(xml), out var session));
    Equal("sid-1", session!.Sid);
    Equal("example.org", session.From);
    Equal("auth-1", session.AuthId);
    Equal(60, session.Wait);
    Equal(1, session.Hold);
    Equal(2, session.Requests);
    Equal(30, session.Inactivity);
    Equal(5, session.Polling);
    True(session.Secure!.Value);
    Equal("features", session.Payloads.Single().Name.LocalName);

    True(XmppBosh.TryParseBody("""
        <body xmlns="http://jabber.org/protocol/httpbind"
              type="terminate"
              condition="remote-stream-error"
              sid="sid-1"/>
        """, out var terminated));
    True(XmppBosh.IsTerminate(terminated!));
    Equal("remote-stream-error", terminated!.Condition);
}

static void XmppBoshClientLogsInAndLongPolls()
{
    var handler = new SequenceHttpHandler(
        (request, xml) =>
        {
            Equal(HttpMethod.Post, request.Method);
            Equal("text/xml; charset=utf-8", request.Content!.Headers.ContentType!.ToString());
            True(xml.Contains("rid=\"10\"", StringComparison.Ordinal));
            True(xml.Contains("to=\"example.org\"", StringComparison.Ordinal));
            True(xml.Contains("xmpp:version=\"1.0\"", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind" sid="sid-1" authid="auth-1" wait="60" hold="1" requests="2">
                  <stream:features xmlns:stream="http://etherx.jabber.org/streams">
                    <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                      <mechanism>PLAIN</mechanism>
                    </mechanisms>
                  </stream:features>
                </body>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"11\"", StringComparison.Ordinal));
            True(xml.Contains("<auth", StringComparison.Ordinal));
            True(xml.Contains("PLAIN", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind">
                  <success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>
                </body>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"12\"", StringComparison.Ordinal));
            True(xml.Contains("restart=\"true\"", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind">
                  <stream:features xmlns:stream="http://etherx.jabber.org/streams">
                    <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/>
                  </stream:features>
                </body>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"13\"", StringComparison.Ordinal));
            True(xml.Contains("<bind", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind">
                  <iq xmlns="jabber:client" type="result" id="bosh-bind-1">
                    <bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">
                      <jid>edward@example.org/web</jid>
                    </bind>
                  </iq>
                </body>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"14\"", StringComparison.Ordinal));
            True(xml.Contains("disco#info", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind">
                  <iq xmlns="jabber:client" type="result" id="bosh-disco-1">
                    <query xmlns="http://jabber.org/protocol/disco#info">
                      <identity category="server" type="im"/>
                      <feature var="urn:xmpp:rtt:0"/>
                    </query>
                  </iq>
                </body>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"15\"", StringComparison.Ordinal));
            True(xml.Contains("<inactive", StringComparison.Ordinal));
            True(xml.Contains("urn:xmpp:csi:0", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind"/>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"16\"", StringComparison.Ordinal));
            True(xml.Contains("<active", StringComparison.Ordinal));
            True(xml.Contains("urn:xmpp:csi:0", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind"/>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"17\"", StringComparison.Ordinal));
            True(!xml.Contains("<message", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind">
                  <message xmlns="jabber:client" from="anna@example.org/web" to="edward@example.org/web" type="chat">
                    <body>Hoi via BOSH</body>
                  </message>
                </body>
                """);
        },
        (_, xml) =>
        {
            True(xml.Contains("rid=\"18\"", StringComparison.Ordinal));
            True(xml.Contains("type=\"terminate\"", StringComparison.Ordinal));
            return SequenceHttpHandler.XmlResponse("""
                <body xmlns="http://jabber.org/protocol/httpbind" type="terminate" condition="success"/>
                """);
        });
    using var http = new HttpClient(handler);
    var client = new XmppBoshClient(
        new Uri("https://example.org/http-bind"),
        "example.org",
        http,
        language: "nl",
        initialRid: 10);
    try
    {
        var login = client.LoginAsync(
            XmppAddress.Parse("edward@example.org/web"),
            "secret",
            TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
        Equal("edward@example.org/web", login.BoundJid.Full);
        Equal(XmppSaslPlain.Mechanism, login.SaslMechanism);
        True(login.TlsActive);

        var disco = client.SendIqAndWaitAsync(
            XmppServiceDiscovery.CreateInfoRequest("bosh-disco-1", XmppAddress.Parse("example.org")),
            TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
        True(XmppServiceDiscovery.TryParseInfoResult(disco, out var info));
        True(info!.Supports(RttPacket.NamespaceName));

        client.SendInactiveClientStateAsync().GetAwaiter().GetResult();
        client.SendActiveClientStateAsync().GetAwaiter().GetResult();
        var stanza = client.ReadNextStanzaAsync().GetAwaiter().GetResult();
        Equal("Hoi via BOSH", stanza.Message!.Body);

        client.TerminateAsync().GetAwaiter().GetResult();
        Equal(9, handler.Requests.Count);
    }
    finally
    {
        client.DisposeAsync().AsTask().GetAwaiter().GetResult();
    }
}

static void XmppStreamClientConnectsAndReadsFeatures()
{
    RunXmppStreamClientConnectsAndReadsFeaturesAsync(requireTls: false).GetAwaiter().GetResult();
}

static void XmppStreamClientReturnsNegotiationDecision()
{
    RunXmppStreamClientConnectsAndReadsFeaturesAsync(requireTls: true).GetAwaiter().GetResult();
}

static void XmppStreamClientOpensDirectTlsBeforeStream()
{
    RunXmppStreamClientOpensDirectTlsBeforeStreamAsync().GetAwaiter().GetResult();
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

static async Task RunXmppStreamClientOpensDirectTlsBeforeStreamAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();

    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var serverSawOpenStream = false;
    var tlsUpgrader = new FakeTlsStreamUpgrader(() => { });

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];
        var openStream = await ReadTextAsync(serverStream, buffer);
        serverSawOpenStream = openStream.Contains("<stream:stream", StringComparison.Ordinal)
            && openStream.Contains("to=\"example.org\"", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
            </stream:features>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("edward@example.org/desktop"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: true,
            directTls: true);
        var options = new XmppStreamOptions(
            preferredLanguage: "nl",
            resource: "desktop",
            connectTimeout: TimeSpan.FromSeconds(5),
            keepAliveInterval: TimeSpan.FromSeconds(30));

        await using var client = new XmppStreamClient(settings, options, tlsUpgrader);
        var result = await client.ConnectAndPlanAsync();
        True(serverSawOpenStream);
        Equal(XmppStreamNegotiationStep.Authenticate, result.NextStep);
        Equal(1, tlsUpgrader.Options.Count);
        Equal("example.org", tlsUpgrader.Options[0].TargetHost);
        True(tlsUpgrader.Options[0].UseXmppClientAlpn);
        await client.DisconnectAsync();
        await serverTask;
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
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl">
                <mechanism>PLAIN</mechanism>
              </mechanisms>
            </stream:features>
            """);

        var auth = await ReadTextAsync(serverStream, buffer);
        sawAuth = auth.Contains("<auth", StringComparison.Ordinal)
            && auth.Contains("mechanism=\"PLAIN\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, "<success xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"/>");

        var saslRestartedStream = await ReadTextAsync(serverStream, buffer);
        sawSaslRestartedStream = saslRestartedStream.Contains("<stream:stream", StringComparison.Ordinal)
            && saslRestartedStream.Contains("to=\"example.org\"", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
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
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
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

static void XmppStreamClientHandlesBlockingCommands()
{
    RunXmppStreamClientHandlesBlockingCommandsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientHandlesBlockingCommandsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawList = false;
    var sawBlock = false;
    var sawUnblock = false;
    var sawUnblockAll = false;

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

        var list = await ReadTextAsync(serverStream, buffer);
        sawList = list.Contains("type=\"get\"", StringComparison.Ordinal)
            && list.Contains("urn:xmpp:blocking", StringComparison.Ordinal)
            && list.Contains("<blocklist", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="blocklist-1">
              <blocklist xmlns="urn:xmpp:blocking">
                <item jid="spam@example.org"/>
              </blocklist>
            </iq>
            """);

        var block = await ReadTextAsync(serverStream, buffer);
        sawBlock = block.Contains("type=\"set\"", StringComparison.Ordinal)
            && block.Contains("<block", StringComparison.Ordinal)
            && block.Contains("jid=\"anna@example.org\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="block-1"/>
            """);

        var unblock = await ReadTextAsync(serverStream, buffer);
        sawUnblock = unblock.Contains("type=\"set\"", StringComparison.Ordinal)
            && unblock.Contains("<unblock", StringComparison.Ordinal)
            && unblock.Contains("jid=\"anna@example.org\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="unblock-1"/>
            """);

        var unblockAll = await ReadTextAsync(serverStream, buffer);
        sawUnblockAll = unblockAll.Contains("type=\"set\"", StringComparison.Ordinal)
            && unblockAll.Contains("<unblock", StringComparison.Ordinal)
            && !unblockAll.Contains("<item", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="unblock-all-1"/>
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
        var blocked = await client.RequestBlockedUsersAsync(TimeSpan.FromSeconds(5));
        await client.BlockUserAsync(XmppAddress.Parse("anna@example.org"), TimeSpan.FromSeconds(5));
        await client.UnblockUserAsync(XmppAddress.Parse("anna@example.org"), TimeSpan.FromSeconds(5));
        await client.UnblockAllUsersAsync(TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        Equal(1, blocked.Count);
        Equal("spam@example.org", blocked[0].Bare);
        True(sawList);
        True(sawBlock);
        True(sawUnblock);
        True(sawUnblockAll);
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

static void XmppStreamClientRequestsExternalServices()
{
    RunXmppStreamClientRequestsExternalServicesAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientRequestsExternalServicesAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawServicesRequest = false;
    var sawCredentialsRequest = false;

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

        var servicesRequest = await ReadTextAsync(serverStream, buffer);
        sawServicesRequest = servicesRequest.Contains("type=\"get\"", StringComparison.Ordinal)
            && servicesRequest.Contains("urn:xmpp:extdisco:2", StringComparison.Ordinal)
            && servicesRequest.Contains("<services", StringComparison.Ordinal)
            && servicesRequest.Contains("type=\"turn\"", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="extdisco-1">
              <services xmlns="urn:xmpp:extdisco:2" type="turn">
                <service type="turn" host="turn.example.org" port="3478" transport="udp" restricted="true"/>
              </services>
            </iq>
            """);

        var credentialsRequest = await ReadTextAsync(serverStream, buffer);
        sawCredentialsRequest = credentialsRequest.Contains("type=\"get\"", StringComparison.Ordinal)
            && credentialsRequest.Contains("<credentials", StringComparison.Ordinal)
            && credentialsRequest.Contains("turn.example.org", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="extdisco-credentials-1">
              <credentials xmlns="urn:xmpp:extdisco:2">
                <service type="turn" host="turn.example.org" port="3478"
                         transport="udp" username="user" password="secret"/>
              </credentials>
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
        var services = await client.RequestExternalServicesAsync(
            XmppAddress.Parse("example.org"),
            TimeSpan.FromSeconds(5),
            XmppExternalServiceDiscovery.TurnServiceType);
        var credentials = await client.RequestExternalServiceCredentialsAsync(
            XmppAddress.Parse("example.org"),
            new XmppExternalServiceIdentity("turn.example.org", "turn", 3478),
            TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawServicesRequest);
        True(sawCredentialsRequest);
        Equal("turn", services.Type);
        True(services.Services.Single().RequiresCredentials);
        Equal("user", credentials.Services.Single().Username);
        Equal("secret", credentials.Services.Single().Password);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientPublishesPersonalEvents()
{
    RunXmppStreamClientPublishesPersonalEventsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientPublishesPersonalEventsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawPublish = false;
    var sawItems = false;
    var sawRetract = false;

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

        var publish = await ReadTextAsync(serverStream, buffer);
        sawPublish = publish.Contains("id=\"pep-publish-1\"", StringComparison.Ordinal)
            && publish.Contains("node=\"urn:xmpp:mood\"", StringComparison.Ordinal)
            && publish.Contains("<happy", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="pep-publish-1"/>
            """);

        var items = await ReadTextAsync(serverStream, buffer);
        sawItems = items.Contains("id=\"pep-items-1\"", StringComparison.Ordinal)
            && items.Contains("type=\"get\"", StringComparison.Ordinal)
            && items.Contains("max_items=\"1\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="pep-items-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <items node="urn:xmpp:mood">
                  <item id="current">
                    <mood xmlns="http://jabber.org/protocol/mood">
                      <happy/>
                    </mood>
                  </item>
                </items>
              </pubsub>
            </iq>
            """);

        var retract = await ReadTextAsync(serverStream, buffer);
        sawRetract = retract.Contains("id=\"pep-retract-1\"", StringComparison.Ordinal)
            && retract.Contains("notify=\"true\"", StringComparison.Ordinal)
            && retract.Contains("item id=\"current\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="pep-retract-1"/>
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

        var payload = new XElement(
            XName.Get("mood", "http://jabber.org/protocol/mood"),
            new XElement(XName.Get("happy", "http://jabber.org/protocol/mood")));
        await client.PublishPersonalEventAsync("urn:xmpp:mood", "current", payload, TimeSpan.FromSeconds(5));
        var items = await client.RequestPersonalEventItemsAsync(
            "urn:xmpp:mood",
            XmppAddress.Parse("user@example.org"),
            TimeSpan.FromSeconds(5),
            maxItems: 1);
        await client.RetractPersonalEventAsync("urn:xmpp:mood", "current", TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawPublish);
        True(sawItems);
        True(sawRetract);
        Equal("urn:xmpp:mood", items.Node);
        Equal("current", items.Items.Single().Id);
        Equal("mood", items.Items.Single().Payloads.Single().Name.LocalName);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientHandlesPubSubAnnouncements()
{
    RunXmppStreamClientHandlesPubSubAnnouncementsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientHandlesPubSubAnnouncementsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawCreate = false;
    var sawSubscribe = false;
    var sawPublish = false;
    var sawItems = false;

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

        var create = await ReadTextAsync(serverStream, buffer);
        sawCreate = create.Contains("id=\"pubsub-create-1\"", StringComparison.Ordinal)
            && create.Contains("to=\"pubsub.example.org\"", StringComparison.Ordinal)
            && create.Contains("<create", StringComparison.Ordinal)
            && create.Contains(XmppPubSubAnnouncements.DefaultNode, StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="pubsub-create-1"/>
            """);

        var subscribe = await ReadTextAsync(serverStream, buffer);
        sawSubscribe = subscribe.Contains("id=\"pubsub-subscribe-1\"", StringComparison.Ordinal)
            && subscribe.Contains("<subscribe", StringComparison.Ordinal)
            && subscribe.Contains("jid=\"user@example.org/desktop\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="pubsub-subscribe-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <subscription node="urn:tiedragon:teletyptel:announcements" jid="user@example.org/desktop" subscription="subscribed" subid="sub-1"/>
              </pubsub>
            </iq>
            """);

        var publish = await ReadTextAsync(serverStream, buffer);
        sawPublish = publish.Contains("id=\"announcement-publish-1\"", StringComparison.Ordinal)
            && publish.Contains("xmlns=\"http://www.w3.org/2005/Atom\"", StringComparison.Ordinal)
            && publish.Contains("Total Conversation alpha", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="announcement-publish-1"/>
            """);

        var items = await ReadTextAsync(serverStream, buffer);
        sawItems = items.Contains("id=\"announcement-items-1\"", StringComparison.Ordinal)
            && items.Contains("type=\"get\"", StringComparison.Ordinal)
            && items.Contains("max_items=\"2\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="announcement-items-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <items node="urn:tiedragon:teletyptel:announcements">
                  <item id="alpha2">
                    <entry xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
                      <id>alpha2</id>
                      <title>Alpha 2</title>
                      <summary>PubSub announcements are available.</summary>
                      <updated>2026-05-30T12:00:00Z</updated>
                      <category term="release"/>
                      <category scheme="urn:tiedragon:teletyptel:announcement-priority" term="normal"/>
                    </entry>
                  </item>
                </items>
              </pubsub>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var service = XmppAddress.Parse("pubsub.example.org");
        var account = XmppAddress.Parse("user@example.org/desktop");
        var settings = new XmppConnectionSettings(
            account,
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);
        await client.ConnectAndReadFeaturesAsync();

        await client.CreatePubSubNodeAsync(XmppPubSubAnnouncements.DefaultNode, service, TimeSpan.FromSeconds(5));
        var subscription = await client.SubscribePubSubNodeAsync(
            XmppPubSubAnnouncements.DefaultNode,
            service,
            account,
            TimeSpan.FromSeconds(5));
        await client.PublishAnnouncementAsync(
            new XmppAnnouncement(
                Id: "alpha2",
                Title: "Total Conversation alpha",
                Summary: "Live text, audio and video are tested as one conversation.",
                Category: "release",
                Priority: "normal",
                Updated: new DateTimeOffset(2026, 5, 30, 12, 0, 0, TimeSpan.Zero)),
            service,
            TimeSpan.FromSeconds(5));
        var announcements = await client.RequestAnnouncementsAsync(
            service,
            TimeSpan.FromSeconds(5),
            maxItems: 2);
        await client.DisconnectAsync();
        await serverTask;

        True(sawCreate);
        True(sawSubscribe);
        True(sawPublish);
        True(sawItems);
        Equal("subscribed", subscription.State);
        Equal("sub-1", subscription.SubscriptionId);
        Equal("Alpha 2", announcements.Single().Title);
        Equal("release", announcements.Single().Category);
        Equal("normal", announcements.Single().Priority);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientHandlesPrivateXmlStorage()
{
    RunXmppStreamClientHandlesPrivateXmlStorageAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientHandlesPrivateXmlStorageAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawGet = false;
    var sawSet = false;

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

        var get = await ReadTextAsync(serverStream, buffer);
        sawGet = get.Contains("id=\"private-xml-1\"", StringComparison.Ordinal)
            && get.Contains("type=\"get\"", StringComparison.Ordinal)
            && get.Contains("jabber:iq:private", StringComparison.Ordinal)
            && get.Contains("urn:tiedragon:private:test", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="private-xml-1">
              <query xmlns="jabber:iq:private">
                <settings xmlns="urn:tiedragon:private:test">
                  <theme>dark</theme>
                </settings>
              </query>
            </iq>
            """);

        var set = await ReadTextAsync(serverStream, buffer);
        sawSet = set.Contains("id=\"private-xml-set-1\"", StringComparison.Ordinal)
            && set.Contains("type=\"set\"", StringComparison.Ordinal)
            && set.Contains("<theme", StringComparison.Ordinal)
            && set.Contains(">light<", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="private-xml-set-1"/>
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

        var payloadName = XName.Get("settings", "urn:tiedragon:private:test");
        var payload = await client.RequestPrivateXmlAsync(payloadName, TimeSpan.FromSeconds(5));
        await client.SetPrivateXmlAsync(
            new XElement(
                payloadName,
                new XElement(XName.Get("theme", payloadName.NamespaceName), "light")),
            TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawGet);
        True(sawSet);
        Equal("dark", payload.Element(XName.Get("theme", payloadName.NamespaceName))?.Value);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientHandlesPersistentPrivateData()
{
    RunXmppStreamClientHandlesPersistentPrivateDataAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientHandlesPersistentPrivateDataAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawStore = false;
    var sawItems = false;

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

        var store = await ReadTextAsync(serverStream, buffer);
        sawStore = store.Contains("id=\"private-pubsub-store-1\"", StringComparison.Ordinal)
            && store.Contains("node=\"urn:tiedragon:teletyptel:settings\"", StringComparison.Ordinal)
            && store.Contains("pubsub#persist_items", StringComparison.Ordinal)
            && store.Contains("pubsub#access_model", StringComparison.Ordinal)
            && store.Contains(">whitelist<", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="private-pubsub-store-1"/>
            """);

        var items = await ReadTextAsync(serverStream, buffer);
        sawItems = items.Contains("id=\"private-pubsub-items-1\"", StringComparison.Ordinal)
            && items.Contains("type=\"get\"", StringComparison.Ordinal)
            && items.Contains("item id=\"current\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="private-pubsub-items-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <items node="urn:tiedragon:teletyptel:settings">
                  <item id="current">
                    <settings xmlns="urn:tiedragon:teletyptel:settings">
                      <theme>dark</theme>
                    </settings>
                  </item>
                </items>
              </pubsub>
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

        var payload = new XElement(
            XName.Get("settings", "urn:tiedragon:teletyptel:settings"),
            new XElement(XName.Get("theme", "urn:tiedragon:teletyptel:settings"), "dark"));
        await client.StorePersistentPrivateDataAsync(
            "urn:tiedragon:teletyptel:settings",
            payload,
            TimeSpan.FromSeconds(5),
            itemId: "current");
        var storedItems = await client.RequestPersistentPrivateDataAsync(
            "urn:tiedragon:teletyptel:settings",
            TimeSpan.FromSeconds(5),
            itemId: "current");
        await client.DisconnectAsync();
        await serverTask;

        True(sawStore);
        True(sawItems);
        Equal("current", storedItems.Single().Id);
        Equal("dark", storedItems.Single().Payloads.Single().Element(XName.Get("theme", "urn:tiedragon:teletyptel:settings"))?.Value);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppStreamClientHandlesUserAvatarRequests()
{
    RunXmppStreamClientHandlesUserAvatarRequestsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientHandlesUserAvatarRequestsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawDataPublish = false;
    var sawMetadataPublish = false;
    var sawMetadataRequest = false;
    var sawDataRequest = false;
    const string avatarId = "a9993e364706816aba3e25717850c26c9cd0d89d";

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

        var dataPublish = await ReadTextAsync(serverStream, buffer);
        sawDataPublish = dataPublish.Contains("node=\"urn:xmpp:avatar:data\"", StringComparison.Ordinal)
            && dataPublish.Contains("item id=\"" + avatarId + "\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="avatar-data-publish-1"/>
            """);

        var metadataPublish = await ReadTextAsync(serverStream, buffer);
        sawMetadataPublish = metadataPublish.Contains("node=\"urn:xmpp:avatar:metadata\"", StringComparison.Ordinal)
            && metadataPublish.Contains("type=\"image/png\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="avatar-metadata-publish-1"/>
            """);

        var metadataRequest = await ReadTextAsync(serverStream, buffer);
        sawMetadataRequest = metadataRequest.Contains("type=\"get\"", StringComparison.Ordinal)
            && metadataRequest.Contains("node=\"urn:xmpp:avatar:metadata\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, $$"""
            <iq xmlns="jabber:client" type="result" id="avatar-metadata-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <items node="urn:xmpp:avatar:metadata">
                  <item id="{{avatarId}}">
                    <metadata xmlns="urn:xmpp:avatar:metadata">
                      <info bytes="3" id="{{avatarId}}" type="image/png" width="64" height="64"/>
                    </metadata>
                  </item>
                </items>
              </pubsub>
            </iq>
            """);

        var dataRequest = await ReadTextAsync(serverStream, buffer);
        sawDataRequest = dataRequest.Contains("type=\"get\"", StringComparison.Ordinal)
            && dataRequest.Contains("node=\"urn:xmpp:avatar:data\"", StringComparison.Ordinal)
            && dataRequest.Contains("item id=\"" + avatarId + "\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, $$"""
            <iq xmlns="jabber:client" type="result" id="avatar-data-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <items node="urn:xmpp:avatar:data">
                  <item id="{{avatarId}}">
                    <data xmlns="urn:xmpp:avatar:data">YWJj</data>
                  </item>
                </items>
              </pubsub>
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

        var imageData = Encoding.ASCII.GetBytes("abc");
        var publishedId = await client.PublishUserAvatarDataAsync(imageData, TimeSpan.FromSeconds(5));
        await client.PublishUserAvatarMetadataAsync([XmppUserAvatar.CreatePngInfo(imageData, width: 64, height: 64)], TimeSpan.FromSeconds(5));
        var metadata = await client.RequestUserAvatarMetadataAsync(XmppAddress.Parse("user@example.org"), TimeSpan.FromSeconds(5));
        var data = await client.RequestUserAvatarDataAsync(XmppAddress.Parse("user@example.org"), publishedId, TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawDataPublish);
        True(sawMetadataPublish);
        True(sawMetadataRequest);
        True(sawDataRequest);
        Equal(avatarId, publishedId);
        Equal(avatarId, metadata.RequiredPng!.Id);
        Equal("YWJj", data.Base64Data);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppUserLocationSerializesAndParses()
{
    var timestamp = new DateTimeOffset(2026, 5, 29, 16, 30, 0, TimeSpan.Zero);
    var location = new XmppUserLocationData(
        Latitude: 52.0907m,
        Longitude: 5.1214m,
        Accuracy: 8.5m,
        Altitude: 2.1m,
        AltitudeAccuracy: 1.2m,
        Bearing: 123.4m,
        Speed: 0.4m,
        Country: "Nederland",
        CountryCode: "NL",
        Locality: "Utrecht",
        Text: "Bij de balie",
        Timestamp: timestamp,
        TimeZoneOffset: "+02:00",
        Uri: new Uri("geo:52.0907,5.1214"),
        Language: "nl",
        Source: "browser-gps");

    var publish = XmppUserLocation.CreatePublishRequest("location-publish-1", location);
    Equal(XmppIqType.Set, publish.Type);
    var xml = publish.ToXml().ToString(SaveOptions.DisableFormatting);
    True(xml.Contains("node=\"http://jabber.org/protocol/geoloc\"", StringComparison.Ordinal));
    True(xml.Contains("<lat>52.0907</lat>", StringComparison.Ordinal));
    True(xml.Contains("<lon>5.1214</lon>", StringComparison.Ordinal));
    True(xml.Contains("<timestamp>2026-05-29T16:30:00Z</timestamp>", StringComparison.Ordinal));
    True(!xml.Contains("browser-gps", StringComparison.Ordinal));

    True(XmppUserLocation.TryParseElement(publish.Payload!
        .Descendants(XName.Get("geoloc", XmppUserLocation.NamespaceName))
        .Single(), out var parsed));
    Equal((decimal?)52.0907m, parsed!.Latitude);
    Equal((decimal?)5.1214m, parsed.Longitude);
    Equal((decimal?)8.5m, parsed.Accuracy);
    Equal("Utrecht", parsed.Locality);
    Equal("geo:52.0907,5.1214", parsed.Uri!.OriginalString);
    True(!parsed.IsStale(TimeSpan.FromMinutes(5), timestamp.AddMinutes(1)));
    True(parsed.IsStale(TimeSpan.FromMinutes(5), timestamp.AddMinutes(10)));

    Throws<ArgumentOutOfRangeException>(() =>
        XmppUserLocation.CreateElement(new XmppUserLocationData(Latitude: 91m, Longitude: 5m)));
}

static void XmppUserLocationDetectsServerSupport()
{
    var supported = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [new XmppServiceIdentity("pubsub", "pep")],
        Features:
        [
            XmppPersonalEventing.PublishFeature,
            XmppPersonalEventing.AutoCreateFeature,
            XmppPersonalEventing.RetrieveItemsFeature,
            XmppUserLocation.NotificationFeature
        ]);

    var support = XmppUserLocation.EvaluateSupport(supported);
    True(support.CanPublish);
    True(support.CanRetrieve);
    True(support.CanNotify);
    True(XmppUserLocation.SupportsPublishing(supported));
    True(XmppUserLocation.SupportsRetrieval(supported));
    True(XmppUserLocation.SupportsNotifications(supported));

    var noPepServer = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [new XmppServiceIdentity("server", "im")],
        Features:
        [
            XmppPersonalEventing.PublishFeature,
            XmppPersonalEventing.AutoCreateFeature,
            XmppPersonalEventing.RetrieveItemsFeature
        ]);

    var noPepSupport = XmppUserLocation.EvaluateSupport(noPepServer);
    True(!noPepSupport.CanPublish);
    True(!noPepSupport.CanRetrieve);
    True(!noPepSupport.CanNotify);

    var noAutoCreate = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [new XmppServiceIdentity("pubsub", "pep")],
        Features: [XmppPersonalEventing.PublishFeature]);

    True(!XmppUserLocation.SupportsPublishing(noAutoCreate));
}

static void XmppUserLocationHandlesPepNotifications()
{
    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="location-items-1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="http://jabber.org/protocol/geoloc">
              <item id="current">
                <geoloc xmlns="http://jabber.org/protocol/geoloc">
                  <lat>52.0907</lat>
                  <lon>5.1214</lon>
                  <accuracy>7</accuracy>
                  <timestamp>2026-05-29T16:30:00Z</timestamp>
                  <text>Utrecht testlocatie</text>
                </geoloc>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var iq));
    True(XmppUserLocation.TryParseItemsResult(iq!, out var location));
    Equal("Utrecht testlocatie", location!.Text);
    Equal((decimal?)7m, location.Accuracy);

    var message = XElement.Parse("""
        <message xmlns="jabber:client" type="headline" from="edward@example.org" to="tester@example.org/desktop">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="http://jabber.org/protocol/geoloc">
              <item id="current">
                <geoloc xmlns="http://jabber.org/protocol/geoloc">
                  <lat>52.0907</lat>
                  <lon>5.1214</lon>
                </geoloc>
              </item>
            </items>
          </event>
        </message>
        """);
    True(XmppUserLocation.TryParseNotification(message, out var notification));
    Equal("edward@example.org", notification!.From!.Bare);
    Equal("current", notification.ItemId);
    True(notification.Location!.HasCoordinates);

    var clear = XmppUserLocation.CreateClearPublishRequest("location-clear-1");
    True(clear.ToXml().ToString(SaveOptions.DisableFormatting)
        .Contains("<geoloc xmlns=\"http://jabber.org/protocol/geoloc\" />", StringComparison.Ordinal));

    var retractMessage = XElement.Parse("""
        <message xmlns="jabber:client" type="headline" from="edward@example.org">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="http://jabber.org/protocol/geoloc">
              <retract id="current"/>
            </items>
          </event>
        </message>
        """);
    True(XmppUserLocation.TryParseNotification(retractMessage, out var retracted));
    True(retracted!.IsCleared);
}

static void XmppStreamClientHandlesUserLocationRequests()
{
    RunXmppStreamClientHandlesUserLocationRequestsAsync().GetAwaiter().GetResult();
}

static void XmppEmergencyLocationExportsPidfLo()
{
    var location = new XmppUserLocationData(
        Latitude: 52.0907m,
        Longitude: 5.1214m,
        Accuracy: 12.5m,
        Text: "112 accessibility test location",
        Timestamp: new DateTimeOffset(2026, 5, 29, 17, 0, 0, TimeSpan.Zero),
        Source: "browser-geolocation");
    var xml = XmppEmergencyLocation.CreatePidfLoXml(
        "pres:user@example.org",
        location,
        new XmppEmergencyLocationOptions
        {
            RetentionExpiry = new DateTimeOffset(2026, 5, 29, 18, 0, 0, TimeSpan.Zero)
        });

    True(xml.Contains("urn:ietf:params:xml:ns:pidf", StringComparison.Ordinal));
    True(xml.Contains("urn:ietf:params:xml:ns:pidf:geopriv10", StringComparison.Ordinal));
    True(xml.Contains("http://www.opengis.net/gml", StringComparison.Ordinal));
    True(xml.Contains("52.0907 5.1214", StringComparison.Ordinal));
    True(xml.Contains("12.5", StringComparison.Ordinal));
    True(xml.Contains("2026-05-29T17:00:00Z", StringComparison.Ordinal));
    True(!xml.Contains("browser-geolocation", StringComparison.Ordinal));

    Throws<ArgumentException>(() =>
        XmppEmergencyLocation.CreatePidfLoXml("pres:user@example.org", new XmppUserLocationData(Text: "no coordinates")));
}

static void XmppJingleUserLocationSerializesAndParses()
{
    var location = new XmppUserLocationData(
        Latitude: 52.0907m,
        Longitude: 5.1214m,
        Accuracy: 6.5m,
        Altitude: 3.2m,
        Text: "Call location consent test",
        Timestamp: new DateTimeOffset(2026, 5, 31, 9, 15, 0, TimeSpan.Zero),
        Source: "browser-gps");
    var content = XmppJingleUserLocation.CreateLocationContent(location);
    var iq = XmppJingle.CreateSessionInitiate(
        "jingle-location-1",
        XmppAddress.Parse("tester@example.org/web"),
        "sid-location-1",
        "initiator",
        [content],
        initiator: "edward@example.org/browser");
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains(XmppJingleUserLocation.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains(XmppUserLocation.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains("<lat>52.0907</lat>", StringComparison.Ordinal));
    True(xml.Contains("<lon>5.1214</lon>", StringComparison.Ordinal));
    True(!xml.Contains("browser-gps", StringComparison.Ordinal));

    True(XmppJingle.TryParse(iq, out var session));
    Equal("session-initiate", session!.Action);
    var parsedContent = session.Contents.Single();
    True(XmppJingleUserLocation.TryParseLocation(parsedContent, out var parsedLocation));
    Equal((decimal?)52.0907m, parsedLocation!.Latitude);
    Equal((decimal?)5.1214m, parsedLocation.Longitude);
    Equal((decimal?)6.5m, parsedLocation.Accuracy);

    var info = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [],
        Features: [XmppJingleUserLocation.NamespaceName]);
    True(XmppJingleUserLocation.SupportsJingleUserLocation(info));
}

static void XmppJingleUserLocationCreatesSessionInfoUpdates()
{
    var location = new XmppUserLocationData(
        Latitude: 52.0907m,
        Longitude: 5.1214m,
        Accuracy: 4m,
        Text: "Live call GPS",
        Timestamp: new DateTimeOffset(2026, 5, 31, 9, 20, 0, TimeSpan.Zero));
    var updateIq = XmppJingleUserLocation.CreateLocationUpdate(
        "jingle-location-update-1",
        XmppAddress.Parse("tester@example.org/web"),
        "sid-location-1",
        location,
        creator: "initiator",
        contentName: "location",
        initiator: "edward@example.org/browser",
        responder: "tester@example.org/web");
    var updateXml = updateIq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(updateXml.Contains("action=\"session-info\"", StringComparison.Ordinal));
    True(updateXml.Contains("<location", StringComparison.Ordinal));
    True(updateXml.Contains("<accuracy>4</accuracy>", StringComparison.Ordinal));
    True(XmppJingle.TryParse(updateIq, out var updateSession));
    True(XmppJingleUserLocation.TryParseSessionInfo(updateSession!.SessionInfo, out var update));
    True(update!.IsSharing);
    Equal("initiator", update.Creator);
    Equal("location", update.ContentName);
    Equal("Live call GPS", update.Location!.Text);

    var stopIq = XmppJingleUserLocation.CreateLocationStop(
        "jingle-location-stop-1",
        XmppAddress.Parse("tester@example.org/web"),
        "sid-location-1",
        creator: "initiator",
        contentName: "location");

    True(XmppJingle.TryParse(stopIq, out var stopSession));
    True(XmppJingleUserLocation.TryParseSessionInfo(stopSession!.SessionInfo, out var stop));
    True(!stop!.IsSharing);
    Equal("location", stop.ContentName);
    True(stop.Location is null);
}

static async Task RunXmppStreamClientHandlesUserLocationRequestsAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawPublish = false;
    var sawRequest = false;
    var sawClear = false;

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

        var publish = await ReadTextAsync(serverStream, buffer);
        sawPublish = publish.Contains("id=\"location-publish-1\"", StringComparison.Ordinal)
            && publish.Contains("node=\"http://jabber.org/protocol/geoloc\"", StringComparison.Ordinal)
            && publish.Contains("<lat", StringComparison.Ordinal)
            && publish.Contains("<lon", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="location-publish-1"/>
            """);

        var request = await ReadTextAsync(serverStream, buffer);
        sawRequest = request.Contains("id=\"location-items-1\"", StringComparison.Ordinal)
            && request.Contains("type=\"get\"", StringComparison.Ordinal)
            && request.Contains("max_items=\"1\"", StringComparison.Ordinal)
            && request.Contains("node=\"http://jabber.org/protocol/geoloc\"", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="location-items-1">
              <pubsub xmlns="http://jabber.org/protocol/pubsub">
                <items node="http://jabber.org/protocol/geoloc">
                  <item id="current">
                    <geoloc xmlns="http://jabber.org/protocol/geoloc">
                      <lat>52.0907</lat>
                      <lon>5.1214</lon>
                      <accuracy>8</accuracy>
                    </geoloc>
                  </item>
                </items>
              </pubsub>
            </iq>
            """);

        var clear = await ReadTextAsync(serverStream, buffer);
        sawClear = clear.Contains("id=\"location-clear-1\"", StringComparison.Ordinal)
            && clear.Contains("node=\"http://jabber.org/protocol/geoloc\"", StringComparison.Ordinal)
            && clear.Contains("<geoloc", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="location-clear-1"/>
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

        await client.PublishUserLocationAsync(
            new XmppUserLocationData(
                Latitude: 52.0907m,
                Longitude: 5.1214m,
                Accuracy: 8m,
                Text: "Explicit test share",
                Timestamp: new DateTimeOffset(2026, 5, 29, 16, 30, 0, TimeSpan.Zero)),
            TimeSpan.FromSeconds(5));
        var location = await client.RequestUserLocationAsync(
            XmppAddress.Parse("user@example.org"),
            TimeSpan.FromSeconds(5));
        await client.ClearUserLocationAsync(TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        True(sawPublish);
        True(sawRequest);
        True(sawClear);
        Equal((decimal?)52.0907m, location!.Latitude);
        Equal((decimal?)5.1214m, location.Longitude);
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

static void XmppStreamClientSendsClientStateIndication()
{
    RunXmppStreamClientSendsClientStateIndicationAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientSendsClientStateIndicationAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawInactive = false;
    var sawActive = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();
        var buffer = new byte[8192];

        await ReadTextAsync(serverStream, buffer);
        await WriteTextAsync(serverStream, """
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.org" version="1.0">
            <stream:features>
              <csi xmlns="urn:xmpp:csi:0"/>
            </stream:features>
            """);

        var clientStateXml = await ReadUntilAsync(serverStream, buffer, text =>
            text.Contains("<inactive", StringComparison.Ordinal)
            && text.Contains("<active", StringComparison.Ordinal));
        sawInactive = clientStateXml.Contains("<inactive", StringComparison.Ordinal)
            && clientStateXml.Contains("urn:xmpp:csi:0", StringComparison.Ordinal);
        sawActive = clientStateXml.Contains("<active", StringComparison.Ordinal)
            && clientStateXml.Contains("urn:xmpp:csi:0", StringComparison.Ordinal);

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
        True(features.ClientStateIndicationOffered);

        await client.SendInactiveClientStateAsync();
        await client.SendActiveClientStateAsync();
        await client.DisconnectAsync();
        await serverTask;

        True(sawInactive);
        True(sawActive);
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

static void XmppStreamClientPreservesMultipleStanzasFromOneRead()
{
    RunXmppStreamClientPreservesMultipleStanzasFromOneReadAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientPreservesMultipleStanzasFromOneReadAsync()
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
            <stream:features/>
            """);

        await WriteTextAsync(serverStream, """
            <message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="user@example.org/desktop" id="batch-1"><body>Een</body></message><message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="user@example.org/desktop" id="batch-2"><body>Twee</body></message>
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

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var first = await client.ReadNextStanzaAsync(timeout.Token);
        var second = await client.ReadNextStanzaAsync(timeout.Token);
        await client.DisconnectAsync();
        await serverTask;

        Equal("Een", first.Message!.Body);
        Equal("Twee", second.Message!.Body);
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

static async Task<string> ReadUntilAsync(Stream stream, byte[] buffer, Func<string, bool> predicate)
{
    var builder = new StringBuilder();
    while (true)
    {
        var count = await stream.ReadAsync(buffer);
        if (count == 0)
        {
            throw new EndOfStreamException("Stream closed before expected text was read.");
        }

        builder.Append(Encoding.UTF8.GetString(buffer, 0, count));
        var text = builder.ToString();
        if (predicate(text))
        {
            return text;
        }
    }
}

static async Task<byte[]> ReadExactBytesAsync(Stream stream, int count)
{
    var buffer = new byte[count];
    var offset = 0;
    while (offset < count)
    {
        var read = await stream.ReadAsync(buffer.AsMemory(offset, count - offset));
        if (read == 0)
        {
            throw new EndOfStreamException("Stream closed before enough bytes were read.");
        }

        offset += read;
    }

    return buffer;
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

static void XmppIncomingStanzaExposesPersonalEvent()
{
    var stanza = XmppIncomingStanza.FromElement(XElement.Parse("""
        <message xmlns="jabber:client" type="headline" from="anna@example.org/home" to="edward@example.org/desktop">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:xmpp:mood">
              <item id="current">
                <mood xmlns="http://jabber.org/protocol/mood">
                  <happy/>
                </mood>
              </item>
            </items>
          </event>
        </message>
        """));

    True(stanza.IsMessage);
    True(stanza.IsPersonalEvent);
    Equal(XmppMessageType.Headline, stanza.PersonalEvent!.Type);
    Equal("anna@example.org", stanza.PersonalEvent.From!.Bare);
    Equal("urn:xmpp:mood", stanza.PersonalEvent.Nodes.Single().Node);
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

static void T140CodecAppliesUtf8TextAndErasures()
{
    var text = T140Codec.ApplyBlock("Helo", T140Codec.EncodeBlock("l"));
    Equal("Helol", text);

    text = T140Codec.ApplyBlock(text, T140Codec.EncodeBlock(T140Codec.CreateBackspaces(2) + "lo\r\nwereld"));
    Equal("Hello\nwereld", text);

    text = T140Codec.ApplyBlock(text, T140Codec.EncodeBlock(" 😄" + T140Codec.Backspace + "!"));
    Equal("Hello\nwereld !", text);
}

static void RtpT140PacketizerSerializesPacket()
{
    var packet = RtpT140Packetizer.CreatePacket(
        "Hoi",
        sequenceNumber: 42,
        timestampMilliseconds: 1234,
        ssrc: 0x11223344,
        marker: true);
    var bytes = packet.ToBytes();
    var parsed = RtpPacket.Parse(bytes);

    Equal((byte)98, parsed.PayloadType);
    Equal((ushort)42, parsed.SequenceNumber);
    Equal(1234u, parsed.Timestamp);
    Equal(0x11223344u, parsed.Ssrc);
    True(parsed.Marker);
    Equal("Hoi", RtpT140Packetizer.ReadText(parsed));
}

static void RtpT140RedundancyPayloadRoundtrips()
{
    var previous = T140Codec.EncodeBlock("He");
    var current = T140Codec.EncodeBlock("llo");
    var payload = RtpT140RedundantPayload.Create(
        RtpT140Packetizer.DefaultTextPayloadType,
        current,
        new RtpT140RedundantBlock(RtpT140Packetizer.DefaultTextPayloadType, 300, previous));

    var parsed = RtpT140RedundantPayload.Parse(payload);

    Equal((byte)98, parsed.PrimaryPayloadType);
    Equal("llo", T140Codec.DecodeBlock(parsed.PrimaryPayload));
    Equal(1, parsed.RedundantBlocks.Count);
    Equal((byte)98, parsed.RedundantBlocks[0].PayloadType);
    Equal((ushort)300, parsed.RedundantBlocks[0].TimestampOffset);
    Equal("He", T140Codec.DecodeBlock(parsed.RedundantBlocks[0].Payload));
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

static void XmppMessageCorrectionSerializesAndParses()
{
    var message = XmppChatMessage.CreateCorrection(
        XmppAddress.Parse("anna@example.org/phone"),
        "Hallo Anna, verbeterd",
        "original-1",
        id: "edit-1");

    var xml = message.ToXml();
    var replace = xml.Element(XName.Get("replace", XmppMessageCorrection.NamespaceName));

    Equal("edit-1", xml.Attribute("id")?.Value);
    Equal("Hallo Anna, verbeterd", xml.Element(xml.Name.Namespace + "body")?.Value);
    Equal("original-1", replace?.Attribute("id")?.Value);
    True(XmppMessageCorrection.TryGetReplaceId(xml, out var replaceId));
    Equal("original-1", replaceId);

    True(XmppChatMessage.TryParse(xml, out var parsed));
    Equal("Hallo Anna, verbeterd", parsed!.Body);
    Equal("original-1", parsed.ReplaceId);
}

static void XmppIncomingStanzaExposesMessageCorrection()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" from="anna@example.org/phone" to="edward@example.org/desktop" type="chat" id="edit-2">
          <body>Verbeterde tekst</body>
          <replace xmlns="urn:xmpp:message-correct:0" id="original-2"/>
        </message>
        """);

    var stanza = XmppIncomingStanza.FromElement(xml);

    True(stanza.IsMessage);
    Equal("Verbeterde tekst", stanza.Message!.Body);
    Equal("original-2", stanza.Message.ReplaceId);
}

static void XmppMessageStylingSerializesUnstyledMarker()
{
    var message = new XmppChatMessage(
        To: XmppAddress.Parse("anna@example.org/phone"),
        Body: "*letterlijk* _geen stijl_",
        Id: "style-1",
        StylingDisabled: true);

    var xml = message.ToXml();
    var unstyled = xml.Element(XName.Get("unstyled", XmppMessageStyling.NamespaceName));

    True(unstyled is not null);
    True(XmppMessageStyling.IsStylingDisabled(xml));
    True(XmppChatMessage.TryParse(xml, out var parsed));
    True(parsed!.StylingDisabled);
    Equal("*letterlijk* _geen stijl_", parsed.Body);
}

static void XmppMessageStylingParsesInlineSpans()
{
    var spans = XmppMessageStyling.ParseLine("Gewoon *vet* _cursief_ ~door~ `code`");

    Equal(8, spans.Count);
    Equal(XmppMessageStyleKind.Plain, spans[0].Kind);
    Equal("Gewoon ", spans[0].Text);
    Equal(XmppMessageStyleKind.Strong, spans[1].Kind);
    Equal("vet", spans[1].Text);
    Equal(XmppMessageStyleKind.Emphasis, spans[3].Kind);
    Equal("cursief", spans[3].Text);
    Equal(XmppMessageStyleKind.Strikethrough, spans[5].Kind);
    Equal("door", spans[5].Text);
    Equal(XmppMessageStyleKind.Preformatted, spans[7].Kind);
    Equal("code", spans[7].Text);

    var lineBreakSpans = XmppMessageStyling.ParseLine("*niet\nover regels*");
    Equal(1, lineBreakSpans.Count);
    Equal(XmppMessageStyleKind.Plain, lineBreakSpans[0].Kind);
    Equal("*niet\nover regels*", lineBreakSpans[0].Text);
}

static void XmppEmojiMarkupSerializesAndParses()
{
    var hash = new XmppJingleFileHash("sha-256", "emojihash==");
    var message = XmppEmojiMarkup.CreateCustomEmojiMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        "Hoi :teletyptel:",
        [new XmppCustomEmojiSpan(4, 15, "teletyptel", [hash])],
        [
            XmppStatelessInlineMediaSharing.CreateMediaSharingReference(
                new XmppJingleFile(
                    "teletyptel.svg",
                    321,
                    "image/svg+xml",
                    Hashes: [hash]),
                [new Uri("https://cdn.example.org/emoji/teletyptel.svg")])
        ],
        id: "emoji-1",
        from: XmppAddress.Parse("edward@example.org/web"));

    var xml = message.ToString(SaveOptions.DisableFormatting);
    True(xml.Contains(XmppEmojiMarkup.MarkupNamespaceName, StringComparison.Ordinal));
    True(xml.Contains(XmppEmojiMarkup.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains("urn:xmpp:sims:1", StringComparison.Ordinal));
    True(XmppEmojiMarkup.TryParse(message, out var emojis));

    Equal(1, emojis.Count);
    Equal(4, emojis.Single().Start);
    Equal(15, emojis.Single().End);
    Equal("teletyptel", emojis.Single().Name!);
    Equal("sha-256", emojis.Single().Hashes.Single().Algorithm);
    True(XmppStatelessInlineMediaSharing.TryParse(message, out var media));
    True(XmppEmojiMarkup.TryFindInlineMediaForEmoji(emojis.Single(), [media!], out var matched));
    Equal("teletyptel.svg", matched!.File.Name);
}

static void XmppIncomingStanzaExposesCustomEmojiMedia()
{
    var hash = XmppStatelessInlineMediaSharing.CreateSha256Hash(Encoding.UTF8.GetBytes("smile-svg"));
    var message = XmppEmojiMarkup.CreateCustomEmojiMessage(
        XmppAddress.Parse("edward@example.org/web"),
        "Goed :)",
        [new XmppCustomEmojiSpan(5, 7, "smile", [hash])],
        [
            XmppStatelessInlineMediaSharing.CreateMediaSharingReference(
                new XmppJingleFile(
                    "smile.svg",
                    123,
                    "image/svg+xml",
                    Hashes: [hash]),
                [new Uri("https://cdn.example.org/emoji/smile.svg")],
                begin: 5,
                end: 7)
        ]);
    message.SetAttributeValue("from", "anna@example.org/phone");

    var stanza = XmppIncomingStanza.FromElement(message);

    True(stanza.HasCustomEmojis);
    True(stanza.HasInlineMedia);
    True(XmppEmojiMarkup.TryFindInlineMediaForEmoji(stanza.CustomEmojis!.Single(), [stanza.InlineMedia!], out var matched));
    Equal("smile.svg", matched!.File.Name);
}

static void XmppMessageRetractionSerializesAndParses()
{
    var xml = XmppMessageRetraction.CreateRetractMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        "old-message-1",
        id: "retract-1",
        from: XmppAddress.Parse("edward@example.org/web"));

    Equal("message", xml.Name.LocalName);
    Equal("anna@example.org/phone", xml.Attribute("to")?.Value);
    Equal("old-message-1", xml.Element(XName.Get("retract", XmppMessageRetraction.NamespaceName))?.Attribute("id")?.Value);
    True(xml.Element(XName.Get("store", XmppMessageRetraction.MessageHintsNamespaceName)) is not null);
    True(XmppMessageRetraction.TryParseRetract(xml, out var retraction));
    Equal("old-message-1", retraction!.TargetMessageId);
    Equal("retract-1", retraction.RetractionMessageId);

    True(XmppChatMessage.TryParse(xml, out var parsed));
    Equal("old-message-1", parsed!.Retraction!.TargetMessageId);
}

static void XmppIncomingStanzaExposesMessageRetraction()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" type="chat" from="anna@example.org/phone" to="edward@example.org/web" id="retract-2">
          <retract xmlns="urn:xmpp:message-retract:1" id="old-message-2"/>
          <fallback xmlns="urn:xmpp:fallback:0" for="urn:xmpp:message-retract:1"/>
          <body>/me retracted a previous message, but it's unsupported by your client.</body>
          <store xmlns="urn:xmpp:hints"/>
        </message>
        """);

    var stanza = XmppIncomingStanza.FromElement(xml);

    True(stanza.IsMessage);
    True(stanza.IsMessageRetraction);
    Equal("old-message-2", stanza.MessageRetraction!.TargetMessageId);
    Equal("old-message-2", stanza.Message!.Retraction!.TargetMessageId);
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
            <feature var="jabber:iq:private"/>
            <x xmlns="jabber:x:data" type="result">
              <field var="FORM_TYPE" type="hidden">
                <value>urn:xmpp:http:upload:0</value>
              </field>
              <field var="max-file-size">
                <value>5242880</value>
              </field>
            </x>
          </query>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    True(XmppServiceDiscovery.TryParseInfoResult(iq!, out var info));
    Equal("server", info!.Identities.Single().Category);
    Equal("im", info.Identities.Single().Type);
    True(info.Supports("urn:xmpp:rtt:0"));
    True(info.Supports("urn:xmpp:receipts"));
    True(XmppServiceDiscovery.SupportsPrivateXmlStorage(info));
    Equal("urn:xmpp:http:upload:0", info.DataForms.Single().FormType);
    Equal("5242880", info.DataForms.Single().GetFirstValue("max-file-size"));
}

static void XmppServiceDiscoveryChecksRttCapability()
{
    var info = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [],
        Features: [RttPacket.NamespaceName]);

    True(XmppServiceDiscovery.SupportsRealTimeText(info));
}

static void XmppServiceDiscoveryChecksPepCapability()
{
    var info = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [new XmppServiceIdentity("pubsub", "pep")],
        Features:
        [
            XmppPersonalEventing.PublishFeature,
            XmppPersonalEventing.AutoCreateFeature,
            XmppPersonalEventing.RetrieveItemsFeature
        ]);

    True(XmppPersonalEventing.SupportsPersonalEventing(info));
    True(XmppPersonalEventing.SupportsPublishing(info));
    Equal("urn:xmpp:mood+notify", XmppPersonalEventing.CreateNotificationFeature("urn:xmpp:mood"));
}

static void XmppConsistentColorGenerationFollowsXep0392()
{
    Equal(327.255249, Math.Round(XmppConsistentColor.CreateHueAngle("Romeo"), 6));
    Equal(209.410400, Math.Round(XmppConsistentColor.CreateHueAngle("juliet@capulet.lit"), 6));
    Equal(117.575684, Math.Round(XmppConsistentColor.CreateHueAngle("😀"), 6));
    Equal(359.994507, Math.Round(XmppConsistentColor.CreateHueAngle("council"), 6));

    var color = XmppConsistentColor.CreateRgb("Romeo");
    True(color.R >= 0 && color.R <= 255);
    True(color.G >= 0 && color.G <= 255);
    True(color.B >= 0 && color.B <= 255);
    True(XmppConsistentColor.CreateHex("Romeo").StartsWith('#'));
}

static void XmppAdHocCommandSerializesAndParses()
{
    var request = XmppAdHocCommands.CreateExecuteRequest(
        "admin-1",
        XmppAddress.Parse("example.org"),
        XmppServiceAdministration.GetOnlineUsersNumberNode).ToXml();
    var command = request.Elements().Single();

    Equal("set", request.Attribute("type")?.Value);
    Equal("example.org", request.Attribute("to")?.Value);
    Equal("command", command.Name.LocalName);
    Equal(XmppAdHocCommands.NamespaceName, command.Name.NamespaceName);
    Equal("execute", command.Attribute("action")?.Value);
    Equal(XmppServiceAdministration.GetOnlineUsersNumberNode, command.Attribute("node")?.Value);

    True(XmppIq.TryParse($"""
        <iq xmlns="jabber:client" type="result" id="admin-1">
          <command xmlns="{XmppAdHocCommands.NamespaceName}"
                   node="{XmppServiceAdministration.GetOnlineUsersNumberNode}"
                   status="completed">
            <x xmlns="jabber:x:data" type="result">
              <field var="FORM_TYPE" type="hidden">
                <value>{XmppServiceAdministration.NamespaceName}</value>
              </field>
              <field var="onlineusersnum">
                <value>3</value>
              </field>
            </x>
          </command>
        </iq>
        """, out var iq));
    True(XmppAdHocCommands.TryParseCommandResult(iq!, out var result));
    Equal(XmppServiceAdministration.GetOnlineUsersNumberNode, result!.Node);
    True(result.Completed);
    Equal(XmppServiceAdministration.NamespaceName, result.DataForm!.FormType);
    Equal("3", result.DataForm.GetFirstValue(XmppServiceAdministration.OnlineUsersNumberField));

    var advertised = new XmppServiceDiscoveryInfo(null, [], [XmppAdHocCommands.NamespaceName]);
    True(XmppServiceAdministration.SupportsServiceAdministration(advertised));
}

static void XmppServiceAdministrationParsesReadOnlyResults()
{
    True(XmppServiceAdministration.IsReadOnlyCommandNode(XmppServiceAdministration.GetRegisteredUsersListNode));
    False(XmppServiceAdministration.IsReadOnlyCommandNode(XmppServiceAdministration.NamespaceName + "#get-user-password"));

    var request = XmppServiceAdministration.CreateReadOnlyCommandRequest(
        "admin-2",
        XmppAddress.Parse("example.org"),
        XmppServiceAdministration.GetRegisteredUsersListNode).ToXml();
    Equal("set", request.Attribute("type")?.Value);

    True(XmppIq.TryParse($"""
        <iq xmlns="jabber:client" type="result" id="admin-2">
          <command xmlns="{XmppAdHocCommands.NamespaceName}"
                   node="{XmppServiceAdministration.GetRegisteredUsersListNode}"
                   status="completed">
            <x xmlns="jabber:x:data" type="result">
              <field var="FORM_TYPE" type="hidden">
                <value>{XmppServiceAdministration.NamespaceName}</value>
              </field>
              <field var="registereduserjids" type="jid-multi">
                <value>edward@example.org</value>
                <value>tester@example.org</value>
              </field>
            </x>
          </command>
        </iq>
        """, out var iq));
    True(XmppAdHocCommands.TryParseCommandResult(iq!, out var result));

    var jids = XmppServiceAdministration.GetJids(result!, XmppServiceAdministration.RegisteredUserJidsField);
    Equal(2, jids.Count);
    Equal("edward@example.org", jids[0].Bare);
    Equal("tester@example.org", jids[1].Bare);

    True(XmppIq.TryParse($"""
        <iq xmlns="jabber:client" type="result" id="admin-3">
          <command xmlns="{XmppAdHocCommands.NamespaceName}"
                   node="{XmppServiceAdministration.GetIdleUsersNumberNode}"
                   status="completed">
            <x xmlns="jabber:x:data" type="result">
              <field var="FORM_TYPE" type="hidden">
                <value>{XmppServiceAdministration.NamespaceName}</value>
              </field>
              <field var="idleusersnum">
                <value>1</value>
              </field>
            </x>
          </command>
        </iq>
        """, out var countIq));
    True(XmppAdHocCommands.TryParseCommandResult(countIq!, out var countResult));
    True(XmppServiceAdministration.TryGetInteger(countResult!, XmppServiceAdministration.IdleUsersNumberField, out var idleUsers));
    Equal(1, idleUsers);
}

static void XmppExternalServiceDiscoverySerializesAndParsesServices()
{
    var request = XmppExternalServiceDiscovery.CreateServicesRequest(
        "extdisco-1",
        XmppAddress.Parse("example.org"),
        XmppExternalServiceDiscovery.TurnServiceType).ToXml();
    var payload = request.Elements().Single();

    Equal("get", request.Attribute("type")?.Value);
    Equal("example.org", request.Attribute("to")?.Value);
    Equal("services", payload.Name.LocalName);
    Equal(XmppExternalServiceDiscovery.NamespaceName, payload.Name.NamespaceName);
    Equal("turn", payload.Attribute("type")?.Value);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="extdisco-1">
          <services xmlns="urn:xmpp:extdisco:2">
            <service type="stun" host="stun.example.org" port="3478" transport="udp"/>
            <service type="turn" host="turn.example.org" port="5349" transport="tcp"
                     username="u" password="p" restricted="true"
                     expires="2026-05-29T10:00:00Z" name="Example TURN">
              <x xmlns="jabber:x:data" type="result">
                <field var="FORM_TYPE" type="hidden">
                  <value>urn:xmpp:extdisco:2</value>
                </field>
                <field var="region">
                  <value>eu-west</value>
                </field>
              </x>
            </service>
          </services>
        </iq>
        """, out var iq));
    True(XmppExternalServiceDiscovery.TryParseServicesResult(iq!, out var services));
    Equal(2, services!.Services.Count);

    var stun = services.Services[0];
    True(stun.IsStun);
    Equal("stun.example.org", stun.Host);
    Equal(3478, stun.Port);
    Equal("udp", stun.Transport);

    var turn = services.Services[1];
    True(turn.IsTurn);
    Equal("turn.example.org", turn.Host);
    Equal(5349, turn.Port);
    Equal("tcp", turn.Transport);
    Equal("u", turn.Username);
    Equal("p", turn.Password);
    Equal("Example TURN", turn.Name);
    Equal(true, turn.Restricted);
    False(turn.RequiresCredentials);
    Equal(new DateTimeOffset(2026, 5, 29, 10, 0, 0, TimeSpan.Zero), turn.Expires);
    Equal("urn:xmpp:extdisco:2", turn.DataForms!.Single().FormType);
    Equal("eu-west", turn.DataForms!.Single().GetFirstValue("region"));

    var advertised = new XmppServiceDiscoveryInfo(null, [], [XmppExternalServiceDiscovery.NamespaceName]);
    True(XmppExternalServiceDiscovery.SupportsExternalServiceDiscovery(advertised));
}

static void XmppExternalServiceDiscoveryHandlesCredentialsAndPushes()
{
    var credentialsRequest = XmppExternalServiceDiscovery.CreateCredentialsRequest(
        "credentials-1",
        new XmppExternalServiceIdentity("turn.example.org", "turn", 3478),
        XmppAddress.Parse("example.org")).ToXml();
    var service = credentialsRequest.Descendants(XName.Get("service", XmppExternalServiceDiscovery.NamespaceName)).Single();

    Equal("credentials", credentialsRequest.Elements().Single().Name.LocalName);
    Equal("turn.example.org", service.Attribute("host")?.Value);
    Equal("turn", service.Attribute("type")?.Value);
    Equal("3478", service.Attribute("port")?.Value);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="credentials-1">
          <credentials xmlns="urn:xmpp:extdisco:2">
            <service type="turn" host="turn.example.org" port="3478"
                     username="short" password="term" expires="2026-05-29T10:10:00Z"/>
          </credentials>
        </iq>
        """, out var credentialsIq));
    True(XmppExternalServiceDiscovery.TryParseCredentialsResult(credentialsIq!, out var credentials));
    Equal("short", credentials!.Services.Single().Username);
    Equal("term", credentials.Services.Single().Password);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="set" id="push-1" from="example.org" to="user@example.org/web">
          <services xmlns="urn:xmpp:extdisco:2" type="turn">
            <service action="modify" type="turn" host="turn.example.org" restricted="1"/>
            <service action="delete" type="turn" host="old.example.org"/>
          </services>
        </iq>
        """, out var pushIq));
    True(XmppExternalServiceDiscovery.TryParseServicesPush(pushIq!, out var push));
    Equal("turn", push!.Type);
    Equal("modify", push.Services[0].Action);
    True(push.Services[0].RequiresCredentials);
    Equal("delete", push.Services[1].Action);

    var ack = XmppExternalServiceDiscovery.CreateServicesPushAcknowledgement(pushIq!).ToXml();
    Equal("result", ack.Attribute("type")?.Value);
    Equal("push-1", ack.Attribute("id")?.Value);
    Equal("example.org", ack.Attribute("to")?.Value);
}

static void XmppServiceContactAddressesParseServerInfoForm()
{
    var xml = """
        <iq xmlns="jabber:client" type="result" id="serverinfo-1">
          <query xmlns="http://jabber.org/protocol/disco#info">
            <identity category="server" type="im" name="Example XMPP"/>
            <x xmlns="jabber:x:data" type="result">
              <field var="FORM_TYPE" type="hidden">
                <value>http://jabber.org/network/serverinfo</value>
              </field>
              <field var="abuse-addresses">
                <value>mailto:abuse@example.org</value>
                <value>xmpp:abuse@example.org</value>
              </field>
              <field var="admin-addresses">
                <value>mailto:xmpp@example.org</value>
                <value>xmpp:admins@example.org</value>
              </field>
              <field var="feedback-addresses">
                <value>https://example.org/feedback</value>
                <value>xmpp:feedback@example.org</value>
              </field>
              <field var="sales-addresses">
                <value>xmpp:sales@example.org</value>
              </field>
              <field var="security-addresses">
                <value>xmpp:security@example.org</value>
              </field>
              <field var="status-addresses">
                <value>https://status.example.org</value>
              </field>
              <field var="support-addresses">
                <value>https://example.org/support</value>
                <value>xmpp:support@example.org</value>
              </field>
            </x>
          </query>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    True(XmppServiceDiscovery.TryParseInfoResult(iq!, out var info));
    True(XmppServiceContactAddresses.TryGetContactAddresses(info!, out var addresses));

    Equal(11, addresses.Count);
    Equal("mailto:abuse@example.org", addresses[0].Uri.OriginalString);
    Equal(XmppServiceContactAddressKind.Abuse, addresses[0].Kind);
    Equal("xmpp:security@example.org", XmppServiceContactAddresses.GetAddresses(info!, XmppServiceContactAddressKind.Security).Single().OriginalString);
    Equal("https://status.example.org", XmppServiceContactAddresses.GetAddresses(info!, XmppServiceContactAddressKind.Status).Single().OriginalString);
}

static void XmppServiceContactAddressesCreateServerInfoForm()
{
    var form = XmppServiceContactAddresses.CreateDataForm(
    [
        new XmppServiceContactAddress(XmppServiceContactAddressKind.Admin, new Uri("mailto:xmpp@example.org")),
        new XmppServiceContactAddress(XmppServiceContactAddressKind.Security, new Uri("xmpp:security@example.org")),
        new XmppServiceContactAddress(XmppServiceContactAddressKind.Status, new Uri("https://status.example.org"))
    ]);

    var parsed = XmppServiceDiscovery.ParseDataForm(form);

    Equal("result", parsed.Type);
    Equal(XmppServiceContactAddresses.FormType, parsed.FormType);
    Equal("mailto:xmpp@example.org", parsed.GetFirstValue(XmppServiceContactAddresses.AdminField));
    Equal("xmpp:security@example.org", parsed.GetFirstValue(XmppServiceContactAddresses.SecurityField));
    Equal("https://status.example.org", parsed.GetFirstValue(XmppServiceContactAddresses.StatusField));
}

static void XmppInBandRegistrationSerializesRequests()
{
    var to = XmppAddress.Parse("example.org");
    var info = XmppInBandRegistration.CreateInfoRequest("reg-info", to).ToXml();

    Equal("get", info.Attribute("type")?.Value);
    Equal("example.org", info.Attribute("to")?.Value);
    Equal("query", info.Elements().Single().Name.LocalName);
    Equal("jabber:iq:register", info.Elements().Single().Name.NamespaceName);

    var set = XmppInBandRegistration.CreateSimpleRegistrationRequest(
        "reg-1",
        "edward",
        "secret",
        to,
        key: "captcha-key").ToXml();
    var query = set.Elements().Single();

    Equal("set", set.Attribute("type")?.Value);
    Equal("edward", query.Element(XName.Get("username", "jabber:iq:register"))?.Value);
    Equal("secret", query.Element(XName.Get("password", "jabber:iq:register"))?.Value);
    Equal("captcha-key", query.Element(XName.Get("key", "jabber:iq:register"))?.Value);

    var remove = XmppInBandRegistration.CreateRemoveRequest("remove-1", to).ToXml();
    Equal("remove", remove.Descendants(XName.Get("remove", "jabber:iq:register")).Single().Name.LocalName);
}

static void XmppInBandRegistrationSerializesDataFormRequest()
{
    var to = XmppAddress.Parse("example.org");
    var registrationQuery = XElement.Parse("""
        <query xmlns="jabber:iq:register">
          <x xmlns="jabber:x:data" type="form">
            <field var="FORM_TYPE" type="hidden">
              <value>jabber:iq:register</value>
            </field>
            <field var="username" type="text-single">
              <required/>
            </field>
            <field var="password" type="text-private">
              <required/>
            </field>
            <field var="captcha-fallback-text" type="fixed">
              <value>Open the web page.</value>
            </field>
            <field var="challenge" type="hidden">
              <value>challenge-1</value>
            </field>
            <field var="ocr" type="text-single">
              <required/>
            </field>
          </x>
        </query>
        """);

    var request = XmppInBandRegistration.CreateDataFormRegistrationRequest(
        "reg-captcha",
        registrationQuery,
        new Dictionary<string, string>
        {
            ["username"] = "edward",
            ["password"] = "secret",
            ["ocr"] = "abc123"
        },
        to).ToXml();
    var query = request.Elements().Single();
    var form = query.Element(XName.Get("x", "jabber:x:data"))!;

    Equal("set", request.Attribute("type")?.Value);
    Equal("submit", form.Attribute("type")?.Value);
    False(query.Elements(XName.Get("username", "jabber:iq:register")).Any());
    False(query.Elements(XName.Get("password", "jabber:iq:register")).Any());
    Equal("edward", form.Elements(XName.Get("field", "jabber:x:data"))
        .Single(field => field.Attribute("var")?.Value == "username")
        .Element(XName.Get("value", "jabber:x:data"))?.Value);
    Equal("secret", form.Elements(XName.Get("field", "jabber:x:data"))
        .Single(field => field.Attribute("var")?.Value == "password")
        .Element(XName.Get("value", "jabber:x:data"))?.Value);
    Equal("abc123", form.Elements(XName.Get("field", "jabber:x:data"))
        .Single(field => field.Attribute("var")?.Value == "ocr")
        .Element(XName.Get("value", "jabber:x:data"))?.Value);
    Equal("challenge-1", form.Elements(XName.Get("field", "jabber:x:data"))
        .Single(field => field.Attribute("var")?.Value == "challenge")
        .Element(XName.Get("value", "jabber:x:data"))?.Value);
    False(form.Elements(XName.Get("field", "jabber:x:data"))
        .Any(field => field.Attribute("var")?.Value == "captcha-fallback-text"));
}

static void XmppInBandRegistrationParsesInfoResult()
{
    var xml = """
        <iq xmlns="jabber:client" id="reg-info" type="result">
          <query xmlns="jabber:iq:register">
            <instructions>Choose a username and password.</instructions>
            <username/>
            <password/>
            <email/>
            <key>captcha-key</key>
          </query>
        </iq>
        """;

    True(XmppIq.TryParse(xml, out var iq));
    True(XmppInBandRegistration.TryParseInfoResult(iq!, out var info));

    True(info!.Requires("username"));
    True(info.Requires("password"));
    True(info.Requires("email"));
    Equal("Choose a username and password.", info.Instructions);
    Equal("captcha-key", info.Key);
}

static void XmppStreamFeaturesParseInBandRegistration()
{
    var xml = """
        <stream:features xmlns:stream="http://etherx.jabber.org/streams">
          <register xmlns="http://jabber.org/features/iq-register"/>
        </stream:features>
        """;

    True(XmppStreamFeatureSet.TryParse(xml, out var features));
    True(features.InBandRegistrationOffered);
}

static void XmppStreamClientRequestsRegistrationInfo()
{
    RunXmppStreamClientRequestsRegistrationInfoAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientRequestsRegistrationInfoAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawRegistrationInfoRequest = false;

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

        var request = await ReadTextAsync(serverStream, buffer);
        sawRegistrationInfoRequest = request.Contains("type=\"get\"", StringComparison.Ordinal)
            && request.Contains("jabber:iq:register", StringComparison.Ordinal);

        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="register-info-1">
              <query xmlns="jabber:iq:register">
                <instructions>Choose a username.</instructions>
                <username/>
                <password/>
              </query>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("example.org"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);

        await client.ConnectAndReadFeaturesAsync();
        var info = await client.RequestRegistrationInfoAsync(
            XmppAddress.Parse("example.org"),
            TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();

        True(sawRegistrationInfoRequest);
        True(info.Requires("username"));
        True(info.Requires("password"));
    }
    finally
    {
        listener.Stop();
    }

    await serverTask;
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
    Equal("https://example.org/http-bind", XmppAlternativeConnectionDiscovery.BoshUris(xmlMethods).Single().ToString());

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
    Equal("https://chat.example.net/bosh", XmppAlternativeConnectionDiscovery.BoshUris(jsonMethods).Single().ToString());
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

static void XmppVCardAvatarSerializesPresenceUpdate()
{
    var bytes = Encoding.ASCII.GetBytes("abc");
    const string expectedHash = "a9993e364706816aba3e25717850c26c9cd0d89d";
    Equal(expectedHash, XmppVCardAvatar.ComputePhotoHash(bytes));

    var presence = new XmppPresence(VCardAvatarUpdate: XmppVCardAvatarUpdate.FromImageData(bytes));
    var xml = presence.ToXml().ToString(SaveOptions.DisableFormatting);
    True(xml.Contains("vcard-temp:x:update", StringComparison.Ordinal));
    True(xml.Contains(expectedHash, StringComparison.Ordinal));

    True(XmppPresence.TryParse(xml, out var parsed));
    Equal(expectedHash, parsed!.VCardAvatarUpdate!.PhotoHash);

    var disabled = new XmppPresence(VCardAvatarUpdate: XmppVCardAvatarUpdate.Disabled);
    True(XmppPresence.TryParse(disabled.ToXml(), out var disabledParsed));
    True(disabledParsed!.VCardAvatarUpdate!.IsDisabled);
}

static void XmppVCardAvatarConvertsLegacyPhoto()
{
    var bytes = Encoding.ASCII.GetBytes("abc");
    const string expectedHash = "a9993e364706816aba3e25717850c26c9cd0d89d";
    var vCard = XmppVCardAvatar.CreateVCard(bytes, fullName: "Anna Example", nickname: "Anna");

    Equal("Anna Example", vCard.FullName);
    Equal("Anna", vCard.Nickname);
    Equal("image/png", vCard.Photo!.ContentType);
    Equal("YWJj", vCard.Photo.Base64Data);

    True(XmppVCardAvatar.TryCreateUserAvatarData(vCard.Photo, out var data));
    True(XmppVCardAvatar.TryCreateUserAvatarInfo(vCard.Photo, out var info, width: 64, height: 64));
    Equal(expectedHash, data!.Id);
    Equal(expectedHash, info!.Id);
    Equal(3u, info.Bytes);
    Equal((ushort?)64, info.Width);
    Equal((ushort?)64, info.Height);

    var disco = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [],
        Features: [XmppVCardAvatar.PepVCardConversionFeature]);
    True(XmppVCardAvatar.SupportsPepVCardConversion(disco));
}

static void XmppStreamClientPublishesVCardAvatar()
{
    RunXmppStreamClientPublishesVCardAvatarAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientPublishesVCardAvatarAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();
    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var sawVCardSet = false;
    var sawPresenceUpdate = false;
    const string expectedHash = "a9993e364706816aba3e25717850c26c9cd0d89d";

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

        var vCardSet = await ReadTextAsync(serverStream, buffer);
        sawVCardSet = vCardSet.Contains("type=\"set\"", StringComparison.Ordinal)
            && vCardSet.Contains("vcard-temp", StringComparison.Ordinal)
            && vCardSet.Contains("<BINVAL>YWJj</BINVAL>", StringComparison.Ordinal);
        await WriteTextAsync(serverStream, """
            <iq xmlns="jabber:client" type="result" id="vcard-avatar-set-1"/>
            """);

        var presence = await ReadTextAsync(serverStream, buffer);
        sawPresenceUpdate = presence.Contains("vcard-temp:x:update", StringComparison.Ordinal)
            && presence.Contains(expectedHash, StringComparison.Ordinal);

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
        var hash = await client.PublishVCardAvatarAsync(Encoding.ASCII.GetBytes("abc"), TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();
        await serverTask;

        Equal(expectedHash, hash);
        True(sawVCardSet);
        True(sawPresenceUpdate);
    }
    finally
    {
        listener.Stop();
    }
}

static void XmppUserAvatarSerializesDataAndMetadata()
{
    var avatarBytes = Encoding.ASCII.GetBytes("abc");
    const string expectedId = "a9993e364706816aba3e25717850c26c9cd0d89d";
    Equal(expectedId, XmppUserAvatar.ComputeId(avatarBytes));

    var dataPublish = XmppUserAvatar.CreateDataPublish("avatar-data-1", avatarBytes);
    Equal(XmppIqType.Set, dataPublish.Type);
    var dataPublishXml = dataPublish.ToXml().ToString(SaveOptions.DisableFormatting);
    True(dataPublishXml.Contains("node=\"urn:xmpp:avatar:data\"", StringComparison.Ordinal));
    True(dataPublishXml.Contains("item id=\"" + expectedId + "\"", StringComparison.Ordinal));
    Equal("YWJj", dataPublish.Payload!.Descendants(XName.Get("data", XmppUserAvatar.DataNamespaceName)).Single().Value);

    var info = XmppUserAvatar.CreatePngInfo(avatarBytes, width: 64, height: 32);
    var metadataPublish = XmppUserAvatar.CreateMetadataPublish("avatar-metadata-1", [info]);
    Equal(XmppIqType.Set, metadataPublish.Type);
    var metadataPublishXml = metadataPublish.ToXml().ToString(SaveOptions.DisableFormatting);
    True(metadataPublishXml.Contains("node=\"urn:xmpp:avatar:metadata\"", StringComparison.Ordinal));
    True(metadataPublishXml.Contains("type=\"image/png\"", StringComparison.Ordinal));
    True(metadataPublishXml.Contains("bytes=\"3\"", StringComparison.Ordinal));
    True(metadataPublishXml.Contains("height=\"32\"", StringComparison.Ordinal));
    True(metadataPublishXml.Contains("width=\"64\"", StringComparison.Ordinal));

    var request = XmppUserAvatar.CreateDataRequest(
        "avatar-retrieve-1",
        XmppAddress.Parse("anna@example.org"),
        expectedId);
    Equal("anna@example.org", request.To!.Bare);
    True(request.ToXml().ToString(SaveOptions.DisableFormatting).Contains("item id=\"" + expectedId + "\"", StringComparison.Ordinal));
}

static void XmppUserAvatarParsesDataAndMetadata()
{
    const string expectedId = "a9993e364706816aba3e25717850c26c9cd0d89d";

    True(XmppIq.TryParse($$"""
        <iq xmlns="jabber:client" type="result" id="retrieve1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:xmpp:avatar:data">
              <item id="{{expectedId}}">
                <data xmlns="urn:xmpp:avatar:data">
                  YWJj
                </data>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var dataIq));
    True(XmppUserAvatar.TryParseData(dataIq!, out var data));
    Equal(expectedId, data!.Id);
    Equal("YWJj", data.Base64Data);
    Equal("abc", Encoding.ASCII.GetString(data.ToByteArray()));

    True(XmppIq.TryParse($$"""
        <iq xmlns="jabber:client" type="result" id="metadata1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:xmpp:avatar:metadata">
              <item id="{{expectedId}}">
                <metadata xmlns="urn:xmpp:avatar:metadata">
                  <info bytes="3" height="32" id="{{expectedId}}" type="image/png" width="64"/>
                  <info bytes="4" height="16" id="5c77e89bbcfccdf9458c85ccebc91d2045a0528e" type="image/gif" url="https://example.org/avatar.gif" width="16"/>
                </metadata>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var metadataIq));
    True(XmppUserAvatar.TryParseMetadata(metadataIq!, out var metadata));
    Equal(2, metadata!.Infos.Count);
    Equal(expectedId, metadata.RequiredPng!.Id);
    Equal((uint)3, metadata.RequiredPng.Bytes);
    Equal((ushort)64, metadata.RequiredPng.Width);
    Equal((ushort)32, metadata.RequiredPng.Height);
    Equal("https://example.org/avatar.gif", metadata.Infos[1].Url!.AbsoluteUri);
}

static void XmppUserAvatarHandlesMetadataNotificationsAndDisable()
{
    const string expectedId = "a9993e364706816aba3e25717850c26c9cd0d89d";
    var pointer = XmppUserAvatar.CreatePointerElement(
    [
        new XElement(
            XName.Get("x", "https://example.org/avatar-pointer"),
            new XElement(XName.Get("profile", "https://example.org/avatar-pointer"), "edward"))
    ],
        id: expectedId,
        contentType: XmppUserAvatar.RequiredContentType,
        bytes: 3,
        width: 64,
        height: 64);
    var metadata = XmppUserAvatar.CreateMetadataElement(
        [new XmppUserAvatarInfo(expectedId, XmppUserAvatar.RequiredContentType, 3, Width: 64, Height: 64)],
        [pointer]);
    True(metadata.Elements(XName.Get("pointer", XmppUserAvatar.MetadataNamespaceName)).Single()
        .Elements(XName.Get("x", "https://example.org/avatar-pointer"))
        .Any());

    var message = XElement.Parse($$"""
        <message xmlns="jabber:client" to="romeo@example.org/home" from="juliet@example.org">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:xmpp:avatar:metadata">
              <item id="{{expectedId}}">
                <metadata xmlns="urn:xmpp:avatar:metadata">
                  <info bytes="3" height="64" id="{{expectedId}}" type="image/png" width="64"/>
                </metadata>
              </item>
            </items>
          </event>
        </message>
        """);
    True(XmppUserAvatar.TryParseMetadataNotification(message, out var notification));
    Equal(expectedId, notification!.RequiredPng!.Id);

    var disable = XmppUserAvatar.CreateDisableMetadataPublish("avatar-disable-1");
    Equal(XmppIqType.Set, disable.Type);
    True(disable.ToXml().ToString(SaveOptions.DisableFormatting).Contains("<metadata xmlns=\"urn:xmpp:avatar:metadata\" />", StringComparison.Ordinal));

    var disableMessage = XElement.Parse("""
        <message xmlns="jabber:client" to="romeo@example.org/home" from="juliet@example.org">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:xmpp:avatar:metadata">
              <item>
                <metadata xmlns="urn:xmpp:avatar:metadata"/>
              </item>
            </items>
          </event>
        </message>
        """);
    True(XmppUserAvatar.TryParseMetadataNotification(disableMessage, out var disabled));
    True(disabled!.IsDisabled);
}

static void XmppPersonalEventingSerializesRequests()
{
    var payload = new XElement(
        XName.Get("mood", "http://jabber.org/protocol/mood"),
        new XElement(XName.Get("happy", "http://jabber.org/protocol/mood")));

    var publish = XmppPersonalEventing.CreatePublishRequest("pep1", "urn:xmpp:mood", "current", payload);
    var publishXml = publish.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal(XmppIqType.Set, publish.Type);
    True(publish.To is null);
    True(publishXml.Contains("node=\"urn:xmpp:mood\"", StringComparison.Ordinal));
    True(publishXml.Contains("item id=\"current\"", StringComparison.Ordinal));
    True(publishXml.Contains("<happy", StringComparison.Ordinal));

    var items = XmppPersonalEventing.CreateItemsRequest(
        "pep2",
        "urn:xmpp:mood",
        XmppAddress.Parse("anna@example.org"),
        maxItems: 2);
    var itemsXml = items.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal("anna@example.org", items.To!.Bare);
    True(itemsXml.Contains("type=\"get\"", StringComparison.Ordinal));
    True(itemsXml.Contains("max_items=\"2\"", StringComparison.Ordinal));

    var retract = XmppPersonalEventing.CreateRetractRequest("pep3", "urn:xmpp:mood", "current");
    var retractXml = retract.ToXml().ToString(SaveOptions.DisableFormatting);
    True(retractXml.Contains("<retract", StringComparison.Ordinal));
    True(retractXml.Contains("notify=\"true\"", StringComparison.Ordinal));
    True(retractXml.Contains("item id=\"current\"", StringComparison.Ordinal));

    var delete = XmppPersonalEventing.CreateDeleteNodeRequest("pep4", "urn:xmpp:mood");
    Equal(XmppPersonalEventing.PubSubOwnerNamespaceName, delete.Payload!.Name.NamespaceName);
}

static void XmppPersonalEventingParsesNotifications()
{
    var message = XElement.Parse("""
        <message xmlns="jabber:client" type="headline" from="anna@example.org/home" to="edward@example.org/desktop">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:xmpp:mood">
              <item id="current">
                <mood xmlns="http://jabber.org/protocol/mood">
                  <happy/>
                </mood>
              </item>
              <retract id="old"/>
            </items>
            <purge node="urn:xmpp:tune"/>
            <delete node="urn:xmpp:activity"/>
          </event>
        </message>
        """);

    True(XmppPersonalEventing.TryParseNotification(message, out var notification));
    Equal(XmppMessageType.Headline, notification!.Type);
    Equal("anna@example.org", notification.From!.Bare);
    Equal("edward@example.org", notification.To!.Bare);
    Equal(3, notification.Nodes.Count);

    var mood = notification.ForNode("urn:xmpp:mood").Single();
    Equal("current", mood.Items.Single().Id);
    Equal("mood", mood.Items.Single().Payloads.Single().Name.LocalName);
    Equal("old", mood.RetractedItemIds.Single());

    True(notification.ForNode("urn:xmpp:tune").Single().IsPurge);
    True(notification.ForNode("urn:xmpp:activity").Single().IsDelete);
}

static void XmppPubSubSerializesSubscriptionRequests()
{
    var service = XmppAddress.Parse("pubsub.example.org");
    var jid = XmppAddress.Parse("anna@example.org/desktop");
    var configureForm = new XElement(
        XName.Get("x", XmppServiceDiscovery.DataFormNamespace),
        new XAttribute("type", "submit"),
        new XElement(
            XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("var", "FORM_TYPE"),
            new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), XmppPubSub.NodeConfigNamespaceName)),
        new XElement(
            XName.Get("field", XmppServiceDiscovery.DataFormNamespace),
            new XAttribute("var", "pubsub#persist_items"),
            new XElement(XName.Get("value", XmppServiceDiscovery.DataFormNamespace), "true")));

    var subscribe = XmppPubSub.CreateSubscribeRequest(
        "sub1",
        XmppPubSubAnnouncements.DefaultNode,
        jid,
        service);
    var subscribeXml = subscribe.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal(XmppIqType.Set, subscribe.Type);
    Equal("pubsub.example.org", subscribe.To!.Bare);
    True(subscribeXml.Contains("<subscribe", StringComparison.Ordinal));
    True(subscribeXml.Contains("jid=\"anna@example.org/desktop\"", StringComparison.Ordinal));
    True(subscribeXml.Contains(XmppPubSubAnnouncements.DefaultNode, StringComparison.Ordinal));

    var unsubscribe = XmppPubSub.CreateUnsubscribeRequest(
        "unsub1",
        XmppPubSubAnnouncements.DefaultNode,
        jid,
        "subscription-1",
        service);
    var unsubscribeXml = unsubscribe.ToXml().ToString(SaveOptions.DisableFormatting);
    True(unsubscribeXml.Contains("<unsubscribe", StringComparison.Ordinal));
    True(unsubscribeXml.Contains("subid=\"subscription-1\"", StringComparison.Ordinal));

    var create = XmppPubSub.CreateCreateNodeRequest("create1", XmppPubSubAnnouncements.DefaultNode, service);
    var createXml = create.ToXml().ToString(SaveOptions.DisableFormatting);
    True(createXml.Contains("<create", StringComparison.Ordinal));
    True(createXml.Contains("to=\"pubsub.example.org\"", StringComparison.Ordinal));

    var createConfigured = XmppPubSub.CreateCreateNodeRequest(
        "create-configured",
        XmppPubSubAnnouncements.DefaultNode,
        service,
        configureForm);
    var createConfiguredXml = createConfigured.ToXml().ToString(SaveOptions.DisableFormatting);
    True(createConfiguredXml.Contains("<configure", StringComparison.Ordinal));
    True(createConfiguredXml.Contains("pubsub#persist_items", StringComparison.Ordinal));

    var publish = XmppPubSub.CreatePublishRequest(
        "publish1",
        XmppPubSubAnnouncements.DefaultNode,
        "item-1",
        new XElement("payload", "hoi"),
        service);
    var publishXml = publish.ToXml().ToString(SaveOptions.DisableFormatting);
    True(publishXml.Contains("<publish", StringComparison.Ordinal));
    True(publishXml.Contains("item id=\"item-1\"", StringComparison.Ordinal));
    Equal("pubsub.example.org", publish.To!.Bare);

    var retract = XmppPubSub.CreateRetractRequest(
        "retract1",
        XmppPubSubAnnouncements.DefaultNode,
        "item-1",
        service: service);
    var retractXml = retract.ToXml().ToString(SaveOptions.DisableFormatting);
    True(retractXml.Contains("<retract", StringComparison.Ordinal));
    True(retractXml.Contains("notify=\"true\"", StringComparison.Ordinal));

    var configureGet = XmppPubSub.CreateConfigurationRequest("config1", XmppPubSubAnnouncements.DefaultNode, service);
    var configureGetXml = configureGet.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal(XmppIqType.Get, configureGet.Type);
    True(configureGetXml.Contains(XmppPubSub.OwnerNamespaceName, StringComparison.Ordinal));
    True(configureGetXml.Contains("<configure", StringComparison.Ordinal));

    var configureSet = XmppPubSub.CreateConfigureNodeRequest(
        "config-set1",
        XmppPubSubAnnouncements.DefaultNode,
        configureForm,
        service);
    var configureSetXml = configureSet.ToXml().ToString(SaveOptions.DisableFormatting);
    True(configureSetXml.Contains("type=\"submit\"", StringComparison.Ordinal));
    True(configureSetXml.Contains(XmppPubSub.OwnerNamespaceName, StringComparison.Ordinal));

    var purge = XmppPubSub.CreatePurgeNodeRequest("purge1", XmppPubSubAnnouncements.DefaultNode, service);
    var purgeXml = purge.ToXml().ToString(SaveOptions.DisableFormatting);
    True(purgeXml.Contains("<purge", StringComparison.Ordinal));
    True(purgeXml.Contains(XmppPubSub.OwnerNamespaceName, StringComparison.Ordinal));

    var subscriptionsRequest = XmppPubSub.CreateSubscriptionsRequest(
        "subscriptions1",
        XmppPubSubAnnouncements.DefaultNode,
        service);
    var subscriptionsRequestXml = subscriptionsRequest.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal(XmppIqType.Get, subscriptionsRequest.Type);
    True(subscriptionsRequestXml.Contains("<subscriptions", StringComparison.Ordinal));

    var affiliationsRequest = XmppPubSub.CreateAffiliationsRequest(
        "affiliations1",
        XmppPubSubAnnouncements.DefaultNode,
        service);
    var affiliationsRequestXml = affiliationsRequest.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal(XmppIqType.Get, affiliationsRequest.Type);
    True(affiliationsRequestXml.Contains("<affiliations", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="sub1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <subscription node="urn:tiedragon:teletyptel:announcements" jid="anna@example.org/desktop" subscription="subscribed" subid="subscription-1"/>
          </pubsub>
        </iq>
        """, out var result));
    True(XmppPubSub.TryParseSubscriptionResult(result!, out var subscription));
    Equal(XmppPubSubAnnouncements.DefaultNode, subscription!.Node);
    Equal("anna@example.org/desktop", subscription.Jid.Full);
    Equal("subscribed", subscription.State);
    Equal("subscription-1", subscription.SubscriptionId);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="subscriptions1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <subscriptions>
              <subscription node="urn:tiedragon:teletyptel:announcements" jid="anna@example.org/desktop" subscription="subscribed" subid="subscription-1" expiry="never"/>
            </subscriptions>
          </pubsub>
        </iq>
        """, out var subscriptionsResult));
    True(XmppPubSub.TryParseSubscriptionsResult(subscriptionsResult!, out var subscriptions));
    Equal(1, subscriptions.Count);
    Equal("never", subscriptions.Single().Expiry);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="affiliations1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <affiliations>
              <affiliation node="urn:tiedragon:teletyptel:announcements" jid="anna@example.org/desktop" affiliation="owner"/>
            </affiliations>
          </pubsub>
        </iq>
        """, out var affiliationsResult));
    True(XmppPubSub.TryParseAffiliationsResult(affiliationsResult!, out var affiliations));
    Equal(1, affiliations.Count);
    Equal("owner", affiliations.Single().State);
    Equal("anna@example.org/desktop", affiliations.Single().Jid!.Full);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="config1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub#owner">
            <configure node="urn:tiedragon:teletyptel:announcements">
              <x xmlns="jabber:x:data" type="form">
                <field var="FORM_TYPE" type="hidden">
                  <value>http://jabber.org/protocol/pubsub#node_config</value>
                </field>
                <field var="pubsub#persist_items">
                  <value>true</value>
                </field>
              </x>
            </configure>
          </pubsub>
        </iq>
        """, out var configResult));
    True(XmppPubSub.TryParseConfigurationResult(configResult!, out var config));
    Equal("form", config!.Type!);
    Equal("true", config.Fields["pubsub#persist_items"].Single());

    var info = new XmppServiceDiscoveryInfo(
        null,
        [new XmppServiceIdentity("pubsub", "service")],
        [
            XmppPubSub.SubscribeFeature,
            XmppPubSub.CreateNodesFeature,
            XmppPubSub.ConfigureNodesFeature,
            XmppPubSub.PurgeNodesFeature,
            XmppPubSub.RetrieveSubscriptionsFeature,
            XmppPubSub.RetrieveAffiliationsFeature
        ]);
    True(XmppPubSub.SupportsPubSub(info));
    True(info.Supports(XmppPubSub.ConfigureNodesFeature));
}

static void XmppAnnouncementsSerializeAndParseAtomEntries()
{
    var announcement = new XmppAnnouncement(
        Id: "alpha2-total-conversation",
        Title: "Total Conversation alpha",
        Summary: "Live text, audio and video are tested as one conversation.",
        Link: new Uri("https://example.org/teletyptel/news/alpha2"),
        Language: "en",
        Category: "release",
        Priority: "normal",
        Published: new DateTimeOffset(2026, 5, 30, 12, 0, 0, TimeSpan.Zero));

    var publish = XmppPubSubAnnouncements.CreatePublishRequest(
        "announcement-publish",
        announcement,
        service: XmppAddress.Parse("pubsub.example.org"));
    var publishXml = publish.ToXml().ToString(SaveOptions.DisableFormatting);
    Equal("pubsub.example.org", publish.To!.Bare);
    True(publishXml.Contains("item id=\"alpha2-total-conversation\"", StringComparison.Ordinal));
    True(publishXml.Contains("xmlns=\"http://www.w3.org/2005/Atom\"", StringComparison.Ordinal));
    True(publishXml.Contains("xml:lang=\"en\"", StringComparison.Ordinal));
    True(publishXml.Contains("scheme=\"urn:tiedragon:teletyptel:announcement-priority\" term=\"normal\"", StringComparison.Ordinal));

    True(XmppPubSubAnnouncements.TryParseAtomEntry(publish.Payload!.Descendants().Single(element =>
        element.Name == XName.Get("entry", XmppPubSubAnnouncements.AtomNamespaceName)), out var parsed));
    Equal(announcement.Id, parsed!.Id);
    Equal(announcement.Title, parsed.Title);
    Equal(announcement.Summary, parsed.Summary);
    Equal(announcement.Link, parsed.Link);
    Equal(announcement.Category, parsed.Category);
    Equal(announcement.Priority, parsed.Priority);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="announcement-items">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:tiedragon:teletyptel:announcements">
              <item id="alpha2-total-conversation">
                <entry xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
                  <id>alpha2-total-conversation</id>
                  <title>Total Conversation alpha</title>
                  <summary>Live text, audio and video are tested as one conversation.</summary>
                  <updated>2026-05-30T12:00:00Z</updated>
                  <category term="release"/>
                  <category scheme="urn:tiedragon:teletyptel:announcement-priority" term="normal"/>
                </entry>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var iq));
    True(XmppPubSubAnnouncements.TryParseItems(iq!, out var announcements));
    Equal("Total Conversation alpha", announcements.Single().Title);

    var notification = XElement.Parse("""
        <message xmlns="jabber:client" type="headline" from="pubsub.example.org" to="edward@example.org/web">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:tiedragon:teletyptel:announcements">
              <item id="alpha2-total-conversation">
                <entry xmlns="http://www.w3.org/2005/Atom">
                  <id>alpha2-total-conversation</id>
                  <title>Total Conversation alpha</title>
                  <summary>Live text, audio and video are tested as one conversation.</summary>
                  <updated>2026-05-30T12:00:00Z</updated>
                </entry>
              </item>
            </items>
          </event>
        </message>
        """);
    True(XmppPubSubAnnouncements.TryParseNotification(notification, out var pushed));
    Equal("alpha2-total-conversation", pushed.Single().Id);
}

static void XmppPrivateXmlStorageSerializesAndParses()
{
    var settingsName = XName.Get("settings", "urn:tiedragon:private:test");
    var get = XmppPrivateXmlStorage.CreateGetRequest("private-get", settingsName)
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(get.Contains("type=\"get\"", StringComparison.Ordinal));
    True(get.Contains("jabber:iq:private", StringComparison.Ordinal));
    True(get.Contains("settings", StringComparison.Ordinal));
    True(get.Contains("urn:tiedragon:private:test", StringComparison.Ordinal));

    var setPayload = new XElement(
        settingsName,
        new XElement(XName.Get("theme", settingsName.NamespaceName), "dark"),
        new XElement(XName.Get("fontSize", settingsName.NamespaceName), "16"));
    var set = XmppPrivateXmlStorage.CreateSetRequest("private-set", setPayload)
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(set.Contains("type=\"set\"", StringComparison.Ordinal));
    True(set.Contains("<theme", StringComparison.Ordinal));
    True(set.Contains(">dark<", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="private-get">
          <query xmlns="jabber:iq:private">
            <settings xmlns="urn:tiedragon:private:test">
              <theme>dark</theme>
              <fontSize>16</fontSize>
            </settings>
          </query>
        </iq>
        """, out var iq));
    True(XmppPrivateXmlStorage.TryParseResult(iq!, settingsName, out var payload));
    Equal("dark", payload!.Element(XName.Get("theme", settingsName.NamespaceName))?.Value);
    Equal("16", payload.Element(XName.Get("fontSize", settingsName.NamespaceName))?.Value);

    True(XmppPrivateXmlStorage.TryParseResult(iq!, out var payloads));
    Equal(1, payloads!.Count);
    Equal(settingsName, payloads.Single().Name);
}

static void XmppPersistentPrivateDataSerializesAndParses()
{
    const string node = "urn:tiedragon:teletyptel:settings";
    var payloadName = XName.Get("settings", node);
    var payload = new XElement(
        payloadName,
        new XElement(XName.Get("theme", node), "dark"),
        new XElement(XName.Get("language", node), "nl"));
    var store = XmppPersistentPrivateData.CreateStoreRequest(
        "private-store",
        node,
        payload,
        itemId: "current");
    var storeXml = store.ToXml().ToString(SaveOptions.DisableFormatting);

    Equal(XmppIqType.Set, store.Type);
    True(storeXml.Contains("node=\"urn:tiedragon:teletyptel:settings\"", StringComparison.Ordinal));
    True(storeXml.Contains("item id=\"current\"", StringComparison.Ordinal));
    True(storeXml.Contains("pubsub#persist_items", StringComparison.Ordinal));
    True(storeXml.Contains("pubsub#access_model", StringComparison.Ordinal));
    True(storeXml.Contains(">whitelist<", StringComparison.Ordinal));

    var info = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [new XmppServiceIdentity("pubsub", "pep")],
        Features: [XmppPersistentPrivateData.PublishOptionsFeature]);
    True(XmppPersistentPrivateData.SupportsPersistentPrivateData(info));
    Equal(node + "+notify", XmppPersistentPrivateData.CreateNotificationFeature(node));

    var itemsRequest = XmppPersistentPrivateData.CreateItemsRequest(
        "private-items",
        node,
        XmppAddress.Parse("edward@example.org"),
        itemId: "current");
    Equal("edward@example.org", itemsRequest.To!.Bare);
    True(itemsRequest.ToXml().ToString(SaveOptions.DisableFormatting).Contains("item id=\"current\"", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="private-items">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:tiedragon:teletyptel:settings">
              <item id="current">
                <settings xmlns="urn:tiedragon:teletyptel:settings">
                  <theme>dark</theme>
                  <language>nl</language>
                </settings>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var iq));
    True(XmppPersistentPrivateData.TryParseItemsResult(iq!, node, out var items));
    var parsedItems = items!;
    Equal("current", parsedItems.Single().Id);
    Equal("nl", parsedItems.Single().Payloads.Single().Element(XName.Get("language", node))?.Value);

    var trustedMessage = XElement.Parse("""
        <message xmlns="jabber:client" from="edward@example.org/laptop" to="edward@example.org/phone" type="headline">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:tiedragon:teletyptel:settings">
              <item id="current">
                <settings xmlns="urn:tiedragon:teletyptel:settings">
                  <theme>light</theme>
                </settings>
              </item>
            </items>
          </event>
        </message>
        """);
    True(XmppPersistentPrivateData.TryParseNotification(
        trustedMessage,
        XmppAddress.Parse("edward@example.org/phone"),
        node,
        out var notification));
    Equal("edward@example.org", notification!.From!.Bare);
    Equal("light", notification.Items.Single().Payloads.Single().Element(XName.Get("theme", node))?.Value);

    var untrustedMessage = XElement.Parse("""
        <message xmlns="jabber:client" from="mallory@example.net" to="edward@example.org/phone" type="headline">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:tiedragon:teletyptel:settings">
              <item id="current">
                <settings xmlns="urn:tiedragon:teletyptel:settings"/>
              </item>
            </items>
          </event>
        </message>
        """);
    False(XmppPersistentPrivateData.TryParseNotification(
        untrustedMessage,
        XmppAddress.Parse("edward@example.org/phone"),
        node,
        out _));
}

static void XmppConferenceBookmarksSerializeAndParse()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var bookmark = new XmppConferenceBookmark(
        room,
        Name: "Team room",
        AutoJoin: true,
        Nickname: "Edward",
        Extensions:
        [
            new XElement(XName.Get("group", "urn:tiedragon:bookmarks:demo"), "Support")
        ]);

    var publish = XmppBookmarks.CreatePublishConferenceRequest("bm1", bookmark)
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(publish.Contains("node=\"urn:xmpp:bookmarks:1\"", StringComparison.Ordinal));
    True(publish.Contains("item id=\"team@conference.example.org\"", StringComparison.Ordinal));
    True(publish.Contains("<conference", StringComparison.Ordinal));
    True(publish.Contains("xmlns=\"urn:xmpp:bookmarks:1\"", StringComparison.Ordinal));
    True(publish.Contains("pubsub#persist_items", StringComparison.Ordinal));
    True(publish.Contains("pubsub#access_model", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="bm-get">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:xmpp:bookmarks:1">
              <item id="team@conference.example.org">
                <conference xmlns="urn:xmpp:bookmarks:1" name="Team room" autojoin="true">
                  <nick>Edward</nick>
                  <extensions>
                    <group xmlns="urn:tiedragon:bookmarks:demo">Support</group>
                  </extensions>
                </conference>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var bookmarksIq));
    True(XmppBookmarks.TryParseBookmarksResult(bookmarksIq!, out var bookmarks));
    var parsedBookmark = bookmarks!.Single();
    Equal("team@conference.example.org", parsedBookmark.Room.Bare);
    Equal("Team room", parsedBookmark.Name);
    Equal("Edward", parsedBookmark.Nickname);
    True(parsedBookmark.AutoJoin);
    Equal("group", parsedBookmark.Extensions.Single().Name.LocalName);

    var legacySet = XmppBookmarks.CreateLegacyBookmarksSetRequest("legacy-set", [bookmark])
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(legacySet.Contains("jabber:iq:private", StringComparison.Ordinal));
    True(legacySet.Contains("storage:bookmarks", StringComparison.Ordinal));
    True(legacySet.Contains("jid=\"team@conference.example.org\"", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="legacy-get">
          <query xmlns="jabber:iq:private">
            <storage xmlns="storage:bookmarks">
              <conference name="Team room" autojoin="1" jid="team@conference.example.org">
                <nick>Edward</nick>
              </conference>
            </storage>
          </query>
        </iq>
        """, out var legacyIq));
    True(XmppBookmarks.TryParseLegacyBookmarksResult(legacyIq!, out var legacyBookmarks));
    var parsedLegacyBookmark = legacyBookmarks!.Single();
    Equal("team@conference.example.org", parsedLegacyBookmark.Room.Bare);
    True(parsedLegacyBookmark.AutoJoin);
}

static void XmppConferenceBookmarksParseNotifications()
{
    var message = XElement.Parse("""
        <message xmlns="jabber:client" type="headline" from="edward@example.org" to="edward@example.org/desktop">
          <event xmlns="http://jabber.org/protocol/pubsub#event">
            <items node="urn:xmpp:bookmarks:1">
              <item id="team@conference.example.org">
                <conference xmlns="urn:xmpp:bookmarks:1" name="Team room" autojoin="true">
                  <nick>Edward</nick>
                </conference>
              </item>
              <retract id="old@conference.example.org"/>
            </items>
          </event>
        </message>
        """);

    True(XmppBookmarks.TryParseBookmarkNotification(message, out var notification));
    Equal("team@conference.example.org", notification!.Bookmarks.Single().Room.Bare);
    Equal("old@conference.example.org", notification.RetractedRooms.Single().Bare);
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

static void XmppClientAccessManagementSerializesAndParses()
{
    var list = XmppClientAccessManagement.CreateListRequest("cam-list").ToXml();
    Equal("get", list.Attribute("type")?.Value);
    Equal("list", list.Elements().Single().Name.LocalName);
    Equal(XmppClientAccessManagement.NamespaceName, list.Elements().Single().Name.NamespaceName);

    var revoke = XmppClientAccessManagement.CreateRevokeRequest("cam-revoke", "client-1").ToXml();
    Equal("set", revoke.Attribute("type")?.Value);
    Equal("revoke", revoke.Elements().Single().Name.LocalName);
    Equal("client-1", revoke.Elements().Single().Attribute("id")?.Value);

    var clientsElement = XmppClientAccessManagement.CreateClientsElement(
    [
        new XmppClientAccessEntry(
            "client-1",
            XmppClientAccessManagement.ClientTypeSession,
            Connected: true,
            FirstSeen: DateTimeOffset.Parse("2026-06-05T08:00:00Z", CultureInfo.InvariantCulture),
            LastSeen: DateTimeOffset.Parse("2026-06-05T08:10:00Z", CultureInfo.InvariantCulture),
            AuthMethods: ["grant", "fast"],
            PermissionStatus: XmppClientAccessManagement.PermissionNormal,
            Software: "TeleTypTel",
            Uri: new Uri("https://teletyptel.nl/"),
            Device: "Windows laptop")
    ]);
    var iq = new XmppIq(XmppIqType.Result, "cam-list", clientsElement);

    True(XmppClientAccessManagement.TryParseClientsResult(iq, out var clients));
    var client = clients.Single();
    Equal("client-1", client.Id);
    Equal(XmppClientAccessManagement.ClientTypeSession, client.Type);
    True(client.Connected);
    Equal("grant", client.AuthenticationMethods[0]);
    Equal("fast", client.AuthenticationMethods[1]);
    Equal(XmppClientAccessManagement.PermissionNormal, client.PermissionStatus);
    Equal("TeleTypTel", client.Software);
    Equal("https://teletyptel.nl/", client.Uri?.AbsoluteUri);
    Equal("Windows laptop", client.Device);
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

static void XmppBlockingCommandSerializesAndParsesBlockList()
{
    var listXml = XmppBlockingCommand.CreateBlockListRequest("blocklist-1")
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(listXml.Contains("type=\"get\"", StringComparison.Ordinal));
    True(listXml.Contains("<blocklist xmlns=\"urn:xmpp:blocking\" />", StringComparison.Ordinal));

    var blockXml = XmppBlockingCommand.CreateBlockRequest(
            "block-1",
            [XmppAddress.Parse("spam@example.org"), XmppAddress.Parse("bad@example.net/mobile")])
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(blockXml.Contains("<block xmlns=\"urn:xmpp:blocking\">", StringComparison.Ordinal));
    True(blockXml.Contains("jid=\"spam@example.org\"", StringComparison.Ordinal));
    True(blockXml.Contains("jid=\"bad@example.net/mobile\"", StringComparison.Ordinal));

    var unblockAllXml = XmppBlockingCommand.CreateUnblockAllRequest("unblock-all-1")
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(unblockAllXml.Contains("<unblock xmlns=\"urn:xmpp:blocking\" />", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="blocklist-1">
          <blocklist xmlns="urn:xmpp:blocking">
            <item jid="spam@example.org"/>
            <item jid="bad@example.net/mobile"/>
            <item/>
          </blocklist>
        </iq>
        """, out var iq));
    True(XmppBlockingCommand.TryParseBlockListResult(iq!, out var blocked));
    Equal(2, blocked.Count);
    Equal("spam@example.org", blocked[0].Bare);
    Equal("bad@example.net/mobile", blocked[1].Full);
    True(XmppBlockingCommand.SupportsBlocking(new XmppServiceDiscoveryInfo(null, [], [XmppBlockingCommand.NamespaceName])));
}

static void XmppBlockingCommandParsesPushes()
{
    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="set" id="block-push-1" from="example.org" to="user@example.org/desktop">
          <block xmlns="urn:xmpp:blocking">
            <item jid="spam@example.org"/>
          </block>
        </iq>
        """, out var blockIq));
    True(XmppBlockingCommand.TryParsePush(blockIq!, out var blockPush));
    Equal(XmppBlockingAction.Block, blockPush!.Action);
    Equal("spam@example.org", blockPush.Jids.Single().Bare);
    False(blockPush.UnblocksAll);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="set" id="unblock-push-1" from="example.org" to="user@example.org/desktop">
          <unblock xmlns="urn:xmpp:blocking"/>
        </iq>
        """, out var unblockIq));
    True(XmppBlockingCommand.TryParsePush(unblockIq!, out var unblockPush));
    Equal(XmppBlockingAction.Unblock, unblockPush!.Action);
    Equal(0, unblockPush.Jids.Count);
    True(unblockPush.UnblocksAll);

    var ack = XmppBlockingCommand.CreatePushAcknowledgement(
        "block-push-1",
        XmppAddress.Parse("example.org")).ToXml();
    Equal("result", ack.Attribute("type")?.Value);
    Equal("example.org", ack.Attribute("to")?.Value);
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

static void XmppMessageArchiveParsesForwardedMucResult()
{
    var xml = XElement.Parse("""
        <message xmlns="jabber:client" from="team@conference.example.org">
          <result xmlns="urn:xmpp:mam:2" queryid="q-muc" id="muc-archive-1">
            <forwarded xmlns="urn:xmpp:forward:0">
              <delay xmlns="urn:xmpp:delay" stamp="2026-05-30T00:15:00Z"/>
              <message xmlns="jabber:client" type="groupchat" from="team@conference.example.org/Edward" id="muc-message-1">
                <body>Archived group hello</body>
              </message>
            </forwarded>
          </result>
        </message>
        """);

    True(XmppMessageArchive.TryParseGroupResult(xml, out var archived));
    Equal("muc-archive-1", archived!.Id);
    Equal("q-muc", archived.QueryId);
    Equal("Archived group hello", archived.Message.Body);
    Equal("team@conference.example.org", archived.Message.Room!.Bare);
    Equal("Edward", archived.Message.Nickname);
    Equal(DateTimeOffset.Parse("2026-05-30T00:15:00Z"), archived.DelayStamp);
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

static void XmppMultiUserChatSerializesJoinAndGroupMessage()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var join = XmppMultiUserChat.CreateJoinPresence(room, "Edward", historyMaxChars: 0);

    Equal("presence", join.Name.LocalName);
    Equal("team@conference.example.org/Edward", join.Attribute("to")?.Value);
    True(join.ToString(SaveOptions.DisableFormatting).Contains("http://jabber.org/protocol/muc", StringComparison.Ordinal));
    True(join.ToString(SaveOptions.DisableFormatting).Contains("maxchars=\"0\"", StringComparison.Ordinal));

    var leave = XmppMultiUserChat.CreateLeavePresence(room, "Edward");
    Equal("presence", leave.Name.LocalName);
    Equal("unavailable", leave.Attribute("type")?.Value);
    Equal("team@conference.example.org/Edward", leave.Attribute("to")?.Value);

    var group = XmppMultiUserChat.CreateGroupMessage(room, "Hallo groep", "muc-1");
    Equal("groupchat", group.Attribute("type")?.Value);
    Equal("team@conference.example.org", group.Attribute("to")?.Value);

    var incoming = XElement.Parse("""
        <message xmlns="jabber:client" from="team@conference.example.org/Anna" to="edward@example.org/web" type="groupchat" id="m1">
          <body>Hoi</body>
        </message>
        """);
    True(XmppMultiUserChat.TryParseGroupMessage(incoming, out var parsed));
    Equal("team@conference.example.org", parsed!.Room!.Bare);
    Equal("Anna", parsed.Nickname);
    Equal("Hoi", parsed.Body);
}

static void XmppMultiUserChatSerializesMessageCorrection()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var group = XmppMultiUserChat.CreateGroupMessage(
        room,
        "Hallo groep, verbeterd",
        id: "muc-edit-1",
        replaceId: "muc-original-1");
    var replace = group.Element(XName.Get("replace", XmppMessageCorrection.NamespaceName));

    Equal("groupchat", group.Attribute("type")?.Value);
    Equal("muc-edit-1", group.Attribute("id")?.Value);
    Equal("muc-original-1", replace?.Attribute("id")?.Value);

    var incoming = XElement.Parse("""
        <message xmlns="jabber:client" type="groupchat" from="team@conference.example.org/Anna" to="edward@example.org/desktop" id="muc-edit-2">
          <body>Verbeterde groepstekst</body>
          <replace xmlns="urn:xmpp:message-correct:0" id="muc-original-2"/>
        </message>
        """);

    True(XmppMultiUserChat.TryParseGroupMessage(incoming, out var parsed));
    Equal("team@conference.example.org", parsed!.Room!.Bare);
    Equal("Anna", parsed.Nickname);
    Equal("Verbeterde groepstekst", parsed.Body);
    Equal("muc-original-2", parsed.ReplaceId);
}

static void XmppMultiUserChatHandlesModeratedRetraction()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var request = XmppMultiUserChat.CreateModeratedRetractionRequest(
        "moderate-1",
        room,
        "stanza-123",
        "Spam").ToXml();
    var moderate = request.Element(XName.Get("moderate", XmppMessageModeration.NamespaceName));

    Equal("set", request.Attribute("type")?.Value);
    Equal("team@conference.example.org", request.Attribute("to")?.Value);
    Equal("stanza-123", moderate?.Attribute("id")?.Value);
    True(moderate?.Element(XName.Get("retract", XmppMessageRetraction.NamespaceName)) is not null);
    Equal("Spam", moderate?.Element(XName.Get("reason", XmppMessageModeration.NamespaceName))?.Value);

    var incoming = XElement.Parse("""
        <message xmlns="jabber:client" type="groupchat" from="team@conference.example.org" to="edward@example.org/desktop" id="muc-retract-1">
          <retract xmlns="urn:xmpp:message-retract:1" id="stanza-123">
            <moderated xmlns="urn:xmpp:message-moderate:1" by="team@conference.example.org/Edward"/>
            <reason xmlns="urn:xmpp:message-moderate:1">Spam</reason>
          </retract>
        </message>
        """);

    True(XmppMultiUserChat.TryParseGroupMessage(incoming, out var parsed));
    Equal("stanza-123", parsed!.Retraction!.TargetMessageId);
    True(parsed.Retraction.IsModerated);
    Equal("team@conference.example.org/Edward", parsed.Retraction.Moderation!.By!.Full);
    Equal("Spam", parsed.Retraction.Moderation.Reason);

    var tombstone = new XElement(
        XName.Get("message", "jabber:client"),
        new XAttribute("id", "stanza-123"),
        XmppMessageRetraction.CreateTombstone(
            "muc-retract-1",
            new DateTimeOffset(2026, 6, 2, 12, 0, 0, TimeSpan.Zero),
            new XmppModeratedRetraction(XmppAddress.Parse("team@conference.example.org/Edward"), "Spam")));
    True(XmppMessageRetraction.TryParseTombstone(tombstone, out var parsedTombstone));
    Equal("stanza-123", parsedTombstone!.OriginalMessageId);
    Equal("muc-retract-1", parsedTombstone.RetractionMessageId);
    Equal("Spam", parsedTombstone.Moderation!.Reason);
}

static void XmppMultiUserChatDiscoversRoomsAndItems()
{
    var service = XmppAddress.Parse("conference.example.org");
    var room = XmppAddress.Parse("team@conference.example.org");
    var discoveryRequest = XmppMultiUserChat.CreateRoomDiscoveryRequest("muc-rooms-1", service).ToXml();
    Equal("get", discoveryRequest.Attribute("type")?.Value);
    Equal("conference.example.org", discoveryRequest.Attribute("to")?.Value);
    Equal(XmppServiceDiscovery.ItemsNamespace, discoveryRequest.Elements().Single().Name.NamespaceName);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="muc-rooms-1">
          <query xmlns="http://jabber.org/protocol/disco#items">
            <item jid="team@conference.example.org" name="Team room"/>
            <item jid="support@conference.example.org" name="Support"/>
          </query>
        </iq>
        """, out var roomsIq));
    True(XmppMultiUserChat.TryParseRoomDiscoveryResult(roomsIq!, out var rooms));
    Equal(2, rooms!.Count);
    Equal("team@conference.example.org", rooms[0].Jid.Bare);
    Equal("Team room", rooms[0].Name);

    var itemsRequest = XmppMultiUserChat.CreateRoomItemsRequest("muc-items-1", room).ToXml();
    Equal("team@conference.example.org", itemsRequest.Attribute("to")?.Value);
    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="muc-items-1">
          <query xmlns="http://jabber.org/protocol/disco#items">
            <item jid="team@conference.example.org/Edward" name="Edward"/>
            <item jid="team@conference.example.org/Anna" name="Anna"/>
          </query>
        </iq>
        """, out var itemsIq));
    True(XmppMultiUserChat.TryParseRoomItemsResult(itemsIq!, out var items));
    Equal(2, items!.Count);
    Equal("team@conference.example.org/Edward", items[0].Jid!.Full);
}

static void XmppMultiUserChatHandlesConfigurationForms()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var request = XmppMultiUserChat.CreateConfigurationFormRequest("config-1", room).ToXml();
    Equal("get", request.Attribute("type")?.Value);
    Equal("team@conference.example.org", request.Attribute("to")?.Value);
    Equal(XmppMultiUserChat.OwnerNamespaceName, request.Elements().Single().Name.NamespaceName);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="config-1">
          <query xmlns="http://jabber.org/protocol/muc#owner">
            <x xmlns="jabber:x:data" type="form">
              <field var="FORM_TYPE" type="hidden">
                <value>http://jabber.org/protocol/muc#roomconfig</value>
              </field>
              <field var="muc#roomconfig_roomname">
                <value>Team room</value>
              </field>
            </x>
          </query>
        </iq>
        """, out var formIq));
    True(XmppMultiUserChat.TryParseConfigurationForm(formIq!, out var form));
    Equal("form", form!.Type);
    Equal("http://jabber.org/protocol/muc#roomconfig", form.FormType);
    Equal("Team room", form.GetFirstValue("muc#roomconfig_roomname"));

    var submit = XmppMultiUserChat.CreateConfigurationSubmitRequest(
        "config-submit-1",
        room,
        [
            new XmppDataFormSubmitField("FORM_TYPE", ["http://jabber.org/protocol/muc#roomconfig"]),
            new XmppDataFormSubmitField("muc#roomconfig_roomname", ["Team room"])
        ]).ToXml().ToString(SaveOptions.DisableFormatting);
    True(submit.Contains("type=\"submit\"", StringComparison.Ordinal));
    True(submit.Contains("muc#roomconfig_roomname", StringComparison.Ordinal));
    True(submit.Contains("Team room", StringComparison.Ordinal));

    var cancel = XmppMultiUserChat.CreateConfigurationCancelRequest("config-cancel-1", room)
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(cancel.Contains("type=\"cancel\"", StringComparison.Ordinal));
}

static void XmppMultiUserChatHandlesAdminItems()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var memberList = XmppMultiUserChat.CreateAdminListRequest("admin-1", room, affiliation: "member")
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(memberList.Contains("http://jabber.org/protocol/muc#admin", StringComparison.Ordinal));
    True(memberList.Contains("affiliation=\"member\"", StringComparison.Ordinal));

    var ban = XmppMultiUserChat.CreateBanUserRequest(
        "ban-1",
        room,
        XmppAddress.Parse("bad@example.org"),
        "Spam").ToXml().ToString(SaveOptions.DisableFormatting);
    True(ban.Contains("affiliation=\"outcast\"", StringComparison.Ordinal));
    True(ban.Contains("jid=\"bad@example.org\"", StringComparison.Ordinal));
    True(ban.Contains("<reason", StringComparison.Ordinal));

    var kick = XmppMultiUserChat.CreateKickOccupantRequest("kick-1", room, "BadNick", "Spam")
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);
    True(kick.Contains("role=\"none\"", StringComparison.Ordinal));
    True(kick.Contains("nick=\"BadNick\"", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="admin-1">
          <query xmlns="http://jabber.org/protocol/muc#admin">
            <item affiliation="member" jid="anna@example.org" nick="Anna"/>
            <item affiliation="owner" jid="edward@example.org" nick="Edward"/>
          </query>
        </iq>
        """, out var adminIq));
    True(XmppMultiUserChat.TryParseAdminItemsResult(adminIq!, out var items));
    Equal(2, items!.Count);
    Equal("anna@example.org", items[0].Jid!.Bare);
    Equal("member", items[0].Affiliation);
    Equal("Anna", items[0].Nick);
}

static void XmppMucSelfPingSerializesAndClassifies()
{
    var room = XmppAddress.Parse("team@conference.example.org");
    var ping = XmppMucSelfPing.CreatePingRequest(
        "ping-1",
        room,
        "Edward",
        XmppAddress.Parse("edward@example.org/desktop")).ToXml();

    Equal("team@conference.example.org/Edward", ping.Attribute("to")?.Value);
    Equal("edward@example.org/desktop", ping.Attribute("from")?.Value);
    Equal("ping", ping.Elements().Single().Name.LocalName);
    Equal(XmppMucSelfPing.PingNamespaceName, ping.Elements().Single().Name.NamespaceName);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="ping-1" from="team@conference.example.org/Edward"/>
        """, out var resultIq));
    True(XmppMucSelfPing.TryParsePingResponse(resultIq!, out var joined, out var noError));
    Equal(XmppMucSelfPingStatus.Joined, joined);
    True(noError is null);

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="error" id="ping-1" from="team@conference.example.org/Edward">
          <error type="cancel">
            <item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
          </error>
        </iq>
        """, out var errorIq));
    True(XmppMucSelfPing.TryParsePingResponse(errorIq!, out var missing, out var stanzaError));
    Equal(XmppMucSelfPingStatus.NotJoined, missing);
    Equal("item-not-found", stanzaError!.Condition);

    var info = new XmppServiceDiscoveryInfo(null, [], [XmppMucSelfPing.OptimizationFeature]);
    True(XmppMucSelfPing.SupportsSelfPingOptimization(info));
}

static void XmppHttpFileUploadSerializesRequestAndParsesSlot()
{
    var iq = XmppHttpFileUpload.CreateSlotRequest(
        "slot-1",
        XmppAddress.Parse("upload.example.org"),
        "foto.jpg",
        12345,
        "image/jpeg",
        XmppHttpUploadPurpose.Message);
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("urn:xmpp:http:upload:0", StringComparison.Ordinal));
    True(xml.Contains("filename=\"foto.jpg\"", StringComparison.Ordinal));
    True(xml.Contains("content-type=\"image/jpeg\"", StringComparison.Ordinal));
    True(xml.Contains("urn:xmpp:http:upload:purpose:0", StringComparison.Ordinal));

    var result = XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="slot-1">
          <slot xmlns="urn:xmpp:http:upload:0">
            <put url="https://upload.example.org/u/foto.jpg">
              <header name="Authorization">Bearer token</header>
              <header name="X-Ignored">no</header>
            </put>
            <get url="https://download.example.org/u/foto.jpg"/>
          </slot>
        </iq>
        """, out var parsedIq);

    True(result);
    True(XmppHttpFileUpload.TryParseSlotResult(parsedIq!, out var slot));
    Equal("https://upload.example.org/u/foto.jpg", slot!.PutUrl.ToString());
    Equal("https://download.example.org/u/foto.jpg", slot.GetUrl.ToString());
    Equal(1, slot.Headers.Count);
    Equal("Authorization", slot.Headers[0].Name);
    True(XmppHttpFileUpload.SupportsHttpUpload(new XmppServiceDiscoveryInfo(null, [], [XmppHttpFileUpload.NamespaceName])));
}

static void XmppHttpFileUploadOnlyAllowsLoopbackHttp()
{
    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="slot-loopback">
          <slot xmlns="urn:xmpp:http:upload:0">
            <put url="http://127.0.0.1:8088/u/foto.jpg"/>
            <get url="http://127.0.0.1:8088/u/foto.jpg"/>
          </slot>
        </iq>
        """, out var loopbackIq));
    True(XmppHttpFileUpload.TryParseSlotResult(loopbackIq!, out var loopbackSlot));
    Equal("http://127.0.0.1:8088/u/foto.jpg", loopbackSlot!.PutUrl.ToString());

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="slot-remote-http">
          <slot xmlns="urn:xmpp:http:upload:0">
            <put url="http://upload.example.org/u/foto.jpg"/>
            <get url="http://upload.example.org/u/foto.jpg"/>
          </slot>
        </iq>
        """, out var remoteHttpIq));
    False(XmppHttpFileUpload.TryParseSlotResult(remoteHttpIq!, out _));
}

static void XmppHttpFileUploadDiscoversMaxFileSize()
{
    var result = XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="disco-upload">
          <query xmlns="http://jabber.org/protocol/disco#info">
            <identity category="store" type="file" name="HTTP File Upload"/>
            <feature var="urn:xmpp:http:upload:0"/>
            <x xmlns="jabber:x:data" type="result">
              <field var="FORM_TYPE" type="hidden">
                <value>urn:xmpp:http:upload:0</value>
              </field>
              <field var="max-file-size">
                <value>5242880</value>
              </field>
            </x>
          </query>
        </iq>
        """, out var iq);

    True(result);
    True(XmppServiceDiscovery.TryParseInfoResult(iq!, out var info));
    True(XmppHttpFileUpload.TryGetAdvertisedMaxFileSize(info!, out var maxFileSize));
    Equal(5_242_880L, maxFileSize!.Value);
    Equal(5_242_880L, XmppHttpFileUpload.GetAdvertisedMaxFileSize(info!)!.Value);
    XmppHttpFileUpload.EnsureRequestAllowed("ok.txt", 5_242_880, "text/plain", maxFileSize);

    try
    {
        XmppHttpFileUpload.EnsureRequestAllowed("too-large.txt", 5_242_881, "text/plain", maxFileSize);
        throw new InvalidOperationException("Expected file size validation to fail.");
    }
    catch (ArgumentOutOfRangeException)
    {
    }
}

static void XmppHttpFileUploadHandlesPurposeAndRetryDetails()
{
    var expireBefore = DateTimeOffset.Parse("2026-05-28T12:34:56Z", CultureInfo.InvariantCulture);
    var xml = XmppHttpFileUpload.CreateSlotRequest(
            "slot-ephemeral",
            XmppAddress.Parse("upload.example.org"),
            "secret.txt",
            42,
            "text/plain",
            XmppHttpUploadPurpose.Ephemeral,
            expireBefore)
        .ToXml()
        .ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("<ephemeral", StringComparison.Ordinal));
    True(xml.Contains("expire-before=\"2026-05-28T12:34:56Z\"", StringComparison.Ordinal));
    Throws<ArgumentException>(() => XmppHttpFileUpload.CreateSlotRequest(
        "slot-bad-ephemeral",
        XmppAddress.Parse("upload.example.org"),
        "secret.txt",
        42,
        "text/plain",
        XmppHttpUploadPurpose.Ephemeral));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="error" id="slot-retry">
          <request xmlns="urn:xmpp:http:upload:0" filename="secret.txt" size="42"/>
          <error type="wait">
            <resource-constraint xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
            <retry xmlns="urn:xmpp:http:upload:0" stamp="2026-05-28T12:35:56Z"/>
          </error>
        </iq>
        """, out var iq));

    True(XmppHttpFileUpload.TryParseRetry(iq!, out var retryAt));
    Equal(DateTimeOffset.Parse("2026-05-28T12:35:56Z", CultureInfo.InvariantCulture), retryAt!.Value);
}

static void XmppHttpFileUploadExecutesPut()
{
    var handler = new RecordingHttpHandler();
    using var client = new HttpClient(handler);
    using var payload = new MemoryStream(Encoding.UTF8.GetBytes("hello"));
    var payloadLength = payload.Length;
    var slot = new XmppHttpUploadSlot(
        new Uri("https://upload.example.org/slot/hello.txt"),
        new Uri("https://download.example.org/slot/hello.txt"),
        [
            new XmppHttpUploadHeader("Authorization", "Bearer token"),
            new XmppHttpUploadHeader("X-Ignore", "no")
        ]);

    var completion = XmppHttpFileUpload.UploadAsync(
        slot,
        payload,
        payloadLength,
        "text/plain",
        client).GetAwaiter().GetResult();

    Equal(HttpMethod.Put, handler.Method!);
    Equal(slot.PutUrl, handler.RequestUri!);
    Equal("Bearer token", handler.Authorization!);
    Equal("text/plain", handler.ContentType!);
    Equal(payloadLength, handler.ContentLength!.Value);
    False(handler.IgnoredHeaderPresent);
    Equal(slot.GetUrl, completion.GetUrl);
}

static void XmppHttpFileUploadCreatesMessageAttachment()
{
    var upload = new XmppHttpUploadCompletion(new Uri("https://download.example.org/u/foto.jpg"), 123, "image/jpeg");
    var message = XmppHttpFileUpload.CreateFileMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        upload,
        "foto.jpg",
        "file-1");
    var xml = message.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("jabber:x:oob", StringComparison.Ordinal));
    True(xml.Contains("https://download.example.org/u/foto.jpg", StringComparison.Ordinal));
    True(xml.Contains("foto.jpg", StringComparison.Ordinal));
    True(XmppChatMessage.TryParse(message.ToXml(), out var parsed));
    Equal(upload.GetUrl, parsed!.OutOfBandUrl!);
    Equal("foto.jpg", parsed.OutOfBandDescription!);
}

static void XmppStatelessInlineMediaSharingSerializesAndParses()
{
    var file = new XmppJingleFile(
        "foto.jpg",
        123,
        "image/jpeg",
        Description: "Voorbeeldfoto",
        Hashes: [new XmppJingleFileHash("sha-256", "abc123")]);
    var reference = XmppStatelessInlineMediaSharing.CreateMediaSharingReference(
        file,
        [new Uri("https://download.example.org/u/foto.jpg")]);
    var message = new XElement(
        XName.Get("message", "jabber:client"),
        new XAttribute("to", "anna@example.org/phone"),
        new XAttribute("type", "chat"),
        new XElement(XName.Get("body", "jabber:client"), "foto"),
        reference);
    var xml = message.ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("urn:xmpp:sims:1", StringComparison.Ordinal));
    True(xml.Contains("urn:xmpp:jingle:apps:file-transfer:5", StringComparison.Ordinal));
    True(xml.Contains("urn:xmpp:reference:0", StringComparison.Ordinal));
    True(XmppStatelessInlineMediaSharing.TryParse(message, out var parsed));
    Equal("foto.jpg", parsed!.File.Name);
    Equal("image/jpeg", parsed.File.MediaType!);
    Equal(123L, parsed.File.Size!.Value);
    Equal("https://download.example.org/u/foto.jpg", parsed.Sources.Single().ToString());
    Equal("sha-256", parsed.File.Hashes!.Single().Algorithm);
}

static void XmppStatelessInlineMediaSharingCreatesUploadMessage()
{
    var upload = new XmppHttpUploadCompletion(new Uri("https://download.example.org/u/foto.jpg"), 123, "image/jpeg");
    var message = XmppStatelessInlineMediaSharing.CreateHttpUploadMessage(
        XmppAddress.Parse("anna@example.org/phone"),
        "Bestand gedeeld: foto.jpg",
        upload,
        "foto.jpg",
        [new XmppJingleFileHash("sha-256", "abc123")],
        "sims-1",
        "Voorbeeldfoto");

    Equal("sims-1", message.Attribute("id")!.Value);
    True(XmppStatelessInlineMediaSharing.TryParse(message, out var parsed));
    Equal(upload.GetUrl, parsed!.Sources.Single());
    Equal("Voorbeeldfoto", parsed.File.Description!);
    Equal(0, parsed.Begin!.Value);
    Equal("Bestand gedeeld: foto.jpg".Length, parsed.End!.Value);
}

static void XmppStatelessInlineMediaSharingExposesDiscoveryAndHash()
{
    var info = new XmppServiceDiscoveryInfo(
        null,
        [],
        [XmppStatelessInlineMediaSharing.NamespaceName]);
    var hash = XmppStatelessInlineMediaSharing.CreateSha256Hash(Encoding.UTF8.GetBytes("foto"));

    True(XmppStatelessInlineMediaSharing.SupportsStatelessInlineMediaSharing(info));
    Equal("sha-256", hash.Algorithm);
    Equal(Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes("foto"))), hash.Value);
}

static void XmppPublicChannelSearchSerializesAndParses()
{
    var service = XmppAddress.Parse("search.example.org");
    var info = new XmppServiceDiscoveryInfo(null, [], [XmppPublicChannelSearch.NamespaceName]);
    True(XmppPublicChannelSearch.SupportsPublicChannelSearch(info));

    var formRequest = XmppPublicChannelSearch.CreateSearchFormRequest("channel-form-1", service).ToXml();
    Equal("get", formRequest.Attribute("type")!.Value);
    Equal("search.example.org", formRequest.Attribute("to")!.Value);
    Equal(XmppPublicChannelSearch.NamespaceName, formRequest.Elements().Single().Name.NamespaceName);

    var search = XmppPublicChannelSearch.CreateSearchRequest(
        "channel-search-1",
        service,
        new XmppPublicChannelSearchQuery(
            Text: "xmpp",
            SearchInAddress: true,
            SearchInName: true,
            SearchInDescription: true,
            ServiceTypes: [XmppPublicChannelSearch.MucServiceType],
            SortKey: XmppPublicChannelSearch.AddressSortKey),
        new XmppResultSetRequest(Max: 5)).ToXml();
    var searchXml = search.ToString(SaveOptions.DisableFormatting);
    True(searchXml.Contains("urn:xmpp:channel-search:0:search-params", StringComparison.Ordinal));
    True(searchXml.Contains("sinaddress", StringComparison.Ordinal));
    Equal(
        "5",
        search.Elements().Single().Element(XName.Get("set", XmppPublicChannelSearch.ResultSetManagementNamespace))!
            .Element(XName.Get("max", XmppPublicChannelSearch.ResultSetManagementNamespace))!.Value);

    var resultXml = XElement.Parse("""
        <iq xmlns='jabber:client' from='search.example.org' to='edward@example.org/web' id='channel-search-1' type='result'>
          <result xmlns='urn:xmpp:channel-search:0:search'>
            <item address='commteam@muc.xmpp.org'>
              <name>commteam</name>
              <description>XMPP community team</description>
              <language>en</language>
              <nusers>10</nusers>
              <service-type>xep-0045</service-type>
              <is-open/>
              <anonymity-mode>muc_semianonymous</anonymity-mode>
            </item>
            <set xmlns='http://jabber.org/protocol/rsm'>
              <first index='0'>opaque-string-1</first>
              <last>opaque-string-2</last>
              <max>5</max>
              <count>42</count>
            </set>
          </result>
        </iq>
        """);

    True(XmppIq.TryParse(resultXml, out var iq));
    True(XmppPublicChannelSearch.TryParseSearchResult(iq!, out var result));
    Equal("commteam@muc.xmpp.org", result!.Channels.Single().Address.Bare);
    Equal("XMPP community team", result.Channels.Single().Description!);
    Equal(10, result.Channels.Single().UserCount!.Value);
    Equal(true, result.Channels.Single().IsOpen!.Value);
    Equal("opaque-string-2", result.ResultSet!.Last!);
    Equal(42, result.ResultSet.Count!.Value);
    Equal(0, result.ResultSet.FirstIndex!.Value);
}

static void XmppStreamClientHandlesPublicChannelSearch()
{
    RunXmppStreamClientHandlesPublicChannelSearchAsync().GetAwaiter().GetResult();
}

static async Task RunXmppStreamClientHandlesPublicChannelSearchAsync()
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
            <stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="localhost" version="1.0">
            <stream:features/>
            """);

        var formRequest = await ReadTextAsync(serverStream, buffer);
        True(formRequest.Contains(XmppPublicChannelSearch.NamespaceName, StringComparison.Ordinal));
        await WriteTextAsync(serverStream, """
            <iq xmlns='jabber:client' from='search.localhost' id='channel-search-form-1' type='result'>
              <search xmlns='urn:xmpp:channel-search:0:search'>
                <x xmlns='jabber:x:data' type='form'>
                  <field type='hidden' var='FORM_TYPE'>
                    <value>urn:xmpp:channel-search:0:search-params</value>
                  </field>
                  <field type='text-single' var='q' label='Search for'/>
                </x>
              </search>
            </iq>
            """);

        var searchRequest = await ReadTextAsync(serverStream, buffer);
        True(searchRequest.Contains("<value>teletyptel</value>", StringComparison.Ordinal));
        await WriteTextAsync(serverStream, """
            <iq xmlns='jabber:client' from='search.localhost' id='channel-search-1' type='result'>
              <result xmlns='urn:xmpp:channel-search:0:search'>
                <item address='teletyptel@muc.localhost'>
                  <name>Teletyptel</name>
                  <nusers>3</nusers>
                  <is-open>true</is-open>
                </item>
              </result>
            </iq>
            """);

        await ReadTextAsync(serverStream, buffer);
    });

    try
    {
        var searchService = XmppAddress.Parse("search.localhost");
        var settings = new XmppConnectionSettings(
            XmppAddress.Parse("edward@localhost/web"),
            IPAddress.Loopback.ToString(),
            endpoint.Port,
            requireTls: false);
        await using var client = new XmppStreamClient(settings);

        await client.ConnectAndReadFeaturesAsync();
        var form = await client.RequestPublicChannelSearchFormAsync(searchService, TimeSpan.FromSeconds(5));
        var result = await client.SearchPublicChannelsAsync(
            searchService,
            new XmppPublicChannelSearchQuery(Text: "teletyptel"),
            TimeSpan.FromSeconds(5));
        await client.DisconnectAsync();

        Equal(XmppPublicChannelSearch.SearchParamsFormType, form.FormType!);
        Equal("teletyptel@muc.localhost", result.Channels.Single().Address.Bare);
        Equal("Teletyptel", result.Channels.Single().Name!);
        Equal(3, result.Channels.Single().UserCount!.Value);
    }
    finally
    {
        listener.Stop();
    }

    await serverTask;
}

static void XmppIncomingStanzaExposesStatelessInlineMedia()
{
    var message = XmppStatelessInlineMediaSharing.CreateHttpUploadMessage(
        XmppAddress.Parse("edward@example.org/web"),
        "Bestand gedeeld: foto.jpg",
        new XmppHttpUploadCompletion(new Uri("https://download.example.org/u/foto.jpg"), 123, "image/jpeg"),
        "foto.jpg",
        [new XmppJingleFileHash("sha-256", "abc123")],
        "sims-incoming-1");
    message.SetAttributeValue("from", "anna@example.org/phone");
    var stanza = XmppIncomingStanza.FromElement(message);

    True(stanza.IsMessage);
    True(stanza.HasInlineMedia);
    Equal("foto.jpg", stanza.InlineMedia!.File.Name);
    Equal("https://download.example.org/u/foto.jpg", stanza.InlineMedia.Sources.Single().ToString());
}

static void XmppSocks5BytestreamsSerializesRequests()
{
    var proxy = XmppAddress.Parse("streamer.example.org");
    var target = XmppAddress.Parse("anna@example.org/phone");
    var host = new XmppSocks5StreamHost(proxy, "203.0.113.55", 7777);
    var query = XmppSocks5Bytestreams.CreateProxyAddressRequest("s5b-proxy-1", proxy);
    Equal("get", query.ToXml().Attribute("type")!.Value);
    True(query.ToXml().ToString(SaveOptions.DisableFormatting).Contains(XmppSocks5Bytestreams.NamespaceName, StringComparison.Ordinal));

    var request = XmppSocks5Bytestreams.CreateBytestreamRequest("s5b-1", target, "sid-123", [host]);
    var requestXml = request.ToXml().ToString(SaveOptions.DisableFormatting);
    True(requestXml.Contains("sid=\"sid-123\"", StringComparison.Ordinal));
    True(requestXml.Contains("streamhost", StringComparison.Ordinal));
    True(XmppSocks5Bytestreams.TryParseBytestreamRequest(request, out var parsedRequest));
    Equal("sid-123", parsedRequest!.StreamId);
    Equal("tcp", parsedRequest.Mode);
    Equal(1, parsedRequest.StreamHosts.Count);
    Equal(7777, parsedRequest.StreamHosts[0].Port!.Value);

    var used = XmppSocks5Bytestreams.CreateStreamHostUsedResult("s5b-1", XmppAddress.Parse("edward@example.org/web"), proxy);
    True(XmppSocks5Bytestreams.TryParseStreamHostUsedResult(used, out var usedHost));
    Equal("streamer.example.org", usedHost!.Bare);

    var activation = XmppSocks5Bytestreams.CreateActivationRequest("s5b-activate-1", proxy, "sid-123", target);
    var activationXml = activation.ToXml().ToString(SaveOptions.DisableFormatting);
    True(activationXml.Contains("activate", StringComparison.Ordinal));
    True(XmppSocks5Bytestreams.TryParseActivationRequest(activation, out var parsedActivation));
    Equal("sid-123", parsedActivation!.StreamId);
    Equal(target.Full, parsedActivation.Target.Full);
}

static void XmppSocks5BytestreamsComputesDestinationAddress()
{
    var destination = XmppSocks5Bytestreams.ComputeDestinationAddress(
        "vj3hs98y",
        XmppAddress.Parse("romeo@montague.lit/orchard"),
        XmppAddress.Parse("juliet@capulet.lit/balcony"));

    Equal(40, destination.Length);
    Equal("972b7bf47291ca609517f67f86b5081086052dad", destination);

    var info = new XmppServiceDiscoveryInfo(
        null,
        [new XmppServiceIdentity("proxy", "bytestreams", "File Transfer Relay")],
        [XmppSocks5Bytestreams.NamespaceName]);
    True(XmppSocks5Bytestreams.SupportsSocks5Bytestreams(info));
    True(XmppSocks5Bytestreams.IsBytestreamProxy(info));
}

static void XmppSocks5BytestreamsOpensLocalStreamHostAndExchangesBytes()
{
    RunXmppSocks5BytestreamsOpensLocalStreamHostAndExchangesBytesAsync().GetAwaiter().GetResult();
}

static async Task RunXmppSocks5BytestreamsOpensLocalStreamHostAndExchangesBytesAsync()
{
    var listener = new TcpListener(IPAddress.Loopback, 0);
    listener.Start();

    var endpoint = (IPEndPoint)listener.LocalEndpoint;
    var requester = XmppAddress.Parse("romeo@montague.lit/orchard");
    var target = XmppAddress.Parse("juliet@capulet.lit/balcony");
    var destination = XmppSocks5Bytestreams.ComputeDestinationAddress("sid-123", requester, target);
    var clientPayload = Encoding.UTF8.GetBytes("hello through xep-0065");
    var serverReply = Encoding.UTF8.GetBytes("socks5-ok");
    string? requestedDestination = null;
    var sawZeroDestinationPort = false;

    var serverTask = Task.Run(async () =>
    {
        using var serverClient = await listener.AcceptTcpClientAsync();
        await using var serverStream = serverClient.GetStream();

        var greeting = await ReadExactBytesAsync(serverStream, 3);
        Equal((byte)0x05, greeting[0]);
        Equal((byte)0x01, greeting[1]);
        Equal((byte)0x00, greeting[2]);
        await serverStream.WriteAsync(new byte[] { 0x05, 0x00 });

        var requestPrefix = await ReadExactBytesAsync(serverStream, 5);
        Equal((byte)0x05, requestPrefix[0]);
        Equal((byte)0x01, requestPrefix[1]);
        Equal((byte)0x00, requestPrefix[2]);
        Equal((byte)0x03, requestPrefix[3]);

        var addressAndPort = await ReadExactBytesAsync(serverStream, requestPrefix[4] + 2);
        requestedDestination = Encoding.ASCII.GetString(addressAndPort, 0, requestPrefix[4]);
        sawZeroDestinationPort = addressAndPort[^2] == 0x00 && addressAndPort[^1] == 0x00;

        var response = new byte[7 + requestPrefix[4]];
        response[0] = 0x05;
        response[1] = 0x00;
        response[2] = 0x00;
        response[3] = 0x03;
        response[4] = requestPrefix[4];
        Encoding.ASCII.GetBytes(requestedDestination).CopyTo(response, 5);
        response[^2] = 0x00;
        response[^1] = 0x00;
        await serverStream.WriteAsync(response);

        var received = await ReadExactBytesAsync(serverStream, clientPayload.Length);
        True(clientPayload.SequenceEqual(received));
        await serverStream.WriteAsync(serverReply);
    });

    try
    {
        var streamHost = new XmppSocks5StreamHost(
            XmppAddress.Parse("proxy.example.org"),
            IPAddress.Loopback.ToString(),
            endpoint.Port);
        await using var connection = await XmppSocks5BytestreamSocket.ConnectAsync(
            streamHost,
            destination,
            TimeSpan.FromSeconds(5));

        await connection.Stream.WriteAsync(clientPayload);
        await connection.Stream.FlushAsync();
        var reply = await ReadExactBytesAsync(connection.Stream, serverReply.Length);
        True(serverReply.SequenceEqual(reply));
        await serverTask;
    }
    finally
    {
        listener.Stop();
    }

    Equal(destination, requestedDestination);
    True(sawZeroDestinationPort);
}

static void XmppInBandBytestreamsSerializesOpenDataAndClose()
{
    var target = XmppAddress.Parse("juliet@capulet.com/balcony");
    var open = XmppInBandBytestreams.CreateOpenRequest("ibb-open-1", target, "ch3d9s71", 2048);
    var openXml = open.ToXml().ToString(SaveOptions.DisableFormatting);
    True(openXml.Contains("http://jabber.org/protocol/ibb", StringComparison.Ordinal));
    True(openXml.Contains("block-size=\"2048\"", StringComparison.Ordinal));
    True(openXml.Contains("sid=\"ch3d9s71\"", StringComparison.Ordinal));
    True(XmppInBandBytestreams.TryParseOpenRequest(open, out var parsedOpen));
    Equal("ch3d9s71", parsedOpen!.SessionId);
    Equal("iq", parsedOpen.Stanza);

    var payload = Encoding.UTF8.GetBytes("Teletyptel file bytes");
    var dataIq = XmppInBandBytestreams.CreateDataIq("ibb-data-1", target, "ch3d9s71", 0, payload, blockSize: 2048);
    True(XmppInBandBytestreams.TryParseDataIq(dataIq, out var parsedDataIq));
    Equal("ch3d9s71", parsedDataIq!.SessionId);
    Equal((ushort)0, parsedDataIq.Sequence);
    True(payload.SequenceEqual(parsedDataIq.Bytes));

    var message = XmppInBandBytestreams.CreateDataMessage(target, "ch3d9s71", 1, payload, "ibb-message-1");
    True(message.ToString(SaveOptions.DisableFormatting).Contains("seq=\"1\"", StringComparison.Ordinal));
    True(XmppInBandBytestreams.TryParseDataMessage(message, out var parsedMessageData));
    Equal((ushort)1, parsedMessageData!.Sequence);
    True(payload.SequenceEqual(parsedMessageData.Bytes));

    var close = XmppInBandBytestreams.CreateCloseRequest("ibb-close-1", target, "ch3d9s71");
    True(XmppInBandBytestreams.TryParseCloseRequest(close, out var parsedClose));
    Equal("ch3d9s71", parsedClose!.SessionId);

    Throws<ArgumentOutOfRangeException>(() =>
        XmppInBandBytestreams.CreateDataIq("ibb-too-large", target, "ch3d9s71", 2, new byte[3], blockSize: 2));
}

static void XmppJingleIbbTransportSerializesFallbackOffer()
{
    var initiator = XmppAddress.Parse("romeo@montague.lit/orchard");
    var responder = XmppAddress.Parse("juliet@capulet.lit/balcony");
    var transport = new XmppJingleInBandBytestreamTransport("ch3d9s71", 4096);
    var file = new XmppJingleFile(
        "fallback.txt",
        Size: 21,
        MediaType: "text/plain",
        Hashes: [new XmppJingleFileHash("sha-256", "Mb5I5OB9L0yDyGZqjOmCwXlZs8Y=")]);
    var content = XmppJingleFileTransfer.CreateFileContent(
        "file-offer",
        file,
        transport.ToXml());
    var iq = XmppJingle.CreateSessionInitiate(
        "jft-ibb-1",
        responder,
        "a73sjjvkla37jfea",
        "initiator",
        [content],
        initiator.Full);
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains(XmppJingleFileTransfer.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains(XmppJingleInBandBytestreams.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains("block-size=\"4096\"", StringComparison.Ordinal));
    True(XmppJingle.TryParse(iq, out var session));
    True(XmppJingleInBandBytestreams.TryParseTransport(session!.Contents.Single(), out var parsedTransport));
    Equal("ch3d9s71", parsedTransport!.SessionId);
    Equal(4096, parsedTransport.BlockSize);
    Equal("iq", parsedTransport.Stanza);

    var open = XmppJingleInBandBytestreams.CreateOpenRequestFromTransport(
        "ibb-open-1",
        responder,
        parsedTransport);
    True(XmppInBandBytestreams.TryParseOpenRequest(open, out var parsedOpen));
    Equal(parsedTransport.SessionId, parsedOpen!.SessionId);
    Equal(parsedTransport.BlockSize, parsedOpen.BlockSize);

    var messageTransport = new XmppJingleInBandBytestreamTransport("message-sid", 512, "message");
    True(messageTransport.ToXml().ToString(SaveOptions.DisableFormatting).Contains("stanza=\"message\"", StringComparison.Ordinal));
    True(XmppJingleInBandBytestreams.SupportsJingleInBandBytestreams(new XmppServiceDiscoveryInfo(
        null,
        [],
        [XmppJingleInBandBytestreams.NamespaceName])));
}

static void XmppOmemoSerializesEncryptedMessageAndParsesDevices()
{
    var recipient = XmppAddress.Parse("anna@example.org/phone");
    var message = XmppOmemo.CreateEncryptedMessage(
        recipient,
        123,
        [new XmppOmemoKeyTransport(456, "cipher", IsPreKey: true, RecipientJid: XmppAddress.Parse("anna@example.org"))],
        "payload",
        "omemo-1");
    var xml = message.ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("urn:xmpp:omemo:2", StringComparison.Ordinal));
    True(xml.Contains("sid=\"123\"", StringComparison.Ordinal));
    True(xml.Contains("keys jid=\"anna@example.org\"", StringComparison.Ordinal));
    True(xml.Contains("rid=\"456\"", StringComparison.Ordinal));

    True(XmppOmemo.TryParseEncryptedMessage(message, out var encrypted));
    Equal((uint)123, encrypted!.SenderDeviceId);
    Equal((uint)456, encrypted.Keys[0].RecipientDeviceId);
    True(encrypted.Keys[0].IsPreKey);
    Equal("anna@example.org", encrypted.Keys[0].RecipientJid!.Bare);
    Equal("payload", encrypted.Payload);

    var bundleRequest = XmppOmemo.CreateBundleRequest("bundle-1", recipient, 456);
    var bundleRequestXml = bundleRequest.ToXml().ToString(SaveOptions.DisableFormatting);
    True(bundleRequestXml.Contains("node=\"urn:xmpp:omemo:2:bundles\"", StringComparison.Ordinal));
    True(bundleRequestXml.Contains("item id=\"456\"", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="devices-1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:xmpp:omemo:2:devices">
              <item id="current">
                <devices xmlns="urn:xmpp:omemo:2">
                  <device id="123"/>
                  <device id="456"/>
                </devices>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var devicesIq));
    True(XmppOmemo.TryParseDeviceList(devicesIq!, out var devices));
    Equal(2, devices.Count);
    Equal((uint)123, devices[0]);
    Equal((uint)456, devices[1]);
}

static void XmppOmemoParsesBundleAndCurrentWireMessage()
{
    var bundle = new XmppOmemoBundle(
        SignedPreKeyPublic: Convert.ToBase64String([1, 2, 3, 4]),
        SignedPreKeyId: 77,
        SignedPreKeySignature: Convert.ToBase64String([5, 6, 7, 8]),
        IdentityKey: Convert.ToBase64String([9, 10, 11, 12]),
        PreKeys:
        [
            new XmppOmemoPreKey(10, Convert.ToBase64String([13, 14, 15, 16])),
            new XmppOmemoPreKey(11, Convert.ToBase64String([17, 18, 19, 20]))
        ]);
    var publish = XmppOmemo.CreateBundlePublish("bundle-publish-1", 456, bundle);
    var publishXml = publish.ToXml().ToString(SaveOptions.DisableFormatting);

    True(publishXml.Contains("node=\"urn:xmpp:omemo:2:bundles\"", StringComparison.Ordinal));
    True(publishXml.Contains("item id=\"456\"", StringComparison.Ordinal));
    True(publishXml.Contains("signedPreKeyId=\"77\"", StringComparison.Ordinal));

    True(XmppIq.TryParse("""
        <iq xmlns="jabber:client" type="result" id="bundle-1">
          <pubsub xmlns="http://jabber.org/protocol/pubsub">
            <items node="urn:xmpp:omemo:2:bundles">
              <item id="456">
                <bundle xmlns="urn:xmpp:omemo:2">
                  <signedPreKeyPublic signedPreKeyId="77">AQIDBA==</signedPreKeyPublic>
                  <signedPreKeySignature>BQYHCA==</signedPreKeySignature>
                  <identityKey>CQoLDA==</identityKey>
                  <prekeys>
                    <preKeyPublic preKeyId="10">DQ4PEA==</preKeyPublic>
                    <preKeyPublic preKeyId="11">ERITFA==</preKeyPublic>
                  </prekeys>
                </bundle>
              </item>
            </items>
          </pubsub>
        </iq>
        """, out var bundleIq));
    True(XmppOmemo.TryParseBundle(bundleIq!, out var parsedBundle));
    Equal((uint)77, parsedBundle!.SignedPreKeyId);
    Equal("CQoLDA==", parsedBundle.IdentityKey);
    Equal(2, parsedBundle.PreKeys.Count);
    Equal((uint)11, parsedBundle.PreKeys[1].Id);

    var currentMessage = XElement.Parse("""
        <message xmlns="jabber:client" from="anna@example.org/phone" to="edward@example.org/web" id="omemo-current-1" type="chat">
          <encrypted xmlns="urn:xmpp:omemo:2">
            <header sid="123">
              <keys jid="edward@example.org">
                <key rid="456" prekey="true">BASE64-RATCHET-KEY-FOR-WEB</key>
                <key rid="789">BASE64-RATCHET-KEY-FOR-PHONE</key>
              </keys>
            </header>
            <payload>BASE64-AEAD-PAYLOAD</payload>
          </encrypted>
        </message>
        """);
    True(XmppOmemo.TryParseEncryptedMessage(currentMessage, out var encrypted));
    Equal((uint)123, encrypted!.SenderDeviceId);
    Equal(2, encrypted.Keys.Count);
    Equal("edward@example.org", encrypted.Keys[0].RecipientJid!.Bare);
    True(encrypted.Keys[0].IsPreKey);
    False(encrypted.Keys[1].IsPreKey);
    Equal("BASE64-AEAD-PAYLOAD", encrypted.Payload);
}

static void XmppOmemoEncryptsAndDecryptsPayload()
{
    byte[] key =
    [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
        0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f
    ];
    byte[] nonce = [0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b];
    var cipher = XmppOmemoPayloadCrypto.Encrypt(
        Encoding.UTF8.GetBytes("geheim bericht"),
        key,
        nonce,
        Encoding.UTF8.GetBytes("omemo-associated-data"));

    True(XmppOmemo.IsValidBase64(cipher.Payload));
    True(XmppOmemo.IsValidBase64(cipher.PayloadSecret));
    False(cipher.Payload.Contains("geheim", StringComparison.Ordinal));

    var decrypted = XmppOmemoPayloadCrypto.DecryptToString(
        cipher,
        associatedData: Encoding.UTF8.GetBytes("omemo-associated-data"));
    Equal("geheim bericht", decrypted);
}

static void XmppOmemoTrustStoreTracksFingerprints()
{
    var owner = XmppAddress.Parse("anna@example.org");
    var fingerprint = XmppOmemoTrust.ComputeFingerprintFromText("identity-key-material");
    True(fingerprint.Contains(' '));

    var store = new XmppOmemoTrustStore();
    Equal(XmppOmemoTrustState.Unknown, store.GetTrust(owner, 123, fingerprint));

    store.SetTrust(owner, 123, fingerprint, XmppOmemoTrustState.Trusted);
    Equal(XmppOmemoTrustState.Trusted, store.GetTrust(owner, 123, fingerprint));
    Equal(XmppOmemoTrustState.Unknown, store.GetTrust(owner, 123, fingerprint + " CHANGED"));

    store.SetTrust(owner, 123, fingerprint, XmppOmemoTrustState.Distrusted);
    Equal(XmppOmemoTrustState.Distrusted, store.GetTrust(owner, 123, fingerprint));
    Equal(1, store.List().Count);
}

static void XmppOmemoSessionStoreKeepsOpaqueRatchetState()
{
    RunXmppOmemoSessionStoreKeepsOpaqueRatchetStateAsync().GetAwaiter().GetResult();
}

static async Task RunXmppOmemoSessionStoreKeepsOpaqueRatchetStateAsync()
{
    var store = new XmppOmemoInMemorySessionStore();
    var key = new XmppOmemoSessionKey(
        XmppAddress.Parse("edward@example.org"),
        123,
        XmppAddress.Parse("tester@example.org"),
        456);
    byte[] state = [1, 2, 3, 4];

    await store.SaveAsync(new XmppOmemoStoredSession(
        key,
        "AABB CCDD",
        state,
        new DateTimeOffset(2026, 5, 28, 12, 0, 0, TimeSpan.Zero)));

    state[0] = 99;
    var loaded = await store.LoadAsync(key);
    True(loaded is not null);
    Equal(1, loaded!.OpaqueState[0]);
    Equal("AABB CCDD", loaded.RemoteIdentityFingerprint);

    loaded.OpaqueState[1] = 88;
    var loadedAgain = await store.LoadAsync(key);
    Equal(2, loadedAgain!.OpaqueState[1]);

    await store.SaveAsync(new XmppOmemoStoredSession(
        new XmppOmemoSessionKey(
            XmppAddress.Parse("edward@example.org"),
            123,
            XmppAddress.Parse("anna@example.org"),
            789),
        "1122 3344",
        [5, 6, 7, 8],
        new DateTimeOffset(2026, 5, 28, 12, 1, 0, TimeSpan.Zero)));

    var sessions = await store.ListAsync(XmppAddress.Parse("edward@example.org"), 123);
    Equal(2, sessions.Count);
    Equal("anna@example.org", sessions[0].Key.RemoteAccount.Bare);
    Equal("tester@example.org", sessions[1].Key.RemoteAccount.Bare);

    True(await store.DeleteAsync(key));
    False(await store.DeleteAsync(key));
    True(await store.LoadAsync(key) is null);
}

static void XmppOmemoLocalDevicePublishesBundleAndConsumesPreKeys()
{
    var store = new XmppOmemoLocalDeviceStore();
    var device = XmppOmemoLocalDevice.Create(
        deviceId: 42,
        signedPreKeySignature: Convert.ToBase64String([9, 8, 7, 6]),
        signedPreKeyId: 77,
        firstOneTimePreKeyId: 1000,
        oneTimePreKeyCount: 3);

    store.AddOrUpdate(device);
    Equal(1, store.ListDeviceIds().Count);
    Equal((uint)42, store.ListDeviceIds()[0]);

    var publishRequests = store.CreatePublishRequests("local-omemo", 42);
    Equal(2, publishRequests.Count);
    var devicesXml = publishRequests[0].ToXml().ToString(SaveOptions.DisableFormatting);
    True(devicesXml.Contains("node=\"urn:xmpp:omemo:2:devices\"", StringComparison.Ordinal));
    True(devicesXml.Contains("device id=\"42\"", StringComparison.Ordinal));

    var bundleXml = publishRequests[1].ToXml().ToString(SaveOptions.DisableFormatting);
    True(bundleXml.Contains("node=\"urn:xmpp:omemo:2:bundles\"", StringComparison.Ordinal));
    True(bundleXml.Contains("item id=\"42\"", StringComparison.Ordinal));
    True(bundleXml.Contains("signedPreKeyId=\"77\"", StringComparison.Ordinal));
    True(XmppOmemoBundle.TryParse(
        publishRequests[1].Payload!.Descendants(XName.Get("bundle", XmppOmemo.NamespaceName)).Single(),
        out var parsedBundle));
    Equal((uint)77, parsedBundle!.SignedPreKeyId);
    Equal(3, parsedBundle.PreKeys.Count);

    var limitedBundle = store.GetDevice(42).ToBundle(maxOneTimePreKeys: 2);
    Equal(2, limitedBundle.PreKeys.Count);
    Equal((uint)1000, limitedBundle.PreKeys[0].Id);
    Equal((uint)1001, limitedBundle.PreKeys[1].Id);

    var consumed = store.ConsumeOneTimePreKey(42, 1001);
    Equal((uint)1001, consumed.PreKeyId!.Value);
    var afterConsume = store.GetDevice(42).ToBundle();
    Equal(2, afterConsume.PreKeys.Count);
    False(afterConsume.PreKeys.Any(preKey => preKey.Id == 1001));

    store.ReplenishOneTimePreKeys(42, firstPreKeyId: 2000, count: 2);
    var replenished = store.GetDevice(42).ToBundle();
    Equal(4, replenished.PreKeys.Count);
    True(replenished.PreKeys.Any(preKey => preKey.Id == 2000));
    True(replenished.PreKeys.Any(preKey => preKey.Id == 2001));

    var missing = Throws<KeyNotFoundException>(() => store.ConsumeOneTimePreKey(42, 1001));
    True(missing.Message.Contains("one-time pre-key 1001", StringComparison.Ordinal));

    var duplicate = Throws<InvalidOperationException>(() => store.ReplenishOneTimePreKeys(42, firstPreKeyId: 2000, count: 1));
    True(duplicate.Message.Contains("Duplicate OMEMO one-time pre-key id 2000", StringComparison.Ordinal));
}

static void XmppOmemoEncryptedLocalDeviceFileProtectsPrivateKeys()
{
    RunXmppOmemoEncryptedLocalDeviceFileProtectsPrivateKeysAsync().GetAwaiter().GetResult();
}

static async Task RunXmppOmemoEncryptedLocalDeviceFileProtectsPrivateKeysAsync()
{
    var path = Path.Combine(
        Path.GetTempPath(),
        "tiedragon-omemo-local-device-" + Guid.NewGuid().ToString("N") + ".json");
    try
    {
        var store = new XmppOmemoLocalDeviceStore();
        var device = XmppOmemoLocalDevice.Create(
            deviceId: 77,
            signedPreKeySignature: Convert.ToBase64String([1, 3, 3, 7]),
            signedPreKeyId: 55,
            firstOneTimePreKeyId: 900,
            oneTimePreKeyCount: 2);
        store.AddOrUpdate(device);

        await XmppOmemoEncryptedLocalDeviceFile.SaveAsync(
            path,
            store,
            "correct horse battery staple",
            iterations: 100_000);

        var encryptedJson = await File.ReadAllTextAsync(path);
        True(encryptedJson.Contains("pbkdf2-sha256", StringComparison.Ordinal));
        False(encryptedJson.Contains(device.IdentityKeyPair.PrivateKey, StringComparison.Ordinal));
        False(encryptedJson.Contains(device.SignedPreKeyPair.PrivateKey, StringComparison.Ordinal));
        False(encryptedJson.Contains(device.OneTimePreKeyPairs[0].PrivateKey, StringComparison.Ordinal));
        False(encryptedJson.Contains(device.SignedPreKeySignature, StringComparison.Ordinal));

        var loaded = await XmppOmemoEncryptedLocalDeviceFile.LoadAsync(path, "correct horse battery staple");
        var loadedDevice = loaded.GetDevice(77);
        Equal(device.IdentityKeyPair.PublicKey, loadedDevice.IdentityKeyPair.PublicKey);
        Equal(device.IdentityKeyPair.PrivateKey, loadedDevice.IdentityKeyPair.PrivateKey);
        Equal(device.SignedPreKeyPair.PrivateKey, loadedDevice.SignedPreKeyPair.PrivateKey);
        Equal((uint)900, loadedDevice.OneTimePreKeyPairs[0].PreKeyId!.Value);
        Equal(device.OneTimePreKeyPairs[0].PrivateKey, loadedDevice.OneTimePreKeyPairs[0].PrivateKey);

        var wrongPassphrase = Throws<CryptographicException>(() =>
            XmppOmemoEncryptedLocalDeviceFile.LoadAsync(path, "wrong horse battery staple").GetAwaiter().GetResult());
        True(!string.IsNullOrWhiteSpace(wrongPassphrase.Message));

        var shortPassphrase = Throws<ArgumentException>(() =>
            XmppOmemoEncryptedLocalDeviceFile.SaveAsync(path, store, "short").GetAwaiter().GetResult());
        True(shortPassphrase.Message.Contains("passphrase", StringComparison.OrdinalIgnoreCase));
    }
    finally
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        if (File.Exists(path + ".tmp"))
        {
            File.Delete(path + ".tmp");
        }
    }
}

static void XmppOmemoWindowsSecretVaultProtectsKeyStorePassphrase()
{
    RunXmppOmemoWindowsSecretVaultProtectsKeyStorePassphraseAsync().GetAwaiter().GetResult();
}

static async Task RunXmppOmemoWindowsSecretVaultProtectsKeyStorePassphraseAsync()
{
    var directory = Path.Combine(
        Path.GetTempPath(),
        "tiedragon-omemo-vault-" + Guid.NewGuid().ToString("N"));
    try
    {
        var vault = new XmppOmemoWindowsDpapiSecretVault(directory);
        if (!vault.IsAvailable)
        {
            var platform = Throws<PlatformNotSupportedException>(() =>
                vault.SaveSecretAsync("omemo/account", "correct horse battery staple").GetAwaiter().GetResult());
            True(platform.Message.Contains("Windows DPAPI", StringComparison.Ordinal));
            return;
        }

        const string passphrase = "correct horse battery staple";
        await vault.SaveSecretAsync("omemo/account", passphrase);
        var files = Directory.GetFiles(directory, "*.json");
        Equal(1, files.Length);

        var vaultJson = await File.ReadAllTextAsync(files[0]);
        True(vaultJson.Contains(XmppOmemoWindowsDpapiSecretVault.ProviderName, StringComparison.Ordinal));
        False(vaultJson.Contains(passphrase, StringComparison.Ordinal));
        False(vaultJson.Contains("omemo/account", StringComparison.Ordinal));

        Equal(passphrase, await vault.LoadSecretAsync("omemo/account"));
        True(await vault.LoadSecretAsync("omemo/other") is null);

        var store = new XmppOmemoLocalDeviceStore();
        var device = XmppOmemoLocalDevice.Create(
            deviceId: 88,
            signedPreKeySignature: Convert.ToBase64String([4, 3, 2, 1]),
            oneTimePreKeyCount: 1);
        store.AddOrUpdate(device);

        var devicePath = Path.Combine(directory, "devices.json");
        await XmppOmemoEncryptedLocalDeviceFile.SaveWithVaultAsync(
            devicePath,
            store,
            vault,
            "omemo/device-file",
            passphrase,
            iterations: 100_000);
        var loadedStore = await XmppOmemoEncryptedLocalDeviceFile.LoadWithVaultAsync(
            devicePath,
            vault,
            "omemo/device-file");
        Equal(device.IdentityKeyPair.PrivateKey, loadedStore.GetDevice(88).IdentityKeyPair.PrivateKey);

        True(await vault.DeleteSecretAsync("omemo/device-file"));
        var missing = Throws<InvalidOperationException>(() =>
            XmppOmemoEncryptedLocalDeviceFile.LoadWithVaultAsync(devicePath, vault, "omemo/device-file").GetAwaiter().GetResult());
        True(missing.Message.Contains("passphrase", StringComparison.OrdinalIgnoreCase));

        True(await vault.DeleteSecretAsync("omemo/account"));
        False(await vault.DeleteSecretAsync("omemo/account"));
    }
    finally
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}

static void XmppOmemoLinuxSecretServiceVaultKeepsSecretsOutOfArguments()
{
    RunXmppOmemoLinuxSecretServiceVaultKeepsSecretsOutOfArgumentsAsync().GetAwaiter().GetResult();
}

static async Task RunXmppOmemoLinuxSecretServiceVaultKeepsSecretsOutOfArgumentsAsync()
{
    var runner = new RecordingSecretCommandRunner();
    var vault = new XmppOmemoLinuxSecretServiceVault(runner, requireLinux: false);
    const string secret = "correct horse battery staple";

    await vault.SaveSecretAsync("omemo/account", secret);
    Equal("secret-tool", runner.Calls[0].FileName);
    Equal("store", runner.Calls[0].Arguments[0]);
    True(runner.Calls[0].Arguments.Contains("--label"));
    True(runner.Calls[0].Arguments.Contains("Tiedragon OMEMO key-store passphrase"));
    True(runner.Calls[0].Arguments.Contains("application"));
    True(runner.Calls[0].Arguments.Contains("tiedragon-xmpp-messenger"));
    True(runner.Calls[0].Arguments.Contains("purpose"));
    True(runner.Calls[0].Arguments.Contains("omemo-key-store"));
    True(runner.Calls[0].Arguments.Contains("name"));
    True(runner.Calls[0].Arguments.Contains("omemo/account"));
    Equal(secret, runner.Calls[0].StandardInput);
    False(runner.Calls[0].Arguments.Contains(secret));

    runner.NextResult = new XmppOmemoSecretCommandResult(0, secret + Environment.NewLine, string.Empty);
    Equal(secret, await vault.LoadSecretAsync("omemo/account"));
    Equal("lookup", runner.Calls[1].Arguments[0]);
    True(runner.Calls[1].StandardInput is null);

    runner.NextResult = new XmppOmemoSecretCommandResult(1, string.Empty, "not found");
    True(await vault.LoadSecretAsync("omemo/missing") is null);

    runner.NextResult = new XmppOmemoSecretCommandResult(0, string.Empty, string.Empty);
    True(await vault.DeleteSecretAsync("omemo/account"));
    Equal("clear", runner.Calls[3].Arguments[0]);

    var unavailable = new XmppOmemoLinuxSecretServiceVault(
        new RecordingSecretCommandRunner(isAvailable: false),
        requireLinux: false);
    var missingCommand = Throws<PlatformNotSupportedException>(() =>
        unavailable.SaveSecretAsync("omemo/account", secret).GetAwaiter().GetResult());
    True(missingCommand.Message.Contains("secret-tool", StringComparison.Ordinal));
}

static void XmppOmemoSecretVaultFactorySelectsNativeProvider()
{
    var vault = XmppOmemoSecretVaultFactory.CreateDefault(Path.GetTempPath());
    True(vault is XmppOmemoWindowsDpapiSecretVault
        || vault is XmppOmemoLinuxSecretServiceVault
        || vault is XmppOmemoMacOSKeychainSecretVault
        || vault is XmppOmemoUnavailableSecretVault);

    if (OperatingSystem.IsWindows())
    {
        True(vault is XmppOmemoWindowsDpapiSecretVault);
    }
}

static void XmppOmemoRequiresProductionSignalProtocolBackend()
{
    var unavailable = XmppOmemoUnavailableSessionBackend.Instance;
    Equal("unavailable", unavailable.Name);
    False(unavailable.IsProductionReady);

    var guardException = Throws<InvalidOperationException>(
        () => XmppOmemoProductionGuard.RequireProductionBackend(unavailable));
    True(guardException.Message.Contains("Signal Protocol", StringComparison.Ordinal));

    var backendException = Throws<NotSupportedException>(
        () => unavailable.EnsureSessionAsync(CreateOmemoSessionSetupRequest()).GetAwaiter().GetResult());
    True(backendException.Message.Contains("X3DH", StringComparison.Ordinal));

    var production = new FakeProductionOmemoBackend();
    XmppOmemoProductionGuard.RequireProductionBackend(production);

    var setup = production.EnsureSessionAsync(CreateOmemoSessionSetupRequest()).GetAwaiter().GetResult();
    Equal(XmppOmemoTrust.ComputeFingerprintFromBase64("CQoLDA=="), setup.RemoteIdentityFingerprint);
    True(setup.UsedPreKey);

    var payloadSecret = Enumerable.Range(0, XmppOmemoPayloadCrypto.PayloadKeySize + XmppOmemoPayloadCrypto.NonceSize)
        .Select(value => (byte)value)
        .ToArray();
    var encrypted = production.EncryptPayloadSecretAsync(new XmppOmemoRatchetEncryptRequest(
        XmppAddress.Parse("edward@example.org"),
        123,
        XmppAddress.Parse("anna@example.org"),
        456,
        payloadSecret)).GetAwaiter().GetResult();
    Equal((uint)456, encrypted.KeyTransport.RecipientDeviceId);
    True(encrypted.KeyTransport.IsPreKey);
    True(XmppOmemo.IsValidBase64(encrypted.KeyTransport.CipherText));

    var decrypted = production.DecryptPayloadSecretAsync(new XmppOmemoRatchetDecryptRequest(
        XmppAddress.Parse("edward@example.org"),
        123,
        XmppAddress.Parse("anna@example.org"),
        456,
        encrypted.KeyTransport)).GetAwaiter().GetResult();
    Equal(Convert.ToBase64String(payloadSecret), Convert.ToBase64String(decrypted.PayloadSecret));
}

static void XmppOmemoX3DhValidatesKeysAndDerivesSecret()
{
    var plan = XmppOmemoX3Dh.CreateDhPlan(useOneTimePreKey: true);
    Equal(4, plan.Count);
    Equal("DH4", plan[3].Name);
    Equal("OPK_B", plan[3].BobKey);

    var noOneTimePreKeyPlan = XmppOmemoX3Dh.CreateDhPlan(useOneTimePreKey: false);
    Equal(3, noOneTimePreKeyPlan.Count);

    var bundle = new XmppOmemoBundle(
        SignedPreKeyPublic: "AQIDBA==",
        SignedPreKeyId: 77,
        SignedPreKeySignature: "BQYHCA==",
        IdentityKey: "CQoLDA==",
        PreKeys:
        [
            new XmppOmemoPreKey(10, "DQ4PEA=="),
            new XmppOmemoPreKey(11, "ERITFA==")
        ]);
    var validation = XmppOmemoX3Dh.ValidateBundle(bundle);
    True(validation.IsUsable);
    True(validation.HasOneTimePreKeys);
    Equal(0, validation.Issues.Count);

    var invalidValidation = XmppOmemoX3Dh.ValidateBundle(bundle with
    {
        IdentityKey = "not-base64",
        PreKeys = [new XmppOmemoPreKey(10, "AQID"), new XmppOmemoPreKey(10, "also-not-base64")]
    });
    False(invalidValidation.IsUsable);
    True(invalidValidation.Issues.Any(issue => issue.Contains("identityKey", StringComparison.Ordinal)));
    True(invalidValidation.Issues.Any(issue => issue.Contains("duplicate preKeyId 10", StringComparison.Ordinal)));

    var associatedData = XmppOmemoX3Dh.CreateAssociatedData(
        "AQIDBA==",
        "BQYHCA==",
        "alice@example.org",
        "bob@example.org");
    Equal("AQIDBAUGBwhhbGljZUBleGFtcGxlLm9yZwpib2JAZXhhbXBsZS5vcmc=", Convert.ToBase64String(associatedData));

    byte[] dh1 = [0x10, 0x11, 0x12, 0x13];
    byte[] dh2 = [0x20, 0x21, 0x22, 0x23];
    byte[] dh3 = [0x30, 0x31, 0x32, 0x33];
    byte[] dh4 = [0x40, 0x41, 0x42, 0x43];
    var threeDhSecret = XmppOmemoX3Dh.DeriveSharedSecret([dh1, dh2, dh3]);
    var fourDhSecret = XmppOmemoX3Dh.DeriveSharedSecret([dh1, dh2, dh3, dh4]);
    Equal(32, threeDhSecret.Length);
    Equal(32, fourDhSecret.Length);
    False(Convert.ToBase64String(threeDhSecret) == Convert.ToBase64String(fourDhSecret));
    Equal(Convert.ToBase64String(fourDhSecret), Convert.ToBase64String(XmppOmemoX3Dh.DeriveSharedSecret([dh1, dh2, dh3, dh4])));

    var x448Secret = XmppOmemoX3Dh.DeriveSharedSecret(
        [dh1, dh2, dh3, dh4],
        new XmppOmemoX3DhParameters(XmppOmemoX3DhCurve.X448, XmppOmemoX3DhHash.Sha512, "Tiedragon Teletyptel OMEMO X448 test"));
    Equal(32, x448Secret.Length);
    False(Convert.ToBase64String(fourDhSecret) == Convert.ToBase64String(x448Secret));
}

static void XmppOmemoX3DhAgreementMatchesInitiatorAndResponder()
{
    var aliceIdentity = XmppOmemoX3DhAgreement.GenerateIdentityKeyPair();
    var aliceEphemeral = XmppOmemoX3DhAgreement.GenerateEphemeralKeyPair();
    var bobIdentity = XmppOmemoX3DhAgreement.GenerateIdentityKeyPair();
    var bobSignedPreKey = XmppOmemoX3DhAgreement.GenerateSignedPreKeyPair();
    var bobOneTimePreKey = XmppOmemoX3DhAgreement.GenerateOneTimePreKeyPair(7001);

    var bobBundle = new XmppOmemoBundle(
        bobSignedPreKey.PublicKey,
        SignedPreKeyId: 77,
        SignedPreKeySignature: Convert.ToBase64String([1, 2, 3, 4]),
        bobIdentity.PublicKey,
        [new XmppOmemoPreKey(7001, bobOneTimePreKey.PublicKey)]);

    var aliceAgreement = XmppOmemoX3DhAgreement.InitiatorAgree(new XmppOmemoX3DhInitiatorAgreementRequest(
        XmppAddress.Parse("alice@example.org"),
        aliceIdentity,
        aliceEphemeral,
        XmppAddress.Parse("bob@example.org"),
        bobBundle,
        RemoteOneTimePreKeyId: 7001));

    var bobAgreement = XmppOmemoX3DhAgreement.ResponderAgree(new XmppOmemoX3DhResponderAgreementRequest(
        XmppAddress.Parse("bob@example.org"),
        bobIdentity,
        bobSignedPreKey,
        XmppAddress.Parse("alice@example.org"),
        aliceIdentity.PublicKey,
        aliceEphemeral.PublicKey,
        bobOneTimePreKey,
        OneTimePreKeyId: 7001));

    Equal((uint)7001, aliceAgreement.OneTimePreKeyId!.Value);
    Equal((uint)7001, bobAgreement.OneTimePreKeyId!.Value);
    Equal(4, aliceAgreement.DhPlan.Count);
    Equal("DH4", aliceAgreement.DhPlan[3].Name);
    Equal(Convert.ToBase64String(aliceAgreement.SharedSecret), Convert.ToBase64String(bobAgreement.SharedSecret));
    Equal(Convert.ToBase64String(aliceAgreement.AssociatedData), Convert.ToBase64String(bobAgreement.AssociatedData));

    var bobBundleWithoutOneTimePreKey = bobBundle with { PreKeys = [] };
    var aliceThreeDh = XmppOmemoX3DhAgreement.InitiatorAgree(new XmppOmemoX3DhInitiatorAgreementRequest(
        XmppAddress.Parse("alice@example.org"),
        aliceIdentity,
        aliceEphemeral,
        XmppAddress.Parse("bob@example.org"),
        bobBundleWithoutOneTimePreKey));
    var bobThreeDh = XmppOmemoX3DhAgreement.ResponderAgree(new XmppOmemoX3DhResponderAgreementRequest(
        XmppAddress.Parse("bob@example.org"),
        bobIdentity,
        bobSignedPreKey,
        XmppAddress.Parse("alice@example.org"),
        aliceIdentity.PublicKey,
        aliceEphemeral.PublicKey));

    Equal(3, aliceThreeDh.DhPlan.Count);
    Equal(Convert.ToBase64String(aliceThreeDh.SharedSecret), Convert.ToBase64String(bobThreeDh.SharedSecret));
    False(Convert.ToBase64String(aliceAgreement.SharedSecret) == Convert.ToBase64String(aliceThreeDh.SharedSecret));

    var mismatch = Throws<InvalidOperationException>(() =>
        XmppOmemoX3DhAgreement.ResponderAgree(new XmppOmemoX3DhResponderAgreementRequest(
            XmppAddress.Parse("bob@example.org"),
            bobIdentity,
            bobSignedPreKey,
            XmppAddress.Parse("alice@example.org"),
            aliceIdentity.PublicKey,
            aliceEphemeral.PublicKey,
            bobOneTimePreKey,
            OneTimePreKeyId: 7002)));
    True(mismatch.Message.Contains("one-time pre-key id", StringComparison.Ordinal));
}

static void XmppOmemoX3DhGatesSignedPreKeyVerification()
{
    var aliceIdentity = XmppOmemoX3DhAgreement.GenerateIdentityKeyPair();
    var aliceEphemeral = XmppOmemoX3DhAgreement.GenerateEphemeralKeyPair();
    var bobIdentity = XmppOmemoX3DhAgreement.GenerateIdentityKeyPair();
    var bobSignedPreKey = XmppOmemoX3DhAgreement.GenerateSignedPreKeyPair();
    var bobOneTimePreKey = XmppOmemoX3DhAgreement.GenerateOneTimePreKeyPair(7001);
    var signature = Convert.ToBase64String([8, 7, 6, 5]);

    var bobBundle = new XmppOmemoBundle(
        bobSignedPreKey.PublicKey,
        SignedPreKeyId: 77,
        signature,
        bobIdentity.PublicKey,
        [new XmppOmemoPreKey(7001, bobOneTimePreKey.PublicKey)]);

    var unavailable = Throws<InvalidOperationException>(() =>
        XmppOmemoX3DhAgreement.InitiatorAgree(new XmppOmemoX3DhInitiatorAgreementRequest(
            XmppAddress.Parse("alice@example.org"),
            aliceIdentity,
            aliceEphemeral,
            XmppAddress.Parse("bob@example.org"),
            bobBundle,
            RemoteOneTimePreKeyId: 7001,
            RequireSignedPreKeyVerification: true)));
    True(unavailable.Message.Contains("signed pre-key verification failed", StringComparison.Ordinal));

    var rejectingVerifier = new RecordingSignedPreKeyVerifier(isValid: false);
    var rejected = Throws<InvalidOperationException>(() =>
        XmppOmemoX3DhAgreement.InitiatorAgree(new XmppOmemoX3DhInitiatorAgreementRequest(
            XmppAddress.Parse("alice@example.org"),
            aliceIdentity,
            aliceEphemeral,
            XmppAddress.Parse("bob@example.org"),
            bobBundle,
            RemoteOneTimePreKeyId: 7001,
            RequireSignedPreKeyVerification: true,
            SignedPreKeyVerifier: rejectingVerifier)));
    True(rejected.Message.Contains("test signature rejected", StringComparison.Ordinal));
    Equal("bob@example.org", rejectingVerifier.LastRequest!.Owner.Bare);

    var acceptingVerifier = new RecordingSignedPreKeyVerifier(isValid: true);
    var agreement = XmppOmemoX3DhAgreement.InitiatorAgree(new XmppOmemoX3DhInitiatorAgreementRequest(
        XmppAddress.Parse("alice@example.org"),
        aliceIdentity,
        aliceEphemeral,
        XmppAddress.Parse("bob@example.org"),
        bobBundle,
        RemoteOneTimePreKeyId: 7001,
        RequireSignedPreKeyVerification: true,
        SignedPreKeyVerifier: acceptingVerifier));

    True(agreement.SignedPreKeyVerification is not null);
    True(agreement.SignedPreKeyVerification!.IsVerified);
    Equal("recording-signed-pre-key", agreement.SignedPreKeyVerification.VerifierName);
    Equal("bob@example.org", acceptingVerifier.LastRequest!.Owner.Bare);
    Equal(bobIdentity.PublicKey, acceptingVerifier.LastRequest.IdentityKey);
    Equal((uint)77, acceptingVerifier.LastRequest.SignedPreKeyId);
    Equal(bobSignedPreKey.PublicKey, acceptingVerifier.LastRequest.SignedPreKeyPublic);
    Equal(signature, acceptingVerifier.LastRequest.SignedPreKeySignature);
}

static XmppOmemoSessionSetupRequest CreateOmemoSessionSetupRequest()
{
    return new XmppOmemoSessionSetupRequest(
        XmppAddress.Parse("edward@example.org"),
        123,
        XmppAddress.Parse("anna@example.org"),
        456,
        new XmppOmemoBundle(
            SignedPreKeyPublic: "AQIDBA==",
            SignedPreKeyId: 77,
            SignedPreKeySignature: "BQYHCA==",
            IdentityKey: "CQoLDA==",
            PreKeys: [new XmppOmemoPreKey(10, "DQ4PEA==")]),
        XmppOmemoTrustState.Trusted);
}

static void XmppJingleSerializesSessionInitiateAndParse()
{
    var content = XmppJingle.CreateRtpContent(
        "audio",
        "audio",
        [new XmppJinglePayloadType(111, "opus", 48000, 2)]);
    var iq = XmppJingle.CreateSessionInitiate(
        "jingle-1",
        XmppAddress.Parse("anna@example.org/phone"),
        "sid-1",
        "initiator",
        [content]);
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("urn:xmpp:jingle:1", StringComparison.Ordinal));
    True(xml.Contains("action=\"session-initiate\"", StringComparison.Ordinal));
    True(xml.Contains("urn:xmpp:jingle:apps:rtp:1", StringComparison.Ordinal));
    True(xml.Contains("name=\"opus\"", StringComparison.Ordinal));

    True(XmppJingle.TryParse(iq, out var session));
    Equal("sid-1", session!.Sid);
    Equal("session-initiate", session.Action);
    Equal(1, session.Contents.Count);
    Equal("audio", session.Contents[0].Name);
}

static void XmppJingleMessageInitiationSerializesCallSetup()
{
    const string sessionId = "ca3cf894-5325-482f-a412-a6e9f832298d";
    var propose = XmppJingleMessageInitiation.CreateAudioVideoCallProposeMessage(
        XmppAddress.Parse("juliet@capulet.example"),
        sessionId,
        messageId: "msg-1",
        from: XmppAddress.Parse("romeo@montague.example/orchard"));
    var xml = propose.ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("urn:xmpp:jingle-message:0", StringComparison.Ordinal));
    True(xml.Contains("<propose", StringComparison.Ordinal));
    True(xml.Contains("id=\"ca3cf894-5325-482f-a412-a6e9f832298d\"", StringComparison.Ordinal));
    True(xml.Contains("media=\"audio\"", StringComparison.Ordinal));
    True(xml.Contains("media=\"video\"", StringComparison.Ordinal));
    True(xml.Contains("<store", StringComparison.Ordinal));

    True(XmppJingleMessageInitiation.TryParse(propose, out var parsed));
    Equal(XmppJingleMessageInitiation.ProposeAction, parsed!.Action);
    Equal(sessionId, parsed.SessionId);
    Equal("romeo@montague.example", parsed.From!.Bare);
    Equal("juliet@capulet.example", parsed.To!.Bare);
    Equal(2, parsed.Descriptions.Count);
    True(parsed.HasStoreHint);

    var info = new XmppServiceDiscoveryInfo(
        Node: null,
        Identities: [],
        Features:
        [
            XmppJingle.RtpNamespaceName,
            XmppJingle.RtpAudioFeature,
            XmppJingle.RtpVideoFeature
        ]);
    True(XmppJingle.SupportsRtpAudio(info));
    True(XmppJingle.SupportsRtpVideo(info));
}

static void XmppJingleMessageInitiationParsesCallLifecycle()
{
    const string oldSession = "ca3cf894-5325-482f-a412-a6e9f832298d";
    const string newSession = "989a46a6-f202-4910-a7c3-83c6ba3f3947";
    var ringing = XmppJingleMessageInitiation.CreateRingingMessage(
        XmppAddress.Parse("romeo@montague.example/orchard"),
        oldSession,
        from: XmppAddress.Parse("juliet@capulet.example/phone"));
    True(XmppJingleMessageInitiation.TryParse(ringing, out var ringingEvent));
    Equal(XmppJingleMessageInitiation.RingingAction, ringingEvent!.Action);

    var proceed = XmppJingleMessageInitiation.CreateProceedMessage(
        XmppAddress.Parse("romeo@montague.example/orchard"),
        oldSession,
        from: XmppAddress.Parse("juliet@capulet.example/phone"));
    True(XmppJingleMessageInitiation.TryParse(proceed, out var proceedEvent));
    Equal(XmppJingleMessageInitiation.ProceedAction, proceedEvent!.Action);

    var reject = XmppJingleMessageInitiation.CreateRejectMessage(
        XmppAddress.Parse("juliet@capulet.example"),
        "fecbea35-08d3-404f-9ec7-2b57c566fa74",
        "expired",
        "Tie-Break",
        tieBreak: true);
    True(XmppJingleMessageInitiation.TryParse(reject, out var rejectEvent));
    Equal(XmppJingleMessageInitiation.RejectAction, rejectEvent!.Action);
    True(rejectEvent.IsTieBreak);
    Equal("expired", rejectEvent.Reason!.Condition);

    var finish = XmppJingleMessageInitiation.CreateFinishMessage(
        XmppAddress.Parse("juliet@capulet.example"),
        oldSession,
        "expired",
        "Session migrated",
        migratedTo: newSession);
    True(XmppJingleMessageInitiation.TryParse(finish, out var finishEvent));
    Equal(XmppJingleMessageInitiation.FinishAction, finishEvent!.Action);
    Equal(newSession, finishEvent.MigratedTo);
    Equal("expired", finishEvent.Reason!.Condition);

    var retract = XmppJingleMessageInitiation.CreateRetractMessage(
        XmppAddress.Parse("juliet@capulet.example"),
        oldSession,
        text: "Retracted");
    True(XmppJingleMessageInitiation.TryParse(retract, out var retractEvent));
    Equal(XmppJingleMessageInitiation.RetractAction, retractEvent!.Action);
    Equal("cancel", retractEvent.Reason!.Condition);

    Equal(newSession, XmppJingleMessageInitiation.GetTieBreakWinner(oldSession, newSession));
}

static void XmppJingleSerializesIceCandidatesAndDtlsFingerprints()
{
    var transport = new XmppJingleIceUdpTransport(
        Ufrag: "8hhy",
        Password: "asd88fgpdd777uzjYhagZg",
        Candidates:
        [
            new XmppJingleIceCandidate(
                "el0747fg11",
                Component: 1,
                Foundation: "1",
                Generation: 0,
                Ip: "192.0.2.3",
                Network: 1,
                Port: 45664,
                Priority: 1694498815,
                Protocol: "udp",
                Type: "srflx",
                RelatedAddress: "10.0.1.1",
                RelatedPort: 8998)
        ],
        Fingerprints:
        [
            new XmppJingleDtlsFingerprint(
                "sha-256",
                "02:1A:CC:54:27:AB:EB:9C:53:3F:3E:4B:65:2E:7D:46:3F:54:42:CD:54:F1:7A:03:A2:7D:F9:B0:7F:46:19:B2",
                "actpass")
        ]);
    var content = XmppJingle.CreateRtpContent(
        "voice",
        "audio",
        [
            new XmppJinglePayloadType(
                111,
                "opus",
                48000,
                2,
                new Dictionary<string, string>
                {
                    ["minptime"] = "10",
                    ["useinbandfec"] = "1"
                })
        ],
        transport: transport);
    var iq = XmppJingle.CreateSessionInitiate(
        "jingle-ice-1",
        XmppAddress.Parse("anna@example.org/phone"),
        "sid-ice-1",
        "initiator",
        [content],
        initiator: "edward@example.org/laptop");
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("ufrag=\"8hhy\"", StringComparison.Ordinal));
    True(xml.Contains("pwd=\"asd88fgpdd777uzjYhagZg\"", StringComparison.Ordinal));
    True(xml.Contains("rel-addr=\"10.0.1.1\"", StringComparison.Ordinal));
    True(xml.Contains("urn:xmpp:jingle:apps:dtls:0", StringComparison.Ordinal));
    True(xml.Contains("useinbandfec", StringComparison.Ordinal));

    True(XmppJingle.TryParse(iq, out var session));
    Equal("edward@example.org/laptop", session!.Initiator);
    var payloadTypes = XmppJingle.ParsePayloadTypes(session.Contents[0]);
    Equal(1, payloadTypes.Count);
    Equal("opus", payloadTypes[0].Name);
    Equal("1", payloadTypes[0].Parameters!["useinbandfec"]);
    True(XmppJingle.TryParseIceUdpTransport(session.Contents[0], out var parsedTransport));
    Equal("8hhy", parsedTransport!.Ufrag);
    Equal("asd88fgpdd777uzjYhagZg", parsedTransport.Password);
    Equal(1, parsedTransport.Candidates!.Count);
    Equal("srflx", parsedTransport.Candidates[0].Type);
    Equal("10.0.1.1", parsedTransport.Candidates[0].RelatedAddress);
    Equal(1, parsedTransport.Fingerprints!.Count);
    Equal("actpass", parsedTransport.Fingerprints[0].Setup);
}

static void XmppJingleSerializesTransportInfoCandidates()
{
    var transport = new XmppJingleIceUdpTransport(
        Ufrag: "newu",
        Password: "newp",
        Candidates:
        [
            new XmppJingleIceCandidate(
                "m3110wc4nd",
                Component: 1,
                Foundation: "1",
                Generation: 0,
                Ip: "2001:db8::9:1",
                Network: 0,
                Port: 9001,
                Priority: 21149780477,
                Protocol: "udp",
                Type: "host")
        ]);
    var iq = XmppJingle.CreateTransportInfo(
        "transport-info-1",
        XmppAddress.Parse("anna@example.org/phone"),
        "sid-ice-1",
        "initiator",
        [XmppJingle.CreateTransportContent("voice", transport)],
        initiator: "edward@example.org/laptop");
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains("action=\"transport-info\"", StringComparison.Ordinal));
    True(xml.Contains("priority=\"21149780477\"", StringComparison.Ordinal));
    True(XmppJingle.TryParse(iq, out var session));
    Equal("transport-info", session!.Action);
    True(XmppJingle.TryParseIceUdpTransport(session.Contents[0], out var parsedTransport));
    Equal(21149780477, parsedTransport!.Candidates![0].Priority);
}

static void XmppJingleSerializesSessionInfoCallStates()
{
    var ringing = XmppJingle.CreateRinging(
        "ring-1",
        XmppAddress.Parse("edward@example.org/laptop"),
        "sid-call-1",
        initiator: "anna@example.org/phone");
    True(XmppJingle.TryParse(ringing, out var ringingSession));
    Equal("session-info", ringingSession!.Action);
    Equal("ringing", ringingSession.SessionInfo!.Name.LocalName);

    var mute = XmppJingle.CreateMute(
        "mute-1",
        XmppAddress.Parse("anna@example.org/phone"),
        "sid-call-1",
        creator: "initiator",
        name: "audio");
    True(XmppJingle.TryParse(mute, out var muteSession));
    Equal("mute", muteSession!.SessionInfo!.Name.LocalName);
    Equal("initiator", muteSession.SessionInfo.Attribute("creator")?.Value);
    Equal("audio", muteSession.SessionInfo.Attribute("name")?.Value);

    var terminate = XmppJingle.CreateSessionTerminate(
        "term-1",
        XmppAddress.Parse("anna@example.org/phone"),
        "sid-call-1",
        "decline",
        "busy");
    True(XmppJingle.TryParse(terminate, out var terminated));
    Equal("decline", terminated!.Reason!.Condition);
    Equal("busy", terminated.Reason.Text);
}

static void XmppJingleParsesExistingClientInteropFixture()
{
    const string sessionInitiateXml = """
        <iq xmlns="jabber:client" type="set" id="dino-a1" from="anna@example.net/dino" to="edward@example.org/web">
          <jingle xmlns="urn:xmpp:jingle:1" action="session-initiate" sid="dino-sid-1" initiator="anna@example.net/dino">
            <content creator="initiator" name="audio" senders="both">
              <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="audio" ssrc="18273645">
                <payload-type id="111" name="opus" clockrate="48000" channels="2">
                  <parameter name="minptime" value="10" />
                  <parameter name="useinbandfec" value="1" />
                </payload-type>
                <rtcp-mux />
                <extmap xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0" id="1" uri="urn:ietf:params:rtp-hdrext:ssrc-audio-level" />
              </description>
              <transport xmlns="urn:xmpp:jingle:transports:ice-udp:1" ufrag="dinoAudioUfrag" pwd="dinoAudioPassword">
                <fingerprint xmlns="urn:xmpp:jingle:apps:dtls:0" setup="actpass" hash="sha-256">
                  AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
                </fingerprint>
                <candidate component="1" foundation="1" generation="0" id="a-host-1" ip="192.0.2.12" network="1" port="54678" priority="2130706431" protocol="udp" type="host" />
              </transport>
            </content>
            <content creator="initiator" name="video" senders="both">
              <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="video" ssrc="82736451">
                <payload-type id="96" name="VP8" clockrate="90000" />
                <payload-type id="97" name="rtx" clockrate="90000">
                  <parameter name="apt" value="96" />
                </payload-type>
                <rtcp-mux />
              </description>
              <transport xmlns="urn:xmpp:jingle:transports:ice-udp:1" ufrag="dinoVideoUfrag" pwd="dinoVideoPassword">
                <fingerprint xmlns="urn:xmpp:jingle:apps:dtls:0" setup="actpass" hash="sha-256">
                  01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF
                </fingerprint>
                <candidate component="1" foundation="2" generation="0" id="v-tcp-1" ip="2001:db8::20" network="0" port="9" priority="1518280447" protocol="tcp" tcptype="passive" type="host" />
              </transport>
            </content>
          </jingle>
        </iq>
        """;

    True(XmppIq.TryParse(sessionInitiateXml, out var iq));
    True(XmppJingle.TryParse(iq!, out var session));
    Equal("session-initiate", session!.Action);
    Equal("dino-sid-1", session.Sid);
    Equal("anna@example.net/dino", session.Initiator);
    Equal(2, session.Contents.Count);

    var audio = session.Contents.Single(content => content.Name == "audio");
    Equal("initiator", audio.Creator);
    Equal("both", audio.Senders);
    var audioPayloads = XmppJingle.ParsePayloadTypes(audio);
    Equal(1, audioPayloads.Count);
    Equal("opus", audioPayloads[0].Name);
    Equal("1", audioPayloads[0].Parameters!["useinbandfec"]);
    True(audio.Description!.Elements().Any(element => element.Name.LocalName == "rtcp-mux"));
    True(XmppJingle.TryParseIceUdpTransport(audio, out var audioTransport));
    Equal("dinoAudioUfrag", audioTransport!.Ufrag);
    Equal(1, audioTransport.Candidates!.Count);
    Equal("host", audioTransport.Candidates[0].Type);
    Equal(1, audioTransport.Fingerprints!.Count);
    Equal("actpass", audioTransport.Fingerprints[0].Setup);

    var video = session.Contents.Single(content => content.Name == "video");
    var videoPayloads = XmppJingle.ParsePayloadTypes(video);
    Equal(2, videoPayloads.Count);
    Equal("VP8", videoPayloads[0].Name);
    Equal("rtx", videoPayloads[1].Name);
    Equal("96", videoPayloads[1].Parameters!["apt"]);
    True(XmppJingle.TryParseIceUdpTransport(video, out var videoTransport));
    Equal("tcp", videoTransport!.Candidates![0].Protocol);
    Equal("passive", videoTransport.Candidates[0].TcpType);

    const string transportInfoXml = """
        <iq xmlns="jabber:client" type="set" id="dino-trickle-1" from="anna@example.net/dino" to="edward@example.org/web">
          <jingle xmlns="urn:xmpp:jingle:1" action="transport-info" sid="dino-sid-1" initiator="anna@example.net/dino">
            <content creator="initiator" name="audio">
              <transport xmlns="urn:xmpp:jingle:transports:ice-udp:1" ufrag="dinoAudioUfrag" pwd="dinoAudioPassword">
                <candidate component="1" foundation="3" generation="0" id="a-srflx-1" ip="198.51.100.24" network="1" port="62000" priority="1694498815" protocol="udp" rel-addr="10.0.0.12" rel-port="54678" type="srflx" />
              </transport>
            </content>
          </jingle>
        </iq>
        """;

    True(XmppIq.TryParse(transportInfoXml, out var transportInfoIq));
    True(XmppJingle.TryParse(transportInfoIq!, out var transportInfo));
    Equal("transport-info", transportInfo!.Action);
    True(XmppJingle.TryParseIceUdpTransport(transportInfo.Contents.Single(), out var trickleTransport));
    var trickleCandidate = trickleTransport!.Candidates!.Single();
    Equal("srflx", trickleCandidate.Type);
    Equal("10.0.0.12", trickleCandidate.RelatedAddress);

    const string sessionInfoXml = """
        <iq xmlns="jabber:client" type="set" id="dino-mute-1" from="anna@example.net/dino" to="edward@example.org/web">
          <jingle xmlns="urn:xmpp:jingle:1" action="session-info" sid="dino-sid-1" initiator="anna@example.net/dino" responder="edward@example.org/web">
            <mute xmlns="urn:xmpp:jingle:apps:rtp:info:1" creator="initiator" name="video" />
          </jingle>
        </iq>
        """;

    True(XmppIq.TryParse(sessionInfoXml, out var sessionInfoIq));
    True(XmppJingle.TryParse(sessionInfoIq!, out var sessionInfo));
    Equal("session-info", sessionInfo!.Action);
    Equal("mute", sessionInfo.SessionInfo!.Name.LocalName);
    Equal("video", sessionInfo.SessionInfo.Attribute("name")?.Value);
}

static void XmppJingleFileTransferSerializesS5bOffer()
{
    var initiator = XmppAddress.Parse("romeo@montague.lit/orchard");
    var responder = XmppAddress.Parse("juliet@capulet.lit/balcony");
    var dstaddr = XmppJingleSocks5Bytestreams.ComputeDestinationAddress("vj3hs98y", initiator, responder);
    var transport = new XmppJingleSocks5Transport(
        "vj3hs98y",
        dstaddr,
        Candidates:
        [
            new XmppJingleSocks5Candidate(
                "hft54dqy",
                "192.168.4.1",
                initiator,
                5086,
                8257636,
                "direct"),
            new XmppJingleSocks5Candidate(
                "xmdh4b7i",
                "streamer.shakespeare.lit",
                XmppAddress.Parse("streamer.shakespeare.lit"),
                7625,
                7878787,
                "proxy")
        ]);
    var file = new XmppJingleFile(
        "test.txt",
        Size: 6144,
        MediaType: "text/plain",
        Date: DateTimeOffset.Parse("2015-07-26T21:46:00+01:00", CultureInfo.InvariantCulture),
        Description: "Tiny transfer",
        Hashes: [new XmppJingleFileHash("sha-1", "w0mcJylzCn+AfvuGdqkty2+KP48=")]);
    var content = XmppJingleFileTransfer.CreateFileContent(
        "file-offer",
        file,
        transport.ToXml());
    var iq = XmppJingle.CreateSessionInitiate(
        "jft-1",
        responder,
        "jingle-sid-1",
        "initiator",
        [content],
        initiator.Full);
    var xml = iq.ToXml().ToString(SaveOptions.DisableFormatting);

    True(xml.Contains(XmppJingleFileTransfer.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains(XmppJingleSocks5Bytestreams.NamespaceName, StringComparison.Ordinal));
    True(xml.Contains("media-type", StringComparison.Ordinal));
    True(xml.Contains("candidate", StringComparison.Ordinal));
    True(xml.Contains("dstaddr=\"972b7bf47291ca609517f67f86b5081086052dad\"", StringComparison.Ordinal));

    True(XmppJingle.TryParse(iq, out var session));
    True(XmppJingleFileTransfer.TryParseFile(session!.Contents.Single(), out var parsedFile));
    Equal("test.txt", parsedFile!.Name);
    Equal(6144L, parsedFile.Size!.Value);
    Equal("sha-1", parsedFile.Hashes![0].Algorithm);
    True(XmppJingleSocks5Bytestreams.TryParseTransport(session.Contents.Single(), out var parsedTransport));
    Equal("vj3hs98y", parsedTransport!.StreamId);
    Equal("proxy", parsedTransport.Candidates![1].Type);
}

static void XmppJingleFileTransferParsesReceivedAndChecksumInfo()
{
    var received = XmppJingleFileTransfer.CreateReceivedInfo("initiator", "file-offer");
    True(XmppJingleFileTransfer.TryParseReceivedInfo(received, out var receivedInfo));
    Equal("received", receivedInfo!.Kind);
    Equal("file-offer", receivedInfo.Name);

    var checksum = XmppJingleFileTransfer.CreateChecksumInfo(
        "initiator",
        "file-offer",
        [new XmppJingleFileHash("sha-256", "Mb5I5OB9L0yDyGZqjOmCwXlZs8Y=")]);
    True(XmppJingleFileTransfer.TryParseChecksumInfo(checksum, out var checksumInfo));
    Equal("checksum", checksumInfo!.Kind);
    Equal("sha-256", checksumInfo.Hashes![0].Algorithm);

    var usedTransport = new XmppJingleSocks5Transport(
        "vj3hs98y",
        CandidateUsed: new XmppJingleSocks5CandidateUsed("hft54dqy"));
    True(XmppJingleSocks5Transport.TryParse(usedTransport.ToXml(), out var parsedUsed));
    Equal("hft54dqy", parsedUsed!.CandidateUsed!.CandidateId);

    var activatedTransport = new XmppJingleSocks5Transport(
        "vj3hs98y",
        Activated: new XmppJingleSocks5Activated("xmdh4b7i"));
    True(XmppJingleSocks5Transport.TryParse(activatedTransport.ToXml(), out var parsedActivated));
    Equal("xmdh4b7i", parsedActivated!.Activated!.CandidateId);
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

static T Throws<T>(Action action)
    where T : Exception
{
    try
    {
        action();
    }
    catch (T ex)
    {
        return ex;
    }

    throw new InvalidOperationException($"Expected exception {typeof(T).Name}.");
}

sealed class FakeTlsStreamUpgrader(Action onUpgrade) : IXmppTlsStreamUpgrader
{
    public List<XmppTlsClientOptions> Options { get; } = [];

    public Task<Stream> UpgradeAsync(Stream stream, string targetHost, CancellationToken cancellationToken)
    {
        return UpgradeAsync(stream, XmppTlsClientOptions.ForStartTls(targetHost), cancellationToken);
    }

    public Task<Stream> UpgradeAsync(Stream stream, XmppTlsClientOptions options, CancellationToken cancellationToken)
    {
        onUpgrade();
        Options.Add(options);
        return Task.FromResult(stream);
    }
}

sealed class FakeSrvResolver : IXmppSrvResolver
{
    public Dictionary<string, IReadOnlyList<XmppSrvRecord>> Records { get; } =
        new(StringComparer.OrdinalIgnoreCase);

    public List<string> Queries { get; } = [];

    public Task<IReadOnlyList<XmppSrvRecord>> QuerySrvAsync(
        string srvName,
        CancellationToken cancellationToken = default)
    {
        Queries.Add(srvName);
        return Task.FromResult(
            Records.TryGetValue(srvName, out var records)
                ? records
                : Array.Empty<XmppSrvRecord>());
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

sealed class FakeProductionOmemoBackend : IXmppOmemoSessionBackend
{
    public string Name => "test-production-shape";

    public bool IsProductionReady => true;

    public XmppOmemoBackendCapability Capabilities =>
        XmppOmemoBackendCapability.X3Dh
        | XmppOmemoBackendCapability.DoubleRatchet
        | XmppOmemoBackendCapability.PersistentSessionStore
        | XmppOmemoBackendCapability.SignedPreKeyVerification
        | XmppOmemoBackendCapability.OneTimePreKeyConsumption;

    public Task<XmppOmemoSessionSetupResult> EnsureSessionAsync(
        XmppOmemoSessionSetupRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = cancellationToken;
        if (request.TrustState != XmppOmemoTrustState.Trusted)
        {
            throw new InvalidOperationException("The remote OMEMO identity is not trusted.");
        }

        return Task.FromResult(new XmppOmemoSessionSetupResult(
            request.RemoteAccount,
            request.RemoteDeviceId,
            XmppOmemoTrust.ComputeFingerprintFromBase64(request.RemoteBundle.IdentityKey),
            UsedPreKey: true));
    }

    public Task<XmppOmemoRatchetEncryptResult> EncryptPayloadSecretAsync(
        XmppOmemoRatchetEncryptRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = cancellationToken;
        return Task.FromResult(new XmppOmemoRatchetEncryptResult(
            new XmppOmemoKeyTransport(
                request.RemoteDeviceId,
                Convert.ToBase64String(request.PayloadSecret),
                IsPreKey: true,
                request.RemoteAccount)));
    }

    public Task<XmppOmemoRatchetDecryptResult> DecryptPayloadSecretAsync(
        XmppOmemoRatchetDecryptRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = cancellationToken;
        return Task.FromResult(new XmppOmemoRatchetDecryptResult(
            Convert.FromBase64String(request.KeyTransport.CipherText)));
    }
}

sealed class RecordingSignedPreKeyVerifier : IXmppOmemoSignedPreKeyVerifier
{
    private readonly bool _isValid;

    public RecordingSignedPreKeyVerifier(bool isValid)
    {
        _isValid = isValid;
    }

    public string Name => "recording-signed-pre-key";

    public bool IsAudited => true;

    public XmppOmemoSignedPreKeyVerificationRequest? LastRequest { get; private set; }

    public XmppOmemoSignedPreKeyVerification Verify(XmppOmemoSignedPreKeyVerificationRequest request)
    {
        LastRequest = request;
        return _isValid
            ? XmppOmemoSignedPreKeyVerification.Verified(Name)
            : XmppOmemoSignedPreKeyVerification.Failed("test signature rejected", Name);
    }
}

sealed class RecordingSecretCommandRunner : IXmppOmemoSecretCommandRunner
{
    private readonly bool _isAvailable;

    public RecordingSecretCommandRunner(bool isAvailable = true)
    {
        _isAvailable = isAvailable;
    }

    public List<SecretCommandCall> Calls { get; } = [];

    public XmppOmemoSecretCommandResult NextResult { get; set; } =
        new(0, string.Empty, string.Empty);

    public bool IsCommandAvailable(string fileName)
    {
        if (!string.Equals("secret-tool", fileName, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Unexpected command lookup: " + fileName);
        }

        return _isAvailable;
    }

    public Task<XmppOmemoSecretCommandResult> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        string? standardInput = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Calls.Add(new SecretCommandCall(fileName, arguments.ToArray(), standardInput));
        return Task.FromResult(NextResult);
    }
}

sealed record SecretCommandCall(
    string FileName,
    IReadOnlyList<string> Arguments,
    string? StandardInput);

sealed class SequenceHttpHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, string, HttpResponseMessage>> _responses;

    public SequenceHttpHandler(params Func<HttpRequestMessage, string, HttpResponseMessage>[] responses)
    {
        _responses = new Queue<Func<HttpRequestMessage, string, HttpResponseMessage>>(responses);
    }

    public List<string> Requests { get; } = [];

    public static HttpResponseMessage XmlResponse(string xml)
    {
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(xml, Encoding.UTF8, "text/xml")
        };
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        if (_responses.Count == 0)
        {
            throw new InvalidOperationException("Unexpected HTTP request: " + request.RequestUri);
        }

        var content = request.Content is null
            ? string.Empty
            : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add(content);
        return _responses.Dequeue()(request, content);
    }
}

sealed class RecordingHttpHandler : HttpMessageHandler
{
    public HttpMethod? Method { get; private set; }

    public Uri? RequestUri { get; private set; }

    public string? Authorization { get; private set; }

    public string? ContentType { get; private set; }

    public long? ContentLength { get; private set; }

    public bool IgnoredHeaderPresent { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Method = request.Method;
        RequestUri = request.RequestUri;
        Authorization = request.Headers.Authorization?.ToString();
        ContentType = request.Content?.Headers.ContentType?.ToString();
        ContentLength = request.Content?.Headers.ContentLength;
        IgnoredHeaderPresent = request.Headers.Contains("X-Ignore")
            || (request.Content?.Headers.Contains("X-Ignore") ?? false);
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Created));
    }
}
