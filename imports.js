import { getSession } from './auth.js';
import {
  createEventsBulk,
  createImportHistory,
  fetchImportHistory,
  fetchUserEvents,
  getCategoryColor,
  makeDuplicateSignature,
} from './events.js';

const normalizeHeader = (header) =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Customize these aliases later if districts use different spreadsheet headers.
const COLUMN_ALIASES = {
  title: ['title', 'eventtitle', 'task', 'name', 'item', 'subject'],
  due_date: ['duedate', 'due', 'date', 'datetime', 'eventdate', 'dueon'],
  description: ['description', 'details', 'notes', 'comment'],
  category: ['category', 'type', 'group'],
  reminder_datetime: ['reminder', 'reminderdatetime', 'reminderdate', 'alertdate', 'alert'],
};

const findColumnKey = (headers, aliases) => {
  const normalized = headers.map((h) => normalizeHeader(h));
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return headers[index];
  }
  return null;
};

const safeDateIso = (value) => {
  if (!value && value !== 0) return null;

  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const derivedTitle = (rowIndex, category, dueDateIso) => {
  const categoryLabel = category || 'General';
  const dateLabel = dueDateIso ? new Date(dueDateIso).toLocaleDateString() : 'Unscheduled';
  return `${categoryLabel} Item #${rowIndex + 1} (${dateLabel})`;
};

const parseRowsToPreview = (rows, existingSignatures = new Set()) => {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const titleKey = findColumnKey(headers, COLUMN_ALIASES.title);
  const dueDateKey = findColumnKey(headers, COLUMN_ALIASES.due_date);
  const descriptionKey = findColumnKey(headers, COLUMN_ALIASES.description);
  const categoryKey = findColumnKey(headers, COLUMN_ALIASES.category);
  const reminderKey = findColumnKey(headers, COLUMN_ALIASES.reminder_datetime);

  const fileSignatures = new Set();

  return rows.map((row, index) => {
    const dueDateIso = safeDateIso(row[dueDateKey]);
    const reminderIso = safeDateIso(row[reminderKey]);
    const category = String(row[categoryKey] || 'other').trim().toLowerCase() || 'other';

    const normalized = {
      title: String(row[titleKey] || '').trim() || derivedTitle(index, category, dueDateIso),
      due_date: dueDateIso,
      end_date: null,
      description: String(row[descriptionKey] || '').trim(),
      category,
      color: getCategoryColor(category),
      reminder_type: reminderIso ? 'in_app' : 'none',
      reminder_datetime: reminderIso,
      recurrence_rule: '',
    };

    const reasons = [];
    let statusType = 'valid';

    if (!dueDateIso) reasons.push('Invalid or missing due date');

    const signature = makeDuplicateSignature(normalized);
    if (dueDateIso && existingSignatures.has(signature)) {
      reasons.push('Duplicate of an existing event');
      statusType = 'duplicate';
    }

    if (dueDateIso && fileSignatures.has(signature)) {
      reasons.push('Duplicate row in uploaded file');
      statusType = 'duplicate';
    }

    fileSignatures.add(signature);

    if (reasons.some((r) => r.includes('Invalid'))) statusType = 'invalid';

    return {
      sourceRowNumber: index + 2,
      normalized,
      statusType,
      isValid: reasons.length === 0,
      reasons,
    };
  });
};

const renderPreview = (previewRows) => {
  const body = document.getElementById('import-preview-body');
  const status = document.getElementById('import-summary');
  if (!body || !status) return;

  const validCount = previewRows.filter((r) => r.isValid).length;
  const duplicateCount = previewRows.filter((r) => r.statusType === 'duplicate').length;
  const invalidCount = previewRows.filter((r) => r.statusType === 'invalid').length;

  status.textContent = `Rows parsed: ${previewRows.length}. Added: ${validCount}. Duplicates skipped: ${duplicateCount}. Invalid skipped: ${invalidCount}.`;

  if (!previewRows.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">No rows parsed.</td></tr>';
    return;
  }

  body.innerHTML = previewRows
    .slice(0, 300)
    .map(
      (row) => `
      <tr class="${row.statusType === 'duplicate' ? 'row-duplicate' : ''} ${row.statusType === 'invalid' ? 'row-error' : ''}">
        <td>${row.sourceRowNumber}</td>
        <td>${row.normalized.title}</td>
        <td>${row.normalized.due_date ? new Date(row.normalized.due_date).toLocaleString() : '—'}</td>
        <td>${row.normalized.category}</td>
        <td>${row.normalized.reminder_datetime ? new Date(row.normalized.reminder_datetime).toLocaleString() : '—'}</td>
        <td>${row.isValid ? '<span class="status-badge status-success">Will import</span>' : row.reasons.join('; ')}</td>
      </tr>
    `,
    )
    .join('');
};

const renderHistory = async () => {
  const historyBody = document.getElementById('import-history-body');
  if (!historyBody) return;

  const session = await getSession();
  if (!session?.user?.id) {
    historyBody.innerHTML = '<tr><td colspan="7" class="muted">Sign in to view import history.</td></tr>';
    return;
  }

  try {
    const rows = await fetchImportHistory(session.user.id);
    if (!rows.length) {
      historyBody.innerHTML = '<tr><td colspan="7" class="muted">No imports yet.</td></tr>';
      return;
    }

    const statusBadge = (status) => {
      if (status === 'success') return '<span class="status-badge status-success">Success</span>';
      if (status === 'partial_success') return '<span class="status-badge status-warning">Partial</span>';
      return '<span class="status-badge status-error">Failed</span>';
    };

    historyBody.innerHTML = rows
      .map(
        (row) => `
        <tr>
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td>${row.file_name}</td>
          <td>${row.total_rows}</td>
          <td>${row.valid_rows}</td>
          <td>${row.duplicate_rows || 0}</td>
          <td>${row.invalid_rows}</td>
          <td>${statusBadge(row.status)}</td>
        </tr>
      `,
      )
      .join('');
  } catch (error) {
    historyBody.innerHTML = `<tr><td colspan="7" class="alert error">${error.message}</td></tr>`;
  }
};

const downloadTemplate = () => {
  if (!window.XLSX) {
    window.alert('SheetJS failed to load. Please refresh and try again.');
    return;
  }

  const wb = window.XLSX.utils.book_new();
  const rows = [
    {
      Title: 'Board Agenda Draft Due',
      'Due Date': '2026-09-10 09:00',
      Description: 'Prepare and circulate draft agenda.',
      Category: 'reporting',
      'Reminder Date/Time': '2026-09-09 16:00',
    },
    {
      Title: 'Payroll Review',
      'Due Date': '2026-09-12 10:30',
      Description: 'Verify payroll exports before submission.',
      Category: 'finance',
      'Reminder Date/Time': '2026-09-12 08:00',
    },
  ];

  const ws = window.XLSX.utils.json_to_sheet(rows);
  window.XLSX.utils.book_append_sheet(wb, ws, 'Events');
  window.XLSX.writeFile(wb, 'clerk-calendar-import-template.xlsx');
};

export const initExcelImport = ({ onImportComplete }) => {
  const fileInput = document.getElementById('excel-file-input');
  const parseBtn = document.getElementById('parse-excel-btn');
  const importBtn = document.getElementById('confirm-import-btn');
  const templateBtn = document.getElementById('download-template-btn');
  const message = document.getElementById('import-feedback');

  if (!fileInput || !parseBtn || !importBtn || !templateBtn || !message) return;

  let previewRows = [];
  let sourceFileName = '';

  const setMessage = (text, type = 'success') => {
    message.textContent = text;
    message.className = `alert ${type === 'error' ? 'error' : 'success'}`;
  };

  templateBtn.addEventListener('click', downloadTemplate);

  parseBtn.addEventListener('click', async () => {
    if (!fileInput.files?.length) {
      setMessage('Select a .xlsx file first.', 'error');
      return;
    }

    if (!window.XLSX) {
      setMessage('SheetJS did not load. Please refresh.', 'error');
      return;
    }

    const file = fileInput.files[0];
    sourceFileName = file.name;

    try {
      const session = await getSession();
      const existing = session?.user?.id ? await fetchUserEvents(session.user.id) : [];
      const existingSignatures = new Set(existing.map(makeDuplicateSignature));

      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      previewRows = parseRowsToPreview(rows, existingSignatures);
      renderPreview(previewRows);

      const addCount = previewRows.filter((r) => r.isValid).length;
      const duplicateCount = previewRows.filter((r) => r.statusType === 'duplicate').length;
      const invalidCount = previewRows.filter((r) => r.statusType === 'invalid').length;

      importBtn.disabled = addCount === 0;
      setMessage(
        addCount
          ? `Preview ready. Add: ${addCount}. Duplicates: ${duplicateCount}. Invalid: ${invalidCount}.`
          : 'No importable rows found. Review duplicates/invalid rows in preview.',
        addCount ? 'success' : 'error',
      );
    } catch (error) {
      setMessage(`Unable to parse spreadsheet: ${error.message}`, 'error');
    }
  });

  importBtn.addEventListener('click', async () => {
    const session = await getSession();
    if (!session?.user?.id) {
      setMessage('You must be logged in to import events.', 'error');
      return;
    }

    const validRows = previewRows.filter((row) => row.isValid);
    const duplicateRows = previewRows.filter((row) => row.statusType === 'duplicate');
    const invalidRows = previewRows.filter((row) => row.statusType === 'invalid');

    if (!validRows.length) {
      setMessage('No valid rows to import.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Add ${validRows.length} events? Duplicates skipped: ${duplicateRows.length}. Invalid skipped: ${invalidRows.length}.`,
    );
    if (!confirmed) return;

    try {
      const payload = validRows.map((row) => ({
        ...row.normalized,
        user_id: session.user.id,
      }));

      await createEventsBulk(payload);

      await createImportHistory({
        user_id: session.user.id,
        file_name: sourceFileName || 'uploaded.xlsx',
        total_rows: previewRows.length,
        valid_rows: validRows.length,
        duplicate_rows: duplicateRows.length,
        invalid_rows: invalidRows.length,
        status: duplicateRows.length || invalidRows.length ? 'partial_success' : 'success',
        error_details: duplicateRows.length || invalidRows.length
          ? JSON.stringify(
              [...duplicateRows, ...invalidRows].map((row) => ({
                row: row.sourceRowNumber,
                reasons: row.reasons,
              })),
            )
          : null,
      });

      setMessage(
        `Import complete. Added ${validRows.length} event(s). Duplicates skipped: ${duplicateRows.length}. Invalid skipped: ${invalidRows.length}.`,
      );
      await renderHistory();
      if (onImportComplete) await onImportComplete();
    } catch (error) {
      setMessage(`Import failed: ${error.message}`, 'error');
    }
  });

  renderHistory();
};