#!/usr/bin/env bash
# 開発環境セットアップ用: git の hooksPath をリポジトリ同梱の .githooks に向ける。
# クローン直後にこのスクリプトを 1 回実行する。
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks
echo "configured core.hooksPath=.githooks (pre-commit 厳密品質ゲートが有効)"
