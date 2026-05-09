const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');

function createWindow () {
  const win = new BrowserWindow({
    width: 640,
    height: 520,
    title: 'Excel 转 SRT 工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function convertTimecode(tc, fps) {
  const trimmed = String(tc).trim();
  if (!trimmed) throw new Error('时间码为空');

  // 匹配 HH:MM:SS:FF 或 HH:MM:SS,FF 或 HH:MM:SS.FF
  let match = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})[:;,.](\d{2,3})$/);
  if (match) {
    const [, h, m, s, f] = match;
    let ms;
    if (f.length === 3) {
      // 如果已经是3位，视为毫秒
      ms = parseInt(f, 10);
    } else {
      ms = Math.round(parseInt(f, 10) / fps * 1000);
    }
    return `${h}:${m}:${s},${ms.toString().padStart(3, '0')}`;
  }

  // 匹配纯 HH:MM:SS（无帧）
  match = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, h, m, s] = match;
    return `${h}:${m}:${s},000`;
  }

  throw new Error(`时间码格式错误: "${trimmed}"，要求格式为 HH:MM:SS:FF`);
}

ipcMain.handle('convert', async (event, filePath, fps) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      throw new Error('不支持的文件格式，仅支持 .xlsx、.xls 和 .csv');
    }

    // 对 xlsx 检测是否内嵌图片
    if (ext === '.xlsx') {
      try {
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        const hasImage = entries.some(e => e.entryName.startsWith('xl/media/'));
        if (hasImage) {
          throw new Error('检测到表格内嵌图片，请移除图片后再试');
        }
      } catch (zipErr) {
        // 如果 zip 解析失败（文件损坏），报错
        if (zipErr.message.includes('图片')) throw zipErr;
        throw new Error('无法解析该 xlsx 文件，文件可能已损坏');
      }
    }

    // 读取 Excel/CSV
    let workbook;
    try {
      workbook = XLSX.readFile(filePath, { type: 'file' });
    } catch (readErr) {
      throw new Error('读取文件失败: ' + readErr.message);
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('表格中没有工作表');
    }
    const worksheet = workbook.Sheets[firstSheetName];

    // 转为二维数组，defval 保证空单元格为空字符串
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    // 过滤掉完全空白的行
    const validRows = data.filter(row => row.some(cell => String(cell).trim() !== ''));
    if (validRows.length === 0) {
      throw new Error('表格中没有有效数据');
    }

    // 取第一行有数据的列数，要求恰好3列
    const firstRow = validRows[0];
    const colCount = firstRow.length;
    if (colCount < 3) {
      throw new Error(`表格仅有 ${colCount} 列，要求至少 3 列（入点、出点、字幕内容）`);
    }
    if (colCount > 3) {
      throw new Error(`表格有 ${colCount} 列，要求恰好 3 列（入点、出点、字幕内容），请删除多余列`);
    }

    const srtLines = [];
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const start = String(row[0]).trim();
      const end = String(row[1]).trim();
      const text = String(row[2]).trim();

      if (!start && !end && !text) continue; // 跳过全空行
      if (!start || !end || !text) {
        throw new Error(`第 ${i + 1} 行数据不完整，入点、出点、字幕内容均不能为空`);
      }

      const startSrt = convertTimecode(start, fps);
      const endSrt = convertTimecode(end, fps);

      srtLines.push(`${srtLines.length / 4 + 1}`);
      srtLines.push(`${startSrt} --> ${endSrt}`);
      srtLines.push(`${text}`);
      srtLines.push('');
    }

    const outputPath = filePath.replace(/\.(xlsx|xls|csv)$/i, '.srt');
    fs.writeFileSync(outputPath, srtLines.join('\n'), 'utf-8');

    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
