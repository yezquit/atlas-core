import "server-only";

import path from "node:path";
import { createFilePredictionLedger } from "./predictionLedgerFile.js";

const directory = path.join(/* turbopackIgnore: true */ process.cwd(), ".atlas-data", "v1");

export const predictionLedgerStore = createFilePredictionLedger({ directory });
