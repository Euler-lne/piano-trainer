import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Score, Section, Bar, Note, NoteChordEvent, StaffSection } from '@/types/score';
import { beatToMs } from '@/utils/beatConverter';

export const useScoreStore = defineStore('score', () => {
    const currentScore = ref<Score>({
        name: '未命名曲谱',
        bpm: 120,
        sections: [],
    });

    // 新增：和弦曲谱（用于五线谱模式）
    const currentChordScore = ref<NoteChordEvent[]>([]);

    // 新增：五线谱数据
    const currentStaffScore = ref<StaffSection[]>([]);

    let nextSectionId = 1;
    let nextBarId = 1;

    function loadExample() {
        // 《两只老虎》旋律（右手）：
        // 1 2 3 1 | 1 2 3 1 | 3 4 5 | 3 4 5 | 5 6 5 4 3 1 | 5 6 5 4 3 1 | 1 5 1 - | 1 5 1 -
        // 我们只使用手指1~5（右手拇指到小指），分配原则：相邻音尽量用相邻手指
        const bars: Bar[] = [];

        // 第1小节
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 1, finger: 1 }, // do
                { beatLength: 1, finger: 2 }, // re
                { beatLength: 1, finger: 3 }, // mi
                { beatLength: 1, finger: 1 }  // do
            ]
        });
        // 第2小节（相同）
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 1, finger: 1 },
                { beatLength: 1, finger: 2 },
                { beatLength: 1, finger: 3 },
                { beatLength: 1, finger: 1 }
            ]
        });
        // 第3小节: 3 4 5 （三个四分音符）后加休止
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 1, finger: 3 },
                { beatLength: 1, finger: 4 },
                { beatLength: 1, finger: 5 },
                { beatLength: 1, finger: 0 }   // 休止
            ]
        });
        // 第4小节: 重复 3 4 5 + 休止
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 1, finger: 3 },
                { beatLength: 1, finger: 4 },
                { beatLength: 1, finger: 5 },
                { beatLength: 1, finger: 0 }
            ]
        });
        // 第5小节: 5 6 5 4 3 1 (真奇怪) 全部用右手手指，注意“6”音对应手指还是用小指或无名指，但为了流畅，我们用5,4,5,4,3,1
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 0.5, finger: 5 }, // sol
                { beatLength: 0.5, finger: 4 }, // la （用无名指）
                { beatLength: 0.5, finger: 5 }, // sol
                { beatLength: 0.5, finger: 4 }, // fa
                { beatLength: 0.5, finger: 3 }, // mi
                { beatLength: 0.5, finger: 1 }, // do
                { beatLength: 1, finger: 0 }    // 休止补满4拍
            ]
        });
        // 第6小节 相同
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 0.5, finger: 5 },
                { beatLength: 0.5, finger: 4 },
                { beatLength: 0.5, finger: 5 },
                { beatLength: 0.5, finger: 4 },
                { beatLength: 0.5, finger: 3 },
                { beatLength: 0.5, finger: 1 },
                { beatLength: 1, finger: 0 }
            ]
        });
        // 第7小节: 1 5 1 (二分)
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 1, finger: 1 },
                { beatLength: 1, finger: 5 },
                { beatLength: 2, finger: 1 }
            ]
        });
        // 第8小节: 重复
        bars.push({
            id: nextBarId++, notes: [
                { beatLength: 1, finger: 1 },
                { beatLength: 1, finger: 5 },
                { beatLength: 2, finger: 1 }
            ]
        });

        const section: Section = { id: nextSectionId++, name: '主歌', bars };
        currentScore.value = {
            name: '两只老虎（合理指法）',
            bpm: 120,
            sections: [section],
        };
    }

    function addSection(name?: string) {
        currentScore.value.sections.push({
            id: nextSectionId++,
            name: name || `段落 ${currentScore.value.sections.length + 1}`,
            bars: [],
        });
    }

    function removeSection(index: number) {
        currentScore.value.sections.splice(index, 1);
    }

    function moveSection(index: number, direction: 'up' | 'down') {
        const sections = currentScore.value.sections;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= sections.length) return;
        [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];
    }

    function updateSectionName(index: number, name: string) {
        currentScore.value.sections[index].name = name;
    }

    function addBar(sectionIndex: number) {
        const section = currentScore.value.sections[sectionIndex];
        if (section) {
            section.bars.push({ id: nextBarId++, notes: [{ beatLength: 1, finger: 1 }] });
        }
    }

    function removeBar(sectionIndex: number, barIndex: number) {
        currentScore.value.sections[sectionIndex].bars.splice(barIndex, 1);
    }

    function moveBar(sectionIndex: number, barIndex: number, direction: 'up' | 'down') {
        const bars = currentScore.value.sections[sectionIndex].bars;
        const newIndex = direction === 'up' ? barIndex - 1 : barIndex + 1;
        if (newIndex < 0 || newIndex >= bars.length) return;
        [bars[barIndex], bars[newIndex]] = [bars[newIndex], bars[barIndex]];
    }

    function addNoteToBar(sectionIndex: number, barIndex: number, note?: Note) {
        const bar = currentScore.value.sections[sectionIndex].bars[barIndex];
        bar.notes.push(note || { beatLength: 1, finger: 1 });
    }

    function removeNoteFromBar(sectionIndex: number, barIndex: number, noteIndex: number) {
        const bar = currentScore.value.sections[sectionIndex].bars[barIndex];
        bar.notes.splice(noteIndex, 1);
        if (bar.notes.length === 0) {
            removeBar(sectionIndex, barIndex);
        }
    }

    function updateNote(sectionIndex: number, barIndex: number, noteIndex: number, updates: Partial<Note>) {
        const note = currentScore.value.sections[sectionIndex].bars[barIndex].notes[noteIndex];
        Object.assign(note, updates);
    }

    // 获取扁平化的音符数组（用于打包发送）
    function getFlattenNotes(): { timeOffset: number; finger: number }[] {
        const result: { timeOffset: number; finger: number }[] = [];
        const bpm = currentScore.value.bpm;
        let prevDurationMs = 0;  // 上一个音符的持续时间（毫秒）

        for (const section of currentScore.value.sections) {
            for (const bar of section.bars) {
                for (const note of bar.notes) {
                    const durationMs = beatToMs(note.beatLength, bpm);
                    // 第一个音符偏移为 0，后续每个音符偏移等于上一个音符的持续时间
                    result.push({
                        timeOffset: result.length === 0 ? 0 : prevDurationMs,
                        finger: note.finger,
                    });
                    prevDurationMs = durationMs; // 为下一个音符记录当前音符的持续时间
                }
            }
        }
        return result;
    }

    function exportToJson(): string {
        return JSON.stringify(currentScore.value, null, 2);
    }

    function importFromJson(jsonStr: string): boolean {
        try {
            const obj = JSON.parse(jsonStr);
            if (obj && typeof obj === 'object' && 'name' in obj && 'bpm' in obj && 'sections' in obj && Array.isArray(obj.sections)) {
                currentScore.value = obj;
                // 可选：重新计算自增 id
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    function clearAll() {
        currentScore.value = {
            name: '未命名曲谱',
            bpm: 120,
            sections: [],
        };
        currentChordScore.value = [];
        nextSectionId = 1;
        nextBarId = 1;
    }

    // 新增：设置和弦曲谱
    function setChordScore(chords: NoteChordEvent[]) {
        currentChordScore.value = chords;
    }

    // 新增：获取扁平化的和弦事件（用于模拟器）
    function getFlattenChordEvents(): { timeOffset: number; fingers: number[] }[] {
        const result: { timeOffset: number; fingers: number[] }[] = [];
        const bpm = currentScore.value.bpm;
        let accumTime = 0;
        for (const event of currentChordScore.value) {
            result.push({
                timeOffset: accumTime,
                fingers: event.fingers,
            });
            accumTime += beatToMs(event.beatLength, bpm);
        }
        return result;
    }

    return {
        currentScore,
        currentChordScore,
        currentStaffScore,
        loadExample,
        addSection,
        removeSection,
        moveSection,
        updateSectionName,
        addBar,
        removeBar,
        moveBar,
        addNoteToBar,
        removeNoteFromBar,
        updateNote,
        getFlattenNotes,
        exportToJson,
        importFromJson,
        clearAll,
        setChordScore,
        getFlattenChordEvents,
    };
});