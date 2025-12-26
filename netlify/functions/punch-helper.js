/**
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
    const submitBtn = document.getElementById('submit');
    if (submitBtn) {
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

    // 0. 检查是否是登录页面，如果是则自动登录
    if (checkAndAutoLogin()) {
      console.log("⚠️ 检测到登录页面，已启动自动登录，等待登录完成...");
      return null; // 返回 null，等待自动登录完成
    }

    // 1. 查找 WeaTools
    console.log("1. 正在查找 WeaTools...");
    const WeaTools = findWeaTools();

    if (!WeaTools) {
      console.error("❌ 未找到 WeaTools 对象");
      // 检查是否是登录页面
      if (checkAndAutoLogin()) {
        console.log("⚠️ 检测到登录页面，已启动自动登录，等待登录完成...");
        return null;
      }
      console.log("\n请尝试以下方法：");
      console.log("1. 检查页面是否完全加载");
      console.log("2. 手动点击一次打卡按钮，查看 Network 请求");
      console.log("3. 在 Network 请求的调用栈中查找 WeaTools");
      console.log("4. 尝试直接点击按钮: document.querySelector('button[name=\"signBtn\"]')?.click()");
      return null;
    }

    console.log("✓ 找到 WeaTools:", WeaTools);

    // 2. 根据打卡时间信息判断打卡类型（上班或下班）
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

    // 3. 获取打卡参数
    console.log("\n2. 正在获取打卡参数...");
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

    // 4. 执行打卡
    console.log("\n3. 正在执行打卡...");
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

  // 方法2: 直接点击按钮（最简单的方法）
  function clickPunchButton() {
    const signBtn = document.querySelector('button[name="signBtn"]');
    if (signBtn) {
      console.log("找到打卡按钮，正在点击...");
      signBtn.click();
      console.log("✓ 已触发点击事件");
      return true;
    } else {
      console.error("❌ 未找到打卡按钮");
      console.log("提示: 确保页面已加载完成，且当前有可打卡的项");
      return false;
    }
  }

  // 方法3: 通过 React 事件触发
  function triggerReactPunch() {
    const signBtn = document.querySelector('button[name="signBtn"]');
    if (!signBtn) {
      console.error("❌ 未找到打卡按钮");
      return false;
    }

    try {
      // 获取 React 内部实例
      const reactKey = Object.keys(signBtn).find(key => 
        key.startsWith('__reactInternalInstance') || 
        key.startsWith('__reactFiber')
      );

      if (reactKey) {
        const instance = signBtn[reactKey];
        // 查找包含 sign 方法的 props
        let current = instance;
        while (current) {
          if (current.memoizedProps?.sign) {
            const signData = current.memoizedProps.data;
            console.log("找到打卡数据:", signData);
            // 调用 sign 方法
            if (typeof current.memoizedProps.sign === 'function') {
              current.memoizedProps.sign(signData);
              console.log("✓ 已通过 React 方法触发打卡");
              return true;
            }
          }
          current = current.return || current._owner;
        }
      }

      // 如果找不到 React 方法，直接点击
      return clickPunchButton();
    } catch (error) {
      console.error("触发 React 打卡时出错:", error);
      return clickPunchButton();
    }
  }

  // ========== 定时器相关功能 ==========
  
  // 定时器状态管理
  let timerInterval = null; // 备用定时器ID（用于页面内检查）
  let lastPunchDate = null; // 上次打卡的日期，用于避免同一天重复打卡
  let lastCheckTime = Date.now(); // 上次检查时间，用于检测睡眠唤醒
  let isUsingAlarms = false; // 是否使用 alarms API

  /**
   * 检查当前时间是否到达指定打卡时间
   * @returns {Object|null} 返回需要打卡的时间信息，如果不需要打卡则返回null
   */
  function checkPunchTime() {
    const now = new Date();
    const hour = now.getHours(); // 当前小时（0-23）
    const minute = now.getMinutes(); // 当前分钟（0-59）
    const today = now.toDateString(); // 今天的日期字符串，用于判断是否同一天
    
    // 将当前时间转换为总分钟数（从当天0:00开始计算）
    const currentTotalMinutes = hour * 60 + minute;

    // 使用配置中的打卡时间点
    const punchTimes = config.punchTimes;

    // 检查是否到达任何一个打卡时间点（使用配置的误差分钟数）
    for (let punchTime of punchTimes) {
      // 将打卡时间转换为总分钟数（从当天0:00开始计算）
      const punchTotalMinutes = punchTime.hour * 60 + punchTime.minute;
      
      // 计算打卡时间范围：打卡时间前后误差分钟内
      const minMinutes = punchTotalMinutes - config.errorMinutes; // 最早打卡时间（总分钟数）
      const maxMinutes = punchTotalMinutes + config.errorMinutes; // 最晚打卡时间（总分钟数）
      
      // 判断当前时间是否在打卡时间范围内（支持跨小时的情况）
      if (currentTotalMinutes >= minMinutes && currentTotalMinutes <= maxMinutes) {
        // 检查今天是否已经在这个时间点打过卡
        const punchKey = `${today}-${punchTime.hour}:${punchTime.minute}`;
        if (lastPunchDate !== punchKey) {
          lastPunchDate = punchKey; // 记录本次打卡
          return {
            time: punchTime,
            currentTime: `${hour}:${minute.toString().padStart(2, '0')}`
          };
        }
      }
    }

    return null;
  }

  /**
   * 定时检查并执行打卡
   */
  function timerCheck() {
    // 检测睡眠唤醒
    const currentTime = Date.now();
    const timeDiff = currentTime - lastCheckTime;
    const expectedInterval = config.checkInterval || 60000; // 预期检查间隔
    
    // 如果时间差超过预期间隔的2倍，可能发生了睡眠
    if (timeDiff > expectedInterval * 2 && lastCheckTime > 0) {
      console.log(`⚠️ 检测到可能的睡眠唤醒，时间间隔: ${Math.round(timeDiff / 1000)}秒`);
      // 执行补偿检查，检查是否错过了打卡时间
      checkMissedPunch();
    }
    
    // 更新最后检查时间
    lastCheckTime = currentTime;
    
    // 检查是否是登录页面，如果是则自动登录
    if (checkAndAutoLogin()) {
      console.log("⚠️ 检测到登录页面，已启动自动登录，跳过本次打卡检查...");
      return; // 跳过本次打卡检查，等待自动登录完成
    }
    
    const punchInfo = checkPunchTime();
    if (punchInfo) {
      console.log(`\n⏰ 到达打卡时间：${punchInfo.time.name} (${punchInfo.currentTime})`);
      console.log("正在自动执行打卡...");
      // 执行打卡，传递打卡时间信息以便判断打卡类型
      punch(punchInfo).then(result => {
        if (result && result.status === "1") {
          console.log(`✅ ${punchInfo.time.name} 成功！`);
        } else {
          console.warn(`⚠ ${punchInfo.time.name} 可能未成功，请检查`);
        }
      }).catch(error => {
        console.error(`❌ ${punchInfo.time.name} 失败:`, error);
      });
    }
  }

  /**
   * 检查是否错过了打卡时间（用于睡眠唤醒后的补偿）
   */
  function checkMissedPunch() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTotalMinutes = hour * 60 + minute;
    
    for (let punchTime of config.punchTimes) {
      const punchTotalMinutes = punchTime.hour * 60 + punchTime.minute;
      const maxMinutes = punchTotalMinutes + config.errorMinutes;
      
      // 如果当前时间在打卡时间之后，但在误差范围内，可能错过了
      if (currentTotalMinutes > punchTotalMinutes && currentTotalMinutes <= maxMinutes) {
        const today = now.toDateString();
        const punchKey = `${today}-${punchTime.hour}:${punchTime.minute}`;
        
        // 如果今天还没打过这个时间点的卡，尝试打卡
        if (lastPunchDate !== punchKey) {
          console.log(`🔄 检测到可能错过的打卡时间：${punchTime.name}，尝试补偿打卡`);
          const punchInfo = {
            time: punchTime,
            currentTime: `${hour}:${minute.toString().padStart(2, '0')}`
          };
          punch(punchInfo).then(result => {
            if (result && result.status === "1") {
              console.log(`✅ 补偿打卡成功：${punchTime.name}`);
            }
          }).catch(error => {
            console.error(`❌ 补偿打卡失败:`, error);
          });
        }
      }
    }
  }

  /**
   * 启动定时器，使用 Chrome alarms API（推荐，支持睡眠唤醒）
   * 同时保留页面内的定时器作为备用检查
   */
  async function startTimer() {
    // 如果定时器已经在运行，先停止它
    if (timerInterval || isUsingAlarms) {
      console.log("⚠ 定时器已在运行，正在重启...");
      await stopTimer();
    }

    console.log("🕐 启动自动打卡定时器（使用 Chrome Alarms API，支持睡眠唤醒）...");
    // 显示配置的打卡时间点
    const timeStr = config.punchTimes.map(t => `${t.name}(${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')})`).join('、');
    console.log(`定时打卡时间：${timeStr}`);
    console.log(`时间误差：±${config.errorMinutes} 分钟`);
    console.log(`使用 Chrome Alarms API，即使电脑睡眠也能正常打卡`);

    // 保存配置到 storage，供 background 脚本使用
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ punchConfig: config });
        // 通知 background 脚本初始化 alarms
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'initPunchAlarms' }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('无法连接到 background 脚本，使用备用方案:', chrome.runtime.lastError.message);
              // 如果无法使用 alarms API，回退到 setInterval
              startFallbackTimer();
            } else {
              isUsingAlarms = true;
              console.log("✅ 已使用 Chrome Alarms API 启动定时器");
            }
          });
        } else {
          startFallbackTimer();
        }
      } else {
        startFallbackTimer();
      }
    } catch (error) {
      console.warn('使用 alarms API 失败，回退到备用方案:', error);
      startFallbackTimer();
    }

    // 立即检查一次（如果当前时间正好是打卡时间）
    timerCheck();

    // 同时启动页面内的备用定时器（用于页面可见时的额外检查）
    const checkInterval = config.checkInterval || 60000;
    timerInterval = setInterval(timerCheck, checkInterval);
    console.log(`✅ 备用定时器已启动（每 ${checkInterval / 1000} 秒检查一次）`);

    // 监听页面可见性变化，当页面重新可见时检查是否错过了打卡
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          console.log('📄 页面重新可见，检查是否错过打卡时间');
          checkMissedPunch();
          lastCheckTime = Date.now(); // 重置检查时间
        }
      });
    }

    return true;
  }

  /**
   * 备用定时器（当无法使用 alarms API 时）
   */
  function startFallbackTimer() {
    console.log("⚠️ 使用备用定时器方案（setInterval）");
    isUsingAlarms = false;
    const checkInterval = config.checkInterval || 60000;
    timerInterval = setInterval(timerCheck, checkInterval);
    console.log(`✅ 备用定时器已启动（每 ${checkInterval / 1000} 秒检查一次）`);
  }

  /**
   * 停止定时器
   */
  async function stopTimer() {
    let stopped = false;
    
    // 停止页面内的定时器
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
      stopped = true;
    }
    
    // 清除 background 脚本中的 alarms
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'clearPunchAlarms' }, (response) => {
          if (!chrome.runtime.lastError) {
            console.log("✅ 已清除 Chrome Alarms");
          }
        });
      }
    } catch (error) {
      console.warn('清除 alarms 失败:', error);
    }
    
    if (stopped || isUsingAlarms) {
      isUsingAlarms = false;
      lastPunchDate = null; // 重置打卡记录
      lastCheckTime = Date.now(); // 重置检查时间
      console.log("⏹ 定时器已停止");
      return true;
    } else {
      console.log("⚠ 定时器未在运行");
      return false;
    }
  }

  /**
   * 获取定时器状态
   */
  async function getTimerStatus() {
    let alarmsInfo = "未使用";
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'getAlarms' }, (response) => {
            resolve(response);
          });
        });
        if (response && response.alarms) {
          const punchAlarms = response.alarms.filter(a => a.name.startsWith('punch_'));
          alarmsInfo = punchAlarms.length > 0 ? `${punchAlarms.length} 个 alarms 已设置` : "未设置";
        }
      }
    } catch (error) {
      // 忽略错误
    }
    
    return {
      isRunning: timerInterval !== null || isUsingAlarms,
      isUsingAlarms: isUsingAlarms,
      lastPunchDate: lastPunchDate,
      alarmsInfo: alarmsInfo,
      nextCheckTime: timerInterval ? `每 ${(config.checkInterval || 60000) / 1000} 秒检查一次` : "未运行"
    };
  }

  // 暴露到全局作用域
  window.PunchHelper = {
    // 方法1: 通过 API 打卡（推荐）
    punch: punch,
    
    // 方法2: 直接点击按钮
    clickButton: clickPunchButton,
    
    // 方法3: 通过 React 触发
    triggerReact: triggerReactPunch,
    
    // 查找 WeaTools
    findWeaTools: findWeaTools,
    
    // 获取打卡参数
    getSignParams: async function() {
      const WeaTools = findWeaTools();
      if (!WeaTools) {
        console.error("未找到 WeaTools");
        return null;
      }
      return await getSignParams(WeaTools);
    },

    // ========== 定时器相关方法 ==========
    
    // 启动自动打卡定时器（上午9点和下午6点自动打卡）
    startTimer: startTimer,
    
    // 停止自动打卡定时器
    stopTimer: stopTimer,
    
    // 获取定时器运行状态
    getTimerStatus: getTimerStatus
  };

  // 监听来自 background 脚本的消息（当 alarm 触发时）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'triggerPunch') {
        console.log('📨 收到来自 background 的打卡指令');
        const punchInfo = checkPunchTime();
        if (punchInfo) {
          punch(punchInfo).then(result => {
            if (result && result.status === "1") {
              console.log(`✅ 打卡成功：${punchInfo.time.name}`);
            }
            sendResponse({ success: true, result });
          }).catch(error => {
            console.error('❌ 打卡失败:', error);
            sendResponse({ success: false, error: error.message });
          });
        } else {
          // 如果当前不在打卡时间范围内，尝试执行补偿检查
          checkMissedPunch();
          sendResponse({ success: true, message: '已执行补偿检查' });
        }
        return true; // 保持消息通道开放
      }
    });
  }

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
        alertContainer.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 999999;
          max-width: 400px;
          animation: slideInRight 0.3s ease-out;
        `;
        
        // 创建提示框内容
        const alertBox = document.createElement('div');
        alertBox.style.cssText = `
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 16px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
          word-break: break-word;
        `;
        
        // 创建消息内容
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
          flex: 1;
          min-width: 0;
        `;
        messageDiv.textContent = message;
        
        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s;
        `;
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
          style.textContent = `
            @keyframes slideInRight {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            @keyframes slideOutRight {
              from {
                transform: translateX(0);
                opacity: 1;
              }
              to {
                transform: translateX(100%);
                opacity: 0;
              }
            }
          `;
          if (document.head) {
            document.head.appendChild(style);
          } else {
            // 如果 head 不存在，等待一下再添加
            setTimeout(() => {
              if (document.head) {
                document.head.appendChild(style);
              }
            }, 100);
          }
        }
        
        // 添加到页面
        document.body.appendChild(alertContainer);
        
        // 3秒后自动关闭
        setTimeout(closeAlert, 5000);
        
        console.log('✅ 提示框已创建并显示');
      } catch (error) {
        console.error('创建提示框时出错:', error);
        // 如果出错，至少输出到控制台
        console.log('Alert:', message);
      }
    };
    
    // 立即尝试创建，如果 DOM 未准备好会自动等待
    createAlert();
  };
  console.log("✅ 打卡辅助脚本已加载！");
  const timeStr = config.punchTimes.map(t => `${t.name}(${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')})`).join('、');

})(window._PUNCH_CONFIG); // 接收传入的配置

