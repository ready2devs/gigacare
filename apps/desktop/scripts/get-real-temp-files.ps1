
$userTemp = [System.IO.Path]::GetTempPath().TrimEnd('\')
$winTemp = "C:\Windows\Temp"

function Get-TopFiles($folderPath, $maxCount = 8) {
    if (-not (Test-Path $folderPath)) { return @() }
    $items = Get-ChildItem -Path $folderPath -Force -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer } |
        Sort-Object Length -Descending | Select-Object -First $maxCount
    $res = @()
    foreach ($it in $items) {
        $ageDays = if ($it.LastWriteTime) { [math]::Max(0, [int]((Get-Date) - $it.LastWriteTime).TotalDays) } else { 0 }
        $res += [PSCustomObject]@{
            id = $it.FullName
            display_name = $it.Name
            path = $it.FullName
            size_bytes = [int64]$it.Length
            safe = $true
            age_days = $ageDays
            age_display = if ($ageDays -eq 0) { "Hoy" } elseif ($ageDays -lt 30) { "$ageDays días" } else { "$([math]::Round($ageDays/30)) meses" }
            source_type = "temp"
        }
    }
    return $res
}

$userFiles = Get-TopFiles $userTemp 6
$winFiles = Get-TopFiles $winTemp 4
$allTempFiles = $userFiles + $winFiles

$totalUser = (Get-ChildItem -Path $userTemp -Force -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$totalWin = (Get-ChildItem -Path $winTemp -Force -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$totalTemp = [int64]($totalUser + $totalWin)

[PSCustomObject]@{
    total_bytes = $totalTemp
    items = $allTempFiles
} | ConvertTo-Json -Depth 3 -Compress
