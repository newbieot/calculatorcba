(() => {
  'use strict';

  const COF_RATE = (30 / 365) * 0.08;
  const STORAGE_KEY = 'cba-posnew-scenarios-v2';
  const MAX_SCENARIOS = 20;
  const state = { mode: 'maju', result: null, hasCalculated: false, scenarios: [] };
  const $ = (id) => document.getElementById(id);
  const moneyIds = ['netVendor', 'netSDM', 'netGudang', 'netOps'];

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
    const raw = Number(field.value);
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
    $('heroMode').textContent = forward ? 'Hitung Penawaran' : 'Reverse Budget';
    $('heroModeHint').textContent = forward ? 'Biaya → harga minimum' : 'Budget → batas vendor';
    $('sensitivityOutputHeading').textContent = forward ? 'Penawaran' : 'Batas vendor';
    document.title = forward ? 'CBA PosNew – Pricing Calculator' : 'CBA PosNew – Reverse Budget';
  }

  function updateMarginUI() {
    const custom = selectedValue('margin') === 'custom';
    $('customMarginWrap').hidden = !custom;
    const margin = getMargin(false);
    $('heroMargin').textContent = margin === null ? '—' : `${(margin * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
  }

  function calculateAndRender({ showErrors = false, scroll = false } = {}) {
    if (!validate(showErrors)) {
      state.result = null;
      setCalcStatus(showErrors ? 'error' : 'incomplete', showErrors ? 'Periksa input' : 'Belum lengkap');
      if (showErrors) $('netVendor').focus();
      return false;
    }
    setCalcStatus('ready', 'Menghitung…');
    const result = calculatePricing(collectInput(showErrors));
    state.result = result;
    state.hasCalculated = true;
    renderResult(result);
    setCalcStatus(result.budgetOver ? 'error' : 'ready', result.budgetOver ? 'Budget tidak cukup' : 'Up to date');
    $('saveState').textContent = 'Perubahan belum disimpan';
    if (scroll && window.matchMedia('(max-width: 960px)').matches) $('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function renderResult(r) {
    $('emptyResult').hidden = true;
    $('resultContent').hidden = false;
    $('analysis').hidden = false;
    const forward = r.mode === 'maju';
    const printProject = $('projectName').value.trim() || 'Tanpa nama skenario';
    const printAnalyst = $('analystName').value.trim();
    $('printMeta').textContent = `Skenario: ${printProject}${printAnalyst ? `\nDisusun oleh: ${printAnalyst}` : ''}\nTanggal analisis: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
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
    const name = $('projectName').value.trim() || 'Tanpa nama';
    return [
      `Nama Skenario: ${name}`,
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

  function buildScenario() {
    const r = state.result;
    return {
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      version: 2,
      createdAt: new Date().toISOString(),
      projectName: $('projectName').value.trim() || `Skenario ${new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}`,
      analystName: $('analystName').value.trim(),
      notes: $('projectNotes').value.trim(),
      input: collectInput(false),
      result: {
        finalValue: r.finalValue, profit: r.profit, baseCost: r.baseCost, directCost: r.directCost,
        budgetOver: r.budgetOver, mode: r.mode, margin: r.margin, area: r.area
      }
    };
  }

  function loadScenarios() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      state.scenarios = Array.isArray(parsed) ? parsed.filter((item) => item && item.input && item.result).slice(0, MAX_SCENARIOS) : [];
    } catch {
      state.scenarios = [];
      localStorage.removeItem(STORAGE_KEY);
      showToast('Data skenario lama rusak dan telah diabaikan.', 'error');
    }
    renderScenarios();
  }

  function persistScenarios() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scenarios));
      return true;
    } catch {
      showToast('Skenario gagal disimpan. Penyimpanan browser mungkin penuh.', 'error');
      return false;
    }
  }

  function saveScenario() {
    if (!state.result && !calculateAndRender({ showErrors: true })) return;
    const item = buildScenario();
    state.scenarios.unshift(item);
    state.scenarios = state.scenarios.slice(0, MAX_SCENARIOS);
    if (persistScenarios()) {
      $('saveState').textContent = 'Skenario tersimpan';
      renderScenarios();
      showToast(`Skenario “${item.projectName}” disimpan di perangkat ini.`);
    }
  }

  function renderScenarios() {
    const count = state.scenarios.length;
    $('scenarioCount').hidden = count === 0;
    $('scenarioCount').textContent = count;
    $('comparisonSection').hidden = count < 2;
    $('scenarioList').innerHTML = count ? state.scenarios.map((item) => `
      <div class="scenario-item">
        <div><strong>${escapeHtml(item.projectName)}</strong><small>${item.result.mode === 'maju' ? 'Penawaran' : 'Reverse'} · ${percent(item.result.margin)} · ${item.result.budgetOver ? 'BUDGET OVER' : idr(item.result.finalValue)}</small></div>
        <div class="scenario-item-actions"><button type="button" data-load="${item.id}">Muat</button><button type="button" class="danger" data-delete="${item.id}">Hapus</button></div>
      </div>`).join('') : '<div class="scenario-empty">Belum ada skenario tersimpan.</div>';
    $('comparisonBody').innerHTML = state.scenarios.slice(0, 8).map((item) => `<tr><td><strong>${escapeHtml(item.projectName)}</strong></td><td>${item.result.mode === 'maju' ? 'Penawaran' : 'Reverse'}</td><td>${percent(item.result.margin)}</td><td>${item.result.budgetOver ? 'BUDGET OVER' : idr(item.result.finalValue)}</td><td>${idr(item.result.profit)}</td><td><button class="scenario-action" type="button" data-load="${item.id}">Muat</button></td></tr>`).join('');
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function loadScenario(id) {
    const item = state.scenarios.find((scenario) => scenario.id === id);
    if (!item) return;
    const input = item.input;
    state.mode = input.mode;
    document.querySelector(`input[name="area"][value="${input.area}"]`).checked = true;
    const preset = [0.10, 0.15].includes(Number(input.margin)) ? String(Number(input.margin).toFixed(2)) : 'custom';
    document.querySelector(`input[name="margin"][value="${preset}"]`).checked = true;
    $('customMargin').value = (Number(input.margin) * 100).toFixed(1);
    $('pkp').checked = Boolean(input.isPKP);
    moneyIds.forEach((idKey) => { $(idKey).value = formatInputValue(input[idKey]); });
    $('projectName').value = item.projectName || '';
    $('analystName').value = item.analystName || '';
    $('projectNotes').value = item.notes || '';
    updateModeUI();
    updateMarginUI();
    calculateAndRender();
    $('saveState').textContent = 'Skenario dimuat';
    if ($('scenarioDialog').open) $('scenarioDialog').close();
    showToast(`Skenario “${item.projectName}” dimuat.`);
  }

  function deleteScenario(id) {
    state.scenarios = state.scenarios.filter((item) => item.id !== id);
    persistScenarios();
    renderScenarios();
    showToast('Skenario dihapus.');
  }

  function resetAll() {
    state.mode = 'maju'; state.result = null; state.hasCalculated = false;
    $('projectName').value = ''; $('analystName').value = ''; $('projectNotes').value = '';
    document.querySelector('input[name="area"][value="ftz"]').checked = true;
    document.querySelector('input[name="margin"][value="0.15"]').checked = true;
    $('customMargin').value = '12.5'; $('pkp').checked = false;
    moneyIds.forEach((id) => { $(id).value = ''; });
    $('emptyResult').hidden = false; $('resultContent').hidden = true; $('analysis').hidden = true;
    $('saveState').textContent = 'Belum disimpan';
    $('mainInputError').hidden = true; $('netVendor').closest('.money-field').classList.remove('invalid');
    setCalcStatus('incomplete', 'Belum lengkap');
    updateModeUI(); updateMarginUI();
    $('projectName').focus();
    showToast('Form telah direset.');
  }

  function clearValues() {
    moneyIds.forEach((id) => { $(id).value = ''; });
    state.result = null; state.hasCalculated = false;
    $('emptyResult').hidden = false; $('resultContent').hidden = true; $('analysis').hidden = true;
    setCalcStatus('incomplete', 'Belum lengkap');
    $('netVendor').focus();
  }

  function downloadJson() {
    if (!state.result && !calculateAndRender({ showErrors: true })) return;
    const payload = { exportedAt: new Date().toISOString(), appVersion: '2.0.0', scenario: buildScenario(), summary: summaryText() };
    const name = ($('projectName').value.trim() || 'cba-posnew').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name || 'cba-posnew'}-analysis.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('File analisis JSON berhasil dibuat.');
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
    updateMarginUI();
    if (state.hasCalculated || toNumber($('netVendor').value) > 0) calculateAndRender();
  });

  function bindEvents() {
    document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      updateModeUI();
      if (state.hasCalculated) calculateAndRender();
    }));
    document.querySelectorAll('input[name="area"],input[name="margin"]').forEach((input) => input.addEventListener('change', realtime));
    $('customMargin').addEventListener('input', realtime);
    $('pkp').addEventListener('change', realtime);
    moneyIds.forEach((id) => $(id).addEventListener('input', (event) => {
      const caretAtEnd = event.target.selectionStart === event.target.value.length;
      event.target.value = formatInputValue(event.target.value);
      if (caretAtEnd) event.target.setSelectionRange(event.target.value.length, event.target.value.length);
      realtime();
    }));
    ['projectName', 'analystName', 'projectNotes'].forEach((id) => $(id).addEventListener('input', () => { $('saveState').textContent = 'Perubahan belum disimpan'; }));
    $('calculateBtn').addEventListener('click', () => calculateAndRender({ showErrors: true, scroll: true }));
    $('resetBtn').addEventListener('click', resetAll);
    $('clearValuesBtn').addEventListener('click', clearValues);
    $('saveScenarioBtn').addEventListener('click', saveScenario);
    $('copyBtn').addEventListener('click', copySummary);
    $('exportBtn').addEventListener('click', downloadJson);
    $('printBtn').addEventListener('click', () => window.print());
    $('openScenariosBtn').addEventListener('click', () => $('scenarioDialog').showModal());
    $('scenarioList').addEventListener('click', (event) => {
      const load = event.target.closest('[data-load]'); const del = event.target.closest('[data-delete]');
      if (load) loadScenario(load.dataset.load); if (del) deleteScenario(del.dataset.delete);
    });
    $('comparisonBody').addEventListener('click', (event) => { const load = event.target.closest('[data-load]'); if (load) loadScenario(load.dataset.load); });
    $('clearScenariosBtn').addEventListener('click', () => {
      state.scenarios = []; persistScenarios(); renderScenarios(); showToast('Semua skenario tersimpan telah dihapus.');
    });
    $('scenarioDialog').addEventListener('click', (event) => {
      const rect = $('scenarioDialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('scenarioDialog').close();
    });
  }

  function init() {
    bindEvents(); updateModeUI(); updateMarginUI(); loadScenarios();
    window.CBA = { calculatePricing, toNumber, idr, COF_RATE };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
