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

        // Helper to decode HTML entities like &amp;
        const decodeEntities = (html) => {
            const txt = document.createElement("textarea");
            txt.innerHTML = html;
            return txt.value;
        };

        // Extract Product Title from the hidden inline-edit data
        const titleInput = row.querySelector('.post_title') || row.querySelector('strong a.row-title');
        let productTitle = titleInput ? (titleInput.value || titleInput.textContent).trim() : 'Producto';
        productTitle = decodeEntities(productTitle);

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
                 if (!amountEl) {
                     // General fallback for other WooCommerce structures
                     amountEl = priceColumn.querySelector('.amount');
                 }
                 if (amountEl) {
                     // Get just the text, strip currency symbols (very basic fallback)
                     // Some themes use commas for decimals, some use dots. Let's keep digits and dots/commas
                     let rawText = amountEl.textContent.trim();
                     // Remove common currency symbols and non-numeric chars except dot and comma
                     currentRegularPrice = rawText.replace(/[^\d.,]/g, '');

                     // Try to standardize to dot for the placeholder, or just leave it as extracted
                     // Many WP setups store the raw value with dot.
                     if (currentRegularPrice.includes(',') && !currentRegularPrice.includes('.')) {
                         // If it's a format like "50,00" change to "50.00" for the input
                         currentRegularPrice = currentRegularPrice.replace(',', '.');
                     } else if (currentRegularPrice.includes(',') && currentRegularPrice.includes('.')) {
                         // Format like 1.000,50 -> strip the dot, replace comma with dot
                         currentRegularPrice = currentRegularPrice.replace('.', '').replace(',', '.');
                     }
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

// Function to safely trigger the native Quick Edit and inject our data
function saveViaQuickEdit(productId, fieldName, value, statusDiv, btnElement = null, isImage = false, attachmentUrl = null) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = '...';
    }

    const row = document.getElementById(`post-${productId}`);
    if (!row) {
        showStatus(statusDiv, 'Error: Fila no encontrada', true);
        if (btnElement) { btnElement.disabled = false; btnElement.textContent = '✓ Guardar'; }
        return;
    }

    // 1. Find and click the native "Edición rápida" button
    const quickEditBtn = row.querySelector('.editinline');
    if (!quickEditBtn) {
        showStatus(statusDiv, 'Error: Botón de edición rápida nativo no encontrado', true);
        if (btnElement) { btnElement.disabled = false; btnElement.textContent = '✓ Guardar'; }
        return;
    }

    quickEditBtn.click(); // This opens the edit form below the row

    // Wait a brief moment for WordPress JS to populate the form
    setTimeout(() => {
        const editRow = document.getElementById(`edit-${productId}`);
        if (!editRow) {
            showStatus(statusDiv, 'Error al abrir formulario', true);
            if (btnElement) { btnElement.disabled = false; btnElement.textContent = '✓ Guardar'; }
            return;
        }

        // 2. Inject our value into the form
        if (fieldName === '_regular_price') {
            const priceInput = editRow.querySelector(`input[name="${fieldName}"]`);
            if (priceInput) priceInput.value = value;
        } else if (fieldName === '_thumbnail_id') {
            // For images, we need to add a hidden input since Quick Edit doesn't normally handle thumbnails
            let thumbInput = editRow.querySelector(`input[name="_thumbnail_id"]`);
            if (!thumbInput) {
                thumbInput = document.createElement('input');
                thumbInput.type = 'hidden';
                thumbInput.name = '_thumbnail_id';
                editRow.querySelector('.inline-edit-wrapper').appendChild(thumbInput);
            }
            thumbInput.value = value;
        }

        // 3. Click the native "Actualizar" save button
        const saveBtn = editRow.querySelector('.save');
        if (saveBtn) {
            saveBtn.click();

            // Wait for it to close (meaning success) or show error
            let checkInterval = setInterval(() => {
                const stillOpen = document.getElementById(`edit-${productId}`);
                if (!stillOpen) {
                    // Success!
                    clearInterval(checkInterval);
                    showStatus(statusDiv, '¡Guardado!', false);
                    if (btnElement) {
                        btnElement.disabled = false;
                        btnElement.textContent = '✓ Guardar';

                        const input = statusDiv.parentElement.querySelector('.wc-qe-price-input');
                        if(input) {
                            input.style.backgroundColor = '#d4edda';
                            setTimeout(() => { input.style.backgroundColor = ''; }, 1000);
                        }
                    }

                    // If it was an image, update the UI manually since WP might not redraw the thumb column
                    if (isImage && attachmentUrl) {
                        const newRow = document.getElementById(`post-${productId}`);
                        if (newRow) {
                             const thumbColumn = newRow.querySelector('td.column-thumb');
                             if (thumbColumn) {
                                  const img = thumbColumn.querySelector('img');
                                  if (img) {
                                       img.src = attachmentUrl;
                                       img.removeAttribute('srcset');
                                  } else {
                                       const a = document.createElement('a');
                                       const newImg = document.createElement('img');
                                       newImg.src = attachmentUrl;
                                       newImg.className = 'attachment-woocommerce_thumbnail size-woocommerce_thumbnail';
                                       a.appendChild(newImg);
                                       thumbColumn.insertBefore(a, thumbColumn.firstChild);
                                  }
                             }
                        }
                    }

                } else {
                    const errorMsg = stillOpen.querySelector('.error');
                    if (errorMsg && errorMsg.style.display !== 'none') {
                        clearInterval(checkInterval);
                        showStatus(statusDiv, 'Error al guardar.', true);
                        if (btnElement) { btnElement.disabled = false; btnElement.textContent = '✓ Guardar'; }
                    }
                }
            }, 500);

            // Timeout after 10 seconds
            setTimeout(() => { clearInterval(checkInterval); }, 10000);

        } else {
            showStatus(statusDiv, 'Botón de guardar nativo no encontrado', true);
            if (btnElement) { btnElement.disabled = false; btnElement.textContent = '✓ Guardar'; }
        }

    }, 300); // 300ms is usually enough for WP inlineEdit.edit() to finish populating
}

// Function to trigger save price
function savePrice(productId, newPrice, statusDiv, btnElement) {
    console.log(`Saving price ${newPrice} for product ${productId}`);
    saveViaQuickEdit(productId, '_regular_price', newPrice, statusDiv, btnElement, false);
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

        // 4. Attach image as Product Thumbnail using Quick Edit
        saveViaQuickEdit(productId, '_thumbnail_id', attachmentId, statusDiv, null, true, attachmentUrl);

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
