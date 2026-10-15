async function apiJSON(url, options = {}) {
    const r = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || d.error || `Request failed (${r.status})`);
    return d;
}

const escHTML = v =>
    String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);

const money = value =>
    Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });

const form = document.getElementById("categoryForm");
const formTitle = document.getElementById("categoryFormTitle");
const nameInput = document.getElementById("categoryName");
const descInput = document.getElementById("categoryDescription");
const saveBtn = document.getElementById("saveCategory");
const cancelBtn = document.getElementById("cancelCategory");
const message = document.getElementById("categoryMessage");
const body = document.getElementById("categoriesBody");
const search = document.getElementById("categorySearch");
const summary = document.getElementById("categorySummary");
const refreshBtn = document.getElementById("refreshCategories");
const categoryCardsGrid = document.getElementById("categoryCardsGrid");

const deleteModal = document.getElementById("deleteCategoryModal");
const deleteCatName = document.getElementById("deleteCatName");
const cancelDeleteCatBtn = document.getElementById("cancelDeleteCatBtn");
const confirmDeleteCatBtn = document.getElementById("confirmDeleteCatBtn");
const closeDeleteCatModal = document.getElementById("closeDeleteCatModal");

let categories = [];
let editingId = null;
let pendingDeleteId = null;

function getCategoryIcon(name) {
    const lower = String(name || "").toLowerCase().trim();
    if (lower.includes("electr")) return "/images/categories/electronics.svg";
    if (lower.includes("access")) return "/images/categories/accessories.svg";
    if (lower.includes("equip") || lower.includes("office")) return "/images/categories/office-equipment.svg";
    if (lower.includes("stat") || lower.includes("paper")) return "/images/categories/stationery.svg";
    if (lower.includes("furn") || lower.includes("chair") || lower.includes("desk")) return "/images/categories/furniture.svg";
    if (lower.includes("bag")) return "/images/categories/bags.svg";
    if (lower.includes("netw") || lower.includes("cable")) return "/images/categories/networking.svg";
    return "/images/categories/accessories.svg";
}

function say(text, type = "") {
    if (!message) return;
    message.textContent = text;
    message.className = type ? `notice ${type} show` : "notice";
    message.style.display = text ? "block" : "none";
}

async function loadMetrics() {
    try {
        const stats = await apiJSON("/api/categories-summary");
        document.getElementById("totalCategories").textContent = Number(stats.total_categories || 0).toLocaleString("en-IN");
        document.getElementById("categorizedProducts").textContent = Number(stats.assigned_products || 0).toLocaleString("en-IN");
        document.getElementById("categorizedValue").textContent = money(stats.total_inventory_value || 0);
    } catch (e) {
        console.warn("Could not load summary metrics:", e);
    }
}

async function loadCategories() {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Loading categories...</td></tr>';
    try {
        categories = await apiJSON("/api/categories");
        render();
        loadMetrics();
    } catch (err) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">Could not load categories.</td></tr>';
        say(err.message, "error");
    }
}

function render() {
    const q = (search.value || "").trim().toLowerCase();
    const filtered = categories.filter(c =>
        c.category_name.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
    );

    summary.textContent = `Showing ${filtered.length} of ${categories.length} categories`;

    // 1. Render Table Rows
    if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">No categories found matching your query.</td></tr>';
    } else {
        body.innerHTML = filtered.map(c => {
            const iconUrl = getCategoryIcon(c.category_name);
            const pCount = Number(c.product_count || 0);
            const val = Number(c.total_value || 0);

            return `
                <tr>
                    <td><strong>#${c.category_id}</strong></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <img src="${iconUrl}" style="width:36px; height:36px; border-radius:8px;" alt="${escHTML(c.category_name)}">
                            <strong style="font-size:14px;">${escHTML(c.category_name)}</strong>
                        </div>
                    </td>
                    <td><span style="color: var(--text-muted);">${escHTML(c.description || "—")}</span></td>
                    <td>
                        <a href="/products.html" class="category-badge" title="Filter products">
                            ${pCount} product${pCount === 1 ? '' : 's'}
                        </a>
                    </td>
                    <td><strong>${money(val)}</strong></td>
                    <td style="text-align: right;">
                        <div class="inline-actions" style="justify-content: flex-end;">
                            <button class="action-button edit" data-action="edit" data-id="${c.category_id}">Edit</button>
                            <button class="action-button delete" data-action="delete" data-id="${c.category_id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // 2. Render Visual Cards Grid
    if (categoryCardsGrid) {
        if (!categories.length) {
            categoryCardsGrid.innerHTML = '<div class="empty-state">No categories configured yet.</div>';
        } else {
            categoryCardsGrid.innerHTML = categories.map(c => {
                const iconUrl = getCategoryIcon(c.category_name);
                const pCount = Number(c.product_count || 0);
                const tStock = Number(c.total_stock || 0);
                const val = Number(c.total_value || 0);

                return `
                    <div class="category-card">
                        <div class="category-card-top">
                            <div class="category-icon-box">
                                <img src="${iconUrl}" alt="${escHTML(c.category_name)}">
                            </div>
                            <div class="category-card-info">
                                <h3>${escHTML(c.category_name)}</h3>
                                <p>${escHTML(c.description || "General warehouse category")}</p>
                            </div>
                        </div>
                        <div class="category-card-stats">
                            <div>
                                <small style="display:block; color:var(--text-muted);">Catalog</small>
                                <strong>${pCount} Products</strong>
                            </div>
                            <div>
                                <small style="display:block; color:var(--text-muted);">Volume</small>
                                <strong>${tStock} Units</strong>
                            </div>
                            <div style="text-align:right;">
                                <small style="display:block; color:var(--text-muted);">Valuation</small>
                                <strong style="color:var(--blue);">${money(val)}</strong>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }
}

// ================= FORM ACTIONS =================
form.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = {
        category_name: nameInput.value.trim(),
        description: descInput.value.trim()
    };

    saveBtn.disabled = true;
    saveBtn.textContent = editingId ? "Updating..." : "Saving...";

    try {
        if (editingId) {
            await apiJSON(`/api/categories/${editingId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            say("Category updated successfully.", "success");
        } else {
            await apiJSON("/api/categories", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            say("Category created successfully.", "success");
        }

        resetForm();
        await loadCategories();
    } catch (err) {
        say(err.message, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editingId ? "Save Changes" : "＋ Save Category";
    }
});

function startEdit(id) {
    const c = categories.find(item => Number(item.category_id) === Number(id));
    if (!c) return;

    editingId = Number(id);
    nameInput.value = c.category_name;
    descInput.value = c.description || "";
    formTitle.textContent = `Edit Category #${c.category_id}`;
    saveBtn.textContent = "Save Changes";
    cancelBtn.hidden = false;
    form.scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
    editingId = null;
    form.reset();
    formTitle.textContent = "Create New Category";
    saveBtn.textContent = "＋ Save Category";
    cancelBtn.hidden = true;
}

cancelBtn.addEventListener("click", resetForm);

// ================= DELETE CONFIRMATION MODAL =================
function openDeleteCatDialog(id) {
    const cat = categories.find(c => Number(c.category_id) === Number(id));
    if (!cat) return;

    pendingDeleteId = id;
    deleteCatName.textContent = cat.category_name;
    deleteModal.classList.add("open");
}

function closeDeleteCatDialog() {
    pendingDeleteId = null;
    deleteModal.classList.remove("open");
}

if (cancelDeleteCatBtn) cancelDeleteCatBtn.addEventListener("click", closeDeleteCatDialog);
if (closeDeleteCatModal) closeDeleteCatModal.addEventListener("click", closeDeleteCatDialog);

if (confirmDeleteCatBtn) {
    confirmDeleteCatBtn.addEventListener("click", async () => {
        if (!pendingDeleteId) return;
        confirmDeleteCatBtn.disabled = true;
        confirmDeleteCatBtn.textContent = "Deleting...";

        try {
            await apiJSON(`/api/categories/${pendingDeleteId}`, { method: "DELETE" });
            closeDeleteCatDialog();
            say("Category deleted successfully.", "success");
            await loadCategories();
        } catch (err) {
            say(err.message, "error");
        } finally {
            confirmDeleteCatBtn.disabled = false;
            confirmDeleteCatBtn.textContent = "Delete Category";
        }
    });
}

document.addEventListener("click", e => {
    const target = e.target.closest("button[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");

    if (action === "edit") {
        startEdit(id);
    } else if (action === "delete") {
        openDeleteCatDialog(id);
    }
});

search.addEventListener("input", render);
refreshBtn.addEventListener("click", loadCategories);

document.addEventListener("DOMContentLoaded", () => {
    const todayEl = document.getElementById("today");
    if (todayEl) {
        todayEl.textContent = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }
    loadCategories();
});
