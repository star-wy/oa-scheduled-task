const { schedule } = require('@netlify/functions');
const chromium = require('chrome-aws-lambda');

// 核心任务逻辑
const taskHandler = async (event, context) => {
  console.log("启动定时任务 (chrome-aws-lambda v10.1.0)...");
  let browser = null;

  try {
    // 必须手动设置 executablePath，否则会在本地报错或云端找不到
    const executablePath = await chromium.executablePath;

    browser = await chromium.puppeteer.launch({
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
