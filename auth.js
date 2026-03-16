import { supabase, hasSupabaseKeys } from './supabase-config.js';

function getEmailFromUser(user) {
  return user?.email || user?.user_metadata?.email || 'Guest';
}

export async function applyNavigationAuthState() {
  const userBadge = document.getElementById('user-badge');
  const guestEls = document.querySelectorAll('[data-auth="guest"]');
  const userEls = document.querySelectorAll('[data-auth="user"]');
  const adminEls = document.querySelectorAll('[data-auth="admin"]');

  if (!hasSupabaseKeys || !supabase) {
    if (userBadge) userBadge.textContent = 'Guest';
    guestEls.forEach((el) => el.classList.remove('is-hidden'));
    userEls.forEach((el) => el.classList.add('is-hidden'));
    adminEls.forEach((el) => el.classList.add('is-hidden'));
    return;
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    if (userBadge) userBadge.textContent = 'Guest';
    guestEls.forEach((el) => el.classList.remove('is-hidden'));
    userEls.forEach((el) => el.classList.add('is-hidden'));
    adminEls.forEach((el) => el.classList.add('is-hidden'));
    return;
  }

  const user = session.user;

  guestEls.forEach((el) => el.classList.add('is-hidden'));
  userEls.forEach((el) => el.classList.remove('is-hidden'));

  if (userBadge) {
    userBadge.textContent = getEmailFromUser(user);
  }

  const role = user.user_metadata?.role;

  if (role === 'admin') {
    adminEls.forEach((el) => el.classList.remove('is-hidden'));
  } else {
    adminEls.forEach((el) => el.classList.add('is-hidden'));
  }
}

export function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!hasSupabaseKeys || !supabase) {
      alert('Supabase is not configured yet.');
      return;
    }

    const email = form.email.value.trim();
    const password = form.password.value;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = 'calendar.html';
  });
}

export function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!hasSupabaseKeys || !supabase) {
      alert('Supabase is not configured yet.');
      return;
    }

    const email = form.email.value.trim();
    const password = form.password.value;

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert('Account created. Check your email if confirmation is enabled.');
    window.location.href = 'login.html';
  });
}

export function initLogoutActions() {
  const logoutButtons = document.querySelectorAll('[data-action="logout"]');
  if (!logoutButtons.length) return;

  logoutButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      if (supabase) {
        await supabase.auth.signOut();
      }
      window.location.href = 'index.html';
    });
  });
}

export async function protectPage(options = {}) {
  const { requiresAuth = false, requiresAdmin = false } = options;

  if (!requiresAuth) return true;

  if (!hasSupabaseKeys || !supabase) {
    window.location.href = 'login.html';
    return false;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    window.location.href = 'login.html';
    return false;
  }

  if (requiresAdmin) {
    const role = data.user.user_metadata?.role;
    if (role !== 'admin') {
      window.location.href = 'calendar.html';
      return false;
    }
  }

  return true;
}

export async function getSession() {
  if (!hasSupabaseKeys || !supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Session error:', error);
    return null;
  }

  return data.session;
}