<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppBoshTransport
{
    private ?string $sid = null;
    private int $rid;

    public function __construct(
        private readonly string $endpointUrl,
        private readonly string $domain,
        private readonly string $preferredLanguage = 'en',
        private readonly int $timeoutSeconds = 15
    ) {
        if (trim($endpointUrl) === '') {
            throw new \InvalidArgumentException('BOSH endpoint URL is required.');
        }
        if (trim($domain) === '') {
            throw new \InvalidArgumentException('BOSH domain is required.');
        }

        $this->rid = random_int(100000, 999999);
    }

    /**
     * @return array<string,mixed>
     */
    public function connect(): array
    {
        $response = $this->post(XmppBosh::initialBody($this->domain, $this->nextRid(), $this->preferredLanguage));
        $body = XmppBosh::parseBody($response);
        if (($body['sid'] ?? null) === null) {
            throw new \RuntimeException('BOSH server did not return a sid.');
        }

        $this->sid = $body['sid'];
        return $body;
    }

    /**
     * @return array<string,mixed>
     */
    public function restartStream(): array
    {
        $this->requireSid();
        return XmppBosh::parseBody($this->post(XmppBosh::restartBody($this->sid, $this->nextRid(), $this->domain, $this->preferredLanguage)));
    }

    /**
     * @return array<string,mixed>
     */
    public function sendXml(string $payloadXml): array
    {
        $this->requireSid();
        return XmppBosh::parseBody($this->post(XmppBosh::payloadBody($this->sid, $this->nextRid(), $payloadXml)));
    }

    /**
     * @return array<string,mixed>
     */
    public function poll(): array
    {
        $this->requireSid();
        return XmppBosh::parseBody($this->post(XmppBosh::emptyBody($this->sid, $this->nextRid())));
    }

    public function terminate(): void
    {
        if ($this->sid === null) {
            return;
        }

        $this->post(XmppBosh::terminateBody($this->sid, $this->nextRid()));
        $this->sid = null;
    }

    public function sid(): ?string
    {
        return $this->sid;
    }

    private function nextRid(): int
    {
        return ++$this->rid;
    }

    private function requireSid(): void
    {
        if ($this->sid === null) {
            throw new \RuntimeException('BOSH session is not connected.');
        }
    }

    private function post(string $xml): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'timeout' => $this->timeoutSeconds,
                'ignore_errors' => true,
                'header' => implode("\r\n", [
                    'Content-Type: text/xml; charset=utf-8',
                    'Accept: text/xml, application/xml',
                    'Content-Length: ' . strlen($xml),
                ]),
                'content' => $xml,
            ],
        ]);

        $response = @file_get_contents($this->endpointUrl, false, $context);
        if ($response === false) {
            $error = error_get_last()['message'] ?? 'unknown error';
            throw new \RuntimeException('BOSH HTTP request failed: ' . $error);
        }

        $statusLine = $http_response_header[0] ?? '';
        if ($statusLine !== '' && !preg_match('/^HTTP\/\S+\s+2\d\d\b/', $statusLine)) {
            throw new \RuntimeException('BOSH HTTP request returned ' . $statusLine);
        }

        return $response;
    }
}
