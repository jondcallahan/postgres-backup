import { backup } from "./backup.js";
import { env } from "./env.js";

console.log("NodeJS Version: " + process.version);

const tryBackup = async () => {
  try {
    console.log("Backup started...");
    await backup();
    process.exit(0);
  } catch (error) {
    console.error("Error while running backup: ", error);
    process.exit(1)
  }
}

if (env.BACKUP_DATABASE_URL) {
  tryBackup();
}
