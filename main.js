import {
  applyNavigationAuthState,
  initLoginForm,
  initLogoutActions,
  initRegisterForm,
  protectPage,
} from './auth.js';
import { initCalendarPage } from './calendar.js';
import { initHomeWeeklyWidget } from './home-widget.js';
import { initSearchResultsPage } from './search-results.js';

const THEME_KEY = 'clerk-calendar-theme';

const setTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
  localStorage.setItem(THEME_KEY, theme);
};

const initializeTheme = () => {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  setTheme(savedTheme);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
};

const initializeMenu = () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  if (!menuToggle || !nav) return;

  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open');
  });
};

const initializeFooterYear = () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
};

const init = async () => {
  initializeTheme();
  initializeMenu();
  initializeFooterYear();
  initLogoutActions();

  const page = document.body.dataset.page;

  await applyNavigationAuthState();

  if (page === 'login') initLoginForm();
  if (page === 'register') initRegisterForm();

  if (page === 'calendar') {
    await protectPage({ requiresAuth: true });
    await initCalendarPage();
  }

  if (page === 'search-results') {
    await protectPage({ requiresAuth: true });
    await initSearchResultsPage();
  }

  if (page === 'admin') {
    await protectPage({ requiresAuth: true, requiresAdmin: true });
  }

  if (page === 'home') {
    await initHomeWeeklyWidget();
  }
};

init();