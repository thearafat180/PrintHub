// Configure PDF.js worker from CDN so we can read PDF page counts client-side.
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

const keep_alive = require('./keep_alive.js');
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const messageDiv = document.getElementById('message');
const submitBtn = document.getElementById('submitBtn');
const clearBtn = document.getElementById('clearBtn');
const loading = document.getElementById('loading');
const fileInputLabel = document.getElementById('fileInputLabel');
const filesList = document.getElementById('filesList');
// Global print type removed; per-file color select is used. Default per-file color = 'bw'.
const costDisplay = document.getElementById('costDisplay');
const totalCostSpan = document.getElementById('totalCost');
const paymentSection = document.getElementById('paymentSection');
// const SERVER_UPLOAD_URL = 'http://localhost:5000/upload';
// const SERVER_UPLOAD_URL = 'https://print-hub-hazel.vercel.app/api/upload';
const SERVER_UPLOAD_URL = 'https://printhub-azxa.onrender.com/api/upload';
// https://printhub-azxa.onrender.com

// For now we don't have a real payment gateway integrated.
// Set SIMULATE_PAYMENT=true to always treat payments as successful (demo mode).
const SIMULATE_PAYMENT = false;
let selectedFiles = [];
let totalPages = 0;

// The label has a for="fileInput" attribute — that's sufficient to open the file picker.
// Append newly selected files to the existing selection so users can open the
// file dialog multiple times and keep previously chosen files.
fileInput.addEventListener('change', (e) => {
  if (!e.target.files) return;
  addFiles(e.target.files);
});

fileInputLabel.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileInputLabel.classList.add('drag-over');
});
fileInputLabel.addEventListener('dragleave', () => fileInputLabel.classList.remove('drag-over'));
fileInputLabel.addEventListener('drop', (e) => {
  e.preventDefault();
  fileInputLabel.classList.remove('drag-over');
  if (e.dataTransfer && e.dataTransfer.files) {
    addFiles(e.dataTransfer.files);
  }
});

function updateFilesList() {
  filesList.innerHTML = '';
  selectedFiles.forEach((item, index) => {
    const file = item.file;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'file-item';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    // compute detected and selected pages for display
    const pc = item.pageCount || null;
    const fromVal = item.from ? parseInt(item.from, 10) : null;
    const toVal = item.to ? parseInt(item.to, 10) : null;
    let selectedCount = '...';
    if (pc !== null) {
      if (fromVal && toVal && toVal >= fromVal) {
        selectedCount = Math.max(0, Math.min(toVal, pc) - Math.max(fromVal, 1) + 1);
      } else {
        selectedCount = pc;
      }
    }
    // Show filename and per-file info. For images we don't render From/To inputs.
    if (item.isImage) {
      itemDiv.innerHTML = `

              <div class="file-left">
                <div class="file-name">${file.name} (${sizeMB} MB)</div>
                <div style="font-size:0.9em; color:#444; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                  <label style="display:flex; gap:8px; align-items:center">Color:
                    <select class="file-color" data-index="${index}">
                      <option value="bw" ${item.color==='bw' ? 'selected' : ''}>B/W</option>
                      <option value="color" ${item.color==='color' ? 'selected' : ''}>Color</option>
                    </select>
                  </label>
                  <label style="display:flex; gap:8px; align-items:center">Copies:
                    <input type="number" min="1" class="file-copies" data-index="${index}" value="${item.copies || 1}">
                  </label>
                  <span style="color:#666; white-space:nowrap">Total Page: 
                    <strong>${pc === null ? '...' : pc}</strong>
                  </span>
                  <span style="color:#666; white-space:nowrap">Selected per copy: 
                    <strong>1</strong>
                  </span>
                </div>
              </div>
              <div style="margin-left:12px; flex-shrink:0">
                <button type="button" onclick="removeFile(${index})">Remove</button>
              </div>
        `;
    } else {
      itemDiv.innerHTML = `

              <div class="file-left">
                <div class="file-name">${file.name} (${sizeMB} MB)</div>
                <div style="font-size:0.9em; color:#444; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                  <label style="font-weight:600">From</label>
                  <input type="number" min="1" class="file-from" data-index="${index}" value="${item.from || ''}" style="width:80px; padding:6px; border-radius:6px; border:1px solid #ddd">
                    <label style="font-weight:600">To</label>
                    <input type="number" min="1" class="file-to" data-index="${index}" value="${item.to || ''}" style="width:80px; padding:6px; border-radius:6px; border:1px solid #ddd">
                      <label style="margin-left:8px; display:flex; gap:8px; align-items:center; font-weight:600">Color:
                        <select class="file-color" data-index="${index}">
                          <option value="bw" ${item.color==='bw' ? 'selected' : ''}>B/W</option>
                          <option value="color" ${item.color==='color' ? 'selected' : ''}>Color</option>
                        </select>
                      </label>
                      <label style="margin-left:8px; display:flex; gap:8px; align-items:center; font-weight:600">Copies:
                        <input type="number" min="1" class="file-copies" data-index="${index}" value="${item.copies || 1}">
                      </label>
                      <span style="margin-left:8px; color:#666; white-space:nowrap">Total Page: 
                        <strong>${pc === null ? '...' : pc}</strong>
                      </span>
                      <span style="margin-left:8px; color:#666; white-space:nowrap">Selected per copy: 
                        <strong>${selectedCount}</strong>
                      </span>
                      <span style="margin-left:8px; color:#666; white-space:nowrap">Copies: 
                        <strong>${item.copies || 1}</strong>
                      </span>
                    </div>
                  </div>
                  <div style="margin-left:12px; flex-shrink:0">
                    <button type="button" onclick="removeFile(${index})">Remove</button>
                  </div>
        `;
    }
    filesList.appendChild(itemDiv);
  });
  // Attach listeners to per-file inputs
  filesList.querySelectorAll('.file-from').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      setFileRange(idx, e.target.value, selectedFiles[idx].to);
    });
  });
  filesList.querySelectorAll('.file-to').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      setFileRange(idx, selectedFiles[idx].from, e.target.value);
    });
  });
  // per-file color selector
  filesList.querySelectorAll('.file-color').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const val = e.target.value;
      setFileOption(idx, 'color', val);
    });
  });
  // per-file copies input
  filesList.querySelectorAll('.file-copies').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const val = parseInt(e.target.value, 10) || 1;
      setFileOption(idx, 'copies', val);
    });
  });
}
// Called when user edits per-file From/To inputs
function setFileRange(index, from, to) {
  const idx = parseInt(index, 10);
  const item = selectedFiles[idx];
  if (!item) return;
  item.from = from ? String(from) : '';
  item.to = to ? String(to) : '';
  updateCost();
}

function setFileOption(index, key, value) {
  const idx = parseInt(index, 10);
  const item = selectedFiles[idx];
  if (!item) return;
  if (key === 'copies') {
    item.copies = Number(value) > 0 ? Number(value) : 1;
  } else if (key === 'color') {
    item.color = String(value);
  }
  updateCost();
}
// Merge new files into selectedFiles, avoid duplicates, and sync the hidden file input
function addFiles(fileList) {
  const newFiles = Array.from(fileList);
  newFiles.forEach(f => {
    const isDuplicate = selectedFiles.some(existing => existing.file.name === f.name && existing.file.size === f.size && existing.file.lastModified === f.lastModified);
    if (!isDuplicate) {
      const isImage = /^image\//.test(f.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(f.name);
      selectedFiles.push({
        file: f,
        from: '',
        to: '',
        pageCount: isImage ? 1 : 0,
        isImage,
        color: 'bw',
        copies: 1
      });
    }
  });
  // Sync the actual input.files so other code relying on it will work
  const dataTransfer = new DataTransfer();
  selectedFiles.forEach(item => dataTransfer.items.add(item.file));
  fileInput.files = dataTransfer.files;
  updateFilesList();
  estimatePageCount();
}
window.removeFile = function(index) {
  selectedFiles.splice(index, 1);
  fileInput.value = '';
  const dataTransfer = new DataTransfer();
  selectedFiles.forEach(item => dataTransfer.items.add(item.file));
  fileInput.files = dataTransfer.files;
  updateFilesList();
  estimatePageCount();
};
// Estimate page count more accurately: try to read actual page count for PDFs
// using PDF.js. For non-PDF files we fall back to 1 page per file.
async function estimatePageCount() {
  if (selectedFiles.length === 0) {
    totalPages = 0;
    updateCost();
    return;
  }
  try {
    await Promise.all(selectedFiles.map(async (item) => {
      const file = item.file;
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf && window.pdfjsLib) {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer
          }).promise;
          item.pageCount = pdf.numPages || 1;
          return;
        }
      } catch (err) {
        console.error('Failed to read PDF pages for', file.name, err);
      }
      // Fallback: assume 1 page for non-pdf or on error
      item.pageCount = 1;
    }));
    // After per-file pageCounts are filled, compute total based on per-file ranges
    // Include copies per file when computing total printed pages.
    totalPages = selectedFiles.reduce((sum, item) => {
      const pc = item.pageCount || 1;
      const copies = item.copies && Number(item.copies) > 0 ? Number(item.copies) : 1;
      const from = item.from ? parseInt(item.from, 10) : null;
      const to = item.to ? parseInt(item.to, 10) : null;
      let used = 0;
      if (from && to && to >= from) {
        // clamp to available pages
        used = Math.max(0, Math.min(to, pc) - Math.max(from, 1) + 1);
      } else {
        used = pc;
      }
      return sum + used * copies;
    }, 0);
  } catch (err) {
    console.error('Error estimating page counts:', err);
    // On unexpected error, fallback to conservative estimate
    totalPages = selectedFiles.length;
  }
  updateFilesList(); // show detected page counts
  updateCost();
}

function updateCost() {
  // Calculate cost per-file using per-file color choice and copies.
  let totalPrintedPages = 0;
  let totalCost = 0;
  selectedFiles.forEach(item => {
    const pc = item.pageCount || 1;
    const from = item.from ? parseInt(item.from, 10) : null;
    const to = item.to ? parseInt(item.to, 10) : null;
    const copies = item.copies && Number(item.copies) > 0 ? Number(item.copies) : 1;
    let used = 0;
    if (from && to && to >= from) {
      used = Math.max(0, Math.min(to, pc) - Math.max(from, 1) + 1);
    } else {
      used = pc;
    }
    const printed = used * copies;
    totalPrintedPages += printed;
    const pricePerPage = (item.color === 'color') ? 3 : 2;
    totalCost += printed * pricePerPage;
  });
  totalCost = Math.max(0, totalCost);
  totalCostSpan.textContent = totalCost;
  // Update paymentPages display immediately (printed pages includes copies)
  document.getElementById('paymentPages').textContent = totalPrintedPages;
  // Refresh file list so per-file Selected counts update live
  updateFilesList();
}
// global color radios removed; no listener needed
// per-file ranges handle page selection now; no global pageFrom/pageTo inputs
clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  fileInput.value = '';
  filesList.innerHTML = '';
  messageDiv.classList.remove('show', 'success', 'error');
  paymentSection.classList.remove('show');
  totalPages = 0;
  updateCost();
});
uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (selectedFiles.length === 0) {
    showMessage('❌ Please select at least one file.', 'error');
    return;
  }
  // Ensure we have up-to-date per-file page counts and totals before showing payment
  await estimatePageCount();
  const totalCost = parseInt(totalCostSpan.textContent);
  paymentSection.classList.add('show');
  document.getElementById('paymentFiles').textContent = selectedFiles.length;
  document.getElementById('paymentPages').textContent = totalPages;
  document.getElementById('paymentAmount').textContent = totalCost + ' Taka';
  submitBtn.disabled = true;
  window.scrollTo(0, paymentSection.offsetTop - 100);
});
// Confirmation modal wiring: show modal first, then call processPayment on OK
let pendingGateway = null;
const confirmModal = document.getElementById('confirmModal');
const confirmMessageEl = document.getElementById('confirmMessage');
const confirmOkBtn = document.getElementById('confirmOk');
const confirmCancelBtn = document.getElementById('confirmCancel');

function showConfirm(message, gateway) {
  pendingGateway = gateway;
  if (confirmMessageEl) confirmMessageEl.textContent = message;
  if (confirmModal) {
    confirmModal.classList.add('show');
    confirmModal.setAttribute('aria-hidden', 'false');
  }
}

function hideConfirm() {
  pendingGateway = null;
  if (confirmModal) {
    confirmModal.classList.remove('show');
    confirmModal.setAttribute('aria-hidden', 'true');
  }
}

if (confirmOkBtn) {
  confirmOkBtn.addEventListener('click', () => {
    const gateway = pendingGateway;
    // close modal first
    hideConfirm();
    if (gateway) {
      // show a transient processing message, then start the real payment flow
      showMessage(`⏳ Processing payment via ${gateway}...`, 'info');
      processPayment(gateway);
    }
  });
}
if (confirmCancelBtn) {
  confirmCancelBtn.addEventListener('click', () => {
    hideConfirm();
    showMessage('❗ Payment cancelled', 'info');
  });
}

// Wire payment buttons to open the confirmation modal instead of calling processPayment directly
document.getElementById('stripeBtn').addEventListener('click', () => showConfirm(`Proceed with Stripe payment of ${totalCostSpan.textContent} Taka?`, 'Stripe'));
document.getElementById('bkashBtn').addEventListener('click', () => showConfirm(`Proceed with bKash payment of ${totalCostSpan.textContent} Taka?`, 'bKash'));
document.getElementById('nagadBtn').addEventListener('click', () => showConfirm(`Proceed with Nagad payment of ${totalCostSpan.textContent} Taka?`, 'Nagad'));
async function processPayment(gateway) {
  // Demo mode: simulate payment processing and always succeed when SIMULATE_PAYMENT is true.
  loading.classList.add('show');
  try {
    if (SIMULATE_PAYMENT) {
      // small delay to make the UI feel real
      await new Promise(resolve => setTimeout(resolve, 1200));
      loading.classList.remove('show');
      showMessage(`✅ Payment successful via ${gateway}! Documents sent to printer.`, 'success');
      // Clear selection and reset UI as on success
      selectedFiles = [];
      fileInput.value = '';
      filesList.innerHTML = '';
      totalPages = 0;
      updateCost();
      paymentSection.classList.remove('show');
      submitBtn.disabled = false;
      return;
    }

    // If not simulating, fall back to the real upload flow (network POST)
    const formData = new FormData();
    const fileRanges = selectedFiles.map(item => {
      const from = item.from ? String(item.from) : '';
      const to = item.to ? String(item.to) : '';
      return {
        name: item.file.name,
        from,
        to,
        detectedPages: item.pageCount || 1,
        color: item.color || 'bw',
        copies: item.copies && Number(item.copies) > 0 ? Number(item.copies) : 1
      };
    });
    selectedFiles.forEach(item => {
      formData.append('files', item.file);
    });
  formData.append('fileRanges', JSON.stringify(fileRanges));
    formData.append('totalCost', totalCostSpan.textContent);
    formData.append('gateway', gateway);
    const response = await fetch(SERVER_UPLOAD_URL, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    loading.classList.remove('show');
    if (response.ok) {
      showMessage(`✅ Payment successful via ${gateway}! Documents sent to printer.`, 'success');
      selectedFiles = [];
      fileInput.value = '';
      filesList.innerHTML = '';
      totalPages = 0;
      updateCost();
      paymentSection.classList.remove('show');
      submitBtn.disabled = false;
    } else {
      showMessage('❌ Error: ' + result.error, 'error');
      submitBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error:', error);
    loading.classList.remove('show');
    showMessage('❌ Error processing payment. Please try again.', 'error');
    submitBtn.disabled = false;
  }
}
// Message timer so we can auto-hide transient messages and avoid overlapping timers
let messageTimer = null;
function showMessage(text, type) {
  // clear previous timer
  if (messageTimer) {
    clearTimeout(messageTimer);
    messageTimer = null;
  }
  messageDiv.textContent = text;
  messageDiv.className = 'show ' + type;
  // Auto-hide info and success messages after a short duration; keep errors until user acts
  if (type === 'info') {
    messageTimer = setTimeout(() => {
      messageDiv.className = '';
      messageTimer = null;
    }, 4000);
  } else if (type === 'success') {
    messageTimer = setTimeout(() => {
      messageDiv.className = '';
      messageTimer = null;
    }, 6000);
  }

}

client.login(process.env.TOKEN);

