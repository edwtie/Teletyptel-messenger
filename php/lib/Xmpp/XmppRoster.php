<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppRoster
{
    public static function getRequest(string $id): string
    {
        return XmppStanza::iq('get', $id, '<query xmlns="' . XmppXml::ROSTER_NS . '"/>');
    }

    /**
     * @param array<int,string> $groups
     */
    public static function setItemRequest(
        string $id,
        XmppJid|string $jid,
        ?string $name = null,
        string $subscription = 'none',
        array $groups = []
    ): string {
        $groupXml = '';
        foreach ($groups as $group) {
            if (trim($group) !== '') {
                $groupXml .= XmppXml::textElement('group', XmppXml::ROSTER_NS, $group);
            }
        }

        $item = '<item' . XmppXml::attributes([
            'jid' => (string)XmppJid::parse((string)$jid)->bare(),
            'name' => $name,
            'subscription' => $subscription,
        ]) . '>' . $groupXml . '</item>';
        return XmppStanza::iq('set', $id, '<query xmlns="' . XmppXml::ROSTER_NS . '">' . $item . '</query>');
    }

    public static function removeItemRequest(string $id, XmppJid|string $jid): string
    {
        return self::setItemRequest($id, $jid, null, 'remove');
    }

    /**
     * @return list<array{jid:string,name:?string,subscription:string,ask:?string,approved:bool,groups:list<string>}>
     */
    public static function parseResult(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $items = [];

        foreach ($xpath->query('/c:iq/r:query/r:item | /c:iq/r:item') ?: [] as $item) {
            if (!$item instanceof DOMElement) {
                continue;
            }

            $jid = $item->getAttribute('jid');
            if ($jid === '') {
                continue;
            }

            $groups = [];
            foreach ($xpath->query('r:group', $item) ?: [] as $group) {
                $text = trim($group->textContent);
                if ($text !== '') {
                    $groups[] = $text;
                }
            }

            $items[] = [
                'jid' => XmppJid::parse($jid)->bare(),
                'name' => $item->getAttribute('name') ?: null,
                'subscription' => $item->getAttribute('subscription') ?: 'none',
                'ask' => $item->getAttribute('ask') ?: null,
                'approved' => in_array(strtolower($item->getAttribute('approved')), ['true', '1'], true),
                'groups' => $groups,
            ];
        }

        return $items;
    }
}
