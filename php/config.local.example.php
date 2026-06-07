<?php
declare(strict_types=1);

return [
    'smtp' => [
        'enabled' => true,
        'host' => 'smtp.freedom.nl',
        'port' => 587,
        'encryption' => 'starttls',
        'username' => 'your-email@example.nl',
        'password' => 'your-smtp-password',
        'from' => 'TeleTypTel <your-email@example.nl>',
        'timeout' => 10,
    ],
];
