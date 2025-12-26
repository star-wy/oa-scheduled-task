/**
 * Netlify Functions 定时任务
 * 功能：使用 Puppeteer 自动化访问指定网页并执行任务
 * 执行频率：每天 8:40 执行一次（北京时间）
 * Cron 表达式：40 0 * * * (UTC 时间 0:40，对应北京时间 8:40)
 */

// Netlify Functions 的定时任务调度器
const { schedule } = require('@netlify/functions');
// Netlify Functions 环境专用的 Chromium 二进制文件（已包含所有系统依赖）
const chromium = require('@sparticuz/chromium');
// Puppeteer 核心库（用于浏览器自动化）
const puppeteer = require('puppeteer-core');
// 文件系统模块（用于读取打卡辅助脚本）
const fs = require('fs');
const path = require('path');

/**
 * 登录配置
 * 可以通过环境变量设置账号密码
 */
const LOGIN_CONFIG = {
  username: process.env.LOGIN_USERNAME || '15518278335',
  password: process.env.LOGIN_PASSWORD || '19980622..wy000',
  selectors: {
    usernameInput: [
      '#loginid',
      'input[name="username"]',
      'input[name="user"]',
      'input[name="account"]',
      'input[type="text"]',
      'input[placeholder*="账号"]',
      'input[placeholder*="用户名"]',
      'input[id*="user"]',
      'input[id*="account"]',
      '#username',
      '#user',
      '#account'
    ],
    passwordInput: [
      '#userpassword',
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="密码"]',
      'input[id*="password"]',
      '#password',
      '#pwd'
    ],
    loginButton: [
      '#submit',
      'button[type="submit"]',
      'input[type="submit"]',
      'button.login',
      'button.btn-login',
      '.login-btn',
      '#loginBtn',
      '#login'
    ]
  }
};

/**
 * 自动登录函数
 * @param {Object} page - Puppeteer 页面对象
 * @param {String} username - 用户名
 * @param {String} password - 密码
 * @returns {Boolean} 是否登录成功
 */
async function performLogin(page, username, password) {
  console.log("\n开始执行登录流程...");
  
  if (!username || !password) {
    console.warn("⚠ 警告: 未设置账号或密码，跳过登录步骤");
    return false;
  }

  try {
    // 等待页面完全加载
    await page.waitForTimeout(10000);
    
    // 在页面上下文中执行登录逻辑
    const loginResult = await page.evaluate(async (config) => {
      const { username, password, selectors } = config;
      
      // 辅助函数：通过文本内容查找按钮
      function findButtonByText(texts) {
        const buttons = document.querySelectorAll('button, input[type="submit"], a.btn, .btn');
        for (const button of buttons) {
          const buttonText = button.textContent || button.value || button.innerText || '';
          for (const text of texts) {
            if (buttonText.includes(text)) {
              return button;
            }
          }
        }
        return null;
      }
      
      // 查找用户名输入框
      let usernameInput = null;
      let foundUsernameSelector = null;
      for (const selector of selectors.usernameInput) {
        try {
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null) {
            usernameInput = element;
            foundUsernameSelector = selector;
            break;
          }
        } catch (e) {}
      }
      
      // 查找密码输入框
      let passwordInput = null;
      let foundPasswordSelector = null;
      for (const selector of selectors.passwordInput) {
        try {
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null) {
            passwordInput = element;
            foundPasswordSelector = selector;
            break;
          }
        } catch (e) {}
      }
      
      // 查找登录按钮
      let loginButton = null;
      let foundButtonSelector = null;
      
      // 方法1: 通过选择器查找
      for (const selector of selectors.loginButton) {
        try {
          if (selector.includes(':contains')) continue;
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null) {
            loginButton = element;
            foundButtonSelector = selector;
            break;
          }
        } catch (e) {}
      }
      
      // 方法2: 如果没找到，通过文本内容查找
      if (!loginButton) {
        const buttonTexts = ['登录', '登陆', 'Login', 'LOGIN', '登 录'];
        loginButton = findButtonByText(buttonTexts);
        if (loginButton) {
          foundButtonSelector = '通过文本内容找到';
        }
      }
      
      const result = {
        foundUsernameSelector,
        foundPasswordSelector,
        foundButtonSelector
      };
      
      if (!usernameInput) {
        result.success = false;
        result.error = '未找到用户名输入框';
        return result;
      }
      
      if (!passwordInput) {
        result.success = false;
        result.error = '未找到密码输入框';
        return result;
      }
      
      if (!loginButton) {
        result.success = false;
        result.error = '未找到登录按钮';
        return result;
      }
      
      // 输入用户名
      usernameInput.focus();
      usernameInput.value = username;
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
      usernameInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      usernameInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      
      // 输入密码
      passwordInput.focus();
      passwordInput.value = password;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
      passwordInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      passwordInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      
      // 等待一下，确保输入完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 点击登录按钮
      loginButton.click();
      
      result.success = true;
      result.message = '登录操作已执行';
      return result;
    }, {
      username,
      password,
      selectors: LOGIN_CONFIG.selectors
    });
    
    if (loginResult.success) {
      console.log("✓ " + loginResult.message);
      console.log(`✓ 找到用户名输入框: ${loginResult.foundUsernameSelector}`);
      console.log(`✓ 找到密码输入框: ${loginResult.foundPasswordSelector}`);
      console.log(`✓ 找到登录按钮: ${loginResult.foundButtonSelector}`);
      
      // 等待页面响应（登录后的跳转或加载）
      console.log("等待登录响应...");
      await page.waitForTimeout(3000);
      
      return true;
    } else {
      console.error("✗ 登录失败: " + loginResult.error);
      return false;
    }
    
  } catch (error) {
    console.error("✗ 登录过程出错:", error.message);
    return false;
  }
}

/**
 * 执行打卡操作
 * @param {Object} page - Puppeteer 页面对象
 * @param {String} punchType - 打卡类型："on"（上班）或 "off"（下班）
 * @returns {Object} 打卡结果
 */
async function performPunch(page, punchType) {
  console.log(`\n开始执行打卡操作（类型: ${punchType}）...`);
  
  try {
    // 读取打卡辅助脚本（尝试多个可能的路径）
    const possiblePaths = [
      path.join(__dirname, 'punch-helper.js'),           // 同目录下
      path.join(__dirname, '../../punch-helper.js'),      // 项目根目录
      path.join(process.cwd(), 'punch-helper.js'),        // 当前工作目录
      path.join(process.cwd(), 'netlify/functions/punch-helper.js') // 完整路径
    ];
    
    let punchHelperPath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        punchHelperPath = testPath;
        console.log(`✓ 找到打卡辅助脚本: ${testPath}`);
        break;
      }
    }
    
    if (!punchHelperPath) {
      console.warn("⚠️ 未找到 punch-helper.js 文件，尝试的路径:");
      possiblePaths.forEach(p => console.warn(`  - ${p}`));
      return { success: false, error: '未找到打卡辅助脚本' };
    }
    
    const punchHelperCode = fs.readFileSync(punchHelperPath, 'utf-8');
    
    // 等待页面完全加载，确保页面框架已初始化
    console.log("等待页面完全加载（等待 WeaTools 可用）...");
    await page.waitForTimeout(5000);
    
    // 注入打卡辅助脚本到页面并执行打卡
    const punchResult = await page.evaluate(async (scriptCode, punchType) => {
      // 注入脚本代码
      const script = document.createElement('script');
      script.textContent = scriptCode;
      document.head.appendChild(script);
      
      // 等待 PunchHelper 可用
      let retries = 0;
      while (!window.PunchHelper && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
      }
      
      if (!window.PunchHelper) {
        return {
          success: false,
          error: 'PunchHelper 未加载，请检查脚本是否正确注入'
        };
      }
      
      // 等待 WeaTools 可用（最多等待 10 秒）
      let weaToolsRetries = 0;
      let weaTools = null;
      while (!weaTools && weaToolsRetries < 10) {
        weaTools = window.PunchHelper.findWeaTools();
        if (!weaTools) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          weaToolsRetries++;
        }
      }
      
      if (!weaTools) {
        return {
          success: false,
          error: 'WeaTools 未找到，请确保页面已完全加载'
        };
      }
      
      try {
        // 执行打卡，根据打卡类型传递时间信息
        const punchTimeInfo = punchType === 'on' 
          ? { time: { name: '上午上班打卡' } }
          : { time: { name: '下午下班打卡' } };
        
        const result = await window.PunchHelper.punch(punchTimeInfo);
        return {
          success: result !== null,
          result: result
        };
      } catch (error) {
        return {
          success: false,
          error: error.message || String(error)
        };
      }
    }, punchHelperCode, punchType);
    
    return punchResult;
  } catch (error) {
    console.error("✗ 打卡过程出错:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 核心任务处理函数
 * @param {Object} event - Netlify Functions 事件对象
 * @param {Object} context - Netlify Functions 上下文对象
 * @returns {Object} HTTP 响应对象
 */
const taskHandler = async (event, context) => {
  console.log("启动定时任务 (@sparticuz/chromium)...");
  let browser = null;

  try {
    // 获取 Chromium 可执行文件路径
    // @sparticuz/chromium 已为 Netlify Functions 环境优化，无需额外配置系统依赖
    const executablePath = await chromium.executablePath();

    // 启动 Puppeteer 浏览器实例
    // 使用 @sparticuz/chromium 提供的预配置参数，适配无服务器环境
    browser = await puppeteer.launch({
      args: chromium.args,                    // Chromium 启动参数（已优化）
      defaultViewport: chromium.defaultViewport, // 默认视口大小
      executablePath: executablePath,         // Chromium 可执行文件路径
      headless: chromium.headless,            // 无头模式（无 GUI）
      ignoreHTTPSErrors: true,                // 忽略 HTTPS 证书错误
    });

    // 创建新页面
    const page = await browser.newPage();
    
    // --- 业务逻辑：访问目标网页 ---
    // 目标 URL：需要访问的网页地址
    const targetUrl = 'http://115.236.22.132:88/wui/index.html#/?logintype=1&_key=sdphid';
    console.log(`正在访问: ${targetUrl}`);
    
    // 导航到目标页面（使用重试机制）
    // waitUntil: 'domcontentloaded' - 等待 DOM 加载完成即可（比 networkidle2 更宽松）
    // timeout: 120000 - 超时时间 120 秒（增加超时时间）
    let pageLoaded = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!pageLoaded && retryCount < maxRetries) {
      try {
        console.log(`尝试加载页面 (第 ${retryCount + 1}/${maxRetries} 次)...`);
        await page.goto(targetUrl, { 
          waitUntil: 'domcontentloaded',  // 改为更宽松的等待策略
          timeout: 120000,                  // 增加到 120 秒
          waitForSelector: false           // 不等待特定选择器
        });
        pageLoaded = true;
        console.log("✓ 页面加载成功");
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error(`✗ 页面加载失败（已重试 ${maxRetries} 次）:`, error.message);
          throw new Error(`无法连接到目标服务器，请检查网络连接或服务器是否可访问。错误: ${error.message}`);
        } else {
          console.warn(`⚠ 第 ${retryCount} 次尝试失败，3 秒后重试...`);
          await page.waitForTimeout(3000);
        }
      }
    }

    // 获取页面标题（验证页面加载成功）
    const title = await page.title();
    console.log(`页面标题: ${title}`);

    // 执行自动登录
    const loginSuccess = await performLogin(
      page, 
      LOGIN_CONFIG.username, 
      LOGIN_CONFIG.password
    );

    let punchResult = null;
    if (loginSuccess) {
      console.log("\n✓ 登录流程完成");
      
      // 等待页面跳转和加载完成
      console.log("等待页面加载完成...");
      await page.waitForTimeout(3000);
      
      // 执行打卡（早上是上班打卡 "on"）
      punchResult = await performPunch(page, 'on');
      
      if (punchResult.success) {
        console.log("✓ 打卡操作执行成功");
        if (punchResult.result) {
          console.log("打卡结果:", JSON.stringify(punchResult.result, null, 2));
          if (punchResult.result.status === "1") {
            console.log("✅ 打卡成功！");
          } else {
            console.log("⚠️ 打卡可能未成功，请检查结果");
          }
        } else {
          console.log("ℹ️ 当前没有可打卡的项（可能已经打卡过了）");
        }
      } else {
        console.error("✗ 打卡操作失败:", punchResult.error);
      }
    } else {
      console.warn("⚠️ 登录失败，跳过打卡操作");
    }
    // -------------------

    // 返回成功响应
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Task completed", 
        title,
        loginSuccess,
        punchResult: punchResult ? {
          success: punchResult.success,
          status: punchResult.result?.status,
          message: punchResult.result?.message || punchResult.error
        } : null
      }),
    };

  } catch (error) {
    // 错误处理：记录错误并返回错误响应
    console.error("任务失败:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  } finally {
    // 资源清理：确保浏览器实例被正确关闭，避免资源泄漏
    if (browser) {
      await browser.close();
    }
  }
};

// 导出定时任务处理器
// Cron 表达式格式：分钟 小时 日 月 周
// 40 0 * * * 表示每天 UTC 0:40（北京时间 8:40）执行
module.exports.handler = schedule("40 0 * * *", taskHandler);
