#!/usr/bin/env bash
# AC-30（SRS §3.3 規則 1、D-22-p）：web/src（排除 stories/）與 api/（排除 seed/）
# 不得出現主題字詞。包含尚未 commit、但未被 .gitignore 排除的新檔案。
#
# 關鍵字以 UTF-8 位元組表示，腳本本身不含主題字詞：
#   U+642C；U+53F0 U+4E2D；U+81FA U+4E2D（後者為異體寫法）
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
export LC_ALL=C

patterns=(
  -e $'\xe6\x90\xac'
  -e $'\xe5\x8f\xb0\xe4\xb8\xad'
  -e $'\xe8\x87\xba\xe4\xb8\xad'
)

mapfile -d '' files < <(
  git -c core.quotepath=off ls-files -z --cached --others --exclude-standard -- \
    web/src api ':(exclude)web/src/stories/' ':(exclude)api/seed/'
)

found=0
checked=0
for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  checked=$((checked + 1))
  if grep -I -n -H -F "${patterns[@]}" -- "$file"; then
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo "AC-30 失敗：上列檔案含有主題字詞，請改從 web/src/stories/ 的劇本設定檔讀取。" >&2
  exit 1
fi
echo "AC-30 通過：檢查 ${checked} 個檔案，沒有主題字詞。"
