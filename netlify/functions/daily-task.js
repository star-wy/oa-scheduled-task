const { schedule } = require('@netlify/functions');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// 核心任务逻辑
const taskHandler = async (event, context) => {
  console.log("启动定时任务 (@sparticuz/chromium)...");
  let browser = null;

  try {
    // 在 Netlify Functions 环境中使用 @sparticuz/chromium
    // 该包已包含所有必要的系统依赖，无需额外配置
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // --- 您的业务逻辑 ---
    const targetUrl = 'http://115.236.22.132:88/wui/index.html#/?logintype=1&_key=sdphid';
    console.log(`正在访问: ${targetUrl}`);
    
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 8000 
    });

    const title = await page.title();
    console.log(`页面标题: ${title}`);
    // -------------------

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Task success", title }),
    };

  } catch (error) {
    console.error("任务失败:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

module.exports.handler = schedule("@hourly", taskHandler);
