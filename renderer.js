const dropZone = document.getElementById('dropZone');
const statusDiv = document.getElementById('status');
const fpsInput = document.getElementById('fps');
const selectBtn = document.getElementById('selectBtn');

function showStatus(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.className = 'status ' + (type || '');
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
  document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

async function doConvert(filePath) {
  const fps = parseInt(fpsInput.value, 10) || 25;
  showStatus('正在处理，请稍候...', 'info');
  const result = await window.api.convert(filePath, fps);
  if (result.success) {
    showStatus('转换成功：' + result.outputPath, 'success');
  } else {
    showStatus(result.error, 'error');
  }
}

function resolveFilePath(file, dataTransfer) {
  // 方法1：Electron 官方推荐方式 webUtils.getPathForFile
  if (window.api.getPathForFile) {
    const p = window.api.getPathForFile(file);
    if (p) return p;
  }

  // 方法2：File.path（部分场景有效）
  if (file.path) return file.path;

  // 方法3：从 dataTransfer 获取 URI list
  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    const uri = uriList.split('\n')[0].trim();
    if (uri.startsWith('file://')) {
      let p = decodeURIComponent(uri.replace(/^file:\/\//, ''));
      // Windows 路径处理
      if (/^[a-zA-Z]:/.test(p)) {
        return p.replace(/\//g, '\\');
      }
      return p;
    }
    return uri;
  }

  // 方法4：从 dataTransfer 获取纯文本路径
  const plain = dataTransfer.getData('text/plain');
  if (plain && plain.trim()) return plain.trim();

  return null;
}

dropZone.addEventListener('drop', async (e) => {
  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  const filePath = resolveFilePath(file, e.dataTransfer);

  if (!filePath) {
    const isWin = navigator.platform.toLowerCase().includes('win');
    showStatus(
      isWin
        ? '无法获取文件路径，请点击下方的"选择文件"按钮'
        : '无法获取文件路径，请从 Finder 文件夹中拖放文件，不要从微信/QQ/浏览器直接拖放',
      'error'
    );
    return;
  }
  await doConvert(filePath);
});

selectBtn.addEventListener('click', async () => {
  showStatus('等待选择文件...', 'info');
  const selectResult = await window.api.selectFile();
  if (selectResult.canceled) {
    showStatus('', '');
    return;
  }
  await doConvert(selectResult.filePath);
});
