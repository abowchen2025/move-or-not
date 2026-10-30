#!/usr/bin/env bash
# 送 PR 前的自我檢查（CLAUDE.md §7）：
#   1. 去識別化：比對 DEID_KEYWORDS_FILE 指向的關鍵字清單（清單放在 repo 以外）
#   2. 機密：web/dist/ 不得含 ADMIN_PASSPHRASE 字樣；本機有密語值時，repo 與 web/dist/ 都不得含該值
#   3. 版控：不得有 .env 檔被加入版控（.env.example 除外）
# 命中時只印檔名與關鍵字序號，不印關鍵字或密語本身。
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
repo_root="$(pwd -P)"
export LC_ALL=C
status=0

mapfile -d '' repo_files < <(git -c core.quotepath=off ls-files -z --cached --others --exclude-standard)
existing_repo_files=()
for file in "${repo_files[@]}"; do
  [ -f "$file" ] && existing_repo_files+=("$file")
done
dist_files=()
if [ -d web/dist ]; then
  mapfile -d '' dist_files < <(find web/dist -type f -print0)
fi

# --- 1. 去識別化 ---------------------------------------------------------
echo "[1/3] 去識別化關鍵字"
if [ -z "${DEID_KEYWORDS_FILE:-}" ]; then
  echo "  [提醒] 未設定 DEID_KEYWORDS_FILE，略過關鍵字比對。請在本機設定後再執行一次。"
elif [ ! -f "$DEID_KEYWORDS_FILE" ]; then
  echo "  [失敗] DEID_KEYWORDS_FILE 指向的檔案不存在。" >&2
  status=1
else
  keywords_path="$(cd "$(dirname "$DEID_KEYWORDS_FILE")" && pwd -P)/$(basename "$DEID_KEYWORDS_FILE")"
  case "$keywords_path" in
    "$repo_root"/*)
      echo "  [失敗] 關鍵字清單不可放在 repo 內，請移到 repo 以外的位置。" >&2
      status=1
      ;;
    *)
      targets=("${existing_repo_files[@]}" "${dist_files[@]}")
      index=0
      hits=0
      while IFS= read -r line || [ -n "$line" ]; do
        keyword="${line%$'\r'}"
        keyword="${keyword#"${keyword%%[![:space:]]*}"}"
        keyword="${keyword%"${keyword##*[![:space:]]}"}"
        [ -z "$keyword" ] && continue
        case "$keyword" in "#"*) continue ;; esac
        index=$((index + 1))
        while IFS= read -r matched; do
          [ -n "$matched" ] || continue
          echo "  [命中] 第 ${index} 個關鍵字：${matched}" >&2
          hits=$((hits + 1))
        done < <(grep -I -i -l -F -e "$keyword" -- "${targets[@]}" 2>/dev/null)
      done < "$DEID_KEYWORDS_FILE"
      if [ "$hits" -gt 0 ]; then
        echo "  [失敗] 共 ${hits} 處命中。" >&2
        status=1
      else
        echo "  通過：${index} 個關鍵字，檢查 ${#targets[@]} 個檔案，沒有命中。"
      fi
      ;;
  esac
fi

# --- 2. 機密 -------------------------------------------------------------
echo "[2/3] 機密"
secret_status=0
passphrase="${ADMIN_PASSPHRASE:-}"
if [ -z "$passphrase" ] && [ -f api/.env ]; then
  passphrase="$(sed -n 's/^[[:space:]]*ADMIN_PASSPHRASE[[:space:]]*=[[:space:]]*//p' api/.env | tail -n 1 | tr -d '\r')"
  passphrase="${passphrase%\"}"; passphrase="${passphrase#\"}"
  passphrase="${passphrase%\'}"; passphrase="${passphrase#\'}"
fi

if [ "${#dist_files[@]}" -eq 0 ]; then
  echo "  [提醒] web/dist/ 不存在或是空的，略過打包檔檢查（請先執行 npm run build）。"
else
  if matched="$(grep -I -l -F -e "ADMIN_PASSPHRASE" -- "${dist_files[@]}")"; then
    echo "  [失敗] web/dist/ 含有 ADMIN_PASSPHRASE 字樣：" >&2
    echo "$matched" | sed 's/^/    /' >&2
    secret_status=1
  fi
fi
if [ -n "$passphrase" ]; then
  if matched="$(grep -l -F -e "$passphrase" -- "${existing_repo_files[@]}" "${dist_files[@]}")"; then
    echo "  [失敗] 以下檔案含有本機密語的值：" >&2
    echo "$matched" | sed 's/^/    /' >&2
    secret_status=1
  fi
else
  echo "  [提醒] 未取得本機密語值（ADMIN_PASSPHRASE 或 api/.env），只檢查字樣。"
fi
if [ "$secret_status" -eq 0 ]; then
  echo "  通過。"
else
  status=1
fi

# --- 3. 版控 -------------------------------------------------------------
echo "[3/3] .env 版控"
tracked_env="$(git -c core.quotepath=off ls-files | grep -E '(^|/)\.env(\.[^/]*)?$' | grep -v -E '\.env\.example$' || true)"
if [ -n "$tracked_env" ]; then
  echo "  [失敗] 以下 .env 檔被加入版控：" >&2
  echo "$tracked_env" | sed 's/^/    /' >&2
  status=1
else
  echo "  通過：沒有 .env 檔被加入版控。"
fi

if [ "$status" -ne 0 ]; then
  echo "check-deid 失敗。" >&2
  exit 1
fi
echo "check-deid 全部通過。"
