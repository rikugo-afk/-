# 社員ログイン＋共有DBのセットアップ

現在のGitHub Pagesはそのまま使えます。共有版はSupabaseの認証・Postgresへ接続します。
プロジェクトの作成と社員のアカウント作成は、管理者のSupabaseアカウントで行ってください。
このリポジトリに管理用キー・DBパスワードを保存する必要はありません。

## 1. Supabaseプロジェクトを作る

1. https://supabase.com/dashboard にログインします。
2. New projectから組織・プロジェクト名（例：order-desk）・DBパスワード・リージョンを指定します。DBパスワードはご自身で保管し、チャットやGitHubに貼らないでください。
3. 起動が完了したら、プロジェクトのSQL Editorを開きます。
4. リポジトリの `supabase/schema.sql` の全文を貼り付けて実行します。

このSQLは社員リストと共有データを作成します。未ログイン・社員登録なし・利用停止中のアカウントは、APIを直接呼んでも共有データにアクセスできません。

## 2. ログイン設定と社員登録

1. Authentication → URL ConfigurationのSite URLを `https://rikugo-afk.github.io/-/` にします。Redirect URLsにも同じURLを追加します。ローカル検証時だけ、使用するローカルURLも追加します。
2. Authentication → Providers → Emailでメールログインを有効にし、一般ユーザーの新規登録（Allow new users to sign up）は無効にします。利用するメール送信設定も確認してください。
3. Authentication → Usersから社員を作成します。管理画面のCreate userで社員用メールと初期パスワードを設定し、メール確認済み（Auto Confirm User）にするか、Invite userで招待します。初期パスワードを使う場合は安全な社内経路で本人に伝えてください。
4. 作成した社員について、SQL Editorで以下を実行します。メールアドレス・表示名を実際の社員のものに置き換えます。

```sql
insert into public.order_desk_employees(user_id, display_name, enabled)
select id, '藤田', true
from auth.users
where lower(email) = lower('社員のメールアドレスをここに記入')
on conflict(user_id) do update set display_name=excluded.display_name, enabled=true;
```

実行後、Table Editorの `order_desk_employees` に対象社員が1行登録されたことを確認してください。該当するAuthユーザーがない場合は追加されません。利用社員ごとに同じ手順を繰り返します。

招待メール・パスワード再設定メールから開くと、パスワード設定画面に進みます。ログイン後の「パスワード変更」も使用できます。社員登録前にアクセスした場合はログインできても案件画面は表示されません。

利用を止める場合は社員の `enabled` をfalseに変更します。RPCは即座に拒否し、開いている画面も次回の権限確認で非表示になります（最大約15秒）。すでに端末に届いた情報やダウンロード済みファイルは回収できません。

## 3. GitHubに公開用の接続情報を設定

SupabaseのConnectまたはProject Settings → APIから、Project URLと**Publishable key**（または旧形式のanon public key）を確認します。これらはブラウザー向けの公開接続情報です。

GitHubリポジトリの Settings → Secrets and variables → Actions → Variables に以下を追加します。

| 名前 | 値 |
|---|---|
| `ORDER_DESK_MODE` | `shared` |
| `SUPABASE_URL` | Project URL（`https://...supabase.co`） |
| `SUPABASE_ANON_KEY` | Publishable keyまたはanon public key |

**service_role、secret key、DBパスワードは設定しないでください。** ビルドは管理用キーの混入を拒否します。公開キーが知られても社員リストで認可されない限りデータは読めません。

共有版の変更ブランチをmainへ反映した後、Actions → Deploy Order Desk to GitHub Pages → Run workflowを実行します。接続情報が不足していれば共有モードのビルドは失敗し、以前の公開版は更新されません。
`ORDER_DESK_MODE` 未設定の場合は従来のローカル保存モードです。変数を設定しただけでは、過去のビルドや既存の稼働画面は変更されません。

## 4. 以前の案件を移す

以前のデータが入っているブラウザーで共有版に社員ログインします。
共有DBが空の場合、画面の「共有DBへ移行する」を押してください。事前の「以前のデータをバックアップ」も利用できます。
案件・入力途中の下書き・開発進捗をまとめて移行し、元のブラウザーデータは削除しません。
共有DBがすでに使われている場合は、自動で既存データを置き換えないよう移行ボタンを無効にします。

## 5. 社員2人で動作確認する

1. 別々のブラウザーで異なる社員としてログインし、同じ案件を表示します。
2. 片方が編集して「保存」を押し、もう一方で再読み込みまたは約15秒後の更新を確認します。
3. 両方が同じ版を編集し、片方を保存した後にもう片方を保存すると、後の保存は競合で止まります。
4. 競合時は「未保存の内容を退避」してから最新データを読み込み、必要な変更を入れ直してください。他人の更新を自動で上書きしません。
5. 未ログイン・社員登録のないアカウント・利用停止アカウントで、案件を表示できないことを確認します。

## 開発時

```sh
npm ci
npm test
ORDER_DESK_MODE=shared SUPABASE_URL=https://YOUR_PROJECT.supabase.co SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY npm start
```

ローカル保存モードの確認は接続変数なしで `npm start` を実行します。
`.env` は自動では読み込みません。環境変数として渡すか、Nodeの `--env-file` で読み込んでください。`.env.example` に設定名だけを載せています。

## 保存と制約

- 案件・下書き・開発進捗・採番履歴を、1つの共有スナップショットとしてPostgresにトランザクション保存します。更新版の番号を照合して同時編集の上書きを防ぎます。
- 社員は同じ会社の全案件を閲覧・編集できます。案件別の閲覧制限・複数会社・管理者用の社員招待画面は今回の範囲外です。社員の登録・停止はSupabase管理画面で行います。
- 新規番号は編集中に仮表示し、共有保存時の競合チェックで重複保存を防ぎます。複数人が同時に行を追加した場合は片方の保存が止まり、最新データからやり直す必要があります。
- 保存はオンライン時のみです。失敗しても画面の変更は保持し、保存したことにはしません。
- 共有モードのJSONバックアップには案件・下書き・開発進捗・採番を含めます。取り消し履歴は各ブラウザーのメモリー内だけで、再読み込みで消えます。他の社員の更新後に古い履歴で上書きしようとした場合も版チェックで止めます。
- 認証セッションはタブのsessionStorageに保存し、共有案件のキャッシュはメモリー内で扱います。従来のローカルデータは移行用に元の場所に残します。
- GitHub PagesのHTML・JSは公開配信です。案件データはSupabase側の社員認可で保護します。公開画面のURL自体を社内ネットワーク限定にする構成ではありません。
