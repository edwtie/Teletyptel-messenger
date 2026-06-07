<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppStreamFeatures
{
    /**
     * @return array{
     *   startTlsOffered:bool,
     *   startTlsRequired:bool,
     *   saslMechanisms:array<int,string>,
     *   resourceBindingOffered:bool,
     *   resourceBindingRequired:bool,
     *   sessionOffered:bool,
     *   sessionRequired:bool,
     *   streamManagementOffered:bool,
     *   inBandRegistrationOffered:bool,
     *   clientStateIndicationOffered:bool
     * }
     */
    public static function parse(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $xpath->registerNamespace('tls', 'urn:ietf:params:xml:ns:xmpp-tls');

        $mechanisms = [];
        foreach ($xpath->query('/stream:features/sasl:mechanisms/sasl:mechanism') ?: [] as $node) {
            $mechanism = trim($node->textContent);
            if ($mechanism !== '') {
                $mechanisms[] = strtoupper($mechanism);
            }
        }

        return [
            'startTlsOffered' => ($xpath->query('/stream:features/tls:starttls')->length ?? 0) > 0,
            'startTlsRequired' => ($xpath->query('/stream:features/tls:starttls/tls:required')->length ?? 0) > 0,
            'saslMechanisms' => array_values(array_unique($mechanisms)),
            'resourceBindingOffered' => ($xpath->query('/stream:features/bind:bind')->length ?? 0) > 0,
            'resourceBindingRequired' => ($xpath->query('/stream:features/bind:bind/bind:required')->length ?? 0) > 0,
            'sessionOffered' => ($xpath->query('/stream:features/session:session')->length ?? 0) > 0,
            'sessionRequired' => ($xpath->query('/stream:features/session:session/session:required')->length ?? 0) > 0,
            'streamManagementOffered' => ($xpath->query('/stream:features/sm:sm')->length ?? 0) > 0,
            'inBandRegistrationOffered' => ($xpath->query('/stream:features/registerFeature:register')->length ?? 0) > 0,
            'clientStateIndicationOffered' => ($xpath->query('/stream:features/csi:csi')->length ?? 0) > 0,
        ];
    }
}
