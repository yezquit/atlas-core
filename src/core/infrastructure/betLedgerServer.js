import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createMemoryBetLedger } from "./betLedger.js";

const BET_DIRECTORY = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".atlas-data",
  "v1"
);

const BET_FILE = path.join(BET_DIRECTORY, "bet-ledger.ndjson");

export function createFileBetLedger() {
  const directory = BET_DIRECTORY;
  const file = BET_FILE;

  let writeChain = Promise.resolve();

  async function readEvents() {
    try {
      const text = await readFile(file, "utf8");

      return text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async function repository() {
    const memory = createMemoryBetLedger(await readEvents());

    async function persist(event) {
      await mkdir(directory, { recursive: true });

      writeChain = writeChain.then(() =>
        appendFile(
          file,
          `${JSON.stringify(event)}\n`,
          {
            encoding: "utf8",
            mode: 0o600,
          }
        )
      );

      await writeChain;
    }

    return {
      async appendBet(bet) {
        await memory.appendBet(bet);
        await persist(memory.events.at(-1));
        return bet;
      },

      async appendSettlement(settledBet) {
        await memory.appendSettlement(settledBet);
        await persist(memory.events.at(-1));
        return settledBet;
      },

      getById: (betId) => memory.getById(betId),

      list: (filters) => memory.list(filters),

      summary: (userId) => memory.summary(userId),

      exportJson: (userId) => memory.exportJson(userId),

      directory,
      file,
    };
  }

  return {
    repository,
    directory,
    file,
  };
}
