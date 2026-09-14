const XLSX_PATTERN = /\.xlsx?$/i;

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some((value) => value !== ''));
}

export function readRows(file, callback) {
  const isWorkbook = XLSX_PATTERN.test(file.name);
  const reader = new FileReader();

  reader.onload = () => {
    try {
      if (isWorkbook) {
        if (!window.XLSX) {
          callback(null, ['缺少 Excel 解析库，无法读取该文件；请改用 CSV 模板']);
          return;
        }
        const workbook = window.XLSX.read(reader.result, { type: 'array' });
        callback(window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }));
        return;
      }
      callback(parseCsvText(reader.result));
    } catch (error) {
      callback(null, [error.message || '文件读取失败']);
    }
  };
  reader.onerror = () => callback(null, ['文件读取失败']);

  if (isWorkbook) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, 'utf-8');
}
