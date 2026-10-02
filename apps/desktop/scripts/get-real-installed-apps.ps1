
$ua = @{}
$uaPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist'
Get-ChildItem $uaPath -ErrorAction SilentlyContinue | Get-ChildItem -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.PSChildName -eq 'Count') {
        $k = $_
        $k.Property | ForEach-Object {
            $p = $_
            $chars = $p.ToCharArray() | ForEach-Object {
                $c = [int]$_
                if ($c -ge 65 -and $c -le 90) { [char]((($c - 65 + 13) % 26) + 65) }
                elseif ($c -ge 97 -and $c -le 122) { [char]((($c - 97 + 13) % 26) + 97) }
                else { [char]$c }
            }
            $dec = -join $chars
            $b = $k.GetValue($p)
            if ($b -and $b.Length -ge 68) {
                $cnt = [BitConverter]::ToInt32($b, 4)
                $ft = [BitConverter]::ToInt64($b, 60)
                if ($ft -gt 0) {
                    try {
                        $d = [DateTime]::FromFileTimeUtc($ft)
                        $leaf = [System.IO.Path]::GetFileNameWithoutExtension($dec).ToUpper()
                        if ($leaf.Length -gt 1) {
                            if (-not $ua.ContainsKey($leaf) -or $d -gt $ua[$leaf].Date) {
                                $ua[$leaf] = @{ Date = $d; Count = $cnt }
                            }
                        }
                    } catch {}
                }
            }
        }
    }
}

$paths = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

$now = Get-Date

$apps = Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } |
  ForEach-Object {
    $src = if ($_.PSPath -like '*Wow6432Node*') { 'registry_wow64' } elseif ($_.PSPath -like '*HKCU*') { 'registry' } else { 'registry' }
    $name = $_.DisplayName.Trim()
    $nameClean = ($name -replace '[^a-zA-Z0-9]', '').ToUpper()
    
    $matched = $null
    foreach ($k in $ua.Keys) {
        if ($nameClean.Length -ge 3 -and ($nameClean.Contains($k) -or $k.Contains($nameClean.Substring(0, [Math]::Min(6, $nameClean.Length))))) {
            if (-not $matched -or $ua[$k].Date -gt $matched.Date) {
                $matched = $ua[$k]
            }
        }
    }
    
    $lastUsedAt = $null
    $lastUsedDays = $null
    $usageCount = $null
    
    if ($matched) {
        $lastUsedAt = $matched.Date.ToString('o')
        $lastUsedDays = [int]($now - $matched.Date).TotalDays
        $usageCount = $matched.Count
    } elseif ($_.InstallDate) {
        try {
            $idStr = [string]$_.InstallDate
            if ($idStr.Length -eq 8) {
                $year = [int]$idStr.Substring(0, 4)
                $month = [int]$idStr.Substring(4, 2)
                $day = [int]$idStr.Substring(6, 2)
                $iDate = Get-Date -Year $year -Month $month -Day $day
                $lastUsedDays = [int]($now - $iDate).TotalDays
                $lastUsedAt = $iDate.ToString('o')
            }
        } catch {}
    }

    [PSCustomObject]@{
      id = $_.PSChildName
      name = $name
      version = if ($_.DisplayVersion) { [string]$_.DisplayVersion } else { '1.0.0' }
      publisher = if ($_.Publisher) { [string]$_.Publisher } else { 'Desconocido' }
      size_bytes = if ($_.EstimatedSize) { [int64]$_.EstimatedSize * 1024 } else { 0 }
      source = $src
      install_date = if ($_.InstallDate) { [string]$_.InstallDate } else { $null }
      last_used_at = $lastUsedAt
      last_used_days = $lastUsedDays
      usage_count = $usageCount
    }
  } | Sort-Object name -Unique
$apps | ConvertTo-Json -Compress
