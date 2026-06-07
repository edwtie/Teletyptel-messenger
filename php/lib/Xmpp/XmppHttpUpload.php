<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppHttpUpload
{
    public static function slotRequest(
        string $id,
        XmppJid|string $uploadService,
        string $fileName,
        int $size,
        ?string $contentType = null
    ): string {
        if ($fileName === '' || $size < 0) {
            throw new \InvalidArgumentException('Upload filename and size are required.');
        }

        $request = '<request' . XmppXml::attributes([
            'xmlns' => XmppXml::HTTP_UPLOAD_NS,
            'filename' => $fileName,
            'size' => $size,
            'content-type' => $contentType,
        ]) . '/>';
        return XmppStanza::iq('get', $id, $request, $uploadService);
    }

    /**
     * @return array{put:string,get:string,headers:array<string,string>}|null
     */
    public static function parseSlotResult(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $put = $xpath->query('/c:iq/hu:slot/hu:put')->item(0);
        $get = $xpath->query('/c:iq/hu:slot/hu:get')->item(0);
        if ($put === null || $get === null) {
            return null;
        }

        $putUrl = $put->attributes?->getNamedItem('url')?->nodeValue;
        $getUrl = $get->attributes?->getNamedItem('url')?->nodeValue;
        if ($putUrl === null || $getUrl === null) {
            return null;
        }

        $headers = [];
        foreach ($xpath->query('hu:header', $put) ?: [] as $header) {
            $name = $header->attributes?->getNamedItem('name')?->nodeValue;
            if ($name !== null && in_array(strtolower($name), ['authorization', 'cookie', 'expires'], true)) {
                $headers[$name] = $header->textContent;
            }
        }

        return ['put' => $putUrl, 'get' => $getUrl, 'headers' => $headers];
    }
}
