
$sh = New-Object -ComObject Shell.Application
$bin = $sh.Namespace(0xA) # ssfBITBUCKET
$items = @()
$totalBytes = 0

foreach ($it in $bin.Items()) {
    $size = [int64]$it.Size
    $totalBytes += $size
    $name = [string]$it.Name
    $ext = [System.IO.Path]::GetExtension($name).TrimStart('.')
    $items += [PSCustomObject]@{
        name = $name
        original_path = [string]$it.Path
        recycle_path = [string]$it.Path
        size_bytes = $size
        deleted_at = if ($it.ModifyDate) { ([datetime]$it.ModifyDate).ToString('o') } else { (Get-Date).ToString('o') }
        file_type = $ext
    }
}

[PSCustomObject]@{
    total_items = $items.Count
    total_bytes = $totalBytes
    items = $items
} | ConvertTo-Json -Depth 3 -Compress
