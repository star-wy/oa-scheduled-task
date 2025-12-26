FROM ghcr.io/puppeteer/puppeteer:19.11.1

# 切换到 root 用户安装额外工具
USER root

# 设置工作目录
WORKDIR /usr/src/app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制其余代码
COPY . .

# 启动命令 (注意：这里需要把 task.js 改回普通脚本模式，不是 Netlify 函数)
CMD [ "node", "task.js" ]

