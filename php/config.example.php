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
    ],
];
