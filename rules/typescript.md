---
trigger: model_decision
description: Nodejs 类项目, 开发 Typescript 或 Javascript 脚本时遵守此规则。
keywords:
  - 'typescript'
  - '.ts'
---

# TypeScript 开发规范

## 代码风格
- 遵循项目现有的 ESLint/Prettier 配置
- 使用 2 空格缩进
- 使用分号
- 使用单引号

## 命名约定
- 变量和函数：camelCase
- 类和接口：PascalCase
- 常量：UPPER_SNAKE_CASE
- 私有成员：#privateField 或 _privateField

## 类型定义
- 为所有函数参数和返回值指定类型
- 使用接口定义对象类型
- 使用类型别名处理复杂类型
- 优先使用 `interface` 而非 `type`，除非需要联合类型或映射类型

## 模块导入
- 使用 ES6 import/export
- 按顺序分组：Node.js 内置, 第三方库, 本地模块
- 使用命名导入而非默认导入

## 异步操作
- 使用 async/await 而非 Promise 链
- 正确处理错误（try/catch）
- 避免使用 `any` 类型

## 代码组织
- 每个文件只导出一个主要功能
- 相关功能放在同一目录
- 使用 index.ts 导出公共 API

