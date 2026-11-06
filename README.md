# 共同生活費アプリ v0.9 — Google/メール認証と2端末共有 接続前パッケージ

**状態：未承認・開発検証用（2026-11-04）**

## 完了／未完了

- ✅ ENOSHILQのテストSupabaseプロジェクト `roomshare-expenses-dev` は稼働中、東京リージョン。
- ✅ RLS、グループ作成、招待発行・参加、本人立替支出、同期イベントのDB実装は適用済み。SQL内の仮2ユーザーで権限テスト済み。
- ✅ v0.8のホーム／支出／精算／履歴／設定＋正円FABを維持。
- ✅ ブラウザ側にGoogle OAuthフロー・メールOTPの入力と `verifyOtp` 検証、招待リンク復帰処理を実装。
- ❌ Google Cloud側でOAuthクライアントを発行・Supabaseへ入力は未実施。
- ❌ メールOTP用テンプレートをSupabaseに設定する作業は未実施。
- ❌ 公開HTTPSサイトへのデプロイ、OAuth実ログイン、異なるスマホ2台のブラウザ操作検証は未実施。

## 接続設定：Googleログイン

1. **Google Cloud Console** のGoogle Auth Platform → Branding / Audienceを確認し、必要に応じてテストユーザー2名のメールを登録。
2. **Clients** → `Create client` → `Web application` を選ぶ。
3. Authorized redirect URI（Google側）に次を登録：

   `https://pgbkgzobcnlvvyupfmrc.supabase.co/auth/v1/callback`

4. Client ID/Secretを取得し、**Supabase Dashboard → Authentication → Sign In / Providers → Google** に入力・有効化する。**GoogleのClient Secretはチャットや配布ファイルに貼らず、ダッシュボードだけに入力**する。
5. WebサイトをHTTPS URLで公開したら、**Supabase Dashboard → Authentication → URL Configuration** に公開サイトURLをSite URL / Redirect URLsとして登録する。Google側のredirect URIと混同しないこと。
6. `config.js` の `googleOAuthReady` を `true` に変更して再デプロイ。ログインボタン→Google→招待参加確認の順に動作検証する。

公式：https://supabase.com/docs/guides/auth/social-login/auth-google
https://supabase.com/docs/guides/auth/redirect-urls

## 接続設定：メール認証コード（代替）

1. **Supabase Dashboard → Authentication → Sign In / Providers → Email** が有効か確認。
2. **Authentication → Email Templates** の `Magic Link` と `Confirm signup`（必要な場合）を、`{{ .Token }}` を本文に含むコード送信型に変更する。Supabase標準テンプレートが `{{ .ConfirmationURL }}` の場合、リンク型が送られるため、画面のコード入力に適合しない。
3. 本番の送信にはSMTP設定・レート制限・メール送信元のドメイン確認が必要。テスト人数が少なくても送信制限は確認する。
4. `config.js` の `emailOtpReady` を `true` に変更して再デプロイ。本人のメールへコードが届くことを確認してから他の参加者を追加する。

公式：https://supabase.com/docs/reference/javascript/auth-signinwithotp
https://supabase.com/docs/guides/auth/auth-email-templates

## HTTPSの公開方法

Supabase Edge Functions と Storageは `text/html` を `text/plain` として返すため、HTMLアプリをホストできません。**フロントエンドはGitHub Pages・Cloudflare Pages・Netlifyなどに公開**する構成です。GitHub Pagesを使用する場合、`index.html`, `app.js`, `backend.js`, `config.js` を同じ公開ディレクトリへ置く。公開リポジトリに **秘密鍵・本物の家計データ・個人情報は置かない**。`config.js` の Supabase publishable key は公開してよいキーですが、RLSを必ず有効にすること。

公開後、Google CloudではSupabaseのAuth callback URL、Supabase Authでは**公開されたWebサイトURL**の双方の登録が必要です。

## 開発版の機能制限

- 本版は個人立替の記録・読み取りの試作品。共同資金入金・送金申告/受領確認・月次締め・負担人数変更はクラウド未実装。精算見込を実際の支払指示として使わないでください。
- 招待トークンはURLから取り除いてsessionStorageへ移し、別タブ復元のため最大20分localStorageにも保持します。共有端末には注意してください。
- Google OAuth/メールOTP/Realtimeは設定後の実アカウントE2E未実施。SQLロールプレイ・モックUIテストをもって実認証済みと扱っていません。
- 本番前に認証メール、RLS、不正招待、期限切れ、リロード、二重登録、オフライン復帰、2台のスマホでの動作試験を行います。
