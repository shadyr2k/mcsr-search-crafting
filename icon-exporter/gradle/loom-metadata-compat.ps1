param(
    [Parameter(Mandatory = $true)]
    [string]$GradleUserHome
)

$ErrorActionPreference = 'Stop'

$loomCache = Join-Path $GradleUserHome 'caches\fabric-loom'
$manifestPath = Join-Path $loomCache 'version_manifest.json'
$versionPath = Join-Path $loomCache 'minecraft-1.16.1-info.json'

function Test-PlainJsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return $stream.ReadByte() -eq [byte][char]'{'
    } finally {
        $stream.Dispose()
    }
}

if ((Test-PlainJsonFile $manifestPath) -and (Test-PlainJsonFile $versionPath)) {
    return
}

New-Item -ItemType Directory -Force -Path $loomCache | Out-Null
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
$manifestJson = (Invoke-WebRequest -UseBasicParsing -Uri 'https://launchermeta.mojang.com/mc/game/version_manifest.json').Content
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8WithoutBom)

$manifest = $manifestJson | ConvertFrom-Json
$minecraftVersion = $manifest.versions | Where-Object { $_.id -eq '1.16.1' } | Select-Object -First 1
if ($null -eq $minecraftVersion) {
    throw 'Minecraft 1.16.1 is missing from Mojang version metadata.'
}

$versionJson = (Invoke-WebRequest -UseBasicParsing -Uri $minecraftVersion.url).Content
[System.IO.File]::WriteAllText($versionPath, $versionJson, $utf8WithoutBom)
