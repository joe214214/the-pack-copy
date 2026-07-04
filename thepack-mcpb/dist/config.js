let config = null;
export function setConfig(newConfig) {
    config = newConfig;
}
export function getConfig() {
    if (!config) {
        throw new Error("Configuration not initialized");
    }
    return config;
}
