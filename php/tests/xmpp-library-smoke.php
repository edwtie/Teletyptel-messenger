<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppAdHocCommands;
use Tiedragon\Xmpp\XmppDisco;
use Tiedragon\Xmpp\XmppAlternateConnection;
use Tiedragon\Xmpp\XmppAvatar;
use Tiedragon\Xmpp\XmppBlocking;
use Tiedragon\Xmpp\XmppBookmarks;
use Tiedragon\Xmpp\XmppDataForm;
use Tiedragon\Xmpp\XmppFeatures;
use Tiedragon\Xmpp\XmppGeoloc;
use Tiedragon\Xmpp\XmppHttpUpload;
use Tiedragon\Xmpp\XmppInBandBytestreams;
use Tiedragon\Xmpp\XmppInBandRegistration;
use Tiedragon\Xmpp\XmppIncomingStanza;
use Tiedragon\Xmpp\XmppJid;
use Tiedragon\Xmpp\XmppJingle;
use Tiedragon\Xmpp\XmppJingleFileTransfer;
use Tiedragon\Xmpp\XmppJingleInBandBytestreams;
use Tiedragon\Xmpp\XmppJingleSocks5Bytestreams;
use Tiedragon\Xmpp\XmppMam;
use Tiedragon\Xmpp\XmppBind;
use Tiedragon\Xmpp\XmppBosh;
use Tiedragon\Xmpp\XmppClientState;
use Tiedragon\Xmpp\XmppClientAccessManagement;
use Tiedragon\Xmpp\XmppEmojiMarkup;
use Tiedragon\Xmpp\XmppEntityCapabilities;
use Tiedragon\Xmpp\XmppError;
use Tiedragon\Xmpp\XmppExternalServices;
use Tiedragon\Xmpp\XmppMessageCarbons;
use Tiedragon\Xmpp\XmppMessageLifecycle;
use Tiedragon\Xmpp\XmppMeCommand;
use Tiedragon\Xmpp\XmppMediaSharing;
use Tiedragon\Xmpp\XmppMessageMetadata;
use Tiedragon\Xmpp\XmppMessageModeration;
use Tiedragon\Xmpp\XmppMessageStyling;
use Tiedragon\Xmpp\XmppMuc;
use Tiedragon\Xmpp\XmppOmemo;
use Tiedragon\Xmpp\XmppOmemoDoubleRatchet;
use Tiedragon\Xmpp\XmppConnectionSettings;
use Tiedragon\Xmpp\XmppPresence;
use Tiedragon\Xmpp\XmppPersistentPrivateData;
use Tiedragon\Xmpp\XmppPersonalEventing;
use Tiedragon\Xmpp\XmppPrivateStorage;
use Tiedragon\Xmpp\XmppPublicChannelSearch;
use Tiedragon\Xmpp\XmppPubSub;
use Tiedragon\Xmpp\XmppPubSubAnnouncements;
use Tiedragon\Xmpp\XmppPush;
use Tiedragon\Xmpp\XmppResultSetManagement;
use Tiedragon\Xmpp\XmppRoster;
use Tiedragon\Xmpp\XmppRtt;
use Tiedragon\Xmpp\XmppSasl;
use Tiedragon\Xmpp\XmppSaslScram;
use Tiedragon\Xmpp\XmppSession;
use Tiedragon\Xmpp\XmppServiceContactAddresses;
use Tiedragon\Xmpp\XmppSocks5Bytestreams;
use Tiedragon\Xmpp\XmppStanza;
use Tiedragon\Xmpp\XmppStream;
use Tiedragon\Xmpp\XmppStreamBuffer;
use Tiedragon\Xmpp\XmppStreamFeatures;
use Tiedragon\Xmpp\XmppStreamManagement;
use Tiedragon\Xmpp\XmppVCardTemp;
use Tiedragon\Xmpp\XmppWebSocket;
use Tiedragon\Xmpp\XmppWebSocketFrame;
use Tiedragon\Xmpp\XmppXml;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$jid = XmppJid::parse('Edward@LocalHost/web');
assertTrue($jid->bare() === 'Edward@localhost', 'JID bare normalization failed.');
assertTrue($jid->full() === 'Edward@localhost/web', 'JID full normalization failed.');

$settings = XmppConnectionSettings::forAccount('edward@localhost/web');
assertTrue($settings->host === 'localhost' && $settings->port === 5222, 'Connection settings failed.');

$stream = XmppStream::open('localhost', 'nl', 'edward@localhost/web');
assertTrue(str_contains($stream, '<stream:stream') && str_contains($stream, 'xmlns:stream'), 'Stream open failed.');

$buffer = new XmppStreamBuffer();
$buffer->append('<stream:stream xmlns:stream="' . XmppXml::STREAM_NS . '" xmlns="' . XmppXml::CLIENT_NS . '" id="s1" version="1.0">');
$buffer->append('<features xmlns="' . XmppXml::STREAM_NS . '"><bind xmlns="' . XmppXml::BIND_NS . '"/></features><presence xmlns="' . XmppXml::CLIENT_NS . '"/></stream:stream>');
$nodes = $buffer->readAvailable();
assertTrue(count($nodes) === 4 && $nodes[0]['type'] === 'open' && str_contains($nodes[1]['xml'], '<features'), 'Stream buffer failed.');

$featuresXml = '<stream:features xmlns:stream="' . XmppXml::STREAM_NS . '">'
    . '<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls>'
    . '<mechanisms xmlns="' . XmppXml::SASL_NS . '"><mechanism>SCRAM-SHA-256</mechanism><mechanism>PLAIN</mechanism></mechanisms>'
    . '<bind xmlns="' . XmppXml::BIND_NS . '"/>'
    . '<session xmlns="' . XmppXml::SESSION_NS . '"><required/></session>'
    . '<sm xmlns="' . XmppXml::SM_NS . '"/>'
    . '<register xmlns="' . XmppXml::REGISTER_FEATURE_NS . '"/>'
    . '</stream:features>';
$featuresParsed = XmppStreamFeatures::parse($featuresXml);
assertTrue($featuresParsed['startTlsRequired'] && in_array('PLAIN', $featuresParsed['saslMechanisms'], true), 'Stream features parse failed.');
assertTrue($featuresParsed['sessionRequired'] && $featuresParsed['inBandRegistrationOffered'], 'Session/IBR feature parse failed.');

$smEnable = XmppStreamManagement::enable();
assertTrue(str_contains($smEnable, XmppXml::SM_NS) && str_contains($smEnable, 'resume="true"'), 'Stream management enable failed.');
$smParsed = XmppStreamManagement::parse('<enabled xmlns="' . XmppXml::SM_NS . '" id="sm1" resume="true" max="300"/>');
assertTrue($smParsed['id'] === 'sm1' && $smParsed['max'] === 300 && $smParsed['resume'], 'Stream management parse failed.');

$session = XmppSession::request('sess1');
assertTrue(str_contains($session, XmppXml::SESSION_NS), 'Session request failed.');

$capsVer = XmppEntityCapabilities::calculateVer(
    [['category' => 'client', 'type' => 'web', 'name' => 'TeleTypTel']],
    [XmppXml::DISCO_INFO_NS, XmppXml::RTT_NS]
);
$capsPresence = XmppStanza::presence(extraXml: XmppEntityCapabilities::presenceElement('https://www.tiedragon.com/teletyptel', $capsVer));
$capsParsed = XmppEntityCapabilities::parsePresence($capsPresence);
assertTrue($capsParsed['ver'] === $capsVer && $capsParsed['hash'] === 'sha-1', 'Entity capabilities failed.');

$wsOpen = XmppWebSocket::openFrame('localhost', 'nl');
assertTrue(str_contains($wsOpen, 'urn:ietf:params:xml:ns:xmpp-framing'), 'RFC7395 open failed.');

$boshInitial = XmppBosh::initialBody('localhost', 1001, 'nl');
assertTrue(str_contains($boshInitial, XmppXml::BOSH_NS) && str_contains($boshInitial, 'xmpp:version="1.0"'), 'BOSH initial body failed.');
$boshPayload = XmppBosh::payloadBody('sid123', 1002, XmppStanza::message('tester@localhost', 'hoi', 'bm1'));
assertTrue(str_contains($boshPayload, '<message'), 'BOSH payload body failed.');
$boshParsed = XmppBosh::parseBody('<body xmlns="' . XmppXml::BOSH_NS . '" sid="sid123" wait="60" requests="2"><features xmlns="' . XmppXml::STREAM_NS . '"/></body>');
assertTrue($boshParsed['sid'] === 'sid123' && $boshParsed['requests'] === 2 && count($boshParsed['payloads']) === 1, 'BOSH response parse failed.');

$form = XmppDataForm::formElement([
    'FORM_TYPE' => ['type' => 'hidden', 'value' => XmppXml::MAM_NS],
    'with' => 'tester@localhost',
    ['var' => 'room', 'type' => 'list-single', 'value' => 'support', 'options' => [['label' => 'Support', 'value' => 'support']]],
], 'submit');
$forms = XmppDataForm::parseForms($form);
assertTrue($forms[0]['fields']['with']['values'][0] === 'tester@localhost' && $forms[0]['fields']['room']['options'][0]['label'] === 'Support', 'Data form parse failed.');

$rsm = XmppResultSetManagement::setElement(20, 'a1');
$rsmParsed = XmppResultSetManagement::parseSet('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="rsm1">' . $rsm . '</iq>');
assertTrue($rsmParsed !== null && $rsmParsed['first'] === null && $rsmParsed['last'] === null, 'RSM set parse failed.');

$frameBuffer = XmppWebSocketFrame::encodeText('<open/>', masked: true)
    . XmppWebSocketFrame::encodeText(str_repeat('x', 140), masked: false);
$frames = XmppWebSocketFrame::decodeAvailable($frameBuffer);
assertTrue(count($frames) === 2 && $frames[0]['payload'] === '<open/>' && strlen($frames[1]['payload']) === 140, 'WebSocket frame codec failed.');
assertTrue($frameBuffer === '', 'WebSocket frame decoder did not consume buffer.');

$saslPlain = XmppSasl::plainAuth('edward', 'secret');
assertTrue(str_contains($saslPlain, 'mechanism="PLAIN"'), 'SASL PLAIN failed.');

$saslOauth = XmppSasl::oauthBearerAuth('edward@localhost', 'token');
assertTrue(str_contains($saslOauth, 'OAUTHBEARER'), 'SASL OAUTHBEARER failed.');

$scram = new XmppSaslScram(XmppSasl::SCRAM_SHA_1, 'user', 'pencil', 'fyko+d2lbbFgONRv9qkxdawL');
$scramFirst = $scram->clientFirstMessage();
assertTrue($scramFirst === 'n,,n=user,r=fyko+d2lbbFgONRv9qkxdawL', 'SCRAM client-first failed.');
$scramFinal = $scram->clientFinalMessage('r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096');
assertTrue($scramFinal === 'c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=', 'SCRAM client-final proof failed.');
assertTrue($scram->verifyServerFinal('v=rmF9pqV8S7suAoZWja4dJRkFsKQ='), 'SCRAM server signature failed.');

$bind = XmppBind::request('bind1', 'web');
assertTrue(str_contains($bind, XmppXml::BIND_NS), 'Resource bind failed.');

$registerInfo = XmppInBandRegistration::infoRequest('reg1', 'localhost');
assertTrue(str_contains($registerInfo, XmppXml::REGISTER_NS), 'IBR info request failed.');
$registerSubmit = XmppInBandRegistration::submitRequest('reg2', ['username' => 'edward', 'password' => 'secret', 'email' => 'edward@example.test']);
assertTrue(str_contains($registerSubmit, '<username') && str_contains($registerSubmit, '<password'), 'IBR submit failed.');
$registerParsed = XmppInBandRegistration::parseInfoResult('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="reg1"><query xmlns="' . XmppXml::REGISTER_NS . '"><instructions>Kies account</instructions><username/><password/><key>abc</key></query></iq>');
assertTrue($registerParsed['fields']['username'] === null && $registerParsed['key'] === 'abc', 'IBR info parse failed.');

$message = XmppStanza::message('tester@localhost/web', 'hallo', 'm1', from: 'edward@localhost/web');
$parsed = XmppStanza::parse($message);
assertTrue($parsed['kind'] === 'message' && $parsed['body'] === 'hallo', 'Message parse failed.');
$incoming = XmppIncomingStanza::parse($message);
assertTrue($incoming->isMessage() && $incoming->from === 'edward@localhost/web', 'Incoming stanza parse failed.');

$presenceSubscribe = XmppPresence::subscribe('tester@localhost');
assertTrue(str_contains($presenceSubscribe, 'type="subscribe"'), 'Presence subscribe helper failed.');
$presenceXml = '<presence xmlns="' . XmppXml::CLIENT_NS . '" from="tester@localhost/web" to="edward@localhost/web">'
    . '<show>chat</show><status>Beschikbaar</status><priority>5</priority>'
    . XmppEntityCapabilities::presenceElement('https://www.tiedragon.com/teletyptel', $capsVer)
    . '<x xmlns="' . XmppXml::VCARD_TEMP_UPDATE_NS . '"><photo>avatarhash</photo></x></presence>';
$presenceParsed = XmppPresence::parse($presenceXml);
assertTrue($presenceParsed !== null && $presenceParsed['show'] === 'chat' && $presenceParsed['priority'] === 5 && $presenceParsed['avatarHash'] === 'avatarhash', 'Presence parser failed.');
$incomingPresence = XmppIncomingStanza::parse($presenceXml);
assertTrue($incomingPresence->isPresence() && $incomingPresence->extensions['presence']['status'] === 'Beschikbaar', 'Incoming presence extension parse failed.');

$rosterResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="r1"><query xmlns="' . XmppXml::ROSTER_NS . '"><item jid="tester@localhost" name="Tester" subscription="both" approved="true"><group>Demo</group></item></query></iq>';
$rosterItems = XmppRoster::parseResult($rosterResult);
assertTrue($rosterItems[0]['jid'] === 'tester@localhost' && $rosterItems[0]['groups'][0] === 'Demo', 'Roster result parse failed.');

$discoItemsResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="di-items"><query xmlns="' . XmppXml::DISCO_ITEMS_NS . '"><item jid="conference.localhost" name="Rooms" node="rooms"/></query></iq>';
$discoItemsParsed = XmppDisco::parseItemsResult($discoItemsResult);
assertTrue($discoItemsParsed[0]['jid'] === 'conference.localhost' && $discoItemsParsed[0]['node'] === 'rooms', 'Disco items parse failed.');

$stanzaError = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="error" id="bad"><error type="auth"><not-authorized xmlns="' . XmppXml::STANZA_ERROR_NS . '"/><text xmlns="' . XmppXml::STANZA_ERROR_NS . '">No login</text></error></iq>';
$stanzaErrorParsed = XmppError::parseStanzaError($stanzaError);
assertTrue($stanzaErrorParsed !== null && $stanzaErrorParsed['condition'] === 'not-authorized' && $stanzaErrorParsed['text'] === 'No login', 'Stanza error parse failed.');

$streamError = '<stream:error xmlns:stream="' . XmppXml::STREAM_NS . '"><conflict xmlns="' . XmppXml::STREAM_ERROR_NS . '"/><text xmlns="' . XmppXml::STREAM_ERROR_NS . '">Resource conflict</text></stream:error>';
$streamErrorParsed = XmppError::parseStreamError($streamError);
assertTrue($streamErrorParsed !== null && $streamErrorParsed['condition'] === 'conflict' && $streamErrorParsed['text'] === 'Resource conflict', 'Stream error parse failed.');

$receipt = XmppMessageLifecycle::receiptMessage('edward@localhost/web', 'm1', 'r1');
assertTrue(XmppMessageLifecycle::parseMessageExtensions($receipt)['receiptReceived'] === 'm1', 'Receipt parse failed.');

$chatState = XmppMessageLifecycle::chatStateMessage('tester@localhost/web', 'composing', 'cs1');
assertTrue(XmppMessageLifecycle::parseMessageExtensions($chatState)['chatState'] === 'composing', 'Chat state parse failed.');

$correction = XmppMessageLifecycle::correctionMessage('tester@localhost/web', 'hallo!', 'm1', 'm2');
assertTrue(XmppMessageLifecycle::parseMessageExtensions($correction)['replaceId'] === 'm1', 'Correction parse failed.');

$retract = XmppMessageLifecycle::retractMessage('tester@localhost/web', 'm2', 'm3');
assertTrue(XmppMessageLifecycle::parseMessageExtensions($retract)['retractId'] === 'm2', 'Retraction parse failed.');

$metadataExtra = XmppMessageMetadata::originIdElement('origin-1')
    . XmppMessageMetadata::stanzaIdElement('server-1', 'localhost')
    . XmppMessageMetadata::delayElement('2026-06-01T10:00:00Z', 'archive.localhost', 'offline')
    . XmppMessageMetadata::hintElements(['store', 'no-copy']);
$metadataMessage = XmppStanza::message('tester@localhost/web', 'archief', 'meta1', extraXml: $metadataExtra);
$metadata = XmppMessageMetadata::parseMessageMetadata($metadataMessage);
assertTrue($metadata['originId'] === 'origin-1' && $metadata['stanzaIds'][0]['id'] === 'server-1' && $metadata['delayReason'] === 'offline', 'Message metadata parse failed.');
$incomingMetadata = XmppIncomingStanza::parse($metadataMessage);
assertTrue($incomingMetadata->extensions['originId'] === 'origin-1' && in_array('no-copy', $incomingMetadata->extensions['hints'], true), 'Incoming message metadata extension failed.');

$meMessage = XmppMeCommand::message('tester@localhost/web', 'zwaait', 'me1');
assertTrue(XmppMeCommand::isMeMessage($meMessage), '/me command message failed.');

$carbonsEnable = XmppMessageCarbons::enableRequest('carbon1');
assertTrue(str_contains($carbonsEnable, XmppXml::CARBONS_NS), 'Carbons enable failed.');
$carbonMessage = '<message xmlns="' . XmppXml::CLIENT_NS . '" from="edward@localhost/web"><sent xmlns="' . XmppXml::CARBONS_NS . '"><forwarded xmlns="' . XmppXml::FORWARD_NS . '"><delay xmlns="' . XmppXml::DELAY_NS . '" stamp="2026-06-01T00:00:00Z"/><message xmlns="' . XmppXml::CLIENT_NS . '" to="tester@localhost" type="chat"><body>hoi</body></message></forwarded></sent></message>';
$carbonParsed = XmppMessageCarbons::parseMessage($carbonMessage);
assertTrue($carbonParsed !== null && $carbonParsed['direction'] === 'sent' && str_contains($carbonParsed['stanza'], '<message'), 'Carbons parse failed.');

$rtt = XmppRtt::message('tester@localhost/web', 'hallo', 'edit', 7, [
    ['kind' => 't', 'pos' => 0, 'text' => 'ha'],
    ['kind' => 'e', 'pos' => 1, 'n' => 1],
]);
assertTrue(str_contains($rtt, XmppXml::RTT_NS), 'RTT namespace missing.');

$disco = XmppDisco::infoRequest('di1', 'localhost');
assertTrue(str_contains($disco, XmppXml::DISCO_INFO_NS), 'Disco info request failed.');

$serviceInfoForm = XmppServiceContactAddresses::dataFormElement([
    'abuse' => 'mailto:abuse@example.test',
    'support' => ['xmpp:support@example.test'],
]);
$serviceInfoContacts = XmppServiceContactAddresses::parseFromDiscoInfo('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="di2"><query xmlns="' . XmppXml::DISCO_INFO_NS . '">' . $serviceInfoForm . '</query></iq>');
assertTrue($serviceInfoContacts[0]['kind'] === 'abuse' && $serviceInfoContacts[1]['kind'] === 'support', 'Service contact address parse failed.');

$command = XmppAdHocCommands::executeRequest('cmd1', 'localhost', 'http://jabber.org/protocol/admin#get-online-users-list');
assertTrue(str_contains($command, XmppXml::COMMANDS_NS) && str_contains($command, 'action="execute"'), 'Ad-hoc command request failed.');
$commandParsed = XmppAdHocCommands::parseResult('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="cmd1"><command xmlns="' . XmppXml::COMMANDS_NS . '" node="node1" sessionid="s1" status="executing"><actions execute="complete"><complete/></actions><note type="info">Klaar</note>' . XmppDataForm::formElement(['accountjid' => 'edward@localhost'], 'form') . '</command></iq>');
assertTrue($commandParsed !== null && $commandParsed['sessionId'] === 's1' && $commandParsed['actions'][0] === 'complete', 'Ad-hoc command parse failed.');

$roster = XmppRoster::setItemRequest('r1', 'tester@localhost', 'Tester', groups: ['Demo']);
assertTrue(str_contains($roster, 'jabber:iq:roster') && str_contains($roster, '<group'), 'Roster set failed.');

$privateGet = XmppPrivateStorage::getRequest('p1', 'storage', XmppXml::BOOKMARKS_NS);
assertTrue(str_contains($privateGet, XmppXml::PRIVATE_NS), 'Private storage get failed.');

$bookmarksSet = XmppBookmarks::privateSetRequest('bm2', [
    ['jid' => 'room@conference.localhost', 'name' => 'Support', 'nick' => 'Edward', 'autojoin' => true],
]);
assertTrue(str_contains($bookmarksSet, 'storage:bookmarks') && str_contains($bookmarksSet, 'autojoin="true"'), 'Bookmarks set failed.');
$bookmarksParsed = XmppBookmarks::parseStorage('<storage xmlns="' . XmppXml::BOOKMARKS_NS . '"><conference jid="room@conference.localhost" name="Support" autojoin="true"><nick>Edward</nick></conference></storage>');
assertTrue($bookmarksParsed[0]['nick'] === 'Edward' && $bookmarksParsed[0]['autojoin'], 'Bookmarks parse failed.');

$mucJoin = XmppMuc::joinPresence('room@conference.localhost', 'Edward', historyMaxChars: 0);
assertTrue(str_contains($mucJoin, 'http://jabber.org/protocol/muc') && str_contains($mucJoin, 'Edward'), 'MUC join failed.');

$block = XmppBlocking::blockRequest('b1', ['spammer@localhost']);
assertTrue(str_contains($block, 'urn:xmpp:blocking') && str_contains($block, 'spammer@localhost'), 'Blocking request failed.');

$upload = XmppHttpUpload::slotRequest('u1', 'upload.localhost', 'photo.jpg', 1234, 'image/jpeg');
assertTrue(str_contains($upload, XmppXml::HTTP_UPLOAD_NS), 'HTTP upload slot request failed.');

$mam = XmppMam::queryRequest('mam1', with: 'tester@localhost', start: '2026-06-01T00:00:00Z', max: 25, after: 'archive-id');
assertTrue(str_contains($mam, XmppXml::MAM_NS) && str_contains($mam, XmppXml::RSM_NS), 'MAM query failed.');
$mamResults = XmppMam::parseResults('<message xmlns="' . XmppXml::CLIENT_NS . '"><result xmlns="' . XmppXml::MAM_NS . '" id="a1" queryid="q1"><forwarded xmlns="' . XmppXml::FORWARD_NS . '"><message xmlns="' . XmppXml::CLIENT_NS . '" from="tester@localhost"><body>archief</body></message></forwarded></result></message>');
assertTrue($mamResults[0]['id'] === 'a1' && str_contains($mamResults[0]['forwarded'] ?? '', 'archief'), 'MAM result parse failed.');

$location = ['lat' => 52.0805, 'lon' => 4.2593, 'accuracy' => 25, 'timestamp' => new DateTimeImmutable('2026-06-01T16:00:00Z')];
$geoloc = XmppGeoloc::publishRequest('g1', $location);
assertTrue(str_contains($geoloc, XmppXml::GEOLOC_NS) && str_contains($geoloc, '<lat'), 'Geoloc publish failed.');

$pubsubItemsResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ps1"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><items node="' . XmppXml::GEOLOC_NS . '"><item id="current" publisher="edward@localhost"><geoloc xmlns="' . XmppXml::GEOLOC_NS . '"><lat>52.0805</lat></geoloc></item></items></pubsub></iq>';
$pubsubItemsParsed = XmppPubSub::parseItemsResult($pubsubItemsResult);
assertTrue($pubsubItemsParsed !== null && $pubsubItemsParsed['node'] === XmppXml::GEOLOC_NS && str_contains($pubsubItemsParsed['items'][0]['payload'], '<geoloc'), 'PubSub items parse failed.');

$pubsubEvent = '<message xmlns="' . XmppXml::CLIENT_NS . '" from="edward@localhost"><event xmlns="' . XmppXml::PUBSUB_EVENT_NS . '"><items node="' . XmppXml::GEOLOC_NS . '"><item id="current"><geoloc xmlns="' . XmppXml::GEOLOC_NS . '"><lon>4.2593</lon></geoloc></item><retract id="old"/></items></event></message>';
$pubsubEventParsed = XmppPubSub::parseEventMessage($pubsubEvent);
assertTrue($pubsubEventParsed !== null && $pubsubEventParsed['retractions'][0] === 'old' && str_contains($pubsubEventParsed['items'][0]['payload'], '<lon'), 'PubSub event parse failed.');
$incomingPubSub = XmppIncomingStanza::parse($pubsubEvent);
assertTrue($incomingPubSub->extensions['isPubSubEvent'] && $incomingPubSub->extensions['pubsubEvent']['node'] === XmppXml::GEOLOC_NS, 'Incoming PubSub event extension failed.');

$pepPublish = XmppPersonalEventing::publishRequest('pep-pub', XmppXml::GEOLOC_NS, 'current', XmppGeoloc::element($location));
assertTrue(str_contains($pepPublish, '<publish node="' . XmppXml::GEOLOC_NS . '"') && str_contains($pepPublish, '<item id="current"'), 'PEP publish failed.');
$pepItems = XmppPersonalEventing::itemsRequest('pep-items', XmppXml::GEOLOC_NS, itemId: 'current', maxItems: 1);
assertTrue(str_contains($pepItems, '<items node="' . XmppXml::GEOLOC_NS . '" max_items="1"') && str_contains($pepItems, '<item id="current"'), 'PEP items request failed.');
assertTrue(XmppPersonalEventing::notificationFeature(XmppXml::GEOLOC_NS) === XmppXml::GEOLOC_NS . '+notify', 'PEP notification feature failed.');
assertTrue(XmppPersonalEventing::parseItemsResult($pubsubItemsResult)['items'][0]['id'] === 'current', 'PEP items result parse failed.');
assertTrue(XmppPersonalEventing::parseNotification($pubsubEvent)['node'] === XmppXml::GEOLOC_NS, 'PEP notification parse failed.');

$privatePayload = '<settings xmlns="urn:tiedragon:teletyptel:private"><theme>dark</theme></settings>';
$privateStore = XmppPersistentPrivateData::storeRequest('ppd-store', 'urn:tiedragon:teletyptel:settings', $privatePayload, 'current');
assertTrue(str_contains($privateStore, XmppPersistentPrivateData::PUBLISH_OPTIONS_NS) && str_contains($privateStore, XmppPersistentPrivateData::PRIVATE_ACCESS_MODEL), 'Persistent private data store failed.');
$privateItemsResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ppd-items"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><items node="urn:tiedragon:teletyptel:settings"><item id="current">' . $privatePayload . '</item></items></pubsub></iq>';
$privateItems = XmppPersistentPrivateData::parseItemsResult($privateItemsResult, 'urn:tiedragon:teletyptel:settings');
assertTrue($privateItems !== null && str_contains($privateItems[0]['payload'], '<settings'), 'Persistent private data items parse failed.');
$privateEvent = '<message xmlns="' . XmppXml::CLIENT_NS . '" from="edward@localhost/web"><event xmlns="' . XmppXml::PUBSUB_EVENT_NS . '"><items node="urn:tiedragon:teletyptel:settings"><item id="current">' . $privatePayload . '</item></items></event></message>';
$privateTrusted = XmppPersistentPrivateData::parseTrustedNotification($privateEvent, 'edward@localhost/phone', 'urn:tiedragon:teletyptel:settings');
assertTrue($privateTrusted !== null && $privateTrusted['items'][0]['id'] === 'current', 'Persistent private data trusted notification failed.');
$privateUntrusted = str_replace('edward@localhost/web', 'tester@localhost/web', $privateEvent);
assertTrue(XmppPersistentPrivateData::parseTrustedNotification($privateUntrusted, 'edward@localhost/phone', 'urn:tiedragon:teletyptel:settings') === null, 'Persistent private data trust gate failed.');

$announcement = [
    'id' => 'news-1',
    'title' => 'TeleTypTel Alpha',
    'summary' => 'Nieuwe testbuild beschikbaar.',
    'link' => 'https://teletyptel.test/news/1',
    'language' => 'nl',
    'category' => 'release',
    'priority' => 'normal',
    'published' => new DateTimeImmutable('2026-06-07T10:00:00Z'),
];
$announcementEntry = XmppPubSubAnnouncements::atomEntry($announcement);
$announcementParsed = XmppPubSubAnnouncements::parseAtomEntry($announcementEntry);
assertTrue($announcementParsed !== null && $announcementParsed['title'] === 'TeleTypTel Alpha' && $announcementParsed['priority'] === 'normal', 'Announcement Atom parse failed.');
$announcementPublish = XmppPubSubAnnouncements::publishRequest('ann-pub', $announcement, service: 'pubsub.localhost');
assertTrue(str_contains($announcementPublish, 'to="pubsub.localhost"') && str_contains($announcementPublish, XmppPubSubAnnouncements::DEFAULT_NODE), 'Announcement publish failed.');
$announcementItemsResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ann-items"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><items node="' . XmppPubSubAnnouncements::DEFAULT_NODE . '"><item id="news-1">' . $announcementEntry . '</item></items></pubsub></iq>';
assertTrue(XmppPubSubAnnouncements::parseItems($announcementItemsResult)[0]['id'] === 'news-1', 'Announcement items parse failed.');

$servicePublish = XmppPubSub::publishRequest('ps-service-pub', 'teletyptel:news', 'n1', '<entry xmlns="urn:ietf:params:xml:ns:atom"/>', 'pubsub.localhost');
assertTrue(str_contains($servicePublish, 'to="pubsub.localhost"') && str_contains($servicePublish, '<publish node="teletyptel:news"'), 'PubSub service publish failed.');
$serviceRetract = XmppPubSub::retractRequest('ps-service-retract', 'teletyptel:news', 'n1', true, 'pubsub.localhost');
assertTrue(str_contains($serviceRetract, 'to="pubsub.localhost"') && str_contains($serviceRetract, '<retract'), 'PubSub service retract failed.');

$nodeConfigForm = XmppPubSub::nodeConfigForm(['pubsub#title' => 'Locatie updates']);
$createNode = XmppPubSub::createNodeRequest('ps-create', XmppXml::GEOLOC_NS, $nodeConfigForm, 'pubsub.localhost');
assertTrue(str_contains($createNode, '<create node="' . XmppXml::GEOLOC_NS . '"') && str_contains($createNode, XmppXml::PUBSUB_NODE_CONFIG_NS), 'PubSub create/config form failed.');
$configureNode = XmppPubSub::configureNodeRequest('ps-config', XmppXml::GEOLOC_NS, $nodeConfigForm, 'pubsub.localhost');
assertTrue(str_contains($configureNode, XmppXml::PUBSUB_OWNER_NS) && str_contains($configureNode, '<configure'), 'PubSub owner configure failed.');
$deleteNode = XmppPubSub::deleteNodeRequest('ps-delete', XmppXml::GEOLOC_NS, 'pubsub.localhost');
assertTrue(str_contains($deleteNode, '<delete node="' . XmppXml::GEOLOC_NS . '"'), 'PubSub owner delete failed.');
$subscribeOptions = XmppPubSub::subscribeOptionsForm(['pubsub#deliver' => '1']);
$subscribeNode = XmppPubSub::subscribeRequest('ps-sub', XmppXml::GEOLOC_NS, 'edward@localhost/web', 'pubsub.localhost', $subscribeOptions);
assertTrue(str_contains($subscribeNode, '<subscribe') && str_contains($subscribeNode, XmppXml::PUBSUB_SUBSCRIBE_OPTIONS_NS), 'PubSub subscribe failed.');
$unsubscribeNode = XmppPubSub::unsubscribeRequest('ps-unsub', XmppXml::GEOLOC_NS, 'edward@localhost/web', 'sub-1', 'pubsub.localhost');
assertTrue(str_contains($unsubscribeNode, '<unsubscribe') && str_contains($unsubscribeNode, 'subid="sub-1"'), 'PubSub unsubscribe failed.');
$publishResult = XmppPubSub::parsePublishResult('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ps-pub"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><publish node="' . XmppXml::GEOLOC_NS . '"><item id="current"/></publish></pubsub></iq>');
assertTrue($publishResult !== null && $publishResult['itemId'] === 'current', 'PubSub publish result parse failed.');
$subscriptionsResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ps-subs"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><subscriptions><subscription node="' . XmppXml::GEOLOC_NS . '" jid="edward@localhost/web" subscription="subscribed" subid="sub-1" expiry="2026-06-01T00:00:00Z"/></subscriptions></pubsub></iq>';
$subscriptionsParsed = XmppPubSub::parseSubscriptionsResult($subscriptionsResult);
assertTrue($subscriptionsParsed[0]['subscription'] === 'subscribed' && $subscriptionsParsed[0]['subscriptionId'] === 'sub-1', 'PubSub subscriptions parse failed.');
$affiliationsResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ps-aff"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><affiliations><affiliation node="' . XmppXml::GEOLOC_NS . '" jid="edward@localhost" affiliation="owner"/></affiliations></pubsub></iq>';
$affiliationsParsed = XmppPubSub::parseAffiliationsResult($affiliationsResult);
assertTrue($affiliationsParsed[0]['affiliation'] === 'owner' && $affiliationsParsed[0]['jid'] === 'edward@localhost', 'PubSub affiliations parse failed.');
$configurationForms = XmppPubSub::parseConfigurationForms('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ps-config"><pubsub xmlns="' . XmppXml::PUBSUB_OWNER_NS . '"><configure node="' . XmppXml::GEOLOC_NS . '">' . $nodeConfigForm . '</configure></pubsub></iq>');
assertTrue($configurationForms[0]['fields']['pubsub#title']['values'][0] === 'Locatie updates', 'PubSub configuration form parse failed.');

$mediaHash = XmppMediaSharing::sha256Hash('abc');
assertTrue($mediaHash['value'] === 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=', 'SIMS SHA-256 hash failed.');
$mediaMessage = XmppMediaSharing::httpUploadMessage('tester@localhost', 'foto', 'https://example.test/file.jpg', 'file.jpg', 3, 'image/jpeg', [$mediaHash], 'sims1');
$mediaParsed = XmppMediaSharing::parseMessage($mediaMessage);
assertTrue($mediaParsed !== null && $mediaParsed['name'] === 'file.jpg' && $mediaParsed['sources'][0] === 'https://example.test/file.jpg', 'SIMS parse failed.');

$emojiMarkup = XmppEmojiMarkup::markupElement([
    ['start' => 0, 'end' => 2, 'name' => 'smile', 'hashes' => [$mediaHash]],
]);
$emojiMessage = XmppStanza::message('tester@localhost', ':)', 'emoji1', extraXml: $emojiMarkup);
$emojiParsed = XmppEmojiMarkup::parseMessage($emojiMessage);
assertTrue($emojiParsed[0]['name'] === 'smile' && $emojiParsed[0]['hashes'][0]['algo'] === 'sha-256', 'Emoji markup parse failed.');

$styleSpans = XmppMessageStyling::parseLine('*vet* en _schuin_');
assertTrue($styleSpans[0]['kind'] === 'strong' && $styleSpans[2]['kind'] === 'emphasis', 'Message styling parse failed.');
$unstyledMessage = XmppStanza::message('tester@localhost', '*letterlijk*', 'style1', extraXml: XmppMessageStyling::unstyledElement());
assertTrue(XmppMessageStyling::isStylingDisabled($unstyledMessage), 'Message styling disabled marker failed.');

$moderationIq = XmppMessageModeration::moderatedRetractionRequest('mod1', 'room@conference.localhost', 'stanza-1', 'spam');
assertTrue(str_contains($moderationIq, XmppXml::MODERATION_NS) && str_contains($moderationIq, 'stanza-1'), 'Message moderation request failed.');
$moderatedMessage = XmppStanza::message('room@conference.localhost', '', 'modmsg', type: 'groupchat', extraXml: XmppMessageModeration::moderatedElement('mod@localhost/web') . XmppXml::textElement('reason', XmppXml::MODERATION_NS, 'spam'));
$moderatedParsed = XmppMessageModeration::parseMessage($moderatedMessage);
assertTrue($moderatedParsed !== null && $moderatedParsed['by'] === 'mod@localhost/web' && $moderatedParsed['reason'] === 'spam', 'Message moderation parse failed.');

$avatarBytes = 'fake-avatar-bytes';
$avatarId = XmppAvatar::idFromBytes($avatarBytes);
$avatarData = XmppAvatar::dataElement($avatarBytes);
assertTrue(XmppAvatar::parseData($avatarData) === $avatarBytes, 'Avatar data parse failed.');
$avatarMetadata = XmppAvatar::metadataElement($avatarId, 'image/png', strlen($avatarBytes), 64, 64);
assertTrue(XmppAvatar::parseMetadata($avatarMetadata)[0]['id'] === $avatarId, 'Avatar metadata parse failed.');

$vcardSet = XmppVCardTemp::setRequest('vc1', [
    'FN' => 'Edward Tie',
    'NICKNAME' => 'Edward',
    'EMAIL' => 'edward@example.test',
    'PHOTO' => ['type' => 'image/png', 'bytes' => 'png-bytes'],
]);
assertTrue(str_contains($vcardSet, XmppXml::VCARD_TEMP_NS) && str_contains($vcardSet, '<PHOTO'), 'vCard set failed.');
$vcardParsed = XmppVCardTemp::parse('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="vc1"><vCard xmlns="' . XmppXml::VCARD_TEMP_NS . '"><FN>Edward Tie</FN><NICKNAME>Edward</NICKNAME><EMAIL><INTERNET/><USERID>edward@example.test</USERID></EMAIL><PHOTO><TYPE>image/png</TYPE><BINVAL>' . base64_encode('png-bytes') . '</BINVAL></PHOTO></vCard></iq>');
assertTrue($vcardParsed['FN'] === 'Edward Tie' && $vcardParsed['PHOTO']['bytes'] === 'png-bytes', 'vCard parse failed.');

$servicesIq = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="ext1"><services xmlns="' . XmppXml::EXTERNAL_SERVICE_NS . '"><service type="stun" host="turn.localhost" port="3478" transport="udp" restricted="true"/></services></iq>';
$services = XmppExternalServices::parseServices($servicesIq);
assertTrue($services[0]['type'] === 'stun' && $services[0]['restricted'], 'External services parse failed.');

$csiInactive = XmppClientState::inactive();
assertTrue(str_contains($csiInactive, XmppXml::CSI_NS), 'CSI inactive failed.');

$push = XmppPush::enableRequest('push1', 'push.localhost', 'node1', ['FORM_TYPE' => 'ignored', 'device' => 'web']);
assertTrue(str_contains($push, XmppXml::PUSH_NS) && str_contains($push, 'push.localhost'), 'Push enable failed.');

$camList = XmppClientAccessManagement::listRequest('cam1');
assertTrue(str_contains($camList, XmppXml::CLIENT_ACCESS_MANAGEMENT_NS), 'CAM list request failed.');
$camParsed = XmppClientAccessManagement::parseClients('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="cam1"><clients xmlns="' . XmppXml::CLIENT_ACCESS_MANAGEMENT_NS . '"><client id="web1" type="session" connected="true"><auth><password/></auth><permission status="normal"/><user-agent><software>TeleTypTel</software><device>Browser</device></user-agent></client></clients></iq>');
assertTrue($camParsed[0]['id'] === 'web1' && $camParsed[0]['authMethods'][0] === 'password', 'CAM parse failed.');

$hostMeta = XmppAlternateConnection::parseHostMeta('{"links":[{"rel":"urn:xmpp:alt-connections:websocket","href":"wss://example.test/xmpp-websocket"}]}');
assertTrue(XmppAlternateConnection::firstHref($hostMeta, 'urn:xmpp:alt-connections:websocket') === 'wss://example.test/xmpp-websocket', 'Alternate connection parse failed.');

$channelSearch = XmppPublicChannelSearch::searchRequest('chan1', 'search.localhost', ['text' => 'support', 'types' => [XmppPublicChannelSearch::SERVICE_MUC], 'sortKey' => XmppPublicChannelSearch::ORDER_USERS], max: 10);
assertTrue(str_contains($channelSearch, XmppXml::CHANNEL_SEARCH_NS) && str_contains($channelSearch, XmppXml::RSM_NS), 'Channel search request failed.');
$channelParsed = XmppPublicChannelSearch::parseResult('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="chan1"><result xmlns="' . XmppXml::CHANNEL_SEARCH_NS . '"><item address="room@conference.localhost"><name>Support</name><nusers>3</nusers><service-type>xep-0045</service-type><is-open>true</is-open></item><set xmlns="' . XmppXml::RSM_NS . '"><count>1</count></set></result></iq>');
assertTrue($channelParsed !== null && $channelParsed['channels'][0]['name'] === 'Support' && $channelParsed['channels'][0]['userCount'] === 3, 'Channel search parse failed.');

$omemoDevicesPublish = XmppOmemo::deviceListPublish('omemo-devices-pub', [456, 123, 456]);
assertTrue(str_contains($omemoDevicesPublish, XmppOmemo::DEVICE_LIST_NODE) && str_contains($omemoDevicesPublish, '<device xmlns="' . XmppXml::OMEMO_NS . '" id="123"'), 'OMEMO device list publish failed.');
$omemoDeviceRequest = XmppOmemo::deviceListRequest('omemo-devices-get', 'anna@example.org');
assertTrue(str_contains($omemoDeviceRequest, 'to="anna@example.org"') && str_contains($omemoDeviceRequest, XmppOmemo::DEVICE_LIST_NODE), 'OMEMO device list request failed.');
$omemoDeviceIds = XmppOmemo::parseDeviceList('<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="omemo-devices-get"><pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><items node="' . XmppOmemo::DEVICE_LIST_NODE . '"><item id="current"><devices xmlns="' . XmppXml::OMEMO_NS . '"><device id="456"/><device id="789"/></devices></item></items></pubsub></iq>');
assertTrue($omemoDeviceIds === [456, 789], 'OMEMO device list parse failed.');
$omemoBundle = [
    'signedPreKeyPublic' => 'AQIDBA==',
    'signedPreKeyId' => 7,
    'signedPreKeySignature' => 'BQYHCA==',
    'identityKey' => 'CQoLDA==',
    'preKeys' => [
        ['id' => 11, 'publicKey' => 'ERITFA=='],
        ['id' => 10, 'publicKey' => 'DQ4PEA=='],
    ],
];
$omemoBundlePublish = XmppOmemo::bundlePublish('omemo-bundle-pub', 456, $omemoBundle);
assertTrue(str_contains($omemoBundlePublish, XmppOmemo::BUNDLES_NODE) && str_contains($omemoBundlePublish, 'id="456"'), 'OMEMO bundle publish failed.');
$omemoParsedBundle = XmppOmemo::parseBundle($omemoBundlePublish);
assertTrue($omemoParsedBundle !== null && $omemoParsedBundle['signedPreKeyId'] === 7 && $omemoParsedBundle['preKeys'][0]['id'] === 10, 'OMEMO bundle parse failed.');
$omemoMessage = XmppOmemo::encryptedMessage(
    'anna@example.org/phone',
    123,
    [['recipientDeviceId' => 456, 'cipherText' => 'cipher', 'isPreKey' => true, 'recipientJid' => 'anna@example.org/phone']],
    'payload',
    'omemo-msg-1',
    'edward@example.org/web'
);
$omemoParsedMessage = XmppOmemo::parseEncryptedMessage($omemoMessage);
assertTrue($omemoParsedMessage !== null && $omemoParsedMessage['senderDeviceId'] === 123 && $omemoParsedMessage['keys'][0]['isPreKey'] && $omemoParsedMessage['payload'] === 'payload', 'OMEMO encrypted message parse failed.');
assertTrue(XmppOmemo::isValidBase64('AQIDBA==') && !XmppOmemo::isValidBase64('not valid'), 'OMEMO base64 validation failed.');
assertTrue(XmppOmemoDoubleRatchet::isAvailable(), 'PHP OMEMO Double Ratchet crypto extensions unavailable.');

$omemoRatchetSecret = pack('C*', ...range(1, XmppOmemoDoubleRatchet::ROOT_KEY_SIZE));
$omemoBobRatchetKey = XmppOmemoDoubleRatchet::generateKeyPair();
$omemoAliceRatchet = XmppOmemoDoubleRatchet::createInitiatorState($omemoRatchetSecret, $omemoBobRatchetKey['publicKey']);
$omemoBobRatchet = XmppOmemoDoubleRatchet::createResponderState($omemoRatchetSecret, $omemoBobRatchetKey);
$omemoRatchetAd = 'edward@example.org|anna@example.org';
$omemoAliceFirst = XmppOmemoDoubleRatchet::encrypt($omemoAliceRatchet, 'Hallo Bob', $omemoRatchetAd);
$omemoAliceRatchet = $omemoAliceFirst['state'];
$omemoRatchetTransport = XmppOmemoDoubleRatchet::createKeyTransport(456, $omemoAliceFirst['message'], true, 'anna@example.org/phone');
$omemoParsedRatchetMessage = XmppOmemoDoubleRatchet::tryParseKeyTransport($omemoRatchetTransport);
assertTrue($omemoParsedRatchetMessage !== null && $omemoParsedRatchetMessage['header']['messageNumber'] === 0, 'PHP OMEMO Double Ratchet transport parse failed.');
$omemoBobFirst = XmppOmemoDoubleRatchet::decrypt($omemoBobRatchet, $omemoParsedRatchetMessage, $omemoRatchetAd);
$omemoBobRatchet = $omemoBobFirst['state'];
assertTrue($omemoBobFirst['plaintext'] === 'Hallo Bob', 'PHP OMEMO Double Ratchet first decrypt failed.');
$omemoBobReply = XmppOmemoDoubleRatchet::encrypt($omemoBobRatchet, 'Hallo Alice', $omemoRatchetAd);
$omemoBobRatchet = $omemoBobReply['state'];
$omemoAliceReply = XmppOmemoDoubleRatchet::decrypt($omemoAliceRatchet, $omemoBobReply['message'], $omemoRatchetAd);
$omemoAliceRatchet = $omemoAliceReply['state'];
assertTrue($omemoAliceReply['plaintext'] === 'Hallo Alice', 'PHP OMEMO Double Ratchet reply decrypt failed.');

$omemoSkippedBobKey = XmppOmemoDoubleRatchet::generateKeyPair();
$omemoSkippedAlice = XmppOmemoDoubleRatchet::createInitiatorState($omemoRatchetSecret, $omemoSkippedBobKey['publicKey']);
$omemoSkippedBob = XmppOmemoDoubleRatchet::createResponderState($omemoRatchetSecret, $omemoSkippedBobKey);
$omemoSkippedFirst = XmppOmemoDoubleRatchet::encrypt($omemoSkippedAlice, 'een', 'skip-test');
$omemoSkippedAlice = $omemoSkippedFirst['state'];
$omemoSkippedSecond = XmppOmemoDoubleRatchet::encrypt($omemoSkippedAlice, 'twee', 'skip-test');
$omemoSkippedAlice = $omemoSkippedSecond['state'];
$omemoSkippedThird = XmppOmemoDoubleRatchet::encrypt($omemoSkippedAlice, 'drie', 'skip-test');
$omemoSkippedThirdResult = XmppOmemoDoubleRatchet::decrypt($omemoSkippedBob, $omemoSkippedThird['message'], 'skip-test');
$omemoSkippedBob = $omemoSkippedThirdResult['state'];
assertTrue($omemoSkippedThirdResult['plaintext'] === 'drie' && count($omemoSkippedBob['skippedMessageKeys']) === 2, 'PHP OMEMO Double Ratchet skipped key cache failed.');
$omemoSkippedFirstResult = XmppOmemoDoubleRatchet::decrypt($omemoSkippedBob, $omemoSkippedFirst['message'], 'skip-test');
$omemoSkippedBob = $omemoSkippedFirstResult['state'];
$omemoSkippedSecondResult = XmppOmemoDoubleRatchet::decrypt($omemoSkippedBob, $omemoSkippedSecond['message'], 'skip-test');
assertTrue($omemoSkippedFirstResult['plaintext'] === 'een' && $omemoSkippedSecondResult['plaintext'] === 'twee', 'PHP OMEMO Double Ratchet out-of-order decrypt failed.');
$omemoImportedState = XmppOmemoDoubleRatchet::importState(XmppOmemoDoubleRatchet::exportState($omemoAliceRatchet));
assertTrue($omemoImportedState['localRatchetKeyPair']['publicKey'] === $omemoAliceRatchet['localRatchetKeyPair']['publicKey'], 'PHP OMEMO Double Ratchet state import/export failed.');

$s5bDestination = XmppSocks5Bytestreams::destinationAddress(
    'vj3hs98y',
    'romeo@montague.lit/orchard',
    'juliet@capulet.lit/balcony'
);
assertTrue($s5bDestination === '972b7bf47291ca609517f67f86b5081086052dad', 'SOCKS5 destination-address hash failed.');
$s5bRequest = XmppSocks5Bytestreams::bytestreamRequest('s5b-1', 'juliet@capulet.lit/balcony', 'sid-123', [
    ['jid' => 'streamer.shakespeare.lit', 'host' => '203.0.113.55', 'port' => 7777],
]);
$s5bParsed = XmppSocks5Bytestreams::parseBytestreamRequest($s5bRequest);
assertTrue($s5bParsed !== null && $s5bParsed['sid'] === 'sid-123' && $s5bParsed['streamHosts'][0]['port'] === 7777, 'SOCKS5 bytestream parse failed.');
$s5bProxyRequest = XmppSocks5Bytestreams::proxyAddressRequest('s5b-proxy-1', 'streamer.shakespeare.lit');
assertTrue(str_contains($s5bProxyRequest, XmppXml::S5B_NS), 'SOCKS5 proxy request failed.');
$s5bProxyResult = '<iq xmlns="' . XmppXml::CLIENT_NS . '" type="result" id="s5b-proxy-1"><query xmlns="' . XmppXml::S5B_NS . '"><streamhost jid="streamer.shakespeare.lit" host="203.0.113.55" port="7777"/></query></iq>';
$s5bProxyHosts = XmppSocks5Bytestreams::parseProxyAddressResult($s5bProxyResult);
assertTrue($s5bProxyHosts[0]['jid'] === 'streamer.shakespeare.lit' && $s5bProxyHosts[0]['host'] === '203.0.113.55', 'SOCKS5 proxy result parse failed.');
$s5bUsed = XmppSocks5Bytestreams::streamHostUsedResult('s5b-1', 'romeo@montague.lit/orchard', 'streamer.shakespeare.lit');
assertTrue(XmppSocks5Bytestreams::parseStreamHostUsedResult($s5bUsed)['jid'] === 'streamer.shakespeare.lit', 'SOCKS5 streamhost-used parse failed.');
$s5bActivate = XmppSocks5Bytestreams::activationRequest('s5b-activate-1', 'streamer.shakespeare.lit', 'sid-123', 'juliet@capulet.lit/balcony');
$s5bActivationParsed = XmppSocks5Bytestreams::parseActivationRequest($s5bActivate);
assertTrue($s5bActivationParsed !== null && $s5bActivationParsed['target'] === 'juliet@capulet.lit/balcony', 'SOCKS5 activation parse failed.');

$ibbOpen = XmppInBandBytestreams::openRequest('ibb-open-1', 'juliet@capulet.lit/balcony', 'ch3d9s71', 2048);
$ibbOpenParsed = XmppInBandBytestreams::parseOpenRequest($ibbOpen);
assertTrue($ibbOpenParsed !== null && $ibbOpenParsed['sid'] === 'ch3d9s71' && $ibbOpenParsed['stanza'] === 'iq', 'IBB open parse failed.');
$ibbPayload = 'Teletyptel file bytes';
$ibbDataIq = XmppInBandBytestreams::dataIq('ibb-data-1', 'juliet@capulet.lit/balcony', 'ch3d9s71', 0, $ibbPayload, 2048);
$ibbDataParsed = XmppInBandBytestreams::parseData($ibbDataIq);
assertTrue($ibbDataParsed !== null && $ibbDataParsed['bytes'] === $ibbPayload && $ibbDataParsed['sequence'] === 0, 'IBB IQ data parse failed.');
$ibbDataMessage = XmppInBandBytestreams::dataMessage('juliet@capulet.lit/balcony', 'ch3d9s71', 1, $ibbPayload, 'ibb-message-1');
$ibbMessageParsed = XmppInBandBytestreams::parseData($ibbDataMessage);
assertTrue($ibbMessageParsed !== null && $ibbMessageParsed['stanza'] === 'message' && $ibbMessageParsed['sequence'] === 1, 'IBB message data parse failed.');
$ibbClose = XmppInBandBytestreams::closeRequest('ibb-close-1', 'juliet@capulet.lit/balcony', 'ch3d9s71');
assertTrue(XmppInBandBytestreams::parseCloseRequest($ibbClose)['sid'] === 'ch3d9s71', 'IBB close parse failed.');

$jingleFileDescription = XmppJingleFileTransfer::descriptionElement([
    'name' => 'test.txt',
    'size' => 6144,
    'mediaType' => 'text/plain',
    'date' => new DateTimeImmutable('2015-07-26T21:46:00+01:00'),
    'description' => 'Tiny transfer',
    'hashes' => [['algo' => 'sha-1', 'value' => 'w0mcJylzCn+AfvuGdqkty2+KP48=']],
]);
$jingleS5bTransport = XmppJingleFileTransfer::s5bTransportElement(
    'vj3hs98y',
    [
        ['cid' => 'hft54dqy', 'host' => '192.168.4.1', 'jid' => 'romeo@montague.lit/orchard', 'port' => 5086, 'priority' => 8257636, 'type' => 'direct'],
        ['cid' => 'xmdh4b7i', 'host' => 'streamer.shakespeare.lit', 'jid' => 'streamer.shakespeare.lit', 'port' => 7625, 'priority' => 7878787, 'type' => 'proxy'],
    ],
    $s5bDestination
);
$jingleContent = XmppJingleFileTransfer::contentElement('file-offer', $jingleFileDescription, $jingleS5bTransport, senders: 'initiator');
$jingleFileIq = XmppJingle::sessionInitiate('jft-1', 'juliet@capulet.lit/balcony', 'jingle-sid-1', 'romeo@montague.lit/orchard', $jingleContent);
$jingleParsed = XmppJingle::parse($jingleFileIq);
assertTrue($jingleParsed !== null && $jingleParsed['action'] === 'session-initiate' && $jingleParsed['contents'][0]['name'] === 'file-offer', 'Jingle file session parse failed.');
$jingleFileParsed = XmppJingleFileTransfer::parseFile($jingleParsed['contents'][0]['description'] ?? '');
assertTrue($jingleFileParsed !== null && $jingleFileParsed['name'] === 'test.txt' && $jingleFileParsed['hashes'][0]['algo'] === 'sha-1', 'Jingle file metadata parse failed.');
$jingleS5bParsed = XmppJingleFileTransfer::parseTransport($jingleParsed['contents'][0]['transport'] ?? '');
assertTrue($jingleS5bParsed !== null && $jingleS5bParsed['kind'] === 's5b' && $jingleS5bParsed['candidates'][1]['type'] === 'proxy', 'Jingle S5B transport parse failed.');
$jingleIbbTransport = XmppJingleFileTransfer::ibbTransportElement('ibb-jingle-1', 4096, 'message');
$jingleIbbParsed = XmppJingleFileTransfer::parseTransport($jingleIbbTransport);
assertTrue($jingleIbbParsed !== null && $jingleIbbParsed['kind'] === 'ibb' && $jingleIbbParsed['stanza'] === 'message', 'Jingle IBB transport parse failed.');
$jingleIbbOpen = XmppJingleFileTransfer::openRequestFromIbbTransport('ibb-jingle-open-1', 'juliet@capulet.lit/balcony', $jingleIbbTransport);
assertTrue(XmppInBandBytestreams::parseOpenRequest($jingleIbbOpen)['blockSize'] === 4096, 'Jingle IBB open request helper failed.');
$jingleS5bWrapper = XmppJingleSocks5Bytestreams::transportElement('vj3hs98y', destinationAddress: $s5bDestination);
assertTrue(XmppJingleSocks5Bytestreams::parseTransport($jingleS5bWrapper)['destinationAddress'] === $s5bDestination, 'Jingle S5B wrapper failed.');
$jingleIbbWrapper = XmppJingleInBandBytestreams::transportElement('ibb-wrapper-1', 2048);
assertTrue(XmppJingleInBandBytestreams::parseTransport($jingleIbbWrapper)['blockSize'] === 2048, 'Jingle IBB wrapper failed.');
$jingleIbbWrapperOpen = XmppJingleInBandBytestreams::openRequestFromTransport('ibb-wrapper-open', 'juliet@capulet.lit/balcony', $jingleIbbWrapper);
assertTrue(XmppInBandBytestreams::parseOpenRequest($jingleIbbWrapperOpen)['sid'] === 'ibb-wrapper-1', 'Jingle IBB wrapper open failed.');
$jingleReceived = XmppJingleFileTransfer::receivedInfo('initiator', 'file-offer');
assertTrue(str_contains($jingleReceived, 'received') && str_contains($jingleReceived, XmppXml::FILE_TRANSFER_NS), 'Jingle file received info failed.');
$jingleChecksum = XmppJingleFileTransfer::checksumInfo('initiator', 'file-offer', [['algo' => 'sha-256', 'value' => 'Mb5I5OB9L0yDyGZqjOmCwXlZs8Y=']]);
assertTrue(str_contains($jingleChecksum, 'sha-256'), 'Jingle file checksum info failed.');
$jingleUsedTransport = XmppJingleFileTransfer::s5bTransportElement('vj3hs98y', candidateUsed: 'hft54dqy');
assertTrue(XmppJingleFileTransfer::parseTransport($jingleUsedTransport)['candidateUsed'] === 'hft54dqy', 'Jingle S5B candidate-used parse failed.');
$jingleActivatedTransport = XmppJingleFileTransfer::s5bTransportElement('vj3hs98y', activated: 'xmdh4b7i');
assertTrue(XmppJingleFileTransfer::parseTransport($jingleActivatedTransport)['activated'] === 'xmdh4b7i', 'Jingle S5B activated parse failed.');

$jingle = XmppJingle::sessionInfo('j1', 'tester@localhost/web', 'sid123', XmppJingle::rttSyncInfo('sync', 'nl'));
assertTrue(str_contains($jingle, XmppXml::JINGLE_RTT_SYNC_NS), 'Jingle RTT sync failed.');

$features = XmppFeatures::supportedNamespaces();
assertTrue(isset($features['XEP-0301 Real-Time Text']), 'Feature list missing XEP-0301.');
assertTrue(isset($features['XEP-0047 In-Band Bytestreams']) && isset($features['XEP-0261 Jingle In-Band Bytestreams']), 'Feature list missing bytestream transfer XEPs.');
assertTrue(isset($features['XEP-0384 OMEMO Encryption Wire Format']), 'Feature list missing OMEMO wire format.');

echo "PHP XMPP library smoke OK\n";
