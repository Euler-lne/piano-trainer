// src/composables/useBinaryPack.ts
interface NoteEventPack {
    timeOffset: number; // 毫秒，0-65535
    finger: number;     // 0-5
}

interface ScorePack {
    version?: number;
    notes: NoteEventPack[];
}

export function packScoreToBinary(score: ScorePack): Uint8Array {
    if (!score.notes || !Array.isArray(score.notes)) {
        throw new Error('Score must have a notes array.');
    }

    const version = score.version ?? 0x01;
    const notes = score.notes.map(note => ({
        timeOffset: Math.min(note.timeOffset, 65535),
        finger: note.finger < 0 || note.finger > 5 ? 0 : note.finger,
    }));

    const noteCount = notes.length;
    const dataLength = 1 + 2 + notes.length * 3; // version + note_count + note_events
    const data = new Uint8Array(dataLength);
    let offset = 0;
    data[offset++] = version;
    data[offset++] = noteCount & 0xFF;
    data[offset++] = (noteCount >> 8) & 0xFF;
    for (const note of notes) {
        data[offset++] = note.timeOffset & 0xFF;
        data[offset++] = (note.timeOffset >> 8) & 0xFF;
        data[offset++] = note.finger;
    }

    // 完整包长度：帧头(2) + 命令(1) + len(2) + data + checksum(1)
    const totalLength = 2 + 1 + 2 + dataLength + 1;
    const packet = new Uint8Array(totalLength);
    offset = 0;
    // 修改帧头为 0xAA 0xBB 以匹配 Arduino 代码
    packet[offset++] = 0xAA;
    packet[offset++] = 0xBB;   // 与 Arduino 一致
    packet[offset++] = 0x01;   // CMD_UPLOAD
    packet[offset++] = dataLength & 0xFF;
    packet[offset++] = (dataLength >> 8) & 0xFF;
    packet.set(data, offset);
    offset += dataLength;
    let checksum = 0;
    for (let i = 0; i < offset; i++) checksum ^= packet[i];
    packet[offset] = checksum;
    return packet;
}

export function verifyBinary(packet: Uint8Array): boolean {
    if (packet.length < 7) return false;
    if (packet[0] !== 0xAA || packet[1] !== 0xBB) return false;
    if (packet[2] !== 0x01) return false;
    const dataLength = packet[3] | (packet[4] << 8);
    const expectedLen = 5 + dataLength + 1;
    if (packet.length !== expectedLen) return false;
    let checksum = 0;
    for (let i = 0; i < packet.length - 1; i++) checksum ^= packet[i];
    return checksum === packet[packet.length - 1];
}