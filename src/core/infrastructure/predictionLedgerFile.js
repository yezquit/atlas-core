import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createMemoryPredictionLedger } from "./predictionLedger.js";

export function createFilePredictionLedger({ directory, file = path.join(/* turbopackIgnore: true */ directory, "prediction-ledger.ndjson") } = {}) {
  if (!directory) throw new TypeError("prediction_ledger_directory_required");
  let writeChain = Promise.resolve();

  async function readEvents() {
    try {
      const contents = await readFile(/* turbopackIgnore: true */ file, "utf8");
      return contents.split(/\r?\n/).filter(Boolean).map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`prediction_ledger_corrupt_line_${index + 1}`);
        }
      });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async function repository() {
    const memory = createMemoryPredictionLedger(await readEvents());
    async function persist(event) {
      await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
      writeChain = writeChain.then(() => appendFile(/* turbopackIgnore: true */ file, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }));
      await writeChain;
    }
    return {
      async appendPrediction(prediction) {
        const result = await memory.appendPrediction(prediction);
        if (!result.deduplicated) await persist(memory.events.at(-1));
        return result;
      },
      async appendResolution(prediction) {
        const result = await memory.appendResolution(prediction);
        if (!result.deduplicated) await persist(memory.events.at(-1));
        return result;
      },
      getById: (id) => memory.getById(id),
      list: (filters) => memory.list(filters),
      metrics: () => memory.metrics(),
      calibration: () => memory.calibration(),
      directory,
      file,
    };
  }

  return { repository, directory, file };
}
