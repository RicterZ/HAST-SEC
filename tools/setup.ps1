$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility
$setupRoot = Split-Path -Parent $PSScriptRoot
$resources = Get-Content -LiteralPath (Join-Path $setupRoot 'assets/resources.json') -Raw | ConvertFrom-Json
function Get-Resource($resource) {
    $destination = [IO.Path]::GetFullPath((Join-Path $setupRoot $resource.file))
    if (-not $destination.StartsWith($setupRoot + [IO.Path]::DirectorySeparatorChar)) { throw '资源路径无效.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination).Hash.ToLowerInvariant() -eq $resource.sha256) { return $destination }
    $partial = $destination + '.part'
    Write-Host ('正在获取: ' + [IO.Path]::GetFileName($destination))
    Invoke-WebRequest -UseBasicParsing -Uri $resource.url -OutFile $partial
    if ((Get-FileHash -LiteralPath $partial).Hash.ToLowerInvariant() -ne $resource.sha256) { Remove-Item -LiteralPath $partial; throw '下载校验失败, 请重试.' }
    Move-Item -LiteralPath $partial -Destination $destination -Force
    return $destination
}
$avatarPath = Join-Path $setupRoot 'assets/avatar.vrm'
if (-not (Test-Path -LiteralPath $avatarPath)) { Get-Resource $resources.avatar | Out-Null }
Write-Host '运行资源安装完成. 使用npm start启动.'
