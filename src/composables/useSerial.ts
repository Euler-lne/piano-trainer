// src/composables/useSerial.ts
import { ref, shallowRef, onScopeDispose, type Ref } from 'vue';

interface UseSerialReturn {
    isConnected: Ref<boolean>;
    isOpening: Ref<boolean>;
    errorMessage: Ref<string | null>;
    availablePorts: Ref<SerialPort[]>;
    receivedData: Ref<string>;        // 改为字符串，方便显示
    requestPort: () => Promise<void>;
    openPort: (baudRate?: number) => Promise<void>;
    closePort: () => Promise<void>;
    sendData: (data: Uint8Array) => Promise<void>;
}

export function useSerial(): UseSerialReturn {
    const port = shallowRef<SerialPort | null>(null);
    const isConnected = ref(false);
    const isOpening = ref(false);
    const errorMessage = ref<string | null>(null);
    const availablePorts = ref<SerialPort[]>([]);
    const receivedData = ref<string>('');  // 用于存储接收到的文本

    // 保存 reader 和 writer 以便释放锁
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

    async function requestPort(): Promise<void> {
        if (!navigator.serial) {
            errorMessage.value = 'Web Serial API not supported.';
            return Promise.reject(new Error('Web Serial API not supported.'));
        }
        try {
            const p = await navigator.serial.requestPort();
            port.value = p;
            availablePorts.value.push(p);
            errorMessage.value = null;
        } catch (err: unknown) {
            errorMessage.value = err instanceof Error ? err.message : 'Unknown error';
            throw err;
        }
    }

    async function openPort(baudRate = 115200): Promise<void> {
        if (!port.value) {
            const err = new Error('No port selected.');
            errorMessage.value = err.message;
            return Promise.reject(err);
        }
        isOpening.value = true;
        try {
            await port.value.open({ baudRate });
            isConnected.value = true;
            isOpening.value = false;
            errorMessage.value = null;
            startReading();
        } catch (err: unknown) {
            errorMessage.value = err instanceof Error ? err.message : 'Unknown error';
            isOpening.value = false;
            throw err;
        }
    }

    async function closePort(): Promise<void> {
        if (!port.value) return;
        // 先释放 reader 和 writer 锁
        if (reader) {
            try {
                await reader.cancel();
                reader.releaseLock();
            } catch (e) { /* ignore */ }
            reader = null;
        }
        if (writer) {
            try {
                await writer.abort();
                writer.releaseLock();
            } catch (e) { /* ignore */ }
            writer = null;
        }
        if (isConnected.value) {
            try {
                await port.value.close();
            } catch (err) {
                errorMessage.value = err instanceof Error ? err.message : 'Unknown error';
                throw err;
            }
        }
        isConnected.value = false;
        port.value = null;
        errorMessage.value = null;
        receivedData.value = ''; // 清空接收缓冲区
    }

    async function sendData(data: Uint8Array): Promise<void> {
        if (!port.value || !isConnected.value || !port.value.writable) {
            const err = new Error('Port not connected or writable stream unavailable.');
            errorMessage.value = err.message;
            return Promise.reject(err);
        }
        writer = port.value.writable.getWriter();
        try {
            await writer.write(data);
        } finally {
            writer.releaseLock();
            writer = null;
        }
    }

    async function startReading(): Promise<void> {
        if (!port.value || !port.value.readable) return;
        reader = port.value.readable.getReader();
        const decoder = new TextDecoder(); // 用于将二进制转为字符串
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    // 将收到的字节数组转换为字符串，追加到 receivedData
                    const text = decoder.decode(value);
                    receivedData.value += text;
                }
            }
        } catch (error) {
            // 读取错误（如端口关闭时）忽略
        } finally {
            reader?.releaseLock();
            reader = null;
        }
    }

    onScopeDispose(() => {
        closePort();
    });

    return {
        isConnected,
        isOpening,
        errorMessage,
        availablePorts,
        receivedData,
        requestPort,
        openPort,
        closePort,
        sendData,
    };
}