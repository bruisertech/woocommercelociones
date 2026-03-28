console.log("WooCommerce Quick Image & Price Edit initialized.");

function injectUI() {
    // Target the table rows for products
    const productRows = document.querySelectorAll('table.wp-list-table tbody tr.type-product');

    if (productRows.length === 0) {
        return; // Not on the product list or no products
    }

    productRows.forEach(row => {
        // Find the thumb column
        const thumbColumn = row.querySelector('td.column-thumb');
        if (!thumbColumn) return;

        // Prevent duplicate injection
        if (thumbColumn.querySelector('.wc-qe-container')) return;

        // Extract Product ID from row id attribute (e.g., 'post-123')
        const rowId = row.getAttribute('id');
        if (!rowId) return;
        const productId = rowId.replace('post-', '');

        // Extract Product Title from the hidden inline-edit data
        const titleInput = row.querySelector('.post_title') || row.querySelector('strong a.row-title');
        const productTitle = titleInput ? (titleInput.value || titleInput.textContent).trim() : 'Producto';

        // Extract Current Regular Price from the hidden inline-edit data
        // WooCommerce injects a hidden row with id="inline_{post_id}" directly after the main row
        // or sometimes inside the main row under '.inline-edit-wrapper'
        let currentRegularPrice = '';
        const inlineEditRow = document.getElementById(`inline_${productId}`);
        if (inlineEditRow) {
            const priceInput = inlineEditRow.querySelector('input[name="_regular_price"]');
            if (priceInput) {
                currentRegularPrice = priceInput.value;
            }
        }

        // Sometimes the price is not in inline edit but in the price column, try fallback if empty
        if (!currentRegularPrice) {
            const priceColumn = row.querySelector('td.column-price');
            if (priceColumn) {
                 // Try to find the regular price specifically (it might be struck out if on sale, or just a normal bdi)
                 // A simple way is to find the FIRST bdi element or the one inside <del> if on sale
                 let amountEl = priceColumn.querySelector('del .woocommerce-Price-amount bdi');
                 if (!amountEl) {
                     amountEl = priceColumn.querySelector('.woocommerce-Price-amount bdi');
                 }
                 if (amountEl) {
                     // Get just the text, strip currency symbols (very basic fallback)
                     // Reemplazamos cualquier cosa que no sea número o punto (asumiendo formato estándar)
                     currentRegularPrice = amountEl.textContent.replace(/[^\d.]/g, '');
                 }
            }
        }

        // Create Container
        const container = document.createElement('div');
        container.className = 'wc-qe-container';
        container.setAttribute('data-product-id', productId);
        container.setAttribute('data-product-title', productTitle);

        // Product Title Row
        const titleRow = document.createElement('div');
        titleRow.className = 'wc-qe-title';
        // Sometimes titles are long, so we truncate it visually via CSS
        titleRow.textContent = productTitle;
        titleRow.title = productTitle;

        // Price Row
        const priceRow = document.createElement('div');
        priceRow.className = 'wc-qe-row';
        priceRow.innerHTML = `
            <input type="text" class="wc-qe-input wc-qe-price-input" value="${currentRegularPrice}" placeholder="Precio" />
            <button type="button" class="button wc-qe-btn wc-qe-btn-primary wc-qe-save-price">✓ Guardar</button>
        `;

        // Image Row
        const imageRow = document.createElement('div');
        imageRow.className = 'wc-qe-row';
        imageRow.innerHTML = `
            <button type="button" class="button wc-qe-btn wc-qe-btn-secondary wc-qe-search-img" style="width: 100%;">🔍 Cambiar Img</button>
        `;

        // Loading and Status indicators
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'wc-qe-loading';
        loadingDiv.textContent = 'Buscando...';

        const statusDiv = document.createElement('div');
        statusDiv.className = 'wc-qe-status';

        // Grid Container for Serper images
        const gridContainer = document.createElement('div');
        gridContainer.className = 'wc-qe-grid-container';

        // Append everything
        container.appendChild(titleRow);
        container.appendChild(priceRow);
        container.appendChild(imageRow);
        container.appendChild(loadingDiv);
        container.appendChild(gridContainer);
        container.appendChild(statusDiv);

        // Append to the thumb column
        thumbColumn.appendChild(container);

        // Add event listeners
        attachEventListeners(container, productId, productTitle);
    });
}

function attachEventListeners(container, productId, productTitle) {
    const btnSavePrice = container.querySelector('.wc-qe-save-price');
    const inputPrice = container.querySelector('.wc-qe-price-input');
    const btnSearchImg = container.querySelector('.wc-qe-search-img');
    const statusDiv = container.querySelector('.wc-qe-status');
    const loadingDiv = container.querySelector('.wc-qe-loading');
    const gridContainer = container.querySelector('.wc-qe-grid-container');

    // Handle Price Save
    btnSavePrice.addEventListener('click', (e) => {
        e.preventDefault();
        const newPrice = inputPrice.value.trim();
        savePrice(productId, newPrice, statusDiv, btnSavePrice);
    });

    // Handle Image Search
    btnSearchImg.addEventListener('click', (e) => {
        e.preventDefault();

        // Toggle if already visible
        if (gridContainer.style.display === 'grid') {
            gridContainer.style.display = 'none';
            return;
        }

        searchImages(productTitle, gridContainer, loadingDiv, statusDiv, productId);
    });
}

function showStatus(element, message, isError = false) {
    element.textContent = message;
    element.style.color = isError ? '#dc3232' : '#008a20';
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 4000);
}

// Helper to extract WP Nonce
function getWpNonce(actionName) {
    const nonceInput = document.getElementById(actionName);
    return nonceInput ? nonceInput.value : '';
}

// Function to collect inline edit data from the hidden fields WP generates
function collectInlineEditData(productId) {
    const row = document.getElementById(`inline_${productId}`);
    if (!row) return null;

    const data = {};
    const inputs = row.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        if (input.name) {
            // Checkboxes
            if (input.type === 'checkbox') {
                if (input.checked) data[input.name] = input.value;
            } else if (input.type === 'radio') {
                if (input.checked) data[input.name] = input.value;
            } else {
                data[input.name] = input.value;
            }
        }
    });
    return data;
}

// Function to save the Regular Price via WP Admin AJAX using the native inline-save action
function savePrice(productId, newPrice, statusDiv, btnElement) {
    console.log(`Saving price ${newPrice} for product ${productId}`);
    btnElement.disabled = true;
    btnElement.textContent = '...';

    // Get the base inline edit data WP needs to perform a save
    const inlineData = collectInlineEditData(productId);
    if (!inlineData) {
        showStatus(statusDiv, 'Error: No se encontraron los datos del producto', true);
        btnElement.disabled = false;
        btnElement.textContent = '✓ Guardar';
        return;
    }

    const formData = new URLSearchParams();

    // Core parameters for inline-save
    formData.append('action', 'inline-save');
    formData.append('post_type', 'product');
    formData.append('post_ID', productId);

    // Add all existing hidden fields from the inline edit wrapper to avoid blanking them out
    for (const [key, value] of Object.entries(inlineData)) {
        // Skip some fields that we specifically want to override
        if (key !== 'post_ID' && key !== '_regular_price') {
            formData.append(key, value);
        }
    }

    // Set the specific nonce and properties for quick editing
    const inlineEditNonce = document.getElementById('_inline_edit');
    if (inlineEditNonce) formData.append('_inline_edit', inlineEditNonce.value);

    const woocommerceNonce = document.getElementById('woocommerce_quick_edit_nonce');
    if (woocommerceNonce) formData.append('woocommerce_quick_edit_nonce', woocommerceNonce.value);
    formData.append('woocommerce_quick_edit', '1');

    // Finally, override the regular price
    formData.append('_regular_price', newPrice);

    // Some basic fallbacks for typical inline save payload
    if(!formData.has('post_status')) formData.append('post_status', 'publish'); // Assume publish if missing

    fetch(ajaxurl, { // ajaxurl is a global variable defined by WordPress in the admin area
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: formData.toString()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
    })
    .then(data => {
        // WordPress returns the updated row HTML upon success
        if (data && data.indexOf('<tr') !== -1) {
             showStatus(statusDiv, 'Precio guardado!', false);
             // We could replace the row, but let's just keep our UI intact.
             // The next time the page reloads or an action is done, it will reflect.
             // However, to make it visual, we'll flash the input field.
             // Try to find the input within the row.
             const containerRow = statusDiv.closest('.wc-qe-container');
             if (containerRow) {
                 const input = containerRow.querySelector('.wc-qe-price-input');
                 if(input) {
                     input.style.backgroundColor = '#d4edda';
                     setTimeout(() => { input.style.backgroundColor = ''; }, 1000);
                 }

                 // Also try to update the main price display in WooCommerce list table
                 const tr = containerRow.closest('tr');
                 if (tr) {
                    const inlinePrice = tr.querySelector('.inline-edit-wrapper input[name="_regular_price"]');
                    if (inlinePrice) inlinePrice.value = newPrice;
                    const displayPrice = tr.querySelector('td.column-price .woocommerce-Price-amount bdi');
                    if (displayPrice) {
                        // Very basic text replacement, won't handle complex formatting but better than nothing
                        displayPrice.innerHTML = displayPrice.innerHTML.replace(/[\d.,]+/, newPrice);
                    }
                 }
             }
        } else {
             console.error("Error from AJAX:", data);
             showStatus(statusDiv, 'Error al guardar.', true);
        }
    })
    .catch(error => {
        console.error('Error saving price:', error);
        showStatus(statusDiv, 'Error de red.', true);
    })
    .finally(() => {
        btnElement.disabled = false;
        btnElement.textContent = '✓ Guardar';
    });
}

function searchImages(productTitle, gridContainer, loadingDiv, statusDiv, productId) {
    console.log(`Searching images for ${productTitle}`);

    // Clear previous results
    gridContainer.innerHTML = '';
    gridContainer.style.display = 'none';

    loadingDiv.style.display = 'block';

    // Construct the query specific to the user's request
    const query = `${productTitle} parfum white bg`;

    // Send message to background script to bypass CORS
    chrome.runtime.sendMessage({ action: "searchImages", query: query }, (response) => {
        loadingDiv.style.display = 'none';

        if (chrome.runtime.lastError) {
             showStatus(statusDiv, 'Error: ' + chrome.runtime.lastError.message, true);
             return;
        }

        if (response && response.success) {
            const images = response.images;
            if (images && images.length > 0) {
                gridContainer.style.display = 'grid';

                images.forEach(imgData => {
                    const imgEl = document.createElement('img');
                    imgEl.src = imgData.imageUrl;
                    imgEl.title = imgData.title || 'Image';

                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'wc-qe-grid-item';
                    itemDiv.appendChild(imgEl);

                    // Click to set image
                    itemDiv.addEventListener('click', () => {
                         setImageForProduct(productId, imgData.imageUrl, statusDiv, gridContainer);
                    });

                    gridContainer.appendChild(itemDiv);
                });
            } else {
                showStatus(statusDiv, 'No se encontraron imágenes', true);
            }
        } else {
             const errorMsg = response && response.error ? response.error : 'Error desconocido al buscar';
             showStatus(statusDiv, errorMsg, true);
        }
    });
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

async function setImageForProduct(productId, imageUrl, statusDiv, gridContainer) {
    console.log(`Setting image for product ${productId}: ${imageUrl}`);
    gridContainer.style.display = 'none';
    showStatus(statusDiv, 'Descargando imagen...', false);

    try {
        // 1. Ask background to download the image to avoid CORS
        const downloadResponse = await new Promise((resolve, reject) => {
             chrome.runtime.sendMessage({ action: "downloadImage", url: imageUrl }, response => {
                  if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                  else resolve(response);
             });
        });

        if (!downloadResponse || !downloadResponse.success) {
            throw new Error(downloadResponse ? downloadResponse.error : "Failed to download image");
        }

        showStatus(statusDiv, 'Obteniendo permisos...', false);

        // 2. We need a valid upload nonce. We will fetch media-new.php which is lightweight
        // and doesn't load Gutenberg or complex product edit interfaces
        const mediaNewRes = await fetch(`${window.location.origin}/wp-admin/media-new.php`);
        const mediaNewHtml = await mediaNewRes.text();
        const mediaNewNonceMatch = mediaNewHtml.match(/name="_wpnonce" value="([a-z0-9]+)"/) || mediaNewHtml.match(/"upload":"([a-z0-9]+)"/);

        let mediaNonce = null;
        if (mediaNewNonceMatch) {
            mediaNonce = mediaNewNonceMatch[1];
        }

        if (!mediaNonce) {
            throw new Error("No se pudo obtener el nonce de seguridad para subir imágenes.");
        }

        showStatus(statusDiv, 'Subiendo a WordPress...', false);

        // 3. Upload the image to WordPress via async-upload.php
        const blob = dataURLtoBlob(downloadResponse.dataUrl);
        // Create a reasonable filename
        const extMatch = downloadResponse.dataUrl.match(/data:image\/([a-zA-Z]+);/);
        const ext = extMatch && extMatch[1] ? extMatch[1] : 'jpg';
        const filename = `product-${productId}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;

        const uploadFormData = new FormData();
        uploadFormData.append('name', filename);
        uploadFormData.append('action', 'upload-attachment');
        uploadFormData.append('_wpnonce', mediaNonce);
        uploadFormData.append('post_id', productId);
        uploadFormData.append('async-upload', blob, filename);

        const uploadRes = await fetch(`${window.location.origin}/wp-admin/async-upload.php`, {
            method: 'POST',
            body: uploadFormData
        });

        const uploadText = await uploadRes.text();
        // Upload response is usually a JSON string with an object containing id or a string with error
        let attachmentId = null;
        let attachmentUrl = null;
        try {
            const uploadData = JSON.parse(uploadText);
            if (uploadData && uploadData.success && uploadData.data && uploadData.data.id) {
                attachmentId = uploadData.data.id;
                attachmentUrl = uploadData.data.url;
            } else if (uploadData && uploadData.data && uploadData.data.id) {
                 attachmentId = uploadData.data.id;
                 attachmentUrl = uploadData.data.url;
            }
        } catch (e) {
            // Sometimes it's not JSON, let's try to parse HTML/XML if it returned something else
            const idMatch = uploadText.match(/"id":(\d+)/);
            if (idMatch) attachmentId = idMatch[1];
        }

        if (!attachmentId) {
            console.error("Upload response:", uploadText);
            throw new Error("Error al subir la imagen a la librería.");
        }

        showStatus(statusDiv, 'Asignando imagen...', false);

        // 4. Attach image as Product Thumbnail using inline-save
        // We avoid the `set-post-thumbnail` action because we don't have its specific nonce
        // Instead, we use the same `inline-save` action we used for the price, which supports setting _thumbnail_id

        const inlineData = collectInlineEditData(productId);
        if (!inlineData) {
            throw new Error("No se pudo obtener datos para guardar la imagen (inline data missing).");
        }

        const attachFormData = new URLSearchParams();
        attachFormData.append('action', 'inline-save');
        attachFormData.append('post_type', 'product');
        attachFormData.append('post_ID', productId);

        // Pass existing data
        for (const [key, value] of Object.entries(inlineData)) {
            if (key !== 'post_ID') attachFormData.append(key, value);
        }

        // Apply nonces
        const inlineEditNonce = document.getElementById('_inline_edit');
        if (inlineEditNonce) attachFormData.append('_inline_edit', inlineEditNonce.value);

        const woocommerceNonce = document.getElementById('woocommerce_quick_edit_nonce');
        if (woocommerceNonce) attachFormData.append('woocommerce_quick_edit_nonce', woocommerceNonce.value);
        attachFormData.append('woocommerce_quick_edit', '1');

        // Set the thumbnail ID! This overrides the image just like the price
        attachFormData.append('_thumbnail_id', attachmentId);
        if(!attachFormData.has('post_status')) attachFormData.append('post_status', 'publish');

        const attachRes = await fetch(`${window.location.origin}/wp-admin/admin-ajax.php`, {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
             },
             body: attachFormData.toString()
        });

        const attachText = await attachRes.text();

        if (!attachRes.ok || (attachText && attachText.trim() === '0')) {
             throw new Error("Error al asignar la imagen destacada. El servidor rechazó la petición.");
        }

        // Also update the hidden inline data locally so subsequent saves don't revert the image
        const inlineThumbnailField = document.querySelector(`#inline_${productId} input[name="_thumbnail_id"]`);
        if (inlineThumbnailField) {
            inlineThumbnailField.value = attachmentId;
        } else {
            // Create one if it didn't exist
            const inlineEditRow = document.getElementById(`inline_${productId}`);
            if (inlineEditRow) {
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.name = '_thumbnail_id';
                hiddenInput.value = attachmentId;
                inlineEditRow.appendChild(hiddenInput);
            }
        }

        showStatus(statusDiv, '¡Imagen actualizada!', false);

        // 5. Visually update the image in the current list table
        const row = document.getElementById(`post-${productId}`);
        if (row) {
             const thumbColumn = row.querySelector('td.column-thumb');
             if (thumbColumn) {
                  const img = thumbColumn.querySelector('img');
                  if (img && attachmentUrl) {
                       img.src = attachmentUrl;
                       // Remove srcset to force using the new src
                       img.removeAttribute('srcset');
                  } else if (attachmentUrl) {
                       // If there wasn't an image before, create it
                       const a = document.createElement('a');
                       a.href = `${window.location.origin}/wp-admin/post.php?post=${productId}&action=edit`;
                       const newImg = document.createElement('img');
                       newImg.src = attachmentUrl;
                       newImg.width = 40; // Default thumb size
                       newImg.height = 40;
                       newImg.className = 'attachment-woocommerce_thumbnail size-woocommerce_thumbnail';
                       a.appendChild(newImg);
                       // Prepend it before our container
                       thumbColumn.insertBefore(a, thumbColumn.firstChild);
                  }
             }
        }

    } catch (error) {
         console.error("Error complete image process:", error);
         showStatus(statusDiv, 'Error: ' + error.message, true);
    }
}

// Run the injection when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
} else {
    injectUI();
}

// Listen for AJAX changes in the WP list table to re-inject (like when doing a quick edit normally)
const observer = new MutationObserver((mutations) => {
    let shouldInject = false;
    for (let mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if a row was added or updated
            for (let node of mutation.addedNodes) {
                if (node.nodeType === 1 && (node.tagName === 'TR' || node.tagName === 'TBODY')) {
                    shouldInject = true;
                    break;
                }
            }
        }
    }
    if (shouldInject) {
        // Slight delay to ensure DOM is settled
        setTimeout(injectUI, 200);
    }
});

const wpListTable = document.querySelector('table.wp-list-table tbody');
if (wpListTable) {
    observer.observe(wpListTable, { childList: true, subtree: true });
}
