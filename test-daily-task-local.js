/**
 * 本地测试脚本 - 基于 daily-task.js
 * 功能：在本地环境测试 Netlify Functions 定时任务
 * 使用方法：node test-daily-task-local.js
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 查找本地 Chrome/Chromium 浏览器路径
 */
function findLocalChrome() {
  const platform = os.platform();
  const possiblePaths = [];

  if (platform === 'win32') {
    // Windows 常见路径
    const username = os.userInfo().username;
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `C:\\Users\\${username}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Chromium\\Application\\chromium.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chromium.exe'
    );
  } else if (platform === 'darwin') {
    // macOS 路径
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    // Linux 路径
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }

  // 查找存在的路径
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return null;
}

/**
 * 登录配置
 * 可以通过环境变量或直接修改这里来设置账号密码
 */
const LOGIN_CONFIG = {
  username: process.env.LOGIN_USERNAME || '15518278335',  // 从环境变量读取，或直接在这里设置
  password: process.env.LOGIN_PASSWORD || '19980622..wy000',  // 从环境变量读取，或直接在这里设置
  // 登录表单选择器（根据实际页面结构调整）
  selectors: {
    usernameInput: [
      '#loginid',                    // 账号输入框 ID（优先匹配）
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
      '#userpassword',               // 密码输入框 ID（优先匹配）
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="密码"]',
      'input[id*="password"]',
      '#password',
      '#pwd'
    ],
    loginButton: [
      '#submit',                     // 登录按钮 ID（优先匹配）
      'button[type="submit"]',
      'button:contains("登录")',
      'button:contains("登陆")',
      'button:contains("Login")',
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
 * 在页面上下文中执行，查找并填写登录表单
 */
async function performLogin(page, username, password) {
  console.log("\n开始执行登录流程...");
  
  if (!username || !password) {
    console.warn("⚠ 警告: 未设置账号或密码，跳过登录步骤");
    console.warn("提示: 可以通过环境变量设置 LOGIN_USERNAME 和 LOGIN_PASSWORD");
    console.warn("Windows PowerShell 示例: $env:LOGIN_USERNAME='your_username'; $env:LOGIN_PASSWORD='your_password'; node test-daily-task-local.js");
    console.warn("Windows CMD 示例: set LOGIN_USERNAME=your_username && set LOGIN_PASSWORD=your_password && node test-daily-task-local.js");
    console.warn("或者直接在代码中修改 LOGIN_CONFIG 的 username 和 password");
    return false;
  }

  try {
    // 等待页面完全加载
    await page.waitForTimeout(2000);
    
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
          if (element && element.offsetParent !== null) { // 元素可见
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
          if (element && element.offsetParent !== null) { // 元素可见
            passwordInput = element;
            foundPasswordSelector = selector;
            break;
          }
        } catch (e) {}
      }
      
      // 查找登录按钮（先尝试选择器，再尝试文本匹配）
      let loginButton = null;
      let foundButtonSelector = null;
      
      // 方法1: 通过选择器查找
      for (const selector of selectors.loginButton) {
        try {
          // 跳过 :contains() 伪选择器（不是标准CSS）
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
      // 触发各种事件以确保框架能捕获到输入
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
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
      console.log("✓ 已输入账号密码并点击登录按钮");
      
      // 等待页面响应（登录后的跳转或加载）
      console.log("等待登录响应...");
      await page.waitForTimeout(3000);
      
      return true;
    } else {
      console.error("✗ 登录失败: " + loginResult.error);
      console.log("\n提示: 如果页面结构不同，可能需要调整选择器配置");
      console.log("可以尝试:");
      console.log("1. 在浏览器中打开页面，使用开发者工具检查元素");
      console.log("2. 修改 LOGIN_CONFIG.selectors 中的选择器");
      console.log("3. 或者使用 page.evaluate() 手动执行登录逻辑");
      return false;
    }
    
  } catch (error) {
    console.error("✗ 登录过程出错:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * 核心任务处理函数（适配本地环境）
 * 基于 daily-task.js 的 taskHandler，但使用本地浏览器
 */
async function runTaskLocally() {
  console.log("=".repeat(60));
  console.log("启动本地测试任务...");
  console.log("=".repeat(60));

  let browser = null;

  try {
    // 查找本地 Chrome 浏览器
    const executablePath = findLocalChrome();
    
    if (!executablePath) {
      throw new Error(
        '未找到本地 Chrome/Chromium 浏览器。\n' +
        '请安装 Chrome 浏览器，或手动在脚本中指定 executablePath。\n' +
        'Windows 默认路径: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      );
    }

    console.log(`✓ 找到浏览器: ${executablePath}`);

    // 启动 Puppeteer 浏览器实例（本地环境配置）
    console.log("正在启动浏览器...");
    browser = await puppeteer.launch({
      executablePath: executablePath,           // 使用本地 Chrome
      headless: false,                          // 本地测试时显示浏览器窗口（可改为 true 后台运行）
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,                  // 忽略 HTTPS 证书错误
    });

    console.log("✓ 浏览器启动成功");

    // 创建新页面
    const page = await browser.newPage();
    console.log("✓ 创建新页面");
    
    // 监听页面控制台输出，转发到 Node.js 控制台
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      // 根据不同的日志类型使用不同的输出方法
      switch (type) {
        case 'error':
          console.error(`[页面错误] ${text}`);
          break;
        case 'warning':
          console.warn(`[页面警告] ${text}`);
          break;
        case 'info':
        case 'log':
        default:
          console.log(`[页面日志] ${text}`);
          break;
      }
    });
    
    // 监听页面错误
    page.on('pageerror', error => {
      console.error(`[页面异常] ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    });
    
    // 将登录函数注入到页面上下文中，方便在浏览器控制台手动调用
    await page.evaluateOnNewDocument((config) => {
      // 在页面上下文中创建全局登录函数
      window.autoLogin = async function(username, password) {
        const { selectors } = config;
        
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
        for (const selector of selectors.usernameInput) {
          try {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
              usernameInput = element;
              console.log(`找到用户名输入框: ${selector}`);
              break;
            }
          } catch (e) {}
        }
        
        // 查找密码输入框
        let passwordInput = null;
        for (const selector of selectors.passwordInput) {
          try {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
              passwordInput = element;
              console.log(`找到密码输入框: ${selector}`);
              break;
            }
          } catch (e) {}
        }
        
        // 查找登录按钮
        let loginButton = null;
        for (const selector of selectors.loginButton) {
          try {
            if (selector.includes(':contains')) continue;
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
              loginButton = element;
              console.log(`找到登录按钮: ${selector}`);
              break;
            }
          } catch (e) {}
        }
        
        if (!loginButton) {
          loginButton = findButtonByText(['登录', '登陆', 'Login', 'LOGIN', '登 录']);
          if (loginButton) console.log('通过文本内容找到登录按钮');
        }
        
        if (!usernameInput) {
          console.error('未找到用户名输入框');
          return false;
        }
        
        if (!passwordInput) {
          console.error('未找到密码输入框');
          return false;
        }
        
        if (!loginButton) {
          console.error('未找到登录按钮');
          return false;
        }
        
        // 输入用户名
        usernameInput.focus();
        usernameInput.value = username;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 输入密码
        passwordInput.focus();
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 点击登录按钮
        loginButton.click();
        
        console.log('登录操作已执行');
        return true;
      };
      
      console.log('✓ 已注入 autoLogin 函数到页面上下文');
      console.log('在浏览器控制台可以使用: await autoLogin("your_username", "your_password")');
    }, LOGIN_CONFIG);
    
    // --- 业务逻辑：访问目标网页（与 daily-task.js 保持一致）---
    const targetUrl = 'http://115.236.22.132:88/wui/index.html#/?logintype=1&_key=sdphid';
    console.log(`\n正在访问: ${targetUrl}`);
    
    // 导航到目标页面
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle2',  // 等待网络空闲（最多 2 个连接）
      timeout: 60000              // 超时时间 60 秒
    });

    console.log("✓ 页面加载完成");
    console.log("💡 提示: 可以在浏览器控制台手动调用登录函数");
    console.log("   示例: await autoLogin('your_username', 'your_password')");

    // 获取页面标题（验证页面加载成功）
    const title = await page.title();
    console.log(`✓ 页面标题: ${title}`);

    // 执行自动登录
    const loginSuccess = await performLogin(
      page, 
      LOGIN_CONFIG.username, 
      LOGIN_CONFIG.password
    );

    if (loginSuccess) {
      console.log("\n✓ 登录流程完成");
      
      // 等待页面跳转和加载完成
      console.log("等待页面加载完成...");
      await page.waitForTimeout(3000);
      
      // 读取并注入打卡辅助脚本
      console.log("正在注入打卡辅助脚本...");
      const punchHelperPath = path.join(__dirname, 'punch-helper.js');
      if (fs.existsSync(punchHelperPath)) {
        const punchHelperCode = fs.readFileSync(punchHelperPath, 'utf-8');
        
        // 等待页面完全加载，确保页面框架已初始化
        console.log("等待页面完全加载（等待 WeaTools 可用）...");
        await page.waitForTimeout(5000);
        
        // 注入打卡辅助脚本到页面并执行打卡
        console.log("\n开始执行打卡操作...");
        const punchResult = await page.evaluate(async (scriptCode) => {
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
            // 执行打卡
            const result = await window.PunchHelper.punch();
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
        }, punchHelperCode);
        
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
        console.warn("⚠️ 未找到 punch-helper.js 文件，跳过打卡操作");
      }
    }

    // 可选：保存截图用于验证
    // const screenshotPath = path.join(__dirname, 'test-screenshot.png');
    // await page.screenshot({ path: screenshotPath, fullPage: true });
    // console.log(`✓ 截图已保存: ${screenshotPath}`);

    // 等待一段时间，方便观察（可选）
    // console.log("\n等待 5 秒后关闭浏览器...");
    // await page.waitForTimeout(5000);

    // -------------------

    console.log("\n" + "=".repeat(60));
    console.log("✓ 任务执行成功！");
    console.log("=".repeat(60));
    
    return {
      success: true,
      title: title,
      message: "Task success"
    };

  } catch (error) {
    // 错误处理
    console.error("\n" + "=".repeat(60));
    console.error("✗ 任务执行失败:");
    console.error("=".repeat(60));
    console.error(error.message);
    if (error.stack) {
      console.error("\n错误堆栈:");
      console.error(error.stack);
    }
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // 资源清理：确保浏览器实例被正确关闭
    if (browser) {
      await browser.close();
      console.log("\n✓ 浏览器已关闭");
    }
  }
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  runTaskLocally()
    .then(result => {
      if (result.success) {
        console.log("\n测试结果:", JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        console.log("\n测试失败:", JSON.stringify(result, null, 2));
        process.exit(1);
      }
    })
    .catch(error => {
      console.error("未捕获的错误:", error);
      process.exit(1);
    });
}

// 导出函数，方便其他脚本调用
module.exports = { runTaskLocally };

