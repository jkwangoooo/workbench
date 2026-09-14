// IndexedDB 文件存储（需求 §4 / L5-1）
//
// 工作文件的二进制内容存 IndexedDB（localStorage 上限约 5MB 放不下 50MB 文件），
// 元数据仍在 LOCAL_KEYS.resources，两者用同一个 file id 关联。
// 本模块只负责 Blob 的 put/get/delete 与全量导出/导入，不做业务判断。

const DB_NAME = 'teacher-workbench';
const STORE = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'));
  });
}

/** 写入一个文件 Blob，key 为 file id。 */
export function putFile(id, blob) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('写入文件失败'));
        };
      })
  );
}

/** 读取一个文件 Blob，key 为 file id。不存在时 resolve null。 */
export function getFile(id) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          reject(req.error || new Error('读取文件失败'));
        };
      })
  );
}

/** 删除一个文件 Blob。 */
export function deleteFile(id) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('删除文件失败'));
        };
      })
  );
}

/** 导出全部文件为 { id: base64DataUrl }，供备份打包。 */
export function exportFiles() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = db.transaction(STORE, 'readonly').objectStore(STORE);
        const result = {};
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            db.close();
            resolve(result);
            return;
          }
          const blob = cursor.value;
          const reader = new FileReader();
          reader.onload = () => {
            result[cursor.key] = reader.result; // data URL
            cursor.continue();
          };
          reader.onerror = () => {
            cursor.continue();
          };
          reader.readAsDataURL(blob);
        };
        req.onerror = () => {
          db.close();
          reject(req.error || new Error('导出文件失败'));
        };
      })
  );
}

/** 从 { id: base64DataUrl } 恢复全部文件。 */
export function importFiles(map) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const [id, dataUrl] of Object.entries(map || {})) {
          const [header, base64] = String(dataUrl).split(',');
          if (!header || !base64) continue;
          const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          store.put(new Blob([bytes], { type: mime }), id);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('恢复文件失败'));
        };
      })
  );
}
