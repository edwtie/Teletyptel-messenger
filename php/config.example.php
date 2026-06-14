<?php
declare(strict_types=1);

return [
    'mysql' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'teletyptel',
        'username' => 'teletyptel',
        'password' => '',
        'charset' => 'utf8mb4',
    ],
    'xmpp_mysql' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'ejabberd',
        'username' => 'ejabberd',
        'password' => 'change-me',
        'charset' => 'utf8mb4',
    ],
    'smtp' => [
        'enabled' => false,
        'host' => 'smtp.freedom.nl',
        'port' => 587,
        'encryption' => 'starttls',
        // Freedom: use your complete e-mail address as username.
        'username' => 'your-mailbox@example.com',
        // Freedom authentication method: password.
        'password' => 'change-me',
        'from' => 'TeleTypTel <no-reply@example.com>',
        // Optional for local @localhost XMPP accounts: send reset links to this real mailbox.
        'local_recipient' => '',
        'timeout' => 10,
    ],
    'admin' => [
        // Emergency fallback for admin.php. Prefer the admin account created by install.php.
        // Environment variable TELETYPTEL_ADMIN_TOKEN wins.
        'token' => '',
    ],
    'sip' => [
        // SIP is a server/gateway layer through ejabberd_sip/mod_sip or an external gateway.
        'enabled' => false,
        'host' => 'localhost',
        'port' => 5060,
        'tls_port' => 5061,
        'module' => 'ejabberd_sip / mod_sip',
    ],
    'webrtc' => [
        // STUN helps browsers discover their public network address.
        // TURN is required for reliable calls/text-telephone use across strict NATs and mobile networks.
        'stun_urls' => 'stun:stun.l.google.com:19302',
        'turn_urls' => '',
        'turn_username' => '',
        'turn_credential' => '',
        // Use "relay" to force TURN-only media during production diagnostics.
        'ice_transport_policy' => 'all',
    ],
    'oauth' => [
        // Used when social login creates or links a TeleTypTel account.
        'xmpp_domain' => 'localhost',
        'xmpp_host' => 'localhost',
        'xmpp_websocket' => 'wss://localhost:5443/websocket/',
        'google' => [
            'client_id' => '',
            'client_secret' => '',
            'redirect_uri' => 'http://localhost/api/auth/google/callback',
            'authorization_endpoint' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token_endpoint' => 'https://oauth2.googleapis.com/token',
            'userinfo_endpoint' => 'https://openidconnect.googleapis.com/v1/userinfo',
            'scopes' => ['openid', 'email', 'profile'],
        ],
        'facebook' => [
            'app_id' => '',
            'app_secret' => '',
            'redirect_uri' => 'http://localhost/api/auth/facebook/callback',
            'authorization_endpoint' => 'https://www.facebook.com/v19.0/dialog/oauth',
            'token_endpoint' => 'https://graph.facebook.com/v19.0/oauth/access_token',
            'userinfo_endpoint' => 'https://graph.facebook.com/me',
            'scopes' => ['email', 'public_profile'],
        ],
        'apple' => [
            'client_id' => '',
            // Apple requires a client secret JWT. Generate it outside Git and place it here or inject it via environment.
            'client_secret' => '',
            'redirect_uri' => 'http://localhost/api/auth/apple/callback',
            'authorization_endpoint' => 'https://appleid.apple.com/auth/authorize',
            'token_endpoint' => 'https://appleid.apple.com/auth/token',
            'scopes' => ['name', 'email'],
        ],
        'auth0' => [
            'auth0_domain' => 'your-tenant.eu.auth0.com',
            'client_id' => '',
            'client_secret' => '',
            'redirect_uri' => 'http://localhost/api/auth/auth0/callback',
            'scopes' => ['openid', 'email', 'profile'],
        ],
    ],
];
