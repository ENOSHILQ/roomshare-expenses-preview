// PUBLIC BROWSER CONFIGURATION for the isolated ENOSHILQ test project.
// A publishable key is safe to ship; service_role, sb_secret_, DB passwords and
// Google OAuth client secrets MUST NEVER be placed in this file.
window.ROOMSHARE_CONFIG = {
  mode: 'supabase',
  supabaseUrl: 'https://pgbkgzobcnlvvyupfmrc.supabase.co',
  publishableKey: 'sb_publishable_uWP3_3GM2Qwm0lhHBkUOgA_-8eoVL6f',
  googleOAuthReady: false, // Google Cloud + Supabase OAuth configuration REQUIRED first
  emailOtpReady: false // Email provider + {{ .Token }} email templates REQUIRED first
};
