---
trigger: model_decision
description: 开发 Python 项目和脚本时遵守此规则。
keywords:
  - 'python'
  - 'py'
  - '.py'
---

# Python 开发规范

## 项目和依赖管理

- 使用 `uv` 管理项目和依赖

## 版本要求

- Python 版本：3.11+

## 文件头

所有 Python 脚本必须包含：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
```

## 代码风格

- 遵循 PEP 8 规范
- 使用 4 空格缩进（不使用 tab）
- 行长度限制为 100 字符
- 使用单引号，除非需要双引号
- 文件编码：UTF-8

## 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 变量/函数 | snake_case | `get_user_by_id` |
| 类 | PascalCase | `UserSession` |
| 常量 | UPPER_CASE | `MAX_RETRY_COUNT` |
| 私有成员 | _leading_underscore | `_internal_cache` |

## 导入顺序

1. 标准库
2. 第三方库
3. 本地导入

每组之间用空行分隔。避免通配符导入。

## 类型提示

- 为所有公共函数添加类型提示
- 使用 `typing` 模块处理复杂类型：`Dict`, `List`, `Optional`, `Any`
- 可为 None 的参数使用 `Optional[T]`
- 数据模型使用 `@dataclass` 装饰器

```python
from typing import Optional
from dataclasses import dataclass

@dataclass
class User:
    id: int
    name: str
    email: Optional[str] = None

def get_user(user_id: int) -> Optional[User]:
    ...
```

## 日志

- 使用 `logging` 模块而非 `print()`（脚本工具除外）
- Logger 名称使用 `__name__`
- 使用适当的日志级别：DEBUG, INFO, WARNING, ERROR, CRITICAL
- 日志消息包含上下文信息

```python
import logging

logger = logging.getLogger(__name__)
logger.info("用户登录成功", extra={"user_id": user_id})
```

## 错误处理

- 使用具体的异常类型
- 避免裸 `except:` 子句
- 记录错误并包含上下文信息
- 在适当的层级处理异常

```python
try:
    result = risky_operation()
except ValueError as e:
    logger.error("参数错误", extra={"error": str(e)})
    raise
except Exception as e:
    logger.exception("未知错误")
    raise
```

## 文档

- 为所有公共模块、类和函数使用 docstring
- 遵循 Google Python Style Guide
- 在 docstring 中包含类型信息

```python
def calculate_total(items: list[dict]) -> float:
    """计算订单总金额.
    
    Args:
        items: 订单项列表，每项包含 price 和 quantity 字段。
    
    Returns:
        订单总金额。
    
    Raises:
        ValueError: 当 items 为空时。
    """
    ...
```

## 注释

- 注释使用中文
- 单行注释使用 `#`
- 避免重复代码的明显注释
- 解释为什么而非做什么

## 数据类

优先使用 `dataclass` 定义数据模型：

```python
from dataclasses import dataclass, field
from typing import List

@dataclass
class Order:
    id: int
    items: List[dict] = field(default_factory=list)
    total: float = 0.0
```

## 上下文管理器

使用 `with` 语句管理资源：

```python
with open('file.txt', 'r') as f:
    content = f.read()
```

## 测试

- 使用 `pytest` 作为测试框架
- 测试文件命名：`test_*.py`
- 测试函数命名：`test_*`
