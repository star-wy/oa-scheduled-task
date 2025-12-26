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
// 打卡辅助脚本代码（直接嵌入，避免文件系统依赖）
const PUNCH_HELPER_CODE = `/**
 * 打卡辅助脚本 - 在浏览器控制台中运行
 * 用于定位 WeaTools 并触发打卡功能
 */

(function(punchConfig) {
  'use strict';
  
  // 使用传入的配置，如果没有传入则使用默认配置
  const config = punchConfig || {
    punchTimes: [
      { hour: 9, minute: 0, name: '上午上班打卡' },
      { hour: 19, minute: 30, name: '下午下班打卡' }
    ],
    checkInterval: 60 * 1000, // 60秒 = 1分钟
    errorMinutes: 1 // 误差1分钟
  };

  // 查找 WeaTools 对象
  function findWeaTools() {
    const candidates = [
      window.WeaTools,
      window.ecCom?.WeaTools,
      window.ecCom,
      window.weaHrmSignPlguin,
      // 尝试从 React 组件中获取
      ...(() => {
        const results = [];
        try {
          const signBtn = document.querySelector('button[name="signBtn"]');
          if (signBtn) {
            // 查找 React 内部实例
            const reactKey = Object.keys(signBtn).find(key => 
              key.startsWith('__reactInternalInstance') || 
              key.startsWith('__reactFiber') ||
              key.startsWith('_react')
            );
            if (reactKey) {
              const instance = signBtn[reactKey];
              // 向上遍历 React 树查找包含 WeaTools 的上下文
              let current = instance;
              for (let i = 0; i < 10 && current; i++) {
                if (current.memoizedProps?.sign) {
                  // 找到包含 sign 方法的组件
                  results.push(current);
                }
                current = current.return || current._owner;
              }
            }
          }
        } catch (e) {
          console.warn('查找 React 实例时出错:', e);
        }
        return results;
      })()
    ].filter(Boolean);

    // 检查每个候选对象是否有 callApi 方法
    for (let candidate of candidates) {
      if (candidate && typeof candidate.callApi === 'function') {
        return candidate;
      }
      if (candidate && candidate.WeaTools && typeof candidate.WeaTools.callApi === 'function') {
        return candidate.WeaTools;
      }
    }

    // 最后尝试：遍历全局对象
    for (let key in window) {
      try {
        const obj = window[key];
        if (obj && typeof obj === 'object' && obj.WeaTools && typeof obj.WeaTools.callApi === 'function') {
          return obj.WeaTools;
        }
      } catch (e) {
        // 忽略访问受限的属性
      }
    }

    return null;
  }

  // 获取打卡参数
  // @param {String} punchType - 可选，指定打卡类型："on"（上班）或 "off"（下班），如果不指定则查找所有可用的打卡项
  async function getSignParams(WeaTools, punchType = null) {
    try {
      const result = await WeaTools.callApi(
        "/api/hrm/kq/attendanceButton/getButtons",
        "POST",
        {}
      );

      if (result.status !== "1") {
        throw new Error(result.message || "获取打卡按钮失败");
      }

      // 查找当前需要打卡的项
      // active="1" 且 type="on" 表示上班打卡
      // active="1" 且 type="off" 表示下班打卡
      let signParams = null;
      
      if (punchType) {
        // 如果指定了打卡类型，查找对应类型的打卡项
        signParams = result.timeline?.find(item => 
          item.active === "1" && item.type === punchType
        );
      } else {
        // 如果没有指定类型，查找所有可用的打卡项（优先上班卡，如果没有则找下班卡）
        signParams = result.timeline?.find(item => 
          item.active === "1" && item.type === "on"
        ) || result.timeline?.find(item => 
          item.active === "1" && item.type === "off"
        );
      }

      return signParams || null;
    } catch (error) {
      console.error("获取打卡参数失败:", error);
      throw error;
    }
  }

  // 执行打卡
  async function doPunch(WeaTools, signParams) {
    try {
      const result = await WeaTools.callApi(
        "/api/hrm/kq/attendanceButton/punchButton",
        "POST",
        signParams
      );

      return result;
    } catch (error) {
      console.error("打卡失败:", error);
      throw error;
    }
  }

  // 检查是否是登录页面并自动登录
  function checkAndAutoLogin() {
    // 更严格的登录页面判断：需要同时满足多个条件
    const submitBtn = document.getElementById('submit');
    const loginid = document.getElementById('loginid');
    const userpassword = document.getElementById('userpassword');
    
    // 如果找到了 WeaTools，说明肯定不是登录页面
    const weaTools = findWeaTools();
    if (weaTools) {
      return false; // 有 WeaTools 说明已经登录成功
    }
    
    // 判断是否是登录页面：需要同时有登录按钮和登录输入框
    if (submitBtn && (loginid || userpassword)) {
      console.log('🔍 检测到登录页面，将在20秒后自动点击登录按钮...');
      setTimeout(() => {
        // 再次检查是否是登录页面（防止页面已跳转）
        const btn = document.getElementById('submit');
        if (btn) {
          console.log('✅ 自动点击登录按钮...');
          // 使用 jQuery 点击按钮（如果页面有 jQuery）
          if (typeof $ !== 'undefined' && $.fn.jquery) {
            $('#submit').click();
          } else {
            // 如果没有 jQuery，使用原生方法
            btn.click();
          }
        } else {
          console.log('ℹ️ 登录按钮未找到，可能已跳转');
        }
      }, 20000); // 延时20秒
      return true; // 返回 true 表示检测到登录页面
    }
    return false; // 返回 false 表示不是登录页面
  }

  // 主函数：一键打卡
  // @param {Object} punchTimeInfo - 可选，打卡时间信息对象，包含 name 属性用于判断打卡类型
  async function punch(punchTimeInfo = null) {
    console.log("=== 开始打卡流程 ===");

    // 1. 先查找 WeaTools（如果找到了，说明已经登录成功，不是登录页面）
    console.log("1. 正在查找 WeaTools...");
    let WeaTools = findWeaTools();

    // 2. 如果没找到 WeaTools，再检查是否是登录页面
    if (!WeaTools) {
      console.log("未找到 WeaTools，检查是否是登录页面...");
      // 检查是否是登录页面
      if (checkAndAutoLogin()) {
        console.log("⚠️ 检测到登录页面，已启动自动登录，等待登录完成...");
        return null;
      }
      console.error("❌ 未找到 WeaTools 对象，且不是登录页面");
      console.log("\\n请尝试以下方法：");
      console.log("1. 检查页面是否完全加载");
      console.log("2. 手动点击一次打卡按钮，查看 Network 请求");
      console.log("3. 在 Network 请求的调用栈中查找 WeaTools");
      console.log("4. 尝试直接点击按钮: document.querySelector('button[name=\\"signBtn\\"]')?.click()");
      return null;
    }

    console.log("✓ 找到 WeaTools:", WeaTools);

    // 3. 根据打卡时间信息判断打卡类型（上班或下班）
    let punchType = null; // "on" 表示上班打卡，"off" 表示下班打卡
    if (punchTimeInfo && punchTimeInfo.time && punchTimeInfo.time.name) {
      const name = punchTimeInfo.time.name;
      // 根据打卡时间名称判断是上班还是下班
      if (name.includes("上班") || name.includes("on")) {
        punchType = "on";
        console.log("📌 检测到上班打卡时间");
      } else if (name.includes("下班") || name.includes("off")) {
        punchType = "off";
        console.log("📌 检测到下班打卡时间");
      }
    }

    // 4. 获取打卡参数
    console.log("\\n2. 正在获取打卡参数...");
    let signParams;
    try {
      signParams = await getSignParams(WeaTools, punchType);
      if (!signParams) {
        console.log("⚠ 当前没有可打卡的项（可能已经打卡过了）");
        return null;
      }
      console.log("✓ 找到打卡参数:", signParams);
    } catch (error) {
      console.error("❌ 获取打卡参数失败:", error);
      return null;
    }

    // 5. 执行打卡
    console.log("\\n3. 正在执行打卡...");
    try {
      const result = await doPunch(WeaTools, signParams);
      console.log("✓ 打卡结果:", result);

      if (result.message) {
        alert(result.message);
      }

      if (result.status === "1") {
        console.log("✅ 打卡成功！");
      } else {
        console.warn("⚠ 打卡可能未成功，请检查结果");
      }

      return result;
    } catch (error) {
      console.error("❌ 打卡失败:", error);
      return null;
    }
  }

  // 暴露到全局作用域
  window.PunchHelper = {
    // 方法1: 通过 API 打卡（推荐）
    punch: punch,
    
    // 查找 WeaTools
    findWeaTools: findWeaTools
  };

  // 重写 alert 函数，在页面上显示 HTML 提示框
  window.alert = function(message) { 
    // 确保 message 是字符串
    if (message === null || message === undefined) {
      message = String(message);
    } else {
      message = String(message);
    }
    
    // 创建提示框的函数
    const createAlert = function() {
      try {
        // 检查 document.body 是否存在
        if (!document.body) {
          console.warn('document.body 不存在，等待 DOM 加载...');
          // 等待 DOM 加载完成
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createAlert);
            return;
          } else {
            // 如果已经加载但 body 还不存在，延迟重试
            setTimeout(createAlert, 100);
            return;
          }
        }
        
        // 如果已存在提示框，先移除旧的
        const existingAlert = document.getElementById('punch-helper-alert-container');
        if (existingAlert) {
          existingAlert.remove();
        }
        
        // 创建提示框容器
        const alertContainer = document.createElement('div');
        alertContainer.id = 'punch-helper-alert-container';
        alertContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 999999; max-width: 400px; animation: slideInRight 0.3s ease-out;';
        
        // 创建提示框内容
        const alertBox = document.createElement('div');
        alertBox.style.cssText = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); display: flex; align-items: center; justify-content: space-between; gap: 12px; font-family: -apple-system, BlinkMacSystemFont, \\'Segoe UI\\', Roboto, \\'Helvetica Neue\\', Arial, sans-serif; font-size: 14px; line-height: 1.5; word-wrap: break-word; word-break: break-word;';
        
        // 创建消息内容
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = 'flex: 1; min-width: 0;';
        messageDiv.textContent = message;
        
        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = 'background: rgba(255, 255, 255, 0.2); border: none; color: white; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s;';
        closeBtn.onmouseover = function() {
          this.style.background = 'rgba(255, 255, 255, 0.3)';
        };
        closeBtn.onmouseout = function() {
          this.style.background = 'rgba(255, 255, 255, 0.2)';
        };
        
        // 添加关闭功能
        const closeAlert = function() {
          alertContainer.style.animation = 'slideOutRight 0.3s ease-out';
          setTimeout(() => {
            if (alertContainer.parentNode) {
              alertContainer.parentNode.removeChild(alertContainer);
            }
          }, 300);
        };
        
        closeBtn.onclick = closeAlert;
        
        // 组装提示框
        alertBox.appendChild(messageDiv);
        alertBox.appendChild(closeBtn);
        alertContainer.appendChild(alertBox);
        
        // 添加动画样式（如果还没有添加）
        if (!document.getElementById('punch-helper-alert-styles')) {
          const style = document.createElement('style');
          style.id = 'punch-helper-alert-styles';
          style.textContent = '@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }';
          if (document.head) {
            document.head.appendChild(style);
          } else {
            setTimeout(() => {
              if (document.head) {
                document.head.appendChild(style);
              }
            }, 100);
          }
        }
        
        // 添加到页面
        document.body.appendChild(alertContainer);
        
        // 5秒后自动关闭
        setTimeout(closeAlert, 5000);
        
        console.log('✅ 提示框已创建并显示');
      } catch (error) {
        console.error('创建提示框时出错:', error);
        console.log('Alert:', message);
      }
    };
    
    // 立即尝试创建，如果 DOM 未准备好会自动等待
    createAlert();
  };
  console.log("✅ 打卡辅助脚本已加载！");
})(window._PUNCH_CONFIG); // 接收传入的配置`;

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
    // 智能等待：等待登录元素出现，而不是固定等待10秒
    // 尝试等待登录输入框出现（最多等待5秒）
    try {
      await page.waitForSelector('#loginid, input[name="username"], input[type="text"]', { 
        timeout: 5000 
      }).catch(() => {
        // 如果找不到，继续执行（可能页面结构不同）
        console.log("未找到标准登录元素，继续尝试...");
      });
    } catch (e) {
      // 如果等待失败，使用较短的固定等待
      await page.waitForTimeout(2000);
    }
    
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
      
      // 等待一下，确保输入完成（减少到1秒）
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
      // 尝试等待页面跳转或特定元素出现，而不是固定等待
      console.log("等待登录响应...");
      try {
        // 等待页面导航完成或特定元素出现（最多等待3秒）
        await Promise.race([
          page.waitForNavigation({ timeout: 3000, waitUntil: 'domcontentloaded' }).catch(() => {}),
          page.waitForSelector('button[name="signBtn"], #submit', { timeout: 3000 }).catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 2000)) // 最小等待2秒
        ]);
      } catch (e) {
        // 如果等待失败，使用较短的固定等待
        await page.waitForTimeout(2000);
      }
      
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
    // 打印当前页面地址
    const currentUrl = page.url();
    console.log(`📍 当前页面地址: ${currentUrl}`);
    
    // 使用嵌入的打卡辅助脚本代码（避免文件系统依赖）
    const punchHelperCode = PUNCH_HELPER_CODE;
    console.log(`✓ 使用嵌入的打卡辅助脚本`);
    
    // 智能等待：等待页面框架初始化（减少固定等待时间）
    console.log("等待页面完全加载（等待 WeaTools 可用）...");
    try {
      // 尝试等待打卡按钮或特定元素出现（最多等待3秒）
      await page.waitForSelector('button[name="signBtn"], button', { 
        timeout: 3000 
      }).catch(() => {
        // 如果找不到，使用较短的固定等待
        console.log("未找到打卡按钮，使用固定等待...");
      });
    } catch (e) {
      // 如果等待失败，使用较短的固定等待
      await page.waitForTimeout(2000);
    }
    
    // 注入打卡辅助脚本到页面并执行打卡
    const punchResult = await page.evaluate(async (scriptCode, punchType) => {
      // 打印注入脚本前的页面地址
      console.log('📍 注入脚本前页面地址:', window.location.href);
      
      // 注入脚本代码
      const script = document.createElement('script');
      script.textContent = scriptCode;
      document.head.appendChild(script);
      
      console.log('✅ 脚本已注入到页面');
      
      // 等待 PunchHelper 可用（减少重试次数和等待时间）
      let retries = 0;
      while (!window.PunchHelper && retries < 5) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      
      if (!window.PunchHelper) {
        return {
          success: false,
          error: 'PunchHelper 未加载，请检查脚本是否正确注入'
        };
      }
      
      console.log('✅ PunchHelper 已加载');
      
      // 等待 WeaTools 可用（减少等待时间，最多等待 5 秒）
      let weaToolsRetries = 0;
      let weaTools = null;
      while (!weaTools && weaToolsRetries < 10) {
        weaTools = window.PunchHelper.findWeaTools();
        if (!weaTools) {
          await new Promise(resolve => setTimeout(resolve, 500));
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
        
        // 如果返回 null，说明打卡失败或没有可打卡项
        if (result === null) {
          // 尝试获取更详细的错误信息
          const pageUrl = window.location.href;
          const hasLoginPage = document.getElementById('submit') !== null;
          const hasWeaTools = window.PunchHelper.findWeaTools() !== null;
          
          let errorMsg = '打卡操作返回 null';
          if (hasLoginPage) {
            errorMsg = '检测到登录页面，可能需要重新登录';
          } else if (!hasWeaTools) {
            errorMsg = 'WeaTools 未找到，页面可能未完全加载';
          } else {
            errorMsg = '当前没有可打卡的项（可能已经打卡过了）';
          }
          
          return {
            success: false,
            error: errorMsg,
            result: null
          };
        }
        
        return {
          success: true,
          result: result
        };
      } catch (error) {
        return {
          success: false,
          error: error.message || String(error) || '打卡过程中发生未知错误'
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
      
      // 打印登录后的页面地址
      const loginAfterUrl = page.url();
      console.log(`📍 登录后页面地址: ${loginAfterUrl}`);
      
      // 智能等待：等待页面跳转和加载完成
      console.log("等待页面加载完成...");
      try {
        // 尝试等待打卡相关元素出现（最多等待3秒）
        await page.waitForSelector('button[name="signBtn"], button', { 
          timeout: 3000 
        }).catch(() => {
          // 如果找不到，使用较短的固定等待
          console.log("未找到打卡元素，使用固定等待...");
        });
      } catch (e) {
        // 如果等待失败，使用较短的固定等待
        await page.waitForTimeout(2000);
      }
      
      // 再次打印页面地址，确认是否跳转
      const beforePunchUrl = page.url();
      console.log(`📍 执行打卡前页面地址: ${beforePunchUrl}`);
      
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
        } else {` `
          console.log("ℹ️ 当前没有可打卡的项（可能已经打卡过了）");
        }
      } else {
        console.error("✗ 打卡操作失败:", punchResult.error || '未知错误');
        // 输出更详细的错误信息用于调试
        if (punchResult.error) {
          console.error("错误详情:", punchResult.error);
        }
        if (punchResult.result) {
          console.log("打卡结果对象:", JSON.stringify(punchResult.result, null, 2));
        }
      }
    } else {
      console.warn("⚠️ 登录失败，跳过打卡操作");
    }
    // -------------------

    // 在返回响应前，等待一小段时间确保所有操作完成（如打卡结果已保存）
    // 注意：这个延迟会增加总执行时间，需要权衡
    if (punchResult && punchResult.success) {
      console.log("等待操作完成...");
      await page.waitForTimeout(5000); // 等待 5 秒确保打卡操作完全完成
    }

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
    // 浏览器会在返回响应后立即关闭（无额外延迟）
    if (browser) {
      console.log("正在关闭浏览器...");
      await browser.close();
      console.log("✓ 浏览器已关闭");
    }
  }
};

// 导出定时任务处理器
// Cron 表达式格式：分钟 小时 日 月 周
// 40 0 * * * 表示每天 UTC 0:40（北京时间 8:40）执行
module.exports.handler = schedule("40 0 * * *", taskHandler);
