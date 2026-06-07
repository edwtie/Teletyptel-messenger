<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppAdHocCommands
{
    public const NODE = XmppXml::COMMANDS_NS;

    public static function discoveryRequest(string $id, XmppJid|string $to): string
    {
        return XmppDisco::itemsRequest($id, $to, self::NODE);
    }

    public static function executeRequest(
        string $id,
        XmppJid|string $to,
        string $node,
        ?string $sessionId = null,
        string $action = 'execute',
        ?string $dataFormXml = null
    ): string {
        $content = $dataFormXml ?? '';
        $command = '<command' . XmppXml::attributes([
            'xmlns' => XmppXml::COMMANDS_NS,
            'node' => $node,
            'sessionid' => $sessionId,
            'action' => $action,
        ]) . '>' . $content . '</command>';

        return XmppStanza::iq('set', $id, $command, $to);
    }

    public static function cancelRequest(string $id, XmppJid|string $to, string $node, string $sessionId): string
    {
        return self::executeRequest($id, $to, $node, $sessionId, 'cancel');
    }

    public static function completeRequest(string $id, XmppJid|string $to, string $node, string $sessionId, ?string $dataFormXml = null): string
    {
        return self::executeRequest($id, $to, $node, $sessionId, 'complete', $dataFormXml);
    }

    /**
     * @return array{node:?string,sessionId:?string,status:?string,action:?string,defaultAction:?string,actions:list<string>,notes:list<array{type:?string,text:string}>,dataForms:list<array<string,mixed>>}|null
     */
    public static function parseResult(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $command = $xpath->query('//commands:command')->item(0);
        if (!$command instanceof DOMElement) {
            return null;
        }

        $actions = [];
        $defaultAction = null;
        $notes = [];

        foreach ($command->childNodes as $child) {
            if (!$child instanceof DOMElement || $child->namespaceURI !== XmppXml::COMMANDS_NS) {
                continue;
            }

            if ($child->localName === 'actions') {
                $defaultAction = $child->getAttribute('execute') ?: null;
                foreach ($child->childNodes as $actionNode) {
                    if ($actionNode instanceof DOMElement && $actionNode->namespaceURI === XmppXml::COMMANDS_NS) {
                        $actions[] = $actionNode->localName;
                    }
                }
                continue;
            }

            if ($child->localName === 'note') {
                $notes[] = [
                    'type' => $child->getAttribute('type') ?: null,
                    'text' => $child->textContent,
                ];
            }
        }

        return [
            'node' => $command->getAttribute('node') ?: null,
            'sessionId' => $command->getAttribute('sessionid') ?: null,
            'status' => $command->getAttribute('status') ?: null,
            'action' => $command->getAttribute('action') ?: null,
            'defaultAction' => $defaultAction,
            'actions' => $actions,
            'notes' => $notes,
            'dataForms' => XmppDataForm::parseForms($xml),
        ];
    }
}
