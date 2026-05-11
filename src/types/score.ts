// 音符
export interface Note {
    beatLength: number; // 节拍长度（1=四分音符）
    finger: number;     // 1-5左手，6-10右手，0休止
}

// 和弦事件（支持多手指同时按）
export interface NoteChordEvent {
    beatLength: number; // 该和弦占据的节拍长度（四分音符的倍数）
    fingers: number[];  // 同时按下的手指编号数组（1-10），长度 >=1；空数组表示休止
}

// 五线谱音符（用于StaffInput内部）
export interface StaffNote {
    id: number;
    pitch: number;      // MIDI编号
    duration: number;   // 四分音符倍数 (1, 0.5, 2, etc.)
    dot: boolean;       // 是否附点
    isRest: boolean;    // 是否休止符
    startTime: number;  // 开始时间（四分音符单位）
}

// 五线谱段落
export interface StaffSection {
    id: number;
    name: string;
    trebleNotes: StaffNote[]; // 高音谱表音符
    bassNotes: StaffNote[];   // 低音谱表音符
    timeSignature: string;    // 拍号，如 '4/4'
    barCount: number;         // 当前段落小节数
}

// 小节
export interface Bar {
    id: number;
    notes: Note[];
}

// 段落
export interface Section {
    id: number;
    name: string;
    bars: Bar[];
}

// 曲谱
export interface Score {
    name: string;
    bpm: number;
    sections: Section[];
}