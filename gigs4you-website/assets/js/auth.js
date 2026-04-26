/**
 * Gigs4You Website — Auth modal handler
 * Opens the sign-in modal; on submit redirects to the dashboard (localhost:3001).
 */

const DASHBOARD_URL = 'http://localhost:3001';

document.addEventListener('DOMContentLoaded', function () {
  const modal    = document.getElementById('loginModal');
  const closeBtn = document.getElementById('closeModal');
  const loginForm = document.getElementById('loginForm');
  const loginMsg  = document.getElementById('loginMessage');
  const loginBtn  = document.getElementById('loginSubmit');
  const togglePw  = document.getElementById('togglePw');
  const pwInput   = document.getElementById('password');

  // ── Open modal when "Sign in" nav link is clicked ──────────────────────
  document.querySelectorAll('.nav-actions a, .btn-ghost').forEach(link => {
    if (link.textContent.trim() === 'Sign in') {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    }
  });

  function openModal() {
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const first = modal.querySelector('input');
      if (first) first.focus();
    }, 60);
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (loginMsg) { loginMsg.textContent = ''; loginMsg.className = 'login-message'; }
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') closeModal();
  });

  // ── Show/hide password ──────────────────────────────────────────────────
  if (togglePw && pwInput) {
    togglePw.addEventListener('click', function () {
      const isText = pwInput.type === 'text';
      pwInput.type = isText ? 'password' : 'text';
      togglePw.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
      // Swap eye icon
      togglePw.innerHTML = isText
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    });
  }

  // ── Form submit → redirect to dashboard ────────────────────────────────
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const identifier = (document.getElementById('identifier')?.value || '').trim();
      const password   = document.getElementById('password')?.value || '';

      if (!identifier) {
        showMsg('Please enter your phone number or email.', 'error');
        return;
      }
      if (!password) {
        showMsg('Please enter your password.', 'error');
        return;
      }

      if (loginBtn) loginBtn.disabled = true;
      const btnText = document.getElementById('loginBtnText');
      if (btnText) btnText.textContent = 'Redirecting…';

      // Hand off to the dashboard login page with identifier pre-filled
      const params = new URLSearchParams({ identifier });
      window.location.href = `${DASHBOARD_URL}/login?${params.toString()}`;
    });
  }

  function showMsg(text, type) {
    if (!loginMsg) return;
    loginMsg.textContent = text;
    loginMsg.className = 'login-message login-message--' + type;
  }
});
