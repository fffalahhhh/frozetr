(() => {
  "use strict";

  const STORAGE_KEY = "frozen-shake-cash-tracker-v1";
  const PARTNERS = ["Falah", "Kais", "Hussain", "Raees", "Alkama"];
  const DEFAULT_CATEGORIES = ["Shop Stock", "Shop Utilities", "Salaries", "Advance"];
  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const longDateFormatter = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });

  const $ = (selector) => document.querySelector(selector);
  const todayView = $("#todayView");
  const historyView = $("#historyView");
  const selectedDateInput = $("#selectedDate");
  const toast = $("#toast");
  let toastTimeout;
  let selectedDate = todayInKolkata();
  let activeView = "today";
  let entryType = "expense";
  let editingId = null;

  function todayInKolkata() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function freshState() {
    return {
      version: 1,
      categories: DEFAULT_CATEGORIES.map((name) => ({
        id: makeId(),
        name,
        active: true,
      })),
      records: {},
    };
  }

  function makeId() {
    return globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function validStoredState(value) {
    return value
      && value.version === 1
      && Array.isArray(value.categories)
      && value.records
      && typeof value.records === "object"
      && !Array.isArray(value.records);
  }

  function readState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return { state: freshState(), issue: "" };
      const parsed = JSON.parse(saved);
      if (!validStoredState(parsed)) {
        return {
          state: freshState(),
          issue: "Saved data could not be recognized. Existing browser data has not been changed; saving is paused to protect it.",
        };
      }
      return { state: parsed, issue: "" };
    } catch {
      return {
        state: freshState(),
        issue: "Browser storage could not be read. Existing data has not been changed; saving is paused to protect it.",
      };
    }
  }

  const loaded = readState();
  let state = loaded.state;
  let storageIssue = loaded.issue;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function persist(nextState, successMessage) {
    if (storageIssue) {
      showToast("Saving is paused because browser storage could not be read.");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      state = nextState;
      render();
      if (successMessage) showToast(successMessage);
      return true;
    } catch {
      showToast("Could not save to this browser. Check available storage and try again.");
      return false;
    }
  }

  function cloneState() {
    return JSON.parse(JSON.stringify(state));
  }

  function blankRecord(date) {
    return { date, revenue: null, expenses: [], handovers: [] };
  }

  function recordFor(date, source = state) {
    return source.records[date] || blankRecord(date);
  }

  function ensureRecord(date, source) {
    if (!source.records[date]) source.records[date] = blankRecord(date);
    return source.records[date];
  }

  function sum(items) {
    return items.reduce((total, item) => total + Number(item.amount || 0), 0);
  }

  function totalsFor(record) {
    const expenses = sum(record.expenses);
    const handovers = sum(record.handovers);
    const revenue = Number(record.revenue || 0);
    return { expenses, handovers, revenue, cash: revenue - expenses - handovers };
  }

  function money(value) {
    return currency.format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function dateAtNoon(date) {
    return new Date(`${date}T12:00:00+05:30`);
  }

  function formattedDate(date, options = { day: "numeric", month: "short", year: "numeric" }) {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(dateAtNoon(date));
  }

  function showStorageIssue() {
    const alert = $("#storageAlert");
    if (!storageIssue) {
      alert.hidden = true;
      return;
    }
    alert.textContent = storageIssue;
    alert.hidden = false;
  }

  function renderBalance(record) {
    const totals = totalsFor(record);
    $("#cashInHand").textContent = money(totals.cash);
    $("#balanceRevenue").textContent = money(totals.revenue);
    $("#balanceExpenses").textContent = money(totals.expenses);
    $("#balanceHandovers").textContent = money(totals.handovers);
    $("#balanceEquation").textContent = totals.cash < 0
      ? "Cash is below zero for this date"
      : "Revenue − expenses − handovers";
    $("#todayEyebrow").textContent = longDateFormatter.format(dateAtNoon(selectedDate)).toLocaleUpperCase("en-IN");
    $("#selectedDayChip").textContent = selectedDate === todayInKolkata()
      ? "TODAY"
      : formattedDate(selectedDate, { day: "numeric", month: "short" }).toLocaleUpperCase("en-IN");
  }

  function editDeleteButtons(type, id) {
    return `
      <div class="row-actions">
        <button class="row-action" type="button" data-action="edit" data-type="${type}" data-id="${escapeHtml(id)}" aria-label="Edit ${type}" title="Edit">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg>
        </button>
        <button class="row-action delete-action" type="button" data-action="delete" data-type="${type}" data-id="${escapeHtml(id)}" aria-label="Delete ${type}" title="Delete">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
        </button>
      </div>`;
  }

  function renderExpenseRows(record) {
    if (!record.expenses.length) {
      return '<div class="empty-list-message">No expenses recorded for this date.</div>';
    }
    return record.expenses.map((expense) => `
      <div class="entry-row">
        <span class="entry-marker" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 4v16M17 7.5c-.7-1-2-1.5-3.8-1.5-2.3 0-3.8 1.1-3.8 2.7 0 4 7.6 1.8 7.6 6 0 1.8-1.7 3.3-4.2 3.3-1.8 0-3.4-.6-4.4-1.7"/></svg>
        </span>
        <div class="entry-main">
          <div class="entry-primary">${escapeHtml(expense.categoryName || "Uncategorized")}</div>
          <div class="entry-secondary">${expense.note ? escapeHtml(expense.note) : "No note"}</div>
        </div>
        <div class="entry-trailing">
          <span class="entry-amount">${money(expense.amount)}</span>
          ${editDeleteButtons("expense", expense.id)}
        </div>
      </div>`).join("");
  }

  function renderHandoverRows(record) {
    if (!record.handovers.length) {
      return '<div class="empty-list-message">No handovers recorded for this date.</div>';
    }
    return record.handovers.map((handover) => `
      <div class="entry-row handover-row">
        <span class="entry-marker" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5M19 7a7 7 0 0 1 1 3m-15 7a7 7 0 0 1-1-3"/></svg>
        </span>
        <div class="entry-main">
          <div class="entry-primary">${escapeHtml(handover.partner || "Partner")}</div>
          <div class="entry-secondary">${handover.note ? escapeHtml(handover.note) : "No note"}</div>
        </div>
        <div class="entry-trailing">
          <span class="entry-amount">${money(handover.amount)}</span>
          ${editDeleteButtons("handover", handover.id)}
        </div>
      </div>`).join("");
  }

  function renderToday() {
    selectedDateInput.value = selectedDate;
    const record = recordFor(selectedDate);
    renderBalance(record);
    $("#revenueAmount").value = record.revenue === null ? "" : record.revenue;
    $("#revenueSaved").hidden = record.revenue === null;
    $("#expenseTotal").textContent = money(sum(record.expenses));
    $("#handoverTotal").textContent = money(sum(record.handovers));
    $("#expenseCount").textContent = `${record.expenses.length} ${record.expenses.length === 1 ? "entry" : "entries"}`;
    $("#handoverCount").textContent = `${record.handovers.length} ${record.handovers.length === 1 ? "entry" : "entries"}`;
    $("#expenseList").innerHTML = renderExpenseRows(record);
    $("#handoverList").innerHTML = renderHandoverRows(record);
    renderPartnerOverview();
  }

  function allHandovers() {
    return Object.values(state.records)
      .flatMap((record) => (record.handovers || []).map((handover) => ({ ...handover, date: record.date })))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  function renderPartnerOverview() {
    const totals = Object.fromEntries(PARTNERS.map((partner) => [partner, 0]));
    const handovers = allHandovers();
    for (const handover of handovers) {
      totals[handover.partner] = (totals[handover.partner] || 0) + Number(handover.amount || 0);
    }
    $("#partnerTotals").innerHTML = [...PARTNERS, ...Object.keys(totals).filter((partner) => !PARTNERS.includes(partner))]
      .map((partner) => `
        <div class="partner-total-item">
          <span class="partner-name"><i class="partner-dot"></i>${escapeHtml(partner)}</span>
          <span class="partner-total-value">${money(totals[partner])}</span>
        </div>`).join("");

    const recent = handovers.slice(0, 5);
    $("#recentHandovers").innerHTML = recent.length
      ? recent.map((handover) => `
          <div class="recent-row">
            <span class="recent-avatar" aria-hidden="true">${escapeHtml(String(handover.partner || "?").slice(0, 1).toUpperCase())}</span>
            <div class="recent-copy"><strong>${escapeHtml(handover.partner || "Partner")}</strong><span>${formattedDate(handover.date)}</span></div>
            <span class="recent-amount">${money(handover.amount)}</span>
          </div>`).join("")
      : '<div class="recent-empty">Recent handovers will appear here.</div>';
  }

  function hasActivity(record) {
    return record.revenue !== null || record.expenses.length > 0 || record.handovers.length > 0;
  }

  function renderHistory() {
    const days = Object.values(state.records)
      .filter(hasActivity)
      .sort((a, b) => b.date.localeCompare(a.date));
    $("#historyCount").textContent = `${days.length} ${days.length === 1 ? "recorded day" : "recorded days"}`;
    $("#historyEmpty").hidden = days.length > 0;
    $(".history-table-wrap").hidden = days.length === 0;
    $("#historyRows").innerHTML = days.map((record) => {
      const totals = totalsFor(record);
      return `
        <tr>
          <td><button class="history-date-button" type="button" data-open-date="${escapeHtml(record.date)}">${formattedDate(record.date, { day: "numeric", month: "short", year: "numeric" })}</button></td>
          <td>${record.revenue === null ? "—" : money(totals.revenue)}</td>
          <td>${money(totals.expenses)}</td>
          <td>${money(totals.handovers)}</td>
          <td class="cash-cell">${money(totals.cash)}</td>
          <td><button class="history-open-button" type="button" data-open-date="${escapeHtml(record.date)}">Open day</button></td>
        </tr>`;
    }).join("");
  }

  function render() {
    showStorageIssue();
    renderToday();
    renderHistory();
    setActiveView(activeView);
  }

  function setActiveView(view) {
    activeView = view;
    todayView.hidden = view !== "today";
    historyView.hidden = view !== "history";
    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fillEntryOptions(kind, currentId = null) {
    const categorySelect = $("#entryCategory");
    const partnerSelect = $("#entryPartner");
    const noCategories = $("#noCategoriesMessage");
    const activeCategories = state.categories.filter((category) => category.active);

    if (kind === "expense") {
      partnerSelect.disabled = true;
      categorySelect.innerHTML = activeCategories
        .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
        .join("");
      const currentExpense = currentId
        ? recordFor(selectedDate).expenses.find((expense) => expense.id === currentId)
        : null;
      if (currentExpense && !activeCategories.some((category) => category.id === currentExpense.categoryId)) {
        const archivedName = currentExpense.categoryName || "Archived category";
        categorySelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(currentExpense.categoryId || "")}">${escapeHtml(archivedName)} (archived)</option>`);
        categorySelect.value = currentExpense.categoryId || "";
      }
      noCategories.hidden = activeCategories.length > 0 || Boolean(currentExpense);
      categorySelect.disabled = activeCategories.length === 0 && !currentExpense;
    } else {
      categorySelect.disabled = true;
      noCategories.hidden = true;
      partnerSelect.disabled = false;
      partnerSelect.innerHTML = PARTNERS
        .map((partner) => `<option value="${escapeHtml(partner)}">${escapeHtml(partner)}</option>`)
        .join("");
    }
  }

  function openEntryDialog(kind, id = null) {
    entryType = kind;
    editingId = id;
    const form = $("#entryForm");
    form.reset();
    $("#entryDialogTitle").textContent = `${id ? "Edit" : "Add"} ${kind === "expense" ? "expense" : "handover"}`;
    $("#entryDialogEyebrow").textContent = kind === "expense" ? "SHOP EXPENSE" : "PARTNER CASH HANDOVER";
    $("#expenseFields").hidden = kind !== "expense";
    $("#handoverFields").hidden = kind !== "handover";
    $("#entrySubmit").textContent = `Save ${kind === "expense" ? "expense" : "handover"}`;
    fillEntryOptions(kind, id);
    const record = recordFor(selectedDate);
    const item = id
      ? (kind === "expense" ? record.expenses : record.handovers).find((entry) => entry.id === id)
      : null;
    $("#entryAmount").value = item ? item.amount : "";
    $("#entryNote").value = item?.note || "";
    if (item && kind === "expense") $("#entryCategory").value = item.categoryId || "";
    if (item && kind === "handover") $("#entryPartner").value = item.partner || PARTNERS[0];
    $("#entrySubmit").disabled = kind === "expense" && state.categories.filter((category) => category.active).length === 0 && !item;
    $("#entryDialog").showModal();
    setTimeout(() => $("#entryAmount").focus(), 0);
  }

  function amountFromInput(input, { allowZero = false } = {}) {
    const raw = input.value.trim();
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
      input.setCustomValidity(allowZero
        ? "Enter a valid amount of zero or more."
        : "Enter an amount greater than zero.");
      input.reportValidity();
      input.setCustomValidity("");
      return null;
    }
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function setRevenue(event) {
    event.preventDefault();
    const amount = amountFromInput($("#revenueAmount"), { allowZero: true });
    if (amount === null) return;
    const next = cloneState();
    ensureRecord(selectedDate, next).revenue = amount;
    persist(next, "Daily revenue saved.");
  }

  function saveEntry(event) {
    event.preventDefault();
    const amount = amountFromInput($("#entryAmount"));
    if (amount === null) return;
    const category = entryType === "expense"
      ? state.categories.find((item) => item.id === $("#entryCategory").value)
      : null;
    if (entryType === "expense" && !category && !editingId) {
      showToast("Choose an active expense category.");
      return;
    }
    if (entryType === "expense" && !category && editingId) {
      const oldEntry = recordFor(selectedDate).expenses.find((entry) => entry.id === editingId);
      if (!oldEntry || oldEntry.categoryId !== $("#entryCategory").value) {
        showToast("Choose a valid expense category.");
        return;
      }
    }

    const next = cloneState();
    const record = ensureRecord(selectedDate, next);
    const listName = entryType === "expense" ? "expenses" : "handovers";
    const list = record[listName];
    const oldIndex = editingId ? list.findIndex((entry) => entry.id === editingId) : -1;
    const oldItem = oldIndex >= 0 ? list[oldIndex] : null;
    const item = entryType === "expense"
      ? {
          id: editingId || makeId(),
          amount,
          categoryId: category?.id || oldItem?.categoryId || "",
          categoryName: category?.name || oldItem?.categoryName || "Uncategorized",
          note: $("#entryNote").value.trim(),
          createdAt: oldItem?.createdAt || new Date().toISOString(),
        }
      : {
          id: editingId || makeId(),
          amount,
          partner: $("#entryPartner").value,
          note: $("#entryNote").value.trim(),
          createdAt: oldItem?.createdAt || new Date().toISOString(),
        };

    if (oldIndex >= 0) list[oldIndex] = item;
    else list.push(item);
    if (persist(next, `${entryType === "expense" ? "Expense" : "Handover"} ${editingId ? "updated" : "saved"}.`)) {
      $("#entryDialog").close();
    }
  }

  function deleteEntry(type, id) {
    const label = type === "expense" ? "expense" : "partner handover";
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    const next = cloneState();
    const record = ensureRecord(selectedDate, next);
    const key = type === "expense" ? "expenses" : "handovers";
    record[key] = record[key].filter((entry) => entry.id !== id);
    persist(next, `${type === "expense" ? "Expense" : "Handover"} deleted.`);
  }

  function handleEntryAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, type, id } = button.dataset;
    if (action === "edit") openEntryDialog(type, id);
    if (action === "delete") deleteEntry(type, id);
  }

  function renderCategories() {
    const categories = [...state.categories].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    $("#categoryList").innerHTML = categories.length
      ? categories.map((category) => `
          <div class="category-item">
            <span class="category-item-name">${escapeHtml(category.name)}</span>
            <span class="category-item-status">${category.active ? "Active" : "Hidden"}</span>
            <button class="category-action" type="button" data-category-action="toggle" data-id="${escapeHtml(category.id)}">${category.active ? "Hide" : "Restore"}</button>
            <button class="category-action remove-category" type="button" data-category-action="remove" data-id="${escapeHtml(category.id)}">Remove</button>
          </div>`).join("")
      : '<div class="category-empty">No categories left. Add one above to record new expenses.</div>';
  }

  function addCategory(event) {
    event.preventDefault();
    const input = $("#newCategoryName");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) {
      input.setCustomValidity("Enter a category name.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    if (state.categories.some((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      input.setCustomValidity("A category with this name already exists.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    const next = cloneState();
    next.categories.push({ id: makeId(), name, active: true });
    if (persist(next, "Category added.")) {
      input.value = "";
      renderCategories();
    }
  }

  function handleCategoryAction(event) {
    const button = event.target.closest("[data-category-action]");
    if (!button) return;
    const category = state.categories.find((item) => item.id === button.dataset.id);
    if (!category) return;
    const next = cloneState();
    const target = next.categories.find((item) => item.id === button.dataset.id);
    if (button.dataset.categoryAction === "toggle") {
      target.active = !target.active;
      if (persist(next, target.active ? "Category restored." : "Category hidden.")) renderCategories();
      return;
    }
    if (!window.confirm(`Remove “${category.name}” from your category list? Past expense records will be kept.`)) return;
    next.categories = next.categories.filter((item) => item.id !== category.id);
    if (persist(next, "Category removed. Past expense records are unchanged.")) renderCategories();
  }

  function openDate(date) {
    selectedDate = date;
    setActiveView("today");
    render();
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });
  selectedDateInput.addEventListener("change", () => {
    if (!selectedDateInput.value) return;
    selectedDate = selectedDateInput.value;
    renderToday();
  });
  $("#revenueForm").addEventListener("submit", setRevenue);
  $("#addExpense").addEventListener("click", () => openEntryDialog("expense"));
  $("#addHandover").addEventListener("click", () => openEntryDialog("handover"));
  $("#expenseList").addEventListener("click", handleEntryAction);
  $("#handoverList").addEventListener("click", handleEntryAction);
  $("#entryForm").addEventListener("submit", saveEntry);
  $("#manageCategories").addEventListener("click", () => {
    renderCategories();
    $("#categoryDialog").showModal();
  });
  $("#categoryForm").addEventListener("submit", addCategory);
  $("#categoryList").addEventListener("click", handleCategoryAction);
  $("#historyRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-date]");
    if (button) openDate(button.dataset.openDate);
  });
  $("#historyToday").addEventListener("click", () => openDate(todayInKolkata()));
  $("#emptyHistoryToday").addEventListener("click", () => openDate(todayInKolkata()));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close());
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  render();
})();
