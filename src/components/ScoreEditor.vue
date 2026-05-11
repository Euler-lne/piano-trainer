<template>
    <div class="score-editor">
        <div class="toolbar">
            <div class="left">
                <div class="score-name">
                    <span class="label">曲谱</span>
                    <n-input v-model:value="scoreName" @blur="updateName" size="small" style="width: 160px" />
                </div>
                <div class="bpm-control">
                    <span class="label">BPM</span>
                    <n-input-number v-model:value="bpm" :min="20" :max="300" :step="1" @update:value="updateBpm"
                        size="small" style="width: 90px" />
                    <span class="ms-hint">四分音符 = {{ quarterMs }} ms</span>
                </div>
            </div>
            <div class="right">
                <n-button strong secondary size="small" @click="toggleStaffMode">
                    <template #icon>🎼</template>
                    {{ useStaffMode ? '表格编辑' : '五线谱模式' }}
                </n-button>
                <n-button strong secondary size="small" @click="loadExample">
                    <template #icon>🐯</template>
                    示例
                </n-button>
                <n-button strong secondary size="small" @click="toggleSimulator">
                    <template #icon>🎬</template>
                    {{ showSimulator ? '编辑曲谱' : '模拟器预览' }}
                </n-button>
                <n-button strong secondary size="small" @click="exportScore">
                    <template #icon>📁</template>
                    导出
                </n-button>
                <n-button strong secondary size="small" @click="triggerImport">
                    <template #icon>📂</template>
                    导入
                </n-button>
                <input type="file" ref="fileInput" style="display: none" accept=".json" @change="handleImport" />
            </div>
        </div>

        <div class="sections-container" v-show="!showSimulator">
            <div v-show="!useStaffMode">
                <!-- 编辑区域内容不变（同之前） -->
                <div v-for="(section, secIdx) in sections" :key="section.id" class="section-card">
                    <div class="section-header">
                        <div class="section-title-area">
                            <n-button size="tiny" quaternary @click="toggleSection(secIdx)" class="collapse-btn">
                                {{ collapsedSections.has(section.id) ? '▶' : '▼' }}
                            </n-button>
                            <n-input v-model:value="section.name"
                                @blur="(e: FocusEvent) => updateSectionName(secIdx, (e.target as HTMLInputElement).value)"
                                size="small" class="section-name-input" />
                        </div>
                        <div class="section-actions">
                            <n-button size="tiny" quaternary @click="duplicateSection(secIdx)"
                                title="复制段落">📋</n-button>
                            <n-button size="tiny" quaternary @click="moveSection(secIdx, 'up')"
                                :disabled="secIdx === 0">↑</n-button>
                            <n-button size="tiny" quaternary @click="moveSection(secIdx, 'down')"
                                :disabled="secIdx === sections.length - 1">↓</n-button>
                            <n-button size="tiny" quaternary type="error" @click="removeSection(secIdx)">✖</n-button>
                        </div>
                    </div>
                    <div v-if="!collapsedSections.has(section.id)" class="section-content">
                        <div class="bars-list">
                            <div v-for="(bar, barIdx) in section.bars" :key="bar.id" class="bar-card">
                                <div class="bar-header">
                                    <span class="bar-title">小节 {{ barIdx + 1 }}</span>
                                    <div class="bar-actions">
                                        <n-button size="tiny" quaternary @click="moveBar(secIdx, barIdx, 'up')"
                                            :disabled="barIdx === 0">↑</n-button>
                                        <n-button size="tiny" quaternary @click="moveBar(secIdx, barIdx, 'down')"
                                            :disabled="barIdx === section.bars.length - 1">↓</n-button>
                                        <n-button size="tiny" quaternary type="error"
                                            @click="removeBar(secIdx, barIdx)">✖</n-button>
                                    </div>
                                </div>
                                <div class="notes-row">
                                    <div v-for="(note, noteIdx) in bar.notes" :key="noteIdx" class="note-item">
                                        <n-select v-model:value="note.finger" :options="fingerOptions" size="small"
                                            style="width: 140px;"
                                            @update:value="updateNoteField(secIdx, barIdx, noteIdx, 'finger', $event)" />
                                        <n-select v-model:value="note.beatLength" :options="beatOptions" size="small"
                                            style="width: 160px;"
                                            @update:value="updateNoteField(secIdx, barIdx, noteIdx, 'beatLength', $event)" />
                                        <span class="ms-preview">{{ beatToMs(note.beatLength, bpm) }} ms</span>
                                        <n-button size="tiny" quaternary type="error"
                                            @click="removeNote(secIdx, barIdx, noteIdx)">✕</n-button>
                                    </div>
                                    <n-button size="small" quaternary @click="addNote(secIdx, barIdx)"
                                        class="add-note-btn">+
                                        音符</n-button>
                                </div>
                            </div>
                            <n-button size="small" @click="addBar(secIdx)" class="add-bar-btn">+ 添加小节</n-button>
                        </div>
                    </div>
                </div>
                <n-button size="small" @click="addSection" class="add-section-btn">+ 添加段落</n-button>
            </div>
            <div v-show="useStaffMode">
                <StaffInput :bpm="bpm" @convert-to-chord-score="handleConvertToChordScore" />
            </div>
        </div>

        <div class="simulator-wrapper" v-show="showSimulator">
            <SimulatorPanel :isSerialConnected="isSerialConnected" :sendSerialCommand="sendSerialCommand" />
        </div>

        <div class="stats-bar">
            <div>📊 总段落: {{ sections.length }}</div>
            <div>🎵 总小节: {{ totalBars }}</div>
            <div>🎶 总音符: {{ totalNotes }}</div>
            <div>📦 预估包大小: {{ estimatedSize }} 字节</div>
            <div>⏱️ 四分音符: {{ quarterMs }} ms</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { NInput, NInputNumber, NButton, NSelect, useMessage } from 'naive-ui';
import { useScoreStore } from '@/stores/scoreStore';
import { beatToMs } from '@/utils/beatConverter';
import type { Note, Section, NoteChordEvent, StaffSection } from '@/types/score';
import SimulatorPanel from './SimulatorPanel.vue';
import StaffInput from './StaffInput.vue';

const props = defineProps<{
    isSerialConnected: boolean;
    sendSerialCommand: (cmd: number, data?: Uint8Array) => Promise<void>;
}>();

const message = useMessage();
const store = useScoreStore();

const sections = ref<Section[]>(store.currentScore.sections);
const bpm = ref(store.currentScore.bpm);
const scoreName = ref(store.currentScore.name);
const fileInput = ref<HTMLInputElement | null>(null);
const collapsedSections = ref<Set<number>>(new Set());
const showSimulator = ref(false);
const useStaffMode = ref(false);

const fingerOptions = [
    { label: '休止', value: 0 },
    { label: '右手1 (拇指)', value: 1 },
    { label: '右手2 (食指)', value: 2 },
    { label: '右手3 (中指)', value: 3 },
    { label: '右手4 (无名指)', value: 4 },
    { label: '右手5 (小指)', value: 5 },
    { label: '左手1 (拇指)', value: 6 },
    { label: '左手2 (食指)', value: 7 },
    { label: '左手3 (中指)', value: 8 },
    { label: '左手4 (无名指)', value: 9 },
    { label: '左手5 (小指)', value: 10 },
];

const beatOptions = [
    { label: '全音符 (4拍)', value: 4 },
    { label: '二分音符 (2拍)', value: 2 },
    { label: '四分音符 (1拍)', value: 1 },
    { label: '八分音符 (0.5拍)', value: 0.5 },
    { label: '十六分音符 (0.25拍)', value: 0.25 },
];

const totalBars = computed(() => sections.value.reduce((acc, s) => acc + s.bars.length, 0));
const totalNotes = computed(() => sections.value.reduce((acc, s) => acc + s.bars.reduce((a, b) => a + b.notes.length, 0), 0));
const estimatedSize = computed(() => 9 + totalNotes.value * 3);
const quarterMs = computed(() => beatToMs(1, bpm.value));

watch(() => store.currentScore, (newScore) => {
    sections.value = newScore.sections;
    bpm.value = newScore.bpm;
    scoreName.value = newScore.name;
}, { deep: true });

function toggleSimulator() {
    showSimulator.value = !showSimulator.value;
}

function toggleStaffMode() {
    useStaffMode.value = !useStaffMode.value;
}

function handleConvertToChordScore(chords: NoteChordEvent[], bpmValue: number, name: string, staffSections: StaffSection[]) {
    store.setChordScore(chords);
    store.currentStaffScore = staffSections;
    bpm.value = bpmValue;
    showSimulator.value = true;
    message.success(`已生成指法：${name}，已切换到模拟器预览。`);
}

function toggleSection(idx: number) {
    const id = sections.value[idx].id;
    if (collapsedSections.value.has(id)) {
        collapsedSections.value.delete(id);
    } else {
        collapsedSections.value.add(id);
    }
}

function duplicateSection(idx: number) {
    const original = sections.value[idx];
    const newSection: Section = JSON.parse(JSON.stringify(original));
    newSection.id = Date.now();
    newSection.name = `${original.name} (副本)`;
    const newSections = [...sections.value];
    newSections.splice(idx + 1, 0, newSection);
    store.currentScore.sections = newSections;
    message.success('段落已复制');
}

function updateName() {
    store.currentScore.name = scoreName.value;
}

function updateBpm() {
    store.currentScore.bpm = bpm.value;
    message.info(`BPM 已设为 ${bpm.value}`);
}

function loadExample() {
    store.loadExample();
    collapsedSections.value.clear();
    message.success('已加载两只老虎示例');
}

function addSection() {
    store.addSection();
}

function removeSection(idx: number) {
    store.removeSection(idx);
    const sec = sections.value[idx];
    if (sec) collapsedSections.value.delete(sec.id);
}

function moveSection(idx: number, dir: 'up' | 'down') {
    store.moveSection(idx, dir);
}

function updateSectionName(idx: number, name: string) {
    store.updateSectionName(idx, name);
}

function addBar(sectionIdx: number) {
    store.addBar(sectionIdx);
}

function removeBar(sectionIdx: number, barIdx: number) {
    store.removeBar(sectionIdx, barIdx);
}

function moveBar(sectionIdx: number, barIdx: number, dir: 'up' | 'down') {
    store.moveBar(sectionIdx, barIdx, dir);
}

function addNote(sectionIdx: number, barIdx: number) {
    store.addNoteToBar(sectionIdx, barIdx);
}

function removeNote(sectionIdx: number, barIdx: number, noteIdx: number) {
    store.removeNoteFromBar(sectionIdx, barIdx, noteIdx);
}

function updateNoteField(sectionIdx: number, barIdx: number, noteIdx: number, field: keyof Note, value: any) {
    store.updateNote(sectionIdx, barIdx, noteIdx, { [field]: value });
}

function exportScore() {
    const json = store.exportToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.currentScore.name || 'score'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
}

function triggerImport() {
    fileInput.value?.click();
}

function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target?.result as string;
        if (store.importFromJson(text)) {
            collapsedSections.value.clear();
            message.success('导入成功');
        } else {
            message.error('文件格式错误');
        }
        input.value = '';
    };
    reader.readAsText(file);
}
</script>

<style scoped>
.score-editor {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f5f7fc;
    color: #1e293b;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
}

.toolbar {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    background: white;
    padding: 12px 20px;
    border-bottom: 1px solid #e2e8f0;
}

.left,
.right {
    display: flex;
    align-items: center;
    gap: 20px;
}

.score-name,
.bpm-control {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f1f5f9;
    padding: 4px 12px;
    border-radius: 24px;
}

.label {
    font-size: 13px;
    font-weight: 500;
    color: #475569;
}

.ms-hint {
    font-size: 12px;
    color: #64748b;
}

.sections-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-height: 0;
}

.simulator-wrapper {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
}

.section-card {
    background: white;
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid #e2e8f0;
    overflow: hidden;
    flex-shrink: 0;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
}

.section-title-area {
    display: flex;
    align-items: center;
    gap: 12px;
}

.collapse-btn {
    width: 28px;
    padding: 0;
}

.section-name-input {
    width: 200px;
    font-weight: 600;
    background: white;
}

.section-actions {
    display: flex;
    gap: 8px;
}

.bars-list {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.bar-card {
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

.bar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
}

.bar-title {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
}

.bar-actions {
    display: flex;
    gap: 6px;
}

.notes-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
}

.note-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f8fafc;
    border-radius: 40px;
    padding: 4px 12px 4px 16px;
    border: 1px solid #e2e8f0;
}

.ms-preview {
    font-size: 11px;
    font-family: monospace;
    color: #64748b;
    background: white;
    padding: 2px 8px;
    border-radius: 20px;
}

.add-note-btn,
.add-bar-btn,
.add-section-btn {
    margin-top: 4px;
}

.add-section-btn {
    align-self: flex-start;
    margin-top: 8px;
    flex-shrink: 0;
}

.stats-bar {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 16px;
    background: white;
    border-top: 1px solid #e2e8f0;
    padding: 10px 20px;
    font-size: 13px;
    color: #334155;
}

.sections-container::-webkit-scrollbar {
    width: 6px;
}

.sections-container::-webkit-scrollbar-track {
    background: #e2e8f0;
    border-radius: 3px;
}

.sections-container::-webkit-scrollbar-thumb {
    background: #94a3b8;
    border-radius: 3px;
}
</style>