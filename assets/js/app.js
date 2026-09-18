(() => {
  'use strict';

  const COF_RATE = (30 / 365) * 0.08;
  const DEFAULT_VENDOR = Object.freeze({
    name: 'CV EMY RIZKY JAYA',
    nib: '9120401921208',
    npwp: '92.813.868.4-215.000'
  });
  const state = {
    workflow: 'calculate',
    mode: 'maju',
    result: null,
    hasCalculated: false,
    vendorChoice: 'emy',
    otherVendor: { name: '', nib: '', npwp: '' },
    lastConvertedFromReverse: false
  };
  const $ = (id) => document.getElementById(id);
  const moneyIds = ['netVendor', 'netSDM', 'netGudang', 'netOps'];
  const excelFieldIds = [
    'projectId', 'projectName', 'customerName', 'commodity', 'serviceType', 'transportMode', 'paymentTerm',
    'startDate', 'endDate', 'shipmentWeight', 'packageCount', 'originCity', 'destinationCity',
    'originAddress', 'destinationAddress', 'customerPic', 'customerPhone', 'customerEmail',
    'internalPic', 'customerAddress', 'projectLocation', 'operationPattern', 'vehicleType',
    'estimatedTrip', 'cargoType', 'shipmentForm', 'projectPurpose', 'packageDimensions',
    'vendorName', 'vendorNib', 'vendorNpwp', 'executionFrequency', 'operationDescription'
  ];

  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
    const digits = String(value || '').replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }

  function formatInputValue(value) {
    const number = toNumber(value);
    return number ? new Intl.NumberFormat('id-ID').format(number) : '';
  }

  function idr(value) {
    const safe = Number.isFinite(value) ? Math.round(value) : 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(safe);
  }

  function percent(value) {
    return new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  }

  function parseMargin(value) {
    const normalized = String(value ?? '').trim().replace(/%/g, '').replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  }

  function formatMargin(value) {
    return Number(value).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function calculatePricing(input) {
    const mode = input.mode === 'mundur' ? 'mundur' : 'maju';
    const area = input.area === 'nonftz' ? 'nonftz' : 'ftz';
    const margin = Math.min(0.15, Math.max(0.10, Number(input.margin) || 0.15));
    const netVendor = toNumber(input.netVendor);
    const netSDM = toNumber(input.netSDM);
    const netGudang = toNumber(input.netGudang);
    const netOps = toNumber(input.netOps);
    const isPKP = Boolean(input.isPKP);
    const isNonFTZ = area === 'nonftz';

    if (netVendor <= 0) return { valid: false, reason: 'MAIN_REQUIRED', mode, area, margin };

    if (mode === 'maju') {
      const brutoVendorBeforeVat = netVendor / 0.98;
      const vendorVat = isPKP ? brutoVendorBeforeVat * 0.011 : 0;
      const brutoVendor = brutoVendorBeforeVat + vendorVat;
      const brutoSDM = netSDM / 0.98;
      const brutoGudang = netGudang / 0.98;
      const directCost = brutoVendor + brutoSDM + brutoGudang + netOps;
      const overhead = directCost * 0.01;
      const cof = directCost * COF_RATE;
      const baseCost = directCost + overhead + cof;
      const dppOffer = baseCost / (1 - margin);
      const customerVat = isNonFTZ ? dppOffer * 0.011 : 0;
      const finalValue = dppOffer + customerVat;
      const profit = dppOffer - baseCost;

      return {
        valid: true, mode, area, margin, isPKP, netVendor, netSDM, netGudang, netOps,
        brutoVendorBeforeVat, vendorVat, brutoVendor, brutoSDM, brutoGudang,
        directCost, overhead, cof, baseCost, dppOffer, customerVat, finalValue, profit,
        budgetOver: false,
        status: 'ready'
      };
    }

    const dppOffer = isNonFTZ ? netVendor / 1.011 : netVendor;
    const targetBaseCost = dppOffer * (1 - margin);
    const brutoSDM = netSDM / 0.98;
    const brutoGudang = netGudang / 0.98;
    const directCost = targetBaseCost / (1 + 0.01 + COF_RATE);
    const overhead = directCost * 0.01;
    const cof = directCost * COF_RATE;
    const vendorFactor = isPKP ? 1.011 : 1;
    const brutoVendor = (directCost - brutoSDM - brutoGudang - netOps) / vendorFactor;
    const brutoVendorBeforeVat = Math.max(0, brutoVendor);
    const vendorVat = isPKP ? Math.max(0, brutoVendor) * 0.011 : 0;
    const finalValue = brutoVendor > 0 ? brutoVendor * 0.98 : 0;
    const customerVat = netVendor - dppOffer;
    const profit = dppOffer - targetBaseCost;
    const budgetOver = brutoVendor <= 0;

    return {
      valid: true, mode, area, margin, isPKP, netVendor, netSDM, netGudang, netOps,
      brutoVendorBeforeVat, vendorVat, brutoVendor: Math.max(0, brutoVendor), brutoSDM, brutoGudang,
      directCost, overhead, cof, baseCost: targetBaseCost, dppOffer, customerVat,
      finalValue, profit, budgetOver, status: budgetOver ? 'error' : 'ready'
    };
  }

  function selectedValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : '';
  }

  function getMargin(showError = false) {
    const option = selectedValue('margin');
    if (option !== 'custom') return Number(option || 0.15);
    const field = $('customMargin');
    const raw = parseMargin(field.value);
    const valid = Number.isFinite(raw) && raw >= 10 && raw <= 15;
    field.setAttribute('aria-invalid', String(!valid));
    if (!valid && showError) showToast('Margin custom harus berada antara 10% dan 15%.', 'error');
    return valid ? raw / 100 : null;
  }

  function collectInput(showError = false) {
    const margin = getMargin(showError);
    return {
      mode: state.mode,
      area: selectedValue('area'),
      margin,
      isPKP: $('pkp').checked,
      netVendor: toNumber($('netVendor').value),
      netSDM: toNumber($('netSDM').value),
      netGudang: toNumber($('netGudang').value),
      netOps: toNumber($('netOps').value)
    };
  }

  function validate(showErrors = false) {
    const main = toNumber($('netVendor').value);
    const margin = getMargin(showErrors);
    const validMain = main > 0;
    $('mainInputError').hidden = validMain || !showErrors;
    $('netVendor').closest('.money-field').classList.toggle('invalid', !validMain && showErrors);
    $('netVendor').setAttribute('aria-invalid', String(!validMain && showErrors));
    return validMain && margin !== null;
  }

  function setCalcStatus(type, text) {
    const el = $('calcStatus');
    el.className = `calc-status ${type}`;
    el.innerHTML = `<span></span>${text}`;
  }

  function updateModeUI() {
    const forward = state.mode === 'maju';
    $('tabMaju').classList.toggle('active', forward);
    $('tabMundur').classList.toggle('active', !forward);
    $('tabMaju').setAttribute('aria-selected', String(forward));
    $('tabMundur').setAttribute('aria-selected', String(!forward));
    $('mainInputLabel').innerHTML = forward ? 'Uang net ke vendor logistik <b>*</b>' : 'Total budget kontrak customer <b>*</b>';
    $('mainInputHelp').textContent = forward ? 'Nilai net vendor menjadi dasar pembentukan harga customer.' : 'Total budget customer menjadi batas untuk menghitung kemampuan bayar vendor.';
    $('calculateBtn').classList.toggle('reverse', !forward);
    $('calculateBtn').querySelector('span').textContent = forward ? 'Hitung penawaran' : 'Jalankan reverse budget';
    $('heroMode').textContent = state.workflow === 'excel' ? 'Buat Excel CBA' : (forward ? 'Hitung Penawaran' : 'Reverse Budget');
    $('heroModeHint').textContent = state.workflow === 'excel' ? 'Hitung → lengkapi data → unduh' : (forward ? 'Biaya → harga minimum' : 'Budget → batas vendor');
    $('sensitivityOutputHeading').textContent = forward ? 'Penawaran' : 'Batas vendor';
    document.title = state.workflow === 'excel' ? 'CBA PosNew – Buat Excel CBA' : (forward ? 'CBA PosNew – Pricing Calculator' : 'CBA PosNew – Reverse Budget');
  }

  function updateIntegrationUI() {
    const isExcel = state.workflow === 'excel';
    const r = state.result;
    const hasValidResult = Boolean(r && r.valid && !r.budgetOver);

    const transferCard = $('transferToExcelCard');
    if (transferCard) {
      transferCard.hidden = isExcel || !hasValidResult;
      if (hasValidResult && !isExcel) {
        const isReverse = r.mode === 'mundur';
        $('transferBadgeText').textContent = isReverse ? 'Reverse Budget Memadai' : 'Perhitungan Cocok?';
        $('transferCardText').textContent = isReverse
          ? `Batas net vendor ${idr(r.finalValue)} siap diterapkan untuk mengisi penawaran customer di formulir Excel CBA.`
          : 'Lanjutkan hasil kalkulasi ini ke formulir dokumen untuk membuat workbook Excel CBA siap pakai.';
        $('transferBtnText').textContent = isReverse ? 'Terapkan ke Buat Excel CBA' : 'Lanjut Buat Excel CBA';
      }
    }

    const notice = $('excelIntegrationNotice');
    if (notice) {
      notice.hidden = !isExcel || !hasValidResult;
      if (hasValidResult && isExcel) {
        $('integratedOffer').textContent = idr(r.finalValue);
        $('integratedMargin').textContent = percent(r.margin);
        $('integratedDirect').textContent = idr(r.directCost);
        const sourceNote = $('integratedSourceNote');
        if (sourceNote) {
          sourceNote.textContent = state.lastConvertedFromReverse
            ? `Diterapkan dari Reverse Budget: Batas net vendor ${idr(r.netVendor)} menghasilkan nilai penawaran ${idr(r.finalValue)}.`
            : 'Nilai dari perhitungan aktif otomatis menjadi dasar angka pada sheet CBA2 dan Rekap CBA 1.';
        }
      }
    }
  }

  function setWorkflow(workflow, { scroll = false } = {}) {
    const excel = workflow === 'excel';
    state.workflow = excel ? 'excel' : 'calculate';
    if (excel && state.mode !== 'maju') {
      if (state.result && state.result.valid && !state.result.budgetOver && state.mode === 'mundur') {
        const calculatedVendorNet = Math.round(state.result.finalValue);
        $('netVendor').value = formatInputValue(calculatedVendorNet);
        state.lastConvertedFromReverse = true;
      }
      state.mode = 'maju';
    }
    $('workflowCalculate').classList.toggle('active', !excel);
    $('workflowExcel').classList.toggle('active', excel);
    $('workflowCalculate').setAttribute('aria-selected', String(!excel));
    $('workflowExcel').setAttribute('aria-selected', String(excel));
    $('excelDetails').hidden = !excel;
    $('excelNavLink').hidden = !excel;
    $('analysisStepNumber').textContent = excel ? '4' : '3';
    document.querySelector('.step-nav').classList.toggle('excel-workflow', excel);
    document.querySelector('.mode-switch').classList.toggle('single', excel);
    $('tabMundur').hidden = excel;
    $('excelModeNote').hidden = !excel;
    $('exportBtn').hidden = false;
    const exportLabel = $('exportBtnLabel');
    if (exportLabel) exportLabel.textContent = excel ? 'Unduh Excel' : 'Ke Excel CBA';
    $('exportBtn').title = excel ? 'Unduh file Excel CBA' : 'Lanjutkan hasil perhitungan ini ke Buat Excel CBA';
    document.body.classList.toggle('excel-workflow-active', excel);
    updateModeUI();
    updateExcelCompletion();
    if (state.hasCalculated) calculateAndRender();
    updateIntegrationUI();
    if (excel && scroll) $('excelDetails').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collectExcelDetails() {
    const details = {};
    excelFieldIds.forEach((id) => { details[id] = $(id).value.trim(); });
    details.vendorChoice = selectedValue('vendorChoice');
    details.shipmentWeight = Number(details.shipmentWeight || 0);
    details.packageCount = Number(details.packageCount || 0);
    return details;
  }

  function updateVendorChoice({ preserveCurrent = true } = {}) {
    const nextChoice = selectedValue('vendorChoice') === 'other' ? 'other' : 'emy';
    const name = $('vendorName');
    const nib = $('vendorNib');
    const npwp = $('vendorNpwp');
    const fields = [name, nib, npwp];

    if (preserveCurrent && state.vendorChoice === 'other') {
      state.otherVendor = { name: name.value.trim(), nib: nib.value.trim(), npwp: npwp.value.trim() };
    }

    state.vendorChoice = nextChoice;
    const isOther = nextChoice === 'other';
    fields.forEach((field) => {
      field.readOnly = !isOther;
      field.setAttribute('aria-readonly', String(!isOther));
      field.closest('.field')?.classList.toggle('auto-filled', !isOther);
      field.removeAttribute('aria-invalid');
    });

    if (isOther) {
      name.value = state.otherVendor.name;
      nib.value = state.otherVendor.nib;
      npwp.value = state.otherVendor.npwp;
      name.placeholder = 'Nama vendor lain';
      nib.placeholder = 'Masukkan NIB vendor';
      npwp.placeholder = 'Masukkan NPWP vendor';
      fields.forEach((field) => field.setAttribute('data-excel-required', ''));
      name.focus();
    } else {
      name.value = DEFAULT_VENDOR.name;
      nib.value = DEFAULT_VENDOR.nib;
      npwp.value = DEFAULT_VENDOR.npwp;
      fields.forEach((field) => { field.placeholder = ''; });
      nib.removeAttribute('data-excel-required');
      npwp.removeAttribute('data-excel-required');
    }

    updateExcelCompletion();
  }

  function requiredExcelFields() {
    return [...document.querySelectorAll('[data-excel-required]')];
  }

  function isExcelFieldValid(field) {
    if (!String(field.value || '').trim()) return false;
    if (field.type === 'number') return Number(field.value) > 0;
    if (field.type === 'email') return field.validity.valid;
    return true;
  }

  function updateExcelCompletion() {
    const fields = requiredExcelFields();
    const complete = fields.filter(isExcelFieldValid).length;
    const percentComplete = fields.length ? Math.round((complete / fields.length) * 100) : 0;
    const status = $('excelCompletion');
    const ready = percentComplete === 100 && state.result && state.result.valid && !state.result.budgetOver && state.mode === 'maju';
    status.className = `calc-status ${ready ? 'ready' : 'incomplete'}`;
    status.innerHTML = `<span></span>${percentComplete}% lengkap`;
    const summary = $('excelValidationSummary');
    if (ready) {
      summary.className = 'excel-validation ready';
      summary.textContent = 'Data dokumen dan perhitungan siap. Workbook dapat dibuat.';
    } else {
      summary.className = 'excel-validation';
      const missing = fields.length - complete;
      summary.textContent = missing > 0
        ? `${missing} data wajib belum lengkap. Jalankan perhitungan setelah semua data terisi.`
        : 'Data dokumen lengkap. Jalankan perhitungan untuk membuat workbook.';
    }
  }

  function validateExcelDetails(showErrors = false) {
    const fields = requiredExcelFields();
    let firstInvalid = null;
    fields.forEach((field) => {
      const valid = isExcelFieldValid(field);
      field.setAttribute('aria-invalid', String(!valid && showErrors));
      if (!valid && !firstInvalid) firstInvalid = field;
    });
    const email = $('customerEmail');
    const emailValid = !email.value.trim() || email.validity.valid;
    email.setAttribute('aria-invalid', String(!emailValid && showErrors));
    if (!emailValid && !firstInvalid) firstInvalid = email;
    const dateOrderValid = !$('startDate').value || !$('endDate').value || $('endDate').value >= $('startDate').value;
    if (!dateOrderValid) {
      $('endDate').setAttribute('aria-invalid', String(showErrors));
      firstInvalid ||= $('endDate');
    }
    updateExcelCompletion();
    if (firstInvalid && showErrors) {
      $('excelValidationSummary').className = 'excel-validation error';
      $('excelValidationSummary').textContent = dateOrderValid ? 'Periksa data wajib yang masih kosong atau tidak valid.' : 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.';
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !firstInvalid;
  }

  function updateMarginUI() {
    const custom = selectedValue('margin') === 'custom';
    $('customMarginWrap').hidden = !custom;
    $('customMarginSliderWrap').hidden = !custom;
    const margin = getMargin(false);
    const display = margin === null ? '—' : `${formatMargin(margin * 100)}%`;
    $('heroMargin').textContent = display;
    $('customMarginValue').textContent = display;
  }

  function calculateAndRender({ showErrors = false, scroll = false } = {}) {
    if (!validate(showErrors)) {
      state.result = null;
      setCalcStatus(showErrors ? 'error' : 'incomplete', showErrors ? 'Periksa input' : 'Belum lengkap');
      updateExcelCompletion();
      if (showErrors) $('netVendor').focus();
      return false;
    }
    setCalcStatus('ready', 'Menghitung…');
    const result = calculatePricing(collectInput(showErrors));
    state.result = result;
    state.hasCalculated = true;
    renderResult(result);
    setCalcStatus(result.budgetOver ? 'error' : 'ready', result.budgetOver ? 'Budget tidak cukup' : 'Up to date');
    updateExcelCompletion();
    if (scroll && window.matchMedia('(max-width: 960px)').matches) $('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function renderResult(r) {
    $('emptyResult').hidden = true;
    $('resultContent').hidden = false;
    $('analysis').hidden = false;
    const forward = r.mode === 'maju';
    $('printMeta').textContent = `Tanggal analisis: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    const status = $('resultStatus');
    status.className = `result-status ${r.budgetOver ? 'error' : 'ready'}`;
    status.textContent = r.budgetOver ? 'Budget tidak memadai' : (forward ? 'Siap ditawarkan' : 'Anggaran memadai');
    $('lastUpdated').textContent = `Diperbarui ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    $('resultEyebrow').textContent = forward ? 'Rekomendasi penawaran minimum' : 'Batas maksimal bayar vendor (net)';
    $('finalValue').textContent = r.budgetOver ? 'BUDGET OVER' : idr(r.finalValue);
    $('resultExplanation').textContent = r.budgetOver
      ? 'Biaya SDM, gudang, dan operasional telah melampaui kapasitas biaya pada budget dan margin yang dipilih.'
      : forward
        ? `Harga ini menutup seluruh biaya dasar dan mempertahankan target margin ${percent(r.margin)}${r.area === 'nonftz' ? ', termasuk PPN customer 1,1%.' : ' untuk transaksi FTZ.'}`
        : `Batas net vendor ini menjaga target margin ${percent(r.margin)} setelah biaya internal dan komponen lain diperhitungkan.`;
    $('profitValue').textContent = idr(r.profit);
    $('profitRate').textContent = percent(r.margin);
    $('baseCostValue').textContent = idr(r.baseCost);
    $('directCostValue').textContent = idr(r.directCost);
    $('customerTaxValue').textContent = idr(r.customerVat);
    $('customerTaxHint').textContent = r.area === 'nonftz' ? 'Non-FTZ · 1,1%' : 'Batam FTZ · tidak dikenakan';

    $('brutoVendor').textContent = idr(r.brutoVendor);
    $('brutoSDM').textContent = idr(r.brutoSDM);
    $('brutoGudang').textContent = idr(r.brutoGudang);
    $('opsValue').textContent = idr(r.netOps);
    $('totalDirect').textContent = idr(r.directCost);
    $('overheadValue').textContent = idr(r.overhead);
    $('cofValue').textContent = idr(r.cof);
    $('ppnCustomerValue').textContent = idr(r.customerVat);
    $('vendorTaxNote').textContent = r.isPKP ? 'PPh 2% + PPN 1,1%' : 'PPh 2%';
    $('breakdownTotalLabel').textContent = forward ? 'Total biaya dasar' : 'Target biaya dasar';
    $('breakdownTotalValue').textContent = idr(r.baseCost);

    renderChart(r);
    renderFormula(r);
    renderSensitivity(r);
    updateIntegrationUI();
  }

  function renderChart(r) {
    const data = r.mode === 'maju'
      ? [
          ['Biaya langsung', r.directCost], ['Profit', r.profit], ['OH + COF', r.overhead + r.cof], ['PPN customer', r.customerVat]
        ]
      : [
          ['Vendor net', r.finalValue], ['Biaya lain', r.brutoSDM + r.brutoGudang + r.netOps], ['OH + COF', r.overhead + r.cof], ['Profit', r.profit]
        ];
    const max = Math.max(...data.map(([, value]) => value), 1);
    $('chart').innerHTML = data.map(([label, value]) => {
      const height = value <= 0 ? 4 : Math.max(8, (value / max) * 165);
      return `<div class="chart-bar"><span style="height:${height}px" title="${label}: ${idr(value)}"></span><small>${label}</small></div>`;
    }).join('');
    $('chartLegend').innerHTML = data.map(([label, value]) => `<span>${label}: <strong>${idr(value)}</strong></span>`).join('');
    $('chart').setAttribute('aria-label', data.map(([label, value]) => `${label} ${idr(value)}`).join(', '));
  }

  function renderFormula(r) {
    const steps = r.mode === 'maju' ? [
      ['Gross-up vendor', 'Net vendor ÷ 98% (+ PPN vendor 1,1% bila PKP)', idr(r.brutoVendor)],
      ['Biaya langsung', 'Vendor bruto + SDM bruto + gudang bruto + operasional', idr(r.directCost)],
      ['Biaya dasar', 'Biaya langsung + overhead 1% + cost of fund', idr(r.baseCost)],
      ['DPP penawaran', `Biaya dasar ÷ (1 − ${percent(r.margin)})`, idr(r.dppOffer)],
      ['Total penawaran', 'DPP penawaran + PPN customer (bila non-FTZ)', idr(r.finalValue)]
    ] : [
      ['DPP budget', 'Budget customer ÷ 101,1% bila non-FTZ', idr(r.dppOffer)],
      ['Target biaya dasar', `DPP budget × (1 − ${percent(r.margin)})`, idr(r.baseCost)],
      ['Kapasitas biaya langsung', 'Target biaya dasar ÷ (1 + overhead 1% + COF)', idr(r.directCost)],
      ['Bruto vendor', 'Sisa kapasitas setelah SDM, gudang, dan operasional', idr(r.brutoVendor)],
      ['Net vendor', 'Bruto vendor × 98%', r.budgetOver ? 'Tidak tersedia' : idr(r.finalValue)]
    ];
    $('formulaSteps').innerHTML = steps.map(([name, formula, value], index) => `<div class="formula-step"><strong>${index + 1}. ${name}</strong><code>${formula}</code><small>Hasil: ${value}</small></div>`).join('');
  }

  function renderSensitivity(r) {
    const margins = [...new Set([0.10, Number(r.margin.toFixed(4)), 0.15])].sort((a, b) => a - b);
    $('sensitivityBody').innerHTML = margins.map((margin) => {
      const scenario = calculatePricing({ ...collectInput(false), margin });
      const active = Math.abs(margin - r.margin) < 0.00001;
      return `<tr><td><strong>${percent(margin)}${active ? ' · Aktif' : ''}</strong></td><td>${scenario.budgetOver ? 'BUDGET OVER' : idr(scenario.finalValue)}</td><td>${idr(scenario.profit)}</td><td><span class="status-chip ${scenario.budgetOver ? 'warning' : ''}">${scenario.budgetOver ? 'Tidak memadai' : 'Memadai'}</span></td></tr>`;
    }).join('');
  }

  function summaryText() {
    const r = state.result;
    if (!r) return '';
    return [
      `Mode: ${r.mode === 'maju' ? 'Hitung Penawaran' : 'Reverse Budget'}`,
      `Wilayah: ${r.area === 'ftz' ? 'Batam (FTZ)' : 'Luar Batam'}`,
      `Vendor PKP: ${r.isPKP ? 'Ya' : 'Tidak'}`,
      `Target Margin: ${percent(r.margin)}`,
      `${r.mode === 'maju' ? 'Rekomendasi Penawaran' : 'Batas Net Vendor'}: ${r.budgetOver ? 'BUDGET OVER' : idr(r.finalValue)}`,
      `Total Biaya Dasar: ${idr(r.baseCost)}`,
      `Profit Target: ${idr(r.profit)}`,
      `Status: ${r.budgetOver ? 'Budget tidak memadai' : 'Memadai'}`
    ].join('\n');
  }

  function resetAll() {
    state.mode = 'maju'; state.result = null; state.hasCalculated = false;
    state.lastConvertedFromReverse = false;
    document.querySelectorAll('#excelDetails input,#excelDetails textarea').forEach((field) => {
      field.value = field.defaultValue;
      field.removeAttribute('aria-invalid');
    });
    document.querySelector('input[name="area"][value="ftz"]').checked = true;
    document.querySelector('input[name="margin"][value="0.15"]').checked = true;
    document.querySelector('input[name="vendorChoice"][value="emy"]').checked = true;
    state.vendorChoice = 'emy';
    state.otherVendor = { name: '', nib: '', npwp: '' };
    updateVendorChoice({ preserveCurrent: false });
    $('customMargin').value = '12,5'; $('customMarginSlider').value = '12.5'; $('pkp').checked = false;
    moneyIds.forEach((id) => { $(id).value = ''; });
    $('emptyResult').hidden = false; $('resultContent').hidden = true; $('analysis').hidden = true;
    $('mainInputError').hidden = true; $('netVendor').closest('.money-field').classList.remove('invalid');
    setCalcStatus('incomplete', 'Belum lengkap');
    updateModeUI(); updateMarginUI(); updateExcelCompletion(); updateIntegrationUI();
    $('netVendor').focus();
    showToast('Form telah direset.');
  }

  function clearValues() {
    moneyIds.forEach((id) => { $(id).value = ''; });
    state.result = null; state.hasCalculated = false;
    state.lastConvertedFromReverse = false;
    $('emptyResult').hidden = false; $('resultContent').hidden = true; $('analysis').hidden = true;
    setCalcStatus('incomplete', 'Belum lengkap');
    updateExcelCompletion();
    updateIntegrationUI();
    $('netVendor').focus();
  }

  function proceedToExcel() {
    if (!state.result && !calculateAndRender({ showErrors: true })) {
      showToast('Masukkan nilai biaya terlebih dahulu.', 'error');
      return;
    }
    if (!state.result || !state.result.valid) {
      showToast('Perhitungan belum valid. Periksa kembali input.', 'error');
      return;
    }
    if (state.result.budgetOver) {
      showToast('Budget tidak memadai untuk dibuatkan dokumen CBA.', 'error');
      return;
    }

    const wasReverse = state.mode === 'mundur';
    let reverseNetVendor = 0;
    if (wasReverse) {
      reverseNetVendor = Math.round(state.result.finalValue);
      $('netVendor').value = formatInputValue(reverseNetVendor);
      state.lastConvertedFromReverse = true;
      state.mode = 'maju';
      updateModeUI();
      calculateAndRender();
    }

    setWorkflow('excel');

    if (wasReverse) {
      showToast(`Batas net vendor ${idr(reverseNetVendor)} diterapkan ke alur Excel CBA.`);
    } else {
      showToast('Hasil perhitungan berhasil diterapkan ke Buat Excel CBA.');
    }

    setTimeout(() => {
      $('excelDetails').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstInput = document.querySelector('#excelDetails input[data-excel-required]');
      if (firstInput) firstInput.focus();
    }, 120);
  }

  function handleExportBtnClick() {
    if (state.workflow === 'excel') {
      downloadExcel();
    } else {
      proceedToExcel();
    }
  }

  async function downloadExcel() {
    if (state.workflow !== 'excel') setWorkflow('excel', { scroll: true });
    if (state.mode !== 'maju') {
      state.mode = 'maju';
      updateModeUI();
    }
    if (!calculateAndRender({ showErrors: true })) return;
    if (!validateExcelDetails(true)) return;
    if (!window.CBAXlsx || typeof window.CBAXlsx.downloadWorkbook !== 'function') {
      showToast('Fitur Excel belum termuat. Muat ulang halaman lalu coba lagi.', 'error');
      return;
    }

    const buttons = [$('downloadExcelBtn'), $('exportBtn')];
    buttons.forEach((button) => { button.disabled = true; });
    $('downloadExcelBtn').querySelector('span').textContent = 'Menyiapkan workbook…';
    try {
      await window.CBAXlsx.downloadWorkbook({ result: { ...state.result }, details: collectExcelDetails() });
      showToast('Workbook Excel CBA berhasil dibuat.');
    } catch (error) {
      console.error(error);
      showToast(error && error.message ? error.message : 'Workbook Excel gagal dibuat.', 'error');
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
      $('downloadExcelBtn').querySelector('span').textContent = 'Buat file Excel CBA';
    }
  }

  async function copySummary() {
    if (!state.result && !calculateAndRender({ showErrors: true })) return;
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
    showToast('Ringkasan hasil disalin.');
  }

  let toastTimer;
  function showToast(message, type = 'success') {
    const toast = $('toast');
    toast.textContent = message;
    toast.style.background = type === 'error' ? '#8f251c' : '#0f172a';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function debounce(fn, delay = 180) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  const realtime = debounce(() => {
    state.lastConvertedFromReverse = false;
    updateMarginUI();
    if (state.hasCalculated || toNumber($('netVendor').value) > 0) calculateAndRender();
  });

  function bindEvents() {
    document.querySelectorAll('[data-workflow]').forEach((button) => button.addEventListener('click', () => {
      setWorkflow(button.dataset.workflow, { scroll: button.dataset.workflow === 'excel' });
    }));
    document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      updateModeUI();
      if (state.hasCalculated) calculateAndRender();
    }));
    document.querySelectorAll('input[name="area"],input[name="margin"]').forEach((input) => input.addEventListener('change', realtime));
    document.querySelectorAll('input[name="vendorChoice"]').forEach((input) => input.addEventListener('change', updateVendorChoice));
    $('customMargin').addEventListener('input', () => {
      const value = parseMargin($('customMargin').value);
      if (Number.isFinite(value) && value >= 10 && value <= 15) $('customMarginSlider').value = value;
      realtime();
    });
    $('customMargin').addEventListener('blur', () => {
      const value = parseMargin($('customMargin').value);
      if (Number.isFinite(value) && value >= 10 && value <= 15) $('customMargin').value = formatMargin(value);
      updateMarginUI();
    });
    $('customMarginSlider').addEventListener('input', () => {
      $('customMargin').value = formatMargin($('customMarginSlider').value);
      realtime();
    });
    $('pkp').addEventListener('change', realtime);
    moneyIds.forEach((id) => $(id).addEventListener('input', (event) => {
      const caretAtEnd = event.target.selectionStart === event.target.value.length;
      event.target.value = formatInputValue(event.target.value);
      if (caretAtEnd) event.target.setSelectionRange(event.target.value.length, event.target.value.length);
      realtime();
    }));
    excelFieldIds.forEach((id) => {
      const field = $(id);
      const update = () => {
        field.removeAttribute('aria-invalid');
        if (id === 'startDate') $('endDate').min = field.value;
        updateExcelCompletion();
      };
      field.addEventListener('input', update);
      field.addEventListener('change', update);
    });
    $('calculateBtn').addEventListener('click', () => calculateAndRender({ showErrors: true, scroll: true }));
    $('resetBtn').addEventListener('click', resetAll);
    $('clearValuesBtn').addEventListener('click', clearValues);
    $('copyBtn').addEventListener('click', copySummary);
    $('exportBtn').addEventListener('click', handleExportBtnClick);
    $('downloadExcelBtn').addEventListener('click', downloadExcel);
    $('printBtn').addEventListener('click', () => window.print());
    $('proceedToExcelBtn')?.addEventListener('click', proceedToExcel);
    $('editCalculationBtn')?.addEventListener('click', () => {
      $('inputs').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('netVendor').focus();
    });
  }

  function init() {
    bindEvents(); updateVendorChoice({ preserveCurrent: false }); setWorkflow('calculate'); updateMarginUI(); updateExcelCompletion();
    window.CBA = { calculatePricing, toNumber, idr, COF_RATE, collectExcelDetails };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
