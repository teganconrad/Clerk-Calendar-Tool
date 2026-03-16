import { getSession } from './auth.js';
import {
  EVENT_CATEGORIES,
  createEvent,
  deleteEvent,
  expandEventsForRange,
  fetchUserEvents,
  getCategoryColor,
  mapEventToCalendar,
  updateEvent,
  uploadEventAttachment,
} from './events.js';
import { initExcelImport } from './imports.js';

let calendar;
let currentEvents = [];

const ui = {
  loading: document.getElementById('calendar-loading'),
  error: document.getElementById('calendar-error'),
  empty: document.getElementById('calendar-empty'),
  status: document.getElementById('calendar-status'),
  filter: document.getElementById('category-filter'),
  search: document.getElementById('event-search-input'),
  searchButton: document.getElementById('search-events-btn'),
  legend: document.getElementById('category-legend'),
  modal: document.getElementById('event-modal'),
  form: document.getElementById('event-form'),
  modalTitle: document.getElementById('event-modal-title'),
  deleteBtn: document.getElementById('event-delete-btn'),
  cancelBtn: document.getElementById('event-cancel-btn'),
  closeBtn: document.getElementById('event-close-btn'),
  reminderPanel: document.getElementById('upcoming-reminders'),
};

const setStatus = (msg, type = 'success') => {
  if (!ui.status) return;
  ui.status.textContent = msg;
  ui.status.className = `alert ${type === 'error' ? 'error' : 'success'}`;
};

const setLoading = (isLoading) => {
  ui.loading?.classList.toggle('is-hidden', !isLoading);
};

const setError = (msg = '') => {
  if (!ui.error) return;
  ui.error.textContent = msg;
  ui.error.classList.toggle('is-hidden', !msg);
};

const updateEmptyState = (events) => {
  ui.empty?.classList.toggle('is-hidden', events.length > 0);
};

const normalizeRecurrenceForSave = () => {
  const preset = document.getElementById('event-recurrence-preset').value;
  const advanced = document.getElementById('event-recurrence-advanced').value.trim();

  if (preset === 'none') return advanced || '';
  if (preset === 'custom') return advanced;
  return `FREQ=${preset.toUpperCase()}`;
};

const applyRecurrenceToForm = (rule) => {
  const preset = document.getElementById('event-recurrence-preset');
  const advanced = document.getElementById('event-recurrence-advanced');
  const clean = String(rule || '').trim().toUpperCase();

  if (!clean) {
    preset.value = 'none';
    advanced.value = '';
    return;
  }

  if (clean === 'FREQ=DAILY') preset.value = 'daily';
  else if (clean === 'FREQ=WEEKLY') preset.value = 'weekly';
  else if (clean === 'FREQ=MONTHLY') preset.value = 'monthly';
  else preset.value = 'custom';

  advanced.value = rule || '';
};

const setRecurrenceHint = () => {
  const preset = document.getElementById('event-recurrence-preset')?.value;
  const hint = document.getElementById('recurrence-hint');
  if (!hint) return;

  if (preset === 'none') hint.textContent = 'This event occurs once.';
  else if (preset === 'daily') hint.textContent = 'Repeats every day (single source event, expanded client-side).';
  else if (preset === 'weekly') hint.textContent = 'Repeats every week (single source event, expanded client-side).';
  else if (preset === 'monthly') hint.textContent = 'Repeats every month (single source event, expanded client-side).';
  else hint.textContent = 'Custom recurrence rule for advanced use.';
};

const getSourceEventById = (id) => currentEvents.find((eventItem) => eventItem.id === id);

const openModal = (title, eventData = null, defaultDate = null) => {
  if (!ui.modal || !ui.form) return;

  ui.modalTitle.textContent = title;
  ui.form.reset();
  ui.form.dataset.eventId = eventData?.id || '';

  document.getElementById('event-title').value = eventData?.title || '';
  document.getElementById('event-description').value = eventData?.description || '';
  document.getElementById('event-category').value = eventData?.category || 'other';
  document.getElementById('event-color').value = eventData?.color || getCategoryColor('other');
  applyRecurrenceToForm(eventData?.recurrence_rule || '');
  setRecurrenceHint();

  document.getElementById('event-reminder-type').value = eventData?.reminder_type || 'none';
  document.getElementById('event-reminder-datetime').value = eventData?.reminder_datetime
    ? new Date(eventData.reminder_datetime).toISOString().slice(0, 16)
    : '';

  const dueDateInput = document.getElementById('event-due-date');
  const endDateInput = document.getElementById('event-end-date');
  dueDateInput.value = eventData?.due_date
    ? new Date(eventData.due_date).toISOString().slice(0, 16)
    : defaultDate
      ? new Date(defaultDate).toISOString().slice(0, 16)
      : '';
  endDateInput.value = eventData?.end_date ? new Date(eventData.end_date).toISOString().slice(0, 16) : '';

  const attachmentView = document.getElementById('attachment-current');
  if (attachmentView) {
    attachmentView.innerHTML = eventData?.attachment_url
      ? `<a href="${eventData.attachment_url}" target="_blank" rel="noopener">${eventData.attachment_name || 'Attachment'}</a>`
      : '<span class="muted">No attachment uploaded.</span>';
  }

  ui.deleteBtn.classList.toggle('is-hidden', !eventData?.id);
  ui.modal.classList.remove('is-hidden');
};

const closeModal = () => ui.modal?.classList.add('is-hidden');

const renderUpcomingReminders = () => {
  if (!ui.reminderPanel) return;

  const now = new Date();
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const reminderEvents = currentEvents
    .filter((eventItem) => eventItem.reminder_datetime)
    .filter((eventItem) => {
      const reminderDate = new Date(eventItem.reminder_datetime);
      return reminderDate >= now && reminderDate <= soon;
    })
    .sort((a, b) => new Date(a.reminder_datetime) - new Date(b.reminder_datetime))
    .slice(0, 8);

  if (!reminderEvents.length) {
    ui.reminderPanel.innerHTML = '<p class="muted">No upcoming reminders in the next 7 days.</p>';
    return;
  }

  ui.reminderPanel.innerHTML = reminderEvents
    .map(
      (eventItem) => `
      <article class="reminder-item clickable" data-event-id="${eventItem.id}">
        <div class="reminder-stripe" style="background:${eventItem.color}"></div>
        <div>
          <strong>${eventItem.title}</strong>
          <p>${new Date(eventItem.reminder_datetime).toLocaleString()} · ${eventItem.category}</p>
          <small>${eventItem.attachment_url ? 'Attachment available' : 'No attachment'}</small>
        </div>
      </article>
    `,
    )
    .join('');

  ui.reminderPanel.querySelectorAll('[data-event-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const sourceEvent = getSourceEventById(el.getAttribute('data-event-id'));
      if (sourceEvent) openModal('Edit Event', sourceEvent);
    });
  });
};

const populateCategories = () => {
  const categoryInput = document.getElementById('event-category');
  if (categoryInput) {
    categoryInput.innerHTML = EVENT_CATEGORIES.map(
      (c) => `<option value="${c.value}">${c.label}</option>`,
    ).join('');
  }

  if (ui.filter) {
    ui.filter.innerHTML =
      '<option value="all">All Categories</option>' +
      EVENT_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
  }

  if (ui.legend) {
    ui.legend.innerHTML = EVENT_CATEGORIES.map(
      (c) => `<span class="legend-chip"><i style="background:${c.color}"></i>${c.label}</span>`,
    ).join('');
  }
};

const syncColorWithCategory = () => {
  const cat = document.getElementById('event-category')?.value || 'other';
  const colorInput = document.getElementById('event-color');
  if (colorInput && !colorInput.dataset.customColor) {
    colorInput.value = getCategoryColor(cat);
  }
};

const applyFilter = () => {
  const selected = ui.filter?.value || 'all';
  const searchValue = (ui.search?.value || '').trim().toLowerCase();

  let filtered =
    selected === 'all'
      ? [...currentEvents]
      : currentEvents.filter((eventItem) => eventItem.category === selected);

  if (searchValue) {
    filtered = filtered.filter((eventItem) => {
      const title = String(eventItem.title || '').toLowerCase();
      const description = String(eventItem.description || '').toLowerCase();
      const category = String(eventItem.category || '').toLowerCase();

      return (
        title.includes(searchValue) ||
        description.includes(searchValue) ||
        category.includes(searchValue)
      );
    });
  }

  if (calendar) {
    calendar.removeAllEvents();
    filtered.forEach((eventItem) => calendar.addEvent(mapEventToCalendar(eventItem)));
  }

 

  updateEmptyState(filtered);
};

const focusFromUrlParams = () => {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('event');
  const date = params.get('date');

  if (date && calendar) {
    calendar.gotoDate(date);
  }

  if (eventId) {
    const sourceEvent = getSourceEventById(eventId);
    if (sourceEvent) {
      if (calendar) calendar.gotoDate(sourceEvent.due_date);
      openModal('Edit Event', sourceEvent);
    }
  }

  if (eventId || date) {
    const cleanUrl = `${window.location.pathname}`;
    window.history.replaceState({}, '', cleanUrl);
  }
};

const refreshEvents = async () => {
  setError('');
  setLoading(true);
  const session = await getSession();

  try {
    currentEvents = await fetchUserEvents(session.user.id);
    applyFilter();
    renderUpcomingReminders();
    focusFromUrlParams();
  } catch (error) {
    setError(`Unable to load events: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

const getFormPayload = async () => {
  const session = await getSession();
  const category = document.getElementById('event-category').value;
  const endValue = document.getElementById('event-end-date').value;

  return {
    user_id: session.user.id,
    title: document.getElementById('event-title').value.trim(),
    due_date: new Date(document.getElementById('event-due-date').value).toISOString(),
    end_date: endValue ? new Date(endValue).toISOString() : null,
    description: document.getElementById('event-description').value.trim(),
    category,
    color: document.getElementById('event-color').value || getCategoryColor(category),
    recurrence_rule: normalizeRecurrenceForSave(),
    reminder_type: document.getElementById('event-reminder-type').value,
    reminder_datetime: document.getElementById('event-reminder-datetime').value
      ? new Date(document.getElementById('event-reminder-datetime').value).toISOString()
      : null,
  };
};

const syncDragOrResizeToDb = async (info, action) => {
  const sourceId = info.event.extendedProps?.sourceId || info.event.id;

  if (info.event.extendedProps?.generatedOccurrence) {
    info.revert();
    setStatus('Recurring generated occurrences cannot be moved directly. Edit the source event.', 'error');
    return;
  }

  try {
    await updateEvent(sourceId, {
      due_date: info.event.start?.toISOString() || null,
      end_date: info.event.end?.toISOString() || null,
    });
    await refreshEvents();
    setStatus(`Event ${action} successfully.`);
  } catch (error) {
    info.revert();
    setStatus(`Unable to ${action} event: ${error.message}`, 'error');
  }
};

const getInitialViewForScreen = () => (window.innerWidth < 760 ? 'timeGridWeek' : 'dayGridMonth');

const mountCalendar = async () => {
  const calendarEl = document.getElementById('calendar-root');
  if (!calendarEl) return;

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: getInitialViewForScreen(),
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    buttonText: { month: 'Month', week: 'Week', day: 'Day' },
    height: 'auto',
    nowIndicator: true,
    selectable: true,
    editable: true,
    eventResizableFromStart: true,
    eventDurationEditable: true,
    dateClick: (info) => openModal('Create Event', null, info.date),
    eventClick: (info) => {
      const sourceId = info.event.extendedProps?.sourceId || info.event.id;
      const match = getSourceEventById(sourceId);
      if (match) openModal('Edit Event', match);
    },
    eventDrop: (info) => syncDragOrResizeToDb(info, 'moved'),
    eventResize: (info) => syncDragOrResizeToDb(info, 'resized'),
    datesSet: () => applyFilter(),
    events: [],
  });

  calendar.render();
};

const navigateToSearchResults = () => {
  const query = (ui.search?.value || '').trim();
  const target = `search-results.html?q=${encodeURIComponent(query)}`;
  window.location.href = target;
};

const bindActions = () => {
  ui.filter?.addEventListener('change', applyFilter);

  ui.searchButton?.addEventListener('click', navigateToSearchResults);
  ui.search?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigateToSearchResults();
    }
  });

  document.getElementById('event-category')?.addEventListener('change', syncColorWithCategory);
  document.getElementById('event-color')?.addEventListener('change', (e) => {
    e.target.dataset.customColor = 'true';
  });

  document.getElementById('event-recurrence-preset')?.addEventListener('change', setRecurrenceHint);

  ui.cancelBtn?.addEventListener('click', closeModal);
  ui.closeBtn?.addEventListener('click', closeModal);

  ui.form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const eventId = ui.form.dataset.eventId;

    try {
      const payload = await getFormPayload();
      const attachmentFile = document.getElementById('event-attachment').files?.[0] || null;
      const session = await getSession();

      let saved = eventId ? await updateEvent(eventId, payload) : await createEvent(payload);

      if (attachmentFile) {
        const uploaded = await uploadEventAttachment({
          userId: session.user.id,
          eventId: saved.id,
          file: attachmentFile,
        });

        if (uploaded) saved = await updateEvent(saved.id, uploaded);
      }

      setStatus(eventId ? 'Event updated successfully.' : 'Event created successfully.');
      closeModal();
      await refreshEvents();
    } catch (error) {
      setStatus(`Save failed: ${error.message}`, 'error');
    }
  });

  ui.deleteBtn?.addEventListener('click', async () => {
    const eventId = ui.form?.dataset.eventId;
    if (!eventId) return;

    const confirmed = window.confirm('Delete this event? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteEvent(eventId);
      setStatus('Event deleted successfully.');
      closeModal();
      await refreshEvents();
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`, 'error');
    }
  });
};

// Future reminder delivery hooks:
// - in-app alert polling can query events with reminder_type='in_app' and upcoming reminder_datetime.
// - email workflows can be handled by Supabase Edge Functions / cron jobs in later phases.
export const initCalendarPage = async () => {
  if (!document.getElementById('calendar-root')) return;

  if (!window.FullCalendar) {
    setError('Calendar library failed to load. Please refresh.');
    return;
  }

  populateCategories();
  bindActions();
  await mountCalendar();
  await refreshEvents();

  initExcelImport({
    onImportComplete: async () => {
      await refreshEvents();
      setStatus('Import complete: calendar refreshed.');
    },
  });
};