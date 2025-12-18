---
alwaysApply: true
---

以后发布新版本的流程
# 1. 提交所有改动git add -Agit commit -m "feat: 新功能描述"git push origin master# 2. 创建新版本标签git tag v1.0.1# 3. 推送标签触发构建git push origin v1.0.1
版本号规范建议
v1.0.0 → 首次发布
v1.0.1 → Bug 修复
v1.1.0 → 新功能
v2.0.0 → 重大更新
