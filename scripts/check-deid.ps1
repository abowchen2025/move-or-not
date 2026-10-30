#Requires -Version 5.1
# 送 PR 前的自我檢查（CLAUDE.md §7）：
#   1. 去識別化：比對 DEID_KEYWORDS_FILE 指向的關鍵字清單（清單放在 repo 以外）
#   2. 機密：web/dist/ 不得含 ADMIN_PASSPHRASE 字樣；本機有密語值時，repo 與 web/dist/ 都不得含該值
#   3. 版控：不得有 .env 檔被加入版控（.env.example 除外）
# 命中時只印檔名與關鍵字序號，不印關鍵字或密語本身。
# 本檔需存成 UTF-8 with BOM，Windows PowerShell 5.1 才會正確讀取中文訊息。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$root = (& git rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Location -LiteralPath $root
$rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
$status = 0

function Write-Fail([string]$message) {
    [Console]::Error.WriteLine($message)
}

# 讀檔：回傳文字；二進位檔回傳 $null
function Read-TextFile([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if ([Array]::IndexOf($bytes, [byte]0) -ge 0) { return $null }
    return $utf8.GetString($bytes)
}

$repoFiles = @(& git -c core.quotepath=off ls-files --cached --others --exclude-standard |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) })
$distFiles = @()
if (Test-Path -LiteralPath 'web/dist' -PathType Container) {
    $distFiles = @(Get-ChildItem -LiteralPath 'web/dist' -Recurse -File |
        ForEach-Object { $_.FullName.Substring($rootFull.Length + 1).Replace('\', '/') })
}

# --- 1. 去識別化 ---------------------------------------------------------
Write-Output '[1/3] 去識別化關鍵字'
$keywordsFile = $env:DEID_KEYWORDS_FILE
if (-not $keywordsFile) {
    Write-Output '  [提醒] 未設定 DEID_KEYWORDS_FILE，略過關鍵字比對。請在本機設定後再執行一次。'
}
elseif (-not (Test-Path -LiteralPath $keywordsFile -PathType Leaf)) {
    Write-Fail '  [失敗] DEID_KEYWORDS_FILE 指向的檔案不存在。'
    $status = 1
}
else {
    $keywordsFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $keywordsFile).Path)
    if ($keywordsFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Fail '  [失敗] 關鍵字清單不可放在 repo 內，請移到 repo 以外的位置。'
        $status = 1
    }
    else {
        $keywords = @(Get-Content -LiteralPath $keywordsFile -Encoding UTF8 |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') })
        $targets = @($repoFiles) + @($distFiles)
        $hits = 0
        foreach ($target in $targets) {
            $text = Read-TextFile (Join-Path $root $target)
            if ($null -eq $text) { continue }
            for ($k = 0; $k -lt $keywords.Count; $k++) {
                if ($text.IndexOf($keywords[$k], [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                    Write-Fail ("  [命中] 第 {0} 個關鍵字：{1}" -f ($k + 1), $target)
                    $hits++
                }
            }
        }
        if ($hits -gt 0) {
            Write-Fail "  [失敗] 共 $hits 處命中。"
            $status = 1
        }
        else {
            Write-Output ("  通過：{0} 個關鍵字，檢查 {1} 個檔案，沒有命中。" -f $keywords.Count, $targets.Count)
        }
    }
}

# --- 2. 機密 -------------------------------------------------------------
Write-Output '[2/3] 機密'
$secretStatus = 0
$passphrase = $env:ADMIN_PASSPHRASE
if (-not $passphrase -and (Test-Path -LiteralPath 'api/.env' -PathType Leaf)) {
    $line = Get-Content -LiteralPath 'api/.env' -Encoding UTF8 |
        Where-Object { $_ -match '^\s*ADMIN_PASSPHRASE\s*=' } | Select-Object -Last 1
    if ($line) {
        $passphrase = ($line -replace '^\s*ADMIN_PASSPHRASE\s*=\s*', '').Trim().Trim('"').Trim("'")
    }
}

if ($distFiles.Count -eq 0) {
    Write-Output '  [提醒] web/dist/ 不存在或是空的，略過打包檔檢查（請先執行 npm run build）。'
}
else {
    foreach ($target in $distFiles) {
        $text = Read-TextFile (Join-Path $root $target)
        if ($null -ne $text -and $text.IndexOf('ADMIN_PASSPHRASE', [StringComparison]::Ordinal) -ge 0) {
            Write-Fail "  [失敗] web/dist/ 含有 ADMIN_PASSPHRASE 字樣：$target"
            $secretStatus = 1
        }
    }
}
if ($passphrase) {
    foreach ($target in (@($repoFiles) + @($distFiles))) {
        $text = $utf8.GetString([System.IO.File]::ReadAllBytes((Join-Path $root $target)))
        if ($text.IndexOf($passphrase, [StringComparison]::Ordinal) -ge 0) {
            Write-Fail "  [失敗] 含有本機密語的值：$target"
            $secretStatus = 1
        }
    }
}
else {
    Write-Output '  [提醒] 未取得本機密語值（ADMIN_PASSPHRASE 或 api/.env），只檢查字樣。'
}
if ($secretStatus -eq 0) { Write-Output '  通過。' } else { $status = 1 }

# --- 3. 版控 -------------------------------------------------------------
Write-Output '[3/3] .env 版控'
$trackedEnv = @(& git -c core.quotepath=off ls-files |
    Where-Object { $_ -match '(^|/)\.env(\.[^/]*)?$' -and $_ -notmatch '\.env\.example$' })
if ($trackedEnv.Count -gt 0) {
    Write-Fail '  [失敗] 以下 .env 檔被加入版控：'
    $trackedEnv | ForEach-Object { Write-Fail "    $_" }
    $status = 1
}
else {
    Write-Output '  通過：沒有 .env 檔被加入版控。'
}

if ($status -ne 0) {
    Write-Fail 'check-deid 失敗。'
    exit 1
}
Write-Output 'check-deid 全部通過。'
exit 0
