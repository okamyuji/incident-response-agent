# アーキテクチャ

## 全体像

本システムはus-east-1リージョンにSingle-AZの検証用VPCを構築し、障害サンプルアプリとAgent Governance ToolkitサイドカーをECS Fargateで稼働させます。障害検知はCloudWatch Alarmが起点となり、EventBridge経由でStep Functionsステートマシンを起動します。ステートマシンは3段階のモデルルーティング（Haiku → Sonnet → Opus）で調査を進め、結果をDynamoDBに記録しSNS経由でメール通知します。

## レイヤー構成

### ネットワーク層

- 10.20.0.0/16のVPCを1つ作成します
- 2つのAvailability Zoneにpublic subnetを配置します（ALBが2 AZ最小の制約を持つため）。private subnetは1 AZのみに絞ってコストを抑えます
- NAT Gatewayを1つpublic subnetに配置し、private subnetからのアウトバウンドを担当させます
- VPC Endpointは設置せず、Bedrock / S3 / ECRなどへの通信はNAT Gateway経由のパブリックAPIを使用します（検証用途のため）
- Security Groupは最小権限で、ALBは80番のみインバウンド許可、FargateタスクはALBとAGTサイドカーからのみ許可とします

### ランタイム層（ECS Fargate）

#### chaos-app

- Node.js 22とExpressで実装した障害サンプルアプリです
- リソース設定は0.25 vCPU / 0.5GB、desired_countを1に指定しています
- public subnet配下のALB経由で80番を公開しています
- 下記の5種類の障害を発生させます
  - HTTP 5xxをランダムに返却します
  - レスポンス遅延のスパイクを発生させます
  - 大きなバッファ確保によるOOMクラッシュを起こします
  - 外部API呼び出しのDNS解決失敗を再現します
  - ERRORレベルのログを急増させます
- 発生モードとして次の2種類を用意しています
  - ランダムモードでは5〜10分ごとに確率的にいずれかが発動します
  - 手動モードでは `POST /chaos/{type}` エンドポイントを叩いた際に即時発動します

#### agt-sidecar

- TypeScriptとExpressで実装したAgent Governance Toolkitの出口プロキシです
- リソース設定は0.25 vCPU / 0.5GB、desired_countを1に指定しています
- private subnetに配置しています
- Bedrock呼び出しLambdaからのHTTP呼び出しを受け取り、Toolkitのポリシー評価を挟んでから上流のBedrock APIに転送します
- OWASP Agentic Top 10の違反を検知した場合は403で拒否し、CloudWatch Logsにポリシー評価結果を構造化ログとして出力します

### 観測層

- CloudWatch Logsにchaos-appのログを流します
- CloudWatch Logs Data Protection Policyをロググループ単位で有効化し、AWS managed data identifiers（CreditCardNumber、EmailAddress、JwtToken、AwsSecretKeyなど）で自動的にマスクします
- CloudWatch Alarmを以下の観点で設置します
  - HTTP 5xxレートの閾値超過を監視します
  - ECSタスクのCPUとメモリ利用率を監視します
  - ALB Targetの UnHealthyHostCountを監視します
  - ログ内のERRORパターンの出現を監視します
- EventBridge Ruleがアラーム状態の遷移を監視し、OK → ALARMのタイミングでStep Functionsを起動します

### 推論パイプライン層（Step Functions + Lambda + Bedrock）

ステートマシンは以下の流れで進みます。

1. Stage1のHaikuトリアージでは、Lambda (triage-haiku) がCloudWatch Logs Insightsで直近15分のログを取得し、Bedrock Converse APIでClaude Haikuを呼び出して重大度を判定します。出力はseverity (P1/P2/P3)、要約、関連ログIDリストを含むJSONになります。
2. Stage2のSonnet深堀りは、severityがP2以上のときにLambda (investigate-sonnet) が関連ログとメトリクスを取得し、Claude Sonnetで相関分析と仮説提示を行います。
3. Stage3のOpus根本原因分析は、severityがP1のときにLambda (rca-opus) がClaude OpusをPrompt Caching有効化状態で呼び出し、詳細な根本原因と対応プランを生成します。
4. Bedrock呼び出しはagt-sidecar経由で行います。Guardrails IDをリクエストに付与することで、入力と応答の両方にSensitive Information Filtersが適用されます。
5. 結果をDynamoDBのincidentsテーブルにPutItemします。
6. SNS topicにパブリッシュし、メール通知が送信されます。

### ストレージ層

- DynamoDB Table: `incidents`
  - パーティションキー: `incident_id` (String, ULID)
  - ソートキー: `created_at` (String, ISO8601)
  - 属性: severity, summary, root_cause, suggested_actions, related_log_ids, model_chain, cost_usd
  - 課金モード: On-Demand
  - TTL: 30日
- Point-in-time Recovery: OFF（検証用途）

### 通知層

- SNS Topicの名前は `incident-notifications` です
- Email Subscriptionは `terraform.tfvars` の `notification_email` で指定したアドレスに設定します
- Budgets Alert用に別のSNS Topicを用意し、50パーセント、80パーセント、100パーセントの閾値でメール通知します

### ガバナンス層

- CloudTrailはBedrock、Step Functions、LambdaのAPI呼び出しを記録します（既存のmanagement eventログを利用するため追加設定は不要です）
- IAM RoleはLambda関数ごとに専用ロールを作成し、Bedrock呼び出し可能なモデルIDを明示的に限定します
  - triage-haikuロールはHaiku 4.5のみを許可します
  - investigate-sonnetロールはSonnet 4.6のみを許可します
  - rca-opusロールはOpus 4.5のみを許可し、条件として `aws:RequestedRegion = us-east-1` を付与します
- AWS Budgetsは月次30 USDのハードウォッチを設定し、50パーセント、80パーセント、100パーセントの閾値で通知します

## データフロー

```text
[chaos-app]
  ├── ログ → CloudWatch Logs (Data Protection で PII マスク)
  └── メトリクス → CloudWatch Metrics
             ↓ CW Alarm 閾値超過
             ↓ EventBridge Rule
  [Step Functions]
    ├─ [triage-haiku Lambda]
    │    └─ agt-sidecar → Bedrock (Haiku) → severity JSON
    ├─ [investigate-sonnet Lambda] (severity >= P2 のとき)
    │    └─ agt-sidecar → Bedrock (Sonnet) → 仮説 JSON
    ├─ [rca-opus Lambda] (severity == P1 のとき、Prompt Cache ON)
    │    └─ agt-sidecar → Bedrock (Opus) → RCA JSON
    └─ [PutItem → DynamoDB incidents]
       [Publish → SNS → Email]
```

## Well-Architected観点

### Operational Excellence

- IaCによって再現可能なデプロイを実現します
- CloudTrailでAPI呼び出しを監査します
- Step Functionsの実行履歴から調査プロセスを完全にトレースできます

### Security

- CloudWatch Logs Data Protectionでingest時点からマスクします
- Bedrock Guardrailsで推論経路でもマスクします
- IAMでモデルIDを制限します
- Fargateタスクはprivate subnetに配置し、chaos-appはpublic subnetのALB経由でのみ公開します
- Security Groupで最小権限ルールを適用します

### Reliability

- ECSサービスのdesired_countで自己修復を実現します
- CloudWatch Alarmでヘルスを監視します
- 検証用途のためMulti-AZは採用しません。本番化時には2 AZ化することを前提とします

### Performance Efficiency

- モデルをティア別にルーティング（Haiku → Sonnet → Opus）することで、無駄な推論コストを回避します
- Prompt Cachingで重複入力を圧縮します
- Fargate Spotは使用せず、検証の再現性を優先します

### Cost Optimization

- DynamoDBはOn-Demand課金で運用します
- NAT Gatewayは1本のみに抑えます
- Budgetsで上限を監視します
- Opus利用はIAMで制限し、ハード課金ブレーキを効かせます

### Sustainability

- ECSタスクのリソース割当を最小限にします
- 不要時にはdestroyで停止します

## 制約事項

- Agent Governance Toolkitはpublic preview段階であり、破壊的変更に注意が必要です
- 本実装はSingle-AZ構成のため、検証以外の用途には適しません
- Bedrock呼び出しはパブリックAPI経由のため、完全な閉域構成にはなりません
