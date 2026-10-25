using System.Diagnostics;
using System.Net.Http;

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("This Visual Studio launcher is for Windows. Run the project with npm run dev on another operating system.");
    return 1;
}

string projectRoot;
try
{
    projectRoot = FindProjectRoot();
}
catch (DirectoryNotFoundException)
{
    return Fail("Could not find package.json. Open NyravaLeadEngine.sln from the extracted project folder.");
}

var nodeVersionResult = await RunShellAndCaptureAsync("node --version", projectRoot);
if (nodeVersionResult.ExitCode != 0 || !Version.TryParse(nodeVersionResult.Output.Trim().TrimStart('v'), out var nodeVersion))
{
    return Fail("Node.js is missing. Install Node.js 22.13 or newer, then press Start again.");
}

if (nodeVersion < new Version(22, 13))
{
    return Fail($"This project needs Node.js 22.13 or newer. Your version is {nodeVersion}.");
}

var vinextCli = Path.Combine(projectRoot, "node_modules", "vinext", "dist", "cli.js");
var installMarker = Path.Combine(projectRoot, "node_modules", ".nyrava-install-complete");
if (!File.Exists(installMarker) || !File.Exists(vinextCli))
{
    try { File.Delete(installMarker); } catch { }
    Console.WriteLine("Installing or repairing Nyrava Lead Engine dependencies. This can take a few minutes...");
    var installExitCode = await RunShellAsync("npm ci --no-audit --no-fund", projectRoot);

    if (installExitCode != 0 || !File.Exists(vinextCli))
    {
        Console.WriteLine("The ZIP lockfile could not be used. Installing from package.json instead...");
        installExitCode = await RunShellAsync(
            "npm install --package-lock=false --no-audit --no-fund",
            projectRoot);
    }

    if (installExitCode != 0 || !File.Exists(vinextCli))
    {
        return Fail("Dependency installation did not finish. The npm output above shows the exact error. Fix that error, then press Start again.");
    }

    File.WriteAllText(installMarker, "Dependencies installed successfully.");
}

Console.WriteLine("Starting Nyrava Lead Engine. Keep Visual Studio running while using the app.");
Console.WriteLine("The browser will open at http://localhost:5173 when the app is ready.");

var server = StartShell("npm run dev", projectRoot);
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    StopProcessTree(server);
};
AppDomain.CurrentDomain.ProcessExit += (_, _) => StopProcessTree(server);

var appUrl = "http://localhost:5173/signin-with-chatgpt?return_to=/";
using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
var openedBrowser = false;
for (var attempt = 0; attempt < 240 && !server.HasExited; attempt++)
{
    try
    {
        using var response = await http.GetAsync("http://localhost:5173");
        Process.Start(new ProcessStartInfo(appUrl) { UseShellExecute = true });
        openedBrowser = true;
        break;
    }
    catch
    {
        await Task.Delay(500);
    }
}

if (!openedBrowser && !server.HasExited)
{
    Console.WriteLine($"The server is taking longer than expected. Open {appUrl} in your browser.");
}

await server.WaitForExitAsync();
if (server.ExitCode != 0)
{
    Console.Error.WriteLine($"The development server stopped with exit code {server.ExitCode}.");
    PauseBeforeExit();
}
return server.ExitCode;

static string FindProjectRoot()
{
    var startPoints = new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory };
    foreach (var startPoint in startPoints)
    {
        DirectoryInfo? current = new(startPoint);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "package.json")))
                return current.FullName;
            current = current.Parent;
        }
    }

    throw new DirectoryNotFoundException();
}

static Process StartShell(string command, string workingDirectory)
{
    var startInfo = new ProcessStartInfo("cmd.exe")
    {
        Arguments = $"/d /s /c \"{command}\"",
        WorkingDirectory = workingDirectory,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
    };

    var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Could not start the Windows command shell.");
    process.OutputDataReceived += (_, eventArgs) =>
    {
        if (eventArgs.Data is not null) Console.WriteLine(eventArgs.Data);
    };
    process.ErrorDataReceived += (_, eventArgs) =>
    {
        if (eventArgs.Data is not null) Console.Error.WriteLine(eventArgs.Data);
    };
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
    return process;
}

static async Task<int> RunShellAsync(string command, string workingDirectory)
{
    using var process = StartShell(command, workingDirectory);
    await process.WaitForExitAsync();
    return process.ExitCode;
}

static async Task<(int ExitCode, string Output)> RunShellAndCaptureAsync(string command, string workingDirectory)
{
    var startInfo = new ProcessStartInfo("cmd.exe")
    {
        Arguments = $"/d /s /c \"{command}\"",
        WorkingDirectory = workingDirectory,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
    };

    using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Could not run the Node.js version check.");
    var outputTask = process.StandardOutput.ReadToEndAsync();
    var errorTask = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    var output = await outputTask;
    var error = await errorTask;
    return (process.ExitCode, string.IsNullOrWhiteSpace(output) ? error : output);
}

static int Fail(string message)
{
    Console.Error.WriteLine(message);
    PauseBeforeExit();
    return 1;
}

static void PauseBeforeExit()
{
    if (Console.IsInputRedirected) return;
    Console.WriteLine("Press Enter to close this window.");
    Console.ReadLine();
}

static void StopProcessTree(Process process)
{
    try
    {
        if (!process.HasExited)
            process.Kill(entireProcessTree: true);
    }
    catch
    {
        // Visual Studio may already have stopped the child process.
    }
}
