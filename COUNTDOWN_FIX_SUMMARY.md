# 倒计时卡住问题修复总结

## 问题描述
系统在进入"准备开始"(SEGMENT_COUNTDOWN)状态后，倒计时卡在3秒不动，无法继续进入录制状态。

## 根本原因
`CountdownPage.tsx` 组件中的倒计时逻辑存在以下问题：

1. **状态初始化问题**：倒计时状态在组件挂载时初始化，但当组件重新渲染时，状态可能不会正确重置
2. **useEffect 依赖问题**：倒计时逻辑分散在两个 useEffect 中，导致状态更新和定时器管理不同步
3. **定时器清理问题**：旧的定时器可能没有被正确清理，导致多个定时器同时运行或定时器引用丢失

## 修复方案

### 修改文件
`frontend/src/components/CountdownPage.tsx`

### 主要改动

1. **合并 useEffect**：将倒计时初始化和定时器逻辑合并到单个 useEffect 中
2. **添加 intervalRef**：使用 useRef 跟踪定时器引用，确保可以正确清理
3. **添加 completedRef**：防止回调函数被多次调用
4. **添加调试日志**：帮助诊断问题

### 修复后的代码结构

```typescript
export const CountdownPage = ({
  videoElement,
  onCountdownComplete,
  countdownDuration = 5,
}: CountdownPageProps) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(countdownDuration);
  const completedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  // 单个 useEffect 处理所有倒计时逻辑
  useEffect(() => {
    console.log('CountdownPage mounted/updated, starting countdown from', countdownDuration);
    
    // 重置状态
    setCountdown(countdownDuration);
    completedRef.current = false;
    
    // 清理现有定时器
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // 启动倒计时定时器
    intervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        console.log('Countdown tick:', prev);
        
        if (prev <= 1) {
          // 清理定时器
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          
          // 触发回调
          if (onCountdownComplete && !completedRef.current) {
            completedRef.current = true;
            console.log('Countdown complete, triggering callback');
            setTimeout(onCountdownComplete, 100);
          }
          return 0;
        }
        
        return prev - 1;
      });
    }, 1000);

    // 组件卸载时清理
    return () => {
      console.log('Cleaning up countdown interval');
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [countdownDuration, onCountdownComplete]);
  
  // ... 渲染逻辑
}
```

## 关键改进

1. **状态同步**：所有状态重置和定时器管理在同一个 useEffect 中进行，确保同步
2. **定时器管理**：使用 intervalRef 确保定时器引用不会丢失，可以正确清理
3. **防止重复调用**：使用 completedRef 确保 onCountdownComplete 只被调用一次
4. **依赖正确**：useEffect 依赖 [countdownDuration, onCountdownComplete]，确保在这些值变化时重新初始化

## 测试验证

### 手动测试步骤
1. 启动系统
2. 进入场景选择
3. 选择一个场景
4. 在引导页面站入检测框，等待3秒倒计时
5. 观察是否正确进入5秒倒计时页面
6. 确认倒计时从5开始递减到0
7. 确认倒计时结束后自动进入录制状态

### 预期结果
- 倒计时应该从5开始，每秒递减1
- 倒计时到0时显示"开始！"
- 100ms后自动转换到录制状态
- 控制台应该显示清晰的日志信息

## 相关文件

- `frontend/src/components/CountdownPage.tsx` - 主要修复文件
- `frontend/src/App.tsx` - 状态转换逻辑
- `frontend/src/components/SegmentGuidancePage.tsx` - 前置引导页面
- `frontend/src/state/state-machine.ts` - 状态机定义

## 后续建议

1. **移除调试日志**：在确认修复有效后，可以移除 console.log 语句
2. **添加单元测试**：为 CountdownPage 添加更完整的单元测试
3. **性能监控**：确认定时器不会造成性能问题

## 注意事项

- 此修复假设 MediaPipe 已正确配置并可以正常工作
- 如果 MediaPipe 仍有问题，需要先解决 MediaPipe 的加载问题
- 倒计时的视觉效果（进度环）依赖于 CSS 动画，确保 CSS 文件正确加载
