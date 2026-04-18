# コスト試算（2026年4月時点）

本ドキュメントは本リファレンス実装を稼働させた際の課金試算です。為替は1 USD = 150円で換算しています。試算は目安であり、実使用時の呼び出し頻度やデータ転送量で変動します。

## 前提条件

- デプロイ先はus-east-1（バージニア北部）を使用します
- 稼働期間は3日間の連続稼働を想定します
- ECSタスク構成はchaos-appが1タスク（0.25 vCPU / 0.5 GB）、agt-sidecarが1タスク（0.25 vCPU / 0.5 GB）です
- VPCはpublic subnetを2 AZに配置し（ALBの2 AZ必須要件のため）、private subnetは1 AZに絞り、NAT Gatewayは1本のみを使用します
- Bedrock呼び出しはHaiku 50回、Sonnet 20回、Opus 3回（Prompt Caching有効）を想定します
- ログ量は1日あたり100 MB程度を見込みます

## us-east-1試算

| サービス | リソース | 単価 | 3 日合計 USD | 円換算 |
| - | - | - | - | - |
| ECS Fargate | 0.5 vCPU × 72h | $0.04048/vCPU-hr + $0.004445/GB-hr | $5.21 | 781 円 |
| ALB | 1 本 × 72h | $0.0225/LCU-hr + $0.008/hr | $2.18 | 327 円 |
| NAT Gateway | 1 本 × 72h | $0.045/hr + $0.045/GB | $3.74 | 561 円 |
| ECR | 2 リポジトリ 500 MB | $0.10/GB/月 | $0.05 | 8 円 |
| CloudWatch Logs | ingest 300 MB + 保管 | $0.50/GB + $0.03/GB/月 | $0.45 | 68 円 |
| CloudWatch Logs Data Protection | スキャン 300 MB | $0.12/GB | $0.04 | 6 円 |
| CloudWatch Alarms | 5 本 | $0.10/Alarm/月 | $0.05 | 8 円 |
| EventBridge | 1000 イベント | $1.00/100 万 | $0.01 | 2 円 |
| Step Functions | Standard 100 実行 × 10 state | $0.025/1000 state | $0.03 | 5 円 |
| Lambda | 100 呼び出し × 1GB × 2 秒 | $0.20/100 万 + $0.0000166667/GB-sec | $0.03 | 5 円 |
| DynamoDB | On-Demand 100 WCU + 保管 | $1.25/100 万 WCU + $0.25/GB | $0.10 | 15 円 |
| Bedrock Haiku 4.5 | 50 呼び出し（in 3k + out 500 トークン） | $1/1M input + $5/1M output | $0.28 | 42 円 |
| Bedrock Sonnet 4.6 | 20 呼び出し（in 8k + out 1.5k トークン） | $3/1M input + $15/1M output | $0.93 | 140 円 |
| Bedrock Opus 4.5 | 3 呼び出し（in 12k + out 2k トークン、キャッシュヒット率 70%） | $15/1M input + $75/1M output、キャッシュ read $1.50/1M | $1.05 | 158 円 |
| Bedrock Guardrails | 73 呼び出し | $0.75/1000 text unit | $0.06 | 8 円 |
| SNS | 10 メール | $0.50/100 万 + $2.00/10 万 email | $0.01 | 2 円 |
| CloudTrail | Management events | 無料枠内 | $0.00 | 0 円 |
| データ転送（Internet egress） | 2 GB | $0.09/GB | $0.18 | 27 円 |
| 合計 | - | - | $14.40 | 2,160 円 |

Budgetsの30 USDキャップに対し、約半分の使用で収まる試算です。残りはバッファとして確保し、想定外の呼び出し増に備えます。

## 東京リージョン参考値

本システムを東京リージョン（ap-northeast-1）にデプロイした場合の参考試算です。Bedrock呼び出しはAPN inference profile経由を前提とします（2026年4月時点でのClaude系モデルの東京リージョン直接提供状況は変動するため、実際のコンソールで確認してください）。

| サービス | 3 日合計 USD | 円換算 |
| - | - | - |
| ECS Fargate | $5.79 | 869 円（us-east-1 比 約 +11%） |
| ALB | $2.18 | 327 円 |
| NAT Gateway | $4.32 | 648 円（us-east-1 比 約 +15%） |
| ECR | $0.06 | 9 円 |
| CloudWatch Logs | $0.46 | 69 円 |
| CloudWatch Logs Data Protection | $0.05 | 8 円 |
| CloudWatch Alarms | $0.05 | 8 円 |
| EventBridge | $0.01 | 2 円 |
| Step Functions | $0.03 | 5 円 |
| Lambda | $0.04 | 6 円 |
| DynamoDB | $0.11 | 17 円 |
| Bedrock（APN inference profile 経由） | $2.26 | 340 円 |
| Bedrock Guardrails | $0.06 | 8 円 |
| SNS | $0.01 | 2 円 |
| データ転送 | $0.22 | 33 円 |
| 合計 | $15.65 | 2,348 円 |

東京リージョンでは基盤サービスの単価がus-east-1より10〜20パーセント高い傾向があります。一方でBedrock呼び出しはinference profile経由であればus-east-1と同水準の料金になります。

## 月額フルタイム稼働時の参考

検証を超えて30日連続で稼働させた場合のus-east-1試算です。呼び出し頻度は1日あたりHaiku 100回、Sonnet 40回、Opus 5回を想定します。

| サービス | 月額 USD | 円換算 |
| - | - | - |
| ECS Fargate | $52.10 | 7,815 円 |
| ALB | $21.80 | 3,270 円 |
| NAT Gateway | $37.40 | 5,610 円 |
| ECR | $0.50 | 75 円 |
| CloudWatch Logs | $4.50 | 675 円 |
| CloudWatch Data Protection | $0.40 | 60 円 |
| CloudWatch Alarms | $0.50 | 75 円 |
| EventBridge | $0.10 | 15 円 |
| Step Functions | $0.30 | 45 円 |
| Lambda | $0.30 | 45 円 |
| DynamoDB | $1.00 | 150 円 |
| Bedrock Haiku | $5.60 | 840 円 |
| Bedrock Sonnet | $18.60 | 2,790 円 |
| Bedrock Opus | $17.50 | 2,625 円 |
| Bedrock Guardrails | $1.20 | 180 円 |
| SNS | $0.10 | 15 円 |
| データ転送 | $1.80 | 270 円 |
| 合計 | $163.70 | 24,555 円 |

PagerDutyやZabbixを別途立てて同等の検知・エスカレーション機能を持たせる場合のランニング帯と比較しても、同じかそれ以下の水準に収まります。

## コスト削減のポイント

- NAT Gatewayが固定コストの主因になります。本番化時にも2本までに抑え、S3とBedrockはVPC EndpointでNATを経由しない設計にすると、データ転送コストが大幅に下がります
- Opus呼び出しではPrompt Cachingを必ず有効化します。同一障害の再掘り下げでキャッシュヒット率70〜90パーセントが期待でき、コストを3〜10分の1に圧縮できます
- Bedrockの呼び出し数はCloudTrailで可視化します。1インシデントあたりのモデルチェーンのコストをDynamoDBの `cost_usd` 属性に記録しておくと、週次で見直しがかけられます
- Step Functions Expressは本ユースケースに向いていません。1実行あたり5分以内で終わるワークフローですが、実行回数が少ないためStandardのほうが安価になります

## 試算の注意事項

- Bedrockの料金は2026年4月時点のパブリック価格を使用しています。最新は [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/) を参照してください
- トークン数の想定はあくまで検証シナリオのものです。実ログサイズが大きい場合はinトークンが膨張します
- データ転送はInternet egressのみ計上しています。VPC内やAWSサービス間のデータ転送は無料または極小のため省略しています

## 実デプロイ検証の実績（2026-04-18）

本リファレンス実装を実際にus-east-1にデプロイして、約1時間の検証を行った際の実績値になります。

- 作成リソース数は67個です（Terraform plan全量）
- デプロイ時間はトータル約10分でした（うちALB作成に約2.5分、Step Functions state machine作成に約10秒がかかります）
- 検証実行時間は約60分でした（障害バーストを2回、Step Functions実行を1回、検証スクリプト実行が含まれます）
- 実発生課金はCost Explorer集計の目安で$1未満/時間です（検証期間1時間で$1以下に収まります）
  - ECS Fargate 2タスクで1時間あたり 約$0.09です
  - ALBは1時間あたり 約$0.035です
  - NAT Gatewayは1時間あたり 約$0.07です
  - Bedrock Haiku 4.5は1回呼び出しで 約$0.001未満です（triage結果がseverity=P3のためSonnet以降へエスカレーションしませんでした）
  - その他（DynamoDB / SNS / CloudWatch Logs / EventBridge / Step Functions / Lambda）は合計で$0.1未満に収まります

3日連続稼働想定との対比として、Bedrock呼び出しは検証シナリオで想定した73回より大幅に少ない1回で済んだため、検証自体は$10以下で完了しました。本番運用で連続稼働させた場合は、試算表のとおり$20〜25 / 3日のレンジになる見込みです。
