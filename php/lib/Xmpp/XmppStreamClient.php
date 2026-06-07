<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppStreamClient
{
    /** @var resource|null */
    private $stream = null;
    private XmppStreamBuffer $buffer;
    private bool $tlsActive = false;
    /** @var array<int,string> */
    private array $pendingElements = [];

    public function __construct(private readonly XmppConnectionSettings $settings, private readonly int $timeoutSeconds = 15)
    {
        $this->buffer = new XmppStreamBuffer();
    }

    /**
     * @return array{boundJid:string,saslMechanism:string,tlsActive:bool}
     */
    public function loginPlain(string $password, ?string $resource = null): array
    {
        return $this->login($password, $resource, preferredMechanism: XmppSasl::PLAIN);
    }

    /**
     * @return array{boundJid:string,saslMechanism:string,tlsActive:bool}
     */
    public function login(string $password, ?string $resource = null, ?string $preferredMechanism = null): array
    {
        $this->connect();
        $features = $this->openAndReadFeatures();

        if (!$this->tlsActive && $features['startTlsOffered']) {
            $this->write(XmppStream::startTls());
            $proceed = $this->readElementNamed('proceed');
            if (!str_contains($proceed, 'urn:ietf:params:xml:ns:xmpp-tls')) {
                throw new \RuntimeException('STARTTLS was not accepted by the server.');
            }

            $this->enableCrypto();
            $features = $this->openAndReadFeatures();
        }

        if ($this->settings->requireTls && !$this->tlsActive) {
            throw new \RuntimeException('TLS is required but not active.');
        }

        $mechanism = $preferredMechanism;
        if ($mechanism === null) {
            $mechanism = XmppSasl::selectBest($features['saslMechanisms']);
        }

        if ($mechanism === null || !in_array($mechanism, $features['saslMechanisms'], true)) {
            throw new \RuntimeException('No supported SASL mechanism is advertised by the server.');
        }

        $authcid = $this->settings->account->local ?? $this->settings->account->bare();
        $this->authenticate($mechanism, $authcid, $password);

        $features = $this->openAndReadFeatures();
        if (!$features['resourceBindingOffered']) {
            throw new \RuntimeException('Resource binding is not advertised by the server.');
        }

        $bindId = 'bind-' . bin2hex(random_bytes(4));
        $this->write(XmppBind::request($bindId, $resource));
        $bindResult = $this->readElementNamed('iq');
        $boundJid = XmppBind::parseBoundJid($bindResult);
        if ($boundJid === null) {
            throw new \RuntimeException('Server did not return a bound JID.');
        }

        $this->write(XmppStanza::presence());
        return ['boundJid' => $boundJid->full(), 'saslMechanism' => $mechanism, 'tlsActive' => $this->tlsActive];
    }

    public function close(): void
    {
        if (is_resource($this->stream)) {
            $this->write(XmppStream::close());
            fclose($this->stream);
        }
        $this->stream = null;
    }

    public function sendRaw(string $xml): void
    {
        $this->write($xml);
    }

    public function sendChatMessage(XmppJid|string $to, string $body, ?string $id = null, bool $requestReceipt = true): string
    {
        $id ??= 'msg-' . bin2hex(random_bytes(6));
        $extra = $requestReceipt ? XmppMessageLifecycle::receiptRequestElement() : '';
        $xml = XmppStanza::message($to, $body, $id, extraXml: $extra);
        $this->write($xml);
        return $id;
    }

    /**
     * @param array<int,array{kind:string,pos?:int,text?:string,n?:int}> $events
     */
    public function sendRttMessage(XmppJid|string $to, string $bodyFallback, string $event, int $sequence, array $events = [], ?string $id = null): string
    {
        $id ??= 'rtt-' . bin2hex(random_bytes(6));
        $this->write(XmppRtt::message($to, $bodyFallback, $event, $sequence, $events, $id));
        return $id;
    }

    public function sendPresence(?string $show = 'online', ?string $status = null): void
    {
        $this->write(XmppStanza::presence($show ?? 'online', $status));
    }

    public function sendPresenceSubscription(XmppJid|string $to, string $type): void
    {
        if (!in_array($type, [
            XmppPresence::TYPE_SUBSCRIBE,
            XmppPresence::TYPE_SUBSCRIBED,
            XmppPresence::TYPE_UNSUBSCRIBE,
            XmppPresence::TYPE_UNSUBSCRIBED,
            XmppPresence::TYPE_PROBE,
        ], true)) {
            throw new \InvalidArgumentException("Unsupported presence subscription type {$type}.");
        }

        $this->write(XmppStanza::presence(to: $to, type: $type));
    }

    public function getRoster(?string $id = null): string
    {
        $id ??= 'roster-' . bin2hex(random_bytes(4));
        $this->write(XmppRoster::getRequest($id));
        return $this->readIqResult($id);
    }

    /**
     * @return list<array{jid:string,name:?string,subscription:string,ask:?string,approved:bool,groups:list<string>}>
     */
    public function getRosterItems(?string $id = null): array
    {
        return XmppRoster::parseResult($this->getRoster($id));
    }

    public function discoInfo(XmppJid|string|null $to = null, ?string $node = null, ?string $id = null): string
    {
        $id ??= 'disco-' . bin2hex(random_bytes(4));
        $this->write(XmppDisco::infoRequest($id, $to, $node));
        return $this->readIqResult($id);
    }

    public function discoItems(XmppJid|string|null $to = null, ?string $node = null, ?string $id = null): string
    {
        $id ??= 'disco-items-' . bin2hex(random_bytes(4));
        $this->write(XmppDisco::itemsRequest($id, $to, $node));
        return $this->readIqResult($id);
    }

    /**
     * @return list<array{jid:string,name:?string,node:?string}>
     */
    public function discoItemList(XmppJid|string|null $to = null, ?string $node = null, ?string $id = null): array
    {
        return XmppDisco::parseItemsResult($this->discoItems($to, $node, $id));
    }

    /**
     * @return list<array{kind:string,uri:string}>
     */
    public function serviceContactAddresses(XmppJid|string|null $to = null, ?string $id = null): array
    {
        return XmppServiceContactAddresses::parseFromDiscoInfo($this->discoInfo($to, id: $id));
    }

    /**
     * @return array{type:string,id:?string,resume:bool,max:?int,location:?string,h:?int,previd:?string}
     */
    public function enableStreamManagement(bool $resume = true, ?int $max = null): array
    {
        $this->write(XmppStreamManagement::enable($resume, $max));
        return XmppStreamManagement::parse($this->readAnyElementNamed(['enabled', 'failed']));
    }

    public function requestStreamManagementAck(): void
    {
        $this->write(XmppStreamManagement::requestAck());
    }

    public function acknowledgeHandled(int $handled): void
    {
        $this->write(XmppStreamManagement::ack($handled));
    }

    /**
     * @return array{type:string,id:?string,resume:bool,max:?int,location:?string,h:?int,previd:?string}
     */
    public function resumeStreamManagement(string $previousId, int $handled): array
    {
        $this->write(XmppStreamManagement::resume($previousId, $handled));
        return XmppStreamManagement::parse($this->readAnyElementNamed(['resumed', 'failed']));
    }

    /**
     * @return array{registered:bool,instructions:?string,key:?string,fields:array<string,?string>,dataForms:list<array<string,mixed>>}
     */
    public function getRegistrationInfo(XmppJid|string|null $to = null, ?string $id = null): array
    {
        $id ??= 'register-' . bin2hex(random_bytes(4));
        $this->write(XmppInBandRegistration::infoRequest($id, $to));
        return XmppInBandRegistration::parseInfoResult($this->readIqResult($id));
    }

    /**
     * @param array<string,string|int|float|bool|null> $fields
     */
    public function submitRegistration(array $fields, XmppJid|string|null $to = null, ?string $dataFormXml = null, ?string $id = null): string
    {
        $id ??= 'register-' . bin2hex(random_bytes(4));
        $this->write(XmppInBandRegistration::submitRequest($id, $fields, $to, $dataFormXml));
        return $this->readIqResult($id);
    }

    public function changePassword(string $username, string $password, XmppJid|string|null $to = null, ?string $id = null): string
    {
        $id ??= 'register-password-' . bin2hex(random_bytes(4));
        $this->write(XmppInBandRegistration::changePasswordRequest($id, $username, $password, $to));
        return $this->readIqResult($id);
    }

    public function removeRegistration(XmppJid|string|null $to = null, ?string $id = null): string
    {
        $id ??= 'register-remove-' . bin2hex(random_bytes(4));
        $this->write(XmppInBandRegistration::removeRequest($id, $to));
        return $this->readIqResult($id);
    }

    /**
     * @return array{FN:?string,NICKNAME:?string,URL:?string,BDAY:?string,TITLE:?string,ROLE:?string,DESC:?string,EMAIL:?string,PHOTO:?array{type:?string,binval:?string,bytes:?string,extval:?string}}
     */
    public function getVCard(XmppJid|string|null $to = null, ?string $id = null): array
    {
        $id ??= 'vcard-' . bin2hex(random_bytes(4));
        $this->write(XmppVCardTemp::getRequest($id, $to));
        return XmppVCardTemp::parse($this->readIqResult($id));
    }

    /**
     * @param array<string,mixed> $vcard
     */
    public function setVCard(array $vcard, ?string $id = null): string
    {
        $id ??= 'vcard-' . bin2hex(random_bytes(4));
        $this->write(XmppVCardTemp::setRequest($id, $vcard));
        return $this->readIqResult($id);
    }

    public function enableCarbons(?string $id = null): string
    {
        $id ??= 'carbons-' . bin2hex(random_bytes(4));
        $this->write(XmppMessageCarbons::enableRequest($id));
        return $this->readIqResult($id);
    }

    public function disableCarbons(?string $id = null): string
    {
        $id ??= 'carbons-' . bin2hex(random_bytes(4));
        $this->write(XmppMessageCarbons::disableRequest($id));
        return $this->readIqResult($id);
    }

    /**
     * @return list<array{id:string,type:string,connected:bool,firstSeen:?string,lastSeen:?string,authMethods:list<string>,permissionStatus:?string,software:?string,uri:?string,device:?string}>
     */
    public function listClientAccess(?string $id = null): array
    {
        $id ??= 'cam-' . bin2hex(random_bytes(4));
        $this->write(XmppClientAccessManagement::listRequest($id));
        return XmppClientAccessManagement::parseClients($this->readIqResult($id));
    }

    public function revokeClientAccess(string $clientId, ?string $id = null): string
    {
        $id ??= 'cam-revoke-' . bin2hex(random_bytes(4));
        $this->write(XmppClientAccessManagement::revokeRequest($id, $clientId));
        return $this->readIqResult($id);
    }

    public function discoverCommands(XmppJid|string $to, ?string $id = null): string
    {
        $id ??= 'commands-' . bin2hex(random_bytes(4));
        $this->write(XmppAdHocCommands::discoveryRequest($id, $to));
        return $this->readIqResult($id);
    }

    /**
     * @return array{node:?string,sessionId:?string,status:?string,action:?string,defaultAction:?string,actions:list<string>,notes:list<array{type:?string,text:string}>,dataForms:list<array<string,mixed>>}|null
     */
    public function executeCommand(XmppJid|string $to, string $node, ?string $sessionId = null, string $action = 'execute', ?string $dataFormXml = null, ?string $id = null): ?array
    {
        $id ??= 'command-' . bin2hex(random_bytes(4));
        $this->write(XmppAdHocCommands::executeRequest($id, $to, $node, $sessionId, $action, $dataFormXml));
        return XmppAdHocCommands::parseResult($this->readIqResult($id));
    }

    /**
     * @param array{text?:string,all?:bool,address?:bool,name?:bool,description?:bool,types?:list<string>,sortKey?:string} $query
     * @return array{channels:list<array{address:string,name:?string,description:?string,language:?string,userCount:?int,serviceType:?string,isOpen:?bool,anonymityMode:?string}>,resultSet:?array<string,mixed>}|null
     */
    public function searchPublicChannels(XmppJid|string $searchService, array $query, ?int $max = null, ?string $after = null, ?string $before = null, ?string $id = null): ?array
    {
        $id ??= 'channel-search-' . bin2hex(random_bytes(4));
        $this->write(XmppPublicChannelSearch::searchRequest($id, $searchService, $query, $max, $after, $before));
        return XmppPublicChannelSearch::parseResult($this->readIqResult($id));
    }

    /**
     * @return list<array{type:?string,host:?string,port:?int,transport:?string,username:?string,password:?string,expires:?string,restricted:bool}>
     */
    public function externalServices(?string $type = null, XmppJid|string|null $to = null, ?string $id = null): array
    {
        $id ??= 'extdisco-' . bin2hex(random_bytes(4));
        $this->write(XmppExternalServices::servicesRequest($id, $type, $to));
        return XmppExternalServices::parseServices($this->readIqResult($id));
    }

    public function requestUploadSlot(
        XmppJid|string $uploadService,
        string $fileName,
        int $size,
        ?string $contentType = null,
        ?string $id = null
    ): ?array {
        $id ??= 'upload-' . bin2hex(random_bytes(4));
        $this->write(XmppHttpUpload::slotRequest($id, $uploadService, $fileName, $size, $contentType));
        return XmppHttpUpload::parseSlotResult($this->readIqResult($id));
    }

    public function setClientActive(): void
    {
        $this->write(XmppClientState::active());
    }

    public function setClientInactive(): void
    {
        $this->write(XmppClientState::inactive());
    }

    public function enablePush(XmppJid|string $serviceJid, string $node, array $publishOptions = [], ?string $id = null): string
    {
        $id ??= 'push-' . bin2hex(random_bytes(4));
        $this->write(XmppPush::enableRequest($id, $serviceJid, $node, $publishOptions));
        return $this->readIqResult($id);
    }

    public function disablePush(XmppJid|string $serviceJid, ?string $node = null, ?string $id = null): string
    {
        $id ??= 'push-' . bin2hex(random_bytes(4));
        $this->write(XmppPush::disableRequest($id, $serviceJid, $node));
        return $this->readIqResult($id);
    }

    public function publishPubSubItem(string $node, string $itemId, string $payloadXml, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-publish-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::publishRequest($id, $node, $itemId, $payloadXml, $service));
        return $this->readIqResult($id);
    }

    public function createPubSubNode(string $node, ?string $configureFormXml = null, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-create-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::createNodeRequest($id, $node, $configureFormXml, $service));
        return $this->readIqResult($id);
    }

    /**
     * @return array{node:?string,items:list<array{id:?string,publisher:?string,payload:string>>}|null
     */
    public function getPubSubItems(string $node, XmppJid|string|null $owner = null, ?string $itemId = null, int $maxItems = 1, ?string $id = null): ?array
    {
        $id ??= 'pubsub-items-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::itemsRequest($id, $node, $owner, $itemId, $maxItems));
        return XmppPubSub::parseItemsResult($this->readIqResult($id));
    }

    /**
     * @return list<array{node:?string,jid:string,subscription:string,subscriptionId:?string,expiry:?string}>
     */
    public function getPubSubSubscriptions(?string $node = null, XmppJid|string|null $service = null, ?string $id = null): array
    {
        $id ??= 'pubsub-subscriptions-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::subscriptionsRequest($id, $node, $service));
        return XmppPubSub::parseSubscriptionsResult($this->readIqResult($id));
    }

    /**
     * @return list<array{node:?string,jid:?string,affiliation:string}>
     */
    public function getPubSubAffiliations(?string $node = null, XmppJid|string|null $service = null, ?string $id = null): array
    {
        $id ??= 'pubsub-affiliations-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::affiliationsRequest($id, $node, $service));
        return XmppPubSub::parseAffiliationsResult($this->readIqResult($id));
    }

    public function retractPubSubItem(string $node, string $itemId, bool $notify = true, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-retract-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::retractRequest($id, $node, $itemId, $notify, $service));
        return $this->readIqResult($id);
    }

    public function subscribePubSubNode(string $node, XmppJid|string $subscriber, XmppJid|string|null $service = null, ?string $optionsFormXml = null, ?string $id = null): string
    {
        $id ??= 'pubsub-subscribe-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::subscribeRequest($id, $node, $subscriber, $service, $optionsFormXml));
        return $this->readIqResult($id);
    }

    public function unsubscribePubSubNode(string $node, XmppJid|string $subscriber, ?string $subscriptionId = null, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-unsubscribe-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::unsubscribeRequest($id, $node, $subscriber, $subscriptionId, $service));
        return $this->readIqResult($id);
    }

    /**
     * @return list<array{type:?string,title:?string,instructions:list<string>,fields:array<string,array<string,mixed>>}>
     */
    public function getPubSubNodeConfiguration(string $node, XmppJid|string|null $service = null, ?string $id = null): array
    {
        $id ??= 'pubsub-config-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::nodeConfigurationRequest($id, $node, $service));
        return XmppPubSub::parseConfigurationForms($this->readIqResult($id));
    }

    public function configurePubSubNode(string $node, string $formXml, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-configure-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::configureNodeRequest($id, $node, $formXml, $service));
        return $this->readIqResult($id);
    }

    public function deletePubSubNode(string $node, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-delete-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::deleteNodeRequest($id, $node, $service));
        return $this->readIqResult($id);
    }

    public function purgePubSubNode(string $node, XmppJid|string|null $service = null, ?string $id = null): string
    {
        $id ??= 'pubsub-purge-' . bin2hex(random_bytes(4));
        $this->write(XmppPubSub::purgeNodeRequest($id, $node, $service));
        return $this->readIqResult($id);
    }

    public function getPrivateStorage(string $elementName, string $namespace, ?string $id = null): ?string
    {
        $id ??= 'private-' . bin2hex(random_bytes(4));
        $this->write(XmppPrivateStorage::getRequest($id, $elementName, $namespace));
        return XmppPrivateStorage::firstPayloadXml($this->readIqResult($id));
    }

    public function setPrivateStorage(string $payloadXml, ?string $id = null): string
    {
        $id ??= 'private-' . bin2hex(random_bytes(4));
        $this->write(XmppPrivateStorage::setRequest($id, $payloadXml));
        return $this->readIqResult($id);
    }

    /**
     * @return list<array{jid:string,name:?string,nick:?string,autojoin:bool}>
     */
    public function getBookmarks(?string $id = null): array
    {
        $id ??= 'bookmarks-' . bin2hex(random_bytes(4));
        $this->write(XmppBookmarks::privateGetRequest($id));
        return XmppBookmarks::parsePrivateStorageResult($this->readIqResult($id));
    }

    /**
     * @param list<array{jid:string,name?:string,nick?:string,autojoin?:bool}> $conferences
     */
    public function setBookmarks(array $conferences, ?string $id = null): string
    {
        $id ??= 'bookmarks-' . bin2hex(random_bytes(4));
        $this->write(XmppBookmarks::privateSetRequest($id, $conferences));
        return $this->readIqResult($id);
    }

    public function publishAvatar(string $imageBytes, string $mediaType, ?int $width = null, ?int $height = null): string
    {
        $avatarId = XmppAvatar::idFromBytes($imageBytes);
        $dataId = 'avatar-data-' . bin2hex(random_bytes(4));
        $metadataId = 'avatar-meta-' . bin2hex(random_bytes(4));

        $this->write(XmppAvatar::publishDataRequest($dataId, $imageBytes));
        $this->readIqResult($dataId);
        $this->write(XmppAvatar::publishMetadataRequest($metadataId, $avatarId, $mediaType, strlen($imageBytes), $width, $height));
        $this->readIqResult($metadataId);

        return $avatarId;
    }

    public function disableAvatar(?string $id = null): string
    {
        $id ??= 'avatar-disable-' . bin2hex(random_bytes(4));
        $this->write(XmppAvatar::disableMetadataRequest($id));
        return $this->readIqResult($id);
    }

    public function nextStanza(int $timeoutSeconds = 30): XmppIncomingStanza
    {
        $deadline = microtime(true) + $timeoutSeconds;
        while (true) {
            $xml = $this->readNextElement($deadline, usePending: false);
            $kind = XmppXml::document($xml)->documentElement?->localName;
            if (in_array($kind, ['message', 'presence', 'iq'], true)) {
                return XmppIncomingStanza::parse($xml);
            }
        }
    }

    private function connect(): void
    {
        $transport = $this->settings->directTls ? 'tls' : 'tcp';
        $remote = $transport . '://' . $this->settings->host . ':' . $this->settings->port;
        $context = stream_context_create([
            'ssl' => [
                'peer_name' => $this->settings->tlsName(),
                'verify_peer' => true,
                'verify_peer_name' => true,
                'SNI_enabled' => true,
                'crypto_method' => STREAM_CRYPTO_METHOD_TLS_CLIENT,
            ],
        ]);

        $errno = 0;
        $errstr = '';
        $this->stream = @stream_socket_client($remote, $errno, $errstr, $this->timeoutSeconds, STREAM_CLIENT_CONNECT, $context);
        if (!is_resource($this->stream)) {
            throw new \RuntimeException("Could not connect to {$remote}: {$errstr} ({$errno})");
        }

        stream_set_timeout($this->stream, $this->timeoutSeconds);
        $this->tlsActive = $this->settings->directTls;
    }

    /**
     * @return array<string,mixed>
     */
    private function openAndReadFeatures(): array
    {
        $this->buffer->reset();
        $this->write(XmppStream::open($this->settings->account->domain, $this->settings->preferredLanguage, $this->settings->account));
        $this->readUntilOpen();
        $featuresXml = $this->readElementNamed('features');
        return XmppStreamFeatures::parse($featuresXml);
    }

    private function enableCrypto(): void
    {
        if (!is_resource($this->stream)) {
            throw new \RuntimeException('No active stream.');
        }

        $enabled = @stream_socket_enable_crypto($this->stream, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        if ($enabled !== true) {
            throw new \RuntimeException('Could not enable TLS on XMPP stream.');
        }
        $this->tlsActive = true;
    }

    private function write(string $xml): void
    {
        if (!is_resource($this->stream)) {
            throw new \RuntimeException('No active stream.');
        }

        fwrite($this->stream, $xml);
        fflush($this->stream);
    }

    private function authenticate(string $mechanism, string $authcid, string $password): void
    {
        if ($mechanism === XmppSasl::PLAIN) {
            $this->write(XmppSasl::plainAuth($authcid, $password));
            $success = $this->readElementNamed('success');
            if (!XmppSasl::isSuccess($success)) {
                throw new \RuntimeException('SASL PLAIN login failed.');
            }
            return;
        }

        if ($mechanism === XmppSasl::SCRAM_SHA_1 || $mechanism === XmppSasl::SCRAM_SHA_256) {
            $scram = new XmppSaslScram($mechanism, $authcid, $password);
            $this->write($scram->initialAuthElement());
            $challenge = $this->readElementNamed('challenge');
            $this->write($scram->responseElementFromChallengeXml($challenge));
            $final = $this->readAnyElementNamed(['success', 'challenge', 'failure']);
            $finalName = XmppXml::document($final)->documentElement?->localName;
            if ($finalName === 'failure') {
                throw new \RuntimeException("SASL {$mechanism} login failed.");
            }

            if ($finalName === 'challenge') {
                if (!$scram->verifyServerFinalXml($final)) {
                    throw new \RuntimeException("SASL {$mechanism} server signature verification failed.");
                }
                $this->write(XmppSasl::emptyResponse());
                $success = $this->readElementNamed('success');
                if (!XmppSasl::isSuccess($success)) {
                    throw new \RuntimeException("SASL {$mechanism} login did not complete.");
                }
                return;
            }

            if (!XmppSasl::isSuccess($final)) {
                throw new \RuntimeException("SASL {$mechanism} login did not complete.");
            }

            $successText = XmppSasl::text($final);
            if ($successText !== '' && !$scram->verifyServerFinalXml($final)) {
                throw new \RuntimeException("SASL {$mechanism} server signature verification failed.");
            }
            return;
        }

        throw new \RuntimeException("Unsupported SASL mechanism {$mechanism}.");
    }

    private function readUntilOpen(): void
    {
        while (true) {
            foreach ($this->readNodes() as $node) {
                if ($node['type'] === 'open') {
                    return;
                }
            }
        }
    }

    private function readElementNamed(string $name): string
    {
        while (true) {
            foreach ($this->readNodes() as $node) {
                if ($node['type'] !== 'element') {
                    continue;
                }

                $rootName = XmppXml::document($node['xml'])->documentElement?->localName;
                if ($rootName === 'error') {
                    $this->throwStreamError($node['xml']);
                }

                if ($rootName === $name) {
                    return $node['xml'];
                }
            }
        }
    }

    private function readIqResult(string $id): string
    {
        $deadline = microtime(true) + $this->timeoutSeconds;
        while (true) {
            $xml = $this->readNextElement($deadline);
            $document = XmppXml::document($xml);
            $root = $document->documentElement;
            if ($root?->localName === 'iq' && $root->getAttribute('id') === $id) {
                $type = $root->getAttribute('type');
                if ($type === 'error') {
                    $error = XmppError::parseStanzaError($xml);
                    $condition = $error['condition'] ?? 'unknown-error';
                    $text = $error['text'] ?? null;
                    throw new \RuntimeException("IQ {$id} returned {$condition}" . ($text === null ? '.' : ": {$text}"));
                }
                return $xml;
            }

            $this->pendingElements[] = $xml;
        }
    }

    private function readNextElement(float $deadline, bool $usePending = true): string
    {
        if ($usePending && $this->pendingElements !== []) {
            return array_shift($this->pendingElements);
        }

        while (microtime(true) < $deadline) {
            foreach ($this->readNodes() as $node) {
                if ($node['type'] === 'element') {
                    $rootName = XmppXml::document($node['xml'])->documentElement?->localName;
                    if ($rootName === 'error') {
                        $this->throwStreamError($node['xml']);
                    }

                    return $node['xml'];
                }
            }
        }

        throw new \RuntimeException('Timed out while waiting for XMPP stanza.');
    }

    /**
     * @param array<int,string> $names
     */
    private function readAnyElementNamed(array $names): string
    {
        while (true) {
            foreach ($this->readNodes() as $node) {
                if ($node['type'] !== 'element') {
                    continue;
                }

                $rootName = XmppXml::document($node['xml'])->documentElement?->localName;
                if ($rootName === 'error') {
                    $this->throwStreamError($node['xml']);
                }

                if (in_array($rootName, $names, true)) {
                    return $node['xml'];
                }
            }
        }
    }

    private function throwStreamError(string $xml): never
    {
        $error = XmppError::parseStreamError($xml);
        if ($error === null) {
            throw new \RuntimeException('XMPP stream returned an error.');
        }

        $text = $error['text'] ?? null;
        throw new \RuntimeException('XMPP stream error ' . $error['condition'] . ($text === null ? '.' : ": {$text}"));
    }

    /**
     * @return array<int,array{type:string,xml:string}>
     */
    private function readNodes(): array
    {
        if (!is_resource($this->stream)) {
            throw new \RuntimeException('No active stream.');
        }

        while (true) {
            $nodes = $this->buffer->readAvailable();
            if ($nodes !== []) {
                return $nodes;
            }

            $chunk = fread($this->stream, 8192);
            if ($chunk === false || $chunk === '') {
                $meta = stream_get_meta_data($this->stream);
                if (($meta['timed_out'] ?? false) === true) {
                    throw new \RuntimeException('Timed out while reading XMPP stream.');
                }
                if (($meta['eof'] ?? false) === true) {
                    throw new \RuntimeException('XMPP stream closed by peer.');
                }
                usleep(10000);
                continue;
            }

            $this->buffer->append($chunk);
        }
    }
}
