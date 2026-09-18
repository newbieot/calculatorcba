(() => {
  'use strict';

  const TEMPLATE_URL = 'assets/templates/cba-template.xlsx?v=20260918-1';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');
  const COF_RATE = (30 / 365) * 0.08;

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function findEndOfCentralDirectory(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const min = Math.max(0, bytes.length - 65557);
    for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    throw new Error('Template Excel tidak memiliki struktur ZIP yang valid.');
  }

  function parseZip(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(bytes);
    const totalEntries = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const entries = [];

    for (let i = 0; i < totalEntries; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Direktori ZIP template Excel rusak.');
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;

      entries.push({
        name: decoder.decode(nameBytes),
        nameBytes,
        versionMade: view.getUint16(offset + 4, true),
        versionNeeded: view.getUint16(offset + 6, true),
        flags: view.getUint16(offset + 8, true),
        method: view.getUint16(offset + 10, true),
        modTime: view.getUint16(offset + 12, true),
        modDate: view.getUint16(offset + 14, true),
        crc: view.getUint32(offset + 16, true),
        compressedSize,
        uncompressedSize: view.getUint32(offset + 24, true),
        internalAttributes: view.getUint16(offset + 36, true),
        externalAttributes: view.getUint32(offset + 38, true),
        localExtra: bytes.slice(localOffset + 30 + localNameLength, dataOffset),
        centralExtra: bytes.slice(offset + 46 + nameLength, offset + 46 + nameLength + extraLength),
        comment: bytes.slice(offset + 46 + nameLength + extraLength, offset + 46 + nameLength + extraLength + commentLength),
        compressedData: bytes.slice(dataOffset, dataOffset + compressedSize),
        replacement: null
      });
      offset += 46 + nameLength + extraLength + commentLength;
    }

    return { entries };
  }

  async function decompress(entry) {
    if (entry.replacement) return entry.replacement;
    if (entry.method === 0) return entry.compressedData;
    if (entry.method !== 8 || typeof DecompressionStream === 'undefined') {
      throw new Error('Browser ini belum mendukung pembacaan template Excel. Gunakan Chrome atau Edge terbaru.');
    }
    const stream = new Blob([entry.compressedData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function findEntry(archive, name) {
    const entry = archive.entries.find((item) => item.name === name);
    if (!entry) throw new Error(`Bagian template Excel tidak ditemukan: ${name}`);
    return entry;
  }

  async function readText(archive, name) {
    return decoder.decode(await decompress(findEntry(archive, name)));
  }

  function writeText(archive, name, text) {
    findEntry(archive, name).replacement = encoder.encode(text);
  }

  function removeEntries(archive, names) {
    const remove = new Set(names);
    archive.entries = archive.entries.filter((entry) => !remove.has(entry.name));
  }

  function concatBytes(parts, totalLength) {
    const output = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function buildZip(archive) {
    const localParts = [];
    const centralParts = [];
    let localLength = 0;

    archive.entries.forEach((entry) => {
      const data = entry.replacement || entry.compressedData;
      const method = entry.replacement ? 0 : entry.method;
      const compressedSize = data.length;
      const uncompressedSize = entry.replacement ? data.length : entry.uncompressedSize;
      const crc = entry.replacement ? crc32(data) : entry.crc;
      const flags = entry.flags & ~0x0008;
      const localHeader = new Uint8Array(30);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, entry.versionNeeded, true);
      localView.setUint16(6, flags, true);
      localView.setUint16(8, method, true);
      localView.setUint16(10, entry.modTime, true);
      localView.setUint16(12, entry.modDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, compressedSize, true);
      localView.setUint32(22, uncompressedSize, true);
      localView.setUint16(26, entry.nameBytes.length, true);
      localView.setUint16(28, entry.localExtra.length, true);
      const localOffset = localLength;
      localParts.push(localHeader, entry.nameBytes, entry.localExtra, data);
      localLength += localHeader.length + entry.nameBytes.length + entry.localExtra.length + data.length;

      const centralHeader = new Uint8Array(46);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, entry.versionMade, true);
      centralView.setUint16(6, entry.versionNeeded, true);
      centralView.setUint16(8, flags, true);
      centralView.setUint16(10, method, true);
      centralView.setUint16(12, entry.modTime, true);
      centralView.setUint16(14, entry.modDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, compressedSize, true);
      centralView.setUint32(24, uncompressedSize, true);
      centralView.setUint16(28, entry.nameBytes.length, true);
      centralView.setUint16(30, entry.centralExtra.length, true);
      centralView.setUint16(32, entry.comment.length, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, entry.internalAttributes, true);
      centralView.setUint32(38, entry.externalAttributes, true);
      centralView.setUint32(42, localOffset, true);
      centralParts.push(centralHeader, entry.nameBytes, entry.centralExtra, entry.comment);
    });

    const centralLength = centralParts.reduce((sum, part) => sum + part.length, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(8, archive.entries.length, true);
    eocdView.setUint16(10, archive.entries.length, true);
    eocdView.setUint32(12, centralLength, true);
    eocdView.setUint32(16, localLength, true);
    return concatBytes([...localParts, ...centralParts, eocd], localLength + centralLength + eocd.length);
  }

  function escapeXml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function columnNumber(reference) {
    const letters = reference.match(/[A-Z]+/i)[0].toUpperCase();
    let number = 0;
    for (let i = 0; i < letters.length; i += 1) number = (number * 26) + letters.charCodeAt(i) - 64;
    return number;
  }

  function cellMarkup(reference, existingMarkup, type, value, formula) {
    const open = existingMarkup ? existingMarkup.match(/^<c\b[^>]*?(?:\/>|>)/)[0] : `<c r="${reference}">`;
    let attributes = open.replace(/^<c\b|\/>$|>$/g, '').replace(/\s+t="[^"]*"/g, '');
    if (!/\sr="/.test(attributes)) attributes += ` r="${reference}"`;
    if (type === 'text') {
      attributes += ' t="inlineStr"';
      const preserve = /^\s|\s$|\n/.test(String(value ?? '')) ? ' xml:space="preserve"' : '';
      return `<c${attributes}><is><t${preserve}>${escapeXml(value)}</t></is></c>`;
    }
    const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
    const formulaMarkup = formula ? `<f>${escapeXml(formula)}</f>` : '';
    return `<c${attributes}>${formulaMarkup}<v>${numeric}</v></c>`;
  }

  function setCell(xml, reference, type, value, formula = '') {
    const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${escapeRegex(reference)}"(?:\\s|\\/|>))[^>]*?(?:\\/\\s*>|>[\\s\\S]*?<\\/c>)`);
    const match = xml.match(cellPattern);
    const markup = cellMarkup(reference, match ? match[0] : '', type, value, formula);
    if (match) return xml.replace(cellPattern, markup);

    const rowNumber = Number(reference.match(/\d+/)[0]);
    const rowPattern = new RegExp(`<row\\b[^>]*\\br="${rowNumber}"[^>]*>[\\s\\S]*?<\\/row>`);
    const rowMatch = xml.match(rowPattern);
    if (!rowMatch) throw new Error(`Baris ${rowNumber} tidak ditemukan pada template Excel.`);
    const cells = [...rowMatch[0].matchAll(/<c\b(?=[^>]*\br="([A-Z]+\d+)"(?:\s|\/|>))[^>]*?(?:\/\s*>|>[\s\S]*?<\/c>)/g)];
    const targetColumn = columnNumber(reference);
    const nextCell = cells.find((item) => columnNumber(item[1]) > targetColumn);
    const nextRow = nextCell ? rowMatch[0].replace(nextCell[0], `${markup}${nextCell[0]}`) : rowMatch[0].replace('</row>', `${markup}</row>`);
    return xml.replace(rowPattern, nextRow);
  }

  function setText(xml, reference, value) {
    return setCell(xml, reference, 'text', value);
  }

  function setNumber(xml, reference, value) {
    return setCell(xml, reference, 'number', value);
  }

  function setFormula(xml, reference, formula, value) {
    return setCell(xml, reference, 'number', value, formula);
  }

  function clearCell(xml, reference) {
    const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${escapeRegex(reference)}"(?:\\s|\\/|>))[^>]*?(?:\\/\\s*>|>[\\s\\S]*?<\\/c>)`);
    const match = xml.match(cellPattern);
    if (!match) return xml;
    const open = match[0].match(/^<c\b[^>]*?(?:\/>|>)/)[0];
    const attributes = open.replace(/^<c\b|\/>$|>$/g, '').replace(/\s+t="[^"]*"/g, '');
    return xml.replace(cellPattern, `<c${attributes}/>`);
  }

  function clearRows(xml, firstRow, lastRow) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowPattern = new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*>[\\s\\S]*?<\\/row>`);
      const match = xml.match(rowPattern);
      if (!match) continue;
      const cleared = match[0].replace(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (cell, attrs) => `<c${attrs.replace(/\s+t="[^"]*"/g, '')}/>`);
      xml = xml.replace(rowPattern, cleared);
    }
    return xml;
  }

  function renameFormulaReferences(xml) {
    return xml.replace(/'rekap CBA 1'/g, "'Rekap CBA 1'");
  }

  function excelSerial(dateValue) {
    const [year, month, day] = String(dateValue).split('-').map(Number);
    return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function parseDate(dateValue) {
    const [year, month, day] = String(dateValue).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function formatDate(dateValue) {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseDate(dateValue));
  }

  function formatPeriod(startDate, endDate) {
    return `${formatDate(startDate)} S/D ${formatDate(endDate)}`;
  }

  function todayLabel() {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  }

  function safeNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function updateWorkbookMetadata(xml) {
    xml = xml.replace(/<sheet\b[^>]*name="Packing List"[^>]*\/>/, '');
    xml = xml.replace(/name="rekap CBA 1"/, 'name="Rekap CBA 1"');
    xml = xml.replace(/name="SOW SHADOW"/, 'name="SOW Shadow"');
    xml = xml.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g, (full, attrs, body) => {
      if (/Packing List/.test(body) || /_FilterDatabase/.test(attrs)) return '';
      const local = attrs.match(/localSheetId="(\d+)"/);
      let nextAttrs = attrs;
      if (local && Number(local[1]) > 1) nextAttrs = attrs.replace(local[0], `localSheetId="${Number(local[1]) - 1}"`);
      return `<definedName${nextAttrs}>${body.replace(/'rekap CBA 1'/g, "'Rekap CBA 1'").replace(/'SOW SHADOW'/g, "'SOW Shadow'")}</definedName>`;
    });
    xml = xml.replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
    return xml;
  }

  function updateAppProperties(xml) {
    xml = xml.replace(/(<vt:lpstr>Worksheets<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)6(<\/vt:i4>)/, '$15$2');
    xml = xml.replace(/<vt:vector size="10" baseType="lpstr">/, '<vt:vector size="9" baseType="lpstr">');
    xml = xml.replace('<vt:lpstr>Packing List</vt:lpstr>', '');
    return xml.replace(/rekap CBA 1/g, 'Rekap CBA 1').replace(/SOW SHADOW/g, 'SOW Shadow');
  }

  function updateCoreProperties(xml) {
    const iso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    return xml.replace(/<dcterms:modified[^>]*>[\s\S]*?<\/dcterms:modified>/, `<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>`);
  }

  function updateCbaSheet(xml, payload) {
    const { result: r, details: d } = payload;
    const weight = safeNumber(d.shipmentWeight);
    const packages = safeNumber(d.packageCount);
    const vendorBeforeVat = safeNumber(r.brutoVendorBeforeVat);
    const vendorVat = safeNumber(r.vendorVat);
    const vendorGross = safeNumber(r.brutoVendor);
    const vendorWithholding = vendorBeforeVat * 0.02;
    const vendorPayment = vendorBeforeVat + vendorVat - vendorWithholding;
    const documentDate = `${d.originCity || 'Batam'}, ${todayLabel()}`;

    xml = renameFormulaReferences(clearRows(xml, 15, 35));
    xml = setText(xml, 'A5', `${d.projectId} ${d.projectName}`.trim());
    xml = setText(xml, 'A6', String(d.originCity || 'Batam').toUpperCase());
    xml = setNumber(xml, 'A14', 1);
    xml = setText(xml, 'B14', d.destinationCity);
    xml = setNumber(xml, 'C14', weight);
    xml = setNumber(xml, 'D14', packages);
    xml = setFormula(xml, 'E14', 'IF(C14=0,0,F14/C14)', weight ? r.dppOffer / weight : 0);
    xml = setNumber(xml, 'F14', r.dppOffer);
    xml = setNumber(xml, 'G14', r.customerVat);
    xml = setNumber(xml, 'H14', 0);
    xml = setNumber(xml, 'I14', 0);
    xml = setNumber(xml, 'J14', 0);
    xml = setFormula(xml, 'K14', 'SUM(F14:J14)', r.finalValue);
    xml = setNumber(xml, 'L14', 0);
    xml = setNumber(xml, 'M14', 1);
    xml = setNumber(xml, 'N14', vendorGross);
    xml = setNumber(xml, 'O14', vendorBeforeVat);
    xml = setNumber(xml, 'P14', vendorVat);
    xml = setNumber(xml, 'Q14', vendorWithholding);
    xml = setFormula(xml, 'R14', 'O14+P14-Q14', vendorPayment);
    xml = setNumber(xml, 'S14', vendorGross);
    xml = setNumber(xml, 'T14', r.brutoSDM);
    xml = setNumber(xml, 'U14', r.netOps);
    xml = setFormula(xml, 'V14', 'SUM(L14,S14:U14)', vendorGross + r.brutoSDM + r.netOps);
    xml = setNumber(xml, 'W14', 0);
    xml = setNumber(xml, 'X14', r.brutoGudang);
    xml = setFormula(xml, 'Y14', 'SUM(V14:X14)', r.directCost);
    xml = setFormula(xml, 'Z14', 'Y14*$Z$12', r.overhead);
    xml = setFormula(xml, 'AA14', 'Y14*$AA$12', r.cof);
    xml = setNumber(xml, 'AB14', 0);
    xml = setNumber(xml, 'AC14', 0);
    xml = setFormula(xml, 'AD14', 'SUM(Z14:AC14)', r.overhead + r.cof);
    xml = setFormula(xml, 'AE14', 'Y14+AD14', r.baseCost);
    xml = setFormula(xml, 'AF14', 'F14-AE14', r.profit);
    xml = setFormula(xml, 'AG14', 'IF(F14=0,0,AF14/F14)', r.margin);

    const sumColumns = ['C', 'D', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF'];
    const totals = {
      C: weight, D: packages, F: r.dppOffer, G: r.customerVat, H: 0, I: 0, J: 0, K: r.finalValue,
      L: 0, N: vendorGross, O: vendorBeforeVat, P: vendorVat, Q: vendorWithholding, R: vendorPayment,
      S: vendorGross, T: r.brutoSDM, U: r.netOps, V: vendorGross + r.brutoSDM + r.netOps, W: 0,
      X: r.brutoGudang, Y: r.directCost, Z: r.overhead, AA: r.cof, AB: 0, AC: 0,
      AD: r.overhead + r.cof, AE: r.baseCost, AF: r.profit
    };
    sumColumns.forEach((column) => { xml = setFormula(xml, `${column}36`, `SUM(${column}14:${column}35)`, totals[column]); });
    xml = setFormula(xml, 'AG36', 'IF(F36=0,0,AF36/F36)', r.margin);
    xml = setText(xml, 'AC38', documentDate);
    xml = clearCell(xml, 'U38');
    return xml;
  }

  function updateRecapSheet(xml, payload) {
    const { result: r, details: d } = payload;
    const weight = safeNumber(d.shipmentWeight);
    const direct = safeNumber(r.directCost);
    const period = formatPeriod(d.startDate, d.endDate);
    const documentDate = `${d.originCity || 'Batam'}, ${todayLabel()}`;

    xml = renameFormulaReferences(xml);
    xml = setText(xml, 'D6', d.customerName);
    xml = setText(xml, 'D7', d.commodity);
    xml = setText(xml, 'D8', d.destinationCity);
    xml = setText(xml, 'D9', d.serviceType);
    xml = setText(xml, 'D10', d.transportMode);
    xml = setFormula(xml, 'D11', 'SUM(D12:D15)', r.finalValue);
    xml = setFormula(xml, 'D12', "='CBA2'!F36", r.dppOffer);
    xml = setFormula(xml, 'D13', "='CBA2'!G36", r.customerVat);
    xml = setNumber(xml, 'D14', 0);
    xml = setNumber(xml, 'D15', 0);
    xml = setNumber(xml, 'D17', weight);
    xml = setText(xml, 'D18', period);
    xml = setText(xml, 'D19', d.paymentTerm);

    for (let row = 22; row <= 42; row += 1) {
      xml = setNumber(xml, `E${row}`, 0);
      xml = setNumber(xml, `F${row}`, 0);
      xml = setNumber(xml, `G${row}`, 0);
    }
    xml = setNumber(xml, 'F22', r.brutoSDM);
    xml = setNumber(xml, 'G22', r.brutoSDM);
    xml = setFormula(xml, 'E23', 'SUM(E22)', 0);
    xml = setFormula(xml, 'F23', 'SUM(F22)', r.brutoSDM);
    xml = setFormula(xml, 'G23', 'SUM(G22)', r.brutoSDM);
    xml = setNumber(xml, 'G24', 0);
    xml = setNumber(xml, 'F27', r.brutoGudang);
    xml = setNumber(xml, 'G27', r.brutoGudang);
    xml = setNumber(xml, 'F30', r.brutoVendor);
    xml = setNumber(xml, 'G30', r.brutoVendor);
    xml = setNumber(xml, 'F33', r.netOps);
    xml = setNumber(xml, 'G33', r.netOps);
    xml = setFormula(xml, 'E34', 'SUM(E25:E33)', 0);
    xml = setFormula(xml, 'F34', 'SUM(F25:F33)', r.brutoGudang + r.brutoVendor + r.netOps);
    xml = setFormula(xml, 'G34', 'SUM(G25:G33)', r.brutoGudang + r.brutoVendor + r.netOps);
    xml = setFormula(xml, 'E38', 'SUM(E36:E37)', 0);
    xml = setFormula(xml, 'F38', 'SUM(F36:F37)', 0);
    xml = setFormula(xml, 'G38', 'SUM(G36:G37)', 0);
    xml = setFormula(xml, 'E42', 'SUM(E40:E41)', 0);
    xml = setFormula(xml, 'F42', 'SUM(F40:F41)', 0);
    xml = setFormula(xml, 'G42', 'SUM(G40:G41)', 0);
    xml = setFormula(xml, 'E44', 'E42+E38+E34+E23', 0);
    xml = setFormula(xml, 'F44', 'F42+F38+F34+F23', direct);
    xml = setFormula(xml, 'G44', 'G42+G38+G34+G23', direct);
    xml = setFormula(xml, 'G45', 'G44', direct);
    xml = setFormula(xml, 'F46', 'G46/D12', r.margin);
    xml = setNumber(xml, 'G46', r.profit);
    xml = setFormula(xml, 'G47', 'SUM(G45:G46)', direct + r.profit);
    xml = setNumber(xml, 'F48', 0.01);
    xml = setNumber(xml, 'G48', r.overhead);
    xml = setFormula(xml, 'G49', 'SUM(G47:G48)', direct + r.profit + r.overhead);
    xml = setNumber(xml, 'F50', COF_RATE);
    xml = setNumber(xml, 'G50', r.cof);
    xml = setFormula(xml, 'G51', 'G49+G50', r.dppOffer);
    xml = setNumber(xml, 'G52', 0);
    xml = setNumber(xml, 'F53', 0);
    xml = setNumber(xml, 'G53', 0);
    xml = setFormula(xml, 'G54', 'SUM(G51:G53)', r.dppOffer);
    xml = setNumber(xml, 'G55', r.customerVat);
    xml = setFormula(xml, 'G56', 'SUM(G54:G55)', r.finalValue);
    xml = setFormula(xml, 'G57', 'IF(D17=0,0,G56/D17)', weight ? r.finalValue / weight : 0);
    xml = setText(xml, 'G59', documentDate);
    return xml;
  }

  function updateRblSheet(xml, payload) {
    const { result: r, details: d } = payload;
    const weight = safeNumber(d.shipmentWeight);
    const documentDate = `${d.originCity || 'Batam'}, ${todayLabel()}`;
    xml = renameFormulaReferences(xml);
    xml = setText(xml, 'B4', d.customerName);
    xml = setText(xml, 'B5', `ID PROYEK : ${d.projectId} ${d.projectName}`.trim());
    xml = setNumber(xml, 'E9', 0);
    xml = setFormula(xml, 'E10', "='CBA2'!S36", r.brutoVendor);
    xml = setNumber(xml, 'E11', 0);
    xml = setNumber(xml, 'E12', r.brutoGudang);
    xml = setNumber(xml, 'E13', r.netOps);
    xml = setFormula(xml, 'E16', 'SUM(E9:E13)', r.brutoVendor + r.brutoGudang + r.netOps);
    xml = setNumber(xml, 'E18', 0);
    xml = setNumber(xml, 'E19', 0);
    xml = setNumber(xml, 'E20', 0);
    xml = setFormula(xml, 'E21', 'SUM(E18:E20)', 0);
    xml = setNumber(xml, 'E24', r.brutoSDM);
    xml = setNumber(xml, 'E25', 0);
    xml = setNumber(xml, 'E26', 0);
    xml = setFormula(xml, 'E27', 'SUM(E24:E26)', r.brutoSDM);
    xml = setFormula(xml, 'E28', 'E16+E21+E27', r.directCost);
    xml = setNumber(xml, 'E29', weight);
    xml = setFormula(xml, 'E30', 'IF(E29=0,0,E28/E29)', weight ? r.directCost / weight : 0);
    xml = setText(xml, 'F33', documentDate);
    return xml;
  }

  function updateRbl2Sheet(xml, payload) {
    const { details: d } = payload;
    xml = renameFormulaReferences(xml);
    xml = setText(xml, 'A4', d.commodity);
    xml = setText(xml, 'A5', formatPeriod(d.startDate, d.endDate));
    xml = setText(xml, 'F41', `${d.originCity || 'Batam'}, ${todayLabel()}`);
    return xml;
  }

  function updateSowSheet(xml, payload) {
    const d = payload.details;
    const vendor = d.vendorName || 'CV EMY RIZKY JAYA';
    xml = setText(xml, 'D3', `${d.projectId} | ${d.projectName}`);
    xml = setText(xml, 'B7', d.customerName);
    xml = setText(xml, 'F7', d.projectLocation || `${d.originCity} - ${d.destinationCity}`);
    xml = setText(xml, 'B9', d.customerPic);
    xml = setText(xml, 'F9', String(d.originCity || 'Batam').toUpperCase());
    xml = setText(xml, 'B11', d.customerAddress);
    xml = setText(xml, 'F11', d.internalPic);
    xml = setText(xml, 'B13', d.customerPhone);
    xml = setText(xml, 'B15', d.customerEmail || '');
    xml = setText(xml, 'B17', d.operationDescription);
    xml = setText(xml, 'B20', d.originCity);
    xml = setText(xml, 'D20', d.originAddress);
    xml = setText(xml, 'B22', d.destinationCity);
    xml = setText(xml, 'D22', d.destinationAddress);
    xml = setNumber(xml, 'F22', 1);
    xml = setText(xml, 'D23', d.cargoType);
    xml = setText(xml, 'D24', d.shipmentForm);
    xml = setText(xml, 'D25', d.projectPurpose);
    xml = setText(xml, 'D26', d.executionFrequency);
    xml = setText(xml, 'D27', `${d.shipmentWeight} Kg`);
    xml = setText(xml, 'G27', '=');
    xml = setText(xml, 'H27', `${d.shipmentWeight} Kg`);
    xml = setText(xml, 'D28', d.packageDimensions || '-');
    xml = setText(xml, 'D29', `${d.packageCount} Koli`);
    xml = setText(xml, 'D30', d.estimatedTrip);
    xml = setText(xml, 'D31', d.operationPattern);
    xml = setText(xml, 'D32', d.serviceType);
    xml = setText(xml, 'D33', d.vehicleType);
    xml = setText(xml, 'D42', vendor);
    xml = setText(xml, 'D43', d.vendorNib || '-');
    xml = setText(xml, 'D44', d.vendorNpwp || '-');
    xml = setText(xml, 'D45', vendor);
    xml = setText(xml, 'B51', `5. Jatuh Tempo Customer maksimal ${d.paymentTerm} setelah tagihan diterima lengkap`);
    xml = setText(xml, 'B52', `6. Jatuh Tempo Vendor maksimal 1 bulan setelah tagihan diterima lengkap dari ${vendor}`);
    xml = setNumber(xml, 'B55', excelSerial(d.startDate));
    xml = setNumber(xml, 'F55', excelSerial(d.endDate));
    return xml;
  }

  async function createWorkbook(templateBuffer, payload) {
    if (!payload || !payload.result || !payload.details) throw new Error('Data ekspor Excel belum lengkap.');
    const archive = parseZip(templateBuffer);

    writeText(archive, 'xl/workbook.xml', updateWorkbookMetadata(await readText(archive, 'xl/workbook.xml')));
    writeText(
      archive,
      'xl/_rels/workbook.xml.rels',
      (await readText(archive, 'xl/_rels/workbook.xml.rels'))
        .replace(/<Relationship\b[^>]*Id="rId2"[^>]*\/>/, '')
        .replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/, '')
    );
    writeText(
      archive,
      '[Content_Types].xml',
      (await readText(archive, '[Content_Types].xml'))
        .replace(/<Override\b[^>]*PartName="\/xl\/worksheets\/sheet2\.xml"[^>]*\/>/, '')
        .replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '')
    );
    writeText(archive, 'docProps/app.xml', updateAppProperties(await readText(archive, 'docProps/app.xml')));
    writeText(archive, 'docProps/core.xml', updateCoreProperties(await readText(archive, 'docProps/core.xml')));
    writeText(archive, 'xl/worksheets/sheet1.xml', updateCbaSheet(await readText(archive, 'xl/worksheets/sheet1.xml'), payload));
    writeText(archive, 'xl/worksheets/sheet3.xml', updateRecapSheet(await readText(archive, 'xl/worksheets/sheet3.xml'), payload));
    writeText(archive, 'xl/worksheets/sheet4.xml', updateRblSheet(await readText(archive, 'xl/worksheets/sheet4.xml'), payload));
    writeText(archive, 'xl/worksheets/sheet5.xml', updateRbl2Sheet(await readText(archive, 'xl/worksheets/sheet5.xml'), payload));
    writeText(archive, 'xl/worksheets/sheet6.xml', updateSowSheet(await readText(archive, 'xl/worksheets/sheet6.xml'), payload));

    const diagramPng = payload.diagramBytes || (await generateDiagramPngBytes(payload.details));
    if (diagramPng && diagramPng.length > 0) {
      const imgEntry = archive.entries.find((entry) => entry.name === 'xl/media/image3.png');
      if (imgEntry) {
        imgEntry.replacement = diagramPng instanceof Uint8Array ? diagramPng : new Uint8Array(diagramPng);
      }
    }

    const sowRels = 'xl/worksheets/_rels/sheet6.xml.rels';
    if (archive.entries.some((entry) => entry.name === sowRels)) {
      const emailTarget = payload.details.customerEmail ? `mailto:${escapeXml(payload.details.customerEmail)}` : 'mailto:';
      writeText(archive, sowRels, (await readText(archive, sowRels)).replace(/Target="mailto:[^"]*"/, `Target="${emailTarget}"`));
    }

    removeEntries(archive, ['xl/worksheets/sheet2.xml', 'xl/worksheets/_rels/sheet2.xml.rels', 'xl/calcChain.xml']);
    return buildZip(archive);
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function drawOperationDiagram(canvas, details = {}) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const scale = W / 1874;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#f8fafc');
    bgGrad.addColorStop(0.5, '#f0f5fb');
    bgGrad.addColorStop(1, '#e9f1f9');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(200, 215, 235, 0.45)';
    ctx.lineWidth = 1;
    for (let x = 40 * scale; x < W; x += 60 * scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 40 * scale; y < H; y += 60 * scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const customer = details.customerName || details.customerPic || 'Bapak Lukmanur';
    const commodity = details.commodity || 'Barang Pindah';
    const origin = details.originCity || 'Batam';
    const destination = details.destinationCity || 'Tangerang';
    const originAddress = details.originAddress || `Sukajadi, ${origin}`;
    const destAddress = details.destinationAddress || `Jl. Merak Raya No 173, ${destination}`;
    const pattern = details.operationPattern || 'Door to Door';
    const vehicle = details.vehicleType || 'CDD';
    const transport = details.transportMode || 'Darat';
    const tripTime = details.estimatedTrip || '14 Hari';

    // Header Banner
    const bannerX = 40 * scale;
    const bannerY = 24 * scale;
    const bannerW = W - 80 * scale;
    const bannerH = 94 * scale;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 18 * scale;
    ctx.shadowOffsetY = 8 * scale;

    const headerGrad = ctx.createLinearGradient(bannerX, bannerY, bannerX + bannerW, bannerY + bannerH);
    headerGrad.addColorStop(0, '#102a5c');
    headerGrad.addColorStop(0.5, '#1e3a8a');
    headerGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = headerGrad;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 22 * scale);
      ctx.fill();
    } else {
      ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    }
    ctx.restore();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(26 * scale) + 'px "Segoe UI", Inter, Roboto, sans-serif';
    const titleText = `POLA OPERASI PENGIRIMAN ${commodity.toUpperCase()} (${customer.toUpperCase()}) - ${origin.toUpperCase()} KE ${destination.toUpperCase()}`;
    ctx.fillText(titleText, W / 2, bannerY + 34 * scale);

    // Subtitle capsule
    const subpillW = Math.min(bannerW - 60 * scale, 1280 * scale);
    const subpillH = 32 * scale;
    const subpillX = (W - subpillW) / 2;
    const subpillY = bannerY + bannerH - 40 * scale;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(subpillX, subpillY, subpillW, subpillH, 16 * scale);
      ctx.fill();
    } else {
      ctx.fillRect(subpillX, subpillY, subpillW, subpillH);
    }

    ctx.fillStyle = '#bfdbfe';
    ctx.font = '700 ' + Math.round(15 * scale) + 'px "Segoe UI", Inter, Roboto, sans-serif';
    const subText = `SKEMA: ${pattern.toUpperCase()}  |  ARMADA: ${vehicle.toUpperCase()}  |  MODA: ${transport.toUpperCase()} & PENYEBERANGAN RORO  |  ESTIMASI: ${tripTime.toUpperCase()}`;
    ctx.fillText(subText, W / 2, subpillY + subpillH / 2);

    function drawCard(x, y, w, h, stepNum, title, lines, options = {}) {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 30, 60, 0.08)';
      ctx.shadowBlur = 14 * scale;
      ctx.shadowOffsetY = 6 * scale;

      ctx.fillStyle = options.bg || '#ffffff';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 18 * scale);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      ctx.strokeStyle = options.borderColor || '#d5e0ee';
      ctx.lineWidth = 1.5 * scale;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 18 * scale);
        ctx.stroke();
      }

      ctx.fillStyle = options.accentColor || '#ef4123';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, 6 * scale, [18 * scale, 18 * scale, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, 6 * scale);
      }

      const badgeR = 18 * scale;
      const badgeX = x + 30 * scale;
      const badgeY = y + 36 * scale;

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = options.badgeBg || '#ef4123';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + Math.round(18 * scale) + 'px "Segoe UI", sans-serif';
      ctx.fillText(String(stepNum), badgeX, badgeY);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold ' + Math.round(17 * scale) + 'px "Segoe UI", sans-serif';
      ctx.fillText(title, badgeX + badgeR + 12 * scale, badgeY);

      let lineY = y + 74 * scale;
      lines.forEach((line) => {
        if (line.bold) {
          ctx.fillStyle = line.color || '#1e3a8a';
          ctx.font = 'bold ' + Math.round(15 * scale) + 'px "Segoe UI", sans-serif';
        } else {
          ctx.fillStyle = line.color || '#475569';
          ctx.font = Math.round(14 * scale) + 'px "Segoe UI", sans-serif';
        }
        let text = line.text;
        const maxTextW = w - 40 * scale;
        while (ctx.measureText(text).width > maxTextW && text.length > 3) {
          text = text.slice(0, -4) + '...';
        }
        ctx.fillText(text, x + 20 * scale, lineY);
        lineY += 23 * scale;
      });

      if (options.iconType) {
        drawStepIcon(ctx, x + w - 55 * scale, y + 42 * scale, 28 * scale, options.iconType);
      }
    }

    function drawStepIcon(ctx, cx, cy, size, type) {
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.fillStyle = '#eff6ff';
      ctx.lineWidth = 2 * scale;

      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#1d4ed8';
      ctx.fillStyle = '#1d4ed8';

      if (type === 'truck') {
        ctx.strokeRect(cx - 15 * scale, cy - 8 * scale, 18 * scale, 14 * scale);
        ctx.strokeRect(cx + 3 * scale, cy - 2 * scale, 10 * scale, 8 * scale);
        ctx.beginPath();
        ctx.arc(cx - 7 * scale, cy + 8 * scale, 3.5 * scale, 0, Math.PI * 2);
        ctx.arc(cx + 8 * scale, cy + 8 * scale, 3.5 * scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'box') {
        ctx.strokeRect(cx - 10 * scale, cy - 10 * scale, 20 * scale, 20 * scale);
        ctx.beginPath();
        ctx.moveTo(cx - 10 * scale, cy); ctx.lineTo(cx + 10 * scale, cy);
        ctx.moveTo(cx, cy - 10 * scale); ctx.lineTo(cx, cy + 10 * scale);
        ctx.stroke();
      } else if (type === 'customs') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 12 * scale);
        ctx.lineTo(cx + 10 * scale, cy - 6 * scale);
        ctx.lineTo(cx + 8 * scale, cy + 8 * scale);
        ctx.lineTo(cx, cy + 14 * scale);
        ctx.lineTo(cx - 8 * scale, cy + 8 * scale);
        ctx.lineTo(cx - 10 * scale, cy - 6 * scale);
        ctx.closePath();
        ctx.stroke();
      } else if (type === 'ship') {
        ctx.beginPath();
        ctx.moveTo(cx - 14 * scale, cy + 4 * scale);
        ctx.lineTo(cx + 14 * scale, cy + 4 * scale);
        ctx.lineTo(cx + 10 * scale, cy + 10 * scale);
        ctx.lineTo(cx - 10 * scale, cy + 10 * scale);
        ctx.closePath();
        ctx.stroke();
        ctx.fillRect(cx - 4 * scale, cy - 8 * scale, 8 * scale, 8 * scale);
      } else if (type === 'road') {
        ctx.beginPath();
        ctx.moveTo(cx - 10 * scale, cy + 12 * scale); ctx.lineTo(cx - 4 * scale, cy - 12 * scale);
        ctx.moveTo(cx + 10 * scale, cy + 12 * scale); ctx.lineTo(cx + 4 * scale, cy - 12 * scale);
        ctx.moveTo(cx, cy - 4 * scale); ctx.lineTo(cx, cy + 6 * scale);
        ctx.stroke();
      } else if (type === 'delivery') {
        ctx.beginPath();
        ctx.moveTo(cx - 8 * scale, cy); ctx.lineTo(cx - 2 * scale, cy + 6 * scale); ctx.lineTo(cx + 10 * scale, cy - 6 * scale);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawArrow(x1, y1, x2, y2, color = '#2563eb') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrowLen = 12 * scale;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - arrowLen * Math.cos(angle - Math.PI / 6), y2 - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - arrowLen * Math.cos(angle + Math.PI / 6), y2 - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const colW = (W - 130 * scale) / 3;
    const row1Y = 145 * scale;
    const rowH = 265 * scale;
    const row2Y = row1Y + rowH + 45 * scale;

    const c1X = 40 * scale;
    const c2X = c1X + colW + 25 * scale;
    const c3X = c2X + colW + 25 * scale;

    drawCard(c1X, row1Y, colW, rowH, 1, 'PENJEMPUTAN (PICKUP)', [
      { text: 'Lokasi Penjemputan:', bold: true },
      { text: originAddress },
      { text: 'Kota Asal: ' + origin, bold: true },
      { text: 'Armada: 1 Unit ' + vehicle },
      { text: 'Pickup langsung di alamat muat (Door)' }
    ], { iconType: 'truck' });

    drawArrow(c1X + colW, row1Y + rowH / 2, c2X, row1Y + rowH / 2);

    drawCard(c2X, row1Y, colW, rowH, 2, 'STANDARISASI KEAMANAN', [
      { text: 'Di Kantor Pos ' + origin, bold: true },
      { text: '• Pembuatan Packing Bubble Wrap' },
      { text: '• Wrapping Plastic & Perlindungan Kargo' },
      { text: '• Validasi Final Packing List' },
      { text: '• Pemeriksaan kelayakan barang muatan' }
    ], { iconType: 'box' });

    drawArrow(c2X + colW, row1Y + rowH / 2, c3X, row1Y + rowH / 2);

    drawCard(c3X, row1Y, colW, rowH, 3, 'PROSES KEPABEANAN (PPFTZ01)', [
      { text: 'Regulasi Free Trade Zone (' + origin + '):', bold: true },
      { text: 'A. Input Manifest via Sistem Ion Beta' },
      { text: 'B. Wawancara Pemilik (BC Batu Ampar)' },
      { text: 'C. Pemeriksaan Fisik (TPS Pos Batam)' },
      { text: 'D. Penerbitan SPPB & Penyegelan Truk' }
    ], { iconType: 'customs', accentColor: '#1d4ed8', badgeBg: '#1d4ed8' });

    drawArrow(c3X + colW / 2, row1Y + rowH, c3X + colW / 2, row2Y, '#ea580c');

    drawCard(c1X, row2Y, colW, rowH, 4, 'PENYEBERANGAN RORO', [
      { text: 'Mobilisasi ke Pelabuhan Punggur:', bold: true },
      { text: '• Pelepasan segel & stiker oleh Bea Cukai' },
      { text: '• Masuk kapal penyeberangan RoRo' },
      { text: 'Tiba di Pelabuhan Tj. Buton (Riau)', bold: true },
      { text: '• Pemeriksaan kelengkapan manifest darat' }
    ], { iconType: 'ship' });

    drawCard(c2X, row2Y, colW, rowH, 5, 'MOBILISASI DARAT AKHIR', [
      { text: 'Perjalanan Darat Lintas Provinsi:', bold: true },
      { text: '• Rute Buton menuju ' + destination },
      { text: '• Monitoring perjalanan armada' },
      { text: '• Estimasi Waktu Tempuh: ' + tripTime, bold: true },
      { text: '• Pengawalan dokumen delivery note' }
    ], { iconType: 'road' });

    drawArrow(c1X + colW, row2Y + rowH / 2, c2X, row2Y + rowH / 2);

    drawCard(c3X, row2Y, colW, rowH, 6, 'PENGANTARAN & BONGKAR', [
      { text: 'Tiba di ' + destination + ' (Door Delivery):', bold: true },
      { text: 'Alamat Bongkar: ' + destAddress },
      { text: 'Penerima / PIC: ' + customer, bold: true },
      { text: '• Proses bongkar muatan & serah terima' },
      { text: '• Penandatanganan Berita Acara / SPK' }
    ], { iconType: 'delivery', accentColor: '#059669', badgeBg: '#059669' });

    drawArrow(c2X + colW, row2Y + rowH / 2, c3X, row2Y + rowH / 2);

    const footY = H - 36 * scale;
    ctx.fillStyle = '#64748b';
    ctx.font = Math.round(13 * scale) + 'px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CBA PosNew · Standard Operating Procedure (SOP) Pola Operasi SOW', 40 * scale, footY);
    ctx.textAlign = 'right';
    ctx.fillText('Dokumen Pendukung CBA & SOW Shadow · PT Pos Indonesia', W - 40 * scale, footY);
  }

  async function generateDiagramPngBytes(details = {}) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1874;
    canvas.height = 1048;
    drawOperationDiagram(canvas, details);
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        try {
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        } catch {
          resolve(null);
        }
      }, 'image/png');
    });
  }

  async function downloadWorkbook(payload) {
    const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Template Excel tidak dapat dimuat. Coba muat ulang halaman.');
    const bytes = await createWorkbook(await response.arrayBuffer(), payload);
    const blob = new Blob([bytes], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const project = slug(payload.details.projectId || payload.details.projectName) || 'proyek';
    const destination = slug(payload.details.destinationCity);
    anchor.href = url;
    anchor.download = `CBA-${project}${destination ? `-${destination}` : ''}.xlsx`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.CBAXlsx = { createWorkbook, downloadWorkbook, drawOperationDiagram, generateDiagramPngBytes, slug };
})();
