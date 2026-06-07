<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppConnectionSettings
{
    public function __construct(
        public readonly XmppJid $account,
        public readonly string $host,
        public readonly int $port = 5222,
        public readonly bool $requireTls = true,
        public readonly bool $directTls = false,
        public readonly ?string $tlsServerName = null,
        public readonly string $preferredLanguage = 'en'
    ) {
        if ($this->host === '') {
            throw new \InvalidArgumentException('XMPP host is required.');
        }

        if ($this->port <= 0 || $this->port > 65535) {
            throw new \InvalidArgumentException('XMPP port must be between 1 and 65535.');
        }
    }

    public static function forAccount(XmppJid|string $account): self
    {
        $jid = $account instanceof XmppJid ? $account : XmppJid::parse($account);
        return new self($jid, $jid->domain);
    }

    public function tlsName(): string
    {
        return $this->tlsServerName ?: $this->account->domain;
    }
}
