import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '../../../debug-5bfbd6.log');

export function debugLog(location, message, data = {}, hypothesisId = '') {
  // #region agent log
  try {
    const line = JSON.stringify({
      sessionId: '5bfbd6',
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    });
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    /* ignore */
  }
  // #endregion
}
