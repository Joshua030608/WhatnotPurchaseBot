(function () {
  if (globalThis.chrome && chrome.storage && chrome.runtime) return;
  const data = {};
  const storageListeners = [];
  const runtimeListeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        async get(defaults) {
          if (typeof defaults === "string") return { [defaults]: data[defaults] };
          return { ...(defaults || {}), ...data };
        },
        async set(patch) {
          const changes = {};
          for (const [key, newValue] of Object.entries(patch)) {
            changes[key] = { oldValue: data[key], newValue };
            data[key] = newValue;
          }
          storageListeners.forEach((listener) => listener(changes, "local"));
        }
      },
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeListeners.push(listener);
        }
      },
      async sendMessage(message) {
        if (message.type === "WNPB_RECORD_EVENT" && message.event) {
          const eventLog = [{ id: String(Date.now()), ...message.event }, ...(data.eventLog || [])].slice(0, 75);
          await chrome.storage.local.set({ eventLog });
        }
        return { ok: true };
      },
      getURL(path) {
        return new URL(path, location.href).href;
      }
    }
  };
})();
