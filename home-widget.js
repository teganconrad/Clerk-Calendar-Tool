import { getSession } from './auth.js';
import { expandEventsForRange, fetchUserEvents, getDemoWeeklyEvents } from './events.js';

const startOfWeek = (base) => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const endOfWeek = (base) => {
  const d = startOfWeek(base);
  d.setDate(d.getDate() + 7);
  return d;
};

const inCurrentWeek = (isoDate, now = new Date()) => {
  const target = new Date(isoDate);
  return target >= startOfWeek(now) && target < endOfWeek(now);
};

const formatWhen = (isoDate) =>
  new Date(isoDate).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const setSummary = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const fillSummary = (events) => {
  const now = new Date();
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const expanded = expandEventsForRange(events, now, in90Days);

  const upcoming = expanded.filter((eventItem) => new Date(eventItem.start) >= now).length;
  const weekCount = expanded.filter((eventItem) => inCurrentWeek(eventItem.start, now)).length;
  const reminderCount = events.filter((eventItem) => eventItem.reminder_datetime).length;

  const next = expanded
    .filter((eventItem) => new Date(eventItem.start) >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];

  setSummary('summary-upcoming', String(upcoming));
  setSummary('summary-week', String(weekCount));
  setSummary('summary-reminders', String(reminderCount));
  setSummary('summary-next', next ? formatWhen(next.start) : 'None');
};

export const initHomeWeeklyWidget = async () => {
  const container = document.getElementById('mini-weekly-events');
  const status = document.getElementById('mini-weekly-status');
  if (!container || !status) return;

  container.innerHTML = '<p class="muted">Loading weekly events…</p>';

  try {
    const session = await getSession();
    const allEvents = session?.user?.id ? await fetchUserEvents(session.user.id) : getDemoWeeklyEvents();

    fillSummary(allEvents);

    const rangeStart = startOfWeek(new Date());
    const rangeEnd = endOfWeek(new Date());
    const weekExpanded = expandEventsForRange(allEvents, rangeStart, rangeEnd)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    status.textContent = session ? 'Showing your events this week' : 'Showing demo events (sign in to view your own)';

    if (!weekExpanded.length) {
      container.innerHTML = '<p class="muted">No events scheduled for this week.</p>';
      return;
    }

    container.innerHTML = weekExpanded
      .slice(0, 10)
      .map(
        (eventItem) => `
          <article class="mini-event-card">
            <div class="mini-event-color" style="background:${eventItem.backgroundColor}"></div>
            <div>
              <h4>${eventItem.title}</h4>
              <p>${formatWhen(eventItem.start)}</p>
              <small>${eventItem.extendedProps?.category || 'other'}</small>
            </div>
          </article>
        `,
      )
      .join('');
  } catch (error) {
    status.textContent = 'Unable to load weekly events';
    container.innerHTML = `<p class="alert error">${error.message}</p>`;
  }
};