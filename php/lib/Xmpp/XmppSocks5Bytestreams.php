<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;
use InvalidArgumentException;

final class XmppSocks5Bytestreams
{
    /**
     * @param list<array{jid:string|XmppJid,host:string,port?:int|null,zeroconf?:string|null}> $streamHosts
     */
    public static function bytestreamRequest(
        string $id,
        XmppJid|string $to,
        string $sid,
        array $streamHosts,
        string $mode = 'tcp'
    ): string {
        if (trim($sid) === '') {
            throw new InvalidArgumentException('SOCKS5 bytestream sid is required.');
        }
        if ($streamHosts === []) {
            throw new InvalidArgumentException('SOCKS5 bytestream request needs at least one streamhost.');
        }

        $hostsXml = '';
        foreach ($streamHosts as $host) {
            $hostsXml .= self::streamHostElement($host);
        }

        $query = '<query' . XmppXml::attributes([
            'xmlns' => XmppXml::S5B_NS,
            'sid' => $sid,
            'mode' => $mode === 'tcp' ? null : $mode,
        ]) . '>' . $hostsXml . '</query>';

        return XmppStanza::iq('set', $id, $query, $to);
    }

    public static function proxyAddressRequest(string $id, XmppJid|string $proxy): string
    {
        return XmppStanza::iq('get', $id, '<query xmlns="' . XmppXml::S5B_NS . '"/>', $proxy);
    }

    public static function activationRequest(
        string $id,
        XmppJid|string $proxy,
        string $sid,
        XmppJid|string $target
    ): string {
        if (trim($sid) === '') {
            throw new InvalidArgumentException('SOCKS5 activation sid is required.');
        }

        $query = '<query' . XmppXml::attributes([
            'xmlns' => XmppXml::S5B_NS,
            'sid' => $sid,
        ]) . '><activate>' . XmppXml::escape(self::jid($target)->full()) . '</activate></query>';

        return XmppStanza::iq('set', $id, $query, $proxy);
    }

    public static function streamHostUsedResult(
        string $id,
        XmppJid|string $to,
        XmppJid|string $streamHost
    ): string {
        $query = '<query xmlns="' . XmppXml::S5B_NS . '"><streamhost-used'
            . XmppXml::attributes(['jid' => self::jid($streamHost)->full()])
            . '/></query>';

        return XmppStanza::iq('result', $id, $query, $to);
    }

    /**
     * @return array{sid:string,mode:string,streamHosts:list<array{jid:string,host:string,port:?int,zeroconf:?string}>}|null
     */
    public static function parseBytestreamRequest(string $xml): ?array
    {
        $query = self::queryElement($xml);
        if ($query === null || $query->getAttribute('sid') === '') {
            return null;
        }

        $hosts = [];
        foreach ($query->getElementsByTagNameNS(XmppXml::S5B_NS, 'streamhost') as $hostNode) {
            if ($hostNode instanceof DOMElement) {
                $host = self::parseStreamHostElement($hostNode);
                if ($host !== null) {
                    $hosts[] = $host;
                }
            }
        }
        if ($hosts === []) {
            return null;
        }

        return [
            'sid' => $query->getAttribute('sid'),
            'mode' => $query->getAttribute('mode') ?: 'tcp',
            'streamHosts' => $hosts,
        ];
    }

    /**
     * @return list<array{jid:string,host:string,port:?int,zeroconf:?string}>
     */
    public static function parseProxyAddressResult(string $xml): array
    {
        $query = self::queryElement($xml);
        if ($query === null) {
            return [];
        }

        $hosts = [];
        foreach ($query->getElementsByTagNameNS(XmppXml::S5B_NS, 'streamhost') as $hostNode) {
            if ($hostNode instanceof DOMElement) {
                $host = self::parseStreamHostElement($hostNode);
                if ($host !== null) {
                    $hosts[] = $host;
                }
            }
        }

        return $hosts;
    }

    /**
     * @return array{jid:string}|null
     */
    public static function parseStreamHostUsedResult(string $xml): ?array
    {
        $query = self::queryElement($xml);
        $used = $query?->getElementsByTagNameNS(XmppXml::S5B_NS, 'streamhost-used')->item(0);
        if (!$used instanceof DOMElement || $used->getAttribute('jid') === '') {
            return null;
        }

        return ['jid' => XmppJid::parse($used->getAttribute('jid'))->full()];
    }

    /**
     * @return array{sid:string,target:string}|null
     */
    public static function parseActivationRequest(string $xml): ?array
    {
        $query = self::queryElement($xml);
        $activate = $query?->getElementsByTagNameNS(XmppXml::S5B_NS, 'activate')->item(0);
        if (!$activate instanceof DOMElement || $query === null || $query->getAttribute('sid') === '') {
            return null;
        }

        return [
            'sid' => $query->getAttribute('sid'),
            'target' => XmppJid::parse(trim($activate->textContent))->full(),
        ];
    }

    public static function destinationAddress(string $sid, XmppJid|string $requester, XmppJid|string $target): string
    {
        if (trim($sid) === '') {
            throw new InvalidArgumentException('SOCKS5 destination sid is required.');
        }

        return sha1($sid . self::jid($requester)->full() . self::jid($target)->full());
    }

    /**
     * @param array{jid:string|XmppJid,host:string,port?:int|null,zeroconf?:string|null} $host
     */
    public static function streamHostElement(array $host): string
    {
        if (($host['host'] ?? '') === '') {
            throw new InvalidArgumentException('SOCKS5 streamhost host is required.');
        }

        return '<streamhost' . XmppXml::attributes([
            'xmlns' => XmppXml::S5B_NS,
            'jid' => self::jid($host['jid'])->full(),
            'host' => $host['host'],
            'port' => $host['port'] ?? null,
            'zeroconf' => $host['zeroconf'] ?? null,
        ]) . '/>';
    }

    /**
     * @return array{jid:string,host:string,port:?int,zeroconf:?string}|null
     */
    private static function parseStreamHostElement(DOMElement $element): ?array
    {
        if ($element->namespaceURI !== XmppXml::S5B_NS
            || $element->localName !== 'streamhost'
            || $element->getAttribute('jid') === ''
            || $element->getAttribute('host') === '') {
            return null;
        }

        return [
            'jid' => XmppJid::parse($element->getAttribute('jid'))->full(),
            'host' => $element->getAttribute('host'),
            'port' => $element->getAttribute('port') === '' ? null : (int)$element->getAttribute('port'),
            'zeroconf' => $element->getAttribute('zeroconf') ?: null,
        ];
    }

    private static function queryElement(string $xml): ?DOMElement
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        if ($root instanceof DOMElement && $root->namespaceURI === XmppXml::S5B_NS && $root->localName === 'query') {
            return $root;
        }

        $xpath = XmppXml::xpath($document);
        $query = $xpath->query('//s5b:query')->item(0);
        return $query instanceof DOMElement ? $query : null;
    }

    private static function jid(XmppJid|string $jid): XmppJid
    {
        return $jid instanceof XmppJid ? $jid : XmppJid::parse($jid);
    }
}
