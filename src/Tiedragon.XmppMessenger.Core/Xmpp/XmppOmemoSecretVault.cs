using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public interface IXmppOmemoSecretVault
{
    string Name { get; }

    bool IsAvailable { get; }

    Task SaveSecretAsync(string secretName, string secret, CancellationToken cancellationToken = default);

    Task<string?> LoadSecretAsync(string secretName, CancellationToken cancellationToken = default);

    Task<bool> DeleteSecretAsync(string secretName, CancellationToken cancellationToken = default);
}

public sealed class XmppOmemoUnavailableSecretVault : IXmppOmemoSecretVault
{
    public static XmppOmemoUnavailableSecretVault Instance { get; } = new();

    public string Name => "unavailable";

    public bool IsAvailable => false;

    public Task SaveSecretAsync(string secretName, string secret, CancellationToken cancellationToken = default)
    {
        _ = secretName;
        _ = secret;
        _ = cancellationToken;
        return Task.FromException(CreateException());
    }

    public Task<string?> LoadSecretAsync(string secretName, CancellationToken cancellationToken = default)
    {
        _ = secretName;
        _ = cancellationToken;
        return Task.FromException<string?>(CreateException());
    }

    public Task<bool> DeleteSecretAsync(string secretName, CancellationToken cancellationToken = default)
    {
        _ = secretName;
        _ = cancellationToken;
        return Task.FromException<bool>(CreateException());
    }

    private static NotSupportedException CreateException()
    {
        return new NotSupportedException("No native OMEMO secret vault is available on this platform.");
    }
}

public static class XmppOmemoSecretVaultFactory
{
    public static IXmppOmemoSecretVault CreateDefault(string localDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(localDirectory);

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return new XmppOmemoWindowsDpapiSecretVault(localDirectory);
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            return new XmppOmemoLinuxSecretServiceVault();
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            return new XmppOmemoMacOSKeychainSecretVault();
        }

        return XmppOmemoUnavailableSecretVault.Instance;
    }
}

public sealed class XmppOmemoWindowsDpapiSecretVault : IXmppOmemoSecretVault
{
    public const string ProviderName = "windows-dpapi-current-user";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _directory;

    public XmppOmemoWindowsDpapiSecretVault(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        _directory = directory;
    }

    public string Name => ProviderName;

    public bool IsAvailable => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    public async Task SaveSecretAsync(
        string secretName,
        string secret,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        ArgumentException.ThrowIfNullOrWhiteSpace(secret);

        var plain = Encoding.UTF8.GetBytes(secret);
        var encrypted = Protect(plain, Entropy(secretName));
        try
        {
            Directory.CreateDirectory(_directory);
            var dto = new SecretDto(
                Format: "tiedragon-omemo-secret",
                Version: 1,
                Provider: ProviderName,
                SecretNameHash: SecretNameHash(secretName),
                CipherText: Convert.ToBase64String(encrypted),
                UpdatedAt: DateTimeOffset.UtcNow);
            var path = FilePath(secretName);
            var tempPath = path + ".tmp";
            await File.WriteAllTextAsync(
                tempPath,
                JsonSerializer.Serialize(dto, JsonOptions),
                Encoding.UTF8,
                cancellationToken);
            File.Move(tempPath, path, overwrite: true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
            CryptographicOperations.ZeroMemory(encrypted);
        }
    }

    public async Task<string?> LoadSecretAsync(
        string secretName,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        var path = FilePath(secretName);
        if (!File.Exists(path))
        {
            return null;
        }

        var json = await File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken);
        var dto = JsonSerializer.Deserialize<SecretDto>(json, JsonOptions)
            ?? throw new InvalidDataException("The OMEMO secret vault file is empty.");
        ValidateDto(dto, secretName);

        var encrypted = Convert.FromBase64String(dto.CipherText);
        var plain = Unprotect(encrypted, Entropy(secretName));
        try
        {
            return Encoding.UTF8.GetString(plain);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(encrypted);
            CryptographicOperations.ZeroMemory(plain);
        }
    }

    public Task<bool> DeleteSecretAsync(
        string secretName,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        var path = FilePath(secretName);
        if (!File.Exists(path))
        {
            return Task.FromResult(false);
        }

        File.Delete(path);
        return Task.FromResult(true);
    }

    private void EnsureAvailable()
    {
        if (!IsAvailable)
        {
            throw new PlatformNotSupportedException("Windows DPAPI is only available on Windows.");
        }
    }

    private string FilePath(string secretName)
    {
        return Path.Combine(_directory, SecretNameHash(secretName) + ".json");
    }

    private static void ValidateDto(SecretDto dto, string secretName)
    {
        if (!string.Equals(dto.Format, "tiedragon-omemo-secret", StringComparison.Ordinal)
            || dto.Version != 1
            || !string.Equals(dto.Provider, ProviderName, StringComparison.Ordinal))
        {
            throw new InvalidDataException("The OMEMO secret vault file is not supported.");
        }

        if (!string.Equals(dto.SecretNameHash, SecretNameHash(secretName), StringComparison.Ordinal))
        {
            throw new InvalidDataException("The OMEMO secret vault file belongs to another secret.");
        }
    }

    private static string SecretNameHash(string secretName)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secretName))).ToLowerInvariant();
    }

    private static byte[] Entropy(string secretName)
    {
        return SHA256.HashData(Encoding.UTF8.GetBytes("Tiedragon.Teletyptel.OMEMO.SecretVault|" + secretName));
    }

    private static byte[] Protect(byte[] plain, byte[] entropy)
    {
        using var plainBlob = NativeBlob.FromBytes(plain);
        using var entropyBlob = NativeBlob.FromBytes(entropy);
        if (!CryptProtectData(
            ref plainBlob.Blob,
            "Tiedragon OMEMO key-store secret",
            ref entropyBlob.Blob,
            IntPtr.Zero,
            IntPtr.Zero,
            CryptProtectUiForbidden,
            out var output))
        {
            throw new CryptographicException(Marshal.GetLastPInvokeError());
        }

        try
        {
            return Copy(output);
        }
        finally
        {
            LocalFree(output.pbData);
        }
    }

    private static byte[] Unprotect(byte[] encrypted, byte[] entropy)
    {
        using var encryptedBlob = NativeBlob.FromBytes(encrypted);
        using var entropyBlob = NativeBlob.FromBytes(entropy);
        if (!CryptUnprotectData(
            ref encryptedBlob.Blob,
            out var description,
            ref entropyBlob.Blob,
            IntPtr.Zero,
            IntPtr.Zero,
            CryptProtectUiForbidden,
            out var output))
        {
            throw new CryptographicException(Marshal.GetLastPInvokeError());
        }

        try
        {
            return Copy(output);
        }
        finally
        {
            if (description != IntPtr.Zero)
            {
                LocalFree(description);
            }

            LocalFree(output.pbData);
        }
    }

    private static byte[] Copy(DataBlob blob)
    {
        var bytes = new byte[blob.cbData];
        Marshal.Copy(blob.pbData, bytes, 0, blob.cbData);
        return bytes;
    }

    private const int CryptProtectUiForbidden = 0x1;

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(
        ref DataBlob pDataIn,
        string? szDataDescr,
        ref DataBlob pOptionalEntropy,
        IntPtr pvReserved,
        IntPtr pPromptStruct,
        int dwFlags,
        out DataBlob pDataOut);

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(
        ref DataBlob pDataIn,
        out IntPtr ppszDataDescr,
        ref DataBlob pOptionalEntropy,
        IntPtr pvReserved,
        IntPtr pPromptStruct,
        int dwFlags,
        out DataBlob pDataOut);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr hMem);

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int cbData;
        public IntPtr pbData;
    }

    private sealed class NativeBlob : IDisposable
    {
        private NativeBlob(byte[] bytes)
        {
            Blob = new DataBlob
            {
                cbData = bytes.Length,
                pbData = Marshal.AllocHGlobal(bytes.Length)
            };
            Marshal.Copy(bytes, 0, Blob.pbData, bytes.Length);
        }

        public DataBlob Blob;

        public static NativeBlob FromBytes(byte[] bytes)
        {
            return new NativeBlob(bytes);
        }

        public void Dispose()
        {
            if (Blob.pbData != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(Blob.pbData);
                Blob.pbData = IntPtr.Zero;
            }
        }
    }

    private sealed record SecretDto(
        string Format,
        int Version,
        string Provider,
        string SecretNameHash,
        string CipherText,
        DateTimeOffset UpdatedAt);
}

public interface IXmppOmemoSecretCommandRunner
{
    bool IsCommandAvailable(string fileName);

    Task<XmppOmemoSecretCommandResult> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        string? standardInput = null,
        CancellationToken cancellationToken = default);
}

public sealed class XmppOmemoSystemSecretCommandRunner : IXmppOmemoSecretCommandRunner
{
    public static XmppOmemoSystemSecretCommandRunner Instance { get; } = new();

    public bool IsCommandAvailable(string fileName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);
        if (Path.IsPathFullyQualified(fileName))
        {
            return File.Exists(fileName);
        }

        var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(directory, fileName);
            if (File.Exists(candidate))
            {
                return true;
            }
        }

        return false;
    }

    public async Task<XmppOmemoSecretCommandResult> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        string? standardInput = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);
        ArgumentNullException.ThrowIfNull(arguments);

        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            RedirectStandardError = true,
            RedirectStandardInput = standardInput is not null,
            RedirectStandardOutput = true,
            UseShellExecute = false
        };

        foreach (var argument in arguments)
        {
            process.StartInfo.ArgumentList.Add(argument);
        }

        process.Start();
        if (standardInput is not null)
        {
            await process.StandardInput.WriteAsync(standardInput.AsMemory(), cancellationToken);
            process.StandardInput.Close();
        }

        var stdout = await process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderr = await process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        return new XmppOmemoSecretCommandResult(process.ExitCode, stdout, stderr);
    }
}

public sealed class XmppOmemoLinuxSecretServiceVault : IXmppOmemoSecretVault
{
    public const string ProviderName = "linux-secret-service";

    private readonly IXmppOmemoSecretCommandRunner _runner;
    private readonly string _command;
    private readonly bool _requireLinux;

    public XmppOmemoLinuxSecretServiceVault(
        IXmppOmemoSecretCommandRunner? runner = null,
        string command = "secret-tool",
        bool requireLinux = true)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(command);
        _runner = runner ?? XmppOmemoSystemSecretCommandRunner.Instance;
        _command = command;
        _requireLinux = requireLinux;
    }

    public string Name => ProviderName;

    public bool IsAvailable => (!_requireLinux || RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        && _runner.IsCommandAvailable(_command);

    public async Task SaveSecretAsync(
        string secretName,
        string secret,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        ArgumentException.ThrowIfNullOrWhiteSpace(secret);

        var result = await _runner.RunAsync(
            _command,
            SecretToolArguments("store", secretName, ["--label", "Tiedragon OMEMO key-store passphrase"]),
            secret,
            cancellationToken);
        EnsureSuccess(result, "store OMEMO key-store passphrase");
    }

    public async Task<string?> LoadSecretAsync(
        string secretName,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);

        var result = await _runner.RunAsync(
            _command,
            SecretToolArguments("lookup", secretName),
            cancellationToken: cancellationToken);
        if (result.ExitCode != 0)
        {
            return null;
        }

        return result.StandardOutput.TrimEnd('\r', '\n');
    }

    public async Task<bool> DeleteSecretAsync(
        string secretName,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);

        var result = await _runner.RunAsync(
            _command,
            SecretToolArguments("clear", secretName),
            cancellationToken: cancellationToken);
        return result.ExitCode == 0;
    }

    private void EnsureAvailable()
    {
        if (!IsAvailable)
        {
            throw new PlatformNotSupportedException("Linux Secret Service requires Linux and the secret-tool command.");
        }
    }

    private static IReadOnlyList<string> SecretToolArguments(
        string action,
        string secretName,
        IReadOnlyList<string>? prefix = null)
    {
        var arguments = new List<string> { action };
        if (prefix is not null)
        {
            arguments.AddRange(prefix);
        }

        arguments.AddRange(
        [
            "application",
            "tiedragon-xmpp-messenger",
            "purpose",
            "omemo-key-store",
            "name",
            secretName
        ]);
        return arguments;
    }

    private static void EnsureSuccess(XmppOmemoSecretCommandResult result, string action)
    {
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Could not {action}. secret-tool exited with {result.ExitCode}: {result.StandardError}");
        }
    }
}

public sealed class XmppOmemoMacOSKeychainSecretVault : IXmppOmemoSecretVault
{
    public const string ProviderName = "macos-keychain";
    private const string ServiceName = "Tiedragon Teletyptel OMEMO";
    private const int ErrSecSuccess = 0;
    private const int ErrSecItemNotFound = -25300;

    public string Name => ProviderName;

    public bool IsAvailable => RuntimeInformation.IsOSPlatform(OSPlatform.OSX);

    public Task SaveSecretAsync(
        string secretName,
        string secret,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);
        ArgumentException.ThrowIfNullOrWhiteSpace(secret);

        _ = DeleteSecretAsync(secretName, cancellationToken).GetAwaiter().GetResult();
        var serviceBytes = Encoding.UTF8.GetBytes(ServiceName);
        var accountBytes = Encoding.UTF8.GetBytes(secretName);
        var secretBytes = Encoding.UTF8.GetBytes(secret);
        try
        {
            var status = SecKeychainAddGenericPassword(
                IntPtr.Zero,
                (uint)serviceBytes.Length,
                serviceBytes,
                (uint)accountBytes.Length,
                accountBytes,
                (uint)secretBytes.Length,
                secretBytes,
                out var itemRef);
            if (itemRef != IntPtr.Zero)
            {
                CFRelease(itemRef);
            }

            if (status != ErrSecSuccess)
            {
                throw new CryptographicException($"macOS Keychain add failed with status {status}.");
            }

            return Task.CompletedTask;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(secretBytes);
        }
    }

    public Task<string?> LoadSecretAsync(
        string secretName,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);

        var serviceBytes = Encoding.UTF8.GetBytes(ServiceName);
        var accountBytes = Encoding.UTF8.GetBytes(secretName);
        var status = SecKeychainFindGenericPassword(
            IntPtr.Zero,
            (uint)serviceBytes.Length,
            serviceBytes,
            (uint)accountBytes.Length,
            accountBytes,
            out var passwordLength,
            out var passwordData,
            out var itemRef);
        if (status == ErrSecItemNotFound)
        {
            return Task.FromResult<string?>(null);
        }

        if (status != ErrSecSuccess)
        {
            throw new CryptographicException($"macOS Keychain lookup failed with status {status}.");
        }

        var bytes = new byte[checked((int)passwordLength)];
        try
        {
            Marshal.Copy(passwordData, bytes, 0, bytes.Length);
            return Task.FromResult<string?>(Encoding.UTF8.GetString(bytes));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
            SecKeychainItemFreeContent(IntPtr.Zero, passwordData);
            if (itemRef != IntPtr.Zero)
            {
                CFRelease(itemRef);
            }
        }
    }

    public Task<bool> DeleteSecretAsync(
        string secretName,
        CancellationToken cancellationToken = default)
    {
        EnsureAvailable();
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(secretName);

        var serviceBytes = Encoding.UTF8.GetBytes(ServiceName);
        var accountBytes = Encoding.UTF8.GetBytes(secretName);
        var status = SecKeychainFindGenericPassword(
            IntPtr.Zero,
            (uint)serviceBytes.Length,
            serviceBytes,
            (uint)accountBytes.Length,
            accountBytes,
            out _,
            out var passwordData,
            out var itemRef);
        if (status == ErrSecItemNotFound)
        {
            return Task.FromResult(false);
        }

        if (passwordData != IntPtr.Zero)
        {
            SecKeychainItemFreeContent(IntPtr.Zero, passwordData);
        }

        if (status != ErrSecSuccess)
        {
            throw new CryptographicException($"macOS Keychain lookup failed with status {status}.");
        }

        try
        {
            var deleteStatus = SecKeychainItemDelete(itemRef);
            if (deleteStatus != ErrSecSuccess)
            {
                throw new CryptographicException($"macOS Keychain delete failed with status {deleteStatus}.");
            }

            return Task.FromResult(true);
        }
        finally
        {
            if (itemRef != IntPtr.Zero)
            {
                CFRelease(itemRef);
            }
        }
    }

    private void EnsureAvailable()
    {
        if (!IsAvailable)
        {
            throw new PlatformNotSupportedException("macOS Keychain is only available on macOS.");
        }
    }

    [DllImport("/System/Library/Frameworks/Security.framework/Security")]
    private static extern int SecKeychainAddGenericPassword(
        IntPtr keychain,
        uint serviceNameLength,
        byte[] serviceName,
        uint accountNameLength,
        byte[] accountName,
        uint passwordLength,
        byte[] passwordData,
        out IntPtr itemRef);

    [DllImport("/System/Library/Frameworks/Security.framework/Security")]
    private static extern int SecKeychainFindGenericPassword(
        IntPtr keychain,
        uint serviceNameLength,
        byte[] serviceName,
        uint accountNameLength,
        byte[] accountName,
        out uint passwordLength,
        out IntPtr passwordData,
        out IntPtr itemRef);

    [DllImport("/System/Library/Frameworks/Security.framework/Security")]
    private static extern int SecKeychainItemDelete(IntPtr itemRef);

    [DllImport("/System/Library/Frameworks/Security.framework/Security")]
    private static extern int SecKeychainItemFreeContent(IntPtr attrList, IntPtr data);

    [DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")]
    private static extern void CFRelease(IntPtr cf);
}

public sealed record XmppOmemoSecretCommandResult(
    int ExitCode,
    string StandardOutput,
    string StandardError);
