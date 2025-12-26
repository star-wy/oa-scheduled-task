const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const fs = require('fs');

(async () => {
  console.log('正在启动本地测试...');

  // 尝试自动查找本地 Chrome 路径 (常见 Windows 路径)
  const localChromePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\' + require('os').userInfo().username + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
  ].find(path => fs.existsSync(path));

  if (!localChromePath) {
    console.error('错误: 未能在默认路径找到 Chrome 浏览器。请手动修改脚本中的 executablePath');
    process.exit(1);
  }

  console.log(`使用本地浏览器: ${localChromePath}`);

  let browser = null;
  try {
    // 启动浏览器
    browser = await puppeteer.launch({
      // 本地测试时必须设为 false 才能看到界面，设为 true 则后台运行
      headless: false, 
      executablePath: localChromePath, // 强制使用本地 Chrome
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();
    
    // --- 复制您的业务逻辑到这里 ---
    const targetUrl = 'http://115.236.22.132:88/wui/index.html#/?logintype=1&_key=sdphid';
    console.log(`正在访问: ${targetUrl}`);
    
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 30000 // 本地可以设置长一点
    });

    const title = await page.title();
    console.log(`页面标题: ${title}`);
    
    // // 截图验证
    // await page.screenshot({ path: 'local-test.png' });
    // console.log('已保存截图 local-test.png');

    // ----------------------------

  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('浏览器已关闭');
    }
  }
})();

