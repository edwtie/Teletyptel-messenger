$ErrorActionPreference = 'Stop'

function Get-PhpExecutable {
    $candidates = @()
    $phpCommand = Get-Command php -ErrorAction SilentlyContinue
    if ($phpCommand) {
        $candidates += $phpCommand.Source
    }

    $wampCandidates = Get-ChildItem 'C:\wamp64\bin\php' -Recurse -Filter php.exe -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -ExpandProperty FullName

    $candidates += $wampCandidates

    foreach ($candidate in $candidates | Select-Object -Unique) {
        $versionOutput = & $candidate -v 2>&1
        if ($LASTEXITCODE -eq 0 -and -not ($versionOutput -match 'Failed loading')) {
            return $candidate
        }
    }

    throw 'PHP was not found. Install PHP or WAMP, then run this script again.'
}

function Read-ExactBytes {
    param(
        [System.IO.Stream] $Stream,
        [int] $Count
    )

    $buffer = New-Object byte[] $Count
    $offset = 0
    while ($offset -lt $Count) {
        $read = $Stream.Read($buffer, $offset, $Count - $offset)
        if ($read -le 0) {
            throw 'Unexpected end of stream.'
        }

        $offset += $read
    }

    return $buffer
}

function Read-HttpHeaders {
    param(
        [System.IO.Stream] $Stream
    )

    $bytes = New-Object System.Collections.Generic.List[byte]
    while ($true) {
        $next = $Stream.ReadByte()
        if ($next -lt 0) {
            throw 'Unexpected end of stream while reading WebSocket handshake.'
        }

        $bytes.Add([byte]$next)
        if ($bytes.Count -ge 4) {
            $end = $bytes.Count - 1
            if (
                $bytes[$end - 3] -eq 13 -and
                $bytes[$end - 2] -eq 10 -and
                $bytes[$end - 1] -eq 13 -and
                $bytes[$end] -eq 10
            ) {
                return [Text.Encoding]::ASCII.GetString($bytes.ToArray())
            }
        }
    }
}

function Send-WebSocketText {
    param(
        [System.IO.Stream] $Stream,
        [string] $Text
    )

    $payload = [Text.Encoding]::UTF8.GetBytes($Text)
    if ($payload.Length -gt 125) {
        throw 'Smoke test only supports small WebSocket frames.'
    }

    $mask = [byte[]](0x11, 0x22, 0x33, 0x44)
    $frame = New-Object byte[] (2 + 4 + $payload.Length)
    $frame[0] = 0x81
    $frame[1] = [byte](0x80 -bor $payload.Length)
    [Array]::Copy($mask, 0, $frame, 2, 4)

    for ($i = 0; $i -lt $payload.Length; $i++) {
        $frame[6 + $i] = $payload[$i] -bxor $mask[$i % 4]
    }

    $Stream.Write($frame, 0, $frame.Length)
    $Stream.Flush()
}

function Receive-WebSocketText {
    param(
        [System.IO.Stream] $Stream
    )

    $header = Read-ExactBytes -Stream $Stream -Count 2
    $length = $header[1] -band 0x7f
    if ($length -eq 126) {
        $extended = Read-ExactBytes -Stream $Stream -Count 2
        $length = ($extended[0] -shl 8) -bor $extended[1]
    } elseif ($length -eq 127) {
        throw 'Smoke test does not support 64-bit WebSocket frame lengths.'
    }

    $payload = Read-ExactBytes -Stream $Stream -Count $length
    return [Text.Encoding]::UTF8.GetString($payload)
}

$php = Get-PhpExecutable
$relay = Join-Path $PSScriptRoot 'rtt-websocket-server.php'
$outLog = Join-Path $PSScriptRoot 'rtt-websocket-server.out.log'
$errLog = Join-Path $PSScriptRoot 'rtt-websocket-server.err.log'
$port = 18787
$oldPort = $env:RTT_RELAY_PORT

Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

Write-Host "PHP: $php"
$env:RTT_RELAY_PORT = [string]$port
$server = Start-Process -FilePath $php `
    -ArgumentList @('-f', "`"$relay`"") `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog

try {
    Start-Sleep -Milliseconds 700
    if ($server.HasExited) {
        $errorText = ''
        if (Test-Path $errLog) {
            $errorText = Get-Content $errLog -Raw
        }

        throw "Relay exited before the smoke test could connect. $errorText"
    }

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $client.Connect('127.0.0.1', $port)
        $stream = $client.GetStream()
        $key = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
        $request = "GET / HTTP/1.1`r`n" +
            "Host: 127.0.0.1:$port`r`n" +
            "Upgrade: websocket`r`n" +
            "Connection: Upgrade`r`n" +
            "Sec-WebSocket-Key: $key`r`n" +
            "Sec-WebSocket-Version: 13`r`n" +
            "Sec-WebSocket-Protocol: xmpp`r`n" +
            "`r`n"

        $requestBytes = [Text.Encoding]::ASCII.GetBytes($request)
        $stream.Write($requestBytes, 0, $requestBytes.Length)
        $stream.Flush()

        $headers = Read-HttpHeaders -Stream $stream
        if ($headers -notmatch '101 Switching Protocols' -or $headers -notmatch 'Sec-WebSocket-Protocol:\s*xmpp') {
            throw "Expected RFC 7395 WebSocket handshake, got: $headers"
        }

        $open = '<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="localhost" version="1.0"/>'
        Send-WebSocketText -Stream $stream -Text $open

        $response = Receive-WebSocketText -Stream $stream
        if ($response -notmatch '<open' -or $response -notmatch 'urn:ietf:params:xml:ns:xmpp-framing') {
            throw "Expected RFC 7395 open response, got: $response"
        }

        $close = '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>'
        Send-WebSocketText -Stream $stream -Text $close

        Write-Host 'RFC 7395 PHP relay smoke test passed.'
    } finally {
        $client.Close()
    }
} finally {
    if (-not $server.HasExited) {
        Stop-Process -Id $server.Id -Force
    }

    if ($null -eq $oldPort) {
        Remove-Item Env:RTT_RELAY_PORT -ErrorAction SilentlyContinue
    } else {
        $env:RTT_RELAY_PORT = $oldPort
    }
}
