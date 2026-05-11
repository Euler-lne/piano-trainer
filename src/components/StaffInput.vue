<template>
    <div class="staff-input">
        <div class="staff-toolbar">
            <div class="toolbar-group">
                <n-select v-model:value="currentSectionIndex" :options="sectionOptions" size="small"
                    style="width: 160px;" />
                <n-button size="small" @click="addSection">+ 段落</n-button>
                <n-button size="small" type="error" @click="removeCurrentSection" :disabled="sections.length <= 1">-
                    段落</n-button>
            </div>
            <div class="toolbar-group">
                <n-select v-model:value="currentTimeSignature" :options="timeSignatureOptions" size="small"
                    style="width: 110px;" @update:value="updateTimeSignature" />
                <n-button-group size="small">
                    <n-button v-for="note in noteTypes" :key="note.value"
                        :type="selectedNoteType === note.value ? 'primary' : 'default'"
                        @click="selectNoteType(note.value)">
                        {{ note.label }}
                    </n-button>
                </n-button-group>
                <n-checkbox v-model:checked="isDotted" size="small">附点</n-checkbox>
            </div>
            <div class="toolbar-group">
                <n-button-group size="small">
                    <n-button v-for="rest in restTypes" :key="rest.value"
                        :type="selectedRestType === rest.value ? 'primary' : 'default'"
                        @click="selectRestType(rest.value)">
                        {{ rest.label }}
                    </n-button>
                </n-button-group>
                <n-button size="small" @click="addBar">+ 小节</n-button>
                <n-button size="small" type="error" @click="removeBar"
                    :disabled="(currentSection?.barCount ?? 1) <= 1">删除最后小节</n-button>
            </div>
            <div class="toolbar-group">
                <n-button size="small" type="primary" @click="convertToChordScore">转成指法</n-button>
                <n-button size="small" @click="clearCurrentSection">清空</n-button>
                <n-button size="small" @click="exportJson">导出 JSON</n-button>
                <n-button size="small" @click="triggerImport">导入 JSON</n-button>
                <input type="file" ref="fileInput" style="display: none" accept=".json" @change="handleImportFile" />
            </div>
        </div>

        <div class="staff-canvas-container">
            <div ref="staffContainer" class="staff-container"></div>
        </div>

        <div class="staff-info">
            <span>当前模式: {{ currentModeLabel }}</span>
            <span v-if="hoverInfo">{{ hoverInfo }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { NButton, NButtonGroup, NCheckbox, NSelect } from 'naive-ui';
import * as Vex from 'vexflow';
import { useScoreStore } from '@/stores/scoreStore';
import type { NoteChordEvent, StaffSection, StaffNote } from '@/types/score';

const props = defineProps<{
    bpm: number;
}>();

const emit = defineEmits<{
    convertToChordScore: [chords: NoteChordEvent[], bpm: number, name: string, sections: StaffSection[]];
}>();

// ========== 声明所有 ref ==========
const staffContainer = ref<HTMLDivElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const sections = ref<StaffSection[]>([]);
const currentSectionIndex = ref(0);
const currentTimeSignature = ref('4/4');

const noteTypes = [
    { label: '全音符', value: 4 },
    { label: '二分音符', value: 2 },
    { label: '四分音符', value: 1 },
    { label: '八分音符', value: 0.5 },
    { label: '十六分音符', value: 0.25 },
];
const restTypes = [
    { label: '全休止', value: 4 },
    { label: '二分休止', value: 2 },
    { label: '四分休止', value: 1 },
    { label: '八分休止', value: 0.5 },
];
const timeSignatureOptions = [
    { label: '4/4', value: '4/4' },
    { label: '3/4', value: '3/4' },
    { label: '2/4', value: '2/4' },
    { label: '6/8', value: '6/8' },
];

const selectedNoteType = ref<number | null>(1);
const selectedRestType = ref<number | null>(null);
const isDotted = ref(false);
const hoverInfo = ref('');

const store = useScoreStore();

let renderer: Vex.Renderer | null = null;
let context: Vex.RenderContext | null = null;

const staveX = 40;
const minSectionWidth = 820;
const barWidth = 200;
const sectionHeight = 220;
const sectionSpacing = 28;

interface SectionLayout {
    sectionIndex: number;
    top: number;
    bottom: number;
    staveWidth: number;
    totalBeats: number;
    sectionWidth: number;
    staveTopTreble: number;
    staveTopBass: number;
}

function createDefaultSection(name: string, timeSignature: string): StaffSection {
    return {
        id: Date.now() + Math.round(Math.random() * 999),
        name,
        trebleNotes: [],
        bassNotes: [],
        timeSignature,
        barCount: 4,
    };
}

const sectionLayouts = ref<SectionLayout[]>([]);
const notePositionMap = ref<Map<string, { x: number; startTime: number; pitch: number }>>(new Map());

const currentSection = computed(() => sections.value[currentSectionIndex.value] ?? sections.value[0]);
const sectionOptions = computed(() =>
    sections.value.map((section: StaffSection, index: number) => ({ label: section.name, value: index })),
);

function loadSectionsFromStorage() {
    const raw = localStorage.getItem('piano-trainer-staff-sections');
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as StaffSection[];
            if (Array.isArray(parsed) && parsed.length > 0) {
                sections.value = parsed;
                currentSectionIndex.value = 0;
                currentTimeSignature.value = sections.value[0].timeSignature;
                return;
            }
        } catch { }
    }
    if (store.currentStaffScore && store.currentStaffScore.length > 0) {
        sections.value = JSON.parse(JSON.stringify(store.currentStaffScore));
        currentSectionIndex.value = 0;
        currentTimeSignature.value = sections.value[0]?.timeSignature ?? '4/4';
        return;
    }
    sections.value = [createDefaultSection('段落 1', currentTimeSignature.value)];
    currentSectionIndex.value = 0;
}

function saveSectionsToStorage() {
    localStorage.setItem('piano-trainer-staff-sections', JSON.stringify(sections.value));
    if (store.currentStaffScore) {
        store.currentStaffScore = JSON.parse(JSON.stringify(sections.value));
    }
}

watch(currentSectionIndex, () => {
    const section = currentSection.value;
    if (section) {
        currentTimeSignature.value = section.timeSignature;
    }
    renderStaff();
});

watch(currentTimeSignature, () => {
    if (currentSection.value) {
        currentSection.value.timeSignature = currentTimeSignature.value;
        renderStaff();
    }
});

watch(sections, () => {
    saveSectionsToStorage();
    renderStaff();
}, { deep: true });

function selectNoteType(value: number) {
    selectedNoteType.value = value;
    selectedRestType.value = null;
}
function selectRestType(value: number) {
    selectedRestType.value = value;
    selectedNoteType.value = null;
}

function initVexFlow() {
    if (!staffContainer.value) return;
    staffContainer.value.innerHTML = '';
    renderer = new Vex.Renderer(staffContainer.value, Vex.Renderer.Backends.SVG);
    renderer.resize(minSectionWidth + staveX * 2, sectionHeight + sectionSpacing * 2);
    context = renderer.getContext();
    const svg = staffContainer.value.querySelector<SVGSVGElement>('svg');
    if (svg) {
        svg.style.pointerEvents = 'auto';
        svg.addEventListener('click', handleCanvasClick);
        svg.addEventListener('mousemove', handleMouseMove);
        svg.addEventListener('contextmenu', handleRightClick);
        svg.addEventListener('dblclick', handleDoubleClick);
    }
    renderStaff();
}

function renderStaff() {
    if (!renderer || !context || !staffContainer.value) return;
    const svg = staffContainer.value.querySelector<SVGSVGElement>('svg');
    if (svg) svg.innerHTML = '';
    if (context.clear) context.clear();

    const widths = sections.value.map((s) => Math.max(minSectionWidth, s.barCount * barWidth));
    const canvasWidth = Math.max(...widths, minSectionWidth) + staveX;
    const canvasHeight = sections.value.length * sectionHeight + sectionSpacing * (sections.value.length + 1);
    renderer.resize(canvasWidth, canvasHeight);

    const layouts: SectionLayout[] = [];
    let yOffset = sectionSpacing;
    notePositionMap.value.clear();

    sections.value.forEach((section, idx) => {
        const sectionWidth = widths[idx];
        const staveWidth = sectionWidth - staveX * 2;
        const sectionTop = yOffset;
        const totalBeats = section.barCount * getBeatsPerBar(section.timeSignature);

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.textContent = section.name;
        title.setAttribute('x', `${staveX}`);
        title.setAttribute('y', `${sectionTop + 18}`);
        title.setAttribute('fill', '#334155');
        title.setAttribute('font-size', '14');
        title.setAttribute('font-family', 'sans-serif');
        svg?.appendChild(title);

        const trebleStave = new Vex.Stave(staveX, sectionTop + 28, staveWidth)
            .addClef('treble')
            .addTimeSignature(section.timeSignature);
        trebleStave.setContext(context!).draw();

        const bassStave = new Vex.Stave(staveX, sectionTop + 140, staveWidth)
            .addClef('bass');
        bassStave.setContext(context!).draw();

        const connector = new Vex.StaveConnector(trebleStave, bassStave)
            .setType(Vex.StaveConnector.type.BRACE)
            .setContext(context!);
        connector.draw();

        drawBarLines(section.barCount, sectionTop, staveWidth);

        const trebleRect = trebleStave.getBoundingBox();
        const bassRect = bassStave.getBoundingBox();
        const staveTopTreble = trebleRect ? trebleRect.getY() : sectionTop + 28;
        const staveTopBass = bassRect ? bassRect.getY() : sectionTop + 140;

        const treblePositions = renderNotesAndRecord(trebleStave, section.trebleNotes, 'treble', totalBeats);
        const bassPositions = renderNotesAndRecord(bassStave, section.bassNotes, 'bass', totalBeats);
        [...treblePositions, ...bassPositions].forEach(p => {
            const key = `${idx}-${p.startTime}-${p.pitch}`;
            notePositionMap.value.set(key, p);
        });

        layouts.push({
            sectionIndex: idx,
            top: sectionTop,
            bottom: sectionTop + sectionHeight,
            staveWidth,
            totalBeats,
            sectionWidth,
            staveTopTreble,
            staveTopBass,
        });
        yOffset += sectionHeight + sectionSpacing;
    });
    sectionLayouts.value = layouts;
}

function drawBarLines(barCount: number, sectionTop: number, staveWidth: number) {
    const svg = staffContainer.value?.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const top = sectionTop + 28;
    const bottom = sectionTop + 220;
    for (let i = 1; i < barCount; i++) {
        const x = staveX + Math.round((staveWidth / barCount) * i);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${x}`);
        line.setAttribute('y1', `${top}`);
        line.setAttribute('x2', `${x}`);
        line.setAttribute('y2', `${bottom}`);
        line.setAttribute('stroke', '#6b7280');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }
}

function renderNotesAndRecord(stave: Vex.Stave, notes: StaffNote[], clef: 'treble' | 'bass', totalBeats: number) {
    const positions: { x: number; startTime: number; pitch: number }[] = [];
    if (!context || notes.length === 0) return positions;
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    // 检查音符是否在总拍数范围内
    const maxStart = Math.max(...sorted.map(n => n.startTime + n.duration));
    if (maxStart > totalBeats + 0.001) {
        console.warn(`小节总拍数不足，请增加小节数或缩短音符时值 (maxStart=${maxStart}, totalBeats=${totalBeats})`);
        return positions;
    }
    const vexNotes = sorted.map(note => {
        const duration = getVexDuration(note.duration, note.dot, note.isRest);
        return new Vex.StaveNote({
            clef,
            keys: note.isRest ? ['b/4'] : [midiToVexKey(note.pitch)],
            duration,
        });
    });
    const voice = new Vex.Voice({ numBeats: totalBeats, beatValue: 4 });
    voice.setStrict(false); // 允许不完全填满小节
    voice.addTickables(vexNotes);
    try {
        new Vex.Formatter().joinVoices([voice]).formatToStave([voice], stave);
        voice.draw(context, stave);
        vexNotes.forEach((staveNote, i) => {
            const bb = staveNote.getBoundingBox();
            if (bb) {
                positions.push({
                    x: bb.getX(),
                    startTime: sorted[i].startTime,
                    pitch: sorted[i].pitch,
                });
            }
        });
    } catch (e) {
        // 格式化失败静默处理，避免阻塞渲染
        console.warn('voice format error', e);
    }
    return positions;
}

function findStartTimeByX(x: number, sectionIdx: number): number | null {
    let closest: { startTime: number; dist: number } | null = null;
    for (const [key, pos] of notePositionMap.value.entries()) {
        if (key.startsWith(`${sectionIdx}-`)) {
            const dist = Math.abs(pos.x - x);
            if (closest === null || dist < closest.dist) {
                closest = { startTime: pos.startTime, dist };
            }
        }
    }
    return closest ? closest.startTime : null;
}

function findPitchByY(y: number, layout: SectionLayout, isTreble: boolean): number {
    const staveTop = isTreble ? layout.staveTopTreble : layout.staveTopBass;
    const semitonePx = 6;
    const referenceMidi = isTreble ? 72 : 48;
    const delta = Math.round((staveTop - y) / semitonePx);
    let pitch = referenceMidi + delta;
    pitch = Math.min(isTreble ? 88 : 67, Math.max(isTreble ? 55 : 35, pitch));
    return pitch;
}

function getSvgPoint(event: MouseEvent) {
    const svg = staffContainer.value?.querySelector<SVGSVGElement>('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function findSectionLayoutAtY(y: number) {
    return sectionLayouts.value.find(l => y >= l.top && y <= l.bottom) ?? null;
}

function handleCanvasClick(event: MouseEvent) {
    event.preventDefault();
    const point = getSvgPoint(event);
    if (!point) return;
    const layout = findSectionLayoutAtY(point.y);
    if (!layout) return;
    const section = sections.value[layout.sectionIndex];
    const isTreble = point.y < layout.top + 100;
    let startTime = findStartTimeByX(point.x, layout.sectionIndex);
    if (startTime === null) {
        // 后备线性映射
        const offsetX = Math.max(0, Math.min(point.x - staveX, layout.staveWidth));
        const rawBeat = (offsetX / layout.staveWidth) * layout.totalBeats;
        startTime = Math.round(rawBeat * 4) / 4;
        startTime = Math.max(0, Math.min(startTime, layout.totalBeats - 0.25));
    }
    const pitch = selectedRestType.value !== null ? 60 : findPitchByY(point.y, layout, isTreble);
    const duration = selectedRestType.value ?? selectedNoteType.value ?? 1;
    const isRest = selectedRestType.value !== null;
    if (selectedNoteType.value === null && selectedRestType.value === null) return;
    const note: StaffNote = {
        id: Date.now(),
        pitch,
        duration,
        dot: isDotted.value,
        isRest,
        startTime,
    };
    const target = isTreble ? section.trebleNotes : section.bassNotes;
    target.push(note);
    renderStaff();
}

function handleMouseMove(event: MouseEvent) {
    const point = getSvgPoint(event);
    if (!point) return;
    const layout = findSectionLayoutAtY(point.y);
    if (!layout) {
        hoverInfo.value = '';
        return;
    }
    const isTreble = point.y < layout.top + 100;
    const pitch = findPitchByY(point.y, layout, isTreble);
    const startTime = findStartTimeByX(point.x, layout.sectionIndex);
    hoverInfo.value = `段落 ${layout.sectionIndex + 1} · ${isTreble ? '高音谱表' : '低音谱表'} · ${midiToNoteName(pitch)} · 拍点 ${startTime?.toFixed(2) ?? '?'}`;
}

function handleRightClick(event: MouseEvent) {
    event.preventDefault();
    const point = getSvgPoint(event);
    if (!point) return;
    const layout = findSectionLayoutAtY(point.y);
    if (!layout) return;
    const section = sections.value[layout.sectionIndex];
    const isTreble = point.y < layout.top + 100;
    const startTime = findStartTimeByX(point.x, layout.sectionIndex);
    if (startTime === null) return;
    const pool = isTreble ? section.trebleNotes : section.bassNotes;
    const candidates = pool.filter(n => Math.abs(n.startTime - startTime) <= 0.125);
    if (candidates.length === 0) return;
    const pitch = findPitchByY(point.y, layout, isTreble);
    let closest = candidates[0];
    let minDiff = Math.abs(closest.pitch - pitch);
    for (const c of candidates) {
        const diff = Math.abs(c.pitch - pitch);
        if (diff < minDiff) { minDiff = diff; closest = c; }
    }
    const idx = pool.findIndex(n => n.id === closest.id);
    if (idx !== -1) pool.splice(idx, 1);
    renderStaff();
}

function handleDoubleClick(event: MouseEvent) {
    event.preventDefault();
    const point = getSvgPoint(event);
    if (!point) return;
    const layout = findSectionLayoutAtY(point.y);
    if (!layout) return;
    const section = sections.value[layout.sectionIndex];
    const isTreble = point.y < layout.top + 100;
    const startTime = findStartTimeByX(point.x, layout.sectionIndex);
    if (startTime === null) return;
    const pool = isTreble ? section.trebleNotes : section.bassNotes;
    const candidates = pool.filter(n => Math.abs(n.startTime - startTime) <= 0.125);
    if (candidates.length === 0) return;
    const pitch = findPitchByY(point.y, layout, isTreble);
    let closest = candidates[0];
    let minDiff = Math.abs(closest.pitch - pitch);
    for (const c of candidates) {
        const diff = Math.abs(c.pitch - pitch);
        if (diff < minDiff) { minDiff = diff; closest = c; }
    }
    const newDuration = window.prompt('输入时值: 4 / 2 / 1 / 0.5 / 0.25', closest.duration.toString());
    const newPitch = closest.isRest ? null : window.prompt('输入音名，例如 C4', midiToNoteName(closest.pitch));
    const newDot = window.confirm('是否附点？');
    if (newDuration) {
        const parsed = parseFloat(newDuration);
        if ([4, 2, 1, 0.5, 0.25].includes(parsed)) closest.duration = parsed;
    }
    closest.dot = newDot;
    if (newPitch && !closest.isRest) {
        const midi = noteNameToMidi(newPitch);
        if (midi !== null) closest.pitch = midi;
    }
    renderStaff();
}

function addSection() {
    sections.value.push(createDefaultSection(`段落 ${sections.value.length + 1}`, currentTimeSignature.value));
    currentSectionIndex.value = sections.value.length - 1;
    renderStaff();
}
function removeCurrentSection() {
    if (sections.value.length <= 1) return;
    sections.value.splice(currentSectionIndex.value, 1);
    currentSectionIndex.value = Math.max(0, currentSectionIndex.value - 1);
    renderStaff();
}
function addBar() {
    if (currentSection.value) {
        currentSection.value.barCount += 1;
        renderStaff();
    }
}
function removeBar() {
    const section = currentSection.value;
    if (!section || section.barCount <= 1) return;
    const beatsPerBar = getBeatsPerBar(section.timeSignature);
    const removedStart = (section.barCount - 1) * beatsPerBar;
    section.trebleNotes = section.trebleNotes.filter((n: StaffNote) => n.startTime < removedStart);
    section.bassNotes = section.bassNotes.filter((n: StaffNote) => n.startTime < removedStart);
    section.barCount -= 1;
    renderStaff();
}
function clearCurrentSection() {
    currentSection.value.trebleNotes = [];
    currentSection.value.bassNotes = [];
    renderStaff();
}
function updateTimeSignature() {
    if (currentSection.value) {
        currentSection.value.timeSignature = currentTimeSignature.value;
        renderStaff();
    }
}

function exportJson() {
    const blob = new Blob([JSON.stringify(sections.value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff-score.json';
    a.click();
    URL.revokeObjectURL(url);
}
function triggerImport() { fileInput.value?.click(); }
function handleImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result as string);
            if (isValidStaffSection(parsed)) {
                sections.value = parsed;
                currentSectionIndex.value = 0;
                currentTimeSignature.value = sections.value[0]?.timeSignature ?? '4/4';
                renderStaff();
            } else alert('JSON 格式不正确');
        } catch { alert('无效 JSON'); }
    };
    reader.readAsText(file);
    input.value = '';
}

function convertToChordScore() {
    const section = currentSection.value;
    if (!section) return;
    const allNotes = [
        ...section.trebleNotes.map(n => ({ ...n, hand: 'right' as const })),
        ...section.bassNotes.map(n => ({ ...n, hand: 'left' as const })),
    ].sort((a, b) => a.startTime - b.startTime);
    const chords: NoteChordEvent[] = [];
    let i = 0;
    while (i < allNotes.length) {
        const time = allNotes[i].startTime;
        const group = [];
        while (i < allNotes.length && Math.abs(allNotes[i].startTime - time) <= 0.001) {
            group.push(allNotes[i]);
            i++;
        }
        const fingers = assignFingers(group);
        const beatLength = Math.max(...group.map(n => n.duration));
        chords.push({ beatLength, fingers });
    }
    emit('convertToChordScore', chords, props.bpm, section.name, sections.value);
}
function assignFingers(notes: (StaffNote & { hand: 'right' | 'left' })[]) {
    const right = notes.filter(n => n.hand === 'right' && !n.isRest).sort((a, b) => a.pitch - b.pitch);
    const left = notes.filter(n => n.hand === 'left' && !n.isRest).sort((a, b) => a.pitch - b.pitch);
    const fingers: number[] = [];
    right.forEach((_, idx) => fingers.push(1 + (idx % 5)));
    left.forEach((_, idx) => fingers.push(6 + (idx % 5)));
    return fingers;
}

function getBeatsPerBar(signature: string) {
    const parts = signature.split('/').map(p => parseInt(p, 10));
    return isNaN(parts[0]) ? 4 : parts[0];
}
function isValidStaffSection(value: any): value is StaffSection[] {
    return Array.isArray(value) && value.every(s =>
        typeof s.id === 'number' &&
        typeof s.name === 'string' &&
        typeof s.timeSignature === 'string' &&
        typeof s.barCount === 'number' &&
        Array.isArray(s.trebleNotes) &&
        Array.isArray(s.bassNotes)
    );
}
function getVexDuration(duration: number, dot: boolean, isRest: boolean) {
    let val = 'q';
    if (duration === 4) val = 'w';
    else if (duration === 2) val = 'h';
    else if (duration === 1) val = 'q';
    else if (duration === 0.5) val = '8';
    else if (duration === 0.25) val = '16';
    if (dot) val += 'd';
    if (isRest) val += 'r';
    return val;
}
function midiToVexKey(midi: number) {
    const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
    const oct = Math.floor(midi / 12) - 1;
    const idx = midi % 12;
    return `${names[idx]}/${oct}`;
}
function midiToNoteName(midi: number) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const oct = Math.floor(midi / 12) - 1;
    return `${names[midi % 12]}${oct}`;
}
function noteNameToMidi(name: string) {
    const m = name.trim().toUpperCase().match(/^([A-G])(#?)(-?\d+)$/);
    if (!m) return null;
    const [, note, acc, octStr] = m;
    const oct = parseInt(octStr, 10);
    const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitone = map[note];
    if (acc === '#') semitone++;
    return (oct + 1) * 12 + semitone;
}

const currentModeLabel = computed(() => {
    if (selectedNoteType.value) return noteTypes.find(n => n.value === selectedNoteType.value)?.label || '音符';
    if (selectedRestType.value) return restTypes.find(r => r.value === selectedRestType.value)?.label || '休止符';
    return '无';
});

onMounted(() => {
    loadSectionsFromStorage();
    nextTick(() => initVexFlow());
});
</script>

<style scoped>
.staff-input {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.staff-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    align-items: center;
    padding: 14px;
    background: #fff;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.staff-canvas-container {
    background: #fffaf0;
    border-radius: 14px;
    padding: 18px;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
    overflow-x: auto;
}

.staff-container {
    min-height: 420px;
    width: 100%;
}

.staff-info {
    display: flex;
    justify-content: space-between;
    color: #475569;
    font-size: 14px;
}
</style>