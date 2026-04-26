/**
 * Simple bilingual message map — English + Kiswahili.
 * Used for SMS notifications, push notifications, and error messages.
 * Extend as needed.
 */
export const I18N: Record<string, { en: string; sw: string }> = {
  // Auth
  'auth.welcome':         { en: 'Welcome to Gigs4You!',              sw: 'Karibu Gigs4You!' },
  'auth.login_success':   { en: 'Login successful.',                  sw: 'Umeingia kwa mafanikio.' },
  'auth.invalid_creds':   { en: 'Invalid credentials.',               sw: 'Nambari ya simu au nywila si sahihi.' },
  'auth.account_inactive':{ en: 'Account deactivated.',               sw: 'Akaunti yako imefungwa.' },
  // Tasks
  'task.assigned':        { en: 'You have a new task: {title}',       sw: 'Una kazi mpya: {title}' },
  'task.accepted':        { en: 'Task accepted. Start when ready.',   sw: 'Kazi imekubaliwa. Anza unapowa tayari.' },
  'task.completed':       { en: 'Task completed. Well done!',         sw: 'Kazi imekamilika. Hongera!' },
  'task.overdue':         { en: 'Task overdue: {title}',              sw: 'Kazi imechelewa: {title}' },
  // Payments
  'payment.received':     { en: 'Payment of KES {amount} received.',  sw: 'Malipo ya KES {amount} yamepokelewa.' },
  'payment.sent':         { en: 'KES {amount} sent to {phone}.',      sw: 'KES {amount} imetumwa kwa {phone}.' },
  // Subscription
  'sub.trial_ending':     { en: 'Your trial ends in {days} days.',    sw: 'Jaribio lako linaisha siku {days}.' },
  'sub.expired':          { en: 'Subscription expired. Renew now.',   sw: 'Usajili umekwisha. Fanya upya sasa.' },
  'sub.activated':        { en: 'Subscription activated. Thank you!', sw: 'Usajili umewashwa. Asante!' },
  // Jobs
  'job.new_match':        { en: 'New job matching your skills: {title}', sw: 'Kazi mpya inayolingana na ujuzi wako: {title}' },
  'job.applied':          { en: 'Application submitted for {title}',  sw: 'Maombi yako yamepelekwa kwa {title}' },
  // Verification
  'verify.submitted':     { en: 'ID verification submitted.',         sw: 'Uthibitisho wa kitambulisho umepelekwa.' },
  'verify.approved':      { en: 'Your identity has been verified ✓',  sw: 'Utambulisho wako umethibitishwa ✓' },
  'verify.rejected':      { en: 'Verification rejected. Try again.',  sw: 'Uthibitisho ulikataliwa. Jaribu tena.' },
};

export function t(key: string, lang: 'en'|'sw' = 'en', vars: Record<string,string|number> = {}): string {
  const template = I18N[key]?.[lang] || I18N[key]?.['en'] || key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
