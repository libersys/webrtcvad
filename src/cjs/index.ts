// index.cjs.ts (For CommonJS Build)
import bindings from "bindings";
import path from "path";

// ✅ Use __dirname in CommonJS
const rootDir = path.resolve(__dirname, "../../");

const vadBindings = bindings({
  bindings: "webrtcvad",
  module_root: rootDir,
});

// The rates the WebRTC VAD accepts (24000 is a Libersys addition). With any other rate
// every process() call fails inside the library, which reads as "no speech".
const SUPPORTED_SAMPLE_RATES: readonly number[] = [8000, 16000, 24000, 32000, 48000];

class VAD {
  private sampleRate: number;
  private instance: any;

  constructor(sampleRate: number = 16000, level: number = 3) {
    if (!SUPPORTED_SAMPLE_RATES.includes(sampleRate)) {
      throw new Error(
        `Unsupported sample rate ${sampleRate}. Supported: ${SUPPORTED_SAMPLE_RATES.join(", ")}.`
      );
    }
    this.sampleRate = sampleRate;
    this.instance = new vadBindings.VAD(sampleRate, level);
  }

  private valid(audio: Buffer): boolean {
    return (
      audio.length / 2 == this.sampleRate / 100 ||
      audio.length / 2 == (2 * this.sampleRate) / 100 ||
      audio.length / 2 == (3 * this.sampleRate) / 100
    );
  }

  process(audio: Buffer): boolean {
    if (!this.valid(audio)) {
      throw new Error(
        `Invalid audio length. For a sample rate of ${
          this.sampleRate
        }, audio length must be ${(2 * this.sampleRate) / 100}, ${
          (4 * this.sampleRate) / 100
        }, or ${(6 * this.sampleRate) / 100}.`
      );
    }
    return this.instance.process(audio, audio.length / 2);
  }
}

// ✅ Properly support both ESM and CommonJS
const vad = { VAD, SUPPORTED_SAMPLE_RATES };

// CommonJS compatibility
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
  module.exports = vad;
}

// Default export for ESM
export default vad;
export { VAD, SUPPORTED_SAMPLE_RATES };
