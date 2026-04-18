# デプロイおよび破棄の手順

## 前提条件

次のツールと設定が揃っていることを確認してください。

| 項目 | 要求バージョン | 確認コマンド |
| --- | --- | --- |
| AWS CLI | 2.22 以上 | `aws --version` |
| Terraform | 1.14 以上 | `terraform version` |
| Docker | 24 以上 | `docker --version` |
| Node.js | 22 以上 | `node --version` |
| AWS 認証情報 | 設定済み | `aws sts get-caller-identity` |

Bedrockのモデルアクセスはus-east-1リージョンで事前に許可しておく必要があります。AWSコンソールでBedrockを開き、Model accessからClaude Haiku 4.5 / Sonnet 4.6 / Opus 4.5を有効化してください。

## デプロイ手順

### 1.初期化

```bash
cd terraform/envs/dev
terraform init
```

### 2.設定確認

初回セットアップ時は `terraform/envs/dev/terraform.tfvars.example` を `terraform.tfvars` としてコピーし、通知先メールアドレスと予算上限を自身の値に書き換えます。例は次の通りです。

```bash
cp terraform/envs/dev/terraform.tfvars.example terraform/envs/dev/terraform.tfvars
```

```hcl
notification_email = "your-email@example.com"
budget_limit_usd   = 30
region             = "us-east-1"
```

### 3. planの確認

```bash
terraform plan -out=tfplan
```

作成予定のリソース数が60〜80個の範囲に収まることを確認します。大きく逸脱する場合は設定を見直してください。

### 4. applyの実行

```bash
terraform apply tfplan
```

完了までおおむね5〜8分かかります。完了後、出力された以下の値を控えてください。

- `alb_dns_name` はchaos-appのエンドポイントを示します
- `state_machine_arn` はStep FunctionsのARNを示します
- `incidents_table_name` はDynamoDBテーブル名を示します
- `sns_topic_arn` はSNSトピックのARNを示します

### 5.コンテナイメージのビルドとpush

```bash
cd ../../..
./scripts/deploy.sh
```

このスクリプトはchaos-appとagt-sidecarの2本のイメージをECRにビルドしてpushし、ECSサービスをforce new deploymentで再起動します。

### 6. SNSのメール購読承認

デプロイ直後にAWSから確認メールが届きます。メール内のリンクをクリックしてサブスクリプションを承認してください。承認しないとインシデント通知が届きません。

## 動作検証手順

### 1.ヘルスチェック

```bash
./scripts/verify.sh
```

以下を自動で確認します。

- ALBのヘルスチェックがpassしているかを確認します
- 各 `/chaos/*` エンドポイントが期待通りの障害を発生させているかを確認します
- Step Functionsが起動し、実行が成功しているかを確認します
- DynamoDBのincidentsテーブルにレコードが書き込まれているかを確認します
- SNSの配信状況をCloudWatch Metrics経由で確認します

### 2.手動トリガーでの個別検証

```bash
./scripts/trigger-chaos.sh http      # HTTP 5xx エラー
./scripts/trigger-chaos.sh latency   # 応答遅延
./scripts/trigger-chaos.sh oom       # OOM クラッシュ
./scripts/trigger-chaos.sh external  # 外部 API 失敗
./scripts/trigger-chaos.sh errorlog  # エラーログ急増
```

各障害発生後、CloudWatch AlarmがALARM状態に遷移し、Step Functions実行が起動することを確認します。

### 3.ランダム発生モードの確認

chaos-appは起動時からバックグラウンドで5〜10分ごとに確率的に障害を発生させます。デプロイ完了から15〜30分ほど放置したあと、Step Functionsの実行履歴とDynamoDBのレコードを確認してください。

### 4. Guardrailsマスキングの動作確認

以下のエンドポイントは、PIIを含むログを意図的に出力します。CloudWatch Logs上でマスクされていることと、Bedrockへの入力段でさらにマスクされていることを確認します。

```bash
curl -X POST "http://${ALB_DNS}/chaos/errorlog?include_pii=true"
```

CloudWatch Logsコンソールで `/ecs/chaos-app` ロググループを開き、マスクトークン（`****`）に置換されていれば成功です。

## 破棄手順

### 1.全リソースの削除

```bash
./scripts/destroy.sh
```

このスクリプトは以下を実施します。

- ECRリポジトリ内のイメージを削除します（`force_delete = true` を指定しているため丸ごと消去されます）
- DynamoDBテーブルを削除します
- Step Functions、Lambda、ECSサービス、ALB、VPCを削除します
- SNS Topicとサブスクリプションを削除します
- CloudWatch Logs、アラーム、EventBridge Ruleを削除します
- IAM Roleとポリシーを削除します
- AWS Budgetsの定義を削除します

所要時間はおおむね8〜10分です。

### 2.残存リソースの確認

```bash
aws ec2 describe-vpcs --region us-east-1 --filters "Name=tag:Project,Values=incident-response-agent"
aws logs describe-log-groups --region us-east-1 --log-group-name-prefix /aws/lambda/ira-
aws dynamodb list-tables --region us-east-1 | grep ira-
aws ecr describe-repositories --region us-east-1 | grep ira-
```

いずれも空であることを確認してください。残っている場合はAWSコンソールから手動削除します。

### 3. Cost Explorerでの確認

デプロイからdestroy完了までの請求額をAWS Cost Explorerで確認します。Tag `Project = incident-response-agent` でフィルタすると本システム分のみ集計できます。予算30 USD以内に収まっていることを確認してください。

## トラブルシューティング

### terraform applyがECS Service作成でタイムアウトする

ECRにイメージがまだpushされていない場合、ECSタスクが起動失敗を繰り返します。対応として、`deploy.sh` を先に実行してから再度 `terraform apply` を実行してください。または、ECSサービスの `desired_count` を一時的に0にしてapplyし、イメージpush後に1に戻します。

### Bedrock呼び出しでAccessDeniedExceptionが返る

2026年時点でBedrockの「Model access」ページは廃止され、Model catalogからPlaygroundで1回呼び出すと自動で有効化されます（初回はuse case detailsの入力が必要）。`docs/runbook.md` の「Bedrockモデルの有効化」節を参照してください。

IAMポリシーのresource ARNは「cross-region inference profileのARN」と「foundation-modelのARN（リージョンwildcard）」の両方を含める必要があります。片方だけだと `AccessDeniedException` になります。`terraform/modules/agent_pipeline/main.tf` の `triage_bedrock` / `investigate_bedrock` / `rca_bedrock` ポリシーで確認できます。

### SNSメールが届かない

サブスクリプション承認が未完了の可能性があります。AWSコンソールのSNS → Subscriptionsでステータスを確認してください。PendingConfirmationの場合は確認メールを探して承認します。

### CloudWatch Alarmが10分経ってもALARMに遷移しない

`aws_cloudwatch_metric_alarm` リソースに `dimensions` が設定されていない可能性があります。AWSのELB / ECS / RDS系メトリクスは必ずdimensions付きで発行されるため、dimensionsを書き忘れるとメトリクスが届いても絶対にアラームが反応しません。`aws cloudwatch describe-alarms --alarm-name-prefix <name>` で `Dimensions: []` になっていたら、該当モジュールのalarm定義を修正してください。本実装では `terraform/modules/observability/main.tf` の先頭に同じハマりポイントをコメントで記載しています。

### ECSタスクが "exec format error" で起動しない

Apple Silicon (M1/M2/M3) のローカルマシンで `docker build` するとarm64イメージが作られ、Fargateのx86_64ランタイムで起動に失敗します。`scripts/deploy.sh` は必ず `docker buildx build --platform=linux/amd64` で強制ビルドするので、ローカル直接buildでなくdeploy.sh経由でデプロイしてください。

### destroy後にNAT Gatewayの料金が残っている

NAT Gatewayは削除後も時間按分で当日分の課金が残ります。削除自体は成功していれば、翌日以降は課金されません。

### Budgetsからアラートが届いた

`destroy.sh` を即座に実行してください。`terraform destroy -auto-approve` で強制削除しても構いません。
