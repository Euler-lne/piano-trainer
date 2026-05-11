<template>
    <div class="home-container">
        <n-layout has-sider :sider-placement="'left'">
            <n-layout-sider :width="320" :collapsed-width="0" show-trigger="bar" class="sidebar">
                <div class="sidebar-content">
                    <n-card title="串口控制" size="small" class="control-card">
                        <div class="status-indicator">
                            <div :class="['status-dot', isConnected ? 'connected' : 'disconnected']"></div>
                            <span>{{ isConnected ? '已连接' : '未连接' }}</span>
                        </div>
                        <n-space vertical :size="8" style="margin-top: 12px;">
                            <n-button v-if="!isConnected" type="primary" block :loading="isOpening"
                                @click="handleConnect">
                                连接设备
                            </n-button>
                            <n-button v-else type="error" block @click="handleDisconnect">
                                断开连接
                            </n-button>
                            <div v-if="errorMessage" class="error-text">{{ errorMessage }}</div>
                        </n-space>
                    </n-card>

                    <n-card title="上传控制" size="small" class="control-card">
                        <n-space vertical :size="12">
                            <n-button type="success" block :disabled="!isConnected || totalNotes === 0"
                                :loading="isSending" @click="handleUpload">
                                上传到 Arduino
                            </n-button>
                            <div style="font-size: 12px; color: #666;">曲谱音符: {{ totalNotes }} 个</div>
                        </n-space>
                    </n-card>

                    <n-card size="small" class="log-card">
                        <template #header>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span>日志</span>
                                <n-button size="tiny" @click="clearReceiveLogs">清除接收日志</n-button>
                            </div>
                        </template>
                        <div class="log-content" ref="logContainer">
                            <div v-for="(log, index) in logs" :key="index" :class="['log-item', log.type]">
                                <span class="log-time">{{ log.time }}</span>
                                <span class="log-message">{{ log.message }}</span>
                            </div>
                        </div>
                    </n-card>
                </div>
            </n-layout-sider>

            <n-layout>
                <n-layout-content content-style="padding: 0; overflow: hidden; height: 100vh;">
                    <ScoreEditor :isSerialConnected="isConnected" :sendSerialCommand="sendSerialCommand" />
                </n-layout-content>
            </n-layout>
        </n-layout>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import {
    NLayout,
    NLayoutSider,
    NLayoutContent,
    NCard,
    NButton,
    NSpace,
    useMessage,
} from 'naive-ui';
import ScoreEditor from '@/components/ScoreEditor.vue';
import { useSerial } from '@/composables/useSerial';
import { packScoreToBinary } from '@/composables/useBinaryPack';
import { useScoreStore } from '@/stores/scoreStore';

const message = useMessage();
const scoreStore = useScoreStore();
const { isConnected, isOpening, errorMessage, requestPort, openPort, closePort, sendData, receivedData } = useSerial();

const isSending = ref(false);
const logs = ref<Array<{ time: string; message: string; type: string }>>([]);
const logContainer = ref<HTMLElement>();

const totalNotes = computed(() => {
    let count = 0;
    for (const section of scoreStore.currentScore.sections) {
        for (const bar of section.bars) {
            count += bar.notes.length;
        }
    }
    return count;
});

function addLog(msg: string, type: 'info' | 'success' | 'error' = 'info') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    logs.value.push({ time, message: msg, type });
    nextTick(() => {
        if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
    });
}

function clearReceiveLogs() {
    logs.value = logs.value.filter(log => !(log.type === 'info' && log.message.startsWith('[接收]')));
    message.success('已清除接收日志');
}

watch(receivedData, (newData) => {
    if (newData && newData.length > 0) {
        const lines = newData.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim()) {
                addLog(`[接收] ${line.trim()}`, 'info');
            }
        }
    }
});

async function handleConnect() {
    try {
        await requestPort();
        addLog('已选择设备，正在打开...', 'info');
        await openPort(115200);
        addLog('串口已连接', 'success');
        message.success('设备已连接');
    } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        addLog(`连接失败: ${msg}`, 'error');
        message.error(`连接失败: ${msg}`);
    }
}

async function handleDisconnect() {
    try {
        await closePort();
        addLog('串口已断开', 'info');
        message.success('已断开');
    } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        addLog(`断开失败: ${msg}`, 'error');
    }
}

async function handleUpload() {
    if (!isConnected.value) {
        addLog('错误: 未连接设备', 'error');
        message.error('请先连接设备');
        return;
    }
    if (totalNotes.value === 0) {
        addLog('错误: 曲谱为空', 'error');
        message.warning('曲谱为空');
        return;
    }

    try {
        isSending.value = true;
        const flatten = scoreStore.getFlattenNotes();
        const packet = packScoreToBinary({ notes: flatten });
        addLog(`打包数据: ${packet.length} 字节, BPM=${scoreStore.currentScore.bpm}`, 'info');
        await sendData(packet);
        addLog('✓ 数据已发送到 Arduino', 'success');
        message.success('上传成功');
    } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        addLog(`发送失败: ${msg}`, 'error');
        message.error(`发送失败: ${msg}`);
    } finally {
        isSending.value = false;
    }
}

watch(errorMessage, (newErr) => {
    if (newErr) addLog(`串口错误: ${newErr}`, 'error');
});

async function sendSerialCommand(cmd: number, data?: Uint8Array) {
    if (!isConnected.value) return;
    const dataLen = data ? data.length : 0;
    const packet = new Uint8Array(2 + 1 + 2 + dataLen + 1);
    packet[0] = 0xAA; packet[1] = 0xBB;
    packet[2] = cmd;
    packet[3] = dataLen & 0xFF;
    packet[4] = (dataLen >> 8) & 0xFF;
    if (data) packet.set(data, 5);
    let checksum = 0;
    for (let i = 0; i < packet.length - 1; i++) checksum ^= packet[i];
    packet[packet.length - 1] = checksum;
    await sendData(packet);
}
</script>

<style scoped>
.home-container {
    width: 100%;
    height: 100vh;
    overflow: hidden;
}

.sidebar {
    border-right: 1px solid rgba(0, 0, 0, 0.08);
}

.sidebar-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    height: 100vh;
    overflow-y: auto;
}

.control-card {
    flex-shrink: 0;
}

.log-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.log-content {
    flex: 1;
    overflow-y: auto;
    background: #f8fafc;
    border-radius: 8px;
    padding: 8px;
    font-family: monospace;
    font-size: 12px;
    max-height: 300px;
}

.log-item {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    padding: 4px;
    border-radius: 4px;
}

.log-item.info {
    color: #0284c7;
}

.log-item.success {
    color: #16a34a;
}

.log-item.error {
    color: #dc2626;
}

.log-time {
    color: #64748b;
    flex-shrink: 0;
}

.log-message {
    flex: 1;
    word-break: break-all;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    padding: 8px;
    background: #f1f5f9;
    border-radius: 8px;
}

.status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
}

.status-dot.connected {
    background: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
}

.status-dot.disconnected {
    background: #ef4444;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.6;
    }
}

.error-text {
    font-size: 12px;
    color: #dc2626;
    background: #fee2e2;
    padding: 8px;
    border-radius: 8px;
}
</style>