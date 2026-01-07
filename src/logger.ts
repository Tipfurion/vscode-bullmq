import { output } from "./output";

class Logger {
  constructor() {}

  public debug(message: string) {
    output.appendLine(`[debug] ${message}`);
  }

  public info(message: string) {
    output.appendLine(`[info] ${message}`);
  }

  public warn(message: string) {
    output.appendLine(`[warn] ${message}`);
  }

  public error(message: string) {
    output.appendLine(`[error] ${message}`);
  }
}

export const logger = new Logger();
