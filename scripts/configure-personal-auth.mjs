import { randomBytes, scryptSync } from "node:crypto";
import process from "node:process";

function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Este asistente requiere una terminal interactiva.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function finish(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(character) {
      if (character === "\u0003") return finish(new Error("Configuración cancelada."));
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      if (character >= " ") {
        value += character;
        process.stdout.write("*");
      }
    }
    process.stdin.on("data", onData);
  });
}

const username = String(process.argv[2] || "").trim();
if (!username || username.length > 128) {
  console.error("Uso: npm run auth:configure -- <usuario>");
  process.exitCode = 1;
} else {
  try {
    const password = await hiddenPrompt("Contraseña personal: ");
    const confirmation = await hiddenPrompt("Confirma la contraseña: ");
    if (password.length < 12) throw new Error("Usa una contraseña de al menos 12 caracteres.");
    if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");

    const salt = randomBytes(16);
    const cost = 16384;
    const blockSize = 8;
    const parallelization = 1;
    const hash = scryptSync(password, salt, 64, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    });
    const encodedHash = [
      "scrypt",
      cost,
      blockSize,
      parallelization,
      salt.toString("base64url"),
      hash.toString("base64url"),
    ].join("$");

    console.log("\nCopia estas líneas en .env.local. No las publiques ni las añadas a Git:\n");
    console.log(`ATLAS_PERSONAL_USERNAME=${username}`);
    console.log(`ATLAS_PERSONAL_PASSWORD_HASH=${encodedHash}`);
    console.log(`ATLAS_SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
