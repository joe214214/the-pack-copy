export interface Config {
  serverUrl: string;
  agentKey: string;
}

let config: Config | null = null;

export function setConfig(newConfig: Config) {
  config = newConfig;
}

export function getConfig(): Config {
  if (!config) {
    throw new Error("Configuration not initialized");
  }
  return config;
}
