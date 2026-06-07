#!/usr/bin/env bun
/**
 * OpenCode wopal-plugin 验证脚本
 *
 * 测试内容：
 * 1. 插件是否能正确加载
 * 2. 规则文件是否被发现
 * 3. 规则是否能正确格式化
 * 4. glob 模式匹配是否工作
 *
 * 使用方法：
 *   cd /path/to/workspace
 *   bun projects/ontology/plugins/wopal-plugin/validate-wopal-plugin.ts
 */

import { cwd } from 'process';
import { readFileSync } from 'fs';

import { discoverRuleFiles, readAndFormatRules } from './src/utils.js';
import { minimatch } from 'minimatch';
import { parse as parseYAML } from 'yaml';

console.log('=== OpenCode Rules Plugin 验证 ===\n');

// 测试 1: 规则文件发现
console.log('测试 1: 规则文件发现');
console.log('-'.repeat(50));
try {
  const ruleFiles = await discoverRuleFiles(cwd());
  console.log(`✅ 发现 ${ruleFiles.length} 个规则文件`);

  ruleFiles.forEach((file) => {
    console.log(`   - ${file.relativePath} (${file.filePath})`);
  });

  if (ruleFiles.length === 0) {
    console.log('⚠️  没有发现规则文件，请检查 .opencode/rules/ 目录');
  }
} catch (error) {
  console.log('❌ 规则文件发现失败:', error.message);
  process.exit(1);
}

console.log('');

// 测试 2: 规则文件读取和格式化
console.log('测试 2: 规则文件读取和格式化');
console.log('-'.repeat(50));
try {
  const ruleFiles = await discoverRuleFiles(cwd());

  for (const ruleFile of ruleFiles) {
    const content = readFileSync(ruleFile.filePath, 'utf-8');

    const isConditional = ruleFile.relativePath.endsWith('.mdc');
    if (isConditional) {
      // 解析 YAML frontmatter
      const lines = content.split('\n');
      // 从第 1 行开始找第二个 '---'
      const frontmatterEndIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

      if (frontmatterEndIndex === -1) {
        console.log(`⚠️  ${ruleFile.relativePath}: 没有找到 YAML frontmatter 结束标记`);
        continue;
      }

      const frontmatter = lines.slice(1, frontmatterEndIndex).join('\n');
      const metadata = parseYAML(frontmatter);
      const ruleContent = lines.slice(frontmatterEndIndex + 1).join('\n').trim();

      console.log(`✅ ${ruleFile.relativePath} (${ruleFile.filePath}):`);
      console.log(`   Globs: ${JSON.stringify(metadata?.globs)}`);

      if (metadata?.globs && Array.isArray(metadata.globs)) {
        // 测试 glob 匹配
        const testFiles = [
          'test.ts',
          'src/utils.ts',
          'test.js',
          'README.md'
        ];

        console.log('   Glob 匹配测试:');
        testFiles.forEach(testFile => {
          const matches = metadata.globs.some((glob: string) => minimatch(testFile, glob));
          console.log(`     - ${testFile}: ${matches ? '✅ 匹配' : '❌ 不匹配'}`);
        });
      }

      if (!ruleContent) {
        console.log(`   ⚠️  规则内容为空`);
      }
    } else {
      // 全局规则 (.md 文件)
      if (!content.trim()) {
        console.log(`⚠️  ${ruleFile.relativePath}: 规则内容为空`);
      } else {
        console.log(`✅ ${ruleFile.relativePath}: 包含全局规则内容`);
      }
    }
  }
} catch (error) {
  console.log('❌ 规则文件读取失败:', error.message);
  if (error.stack) {
    console.log(error.stack);
  }
  process.exit(1);
}

console.log('');

// 测试 3: readAndFormatRules 函数测试
console.log('测试 3: readAndFormatRules 函数');
console.log('-'.repeat(50));
try {
  const ruleFiles = await discoverRuleFiles(cwd());

  // 模拟文件上下文
  const filePaths = ['src/utils.ts', 'test.ts'];

  const formattedRules = await readAndFormatRules(ruleFiles, filePaths);

  console.log(`✅ 格式化后的规则长度: ${formattedRules.length} 字符`);
  console.log('');
  console.log('格式化后的规则内容:');
  console.log('---');
  console.log(formattedRules);
  console.log('---');

  if (formattedRules.length === 0) {
    console.log('⚠️  没有生成任何规则内容');
  }
} catch (error) {
  console.log('❌ readAndFormatRules 失败:', error.message);
  process.exit(1);
}

console.log('');

// 测试 4: 模拟插件加载
console.log('测试 4: 模拟插件加载');
console.log('-'.repeat(50));
try {
  const pluginPath = './src/index.ts';

  // 动态导入插件
  const pluginModule = await import(pluginPath);
  const defaultExport = pluginModule.default;

  if (typeof defaultExport !== 'function') {
    console.log('❌ 插件默认导出不是函数');
    process.exit(1);
  }

  console.log('✅ 插件可以成功导入');
  console.log(`✅ 插件默认导出类型: ${typeof defaultExport}`);

  // 模拟插件输入（简化版本）
  const mockInput = {
    directory: cwd(),
    client: {},
  };

  // 注意：这里不会真正调用插件，因为需要真实的 OpenCode 客户端
  // 但我们已经验证了插件可以被正确导入
  console.log('⚠️  完整插件加载需要 OpenCode 运行时环境');
} catch (error) {
  console.log('❌ 插件加载失败:', error.message);
  console.log(error.stack);
  process.exit(1);
}

console.log('');
console.log('=== 验证完成 ===');
console.log('');
console.log('总结:');
console.log('✅ 规则文件发现: 正常');
console.log('✅ 规则文件读取: 正常');
console.log('✅ 规则格式化: 正常');
console.log('✅ 插件导入: 正常');
console.log('');
console.log('下一步: 在 OpenCode 会话中运行以下命令测试实际效果：');
console.log('  OPENCODE_RULES_DEBUG=1 opencode');
console.log('');
