const form = document.getElementById("productForm");
const productsBody = document.getElementById("productsBody");
const gridViewWrap = document.getElementById("gridViewWrap");
const tableViewWrap = document.getElementById("tableViewWrap");
const viewTableBtn = document.getElementById("viewTableBtn");
const viewGridBtn = document.getElementById("viewGridBtn");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const stockFilter = document.getElementById("stockFilter");
const sortFilter = document.getElementById("sortFilter");
const refreshButton = document.getElementById("refreshButton");
const exportCsvBtn = document.getElementById("exportCsvBtn");

const formMessage = document.getElementById("formMessage");
const pageMessage = document.getElementById("pageMessage");
const formTitle = document.getElementById("formTitle");
const saveButton = document.getElementById("saveButton");
const cancelEdit = document.getElementById("cancelEdit");

const imageUrlInput = document.getElementById("imageUrlInput");
const imagePreview = document.getElementById("imagePreview");
const galleryStrip = document.getElementById("galleryStrip");

const deleteModal = document.getElementById("deleteModal");
const deleteProductName = document.getElementById("deleteProductName");
const deleteProductId = document.getElementById("deleteProductId");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const closeDeleteModal = document.getElementById("closeDeleteModal");

let products = [];
let editingId = null;
let currentView = "table"; // 'table' or 'grid'
let pendingDeleteId = null;

const money = value =>
    Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[ch]);
}

function showMessage(element, message, type = "") {
    if (!element) return;
    element.textContent = message;
    element.className = type ? `notice ${type} show` : "notice";
    element.style.display = message ? "block" : "none";
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || data.error || `Request failed (${response.status})`);
    }
    return data;
}

// ================= LOAD CATEGORIES =================
async function loadCategoryOptions(selectedCategory = "") {
    const select = form.elements.category;
    try {
        const categories = await request("/api/categories");

        select.replaceChildren(new Option("Select a category...", ""));
        if (categoryFilter) {
            const currentFilter = categoryFilter.value;
            categoryFilter.replaceChildren(new Option("All Categories", ""));
            categories.forEach(category => {
                categoryFilter.add(new Option(category.category_name, category.category_name));
            });
            categoryFilter.value = currentFilter;
        }

        categories.forEach(category => {
            select.add(new Option(category.category_name, category.category_name));
        });

        if (selectedCategory && !categories.some(c => c.category_name.toLowerCase() === selectedCategory.toLowerCase())) {
            select.add(new Option(selectedCategory, selectedCategory));
        }

        select.value = selectedCategory;
    } catch (error) {
        select.replaceChildren(new Option("Unable to load categories", ""));
        showMessage(formMessage, error.message, "error");
    }
}

// ================= LOAD IMAGE GALLERY PRESETS =================
async function loadImageGallery() {
    if (!galleryStrip) return;
    try {
        const images = await request("/api/images");
        if (!images.length) {
            galleryStrip.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">No images found in library.</span>';
            return;
        }

        galleryStrip.innerHTML = images.map(img => `
            <div class="gallery-thumb-item" data-url="${escapeHTML(img.url)}" title="${escapeHTML(img.name)}">
                <img src="${escapeHTML(img.url)}" alt="${escapeHTML(img.name)}" loading="lazy">
            </div>
        `).join("");

        galleryStrip.querySelectorAll(".gallery-thumb-item").forEach(item => {
            item.addEventListener("click", () => {
                const url = item.getAttribute("data-url");
                imageUrlInput.value = url;
                updateImagePreview(url);
                galleryStrip.querySelectorAll(".gallery-thumb-item").forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
            });
        });
    } catch (e) {
        console.warn("Could not load image gallery presets:", e);
    }
}

function updateImagePreview(url) {
    if (!imagePreview) return;
    if (url && url.trim()) {
        imagePreview.src = url.trim();
    } else {
        imagePreview.src = "/images/placeholder.svg";
    }
}

if (imageUrlInput) {
    imageUrlInput.addEventListener("input", (e) => {
        updateImagePreview(e.target.value);
    });
}

// ================= LOAD PRODUCTS =================
async function loadProducts() {
    productsBody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading products...</td></tr>';
    try {
        products = await request("/api/products");
        renderProducts();
        showMessage(pageMessage, "");
    } catch (error) {
        productsBody.innerHTML = '<tr><td colspan="7" class="empty-state">Unable to load products.</td></tr>';
        showMessage(pageMessage, error.message, "error");
    }
}

// ================= FILTER & RENDER PRODUCTS =================
function renderProducts() {
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const selectedCat = (categoryFilter ? categoryFilter.value : "").trim().toLowerCase();
    const selectedStock = stockFilter ? stockFilter.value : "all";
    const selectedSort = sortFilter ? sortFilter.value : "id_desc";

    let filtered = products.filter(p => {
        const matchesQuery =
            String(p.product_name || "").toLowerCase().includes(query) ||
            String(p.category || "").toLowerCase().includes(query) ||
            String(p.product_id).includes(query);

        const matchesCat = !selectedCat || String(p.category || "").toLowerCase() === selectedCat;

        const qty = Number(p.quantity);
        let matchesStock = true;
        if (selectedStock === "in") matchesStock = qty > 10;
        else if (selectedStock === "low") matchesStock = qty > 0 && qty <= 10;
        else if (selectedStock === "out") matchesStock = qty === 0;

        return matchesQuery && matchesCat && matchesStock;
    });

    // Sorting
    filtered.sort((a, b) => {
        if (selectedSort === "id_desc") return Number(b.product_id) - Number(a.product_id);
        if (selectedSort === "name_asc") return String(a.product_name).localeCompare(String(b.product_name));
        if (selectedSort === "price_asc") return Number(a.price) - Number(b.price);
        if (selectedSort === "price_desc") return Number(b.price) - Number(a.price);
        if (selectedSort === "stock_desc") return Number(b.quantity) - Number(a.quantity);
        if (selectedSort === "stock_asc") return Number(a.quantity) - Number(b.quantity);
        return 0;
    });

    const summaryEl = document.getElementById("productSummary");
    if (summaryEl) {
        summaryEl.textContent = `Showing ${filtered.length} of ${products.length} products`;
    }

    if (!filtered.length) {
        const emptyHtml = `
            <div class="empty-state-card" style="padding: 40px; text-align: center; grid-column: 1/-1;">
                <div style="font-size: 36px; margin-bottom: 8px;">📦</div>
                <h3 style="font-size: 16px; margin-bottom: 4px;">No products found</h3>
                <p style="color: var(--text-muted); font-size: 13px;">${query || selectedCat || selectedStock !== 'all' ? "No products match the selected filters." : "Your warehouse catalog is currently empty."}</p>
            </div>
        `;
        productsBody.innerHTML = `<tr><td colspan="7" class="empty-state">${emptyHtml}</td></tr>`;
        if (gridViewWrap) gridViewWrap.innerHTML = emptyHtml;
        return;
    }

    // 1. Render Table Rows
    productsBody.innerHTML = filtered.map(p => {
        const qty = Number(p.quantity);
        const imgUrl = p.image_url && p.image_url.trim() ? escapeHTML(p.image_url.trim()) : '/images/placeholder.svg';

        const status = qty === 0
            ? '<span class="status-badge out">Out of stock</span>'
            : qty <= 10
            ? '<span class="status-badge low">Low stock</span>'
            : '<span class="status-badge in">In stock</span>';

        return `
            <tr>
                <td><strong>#${Number(p.product_id)}</strong></td>
                <td>
                    <div class="product-cell">
                        <img src="${imgUrl}" class="product-thumb" alt="${escapeHTML(p.product_name)}"
                             onerror="this.onerror=null; this.src='/images/placeholder.svg';"
                             onclick="window.open('${imgUrl}', '_blank')" title="View image">
                        <div class="product-cell-info">
                            <strong>${escapeHTML(p.product_name)}</strong>
                            <small>SKU: #${Number(p.product_id)}</small>
                        </div>
                    </div>
                </td>
                <td><span class="category-badge">${escapeHTML(p.category || "Unassigned")}</span></td>
                <td><strong>${money(p.price)}</strong></td>
                <td><strong>${qty.toLocaleString("en-IN")}</strong></td>
                <td>${status}</td>
                <td style="text-align: right;">
                    <div class="inline-actions" style="justify-content: flex-end;">
                        <a href="/stock-in.html?product_id=${p.product_id}" class="action-button" style="color: var(--blue);" title="Receive Stock">＋ In</a>
                        <a href="/stock-out.html?product_id=${p.product_id}" class="action-button" style="color: var(--amber);" title="Dispatch Stock">− Out</a>
                        <button class="action-button edit" data-action="edit" data-id="${Number(p.product_id)}">Edit</button>
                        <button class="action-button delete" data-action="delete" data-id="${Number(p.product_id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // 2. Render Grid Cards
    if (gridViewWrap) {
        gridViewWrap.innerHTML = filtered.map(p => {
            const qty = Number(p.quantity);
            const imgUrl = p.image_url && p.image_url.trim() ? escapeHTML(p.image_url.trim()) : '/images/placeholder.svg';

            const status = qty === 0
                ? '<span class="status-badge out">Out of stock</span>'
                : qty <= 10
                ? '<span class="status-badge low">Low stock</span>'
                : '<span class="status-badge in">In stock</span>';

            return `
                <div class="product-card">
                    <div class="product-card-img-wrap">
                        <img src="${imgUrl}" alt="${escapeHTML(p.product_name)}" onerror="this.onerror=null; this.src='/images/placeholder.svg';">
                        <div class="product-card-status">${status}</div>
                        <div class="product-card-category">${escapeHTML(p.category || "Unassigned")}</div>
                    </div>
                    <div class="product-card-body">
                        <h3>${escapeHTML(p.product_name)}</h3>
                        <span class="product-card-sku">SKU #${p.product_id}</span>
                        <div class="product-card-meta">
                            <div class="product-card-price">${money(p.price)}</div>
                            <div class="product-card-stock">
                                <span>Quantity</span>
                                <strong>${qty} units</strong>
                            </div>
                        </div>
                    </div>
                    <div class="product-card-actions">
                        <div style="display:flex; gap:6px;">
                            <a href="/stock-in.html?product_id=${p.product_id}" class="action-button" style="color: var(--blue);">＋ In</a>
                            <a href="/stock-out.html?product_id=${p.product_id}" class="action-button" style="color: var(--amber);">− Out</a>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="action-button edit" data-action="edit" data-id="${Number(p.product_id)}">Edit</button>
                            <button class="action-button delete" data-action="delete" data-id="${Number(p.product_id)}">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }
}

// ================= VIEW SWITCHER =================
function setView(view) {
    currentView = view;
    if (view === "grid") {
        tableViewWrap.style.display = "none";
        gridViewWrap.style.display = "grid";
        viewTableBtn.classList.remove("active");
        viewGridBtn.classList.add("active");
    } else {
        tableViewWrap.style.display = "block";
        gridViewWrap.style.display = "none";
        viewTableBtn.classList.add("active");
        viewGridBtn.classList.remove("active");
    }
}

if (viewTableBtn) viewTableBtn.addEventListener("click", () => setView("table"));
if (viewGridBtn) viewGridBtn.addEventListener("click", () => setView("grid"));

// ================= EXPORT TO CSV =================
if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
        if (!products.length) {
            alert("No products available to export.");
            return;
        }

        const headers = ["Product ID", "Product Name", "Category", "Price (INR)", "Quantity In Stock", "Inventory Valuation (INR)", "Image URL"];
        const rows = products.map(p => [
            p.product_id,
            `"${String(p.product_name).replace(/"/g, '""')}"`,
            `"${String(p.category || '').replace(/"/g, '""')}"`,
            p.price,
            p.quantity,
            (Number(p.price) * Number(p.quantity)).toFixed(2),
            `"${String(p.image_url || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `sham_warehouse_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

// ================= FORM SUBMISSION (ADD / EDIT) =================
form.addEventListener("submit", async event => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
        product_name: formData.get("product_name").trim(),
        category: formData.get("category").trim() || null,
        price: parseFloat(formData.get("price")),
        quantity: parseInt(formData.get("quantity"), 10),
        image_url: formData.get("image_url") ? formData.get("image_url").trim() : "/images/placeholder.svg"
    };

    saveButton.disabled = true;
    saveButton.textContent = editingId ? "Updating..." : "Saving...";

    try {
        if (editingId) {
            await request(`/api/products/${editingId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            showMessage(formMessage, "Product updated successfully!", "success");
        } else {
            await request("/api/products", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            showMessage(formMessage, "Product added successfully!", "success");
        }

        resetForm();
        await loadProducts();
        await loadCategoryOptions();
    } catch (error) {
        showMessage(formMessage, error.message, "error");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = editingId ? "Save Changes" : "＋ Save Product";
    }
});

// ================= EDIT MODE =================
function startEditing(id) {
    const product = products.find(p => Number(p.product_id) === Number(id));
    if (!product) return;

    editingId = Number(id);
    form.elements.product_name.value = product.product_name;
    form.elements.price.value = product.price;
    form.elements.quantity.value = product.quantity;
    form.elements.image_url.value = product.image_url || "";
    updateImagePreview(product.image_url);

    loadCategoryOptions(product.category || "");

    formTitle.textContent = `Edit Product #${product.product_id}`;
    saveButton.textContent = "Save Changes";
    cancelEdit.hidden = false;

    // Highlight preset thumbnail if it matches
    if (galleryStrip) {
        galleryStrip.querySelectorAll(".gallery-thumb-item").forEach(item => {
            item.classList.toggle("selected", item.getAttribute("data-url") === product.image_url);
        });
    }

    form.scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
    form.reset();
    editingId = null;
    formTitle.textContent = "Register New Product";
    saveButton.textContent = "＋ Save Product";
    cancelEdit.hidden = true;
    updateImagePreview("");
    if (galleryStrip) {
        galleryStrip.querySelectorAll(".gallery-thumb-item").forEach(i => i.classList.remove("selected"));
    }
    loadCategoryOptions();
}

cancelEdit.addEventListener("click", resetForm);

// ================= DELETE CONFIRMATION MODAL =================
function openDeleteDialog(id) {
    const product = products.find(p => Number(p.product_id) === Number(id));
    if (!product) return;

    pendingDeleteId = id;
    deleteProductName.textContent = product.product_name;
    deleteProductId.textContent = product.product_id;
    deleteModal.classList.add("open");
}

function closeDeleteDialog() {
    pendingDeleteId = null;
    deleteModal.classList.remove("open");
}

if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteDialog);
if (closeDeleteModal) closeDeleteModal.addEventListener("click", closeDeleteDialog);

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
        if (!pendingDeleteId) return;
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = "Deleting...";

        try {
            await request(`/api/products/${pendingDeleteId}`, { method: "DELETE" });
            closeDeleteDialog();
            showMessage(pageMessage, "Product deleted successfully.", "success");
            await loadProducts();
            await loadCategoryOptions();
        } catch (error) {
            showMessage(pageMessage, error.message, "error");
        } finally {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.textContent = "Delete Product";
        }
    });
}

// Action click handlers on both table and grid views
document.addEventListener("click", (e) => {
    const target = e.target.closest("button[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");

    if (action === "edit") {
        startEditing(id);
    } else if (action === "delete") {
        openDeleteDialog(id);
    }
});

// Search and filter listeners
if (searchInput) searchInput.addEventListener("input", renderProducts);
if (categoryFilter) categoryFilter.addEventListener("change", renderProducts);
if (stockFilter) stockFilter.addEventListener("change", renderProducts);
if (sortFilter) sortFilter.addEventListener("change", renderProducts);
if (refreshButton) refreshButton.addEventListener("click", loadProducts);

// Initialize Page
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

    loadCategoryOptions();
    loadImageGallery();
    loadProducts();
});
