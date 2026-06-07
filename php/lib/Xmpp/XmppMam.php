<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppMam
{
    public static function queryRequest(
        string $id,
        ?string $queryId = null,
        ?string $with = null,
        ?string $start = null,
        ?string $end = null,
        ?int $max = null,
        ?string $after = null,
        ?string $before = null
    ): string {
        $fields = [];
        foreach (['with' => $with, 'start' => $start, 'end' => $end] as $name => $value) {
            if ($value !== null && $value !== '') {
                $fields[$name] = $value;
            }
        }

        $rsm = ($max !== null || $after !== null || $before !== null)
            ? XmppResultSetManagement::setElement($max, $after, $before)
            : '';

        $payload = '<query' . XmppXml::attributes(['xmlns' => XmppXml::MAM_NS, 'queryid' => $queryId])
            . '>' . XmppDataForm::submitElement(XmppXml::MAM_NS, $fields)
            . $rsm
            . '</query>';
        return XmppStanza::iq('set', $id, $payload);
    }

    /**
     * @return list<array{id:?string,queryId:?string,stanzaId:?string,forwarded:?string}>
     */
    public static function parseResults(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $results = [];

        foreach ($xpath->query('//mam:result') ?: [] as $result) {
            $forwarded = $xpath->query('.//forward:forwarded', $result)->item(0);
            $results[] = [
                'id' => $result->attributes?->getNamedItem('id')?->nodeValue,
                'queryId' => $result->attributes?->getNamedItem('queryid')?->nodeValue,
                'stanzaId' => $result->attributes?->getNamedItem('id')?->nodeValue,
                'forwarded' => $forwarded === null ? null : XmppXml::nodeXml($forwarded),
            ];
        }

        return $results;
    }
}
