/**
 * 根据 BPM 将节拍长度转换为毫秒
 * @param beatLength 节拍长度（1 = 四分音符）
 * @param bpm 每分钟节拍数
 * @returns 毫秒数（四舍五入取整）
 */
export function beatToMs(beatLength: number, bpm: number): number {
    const quarterMs = 60000 / bpm;
    return Math.round(beatLength * quarterMs);
}