---
name: verification-before-completion
description: arch-forge のサブエージェント共通の完了条件。生成・修正・検査の結果を報告する前に、検証コマンドを実際に実行して出力を確認し、証拠付きで報告する。scaffolder / verifier / foundation-builder / architecture-critic にプリロードされる。 Do not claim completion without evidence. Run the verification commands and report their results, including what was skipped or could not be verified.
user-invocable: false
---

# 完了報告の前に検証する

**原則: 証拠なしに完了を主張しない。** このメッセージ内で実行していない検証は、通ったと言えない。

## 手順（報告の直前に毎回）

1. **特定**: その主張を証明するコマンドは何か（build / test / lint / arch-lint / `ls` / `git status`）
2. **実行**: そのコマンドを最後まで実行する（前回の結果を流用しない）
3. **読む**: 終了コードと出力を確認し、失敗件数を数える
4. **照合**: 出力が主張を裏付けているか
   - 裏付けていない → 実際の状態を証拠付きで報告する
   - 裏付けている → 主張と証拠（コマンドと結果）を一緒に報告する

## よくある誤り

| 主張 | 必要な証拠 | 証拠にならないもの |
|---|---|---|
| テストが通る | テストコマンドの出力（失敗 0） | 前回の実行、「通るはず」 |
| ビルドできる | ビルドの終了コード 0 | lint が通ったこと |
| 依存ルールを守っている | arch-lint の出力、import の Grep 結果 | 「層を分けたので大丈夫」 |
| ファイルを生成した | `ls` / Glob の結果 | 書いたつもり |
| ドキュメントが実態と一致 | 記載したパス・コマンドの実在確認 | テンプレートどおりに書いたこと |

## 危険信号（見つけたら止まって検証する）

- 「おそらく」「〜のはず」「問題ないと思う」と書こうとしている
- 検証の前に「完了しました」と書こうとしている
- ツールが無いので検証を飛ばし、それを報告に書いていない
- skipped を passed として数えている
- 検証を通すために、テスト・lint 設定・依存方向の設定・バージョン下限の検査を緩めようとしている（対象を減らす、条件を弱める、skip を足す）。緩めずに直せないなら、緩めずに `unresolved` に理由を書き、判断をユーザーに回す
- ツール（go / php / cargo）が見つからないので「無い」と報告しようとしている。先に `bash <pluginRoot>/scripts/detect-toolchains.sh` で実体を探したか
- 1 つのユニット・ファイルで確認したことを全体に一般化している

## 報告の形

- 実行したコマンドと結果（passed / failed / skipped）を並べる
- skipped には理由を書く（ツール未インストール、ネットワーク不可など）
- 直せなかった失敗は `unresolved` / `blockers` に残す。隠さない

## Bash の使い方（権限の確認で止まらないために）

- プラグインのファイル（`<pluginRoot>` 配下のテンプレート・rules・スキル）は **Read で読む**。プロジェクトの外を `cat` / `cp` / `cd` で触ると、Claude Code が拒否する。コピーが必要なら Read してから Write する
- コマンドは 1 回に 1 つずつ、単純な形で実行する（`go test ./...`、`make gen`）。`;` や `&&` での連結、シェル変数、`for` ループ、`$?` を使うと、承認の確認で止まりやすい
- PATH の go が動かないときに、絶対パスや `export PATH=...` で回避するのは最後の手段（毎回承認が必要になる）。プロジェクトに `.go-version` / `.tool-versions` があれば消さない
