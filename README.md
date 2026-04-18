# インシデント対応サポートエージェントon AWS

## 本システムの概要

本システムは、AWS環境で発生するアプリケーション障害を自動的に検知し、Amazon Bedrock経由でClaudeに調査とトリアージを行わせる、障害対応支援のためのリファレンス実装です。PagerDutyやZabbixを別途構築・運用しなくても、AWSネイティブサービスとClaudeの組み合わせだけで一次オンコール業務を回せる構成を示します。

システムは二段構えのマスキング機構（CloudWatch Logsのデータ保護機能とBedrock Guardrails）を備え、個人情報や金融情報が推論経路に流れ込む前に除去します。Step Functionsがモデル選択を明示的にルーティングし、Haikuでトリアージ、Sonnetで深堀り、Opusで最重大インシデントの根本原因分析を行います。生成された調査結果はDynamoDBにインシデントレコードとして記録され、SNS経由でオンコール担当者にメール通知されます。

本リポジトリにはTerraformによるIaC一式と、障害検知の動作検証用に適時障害を発生させるNode.jsサンプルアプリケーションが含まれています。ECR / ECS Fargate上で稼働し、HTTP 5xx、応答遅延、OOM、外部API呼び出し失敗、エラーログ急増の5種類の障害を発生させます。

動作検証が完了した段階で `scripts/destroy.sh` を実行すると、作成したリソース群はすべて削除されます。検証はus-east-1リージョンで行い、個人予算30 USD以内に収まるようAWS Budgetsによるキャップを設定しています。

## マスキング設計はログ層と推論層の二段でAWSネイティブに組みます

ログ層では [CloudWatch Logs のデータ保護ポリシー](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html)を使います。ロググループ単位またはアカウント単位で [managed data identifiers](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types-pii.html) を指定すると、PII / PHI / 金融情報などのプリセットに従ってingest時点で自動的にマスクがかかります。Logs Insightsやメトリックフィルタ、サブスクリプションフィルタといったすべてのegress経路でマスクが有効になるため、Claudeに渡す前段で機密情報を除去できます。ユースケース例は [Handling sensitive log data using Amazon CloudWatch](https://aws.amazon.com/blogs/mt/handling-sensitive-log-data-using-amazon-cloudwatch/) に詳説があります。追加コストはスキャンの従量課金のみで発生します。[Macie と CloudWatch Logs を組み合わせる公式パターン](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/secure-cloudwatch-logs-using-macie.html)も存在しますが、運用開始時点では別契約を要するスキャン系サービスは不要です。

推論層では [Bedrock Guardrails の Sensitive Information Filters](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html) を使います。入力プロンプトと応答の両方に対してマスクおよび拒否を適用できます。managed identifiersで取りこぼす業務固有の識別子については、正規表現ベースのcustom word / regexを [Guardrails](https://aws.amazon.com/bedrock/guardrails/) 側に追加します。AWS内で閉じた構成を保ったまま、推論経路の出入口で機密情報の流出を防ぐ設計です。

この二段構えにより、CloudWatch Logsのデータ保護機能でログを予防的に汚さない状態に保ちつつ、Guardrailsで推論経路も縛ります。管理対象のデータ領域を増やさずにマスキングを完結させられます。

## Agent Governance ToolkitをECS Fargateに配置します

[Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) はMITライセンスのモノレポ構成で、Python / .NET / TypeScript SDKを備えたstatelessなポリシーエンジンです。LangChainやCrewAI、Google ADK、Microsoft Agent Frameworkのnative hookに差し込むことができ、p99レイテンシ0.1ms未満を謳っています。本システムではECS Fargate上にサイドカーとして配置し、Bedrock Agent呼び出しの出口プロキシとして使います。OWASP Agentic Top 10の全項目をカバーし、v3.1ではagt CLIとGovernance Dashboard、shadow AI discoveryまで同梱されています。

ただしpublic preview段階のため破壊的変更が入りやすく、運用投入時にはバージョン固定とリグレッションテストの枠を必ず用意します。Bedrockは [CloudTrail が API 呼び出しを自動記録して CloudWatch に流す仕組み](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring.html)を持っています。Toolkit側で落としたeventをCloudWatch Logsに流し込み、CloudTrailと突き合わせることで、誰が何を呼び出してポリシーで何が止まったかをIAMユーザ単位で再現できます。

## コストはモデルルーティングと呼び出し上限で制御します

PagerDutyやZabbixのような監視スタックを別途立ち上げなくても、CloudWatch Alarms、EventBridge、Step Functions、Bedrock（Haiku → Sonnet → Opusのエスカレーション）、DynamoDB（インシデントおよびバグのDB）というAWSネイティブ構成でオンコール業務を回せます。

Bedrock Agentは1クエリで内部5コールを踏むケースが発生しやすく、エージェント課金が積み上がります。Budgetsでサービス別キャップを設定し、[Bedrock の料金体系](https://aws.amazon.com/bedrock/pricing/)を踏まえてCloudTrailのinvocation数からper-incidentコストを可視化します。Haikuでトリアージ、Sonnetで深堀り、OpusはP1のみに限定する運用ルールを、IAMポリシーとモデルID制限によって強制することで暴発を防ぎます。Opus呼び出しはPrompt Cachingを効かせる前提にしておくと、同一障害の再掘り下げで70〜90パーセントのコスト削減が見込めます。

詳細な課金試算は [docs/cost-estimate.md](docs/cost-estimate.md) に記載しています。

## 段階移行の設計

段階1ではCloudWatchデータ保護ポリシーを有効化し、既存ログのマスク状況を可視化します。これだけで監査対応の地盤が整います。段階2ではBedrockと [Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) を組み合わせ、手動Q&Aエージェントを構築し、HaikuによるトリアージとSonnetによる深堀りの二段階を動かします。段階3ではCloudTrailとAgentCoreで行動監査を取る土台が整った時点で、Agent Governance Toolkitを出口に挟み、OWASP Agenticのリスクをカバーします。段階4では重大インシデント系のみOpusとPrompt Cacheに昇格させます。

本リファレンス実装は、段階1から4までを一括でTerraform化しています。検証段階ではOpus呼び出しを最小化する運用ルールをIAMで強制し、Budgetsで30 USDの上限を設定しています。

## 構成図

AWS上の最終構成図は [docs/architecture.drawio](docs/architecture.drawio) に保存しています。[draw.io](https://app.diagrams.net/) またはVS CodeのDraw.io Integration拡張で開けます。オンラインで閲覧する場合は、draw.ioの「File → Open From → Device」からローカルの `architecture.drawio` を読み込んでください。

## ディレクトリ構成

```shell
incident-response-agent/
├── README.md                  本ファイル
├── docs/
│   ├── architecture.md        アーキテクチャ詳細
│   ├── cost-estimate.md       課金試算（us-east-1 および東京リージョン参考値）
│   └── runbook.md             デプロイと破棄の手順
├── terraform/                 IaC
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── providers.tf
│   ├── modules/               ネットワーク、アプリ、観測、パイプライン、保存、通知、予算
│   └── envs/dev/
├── apps/
│   ├── chaos-app/             Node.js 障害サンプルアプリ
│   └── agt-sidecar/           Agent Governance Toolkit 出口プロキシ
├── lambda/                    Bedrock 呼び出し Lambda (Haiku / Sonnet / Opus)
└── scripts/
    ├── deploy.sh              一括デプロイ
    ├── verify.sh              動作検証
    ├── trigger-chaos.sh       手動障害発生
    └── destroy.sh             一括削除
```

## クイックスタート

前提としてAWS CLI、Terraform 1.14+、Docker、Node.js 22+がインストールされていて、us-east-1のBedrockでClaude Haiku / Sonnet / Opusのモデルアクセスが許可されている必要があります。

```bash
cd terraform/envs/dev
terraform init
terraform apply

# ECR にコンテナイメージを push
../../../scripts/deploy.sh

# 動作検証
../../../scripts/verify.sh

# 手動で障害を発生させて通知を確認
../../../scripts/trigger-chaos.sh oom

# 動作確認後は全リソースを削除
../../../scripts/destroy.sh
```

詳細な手順は [docs/runbook.md](docs/runbook.md) を参照してください。

## 開発環境セットアップ

リポジトリをクローンした直後に下記スクリプトを 1 回だけ実行して pre-commit フックを有効化します。

```bash
./scripts/install-hooks.sh
```

このフックは commit 時に全 workspace（`apps/chaos-app` / `apps/agt-sidecar` / `lambda`）で `format:check`、`lint`、`test`、`build` を完全実行します。遅さより完全性を優先する厳密版のため、ローカルでも実行に数十秒〜 1 分程度かかります。

## 既知の制約と留意点

- Agent Governance Toolkitはpublic preview段階であり、破壊的変更のリスクがあります。本実装ではバージョンをピン止めし、アップデート時はリグレッションテストを通す運用を前提としています。
- 本システムはus-east-1に配置されるため、データレジデンシ要件がある環境では構成の見直しが必要です。東京リージョン配置時の課金試算は [docs/cost-estimate.md](docs/cost-estimate.md) を参照してください。
- Bedrock呼び出しはパブリックAPI経由のため、完全な閉域構成にはなりません。閉域化するにはBedrockのPrivateLinkエンドポイントに切り替えてください。
- AWS Budgetsはソフトリミットです。上限超過時に自動停止は行われないため、通知を受け取り次第 `scripts/destroy.sh` を実行します。
