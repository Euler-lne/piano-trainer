# Piano Trainer

A Vue 3 + TypeScript project built with Vite for piano training.

## Features

- Vue 3 with TypeScript
- State management with Pinia
- UI components with Naive UI
- Utilities with VueUse
- Web Serial API support
- **五线谱可视化输入**：支持高音谱号/低音谱号，通过点击五线谱添加音符/休止符
- **和弦支持**：同一时刻多个手指同时按下
- **指法自动分配**：将五线谱音符转换为钢琴指法数据
- **实时模拟器**：可视化显示手指高亮，支持多手指同时高亮

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Usage

### 编辑模式切换

1. **表格编辑模式**：传统的小节-音符表格编辑
2. **五线谱模式**：可视化五线谱输入
   - 选择谱号（高音谱号/低音谱号）
   - 选择拍号（4/4、3/4等）
   - 选择音符类型（全音符、二分音符、四分音符等）
   - 点击五线谱添加音符
   - 点击"转换为指法"生成钢琴指法数据

### 模拟器预览

- 支持单手指和多手指（和弦）同时高亮
- 实时播放曲谱
- 可同步到Arduino设备（Web Serial API）
