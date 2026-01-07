import * as vscode from "vscode";

export function showConfig() {
  const output = vscode.window.createOutputChannel("BullMQ Explorer");
  const config = vscode.workspace.getConfiguration("bullmq-explorer");
  const connections = config.get<unknown>("connections");

  output.appendLine("BullMQ Explorer configuration");
  output.appendLine(JSON.stringify({ connections }, null, 2));
  output.show(true);
}
