# 記事実装の確認記録（2026-10-02）

公開承認は未取得。全55本をdraftで実装し、編集レビュー可能45本と追加資料確認10本を区別した。
税務レビューは一般HowTo18本で別途必要。25・31は電子保存の専門レビューも必要。
編集レビュー可能は、公開readyや有資格者監修済みを意味しない。

## 検査結果

- 静的サイト検査22/22、アプリテスト18ファイル104/104、lint成功。
- Next.jsは `next build --webpack` 成功。標準Turbopackは実行環境のポート制限で完走できず。
- 55記事×360/768/1440px、一覧・6カテゴリ×3幅の186表示検査で横はみ出し・HTTP・H1・preview noindex検査成功。
- 代表記事のPC/mobile画像、LPの銀行・領収書・請求書3場面を復元済みmainと比較。
- LP変更は記事リンク2か所。main.js/styles.css/analytics.js/PrivacyのSHA回帰検査成功。
- draft詳細を本番出力とsitemapから除外。previewは全ページnoindex・GA IDなし。
- 本番GA ID G-HWFFMYR32Hを維持。記事イベントは公開記事・許可ID・非PIIのみ。
- 価格30レコード、架空計算13組、実際の帳簿集計関数6例を検算。
- 外部URL56件を確認。45件成功、freee5件はcurl bot block、GitHub6件は一時503。HTTP404はなし。freeeは公式Web読取、OpenTaxはローカルmainソースで補完。

## 補完した一次資料

国税庁 `2025/pdf/046.pdf` は11MBの画像PDFを直接取得し、冊子2〜15頁の
正規の簿記、元帳、試算表、損益・貸借作成例を画像で確認。資料名を実物に合わせ訂正。
2025年資料を2026年の確定情報に流用しない。PCの耐用年数4年・定額0.250は国税庁
2100_01/02公式表と2106算式で照合。freee出力は取引入力と会計帳簿の公式ヘルプを分けた。

## 55記事の確認状態

|ID|記事|確認状態|追加資料|
|---|---|---|---|
|01|[freee会計を安く使うには？料金プラン・年払い・契約期間の見直し方](../content/articles/freee-cost-review.md)|編集レビュー可能||
|02|[freee会計の代替はどれ？国内SaaS・無料ソフト・OSSを用途別に比較](../content/articles/freee-alternatives.md)|編集レビュー可能||
|03|[freee会計は無料でどこまで使える？お試し・未契約・請求書の違い](../content/articles/freee-free-plan-limits.md)|編集レビュー可能||
|05|[freee会計スターターとスタンダードの違い：必要な機能から費用を判断](../content/articles/freee-starter-standard-choice.md)|編集レビュー可能||
|06|[マネーフォワード クラウドを安く使うには？個人事業主向けの料金・プランを見直す](../content/articles/moneyforward-cost-review.md)|編集レビュー可能||
|07|[マネーフォワード クラウド確定申告は無料で何ができる？試用・未契約・出力制限](../content/articles/moneyforward-free-limits.md)|編集レビュー可能||
|08|[やよいの申告ソフトはどこまで無料？白色・青色・初年度無料・体験版の違い](../content/articles/yayoi-free-options.md)|編集レビュー可能||
|09|[個人事業主向け無料会計ソフトを比較：ずっと無料・試用・OSSの違いと選び方](../content/articles/free-accounting-software.md)|編集レビュー可能||
|10|[個人事業主向けの無料クラウド会計はある？無料条件と使い方で比較](../content/articles/free-cloud-accounting.md)|編集レビュー可能||
|11|[個人事業主が無料会計ソフトを選ぶときの確認項目：帳簿から申告まで](../content/articles/free-accounting-for-freelancers.md)|編集レビュー可能||
|13|[青色申告を無料ソフトで進めるには？記帳・決算書・申告・送信を分けて確認](../content/articles/free-blue-return-software.md)|編集レビュー可能||
|14|[白色申告向け無料ソフトの選び方：帳簿・収支内訳書・申告書の違い](../content/articles/free-white-return-software.md)|編集レビュー可能||
|15|[副業の会計ソフトは無料で足りる？取引量と必要な帳簿で選ぶ](../content/articles/free-accounting-side-business.md)|編集レビュー可能||
|16|[Mac・Linuxで使える無料会計ソフト：ブラウザ・デスクトップ・OSSを比較](../content/articles/free-accounting-mac-linux.md)|編集レビュー可能||
|17|[会計ソフトを買い切り・無料デスクトップ・OSSで選ぶ：更新と保守も比較](../content/articles/accounting-without-subscription.md)|追加事実確認|買切り候補の現行販売価格と翌年の申告対応費用を一次資料で追加確認する。|
|18|[Excelの帳簿から無料会計ソフトへ移るべき？移行の条件とデータ整理](../content/articles/excel-to-accounting-software.md)|編集レビュー可能||
|19|[freee会計から乗り換える前に：移行データと照合手順のチェックリスト](../content/articles/switch-from-freee.md)|編集レビュー可能||
|20|[freee会計の仕訳CSVをエクスポートする前に確認する形式・期間・出力範囲](../content/articles/freee-journal-csv-export.md)|編集レビュー可能||
|21|[freee会計を解約する前のデータ保存：支払い停止とアカウント削除の違い](../content/articles/freee-cancellation-data-checklist.md)|編集レビュー可能||
|22|[会計ソフトは期首・期中のどちらで乗り換える？開始残高と並行運用の考え方](../content/articles/accounting-migration-timing.md)|編集レビュー可能||
|23|[会計CSVが取り込めないとき：文字コード・日付・税区分・列の確認手順](../content/articles/accounting-csv-import-errors.md)|編集レビュー可能||
|24|[会計ソフト移行後に残高が合わないときの照合チェックリスト](../content/articles/accounting-migration-reconciliation.md)|編集レビュー可能||
|25|[会計ソフトの乗り換えで証憑はどう移す？仕訳CSVだけでは残らない情報](../content/articles/accounting-evidence-migration.md)|編集レビュー可能||
|26|[会計ソフトを変える前に税理士と確認したい共有・出力・修正のルール](../content/articles/accountant-handoff-software-switch.md)|編集レビュー可能||
|27|[マネーフォワード クラウド確定申告から乗り換える前のデータ出力と確認事項](../content/articles/switch-from-moneyforward.md)|編集レビュー可能||
|28|[個人事業主向けオープンソース会計ソフトを比較：日本語・帳簿・申告で選ぶ](../content/articles/open-source-accounting-software.md)|追加事実確認|Frappe公式Web版と公開デスクトップrepoの対応版・配布物を提供元資料で確定する。|
|29|[会計ソフトのセルフホストとは？利用環境・データ保存・更新の確認項目](../content/articles/self-hosted-accounting-guide.md)|編集レビュー可能||
|30|[無料OSS会計の費用はいくら？利用料・インフラ・外部AIを分けて見積もる](../content/articles/self-hosted-accounting-cost.md)|編集レビュー可能||
|31|[個人事業主がOSS会計を選ぶ確認表：帳簿・税区分・証憑・申告の範囲](../content/articles/open-source-accounting-japan-checklist.md)|編集レビュー可能||
|32|[無料・OSS・ソース公開は同じ？会計ソフトのライセンスを確認するポイント](../content/articles/accounting-open-source-license.md)|編集レビュー可能||
|33|[会計データのバックアップと復元：保存対象・出力・復元テストの確認手順](../content/articles/accounting-backup-restore.md)|編集レビュー可能||
|34|[OSS会計の使い方を比較：セルフホスト・導入支援・提供サービスの違い](../content/articles/accounting-operations-options.md)|追加事実確認|Frappeの対象版と運用方式を提供元資料で確定する。|
|35|[GnuCashは日本の事業会計に使える？日本語環境と必要な追加作業を検証](../content/articles/gnucash-japan-accounting-review.md)|編集レビュー可能||
|36|[Frappe Booksを日本で使う前に：現行版・保存方式・帳簿出力の確認](../content/articles/frappe-books-japan-review.md)|追加事実確認|Frappeの現行Web版と旧デスクトップ版の配布物・対応ドキュメントを確定する。|
|37|[MCP対応の会計ソフトを比較：読取・更新・権限・ログで選ぶ](../content/articles/accounting-mcp-comparison.md)|追加事実確認|マネーフォワードMCPの個人契約での対象操作・権限・料金・データ範囲を公式資料で確定する。|
|38|[無料のAI会計はどこまで任せられる？料金・確認作業・データ送信を整理](../content/articles/free-ai-accounting-limits.md)|追加事実確認|マネーフォワードMCPの個人契約対象範囲と料金、利用するAIモデルの現行課金条件を確定する。|
|39|[OpenTaxとfreee会計の違い：できること・運用・乗り換え条件を比較](../content/articles/opentax-vs-freee.md)|編集レビュー可能||
|41|[複式簿記のやり方を5つの取引で学ぶ：個人事業主の仕訳から帳簿まで](../content/articles/double-entry-bookkeeping-howto.md)|編集レビュー可能||
|42|[AIを使った確定申告のやり方：資料整理から帳簿確認・e-Tax提出まで](../content/articles/ai-tax-return-howto.md)|編集レビュー可能||
|43|[個人事業主の帳簿の付け方：集める・記録する・照合するの基本手順](../content/articles/sole-proprietor-bookkeeping-routine.md)|編集レビュー可能||
|44|[AIで仕訳候補を作る方法：入力例・プロンプト・確認の手順](../content/articles/ai-journal-entry-workflow.md)|編集レビュー可能||
|45|[個人事業主の領収書・レシート整理：ためない分類と記帳後の保管方法](../content/articles/receipt-organization-sole-proprietor.md)|編集レビュー可能||
|46|[電子取引データの保存方法：個人事業主がPDF請求書・領収書を整理する手順](../content/articles/electronic-transaction-records-howto.md)|編集レビュー可能||
|47|[銀行明細CSVを会計ソフトに取り込む方法：毎月の記帳と重複チェック](../content/articles/bank-statement-csv-bookkeeping.md)|編集レビュー可能||
|48|[事業主貸・事業主借の仕訳：私費立替・生活費・個人口座の入金を整理](../content/articles/owners-drawings-contributions-journal.md)|編集レビュー可能||
|49|[家事按分のやり方：家賃・通信費の割合を決めて仕訳するまで](../content/articles/business-use-expense-apportionment.md)|編集レビュー可能||
|50|[個人事業主のクレジットカード仕訳：利用日・引落日・私用混在の記帳例](../content/articles/credit-card-journal-sole-proprietor.md)|編集レビュー可能||
|51|[売掛金の入金消込のやり方：請求書と入金を合わせる個人事業主の手順](../content/articles/accounts-receivable-reconciliation-howto.md)|編集レビュー可能||
|52|[源泉徴収された報酬の仕訳：請求額・入金額・税額を分けて記帳する方法](../content/articles/withheld-freelance-fees-journal.md)|追加事実確認|2026年分の申告書で源泉税の記載欄と年分の扱いを正式資料と照合する。|
|53|[個人事業主の開業費の仕訳：開業前の支出整理から償却まで](../content/articles/startup-costs-bookkeeping-sole-proprietor.md)|編集レビュー可能||
|54|[個人事業主のパソコン代の記帳方法：経費・資産の判定と減価償却の計算](../content/articles/computer-depreciation-sole-proprietor.md)|編集レビュー可能||
|55|[個人事業主の月末経理：帳簿と預金・未入金・未払金を照合する手順](../content/articles/monthly-bookkeeping-reconciliation.md)|編集レビュー可能||
|56|[個人事業主の決算整理のやり方：年末に確認する帳簿と仕訳のチェックリスト](../content/articles/year-end-bookkeeping-adjustments.md)|追加事実確認|2026年分の正式決算書手引きで年末整理と転記対象を照合する。|
|57|[青色申告決算書の書き方：帳簿から各欄に数字を移す手順と記入例](../content/articles/blue-return-financial-statements-howto.md)|追加事実確認|2026年分の正式様式・控除要件・入力画面を照合する（本文は確認済み2025年資料と区別済み）。|
|58|[個人事業主のe-Tax確定申告のやり方：準備・入力・送信後の確認まで](../content/articles/etax-filing-sole-proprietor.md)|追加事実確認|2026年分の正式期限・作成画面・納付案内を公開後の公式資料で照合する。|
