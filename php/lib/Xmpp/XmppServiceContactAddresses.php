<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppServiceContactAddresses
{
    /** @var array<string,string> */
    private const FIELD_BY_KIND = [
        'abuse' => 'abuse-addresses',
        'admin' => 'admin-addresses',
        'feedback' => 'feedback-addresses',
        'sales' => 'sales-addresses',
        'security' => 'security-addresses',
        'status' => 'status-addresses',
        'support' => 'support-addresses',
    ];

    /**
     * @param array<string,list<string>|string> $addresses
     */
    public static function dataFormElement(array $addresses): string
    {
        $fields = ['FORM_TYPE' => ['type' => 'hidden', 'value' => XmppXml::SERVERINFO_NS]];
        foreach (self::FIELD_BY_KIND as $kind => $fieldName) {
            if (!array_key_exists($kind, $addresses)) {
                continue;
            }

            $values = is_array($addresses[$kind]) ? $addresses[$kind] : [$addresses[$kind]];
            $values = array_values(array_filter(array_map('strval', $values), self::isAbsoluteUri(...)));
            if ($values !== []) {
                $fields[$fieldName] = ['values' => $values, 'type' => 'list-multi'];
            }
        }

        return XmppDataForm::formElement($fields, 'result');
    }

    /**
     * @return list<array{kind:string,uri:string}>
     */
    public static function parseFromDiscoInfo(string $xml): array
    {
        $contacts = [];
        foreach (XmppDataForm::parseForms($xml) as $form) {
            $formType = $form['fields']['FORM_TYPE']['values'][0] ?? null;
            if ($formType !== XmppXml::SERVERINFO_NS) {
                continue;
            }

            foreach (self::FIELD_BY_KIND as $kind => $fieldName) {
                foreach ($form['fields'][$fieldName]['values'] ?? [] as $uri) {
                    if (self::isAbsoluteUri($uri)) {
                        $contacts[$kind . "\n" . $uri] = ['kind' => $kind, 'uri' => $uri];
                    }
                }
            }
        }

        return array_values($contacts);
    }

    private static function isAbsoluteUri(string $value): bool
    {
        return preg_match('/^[A-Za-z][A-Za-z0-9+.-]*:/', $value) === 1;
    }
}
