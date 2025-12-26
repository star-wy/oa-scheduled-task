const { schedule } = require('@netlify/functions');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// 核心任务逻辑
const taskHandler = async (event, context) => {
  console.log("启动定时任务...");
  let browser = null;

  try {
    // 启动 Serverless 版 Chrome
    // @sparticuz/chromium v112 的配置方式
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // --- 您的业务逻辑开始 ---
    
    const targetUrl = 'http://115.236.22.132:88/wui/index.html#/?logintype=1&_key=sdphid';
    console.log(`正在访问: ${targetUrl}`);
    
    // 注意：Netlify 函数有 10秒 超时限制 (免费版)
    // 必须设置较短的超时，防止整个函数崩溃
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 8000 
    });

    const title = await page.title();
    console.log(`页面标题: ${title}`);

    // 这里可以添加更多操作...
    // await page.click('#login-btn');

    // --- 业务逻辑结束 ---

    console.log("任务执行成功");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Task executed successfully", title: title }),
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

// 配置定时规则
// 格式: cron 表达式 (分钟 小时 日 月 周)
// 示例: "0 8 * * *" 每天早上 8 点执行
// 示例: "@hourly" 每小时执行
// 注意: 时间为 UTC 时间 (北京时间 -8小时)

module.exports.handler = schedule("@hourly", taskHandler);

