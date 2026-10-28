$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$address = 'http://localhost:8765'

function Test-MiniBank {
    try {
        $session = Invoke-RestMethod -Uri "$address/api/session" -TimeoutSec 2
        return $session.application -eq 'minibank'
    } catch { return $false }
}

try {
    if (Test-MiniBank) {
        Start-Process $address
        exit 0
    }
    Push-Location (Join-Path $projectRoot 'frontend')
    try {
        if (-not (Test-Path -LiteralPath 'node_modules')) {
            & npm.cmd ci --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Angular build failed.' }
    } finally { Pop-Location }
    & wsl.exe -d Ubuntu --cd $projectRoot -- bash tools/web.sh --prepare
    if ($LASTEXITCODE -ne 0) { throw 'COBOL preparation failed.' }
    $serverArguments = @('-d', 'Ubuntu', '--cd', ('"' + $projectRoot + '"'), '--', 'python3', 'web/server.py')
    $serverProcess = Start-Process -FilePath 'wsl.exe' -ArgumentList $serverArguments -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $projectRoot 'build\web-server.log') `
        -RedirectStandardError (Join-Path $projectRoot 'build\web-server-error.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-MiniBank) {
            Write-Host "MiniBank is ready: $address"
            Start-Process $address
            exit 0
        }
        if ($serverProcess.HasExited) { throw 'The local server stopped. See build/web-server-error.log.' }
        Start-Sleep -Milliseconds 500
    }
    throw 'The local server did not become ready. See build/web-server-error.log.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
