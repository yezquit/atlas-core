import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createMemoryOperationalHistory } from "./operationalHistory.js";

const HISTORY_DIRECTORY = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".atlas-data",
  "v1"
);
const HISTORY_FILE = path.join(HISTORY_DIRECTORY, "operational-history.ndjson");

export function createFileOperationalHistory() {
  const directory = HISTORY_DIRECTORY;
  const file = HISTORY_FILE;
  let writeChain = Promise.resolve();
  async function readEvents() {
    try {
      const text = await readFile(file, "utf8");
      return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }
  async function repository() {
    const memory = createMemoryOperationalHistory(await readEvents());
    async function persist(event) {
      await mkdir(directory, { recursive: true });
      writeChain = writeChain.then(() => appendFile(file, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }));
      await writeChain;
    }
    return {
      async appendAnalysis(version) {
        await memory.appendAnalysis(version);
        await persist(memory.events.at(-1));
        return version;
      },
      async appendDeletion(id, confirmation) {
        await memory.appendDeletion(id, confirmation);
        await persist(memory.events.at(-1));
        return true;
      },
      async appendResult(result) {
        await memory.appendResult(result);
        await persist(memory.events.at(-1));
        return result;
      },
      list: (filters) => memory.list(filters),
      listResults: () => memory.listResults(),
      calibration: () => memory.calibration(),
      latestForFixture: (fixtureId) => memory.latestForFixture(fixtureId),
      exportJson: (filters) => memory.exportJson(filters),
      directory,
      file,
    };
  }
  return { repository, directory, file };
}
