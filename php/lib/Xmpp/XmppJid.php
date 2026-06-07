<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use InvalidArgumentException;

final class XmppJid
{
    public function __construct(
        public readonly ?string $local,
        public readonly string $domain,
        public readonly ?string $resource = null
    ) {
        if ($this->domain === '') {
            throw new InvalidArgumentException('XMPP domain is required.');
        }
    }

    public static function parse(string $value): self
    {
        $jid = self::tryParse($value);
        if ($jid === null) {
            throw new InvalidArgumentException('The value is not a valid XMPP address.');
        }

        return $jid;
    }

    public static function tryParse(?string $value): ?self
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);
        if ($value === '' || preg_match('/[\x00-\x1F\x7F\s]/u', $value)) {
            return null;
        }

        $slash = strpos($value, '/');
        $bare = $slash === false ? $value : substr($value, 0, $slash);
        $resource = $slash === false ? null : substr($value, $slash + 1);
        if ($bare === '' || $resource === '') {
            return null;
        }

        if (substr_count($bare, '@') > 1) {
            return null;
        }

        $local = null;
        $domain = $bare;
        if (str_contains($bare, '@')) {
            [$local, $domain] = explode('@', $bare, 2);
            if ($local === '' || str_contains($local, '/')) {
                return null;
            }
        }

        if ($domain === '' || str_contains($domain, '@') || str_contains($domain, '/')) {
            return null;
        }

        $domain = strtolower(idn_to_ascii($domain, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) ?: $domain);
        if (strlen($domain) > 255) {
            return null;
        }

        return new self($local, $domain, $resource);
    }

    public function bare(): string
    {
        return $this->local === null ? $this->domain : $this->local . '@' . $this->domain;
    }

    public function full(): string
    {
        return $this->resource === null ? $this->bare() : $this->bare() . '/' . $this->resource;
    }

    public function isBare(): bool
    {
        return $this->resource === null;
    }

    public function __toString(): string
    {
        return $this->full();
    }
}
