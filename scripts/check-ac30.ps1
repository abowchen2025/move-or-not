#Requires -Version 5.1
# AC-30（SRS §3.3 規則 1、D-22-p）：web/src（排除 stories/）與 api/（排除 seed/）
# 不得出現主題字詞。包含尚未 commit、但未被 .gitignore 排除的新檔案。
#
# 關鍵字以 Unicode 碼位表示，腳本本身不含主題字詞：
#   U+642C；U+53F0 U+4E2D；U+81FA U+4E2D（後者為異體寫法）
# 本檔需存成 UTF-8 with BOM，Windows PowerShell 5.1 才會正確讀取中文訊息。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$root = (& git rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Location -LiteralPath $root

$keywords = @(
    [string][char]0x642C,
    ([string][char]0x53F0 + [char]0x4E2D),
    ([string][char]0x81FA + [char]0x4E2D)
)

$files = @(& git -c core.quotepath=off ls-files --cached --others --exclude-standard -- `
        web/src api ':(exclude)web/src/stories/' ':(exclude)api/seed/')
if ($LASTEXITCODE -ne 0) { exit 1 }

$found = $false
$checked = 0
foreach ($file in $files) {
    if (-not $file -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
    $checked++
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root $file))
    if ([Array]::IndexOf($bytes, [byte]0) -ge 0) { continue }  # 略過二進位檔
    $lines = $utf8.GetString($bytes) -split "`r?`n"
    for ($i = 0; $i -lt $lines.Length; $i++) {
        foreach ($keyword in $keywords) {
            if ($lines[$i].IndexOf($keyword, [StringComparison]::Ordinal) -ge 0) {
                Write-Output ("{0}:{1}:{2}" -f $file, ($i + 1), $lines[$i])
                $found = $true
                break
            }
        }
    }
}

if ($found) {
    [Console]::Error.WriteLine('AC-30 失敗：上列檔案含有主題字詞，請改從 web/src/stories/ 的劇本設定檔讀取。')
    exit 1
}
Write-Output "AC-30 通過：檢查 $checked 個檔案，沒有主題字詞。"
exit 0
