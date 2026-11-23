# フレームワーク・主要ライブラリの選定

ユニット（独立デプロイ単位）ごとに、**役割ごと**（HTTP / RPC / DB アクセス / マイグレーション / メッセージング / テスト）に選ぶ。
ドメイン層はどのフレームワークにも依存させないので、フレームワークの影響は adapter / infrastructure 層に閉じる。
それでも乗り換えコストは高いので、選んだ理由・次点・却下理由を ADR に残す。

## 1. 選定手順

1. **制約を確認する**: brief の「技術スタックの希望・制約」（社内標準、チームの経験、指定ライブラリ）は最優先。制約があればそれを採用し、懸念だけ書く
2. **必要機能を列挙する**: 公開 IF（REST / gRPC / GraphQL / WebSocket / SSE）、管理画面、ジョブ・キュー、認証、ファイルアップロード、多言語化
3. **候補を 2〜3 個に絞る**: 下の言語別カタログの「選ぶ条件」に合うもの。カタログ外は、要件上必要な場合だけ候補にする
4. **評価軸で比較する**（下表）。重みは requirements の上位品質特性から決める
5. **保守状況を確認する**: 採用候補の最新リリース日・アーカイブ状況・セキュリティ対応を WebSearch / WebFetch で確認し、出典 URL を書く。最終リリースが 12 か月以上前、またはアーカイブ済みなら候補から外す
6. **決めて記録する**: 役割ごとに「採用 / 次点 / 選定理由 / 次点を選ばなかった理由」を書く

## 2. 評価軸

| 評価軸 | 見ること |
|---|---|
| 要件適合 | 必要機能が標準またはメンテされた拡張で揃うか |
| アーキテクチャ適合 | ドメインを分離しやすいか（DI、独自 Context の侵食度、ORM が Active Record か Data Mapper か） |
| チーム適合 | チームの経験、学習コスト、採用市場での人の見つけやすさ |
| 保守状況 | リリース頻度、メンテナ数、LTS・サポート期間、セキュリティ修正の速さ |
| 性能・資源 | 要件の性能シナリオを満たすか（多くの業務アプリでは差は DB が支配的で、決め手にしない） |
| ロックイン | 標準インターフェース互換（Go: `net/http`、PHP: PSR-7/15、Rust: tower）か、置き換えやすいか |
| 生成サポート | arch-forge が雛形生成・検証できるか（下表の「生成」列） |

## 3. 言語別カタログ

「生成」列: ◎ = サンプルコードあり、○ = 規約どおり生成できる（サンプルから差分で書く）、× = 生成対象外（選ぶ場合、scaffolder は最小構成だけを手書きし、未検証として報告する）

### Go

| 役割 | 候補 | 選ぶ条件 | 注意 | 生成 |
|---|---|---|---|---|
| HTTP | 標準 `net/http`（1.22+） | 依存を最小にしたい。ルーティングが単純 | ミドルウェアは自作か小さなライブラリで補う | ◎ |
| HTTP | chi | `net/http` 互換のまま、ミドルウェアやルートのグループ化を使いたい | 機能は少なめ。バリデーションは別ライブラリ | ○ |
| HTTP | echo | バインド・バリデーション・エラーハンドラまで揃えたい | 独自 `echo.Context`。ハンドラ層に閉じ込める | ○ |
| HTTP | gin | チームが gin に慣れている。採用で経験者を集めやすい | 独自 `gin.Context`。ハンドラ層に閉じ込める | ○ |
| HTTP | fiber | fasthttp の性能が要件上必須な場合のみ | `net/http` 非互換で、標準のミドルウェアや計装を使えない | × |
| RPC | connect-go（buf） | 新規の gRPC。ブラウザや HTTP/1.1 からも呼びたい | 既存の grpc-go 資産とは相互運用できる | ○ |
| RPC | grpc-go | 既存の gRPC 資産、interceptor 群を使う | — | ○ |
| DB | sqlc + pgx | SQL を書けるチーム。型安全・高速 | 動的クエリは別途組み立てる | ◎ |
| DB | ent | スキーマ駆動、グラフ的な関連が多い | 生成コードをドメインモデルとして使わず、Repository で変換する | ○ |
| DB | GORM | チームの経験を優先する、CRUD 中心 | Active Record 的でドメインへ漏れやすい。layered 以外では Repository 内に閉じる | ○ |
| マイグレーション | goose / golang-migrate / Atlas | SQL ファイル管理なら goose か golang-migrate、宣言的に管理するなら Atlas | — | ○ |
| メッセージング | nats.go / franz-go（Kafka）/ クラウド SDK | ブローカーに合わせる。抽象化が要るなら watermill | — | ○ |
| テスト | `testing` + testcontainers-go | 標準で足りる。アサーションは testify を任意で使う | — | ◎ |

### PHP

| 役割 | 候補 | 選ぶ条件 | 注意 | 生成 |
|---|---|---|---|---|
| FW | Laravel | 画面のある Web アプリ・管理画面、高速な機能開発、経験者が多い | Facade と Eloquent がドメインへ漏れやすい。clean / DDD ではドメインを `src/` に分離 | ◎ |
| FW | Symfony | 長期運用の業務システム、ヘキサゴナル / DDD、LTS 版で運用したい | 初期設定が多い。Doctrine（Data Mapper）と相性が良い | ○ |
| FW | Slim 4 + PHP-DI | 小さな API・マイクロサービス、FW 依存を最小にしたい | 認証・バリデーション・ORM は自分で選ぶ（PSR-7/15 準拠） | ○ |
| FW | CakePHP / Laminas Mezzio ほか | 既存資産がある場合のみ | — | × |
| ORM | Eloquent / Doctrine ORM / PDO・Doctrine DBAL | Laravel なら Eloquent、Symfony なら Doctrine、Slim なら DBAL か PDO | Eloquent Model は Infrastructure 層に閉じ込め、Entity と変換する | ○ |
| 実行環境 | PHP-FPM / FrankenPHP / Laravel Octane（Swoole・RoadRunner） | 性能要件が厳しいときだけ常駐型を検討 | 常駐型はグローバル状態・メモリリークに注意 | ○ |
| キュー | Laravel Queue（Horizon）/ Symfony Messenger | FW に合わせる | — | ○ |
| テスト・静的解析 | Pest / PHPUnit、PHPStan（Laravel は Larastan）、deptrac | Laravel は Pest、それ以外は PHPUnit を既定にする | — | ◎ |

### Rust

| 役割 | 候補 | 選ぶ条件 | 注意 | 生成 |
|---|---|---|---|---|
| HTTP | axum | 既定。tokio・tower のエコシステム、型安全な extractor | — | ◎ |
| HTTP | actix-web | チームが actix に慣れている。成熟した機能群を使いたい | tower ミドルウェアをそのまま使えない。独自ランタイムの作法がある | ○ |
| HTTP | poem / rocket / warp ほか | 特定機能（OpenAPI 自動生成など）が要件上必須な場合のみ | 採用例・情報量が少ない | × |
| RPC | tonic + prost | gRPC | `build.rs` で `api/proto` から生成 | ○ |
| DB | sqlx | SQL を書けるチーム、async、軽量 | コンパイル時検査（`query!`）はオフラインモードの準備が必要 | ◎ |
| DB | SeaORM | ORM が欲しい、動的クエリが多い | Entity をドメインモデルとして使わず、Repository で変換する | ○ |
| DB | diesel（+ diesel-async） | 強い型安全、同期処理でよい | async では diesel-async が必要 | ○ |
| メッセージング | async-nats / rdkafka / lapin（RabbitMQ） | ブローカーに合わせる | rdkafka は C ライブラリに依存 | ○ |
| テスト | `#[tokio::test]` + testcontainers | 標準で足りる | — | ◎ |

## 4. 組み合わせの指針

- **パターンとの相性**: layered + Laravel / GORM は自然。clean / hexagonal / DDD で Active Record 系 ORM（Eloquent、GORM）を使う場合は、Repository 実装の中に閉じ込めて変換コストを受け入れる
- **マイクロサービス**: サービスごとに FW を変えない。言語と同じく **原則は統一** し、例外には理由を書く。可観測性（OpenTelemetry）の計装が揃っているものを選ぶ
- **迷ったら**: Go は `net/http` + sqlc + pgx、PHP は要件に画面があれば Laravel、なければ Symfony、Rust は axum + sqlx。これを基準線にして、外れる場合に理由を書く

## 5. 出力の形式（案ドキュメントと ADR）

| ユニット | 役割 | 採用 | 次点 | 選定理由（評価軸） | 次点を選ばなかった理由 | 保守状況の確認（出典） |
|---|---|---|---|---|---|---|

decision.json には `units[].framework`（主 FW）と `units[].libraries`（役割 → ライブラリ名）を書く。
