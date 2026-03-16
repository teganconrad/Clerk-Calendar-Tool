import { supabase } from './supabase-config.js';

export const EVENT_CATEGORIES = [
  { value: 'deadline', label: 'Deadline', color: '#ef4444' },
  { value: 'meeting', label: 'Meeting', color: '#3b82f6' },
  { value: 'reporting', label: 'Reporting', color: '#a855f7' },
  { value: 'finance', label: 'Finance', color: '#f59e0b' },
  { value: 'operations', label: 'Operations', color: '#10b981' },
  { value: 'other', label: 'Other', color: '#64748b' },
];

const byCategory = Object.fromEntries(EVENT_CATEGORIES.map((c) => [c.value, c]));

export const normalizeEventRow = (row) => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title,
  due_date: row.due_date,
  end_date: row.end_date,
  description: row.description || '',
  category: row.category || 'other',
  color: row.color || byCategory[row.category || 'other']?.color || '#64748b',
  recurrence_rule: row.recurrence_rule || '',
  reminder_type: row.reminder_type || 'none',
  reminder_datetime: row.reminder_datetime,
  attachment_url: row.attachment_url,
  attachment_name: row.attachment_name,
  attachment_path: row.attachment_path,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const freqFromRule = (rule) => {
  const clean = String(rule || '').trim().toUpperCase();
  if (!clean) return 'NONE';
  if (clean === 'DAILY' || clean === 'WEEKLY' || clean === 'MONTHLY') return clean;

  const match = clean.match(/FREQ=([A-Z]+)/);
  if (match?.[1]) return match[1];

  return 'NONE';
};

const buildOccurrence = (event, startDate, endDate, index) => ({
  id: `${event.id}__r__${index}`,
  sourceId: event.id,
  title: event.title,
  start: startDate.toISOString(),
  end: endDate ? endDate.toISOString() : null,
  allDay: false,
  editable: false,
  durationEditable: false,
  backgroundColor: event.color,
  borderColor: event.color,
  classNames: ['recurring-occurrence'],
  extendedProps: {
    sourceId: event.id,
    generatedOccurrence: true,
    description: event.description,
    category: event.category,
    recurrence_rule: event.recurrence_rule,
    reminder_type: event.reminder_type,
    reminder_datetime: event.reminder_datetime,
    attachment_url: event.attachment_url,
    attachment_name: event.attachment_name,
    attachment_path: event.attachment_path,
  },
});

// Expands recurring rows for display only.
// Source rows stay singular in DB. Generated occurrences are non-draggable to avoid unstable series edits.
export const expandEventsForRange = (events, rangeStart, rangeEnd) => {
  const output = [];

  events.forEach((event) => {
    const freq = freqFromRule(event.recurrence_rule);
    const baseStart = new Date(event.due_date);
    const baseEnd = event.end_date ? new Date(event.end_date) : null;

    if (freq === 'NONE') {
      output.push(mapEventToCalendar(event));
      return;
    }

    const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : null;
    let cursor = new Date(baseStart);
    let i = 0;

    while (cursor <= rangeEnd && i < 500) {
      if (cursor >= rangeStart) {
        const occStart = new Date(cursor);
        const occEnd = durationMs != null ? new Date(occStart.getTime() + durationMs) : null;
        output.push(buildOccurrence(event, occStart, occEnd, i));
      }

      if (freq === 'DAILY') cursor.setDate(cursor.getDate() + 1);
      if (freq === 'WEEKLY') cursor.setDate(cursor.getDate() + 7);
      if (freq === 'MONTHLY') cursor.setMonth(cursor.getMonth() + 1);
      i += 1;
    }
  });

  return output;
};

export const mapEventToCalendar = (event) => ({
  id: event.id,
  title: event.title,
  start: event.due_date,
  end: event.end_date,
  allDay: false,
  editable: true,
  durationEditable: true,
  backgroundColor: event.color,
  borderColor: event.color,
  extendedProps: {
    sourceId: event.id,
    generatedOccurrence: false,
    description: event.description,
    category: event.category,
    recurrence_rule: event.recurrence_rule,
    reminder_type: event.reminder_type,
    reminder_datetime: event.reminder_datetime,
    attachment_url: event.attachment_url,
    attachment_name: event.attachment_name,
    attachment_path: event.attachment_path,
  },
});

export const makeDuplicateSignature = (eventLike) => {
  const title = String(eventLike.title || '').trim().toLowerCase();
  const dueDate = eventLike.due_date ? new Date(eventLike.due_date).toISOString() : '';
  return `${title}::${dueDate}`;
};

export const fetchUserEvents = async (userId) => {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeEventRow);
};

export const createEvent = async (payload) => {
  const { data, error } = await supabase.from('events').insert(payload).select('*').single();
  if (error) throw error;
  return normalizeEventRow(data);
};

export const createEventsBulk = async (payloadRows) => {
  if (!payloadRows.length) return [];
  const { data, error } = await supabase.from('events').insert(payloadRows).select('*');
  if (error) throw error;
  return (data || []).map(normalizeEventRow);
};

export const updateEvent = async (id, payload) => {
  const { data, error } = await supabase.from('events').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeEventRow(data);
};

export const deleteEvent = async (id) => {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
};

export const uploadEventAttachment = async ({ userId, eventId, file }) => {
  if (!supabase || !file || !eventId || !userId) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${eventId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('event-attachments')
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('event-attachments').getPublicUrl(path);
  return {
    attachment_path: path,
    attachment_url: data.publicUrl,
    attachment_name: file.name,
  };
};

export const createImportHistory = async (payload) => {
  const { error } = await supabase.from('imports').insert(payload);
  if (error) throw error;
};

export const fetchImportHistory = async (userId) => {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('imports')
    .select('id, file_name, total_rows, valid_rows, invalid_rows, duplicate_rows, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data || [];
};

export const getCategoryColor = (category) => byCategory[category]?.color || '#64748b';

export const getDemoWeeklyEvents = () => {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const mk = (dayOffset, hour, title, category) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return {
      id: `demo-${dayOffset}-${hour}`,
      user_id: 'demo',
      title,
      due_date: d.toISOString(),
      end_date: null,
      description: 'Demo event shown while logged out.',
      category,
      color: getCategoryColor(category),
      recurrence_rule: '',
      reminder_type: 'none',
      reminder_datetime: null,
      attachment_url: null,
      attachment_name: null,
      attachment_path: null,
      created_at: d.toISOString(),
      updated_at: d.toISOString(),
    };
  };

  return [
    mk(1, 9, 'Board Agenda Draft Due', 'reporting'),
    mk(2, 10, 'Payroll Review', 'finance'),
    mk(3, 14, 'Facilities Planning Meeting', 'operations'),
    mk(4, 11, 'Grant Compliance Deadline', 'deadline'),
  ];
};