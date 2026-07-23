(() => {
  'use strict';

  const STORAGE_KEY = 'batu-sari-pipisi-v1';
  const PAGE_SIZE = 25;
  const nowIsoDate = () => new Date().toISOString().slice(0, 10);
  const currencyFormatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
  const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

  const defaultState = {
    version: 1,
    profile: { salary: 0, salaryDate: '', onboardingDone: false },
    transactions: [],
    settings: { oled: false, haptic: true, hideBalance: false },
  };

  let state = loadState();
  let currentPage = 'home';
  let currentFilter = 'all';
  let currentSearch = '';
  let currentHistoryPage = 1;
  let sortNewestFirst = true;
  let deferredInstallPrompt = null;
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const els = {
    pageTitle: $('#pageTitle'),
    pageEyebrow: $('#pageEyebrow'),
    pages: $$('.page'),
    navItems: $$('.nav-item'),
    balanceAmount: $('#balanceAmount'),
    salaryDateLabel: $('#salaryDateLabel'),
    balanceStatus: $('#balanceStatus'),
    monthIncome: $('#monthIncome'),
    monthExpense: $('#monthExpense'),
    recentTransactions: $('#recentTransactions'),
    historyTransactions: $('#historyTransactions'),
    historySearch: $('#historySearch'),
    clearSearchButton: $('#clearSearchButton'),
    historyResultCount: $('#historyResultCount'),
    pagination: $('#pagination'),
    sortLabel: $('#sortLabel'),
    modalBackdrop: $('#modalBackdrop'),
    modalSheet: $('#modalSheet'),
    modalKicker: $('#modalKicker'),
    modalTitle: $('#modalTitle'),
    modalContent: $('#modalContent'),
    closeModalButton: $('#closeModalButton'),
    toast: $('#toast'),
    importFileInput: $('#importFileInput'),
    oledToggle: $('#oledToggle'),
    hapticToggle: $('#hapticToggle'),
    installButton: $('#installButton'),
    installDescription: $('#installDescription'),
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeState(saved);
    } catch {
      return structuredClone(defaultState);
    }
  }

  function normalizeState(raw) {
    const next = structuredClone(defaultState);
    if (!raw || typeof raw !== 'object') return next;
    next.profile.salary = validAmount(raw.profile?.salary) ? Number(raw.profile.salary) : 0;
    next.profile.salaryDate = isDateString(raw.profile?.salaryDate) ? raw.profile.salaryDate : '';
    next.profile.onboardingDone = Boolean(raw.profile?.onboardingDone);
    next.transactions = Array.isArray(raw.transactions)
      ? raw.transactions.map(normalizeTransaction).filter(Boolean)
      : [];
    next.settings.oled = Boolean(raw.settings?.oled);
    next.settings.haptic = raw.settings?.haptic !== false;
    next.settings.hideBalance = Boolean(raw.settings?.hideBalance);
    return next;
  }

  function normalizeTransaction(item) {
    if (!item || !['income', 'expense'].includes(item.type) || !validAmount(item.amount)) return null;
    return {
      id: typeof item.id === 'string' && item.id ? item.id : makeId(),
      type: item.type,
      amount: Number(item.amount),
      description: sanitizeDescription(item.description || (item.type === 'income' ? 'Kazanç' : 'Harcama')),
      date: isDateString(item.date) ? item.date : nowIsoDate(),
      createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : Date.now(),
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function validAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
  }

  function isDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  }

  function sanitizeDescription(value) {
    return String(value).replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  function makeId() {
    return crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function calculateBalance() {
    return state.transactions.reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount), state.profile.salary);
  }

  function formatMoney(value, withSign = false, type = 'income') {
    const formatted = currencyFormatter.format(Math.abs(value));
    if (!withSign) return currencyFormatter.format(value);
    return `${type === 'income' ? '+' : '−'}${formatted}`;
  }

  function formatDate(value) {
    if (!isDateString(value)) return 'Tarih yok';
    return dateFormatter.format(new Date(`${value}T12:00:00`));
  }

  function vibrate(pattern = 18) {
    if (state.settings.haptic && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(pattern);
  }

  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  function renderAll() {
    document.body.classList.toggle('oled', state.settings.oled);
    els.oledToggle.checked = state.settings.oled;
    els.hapticToggle.checked = state.settings.haptic;

    const balance = calculateBalance();
    els.balanceAmount.textContent = formatMoney(balance);
    els.balanceAmount.classList.toggle('hidden-balance', state.settings.hideBalance);
    els.salaryDateLabel.textContent = state.profile.salaryDate ? `Başlangıç: ${formatDate(state.profile.salaryDate)}` : 'Maaş tarihi ayarlanmadı';
    els.balanceStatus.textContent = balance < 0 ? 'Ekside' : balance === 0 ? 'Sıfır' : 'Aktif';

    const currentMonth = nowIsoDate().slice(0, 7);
    const monthTransactions = state.transactions.filter((tx) => tx.date.startsWith(currentMonth));
    const income = monthTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const expense = monthTransactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    els.monthIncome.textContent = formatMoney(income);
    els.monthExpense.textContent = formatMoney(expense);

    renderRecentTransactions();
    renderHistory();
  }

  function sortedTransactions(source = state.transactions) {
    return [...source].sort((a, b) => {
      const dateCompare = new Date(`${b.date}T12:00:00`) - new Date(`${a.date}T12:00:00`);
      const result = dateCompare || b.createdAt - a.createdAt;
      return sortNewestFirst ? result : -result;
    });
  }

  function renderRecentTransactions() {
    els.recentTransactions.replaceChildren();
    const recent = sortedTransactions().slice(0, 4);
    if (!recent.length) {
      els.recentTransactions.append($('#emptyStateTemplate').content.cloneNode(true));
      return;
    }
    recent.forEach((tx) => els.recentTransactions.append(createTransactionCard(tx)));
  }

  function getFilteredTransactions() {
    const needle = currentSearch.toLocaleLowerCase('tr-TR').trim().replace(',', '.').replace('₺', '');
    return sortedTransactions().filter((tx) => {
      if (currentFilter !== 'all' && tx.type !== currentFilter) return false;
      if (!needle) return true;
      const description = tx.description.toLocaleLowerCase('tr-TR');
      const numeric = String(tx.amount).replace(',', '.');
      const formatted = currencyFormatter.format(tx.amount).toLocaleLowerCase('tr-TR');
      return description.includes(needle) || numeric.includes(needle) || formatted.includes(needle);
    });
  }

  function renderHistory() {
    const filtered = getFilteredTransactions();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentHistoryPage = Math.min(currentHistoryPage, totalPages);
    const start = (currentHistoryPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    els.historyTransactions.replaceChildren();
    if (!pageItems.length) {
      const empty = $('#emptyStateTemplate').content.cloneNode(true);
      if (currentSearch || currentFilter !== 'all') {
        empty.querySelector('h3').textContent = 'Eşleşen işlem bulunamadı';
        empty.querySelector('p').textContent = 'Arama kelimesini veya filtreyi değiştirip tekrar dene.';
      }
      els.historyTransactions.append(empty);
    } else {
      pageItems.forEach((tx) => els.historyTransactions.append(createTransactionCard(tx, 'history')));
    }

    els.historyResultCount.textContent = `${filtered.length} işlem`;
    renderPagination(totalPages);
  }

  function createTransactionCard(tx, actionMode = 'menu') {
    const card = document.createElement('article');
    card.className = `transaction-card ${tx.type}${actionMode === 'history' ? ' history-actions' : ''}`;
    card.dataset.transactionId = tx.id;

    const icon = document.createElement('div');
    icon.className = 'transaction-type-icon';
    icon.innerHTML = tx.type === 'income'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';

    const main = document.createElement('div');
    main.className = 'transaction-main';
    const desc = document.createElement('p');
    desc.className = 'transaction-description';
    desc.textContent = tx.description;
    const date = document.createElement('p');
    date.className = 'transaction-date';
    date.textContent = formatDate(tx.date);
    main.append(desc, date);

    const side = document.createElement('div');
    side.className = 'transaction-side';
    const amount = document.createElement('strong');
    amount.className = 'transaction-amount';
    amount.textContent = formatMoney(tx.amount, true, tx.type);
    side.append(amount);

    if (actionMode === 'history') {
      const actions = document.createElement('div');
      actions.className = 'transaction-inline-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'transaction-action-button edit';
      edit.setAttribute('aria-label', `${tx.description} işlemini düzenle`);
      edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
      edit.addEventListener('click', () => openTransactionForm(tx.type, tx));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'transaction-action-button delete';
      remove.setAttribute('aria-label', `${tx.description} işlemini sil`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>';
      remove.addEventListener('click', () => openDeleteConfirm(tx));
      actions.append(edit, remove);
      side.append(actions);
    } else if (actionMode === 'menu') {
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'transaction-menu-button';
      menu.setAttribute('aria-label', `${tx.description} işlemini düzenle veya sil`);
      menu.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';
      menu.addEventListener('click', () => openTransactionActions(tx.id));
      side.append(menu);
    }

    card.append(icon, main, side);
    if (actionMode === 'card') card.addEventListener('click', () => openTransactionActions(tx.id));
    return card;
  }

  function renderPagination(totalPages) {
    els.pagination.replaceChildren();
    if (totalPages <= 1) return;

    const appendPageButton = (label, page, { active = false, disabled = false, icon = null } = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `page-button${active ? ' active' : ''}`;
      button.disabled = disabled;
      button.setAttribute('aria-label', label);
      button.innerHTML = icon || String(page);
      button.addEventListener('click', () => {
        currentHistoryPage = page;
        renderHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        vibrate(10);
      });
      els.pagination.append(button);
    };

    appendPageButton('Önceki sayfa', Math.max(1, currentHistoryPage - 1), {
      disabled: currentHistoryPage === 1,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    });

    const pages = paginationWindow(totalPages, currentHistoryPage);
    pages.forEach((page) => {
      if (page === '…') {
        const span = document.createElement('span');
        span.textContent = '…';
        span.style.color = 'var(--muted)';
        span.style.padding = '0 2px';
        els.pagination.append(span);
      } else {
        appendPageButton(`${page}. sayfa`, page, { active: page === currentHistoryPage });
      }
    });

    appendPageButton('Sonraki sayfa', Math.min(totalPages, currentHistoryPage + 1), {
      disabled: currentHistoryPage === totalPages,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    });
  }

  function paginationWindow(total, current) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', current - 1, current, current + 1, '…', total];
  }

  function navigate(page) {
    if (!['home', 'history', 'settings'].includes(page)) return;
    currentPage = page;
    els.pages.forEach((node) => node.classList.toggle('active', node.dataset.page === page));
    els.navItems.forEach((item) => {
      const active = item.dataset.nav === page;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    const titles = {
      home: ['Ana Sayfa', 'Kişisel cüzdan'],
      history: ['Geçmiş', 'Tüm hareketler'],
      settings: ['Ayarlar', 'Uygulama tercihleri'],
    };
    els.pageTitle.textContent = titles[page][0];
    els.pageEyebrow.textContent = titles[page][1];
    if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
    vibrate(10);
    if (page === 'history') renderHistory();
  }

  function showModal({ kicker = 'İşlem', title, content, dismissible = true }) {
    els.modalKicker.textContent = kicker;
    els.modalTitle.textContent = title;
    els.modalContent.replaceChildren();
    if (typeof content === 'string') els.modalContent.innerHTML = content; else els.modalContent.append(content);
    els.closeModalButton.hidden = !dismissible;
    els.modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const target = els.modalContent.querySelector('input:not([type="hidden"]), textarea, button');
      target?.focus({ preventScroll: true });
    });
  }

  function closeModal(force = false) {
    if (els.closeModalButton.hidden && !force) return;
    els.modalBackdrop.hidden = true;
    document.body.style.overflow = '';
    els.modalContent.replaceChildren();
  }

  function createField(label, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field-label';
    const span = document.createElement('span');
    span.textContent = label;
    wrapper.append(span, control);
    return wrapper;
  }

  function moneyInput(value = '') {
    const wrap = document.createElement('div');
    wrap.className = 'money-field-wrap';
    const prefix = document.createElement('span');
    prefix.className = 'money-prefix';
    prefix.textContent = '₺';
    const input = document.createElement('input');
    input.className = 'field-control money-input';
    input.type = 'number';
    input.inputMode = 'decimal';
    input.min = '0.01';
    input.step = '0.01';
    input.placeholder = '0,00';
    input.value = value;
    input.required = true;
    wrap.append(prefix, input);
    return { wrap, input };
  }

  function openOnboarding() {
    const form = document.createElement('form');
    form.className = 'form-stack';
    const intro = document.createElement('p');
    intro.className = 'onboarding-copy';
    intro.textContent = "Merhaba değerli Batu'nun Sarı Pipisi Banka kullanıcısı. Başlamak için aldığın maaşı ve maaşı aldığın tarihi kaydet.";
    const money = moneyInput();
    const date = document.createElement('input');
    date.className = 'field-control';
    date.type = 'date';
    date.value = nowIsoDate();
    date.required = true;
    const hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = 'Uygulamayı maaşı aldıktan sonra keşfettiysen eski tarihi seçebilirsin.';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary-button';
    submit.textContent = 'Başla ve kaydet';
    form.append(intro, createField('Aldığın maaş', money.wrap), createField('Maaşı hangi tarihte aldın?', date), hint, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const amount = Number(money.input.value);
      if (!Number.isFinite(amount) || amount <= 0 || !isDateString(date.value)) {
        toast('Geçerli maaş ve tarih gir');
        return;
      }
      state.profile = { salary: amount, salaryDate: date.value, onboardingDone: true };
      saveState();
      closeModal(true);
      renderAll();
      toast('Maaş bakiyesi hazır');
      vibrate([18, 40, 24]);
    });
    showModal({ kicker: 'Hoş geldin', title: 'Maaşını kaydet', content: form, dismissible: false });
  }

  function openSalaryEditor() {
    const form = document.createElement('form');
    form.className = 'form-stack';
    const money = moneyInput(state.profile.salary || '');
    const date = document.createElement('input');
    date.className = 'field-control';
    date.type = 'date';
    date.value = state.profile.salaryDate || nowIsoDate();
    const hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = 'Bu alan yalnızca başlangıç maaşını değiştirir. Sonraki işlemlere dokunulmaz.';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary-button';
    submit.textContent = 'Maaşı güncelle';
    form.append(createField('Başlangıç maaşı', money.wrap), createField('Maaş tarihi', date), hint, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const amount = Number(money.input.value);
      if (!Number.isFinite(amount) || amount < 0 || !isDateString(date.value)) return toast('Geçerli değerler gir');
      state.profile.salary = amount;
      state.profile.salaryDate = date.value;
      saveState();
      closeModal();
      renderAll();
      toast('Maaş güncellendi');
    });
    showModal({ kicker: 'Bakiye', title: 'Maaşı düzenle', content: form });
  }

  function openTransactionForm(type, transaction = null) {
    const isEdit = Boolean(transaction);
    const form = document.createElement('form');
    form.className = 'form-stack';
    const money = moneyInput(transaction?.amount ?? '');
    const description = document.createElement('textarea');
    description.className = 'field-control';
    description.maxLength = 140;
    description.placeholder = type === 'expense' ? 'Örn: Market alışverişi' : 'Örn: Ek iş ödemesi';
    description.value = transaction?.description ?? '';
    description.required = true;
    const date = document.createElement('input');
    date.className = 'field-control';
    date.type = 'date';
    date.value = transaction?.date ?? nowIsoDate();
    date.required = true;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary-button';
    submit.textContent = isEdit ? 'Değişiklikleri kaydet' : type === 'expense' ? 'Harcamayı kaydet' : 'Kazancı kaydet';
    form.append(
      createField(type === 'expense' ? 'Ne kadar harcadın?' : 'Ne kadar para kazandın?', money.wrap),
      createField('Açıklama', description),
      createField('İşlem tarihi', date),
      submit,
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const amount = Number(money.input.value);
      const cleanedDescription = sanitizeDescription(description.value);
      if (!Number.isFinite(amount) || amount <= 0) return toast('Tutar 0’dan büyük olmalı');
      if (!cleanedDescription) return toast('Bir açıklama gir');
      if (!isDateString(date.value)) return toast('Geçerli tarih seç');

      if (isEdit) {
        const index = state.transactions.findIndex((tx) => tx.id === transaction.id);
        if (index >= 0) state.transactions[index] = { ...transaction, type, amount, description: cleanedDescription, date: date.value, updatedAt: Date.now() };
      } else {
        state.transactions.push({ id: makeId(), type, amount, description: cleanedDescription, date: date.value, createdAt: Date.now(), updatedAt: Date.now() });
      }
      saveState();
      closeModal();
      currentHistoryPage = 1;
      renderAll();
      toast(isEdit ? 'İşlem güncellendi' : type === 'expense' ? 'Harcama eklendi' : 'Kazanç eklendi');
      vibrate([16, 35, 20]);
    });
    showModal({ kicker: isEdit ? 'Düzenleme' : type === 'expense' ? 'Eksi işlem' : 'Artı işlem', title: isEdit ? 'İşlemi düzenle' : type === 'expense' ? 'Yeni harcama' : 'Yeni kazanç', content: form });
  }

  function openTransactionActions(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    const list = document.createElement('div');
    list.className = 'action-sheet-list';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'action-sheet-button';
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>İşlemi düzenle</span>';
    edit.addEventListener('click', () => openTransactionForm(tx.type, tx));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'action-sheet-button danger';
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg><span>İşlemi sil</span>';
    remove.addEventListener('click', () => openDeleteConfirm(tx));
    list.append(edit, remove);
    showModal({ kicker: formatDate(tx.date), title: tx.description, content: list });
  }

  function openDeleteConfirm(tx) {
    const wrap = document.createElement('div');
    const copy = document.createElement('div');
    copy.className = 'confirm-copy';
    const p = document.createElement('p');
    p.textContent = `${formatMoney(tx.amount)} tutarındaki “${tx.description}” işlemi kalıcı olarak silinsin mi?`;
    copy.append(p);
    const row = document.createElement('div');
    row.className = 'button-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary-button';
    cancel.textContent = 'Vazgeç';
    cancel.addEventListener('click', closeModal);
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'danger-button';
    confirm.textContent = 'Evet, sil';
    confirm.addEventListener('click', () => {
      state.transactions = state.transactions.filter((item) => item.id !== tx.id);
      saveState();
      closeModal();
      renderAll();
      toast('İşlem silindi');
      vibrate(28);
    });
    row.append(cancel, confirm);
    wrap.append(copy, row);
    showModal({ kicker: 'Onay gerekli', title: 'Emin misin?', content: wrap });
  }

  function exportJson() {
    const payload = {
      app: "Batu'nun Sarı Pipisi",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      transactions: state.transactions,
      settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gecmis-${nowIsoDate()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('gecmis.json indirildi');
    vibrate(18);
  }

  function fingerprint(tx) {
    return [tx.type, Number(tx.amount).toFixed(2), tx.date, tx.description.toLocaleLowerCase('tr-TR')].join('|');
  }

  async function importJson(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const incomingRaw = Array.isArray(parsed) ? parsed : parsed.transactions;
      if (!Array.isArray(incomingRaw)) throw new Error('İşlem listesi bulunamadı');
      const incoming = incomingRaw.map(normalizeTransaction).filter(Boolean);
      const existingIds = new Set(state.transactions.map((tx) => tx.id));
      const existingFingerprints = new Set(state.transactions.map(fingerprint));
      let imported = 0;
      let skipped = 0;

      incoming.forEach((tx) => {
        const fp = fingerprint(tx);
        if (existingIds.has(tx.id) || existingFingerprints.has(fp)) {
          skipped += 1;
          return;
        }
        state.transactions.push(tx);
        existingIds.add(tx.id);
        existingFingerprints.add(fp);
        imported += 1;
      });

      saveState();
      renderAll();
      showImportSummary(imported, skipped);
      vibrate([16, 30, 20]);
    } catch (error) {
      toast(`Dosya okunamadı: ${error.message}`);
    } finally {
      els.importFileInput.value = '';
    }
  }

  function showImportSummary(imported, skipped) {
    const wrap = document.createElement('div');
    const stats = document.createElement('div');
    stats.className = 'import-summary';
    const importedCard = document.createElement('div');
    importedCard.className = 'import-stat';
    importedCard.innerHTML = `<strong>${imported}</strong><small>Yeni işlem eklendi</small>`;
    const skippedCard = document.createElement('div');
    skippedCard.className = 'import-stat';
    skippedCard.innerHTML = `<strong>${skipped}</strong><small>Çakışan işlem atlandı</small>`;
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'primary-button';
    done.textContent = 'Tamam';
    done.addEventListener('click', closeModal);
    stats.append(importedCard, skippedCard);
    wrap.append(stats, done);
    showModal({ kicker: 'Birleştirme tamamlandı', title: 'Geçmiş yüklendi', content: wrap });
  }

  function openResetConfirm() {
    const wrap = document.createElement('div');
    const copy = document.createElement('div');
    copy.className = 'confirm-copy';
    const p = document.createElement('p');
    p.textContent = 'Başlangıç maaşı, ayarlar ve bütün işlem geçmişi bu cihazdan kalıcı olarak silinecek. Bu işlem geri alınamaz.';
    copy.append(p);
    const row = document.createElement('div');
    row.className = 'button-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary-button';
    cancel.textContent = 'Vazgeç';
    cancel.addEventListener('click', closeModal);
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'danger-button';
    confirm.textContent = 'Her şeyi sil';
    confirm.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      state = structuredClone(defaultState);
      closeModal(true);
      renderAll();
      openOnboarding();
    });
    row.append(cancel, confirm);
    wrap.append(copy, row);
    showModal({ kicker: 'Tehlikeli işlem', title: 'Tüm veriler silinsin mi?', content: wrap });
  }

  async function handleInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') toast('Uygulama kuruluyor');
      deferredInstallPrompt = null;
      updateInstallState();
      return;
    }
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const copy = document.createElement('div');
    copy.className = 'confirm-copy';
    const p = document.createElement('p');
    p.textContent = isiOS
      ? 'Safari’de Paylaş simgesine dokun, ardından “Ana Ekrana Ekle” seçeneğini seç.'
      : 'Tarayıcı menüsünü açıp “Uygulamayı yükle” veya “Ana ekrana ekle” seçeneğini seç.';
    copy.append(p);
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'primary-button';
    done.textContent = 'Anladım';
    done.addEventListener('click', closeModal);
    const wrap = document.createElement('div');
    wrap.append(copy, done);
    showModal({ kicker: 'PWA kurulumu', title: 'Ana ekrana ekle', content: wrap });
  }

  function updateInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) {
      els.installDescription.textContent = 'Uygulama zaten kurulu';
      els.installButton.disabled = true;
      els.installButton.style.opacity = '.58';
    } else {
      els.installDescription.textContent = deferredInstallPrompt ? 'Tek dokunuşla PWA olarak kur' : 'PWA olarak kur';
    }
  }

  function bindEvents() {
    els.navItems.forEach((item) => item.addEventListener('click', () => navigate(item.dataset.nav)));
    $$('[data-nav-target]').forEach((item) => item.addEventListener('click', () => navigate(item.dataset.navTarget)));
    $('#expenseButton').addEventListener('click', () => openTransactionForm('expense'));
    $('#incomeButton').addEventListener('click', () => openTransactionForm('income'));
    $('#editSalaryButton').addEventListener('click', openSalaryEditor);
    $('#privacyButton').addEventListener('click', () => {
      state.settings.hideBalance = !state.settings.hideBalance;
      saveState();
      renderAll();
      toast(state.settings.hideBalance ? 'Bakiye gizlendi' : 'Bakiye gösteriliyor');
    });
    els.closeModalButton.addEventListener('click', closeModal);
    els.modalBackdrop.addEventListener('click', (event) => {
      if (event.target === els.modalBackdrop) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.modalBackdrop.hidden) closeModal();
    });

    els.historySearch.addEventListener('input', () => {
      currentSearch = els.historySearch.value;
      els.clearSearchButton.hidden = !currentSearch;
      currentHistoryPage = 1;
      renderHistory();
    });
    els.clearSearchButton.addEventListener('click', () => {
      els.historySearch.value = '';
      currentSearch = '';
      els.clearSearchButton.hidden = true;
      currentHistoryPage = 1;
      renderHistory();
      els.historySearch.focus();
    });
    $$('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      $$('.filter-chip').forEach((item) => item.classList.toggle('active', item === chip));
      currentHistoryPage = 1;
      renderHistory();
      vibrate(10);
    }));
    $('#sortButton').addEventListener('click', () => {
      sortNewestFirst = !sortNewestFirst;
      els.sortLabel.textContent = sortNewestFirst ? 'En yeni' : 'En eski';
      renderAll();
      vibrate(10);
    });

    $('#exportButton').addEventListener('click', exportJson);
    $('#importButton').addEventListener('click', () => els.importFileInput.click());
    els.importFileInput.addEventListener('change', () => {
      const file = els.importFileInput.files?.[0];
      if (file) importJson(file);
    });
    els.oledToggle.addEventListener('change', () => {
      state.settings.oled = els.oledToggle.checked;
      saveState();
      renderAll();
      vibrate(10);
    });
    els.hapticToggle.addEventListener('change', () => {
      state.settings.haptic = els.hapticToggle.checked;
      saveState();
      renderAll();
      vibrate(16);
    });
    els.installButton.addEventListener('click', handleInstall);
    $('#resetButton').addEventListener('click', openResetConfirm);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallState();
    });
    window.addEventListener('hashchange', () => {
      const requested = location.hash.slice(1);
      if (['home', 'history', 'settings'].includes(requested) && requested !== currentPage) navigate(requested);
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateInstallState();
      toast('Uygulama kuruldu');
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  bindEvents();
  renderAll();
  const initialPage = ['home', 'history', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  navigate(initialPage);
  updateInstallState();
  registerServiceWorker();
  if (!state.profile.onboardingDone) setTimeout(openOnboarding, 220);
})();
