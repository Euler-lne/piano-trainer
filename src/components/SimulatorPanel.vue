<template>
    <div class="simulator-panel">
        <div class="simulator-header">
            <span class="title">🎹 可视化模拟器</span>
            <div class="controls">
                <n-checkbox v-if="props.isSerialConnected" v-model:checked="syncToNano">
                    同步到 Nano
                </n-checkbox>
                <n-button-group>
                    <n-button size="small" @click="handlePlay" :disabled="isPlaying"
                        :type="isPlaying ? 'default' : 'primary'">
                        ▶ 播放
                    </n-button>
                    <n-button size="small" @click="handlePause" :disabled="!isPlaying">⏸ 暂停</n-button>
                    <n-button size="small" @click="handleStop" :disabled="!isPlaying && currentTime === 0">⏹
                        停止</n-button>
                </n-button-group>
                <n-divider vertical />
                <n-select v-model:value="selectedSectionIdx" :options="sectionOptions" size="small" style="width: 140px"
                    @update:value="onSectionChange" />
                <n-select v-if="currentSectionBars.length > 0" v-model:value="selectedBarIdx" :options="barOptions"
                    size="small" style="width: 100px" @update:value="onBarChange" />
            </div>
        </div>

        <div class="hands-container">
            <div class="hand left-hand">
                <div class="hand-label">左手</div>
                <div class="fingers">
                    <div v-for="finger in leftFingers" :key="finger.id" class="finger"
                        :class="{ active: activeFingers.includes(finger.id) }"
                        :style="{ backgroundColor: finger.activeColor }">
                        <span class="finger-label">{{ finger.label }}</span>
                    </div>
                </div>
            </div>
            <div class="hand right-hand">
                <div class="hand-label">右手</div>
                <div class="fingers">
                    <div v-for="finger in rightFingers" :key="finger.id" class="finger"
                        :class="{ active: activeFingers.includes(finger.id) }"
                        :style="{ backgroundColor: finger.activeColor }">
                        <span class="finger-label">{{ finger.label }}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="timeline">
            <div class="progress-info">
                <span>{{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}</span>
                <span>音符 {{ currentNoteIndex + 1 }} / {{ totalNotes }}</span>
            </div>
            <n-slider v-model:value="progressPercent" :min="0" :max="100" :step="0.1" @update:value="onSeek" />
        </div>

        <div class="status-bar">
            <span v-if="isPlaying">▶ 播放中</span>
            <span v-else-if="isPaused">⏸ 已暂停</span>
            <span v-else>⏹ 停止</span>
            <span v-if="selectedSectionIdx != null && sectionOptions[selectedSectionIdx]">
                段落: {{ sectionOptions[selectedSectionIdx].label }}
            </span>
            <span v-if="selectedBarIdx != null && barOptions[selectedBarIdx]">
                小节: {{ barOptions[selectedBarIdx].label }}
            </span>
            <span v-if="props.isSerialConnected">同步: {{ syncToNano ? '开启' : '关闭' }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { NButton, NButtonGroup, NSelect, NSlider, NDivider, NCheckbox, useMessage } from 'naive-ui';
import { useScoreStore } from '@/stores/scoreStore';
import { beatToMs } from '@/utils/beatConverter';
import { packScoreToBinary } from '@/composables/useBinaryPack';

interface TimelineEvent {
    absoluteTime: number;
    fingers: number[]; // 修改为数组
}

const props = defineProps<{
    isSerialConnected: boolean;
    sendSerialCommand: (cmd: number, data?: Uint8Array) => Promise<void>;
}>();

const message = useMessage();
const store = useScoreStore();

const syncToNano = ref(true);

const rightFingers = [
    { id: 1, label: 'R1', activeColor: '#e53935' },
    { id: 2, label: 'R2', activeColor: '#e53935' },
    { id: 3, label: 'R3', activeColor: '#e53935' },
    { id: 4, label: 'R4', activeColor: '#e53935' },
    { id: 5, label: 'R5', activeColor: '#e53935' },
];
const leftFingers = [
    { id: 10, label: 'L5', activeColor: '#1e88e5' },
    { id: 9, label: 'L4', activeColor: '#1e88e5' },
    { id: 8, label: 'L3', activeColor: '#1e88e5' },
    { id: 7, label: 'L2', activeColor: '#1e88e5' },
    { id: 6, label: 'L1', activeColor: '#1e88e5' },
];

let animationId: number | null = null;
let startTimestamp = 0;
let pausedAt = 0;
const isPlaying = ref(false);
const isPaused = ref(false);
const currentTime = ref(0);
const currentNoteIndex = ref(0);
const activeFingers = ref<number[]>([]);

let timeline: TimelineEvent[] = [];
const totalDuration = ref(0);
const totalNotes = ref(0);
const selectedSectionIdx = ref<number>(0);
const selectedBarIdx = ref<number | null>(null);

const sectionOptions = computed(() =>
    store.currentScore.sections.map((sec, idx) => ({
        label: sec.name || `段落 ${idx + 1}`,
        value: idx,
    }))
);
const currentSectionBars = computed(() => {
    const idx = selectedSectionIdx.value;
    if (idx === undefined || idx >= store.currentScore.sections.length) return [];
    return store.currentScore.sections[idx].bars;
});
const barOptions = computed(() =>
    currentSectionBars.value.map((_, idx) => ({
        label: `小节 ${idx + 1}`,
        value: idx,
    }))
);
const progressPercent = computed({
    get: () => (totalDuration.value > 0 ? (currentTime.value / totalDuration.value) * 100 : 0),
    set: (val: number) => {
        const newTime = (val / 100) * totalDuration.value;
        seekToTime(newTime);
    },
});

// 辅助发送串口命令（仅当同步）
async function sendSyncCommand(cmd: number, data?: Uint8Array) {
    if (props.isSerialConnected && syncToNano.value) {
        await props.sendSerialCommand(cmd, data);
    }
}

// 获取当前要播放的音符列表（根据选中的段落/小节）
function getCurrentNotesToPlay(): { beatLength: number; fingers: number[] }[] {
    // 优先使用和弦数据
    if (store.currentChordScore.length > 0) {
        return store.currentChordScore.map(event => ({
            beatLength: event.beatLength,
            fingers: event.fingers,
        }));
    }

    // 回退到传统数据
    const sections = store.currentScore.sections;
    if (sections.length === 0) return [];
    let secIdx = selectedSectionIdx.value;
    if (secIdx === undefined || secIdx >= sections.length) secIdx = 0;
    const section = sections[secIdx];
    if (selectedBarIdx.value !== null && selectedBarIdx.value >= 0 && selectedBarIdx.value < section.bars.length) {
        const bar = section.bars[selectedBarIdx.value];
        return bar.notes.map(n => ({ beatLength: n.beatLength, fingers: n.finger === 0 ? [] : [n.finger] }));
    } else {
        const allNotes: { beatLength: number; fingers: number[] }[] = [];
        for (const bar of section.bars) {
            for (const note of bar.notes) {
                allNotes.push({ beatLength: note.beatLength, fingers: note.finger === 0 ? [] : [note.finger] });
            }
        }
        return allNotes;
    }
}

// 上传当前选中内容到 Nano（覆盖原有曲谱）
async function uploadCurrentToNano() {
    if (!props.isSerialConnected || !syncToNano.value) return;
    const notes = getCurrentNotesToPlay();
    if (notes.length === 0) return;
    // 将 notes 转换为 packScoreToBinary 需要的格式（每个 note 需要 timeOffset 毫秒）
    // 暂时只支持单手指，忽略和弦中的额外手指
    const bpm = store.currentScore.bpm;
    const notesWithOffset = notes.map((note, idx) => ({
        timeOffset: idx === 0 ? 0 : beatToMs(note.beatLength, bpm),
        finger: note.fingers.length > 0 ? note.fingers[0] : 0, // 取第一个手指或休止
    }));
    const packet = packScoreToBinary({ notes: notesWithOffset });
    await sendSyncCommand(0x01, packet.slice(2)); // 跳过帧头和命令？不对，packScoreToBinary 已经包含完整包，直接发送即可
    // 重新发送完整包（packScoreToBinary 已经包含头、长度、校验等）
    await sendSyncCommand(0x01, packet); // 直接发送完整包
    console.log('Uploaded current selection to Nano');
}

function rebuildTimeline() {
    const notes = getCurrentNotesToPlay();
    const bpm = store.currentScore.bpm;
    const events: TimelineEvent[] = [];
    let accum = 0;
    for (const n of notes) {
        const durMs = beatToMs(n.beatLength, bpm);
        events.push({ absoluteTime: accum, fingers: n.fingers });
        accum += durMs;
    }
    timeline = events;
    totalDuration.value = accum;
    totalNotes.value = timeline.length;
}

function updateFromStore() {
    rebuildTimeline();
    handleStop();
    currentTime.value = 0;
    currentNoteIndex.value = 0;
    activeFingers.value = [];
}

// 本地动画函数
function startLocalPlayback() {
    if (timeline.length === 0) {
        message.warning('没有可播放的音符');
        return;
    }
    if (isPlaying.value && !isPaused.value) return;
    if (isPaused.value) {
        isPaused.value = false;
        startTimestamp = performance.now() - pausedAt;
        animateLocal();
        return;
    }
    isPlaying.value = true;
    isPaused.value = false;
    startTimestamp = performance.now() - currentTime.value;
    animateLocal();
}
function pauseLocalPlayback() {
    if (!isPlaying.value || isPaused.value) return;
    isPlaying.value = false;
    isPaused.value = true;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    pausedAt = currentTime.value;
}
function stopLocalPlayback() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    isPlaying.value = false;
    isPaused.value = false;
    currentTime.value = 0;
    currentNoteIndex.value = 0;
    activeFingers.value = [];
}
function seekLocalTime(timeMs: number) {
    const t = Math.min(Math.max(timeMs, 0), totalDuration.value);
    currentTime.value = t;
    let idx = 0;
    while (idx < timeline.length && timeline[idx].absoluteTime <= t) idx++;
    if (idx > 0) idx--;
    currentNoteIndex.value = idx;
    activeFingers.value = [];
    if (isPlaying.value && !isPaused.value) {
        startTimestamp = performance.now() - currentTime.value;
    }
}
function animateLocal() {
    if (!isPlaying.value || isPaused.value) return;
    const now = performance.now();
    const elapsed = now - startTimestamp;
    if (elapsed >= totalDuration.value) {
        stopLocalPlayback();
        return;
    }
    currentTime.value = elapsed;
    let highlightFingers: number[] = [];
    for (let i = 0; i < timeline.length; i++) {
        if (timeline[i].absoluteTime <= elapsed) {
            highlightFingers = timeline[i].fingers;
            currentNoteIndex.value = i;
        } else {
            break;
        }
    }
    activeFingers.value = highlightFingers;
    animationId = requestAnimationFrame(animateLocal);
}

// 统一控制函数
async function handlePlay() {
    if (isPaused.value) startLocalPlayback();
    else {
        stopLocalPlayback();
        startLocalPlayback();
    }
    await sendSyncCommand(0x02);
}

async function handlePause() {
    pauseLocalPlayback();
    await sendSyncCommand(0x05);
}

async function handleStop() {
    stopLocalPlayback();
    await sendSyncCommand(0x03);
}

function seekToTime(timeMs: number) {
    seekLocalTime(timeMs);
    if (props.isSerialConnected && syncToNano.value) {
        let idx = 0;
        while (idx < timeline.length && timeline[idx].absoluteTime <= timeMs) idx++;
        if (idx > 0) idx--;
        const data = new Uint8Array(2);
        data[0] = idx & 0xFF;
        data[1] = (idx >> 8) & 0xFF;
        sendSyncCommand(0x04, data);
    }
}

function onSeek(timeMs?: number) {
    if (timeMs !== undefined) seekToTime(timeMs);
    else if (progressPercent.value !== undefined) seekToTime((progressPercent.value / 100) * totalDuration.value);
}

function formatTime(ms: number) {
    const totalSec = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 当段落或小节改变时，重建时间轴并上传到 Nano
async function onSectionChange() {
    selectedBarIdx.value = null;
    rebuildTimeline();
    handleStop();
    currentTime.value = 0;
    currentNoteIndex.value = 0;
    activeFingers.value = [];
    await uploadCurrentToNano();
    await sendSyncCommand(0x03); // 停止 Nano 播放
}

async function onBarChange() {
    rebuildTimeline();
    handleStop();
    currentTime.value = 0;
    currentNoteIndex.value = 0;
    activeFingers.value = [];
    await uploadCurrentToNano();
    await sendSyncCommand(0x03);
}

watch(() => store.currentScore, () => {
    updateFromStore();
    // 当整个曲谱变化时（如导入、编辑），也重新上传当前选中内容
    if (props.isSerialConnected && syncToNano.value) {
        uploadCurrentToNano();
    }
}, { deep: true });

updateFromStore();

// 初始化时如果已连接且同步开启，自动上传当前选中的内容
if (props.isSerialConnected && syncToNano.value) {
    uploadCurrentToNano();
}

onUnmounted(() => {
    if (animationId) cancelAnimationFrame(animationId);
});
</script>

<style scoped>
.simulator-panel {
    background: #f8fafc;
    border-radius: 16px;
    padding: 16px;
    margin-top: 20px;
    border: 1px solid #e2e8f0;
}

.simulator-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;
}

.title {
    font-weight: bold;
    font-size: 1rem;
}

.controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.hands-container {
    display: flex;
    justify-content: space-around;
    gap: 40px;
    margin: 20px 0;
    flex-wrap: wrap;
}

.hand {
    text-align: center;
    background: #ffffff;
    border-radius: 20px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    flex: 1;
    min-width: 200px;
}

.hand-label {
    font-weight: 600;
    margin-bottom: 12px;
    color: #1e293b;
}

.fingers {
    display: flex;
    justify-content: center;
    gap: 16px;
}

.finger {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.finger.active {
    background-color: #f97316 !important;
    transform: scale(1.1);
    box-shadow: 0 0 12px rgba(249, 115, 22, 0.6);
}

.finger-label {
    font-weight: bold;
    font-size: 18px;
    color: white;
    text-shadow: 0 0 2px black;
}

.timeline {
    margin: 16px 0;
}

.progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 8px;
    color: #475569;
}

.status-bar {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #334155;
    border-top: 1px solid #e2e8f0;
    padding-top: 12px;
    margin-top: 8px;
}
</style>