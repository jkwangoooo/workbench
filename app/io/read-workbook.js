export function readRows(file, callback) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (window.XLSX && /\.xlsx?$/i.test(file.name)) {
        const workbook = window.XLSX.read(reader.result, { type: 'array' });
        callback(window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }));
      } else
        callback(
          String(reader.result)
            .split(/\r?\n/)
            .filter((line) => line.trim() !== '')
            .map((line) => line.split(',').map((value) => value.trim().replace(/^"|"$/g, '')))
        );
    } catch (error) {
      callback(null, [error.message || '文件读取失败']);
    }
  };
  reader.onerror = () => callback(null, ['文件读取失败']);
  reader.readAsArrayBuffer(file);
}
