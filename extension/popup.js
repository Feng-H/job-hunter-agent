document.addEventListener('DOMContentLoaded', () => {
  const serverInput = document.getElementById('server-url');
  const tokenInput = document.getElementById('token');
  const btnSave = document.getElementById('btn-save');
  const btnTest = document.getElementById('btn-test');
  const statusMsg = document.getElementById('status-msg');
  const autoSyncToggle = document.getElementById('auto-sync-toggle');

  // 读取已存配置
  chrome.storage.sync.get(['serverUrl', 'collectorToken', 'autoSync'], (res) => {
    serverInput.value = res.serverUrl || 'http://127.0.0.1:8765';
    tokenInput.value = res.collectorToken || '';
    autoSyncToggle.checked = res.autoSync !== false; // 默认开启
  });

  // 自动同步开关即时生效
  autoSyncToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoSync: autoSyncToggle.checked }, () => {
      showStatus(autoSyncToggle.checked
        ? '✅ 自动同步已开启：浏览岗位时自动采集，无需手动点击。'
        : 'ℹ️ 自动同步已关闭：仅可通过悬浮胶囊手动批量同步。');
    });
  });

  function showStatus(text, isError = false) {
    statusMsg.className = 'status-box ' + (isError ? 'status-error' : 'status-success');
    statusMsg.innerText = text;
    statusMsg.style.display = 'block';
  }

  // 保存
  btnSave.addEventListener('click', () => {
    const serverUrl = serverInput.value.trim().replace(/\/+$/, '');
    const collectorToken = tokenInput.value.trim();

    if (!serverUrl) {
      showStatus('请输入服务地址', true);
      return;
    }

    chrome.storage.sync.set({ serverUrl, collectorToken, autoSync: autoSyncToggle.checked }, () => {
      showStatus('✅ 配置已保存！自动采集模式已就绪。');
    });
  });

  // 测试连通性
  btnTest.addEventListener('click', async () => {
    const serverUrl = serverInput.value.trim().replace(/\/+$/, '');
    const collectorToken = tokenInput.value.trim();

    if (!serverUrl) {
      showStatus('请先输入服务地址', true);
      return;
    }

    btnTest.innerText = '正在检测...';
    try {
      const res = await fetch(`${serverUrl}/healthz`, { method: 'GET' });
      if (res.ok) {
        showStatus('✅ 服务连通成功！Job-Hunter 运行正常。');
      } else {
        showStatus(`⚠️ 服务可达但返回状态码: ${res.status}`, true);
      }
    } catch (e) {
      showStatus(`❌ 无法连接到服务: ${e.message}。请检查网址及网络。`, true);
    } finally {
      btnTest.innerText = '🔌 测试连通性';
    }
  });
});
