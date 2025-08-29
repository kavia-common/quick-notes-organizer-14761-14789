import './style.css'

/* global localStorage, crypto, setTimeout, clearTimeout, confirm */

/**
 * PUBLIC_INTERFACE
 * Bootstraps the Quick Notes Organizer app
 * The app provides:
 * - View all notes in a sidebar list
 * - Create, edit, delete notes
 * - Search/filter notes by title and content
 * Notes are stored in localStorage for persistence.
 */
function bootstrap() {
  const app = document.getElementById('app');
  if (!app) return;

  // Build static layout
  app.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <h1 class="brand-title">Quick Notes Organizer</h1>
      </div>
      <div class="search-container">
        <input id="searchInput" type="search" placeholder="Search notes..." aria-label="Search notes" />
      </div>
    </header>
    <main class="app-main">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Notes</span>
          <span id="noteCount" class="note-count">0</span>
        </div>
        <ul id="noteList" class="note-list" role="list"></ul>
      </aside>
      <section class="editor">
        <div class="editor-toolbar">
          <input id="noteTitle" class="title-input" type="text" placeholder="Untitled note" aria-label="Note title" />
          <div class="toolbar-actions">
            <button id="deleteBtn" class="btn btn-text danger" title="Delete note" aria-label="Delete note">Delete</button>
            <button id="saveBtn" class="btn btn-primary" title="Save note" aria-label="Save note">Save</button>
          </div>
        </div>
        <textarea id="noteBody" class="body-input" placeholder="Start typing your note..." aria-label="Note body"></textarea>
        <div class="meta">
          <span id="updatedAt" class="meta-updated" aria-live="polite"></span>
        </div>
      </section>
    </main>
    <button id="fab" class="fab" aria-label="Create new note" title="Create new note">+</button>
  `;

  // Simple state store with localStorage persistence
  const storageKey = 'qno.notes.v1';

  /**
   * @typedef {{id:string,title:string,body:string,updatedAt:number,createdAt:number}} Note
   */

  // PUBLIC_INTERFACE
  function loadNotes() {
    /** Loads notes from localStorage */
    const raw = localStorage.getItem(storageKey);
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore parse errors and fall back to empty
    }
    return [];
  }

  // PUBLIC_INTERFACE
  function saveNotes(notes) {
    /** Saves notes array to localStorage */
    localStorage.setItem(storageKey, JSON.stringify(notes));
  }

  // Utilities
  const $ = (id) => document.getElementById(id);

  // Elements
  const noteListEl = $('noteList');
  const noteTitleEl = $('noteTitle');
  const noteBodyEl = $('noteBody');
  const updatedAtEl = $('updatedAt');
  const saveBtn = $('saveBtn');
  const deleteBtn = $('deleteBtn');
  const fab = $('fab');
  const searchInput = $('searchInput');
  const noteCount = $('noteCount');

  // State
  let notes = loadNotes().sort((a, b) => b.updatedAt - a.updatedAt);
  let selectedId = notes[0]?.id || null;
  let filter = '';

  // PUBLIC_INTERFACE
  function createNote() {
    /** Creates a new empty note and selects it */
    const now = Date.now();
    const newNote = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      createdAt: now,
      updatedAt: now,
    };
    notes = [newNote, ...notes];
    selectedId = newNote.id;
    saveNotes(notes);
    render();
    focusTitle();
  }

  // PUBLIC_INTERFACE
  function deleteNote(id) {
    /** Deletes a note by id and updates selection */
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return;
    notes.splice(idx, 1);
    if (selectedId === id) {
      selectedId = notes[0]?.id || null;
    }
    saveNotes(notes);
    render();
  }

  // PUBLIC_INTERFACE
  function updateNote(id, fields) {
    /** Updates a note with the given fields and bumps updatedAt */
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return;
    notes[idx] = { ...notes[idx], ...fields, updatedAt: Date.now() };
    // Move updated note to top
    const [updated] = notes.splice(idx, 1);
    notes.unshift(updated);
    saveNotes(notes);
    renderListOnly();
    updateEditorMeta();
  }

  function currentNote() {
    return notes.find((n) => n.id === selectedId) || null;
  }

  function setSelected(id) {
    selectedId = id;
    renderEditor();
    highlightSelection();
  }

  function filteredNotes() {
    if (!filter.trim()) return notes;
    const q = filter.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q)
    );
  }

  function highlightSelection() {
    const items = noteListEl.querySelectorAll('.note-item');
    items.forEach((li) => {
      li.classList.toggle('active', li.dataset.id === selectedId);
    });
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function emptyStateMarkup() {
    return `
      <li class="note-empty" aria-live="polite">
        No notes yet. Click the + button to create one.
      </li>
    `;
  }

  function noteItemMarkup(n) {
    const preview = (n.body || '').replace(/\n+/g, ' ').slice(0, 80);
    const title = n.title || 'Untitled';
    return `
      <li class="note-item ${n.id === selectedId ? 'active' : ''}" data-id="${n.id}" tabindex="0" role="button" aria-pressed="${n.id === selectedId}">
        <div class="note-item-title">${escapeHtml(title)}</div>
        <div class="note-item-preview">${escapeHtml(preview)}</div>
        <div class="note-item-meta">${formatDate(n.updatedAt)}</div>
      </li>
    `;
  }

  function escapeHtml(s) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderListOnly() {
    const f = filteredNotes();
    noteListEl.innerHTML = f.length ? f.map(noteItemMarkup).join('') : emptyStateMarkup();
    noteCount.textContent = String(f.length);
    attachListHandlers();
  }

  function attachListHandlers() {
    const items = noteListEl.querySelectorAll('.note-item');
    items.forEach((li) => {
      const id = li.dataset.id;
      const select = () => setSelected(id);
      li.addEventListener('click', select);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });
    });
  }

  function renderEditor() {
    const n = currentNote();
    if (!n) {
      noteTitleEl.value = '';
      noteBodyEl.value = '';
      updatedAtEl.textContent = '';
      noteTitleEl.disabled = true;
      noteBodyEl.disabled = true;
      saveBtn.disabled = true;
      deleteBtn.disabled = true;
      return;
    }
    noteTitleEl.disabled = false;
    noteBodyEl.disabled = false;
    saveBtn.disabled = false;
    deleteBtn.disabled = false;

    noteTitleEl.value = n.title || '';
    noteBodyEl.value = n.body || '';
    updateEditorMeta();
  }

  function updateEditorMeta() {
    const n = currentNote();
    updatedAtEl.textContent = n ? `Last updated • ${formatDate(n.updatedAt)}` : '';
  }

  function render() {
    renderListOnly();
    renderEditor();
  }

  function focusTitle() {
    setTimeout(() => noteTitleEl?.focus(), 0);
  }

  // Event handlers
  fab.addEventListener('click', createNote);

  saveBtn.addEventListener('click', () => {
    const n = currentNote();
    if (!n) return;
    updateNote(n.id, { title: noteTitleEl.value, body: noteBodyEl.value });
  });

  deleteBtn.addEventListener('click', () => {
    const n = currentNote();
    if (!n) return;
    const confirmed = confirm('Delete this note? This action cannot be undone.');
    if (confirmed) deleteNote(n.id);
  });

  // Auto-save on input (debounced)
  let saveTimer = null;
  function queueSave() {
    const n = currentNote();
    if (!n) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      updateNote(n.id, { title: noteTitleEl.value, body: noteBodyEl.value });
    }, 400);
  }
  noteTitleEl.addEventListener('input', queueSave);
  noteBodyEl.addEventListener('input', queueSave);

  // Search/filter
  searchInput.addEventListener('input', (e) => {
    filter = e.target.value || '';
    renderListOnly();
    highlightSelection();
  });

  // Initial render
  if (!selectedId && notes.length === 0) {
    // app starts empty; user can create via FAB
  }
  render();
}

// Start app
bootstrap();
