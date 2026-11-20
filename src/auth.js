/** RESTORED - see artifacts/RESTORE_auth.js - temporary stub to avoid broken deploy */
export async function handleAuth() { return new Response(JSON.stringify({error:'RESTORE_NEEDED'}), {status:503, headers:{'content-type':'application/json'}}); }
export async function getIdentity(request) { return { guest: true, subject: 'guest:restore' }; }
export function jobLimits(env, identity) { if (identity.guest) return { max: 1, window: 86400, label: '1 генерация в сутки без регистрации. Создай аккаунт.' }; return { max: 20, window: 3600, label: 'Лимит.' }; }
export function musicLimits(env, identity) { if (identity.guest) return { max: 1, window: 86400, label: '1 трек в сутки без регистрации. Создай аккаунт.' }; return { max: 10, window: 3600, label: 'Лимит.' }; }
export async function rateLimit() { return true; }
export function publicUser(u) { return u ? { id: u.id, email: u.email, email_verified: !!u.email_verified, display_name: u.display_name || null } : null; }
