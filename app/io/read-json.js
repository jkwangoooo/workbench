export function readJsonFile(file, callback) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      callback(JSON.parse(String(reader.result)));
    } catch (error) {
      callback(null, [error.message || 'JSON 解析失败']);
    }
  };
  reader.onerror = () => callback(null, ['文件读取失败']);

  reader.readAsText(file, 'utf-8');
}
