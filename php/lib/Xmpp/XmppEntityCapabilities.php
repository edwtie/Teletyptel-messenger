<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppEntityCapabilities
{
    /**
     * @param list<array{category:string,type:string,lang?:string,name?:string}> $identities
     * @param list<string> $features
     * @param list<array<string,list<string>>> $forms
     */
    public static function calculateVer(array $identities, array $features, array $forms = []): string
    {
        $parts = [];
        $identityStrings = [];
        foreach ($identities as $identity) {
            $identityStrings[] = ($identity['category'] ?? '') . '/'
                . ($identity['type'] ?? '') . '/'
                . ($identity['lang'] ?? '') . '/'
                . ($identity['name'] ?? '');
        }
        sort($identityStrings, SORT_STRING);
        foreach ($identityStrings as $identityString) {
            $parts[] = $identityString . '<';
        }

        $features = array_values(array_unique($features));
        sort($features, SORT_STRING);
        foreach ($features as $feature) {
            $parts[] = $feature . '<';
        }

        foreach (self::canonicalForms($forms) as $formPart) {
            $parts[] = $formPart;
        }

        return base64_encode(sha1(implode('', $parts), true));
    }

    public static function presenceElement(string $node, string $ver, string $hash = 'sha-1'): string
    {
        return '<c' . XmppXml::attributes([
            'xmlns' => XmppXml::CAPS_NS,
            'hash' => $hash,
            'node' => $node,
            'ver' => $ver,
        ]) . '/>';
    }

    /**
     * @return array{node:?string,ver:?string,hash:?string}
     */
    public static function parsePresence(string $presenceXml): array
    {
        $document = XmppXml::document($presenceXml);
        $xpath = XmppXml::xpath($document);
        $node = $xpath->query('/c:presence/caps:c')->item(0);

        return [
            'node' => $node?->attributes?->getNamedItem('node')?->nodeValue,
            'ver' => $node?->attributes?->getNamedItem('ver')?->nodeValue,
            'hash' => $node?->attributes?->getNamedItem('hash')?->nodeValue,
        ];
    }

    /**
     * @param list<array<string,list<string>>> $forms
     * @return list<string>
     */
    private static function canonicalForms(array $forms): array
    {
        $canonical = [];
        foreach ($forms as $form) {
            $formType = $form['FORM_TYPE'][0] ?? null;
            if ($formType === null) {
                continue;
            }

            $fieldNames = array_keys($form);
            sort($fieldNames, SORT_STRING);
            $part = $formType . '<';
            foreach ($fieldNames as $fieldName) {
                if ($fieldName === 'FORM_TYPE') {
                    continue;
                }

                $values = $form[$fieldName];
                sort($values, SORT_STRING);
                $part .= $fieldName . '<' . implode('<', $values) . '<';
            }
            $canonical[] = $part;
        }
        sort($canonical, SORT_STRING);

        return $canonical;
    }
}
