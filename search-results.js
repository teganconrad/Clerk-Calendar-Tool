import { getSession } from './auth.js';
import { EVENT_CATEGORIES, fetchUserEvents } from './events.js';

let sourceEvents = [];

const ui = {
  summary: document.getElementById('search-results-summary'),
  count: document.getElementById('search-results-count'),
  list: document.getElementById('search-results-list'),
  query: document.getElementById('search-query-input'),
  queryBtn: document.getElementById('search-query-btn'),
  dateFrom: document.getElementById('date-from-filter'),
  dateTo: document.getElementById('date-to-filter'),
  category: document.getElementById('category-filter-results'),
};

const getParams = () => new URLSearchParams(window.location.search);

const updateUrl = (query) => {
  const params = getParams();
  params.set('q', query);
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
};

const getSearchTerm = () => (ui.query?.value || '').trim().toLowerCase();

const inDateRange = (dateIso, from, to) => {
  const value = new Date(dateIso);
  if (Number.isNaN(value.getTime())) return false;

  if (from) {
    const fromDate = new Date(`${from}T00:00:00`);
    if (value < fromDate) return false;
  }

  if (to) {
    const toDate = new Date(`${to}T23:59:59`);
    if (value > toDate) return false;
  }

  return true;
};

const renderResults = () => {
  const term = getSearchTerm();
  const from = ui.dateFrom?.value || '';
  const to = ui.dateTo?.value || '';
  const category = ui.category?.value || 'all';

  const filtered = sourceEvents.filter((eventItem) => {
    const haystack = `${eventItem.title} ${eventItem.description || ''} ${eventItem.category || ''}`.toLowerCase();
    const textMatch = !term || haystack.includes(term);
    const categoryMatch = category === 'all' || eventItem.category === category;
    const dateMatch = inDateRange(eventItem.due_date, from, to);
    return textMatch && categoryMatch && dateMatch;
  });

  if (ui.summary) ui.summary.textContent = `Results for "${term || 'all events'}"`;
  if (ui.count) ui.count.textContent = `${filtered.length} result(s)`;

  if (!ui.list) return;

  if (!filtered.length) {
    ui.list.innerHTML = '<article class="card"><p class="muted">No matching events found. Try another search or adjust filters.</p></article>';
    return;
  }

  ui.list.innerHTML = filtered
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .map(
      (eventItem) => {
        const date = new Date(eventItem.due_date);
        const reminder = eventItem.reminder_datetime
          ? `Reminder: ${new Date(eventItem.reminder_datetime).toLocaleString()}`
          : 'No reminder';
        const attachment = eventItem.attachment_url ? 'Attachment available' : 'No attachment';
        const categoryLabel = eventItem.category || 'other';

        const target = `calendar.html?date=${encodeURIComponent(eventItem.due_date)}&event=${encodeURIComponent(eventItem.id)}`;

        return `
          <a class="result-card card" href="${target}">
            <div class="result-row">
              <h3>${eventItem.title}</h3>
              <span class="status-badge">${categoryLabel}</span>
            </div>
            <p class="muted">${date.toLocaleString()}</p>
            <p>${eventItem.description || 'No description'}</p>
            <p class="muted">${reminder} · ${attachment}</p>
          </a>
        `;
      },
    )
    .join('');
};

const populateCategories = () => {
  if (!ui.category) return;
  ui.category.innerHTML =
    '<option value="all">All Categories</option>' +
    EVENT_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
};

export const initSearchResultsPage = async () => {
  if (!ui.list) return;

  const session = await getSession();
  if (!session?.user?.id) {
    window.location.href = 'login.html';
    return;
  }

  populateCategories();

  const params = getParams();
  const initialQ = params.get('q') || '';
  if (ui.query) ui.query.value = initialQ;

  sourceEvents = await fetchUserEvents(session.user.id);
  renderResults();

  const runSearch = () => {
    updateUrl(ui.query.value.trim());
    renderResults();
  };

  ui.queryBtn?.addEventListener('click', runSearch);
  ui.query?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  ui.dateFrom?.addEventListener('change', renderResults);
  ui.dateTo?.addEventListener('change', renderResults);
  ui.category?.addEventListener('change', renderResults);
};